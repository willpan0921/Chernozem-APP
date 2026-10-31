// WHAT THIS FILE DOES
// The messages visitors send through the public website's contact form
// (the /contact page, open to everyone). Each one is kept on the server
// first, then e-mailed to the owner's inbox, chernozem.app@gmail.com
// (server/mail.js: Gmail with an app password, any SMTP server, or Resend).
// A message that could not be e-mailed yet (nothing set up, or the mail
// service down) stays on the server and is tried again later, so nothing
// is lost; the owner also reads them all in Atlas > Settings ("Messages
// from the website").
//
//   POST   /api/contact        PUBLIC (server/app.js answers it before
//                              anyone's session, like /api/health). body
//                              { name, email, organization?, role?,
//                              message, website? }
//                              -> 201 { ok: true, id } once the message is
//                                 kept, whether or not the e-mail went out
//                                 (the visitor waits at most 8 seconds for
//                                 it; a slower e-mail goes on in the
//                                 background, and its real outcome is
//                                 recorded when it comes)
//                              -> 400 { error: { code: "bad_request",
//                                 message } }, the message naming the
//                                 field that is wrong
//                              -> 413 when the body is over CONTACT_MAX_BYTES
//                              -> 429 { error: { code: "too_many", message } }
//                                 (and a Retry-After header) after
//                                 CONTACT_MAX_PER_HOUR messages from one
//                                 visitor inside an hour
//                              -> 429 { error: { code: "busy", message: "The
//                                 form is busy right now. Please write to
//                                 chernozem.app@gmail.com." } } when all
//                                 visitors together have sent the most the
//                                 form takes (below)
//   GET    /api/messages       the owner's only (server/app.js: 403
//                              owner_only for the demo and every account):
//                              { messages: [...] }, newest first, each
//                              with its mail status (below)
//   DELETE /api/messages/:id   the owner's only: removes one -> { ok: true }
//                              (404 when there is no such message)
//
// WHAT IS KEPT
// One file per message, <data folder>/messages/<id>.json (server/store.js):
//   { id, receivedAt, name, email, organization, role, message, mail }
// Only what the visitor typed, trimmed (no address, no browser, nothing
// else about them), and how its e-mail went:
//   mail { status: "pending", attempts: 0 }          kept, not tried yet
//        { status: "sent", attempts, at, transport }  e-mailed (at: when)
//        { status: "failed", attempts, at, transport, error }
//                                                     the last try went wrong
//        { status: "off", attempts, at }              no e-mail set up (at:
//                                                     when that was seen)
//        { status: "held", attempts, at }             the day's e-mails are
//                                                     all sent (below): it
//                                                     waits, without using
//                                                     up a try
// A message kept before e-mails existed (no mail at all) counts as pending.
//
// TRYING AGAIN (startMailRetry, from server/index.js)
// 20 seconds after the server starts, then every 10 minutes, the messages
// not sent yet (pending, failed, off or held), oldest first, at most
// MAIL_RETRY.perRun (20) a run and MAIL_RETRY.maxAttempts (8) tries each,
// are e-mailed, once an e-mail service is set up and the day's e-mails
// allow. Never two runs at once, never a message being sent right now,
// and never one tried in the last 3 minutes (another server sharing the
// data folder may be sending it). After 8 failed tries a message stays
// "failed" on the server, where the owner still reads it. Every try of a
// message has the same Message-ID (server/mail.js), so a try that looked
// failed but went through gives no second copy in Gmail.
//
// FOR EVERYONE TOGETHER (the numbers are in server/quotas.js)
//   - QUOTAS.contactPerHourAll (30) messages an hour and
//     QUOTAS.contactPerDayAll (150) in 24 hours are kept from all visitors
//     together, and at most QUOTAS.contactUnsentMax (1,000) kept messages
//     wait for their e-mail at once; past any of them the form answers 429
//     "busy" (BUSY_MESSAGE), so the disk and the owner's Gmail can never
//     be flooded;
//   - QUOTAS.contactMailsPerDay (100) e-mails are sent in 24 hours (Gmail
//     limits what one account sends a day): a message past it is "held",
//     kept, and e-mailed by a later run once the 24 hours allow, without
//     using up one of its tries.
// The counts are kept by server/counters.js, so a restart does not start
// them again.
//
// AGAINST ROBOTS
//   - "website" is a honeypot: a field people never see (the page hides
//     it) and robots fill in. A form that fills it is answered 200
//     { ok: true } and kept nowhere (and e-mailed to nobody).
//   - One visitor may send CONTACT_MAX_PER_HOUR (5) messages an hour. The
//     visitor is told apart by server/auth.js clientAddress (behind
//     Cloudflare, on Render, by CF-Connecting-IP; an IPv6 visitor by its
//     /48, the block one provider's customer usually holds). Only messages
//     that are kept count: a robot's or a refused one does not.
//   - The body may be CONTACT_MAX_BYTES (16 KB) at most.
//
// WHO EDITS IT
// Whoever changes the contact form's fields or their limits (the public
// page sends them through src/api/siteApi.js sendContact; Atlas Settings
// reads them through src/api/atlasApi.js listMessages).

import { HttpError, readJson, sendJson } from "./http.js";
import { clientAddress } from "./auth.js";
import { deleteMessage, getMessage, listMessages, newId, saveMessage, updateMessage, withDataRoot } from "./store.js";
import { mailSettings, sendContactEmail } from "./mail.js";
import { counter } from "./counters.js";
import { DAY_MS, HOUR_MS, QUOTAS } from "./quotas.js";

export const CONTACT_MAX_PER_HOUR = 5;
export const CONTACT_WINDOW_MS = 60 * 60 * 1000;
export const CONTACT_MAX_BYTES = 16 * 1024;
// How long each field may be, in characters (after trimming).
export const CONTACT_LIMITS = { name: 80, email: 120, organization: 120, role: 60, message: 2000 };
export const MESSAGE_MIN_LENGTH = 10;
// The second tries (see the top of this file).
export const MAIL_RETRY = { firstAfterMs: 20 * 1000, everyMs: 10 * 60 * 1000, perRun: 20, maxAttempts: 8, minGapMs: 3 * 60 * 1000 };
// How long the visitor waits for the e-mail at most before the 201.
export const CONTACT_ANSWER_WAIT_MS = 8000;
export const BUSY_MESSAGE = "The form is busy right now. Please write to chernozem.app@gmail.com.";

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps what it is doing.
const memory = (globalThis.__chernozemMessages ??= { clock: null });
// The messages being e-mailed right now (never two tries at once), the
// run of second tries going on, its timers, the count of messages not
// e-mailed yet ({ count, at }), and the tests' shorter wait.
memory.sending ??= new Set();
memory.retrying ??= null;
memory.unsent ??= null;

const now = () => (memory.clock ? memory.clock() : Date.now());
const answerWait = () => memory.answerWaitMs ?? CONTACT_ANSWER_WAIT_MS;

// The counts (server/counters.js): each visitor's messages an hour, all
// visitors' an hour and in 24 hours, and the e-mails sent in 24 hours.
const perVisitor = () => counter("contact-visitor", CONTACT_WINDOW_MS);
const perHour = () => counter("contact-hour", HOUR_MS);
const perDay = () => counter("contact-day", DAY_MS);
const mailsSent = () => counter("contact-mail", DAY_MS);

// For tests: forget every message counted, read the time from clock()
// (milliseconds) instead of the computer's clock, and let the visitor wait
// answerWaitMs at most for the e-mail.
export function resetContactLimits({ clock = null, answerWaitMs = null } = {}) {
  memory.clock = clock;
  memory.answerWaitMs = answerWaitMs;
  memory.unsent = null;
  for (const count of [perVisitor(), perHour(), perDay(), mailsSent()]) count.clear();
}

const bad = (message) => new HttpError(400, "bad_request", message);

// One typed value as a single line of text: trimmed, runs of spaces made
// one. Anything that is not text counts as empty.
const oneLine = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

// True when the form's hidden "website" field was filled: a robot.
export function isHoneypotFilled(body) {
  const value = body?.website;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

// The message as it is kept, from what the form sent: { name, email,
// organization, role, message }. Throws a 400 naming the field that is
// wrong.
export function cleanContact(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("Send the form as an object: { name, email, message }.");
  const name = oneLine(body.name);
  if (!name) throw bad("Enter your name.");
  if (name.length > CONTACT_LIMITS.name) throw bad(`The name can be ${CONTACT_LIMITS.name} characters at most.`);
  const email = oneLine(body.email);
  if (!email) throw bad("Enter your email address.");
  if (email.length > CONTACT_LIMITS.email) throw bad(`The email address can be ${CONTACT_LIMITS.email} characters at most.`);
  // Something, an @, something, a dot, something; no spaces (the same
  // check as the team's email addresses in server/app.js).
  if (email.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("That email address does not look right.");
  const organization = oneLine(body.organization);
  if (organization.length > CONTACT_LIMITS.organization) throw bad(`The organization can be ${CONTACT_LIMITS.organization} characters at most.`);
  // Who the visitor is ("Farmer", "NGO"...), when the page sends it.
  const role = oneLine(body.role);
  if (role.length > CONTACT_LIMITS.role) throw bad(`The role can be ${CONTACT_LIMITS.role} characters at most.`);
  // The message keeps its lines (Windows line ends made plain).
  const message = typeof body.message === "string" ? body.message.replace(/\r\n?/g, "\n").trim() : "";
  if (message.length < MESSAGE_MIN_LENGTH) throw bad(`The message must be at least ${MESSAGE_MIN_LENGTH} characters.`);
  if (message.length > CONTACT_LIMITS.message) throw bad(`The message can be ${CONTACT_LIMITS.message.toLocaleString("en-US")} characters at most.`);
  return { name, email, organization, role, message };
}

// ---------- The e-mail ----------

// How a message's e-mail went, as kept (a message from before e-mails
// existed has none: pending).
export function mailOf(message) {
  const mail = message?.mail;
  if (!mail || typeof mail !== "object") return { status: "pending", attempts: 0 };
  return { ...mail, status: mail.status || "pending", attempts: Number.isInteger(mail.attempts) ? mail.attempts : 0 };
}

const UNSENT = new Set(["pending", "failed", "off", "held"]);

// How many kept messages wait for their e-mail: counted from the files at
// most once a minute, and kept up to date in between.
async function unsentCount() {
  const at = now();
  if (!memory.unsent || at - memory.unsent.at >= 60 * 1000 || at < memory.unsent.at) {
    const all = await withDataRoot(null, () => listMessages());
    memory.unsent = { at, count: all.filter((message) => UNSENT.has(mailOf(message).status)).length };
  }
  return memory.unsent.count;
}

const unsentChanged = (by) => {
  if (memory.unsent) memory.unsent.count = Math.max(0, memory.unsent.count + by);
};

// True while the day's e-mails are all sent (QUOTAS.contactMailsPerDay).
const mailsUsedUp = () => mailsSent().check("all", QUOTAS.contactMailsPerDay, now()).blocked;

// Tries to e-mail one kept message now and records how it went on the
// message, when the try ends (server/mail.js: the mail service's answer or
// the transport's own time limits). Past the day's e-mails it is "held"
// instead, untried. Gives back the message as kept then, or null when it
// is gone or already being sent.
export async function deliverMessage(id) {
  if (memory.sending.has(id)) return null;
  memory.sending.add(id);
  try {
    const saved = await getMessage(id);
    if (!saved || !UNSENT.has(mailOf(saved).status)) return saved || null;
    const settings = mailSettings();
    if (settings.transport !== "off") {
      if (mailsUsedUp()) {
        return await updateMessage(id, (current) => {
          current.mail = { status: "held", attempts: mailOf(current).attempts, at: new Date(now()).toISOString() };
        });
      }
      mailsSent().add("all", 1, now());
    }
    const result = await sendContactEmail(saved, settings);
    const at = new Date(now()).toISOString();
    const kept = await updateMessage(id, (current) => {
      const attempts = mailOf(current).attempts + (result.status === "off" ? 0 : 1);
      if (result.status === "sent") current.mail = { status: "sent", attempts, at, transport: result.transport };
      else if (result.status === "failed") current.mail = { status: "failed", attempts, at, transport: result.transport, error: result.error };
      else current.mail = { status: "off", attempts, at };
    });
    if (result.status === "sent" && kept) unsentChanged(-1);
    if (result.status === "failed") console.warn(`[chernozem] A contact message (${id}) could not be e-mailed yet: ${result.error}. It is kept on the server and tried again later.`);
    return kept;
  } finally {
    memory.sending.delete(id);
  }
}

// When a message was last tried (or came), ms.
const lastTouch = (message) => Date.parse(mailOf(message).at || "") || Date.parse(message.receivedAt || "") || 0;

// One run of second tries (see the top of this file). Gives back
// { tried, sent }; with no e-mail set up nothing is tried.
export function retryUnsentMessages() {
  if (memory.retrying) return memory.retrying;
  memory.retrying = withDataRoot(null, async () => {
    if (mailSettings().transport === "off" || mailsUsedUp()) return { tried: 0, sent: 0 };
    const at = now();
    const due = (await listMessages())
      .filter((message) => {
        const mail = mailOf(message);
        return UNSENT.has(mail.status) && mail.attempts < MAIL_RETRY.maxAttempts && at - lastTouch(message) >= MAIL_RETRY.minGapMs && !memory.sending.has(message.id);
      })
      .sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)) || String(a.id).localeCompare(String(b.id)))
      .slice(0, MAIL_RETRY.perRun);
    let sent = 0;
    let tried = 0;
    for (const message of due) {
      // The day's e-mails all sent: the rest wait for a later run, untouched.
      if (mailsUsedUp()) break;
      tried += 1;
      const kept = await deliverMessage(message.id);
      if (kept?.mail?.status === "sent") sent += 1;
    }
    return { tried, sent };
  }).finally(() => {
    memory.retrying = null;
  });
  return memory.retrying;
}

// Called once by server/index.js: the first run 20 seconds after the start,
// then every 10 minutes. The timers never keep the server running.
export function startMailRetry({ firstAfterMs = MAIL_RETRY.firstAfterMs, everyMs = MAIL_RETRY.everyMs } = {}) {
  if (memory.retryTimer) return;
  const run = () =>
    retryUnsentMessages()
      .then(({ sent }) => {
        if (sent) console.log(`[chernozem] E-mailed ${sent} waiting contact message${sent === 1 ? "" : "s"} to ${mailSettings().to}.`);
      })
      .catch((error) => console.warn(`[chernozem] The contact messages could not be tried again: ${error.message}`));
  memory.retryTimer = setTimeout(() => {
    run();
    memory.retryTimer = setInterval(run, everyMs);
    memory.retryTimer.unref?.();
  }, firstAfterMs);
  memory.retryTimer.unref?.();
}

// For tests: stop the timers of startMailRetry.
export function stopMailRetry() {
  clearTimeout(memory.retryTimer);
  clearInterval(memory.retryTimer);
  memory.retryTimer = null;
}

// POST /api/contact. Called by server/app.js before anyone's session.
//   parts     the path after /api/ (["contact"])
export async function handleContact(req, res, { method, parts, pathname }) {
  if (parts.length > 1) throw new HttpError(404, "not_found", `No such API route: ${pathname}`);
  if (method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${pathname}.`);
  }
  const body = await readJson(req, { maxBytes: CONTACT_MAX_BYTES });
  // A robot: told "thank you", kept nowhere.
  if (isHoneypotFilled(body)) return sendJson(res, 200, { ok: true });

  const who = clientAddress(req, { ipv6Bits: 48 });
  const at = now();
  const wait = perVisitor().check(who, CONTACT_MAX_PER_HOUR, at);
  if (wait.blocked) {
    res.setHeader("Retry-After", String(wait.retryAfterSec));
    const minutes = Math.ceil(wait.retryAfterSec / 60);
    throw new HttpError(429, "too_many", `Too many messages in a row. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const clean = cleanContact(body);
  // All visitors together (see the top of this file).
  const full = [perHour().check("all", QUOTAS.contactPerHourAll, at), perDay().check("all", QUOTAS.contactPerDayAll, at)].filter((asked) => asked.blocked);
  if (full.length) {
    res.setHeader("Retry-After", String(Math.max(...full.map((asked) => asked.retryAfterSec))));
    throw new HttpError(429, "busy", BUSY_MESSAGE);
  }
  if ((await unsentCount()) >= QUOTAS.contactUnsentMax) throw new HttpError(429, "busy", BUSY_MESSAGE);

  const message = { id: newId("msg"), receivedAt: new Date(at).toISOString(), ...clean, mail: { status: "pending", attempts: 0 } };
  // Kept first: from here on the message is safe, whatever the e-mail does.
  await saveMessage(message);
  unsentChanged(+1);
  // One more message from this visitor, and from everyone, counted.
  perVisitor().add(who, 1, at);
  perHour().add("all", 1, at);
  perDay().add("all", 1, at);
  // Then e-mailed: the visitor waits at most CONTACT_ANSWER_WAIT_MS; a
  // slower e-mail goes on in the background and records its own outcome
  // (a failure is tried again later).
  const sending = deliverMessage(message.id).catch((error) => console.warn(`[chernozem] A contact message (${message.id}) could not be e-mailed yet: ${error.message}`));
  let timer;
  await Promise.race([sending, new Promise((resolve) => (timer = setTimeout(resolve, answerWait())))]);
  clearTimeout(timer);
  return sendJson(res, 201, { ok: true, id: message.id });
}

// GET /api/messages and DELETE /api/messages/:id. Called by server/app.js
// for the owner only (403 owner_only for everyone else).
//   second    the message's id, or undefined for the list
//   third     anything after it (always a 404)
export async function handleMessages(req, res, { method, second, third, pathname }) {
  if (third !== undefined) throw new HttpError(404, "not_found", `No such API route: ${pathname}`);
  if (!second) {
    if (method === "GET") return sendJson(res, 200, { messages: (await listMessages()).map((message) => ({ ...message, mail: mailOf(message) })) });
    res.setHeader("Allow", "GET");
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${pathname}.`);
  }
  if (method === "DELETE") {
    if (!(await deleteMessage(second))) throw new HttpError(404, "not_found", "That message does not exist (it may have been removed already).");
    // Counted again from the files at the next message.
    memory.unsent = null;
    return sendJson(res, 200, { ok: true });
  }
  res.setHeader("Allow", "DELETE");
  throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${pathname}.`);
}
