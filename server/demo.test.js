// WHAT THIS FILE DOES
// Tests the public demo (server/auth.js, server/app.js, server/session.js,
// server/ai/demoChats.js) on a real local port with a temporary data
// folder and sample data. First a small demo workspace is made with no
// key set (an area with a month, a team member, the Ukraine example farm,
// a report, a contact message); then the owner's key is set, and:
//   - a visitor without a cookie reads everything (the farm, the
//     workspace without the team's e-mail addresses, the areas, the
//     months, the status) and the status says mode "demo", readOnly;
//   - every route that changes something, in server/app.js and in
//     server/field/routes.js, answers 403 demo_read_only with the owner's
//     sentence, no job starts and not one file changes;
//   - the website's messages are the owner's alone (403 owner_only);
//   - the demo's AI assistant keeps each visitor's chats in memory only,
//     never on disk, and stops at its three limits (per visitor, per
//     address, for the whole demo), and its memory keeps few chats, few
//     messages, few visitors, for 24 hours;
//   - the demo header (X-Chernozem-View: demo) turns an account's request
//     into the demo's, read-only, but never the owner's; an account
//     without it reads its own folder;
//   - the demo's reads cost nothing paid: no Earth Engine region search,
//     no GeoTIFF, a limited place search, a throttled weather refresh.
// Firebase, Claude, Open-Meteo and OpenStreetMap are stood in for, so it
// runs offline. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes what the public demo may do.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-demo-"));
process.env.CHERNOZEM_DATA_DIR = dir;
process.env.GEE_DISABLED = "1";
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
process.env.ATLAS_TRUST_PROXY = "";
process.env.FIREBASE_PROJECT_ID = "";
// Never the real Claude or a real e-mail from a test (a value set here
// wins over the project's .env).
process.env.ANTHROPIC_API_KEY = "";
for (const name of ["MAIL_TO", "MAIL_FROM", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "RESEND_API_KEY"]) process.env[name] = "";

// Outside services, answered here and counted; requests to this test
// server go through.
const realFetch = globalThis.fetch;
const outside = { weather: 0, places: 0, weatherDown: false };
globalThis.fetch = async (url, options) => {
  const text = String(url);
  if (text.startsWith("https://archive-api.open-meteo.com/")) throw new Error("offline in the tests");
  if (text.startsWith("https://api.open-meteo.com/")) {
    outside.weather += 1;
    if (outside.weatherDown) return new Response("down", { status: 503 });
    return new Response(
      JSON.stringify({
        current: { temperature_2m: 9.5, weather_code: 1 },
        hourly: { time: ["2026-10-31T00:00"], temperature_2m: [9], relative_humidity_2m: [80] },
        daily: { time: ["2026-10-31"], precipitation_sum: [0], precipitation_probability_max: [10], temperature_2m_max: [12], temperature_2m_min: [4] },
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
  if (text.startsWith("https://nominatim.openstreetmap.org/")) {
    outside.places += 1;
    return new Response(JSON.stringify([{ display_name: "Kupiansk, Kharkiv Oblast, Ukraine", lat: "49.71", lon: "37.61", boundingbox: ["49.67", "49.74", "37.57", "37.65"] }]), { headers: { "content-type": "application/json" } });
  }
  return realFetch(url, options);
};

const accounts = await import("./accounts.js");
const auth = await import("./auth.js");
const { handleApi } = await import("./app.js");
const { setQuotasForTests } = await import("./quotas.js");
const { resetDemoChats, demoChatStore, demoChatStats, DEMO_QUOTA_MESSAGE } = await import("./ai/demoChats.js");
const chat = await import("./ai/chat.js");
const { withSession, outsideSession, isDemoSession, DEMO_READ_ONLY_MESSAGE } = await import("./session.js");
const { startAnalysis, startJob } = await import("./jobs.js");
const { resetDemoPlaceSearches, DEMO_GEOTIFF_MESSAGE, DEMO_PLACES_MESSAGE } = await import("./field/routes.js");
const { resetWeatherThrottle } = await import("./field/weather.js");
const { resetProvider } = await import("./providers/index.js");

// Firebase stood in for: a token "fake:<uid>" is that account.
const revoked = [];
accounts.setDepsForTests({
  verifyIdToken: (idToken) => {
    if (idToken.startsWith("fake:")) return { uid: idToken.slice(5), email: `${idToken.slice(5).toLowerCase()}@example.com` };
    throw Object.assign(new Error("bad"), { code: "auth/argument-error" });
  },
  getUser: (uid) => ({ uid, disabled: false }),
  revokeRefreshTokens: (uid) => revoked.push(uid),
});

// Claude stood in for: every question gets the same short answer.
const asked = [];
chat.setClientFactory(() => ({
  beta: {
    messages: {
      stream(params) {
        asked.push(params);
        const text = "The demo farm is near Kupiansk.";
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
            yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
            yield { type: "content_block_stop", index: 0 };
          },
          async finalMessage() {
            return { stop_reason: "end_turn", content: [{ type: "text", text }] };
          },
        };
      },
    },
  },
}));
chat.setDepsForTests({ config: () => ({ anthropicKey: "test-key", claudeModel: "claude-test" }), getWeather: async () => null });

let server;
let base;
after(() => {
  server.close();
  globalThis.fetch = realFetch;
  accounts.setDepsForTests({});
  chat.setClientFactory(null);
  chat.setDepsForTests({});
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, url, { body, cookie, headers = {} } = {}) {
  const res = await realFetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON (the chat's stream)
  }
  return { status: res.status, json, text, cookies: res.headers.getSetCookie(), retryAfter: res.headers.get("retry-after") };
}

const cookieOf = (lines, name) => lines.map((line) => line.split(";")[0]).find((part) => part.startsWith(`${name}=`));
const DEMO_HEADER = { "X-Chernozem-View": "demo" };
const KEY = "demo-test-owners-key-2026";
const DEMO = { required: true, signedIn: false, shared: true, account: null, mode: "demo", readOnly: true };
const OWNER = { required: true, signedIn: true, shared: true, account: null, mode: "owner", readOnly: false };

async function waitForJob(id, cookie) {
  for (let i = 0; i < 400; i += 1) {
    const { json } = await call("GET", `/api/jobs/${id}`, { cookie });
    if (json.job.status !== "running") return json.job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

// Every file under the data folder with a hash of its bytes.
function snapshot() {
  const files = {};
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(dir, full)] = createHash("sha1").update(fs.readFileSync(full)).digest("hex");
    }
  };
  walk(dir);
  return files;
}

// ---------- The demo workspace, made with no key set ----------

const made = {};
let ownerCookie;
let accountCookie;

before(async () => {
  server = http.createServer(async (req, res) => {
    if (!(await handleApi(req, res))) {
      res.statusCode = 404;
      res.end("not api");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const area = await call("POST", "/api/areas", { body: { source: "bbox", name: "Demo box", north: 49.8, south: 49.6, east: 37.8, west: 37.5 } });
  assert.equal(area.status, 201, area.text);
  made.areaId = area.json.area.id;
  const analysis = await call("POST", "/api/analyze", { body: { areaId: made.areaId, months: 1 } });
  made.job = await waitForJob(analysis.json.job.id);
  assert.equal(made.job.status, "done", made.job.error);
  made.runId = made.job.runIds[0];
  assert.equal((await call("PATCH", "/api/workspace", { body: { currentAreaId: made.areaId } })).status, 200);
  made.member = (await call("POST", "/api/team", { body: { name: "Olena P.", email: "olena@example.org" } })).json.member;
  const farm = await call("POST", "/api/farm/demo", { body: { example: "ukraine" } });
  assert.equal(farm.status, 201, farm.text);
  assert.equal((await waitForJob(farm.json.job.id)).status, "done");
  made.fieldId = farm.json.farm.fields[0].id;
  made.report = (await call("POST", "/api/farm/reports", { body: { kind: "hail", text: "Hail on the north field." } })).json.report;
  made.message = (await call("POST", "/api/contact", { body: { name: "Sam", email: "sam@example.org", message: "Can I see the demo?" } })).json.id;
  assert.ok(made.message);

  // Then the owner's key is set: the owner signs in with it, an account
  // registers (Field).
  process.env.ATLAS_ACCESS_CODE = KEY;
  auth.resetLoginLimits();
  const login = await call("POST", "/api/auth/login", { body: { code: KEY } });
  assert.equal(login.status, 200);
  ownerCookie = cookieOf(login.cookies, "atlas_session");
  const signedIn = await call("POST", "/api/auth/firebase", { body: { idToken: "fake:DemoTestUID1" } });
  assert.equal(signedIn.status, 200, signedIn.text);
  accountCookie = cookieOf(signedIn.cookies, "chernozem_account");
  assert.equal((await call("PUT", "/api/account", { cookie: accountCookie, body: { name: "Farmer", role: "farmer", product: "field" } })).status, 200);
});

// ---------- Reading ----------

test("a visitor without a cookie reads the demo: the farm, the workspace, the areas, the months, the status", async () => {
  assert.deepEqual((await call("GET", "/api/auth/status")).json, DEMO);
  const farm = await call("GET", "/api/farm");
  assert.equal(farm.status, 200);
  assert.ok(farm.json.farm.fields.length > 0, "the example farm");
  const workspace = await call("GET", "/api/workspace");
  assert.equal(workspace.status, 200);
  assert.equal(workspace.json.workspace.currentAreaId, made.areaId);
  assert.equal(workspace.json.workspace.team[0].name, "Olena P.");
  assert.equal(workspace.json.workspace.team[0].email, "", "the team's e-mail addresses are never shown to the public");
  assert.equal((await call("GET", "/api/workspace", { cookie: ownerCookie })).json.workspace.team[0].email, "olena@example.org", "the owner sees them");
  assert.deepEqual((await call("GET", "/api/areas")).json.areas.map((area) => area.id), [made.areaId]);
  assert.equal((await call("GET", `/api/areas/${made.areaId}`)).status, 200);
  assert.equal((await call("GET", `/api/runs?areaId=${made.areaId}`)).json.runs.length, 1);
  assert.equal((await call("GET", `/api/runs/${made.runId}`)).status, 200);
  const status = await call("GET", "/api/status");
  assert.equal(status.status, 200);
  assert.equal(status.json.provider.id, "sample");
  assert.equal(status.json.mail, undefined, "where the e-mails go is the owner's business");
  for (const url of ["/api/jobs", `/api/farm/fields/${made.fieldId}/analysis`, "/api/farm/reports", "/api/farm/export/fields.geojson", "/api/chats?product=field"]) {
    assert.equal((await call("GET", url)).status, 200, url);
  }
  // A current area whose file is gone is left out of the answer, never written back.
  const file = path.join(dir, "workspace.json");
  const saved = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(saved), currentAreaId: "area-gone0000" }));
  try {
    assert.equal((await call("GET", "/api/workspace")).json.workspace.currentAreaId, null);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).currentAreaId, "area-gone0000", "not saved by the demo");
  } finally {
    fs.writeFileSync(file, saved);
  }
});

// ---------- Changing: never ----------

// Every route that changes something, with a body that would work.
const WRITES = () => [
  // server/app.js
  ["POST", "/api/areas", { source: "bbox", name: "Another box", north: 50.1, south: 50, east: 30.1, west: 30 }],
  ["PATCH", `/api/areas/${made.areaId}`, { name: "Renamed" }],
  ["DELETE", `/api/areas/${made.areaId}`],
  ["PATCH", "/api/workspace", { name: "Changed office", settings: { gatePercentile: 30 } }],
  ["POST", "/api/team", { name: "Someone New" }],
  ["PATCH", `/api/team/${made.member.id}`, { name: "Renamed" }],
  ["DELETE", `/api/team/${made.member.id}`],
  ["POST", "/api/analyze", { areaId: made.areaId, months: 1, rerun: true }],
  ["POST", `/api/jobs/${made.job.id}/cancel`],
  // server/field/routes.js
  ["PUT", "/api/farm", { fields: [] }],
  ["PATCH", "/api/farm", { name: "My farm now" }],
  ["DELETE", "/api/farm"],
  ["POST", "/api/farm/demo", { example: "iowa" }],
  ["POST", "/api/farm/detect", { source: "point", lat: 49.7, lon: 37.6 }],
  ["POST", "/api/farm/analyze", {}],
  ["POST", "/api/farm/fields", { geometry: { type: "Polygon", coordinates: [[[37.6, 49.7], [37.61, 49.7], [37.61, 49.71], [37.6, 49.71], [37.6, 49.7]]] } }],
  ["PATCH", `/api/farm/fields/${made.fieldId}`, { crop: "Wheat" }],
  ["DELETE", `/api/farm/fields/${made.fieldId}`],
  ["POST", "/api/farm/reports", { kind: "fire", text: "A fire." }],
  // and any other change, known or not
  ["POST", "/api/nothing-here", {}],
];

test("every change in the demo answers 403 demo_read_only with the owner's sentence; no job starts and not one file changes", async () => {
  const before = snapshot();
  const jobs = (await call("GET", "/api/jobs", { cookie: ownerCookie })).json.jobs.length;
  // A visitor without a cookie, a changed owner cookie, and an account
  // with the demo header: all the demo.
  for (const who of [{}, { cookie: `${ownerCookie}x` }, { cookie: accountCookie, headers: DEMO_HEADER }]) {
    for (const [method, url, body] of WRITES()) {
      const res = await call(method, url, { body, ...who });
      const label = `${method} ${url} ${JSON.stringify(who).slice(0, 30)}`;
      assert.equal(res.status, 403, `${label}: ${res.status} ${res.text.slice(0, 120)}`);
      assert.deepEqual(res.json, { error: { code: "demo_read_only", message: DEMO_READ_ONLY_MESSAGE } }, label);
    }
  }
  assert.equal(DEMO_READ_ONLY_MESSAGE, "This is the demo, so it can't be changed. Register to do this on your own land.");
  assert.equal((await call("GET", "/api/jobs", { cookie: ownerCookie })).json.jobs.length, jobs, "no job was started");
  assert.deepEqual(snapshot(), before, "not one file changed");
  // The account routes answer for themselves: the demo is not an account.
  const profile = await call("PUT", "/api/account", { body: { name: "x", role: "farmer", product: "field" } });
  assert.equal(profile.status, 401);
  assert.equal(profile.json.error.code, "auth_required");
});

test("no job can start inside a demo request, whatever asks; the monthly check is never taken for the demo's", async () => {
  const demo = { kind: "demo", readOnly: true };
  await assert.rejects(withSession(demo, () => startAnalysis({ areaId: made.areaId, months: 1 })), (error) => error.code === "demo_read_only" && error.status === 403);
  assert.throws(() => withSession(demo, () => startJob({ kind: "field-analyze", run: async () => null })), (error) => error.code === "demo_read_only");
  assert.equal(withSession(demo, () => isDemoSession()), true);
  assert.equal(withSession(demo, () => outsideSession(() => isDemoSession())), false, "the monthly check runs as nobody's");
  assert.equal(isDemoSession(), false);
});

// ---------- The owner's alone ----------

test("the website's messages are the owner's: 403 owner_only for the demo and for an account; the owner reads them with their mail status", async () => {
  for (const who of [{}, { cookie: accountCookie }, { cookie: accountCookie, headers: DEMO_HEADER }]) {
    for (const [method, url] of [["GET", "/api/messages"], ["DELETE", `/api/messages/${made.message}`]]) {
      const res = await call(method, url, who);
      assert.equal(res.status, 403, `${method} ${url}`);
      assert.equal(res.json.error.code, "owner_only", `${method} ${url}`);
    }
  }
  assert.ok(fs.existsSync(path.join(dir, "messages", `${made.message}.json`)), "not removed");
  for (const headers of [{}, DEMO_HEADER]) {
    const list = await call("GET", "/api/messages", { cookie: ownerCookie, headers });
    assert.equal(list.status, 200, "the owner, with or without the demo header");
    assert.equal(list.json.messages[0].id, made.message);
    assert.equal(list.json.messages[0].mail.status, "off", "no e-mail set up in the tests");
  }
  // Where the e-mails go: the owner's status says so, without secrets.
  const status = await call("GET", "/api/status", { cookie: ownerCookie });
  assert.deepEqual(status.json.mail, { configured: false, transport: "off", to: "chernozem.app@gmail.com" });
});

// ---------- Who is asking: the demo header ----------

test("the demo header: an account's request becomes the demo's, read-only, both products; the owner stays the owner; an account without it reads its own folder", async () => {
  // The account without the header: its own, empty folder, its one product.
  assert.equal((await call("GET", "/api/auth/status", { cookie: accountCookie })).json.mode, "account");
  assert.equal((await call("GET", "/api/farm", { cookie: accountCookie })).json.farm, null, "a fresh account has no farm");
  assert.equal((await call("GET", "/api/workspace", { cookie: accountCookie })).json.error.code, "wrong_product");
  assert.equal((await call("PATCH", "/api/farm", { cookie: accountCookie, body: { name: "x" } })).json.error.code, "no_farm", "its own farm: none yet, but it may change it");

  // With the header: the demo's own data, read-only, Atlas too.
  assert.deepEqual((await call("GET", "/api/auth/status", { cookie: accountCookie, headers: DEMO_HEADER })).json, DEMO);
  assert.ok((await call("GET", "/api/farm", { cookie: accountCookie, headers: DEMO_HEADER })).json.farm.fields.length > 0);
  assert.equal((await call("GET", "/api/workspace", { cookie: accountCookie, headers: { "x-chernozem-view": "DEMO" } })).json.workspace.currentAreaId, made.areaId, "any capitals");
  assert.equal((await call("GET", "/api/account", { cookie: accountCookie, headers: DEMO_HEADER })).status, 401, "the account is ignored for that request");
  // Plain links (downloads, photos) say "?view=demo" instead of the header:
  // the same for reads, and never for a change.
  assert.equal((await call("GET", "/api/workspace?view=demo", { cookie: accountCookie })).json.workspace.currentAreaId, made.areaId, "a read with ?view=demo is the demo's");
  assert.equal((await call("GET", "/api/farm/export/fields.geojson?view=demo", { cookie: accountCookie })).status, 200, "the demo farm's download");
  assert.equal((await call("PATCH", "/api/farm?view=demo", { cookie: accountCookie, body: { name: "x" } })).json.error.code, "no_farm", "a change ignores ?view=demo: still the account's own (empty) farm");

  // The owner with the header: still the owner.
  assert.deepEqual((await call("GET", "/api/auth/status", { cookie: ownerCookie, headers: DEMO_HEADER })).json, OWNER);
  assert.equal((await call("PATCH", "/api/workspace", { cookie: ownerCookie, headers: DEMO_HEADER, body: { budgetUsd: 1000 } })).status, 200);
  assert.equal((await call("GET", "/api/status", { cookie: ownerCookie })).json.mail.to, "chernozem.app@gmail.com");

  // Without a key at all (one's own computer) the header gives the demo too.
  process.env.ATLAS_ACCESS_CODE = "";
  try {
    assert.deepEqual((await call("GET", "/api/auth/status", { headers: DEMO_HEADER })).json, { ...DEMO, required: false });
    assert.equal((await call("PATCH", "/api/workspace", { headers: DEMO_HEADER, body: { name: "x" } })).status, 403);
    assert.equal((await call("GET", "/api/auth/status")).json.mode, "open");
  } finally {
    process.env.ATLAS_ACCESS_CODE = KEY;
  }
});

test("the header only looks: an account's Sign out with it still ends the account everywhere", async () => {
  const signedIn = await call("POST", "/api/auth/firebase", { body: { idToken: "fake:DemoTestUID2" } });
  const cookie = cookieOf(signedIn.cookies, "chernozem_account");
  const out = await call("POST", "/api/auth/logout", { cookie, headers: DEMO_HEADER });
  assert.deepEqual(out.json, { ok: true, ...DEMO });
  assert.ok(revoked.includes("DemoTestUID2"));
  assert.equal((await call("GET", "/api/account", { cookie })).status, 401);
});

test("what each kind of visitor is called (statusOf, wantsDemoView)", () => {
  const req = (value) => ({ headers: value === undefined ? {} : { "x-chernozem-view": value } });
  assert.equal(auth.wantsDemoView(req("demo")), true);
  assert.equal(auth.wantsDemoView(req(" Demo ")), true);
  assert.equal(auth.wantsDemoView(req(["demo", "other"])), true);
  for (const value of [undefined, "", "owner", "demo please"]) assert.equal(auth.wantsDemoView(req(value)), false, String(value));
  assert.equal(auth.DEMO_VIEW_HEADER, "X-Chernozem-View", "the same as src/lib/demoMode.js");
  const account = { uid: "u", email: null, name: "", product: null, profileComplete: false };
  assert.deepEqual(auth.statusOf({ kind: "account", account }, true), { required: true, signedIn: true, shared: false, account, mode: "account", readOnly: false });
  assert.deepEqual(auth.statusOf({ kind: "owner", account: null }, true), OWNER);
  assert.deepEqual(auth.statusOf({ kind: "open", account: null }, false), { required: false, signedIn: true, shared: true, account: null, mode: "open", readOnly: false });
  assert.deepEqual(auth.statusOf({ kind: "demo", account: null }, true), DEMO);
});

// ---------- The demo's AI assistant ----------

const threadOf = (text) => JSON.parse(/event: thread\ndata: (.*)\n/.exec(text)[1]).threadId;

test("the demo's assistant: each visitor's chats in memory only, never on disk, and its three limits", async () => {
  setQuotasForTests({ demoChatPerVisitor: 3, demoChatPerAddress: 5, demoChatPerDay: 7, demoChatMessages: 4 });
  resetDemoChats();
  process.env.ATLAS_TRUST_PROXY = "1";
  const before = snapshot();
  const from = (address, cookie) => ({ cookie, headers: { "X-Forwarded-For": address } });
  const ask = (who, body = {}) => call("POST", "/api/chat", { ...who, body: { product: "atlas", message: "Where should restoration start?", ...body } });
  try {
    // Visitor A, at the first address: three questions in one chat.
    const first = await ask(from("203.0.113.1"));
    assert.equal(first.status, 200);
    assert.match(first.text, /event: done/);
    const line = first.cookies.find((cookie) => cookie.startsWith("chernozem_demo="));
    assert.match(line, /^chernozem_demo=[A-Za-z0-9_-]{22}; Path=\/; Max-Age=86400; HttpOnly; SameSite=Lax$/);
    const a = cookieOf(first.cookies, "chernozem_demo");
    const threadId = threadOf(first.text);
    assert.equal((await ask(from("203.0.113.1", a), { threadId })).status, 200);
    const third = await ask(from("203.0.113.1", a), { threadId });
    assert.equal(cookieOf(third.cookies, "chernozem_demo"), a, "the same visitor (the cookie is renewed)");

    // The chat is A's alone, kept to its last 4 messages.
    const thread = (await call("GET", `/api/chats/${threadId}`, { cookie: a })).json.thread;
    assert.equal(thread.messages.length, 4);
    assert.deepEqual(thread.messages.map((message) => message.role), ["user", "assistant", "user", "assistant"]);
    assert.deepEqual((await call("GET", "/api/chats?product=atlas", { cookie: a })).json.threads.map((item) => item.id), [threadId]);
    assert.deepEqual((await call("GET", "/api/chats?product=field", { cookie: a })).json.threads, []);
    assert.deepEqual((await call("GET", "/api/chats?product=atlas")).json.threads, [], "a visitor without the cookie sees none");
    assert.deepEqual((await call("GET", `/api/chats/${threadId}`)).json, { thread: null });
    assert.deepEqual((await call("GET", "/api/chats?product=atlas", { cookie: ownerCookie })).json.threads, [], "nor does the owner: nothing was saved");

    // Limit 1: three questions per visitor.
    const fourth = await ask(from("203.0.113.1", a), { threadId });
    assert.equal(fourth.status, 429);
    assert.deepEqual(fourth.json, { error: { code: "quota", message: DEMO_QUOTA_MESSAGE } });
    assert.equal(DEMO_QUOTA_MESSAGE, "The demo's assistant has answered enough questions for now. Register to ask about your own land.");
    assert.ok(Number(fourth.retryAfter) > 23 * 3600, `retry after ${fourth.retryAfter}s`);

    // Limit 2: five per address, whatever the cookie (B dropped A's).
    const b1 = await ask(from("203.0.113.1"));
    const b = cookieOf(b1.cookies, "chernozem_demo");
    assert.notEqual(b, a);
    assert.equal((await ask(from("203.0.113.1", b))).status, 200);
    assert.equal((await ask(from("203.0.113.1", b))).status, 429, "the address's fifth question was the last");
    assert.deepEqual((await call("GET", `/api/chats/${threadId}`, { cookie: b })).json, { thread: null }, "B never sees A's chat");

    // Limit 3: seven for the whole demo.
    assert.equal((await ask(from("198.51.100.7"))).status, 200);
    assert.equal((await ask(from("198.51.100.8"))).status, 200);
    assert.equal((await ask(from("198.51.100.9"))).status, 429, "the demo's seventh question was the last");
    assert.equal(asked.length >= 7, true);

    // A removes the chat (in memory); B cannot remove it.
    assert.equal((await call("DELETE", `/api/chats/${threadId}`, { cookie: b })).status, 404);
    assert.equal((await call("DELETE", `/api/chats/${threadId}`, { cookie: a })).status, 200);
    assert.deepEqual((await call("GET", "/api/chats?product=atlas", { cookie: a })).json.threads, []);

    assert.deepEqual(snapshot(), before, "nothing a demo visitor asked was written to disk");

    // Behind https the cookie is Secure.
    setQuotasForTests();
    resetDemoChats();
    const secure = await call("POST", "/api/chat", { headers: { "X-Forwarded-Proto": "https" }, body: { product: "field", message: "How is the north field?" } });
    assert.match(secure.cookies.find((cookie) => cookie.startsWith("chernozem_demo=")), /; Secure$/);
  } finally {
    process.env.ATLAS_TRUST_PROXY = "";
    setQuotasForTests();
    resetDemoChats();
  }
});

test("the demo's memory keeps few chats, few messages and few visitors, and forgets a chat 24 hours after its last message", async () => {
  let t = Date.UTC(2026, 9, 31, 8, 0);
  setQuotasForTests({ demoChatThreads: 2, demoChatMessages: 3, demoChatVisitors: 2 });
  resetDemoChats({ clock: () => t });
  try {
    const store = { getFarm: async () => null };
    const one = demoChatStore(store, "visitorOne_____________".slice(0, 22));
    const chatOf = (id, count) => ({ id, product: "atlas", title: id, updatedAt: new Date(t).toISOString(), messages: Array.from({ length: count }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", text: `text ${i}` })) });
    await one.saveChat(chatOf("chat-a", 1));
    t += 1000;
    await one.saveChat(chatOf("chat-b", 5));
    assert.deepEqual((await one.getChat("chat-b")).messages.map((message) => message.id), ["m2", "m3", "m4"], "the last 3 messages");
    t += 1000;
    await one.saveChat(chatOf("chat-c", 1));
    assert.deepEqual((await one.listChats("atlas")).map((item) => item.id).sort(), ["chat-b", "chat-c"], "2 chats: the one written in longest ago went");
    assert.equal(one.getFarm, store.getFarm, "every other read is the demo's own");

    // Two visitors at most: the one seen longest ago goes.
    const two = demoChatStore(store, "visitorTwo_____________".slice(0, 22));
    const three = demoChatStore(store, "visitorThree___________".slice(0, 22));
    await two.saveChat(chatOf("chat-two", 1));
    t += 1000;
    await three.saveChat(chatOf("chat-three", 1));
    assert.deepEqual(await one.listChats("atlas"), [], "the first visitor was forgotten");
    assert.equal(demoChatStats().visitors, 2);

    // 24 hours after the last message: gone.
    t += 24 * 60 * 60 * 1000;
    assert.equal(await three.getChat("chat-three"), null);
    assert.equal(await two.getChat("chat-two"), null);
    assert.deepEqual(demoChatStats(), { visitors: 0, threads: 0 }, "swept out of memory");
    assert.deepEqual(await demoChatStore(store, null).listChats("atlas"), [], "no visitor: no chats");
  } finally {
    setQuotasForTests();
    resetDemoChats();
  }
});

// ---------- The demo's reads cost nothing paid ----------

test("the demo's reads cost nothing paid: no Earth Engine region search, no GeoTIFF, a limited place search, a throttled weather refresh", async () => {
  // A stand-in for Earth Engine that counts the region searches.
  let searches = 0;
  resetProvider();
  Object.assign(globalThis.__chernozemProvider, {
    key: "sample:true:",
    provider: { id: "gee", label: "Earth Engine (test)", searchAdmin1: async () => (searches += 1, [{ id: "3154", name: "Kharkiv oblast", country: "Ukraine" }]) },
    detail: "test",
    fallback: false,
    checkedAt: Date.now(),
  });
  try {
    const demo = await call("GET", "/api/areas/search?q=Kharkiv");
    assert.equal(demo.status, 200);
    assert.equal(demo.json.results.some((result) => result.kind === "admin1"), false, "countries only");
    assert.equal(searches, 0, "Earth Engine was not asked");
    const owner = await call("GET", "/api/areas/search?q=Kharkiv", { cookie: ownerCookie });
    assert.ok(owner.json.results.some((result) => result.kind === "admin1"), "the owner gets the regions");
    assert.equal(searches, 1);
  } finally {
    resetProvider();
  }

  // GeoTIFF: Earth Engine would make it.
  const tiff = await call("GET", `/api/farm/fields/${made.fieldId}/geotiff`);
  assert.equal(tiff.status, 403);
  assert.deepEqual(tiff.json, { error: { code: "demo_read_only", message: DEMO_GEOTIFF_MESSAGE } });

  // The place search: typed coordinates and names already looked up are
  // free; other names are counted per address and for the whole demo.
  setQuotasForTests({ demoPlaceSearchesPerHour: 2, demoPlaceSearchesPerHourAll: 3 });
  resetDemoPlaceSearches();
  process.env.ATLAS_TRUST_PROXY = "1";
  const place = (q, address = "203.0.113.20") => call("GET", `/api/geocode?q=${encodeURIComponent(q)}`, { headers: { "X-Forwarded-For": address } });
  try {
    const start = outside.places;
    assert.equal((await place("49.71, 37.61")).status, 200);
    assert.equal(outside.places, start, "coordinates: no lookup");
    assert.equal((await place("Kupiansk demo one")).status, 200);
    assert.equal((await place("Kupiansk demo two")).status, 200);
    assert.equal((await place("Kupiansk demo one")).status, 200, "looked up already: free");
    assert.equal(outside.places, start + 2);
    const over = await place("Kupiansk demo three");
    assert.equal(over.status, 429);
    assert.deepEqual(over.json, { error: { code: "quota", message: DEMO_PLACES_MESSAGE } });
    assert.equal((await place("Kupiansk demo four", "198.51.100.30")).status, 200, "another address");
    assert.equal((await place("Kupiansk demo five", "198.51.100.31")).status, 429, "the whole demo's third lookup was the last");
    assert.equal((await place("50.0, 36.2", "198.51.100.31")).status, 200, "coordinates still work");
    assert.equal((await call("GET", "/api/geocode?q=Kupiansk%20demo%20seven", { cookie: ownerCookie })).status, 200, "the owner is not counted");
  } finally {
    process.env.ATLAS_TRUST_PROXY = "";
    setQuotasForTests();
    resetDemoPlaceSearches();
  }

  // The weather: the hour-old answer for everyone; once it has run out,
  // the demo asks Open-Meteo at most once in 10 minutes.
  const cacheFile = path.join(dir, "weather-cache.json");
  // The answer kept (by the farm's analysis, or by nobody yet) made two hours old.
  const ageCache = () => {
    if (fs.existsSync(cacheFile)) fs.writeFileSync(cacheFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(cacheFile, "utf8")), at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }));
  };
  resetWeatherThrottle();
  ageCache();
  const before = outside.weather;
  const fresh = await call("GET", "/api/farm/weather");
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.stale, false);
  assert.equal(outside.weather, before + 1, "run out: the demo asks Open-Meteo once");
  const asks = outside.weather;
  ageCache();
  outside.weatherDown = true;
  try {
    for (let i = 0; i < 3; i += 1) {
      const stale = await call("GET", "/api/farm/weather");
      assert.equal(stale.status, 200);
      assert.equal(stale.json.stale, true, "the last answer, marked stale");
    }
    assert.equal(outside.weather, asks, "Open-Meteo was asked at most once in 10 minutes (once already, just now)");
    assert.equal((await call("GET", "/api/farm/weather", { cookie: ownerCookie })).json.stale, true);
    assert.equal(outside.weather, asks + 1, "the owner's page asks as before");
  } finally {
    outside.weatherDown = false;
    resetWeatherThrottle();
  }
});
