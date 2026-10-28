// WHAT THIS FILE DOES
// The messages visitors send through the public website's contact form
// (the /contact page, which needs no access code). They are kept on the
// server for the owner to read in Atlas > Settings ("Messages from the
// website"). No e-mail is sent.
//
//   POST   /api/contact        PUBLIC: no access code (server/app.js
//                              answers it before the code check, like
//                              /api/health). body { name, email,
//                              organization?, message, website? }
//                              -> 201 { ok: true, id }
//                              -> 400 { error: { code: "bad_request",
//                                 message } }, the message naming the
//                                 field that is wrong
//                              -> 413 when the body is over CONTACT_MAX_BYTES
//                              -> 429 { error: { code: "too_many", message } }
//                                 (and a Retry-After header) after
//                                 CONTACT_MAX_PER_HOUR messages from one
//                                 visitor inside an hour
//   GET    /api/messages       needs the access code: { messages: [...] },
//                              newest first
//   DELETE /api/messages/:id   needs the code: removes one -> { ok: true }
//                              (404 when there is no such message)
//
// WHAT IS KEPT
// One file per message, <data folder>/messages/<id>.json (server/store.js):
//   { id, receivedAt, name, email, organization, message }
// Only what the visitor typed, trimmed: no address, no browser, nothing
// else about them.
//
// AGAINST ROBOTS
//   - "website" is a honeypot: a field people never see (the page hides
//     it) and robots fill in. A form that fills it is answered 200
//     { ok: true } and kept nowhere.
//   - One visitor may send CONTACT_MAX_PER_HOUR (5) messages an hour. The
//     visitor is told apart as for wrong access codes (server/auth.js
//     clientAddress: behind Cloudflare, on Render, by CF-Connecting-IP;
//     an IPv6 visitor by its /64), and counted in the same kind of
//     memory-bounded table (auth.js createLoginLimiter). Only messages
//     that are kept count: a robot's or a refused one does not.
//   - The body may be CONTACT_MAX_BYTES (16 KB) at most.
//
// WHO EDITS IT
// Whoever changes the contact form's fields or their limits (the public
// page sends them through src/api/siteApi.js sendContact; Atlas Settings
// reads them through src/api/atlasApi.js listMessages).

import { HttpError, readJson, sendJson } from "./http.js";
import { clientAddress, createLoginLimiter } from "./auth.js";
import { deleteMessage, listMessages, newId, saveMessage } from "./store.js";

export const CONTACT_MAX_PER_HOUR = 5;
export const CONTACT_WINDOW_MS = 60 * 60 * 1000;
export const CONTACT_MAX_BYTES = 16 * 1024;
// How long each field may be, in characters (after trimming).
export const CONTACT_LIMITS = { name: 80, email: 120, organization: 120, message: 2000 };
export const MESSAGE_MIN_LENGTH = 10;

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the count of messages sent (like the wrong-code count in
// server/auth.js).
const memory = (globalThis.__chernozemMessages ??= { limiter: null, clock: null });

const now = () => (memory.clock ? memory.clock() : Date.now());

function limiter() {
  return (memory.limiter ??= createLoginLimiter({ max: CONTACT_MAX_PER_HOUR, windowMs: CONTACT_WINDOW_MS }));
}

// For tests: forget every message counted, and read the time from clock()
// (milliseconds) instead of the computer's clock.
export function resetContactLimits({ clock = null } = {}) {
  memory.limiter = null;
  memory.clock = clock;
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
// organization, message }. Throws a 400 naming the field that is wrong.
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
  // The message keeps its lines (Windows line ends made plain).
  const message = typeof body.message === "string" ? body.message.replace(/\r\n?/g, "\n").trim() : "";
  if (message.length < MESSAGE_MIN_LENGTH) throw bad(`The message must be at least ${MESSAGE_MIN_LENGTH} characters.`);
  if (message.length > CONTACT_LIMITS.message) throw bad(`The message can be ${CONTACT_LIMITS.message.toLocaleString("en-US")} characters at most.`);
  return { name, email, organization, message };
}

// POST /api/contact. Called by server/app.js before the access code.
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

  const who = clientAddress(req);
  const at = now();
  const wait = limiter().check(who, at);
  if (wait.blocked) {
    res.setHeader("Retry-After", String(wait.retryAfterSec));
    const minutes = Math.ceil(wait.retryAfterSec / 60);
    throw new HttpError(429, "too_many", `Too many messages in a row. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const clean = cleanContact(body);
  const message = { id: newId("msg"), receivedAt: new Date(at).toISOString(), ...clean };
  await saveMessage(message);
  // One more message from this visitor inside the hour (the limiter calls
  // a counted event "fail", after the wrong codes it was made for).
  limiter().fail(who, at);
  return sendJson(res, 201, { ok: true, id: message.id });
}

// GET /api/messages and DELETE /api/messages/:id. Called by server/app.js
// after the access code.
//   second    the message's id, or undefined for the list
//   third     anything after it (always a 404)
export async function handleMessages(req, res, { method, second, third, pathname }) {
  if (third !== undefined) throw new HttpError(404, "not_found", `No such API route: ${pathname}`);
  if (!second) {
    if (method === "GET") return sendJson(res, 200, { messages: await listMessages() });
    res.setHeader("Allow", "GET");
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${pathname}.`);
  }
  if (method === "DELETE") {
    if (!(await deleteMessage(second))) throw new HttpError(404, "not_found", "That message does not exist (it may have been removed already).");
    return sendJson(res, 200, { ok: true });
  }
  res.setHeader("Allow", "DELETE");
  throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${pathname}.`);
}
