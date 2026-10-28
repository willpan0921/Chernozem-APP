// WHAT THIS FILE DOES
// Tests the website's contact form and its messages (server/messages.js):
// a message is kept with only what was typed and listed newest first, the
// honeypot is ignored, each bad field is refused with a message naming it,
// a body over 16 KB is refused, one visitor may send 5 an hour (on a clock
// the test moves), a message can be removed, and POST /api/contact needs
// no access code while GET and DELETE /api/messages do. Run with
// "npm test".
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
// Not on Render (where a short code keeps the app locked), no proxy.
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
process.env.ATLAS_TRUST_PROXY = "";
const { handleApi } = await import("./app.js");
const messages = await import("./messages.js");
const auth = await import("./auth.js");

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
  messages.resetContactLimits();
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
  return { status: res.status, json, retryAfter: res.headers.get("retry-after"), allow: res.headers.get("allow"), setCookie: res.headers.get("set-cookie") };
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

test("the form is cleaned: trimmed, one line for the name and organization, the message keeps its lines", () => {
  assert.deepEqual(messages.cleanContact(good), {
    name: "Olena Kovalenko",
    email: "olena@example.org",
    organization: "Kharkiv regional office",
    message: "We would like to use the Atlas for the 2027 season.\nCan we talk next week?",
  });
  assert.equal(messages.cleanContact({ ...good, organization: undefined }).organization, "", "no organization: empty, not missing");
  assert.equal(messages.cleanContact({ ...good, organization: 42 }).organization, "", "not text: empty");
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
    message: "We would like to use the Atlas for the 2027 season.\nCan we talk next week?",
  });
  assert.deepEqual(Object.keys(saved).sort(), ["email", "id", "message", "name", "organization", "receivedAt"], "nothing about the visitor beyond what they typed");

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

test("with an access code, the form needs none but the messages do", async () => {
  process.env.ATLAS_ACCESS_CODE = "test123";
  auth.resetLoginLimits();

  const sent = await send(good);
  assert.equal(sent.status, 201, "the public form works without signing in");

  for (const [method, url] of [["GET", "/api/messages"], ["DELETE", `/api/messages/${sent.json.id}`]]) {
    const res = await call(method, url);
    assert.equal(res.status, 401, url);
    assert.equal(res.json.error.code, "auth_required", url);
  }
  assert.ok(fs.existsSync(messageFile(sent.json.id)), "not removed without the code");

  const login = await call("POST", "/api/auth/login", { body: { code: "test123" } });
  assert.equal(login.status, 200);
  const cookie = login.setCookie.split(";")[0];
  const listed = await call("GET", "/api/messages", { cookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.messages.length, 1);
  assert.equal(listed.json.messages[0].id, sent.json.id);
  assert.equal((await call("DELETE", `/api/messages/${sent.json.id}`, { cookie })).status, 200);
  assert.deepEqual((await call("GET", "/api/messages", { cookie })).json.messages, []);

  process.env.ATLAS_ACCESS_CODE = "";
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
