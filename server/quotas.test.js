// WHAT THIS FILE DOES
// Tests what one registered account may do (server/quotas.js, applied in
// server/app.js, server/field/routes.js and server/ai/chat.js) on a real
// local port with a temporary data folder and sample data: at most 5
// areas, none larger than 1,000,000 km², drawn with at most 1,000 points;
// one Atlas analysis at a time of at most 12 months; the monthly update
// off until switched on; the AI chat's daily allowance; one Field job at a
// time and 2 searches or updates an hour; at most 30 reports and 40 MB of
// photos, which must be real pictures. And, every time, that the shared
// demo is not limited. Firebase is stood in for, so it runs offline. Run
// with "npm test".
//
// WHO EDITS IT
// Whoever changes quotas.js or a limit's use.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-quotas-"));
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
const { QUOTAS, setQuotasForTests, spend, inWords, sizeWords } = await import("./quotas.js");
const { startJob } = await import("./jobs.js");
const { userRoot, withDataRoot } = await import("./store.js");

// Small real pictures (the same shapes as in field/images.test.js): a 1 x 1
// PNG, a PNG header of any size, the smallest JPEG, a lossless WebP header.
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
function pngOf(width, height) {
  const b = Buffer.from(PNG_1x1);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
function jpegOf(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.alloc(19);
  sof0.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0.set([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01], 9);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, sos, Buffer.from([0xff, 0xd9])]);
}
function webpLosslessOf(width, height) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8L", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b[20] = 0x2f;
  b.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return b;
}

// Firebase stood in for: every token "fake:{...}" is good, every account
// exists.
accounts.setDepsForTests({
  verifyIdToken: (idToken) => {
    if (idToken.startsWith("fake:")) return JSON.parse(idToken.slice(5));
    throw Object.assign(new Error("bad"), { code: "auth/argument-error" });
  },
  getUser: (uid) => ({ uid, disabled: false }),
  revokeRefreshTokens: () => {},
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
  globalThis.fetch = realFetch;
  setQuotasForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, url, { body, cookie } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, text };
}

// Signs in as uid, chooses the product, and gives back the account cookie
// (the "name=value" part of its Set-Cookie line).
async function cookieFor(uid, product) {
  const token = `fake:${JSON.stringify({ uid, email: `${uid.toLowerCase()}@example.com` })}`;
  const res = await fetch(`${base}/api/auth/firebase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }) });
  assert.equal(res.status, 200);
  const cookie = res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .find((part) => part.startsWith("chernozem_account="));
  const saved = await call("PUT", "/api/account", { cookie, body: { name: uid, role: "other", product } });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  return cookie;
}

async function waitForJob(id, cookie) {
  for (let i = 0; i < 800; i += 1) {
    const { json } = await call("GET", `/api/jobs/${id}`, { cookie });
    if (json.job.status !== "running") return json.job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

// A small box near Kharkiv, shifted by i so each one is a different area.
const box = (i, name = `Box ${i}`) => ({ source: "bbox", name, north: 49.9 + i * 0.3, south: 49.8 + i * 0.3, east: 36.4, west: 36.3 });

// A ring of n points about a kilometre across, as [lat, lon] pairs.
function ringOf(n, lat = 49.7, lon = 36.3) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [Number((lat + 0.01 * Math.sin(a)).toFixed(7)), Number((lon + 0.015 * Math.cos(a)).toFixed(7))];
  });
}

const countryId = async (name) => (await call("GET", `/api/areas/search?q=${encodeURIComponent(name)}`)).json.results.find((r) => r.name === name).id;

// ---------- The module itself ----------

test("spend counts uses per account inside a window; outside an account's folder everything is allowed", async () => {
  setQuotasForTests();
  assert.deepEqual(spend("thing", 1, 1000, 0), { ok: true }, "the base folder: never limited");
  assert.deepEqual(spend("thing", 1, 1000, 0), { ok: true });
  await withDataRoot(userRoot("spend-test-1"), () => {
    assert.deepEqual(spend("thing", 2, 1000, 1000), { ok: true });
    assert.deepEqual(spend("thing", 2, 1000, 1200), { ok: true });
    assert.deepEqual(spend("thing", 2, 1000, 1500), { ok: false, retryAfterMs: 500 }, "the third within the window waits for the first to age out");
    assert.deepEqual(spend("thing", 2, 1000, 2000), { ok: true }, "the first has aged out");
    assert.deepEqual(spend("other", 2, 1000, 2000), { ok: true }, "another kind has its own count");
  });
  await withDataRoot(userRoot("spend-test-2"), () => {
    assert.deepEqual(spend("thing", 2, 1000, 2000), { ok: true }, "another account has its own count");
  });
  assert.equal(inWords(30 * 1000), "in a minute");
  assert.equal(inWords(12 * 60 * 1000), "in 12 minutes");
  assert.equal(inWords(61 * 60 * 1000), "in 2 hours");
  assert.equal(sizeWords(40 * 1024 * 1024), "40 MB");
  assert.equal(sizeWords(3.75 * 1024 * 1024), "3.8 MB");
  assert.equal(sizeWords(512 * 1024), "512 KB");
  assert.equal(QUOTAS.areas, 5);
  setQuotasForTests({ areas: 1 });
  assert.equal(QUOTAS.areas, 1);
  setQuotasForTests();
  assert.equal(QUOTAS.areas, 5);
});

// ---------- Atlas ----------

test("areas: an account keeps 5, none larger than 1,000,000 km², drawn with at most 1,000 points; the demo has no such limits", async () => {
  const cookie = await cookieFor("QuotaAtlas001", "atlas");

  // Too large: Russia (16.9 million km²), with a sentence that says the limit.
  const russia = await call("POST", "/api/areas", { cookie, body: { source: "country", id: await countryId("Russia") } });
  assert.equal(russia.status, 400, JSON.stringify(russia.json));
  assert.equal(russia.json.error.code, "too_big");
  assert.match(russia.json.error.message, /Russia is too large for an account: 16,890,466 km² in 740 squares\. An account's area can be 1,000,000 km² .* and 1,500 squares at most/);
  assert.deepEqual((await call("GET", "/api/areas", { cookie })).json.areas, [], "nothing was saved");

  // Ukraine (598,457 km²) fits, and four boxes.
  const ukraine = await call("POST", "/api/areas", { cookie, body: { source: "country", id: await countryId("Ukraine") } });
  assert.equal(ukraine.status, 201, JSON.stringify(ukraine.json));
  for (let i = 1; i <= 4; i += 1) assert.equal((await call("POST", "/api/areas", { cookie, body: box(i) })).status, 201, `box ${i}`);
  assert.equal((await call("GET", "/api/areas", { cookie })).json.areas.length, 5);

  // The sixth is refused; an area already kept (the same country again) is
  // simply given back; after removing one, a sixth fits.
  const sixth = await call("POST", "/api/areas", { cookie, body: box(5) });
  assert.equal(sixth.status, 429, JSON.stringify(sixth.json));
  assert.deepEqual(sixth.json.error, { code: "quota", message: "An account can keep 5 areas; delete one first." });
  const sameAgain = await call("POST", "/api/areas", { cookie, body: { source: "country", id: await countryId("Ukraine") } });
  assert.equal(sameAgain.status, 201);
  assert.equal(sameAgain.json.area.id, ukraine.json.area.id);
  assert.equal((await call("GET", "/api/areas", { cookie })).json.areas.length, 5);
  assert.equal((await call("DELETE", `/api/areas/${ukraine.json.area.id}`, { cookie })).status, 200);
  assert.equal((await call("POST", "/api/areas", { cookie, body: box(5) })).status, 201);
  assert.equal((await call("GET", "/api/areas", { cookie })).json.areas.length, 5);

  // Points: 1,001 corners are too many for an account (the demo takes 5,000).
  const many = await call("POST", "/api/areas", { cookie, body: { source: "draw", name: "Many", points: ringOf(1001) } });
  assert.equal(many.status, 400);
  assert.match(many.json.error.message, /Too many points \(the limit is 1,000\)/);
  assert.equal((await call("POST", "/api/areas", { cookie, body: { source: "coordinates", name: "Many", points: ringOf(1001) } })).status, 400);

  // The demo: six boxes, Russia, and 1,001 points are all fine.
  for (let i = 0; i < 6; i += 1) assert.equal((await call("POST", "/api/areas", { body: box(i) })).status, 201, `demo box ${i}`);
  assert.equal((await call("POST", "/api/areas", { body: { source: "country", id: await countryId("Russia") } })).status, 201);
  assert.equal((await call("POST", "/api/areas", { body: { source: "draw", name: "Many", points: ringOf(1001) } })).status, 201);
  assert.equal((await call("GET", "/api/areas")).json.areas.length, 8);
});

test("analysis: an account runs one at a time (429 busy) and asks for at most 12 months; the demo's line is as before", async () => {
  const cookie = await cookieFor("QuotaAtlas002", "atlas");
  const ukraine = (await call("POST", "/api/areas", { cookie, body: { source: "country", id: await countryId("Ukraine") } })).json.area;
  const small = (await call("POST", "/api/areas", { cookie, body: box(1, "Small") })).json.area;

  // Too many months, whatever else is going on.
  const long = await call("POST", "/api/analyze", { cookie, body: { areaId: small.id, months: 13 } });
  assert.equal(long.status, 400);
  assert.deepEqual(long.json.error, { code: "quota", message: "An account can analyze 12 months at a time." });

  // One at a time: Ukraine's 12 months take a while; another area must wait
  // for it; Ukraine asked again joins its job.
  const started = await call("POST", "/api/analyze", { cookie, body: { areaId: ukraine.id, months: 12 } });
  assert.equal(started.status, 202, JSON.stringify(started.json));
  const other = await call("POST", "/api/analyze", { cookie, body: { areaId: small.id } });
  assert.equal(other.status, 429, JSON.stringify(other.json));
  assert.equal(other.json.error.code, "busy");
  assert.match(other.json.error.message, /Your other analysis \(Ukraine\) is still running/);
  const joined = await call("POST", "/api/analyze", { cookie, body: { areaId: ukraine.id } });
  assert.equal(joined.status, 202);
  assert.equal(joined.json.job.id, started.json.job.id);

  // Stopped (and ended): the other area may start.
  assert.equal((await call("POST", `/api/jobs/${started.json.job.id}/cancel`, { cookie })).status, 200);
  const ended = await waitForJob(started.json.job.id, cookie);
  assert.notEqual(ended.status, "running");
  const next = await call("POST", "/api/analyze", { cookie, body: { areaId: small.id, months: 1 } });
  assert.equal(next.status, 202, JSON.stringify(next.json));
  assert.equal((await waitForJob(next.json.job.id, cookie)).status, "done");

  // The demo: two areas at once (the second waits in line), 24 months.
  const a = (await call("POST", "/api/areas", { body: box(7, "Demo A") })).json.area;
  const b = (await call("POST", "/api/areas", { body: box(8, "Demo B") })).json.area;
  const first = await call("POST", "/api/analyze", { body: { areaId: a.id, months: 24 } });
  assert.equal(first.status, 202, JSON.stringify(first.json));
  const second = await call("POST", "/api/analyze", { body: { areaId: b.id, months: 2 } });
  assert.equal(second.status, 202, JSON.stringify(second.json));
  assert.equal((await waitForJob(first.json.job.id)).status, "done");
  assert.equal((await waitForJob(second.json.job.id)).status, "done");
});

test("a fresh account's workspace has the monthly update off (the person can switch it on); the demo's is on", async () => {
  const cookie = await cookieFor("QuotaAtlas003", "atlas");
  assert.equal((await call("GET", "/api/workspace", { cookie })).json.workspace.schedule.autoMonthly, false);
  assert.equal((await call("GET", "/api/status", { cookie })).json.scheduler.autoMonthly, false);
  const on = await call("PATCH", "/api/workspace", { cookie, body: { schedule: { autoMonthly: true } } });
  assert.equal(on.json.workspace.schedule.autoMonthly, true);
  assert.equal((await call("GET", "/api/workspace", { cookie })).json.workspace.schedule.autoMonthly, true, "kept");
  assert.equal((await call("GET", "/api/workspace")).json.workspace.schedule.autoMonthly, true, "the demo");
});

// ---------- The AI chat ----------

test("the AI chat: an account sends at most so many messages a day (429 quota); the demo is not limited", async () => {
  setQuotasForTests({ chatMessagesPerDay: 3 });
  try {
    const cookie = await cookieFor("QuotaChat0001", "atlas");
    for (let i = 1; i <= 3; i += 1) {
      const res = await call("POST", "/api/chat", { cookie, body: { product: "atlas", message: `hello ${i}` } });
      assert.equal(res.status, 200, `message ${i}`);
      assert.match(res.text, /ai_not_configured/, "no key here: the stream says so");
    }
    const fourth = await call("POST", "/api/chat", { cookie, body: { product: "atlas", message: "hello 4" } });
    assert.equal(fourth.status, 429, fourth.text);
    assert.equal(fourth.json.error.code, "quota");
    assert.match(fourth.json.error.message, /An account can send the AI 3 messages a day\. Try again in \d+ hours\./);
    // Reading conversations is not a message.
    assert.equal((await call("GET", "/api/chats?product=atlas", { cookie })).status, 200);
    // Another account has its own count; the demo has none.
    const otherCookie = await cookieFor("QuotaChat0002", "atlas");
    assert.equal((await call("POST", "/api/chat", { cookie: otherCookie, body: { product: "atlas", message: "hello" } })).status, 200);
    for (let i = 1; i <= 5; i += 1) assert.equal((await call("POST", "/api/chat", { body: { product: "atlas", message: `demo ${i}` } })).status, 200, `demo ${i}`);
  } finally {
    setQuotasForTests();
  }
});

// ---------- The Field ----------

test("the Field: an account runs one job at a time (429 busy), starts 2 searches and 2 updates an hour (429 quota), draws at most 1,000 points; the demo as before", async () => {
  const uid = "QuotaField001";
  const cookie = await cookieFor(uid, "field");
  const demoFarm = await call("POST", "/api/farm/demo", { cookie, body: { example: "ukraine" } });
  assert.equal(demoFarm.status, 201, JSON.stringify(demoFarm.json).slice(0, 200));
  assert.equal((await waitForJob(demoFarm.json.job.id, cookie)).status, "done");
  const field = { name: "Drawn", geometry: { type: "Polygon", coordinates: [ringOf(6, 49.72, 37.6).map(([lat, lon]) => [lon, lat])] } };
  const search = (i) => ({ source: "point", lat: 49.7 + i * 0.01, lon: 37.6, radiusM: 1000 });

  // While a job of the account runs, nothing that would start another begins.
  let release;
  const held = await withDataRoot(userRoot(uid), () => startJob({ kind: "field-analyze", key: "held", run: () => new Promise((resolve) => (release = resolve)) }));
  for (const [method, url, body] of [
    ["POST", "/api/farm/analyze", {}],
    ["POST", "/api/farm/detect", search(0)],
    ["POST", "/api/farm/fields", field],
    ["POST", "/api/farm/demo", { example: "iowa" }],
    ["PUT", "/api/farm", { fields: [field] }],
  ]) {
    const res = await call(method, url, { cookie, body });
    assert.equal(res.status, 429, `${method} ${url}: ${res.status} ${JSON.stringify(res.json)}`);
    assert.equal(res.json.error.code, "busy");
    assert.match(res.json.error.message, /Your other analysis is still running/);
  }
  assert.equal((await call("GET", "/api/farm", { cookie })).json.farm.fields.length, demoFarm.json.farm.fields.length, "nothing changed");
  release();
  assert.equal((await waitForJob(held.id, cookie)).status, "done");

  // Two "update now" an hour, then a plain refusal.
  for (let i = 1; i <= 2; i += 1) {
    const res = await call("POST", "/api/farm/analyze", { cookie, body: {} });
    assert.equal(res.status, 202, `update ${i}: ${JSON.stringify(res.json)}`);
    await waitForJob(res.json.job.id, cookie);
  }
  const third = await call("POST", "/api/farm/analyze", { cookie, body: {} });
  assert.equal(third.status, 429, JSON.stringify(third.json));
  assert.equal(third.json.error.code, "quota");
  assert.match(third.json.error.message, /An account can start 2 analyses on request an hour\. Try again in (an hour|\d+ minutes)\./);

  // Two searches an hour.
  for (let i = 1; i <= 2; i += 1) {
    const res = await call("POST", "/api/farm/detect", { cookie, body: search(i) });
    assert.equal(res.status, 202, `search ${i}: ${JSON.stringify(res.json)}`);
    await waitForJob(res.json.job.id, cookie);
  }
  const thirdSearch = await call("POST", "/api/farm/detect", { cookie, body: search(3) });
  assert.equal(thirdSearch.status, 429);
  assert.match(thirdSearch.json.error.message, /An account can start 2 searches for fields an hour/);

  // Outlines: 1,001 points are too many for an account; 999 are fine.
  const many = { ...field, geometry: { type: "Polygon", coordinates: [ringOf(1001, 49.72, 37.6).map(([lat, lon]) => [lon, lat])] } };
  const tooMany = await call("POST", "/api/farm/fields", { cookie, body: many });
  assert.equal(tooMany.status, 400, JSON.stringify(tooMany.json));
  assert.match(tooMany.json.error.message, /too many points \(the limit is 1,000\)/);
  const fine = await call("POST", "/api/farm/fields", { cookie, body: { ...field, geometry: { type: "Polygon", coordinates: [ringOf(999, 49.72, 37.6).map(([lat, lon]) => [lon, lat])] } } });
  assert.equal(fine.status, 201, JSON.stringify(fine.json));
  await waitForJob(fine.json.job.id, cookie);
  assert.equal((await call("POST", "/api/farm/detect", { cookie, body: { source: "boundary", points: ringOf(1001, 49.7, 37.6) } })).status, 400);

  // The demo: three updates and three searches in a row, 1,001 points.
  const demo = await call("POST", "/api/farm/demo", { body: { example: "ukraine" } });
  assert.equal(demo.status, 201);
  await waitForJob(demo.json.job.id);
  for (let i = 1; i <= 3; i += 1) {
    const update = await call("POST", "/api/farm/analyze", { body: {} });
    assert.equal(update.status, 202, `demo update ${i}`);
    await waitForJob(update.json.job.id);
    const found = await call("POST", "/api/farm/detect", { body: search(i) });
    assert.equal(found.status, 202, `demo search ${i}`);
    await waitForJob(found.json.job.id);
  }
  const drawn = await call("POST", "/api/farm/fields", { body: many });
  assert.equal(drawn.status, 201, JSON.stringify(drawn.json));
  await waitForJob(drawn.json.job.id);
});

const asPhoto = (buffer, type) => ({ ...(type ? { type } : {}), dataBase64: buffer.toString("base64") });

test("photos: an account's must be real JPEG, PNG or WebP pictures, at most 8,000 pixels a side, of the type they declare; the demo keeps the first-bytes check", async () => {
  const cookie = await cookieFor("QuotaPhoto001", "field");
  const refused = async (photo, why, pattern) => {
    const res = await call("POST", "/api/farm/reports", { cookie, body: { kind: "fire", text: why, photos: [photo] } });
    assert.equal(res.status, 400, `${why}: ${res.status} ${JSON.stringify(res.json)}`);
    assert.equal(res.json.error.code, "bad_photo", why);
    assert.match(res.json.error.message, pattern, why);
  };
  await refused(asPhoto(Buffer.concat([PNG_1x1.subarray(0, 8), Buffer.alloc(5000)])), "PNG magic plus junk", /Photo 1 is not a readable image/);
  await refused(asPhoto(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000)])), "JPEG magic plus junk", /not a readable image/);
  await refused(asPhoto(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(5000)])), "WebP magic plus junk", /not a readable image/);
  await refused(asPhoto(pngOf(8001, 100)), "too wide", /Photo 1 is 8,001 × 100 pixels; the limit is 8,000 pixels a side/);
  await refused(asPhoto(pngOf(100, 9000)), "too tall", /8,000 pixels a side/);
  await refused(asPhoto(PNG_1x1, "image/jpeg"), "says JPEG, is PNG", /Photo 1 says it is a JPEG, but the file is a PNG/);
  await refused(asPhoto(jpegOf(10, 10), "image/webp"), "says WebP, is JPEG", /says it is a WebP, but the file is a JPEG/);

  // Real pictures, with or without a declared type, are kept.
  const accepted = await call("POST", "/api/farm/reports", {
    cookie,
    body: { kind: "hail", text: "Real pictures", photos: [asPhoto(PNG_1x1, "image/png"), asPhoto(jpegOf(640, 480)), asPhoto(webpLosslessOf(8000, 8000), "image/webp"), asPhoto(pngOf(7999, 1))] },
  });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.json));
  assert.equal(accepted.json.report.photos.length, 4);

  // The demo: the first bytes decide, as before.
  const demo = await call("POST", "/api/farm/reports", { body: { kind: "fire", text: "Demo", photos: [asPhoto(Buffer.concat([PNG_1x1.subarray(0, 8), Buffer.alloc(5000)]), "image/jpeg")] } });
  assert.equal(demo.status, 201, JSON.stringify(demo.json));
  assert.equal((await call("POST", "/api/farm/reports", { body: { kind: "fire", photos: [asPhoto(Buffer.from("<svg/>"))] } })).json.error.code, "bad_photo", "still no SVG");
});

test("reports: an account keeps at most so many reports and so many bytes of photos (413 quota); the demo is not limited", async () => {
  // A "photo": a real PNG header followed by 100 KB (only the header is read).
  const photo = Buffer.concat([pngOf(1200, 800), Buffer.alloc(100 * 1024)]);
  const size = photo.length;
  // Ten photos fit; the eleventh does not. Twelve reports in all.
  setQuotasForTests({ reports: 11, uploadBytes: Math.floor(10.5 * size) });
  try {
    const cookie = await cookieFor("QuotaPhoto002", "field");
    for (let i = 1; i <= 10; i += 1) {
      const res = await call("POST", "/api/farm/reports", { cookie, body: { kind: "other", text: `Report ${i}`, photos: [asPhoto(photo)] } });
      assert.equal(res.status, 201, `report ${i}: ${JSON.stringify(res.json)}`);
    }
    const eleventh = await call("POST", "/api/farm/reports", { cookie, body: { kind: "other", text: "Report 11", photos: [asPhoto(photo)] } });
    assert.equal(eleventh.status, 413, JSON.stringify(eleventh.json));
    assert.equal(eleventh.json.error.code, "quota");
    assert.match(eleventh.json.error.message, /An account's photos can take 1\.0 MB in all; this farm's take 1001 KB already, and these would add 100 KB\. Send fewer or smaller photos\./);
    assert.equal((await call("GET", "/api/farm/reports", { cookie })).json.reports.length, 10, "nothing was saved");
    // Without a photo the eleventh report fits; the twelfth is one too many.
    assert.equal((await call("POST", "/api/farm/reports", { cookie, body: { kind: "other", text: "Report 11, no photo" } })).status, 201);
    const twelfth = await call("POST", "/api/farm/reports", { cookie, body: { kind: "other", text: "Report 12" } });
    assert.equal(twelfth.status, 413);
    assert.deepEqual(twelfth.json.error, { code: "quota", message: "An account can keep 11 reports, and this farm already has 11. Starting over (Settings) removes them." });
    // Starting over clears them, and the allowance with them.
    assert.equal((await call("DELETE", "/api/farm", { cookie })).status, 200);
    assert.equal((await call("POST", "/api/farm/reports", { cookie, body: { kind: "other", text: "Fresh", photos: [asPhoto(photo)] } })).status, 201);

    // The demo: thirteen reports with a photo each, no questions asked.
    for (let i = 1; i <= 13; i += 1) {
      const res = await call("POST", "/api/farm/reports", { body: { kind: "other", text: `Demo ${i}`, photos: [asPhoto(photo)] } });
      assert.equal(res.status, 201, `demo report ${i}`);
    }
  } finally {
    setQuotasForTests();
  }
});
