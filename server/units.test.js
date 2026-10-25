// WHAT THIS FILE DOES
// Tests the map's states and regions (units.js) and its route
// GET /api/areas/:id/units: the level rule, the borders and names from FAO
// GAUL (a stand-in for Earth Engine, fake-ee.js), the saved file, the
// fallback from the squares' own place names, and which square is in
// which unit. Run with "npm test".
//
// The route is reached through the real app (app.js) on a local port.
// Which data source it gets is set the way providers/index.js keeps its
// choice (on globalThis), so these tests can hand it the stand-in.
//
// WHO EDITS IT
// Whoever changes units.js or its route.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-units-"));
process.env.CHERNOZEM_DATA_DIR = DATA;
process.env.GEE_DISABLED = "1";
process.env.ATLAS_ACCESS_CODE = "";

const { createFakeEe } = await import("./providers/fake-ee.js");
const { createGeeProvider } = await import("./providers/gee.js");
const { resetProvider } = await import("./providers/index.js");
const { saveArea, saveRun, getUnitsCache } = await import("./store.js");
const { assignCells, areaKind, computeGaulUnits, levelWords, resetUnitsState, unitsForArea, unitsFromSquares, MIN_UNITS } = await import("./units.js");
const { pointInGeometry } = await import("./geo.js");
const { handleApi } = await import("./app.js");

const CFG = {
  geeProjectId: "test-proj",
  geeCredentials: { client_email: "atlas@test-proj.iam.gserviceaccount.com", private_key: "test-key" },
  geeCredentialsError: null,
  geeDisabled: false,
  chernozemAsset: "none",
  acledCsvPath: null,
};

// Testland: four states in a 2 x 2 block (one without a name in GAUL), and
// a state of the neighbour that the country's outline only grazes.
const GAUL1 = [
  { ADM0_NAME: "Testland", ADM1_NAME: "Kharkivs'ka", ADM1_CODE: 11, box: [30, 49, 31, 50] },
  { ADM0_NAME: "Testland", ADM1_NAME: "Poltavs'ka", ADM1_CODE: 12, box: [31, 49, 32, 50] },
  { ADM0_NAME: "Testland", ADM1_NAME: "Odes'ka", ADM1_CODE: 13, box: [30, 48, 31, 49] },
  { ADM0_NAME: "Testland", ADM1_NAME: "Administrative unit not available", ADM1_CODE: 14, box: [31, 48, 32, 49] },
  { ADM0_NAME: "Otherland", ADM1_NAME: "Borderia", ADM1_CODE: 21, box: [31.8, 48, 33, 50] },
];
// Kharkivs'ka has two districts; Odes'ka has none with a name.
const GAUL2 = [
  { ADM0_NAME: "Testland", ADM1_NAME: "Kharkivs'ka", ADM1_CODE: 11, ADM2_NAME: "Chuhuivs'kyi", ADM2_CODE: 111, box: [30, 49, 30.5, 50] },
  { ADM0_NAME: "Testland", ADM1_NAME: "Kharkivs'ka", ADM1_CODE: 11, ADM2_NAME: "Izium", ADM2_CODE: 112, box: [30.5, 49, 31, 50] },
  { ADM0_NAME: "Testland", ADM1_NAME: "Poltavs'ka", ADM1_CODE: 12, ADM2_NAME: "Lubny", ADM2_CODE: 121, box: [31, 49, 32, 50] },
  { ADM0_NAME: "Testland", ADM1_NAME: "Odes'ka", ADM1_CODE: 13, ADM2_NAME: "Administrative unit not available", ADM2_CODE: 131, box: [30, 48, 31, 49] },
];

function fakeGee(options = {}) {
  const ee = createFakeEe({ gaul1: GAUL1, gaul2: GAUL2, clipBoxes: true, ...options });
  return { ee, provider: createGeeProvider({ ee, getConfig: () => CFG, retryDelayMs: 0 }) };
}

// The data source the routes get: the stand-in, or (null) the sample data.
function useSource(provider, { fallback = false } = {}) {
  resetProvider();
  if (!provider) return;
  Object.assign(globalThis.__chernozemProvider, { key: "sample:true:", provider, detail: "test", fallback, checkedAt: Date.now() });
}

const box = ([w, s, e, n]) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

// A 4 x 4 grid of 0.5° squares over the box 30-32° E, 48-50° N, named the
// way a run's squares are (FAO GAUL level 2's admin1 / admin2).
function cellsOf(size = 0.5, [west, north, rows, cols] = [30, 50, 4, 4]) {
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lat = north - (row + 0.5) * size;
      const lon = west + (col + 0.5) * size;
      const admin1 = lat > 49 ? (lon < 31 ? "Kharkivs'ka" : "Poltavs'ka") : lon < 31 ? "Odes'ka" : undefined;
      const admin2 = admin1 === "Kharkivs'ka" ? (lon < 30.5 ? "Chuhuivs'kyi" : "Izium") : undefined;
      cells.push({ id: `r${row}c${col}`, lat, lon, wrb: 0.8, agOutput: 0.6, firms: 0.2, radar: 0.1, distance: 0.6, blackSoilHa: 20000, croplandHa: 25000, heavyDamageHa: 100, ...(admin1 ? { admin1 } : {}), ...(admin2 ? { admin2 } : {}) });
    }
  }
  // A square on the edge that GAUL puts in the neighbour (like "Brest" in
  // Ukraine's run): it still goes in the state its centre is in.
  cells.find((c) => c.id === "r0c3").admin1 = "Borderia";
  return cells;
}

async function addArea(area, cells, { month = "2026-09", runId = `run-${area.id}` } = {}) {
  const full = { bbox: [30, 48, 32, 50], cellSizeDeg: 0.5, createdAt: "2026-10-01T00:00:00Z", ...area };
  await saveArea(full);
  if (cells) await saveRun({ id: runId, areaId: full.id, month, provider: "gee", createdAt: "2026-10-02T00:00:00Z", cellSizeDeg: full.cellSizeDeg, cells, alerts: [] });
  return full;
}

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
beforeEach(() => resetUnitsState());

const get = async (url, method = "GET") => {
  const res = await fetch(base + url, { method });
  return { status: res.status, json: await res.json().catch(() => null) };
};

test("the level rule: a country gets its states, a region its districts, a box level 1 or 2", () => {
  assert.deepEqual(areaKind({ kind: "country", id: "country-804" }), { type: "country" });
  assert.deepEqual(areaKind({ kind: "admin1", id: "admin1-gaul1-3154" }), { type: "region", code: 3154 });
  assert.deepEqual(areaKind({ kind: "custom", id: "area-1234abcd" }), { type: "custom" });
  assert.deepEqual(areaKind({ kind: "admin1", id: "admin1-odd" }), { type: "custom" });
  assert.equal(levelWords(1).label, "States");
  assert.equal(levelWords(2).label, "Districts");
  assert.match(levelWords(1).tooltip, /States, provinces or oblasts/);
  assert.equal(MIN_UNITS, 3);
});

test("a country: its GAUL states with real borders, names and label points; a neighbour it only grazes is left out", async () => {
  const { ee, provider } = fakeGee();
  const area = { id: "country-901", kind: "country", geometry: box([30, 48, 32, 50]), bbox: [30, 48, 32, 50] };
  const result = await computeGaulUnits(area, provider);
  assert.equal(result.level, 1);
  assert.equal(result.note, null);
  assert.deepEqual(result.units.map((u) => u.displayName), ["Kharkiv", "Odesa", "Poltava", null], "A to Z, the unit with no name last");
  const kharkiv = result.units[0];
  assert.equal(kharkiv.id, "gaul1-11");
  assert.equal(kharkiv.name, "Kharkivs'ka");
  assert.equal(kharkiv.level, 1);
  assert.equal(kharkiv.country, "Testland");
  assert.equal(kharkiv.parent, null);
  assert.deepEqual(kharkiv.bbox, [30, 49, 31, 50]);
  assert.ok(pointInGeometry(kharkiv.labelPoint.lon, kharkiv.labelPoint.lat, kharkiv.geometry));
  assert.ok(kharkiv.areaKm2 > 7000 && kharkiv.areaKm2 < 9000, String(kharkiv.areaKm2));
  assert.equal(result.units[3].name, null, "GAUL's 'Administrative unit not available' is no name");
  // One request: the borders of level 1, simplified by Earth Engine, the
  // part inside the outline measured.
  assert.equal(ee.stats.evaluations, 1);
  assert.ok(ee.callsNamed("FeatureCollection").some((c) => c.args[0] === "FAO/GAUL/2015/level1"));
  assert.ok(ee.callsNamed("Geometry.simplify").length > 0);
  assert.ok(ee.callsNamed("Geometry.intersection").length > 0);
});

test("a region: its named districts; a region GAUL has no named districts for is one unit, with a note", async () => {
  const { provider } = fakeGee();
  const kharkiv = await computeGaulUnits({ id: "admin1-gaul1-11", kind: "admin1", geometry: box([30, 49, 31, 50]), bbox: [30, 49, 31, 50] }, provider);
  assert.equal(kharkiv.level, 2);
  assert.deepEqual(kharkiv.units.map((u) => [u.id, u.displayName, u.parentDisplayName]), [["gaul2-111", "Chuhuivs'kyi", "Kharkiv"], ["gaul2-112", "Izium", "Kharkiv"]]);
  const odesa = await computeGaulUnits({ id: "admin1-gaul1-13", kind: "admin1", geometry: box([30, 48, 31, 49]), bbox: [30, 48, 31, 49] }, provider);
  assert.equal(odesa.level, 1);
  assert.deepEqual(odesa.units.map((u) => u.displayName), ["Odesa"]);
  assert.match(odesa.note, /no districts with names/);
});

test("a box or a drawn area: level 1 cut to it, or level 2 when level 1 gives fewer than 3 units; slivers go", async () => {
  const { provider } = fakeGee();
  // Across all four states (and a sliver of the neighbour's): level 1, cut.
  const wide = await computeGaulUnits({ id: "area-wide", kind: "custom", geometry: box([30.5, 48.5, 31.802, 49.5]), bbox: [30.5, 48.5, 31.802, 49.5] }, provider);
  assert.equal(wide.level, 1);
  assert.deepEqual(wide.units.map((u) => u.displayName), ["Kharkiv", "Odesa", "Poltava", null]);
  assert.deepEqual(wide.units[0].bbox, [30.5, 49, 31, 49.5], "cut to the area");
  // Inside one state: its districts, cut.
  const small = await computeGaulUnits({ id: "area-small", kind: "custom", geometry: box([30.2, 49.2, 30.8, 49.8]), bbox: [30.2, 49.2, 30.8, 49.8] }, provider);
  assert.equal(small.level, 2);
  assert.deepEqual(small.units.map((u) => u.displayName), ["Chuhuivs'kyi", "Izium"]);
  assert.deepEqual(small.units[1].bbox, [30.5, 49.2, 30.8, 49.8]);
});

test("each square goes in one unit: by its own name, else the unit it is in, else the nearest within one square", async () => {
  const { provider } = fakeGee();
  const { units } = await computeGaulUnits({ id: "country-901", kind: "country", geometry: box([30, 48, 32, 50]), bbox: [30, 48, 32, 50] }, provider);
  const cells = cellsOf();
  // Just outside every border (the country's outline and GAUL's differ).
  cells.push({ id: "r9c9", lat: 49.75, lon: 32.2 }, { id: "r9c10", lat: 49.75, lon: 34 });
  const cellUnit = assignCells(cells, units, 0.5);
  assert.equal(cellUnit.r0c0, "gaul1-11");
  assert.equal(cellUnit.r0c3, "gaul1-12", "named after the neighbour, but inside Poltava");
  assert.equal(cellUnit.r3c3, "gaul1-14", "no name: the unit it is in");
  assert.equal(cellUnit.r9c9, "gaul1-12", "just outside: the nearest unit");
  assert.equal(cellUnit.r9c10, undefined, "far outside: in none");
  assert.equal(Object.keys(cellUnit).length, 17);
  // Its own name wins over a border drawn a little differently.
  const edge = { id: "r5c5", lat: 49.6, lon: 31.05, admin1: "Kharkivs'ka" };
  assert.equal(assignCells([edge], units, 0.5).r5c5, "gaul1-11");
  // ...but not from far away.
  assert.equal(assignCells([{ ...edge, lon: 31.9 }], units, 0.5).r5c5, "gaul1-12");
  assert.deepEqual(assignCells(cells, [], 0.5), {});
});

test("without Earth Engine the units come from the squares' own names, marked approximate, never saved", async () => {
  useSource(null);
  const area = await addArea({ id: "country-902", kind: "country", geometry: box([30, 48, 32, 50]) }, cellsOf());
  const layer = await unitsForArea(area.id);
  assert.equal(layer.source, "squares");
  assert.equal(layer.approximate, true);
  assert.equal(layer.reason, "no-gee");
  assert.match(layer.message, /not connected \(sample data\).*approximate/);
  assert.equal(layer.level, 1);
  assert.deepEqual(layer.units.map((u) => u.displayName), ["Borderia", "Kharkiv", "Odesa", "Poltava"]);
  const kharkiv = layer.units.find((u) => u.displayName === "Kharkiv");
  assert.match(kharkiv.id, /^sq1-kharkivska-[0-9a-f]{6}$/);
  assert.deepEqual(kharkiv.bbox, [30, 49, 31, 50], "the union of its four squares");
  assert.equal(kharkiv.geometry.type, "Polygon");
  assert.equal(Object.values(layer.cellUnit).filter((id) => id === kharkiv.id).length, 4);
  assert.equal(layer.cellUnit.r3c3, undefined, "a square with no name is in no unit");
  assert.equal(await getUnitsCache(area.id), null, "nothing saved");
  // A region's squares group by district when they have district names.
  const region = unitsFromSquares({ id: "admin1-gaul1-11", kind: "admin1" }, { cellSizeDeg: 0.5, cells: cellsOf().filter((c) => c.admin1 === "Kharkivs'ka") });
  assert.equal(region.level, 2);
  assert.deepEqual(region.units.map((u) => [u.displayName, u.parentDisplayName]), [["Chuhuivs'kyi", "Kharkiv"], ["Izium", "Kharkiv"]]);
  // Squares with no names at all (sample data): no units, and it says so.
  const bare = await addArea({ id: "country-903", kind: "country", geometry: box([30, 48, 32, 50]) }, cellsOf().map(({ admin1, admin2, ...c }) => c));
  const empty = await unitsForArea(bare.id);
  assert.deepEqual(empty.units, []);
  assert.match(empty.message, /no state or region names/);
});

test("with Earth Engine the units are worked out once, saved with their source and date, then read instantly", async () => {
  const { ee, provider } = fakeGee();
  useSource(provider);
  const area = await addArea({ id: "country-904", kind: "country", geometry: box([30, 48, 32, 50]) }, cellsOf());
  // Two pages asking at once: one piece of work.
  const [first, second] = await Promise.all([unitsForArea(area.id), unitsForArea(area.id)]);
  assert.equal(ee.stats.evaluations, 1);
  assert.deepEqual(first, second);
  assert.equal(first.source, "gaul");
  assert.equal(first.approximate, false);
  assert.equal(first.label, "States");
  assert.equal(first.sourceLabel, "FAO GAUL 2015, level 1 (states)");
  assert.equal(first.runId, `run-${area.id}`);
  assert.equal(first.units.length, 4);
  assert.equal(Object.keys(first.cellUnit).length, 16);
  const saved = await getUnitsCache(area.id);
  assert.equal(saved.version, 1);
  assert.equal(saved.source, "gaul");
  assert.equal(saved.dataset, "FAO/GAUL/2015/level1");
  assert.ok(Date.parse(saved.computedAt) > 0);
  assert.equal(saved.units.length, 4);
  // Later reads: from the file, no Earth Engine request.
  const again = await unitsForArea(area.id);
  assert.equal(ee.stats.evaluations, 1);
  assert.deepEqual(again.units, first.units);
  assert.equal(again.computedAt, saved.computedAt);
});

test("when Earth Engine fails the squares' units are shown, and it is tried again only after a pause", async () => {
  const broken = fakeGee({ fail: () => "Earth Engine memory capacity exceeded." });
  useSource(broken.provider);
  const area = await addArea({ id: "country-905", kind: "country", geometry: box([30, 48, 32, 50]) }, cellsOf());
  const layer = await unitsForArea(area.id);
  assert.equal(layer.source, "squares");
  assert.equal(layer.reason, "gee-failed");
  assert.match(layer.message, /could not give the borders just now/);
  const tried = broken.ee.stats.evaluations;
  assert.ok(tried >= 1);
  await unitsForArea(area.id);
  assert.equal(broken.ee.stats.evaluations, tried, "not tried again at once");
  assert.equal(await getUnitsCache(area.id), null);
  // Set up but not reachable: said so.
  const { sampleProvider } = await import("./providers/sample.js");
  useSource(sampleProvider, { fallback: true });
  assert.equal((await unitsForArea(area.id)).reason, "gee-unavailable");
  // Working again (after the pause): the real borders, saved.
  resetUnitsState();
  useSource(fakeGee().provider);
  assert.equal((await unitsForArea(area.id)).source, "gaul");
  assert.ok(await getUnitsCache(area.id));
});

test("a region GAUL has no named districts for is one unit, still worded by districts; an older Earth Engine copy asks for a restart", async () => {
  const { provider } = fakeGee();
  useSource(provider);
  const area = await addArea({ id: "admin1-gaul1-13", kind: "admin1", geometry: box([30, 48, 31, 49]), bbox: [30, 48, 31, 49] }, cellsOf().filter((c) => c.admin1 === "Odes'ka"));
  const layer = await unitsForArea(area.id);
  assert.equal(layer.source, "gaul");
  assert.equal(layer.level, 1);
  assert.equal(layer.units.length, 1);
  assert.equal(layer.label, "Districts");
  assert.equal(layer.one, "district");
  assert.match(layer.note, /no districts with names/);
  // Connected, but the running server has an older gee.js without borders.
  const { adminUnits, ...older } = fakeGee().provider;
  useSource(older);
  const other = await addArea({ id: "country-906", kind: "country", geometry: box([30, 48, 32, 50]) }, cellsOf());
  const fallback = await unitsForArea(other.id);
  assert.equal(fallback.source, "squares");
  assert.equal(fallback.reason, "gee-failed");
  assert.match(fallback.message, /must be restarted/);
  assert.doesNotMatch(fallback.message, /not connected/);
});

test("GET /api/areas/:id/units: the units and which square is in which; errors for a wrong area or month", async () => {
  const { provider } = fakeGee();
  useSource(provider);
  const area = await addArea({ id: "admin1-gaul1-11", kind: "admin1", geometry: box([30, 49, 31, 50]), bbox: [30, 49, 31, 50] }, cellsOf().filter((c) => c.admin1 === "Kharkivs'ka"));
  const { status, json } = await get(`/api/areas/${area.id}/units`);
  assert.equal(status, 200);
  assert.equal(json.label, "Districts");
  assert.equal(json.level, 2);
  assert.equal(json.source, "gaul");
  assert.deepEqual(json.units.map((u) => u.displayName), ["Chuhuivs'kyi", "Izium"]);
  for (const key of ["id", "name", "displayName", "level", "parent", "parentDisplayName", "geometry", "labelPoint", "bbox", "areaKm2"]) assert.ok(key in json.units[0], key);
  assert.deepEqual(Object.values(json.cellUnit).sort(), ["gaul2-111", "gaul2-111", "gaul2-112", "gaul2-112"]);
  // A given month of the area.
  assert.equal((await get(`/api/areas/${area.id}/units?runId=run-${area.id}`)).json.runId, `run-${area.id}`);
  assert.equal((await get(`/api/areas/${area.id}/units?runId=run-country-904`)).status, 404);
  assert.equal((await get(`/api/areas/${area.id}/units?runId=Bad!`)).status, 400);
  assert.equal((await get("/api/areas/country-000/units")).status, 404);
  assert.equal((await get(`/api/areas/${area.id}/units`, "POST")).status, 405);
});

test("the units route needs the access code like every route", async () => {
  process.env.ATLAS_ACCESS_CODE = "let-me-in";
  try {
    assert.equal((await get("/api/areas/admin1-gaul1-11/units")).status, 401);
    assert.equal((await get("/api/soil?areaId=admin1-gaul1-11&cellId=r0c0")).status, 401);
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
});

test("a unit GAUL gives no name takes its GAUL country's name when that is not the area's country (never a made-up one)", async () => {
  const gaul1 = [
    { ADM0_NAME: "Kenya", ADM1_NAME: "Rift Valley", ADM1_CODE: 51331, box: [34, 0, 36, 4] },
    { ADM0_NAME: "Kenya", ADM1_NAME: "Eastern", ADM1_CODE: 51327, box: [36, 0, 38, 4] },
    { ADM0_NAME: "Ilemi triangle", ADM1_NAME: "Administrative unit not available", ADM1_CODE: 61033, box: [34.5, 4, 35.5, 5] },
    { ADM0_NAME: "Kenya", ADM1_NAME: "Administrative unit not available", ADM1_CODE: 51399, box: [37, 4, 38, 5] },
  ];
  const { provider } = fakeGee({ gaul1 });
  const { units } = await computeGaulUnits({ id: "country-404", kind: "country", geometry: box([34, 0, 38, 5]), bbox: [34, 0, 38, 5] }, provider);
  assert.deepEqual(units.map((u) => [u.id, u.name, u.displayName]), [
    ["gaul1-51327", "Eastern", "Eastern"],
    ["gaul1-61033", null, "Ilemi triangle"],
    ["gaul1-51331", "Rift Valley", "Rift Valley"],
    ["gaul1-51399", null, null],
  ]);
});

test("removing an area removes its saved states and soil types too", async () => {
  const { deleteArea, updateSoilCache, getSoilCache } = await import("./store.js");
  const { provider } = fakeGee();
  useSource(provider);
  const area = await addArea({ id: "country-906", kind: "country", geometry: box([30, 48, 32, 50]) }, cellsOf());
  await unitsForArea(area.id);
  await updateSoilCache(area.id, (file) => void (file.cells.r0c0 = { version: 1, histogram: { cropland: {}, all: { 290: 1 } } }));
  assert.ok(await getUnitsCache(area.id));
  assert.ok(await getSoilCache(area.id));
  assert.equal(await deleteArea(area.id), 1);
  assert.equal(await getUnitsCache(area.id), null);
  assert.equal(await getSoilCache(area.id), null);
});
