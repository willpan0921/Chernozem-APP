// WHAT THIS FILE DOES
// E-mails the website's contact messages to the owner's inbox,
// chernozem.app@gmail.com (MAIL_TO changes it). server/messages.js keeps
// every message on the server first and then calls sendContactEmail; a
// message that could not be sent yet is tried again later (messages.js),
// so nothing is lost before the owner sets the e-mail up.
//
// HOW IT IS SENT (the first one set wins; docs/DEPLOY.md, "Contact e-mail")
//   1. Gmail   GMAIL_APP_PASSWORD (and GMAIL_USER, default MAIL_TO): the
//              owner's own Gmail account sends the message to itself, with
//              an "app password" made once in the Google account
//   2. SMTP    SMTP_HOST (and SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE):
//              any mail server
//   3. Resend  RESEND_API_KEY (and MAIL_FROM, default "Chernozem website
//              <onboarding@resend.dev>"): resend.com's web address for
//              sending, asked with fetch
//   none       "off": nothing is sent, the messages wait on the server
//              (Atlas Settings shows them to the owner)
//
// WHAT IS SENT: plain text only, nothing from the visitor is ever read as
// code or as a mail header.
//   Subject   "Chernozem: message from <name>": line breaks and other
//             control characters taken out, at most 120 characters
//   Body      the name, e-mail, organisation and role, the message, when
//             it came and its id
//   Reply-To  the visitor's e-mail, only when it passes a strict check
//             (safeReplyTo: one @, no spaces, quotes, angle brackets,
//             commas, semicolons, colons, brackets, parentheses or
//             backslashes, at most 254 characters), so Reply in Gmail
//             answers the visitor; else none (the address is in the body)
//   From      the Gmail or SMTP account itself ("Chernozem website
//             <account>"), or MAIL_FROM
// One try gives up after SEND_TIMEOUT_MS (8 seconds).
//
//   mailSettings(env?)        what config() says: { transport, to, from, ... }
//                             (with the secrets: kept inside this file)
//   mailStatus()              { configured, transport, to } for GET
//                             /api/status (the owner's; no secrets)
//   contactEmail(message)     { subject, text, replyTo } for one message
//   subjectFor(name), safeReplyTo(email)
//   sendContactEmail(message) { status: "sent" | "failed" | "off",
//                             transport, error? }; never throws, and the
//                             error never carries a password or key
//
// FOR THE TESTS
//   setDepsForTests({ createTransport, fetch, timeoutMs }): stand-ins for
//   nodemailer's createTransport (options -> { sendMail(mail) }) and for
//   fetch (the Resend call), and a shorter time to give up after. Called
//   with nothing, the real ones again.
//
// WHO EDITS IT
// Nobody, normally. The settings are typed into Render's Environment page
// (or .env on one's own computer: .env.example lists them).

import nodemailer from "nodemailer";
import { config } from "./env.js";

export const DEFAULT_MAIL_TO = "chernozem.app@gmail.com";
export const RESEND_DEFAULT_FROM = "Chernozem website <onboarding@resend.dev>";
export const RESEND_URL = "https://api.resend.com/emails";
export const SEND_TIMEOUT_MS = 8000;
export const SUBJECT_MAX = 120;
export const REPLY_TO_MAX = 254;

const TRANSPORT_NAMES = { gmail: "Gmail", smtp: "the mail server", resend: "Resend" };

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the tests' stand-ins.
const memory = (globalThis.__chernozemMail ??= { createTransport: null, fetch: null, timeoutMs: null });

export function setDepsForTests({ createTransport, fetch, timeoutMs } = {}) {
  memory.createTransport = typeof createTransport === "function" ? createTransport : null;
  memory.fetch = typeof fetch === "function" ? fetch : null;
  memory.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null;
}

const timeout = () => memory.timeoutMs || SEND_TIMEOUT_MS;

// ---------- Settings ----------

export function mailSettings(env = config()) {
  const to = env.mailTo || DEFAULT_MAIL_TO;
  if (env.gmailAppPassword) {
    const user = env.gmailUser || to;
    return { transport: "gmail", to, from: env.mailFrom || `Chernozem website <${user}>`, user, pass: env.gmailAppPassword };
  }
  if (env.smtpHost) {
    const secure = env.smtpSecure ?? env.smtpPort === 465;
    const port = env.smtpPort || (secure ? 465 : 587);
    const user = env.smtpUser || null;
    return { transport: "smtp", to, from: env.mailFrom || `Chernozem website <${user || to}>`, host: env.smtpHost, port, secure, user, pass: env.smtpPass || "" };
  }
  if (env.resendApiKey) return { transport: "resend", to, from: env.mailFrom || RESEND_DEFAULT_FROM, apiKey: env.resendApiKey };
  return { transport: "off", to };
}

export function mailStatus() {
  const { transport, to } = mailSettings();
  return { configured: transport !== "off", transport, to };
}

// ---------- The e-mail ----------

// Text for one line of a header: control characters (line breaks among
// them) become spaces, runs of spaces one.
const oneLine = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();

export function subjectFor(name) {
  return `Chernozem: message from ${oneLine(name) || "a visitor"}`.slice(0, SUBJECT_MAX).trim();
}

// Anything that could make a second address, a group or a comment, or a
// header of its own.
const NOT_IN_ADDRESS = /[\s"<>,;:()[\]\\\u0000-\u001f\u007f]/;

export function safeReplyTo(value) {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!email || email.length > REPLY_TO_MAX || NOT_IN_ADDRESS.test(email)) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !/^[^.]+(\.[^.]+)+$/.test(domain)) return null;
  return email;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10-27T09:05:00.000Z" -> "27 October 2026, 09:05 UTC"
function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}

const given = (value) => oneLine(value) || "not given";

export function contactEmail(message) {
  const text = [
    "A message from the contact form on chernozem.app.",
    "",
    `Name: ${given(message.name)}`,
    `E-mail: ${given(message.email)}`,
    `Organisation: ${given(message.organization)}`,
    `Role: ${given(message.role)}`,
    "",
    "Message:",
    String(message.message ?? "").replace(/\r\n?/g, "\n"),
    "",
    `Received: ${when(message.receivedAt)}`,
    `Message id: ${oneLine(message.id)}`,
    "",
    "It is also kept on the server: Atlas > Settings, Messages from the website.",
  ].join("\n");
  return { subject: subjectFor(message.name), text, replyTo: safeReplyTo(message.email) };
}

// ---------- Sending ----------

// The error as a short sentence, with any password or key taken out.
function plainError(error, settings) {
  let text = String(error?.message || error || "unknown error").replace(/\s+/g, " ").trim();
  for (const secret of [settings.pass, settings.apiKey]) {
    if (secret && secret.length >= 4) text = text.split(secret).join("***");
  }
  return text.slice(0, 300);
}

// Rejects after ms with a plain sentence, whatever the promise does.
function inTime(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${Math.max(1, Math.round(ms / 1000))} seconds`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function sendWithNodemailer(settings, email) {
  const base =
    settings.transport === "gmail"
      ? { service: "gmail", auth: { user: settings.user, pass: settings.pass } }
      : { host: settings.host, port: settings.port, secure: settings.secure, ...(settings.user ? { auth: { user: settings.user, pass: settings.pass } } : {}) };
  // Never reads a file or a web address into a message (there are none:
  // this is a second lock).
  const options = { ...base, connectionTimeout: timeout(), greetingTimeout: timeout(), socketTimeout: timeout(), disableFileAccess: true, disableUrlAccess: true };
  const transporter = memory.createTransport ? memory.createTransport(options) : nodemailer.createTransport(options);
  try {
    await transporter.sendMail({ from: settings.from, to: settings.to, subject: email.subject, text: email.text, ...(email.replyTo ? { replyTo: email.replyTo } : {}) });
  } finally {
    transporter.close?.();
  }
}

async function sendWithResend(settings, email) {
  const fetchImpl = memory.fetch || globalThis.fetch;
  const res = await fetchImpl(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: settings.from, to: [settings.to], subject: email.subject, text: email.text, ...(email.replyTo ? { reply_to: email.replyTo } : {}) }),
    signal: AbortSignal.timeout(timeout()),
  });
  if (!res.ok) {
    const answer = await res.json().catch(() => null);
    throw new Error(`Resend answered ${res.status}${answer?.message ? `: ${answer.message}` : ""}`);
  }
}

export async function sendContactEmail(message, settings = mailSettings()) {
  if (settings.transport === "off") return { status: "off", transport: "off" };
  try {
    const email = contactEmail(message);
    const work = settings.transport === "resend" ? sendWithResend(settings, email) : sendWithNodemailer(settings, email);
    await inTime(work, timeout(), TRANSPORT_NAMES[settings.transport]);
    return { status: "sent", transport: settings.transport };
  } catch (error) {
    return { status: "failed", transport: settings.transport, error: plainError(error, settings) };
  }
}
