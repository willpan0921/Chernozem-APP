// WHAT THIS FILE DOES
// Tests the optional access code (server/auth.js): signing and checking
// the sign-in cookie, running out after 30 days, the wrong-code limit, and
// that without a code everything stays open. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/auth.js.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

// A temporary data folder and sample data; the code is switched per test.
process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-auth-"));
process.env.GEE_DISABLED = "1";
process.env.ATLAS_ACCESS_CODE = "";
const auth = await import("./auth.js");
const { handleApi } = await import("./app.js");

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
  fs.rmSync(process.env.CHERNOZEM_DATA_DIR, { recursive: true, force: true });
});

async function call(method, url, { body, cookie, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, setCookie: res.headers.get("set-cookie"), retryAfter: res.headers.get("retry-after") };
}

// "atlas_session=abc; Path=/; ..." -> "atlas_session=abc"
const cookieOf = (setCookie) => setCookie.split(";")[0];

// ---------- Pure parts ----------

test("a signed token is accepted with the same secret only", () => {
  const secret = auth.deriveSecret("open-sesame", "a".repeat(64));
  const token = auth.signSession(secret);
  assert.equal(auth.verifySession(token, secret), true);
  assert.equal(auth.verifySession(token, auth.deriveSecret("other-code", "a".repeat(64))), false, "a new code signs everyone out");
  assert.equal(auth.verifySession(token, auth.deriveSecret("open-sesame", "b".repeat(64))), false, "a new salt signs everyone out");
});

test("a changed token is refused", () => {
  const secret = auth.deriveSecret("open-sesame", "salt".repeat(10));
  const token = auth.signSession(secret);
  const [expires, nonce, sig] = token.split(".");
  assert.equal(auth.verifySession(`${Number(expires) + 1000}.${nonce}.${sig}`, secret), false, "longer expiry");
  assert.equal(auth.verifySession(`${expires}.${nonce}x.${sig}`, secret), false, "changed random part");
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert.equal(auth.verifySession(`${expires}.${nonce}.${flipped}`, secret), false, "changed signature");
  for (const junk of ["", "abc", "1.2.3", null, undefined, 42, `${token}.extra`]) {
    assert.equal(auth.verifySession(junk, secret), false, `junk: ${String(junk)}`);
  }
});

test("a token runs out after 30 days", () => {
  const secret = auth.deriveSecret("open-sesame", "salt".repeat(10));
  const now = Date.UTC(2026, 9, 1);
  const token = auth.signSession(secret, { now });
  const day = 24 * 60 * 60 * 1000;
  assert.equal(auth.verifySession(token, secret, { now: now + 29 * day }), true);
  assert.equal(auth.verifySession(token, secret, { now: now + 30 * day }), false);
  assert.equal(auth.verifySession(token, secret, { now: now + 31 * day }), false);
});

test("codes are compared exactly", () => {
  assert.equal(auth.codesMatch("test123", "test123"), true);
  assert.equal(auth.codesMatch("test12", "test123"), false);
  assert.equal(auth.codesMatch("TEST123", "test123"), false);
  assert.equal(auth.codesMatch("", "test123"), false);
});

test("the wrong-code limit allows 10 per 10 minutes per address", () => {
  const limit = auth.createLoginLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < 10; i++) {
    assert.equal(limit.check("1.2.3.4", t0 + i).blocked, false, `attempt ${i + 1}`);
    limit.fail("1.2.3.4", t0 + i);
  }
  const blocked = limit.check("1.2.3.4", t0 + 60_000);
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.retryAfterSec > 500 && blocked.retryAfterSec <= 600, `retry after ${blocked.retryAfterSec}s`);
  assert.equal(limit.check("5.6.7.8", t0 + 60_000).blocked, false, "other addresses are not affected");
  // Ten minutes after the first wrong code, one more try is allowed.
  assert.equal(limit.check("1.2.3.4", t0 + 10 * 60_000).blocked, false);
  limit.reset("1.2.3.4");
  assert.equal(limit.check("1.2.3.4", t0 + 60_000).blocked, false, "reset clears the count");
});

test("cookies are read from the Cookie header", () => {
  assert.deepEqual(auth.parseCookies("a=1; atlas_session=x.y.z; b=%20two"), { a: "1", atlas_session: "x.y.z", b: " two" });
  assert.deepEqual(auth.parseCookies(""), {});
  assert.deepEqual(auth.parseCookies(undefined), {});
});

// ---------- Through the API ----------

test("open mode: without a code everything works as before", async () => {
  process.env.ATLAS_ACCESS_CODE = "";
  const status = await call("GET", "/api/auth/status");
  assert.equal(status.status, 200);
  assert.deepEqual(status.json, { required: false, signedIn: true });
  assert.equal((await call("GET", "/api/workspace")).status, 200);
  assert.equal((await call("GET", "/api/status")).status, 200);
  const login = await call("POST", "/api/auth/login", { body: { code: "anything" } });
  assert.equal(login.status, 200);
  assert.equal(login.setCookie, null, "no cookie needed");
  assert.equal(fs.existsSync(path.join(process.env.CHERNOZEM_DATA_DIR, "auth.json")), false, "no salt made in open mode");
});

test("with a code: the API needs the cookie, the chat too", async () => {
  process.env.ATLAS_ACCESS_CODE = "test123";
  auth.resetLoginLimits();

  assert.deepEqual((await call("GET", "/api/auth/status")).json, { required: true, signedIn: false });
  for (const [method, url] of [["GET", "/api/workspace"], ["GET", "/api/status"], ["GET", "/api/runs"], ["GET", "/api/chats?product=atlas"]]) {
    const res = await call(method, url);
    assert.equal(res.status, 401, url);
    assert.equal(res.json.error.code, "auth_required", url);
  }
  const chat = await call("POST", "/api/chat", { body: { product: "atlas", message: "hi" } });
  assert.equal(chat.status, 401, "the AI stream is protected");

  const wrong = await call("POST", "/api/auth/login", { body: { code: "nope" } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.code, "wrong_code");
  assert.equal(wrong.setCookie, null);

  const ok = await call("POST", "/api/auth/login", { body: { code: " test123 " } });
  assert.equal(ok.status, 200);
  assert.match(ok.setCookie, /^atlas_session=[^;]+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
  const cookie = cookieOf(ok.setCookie);

  assert.deepEqual((await call("GET", "/api/auth/status", { cookie })).json, { required: true, signedIn: true });
  assert.equal((await call("GET", "/api/workspace", { cookie })).status, 200);
  assert.equal((await call("GET", "/api/workspace", { cookie: cookie + "x" })).status, 401, "a changed cookie is refused");
  assert.ok(fs.existsSync(path.join(process.env.CHERNOZEM_DATA_DIR, "auth.json")), "the salt is saved");

  // Behind an https proxy the cookie is marked Secure.
  const secure = await call("POST", "/api/auth/login", { body: { code: "test123" }, headers: { "X-Forwarded-Proto": "https" } });
  assert.match(secure.setCookie, /; Secure$/);

  // Logging out clears the cookie.
  const out = await call("POST", "/api/auth/logout", { cookie });
  assert.equal(out.status, 200);
  assert.match(out.setCookie, /^atlas_session=; Path=\/; Max-Age=0;/);

  // A new code signs everybody out.
  process.env.ATLAS_ACCESS_CODE = "new-code";
  assert.equal((await call("GET", "/api/workspace", { cookie })).status, 401);
  process.env.ATLAS_ACCESS_CODE = "";
  assert.equal((await call("GET", "/api/workspace")).status, 200, "back to open");
});

test("with a code: 10 wrong codes lock this address for 10 minutes", async () => {
  process.env.ATLAS_ACCESS_CODE = "test123";
  auth.resetLoginLimits();
  for (let i = 0; i < 10; i++) {
    assert.equal((await call("POST", "/api/auth/login", { body: { code: `guess-${i}` } })).status, 401, `guess ${i + 1}`);
  }
  const locked = await call("POST", "/api/auth/login", { body: { code: "test123" } });
  assert.equal(locked.status, 429, "even the right code waits");
  assert.equal(locked.json.error.code, "too_many_attempts");
  assert.ok(Number(locked.retryAfter) > 0);
  auth.resetLoginLimits();
  assert.equal((await call("POST", "/api/auth/login", { body: { code: "test123" } })).status, 200);
  process.env.ATLAS_ACCESS_CODE = "";
});
