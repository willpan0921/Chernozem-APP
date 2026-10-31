// WHAT THIS FILE DOES
// Tests the website's contact form and its messages (server/messages.js):
// a message is kept with only what was typed and listed newest first, the
// honeypot is ignored, each bad field is refused with a message naming it,
// a body over 16 KB is refused, one visitor may send 5 an hour (on a clock
// the test moves; an IPv6 visitor counted by its /48), all visitors
// together at most so many an hour and a day and so many waiting for their
// e-mail (429 busy), the counts outlive a restart, a message can be
// removed, and POST /api/contact is open to everyone while GET and DELETE
// /api/messages are the owner's alone (the owner signed in with Google).
// And the e-mail (server/mail.js, with a stand-in for the mail service):
// each message is kept first, then e-mailed, and how it went is recorded
// (sent, failed, off) while the visitor gets 201 either way; a slow mail
// service is waited for in the background, never tried twice for nothing;
// past the day's e-mails a message is held and sent later without using a
// try; the second tries send what was not sent, oldest first, 20 a run, 8
// tries each, never two runs at once, messages from before e-mails
// included; a message removed while it is being sent stays removed. Run
// with "npm test".
//
// WHO EDITS IT
// Whoever changes server/messages.js.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-messages-"));
process.env.CHERNOZEM_DATA_DIR = path.join(scratch, "data");
process.env.GEE_DISABLED = "1";
// Not on Render, no proxy.
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
process.env.ATLAS_TRUST_PROXY = "";
// No real e-mail is ever sent from a test: every mail setting is blank
// here (a value set here wins over the project's .env), and the tests
// that send hand server/mail.js a stand-in.
for (const name of ["MAIL_TO", "MAIL_FROM", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "RESEND_API_KEY"]) process.env[name] = "";
const { handleApi } = await import("./app.js");
const messages = await import("./messages.js");
const mail = await import("./mail.js");
const store = await import("./store.js");
const accounts = await import("./accounts.js");
const { setQuotasForTests } = await import("./quotas.js");
const { flushCounters, reloadCountersForTests } = await import("./counters.js");

let server;
let base;
before(async () => {
  server = http.createServer(async (req, res) => {
    if (!(await handleApi(req, res))) {
      res.statusCode = 404;
      res.end("not api");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

// Every test starts on an empty data folder, no access code, no proxy and
// no messages counted.
let n = 0;
beforeEach(() => {
  n += 1;
  process.env.CHERNOZEM_DATA_DIR = path.join(scratch, `data-${n}`);
  process.env.ATLAS_ACCESS_CODE = "";
  process.env.ATLAS_TRUST_PROXY = "";
  process.env.GMAIL_APP_PASSWORD = "";
  setQuotasForTests();
  messages.resetContactLimits();
  mail.setDepsForTests({});
});
const dataDir = () => process.env.CHERNOZEM_DATA_DIR;
const messageFile = (id) => path.join(dataDir(), "messages", `${id}.json`);

// body: an object (sent as JSON) or, as raw, the exact text to send.
async function call(method, url, { body, raw, cookie, headers = {} } = {}) {
  const text = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined;
  const res = await fetch(base + url, {
    method,
    headers: { ...(text !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: text,
  });
  const answer = await res.text();
  let json = null;
  try {
    json = JSON.parse(answer);
  } catch {
    // not JSON
  }
  return { status: res.status, json, retryAfter: res.headers.get("retry-after"), allow: res.headers.get("allow"), setCookies: res.headers.getSetCookie() };
}

const good = {
  name: "  Olena   Kovalenko ",
  email: " olena@example.org ",
  organization: "Kharkiv regional office",
  message: "We would like to use the Atlas for the 2027 season.\r\nCan we talk next week?",
};

const send = (body, options) => call("POST", "/api/contact", { body, ...options });
const list = async (options) => (await call("GET", "/api/messages", options)).json.messages;

// ---------- Pure parts ----------

test("the form is cleaned: trimmed, one line for the name, organization and role, the message keeps its lines", () => {
  assert.deepEqual(messages.cleanContact(good), {
    name: "Olena Kovalenko",
    email: "olena@example.org",
    organization: "Kharkiv regional office",
    role: "",
    message: "We would like to use the Atlas for the 2027 season.\nCan we talk next week?",
  });
  assert.equal(messages.cleanContact({ ...good, organization: undefined }).organization, "", "no organization: empty, not missing");
  assert.equal(messages.cleanContact({ ...good, organization: 42 }).organization, "", "not text: empty");
  assert.equal(messages.cleanContact({ ...good, role: "  Government\n office " }).role, "Government office");
  assert.throws(() => messages.cleanContact({ ...good, role: "x".repeat(61) }), /role.*60 characters/);
  assert.throws(() => messages.cleanContact(null), /\{ name, email, message \}/);
  assert.throws(() => messages.cleanContact([]), /\{ name, email, message \}/);
});

test("the hidden website field tells a robot", () => {
  assert.equal(messages.isHoneypotFilled(good), false);
  assert.equal(messages.isHoneypotFilled({ ...good, website: "" }), false);
  assert.equal(messages.isHoneypotFilled({ ...good, website: "   " }), false);
  assert.equal(messages.isHoneypotFilled({ ...good, website: null }), false);
  assert.equal(messages.isHoneypotFilled({ ...good, website: "https://spam.example" }), true);
  assert.equal(messages.isHoneypotFilled({ ...good, website: 0 }), true, "anything but empty text");
});

// ---------- Through the API ----------

test("a message is kept with only what was typed, and listed newest first", async () => {
  let t = Date.UTC(2026, 9, 27, 9, 0);
  messages.resetContactLimits({ clock: () => t });

  const first = await send(good);
  assert.equal(first.status, 201);
  assert.equal(first.json.ok, true);
  assert.match(first.json.id, /^msg-[0-9a-f]{8}$/);
  const saved = JSON.parse(fs.readFileSync(messageFile(first.json.id), "utf8"));
  assert.deepEqual(saved, {
    id: first.json.id,
    receivedAt: "2026-10-27T09:00:00.000Z",
    name: "Olena Kovalenko",
    email: "olena@example.org",
    organization: "Kharkiv regional office",
    role: "",
    message: "We would like to use the Atlas for the 2027 season.\nCan we talk next week?",
    // No e-mail set up in this test: kept, and said so.
    mail: { status: "off", attempts: 0, at: "2026-10-27T09:00:00.000Z" },
  });
  assert.deepEqual(Object.keys(saved).sort(), ["email", "id", "mail", "message", "name", "organization", "receivedAt", "role"], "nothing about the visitor beyond what they typed");

  t += 60_000;
  const second = await send({ name: "Sam", email: "sam@farm.example", message: "Is there a demo I can see?" });
  assert.equal(second.status, 201);
  assert.equal(JSON.parse(fs.readFileSync(messageFile(second.json.id), "utf8")).organization, "", "no organization: kept empty");

  const listed = await list();
  assert.equal(listed.length, 2);
  assert.equal(listed[0].id, second.json.id, "newest first");
  assert.equal(listed[1].id, first.json.id);
  assert.equal(listed[0].receivedAt, "2026-10-27T09:01:00.000Z");
  assert.deepEqual(listed[1], saved, "the list gives the message as it is kept");
});

test("a robot that fills the hidden website field is told thank you and kept nowhere", async () => {
  const robot = await send({ ...good, website: "https://spam.example" });
  assert.equal(robot.status, 200);
  assert.deepEqual(robot.json, { ok: true }, "no id: nothing was kept");
  // Even with the other fields wrong: the robot learns nothing.
  assert.deepEqual((await send({ website: "x" })).json, { ok: true });
  assert.deepEqual(await list(), []);
  assert.equal(fs.existsSync(path.join(dataDir(), "messages")), false, "no folder was even made");
});

test("each bad field is refused with a message naming it, and nothing is kept", async () => {
  const cases = [
    [{}, /name/],
    [{ ...good, name: "" }, /name/],
    [{ ...good, name: "   " }, /name/],
    [{ ...good, name: 42 }, /name/],
    [{ ...good, name: "x".repeat(81) }, /name.*80 characters/],
    [{ ...good, email: "" }, /email/],
    [{ ...good, email: "no-at-sign.org" }, /email/],
    [{ ...good, email: "a@b" }, /email/],
    [{ ...good, email: "a.b@c" }, /email/],
    [{ ...good, email: "a@" }, /email/],
    [{ ...good, email: "@b.c" }, /email/],
    [{ ...good, email: "two words@example.org" }, /email/],
    [{ ...good, email: `${"x".repeat(115)}@ex.org` }, /email.*120 characters/],
    [{ ...good, organization: "x".repeat(121) }, /organization.*120 characters/],
    [{ ...good, message: "" }, /message.*10 characters/],
    [{ ...good, message: "Too short" }, /message.*10 characters/],
    [{ ...good, message: "         x" }, /message.*10 characters/, "spaces around do not count"],
    [{ ...good, message: ["a long enough message"] }, /message/],
    [{ ...good, message: "x".repeat(2001) }, /message.*2,000 characters/],
  ];
  for (const [body, pattern, note] of cases) {
    const res = await send(body);
    const label = note || JSON.stringify(body).slice(0, 60);
    assert.equal(res.status, 400, label);
    assert.equal(res.json.error.code, "bad_request", label);
    assert.match(res.json.error.message, pattern, label);
  }
  const notJson = await call("POST", "/api/contact", { raw: "name=Olena" });
  assert.equal(notJson.status, 400);
  assert.equal(notJson.json.error.code, "bad_json");
  assert.deepEqual(await list(), [], "nothing was kept");

  // Right at the limits is fine.
  const edge = await send({ name: "x".repeat(80), email: `${"x".repeat(113)}@ex.org`, organization: "o".repeat(120), message: "m".repeat(2000) });
  assert.equal(edge.status, 201, edge.json?.error?.message);
  assert.equal((await send({ name: "A", email: "a@b.c", message: "0123456789" })).status, 201, "the shortest message, the shortest address");
  assert.equal((await list()).length, 2);
});

test("a body over 16 KB is refused", async () => {
  assert.equal(messages.CONTACT_MAX_BYTES, 16 * 1024);
  const big = await send({ ...good, message: "x".repeat(20_000) });
  assert.equal(big.status, 413);
  assert.equal(big.json.error.code, "too_large");
  assert.match(big.json.error.message, /16 KB/);
  assert.deepEqual(await list(), []);
});

test("one visitor may send 5 messages an hour; the 6th waits, another visitor does not", async () => {
  assert.equal(messages.CONTACT_MAX_PER_HOUR, 5);
  let t = Date.UTC(2026, 9, 27, 12, 0);
  messages.resetContactLimits({ clock: () => t });
  // Behind one proxy, so the visitors are told apart by X-Forwarded-For
  // (server/auth.js clientAddress, as for wrong access codes).
  process.env.ATLAS_TRUST_PROXY = "1";
  const from = (ip) => ({ headers: { "X-Forwarded-For": ip } });
  const olena = from("81.107.0.110");

  for (let i = 0; i < 3; i += 1) {
    t += 60_000;
    assert.equal((await send({ ...good, message: `Message number ${i + 1} of the hour.` }, olena)).status, 201, `message ${i + 1}`);
  }
  // A refused form and a robot's do not count.
  assert.equal((await send({ ...good, name: "" }, olena)).status, 400);
  assert.equal((await send({ ...good, website: "spam" }, olena)).status, 200);
  for (let i = 3; i < 5; i += 1) {
    t += 60_000;
    assert.equal((await send({ ...good, message: `Message number ${i + 1} of the hour.` }, olena)).status, 201, `message ${i + 1}`);
  }

  t += 60_000;
  const sixth = await send(good, olena);
  assert.equal(sixth.status, 429);
  assert.equal(sixth.json.error.code, "too_many");
  assert.match(sixth.json.error.message, /Try again in \d+ minutes?\./);
  // The first message was 6 minutes ago: about 54 minutes to wait.
  assert.ok(Number(sixth.retryAfter) > 50 * 60 && Number(sixth.retryAfter) <= 55 * 60, `retry after ${sixth.retryAfter}s`);
  assert.equal((await list()).length, 5, "the 6th was not kept");

  const sam = await send({ name: "Sam", email: "sam@farm.example", message: "Another visitor, same proxy." }, from("203.0.113.50"));
  assert.equal(sam.status, 201, "another visitor through the same proxy is not held back");

  // An hour after her first message, Olena may send again.
  t += 55 * 60_000;
  assert.equal((await send(good, olena)).status, 201);
  assert.equal((await list()).length, 7);
});

test("an IPv6 visitor counts by its /48: another address in the same block is the same visitor", async () => {
  process.env.ATLAS_TRUST_PROXY = "1";
  const from = (ip) => ({ headers: { "X-Forwarded-For": ip } });
  for (let i = 0; i < 5; i += 1) assert.equal((await send(good, from(`2001:db8:abcd:${i}::1`))).status, 201, `message ${i + 1}, another /64 each time`);
  const sixth = await send(good, from("2001:db8:abcd:ffff:1:2:3:4"));
  assert.equal(sixth.status, 429, "the same /48");
  assert.equal(sixth.json.error.code, "too_many");
  assert.equal((await send(good, from("2001:db8:abce::1"))).status, 201, "another /48 is another visitor");
});

test("all visitors together: so many messages an hour and in 24 hours, then 429 busy with the address to write to", async () => {
  let t = Date.UTC(2026, 9, 31, 8, 0);
  messages.resetContactLimits({ clock: () => t });
  setQuotasForTests({ contactPerHourAll: 3, contactPerDayAll: 5 });
  process.env.ATLAS_TRUST_PROXY = "1";
  const from = (i) => ({ headers: { "X-Forwarded-For": `198.51.100.${i}` } });
  for (let i = 1; i <= 3; i += 1) assert.equal((await send(good, from(i))).status, 201, `visitor ${i}`);
  const busy = await send(good, from(4));
  assert.equal(busy.status, 429);
  assert.deepEqual(busy.json, { error: { code: "busy", message: "The form is busy right now. Please write to chernozem.app@gmail.com." } });
  assert.equal(messages.BUSY_MESSAGE, busy.json.error.message);
  assert.ok(Number(busy.retryAfter) > 59 * 60 && Number(busy.retryAfter) <= 3600, `retry after ${busy.retryAfter}s: when the hour's first message leaves it`);
  assert.equal((await list()).length, 3, "the busy one was not kept");
  // A form with a mistake still gets its own sentence.
  assert.equal((await send({ ...good, name: "" }, from(5))).status, 400);

  // An hour later: two more, then the 24 hours are full.
  t += 61 * 60_000;
  assert.equal((await send(good, from(6))).status, 201);
  assert.equal((await send(good, from(7))).status, 201);
  const day = await send(good, from(8));
  assert.equal(day.status, 429);
  assert.equal(day.json.error.code, "busy");
  assert.ok(Number(day.retryAfter) > 22 * 3600, `retry after ${day.retryAfter}s: 24 hours after the day's first`);
  assert.equal(messages.CONTACT_MAX_PER_HOUR, 5);
});

test("at most so many messages wait for their e-mail at once; past it the form is busy", async () => {
  setQuotasForTests({ contactUnsentMax: 3 });
  messages.resetContactLimits();
  process.env.ATLAS_TRUST_PROXY = "1";
  const from = (i) => ({ headers: { "X-Forwarded-For": `198.51.100.${i}` } });
  // No e-mail set up: every message waits.
  for (let i = 1; i <= 3; i += 1) assert.equal((await send(good, from(i))).status, 201);
  const full = await send(good, from(4));
  assert.equal(full.status, 429);
  assert.equal(full.json.error.code, "busy");
  // The owner removes one: there is room again.
  const [oldest] = (await list()).slice(-1);
  assert.equal((await call("DELETE", `/api/messages/${oldest.id}`)).status, 200);
  assert.equal((await send(good, from(5))).status, 201);
});

test("the counts outlive a restart: they are kept in quota-state.json in the data folder", async () => {
  process.env.ATLAS_TRUST_PROXY = "1";
  const olena = { headers: { "X-Forwarded-For": "81.107.0.110" } };
  for (let i = 0; i < 5; i += 1) assert.equal((await send(good, olena)).status, 201);
  assert.equal((await send(good, olena)).status, 429);
  await flushCounters();
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir(), "quota-state.json"), "utf8"));
  assert.equal(Object.values(saved.counts["contact-visitor"]).flat().length, 5, "five messages counted for the visitor");
  assert.doesNotMatch(JSON.stringify(saved), /olena|Kovalenko/i, "no name or e-mail address in it");
  // As after a restart: memory forgotten, the file read again.
  reloadCountersForTests();
  assert.equal((await send(good, olena)).status, 429, "still five this hour");
});

test("a message can be removed", async () => {
  const made = await send(good);
  const id = made.json.id;
  assert.ok(fs.existsSync(messageFile(id)));

  const removed = await call("DELETE", `/api/messages/${id}`);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.json, { ok: true });
  assert.equal(fs.existsSync(messageFile(id)), false);
  assert.deepEqual(await list(), []);

  const again = await call("DELETE", `/api/messages/${id}`);
  assert.equal(again.status, 404);
  assert.equal(again.json.error.code, "not_found");
  assert.equal((await call("DELETE", "/api/messages/Not%20An%20Id")).status, 404, "an id that could not be a file name");
});

test("with visitors seeing the demo, the form is open to everyone but the messages are the owner's alone", async () => {
  process.env.ATLAS_ACCESS_CODE = "any-value";
  // The owner's Google account, as Firebase would vouch for it.
  accounts.setDepsForTests({
    verifyIdToken: (idToken) => {
      if (idToken === "owner") return { uid: "MsgOwnerUID1", email: "chernozem.app@gmail.com", email_verified: true };
      throw Object.assign(new Error("bad"), { code: "auth/argument-error" });
    },
    getUser: (uid) => ({ uid, disabled: false, email: "chernozem.app@gmail.com", emailVerified: true }),
    revokeRefreshTokens: () => {},
  });

  const sent = await send(good);
  assert.equal(sent.status, 201, "the public form works without signing in");

  // The demo (no cookie), and the demo header even with the owner's cookie
  // left out: 403 owner_only.
  for (const headers of [{}, { "X-Chernozem-View": "demo" }]) {
    for (const [method, url] of [["GET", "/api/messages"], ["DELETE", `/api/messages/${sent.json.id}`]]) {
      const res = await call(method, url, { headers });
      assert.equal(res.status, 403, url);
      assert.equal(res.json.error.code, "owner_only", url);
    }
  }
  assert.ok(fs.existsSync(messageFile(sent.json.id)), "not removed by the demo");
  // The retired access code opens nothing.
  const retired = await call("POST", "/api/auth/login", { body: { code: "any-value" } });
  assert.equal(retired.status, 410);
  assert.equal(retired.json.error.code, "owner_key_retired");

  const login = await call("POST", "/api/auth/firebase", { body: { idToken: "owner" } });
  assert.equal(login.status, 200);
  const cookie = login.setCookies.find((line) => line.startsWith("chernozem_owner=")).split(";")[0];
  const listed = await call("GET", "/api/messages", { cookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.messages.length, 1);
  assert.equal(listed.json.messages[0].id, sent.json.id);
  assert.equal((await call("DELETE", `/api/messages/${sent.json.id}`, { cookie })).status, 200);
  assert.deepEqual((await call("GET", "/api/messages", { cookie })).json.messages, []);

  process.env.ATLAS_ACCESS_CODE = "";
  accounts.setDepsForTests({});
});

test("the wrong method or path is refused", async () => {
  const get = await call("GET", "/api/contact");
  assert.equal(get.status, 405);
  assert.equal(get.allow, "POST");
  const post = await call("POST", "/api/messages", { body: good });
  assert.equal(post.status, 405);
  assert.equal(post.allow, "GET");
  assert.equal((await call("GET", "/api/messages/msg-12345678")).status, 405);
  assert.equal((await call("POST", "/api/contact/extra", { body: good })).status, 404);
  assert.equal((await call("DELETE", "/api/messages/msg-12345678/more")).status, 404);
  assert.deepEqual(await list(), []);
});

// ---------- The e-mail (server/mail.js, with a stand-in for the mail service) ----------

// A stand-in for nodemailer's createTransport that records every e-mail;
// answer(email) decides how it goes: a value (sent), a throw (failed), or
// a promise that waits.
function fakeMailer(answer = () => ({ messageId: "test" })) {
  const sent = [];
  const transports = [];
  mail.setDepsForTests({
    createTransport(options) {
      transports.push(options);
      return {
        async sendMail(email) {
          sent.push(email);
          return answer(email);
        },
        close() {},
      };
    },
  });
  return { sent, transports };
}

// The owner's Gmail with an app password, as Google shows it (with spaces).
const useGmail = () => {
  process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
};

// Quiet: a failed e-mail is said in the server's log.
async function quietly(work) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await work();
  } finally {
    console.warn = warn;
  }
}

const until = async (check) => {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(check(), "waited too long");
};

const readKept = (id) => JSON.parse(fs.readFileSync(messageFile(id), "utf8"));

test("a message is kept first, then e-mailed to chernozem.app@gmail.com, and how it went is recorded; the visitor gets 201 either way", async () => {
  const t = Date.UTC(2026, 9, 31, 10, 0);
  messages.resetContactLimits({ clock: () => t });
  useGmail();

  const { sent, transports } = fakeMailer();
  const ok = await send({ ...good, role: "Government" });
  assert.equal(ok.status, 201);
  assert.equal(sent.length, 1, "e-mailed once");
  assert.equal(sent[0].to, "chernozem.app@gmail.com");
  assert.equal(sent[0].from, "Chernozem website <chernozem.app@gmail.com>");
  assert.equal(sent[0].subject, "Chernozem: message from Olena Kovalenko");
  assert.equal(sent[0].replyTo, "olena@example.org");
  assert.equal(sent[0].html, undefined, "plain text only");
  for (const line of ["Name: Olena Kovalenko", "E-mail: olena@example.org", "Organisation: Kharkiv regional office", "Role: Government", "Received: 31 October 2026, 10:00 UTC", `Message id: ${ok.json.id}`]) {
    assert.ok(sent[0].text.includes(line), line);
  }
  assert.ok(sent[0].text.includes("We would like to use the Atlas for the 2027 season.\nCan we talk next week?"), "the message with its lines");
  assert.equal(transports[0].service, "gmail");
  assert.deepEqual(transports[0].auth, { user: "chernozem.app@gmail.com", pass: "abcdefghijklmnop" }, "the spaces Google shows are not part of the password");
  assert.deepEqual(readKept(ok.json.id).mail, { status: "sent", attempts: 1, at: "2026-10-31T10:00:00.000Z", transport: "gmail" });

  // The mail service refuses: still 201, kept, recorded as failed, and the
  // password never written down.
  const refused = fakeMailer(() => {
    throw new Error("Invalid login: 535-5.7.8 Username and Password not accepted (abcdefghijklmnop)");
  });
  const failed = await quietly(() => send({ ...good, name: "Sam" }));
  assert.equal(failed.status, 201, "the message is safe on the server");
  assert.equal(refused.sent.length, 1);
  const kept = readKept(failed.json.id);
  assert.equal(kept.mail.status, "failed");
  assert.equal(kept.mail.attempts, 1);
  assert.equal(kept.mail.transport, "gmail");
  assert.match(kept.mail.error, /^Invalid login: 535-5.7.8 Username and Password not accepted \(\*\*\*\)$/);
  assert.doesNotMatch(fs.readFileSync(messageFile(failed.json.id), "utf8"), /abcdefghijklmnop/);

  // A mail service that stays silent until its own time limit: the
  // visitor is answered first; the failure is recorded when it comes.
  messages.resetContactLimits({ clock: () => t, answerWaitMs: 20 });
  mail.setDepsForTests({
    createTransport: (options) => ({
      sendMail: () => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("Greeting never received"), { code: "ETIMEDOUT" })), options.greetingTimeout)),
      close() {},
    }),
    timeoutMs: 80,
  });
  const slow = await quietly(async () => {
    const answer = await send({ ...good, name: "Slow" });
    assert.equal(readKept(answer.json.id).mail.status, "pending", "answered before the e-mail ended");
    await until(() => readKept(answer.json.id).mail.status !== "pending");
    return answer;
  });
  assert.equal(slow.status, 201);
  assert.equal(readKept(slow.json.id).mail.status, "failed");
  assert.match(readKept(slow.json.id).mail.error, /^Gmail did not answer in time \(Greeting never received\)$/);
  messages.resetContactLimits({ clock: () => t });

  // A robot is e-mailed to nobody.
  const robot = fakeMailer();
  assert.equal((await send({ ...good, website: "https://spam.example" })).status, 200);
  assert.equal(robot.sent.length, 0);

  // The owner's list shows how each one went, newest first.
  const listed = await list();
  assert.deepEqual(listed.map((message) => message.mail.status).sort(), ["failed", "failed", "sent"]);
});

test("a mail service that takes its time is waited for in the background: one copy, recorded sent, never tried again", async () => {
  let t = Date.UTC(2026, 9, 31, 10, 0);
  messages.resetContactLimits({ clock: () => t, answerWaitMs: 30 });
  useGmail();
  // Delivers after 300 ms, longer than the visitor waits and longer than
  // the transport limits handed to it (QA's reproduction of M1).
  const { sent } = fakeMailer(() => new Promise((resolve) => setTimeout(() => resolve({ messageId: "late" }), 300)));
  mail.setDepsForTests({
    createTransport: () => ({
      async sendMail(email) {
        sent.push(email);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { messageId: "late" };
      },
      close() {},
    }),
    timeoutMs: 100,
  });
  const answered = await send(good);
  assert.equal(answered.status, 201, "the visitor is not kept waiting");
  assert.equal(readKept(answered.json.id).mail.status, "pending");
  assert.equal(await messages.deliverMessage(answered.json.id), null, "the same message is never sent twice at once");
  await until(() => readKept(answered.json.id).mail.status === "sent");
  assert.equal(readKept(answered.json.id).mail.attempts, 1);
  for (let run = 0; run < 3; run += 1) {
    t += 10 * 60_000;
    assert.deepEqual(await messages.retryUnsentMessages(), { tried: 0, sent: 0 });
  }
  assert.equal(sent.length, 1, "one copy");
  assert.equal(sent[0].messageId, `<${answered.json.id}@chernozem.app>`);
});

test("past the day's e-mails a message is held, untried, and e-mailed once the 24 hours allow", async () => {
  let t = Date.UTC(2026, 9, 31, 9, 0);
  messages.resetContactLimits({ clock: () => t });
  setQuotasForTests({ contactMailsPerDay: 2 });
  useGmail();
  const { sent } = fakeMailer();
  process.env.ATLAS_TRUST_PROXY = "1";
  const ids = [];
  for (let i = 1; i <= 3; i += 1) {
    t += 60_000;
    const answer = await send(good, { headers: { "X-Forwarded-For": `198.51.100.${i}` } });
    assert.equal(answer.status, 201);
    ids.push(answer.json.id);
  }
  assert.equal(sent.length, 2);
  assert.deepEqual(readKept(ids[2]).mail, { status: "held", attempts: 0, at: new Date(t).toISOString() }, "held, no try used");
  t += 10 * 60_000;
  assert.deepEqual(await messages.retryUnsentMessages(), { tried: 0, sent: 0 }, "still the same 24 hours");
  assert.equal(readKept(ids[2]).mail.status, "held");
  // 24 hours after the first e-mail, one more may go.
  t += 24 * 60 * 60_000;
  assert.deepEqual(await messages.retryUnsentMessages(), { tried: 1, sent: 1 });
  assert.deepEqual(readKept(ids[2]).mail, { status: "sent", attempts: 1, at: new Date(t).toISOString(), transport: "gmail" });
  assert.equal(sent.length, 3);
});

test("an address that is not plainly one is never a Reply-To (it stays in the e-mail's text)", async () => {
  useGmail();
  const { sent } = fakeMailer();
  // Passes the form's own check, but has a quote and a comma in it.
  assert.equal((await send({ ...good, email: 'x"y,z@example.org' })).status, 201);
  assert.equal(sent[0].replyTo, undefined);
  assert.ok(sent[0].text.includes('E-mail: x"y,z@example.org'));
});

test("the second tries send what was not sent, oldest first, at most 20 a run and 8 tries each; messages from before e-mails count as pending; nothing without an e-mail set up", async () => {
  const t = Date.UTC(2026, 9, 31, 12, 0);
  messages.resetContactLimits({ clock: () => t });
  const minutesAgo = (minutes) => new Date(t - minutes * 60_000).toISOString();
  const base = { name: "Visitor", email: "visitor@example.org", organization: "", role: "", message: "A message long enough." };
  // 22 messages from before e-mails existed (no mail at all), the oldest first.
  for (let i = 0; i < 22; i += 1) await store.saveMessage({ ...base, id: `msg-old${String(i).padStart(5, "0")}`, receivedAt: minutesAgo(1000 - i) });
  await store.saveMessage({ ...base, id: "msg-off00001", receivedAt: minutesAgo(30), mail: { status: "off", attempts: 0, at: minutesAgo(30) } });
  await store.saveMessage({ ...base, id: "msg-fail0002", receivedAt: minutesAgo(29), mail: { status: "failed", attempts: 2, at: minutesAgo(20), transport: "gmail", error: "x" } });
  await store.saveMessage({ ...base, id: "msg-fail0008", receivedAt: minutesAgo(28), mail: { status: "failed", attempts: 8, at: minutesAgo(20), transport: "gmail", error: "x" } });
  await store.saveMessage({ ...base, id: "msg-sent0001", receivedAt: minutesAgo(27), mail: { status: "sent", attempts: 1, at: minutesAgo(27), transport: "gmail" } });
  await store.saveMessage({ ...base, id: "msg-justnow1", receivedAt: minutesAgo(0.2), mail: { status: "pending", attempts: 0 } });

  // The owner sees the old ones as pending.
  assert.deepEqual((await list()).find((message) => message.id === "msg-old00000").mail, { status: "pending", attempts: 0 });

  // No e-mail set up: nothing is tried, nothing changes.
  const none = fakeMailer();
  assert.deepEqual(await messages.retryUnsentMessages(), { tried: 0, sent: 0 });
  assert.equal(none.sent.length, 0);
  assert.equal(readKept("msg-old00000").mail, undefined);

  useGmail();
  const { sent } = fakeMailer();
  // Two runs asked for at once are one run.
  const first = messages.retryUnsentMessages();
  assert.equal(messages.retryUnsentMessages(), first, "never two runs at once");
  assert.deepEqual(await first, { tried: 20, sent: 20 });
  const ids = sent.map((email) => /Message id: (\S+)/.exec(email.text)[1]);
  assert.deepEqual(ids, Array.from({ length: 20 }, (_, i) => `msg-old${String(i).padStart(5, "0")}`), "oldest first, 20 a run");

  const second = await messages.retryUnsentMessages();
  assert.deepEqual(second, { tried: 4, sent: 4 });
  assert.deepEqual(sent.slice(20).map((email) => /Message id: (\S+)/.exec(email.text)[1]), ["msg-old00020", "msg-old00021", "msg-off00001", "msg-fail0002"]);
  assert.deepEqual(readKept("msg-fail0002").mail, { status: "sent", attempts: 3, at: "2026-10-31T12:00:00.000Z", transport: "gmail" });
  assert.equal(readKept("msg-fail0008").mail.status, "failed", "8 tries: left as it is, still on the server");
  assert.equal(readKept("msg-justnow1").mail.status, "pending", "came less than 3 minutes ago (maybe another server is sending it): later");
  assert.deepEqual(await messages.retryUnsentMessages(), { tried: 0, sent: 0 }, "all done");
  assert.equal(sent.length, 24, "nothing was e-mailed twice");
});

test("a message removed while its e-mail is on its way stays removed", async () => {
  useGmail();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { sent } = fakeMailer(() => gate);
  await store.saveMessage({ id: "msg-remove01", receivedAt: new Date().toISOString(), name: "A", email: "a@b.c", organization: "", role: "", message: "Remove me while I am sent." });
  const sending = messages.deliverMessage("msg-remove01");
  await until(() => sent.length === 1);
  assert.equal(await messages.deliverMessage("msg-remove01"), null, "the same message is never sent twice at once");
  assert.equal((await call("DELETE", "/api/messages/msg-remove01")).status, 200);
  release();
  assert.equal(await sending, null);
  assert.equal(fs.existsSync(messageFile("msg-remove01")), false, "not written back");
});

test("startMailRetry tries the waiting messages a moment after the start, then on a timer", async () => {
  useGmail();
  const { sent } = fakeMailer();
  await store.saveMessage({ id: "msg-waiting1", receivedAt: new Date(Date.now() - 5 * 60_000).toISOString(), name: "A", email: "a@b.c", organization: "", role: "", message: "Waiting for the e-mail." });
  const log = console.log;
  console.log = () => {};
  try {
    messages.startMailRetry({ firstAfterMs: 10, everyMs: 60_000 });
    await until(() => readKept("msg-waiting1").mail?.status === "sent");
  } finally {
    messages.stopMailRetry();
    console.log = log;
  }
  assert.equal(sent.length, 1);
});
