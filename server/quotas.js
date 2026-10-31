// WHAT THIS FILE DOES
// What one registered account may do, and what a visitor of the public
// demo may ask of the AI assistant, in numbers. Anyone can register or
// open the demo, so nobody must be able to fill the disk, hold the Earth
// Engine line for hours or spend the owner's Claude key without end. The
// owner (and the app on one's own computer without a key) has none of
// these limits.
//
// THE LIMITS (QUOTAS below; where each one is applied)
//   areas             saved areas per account             server/app.js POST /api/areas
//   areaKm2           the size of one area, in km²        server/app.js (an account can
//   areaSquares       the map squares of one area           keep a country the size of
//                                                           Ukraine, 598,457 km² in 1,176
//                                                           squares, but not Russia; the
//                                                           grid always plans at most
//                                                           1,500 squares by making them
//                                                           bigger, so the km² is what
//                                                           really bounds the work)
//   points            corner points of a drawn or typed    server/app.js, server/field/routes.js
//                     outline (the demo: 5,000)
//   monthsPerAnalysis months per POST /api/analyze         server/app.js (the demo: 24)
//   One Atlas analysis running or waiting at a time       server/app.js POST /api/analyze
//   One Field job (a search for fields or an analysis)    server/field/routes.js
//   fieldJobsPerHour  POST /api/farm/detect, and           server/field/routes.js
//                     POST /api/farm/analyze, each
//   chatMessagesPerDay  POST /api/chat                     server/ai/chat.js
//   reports           "Tell us what happened" reports      server/field/routes.js
//   uploadBytes       all of the account's photos together server/field/routes.js
//   photoMaxSide      pixels a side of one photo           server/field/routes.js
//                     (Claude takes at most 8,000)
// A fresh account's workspace also starts with the monthly Atlas update
// switched off (server/store.js defaultWorkspace); the person can switch
// it on in Settings.
//
// THE PUBLIC DEMO (read-only for everyone; server/auth.js, server/app.js)
//   demoChatPerVisitor   questions to the demo's assistant    server/ai/demoChats.js
//                        per visitor (the chernozem_demo
//                        cookie) in 24 hours
//   demoChatPerAddress   ... per internet address in 24 hours  (server/auth.js clientAddress)
//   demoChatPerDay       ... for the whole demo in 24 hours
//   demoChatVisitors     visitors whose chats are kept in memory at once
//   demoChatThreads      chats kept per visitor (the oldest goes first)
//   demoChatMessages     messages kept per chat (the oldest go first)
//   demoChatKeepHours    a chat is forgotten this long after its last message
//   demoPlaceSearchesPerHour     place names looked up with OpenStreetMap
//   demoPlaceSearchesPerHourAll  per internet address / for the whole demo,
//                        an hour (typed coordinates and names already looked
//                        up are free): server/field/routes.js GET /api/geocode
// Over a limit the demo's assistant answers 429 "quota": "The demo's
// assistant has answered enough questions for now. Register to ask about
// your own land." Nothing a demo visitor asks is written to disk.
//
// HOW A ROUTE KNOWS
// server/app.js runs every route of a registered account inside that
// account's own folder (server/store.js withDataRoot). isAccount() is true
// there and false in the demo's folder, so the routes ask it and apply the
// numbers only to accounts (the demo's are asked for with
// server/session.js isDemoSession()). The counts over time (spend) are
// kept in this server's memory, per account; a restart forgets them,
// which is fine.
//
// WHO EDITS IT
// The owner, to change a number. Tests use setQuotasForTests.

import { HttpError } from "./http.js";
import { baseDataDir, dataDir } from "./store.js";

const MB = 1024 * 1024;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

const DEFAULTS = Object.freeze({
  areas: 5,
  areaKm2: 1_000_000,
  areaSquares: 1500,
  points: 1000,
  monthsPerAnalysis: 12,
  fieldJobsPerHour: 2,
  chatMessagesPerDay: 40,
  reports: 30,
  uploadBytes: 40 * MB,
  photoMaxSide: 8000,
  // The public demo (see the top of this file).
  demoChatPerVisitor: 8,
  demoChatPerAddress: 24,
  demoChatPerDay: 300,
  demoChatVisitors: 2000,
  demoChatThreads: 10,
  demoChatMessages: 30,
  demoChatKeepHours: 24,
  demoPlaceSearchesPerHour: 20,
  demoPlaceSearchesPerHourAll: 200,
});

// The numbers in force. Read a number from here where it is applied, never
// copy it, so the tests can lower one.
export const QUOTAS = { ...DEFAULTS };

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the counts.
const memory = (globalThis.__chernozemQuotas ??= { uses: new Map() });

// For the tests: lower some numbers ({ reports: 2 }), or none to put the
// defaults back. Forgets every count.
export function setQuotasForTests(overrides = {}) {
  Object.assign(QUOTAS, DEFAULTS, overrides);
  memory.uses.clear();
}

// True inside a registered account's folder (see the top of this file).
export function isAccount() {
  return dataDir() !== baseDataDir();
}

// The answer when an account has reached a limit: 429 "quota" with a plain
// sentence (413 for something that would take too much disk).
export const quotaError = (message, status = 429) => new HttpError(status, "quota", message);

// Spends one use of `what` ("chat", "field-detect"...) for the account
// asking, when fewer than `limit` uses were spent in the last `windowMs`.
// Gives back { ok: true }, or { ok: false, retryAfterMs } without spending
// anything. The demo: always ok.
export function spend(what, limit, windowMs, now = Date.now()) {
  if (!isAccount()) return { ok: true };
  const key = `${dataDir()}\0${what}`;
  const recent = (memory.uses.get(key) || []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    memory.uses.set(key, recent);
    return { ok: false, retryAfterMs: recent[0] + windowMs - now };
  }
  recent.push(now);
  memory.uses.set(key, recent);
  return { ok: true };
}

// "in a minute", "in 12 minutes", "in 3 hours": for the sentence that says
// when to try again.
export function inWords(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return minutes === 1 ? "in a minute" : `in ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "in an hour" : `in ${hours} hours`;
}

// "40 MB", "3.7 MB", "512 KB"
export function sizeWords(bytes) {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}
