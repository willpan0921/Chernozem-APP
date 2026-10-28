// WHAT THIS FILE DOES
// Tests the optional access code (server/auth.js): signing and checking
// the sign-in cookie, running out after 30 days, the wrong-code limit (and
// which visitor it counts behind a proxy such as Render's), "shared" in the
// status, that without a code everything stays open, and that a change
// asked for by another website is refused (403 cross_site) while scripts
// and our own pages go through. Also a registered account's cookie: signed
// and checked the same way, named in the status, working with a code set,
// and cleared by Sign out together with the code's. Run with "npm test".
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
// Not on Render (where a short code keeps the app locked).
process.env.RENDER = "";
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
  return { status: res.status, json, setCookie: res.headers.get("set-cookie"), setCookies: res.headers.getSetCookie(), retryAfter: res.headers.get("retry-after") };
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

test("the wrong-code limit remembers at most maxKeys visitors, the least recent forgotten first", () => {
  const limit = auth.createLoginLimiter({ max: 1, maxKeys: 3 });
  const t0 = 5_000_000;
  for (const [i, key] of ["a", "b", "c"].entries()) limit.fail(key, t0 + i);
  assert.equal(limit.size(), 3);
  // "a" fails again: now the most recent, so "b" is the one forgotten.
  limit.fail("a", t0 + 3);
  limit.fail("d", t0 + 4);
  assert.equal(limit.size(), 3);
  assert.equal(limit.check("a", t0 + 5).blocked, true);
  assert.equal(limit.check("b", t0 + 5).blocked, false, "forgotten");
  assert.equal(limit.check("c", t0 + 5).blocked, true);
  assert.equal(limit.check("d", t0 + 5).blocked, true);
  assert.equal(auth.MAX_LIMITER_KEYS, 50_000);
});

test("visitors whose wrong codes ran out are swept away at most once a minute", () => {
  const limit = auth.createLoginLimiter({ windowMs: 1000, sweepEveryMs: 60_000 });
  const t0 = 9_000_000;
  for (let i = 0; i < 100; i += 1) limit.fail(`old-${i}`, t0);
  assert.equal(limit.size(), 100);
  // Their wrong codes have run out, but the last sweep was just now.
  limit.fail("new-1", t0 + 5000);
  assert.equal(limit.size(), 101, "no sweep within the minute");
  limit.fail("new-2", t0 + 61_000);
  assert.equal(limit.size(), 1, "swept: only the visitor of this wrong code is left");
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
  assert.deepEqual(status.json, { required: false, signedIn: true, shared: false, account: null });
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

  assert.deepEqual((await call("GET", "/api/auth/status")).json, { required: true, signedIn: false, shared: true, account: null });
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
  // (The second Set-Cookie line removes any account cookie: the latest
  // sign-in wins.)
  assert.match(ok.setCookie, /^atlas_session=[^;]+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax(, chernozem_account=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax)?$/);
  const cookie = cookieOf(ok.setCookie);

  assert.deepEqual((await call("GET", "/api/auth/status", { cookie })).json, { required: true, signedIn: true, shared: true, account: null });
  assert.equal(ok.json.shared, true, "the sign-in answer says so too");
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

// ---------- The visitor behind a proxy (Render) ----------

// Render puts Cloudflare (172.64.0.0/13 and others) and then its own load
// balancer (a 10.x address) after the visitor, and keeps whatever the
// visitor sent itself on the left.
test("X-Forwarded-For: the visitor is the entry before Cloudflare's, never one the visitor typed", () => {
  const visitor = auth.visitorFromForwarded;
  assert.equal(visitor("81.107.0.110, 172.71.10.20, 10.201.3.4"), "81.107.0.110", "Render");
  assert.equal(visitor("192.0.2.44,81.107.0.110, 172.71.10.20, 10.201.3.4"), "81.107.0.110", "Render, with a made-up entry on the left");
  assert.equal(visitor("1.1.1.1, 172.64.0.1, 81.107.0.110, 172.71.10.20, 10.201.3.4"), "81.107.0.110", "made-up Cloudflare entries on the left do not help");
  // Only the one Cloudflare address next to Render's own is passed over: a
  // request that came through Cloudflare before (a Worker; chernozem.app's
  // DNS is at GoDaddy, so never a second Cloudflare of its own) counts as
  // that Cloudflare address, never as what its sender typed.
  assert.equal(visitor("81.107.0.110, 162.158.1.1, 172.71.10.20, 10.0.0.9, 10.201.3.4"), "162.158.1.1", "two Cloudflare hops, two internal hops");
  assert.equal(visitor("203.0.113.77, 2a06:98c0:3600::103, 172.71.10.5, 10.214.0.9"), "2a06:98c0:3600::103", "a Cloudflare Worker");
  assert.equal(visitor("2a02:1210:2c4b:8f00:1d2c:3b4a:5968:7a8b, 172.71.10.20, 10.201.3.4"), "2a02:1210:2c4b:8f00:1d2c:3b4a:5968:7a8b", "an IPv6 visitor");
  assert.equal(visitor("203.0.113.9, 2606:4700:10::ac43:1"), "203.0.113.9", "Cloudflare (IPv6) in front of one proxy");
  // One proxy (nginx, Caddy, a tunnel): the address it saw, written last.
  assert.equal(visitor("203.0.113.9"), "203.0.113.9");
  assert.equal(visitor("6.6.6.6, 203.0.113.9"), "203.0.113.9", "a made-up entry on the left");
  assert.equal(visitor("6.6.6.6, 192.168.1.5"), "192.168.1.5", "a visitor on the same network as the proxy");
  assert.equal(visitor("10.0.0.7"), "10.0.0.7");
  // Odd forms and junk.
  assert.equal(visitor("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(visitor("203.0.113.9:5678"), "203.0.113.9");
  assert.equal(visitor("unknown, 81.107.0.110, 172.71.10.20"), "81.107.0.110");
  assert.equal(visitor(""), null);
  assert.equal(visitor("unknown"), null);
  assert.equal(visitor(undefined), null);
  // Known to be behind Cloudflare, but no Cloudflare address recognised (a
  // range added since the list was made): the last address that is not
  // private, not Render's load balancer for every visitor.
  assert.equal(visitor("198.51.100.20, 10.214.0.9", { behindCloudflare: true }), "198.51.100.20");
  assert.equal(visitor("6.6.6.6, 198.51.100.20, 10.214.0.9", { behindCloudflare: true }), "198.51.100.20");
  assert.equal(visitor("10.214.0.9", { behindCloudflare: true }), "10.214.0.9");
  assert.equal(visitor("81.107.0.110, 172.71.10.20, 10.201.3.4", { behindCloudflare: true }), "81.107.0.110");
  // ...while one proxy keeps the address it saw (a visitor on its network).
  assert.equal(visitor("198.51.100.20, 10.214.0.9"), "10.214.0.9");
});

test("where the visitor's address is read: Cloudflare on Render, one proxy, or none", () => {
  const mode = auth.proxyMode;
  assert.equal(mode({}), "socket");
  assert.equal(mode({ ATLAS_TRUST_PROXY: "0" }), "socket");
  assert.equal(mode({ ATLAS_TRUST_PROXY: "1" }), "forwarded");
  assert.equal(mode({ ATLAS_TRUST_PROXY: "yes" }), "forwarded");
  assert.equal(mode({ ATLAS_TRUST_PROXY: "Cloudflare" }), "cloudflare");
  // Every request to a Render web service comes through Cloudflare.
  assert.equal(mode({ RENDER: "true" }), "cloudflare");
  assert.equal(mode({ RENDER: "true", ATLAS_TRUST_PROXY: "1" }), "cloudflare");
  assert.equal(mode({ RENDER: "true", ATLAS_TRUST_PROXY: "off" }), "socket", "switched off on purpose");
  assert.equal(mode({ RENDER: "false", ATLAS_TRUST_PROXY: "1" }), "forwarded");
});

test("behind Cloudflare: CF-Connecting-IP names the visitor, X-Forwarded-For only without it", () => {
  const before = { trust: process.env.ATLAS_TRUST_PROXY, render: process.env.RENDER };
  const req = (headers) => ({ socket: { remoteAddress: "::ffff:10.201.3.4" }, headers });
  try {
    process.env.RENDER = "";
    process.env.ATLAS_TRUST_PROXY = "cloudflare";
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "81.107.0.110", "x-forwarded-for": "6.6.6.6, 81.107.0.110, 172.71.10.20, 10.201.3.4" })), "81.107.0.110");
    // Typed entries in X-Forwarded-For change nothing.
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "81.107.0.110", "x-forwarded-for": "6.6.6.6, 7.7.7.7, 81.107.0.110, 172.71.10.20, 10.201.3.4" })), "81.107.0.110");
    // A Cloudflare Worker: Cloudflare gives every Worker's request the same address.
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "2a06:98c0:3600::103", "x-forwarded-for": "203.0.113.77, 2a06:98c0:3600::103, 172.71.10.5, 10.214.0.9" })), "2a06:98c0:3600:0::/64");
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "2a02:1210:2c4b:8f00::1" })), "2a02:1210:2c4b:8f00::/64", "an IPv6 visitor, by its /64");
    // Without the header (said once in the log): X-Forwarded-For.
    assert.equal(auth.clientAddress(req({ "x-forwarded-for": "203.0.113.77, 2a06:98c0:3600::103, 172.71.10.5, 10.214.0.9" })), "2a06:98c0:3600:0::/64");
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "junk", "x-forwarded-for": "198.51.100.20, 10.214.0.9" })), "198.51.100.20");
    assert.equal(auth.clientAddress(req({})), "10.201.3.4", "nothing at all: the address that connected");
    // On Render the same happens with ATLAS_TRUST_PROXY=1 or none.
    process.env.RENDER = "true";
    for (const value of ["1", ""]) {
      process.env.ATLAS_TRUST_PROXY = value;
      assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "81.107.0.110", "x-forwarded-for": "6.6.6.6, 81.107.0.110, 172.71.10.20, 10.201.3.4" })), "81.107.0.110", JSON.stringify(value));
    }
    // Behind one proxy that is not Cloudflare a typed CF-Connecting-IP is
    // just text the visitor sent: never read.
    process.env.RENDER = "";
    process.env.ATLAS_TRUST_PROXY = "1";
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
    process.env.ATLAS_TRUST_PROXY = "";
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "1.2.3.4" })), "10.201.3.4");
  } finally {
    process.env.ATLAS_TRUST_PROXY = before.trust ?? "";
    process.env.RENDER = before.render ?? "";
  }
});

test("addresses are made plain, and IPv6 counts by its /64 network", () => {
  assert.equal(auth.normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(auth.normalizeIp(" 2001:DB8::1 "), "2001:db8::1");
  assert.equal(auth.normalizeIp("fe80::1%eth0"), "fe80::1");
  assert.equal(auth.normalizeIp("not an address"), null);
  assert.equal(auth.limitKey("203.0.113.9"), "203.0.113.9");
  assert.equal(auth.limitKey("2a02:1210:2c4b:8f00:1d2c:3b4a:5968:7a8b"), "2a02:1210:2c4b:8f00::/64");
  assert.equal(auth.limitKey("2a02:1210:2c4b:8f00::1"), "2a02:1210:2c4b:8f00::/64", "same line, another address: the same count");
  assert.equal(auth.limitKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(auth.limitKey("::1"), "0:0:0:0::/64");
  assert.equal(auth.limitKey("64:ff9b::192.0.2.1"), "64:ff9b:0:0::/64");
  assert.equal(auth.limitKey(null), "unknown");
});

test("clientAddress reads X-Forwarded-For only with ATLAS_TRUST_PROXY", () => {
  const req = { socket: { remoteAddress: "::ffff:10.201.3.4" }, headers: { "x-forwarded-for": "6.6.6.6, 81.107.0.110, 172.71.10.20, 10.201.3.4" } };
  const before = process.env.ATLAS_TRUST_PROXY;
  try {
    process.env.ATLAS_TRUST_PROXY = "";
    assert.equal(auth.clientAddress(req), "10.201.3.4", "off: the address that connected");
    process.env.ATLAS_TRUST_PROXY = "1";
    assert.equal(auth.clientAddress(req), "81.107.0.110");
    assert.equal(auth.clientAddress({ socket: { remoteAddress: "127.0.0.1" }, headers: {} }), "127.0.0.1", "no header: the address that connected");
    assert.equal(auth.clientAddress({ headers: {} }), "unknown");
  } finally {
    process.env.ATLAS_TRUST_PROXY = before ?? "";
  }
});

test("behind Render: one visitor's wrong codes lock only that visitor, whatever it sends", async () => {
  process.env.ATLAS_ACCESS_CODE = "test123";
  process.env.ATLAS_TRUST_PROXY = "1";
  auth.resetLoginLimits();
  try {
    const via = (visitor, typed = "") => ({ "X-Forwarded-For": `${typed ? `${typed}, ` : ""}${visitor}, 172.71.10.20, 10.201.3.4`, "X-Forwarded-Proto": "https" });
    for (let i = 0; i < 10; i += 1) {
      // A new made-up address every time does not reset the count.
      const res = await call("POST", "/api/auth/login", { body: { code: `guess-${i}` }, headers: via("81.107.0.110", `198.51.100.${i}`) });
      assert.equal(res.status, 401);
    }
    assert.equal((await call("POST", "/api/auth/login", { body: { code: "test123" }, headers: via("81.107.0.110", "198.51.100.200") })).status, 429);
    const other = await call("POST", "/api/auth/login", { body: { code: "test123" }, headers: via("203.0.113.50") });
    assert.equal(other.status, 200, "another visitor through the same load balancer is not locked out");
    assert.match(other.setCookie, /; Secure$/);
  } finally {
    process.env.ATLAS_TRUST_PROXY = "";
    process.env.ATLAS_ACCESS_CODE = "";
    auth.resetLoginLimits();
  }
});

// ---------- Online (on Render): a code that really locks ----------

test("online a code must be at least 16 characters and not the docs' example", () => {
  const problem = auth.accessCodeProblem;
  assert.equal(problem(null), "missing");
  assert.equal(problem(""), "missing");
  assert.equal(problem("x"), "short");
  assert.equal(problem("fifteen-chars!!"), "short");
  assert.equal(problem("sixteen-chars!!!"), null);
  for (const example of ["river-tractor-winter-maple", "River Tractor Winter Maple", "river_tractor_winter_maple", "RiverTractorWinterMaple!"]) {
    assert.equal(problem(example), "published", example);
  }
  assert.equal(problem("river-tractor-winter-maple-2"), null, "only the example itself");
  assert.equal(auth.ACCESS_CODE_MIN_LENGTH, 16);
});

test("online with no code, a short one or the example, the app stays locked whatever is typed", async () => {
  const before = process.env.RENDER;
  process.env.RENDER = "true";
  auth.resetLoginLimits();
  try {
    for (const code of ["", "x", "river-tractor-winter-maple"]) {
      process.env.ATLAS_ACCESS_CODE = code;
      const label = JSON.stringify(code);
      assert.deepEqual((await call("GET", "/api/auth/status")).json, { required: true, signedIn: false, shared: true, account: null }, label);
      assert.equal((await call("GET", "/api/workspace")).status, 401, label);
      assert.equal((await call("GET", "/api/status")).status, 401, label);
      const login = await call("POST", "/api/auth/login", { body: { code: code || "anything" } });
      assert.equal(login.status, 503, label);
      assert.equal(login.json.error.code, "access_code_off", label);
      assert.match(login.json.error.message, /at least|shorter than 16/, label);
      assert.equal(login.setCookie, null, `${label}: no sign-in`);
      const logout = await call("POST", "/api/auth/logout");
      assert.equal(logout.json.signedIn, false, label);
    }
    // A proper code works online as anywhere.
    process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
    assert.equal((await call("POST", "/api/auth/login", { body: { code: "wrong-but-long-enough" } })).status, 401);
    const ok = await call("POST", "/api/auth/login", { body: { code: "orchard-lantern-pebble-cobalt" } });
    assert.equal(ok.status, 200);
    assert.equal((await call("GET", "/api/workspace", { cookie: cookieOf(ok.setCookie) })).status, 200);
    // A cookie made with a good code stops working once the code becomes a bad one.
    process.env.ATLAS_ACCESS_CODE = "short";
    assert.equal((await call("GET", "/api/workspace", { cookie: cookieOf(ok.setCookie) })).status, 401);
  } finally {
    process.env.RENDER = before ?? "";
    process.env.ATLAS_ACCESS_CODE = "";
    auth.resetLoginLimits();
  }
  // On one's own computer (no RENDER) no code still means open.
  assert.deepEqual((await call("GET", "/api/auth/status")).json, { required: false, signedIn: true, shared: false, account: null });
  assert.equal((await call("GET", "/api/workspace")).status, 200);
});

test("a change asked for by another website is refused (403); reads, our own pages and scripts are not", async () => {
  // What the browser's headers say (crossSiteProblem is pure).
  const refused = /another website/;
  assert.equal(auth.crossSiteProblem({}), null, "no browser headers: curl, scripts/export-data.js");
  assert.equal(auth.crossSiteProblem({ "sec-fetch-site": "same-origin" }), null);
  assert.equal(auth.crossSiteProblem({ "sec-fetch-site": "none" }), null, "a typed address or a bookmark");
  assert.match(auth.crossSiteProblem({ "sec-fetch-site": "cross-site" }), refused);
  assert.match(auth.crossSiteProblem({ "sec-fetch-site": "same-site" }), refused);
  assert.equal(auth.crossSiteProblem({ origin: "https://chernozem.app", host: "chernozem.app" }), null);
  assert.equal(auth.crossSiteProblem({ origin: "http://localhost:5173", host: "localhost:5173" }), null, "the dev server");
  assert.equal(auth.crossSiteProblem({ origin: "http://[::1]:5173", host: "[::1]:5173" }), null);
  assert.equal(auth.crossSiteProblem({ origin: "HTTPS://Chernozem.app:443", host: "chernozem.app:8443" }), null, "scheme, capitals and port aside");
  assert.equal(auth.crossSiteProblem({ origin: "https://chernozem.app", host: "10.0.0.5:10000", "x-forwarded-host": "chernozem.app, 10.0.0.5" }), null, "behind a proxy");
  assert.match(auth.crossSiteProblem({ origin: "https://evil.example", host: "chernozem.app" }), refused);
  assert.match(auth.crossSiteProblem({ origin: "https://chernozem.app.evil.example", host: "chernozem.app" }), refused);
  assert.match(auth.crossSiteProblem({ origin: "null", host: "chernozem.app" }), refused, "a sandboxed page");
  assert.match(auth.crossSiteProblem({ origin: "https://chernozem.app" }), refused, "no Host to compare with");
  assert.match(auth.crossSiteProblem({ "sec-fetch-site": "cross-site", origin: "https://chernozem.app", host: "chernozem.app" }), refused, "Sec-Fetch-Site decides");

  // Through the server, with a code set: the sign-out and sign-in routes.
  process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
  auth.resetLoginLimits();
  try {
    for (const headers of [{ "Sec-Fetch-Site": "cross-site" }, { Origin: "https://evil.example" }, { "Sec-Fetch-Site": "same-site", Origin: base }]) {
      const out = await call("POST", "/api/auth/logout", { headers });
      assert.equal(out.status, 403, JSON.stringify(headers));
      assert.equal(out.json.error.code, "cross_site", JSON.stringify(headers));
      assert.match(out.json.error.message, refused);
      assert.equal(out.setCookie, null, "the cookie is left alone");
    }
    // Wrong codes sent from another website never count against the visitor.
    for (let i = 0; i < 12; i++) {
      const out = await call("POST", "/api/auth/login", { body: { code: "wrong-code-from-elsewhere" }, headers: { "Sec-Fetch-Site": "cross-site" } });
      assert.equal(out.status, 403, `try ${i + 1}`);
    }
    const own = await call("POST", "/api/auth/login", { body: { code: "orchard-lantern-pebble-cobalt" }, headers: { "Sec-Fetch-Site": "same-origin", Origin: base } });
    assert.equal(own.status, 200, "our own page signs in");
    const cookie = cookieOf(own.setCookie);
    // Reads from anywhere are fine (the cookie never travels to another
    // website's request for a change anyway: SameSite=Lax), as are changes
    // asked for by our own pages, a typed address, or with no browser
    // headers at all.
    assert.equal((await call("GET", "/api/auth/status", { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 200);
    assert.equal((await call("GET", "/api/workspace", { cookie, headers: { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" } })).status, 200);
    assert.equal((await call("POST", "/api/auth/logout", { headers: { Origin: base } })).status, 200, "Origin: our own host (an older browser)");
    assert.equal((await call("POST", "/api/auth/logout", { headers: { "Sec-Fetch-Site": "none" } })).status, 200);
    assert.equal((await call("POST", "/api/auth/logout")).status, 200, "no browser headers");
    // The data upload (sent by a script, no Origin) and the public website's
    // contact form (our own site) are never taken for another website's.
    assert.notEqual((await call("POST", "/api/admin/import", { body: { files: {} } })).status, 403, "the export script");
    assert.notEqual((await call("POST", "/api/contact", { body: {}, headers: { "Sec-Fetch-Site": "same-origin", Origin: base } })).status, 403, "the contact form");
    assert.equal((await call("POST", "/api/contact", { body: {}, headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403, "a form elsewhere");
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
    auth.resetLoginLimits();
  }
});

// ---------- A registered account's cookie (server/accounts.js signs people in) ----------

test("an account token is accepted with the same secret only, and gives back the account id", () => {
  const secret = auth.deriveAccountSecret("a".repeat(64));
  const token = auth.signAccountSession(secret, "AbC123_-xyz");
  assert.match(token, /^AbC123_-xyz\.\d+\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(auth.verifyAccountSession(token, secret), "AbC123_-xyz");
  assert.equal(auth.verifyAccountSession(token, auth.deriveAccountSecret("b".repeat(64))), null, "a new salt signs everyone out");
  assert.notEqual(Buffer.compare(secret, auth.deriveSecret("accounts", "a".repeat(64))), 0, "not the access code's secret");
  assert.throws(() => auth.signAccountSession(secret, "has.dots"), "dots would split the token");
  assert.throws(() => auth.signAccountSession(secret, ""));
  assert.equal(auth.isUid("x".repeat(128)), true);
  assert.equal(auth.isUid("x".repeat(129)), false);
  assert.equal(auth.isUid("spaced out"), false);
});

test("a changed account token is refused", () => {
  const secret = auth.deriveAccountSecret("salt".repeat(10));
  const token = auth.signAccountSession(secret, "SomeUID");
  const [uid, expires, nonce, sig] = token.split(".");
  assert.equal(auth.verifyAccountSession(`OtherUID.${expires}.${nonce}.${sig}`, secret), null, "another account");
  assert.equal(auth.verifyAccountSession(`${uid}.${Number(expires) + 1000}.${nonce}.${sig}`, secret), null, "longer expiry");
  assert.equal(auth.verifyAccountSession(`${uid}.${expires}.${nonce}x.${sig}`, secret), null, "changed random part");
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert.equal(auth.verifyAccountSession(`${uid}.${expires}.${nonce}.${flipped}`, secret), null, "changed signature");
  for (const junk of ["", "abc", "1.2.3", "a.b.c.d", null, undefined, 42, `${token}.extra`, auth.signSession(secret)]) {
    assert.equal(auth.verifyAccountSession(junk, secret), null, `junk: ${String(junk)}`);
  }
});

test("an account token runs out after 30 days", () => {
  const secret = auth.deriveAccountSecret("salt".repeat(10));
  const now = Date.UTC(2026, 9, 1);
  const token = auth.signAccountSession(secret, "SomeUID", { now });
  const day = 24 * 60 * 60 * 1000;
  assert.equal(auth.verifyAccountSession(token, secret, { now: now + 29 * day }), "SomeUID");
  assert.equal(auth.verifyAccountSession(token, secret, { now: now + 30 * day }), null);
  assert.equal(auth.verifyAccountSession(token, secret, { now: now + 31 * day }), null);
});

test("through the API: the status names the account, the account works with a code set, and Sign out clears both cookies", async () => {
  const accounts = await import("./accounts.js");
  accounts.setDepsForTests({
    verifyIdToken: (idToken) => {
      if (idToken === "ok") return { uid: "AuthTestUID1", email: "auth@example.com", name: "Auth Test" };
      throw Object.assign(new Error("bad"), { code: "auth/argument-error" });
    },
  });
  try {
    process.env.ATLAS_ACCESS_CODE = "";
    const signedIn = await call("POST", "/api/auth/firebase", { body: { idToken: "ok" } });
    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.json));
    const account = cookieOf(signedIn.setCookies.find((line) => line.startsWith("chernozem_account=")));
    const expected = { uid: "AuthTestUID1", email: "auth@example.com", name: "Auth Test", product: null, profileComplete: false };
    assert.deepEqual(signedIn.json, { ok: true, account: expected });
    assert.deepEqual((await call("GET", "/api/auth/status", { cookie: account })).json, { required: false, signedIn: true, shared: false, account: expected });

    // With a code set the account still works, without the code.
    process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
    auth.resetLoginLimits();
    assert.deepEqual((await call("GET", "/api/auth/status", { cookie: account })).json, { required: true, signedIn: true, shared: false, account: expected });
    assert.equal((await call("GET", "/api/account", { cookie: account })).status, 200);
    assert.deepEqual((await call("GET", "/api/auth/status")).json, { required: true, signedIn: false, shared: true, account: null });
    assert.equal((await call("GET", "/api/account")).status, 401);
    assert.equal((await call("GET", "/api/account", { cookie: `${account}x` })).status, 401, "a changed cookie is nobody");

    // Sign out clears both cookies.
    const out = await call("POST", "/api/auth/logout", { cookie: account });
    assert.deepEqual(out.json, { ok: true, required: true, signedIn: false, shared: true, account: null });
    assert.ok(out.setCookies.some((line) => /^atlas_session=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax$/.test(line)), out.setCookies.join(" | "));
    assert.ok(out.setCookies.some((line) => /^chernozem_account=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax$/.test(line)), out.setCookies.join(" | "));

    // A wrong token: 401 bad_token, no cookie.
    const bad = await call("POST", "/api/auth/firebase", { body: { idToken: "nope" } });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error.code, "bad_token");
    assert.equal(bad.setCookie, null);
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
    accounts.setDepsForTests({});
    auth.resetLoginLimits();
  }
});
