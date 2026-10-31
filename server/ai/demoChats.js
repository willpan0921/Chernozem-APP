// WHAT THIS FILE DOES
// The public demo's AI assistant: where its chats are kept and how many
// questions it answers. A demo visitor (no account, server/auth.js) may
// ask the assistant about the Ukraine demo, but nothing they ask is ever
// written to disk, and nobody else ever sees their chats:
//
//   - Each visitor gets a random number in a cookie, chernozem_demo
//     (HttpOnly, SameSite=Lax, Secure behind https, 1 day; renewed at each
//     question), at their first question.
//   - Their chats live in this server's memory under that number, and only
//     that number reads them (GET /api/chats, GET and DELETE
//     /api/chats/:id answer from here in a demo session: server/ai/chat.js).
//     A restart of the server forgets them all, which is fine for a demo.
//   - At most QUOTAS.demoChatVisitors (2,000) visitors are kept at once
//     (the one seen longest ago goes first), QUOTAS.demoChatThreads (10)
//     chats each (the one written in longest ago goes first) and
//     QUOTAS.demoChatMessages (30) messages a chat (the oldest go first);
//     a chat is forgotten QUOTAS.demoChatKeepHours (24) hours after its
//     last message.
//
// THE THREE LIMITS (the numbers are in server/quotas.js)
// A question is answered only while all three allow it, counted over the
// last 24 hours: QUOTAS.demoChatPerVisitor (8) per visitor,
// QUOTAS.demoChatPerAddress (24) per internet address (server/auth.js
// clientAddress, which follows ATLAS_TRUST_PROXY, so a visitor who drops
// the cookie is still counted), and QUOTAS.demoChatPerDay (300) for the
// whole demo. Over any of them: 429 "quota" with DEMO_QUOTA_MESSAGE and a
// Retry-After header, before Claude is asked anything. The counts are
// kept in the same memory-bounded table as the wrong-key limit
// (server/auth.js createLoginLimiter).
//
//   visitorOf(req)                the visitor's number from the cookie, or null
//   ensureVisitor(req, res)       that number, or a new one; sets the cookie
//   spendDemoQuestion(req, id)    { ok: true } (one question counted), or
//                                 { ok: false, retryAfterSec } (nothing counted)
//   demoChatStore(store, id)      server/store.js with its four chat functions
//                                 (getChat, saveChat, listChats, deleteChat)
//                                 replaced by this visitor's memory; every
//                                 other read (the farm, the runs...) is the
//                                 demo's own data, read-only
//   demoChatStats()               { visitors, threads } (for the tests)
//   resetDemoChats({ clock })     forgets everything; clock() (ms) instead
//                                 of the computer's (the tests; call it again
//                                 after setQuotasForTests)
//
// WHO EDITS IT
// Nobody, normally. The numbers are in server/quotas.js.

import { randomBytes } from "node:crypto";
import { clientAddress, createLoginLimiter, demoCookie, DEMO_COOKIE_NAME, parseCookies } from "../auth.js";
import { DAY_MS, HOUR_MS, QUOTAS } from "../quotas.js";

export const DEMO_QUOTA_MESSAGE = "The demo's assistant has answered enough questions for now. Register to ask about your own land.";

// 16 random bytes, written as 22 letters, digits, "-" and "_".
const VISITOR = /^[A-Za-z0-9_-]{22}$/;
// How often forgotten chats are swept out of memory at most.
const SWEEP_EVERY_MS = 60 * 1000;

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the chats and the counts.
//   visitors  number -> { threads: Map(id -> { chat, keptAt }), seenAt },
//             the visitor seen longest ago first
const memory = (globalThis.__chernozemDemoChats ??= { visitors: new Map(), limits: null, clock: null, sweptAt: 0 });

const now = () => (memory.clock ? memory.clock() : Date.now());
const keepMs = () => QUOTAS.demoChatKeepHours * HOUR_MS;

export function resetDemoChats({ clock = null } = {}) {
  memory.visitors = new Map();
  memory.limits = null;
  memory.clock = clock;
  memory.sweptAt = 0;
}

// ---------- The visitor ----------

export function visitorOf(req) {
  const value = parseCookies(req.headers?.cookie)[DEMO_COOKIE_NAME];
  return typeof value === "string" && VISITOR.test(value) ? value : null;
}

// Adds one Set-Cookie line to the answer, keeping any set before.
function addCookie(res, line) {
  const before = res.getHeader("Set-Cookie");
  const lines = before === undefined ? [] : [].concat(before);
  res.setHeader("Set-Cookie", [...lines, line]);
}

export function ensureVisitor(req, res) {
  const id = visitorOf(req) || randomBytes(16).toString("base64url");
  addCookie(res, demoCookie(req, id));
  return id;
}

// ---------- The three limits ----------

function limits() {
  return (memory.limits ??= {
    visitor: createLoginLimiter({ max: QUOTAS.demoChatPerVisitor, windowMs: DAY_MS }),
    address: createLoginLimiter({ max: QUOTAS.demoChatPerAddress, windowMs: DAY_MS }),
    all: createLoginLimiter({ max: QUOTAS.demoChatPerDay, windowMs: DAY_MS }),
  });
}

export function spendDemoQuestion(req, visitor) {
  const at = now();
  const address = clientAddress(req);
  const counts = limits();
  const asked = [counts.visitor.check(visitor, at), counts.address.check(address, at), counts.all.check("demo", at)];
  const blocked = asked.filter((answer) => answer.blocked);
  if (blocked.length) return { ok: false, retryAfterSec: Math.max(...blocked.map((answer) => answer.retryAfterSec)) };
  // (The limiter calls a counted event "fail", after the wrong keys it was
  // made for.)
  counts.visitor.fail(visitor, at);
  counts.address.fail(address, at);
  counts.all.fail("demo", at);
  return { ok: true };
}

// ---------- The chats ----------

// Forgets the visitor's chats whose last message is older than the keep time.
function dropOld(entry, at) {
  for (const [id, kept] of entry.threads) if (at - kept.keptAt >= keepMs()) entry.threads.delete(id);
}

// At most once a minute: every visitor's old chats, and visitors left with none.
function sweep(at) {
  if (at - memory.sweptAt < SWEEP_EVERY_MS) return;
  memory.sweptAt = at;
  for (const [id, entry] of memory.visitors) {
    dropOld(entry, at);
    if (!entry.threads.size) memory.visitors.delete(id);
  }
}

// The visitor's entry (moved to the end: seen now), or null. create: make
// one when there is none, forgetting the visitor seen longest ago when
// there are too many.
function entryOf(visitor, { create = false } = {}) {
  if (!visitor) return null;
  const at = now();
  sweep(at);
  let entry = memory.visitors.get(visitor);
  if (!entry && !create) return null;
  if (entry) memory.visitors.delete(visitor);
  else entry = { threads: new Map(), seenAt: at };
  entry.seenAt = at;
  memory.visitors.set(visitor, entry);
  while (memory.visitors.size > QUOTAS.demoChatVisitors) memory.visitors.delete(memory.visitors.keys().next().value);
  dropOld(entry, at);
  return entry;
}

// Keeps one chat: its last messages only, and at most so many chats (the
// one written in longest ago goes first).
function keep(entry, chat) {
  const copy = structuredClone(chat);
  if (Array.isArray(copy.messages) && copy.messages.length > QUOTAS.demoChatMessages) copy.messages = copy.messages.slice(-QUOTAS.demoChatMessages);
  entry.threads.delete(copy.id);
  entry.threads.set(copy.id, { chat: copy, keptAt: now() });
  while (entry.threads.size > QUOTAS.demoChatThreads) entry.threads.delete(entry.threads.keys().next().value);
}

// The same summaries server/store.js listChats gives: [{ id, title,
// updatedAt, preview }], newest first.
function summaries(entry, product) {
  return [...(entry?.threads.values() || [])]
    .map((kept) => kept.chat)
    .filter((chat) => !product || chat.product === product)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((chat) => {
      const last = [...(chat.messages || [])].reverse().find((message) => message.text);
      return {
        id: chat.id,
        title: chat.title || "New chat",
        updatedAt: chat.updatedAt,
        preview: last ? String(last.text).replace(/\s+/g, " ").slice(0, 120) : "",
      };
    });
}

export function demoChatStore(store, visitor) {
  return {
    ...store,
    async getChat(id) {
      const kept = entryOf(visitor)?.threads.get(id);
      return kept ? structuredClone(kept.chat) : null;
    },
    async saveChat(chat) {
      keep(entryOf(visitor, { create: true }), chat);
      return chat;
    },
    async listChats(product) {
      return summaries(entryOf(visitor), product);
    },
    async deleteChat(id) {
      return Boolean(entryOf(visitor)?.threads.delete(id));
    },
  };
}

export function demoChatStats() {
  let threads = 0;
  for (const entry of memory.visitors.values()) threads += entry.threads.size;
  return { visitors: memory.visitors.size, threads };
}
