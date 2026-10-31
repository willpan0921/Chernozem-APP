// WHAT THIS FILE DOES
// Tests who is asking (server/auth.js, with server/accounts.js signing
// people in). The owner is the Chernozem Google account: a Firebase
// sign-in whose e-mail Google verified and that OWNER_EMAILS lists (blank:
// chernozem.app@gmail.com) gets the owner's cookie, may change everything
// and read the website's messages, and Sign out ends every owner cookie.
// An unverified owner's address, another address, an address OWNER_EMAILS
// no longer lists, or one Firebase stops calling verified is never the
// owner, and an account cookie never becomes the owner's. The retired
// access code opens nothing (POST /api/auth/login answers 410
// owner_key_retired) and the cookies it made, made exactly as the
// code-era server made them, are ignored. On one's own computer without
// ATLAS_ACCESS_CODE everything stays open; with it, and always online (on
// Render, whatever is set), a visitor without a cookie is the read-only
// demo. Also: the status ({ required, signedIn, shared, account, mode,
// readOnly }), the wrong-try limit, which visitor a limit counts behind a
// proxy such as Render's (an IPv6 visitor by its /64, or its /48 where
// asked), a change asked for by another website refused (403 cross_site)
// while scripts and our own pages go through, and a registered account's
// cookie: signed and checked, named in the status, cleared by Sign out with
// every other cookie. The demo header and the demo's other rules are in
// demo.test.js. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/auth.js.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash, createHmac, randomBytes } from "node:crypto";

// A temporary data folder and sample data; the settings are switched per test.
process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-auth-"));
process.env.GEE_DISABLED = "1";
// Not on Render (where every visitor is the demo).
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
// The owner's address: the default, chernozem.app@gmail.com (a value set
// here wins over the project's .env).
process.env.OWNER_EMAILS = "";
process.env.FIREBASE_PROJECT_ID = "";
// The demo may ask the AI assistant: never the real Claude from a test.
process.env.ANTHROPIC_API_KEY = "";
const auth = await import("./auth.js");
const accounts = await import("./accounts.js");
const { ownerEmailList } = await import("./env.js");
const { handleApi } = await import("./app.js");

// Firebase stood in for. A token "fake:{...}" is that decoded token, and
// signing in with it records the user as Firebase would; a test may then
// change that record (users) to play what Firebase says at the hourly
// check. revoked: the accounts whose Firebase sessions were ended; clock:
// the time the hourly check reads.
const firebase = { users: new Map(), revoked: [], clock: null };
const tokenFor = (uid, { email, verified = true, ...extra } = {}) =>
  `fake:${JSON.stringify({ uid, email: email ?? `${uid.toLowerCase()}@example.com`, email_verified: verified, firebase: { sign_in_provider: verified ? "google.com" : "password" }, ...extra })}`;
const OWNER_TOKEN = (uid = "OwnerUID0001") => tokenFor(uid, { email: "chernozem.app@gmail.com" });
accounts.setDepsForTests({
  verifyIdToken: (idToken) => {
    if (!idToken.startsWith("fake:")) throw Object.assign(new Error("Decoding Firebase ID token failed."), { code: "auth/argument-error" });
    const decoded = JSON.parse(idToken.slice(5));
    if (!firebase.users.has(decoded.uid)) firebase.users.set(decoded.uid, { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified === true, disabled: false });
    return decoded;
  },
  getUser: (uid) => {
    const user = firebase.users.get(uid);
    if (!user) throw Object.assign(new Error("There is no user record corresponding to the provided identifier."), { code: "auth/user-not-found" });
    return { ...user };
  },
  revokeRefreshTokens: (uid) => firebase.revoked.push(uid),
  now: () => firebase.clock ?? Date.now(),
});

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
  accounts.setDepsForTests({});
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

// "name=abc; Path=/; ..." -> "name=abc"
const cookieOf = (setCookie) => setCookie.split(";")[0];
// The cookie of one name from an answer's Set-Cookie lines.
const named = (res, name) => {
  const line = res.setCookies.find((item) => item.startsWith(`${name}=`) && !item.startsWith(`${name}=;`));
  return line ? cookieOf(line) : null;
};
const ownerCookieOf = (res) => named(res, "chernozem_owner");
const accountCookieOf = (res) => named(res, "chernozem_account");
const status = async (cookie, headers) => (await call("GET", "/api/auth/status", { cookie, headers })).json;
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
const folderOf = (uid) => path.join(process.env.CHERNOZEM_DATA_DIR, "users", createHash("sha256").update(uid).digest("hex").slice(0, 32));

// A cookie made exactly as the code-era server made it (server/auth.js on
// main up to round 3, still live when this round was written): the access
// code and the install's salt, "chernozem-atlas-session".
function codeEraCookie(code, salt) {
  const secret = createHmac("sha256", String(salt)).update(`chernozem-atlas-session\0${code}`).digest();
  const payload = `${Date.now() + 30 * 24 * 60 * 60 * 1000}.${randomBytes(16).toString("base64url")}`;
  return `atlas_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

// ---------- Pure parts ----------

test("texts are compared exactly (the data upload's token)", () => {
  assert.equal(auth.codesMatch("test123", "test123"), true);
  assert.equal(auth.codesMatch("test12", "test123"), false);
  assert.equal(auth.codesMatch("TEST123", "test123"), false);
  assert.equal(auth.codesMatch("", "test123"), false);
});

test("the wrong-try limit allows 10 per 10 minutes per address", () => {
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
  // Ten minutes after the first wrong try, one more is allowed.
  assert.equal(limit.check("1.2.3.4", t0 + 10 * 60_000).blocked, false);
  limit.reset("1.2.3.4");
  assert.equal(limit.check("1.2.3.4", t0 + 60_000).blocked, false, "reset clears the count");
});

test("the wrong-try limit remembers at most maxKeys visitors, the least recent forgotten first", () => {
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

test("visitors whose tries ran out are swept away at most once a minute", () => {
  const limit = auth.createLoginLimiter({ windowMs: 1000, sweepEveryMs: 60_000 });
  const t0 = 9_000_000;
  for (let i = 0; i < 100; i += 1) limit.fail(`old-${i}`, t0);
  assert.equal(limit.size(), 100);
  // Their tries have run out, but the last sweep was just now.
  limit.fail("new-1", t0 + 5000);
  assert.equal(limit.size(), 101, "no sweep within the minute");
  limit.fail("new-2", t0 + 61_000);
  assert.equal(limit.size(), 1, "swept: only the visitor of this try is left");
});

test("cookies are read from the Cookie header", () => {
  assert.deepEqual(auth.parseCookies("a=1; chernozem_owner=x.y.z; b=%20two"), { a: "1", chernozem_owner: "x.y.z", b: " two" });
  assert.deepEqual(auth.parseCookies(""), {});
  assert.deepEqual(auth.parseCookies(undefined), {});
});

test("the owner's cookie and an account's are signed apart: neither ever passes for the other", () => {
  const salt = "c".repeat(64);
  const owner = auth.signAccountSession(auth.deriveOwnerSecret(salt), "SomeUID");
  const account = auth.signAccountSession(auth.deriveAccountSecret(salt), "SomeUID");
  assert.equal(auth.verifyAccountSession(owner, auth.deriveOwnerSecret(salt))?.uid, "SomeUID");
  assert.equal(auth.verifyAccountSession(account, auth.deriveAccountSecret(salt))?.uid, "SomeUID");
  assert.equal(auth.verifyAccountSession(owner, auth.deriveAccountSecret(salt)), null, "the owner's cookie is not an account's");
  assert.equal(auth.verifyAccountSession(account, auth.deriveOwnerSecret(salt)), null, "an account's cookie is not the owner's");
  assert.equal(auth.verifyAccountSession(owner, auth.deriveOwnerSecret("d".repeat(64))), null, "a new salt signs the owner out too");
});

test("OWNER_EMAILS: addresses separated by commas, any capitals or spaces; blank is chernozem.app@gmail.com; none is nobody; junk is left out", () => {
  assert.deepEqual(ownerEmailList(""), ["chernozem.app@gmail.com"]);
  assert.deepEqual(ownerEmailList(undefined), ["chernozem.app@gmail.com"]);
  assert.deepEqual(ownerEmailList(" Chernozem.App@Gmail.com ,  partner@Example.org"), ["chernozem.app@gmail.com", "partner@example.org"]);
  assert.deepEqual(ownerEmailList("a@x.org,a@x.org"), ["a@x.org"]);
  assert.deepEqual(ownerEmailList("none"), []);
  assert.deepEqual(ownerEmailList("OFF"), []);
  assert.deepEqual(ownerEmailList("not an address, also@not"), [], "a typing mistake makes nobody the owner, never somebody else");
  process.env.OWNER_EMAILS = "";
  assert.equal(auth.isOwnerEmail("chernozem.app@gmail.com"), true);
  assert.equal(auth.isOwnerEmail("  CHERNOZEM.APP@gmail.com "), true);
  assert.equal(auth.isOwnerEmail("chernozem.app@gmail.com.evil.example"), false);
  assert.equal(auth.isOwnerEmail(""), false);
  assert.equal(auth.isOwnerEmail(null), false);
});

// ---------- Through the API ----------

// What GET /api/auth/status says for each kind of visitor.
const OPEN = { required: false, signedIn: true, shared: true, account: null, mode: "open", readOnly: false };
const DEMO = { required: true, signedIn: false, shared: true, account: null, mode: "demo", readOnly: true };
const asOwner = (account, required = true) => ({ required, signedIn: true, shared: true, account, mode: "owner", readOnly: false });
const ownerAccount = (uid = "OwnerUID0001", email = "chernozem.app@gmail.com") => ({ uid, email, name: "", product: null, profileComplete: true, owner: true });
const READ_ONLY = "This is the demo, so it can't be changed. Register to do this on your own land.";
const RETIRED = { error: { code: "owner_key_retired", message: "The owner signs in with the Chernozem Google account at /owner." } };

// A change that only the owner (or open) may make, and its answer.
const rename = (options = {}) => call("PATCH", "/api/workspace", { body: { name: "Regional office" }, ...options });
const assertReadOnly = (res, label) => {
  assert.equal(res.status, 403, label);
  assert.equal(res.json.error.code, "demo_read_only", label);
  assert.equal(res.json.error.message, READ_ONLY, label);
};

test("open: on one's own computer without ATLAS_ACCESS_CODE everything works as before; the retired code's sign-in answers 410", async () => {
  process.env.ATLAS_ACCESS_CODE = "";
  const res = await call("GET", "/api/auth/status");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, OPEN);
  assert.equal((await rename()).status, 200, "everything can be changed");
  assert.equal((await call("GET", "/api/workspace")).status, 200);
  assert.equal((await call("GET", "/api/status")).status, 200);
  const login = await call("POST", "/api/auth/login", { body: { code: "anything" } });
  assert.equal(login.status, 410);
  assert.deepEqual(login.json, RETIRED);
  assert.equal(login.setCookie, null, "no cookie");
  assert.equal(fs.existsSync(path.join(process.env.CHERNOZEM_DATA_DIR, "auth.json")), false, "no salt made in open mode");
});

test("ATLAS_ACCESS_CODE set: visitors get the read-only demo; the code itself opens nothing (410), and cookies made with it in the code era are ignored", async () => {
  process.env.ATLAS_ACCESS_CODE = "test123";
  try {
    assert.deepEqual(await status(), DEMO);
    for (const [method, url] of [["GET", "/api/workspace"], ["GET", "/api/status"], ["GET", "/api/runs"], ["GET", "/api/chats?product=atlas"]]) {
      assert.equal((await call(method, url)).status, 200, url);
    }
    assertReadOnly(await rename(), "a change without a cookie");
    // The demo's assistant answers (without a Claude key here, the stream says so).
    assert.equal((await call("POST", "/api/chat", { body: { product: "atlas", message: "hi" } })).status, 200, "the demo's assistant");

    // The right code, the wrong one, any method: gone.
    for (const [method, body] of [["POST", { code: "test123" }], ["POST", { code: " test123 " }], ["POST", { code: "nope" }], ["GET", undefined]]) {
      const res = await call(method, "/api/auth/login", { body });
      assert.equal(res.status, 410, `${method} ${JSON.stringify(body)}`);
      assert.deepEqual(res.json, RETIRED);
      assert.deepEqual(res.setCookies, []);
    }

    // A browser that typed the code in the last 30 days still holds the
    // cookie the code-era server made: it is nobody now.
    const salt = await auth.installSalt();
    const old = codeEraCookie("test123", salt);
    assert.deepEqual(await status(old), DEMO, "the code era's cookie is the read-only demo");
    assertReadOnly(await rename({ cookie: old }), "the code era's cookie");
    const messages = await call("GET", "/api/messages", { cookie: old });
    assert.equal(messages.status, 403);
    assert.equal(messages.json.error.code, "owner_only", "and never reads the visitors' messages");
    assert.deepEqual(await status(old, { "X-Chernozem-View": "demo" }), DEMO);
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
  // Without a code the same cookie changes nothing either: open is open for everyone.
  assert.deepEqual(await status(codeEraCookie("", await auth.installSalt())), OPEN);
});

test("the owner signs in with Google: a verified address in OWNER_EMAILS gets the owner's cookie, may change everything and read the messages; Sign out ends every owner cookie", async () => {
  process.env.ATLAS_ACCESS_CODE = "any-value";
  firebase.revoked.length = 0;
  try {
    const signedIn = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN() } });
    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.json));
    assert.deepEqual(signedIn.json, { ok: true, account: ownerAccount() });
    const line = signedIn.setCookies.find((item) => item.startsWith("chernozem_owner="));
    assert.match(line, /^chernozem_owner=OwnerUID0001\.\d+\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
    assert.ok(signedIn.setCookies.includes("chernozem_account=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"), "an account cookie in this browser goes");
    assert.ok(signedIn.setCookies.includes("atlas_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"), "and the retired code's");
    assert.equal(accountCookieOf(signedIn), null, "no account cookie for the owner");
    const cookie = ownerCookieOf(signedIn);

    assert.deepEqual(await status(cookie), asOwner(ownerAccount()));
    assert.deepEqual(await status(cookie, { "X-Chernozem-View": "demo" }), asOwner(ownerAccount()), "the demo header never lowers the owner");
    assert.equal((await rename({ cookie })).status, 200, "the owner changes the demo");
    assert.equal((await call("GET", "/api/messages", { cookie })).status, 200, "and reads the website's messages");
    assert.equal((await call("GET", "/api/status", { cookie })).json.mail.to, "chernozem.app@gmail.com");
    assert.deepEqual(await status(`${cookie}x`), DEMO, "a changed cookie is nobody");
    assertReadOnly(await rename({ cookie: `${cookie}x` }), "a changed cookie");
    // The owner's profile is kept in its own folder, never in the demo's,
    // also when a Register page saves it (PUT /api/account).
    assert.ok(fs.existsSync(path.join(folderOf("OwnerUID0001"), "profile.json")));
    const profile = await call("PUT", "/api/account", { cookie, body: { name: "The owner", role: "other", product: "field" } });
    assert.equal(profile.status, 200, JSON.stringify(profile.json));
    assert.deepEqual(profile.json.account, { ...ownerAccount(), name: "The owner", product: "field" });
    assert.equal((await call("GET", "/api/account", { cookie })).json.profile.name, "The owner");
    assert.equal(JSON.parse(fs.readFileSync(path.join(folderOf("OwnerUID0001"), "profile.json"), "utf8")).name, "The owner");
    assert.equal(fs.existsSync(path.join(process.env.CHERNOZEM_DATA_DIR, "profile.json")), false, "nothing in the demo's folder");
    assert.equal((await status(cookie)).mode, "owner", "still the owner, both products");

    // Behind an https proxy the cookie is marked Secure.
    const secure = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN() }, headers: { "X-Forwarded-Proto": "https" } });
    assert.match(secure.setCookies.find((item) => item.startsWith("chernozem_owner=")), /; Secure$/);

    // Sign out: this browser's cookies go, and every owner cookie made so
    // far stops counting (Firebase's own sessions are ended too).
    await pause();
    const out = await call("POST", "/api/auth/logout", { cookie });
    assert.equal(out.status, 200);
    assert.deepEqual(out.json, { ok: true, ...DEMO });
    assert.ok(out.setCookies.includes("chernozem_owner=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"));
    assert.deepEqual(firebase.revoked, ["OwnerUID0001"]);
    assert.deepEqual(await status(cookie), DEMO, "a copy of the owner's cookie is nobody now");
    assert.deepEqual(await status(ownerCookieOf(secure)), DEMO, "nor the one from the other browser");
    assertReadOnly(await rename({ cookie }), "after Sign out");

    // A fresh Google sign-in works again.
    await pause();
    const again = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN() } });
    assert.deepEqual(await status(ownerCookieOf(again)), asOwner({ ...ownerAccount(), name: "The owner", product: "field" }));
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
});

test("only a verified address that OWNER_EMAILS lists is the owner: an unverified owner's address, another address or an unlisted one is an ordinary account", async () => {
  process.env.ATLAS_ACCESS_CODE = "any-value";
  try {
    // An e-mail and password sign-up with the owner's address: anyone
    // could make one; Google has not verified it.
    const fake = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("FakeOwnerUID", { email: "chernozem.app@gmail.com", verified: false }) } });
    assert.equal(fake.status, 200);
    assert.equal(fake.json.account.owner, undefined);
    assert.equal(ownerCookieOf(fake), null, "no owner's cookie");
    const fakeCookie = accountCookieOf(fake);
    const fakeStatus = await status(fakeCookie);
    assert.equal(fakeStatus.mode, "account");
    assert.equal(fakeStatus.shared, false);
    for (const [method, url] of [["GET", "/api/messages"], ["DELETE", "/api/messages/msg-x"]]) {
      assert.equal((await call(method, url, { cookie: fakeCookie })).json.error.code, "owner_only", url);
    }
    assert.equal((await rename({ cookie: fakeCookie })).json.error.code, "wrong_product", "its own (empty) workspace, not the demo's");

    // Another verified address.
    const other = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("OtherUID0001", { email: "farmer@example.org" }) } });
    assert.equal((await status(accountCookieOf(other))).mode, "account");

    // Capitals do not matter.
    const caps = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("CapsUID00001", { email: "Chernozem.App@Gmail.COM" }) } });
    const capsCookie = ownerCookieOf(caps);
    assert.equal((await status(capsCookie)).mode, "owner");

    // OWNER_EMAILS lists other addresses: those are the owner's, and the
    // default one is no longer, from the next request on.
    process.env.OWNER_EMAILS = " Partner@Example.org , second@example.org";
    assert.deepEqual(await status(capsCookie), DEMO, "the address left OWNER_EMAILS");
    const partner = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("PartnerUID01", { email: "partner@example.org" }) } });
    assert.equal((await status(ownerCookieOf(partner))).mode, "owner");
    const plain = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("PlainUID0001", { email: "chernozem.app@gmail.com" }) } });
    assert.equal((await status(accountCookieOf(plain))).mode, "account");
    process.env.OWNER_EMAILS = "none";
    assert.deepEqual(await status(ownerCookieOf(partner)), DEMO, "none: nobody is the owner");
  } finally {
    process.env.OWNER_EMAILS = "";
    process.env.ATLAS_ACCESS_CODE = "";
  }
});

test("the owner's cookie stops counting within the hour once Firebase no longer calls the address verified; an account cookie never becomes the owner's", async () => {
  process.env.ATLAS_ACCESS_CODE = "any-value";
  const hour = 60 * 60 * 1000;
  firebase.clock = Date.now();
  try {
    const signedIn = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN("OwnerUID0002") } });
    const cookie = ownerCookieOf(signedIn);
    assert.equal((await status(cookie)).mode, "owner");
    firebase.users.get("OwnerUID0002").emailVerified = false;
    assert.equal((await status(cookie)).mode, "owner", "the sign-in's own answer is good for an hour");
    firebase.clock += hour + 1000;
    assert.deepEqual(await status(cookie), DEMO, "the hourly check: no longer verified, no longer the owner");
    const profile = JSON.parse(fs.readFileSync(path.join(folderOf("OwnerUID0002"), "profile.json"), "utf8"));
    assert.equal(profile.emailVerified, false, "written into the profile");
    // Disabled in Firebase: the same.
    const disabled = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN("OwnerUID0003") } });
    firebase.users.get("OwnerUID0003").disabled = true;
    firebase.clock += hour + 1000;
    assert.deepEqual(await status(ownerCookieOf(disabled)), DEMO);

    // Someone registered the owner's address with a password before the
    // owner did (not verified: an ordinary account)...
    const early = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("SharedUID001", { email: "chernozem.app@gmail.com", verified: false }) } });
    const earlyCookie = accountCookieOf(early);
    assert.equal((await status(earlyCookie)).mode, "account");
    // ...then the owner signs in with Google, and Firebase joins both into
    // the same user, verified now. The early account cookie must never
    // become the owner's.
    firebase.users.get("SharedUID001").emailVerified = true;
    firebase.clock += hour + 1000;
    assert.deepEqual(await status(earlyCookie), DEMO, "the old account cookie is nobody, never the owner");
    assertReadOnly(await rename({ cookie: earlyCookie }), "the old account cookie");
    const owner = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN("SharedUID001") } });
    assert.equal((await status(ownerCookieOf(owner))).mode, "owner", "only the owner's own Google sign-in is the owner");
  } finally {
    firebase.clock = null;
    process.env.ATLAS_ACCESS_CODE = "";
  }
});

test("online (on Render) every visitor without a cookie is the read-only demo, never open, whatever ATLAS_ACCESS_CODE says; the owner signs in as anywhere", async () => {
  const before = process.env.RENDER;
  process.env.RENDER = "true";
  try {
    for (const code of ["", "x", "orchard-lantern-pebble-cobalt"]) {
      process.env.ATLAS_ACCESS_CODE = code;
      const label = JSON.stringify(code);
      assert.deepEqual(await status(), DEMO, label);
      assert.equal((await call("GET", "/api/workspace")).status, 200, label);
      assert.equal((await call("GET", "/api/status")).status, 200, label);
      assertReadOnly(await rename(), label);
      const login = await call("POST", "/api/auth/login", { body: { code: code || "anything" } });
      assert.equal(login.status, 410, label);
      assert.deepEqual(login.setCookies, [], `${label}: no sign-in`);
      const logout = await call("POST", "/api/auth/logout");
      assert.equal(logout.json.signedIn, false, label);
      assert.equal(logout.json.mode, "demo", label);
    }
    process.env.ATLAS_ACCESS_CODE = "";
    const owner = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN("OwnerUID0004") } });
    const cookie = ownerCookieOf(owner);
    assert.deepEqual(await status(cookie), asOwner(ownerAccount("OwnerUID0004")));
    assert.equal((await rename({ cookie })).status, 200);
  } finally {
    process.env.RENDER = before ?? "";
    process.env.ATLAS_ACCESS_CODE = "";
  }
  // On one's own computer without a code: open.
  assert.deepEqual(await status(), OPEN);
  assert.equal((await rename()).status, 200);
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
    assert.equal(auth.clientAddress(req({ "cf-connecting-ip": "2a02:1210:2c4b:8f00::1" }), { ipv6Bits: 48 }), "2a02:1210:2c4b::/48", "or by its /48");
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

test("addresses are made plain, and IPv6 counts by its /64 network, or its /48 where asked", () => {
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
  // Where asked (the contact form, the demo's assistant): by its /48.
  assert.equal(auth.limitKey("2001:db8:abcd:12::1", { ipv6Bits: 48 }), "2001:db8:abcd::/48");
  assert.equal(auth.limitKey("2001:db8:abcd:ffff:1:2:3:4", { ipv6Bits: 48 }), "2001:db8:abcd::/48", "the same /48");
  assert.equal(auth.limitKey("2001:db8::1", { ipv6Bits: 48 }), "2001:db8:0::/48");
  assert.equal(auth.limitKey("203.0.113.9", { ipv6Bits: 48 }), "203.0.113.9", "IPv4 stays the address");
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

  // Through the server, visitors seeing the demo: the sign-out and sign-in routes.
  process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
  try {
    for (const headers of [{ "Sec-Fetch-Site": "cross-site" }, { Origin: "https://evil.example" }, { "Sec-Fetch-Site": "same-site", Origin: base }]) {
      const out = await call("POST", "/api/auth/logout", { headers });
      assert.equal(out.status, 403, JSON.stringify(headers));
      assert.equal(out.json.error.code, "cross_site", JSON.stringify(headers));
      assert.match(out.json.error.message, refused);
      assert.equal(out.setCookie, null, "the cookie is left alone");
    }
    // A sign-in sent from another website is refused before the token is read.
    const elsewhere = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN() }, headers: { "Sec-Fetch-Site": "cross-site" } });
    assert.equal(elsewhere.status, 403);
    assert.equal(elsewhere.setCookie, null);
    const own = await call("POST", "/api/auth/firebase", { body: { idToken: OWNER_TOKEN() }, headers: { "Sec-Fetch-Site": "same-origin", Origin: base } });
    assert.equal(own.status, 200, "our own page signs in");
    const cookie = ownerCookieOf(own);
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
  }
});

// ---------- A registered account's cookie (server/accounts.js signs people in) ----------

test("an account token is accepted with the same secret only, and gives back the account id and when it was made", () => {
  const secret = auth.deriveAccountSecret("a".repeat(64));
  const now = Date.UTC(2026, 9, 28);
  const token = auth.signAccountSession(secret, "AbC123_-xyz", { now });
  assert.match(token, /^AbC123_-xyz\.\d+\.\d+\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(auth.verifyAccountSession(token, secret, { now }), { uid: "AbC123_-xyz", issuedAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1000 });
  assert.equal(auth.verifyAccountSession(token, auth.deriveAccountSecret("b".repeat(64)), { now }), null, "a new salt signs everyone out");
  assert.notEqual(Buffer.compare(secret, auth.deriveOwnerSecret("a".repeat(64))), 0, "not the owner's secret");
  assert.throws(() => auth.signAccountSession(secret, "has.dots"), "dots would split the token");
  assert.throws(() => auth.signAccountSession(secret, ""));
  assert.equal(auth.isUid("x".repeat(128)), true);
  assert.equal(auth.isUid("x".repeat(129)), false);
  assert.equal(auth.isUid("spaced out"), false);
});

test("a changed account token is refused", () => {
  const secret = auth.deriveAccountSecret("salt".repeat(10));
  const token = auth.signAccountSession(secret, "SomeUID");
  const [uid, issued, expires, nonce, sig] = token.split(".");
  assert.equal(auth.verifyAccountSession(`OtherUID.${issued}.${expires}.${nonce}.${sig}`, secret), null, "another account");
  assert.equal(auth.verifyAccountSession(`${uid}.${Number(issued) + 1000}.${expires}.${nonce}.${sig}`, secret), null, "a later time made at (it would outlive a sign-out)");
  assert.equal(auth.verifyAccountSession(`${uid}.${issued}.${Number(expires) + 1000}.${nonce}.${sig}`, secret), null, "longer expiry");
  assert.equal(auth.verifyAccountSession(`${uid}.${issued}.${expires}.${nonce}x.${sig}`, secret), null, "changed random part");
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert.equal(auth.verifyAccountSession(`${uid}.${issued}.${expires}.${nonce}.${flipped}`, secret), null, "changed signature");
  // (The fifth entry is a cookie of the older shape, without the time it
  // was made at: those browsers sign in again once.)
  // (The last one has the shape of the retired code's cookie.)
  for (const junk of ["", "abc", "1.2.3", "a.b.c.d", `${uid}.${expires}.${nonce}.${sig}`, null, undefined, 42, `${token}.extra`, `${expires}.${nonce}.${sig}`]) {
    assert.equal(auth.verifyAccountSession(junk, secret), null, `junk: ${String(junk)}`);
  }
});

test("an account token runs out after 30 days", () => {
  const secret = auth.deriveAccountSecret("salt".repeat(10));
  const now = Date.UTC(2026, 9, 1);
  const token = auth.signAccountSession(secret, "SomeUID", { now });
  const day = 24 * 60 * 60 * 1000;
  assert.equal(auth.verifyAccountSession(token, secret, { now: now + 29 * day })?.uid, "SomeUID");
  assert.equal(auth.verifyAccountSession(token, secret, { now: now + 30 * day }), null);
  assert.equal(auth.verifyAccountSession(token, secret, { now: now + 31 * day }), null);
});

test("through the API: the status names the account, the account works with visitors seeing the demo, and Sign out clears every cookie", async () => {
  firebase.revoked.length = 0;
  try {
    process.env.ATLAS_ACCESS_CODE = "";
    const signedIn = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("AuthTestUID1", { email: "auth@example.com", name: "Auth Test" }) } });
    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.json));
    const account = cookieOf(signedIn.setCookies.find((line) => line.startsWith("chernozem_account=")));
    const expected = { uid: "AuthTestUID1", email: "auth@example.com", name: "Auth Test", product: null, profileComplete: false };
    assert.deepEqual(signedIn.json, { ok: true, account: expected });
    const asAccount = (required) => ({ required, signedIn: true, shared: false, account: expected, mode: "account", readOnly: false });
    assert.deepEqual((await call("GET", "/api/auth/status", { cookie: account })).json, asAccount(false));

    // With visitors seeing the demo the account still works.
    process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
    assert.deepEqual((await call("GET", "/api/auth/status", { cookie: account })).json, asAccount(true));
    assert.equal((await call("GET", "/api/account", { cookie: account })).status, 200);
    assert.deepEqual((await call("GET", "/api/auth/status")).json, DEMO);
    assert.equal((await call("GET", "/api/account")).status, 401);
    assert.equal((await call("GET", "/api/account", { cookie: `${account}x` })).status, 401, "a changed cookie is nobody");

    // Sign out clears every cookie: the account's, the owner's and the retired code's.
    const out = await call("POST", "/api/auth/logout", { cookie: account });
    assert.deepEqual(out.json, { ok: true, ...DEMO });
    for (const name of ["chernozem_account", "chernozem_owner", "atlas_session"]) {
      assert.ok(out.setCookies.includes(`${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`), `${name}: ${out.setCookies.join(" | ")}`);
    }
    // ...and ends the account's cookies everywhere (accounts.test.js has
    // the details), and Firebase's own sessions.
    assert.equal((await call("GET", "/api/account", { cookie: account })).status, 401, "a copy of the old cookie is nobody now");
    assert.deepEqual(firebase.revoked, ["AuthTestUID1"]);

    // A wrong token: 401 bad_token, no cookie.
    const bad = await call("POST", "/api/auth/firebase", { body: { idToken: "nope" } });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error.code, "bad_token");
    assert.equal(bad.setCookie, null);
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
});
