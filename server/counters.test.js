// WHAT THIS FILE DOES
// Tests the limits' counts that outlive a restart (server/counters.js): a
// count over a sliding window (what left the window no longer counts),
// when a blocked key may go on (retryAfter), amounts such as tokens, keys
// kept apart, the counts written to quota-state.json in the base data
// folder and read back as after a restart (what left its window dropped),
// only a one-way hash of each key kept (never a visitor's address),
// nothing written when nothing changed, a broken file never stopping
// anything, and a save at most every 30 seconds (SAVE_EVERY_MS). Run with
// "npm test".
//
// WHO EDITS IT
// Whoever changes server/counters.js.

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-counters-"));
process.env.CHERNOZEM_DATA_DIR = path.join(scratch, "data");
const { counter, flushCounters, reloadCountersForTests, resetCountersForTests, SAVE_EVERY_MS, STATE_FILE, storedKey } = await import("./counters.js");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const HOUR = 60 * 60 * 1000;
let t;
let n = 0;
beforeEach(() => {
  // A fresh data folder and clock for every test.
  n += 1;
  process.env.CHERNOZEM_DATA_DIR = path.join(scratch, `data-${n}`);
  t = Date.UTC(2026, 9, 31, 12, 0);
  resetCountersForTests({ clock: () => t });
  reloadCountersForTests();
});
const stateFile = () => path.join(process.env.CHERNOZEM_DATA_DIR, STATE_FILE);

test("a count over a sliding window: what left the window no longer counts, and a blocked key learns when it may go on", () => {
  const questions = counter("test-questions", HOUR);
  assert.deepEqual(questions.check("visitor-a", 2, t), { blocked: false, retryAfterSec: 0, retryAfterMs: 0, total: 0 });
  questions.add("visitor-a", 1, t);
  questions.add("visitor-a", 1, t + 10 * 60_000);
  const blocked = questions.check("visitor-a", 2, t + 20 * 60_000);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.total, 2);
  assert.equal(blocked.retryAfterMs, 40 * 60_000, "when the first one leaves the hour");
  assert.equal(blocked.retryAfterSec, 40 * 60);
  assert.equal(questions.check("visitor-b", 2, t + 20 * 60_000).blocked, false, "another key has its own count");
  assert.equal(questions.check("visitor-a", 2, t + HOUR).blocked, false, "an hour after the first: one has left");
  assert.equal(questions.total("visitor-a", t + HOUR), 1);
  assert.equal(questions.total("visitor-a", t + HOUR + 10 * 60_000), 0);
});

test("amounts (tokens): blocked once the total reaches the limit, free again when enough has left the window", () => {
  const tokens = counter("test-tokens", HOUR);
  tokens.add("demo", 900, t);
  tokens.add("demo", 900, t + 60_000);
  tokens.add("demo", 300, t + 120_000);
  const over = tokens.check("demo", 2000, t + 180_000);
  assert.equal(over.blocked, true);
  assert.equal(over.total, 2100);
  assert.equal(over.retryAfterMs, HOUR - 180_000, "once the first 900 have left, 1,200 is under 2,000");
  tokens.add("demo", 0, t);
  tokens.add("demo", -5, t);
  tokens.add("demo", Number.NaN, t);
  assert.equal(tokens.total("demo", t + 180_000), 2100, "nothing, a negative or not a number counts for nothing");
  tokens.clear();
  assert.equal(tokens.total("demo", t + 180_000), 0);
});

test("the counts are written to quota-state.json and read back as after a restart; what left its window is dropped", async () => {
  const day = counter("test-day", 24 * HOUR);
  const hour = counter("test-hour", HOUR);
  day.add("all", 3, t - 2 * HOUR);
  hour.add("all", 1, t - 2 * HOUR);
  hour.add("all", 1, t - 1000);
  await flushCounters();
  const saved = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  assert.deepEqual(saved.counts["test-day"], { [storedKey("all")]: [[t - 2 * HOUR, 3]] });
  assert.deepEqual(saved.counts["test-hour"], { [storedKey("all")]: [[t - 1000, 1]] }, "the one older than its hour is not written");
  assert.equal(saved.savedAt, new Date(t).toISOString());

  // A restart: memory is gone, the file is read the first time a count is asked for.
  reloadCountersForTests();
  assert.equal(counter("test-day", 24 * HOUR).total("all", t), 3);
  assert.equal(counter("test-hour", HOUR).total("all", t), 1);
  // Later, the hour's has left its window too.
  assert.equal(counter("test-hour", HOUR).total("all", t + HOUR), 0);
});

test("nothing is written when nothing changed; a broken file never stops anything", async () => {
  await flushCounters();
  assert.equal(fs.existsSync(stateFile()), false, "no change, no file");
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
  fs.writeFileSync(stateFile(), "{ not json");
  reloadCountersForTests();
  const warn = console.warn;
  const said = [];
  console.warn = (line) => said.push(line);
  try {
    const count = counter("test-broken", HOUR);
    assert.equal(count.total("x", t), 0, "counted from nothing");
    count.add("x", 1, t);
    await flushCounters();
  } finally {
    console.warn = warn;
  }
  assert.match(said.join(" "), /quota-state\.json could not be read/);
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile(), "utf8")).counts["test-broken"], { [storedKey("x")]: [[t, 1]] }, "replaced by a good one");
});

test("a change is written at most every 30 seconds, not at once", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const count = counter("test-timer", HOUR);
  count.add("x", 1, t);
  count.add("x", 1, t);
  assert.equal(fs.existsSync(stateFile()), false, "not written at once");
  assert.equal(SAVE_EVERY_MS, 30_000);
  context.mock.timers.tick(SAVE_EVERY_MS);
  // The write itself is asynchronous: wait for it.
  for (let i = 0; i < 100 && !fs.existsSync(stateFile()); i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile(), "utf8")).counts["test-timer"], { [storedKey("x")]: [[t, 1], [t, 1]] });
});

test("a key is kept only as a one-way hash: the file never lists a visitor's address", async () => {
  const perVisitor = counter("test-visitors", HOUR);
  perVisitor.add("203.0.113.77", 1, t);
  perVisitor.add("2001:db8:abcd::/48", 1, t);
  await flushCounters();
  const text = fs.readFileSync(stateFile(), "utf8");
  assert.doesNotMatch(text, /203\.0\.113\.77|2001:db8/);
  assert.equal(storedKey("203.0.113.77").length, 22);
  assert.equal(storedKey("203.0.113.77"), storedKey("203.0.113.77"), "the same at every start");
  assert.notEqual(storedKey("203.0.113.77"), storedKey("203.0.113.78"));
  reloadCountersForTests();
  assert.equal(counter("test-visitors", HOUR).total("203.0.113.77", t), 1, "found again after a restart");
});
