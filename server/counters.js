// WHAT THIS FILE DOES
// The counts behind the limits that must outlive a restart or a new
// version (the numbers themselves are in server/quotas.js): the AI
// assistant's questions and the tokens Claude used (the public demo's, each
// account's and all accounts' together), each demo visitor's and each
// address's questions, an account's Field jobs, and the contact form's
// messages and e-mails. Without this file every deploy (render.yaml puts
// each push to main live) or crash would hand out a fresh day's allowance.
//
// HOW IT COUNTS
// Each count is, per key, a list of [when (ms), how much] over a sliding
// window: 24 hours for a day's limit, one hour for an hour's. "How much in
// the last 24 hours" is the sum of the list's entries younger than that.
// A key is never a person's name or e-mail: it is a demo visitor's random
// cookie number, a network address (an IPv4 address, or an IPv6 /48 or
// /64), an account's folder name (a hash, server/store.js userRoot), or a
// word such as "demo" for everyone together. And no key is kept as it is:
// only a one-way hash of it (storedKey), in memory and in the file, so the
// file (and the disk's daily snapshots) never lists visitors' addresses.
//
// WHERE IT IS KEPT
// In memory, and in quota-state.json in the base data folder
// (server/store.js baseDataDir; /var/data on Render): written at most
// every 30 seconds after a change (SAVE_EVERY_MS), and once more when the
// server stops (server/index.js calls flushCounters). It is read back the
// first time any count is asked for after a start. Anything older than
// its window is dropped before each write, and every count only grows
// while the limit for everyone together allows it (300 demo questions, 400
// accounts' questions, 150 contact messages in 24 hours...), so the file
// stays small. A file that cannot be read is said once in the log, and the
// counts start again from nothing (never a reason not to start).
//
//   counter(name, windowMs)   one count:
//     .total(key, now?)              how much in the window
//     .check(key, limit, now?)       { blocked, retryAfterSec, retryAfterMs,
//                                    total }: blocked once the total has
//                                    reached the limit; retryAfter is when
//                                    enough of it has left the window
//     .add(key, amount = 1, now?)    counts it
//     .clear()                       forgets every key of this count
//   flushCounters()           writes the file now (when anything changed)
//   storedKey(key)            the hash a key is kept under
//   resetCountersForTests({ clock })   forgets everything in memory and
//                             does not read the file again (until
//                             reloadCountersForTests); clock() (ms) instead
//                             of the computer's clock
//   reloadCountersForTests()  forgets memory; the next count reads the
//                             file, as after a restart
//
// WHO EDITS IT
// Nobody, normally. The limits are in server/quotas.js.

import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { baseDataDir } from "./store.js";

export const STATE_FILE = "quota-state.json";
export const SAVE_EVERY_MS = 30 * 1000;
// A count not asked for since the start keeps its entries this long (no
// window is longer than a day).
const KEEP_UNKNOWN_MS = 2 * 24 * 60 * 60 * 1000;
// The hash a key is kept under (see the top of this file): the same at
// every start, so the counts carry on; 22 characters.
export function storedKey(key) {
  return createHash("sha256").update(`chernozem-limit\0${String(key)}`).digest("base64url").slice(0, 22);
}

// Keys per count at most (the one counted longest ago is forgotten first).
const MAX_KEYS = 50_000;

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the counts.
//   states   base folder -> { dir, file, counts: Map(name -> Map(key ->
//            [[at, amount], ...])), dirty, timer, writing }
//   windows  name -> windowMs, for every count asked for since the start
const memory = (globalThis.__chernozemCounters ??= { states: new Map(), windows: new Map(), clock: null, skipLoad: false });

const now = () => (memory.clock ? memory.clock() : Date.now());

// ---------- The file ----------

function load(current) {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(current.file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`[chernozem] ${STATE_FILE} could not be read (${error.message}); the limits count again from nothing.`);
    return;
  }
  const at = now();
  for (const [name, keys] of Object.entries(saved?.counts || {})) {
    if (!keys || typeof keys !== "object") continue;
    const map = new Map();
    for (const [key, entries] of Object.entries(keys)) {
      if (!Array.isArray(entries)) continue;
      const clean = entries
        .filter((entry) => Array.isArray(entry) && Number.isFinite(entry[0]) && Number.isFinite(entry[1]) && entry[1] > 0 && at - entry[0] < KEEP_UNKNOWN_MS)
        .map(([when, amount]) => [when, amount])
        .sort((a, b) => a[0] - b[0]);
      if (clean.length) map.set(key, clean);
    }
    if (map.size) current.counts.set(name, map);
  }
}

// The counts for the base folder in use now (read from its file once).
function state() {
  const dir = baseDataDir();
  let current = memory.states.get(dir);
  if (!current) {
    current = { dir, file: path.join(dir, STATE_FILE), counts: new Map(), dirty: false, timer: null, writing: Promise.resolve() };
    if (!memory.skipLoad) load(current);
    memory.states.set(dir, current);
  }
  return current;
}

// Drops what has left its window, and keys left with nothing.
function prune(current, at) {
  for (const [name, map] of current.counts) {
    const windowMs = memory.windows.get(name) ?? KEEP_UNKNOWN_MS;
    for (const [key, entries] of map) {
      const kept = entries.filter(([when]) => at - when < windowMs);
      if (kept.length) map.set(key, kept);
      else map.delete(key);
    }
    if (!map.size) current.counts.delete(name);
  }
}

async function writeNow(current) {
  if (!current.dirty) return;
  current.dirty = false;
  prune(current, now());
  const counts = {};
  for (const [name, map] of current.counts) counts[name] = Object.fromEntries(map);
  const text = JSON.stringify({ savedAt: new Date(now()).toISOString(), counts });
  try {
    await fs.promises.mkdir(current.dir, { recursive: true });
    const tmp = `${current.file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
    await fs.promises.writeFile(tmp, text);
    await fs.promises.rename(tmp, current.file);
  } catch (error) {
    // Tried again at the next change.
    current.dirty = true;
    console.warn(`[chernozem] ${STATE_FILE} could not be written (${error.message}).`);
  }
}

// One write at a time, in order.
function save(current) {
  current.writing = current.writing.then(() => writeNow(current));
  return current.writing;
}

function changed(current) {
  current.dirty = true;
  if (current.timer) return;
  current.timer = setTimeout(() => {
    current.timer = null;
    save(current);
  }, SAVE_EVERY_MS);
  current.timer.unref?.();
}

// Writes every changed count now (server/index.js, when the server stops).
export async function flushCounters() {
  await Promise.all(
    [...memory.states.values()].map((current) => {
      clearTimeout(current.timer);
      current.timer = null;
      return save(current);
    }),
  );
}

// ---------- One count ----------

export function counter(name, windowMs) {
  memory.windows.set(name, windowMs);
  // The key's entries still inside the window (the older ones dropped).
  const entriesOf = (key, at) => {
    const map = state().counts.get(name);
    const entries = map?.get(key);
    if (!entries) return [];
    const kept = entries.filter(([when]) => at - when < windowMs);
    if (kept.length !== entries.length) {
      if (kept.length) map.set(key, kept);
      else map.delete(key);
    }
    return kept;
  };
  const sum = (entries) => entries.reduce((total, [, amount]) => total + amount, 0);
  return {
    total(key, at = now()) {
      return sum(entriesOf(storedKey(key), at));
    },
    check(key, limit, at = now()) {
      const entries = entriesOf(storedKey(key), at);
      const total = sum(entries);
      if (total < limit) return { blocked: false, retryAfterSec: 0, retryAfterMs: 0, total };
      // When enough of the oldest entries have left the window.
      let left = total;
      let until = at;
      for (const [when, amount] of entries) {
        left -= amount;
        until = when + windowMs;
        if (left < limit) break;
      }
      const retryAfterMs = Math.max(1, until - at);
      return { blocked: true, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)), retryAfterMs, total };
    },
    add(rawKey, amount = 1, at = now()) {
      const value = Math.round(Number(amount));
      if (!(value > 0)) return;
      const key = storedKey(rawKey);
      const current = state();
      let map = current.counts.get(name);
      if (!map) current.counts.set(name, (map = new Map()));
      const entries = (map.get(key) || []).filter(([when]) => at - when < windowMs);
      entries.push([at, value]);
      if (entries.length > 1 && entries[entries.length - 2][0] > at) entries.sort((a, b) => a[0] - b[0]);
      // The key counted now goes to the end: the first is the one counted
      // longest ago, forgotten first when there are too many.
      map.delete(key);
      map.set(key, entries);
      while (map.size > MAX_KEYS) map.delete(map.keys().next().value);
      changed(current);
    },
    clear() {
      const current = state();
      if (current.counts.delete(name)) changed(current);
    },
  };
}

// ---------- For the tests ----------

export function resetCountersForTests({ clock = null } = {}) {
  for (const current of memory.states.values()) clearTimeout(current.timer);
  memory.states = new Map();
  memory.clock = clock;
  memory.skipLoad = true;
}

export function reloadCountersForTests() {
  for (const current of memory.states.values()) clearTimeout(current.timer);
  memory.states = new Map();
  memory.skipLoad = false;
}
