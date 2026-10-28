// WHAT THIS FILE DOES
// Tests the registered accounts (server/accounts.js, with server/auth.js
// and server/app.js) on a real local port with a temporary data folder:
// a Firebase sign-in makes the account's own folder and cookie; a wrong
// token is refused; the sign-in is "off" when the server cannot check
// tokens; the profile is checked field by field; an account may only use
// the product it chose (403 wrong_product); two accounts and the shared
// demo never see each other's areas, farm, jobs or settings; and with an
// access code set, an account still works without the code. Firebase
// itself is stood in for (setDepsForTests), so it runs offline. Run with
// "npm test".
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
function fakeVerifier(idToken) {
  if (idToken.startsWith("fake:")) return JSON.parse(idToken.slice(5));
  if (idToken === "outage") throw new Error("getaddrinfo ENOTFOUND www.googleapis.com");
  throw Object.assign(new Error("Decoding Firebase ID token failed."), { code: "auth/argument-error" });
}
const tokenFor = (uid, extra = {}) =>
  `fake:${JSON.stringify({ uid, email: `${uid.toLowerCase()}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" }, ...extra })}`;
accounts.setDepsForTests({ verifyIdToken: fakeVerifier });

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
  assert.match(line, /^chernozem_account=AliceUID001\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
  assert.ok(res.cookies.some((cookie) => /^atlas_session=; Path=\/; Max-Age=0;/.test(cookie)), "the access code's cookie, if any, is removed: the latest sign-in wins");

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
  assert.ok(profile.createdAt && profile.signedInAt);
  assert.equal(fs.existsSync(path.join(dir, "profile.json")), false);

  // The status names the account, never "shared".
  const cookie = cookieOf(res.cookies, "chernozem_account");
  const status = await call("GET", "/api/auth/status", { cookie });
  assert.deepEqual(status.json, { required: false, signedIn: true, shared: false, account: { uid: "AliceUID001", email: "aliceuid001@example.com", name: "Alice Farmer", product: null, profileComplete: false } });
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
    accounts.setDepsForTests({ verifyIdToken: fakeVerifier });
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

test("an account uses the product it chose: 403 wrong_product on the other one; the demo uses both", async () => {
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
    ["GET", "/api/messages"],
    ["DELETE", "/api/messages/msg-x"],
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
  assert.deepEqual((await call("GET", "/api/messages", { cookie: atlas })).json, { messages: [] }, "the website's messages stay in the demo's folder");
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

test("with an access code set, an account still works without the code; the code's sign-in replaces it; Sign out clears both; a changed cookie is nobody", async () => {
  process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
  try {
    const cookie = await signIn("CodeUID00001");
    const status = await call("GET", "/api/auth/status", { cookie });
    assert.equal(status.json.required, true);
    assert.equal(status.json.signedIn, true);
    assert.equal(status.json.shared, false);
    assert.equal(status.json.account.uid, "CodeUID00001");
    assert.equal((await call("GET", "/api/account", { cookie })).status, 200);
    assert.equal((await call("GET", "/api/workspace")).status, 401, "without anything: the code is needed");
    const changed = await call("GET", "/api/workspace", { cookie: `${cookie}x` });
    assert.equal(changed.status, 401, "a changed account cookie is nobody");
    assert.equal(changed.json.error.code, "auth_required");

    // Entering the code makes this browser the demo's: the account cookie goes.
    const login = await call("POST", "/api/auth/login", { cookie, body: { code: "orchard-lantern-pebble-cobalt" } });
    assert.equal(login.status, 200);
    assert.ok(login.cookies.some((line) => /^atlas_session=[^;]+; Path=\/; Max-Age=2592000;/.test(line)));
    assert.ok(login.cookies.some((line) => /^chernozem_account=; Path=\/; Max-Age=0;/.test(line)));
    assert.equal(login.json.account, null);

    // Sign out removes both cookies.
    const out = await call("POST", "/api/auth/logout", { cookie });
    assert.equal(out.status, 200);
    assert.deepEqual(out.json, { ok: true, required: true, signedIn: false, shared: true, account: null });
    assert.ok(out.cookies.some((line) => /^atlas_session=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax$/.test(line)));
    assert.ok(out.cookies.some((line) => /^chernozem_account=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax$/.test(line)));
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
  // Without a code, a changed account cookie is the open demo, not the account.
  const cookie = await signIn("CodeUID00001");
  const open = await call("GET", "/api/auth/status", { cookie: `${cookie}x` });
  assert.deepEqual(open.json, { required: false, signedIn: true, shared: false, account: null });
  // And asking for the demo without a code, as an account, drops the account cookie.
  const toDemo = await call("POST", "/api/auth/login", { cookie, body: { code: "" } });
  assert.equal(toDemo.status, 200);
  assert.ok(toDemo.cookies.some((line) => /^chernozem_account=; Path=\/; Max-Age=0;/.test(line)));
  assert.deepEqual((await call("POST", "/api/auth/login", { body: { code: "" } })).cookies, [], "no cookie to drop: none sent");
});
