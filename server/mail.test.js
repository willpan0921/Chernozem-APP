// WHAT THIS FILE DOES
// Tests the contact e-mail (server/mail.js) on its own, with stand-ins for
// the mail services (setDepsForTests), so nothing is ever really sent:
// which way it is sent (Gmail, then SMTP, then Resend, else off) and to
// whom (chernozem.app@gmail.com unless MAIL_TO says otherwise); the
// status for the owner without any secret in it; the subject and the
// plain-text body; the strict check before a visitor's address becomes
// the Reply-To; what each service is handed; and that a refusal, an
// unreachable service or one that never answers becomes "failed" with a
// plain sentence and never the password or key; and, as the real
// nodemailer writes the e-mail (its stream transport, no network), that a
// hostile name adds no header. How messages are kept, sent and tried
// again is in messages.test.js. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/mail.js.

import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

// Every mail setting blank (a value set here wins over the project's .env).
const MAIL_SETTINGS = ["MAIL_TO", "MAIL_FROM", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "RESEND_API_KEY"];
for (const name of MAIL_SETTINGS) process.env[name] = "";
const mail = await import("./mail.js");
const { config } = await import("./env.js");

beforeEach(() => {
  for (const name of MAIL_SETTINGS) process.env[name] = "";
  mail.setDepsForTests({});
});

const MESSAGE = {
  id: "msg-1a2b3c4d",
  receivedAt: "2026-10-31T09:05:00.000Z",
  name: "Olena Kovalenko",
  email: "olena@example.org",
  organization: "Kharkiv regional office",
  role: "Government",
  message: "We would like to use the Atlas.\nCan we talk next week?",
};

// ---------- Which way, and to whom ----------

test("the first service set wins: Gmail, then SMTP, then Resend; none is off; to chernozem.app@gmail.com unless MAIL_TO", () => {
  assert.deepEqual(mail.mailSettings({}), { transport: "off", to: "chernozem.app@gmail.com" });
  assert.equal(mail.DEFAULT_MAIL_TO, "chernozem.app@gmail.com");

  const resend = mail.mailSettings({ resendApiKey: "re_test_key" });
  assert.equal(resend.transport, "resend");
  assert.equal(resend.from, "Chernozem website <onboarding@resend.dev>");
  assert.equal(mail.mailSettings({ resendApiKey: "re_test_key", mailFrom: "Chernozem <hello@chernozem.app>" }).from, "Chernozem <hello@chernozem.app>");

  const smtp = mail.mailSettings({ smtpHost: "smtp.example.org", smtpUser: "me@example.org", smtpPass: "secret", resendApiKey: "re_test_key" });
  assert.deepEqual(
    { transport: smtp.transport, host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, from: smtp.from },
    { transport: "smtp", host: "smtp.example.org", port: 587, secure: false, user: "me@example.org", from: "Chernozem website <me@example.org>" },
  );
  assert.equal(mail.mailSettings({ smtpHost: "smtp.example.org", smtpPort: 465 }).secure, true, "port 465 is TLS from the start");
  assert.equal(mail.mailSettings({ smtpHost: "smtp.example.org", smtpSecure: true }).port, 465);

  const gmail = mail.mailSettings({ gmailAppPassword: "abcdefghijklmnop", smtpHost: "smtp.example.org", resendApiKey: "re_test_key" });
  assert.deepEqual(
    { transport: gmail.transport, user: gmail.user, to: gmail.to, from: gmail.from },
    { transport: "gmail", user: "chernozem.app@gmail.com", to: "chernozem.app@gmail.com", from: "Chernozem website <chernozem.app@gmail.com>" },
    "the owner's Gmail sends to itself",
  );
  assert.equal(mail.mailSettings({ gmailAppPassword: "x", gmailUser: "other@gmail.com", mailTo: "inbox@example.org" }).user, "other@gmail.com");
  assert.equal(mail.mailSettings({ mailTo: "inbox@example.org" }).to, "inbox@example.org");
});

test("the settings are read from the environment; the app password's spaces are dropped; the status has no secret", () => {
  process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
  process.env.SMTP_PORT = "2525";
  process.env.SMTP_SECURE = "yes";
  const env = config();
  assert.equal(env.gmailAppPassword, "abcdefghijklmnop");
  assert.equal(env.smtpPort, 2525);
  assert.equal(env.smtpSecure, true);
  assert.equal(env.mailTo, null);

  assert.deepEqual(mail.mailStatus(), { configured: true, transport: "gmail", to: "chernozem.app@gmail.com" });
  assert.doesNotMatch(JSON.stringify(mail.mailStatus()), /abcd/);
  process.env.GMAIL_APP_PASSWORD = "";
  process.env.RESEND_API_KEY = "re_secret_key_123";
  assert.deepEqual(mail.mailStatus(), { configured: true, transport: "resend", to: "chernozem.app@gmail.com" });
  process.env.RESEND_API_KEY = "";
  assert.deepEqual(mail.mailStatus(), { configured: false, transport: "off", to: "chernozem.app@gmail.com" });
});

// ---------- The e-mail ----------

test("the subject: line breaks and control characters out, at most 120 characters", () => {
  assert.equal(mail.subjectFor("Olena Kovalenko"), "Chernozem: message from Olena Kovalenko");
  assert.equal(mail.subjectFor("Evil\r\nBcc: someone@example.org"), "Chernozem: message from Evil Bcc: someone@example.org");
  assert.equal(mail.subjectFor("Tab\tand\u0000null"), "Chernozem: message from Tab and null");
  assert.equal(mail.subjectFor(""), "Chernozem: message from a visitor");
  const long = mail.subjectFor("x".repeat(200));
  assert.equal(long.length, 120);
  assert.ok(long.startsWith("Chernozem: message from xxx"));
});

test("the Reply-To: the visitor's address only when it is plainly one address", () => {
  for (const good of ["olena@example.org", "o'brien@farm.example.ie", "first.last+tag@sub.example.co.uk", "  spaced@example.org  "]) {
    assert.equal(mail.safeReplyTo(good), good.trim(), good);
  }
  for (const bad of [
    "",
    "no-at-sign.example.org",
    "two@at@example.org",
    "@example.org",
    "olena@",
    "olena@localhost",
    "olena@example..org",
    "with space@example.org",
    "line\r\nbreak@example.org",
    'quote"d@example.org',
    "<angle@example.org>",
    "comma,one@example.org",
    "semi;colon@example.org",
    "paren(s)@example.org",
    "back\\slash@example.org",
    "group:a@example.org",
    `${"x".repeat(250)}@e.org`,
    42,
    null,
  ]) {
    assert.equal(mail.safeReplyTo(bad), null, JSON.stringify(bad));
  }
});

test("the body: plain text with the name, e-mail, organisation, role, the message, when and its id", () => {
  const email = mail.contactEmail(MESSAGE);
  assert.equal(email.subject, "Chernozem: message from Olena Kovalenko");
  assert.equal(email.replyTo, "olena@example.org");
  assert.equal(
    email.text,
    [
      "A message from the contact form on chernozem.app.",
      "",
      "Name: Olena Kovalenko",
      "E-mail: olena@example.org",
      "Organisation: Kharkiv regional office",
      "Role: Government",
      "",
      "Message:",
      "We would like to use the Atlas.",
      "Can we talk next week?",
      "",
      "Received: 31 October 2026, 09:05 UTC",
      "Message id: msg-1a2b3c4d",
      "",
      "It is also kept on the server: Atlas > Settings, Messages from the website.",
    ].join("\n"),
  );
  const bare = mail.contactEmail({ ...MESSAGE, organization: "", role: undefined, email: "x,y@example.org" });
  assert.ok(bare.text.includes("Organisation: not given\nRole: not given"));
  assert.equal(bare.replyTo, null);
});

// ---------- Sending, with stand-ins ----------

function fakeTransport(answer = () => ({ messageId: "test" })) {
  const calls = { options: [], emails: [], closed: 0 };
  mail.setDepsForTests({
    createTransport(options) {
      calls.options.push(options);
      return {
        async sendMail(email) {
          calls.emails.push(email);
          return answer(email);
        },
        close() {
          calls.closed += 1;
        },
      };
    },
  });
  return calls;
}

test("Gmail and SMTP go through nodemailer with the right account, the time limits and no file or web access", async () => {
  const calls = fakeTransport();
  const gmail = mail.mailSettings({ gmailAppPassword: "abcdefghijklmnop" });
  assert.deepEqual(await mail.sendContactEmail(MESSAGE, gmail), { status: "sent", transport: "gmail" });
  const [options] = calls.options;
  assert.equal(options.service, "gmail");
  assert.deepEqual(options.auth, { user: "chernozem.app@gmail.com", pass: "abcdefghijklmnop" });
  assert.equal(options.connectionTimeout, 8000);
  assert.equal(options.socketTimeout, 8000);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.deepEqual(Object.keys(calls.emails[0]).sort(), ["from", "replyTo", "subject", "text", "to"]);
  assert.equal(calls.emails[0].to, "chernozem.app@gmail.com");
  assert.equal(calls.closed, 1, "the connection is closed after each e-mail");

  const smtp = mail.mailSettings({ smtpHost: "smtp.example.org", smtpPort: 465, smtpUser: "me@example.org", smtpPass: "pw" });
  assert.equal((await mail.sendContactEmail({ ...MESSAGE, email: "not plainly@one" }, smtp)).status, "sent");
  assert.deepEqual({ host: calls.options[1].host, port: calls.options[1].port, secure: calls.options[1].secure, auth: calls.options[1].auth }, { host: "smtp.example.org", port: 465, secure: true, auth: { user: "me@example.org", pass: "pw" } });
  assert.equal(calls.emails[1].replyTo, undefined, "no Reply-To for an address that is not plainly one");
  assert.equal(calls.options.length, 2);
});

test("Resend gets one plain-text e-mail, with the key in the header and reply_to when the address is plainly one", async () => {
  const requests = [];
  mail.setDepsForTests({
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const settings = mail.mailSettings({ resendApiKey: "re_test_key" });
  assert.deepEqual(await mail.sendContactEmail(MESSAGE, settings), { status: "sent", transport: "resend" });
  const [request] = requests;
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer re_test_key");
  assert.ok(request.init.signal, "with a time limit");
  const body = JSON.parse(request.init.body);
  assert.deepEqual(Object.keys(body).sort(), ["from", "reply_to", "subject", "text", "to"]);
  assert.deepEqual(body.to, ["chernozem.app@gmail.com"]);
  assert.equal(body.from, "Chernozem website <onboarding@resend.dev>");
  assert.equal(body.reply_to, "olena@example.org");
  assert.equal(body.subject, "Chernozem: message from Olena Kovalenko");
});

test("off, refused, unreachable or silent: a status and a plain sentence, never the password or key", async () => {
  assert.deepEqual(await mail.sendContactEmail(MESSAGE, mail.mailSettings({})), { status: "off", transport: "off" });

  // Resend refuses, naming the key it was given.
  mail.setDepsForTests({ fetch: async () => new Response(JSON.stringify({ message: "API key re_test_key is invalid" }), { status: 403 }) });
  const refused = await mail.sendContactEmail(MESSAGE, mail.mailSettings({ resendApiKey: "re_test_key" }));
  assert.deepEqual(refused, { status: "failed", transport: "resend", error: "Resend answered 403: API key *** is invalid" });

  // Gmail cannot be reached.
  fakeTransport(() => {
    throw new Error("connect ECONNREFUSED 142.250.0.1:465 (as abcdefghijklmnop)");
  });
  const unreachable = await mail.sendContactEmail(MESSAGE, mail.mailSettings({ gmailAppPassword: "abcdefghijklmnop" }));
  assert.equal(unreachable.status, "failed");
  assert.equal(unreachable.error, "connect ECONNREFUSED 142.250.0.1:465 (as ***)");

  // A service that never answers is given up after the time limit (here
  // made short: the real one is 8 seconds).
  mail.setDepsForTests({ createTransport: () => ({ sendMail: () => new Promise(() => {}), close() {} }), timeoutMs: 20 });
  const silent = await mail.sendContactEmail(MESSAGE, mail.mailSettings({ smtpHost: "smtp.example.org" }));
  assert.deepEqual(silent, { status: "failed", transport: "smtp", error: "the mail server did not answer within 1 seconds" });
  assert.equal(mail.SEND_TIMEOUT_MS, 8000);
});

test("as the real nodemailer writes it (its stream transport, no network): one Subject, one Reply-To, no added header, plain text", async () => {
  const nodemailer = (await import("nodemailer")).default;
  const written = [];
  mail.setDepsForTests({
    createTransport: () => {
      const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
      return {
        async sendMail(email) {
          const info = await transport.sendMail(email);
          written.push(info.message.toString("utf8"));
          return info;
        },
        close() {},
      };
    },
  });
  const hostile = { ...MESSAGE, name: "Evil\r\nBcc: victim@example.org\r\nX-Injected: yes", email: "olena@example.org" };
  assert.equal((await mail.sendContactEmail(hostile, mail.mailSettings({ gmailAppPassword: "abcdefghijklmnop" }))).status, "sent");
  const [raw] = written;
  // (A long header goes on over lines that start with a space: one header.)
  const headers = raw.slice(0, raw.indexOf("\n\n")).replace(/\n[ \t]+/g, " ").split("\n");
  const named = (name) => headers.filter((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  assert.equal(named("Subject").length, 1);
  assert.match(named("Subject")[0], /^Subject: Chernozem: message from Evil Bcc: victim@example\.org X-Injected: yes$/);
  assert.deepEqual(named("Reply-To"), ["Reply-To: olena@example.org"]);
  assert.deepEqual(named("To"), ["To: chernozem.app@gmail.com"]);
  assert.equal(named("Bcc").length, 0, "no Bcc made from the name");
  assert.equal(named("X-Injected").length, 0);
  assert.match(raw, /Content-Type: text\/plain; charset=utf-8/);
  assert.doesNotMatch(raw, /text\/html/);
});
