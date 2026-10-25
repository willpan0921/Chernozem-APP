// WHAT THIS FILE DOES
// Tests GET /api/soil (soil.js): the soil types of a square or a state
// from the soil map (a stand-in for Earth Engine, fake-ee.js), saved once
// read, and the plain "needs Earth Engine" answer without it. Run with
// "npm test".
//
// The route is reached through the real app (app.js) on a local port; the
// data source is handed to it the way providers/index.js keeps its choice
// (on globalThis), as in units.test.js.
//
// WHO EDITS IT
// Whoever changes soil.js or its route.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-soil-"));
process.env.CHERNOZEM_DATA_DIR = DATA;
process.env.GEE_DISABLED = "1";
process.env.ATLAS_ACCESS_CODE = "";

const { createFakeEe } = await import("./providers/fake-ee.js");
const { createGeeProvider } = await import("./providers/gee.js");
const { resetProvider } = await import("./providers/index.js");
const { saveArea, saveRun, getSoilCache } = await import("./store.js");
const { resetUnitsState } = await import("./units.js");
const { resetSoilState } = await import("./soil.js");
const { handleApi } = await import("./app.js");

const CFG = {
  geeProjectId: "test-proj",
  geeCredentials: { client_email: "atlas@test-proj.iam.gserviceaccount.com", private_key: "test-key" },
  geeCredentialsError: null,
  geeDisabled: false,
  chernozemAsset: "none",
  acledCsvPath: null,
};
const GAUL1 = [
  { ADM0_NAME: "Testland", ADM1_NAME: "Kharkivs'ka", ADM1_CODE: 11, box: [30, 49, 31, 50] },
  { ADM0_NAME: "Testland", ADM1_NAME: "Poltavs'ka", ADM1_CODE: 12, box: [31, 49, 32, 50] },
];

function fakeGee(options = {}) {
  const ee = createFakeEe({ gaul1: GAUL1, gaul2: [], clipBoxes: true, ...options });
  return { ee, provider: createGeeProvider({ ee, getConfig: () => CFG, retryDelayMs: 0 }) };
}
function useSource(provider) {
  resetProvider();
  if (provider) Object.assign(globalThis.__chernozemProvider, { key: "sample:true:", provider, detail: "test", fallback: false, checkedAt: Date.now() });
}

const box = ([w, s, e, n]) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const AREA = { id: "country-911", name: "Testland", kind: "country", geometry: box([30, 49, 32, 50]), bbox: [30, 49, 32, 50], cellSizeDeg: 0.5, createdAt: "2026-10-01T00:00:00Z" };
const CELLS = [0, 1, 2, 3].flatMap((col) => [0, 1].map((row) => ({ id: `r${row}c${col}`, lat: 50 - (row + 0.5) * 0.5, lon: 30 + (col + 0.5) * 0.5, admin1: col < 2 ? "Kharkivs'ka" : "Poltavs'ka" })));

let server;
let base;
before(async () => {
  await saveArea(AREA);
  await saveRun({ id: "run-soil-1", areaId: AREA.id, month: "2026-09", provider: "gee", createdAt: "2026-10-02T00:00:00Z", cellSizeDeg: 0.5, cells: CELLS, alerts: [] });
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
beforeEach(() => {
  resetSoilState();
  resetUnitsState();
});

const get = async (url) => {
  const res = await fetch(base + url);
  return { status: res.status, json: await res.json().catch(() => null) };
};

test("a square's soil types: shares of its cropland in plain words, top 3, saved once read", async () => {
  const { ee, provider } = fakeGee();
  useSource(provider);
  const { status, json } = await get(`/api/soil?areaId=${AREA.id}&cellId=r0c0`);
  assert.equal(status, 200, JSON.stringify(json));
  const soil = json.soil;
  assert.equal(soil.available, true);
  assert.equal(soil.cellId, "r0c0");
  assert.equal(soil.lat, 49.75);
  assert.equal(soil.lon, 30.25);
  assert.equal(soil.sizeDeg, 0.5);
  assert.equal(soil.over, "cropland");
  // The stand-in's cropland: Hapludolls 70.4, Argiudolls 20, Hapludalfs 9.6.
  assert.equal(soil.top[0].name, "Black soil (chernozem type: Mollisol, Udolls)");
  assert.equal(soil.top[0].share, 0.904);
  assert.deepEqual(soil.top[0].greatGroups.map((g) => g.name), ["Hapludolls", "Argiudolls"]);
  assert.equal(soil.top[1].name, "Grey forest soil (luvisol type: Alfisol)");
  assert.equal(soil.summary, "Black soil (chernozem type) 90% · Grey forest soil 10%");
  assert.equal(soil.blackSoilShare, 0.904);
  assert.match(soil.source, /OpenLandMap USDA soil great groups/);
  assert.ok(Date.parse(soil.computedAt) > 0);
  // One request: a 250 m frequency histogram, over the cropland and over all.
  assert.equal(ee.stats.evaluations, 1);
  assert.equal(ee.callsNamed("Reducer.frequencyHistogram").length, 2);
  const reduce = ee.callsNamed("Image.reduceRegion");
  assert.ok(reduce.length === 2 && reduce.every((c) => c.args[0].scale === 250));
  assert.ok(ee.callsNamed("Image").some((c) => c.args[0] === "OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01"));
  // Saved: the second look is instant, with no request.
  // What Earth Engine counted is saved (the names are worked out on reading).
  const saved = await getSoilCache(AREA.id);
  assert.deepEqual(saved.cells.r0c0.histogram, { cropland: { 18: 9.6, 271: 20, 290: 70.4 }, all: { 18: 15, 143: 10, 271: 15, 290: 60 } });
  assert.equal(saved.cells.r0c0.summary, undefined);
  const again = await get(`/api/soil?areaId=${AREA.id}&cellId=r0c0`);
  assert.deepEqual(again.json.soil, soil);
  assert.equal(ee.stats.evaluations, 1);
});

test("with no cropland the whole square is counted", async () => {
  const { provider } = fakeGee({ histograms: ({ masked }) => (masked ? {} : { 18: 30, 290: 10 }) });
  useSource(provider);
  const { json } = await get(`/api/soil?areaId=${AREA.id}&cellId=r1c1`);
  assert.equal(json.soil.over, "all");
  assert.equal(json.soil.top[0].short, "Grey forest soil");
  assert.equal(json.soil.top[0].share, 0.75);
});

test("a state's soil types, over its GAUL borders, saved with them", async () => {
  const { ee, provider } = fakeGee();
  useSource(provider);
  const { status, json } = await get(`/api/soil?areaId=${AREA.id}&unitId=gaul1-11`);
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.soil.available, true);
  assert.equal(json.soil.unitId, "gaul1-11");
  assert.equal(json.soil.displayName, "Kharkiv");
  assert.equal(json.soil.approximateBorders, false);
  assert.equal(json.soil.top[0].short, "Black soil (chernozem type)");
  const used = ee.stats.evaluations;
  assert.equal((await get(`/api/soil?areaId=${AREA.id}&unitId=gaul1-11`)).json.soil.summary, json.soil.summary);
  assert.equal(ee.stats.evaluations, used, "read from the file");
  assert.ok((await getSoilCache(AREA.id)).units["gaul1-11"]);
  assert.equal((await get(`/api/soil?areaId=${AREA.id}&unitId=gaul1-99`)).status, 404);
});

test("without Earth Engine no soil is made up: it says the soil type needs Earth Engine", async () => {
  useSource(null);
  const { status, json } = await get(`/api/soil?areaId=${AREA.id}&cellId=r0c1`);
  assert.equal(status, 200);
  assert.equal(json.soil.available, false);
  assert.equal(json.soil.reason, "no-gee");
  assert.match(json.soil.message, /needs Earth Engine/);
  assert.equal(json.soil.top, undefined);
  assert.equal((await getSoilCache(AREA.id))?.cells?.r0c1, undefined, "nothing saved");
});

test("a connected Earth Engine from an older copy of the code (no soil reader) asks for a restart, never says it is not connected", async () => {
  const { provider } = fakeGee();
  const { soilHistogram, ...older } = provider;
  useSource(older);
  const { json } = await get(`/api/soil?areaId=${AREA.id}&cellId=r0c1`);
  assert.equal(json.soil.available, false);
  assert.equal(json.soil.reason, "gee-failed");
  assert.match(json.soil.message, /restart of the server/);
  assert.doesNotMatch(json.soil.message, /not connected/);
});

test("when Earth Engine fails the answer says so and nothing is saved", async () => {
  const { provider } = fakeGee({ fail: (request) => (request.has("reduceRegion") ? "Computation timed out." : null) });
  useSource(provider);
  const { json } = await get(`/api/soil?areaId=${AREA.id}&cellId=r1c3`);
  assert.equal(json.soil.available, false);
  assert.equal(json.soil.reason, "gee-failed");
  assert.match(json.soil.message, /could not be read/);
  assert.equal((await getSoilCache(AREA.id))?.cells?.r1c3, undefined);
});

test("any square by its centre and size; wrong requests get a clear 400 or 404", async () => {
  const { ee, provider } = fakeGee();
  useSource(provider);
  const point = await get("/api/soil?lat=49.6&lon=30.4&sizeDeg=0.25");
  assert.equal(point.json.soil.available, true);
  assert.equal(point.json.soil.sizeDeg, 0.25);
  const used = ee.stats.evaluations;
  await get("/api/soil?lat=49.6&lon=30.4&sizeDeg=0.25");
  assert.equal(ee.stats.evaluations, used, "kept in memory");
  for (const url of ["/api/soil", "/api/soil?lat=99&lon=30", "/api/soil?lat=49&lon=30&sizeDeg=5", `/api/soil?areaId=${AREA.id}`, `/api/soil?areaId=${AREA.id}&cellId=r0c0&unitId=gaul1-11`, `/api/soil?areaId=${AREA.id}&cellId=x1`]) {
    assert.equal((await get(url)).status, 400, url);
  }
  assert.equal((await get(`/api/soil?areaId=${AREA.id}&cellId=r9c9`)).status, 404);
  assert.equal((await get("/api/soil?areaId=country-000&cellId=r0c0")).status, 404);
  assert.equal((await get(`/api/soil?areaId=${AREA.id}&cellId=r0c0&runId=run-nope`)).status, 200, "a saved square is read before the month is checked");
  assert.equal((await get(`/api/soil?areaId=${AREA.id}&cellId=r0c2&runId=run-nope`)).status, 404);
});
