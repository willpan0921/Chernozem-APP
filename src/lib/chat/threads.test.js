// WHAT THIS FILE DOES
// Tests the chat-list helpers in threads.js: the dates under each chat
// ("Today", "Yesterday", "Oct 11", "Oct 11, 2025"), keeping the newest chat
// on top, the chat titles and the look-up labels.
//
// WHO EDITS IT
// Whoever changes threads.js. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { threadDate, toolLabel, upsertThread, titleFrom } from "./threads.js";

// Dates are built in the local time zone, like the chat list shows them.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0);

test("threadDate: today, yesterday, this year, another year", () => {
  const now = at(2026, 10, 18, 9);
  assert.equal(threadDate(at(2026, 10, 18, 0).toISOString(), now), "Today");
  assert.equal(threadDate(at(2026, 10, 18, 23).toISOString(), now), "Today");
  assert.equal(threadDate(at(2026, 10, 17, 23).toISOString(), now), "Yesterday");
  assert.equal(threadDate(at(2026, 10, 11).toISOString(), now), "Oct 11");
  assert.equal(threadDate(at(2025, 10, 11).toISOString(), now), "Oct 11, 2025");
  // Yesterday across a month and a year boundary.
  assert.equal(threadDate(at(2026, 9, 30).toISOString(), at(2026, 10, 1)), "Yesterday");
  assert.equal(threadDate(at(2025, 12, 31).toISOString(), at(2026, 1, 1)), "Yesterday");
  // Not a date: nothing.
  assert.equal(threadDate("not a date", now), "");
  assert.equal(threadDate(undefined, now), "");
});

test("upsertThread: a new chat goes on top; an updated one moves up and keeps its fields", () => {
  const list = [
    { id: "a", title: "A", preview: "first" },
    { id: "b", title: "B", preview: "second" },
  ];
  assert.deepEqual(upsertThread(list, { id: "c", title: "C" }).map((t) => t.id), ["c", "a", "b"]);
  const moved = upsertThread(list, { id: "b", updatedAt: "2026-10-18T10:00:00Z" });
  assert.deepEqual(moved.map((t) => t.id), ["b", "a"]);
  assert.deepEqual(moved[0], { id: "b", title: "B", preview: "second", updatedAt: "2026-10-18T10:00:00Z" });
  // The original list is not changed.
  assert.deepEqual(list.map((t) => t.id), ["a", "b"]);
});

test("titleFrom: the first question, on one line, at most 60 characters", () => {
  assert.equal(titleFrom("  Where should we\n start?  "), "Where should we start?");
  assert.equal(titleFrom("x".repeat(60)), "x".repeat(60));
  const long = titleFrom("word ".repeat(30));
  assert.equal(long.length <= 60, true);
  assert.equal(long.endsWith("…"), true);
  assert.equal(titleFrom(null), "");
});

test("toolLabel: known look-ups and a fallback", () => {
  assert.equal(toolLabel("get_ranking"), "Looking up the ranking…");
  assert.equal(toolLabel("something_new"), "Checking the data…");
});
