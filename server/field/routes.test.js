// WHAT THIS FILE DOES
// Smoke test of the Field API (server/field/routes.js through server/app.js)
// on a real local port, with a temporary data folder and sample data. The
// weather and place-search services are stood in for, so it runs offline.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever adds or changes a Field route.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-field-api-"));
process.env.CHERNOZEM_DATA_DIR = dir;
process.env.GEE_DISABLED = "1";
process.env.ATLAS_ACCESS_CODE = "";

// Outside services answered here; requests to this test server go through.
const realFetch = globalThis.fetch;
const outside = [];
globalThis.fetch = async (url, options) => {
  const text = String(url);
  if (text.startsWith("https://archive-api.open-meteo.com/")) {
    outside.push(text);
    const q = new URL(text).searchParams;
    const days = [];
    for (let d = Date.parse(`${q.get("start_date")}T00:00:00Z`); d <= Date.parse(`${q.get("end_date")}T00:00:00Z`); d += 86400000) days.push(new Date(d).toISOString().slice(0, 10));
    return new Response(JSON.stringify({ daily: { time: days, temperature_2m_max: days.map(() => 22), temperature_2m_min: days.map(() => 10) } }), { headers: { "content-type": "application/json" } });
  }
  if (text.startsWith("https://api.open-meteo.com/")) {
    outside.push(text);
    return new Response(
      JSON.stringify({
        current: { temperature_2m: 12.4, weather_code: 3 },
        hourly: { time: ["2026-10-18T00:00", "2026-10-18T01:00"], temperature_2m: [12, 12], relative_humidity_2m: [95, 95] },
        daily: {
          time: ["2026-10-18", "2026-10-19", "2026-10-20"],
          precipitation_sum: [0, 8, 3],
          precipitation_probability_max: [5, 85, 70],
          temperature_2m_max: [15, 12, 11],
          temperature_2m_min: [6, 7, 5],
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
  if (text.startsWith("https://nominatim.openstreetmap.org/")) {
    outside.push(text);
    return new Response(JSON.stringify([{ display_name: "Kupiansk, Kharkiv Oblast, Ukraine", lat: "49.71", lon: "37.61", boundingbox: ["49.67", "49.74", "37.57", "37.65"] }]), {
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(url, options);
};

const { handleApi } = await import("../app.js");

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
after(() => server.close());

async function call(method, url, body) {
  const res = await realFetch(base + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function waitForJob(id) {
  for (let i = 0; i < 400; i += 1) {
    const { json } = await call("GET", `/api/jobs/${id}`);
    if (json.job.status !== "running") return json.job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("no farm yet", async () => {
  const { status, json } = await call("GET", "/api/farm");
  assert.equal(status, 200);
  assert.equal(json.farm, null);
  assert.deepEqual(json.analyses, {});
  assert.equal(json.provider.id, "sample");
  assert.equal(json.job, null);
  assert.equal((await call("GET", "/api/farm/weather")).json.error.code, "no_farm");
});

test("the demo farm loads, is analysed, and shows 7 statuses", async () => {
  const demo = await call("POST", "/api/farm/demo");
  assert.equal(demo.status, 201);
  assert.equal(demo.json.farm.fields.length, 7);
  assert.equal(demo.json.farm.demo, true);
  assert.deepEqual(demo.json.farm.fields.map((f) => f.name), ["Field 1", "Field 2", "Field 3", "Field 4", "Field 5", "Field 6", "Field 7"]);
  // Placeholder crops until the analysis detects the real ones.
  assert.equal(demo.json.farm.fields[2].crop, "Corn");
  assert.equal(demo.json.farm.fields[2].cropSource, "demo");
  assert.equal(demo.json.farm.conflict.id, "ukraine-2022");
  const job = await waitForJob(demo.json.job.id);
  assert.equal(job.kind, "field-analyze");
  assert.equal(job.status, "done", job.error);
  const { json } = await call("GET", "/api/farm");
  assert.equal(Object.keys(json.analyses).length, 7);
  // Every crop is now the detected one (or none), with its source.
  for (const f of json.farm.fields) {
    const detected = json.analyses[f.id].cropDetected;
    assert.ok(detected && detected.id, f.name);
    assert.ok(["winterCereal", "springCereal", "rapeseed", "sunflower", "corn", "soybean", "unknown"].includes(detected.id), detected.id);
    if (detected.id === "unknown") assert.deepEqual([f.crop, f.cropSource], [null, null]);
    else assert.deepEqual([f.crop, f.cropSource], [detected.label, "detected"]);
  }
  assert.ok(json.farm.fields.filter((f) => f.cropSource === "detected").length >= 5, "most demo fields show a detected crop");
  // The temperatures for heat units were read once for the farm.
  assert.ok(outside.some((u) => u.startsWith("https://archive-api.open-meteo.com/v1/archive?")));
  const byName = Object.fromEntries(json.farm.fields.map((f) => [f.name, json.analyses[f.id]]));
  assert.equal(byName["Field 7"].status.id, "recovery");
  for (const a of Object.values(json.analyses)) {
    assert.ok(a.status.label);
    assert.equal(a.season, undefined, "the list leaves out the season curve");
    assert.equal(a.zones, undefined);
  }
  const full = await call("GET", "/api/farm?full=1");
  // The pages draw the satellite map only: no zones grid in the farm list.
  assert.ok(Object.values(full.json.analyses).every((a) => Array.isArray(a.season) && a.zones === undefined));
  const one = await call("GET", `/api/farm/fields/${json.farm.fields[0].id}/analysis`);
  assert.equal(one.status, 200);
  assert.ok(one.json.analysis.zones.values.length > 0);
  assert.equal(one.json.history.months[0].month, "2019-01");
});

test("finding fields inside a typed boundary and around a point, then saving some", async () => {
  const inside = await call("POST", "/api/farm/detect", { source: "boundary", points: [[49.705, 37.585], [49.705, 37.6115], [49.6915, 37.6115], [49.6915, 37.585]] });
  assert.equal(inside.status, 202);
  const job = await waitForJob(inside.json.job.id);
  assert.equal(job.kind, "field-detect");
  const { candidates, boundary, provider, warnings } = job.result;
  assert.ok(candidates.length >= 4 && candidates.length <= 15, `${candidates.length}`);
  assert.equal(candidates[0].id, "cand-1");
  assert.equal(boundary.type, "Polygon");
  assert.equal(provider.id, "sample");
  assert.match(warnings[0], /Sample data/);

  const around = await waitForJob((await call("POST", "/api/farm/detect", { source: "point", lat: 49.7, lon: 37.6, radiusM: 99999 })).json.job.id);
  assert.ok(around.result.candidates.length >= 6);
  assert.equal(around.result.boundary, null);

  assert.equal((await call("POST", "/api/farm/detect", { source: "boundary", points: [[49.7, 37.6], [49.7, 37.6001], [49.7001, 37.6]] })).json.error.code, "area_too_small");
  assert.equal((await call("POST", "/api/farm/detect", { source: "point", lat: 95, lon: 0 })).status, 400);
  assert.equal((await call("POST", "/api/farm/detect", { source: "magic" })).status, 400);
  // A thin strip with a small area but a box over 400 km² is refused at once
  // (Earth Engine would refuse it later, in the background).
  const strip = await call("POST", "/api/farm/detect", { source: "boundary", points: [[49.0, 37.0], [49.2, 37.3], [49.205, 37.3]] });
  assert.equal(strip.status, 400);
  assert.equal(strip.json.error.code, "area_too_large");

  // The same search twice joins the running one; at most 2 run at once.
  const { startJob } = await import("../jobs.js");
  const { startFieldDetection, MAX_RUNNING_DETECTIONS } = await import("./run.js");
  const releases = [];
  const held = (key) => startJob({ kind: "field-detect", key, run: () => new Promise((resolve) => releases.push(resolve)) });
  const one = held("same-search");
  assert.equal((await startFieldDetection({ center: { lat: 49.7, lon: 37.6 }, key: "same-search" })).id, one.id);
  for (let i = 1; i < MAX_RUNNING_DETECTIONS; i += 1) held(`other-${i}`);
  await assert.rejects(startFieldDetection({ center: { lat: 49.7, lon: 37.6 }, key: "a-third" }), (error) => error.status === 429 && error.code === "busy");
  releases.forEach((release) => release({ candidates: [] }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const chosen = candidates.slice(0, 3);
  const put = await call("PUT", "/api/farm", { boundary, fields: chosen.map((c) => ({ geometry: c.geometry })) });
  assert.equal(put.status, 200);
  assert.equal(put.json.farm.demo, false);
  assert.equal(put.json.farm.name, "My farm");
  assert.deepEqual(put.json.farm.fields.map((f) => f.name).sort(), ["Field 1", "Field 2", "Field 3"]);
  // The fields are near the demo farm, so its place name is kept.
  assert.equal(put.json.farm.location.label, "Near Kupiansk, Kharkiv region, Ukraine");
  assert.equal((await waitForJob(put.json.job.id)).status, "done");
  const { json } = await call("GET", "/api/farm");
  assert.equal(Object.keys(json.analyses).length, 3, "the old demo analyses are gone");
  assert.equal(fs.readdirSync(path.join(dir, "field-analysis")).length, 3);

  // Saving the same outlines again keeps their ids (and analyses), and a
  // save without a location keeps the farm's place name.
  const place = { label: "Kupiansk, Kharkiv Oblast, Ukraine", lat: 49.7, lon: 37.6 };
  assert.equal((await call("PATCH", "/api/farm", { location: place })).json.farm.location.label, place.label);
  const again = await call("PUT", "/api/farm", { fields: put.json.farm.fields.map((f) => ({ geometry: f.geometry, name: f.name })) });
  assert.deepEqual(again.json.farm.fields.map((f) => f.id), put.json.farm.fields.map((f) => f.id));
  assert.equal(again.json.farm.location.label, place.label);
  await waitForJob(again.json.job.id);

  // Fields far away get a coordinate label instead.
  const far = { type: "Polygon", coordinates: [[[30.5, 50.4], [30.51, 50.4], [30.51, 50.405], [30.5, 50.405], [30.5, 50.4]]] };
  const moved = await call("PUT", "/api/farm", { fields: [{ geometry: far }] });
  assert.ok(moved.json.farm.location.label.includes("°"), moved.json.farm.location.label);
  assert.equal(moved.json.farm.conflict.id, "ukraine-2022");
  const iowa = { type: "Polygon", coordinates: [[[-93.62, 42.03], [-93.61, 42.03], [-93.61, 42.035], [-93.62, 42.035], [-93.62, 42.03]]] };
  const peaceful = await call("PUT", "/api/farm", { fields: [{ geometry: iowa, crop: "Corn" }] });
  assert.equal(peaceful.json.farm.conflict, null, "a farm at peace: no war words before any analysis");
  assert.equal(peaceful.json.farm.fields[0].cropSource, "user");
  await waitForJob(peaceful.json.job.id);
  await waitForJob(moved.json.job.id);
  const back = await call("PUT", "/api/farm", { fields: again.json.farm.fields.map((f) => ({ geometry: f.geometry, name: f.name })) });
  await waitForJob(back.json.job.id);

  assert.equal((await call("PUT", "/api/farm", { fields: [] })).json.error.code, "no_fields");
  const tiny = { type: "Polygon", coordinates: [[[37.6, 49.7], [37.6001, 49.7], [37.6001, 49.7001], [37.6, 49.7]]] };
  assert.equal((await call("PUT", "/api/farm", { fields: [{ geometry: tiny }] })).json.error.code, "field_too_small");
  assert.equal((await call("PUT", "/api/farm", { fields: [{ geometry: { type: "Point", coordinates: [1, 2] } }] })).status, 400);
});

test("farm and field edits", async () => {
  const farm = (await call("GET", "/api/farm")).json.farm;
  const patched = await call("PATCH", "/api/farm", { name: "Hlib's farm", units: "mu", autoUpdate: false });
  assert.equal(patched.json.farm.name, "Hlib's farm");
  assert.equal(patched.json.farm.units, "mu");
  assert.equal(patched.json.farm.autoUpdate, false);
  assert.equal((await call("PATCH", "/api/farm", { units: "km" })).status, 400);
  const field = farm.fields[0];
  const renamed = await call("PATCH", `/api/farm/fields/${field.id}`, { name: "By the river", crop: "Sunflower" });
  assert.equal(renamed.json.field.name, "By the river");
  assert.equal(renamed.json.field.crop, "Sunflower");
  assert.equal(renamed.json.field.cropSource, "user");
  // A changed crop changes the harvest rules: the field is analysed again
  // with it, and its analysis says which crop it used.
  assert.equal(renamed.json.job.kind, "field-analyze");
  assert.deepEqual(renamed.json.job.fieldIds, [field.id]);
  await waitForJob(renamed.json.job.id);
  assert.deepEqual((await call("GET", `/api/farm/fields/${field.id}/analysis`)).json.analysis.cropUsed, { id: "sunflower", label: "Sunflower", source: "user" });
  assert.equal((await call("PATCH", `/api/farm/fields/${field.id}`, { name: "By the river" })).json.job, null);
  // Clearing the crop goes back to the detected one.
  const detected = (await call("GET", `/api/farm/fields/${field.id}/analysis`)).json.analysis.cropDetected;
  const cleared = await call("PATCH", `/api/farm/fields/${field.id}`, { crop: null });
  if (detected.id === "unknown") assert.deepEqual([cleared.json.field.crop, cleared.json.field.cropSource], [null, null]);
  else assert.deepEqual([cleared.json.field.crop, cleared.json.field.cropSource], detected.season === "last" ? [null, null] : [detected.label, "detected"]);
  if (cleared.json.job) await waitForJob(cleared.json.job.id);
  // Sending the farm back unchanged keeps a detected crop detected.
  const sameFarm = (await call("GET", "/api/farm")).json.farm;
  const resent = await call("PUT", "/api/farm", { fields: sameFarm.fields.map((f) => ({ geometry: f.geometry, name: f.name, crop: f.crop })) });
  assert.deepEqual(resent.json.farm.fields.map((f) => f.cropSource), sameFarm.fields.map((f) => f.cropSource));
  await waitForJob(resent.json.job.id);
  assert.equal((await call("PATCH", `/api/farm/fields/${field.id}`, { crop: "Sunflower" })).json.field.cropSource, "user");
  assert.equal((await call("PATCH", `/api/farm/fields/${field.id}`, { name: "  " })).status, 400);
  assert.equal((await call("PATCH", "/api/farm/fields/fld-nothere", { name: "x" })).status, 404);

  // Draw a new field: it gets the lowest free name and is analysed.
  const added = await call("POST", "/api/farm/fields", { geometry: { type: "Polygon", coordinates: [[[37.5, 49.75], [37.505, 49.75], [37.505, 49.753], [37.5, 49.753], [37.5, 49.75]]] } });
  assert.equal(added.status, 201);
  assert.equal(added.json.field.source, "drawn");
  assert.equal(added.json.field.name, "Field 1");
  assert.equal(added.json.field.cropSource, null);
  assert.equal((await waitForJob(added.json.job.id)).status, "done");
  // A new field is analysed WITH its history and gets a detected crop, like the others.
  const fresh = await call("GET", `/api/farm/fields/${added.json.field.id}/analysis`);
  assert.equal(fresh.json.history.months[0].month, "2019-01");
  assert.ok(fresh.json.analysis.cropDetected.id);
  assert.ok(Array.isArray(fresh.json.analysis.radar.vhSeries));
  const listed = (await call("GET", "/api/farm")).json.farm.fields.find((f) => f.id === added.json.field.id);
  if (fresh.json.analysis.cropDetected.id !== "unknown") assert.deepEqual([listed.crop, listed.cropSource], [fresh.json.analysis.cropDetected.label, "detected"]);
  // An error about a new field calls it by the name it would get.
  const tinyField = { type: "Polygon", coordinates: [[[37.5, 49.76], [37.5001, 49.76], [37.5001, 49.7601], [37.5, 49.76]]] };
  const tooSmall = await call("POST", "/api/farm/fields", { geometry: tinyField });
  assert.equal(tooSmall.json.error.code, "field_too_small");
  assert.match(tooSmall.json.error.message, /^Field 4 is too small/);

  const removed = await call("DELETE", `/api/farm/fields/${added.json.field.id}`);
  assert.equal(removed.status, 200);
  assert.equal((await call("GET", `/api/farm/fields/${added.json.field.id}/analysis`)).status, 404);
  assert.equal(fs.existsSync(path.join(dir, "field-analysis", `${added.json.field.id}.json`)), false);

  const job = await call("POST", "/api/farm/analyze", { fieldIds: [field.id] });
  assert.equal(job.status, 202);
  assert.deepEqual((await waitForJob(job.json.job.id)).result.fieldIds, [field.id]);
  assert.equal((await call("POST", "/api/farm/analyze", { fieldIds: ["../etc"] })).status, 400);
  assert.equal((await call("GET", `/api/farm/fields/${field.id}/geotiff`)).json.error.code, "sample");
});

test("weather and place search", async () => {
  const weather = await call("GET", "/api/farm/weather");
  assert.equal(weather.status, 200);
  assert.equal(weather.json.current.label, "Cloudy");
  assert.deepEqual(weather.json.rain, { likely: true, from: "2026-10-19", to: "2026-10-20", mm: 11 });
  assert.equal(weather.json.daily.length, 3);
  // The pest-risk inputs, worked out on the server.
  assert.deepEqual(weather.json.hourly, { wetHours14: 2, gdd14: null });

  const before = outside.length;
  const coords = await call("GET", "/api/geocode?q=49.74%2C%2037.54");
  assert.equal(coords.json.results[0].lat, 49.74);
  assert.equal(outside.length, before, "typed coordinates are read without Nominatim");
  const place = await call("GET", "/api/geocode?q=Kupiansk");
  assert.equal(place.json.results[0].label, "Kupiansk, Kharkiv Oblast, Ukraine");
  assert.equal((await call("GET", "/api/geocode?q=")).status, 400);
});

test("reports with photos", async () => {
  const farm = (await call("GET", "/api/farm")).json.farm;
  const sent = await call("POST", "/api/farm/reports", {
    fieldId: farm.fields[0].id,
    kind: "shelling",
    text: "Two craters by the road.",
    photos: [{ name: "a.png", type: "image/png", dataBase64: `data:image/png;base64,${PNG.toString("base64")}` }],
  });
  assert.equal(sent.status, 201);
  const report = sent.json.report;
  assert.equal(report.photos.length, 1);
  assert.match(report.id, /^rep-/);
  const photo = await realFetch(`${base}/api/farm/uploads/${report.photos[0]}`);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.equal(photo.headers.get("x-content-type-options"), "nosniff");
  assert.ok(Buffer.from(await photo.arrayBuffer()).equals(PNG));
  assert.equal((await call("GET", "/api/farm/uploads/photo-nothere")).status, 404);

  // Not an image, too many, too big, wrong kind, unknown field.
  const svg = Buffer.from("<svg onload=alert(1)></svg>").toString("base64");
  assert.equal((await call("POST", "/api/farm/reports", { kind: "fire", photos: [{ dataBase64: svg }] })).json.error.code, "bad_photo");
  const five = Array.from({ length: 5 }, () => ({ dataBase64: PNG.toString("base64") }));
  assert.equal((await call("POST", "/api/farm/reports", { kind: "fire", photos: five })).json.error.code, "too_many_photos");
  const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(5 * 1024 * 1024 + 10)]);
  assert.equal((await call("POST", "/api/farm/reports", { kind: "fire", photos: [{ dataBase64: big.toString("base64") }] })).status, 413);
  assert.equal((await call("POST", "/api/farm/reports", { kind: "aliens", text: "x" })).status, 400);
  assert.equal((await call("POST", "/api/farm/reports", { kind: "fire", text: "x", fieldId: "fld-nothere" })).json.error.code, "unknown_field");
  assert.equal((await call("POST", "/api/farm/reports", { kind: "fire" })).status, 400);

  // The report route takes up to 24 MB; other routes still stop at 1 MB.
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(2 * 1024 * 1024)]);
  const many = await call("POST", "/api/farm/reports", { kind: "other", text: "Photos", photos: [webp, webp, webp].map((b) => ({ dataBase64: b.toString("base64") })) });
  assert.equal(many.status, 201, JSON.stringify(many.json));
  assert.equal((await call("PATCH", "/api/farm", { name: "x".repeat(2 * 1024 * 1024) })).status, 413);

  // Photos up to 3.75 MB (5 MB in base64, Claude's limit); four of them fit
  // in one report. A larger photo is refused with a clear message.
  const jpegOf = (bytes) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes - 4)]);
  const full = await call("POST", "/api/farm/reports", { kind: "other", text: "Four big photos", photos: [1, 2, 3, 4].map(() => ({ dataBase64: jpegOf(3.7 * 1024 * 1024).toString("base64") })) });
  assert.equal(full.status, 201, JSON.stringify(full.json));
  const over = await call("POST", "/api/farm/reports", { kind: "other", photos: [{ dataBase64: jpegOf(3.8 * 1024 * 1024).toString("base64") }] });
  assert.equal(over.status, 413);
  assert.match(over.json.error.message, /limit is 3\.75 MB\). Make the photo smaller/);

  const list = await call("GET", "/api/farm/reports");
  assert.equal(list.json.reports.length, 3);
  assert.equal(list.json.reports[0].id, full.json.report.id, "newest first");

  // Removing a field keeps its reports, no longer tied to it.
  await call("DELETE", `/api/farm/fields/${farm.fields[0].id}`);
  const kept = (await call("GET", "/api/farm/reports")).json.reports.find((r) => r.id === report.id);
  assert.equal(kept.fieldId, null);
  assert.equal(kept.removedFieldName, farm.fields[0].name);
});

test("downloads", async () => {
  const geo = await call("GET", "/api/farm/export/fields.geojson");
  assert.equal(geo.status, 200);
  assert.match(geo.headers.get("content-type"), /geo\+json/);
  assert.match(geo.headers.get("content-disposition"), /attachment/);
  assert.equal(geo.json.type, "FeatureCollection");
  assert.ok(geo.json.features[0].properties.status);
  const readings = await call("GET", "/api/farm/export/readings.csv");
  assert.match(readings.text, /^field,date,ndvi,ndwi,clearPct\n/);
  assert.ok(readings.text.split("\n").length > 10);
  const history = await call("GET", "/api/farm/export/history.csv");
  assert.match(history.text, /^field,month,ndvi,ndwi,clearPct\n.+,2019-01,/);
  assert.equal((await call("GET", "/api/farm/export/secrets.txt")).status, 404);
});

test("a field removed while it is being analysed stays removed", async () => {
  const { fieldSampleProvider } = await import("../providers/field-sample.js");
  const original = fieldSampleProvider.fieldHistory;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let entered;
  const reading = new Promise((resolve) => (entered = resolve));
  fieldSampleProvider.fieldHistory = async (args) => {
    entered();
    await gate;
    return original.call(fieldSampleProvider, args);
  };
  try {
    const geometry = { type: "Polygon", coordinates: [[[37.52, 49.75], [37.525, 49.75], [37.525, 49.753], [37.52, 49.753], [37.52, 49.75]]] };
    const added = await call("POST", "/api/farm/fields", { geometry });
    const id = added.json.field.id;
    await reading; // the analysis is saved; the history is being read
    assert.equal((await call("DELETE", `/api/farm/fields/${id}`)).status, 200);
    release();
    await waitForJob(added.json.job.id);
    assert.equal(fs.existsSync(path.join(dir, "field-history", `${id}.json`)), false, "no history written back for a removed field");
    assert.equal(fs.existsSync(path.join(dir, "field-analysis", `${id}.json`)), false);
  } finally {
    fieldSampleProvider.fieldHistory = original;
    release();
  }
});

test("unknown routes and wrong methods", async () => {
  assert.equal((await call("GET", "/api/farm/nothing")).status, 404);
  assert.equal((await call("DELETE", "/api/farm/weather")).status, 405);
  assert.equal((await call("POST", "/api/geocode")).status, 405);
});

test("start over removes the farm, analyses, reports and photos", async () => {
  const del = await call("DELETE", "/api/farm");
  assert.equal(del.status, 200);
  const { json } = await call("GET", "/api/farm");
  assert.equal(json.farm, null);
  assert.deepEqual(json.analyses, {});
  assert.equal((await call("GET", "/api/farm/reports")).json.reports.length, 0);
  assert.equal(fs.readdirSync(path.join(dir, "uploads")).length, 0);
});
