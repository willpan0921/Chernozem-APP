// WHAT THIS FILE DOES
// Tests the registered accounts (server/accounts.js, with server/auth.js
// and server/app.js) on a real local port with a temporary data folder:
// a Firebase sign-in makes the account's own folder and cookie; a wrong
// token is refused; the sign-in is "off" when the server cannot check
// tokens; the profile is checked field by field; an account may only use
// the product it chose (403 wrong_product) and never reads the website's
// messages (403 owner_only); two accounts and the demo never see each
// other's areas, farm, jobs or settings; with visitors seeing the demo
// (ATLAS_ACCESS_CODE set), an account still works and the owner's Google
// sign-in replaces it in that browser; "Sign out" ends every cookie made
// for the account (a copy of it is then the read-only demo, never the
// account) and a Firebase sign-in from before it is refused (a copied ID
// token cannot open a new session: checkRevoked, and our own check to the
// millisecond); a Firebase user deleted or disabled is signed out within
// the hour; whether the e-mail is verified is kept from the sign-in and
// brought up to date by the hourly check; and an account's Sign out
// leaves the owner's session alone. Firebase itself is stood in for
// (setDepsForTests), so it runs offline. The limits on what an account may
// do are in quotas.test.js. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes accounts.js.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-accounts-"));
process.env.CHERNOZEM_DATA_DIR = dir;
process.env.GEE_DISABLED = "1";
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
process.env.OWNER_EMAILS = "";
process.env.FIREBASE_PROJECT_ID = "";
process.env.ANTHROPIC_API_KEY = "";

// The weather services are not called from the tests (offline at once);
// requests to this test server go through.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (/^https:\/\/(api|archive-api)\.open-meteo\.com\//.test(String(url))) throw new Error("offline in the tests");
  return realFetch(url, options);
};

const accounts = await import("./accounts.js");
const { handleApi } = await import("./app.js");

// A stand-in for Firebase's check. The token says who it is for:
//   "fake:{...}"  -> that decoded token
//   "outage"      -> Firebase could not be reached
//   anything else -> not a token (what Firebase answers: a code "auth/...")
// It notes whether it was asked to check for ended sessions (checkRevoked).
const verifyCalls = [];
function fakeVerifier(idToken, checkRevoked) {
  verifyCalls.push({ checkRevoked });
  if (idToken.startsWith("fake:")) return JSON.parse(idToken.slice(5));
  if (idToken === "outage") throw new Error("getaddrinfo ENOTFOUND www.googleapis.com");
  throw Object.assign(new Error("Decoding Firebase ID token failed."), { code: "auth/argument-error" });
}
const tokenFor = (uid, extra = {}) =>
  `fake:${JSON.stringify({ uid, email: `${uid.toLowerCase()}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" }, ...extra })}`;

// The stand-in for the rest of Firebase: which accounts were deleted or
// disabled there, whether it can be reached at all, which accounts had
// their Firebase sessions ended, and the clock the once-an-hour check reads.
// unverified: accounts Firebase now calls not verified; verified: accounts
// it now calls verified (else the record says nothing about it).
const firebase = { gone: new Set(), disabled: new Set(), verified: new Set(), unverified: new Set(), outage: false, revoked: [], clock: null };
function fakeGetUser(uid) {
  if (firebase.outage) throw new Error("getaddrinfo ENOTFOUND www.googleapis.com");
  if (firebase.gone.has(uid)) throw Object.assign(new Error("There is no user record corresponding to the provided identifier."), { code: "auth/user-not-found" });
  const verification = firebase.verified.has(uid) ? { emailVerified: true } : firebase.unverified.has(uid) ? { emailVerified: false } : {};
  return { uid, disabled: firebase.disabled.has(uid), ...verification };
}
const fakeDeps = () => ({
  verifyIdToken: fakeVerifier,
  getUser: fakeGetUser,
  revokeRefreshTokens: async (uid) => {
    firebase.revoked.push(uid);
  },
  now: () => firebase.clock ?? Date.now(),
});
accounts.setDepsForTests(fakeDeps());

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
  globalThis.fetch = realFetch;
  fs.rmSync(dir, { recursive: true, force: true });
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
  return { status: res.status, json, text, cookies: res.headers.getSetCookie() };
}

// The "name=value" part of the Set-Cookie line for one cookie, or undefined.
const cookieOf = (lines, name) => lines.map((line) => line.split(";")[0]).find((part) => part.startsWith(`${name}=`));

// The folder of an account, as store.js names it.
const folderOf = (uid) => path.join(dir, "users", createHash("sha256").update(uid).digest("hex").slice(0, 32));

// Signs in as uid and gives back the account cookie.
async function signIn(uid, extra) {
  const res = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor(uid, extra) } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return cookieOf(res.cookies, "chernozem_account");
}

async function waitForJob(id, cookie) {
  for (let i = 0; i < 400; i += 1) {
    const { json } = await call("GET", `/api/jobs/${id}`, { cookie });
    if (json.job.status !== "running") return json.job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

test("a Firebase sign-in makes the account's own folder, sets the account cookie and answers the account", async () => {
  const res = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("AliceUID001", { name: "Alice Farmer" }) } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json, { ok: true, account: { uid: "AliceUID001", email: "aliceuid001@example.com", name: "Alice Farmer", product: null, profileComplete: false } });
  const line = res.cookies.find((cookie) => cookie.startsWith("chernozem_account="));
  assert.match(line, /^chernozem_account=AliceUID001\.\d+\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
  assert.ok(res.cookies.some((cookie) => /^chernozem_owner=; Path=\/; Max-Age=0;/.test(cookie)), "the owner's cookie, if any, is removed: the latest sign-in wins");
  assert.ok(res.cookies.some((cookie) => /^atlas_session=; Path=\/; Max-Age=0;/.test(cookie)), "and the retired code's");
  assert.equal(verifyCalls.at(-1).checkRevoked, true, "Firebase is asked to refuse an ended session (checkRevoked)");

  // Behind an https proxy the cookie is marked Secure.
  const secure = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("AliceUID001") }, headers: { "X-Forwarded-Proto": "https" } });
  assert.match(secure.cookies.find((cookie) => cookie.startsWith("chernozem_account=")), /; Secure$/);

  // The profile in the account's own folder, from the token; the base
  // folder (the demo) gets nothing.
  const profile = JSON.parse(fs.readFileSync(path.join(folderOf("AliceUID001"), "profile.json"), "utf8"));
  assert.equal(profile.uid, "AliceUID001");
  assert.equal(profile.email, "aliceuid001@example.com");
  assert.equal(profile.name, "Alice Farmer", "kept at the second sign-in, which brought no name");
  assert.equal(profile.provider, "google.com");
  assert.equal(profile.emailVerified, true, "Google verified the e-mail");
  assert.ok(profile.createdAt && profile.signedInAt);
  assert.equal(fs.existsSync(path.join(dir, "profile.json")), false);

  // The status names the account, never "shared".
  const cookie = cookieOf(res.cookies, "chernozem_account");
  const status = await call("GET", "/api/auth/status", { cookie });
  assert.deepEqual(status.json, {
    required: false,
    signedIn: true,
    shared: false,
    account: { uid: "AliceUID001", email: "aliceuid001@example.com", name: "Alice Farmer", product: null, profileComplete: false },
    mode: "account",
    readOnly: false,
  });
});

test("a wrong token is refused with 401 bad_token, and nothing is made", async () => {
  const before = fs.existsSync(path.join(dir, "users")) ? fs.readdirSync(path.join(dir, "users")).length : 0;
  for (const idToken of ["not-a-token", `fake:${JSON.stringify({ email: "no-uid@example.com" })}`, `fake:${JSON.stringify({ uid: "has.dots.in.it" })}`]) {
    const res = await call("POST", "/api/auth/firebase", { body: { idToken } });
    assert.equal(res.status, 401, idToken);
    assert.equal(res.json.error.code, "bad_token", idToken);
    assert.deepEqual(res.cookies, [], "no cookie");
  }
  for (const body of [{}, { idToken: "" }, { idToken: 42 }, { idToken: "x".repeat(9000) }]) {
    const res = await call("POST", "/api/auth/firebase", { body });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal((await call("GET", "/api/auth/firebase")).status, 405);
  const after = fs.existsSync(path.join(dir, "users")) ? fs.readdirSync(path.join(dir, "users")).length : 0;
  assert.equal(after, before, "no folder was made");
});

test("accounts are off (503 accounts_off) when the server cannot check tokens: Firebase unreachable, or switched off", async () => {
  const outage = await call("POST", "/api/auth/firebase", { body: { idToken: "outage" } });
  assert.equal(outage.status, 503);
  assert.equal(outage.json.error.code, "accounts_off");
  assert.match(outage.json.error.message, /could not be checked/);
  assert.deepEqual(outage.cookies, []);

  // Switched off: no project id (and no key), nothing to check with.
  process.env.FIREBASE_PROJECT_ID = "off";
  accounts.setDepsForTests({});
  try {
    assert.match(accounts.accountsProblem(), /switched off/);
    assert.equal(accounts.firebaseProjectId(), null);
    const res = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("SomeoneUID01") } });
    assert.equal(res.status, 503);
    assert.equal(res.json.error.code, "accounts_off");
    assert.match(res.json.error.message, /switched off/);
  } finally {
    process.env.FIREBASE_PROJECT_ID = "";
    accounts.setDepsForTests(fakeDeps());
  }

  // Which project: FIREBASE_PROJECT_ID, else the Earth Engine project, else the default.
  assert.equal(accounts.firebaseProjectId({ firebaseProjectId: null, geeProjectId: null }), "chernozem-danny");
  assert.equal(accounts.firebaseProjectId({ firebaseProjectId: null, geeProjectId: "gee-project" }), "gee-project");
  assert.equal(accounts.firebaseProjectId({ firebaseProjectId: "firebase-project", geeProjectId: "gee-project" }), "firebase-project");
  assert.equal(accounts.firebaseProjectId({ firebaseProjectId: "none", geeProjectId: "gee-project" }), null);
  assert.equal(accounts.accountsProblem({ firebaseProjectId: null }), null);
  assert.equal(typeof accounts.firebaseProjectId(), "string", "on: some project");
});

test("the profile: read, checked field by field (400 with a plain sentence), saved; then the account is complete", async () => {
  const cookie = await signIn("BobUID000002");
  const got = await call("GET", "/api/account", { cookie });
  assert.equal(got.status, 200);
  assert.equal(got.json.account.profileComplete, false);
  assert.equal(got.json.profile.uid, "BobUID000002");
  assert.equal(got.json.profile.email, "bobuid000002@example.com");
  assert.equal(got.json.profile.product, null);
  assert.equal(got.json.profile.place, null);

  // Without an account (the demo): 401.
  const none = await call("GET", "/api/account");
  assert.equal(none.status, 401);
  assert.equal(none.json.error.code, "auth_required");
  assert.equal((await call("PUT", "/api/account", { body: { name: "x" } })).status, 401);

  const good = { name: "Bob", age: 34, organization: "Bob's farm", role: "farmer", product: "field", country: "Ukraine", address: "Kupiansk", place: { lat: 49.71, lng: 37.62, label: "Kupiansk" } };
  for (const [body, why] of [
    [{ ...good, name: "" }, /name/i],
    [{ ...good, name: undefined }, /name/i],
    [{ ...good, name: "x".repeat(81) }, /80 characters/],
    [{ ...good, name: 5 }, /must be text/],
    [{ ...good, age: 12 }, /13 to 120/],
    [{ ...good, age: 121 }, /13 to 120/],
    [{ ...good, age: "abc" }, /13 to 120/],
    [{ ...good, age: 20.5 }, /13 to 120/],
    [{ ...good, role: "king" }, /Choose who you are/],
    [{ ...good, role: undefined }, /Choose who you are/],
    [{ ...good, product: "both" }, /Choose a product/],
    [{ ...good, organization: "x".repeat(121) }, /120 characters/],
    [{ ...good, country: "x".repeat(121) }, /120 characters/],
    [{ ...good, address: "x".repeat(121) }, /120 characters/],
    [{ ...good, place: { lat: 91, lng: 0 } }, /latitude/],
    [{ ...good, place: { lat: 0, lng: 181 } }, /longitude/],
    [{ ...good, place: { lat: "north", lng: 0 } }, /latitude/],
    [{ ...good, place: [1, 2] }, /place/],
    [{ ...good, place: { lat: 1, lng: 2, label: "x".repeat(201) } }, /200 characters/],
  ]) {
    const res = await call("PUT", "/api/account", { cookie, body });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(res.json.error.code, "bad_request");
    assert.match(res.json.error.message, why, JSON.stringify(body).slice(0, 80));
  }
  assert.equal((await call("GET", "/api/account", { cookie })).json.profile.product, null, "nothing was saved");

  const saved = await call("PUT", "/api/account", { cookie, body: { ...good, age: "34" } });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.deepEqual(saved.json.account, { uid: "BobUID000002", email: "bobuid000002@example.com", name: "Bob", product: "field", profileComplete: true });
  assert.equal(saved.json.ok, true);
  assert.equal(saved.json.profile.age, 34, "a typed number is a number");
  assert.equal(saved.json.profile.role, "farmer");
  assert.equal(saved.json.profile.organization, "Bob's farm");
  assert.deepEqual(saved.json.profile.place, { lat: 49.71, lng: 37.62, label: "Kupiansk" });
  assert.ok(saved.json.profile.updatedAt);
  assert.equal(saved.json.profile.email, "bobuid000002@example.com", "the e-mail comes from the token, never from the form");
  assert.equal((await call("GET", "/api/auth/status", { cookie })).json.account.profileComplete, true);
  const onDisk = JSON.parse(fs.readFileSync(path.join(folderOf("BobUID000002"), "profile.json"), "utf8"));
  assert.equal(onDisk.product, "field");

  // Optional fields left blank, and the product changed.
  const blank = await call("PUT", "/api/account", { cookie, body: { name: "Bob", role: "other", product: "atlas", age: "", place: null } });
  assert.equal(blank.status, 200);
  assert.equal(blank.json.profile.age, null);
  assert.equal(blank.json.profile.organization, "");
  assert.equal(blank.json.profile.place, null);
  assert.equal(blank.json.account.product, "atlas");

  // A later sign-in keeps the name the person typed (Google's does not replace it).
  await signIn("BobUID000002", { name: "Robert From Google" });
  assert.equal((await call("GET", "/api/account", { cookie })).json.profile.name, "Bob");

  assert.equal((await call("DELETE", "/api/account", { cookie })).status, 405);
  assert.equal((await call("GET", "/api/account/more", { cookie })).status, 404);
});

test("an account uses the product it chose: 403 wrong_product on the other one, 403 owner_only on the website's messages; the demo uses both", async () => {
  const field = await signIn("FieldUID0001");
  assert.equal((await call("PUT", "/api/account", { cookie: field, body: { name: "F", role: "farmer", product: "field" } })).status, 200);
  const atlas = await signIn("AtlasUID0001");
  assert.equal((await call("PUT", "/api/account", { cookie: atlas, body: { name: "A", role: "ngo", product: "atlas" } })).status, 200);
  const fresh = await signIn("FreshUID0001");

  const atlasRoutes = [
    ["GET", "/api/status"],
    ["GET", "/api/areas"],
    ["POST", "/api/areas", { source: "bbox", north: 50, south: 49.9, east: 30.1, west: 30 }],
    ["GET", "/api/workspace"],
    ["POST", "/api/team", { name: "Someone" }],
    ["POST", "/api/analyze", { areaId: "area-x" }],
    ["GET", "/api/jobs"],
    ["POST", "/api/jobs/job-x/cancel"],
    ["GET", "/api/runs"],
    ["GET", "/api/soil?lat=49&lon=37&sizeDeg=0.1"],
    ["GET", "/api/chats?product=atlas"],
    ["POST", "/api/chat", { product: "atlas", message: "hi" }],
  ];
  const fieldRoutes = [
    ["GET", "/api/farm"],
    ["POST", "/api/farm/demo", { example: "ukraine" }],
    ["GET", "/api/chats?product=field"],
    ["POST", "/api/chat", { product: "field", message: "hi" }],
  ];
  const expect403 = async (cookie, routes, why) => {
    for (const [method, url, body] of routes) {
      const res = await call(method, url, { cookie, body });
      assert.equal(res.status, 403, `${why}: ${method} ${url} -> ${res.status} ${JSON.stringify(res.json)}`);
      assert.equal(res.json.error.code, "wrong_product", `${why}: ${method} ${url}`);
    }
  };
  await expect403(field, atlasRoutes, "a Field account on Atlas");
  await expect403(atlas, fieldRoutes, "an Atlas account on Field");
  await expect403(fresh, [...atlasRoutes, ...fieldRoutes], "no product chosen yet");
  assert.match((await call("GET", "/api/workspace", { cookie: fresh })).json.error.message, /Finish registering/);
  assert.match((await call("GET", "/api/farm", { cookie: atlas })).json.error.message, /Chernozem Atlas, so it cannot use Chernozem Field/);

  // Their own product works, in their own folder.
  assert.equal((await call("GET", "/api/farm", { cookie: field })).status, 200);
  assert.equal((await call("GET", "/api/farm", { cookie: field })).json.farm, null, "a fresh account has no farm");
  assert.deepEqual((await call("GET", "/api/chats?product=field", { cookie: field })).json, { threads: [] });
  assert.equal((await call("GET", "/api/workspace", { cookie: atlas })).status, 200);
  assert.deepEqual((await call("GET", "/api/areas", { cookie: atlas })).json, { areas: [] });
  // The website's messages are the owner's alone, whatever the product.
  for (const cookie of [field, atlas, fresh]) {
    for (const [method, url] of [["GET", "/api/messages"], ["DELETE", "/api/messages/msg-x"]]) {
      const res = await call(method, url, { cookie });
      assert.equal(res.status, 403, `${method} ${url}`);
      assert.equal(res.json.error.code, "owner_only", `${method} ${url}`);
    }
  }
  assert.deepEqual((await call("GET", "/api/chats?product=atlas", { cookie: atlas })).json, { threads: [] });
  // The AI chat gets the body the guard read (no key here: the stream says so).
  const chat = await call("POST", "/api/chat", { cookie: field, body: { product: "field", message: "hi" } });
  assert.equal(chat.status, 200);
  assert.match(chat.text, /ai_not_configured/);
  // Routes of neither product are open to every account: the account
  // itself, one chat thread, and one job by its id (the Field pages follow
  // their field jobs with it; the list and cancel stay Atlas's).
  for (const cookie of [field, atlas, fresh]) {
    assert.equal((await call("GET", "/api/account", { cookie })).status, 200);
    assert.deepEqual((await call("GET", "/api/chats/chat-nothing", { cookie })).json, { thread: null });
    assert.equal((await call("GET", "/api/jobs/job-nothing", { cookie })).status, 404);
    // The place lookup is nobody's data: the register page needs it before
    // a product is chosen, and an Atlas account may look up a place too.
    const geocode = await call("GET", "/api/geocode?q=", { cookie });
    assert.notEqual(geocode.status, 403, `geocode for every account: ${geocode.status} ${JSON.stringify(geocode.json)}`);
  }
  // The demo (no account) uses both.
  assert.equal((await call("GET", "/api/workspace")).status, 200);
  assert.equal((await call("GET", "/api/farm")).status, 200);
  assert.equal((await call("GET", "/api/status")).status, 200);
});

test("two accounts and the demo never see each other's areas, analyses, farm or settings", async () => {
  const a = await signIn("IsoA00000001");
  const b = await signIn("IsoB00000001");
  for (const cookie of [a, b]) assert.equal((await call("PUT", "/api/account", { cookie, body: { name: "X", role: "government", product: "atlas" } })).status, 200);

  // An area and its analysis.
  const made = await call("POST", "/api/areas", { cookie: a, body: { source: "bbox", name: "A's box", north: 50, south: 49.9, east: 30.1, west: 30 } });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  const areaId = made.json.area.id;
  assert.deepEqual((await call("GET", "/api/areas", { cookie: a })).json.areas.map((area) => area.id), [areaId]);
  assert.deepEqual((await call("GET", "/api/areas", { cookie: b })).json.areas, []);
  assert.deepEqual((await call("GET", "/api/areas")).json.areas, [], "the demo has none of it");
  assert.equal((await call("GET", `/api/areas/${areaId}`, { cookie: b })).status, 404);
  assert.ok(fs.existsSync(path.join(folderOf("IsoA00000001"), "areas", `${areaId}.json`)));
  assert.equal(fs.existsSync(path.join(dir, "areas")), false, "the demo's folder is untouched");

  const started = await call("POST", "/api/analyze", { cookie: a, body: { areaId, months: 1 } });
  assert.equal(started.status, 202, JSON.stringify(started.json));
  const jobId = started.json.job.id;
  assert.equal((await call("GET", `/api/jobs/${jobId}`, { cookie: b })).status, 404, "another account's job does not exist for this one");
  assert.equal((await call("GET", `/api/jobs/${jobId}`)).status, 404, "nor for the demo");
  assert.deepEqual((await call("GET", "/api/jobs", { cookie: b })).json, { jobs: [] });
  assert.equal((await call("POST", `/api/jobs/${jobId}/cancel`, { cookie: b })).status, 404);
  assert.ok((await call("GET", "/api/jobs", { cookie: a })).json.jobs.some((job) => job.id === jobId));
  const done = await waitForJob(jobId, a);
  assert.equal(done.status, "done", done.error);
  assert.equal(done.root, undefined, "the folder is never sent to the pages");
  assert.equal((await call("GET", `/api/runs?areaId=${areaId}`, { cookie: a })).json.runs.length, 1);
  assert.deepEqual((await call("GET", `/api/runs?areaId=${areaId}`, { cookie: b })).json, { runs: [] });
  assert.deepEqual((await call("GET", "/api/runs")).json, { runs: [] });
  assert.equal((await call("GET", `/api/runs/${done.runIds[0]}`, { cookie: b })).status, 404);
  assert.ok(fs.existsSync(path.join(folderOf("IsoA00000001"), "runs", `${done.runIds[0]}.json`)));
  assert.equal(fs.existsSync(path.join(dir, "runs")), false);

  // Settings and the team.
  assert.equal((await call("PATCH", "/api/workspace", { cookie: a, body: { name: "A's office" } })).json.workspace.name, "A's office");
  assert.equal((await call("GET", "/api/workspace", { cookie: b })).json.workspace.name, "Regional office");
  assert.equal((await call("GET", "/api/workspace")).json.workspace.name, "Regional office");
  assert.equal((await call("POST", "/api/team", { cookie: a, body: { name: "Ann" } })).status, 201);
  assert.deepEqual((await call("GET", "/api/workspace", { cookie: b })).json.workspace.team, []);

  // The farm (Field accounts).
  const c = await signIn("IsoC00000001");
  const d = await signIn("IsoD00000001");
  for (const cookie of [c, d]) assert.equal((await call("PUT", "/api/account", { cookie, body: { name: "X", role: "farmer", product: "field" } })).status, 200);
  const demoFarm = await call("POST", "/api/farm/demo", { cookie: c, body: { example: "ukraine" } });
  assert.equal(demoFarm.status, 201, JSON.stringify(demoFarm.json).slice(0, 200));
  assert.ok(demoFarm.json.farm.fields.length > 0);
  assert.equal((await call("GET", "/api/farm", { cookie: d })).json.farm, null, "the other farmer has no farm");
  assert.equal((await call("GET", "/api/farm")).json.farm, null, "the demo has no farm");
  assert.ok(fs.existsSync(path.join(folderOf("IsoC00000001"), "farm.json")));
  assert.equal(fs.existsSync(path.join(dir, "farm.json")), false);
  // The farmer follows the farm's analysis by its id (the Field pages do),
  // though the jobs list itself is Atlas's; the other farmer cannot see it.
  assert.ok(demoFarm.json.job, "the example farm starts its analysis");
  assert.equal((await call("GET", `/api/jobs/${demoFarm.json.job.id}`, { cookie: d })).status, 404);
  assert.equal((await call("GET", "/api/jobs", { cookie: c })).status, 403);
  assert.equal((await waitForJob(demoFarm.json.job.id, c)).status, "done");
  assert.ok(fs.existsSync(path.join(folderOf("IsoC00000001"), "field-analysis")));
  assert.equal(fs.existsSync(path.join(dir, "field-analysis")), false);
});

// The read-only demo: what a visitor without a valid cookie gets once
// ATLAS_ACCESS_CODE is set (server/auth.js; the rest is in demo.test.js).
const DEMO_STATUS = { required: true, signedIn: false, shared: true, account: null, mode: "demo", readOnly: true };
const assertDemo = async (cookie, label) => {
  assert.deepEqual((await call("GET", "/api/auth/status", { cookie })).json, DEMO_STATUS, label);
  const change = await call("PATCH", "/api/workspace", { cookie, body: { name: "Changed" } });
  assert.equal(change.status, 403, label);
  assert.equal(change.json.error.code, "demo_read_only", label);
};

test("with visitors seeing the demo, an account still works; the owner's Google sign-in replaces it; Sign out clears every cookie; a changed cookie is nobody (the read-only demo)", async () => {
  process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
  try {
    const cookie = await signIn("CodeUID00001");
    const status = await call("GET", "/api/auth/status", { cookie });
    assert.equal(status.json.required, true);
    assert.equal(status.json.signedIn, true);
    assert.equal(status.json.shared, false);
    assert.equal(status.json.mode, "account");
    assert.equal(status.json.account.uid, "CodeUID00001");
    assert.equal((await call("GET", "/api/account", { cookie })).status, 200);
    await assertDemo(undefined, "without anything: the read-only demo");
    await assertDemo(`${cookie}x`, "a changed account cookie is nobody");
    const changed = await call("GET", "/api/account", { cookie: `${cookie}x` });
    assert.equal(changed.status, 401, "and is not the account");
    assert.equal(changed.json.error.code, "auth_required");

    // The retired code opens nothing, and leaves the account alone.
    const login = await call("POST", "/api/auth/login", { cookie, body: { code: "orchard-lantern-pebble-cobalt" } });
    assert.equal(login.status, 410);
    assert.equal(login.json.error.code, "owner_key_retired");
    assert.deepEqual(login.cookies, []);
    assert.equal((await call("GET", "/api/auth/status", { cookie })).json.mode, "account");

    // The owner's Google sign-in in the same browser: the account cookie goes.
    const owner = await call("POST", "/api/auth/firebase", { cookie, body: { idToken: tokenFor("OwnerUID0009", { email: "chernozem.app@gmail.com" }) } });
    assert.equal(owner.status, 200);
    assert.ok(owner.cookies.some((line) => /^chernozem_owner=OwnerUID0009\.[^;]+; Path=\/; Max-Age=2592000;/.test(line)));
    assert.ok(owner.cookies.some((line) => /^chernozem_account=; Path=\/; Max-Age=0;/.test(line)));
    assert.equal(owner.json.account.owner, true);
    const ownerCookie = cookieOf(owner.cookies, "chernozem_owner");
    assert.equal((await call("GET", "/api/auth/status", { cookie: ownerCookie })).json.mode, "owner");

    // Sign out removes every cookie.
    const out = await call("POST", "/api/auth/logout", { cookie });
    assert.equal(out.status, 200);
    assert.deepEqual(out.json, { ok: true, ...DEMO_STATUS });
    for (const name of ["chernozem_account", "chernozem_owner", "atlas_session"]) {
      assert.ok(out.cookies.some((line) => line === `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`), name);
    }
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
  // Without a code, a changed account cookie is the open workspace, not the account.
  const cookie = await signIn("CodeUID00001");
  const open = await call("GET", "/api/auth/status", { cookie: `${cookie}x` });
  assert.deepEqual(open.json, { required: false, signedIn: true, shared: true, account: null, mode: "open", readOnly: false });
});

test("a Firebase sign-in made before the account's Sign out is refused: a copied ID token cannot open a new session (M53)", async () => {
  firebase.clock = null;
  // An ID token as Firebase makes it: the time of the sign-in in seconds.
  const seconds = Math.floor(Date.now() / 1000);
  const copied = tokenFor("ReplayUID001", { auth_time: seconds, iat: seconds });
  const first = await call("POST", "/api/auth/firebase", { body: { idToken: copied } });
  assert.equal(first.status, 200);
  const cookie = cookieOf(first.cookies, "chernozem_account");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await call("POST", "/api/auth/logout", { cookie })).status, 200);
  assert.equal((await call("GET", "/api/account", { cookie })).status, 401, "the old cookie is dead");

  // The same token again (it lives about an hour at Firebase): refused,
  // no cookie, even within the same second as the Sign out.
  const replay = await call("POST", "/api/auth/firebase", { body: { idToken: copied } });
  assert.equal(replay.status, 401);
  assert.equal(replay.json.error.code, "bad_token");
  assert.match(replay.json.error.message, /signed out/);
  assert.deepEqual(replay.cookies, []);

  // A real new sign-in (made after the Sign out) works.
  const later = Math.floor(Date.now() / 1000) + 2;
  const fresh = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("ReplayUID001", { auth_time: later, iat: later }) } });
  assert.equal(fresh.status, 200);
  assert.equal((await call("GET", "/api/account", { cookie: cookieOf(fresh.cookies, "chernozem_account") })).status, 200);

  // Firebase's own answer for an ended session or a disabled user is a
  // 401 too.
  accounts.setDepsForTests({
    ...fakeDeps(),
    verifyIdToken: () => {
      throw Object.assign(new Error("The Firebase ID token has been revoked."), { code: "auth/id-token-revoked" });
    },
  });
  try {
    const revoked = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("ReplayUID001") } });
    assert.equal(revoked.status, 401);
    assert.equal(revoked.json.error.code, "bad_token");
  } finally {
    accounts.setDepsForTests(fakeDeps());
  }
});

test("the token check with checkRevoked: Firebase's word about the user refuses; Firebase not answering only skips that part", async () => {
  const token = { uid: "CheckUID0001", email: "check@example.com" };
  const fakeAuth = (revokedPart, tokenPart = null) => ({
    calls: [],
    async verifyIdToken(idToken, checkRevoked) {
      this.calls.push(Boolean(checkRevoked));
      if (tokenPart) throw tokenPart;
      if (checkRevoked && revokedPart) throw revokedPart;
      return token;
    },
  });
  const coded = (code) => Object.assign(new Error(code), { code });
  const fine = fakeAuth(null);
  assert.deepEqual(await accounts.verifyChecked(fine, "t"), token);
  assert.deepEqual(fine.calls, [true], "asked with checkRevoked");
  for (const code of ["auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"]) {
    await assert.rejects(accounts.verifyChecked(fakeAuth(coded(code)), "t"), (error) => error.code === code, code);
  }
  await assert.rejects(accounts.verifyChecked(fakeAuth(null, coded("auth/id-token-expired")), "t"), (error) => error.code === "auth/id-token-expired", "a token that ran out");
  // No Google key on this computer, or Firebase not answering: the token
  // is still checked, only the ended-session part is skipped (said once).
  const warn = console.warn;
  const said = [];
  console.warn = (line) => said.push(line);
  try {
    for (const code of ["app/invalid-credential", "auth/internal-error"]) {
      const quiet = fakeAuth(coded(code));
      assert.deepEqual(await accounts.verifyChecked(quiet, "t"), token, code);
      assert.deepEqual(quiet.calls, [true, false]);
    }
  } finally {
    console.warn = warn;
  }
  assert.ok(said.length <= 1, "said once at most");
});

test("whether the e-mail is verified: kept from the sign-in, and brought up to date by the hourly check", async () => {
  const hour = 60 * 60 * 1000;
  firebase.clock = Date.now();
  try {
    const cookie = await signIn("VerifyUID001", { email_verified: false, firebase: { sign_in_provider: "password" } });
    const profileFile = path.join(folderOf("VerifyUID001"), "profile.json");
    assert.equal(JSON.parse(fs.readFileSync(profileFile, "utf8")).emailVerified, false);
    // The person clicks the link in Firebase's e-mail.
    firebase.verified.add("VerifyUID001");
    firebase.clock += hour + 1000;
    assert.equal((await call("GET", "/api/account", { cookie })).status, 200);
    assert.equal(JSON.parse(fs.readFileSync(profileFile, "utf8")).emailVerified, true, "the hourly check wrote it");
    // A record that says nothing changes nothing.
    firebase.verified.delete("VerifyUID001");
    firebase.clock += hour + 1000;
    assert.equal((await call("GET", "/api/account", { cookie })).status, 200);
    assert.equal(JSON.parse(fs.readFileSync(profileFile, "utf8")).emailVerified, true);
  } finally {
    firebase.clock = null;
    firebase.verified.clear();
  }
});

test("Sign out ends every cookie made for the account; a Firebase user deleted or disabled is signed out within the hour; a fresh sign-in works again; the owner's session is untouched", async () => {
  const hour = 60 * 60 * 1000;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
  // With ATLAS_ACCESS_CODE set, a cookie that no longer counts is the
  // read-only demo, as any stranger is (without it it would be open).
  process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
  firebase.clock = Date.now();
  firebase.revoked.length = 0;
  try {
    // 1. Sign out: a copy of the cookie kept by anyone is nobody from then on.
    const cookie = await signIn("OutUID000001");
    assert.equal((await call("GET", "/api/account", { cookie })).status, 200);
    await pause();
    const out = await call("POST", "/api/auth/logout", { cookie });
    assert.equal(out.status, 200);
    assert.deepEqual(firebase.revoked, ["OutUID000001"], "Firebase's own sessions are ended too");
    const file = JSON.parse(fs.readFileSync(path.join(folderOf("OutUID000001"), "session.json"), "utf8"));
    assert.ok(Date.parse(file.sessionsValidFrom) > 0, "the moment is kept in the account's folder");
    assert.equal(fs.existsSync(path.join(dir, "session.json")), false, "not in the demo's");
    for (const [method, url, body] of [
      ["GET", "/api/account"],
      ["PUT", "/api/account", { name: "x", role: "farmer", product: "field" }],
    ]) {
      const res = await call(method, url, { cookie, body });
      assert.equal(res.status, 401, `${method} ${url} with the old cookie: ${res.status} ${JSON.stringify(res.json)}`);
      assert.equal(res.json.error.code, "auth_required");
    }
    // Everything else with the old cookie is the demo's, read-only.
    await assertDemo(cookie, "the old cookie");
    const farm = await call("POST", "/api/farm/demo", { cookie, body: { example: "ukraine" } });
    assert.equal(farm.status, 403, "no change to anybody's farm");
    assert.equal(fs.existsSync(path.join(folderOf("OutUID000001"), "farm.json")), false);
    // A second Sign out with the dead cookie does nothing more.
    await call("POST", "/api/auth/logout", { cookie });
    assert.deepEqual(firebase.revoked, ["OutUID000001"]);

    // 2. A fresh sign-in after it works; the old cookie stays dead.
    await pause();
    const again = await signIn("OutUID000001");
    assert.notEqual(again, cookie);
    assert.equal((await call("GET", "/api/account", { cookie: again })).status, 200);
    assert.equal((await call("GET", "/api/account", { cookie })).status, 401);

    // 3. Deleted in Firebase: the cookie works until the hourly check, then not.
    const gone = await signIn("GoneUID00001");
    firebase.gone.add("GoneUID00001");
    assert.equal((await call("GET", "/api/account", { cookie: gone })).status, 200, "the sign-in's own answer is good for an hour");
    firebase.clock += hour + 1000;
    assert.equal((await call("GET", "/api/account", { cookie: gone })).status, 401);
    assert.equal((await call("GET", "/api/account", { cookie: gone })).status, 401, "and stays so");

    // 4. Disabled in Firebase: the same; enabled again, the next check lets the cookie back in.
    const off = await signIn("OffUID000001");
    firebase.disabled.add("OffUID000001");
    assert.equal((await call("GET", "/api/account", { cookie: off })).status, 200);
    firebase.clock += hour + 1000;
    assert.equal((await call("GET", "/api/account", { cookie: off })).status, 401);
    firebase.disabled.delete("OffUID000001");
    firebase.clock += hour + 1000;
    assert.equal((await call("GET", "/api/account", { cookie: off })).status, 200);

    // 5. Firebase cannot be asked: the last answer (here the sign-in) stays
    // good for a day, then the account must sign in again.
    const outage = await signIn("OutageUID001");
    firebase.outage = true;
    firebase.clock += hour + 1000;
    assert.equal((await call("GET", "/api/account", { cookie: outage })).status, 200, "could not ask: the sign-in's answer is kept");
    firebase.clock += 23 * hour;
    assert.equal((await call("GET", "/api/account", { cookie: outage })).status, 401, "a day without an answer: sign in again");
    firebase.outage = false;
    const back = await signIn("OutageUID001");
    assert.equal((await call("GET", "/api/account", { cookie: back })).status, 200);

    // 6. The owner's session is untouched by an account's Sign out; the
    // owner's own Sign out ends the owner's cookies, never an account's.
    const login = await call("POST", "/api/auth/firebase", { body: { idToken: tokenFor("OwnerUID0010", { email: "chernozem.app@gmail.com" }) } });
    const ownerCookie = cookieOf(login.cookies, "chernozem_owner");
    const rename = () => call("PATCH", "/api/workspace", { cookie: ownerCookie, body: { name: "Regional office" } });
    assert.equal((await rename()).status, 200);
    const stillThere = await signIn("StillUID0001");
    assert.equal((await call("POST", "/api/auth/logout", { cookie: stillThere })).status, 200);
    assert.equal((await rename()).status, 200, "an account's Sign out leaves the owner alone");
    await pause();
    assert.equal((await call("POST", "/api/auth/logout", { cookie: ownerCookie })).status, 200);
    assert.equal(fs.existsSync(path.join(dir, "session.json")), false, "nothing written in the demo's folder");
    assert.ok(fs.existsSync(path.join(folderOf("OwnerUID0010"), "session.json")), "the owner's own folder keeps the moment");
    assert.equal((await rename()).status, 403, "a copy of the owner's cookie is the read-only demo now");
    assert.deepEqual(firebase.revoked, ["OutUID000001", "StillUID0001", "OwnerUID0010"]);
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
    firebase.clock = null;
    firebase.outage = false;
    accounts.setDepsForTests(fakeDeps());
  }
});
