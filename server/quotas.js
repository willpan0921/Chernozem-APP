// WHAT THIS FILE DOES
// What one registered account may do, what a visitor of the public demo
// may ask of the AI assistant, and what the website's contact form takes
// in, in numbers. Anyone can register, open the demo or write, so nobody
// must be able to fill the disk, hold the Earth Engine line for hours or
// spend the owner's Claude key without end. The owner (and the app on
// one's own computer, "open") has none of these limits.
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
//   fieldSetupPerHour PUT /api/farm, POST /api/farm/fields     server/field/routes.js
//   fieldJobsPerHour  POST /api/farm/detect, and           server/field/routes.js
//                     POST /api/farm/analyze, each
//   chatMessagesPerDay  questions to the AI assistant in    server/ai/chat.js
//                     24 hours, for an account whose        (spendAccountQuestion
//                     e-mail Google verified (a Google       below)
//                     sign-in, or a verified e-mail and
//                     password account)
//   chatMessagesPerDayUnverified  the same for an account whose e-mail is
//                     not verified (e-mail and password sign-ups)
//   accountsChatPerDay  every account's questions together, in 24 hours
//   accountsChatTokensPerDay  the tokens Claude reads and writes for every
//                     account together, in 24 hours (each answer's usage:
//                     input, cache writes and reads, and output)
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
//   demoChatTokensPerDay the tokens Claude reads and writes for the whole
//                        demo in 24 hours (each answer's usage)
//   demoChatMaxTokens    the longest one answer may be (max_tokens), and
//   demoChatToolRounds   how many look-ups one demo answer may make; the
//                        demo's answers also think less (effort "low") and
//                        never continue a paused turn (server/ai/chat.js)
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
// THE CONTACT FORM (server/messages.js; besides 5 an hour per visitor)
//   contactPerHourAll    messages kept from all visitors together, an hour
//   contactPerDayAll     ... in 24 hours
//   contactUnsentMax     messages kept but not e-mailed yet, at most
//   contactMailsPerDay   e-mails sent in 24 hours (a message past it waits,
//                        "held", and goes out when the 24 hours allow,
//                        without using up its tries)
// Past the first three: 429 "busy", "The form is busy right now. Please
// write to chernozem.app@gmail.com."
//
// HOW A ROUTE KNOWS
// server/app.js runs every route of a registered account inside that
// account's own folder (server/store.js withDataRoot). isAccount() is true
// there and false in the demo's folder, so the routes ask it and apply the
// numbers only to accounts (the demo's are asked for with
// server/session.js isDemoSession()). The counts over time (spend, the AI
// assistant's questions and tokens, the contact form's) are kept by
// server/counters.js, in memory and in quota-state.json in the base data
// folder, so a restart or a new version does not hand out a fresh
// allowance. An account is counted by its folder's name, never by its
// e-mail.
//
// WHO EDITS IT
// The owner, to change a number. Tests use setQuotasForTests.

import path from "node:path";
import { HttpError } from "./http.js";
import { baseDataDir, dataDir } from "./store.js";
import { counter, resetCountersForTests } from "./counters.js";
import { currentSession } from "./session.js";

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
  fieldSetupPerHour: 12, // farm set-ups and added fields (each starts a small analysis)
  chatMessagesPerDay: 40,
  chatMessagesPerDayUnverified: 10,
  accountsChatPerDay: 400,
  accountsChatTokensPerDay: 6_000_000,
  reports: 30,
  uploadBytes: 40 * MB,
  photoMaxSide: 8000,
  // The public demo (see the top of this file).
  demoChatPerVisitor: 8,
  demoChatPerAddress: 24,
  demoChatPerDay: 300,
  demoChatTokensPerDay: 1_500_000,
  demoChatMaxTokens: 3000,
  demoChatToolRounds: 2,
  demoChatVisitors: 2000,
  demoChatThreads: 10,
  demoChatMessages: 30,
  demoChatKeepHours: 24,
  demoPlaceSearchesPerHour: 20,
  demoPlaceSearchesPerHourAll: 200,
  // The contact form (server/messages.js).
  contactPerHourAll: 30,
  contactPerDayAll: 150,
  contactUnsentMax: 1000,
  contactMailsPerDay: 100,
});

// The numbers in force. Read a number from here where it is applied, never
// copy it, so the tests can lower one.
export const QUOTAS = { ...DEFAULTS };

// For the tests: lower some numbers ({ reports: 2 }), or none to put the
// defaults back. Forgets every count (server/counters.js), and reads time
// from clock() (ms) when one is given.
export function setQuotasForTests(overrides = {}, { clock = null } = {}) {
  Object.assign(QUOTAS, DEFAULTS, overrides);
  resetCountersForTests({ clock });
}

// True inside a registered account's folder (see the top of this file).
export function isAccount() {
  return dataDir() !== baseDataDir();
}

// The answer when an account has reached a limit: 429 "quota" with a plain
// sentence (413 for something that would take too much disk).
export const quotaError = (message, status = 429) => new HttpError(status, "quota", message);

// The account asking, as the counts know it: its folder's name (a hash,
// server/store.js userRoot).
const accountKey = () => path.basename(dataDir());

// Spends one use of `what` ("field-detect", "field-analyze"...) for the
// account asking, when fewer than `limit` uses were spent in the last
// `windowMs`. Gives back { ok: true }, or { ok: false, retryAfterMs }
// without spending anything. The demo, the owner and open: always ok.
export function spend(what, limit, windowMs, now) {
  if (!isAccount()) return { ok: true };
  const uses = counter(`account-${what}`, windowMs);
  const asked = uses.check(accountKey(), limit, now);
  if (asked.blocked) return { ok: false, retryAfterMs: asked.retryAfterMs };
  uses.add(accountKey(), 1, now);
  return { ok: true };
}

// ---------- The AI assistant, for accounts ----------

const accountQuestions = () => counter("account-chat", DAY_MS);
const allAccountsQuestions = () => counter("accounts-chat", DAY_MS);
const allAccountsTokens = () => counter("accounts-chat-tokens", DAY_MS);

// One question to the AI assistant for the account asking (server/ai/chat.js),
// when its own allowance (chatMessagesPerDay with a verified e-mail, else
// chatMessagesPerDayUnverified), every account's together
// (accountsChatPerDay) and their tokens (accountsChatTokensPerDay) allow
// it, all over the last 24 hours. Gives back { ok: true } (counted), or
// { ok: false, retryAfterMs, message } (nothing counted). Not an account:
// always ok, nothing counted.
export function spendAccountQuestion(now) {
  if (!isAccount()) return { ok: true };
  const verified = currentSession()?.emailVerified === true;
  const own = verified ? QUOTAS.chatMessagesPerDay : QUOTAS.chatMessagesPerDayUnverified;
  const mine = accountQuestions().check(accountKey(), own, now);
  if (mine.blocked) {
    const { retryAfterMs } = mine;
    const message = verified
      ? `An account can ask the assistant ${own} questions a day. Try again ${inWords(retryAfterMs)}.`
      : `An account whose e-mail address is not verified can ask the assistant ${own} questions a day (a verified one, as with Google, ${QUOTAS.chatMessagesPerDay}). Try again ${inWords(retryAfterMs)}.`;
    return { ok: false, retryAfterMs, message };
  }
  const everyone = [allAccountsQuestions().check("accounts", QUOTAS.accountsChatPerDay, now), allAccountsTokens().check("accounts", QUOTAS.accountsChatTokensPerDay, now)].filter((asked) => asked.blocked);
  if (everyone.length) {
    const retryAfterMs = Math.max(...everyone.map((asked) => asked.retryAfterMs));
    return { ok: false, retryAfterMs, message: `The assistant has answered as many questions as it can for today. Try again ${inWords(retryAfterMs)}.` };
  }
  accountQuestions().add(accountKey(), 1, now);
  allAccountsQuestions().add("accounts", 1, now);
  return { ok: true };
}

// The tokens one of Claude's answers used, for every account together
// (server/ai/chat.js, after each answer). Not an account: nothing.
export function noteAccountTokens(tokens, now) {
  if (!isAccount()) return;
  allAccountsTokens().add("accounts", tokens, now);
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
