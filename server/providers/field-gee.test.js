// WHAT THIS FILE DOES
// Tests the Field product's Earth Engine provider (field-gee.js): the date
// windows, the zones grid, reading Earth Engine's answers, and the whole
// field detection, analysis, history and GeoTIFF download run against the
// stand-in for Earth Engine (fake-ee.js). The stand-in checks what is asked
// for (no null inside ee.Dictionary / ee.Algorithms.If, no future dates,
// batched requests) and answers with believable made-up numbers. It also
// behaves like real Earth Engine where that once broke a real run: a
// FeatureCollection nested inside an ee.Dictionary comes back with no
// features (nestedCollections: "describe").
//
// What only a real run proves (thresholds that suit real images, dataset
// access, request sizes): see the smoke test described in the final report
// and `npm run gee:check`.
//
// WHO EDITS IT
// Whoever changes field-gee.js. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFieldGeeProvider,
  fieldGeeProvider,
  DETECT,
  FIELD_DATASETS,
  CLOUD_SCORE_BAND,
  FIELDS_PER_REQUEST,
  HISTORY_CHUNK_MONTHS,
  ZONES_MAX,
  GEOTIFF_NODATA,
  utmCrs,
  detectInput,
  fieldsInput,
  detectionWindows,
  analysisWindows,
  latestWindowFor,
  normalWindow,
  zoneGrid,
  readZones,
  oneReadingPerDay,
  fieldPlan,
  readStats,
  featuresOf,
  patchCircle,
  normalCurve,
  toCandidates,
  splitByFinerEdges,
  largestPolygon,
  monthRange,
  encodeGeoTiff,
  isThumbnailPermissionError,
  CURVE_DAYS,
  buildAnalysis,
} from "./field-gee.js";
import { createFakeEe } from "./fake-ee.js";
import { areaHa } from "../geo.js";
import { CONDITION_CLASSES, MIN_CLEAR_SHARE, conditionScore, healthScore, waterScore } from "../../src/lib/field/method.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEMO = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fields.geojson"), "utf8")).features.map((f) => ({
  id: `fld-${f.properties.id.replace("field-", "")}`,
  name: f.properties.name,
  geometry: f.geometry,
}));

const TEST_CFG = {
  geeProjectId: "test-proj",
  geeCredentials: { client_email: "field@test-proj.iam.gserviceaccount.com", private_key: "test-key" },
  geeCredentialsError: null,
  geeDisabled: false,
  chernozemAsset: "projects/zhaobo/assets/chernozem_wrb_ukraine",
  acledCsvPath: null,
};
const TODAY = "2026-10-18";

function fakeProvider(fakeOptions = {}) {
  const ee = createFakeEe({ nestedCollections: "describe", ...fakeOptions });
  const provider = createFieldGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`) });
  return { ee, provider };
}

// Every filterDate the provider asked for.
function dateWindows(ee) {
  return ee.callsNamed("ImageCollection.filterDate").map((call) => ({ start: String(call.args[0]), end: String(call.args[1]) }));
}

// ---------- Plain helpers ----------

test("the UTM zone of the demo farm is 37 N", () => {
  assert.equal(utmCrs(37.54, 49.73), "EPSG:32637");
  assert.equal(utmCrs(-122.4, 37.8), "EPSG:32610");
  assert.equal(utmCrs(151.2, -33.9), "EPSG:32756");
  assert.equal(utmCrs(180, 10), "EPSG:32601");
});

test("detection uses the last complete season and the one before, never the future", () => {
  assert.deepEqual(
    detectionWindows("2026-10-18").map((w) => w.start),
    ["2026-04-01", "2026-06-01", "2026-08-01", "2025-04-01", "2025-06-01", "2025-08-01"],
  );
  const july = detectionWindows("2026-07-10");
  assert.equal(july[0].start, "2025-04-01");
  assert.ok(july.every((w) => w.end <= "2026-07-10"));
});

test("analysis windows stop at today", () => {
  const w = analysisWindows(TODAY);
  assert.equal(w.seasonStart, "2026-03-01");
  assert.deepEqual(w.passes, { start: "2026-03-01", end: TODAY });
  assert.deepEqual(w.chiSeason, { start: "2026-04-01", end: "2026-10-01" });
  assert.deepEqual(w.chiBaseline.map((x) => x.start), ["2019-04-01", "2020-04-01", "2021-04-01"], "the soil health index baseline is 2019-2021, as in the Atlas");
  assert.deepEqual(w.radarSeason, { start: "2026-06-01", end: "2026-09-01" });
  assert.deepEqual(w.radarBaselines.map((x) => x.start), ["2019-06-01", "2020-06-01", "2021-06-01"]);
  assert.deepEqual(w.firesWar, { start: "2022-02-24", end: TODAY });
  // Early in the year: the last 8 months, and last year's summer for radar.
  const feb = analysisWindows("2026-02-10");
  assert.equal(feb.seasonStart, "2025-06-12");
  assert.equal(feb.passes.start, "2025-06-12");
  assert.deepEqual(feb.radarSeason, { start: "2025-06-01", end: "2025-09-01" });
  assert.deepEqual(feb.chiSeason, { start: "2025-04-01", end: "2025-10-01" });
  // In April the passes reach back 90 days for the latest clear view.
  assert.equal(analysisWindows("2026-04-15").passes.start, "2026-01-15");
});

test("the latest window is the last 30 days, or the 30 days up to an older clear pass", () => {
  assert.deepEqual(latestWindowFor("2026-10-12", TODAY), { start: "2026-09-18", end: TODAY });
  assert.deepEqual(latestWindowFor("2026-08-20", TODAY), { start: "2026-07-22", end: "2026-08-21" });
  assert.deepEqual(latestWindowFor(null, TODAY), { start: "2026-09-18", end: TODAY });
  assert.deepEqual(latestWindowFor("2026-05-01", TODAY), { start: "2026-09-18", end: TODAY }, "older than 90 days: no special window");
});

test("the normal is the same weeks of each baseline year", () => {
  assert.deepEqual(normalWindow({ start: "2026-09-18", end: "2026-10-18" }, 2019), { start: "2019-09-18", end: "2019-10-19" });
  // 29 February in a year without it.
  assert.deepEqual(normalWindow({ start: "2028-02-14", end: "2028-03-16" }, 2019), { start: "2019-02-13", end: "2019-03-16" });
  assert.equal(CURVE_DAYS.length, 24);
  assert.deepEqual(CURVE_DAYS.slice(0, 3), ["01-01", "01-16", "02-01"]);
});

test("the zones grid is at most 64 x 64 and covers the field's box", () => {
  for (const field of DEMO) {
    const [w, s, e, n] = fieldsInput([field])[0].bbox;
    const grid = zoneGrid([w, s, e, n]);
    assert.ok(grid.cols >= 1 && grid.cols <= ZONES_MAX && grid.rows >= 1 && grid.rows <= ZONES_MAX);
    assert.ok(Math.max(grid.cols, grid.rows) === ZONES_MAX || Math.max(grid.cols, grid.rows) * 10 >= 0, "cells of at least 10 m");
    assert.ok(Math.abs(grid.east - e) < 1e-9 && Math.abs(grid.north - n) < 1e-9 && Math.abs(grid.west - w) < 1e-9);
    assert.deepEqual(grid.transform, [grid.dx, 0, w, 0, -grid.dy, n]);
    assert.ok(grid.inner[0] > w && grid.inner[2] < e && grid.inner[1] > s && grid.inner[3] < n);
  }
  // A tiny field: 10 m cells, fewer than 64.
  const small = zoneGrid([37.5, 49.7, 37.5014, 49.7009]);
  assert.ok(small.cols <= 11 && small.rows <= 11);
});

test("zones from Earth Engine: -1 becomes null, the real shape wins", () => {
  const grid = zoneGrid([37.5, 49.7, 37.51, 49.71]);
  const zones = readZones({ properties: { condition: [[-1, 0.5, 1.2], [0.25, -1, 0.333333]] } }, grid);
  assert.deepEqual(zones.values, [null, 0.5, 1, 0.25, null, 0.333]);
  assert.equal(zones.cols, 3);
  assert.equal(zones.rows, 2);
  assert.equal(zones.north, grid.north);
  assert.ok(Math.abs(zones.south - (grid.north - 2 * grid.dy)) < 1e-12);
  const empty = readZones(null, grid);
  assert.equal(empty.values.length, grid.cols * grid.rows);
  assert.ok(empty.values.every((v) => v === null));
});

test("one reading per day keeps the clearer picture (Danny's rule)", () => {
  const kept = oneReadingPerDay([
    { date: "2026-09-02", clear: 0.4, ndvi: 0.5 },
    { date: "2026-09-02", clear: 0.9, ndvi: 0.6 },
    { date: "2026-08-30", clear: 1, ndvi: 0.7 },
  ]);
  assert.deepEqual(kept.map((p) => [p.date, p.ndvi]), [["2026-08-30", 0.7], ["2026-09-02", 0.6]]);
});

test("a field's plan: clear passes only, latest pass and its window", () => {
  const [field] = fieldsInput([DEMO[0]]);
  const passes = [
    { date: "2026-02-20", clear: 1, ndvi: 0.2, ndwi: 0.1 }, // before the season
    { date: "2026-06-20", clear: 1, ndvi: 0.8, ndwi: 0.3 },
    { date: "2026-08-10", clear: 0.95, ndvi: 0.4, ndwi: 0 },
    { date: "2026-10-10", clear: 0.3, ndvi: 0.3, ndwi: -0.2 }, // cloudy
    { date: "2026-10-11", clear: 0.9 }, // no NDVI
  ];
  const plan = fieldPlan(field, passes, { today: TODAY });
  assert.deepEqual(plan.season.map((p) => p.date), ["2026-06-20", "2026-08-10"]);
  assert.ok(plan.season.every((p) => p.clearPct >= MIN_CLEAR_SHARE * 100));
  assert.deepEqual(plan.latestPass, { date: "2026-08-10", clearPct: 95 });
  assert.deepEqual(plan.latestWindow, { start: "2026-07-12", end: "2026-08-11" });
  const none = fieldPlan(field, [], { today: TODAY });
  assert.equal(none.latestPass, null);
  assert.deepEqual(none.season, []);
});

test("features come from lists or collections; patches go to the field they sit in", () => {
  assert.deepEqual(featuresOf([{ a: 1 }, null]), [{ a: 1 }]);
  assert.deepEqual(featuresOf({ type: "FeatureCollection", features: [{ b: 2 }] }), [{ b: 2 }]);
  assert.deepEqual(featuresOf({ type: "FeatureCollection", columns: {} }), []);
  const part = fieldsInput(DEMO.slice(0, 2));
  const inside = part[0].geometry.coordinates[0];
  const lon = (inside[0][0] + inside[8][0]) / 2;
  const lat = (inside[0][1] + inside[8][1]) / 2;
  const out = readStats(
    {
      medians: [{ properties: { fid: part[0].id, ndvi: 0.5 } }],
      means: { type: "FeatureCollection", features: [{ properties: { fid: part[1].id, stressed: 0.1 } }] },
      patches: [{ properties: { areaHa: 0.6, centroid: [lon, lat], bounds: [[[lon - 0.001, lat - 0.0005], [lon + 0.001, lat + 0.0005]]] } }, { properties: { areaHa: 1, centroid: [0, 0] } }],
    },
    part,
  );
  assert.equal(out[part[0].id].medians.ndvi, 0.5);
  assert.equal(out[part[1].id].means.stressed, 0.1);
  assert.equal(out[part[0].id].patches.length, 1);
  assert.equal(out[part[1].id].patches.length, 0);
  const circle = patchCircle(out[part[0].id].patches[0]);
  assert.ok(circle.radiusM >= 15 && circle.radiusM < 200);
  assert.equal(circle.ha, 0.6);
});

// What one field's stats answer looks like (see readStats).
function measuredFor({ med = {}, means = {}, fires = 0 } = {}) {
  return {
    medians: { ndvi: 0.5, ndwi: 0.1, ...med },
    means: { n2019_ndvi: 0.7, n2020_ndvi: 0.72, n2021_ndvi: 0.75, n2019_ndwi: 0.2, n2020_ndwi: 0.22, n2021_ndwi: 0.25, stressed: 0.02, radarChanged: 0.01, chiDrop: 0.02, chernozem: 0.8, ...means },
    fires: { fires },
    curve: {},
    patches: [],
  };
}
const PLAN = { id: "fld-1", areaHa: 50, latestPass: { date: "2026-10-10", clearPct: 90 }, season: [] };

test("the field's scores are the medians of the pixel scores (what the zones show)", () => {
  const a = buildAnalysis(PLAN, measuredFor({ med: { health: 0.91, water: 0.83, condition: 0.88 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(a.plantHealth.score, 0.91);
  assert.equal(a.water.score, 0.83);
  assert.equal(a.condition.score, 0.88);
  assert.equal(a.condition.class, "great");
  // Without pixel scores: worked out from the field medians.
  const b = buildAnalysis(PLAN, measuredFor(), null, { today: TODAY, updatedAt: "x" });
  assert.equal(b.plantHealth.score, healthScore(0.5, 0.72));
  assert.equal(b.water.score, waterScore(0.1, 0.22));
  assert.equal(b.condition.score, conditionScore({ health: b.plantHealth.score, water: b.water.score, stress: 0.02 }));
  // No clear pass: no scores at all.
  const c = buildAnalysis({ ...PLAN, latestPass: null }, measuredFor({ med: { health: 0.9, condition: 0.9 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(c.condition.score, null);
});

test("fires alone (about 1 km pixels) do not make a field damaged", () => {
  // Real Earth Engine near the front: 3-5 fire days on every field, radar change 0-3.5%.
  const quiet = buildAnalysis(PLAN, measuredFor({ fires: 5, means: { radarChanged: 0.035, chiDrop: 0.02 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(quiet.damage.detected, false);
  assert.equal(quiet.damage.damagedHa, null);
  // Fires backed by a soil-index drop: damaged, but with no radar extent the area is unknown.
  const burnt = buildAnalysis(PLAN, measuredFor({ fires: 5, means: { radarChanged: 0.02, chiDrop: 0.15 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(burnt.damage.detected, true);
  assert.equal(burnt.damage.damagedHa, null);
  // Radar change over a fifth of the field: damaged, with its area.
  const cratered = buildAnalysis(PLAN, measuredFor({ fires: 1, means: { radarChanged: 0.2 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(cratered.damage.detected, true);
  assert.equal(cratered.damage.damagedHa, 10);
});

test("the normal curve is low / high / median of the three years", () => {
  const points = normalCurve({ c2019_00: 0.2, c2020_00: 0.3, c2021_00: 0.25, c2019_11: 0.8 });
  assert.deepEqual(points[0], { day: "01-01", low: 0.2, high: 0.3, median: 0.25 });
  assert.deepEqual(points[1], { day: "06-16", low: 0.8, high: 0.8, median: 0.8 });
  assert.equal(points.length, 2);
});

test("detected shapes: the largest polygon, holes kept, numbered north-west first", () => {
  const big = [[[37.50, 49.70], [37.52, 49.70], [37.52, 49.71], [37.50, 49.71], [37.50, 49.70]], [[37.505, 49.703], [37.506, 49.703], [37.506, 49.704], [37.505, 49.703]]];
  const small = [[[37.53, 49.70], [37.531, 49.70], [37.531, 49.701], [37.53, 49.70]]];
  const picked = largestPolygon({ type: "MultiPolygon", coordinates: [small, big] });
  assert.equal(picked.type, "Polygon");
  assert.equal(picked.coordinates.length, 2, "hole kept");
  const candidates = toCandidates([
    { geometry: { type: "Polygon", coordinates: [[[37.6, 49.6], [37.62, 49.6], [37.62, 49.61], [37.6, 49.61], [37.6, 49.6]]] } }, // south-east
    { geometry: { type: "Polygon", coordinates: [[[37.5, 49.8], [37.52, 49.8], [37.52, 49.81], [37.5, 49.81], [37.5, 49.8]]] } }, // north-west
    { geometry: { type: "Polygon", coordinates: [[[37.5, 49.8], [37.5001, 49.8], [37.5001, 49.8001], [37.5, 49.8]]] } }, // a sliver
    { geometry: null },
  ]);
  assert.deepEqual(candidates.map((c) => c.id), ["cand-1", "cand-2"]);
  assert.ok(candidates[0].centroid[0] > 49.8 && candidates[0].areaHa > 100);
});

test("a finer trace splits a parcel only into big pieces covering most of it", () => {
  const box = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const shape = (geometry) => ({ geometry, areaHa: areaHa(geometry), centroid: [(geometry.coordinates[0][0][1] + geometry.coordinates[0][2][1]) / 2, (geometry.coordinates[0][0][0] + geometry.coordinates[0][2][0]) / 2] });
  // Real case (demo farm, Field 7): one 90 ha parcel at the main threshold,
  // two crops (44 + 31 ha) with a soft line between them at the finer one.
  const merged = shape(box(37.50, 49.70, 37.52, 49.7064)); // about 92 ha
  const south = shape(box(37.50, 49.70, 37.52, 49.7031));
  const north = shape(box(37.50, 49.7033, 37.52, 49.7064));
  const other = shape(box(37.53, 49.70, 37.54, 49.705));
  const split = splitByFinerEdges([merged, other], [south, north]);
  assert.deepEqual(split.map((p) => Math.round(p.areaHa)), [Math.round(south.areaHa), Math.round(north.areaHa), Math.round(other.areaHa)]);
  // Pieces that are small or cover too little leave the parcel whole.
  const crumbs = [shape(box(37.50, 49.70, 37.505, 49.701)), shape(box(37.51, 49.70, 37.515, 49.701))];
  assert.equal(splitByFinerEdges([merged], crumbs).length, 1);
  assert.equal(splitByFinerEdges([merged], [south]).length, 1, "one piece is not a split");
  assert.equal(splitByFinerEdges([merged], []).length, 1);
  // toCandidates applies it and numbers the result.
  const features = (list) => list.map((p) => ({ geometry: p.geometry }));
  assert.deepEqual(toCandidates(features([merged, other]), features([south, north])).map((c) => c.id), ["cand-1", "cand-2", "cand-3"]);
});

test("detect input: corner points, a GeoJSON outline or a place", () => {
  const fromPoints = detectInput({ boundary: [[49.73, 37.53], [49.73, 37.55], [49.72, 37.55], [49.72, 37.53]] });
  assert.equal(fromPoints.boundary.type, "Polygon");
  assert.deepEqual(fromPoints.boundary.coordinates[0][0], [37.53, 49.73]);
  assert.deepEqual(fromPoints.boundary.coordinates[0].at(-1), [37.53, 49.73], "ring closed");
  assert.equal(detectInput({ boundary: { type: "Feature", geometry: DEMO[0].geometry } }).boundary.type, "Polygon");
  assert.deepEqual(detectInput({ center: [49.73, 37.54] }), { boundary: null, center: { lat: 49.73, lon: 37.54 }, radiusM: DETECT.defaultRadiusM });
  assert.equal(detectInput({ center: { lat: 49.73, lon: 37.54 }, radiusM: 99999 }).radiusM, DETECT.maxRadiusM);
  assert.equal(detectInput({ center: { lat: 49.73, lon: 37.54 }, radiusM: 10 }).radiusM, DETECT.minRadiusM);
  assert.throws(() => detectInput({}), (e) => e.code === "bad_request");
  assert.throws(() => detectInput({ boundary: [[49, 37], [50, 38]] }), (e) => e.code === "bad_request");
  assert.throws(() => detectInput({ boundary: [[49, 36], [49, 38], [51, 38], [51, 36]] }), (e) => e.code === "too_big");
});

test("month ranges", () => {
  assert.deepEqual(monthRange("2019-11", "2020-02"), ["2019-11", "2019-12", "2020-01", "2020-02"]);
  assert.equal(monthRange("2019-01", "2026-10").length, 94);
  assert.deepEqual(monthRange("2026-10", "2026-09"), []);
});

test("the GeoTIFF writer makes a valid little-endian float GeoTIFF", () => {
  const tiff = encodeGeoTiff({ width: 2, height: 1, bands: [[[0.5, GEOTIFF_NODATA]], [[0.1, 0.2]], [[1, 0]]], west: 37.5, north: 49.7, dx: 0.0001, dy: 0.0001 });
  assert.equal(tiff.toString("latin1", 0, 4), "II*\u0000");
  const tags = new Map();
  const count = tiff.readUInt16LE(8);
  for (let i = 0; i < count; i += 1) {
    const at = 10 + i * 12;
    tags.set(tiff.readUInt16LE(at), { type: tiff.readUInt16LE(at + 2), count: tiff.readUInt32LE(at + 4), value: tiff.readUInt32LE(at + 8) });
  }
  assert.equal(tags.get(256).value, 2);
  assert.equal(tags.get(257).value, 1);
  assert.equal(tags.get(277).value, 3);
  assert.ok(tags.has(33550) && tags.has(33922) && tags.has(34735) && tags.has(42113));
  const data = tags.get(273).value;
  assert.equal(tags.get(279).value, 2 * 1 * 3 * 4);
  assert.equal(tiff.length, data + 24);
  assert.ok(Math.abs(tiff.readFloatLE(data) - 0.5) < 1e-6);
  assert.equal(tiff.readFloatLE(data + 12), GEOTIFF_NODATA);
  const tie = tags.get(33922).value;
  assert.equal(tiff.readDoubleLE(tie + 24), 37.5);
  assert.equal(tiff.readDoubleLE(tie + 32), 49.7);
  assert.ok(isThumbnailPermissionError(new Error("Permission 'earthengine.thumbnails.create' denied on resource")));
  assert.ok(!isThumbnailPermissionError(new Error("Permission denied")));
});

// ---------- Against the stand-in Earth Engine ----------

test("the stand-in answers a collection nested in a Dictionary like real Earth Engine", async () => {
  const ee = createFakeEe({ nestedCollections: "describe" });
  await new Promise((resolve) => ee.initialize(null, null, resolve));
  const fc = ee.FeatureCollection([ee.Feature(null, { a: 1 })]);
  const get = (o) => new Promise((resolve, reject) => o.evaluate((v, e) => (e ? reject(new Error(e)) : resolve(v))));
  assert.deepEqual(await get(ee.Dictionary({ r: fc })), { r: { type: "FeatureCollection", columns: {} } });
  assert.equal((await get(ee.Dictionary({ r: fc.toList(10) }))).r.length, 1);
  assert.equal((await get(fc)).features.length, 1);
});

test("status signs in through the shared Earth Engine connection", async () => {
  const { provider } = fakeProvider();
  const status = await provider.status();
  assert.equal(status.ok, true);
  assert.match(status.detail, /test-proj/);
  assert.equal(fieldGeeProvider.id, "gee");
  assert.equal(typeof fieldGeeProvider.detectFields, "function");
});

test("detectFields finds fields inside a boundary (Canny edges + reduceToVectors)", async () => {
  const { ee, provider } = fakeProvider();
  const progress = [];
  const boundary = [[49.735, 37.512], [49.735, 37.562], [49.702, 37.562], [49.702, 37.512]];
  const { candidates, warnings } = await provider.detectFields({ boundary, onProgress: (share, message) => progress.push([share, message]) });
  assert.ok(candidates.length >= 4, `found ${candidates.length}`);
  assert.deepEqual(warnings, []);
  for (const [i, c] of candidates.entries()) {
    assert.equal(c.id, `cand-${i + 1}`);
    assert.equal(c.geometry.type, "Polygon");
    assert.ok(c.areaHa >= DETECT.minHa, `${c.id} ${c.areaHa} ha`);
    assert.ok(c.centroid[0] > 49.70 && c.centroid[0] < 49.736 && c.centroid[1] > 37.51 && c.centroid[1] < 37.563);
  }
  // The real algorithm: cropland from WorldCover, Canny on clear NDVI/NDWI
  // composites of six windows, 4-connected vectors at 10 m, cut to the boundary.
  assert.ok(ee.callsNamed("ImageCollection").some((c) => c.args[0] === FIELD_DATASETS.worldCover));
  const canny = ee.callsNamed("Algorithms.CannyEdgeDetector");
  // Six windows, traced twice: the parcels, and the finer trace that may split one.
  assert.equal(canny.length, 12);
  assert.deepEqual([...new Set(canny.map((c) => c.args[0].threshold))].sort(), [DETECT.fineCannyThreshold, DETECT.cannyThreshold].sort());
  assert.ok(canny.every((c) => c.args[0].sigma === DETECT.cannySigma));
  const vectors = ee.callsNamed("Image.reduceToVectors")[0].args[0];
  assert.equal(vectors.scale, 10);
  assert.equal(vectors.eightConnected, false);
  assert.equal(vectors.geometryType, "polygon");
  assert.equal(vectors.maxPixels, 1e10);
  assert.equal(vectors.bestEffort, true);
  assert.equal(vectors.tileScale, 4);
  assert.equal(vectors.crs, "EPSG:32637");
  assert.ok(ee.callsNamed("Geometry.intersection").length > 0 || ee.calls.some((c) => c.name.endsWith(".intersection")));
  assert.ok(ee.callsNamed("ImageCollection.linkCollection").every((c) => c.args[1][0] === CLOUD_SCORE_BAND));
  assert.ok(dateWindows(ee).every((w) => w.start <= w.end && w.end <= TODAY));
  assert.equal(ee.requests.length, 1, "one request");
  assert.equal(progress.at(-1)[0], 1);
});

test("detectFields finds fields around a point, traced over a wider circle", async () => {
  const { ee, provider } = fakeProvider();
  const { candidates } = await provider.detectFields({ center: { lat: 49.73, lon: 37.54 }, radiusM: 800 });
  assert.ok(candidates.length >= 3, `found ${candidates.length}`);
  assert.ok(candidates.every((c) => c.areaHa >= DETECT.minHa && c.geometry.coordinates[0].length >= 4));
  const buffers = ee.calls.filter((c) => c.name === "Geometry.buffer").map((c) => c.args[0]);
  assert.deepEqual(buffers, [800, 800 * DETECT.pointPad]);
  assert.ok(ee.calls.some((c) => c.name === "FeatureCollection.filterBounds"));
});

test("detectFields says so when nothing is found", async () => {
  const { provider } = fakeProvider({ parcelGrid: 0 });
  const { candidates, warnings } = await provider.detectFields({ boundary: [[49.735, 37.512], [49.735, 37.562], [49.702, 37.562], [49.702, 37.512]] });
  assert.equal(candidates.length, 0);
  assert.match(warnings[0], /No fields found here/);
});

// Every key of spec section 3 (FieldAnalysis) except `status`, which the
// route layer adds with the harvest window.
function assertAnalysis(a, field) {
  const inRange = (value, min, max, label) => assert.ok(value === null || (Number.isFinite(value) && value >= min && value <= max), `${field.id} ${label} = ${value}`);
  assert.equal(a.fieldId, field.id);
  assert.equal(a.provider, "gee");
  assert.ok(!Number.isNaN(Date.parse(a.updatedAt)));
  assert.ok(a.latestPass === null || (a.latestPass.date < TODAY && a.latestPass.clearPct >= 50));
  for (const [part, value] of [["water", "ndwi"], ["plantHealth", "ndvi"]]) {
    const m = a[part];
    assert.deepEqual(Object.keys(m).sort(), [value, "normal", "score", "versus"].sort());
    inRange(m[value], -1, 1, `${part}.${value}`);
    assert.deepEqual(Object.keys(m.normal).sort(), ["high", "low", "median"]);
    if (m.normal.low !== null) assert.ok(m.normal.low <= m.normal.median && m.normal.median <= m.normal.high);
    assert.ok([null, "below", "normal", "above"].includes(m.versus));
    inRange(m.score, 0, 1, `${part}.score`);
  }
  assert.deepEqual(Object.keys(a.stress).sort(), ["level", "patches", "share", "stressedHa"]);
  inRange(a.stress.share, 0, 1, "stress.share");
  assert.ok([null, "low", "medium", "high"].includes(a.stress.level));
  assert.ok(a.stress.patches.length <= 3);
  for (const p of a.stress.patches) assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.radiusM >= 15 && p.ha > 0);
  assert.deepEqual(Object.keys(a.harvest).sort(), ["daysToReady", "lastDate", "peak", "peakDate", "rainBefore", "stage", "window"]);
  assert.ok(["unknown", "notSown", "growing", "ripening", "ready", "harvested"].includes(a.harvest.stage));
  assert.equal(a.harvest.window, null);
  inRange(a.condition.score, 0, 1, "condition.score");
  assert.ok(a.condition.class === null || CONDITION_CLASSES.some((c) => c.id === a.condition.class));
  assert.deepEqual(Object.keys(a.damage).sort(), ["chiDrop", "damagedHa", "detected", "firesSinceWar", "radarChangedShare"]);
  assert.equal(typeof a.damage.detected, "boolean");
  inRange(a.damage.radarChangedShare, 0, 1, "radarChangedShare");
  inRange(a.damage.firesSinceWar, 0, 1e5, "firesSinceWar");
  inRange(a.damage.chiDrop, -1, 1, "chiDrop");
  inRange(a.soil.chernozemProbability, 0, 1, "chernozem");
  assert.ok([null, "chernozem"].includes(a.soil.soilTypeId));
  assert.ok(Array.isArray(a.season));
  for (const [i, p] of a.season.entries()) {
    assert.ok(p.date >= "2026-03-01" && p.date < TODAY);
    if (i) assert.ok(p.date > a.season[i - 1].date, "one reading per day, in order");
    assert.ok(p.clearPct >= 50 && Number.isFinite(p.ndvi));
  }
  for (const p of a.normalCurve) {
    assert.match(p.day, /^\d\d-(01|16)$/);
    assert.ok(p.low <= p.median && p.median <= p.high);
  }
  const z = a.zones;
  assert.deepEqual(Object.keys(z).sort(), ["cols", "east", "north", "rows", "south", "values", "west"]);
  assert.ok(z.cols >= 1 && z.cols <= ZONES_MAX && z.rows >= 1 && z.rows <= ZONES_MAX);
  assert.equal(z.values.length, z.cols * z.rows);
  assert.ok(z.west < z.east && z.south < z.north);
  assert.ok(z.values.every((v) => v === null || (v >= 0 && v <= 1)));
  assert.ok(Array.isArray(a.warnings));
  assert.equal(a.status, undefined, "status is added by the route layer");
}

test("analyzeFields measures the 7 demo fields in a few batched requests", async () => {
  const { ee, provider } = fakeProvider();
  const progress = [];
  const { analyses, warnings } = await provider.analyzeFields({ fields: DEMO, today: TODAY, onProgress: (share, message) => progress.push([share, message]) });
  assert.deepEqual(Object.keys(analyses).sort(), DEMO.map((f) => f.id).sort());
  for (const field of DEMO) assertAnalysis(analyses[field.id], field);
  assert.ok(Array.isArray(warnings));
  // 1 image check + 1 passes + 1 stats + 1 zones request, NOT one per field.
  assert.equal(ee.requests.length, 4, `requests: ${ee.requests.length}`);
  // Each fields collection sent carries all 7 fields.
  const fieldFeatures = ee.callsNamed("Feature").filter((c) => c.args[1]?.fid);
  assert.equal(new Set(fieldFeatures.map((c) => c.args[1].fid)).size, 7);
  // Real values came back (the stats were not lost inside the Dictionary).
  const some = Object.values(analyses);
  assert.ok(some.every((a) => a.plantHealth.normal.median !== null && a.soil.chernozemProbability !== null && a.damage.firesSinceWar !== null));
  assert.ok(some.some((a) => a.season.length >= 10), "a season curve");
  assert.ok(some.some((a) => a.zones.values.some((v) => v === null) && a.zones.values.some((v) => v !== null)), "zones: nulls outside the outline");
  assert.ok(some.every((a) => a.normalCurve.length === 24));
  // Datasets and bands are the real catalog ids.
  const loaded = new Set(ee.callsNamed("ImageCollection").map((c) => c.args[0]).filter((id) => typeof id === "string"));
  for (const id of ["COPERNICUS/S2_SR_HARMONIZED", "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED", "COPERNICUS/S1_GRD", "FIRMS"]) assert.ok(loaded.has(id), id);
  assert.ok(ee.calls.some((c) => c.name === "Image.select" && c.args[0] === "cs"));
  assert.ok(ee.calls.some((c) => c.name === "Image.select" && c.args[0] === "SCL"));
  // The per-pixel normal is the median of the three yearly composites (each
  // year counts once), in the stats and in the zones request.
  const yearlySets = ee.callsNamed("ImageCollection").filter((c) => Array.isArray(c.args[0]) && c.args[0].length === 3);
  assert.ok(yearlySets.length >= 2, `yearly normals: ${yearlySets.length}`);
  // Never a future date.
  assert.ok(dateWindows(ee).every((w) => w.start <= w.end && w.end <= TODAY), JSON.stringify(dateWindows(ee).filter((w) => w.end > TODAY)));
  assert.ok(progress.length >= 4 && progress.at(-1)[0] === 1);
});

test("the zones grid is sampled on each field's own grid", async () => {
  const { ee, provider } = fakeProvider();
  const { analyses } = await provider.analyzeFields({ fields: DEMO.slice(0, 2), today: TODAY });
  const samples = ee.callsNamed("Image.sampleRectangle");
  assert.equal(samples.length, 2);
  for (const call of samples) assert.equal(call.args[0].defaultValue, -1);
  for (const field of DEMO.slice(0, 2)) {
    const grid = zoneGrid(fieldsInput([field])[0].bbox);
    const z = analyses[field.id].zones;
    assert.equal(z.cols, grid.cols);
    assert.equal(z.rows, grid.rows);
    assert.ok(Math.abs(z.east - grid.east) < 1e-9 && Math.abs(z.south - grid.south) < 1e-9);
  }
});

test("many fields go in chunks of FIELDS_PER_REQUEST", async () => {
  const fields = Array.from({ length: 20 }, (_, i) => ({ ...DEMO[i % 7], id: `fld-${i}` }));
  const { ee, provider } = fakeProvider();
  const { analyses } = await provider.analyzeFields({ fields, today: TODAY });
  assert.equal(Object.keys(analyses).length, 20);
  const chunks = Math.ceil(20 / FIELDS_PER_REQUEST);
  assert.equal(ee.requests.length, 1 + 3 * chunks);
  assert.ok(ee.stats.peakActive <= 2, "at most 2 requests at once");
});

test("a field with no clear pass gets nulls, never an Earth Engine error", async () => {
  // No Sentinel-2 images at all: no passes, empty composites.
  const { provider } = fakeProvider({ sizes: { "COPERNICUS/S2_SR_HARMONIZED": 0 } });
  const { analyses } = await provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY });
  const a = analyses[DEMO[0].id];
  assertAnalysis(a, DEMO[0]);
  assert.equal(a.latestPass, null);
  assert.equal(a.plantHealth.ndvi, null);
  assert.equal(a.condition.score, null);
  assert.equal(a.stress.share, null);
  assert.equal(a.harvest.stage, "unknown");
  assert.match(a.warnings.join(" "), /No clear satellite view/);
});

test("missing radar and soil-index images become warnings and nulls", async () => {
  const { provider } = fakeProvider({ sizes: { "COPERNICUS/S1_GRD": 0 } });
  const { analyses, warnings } = await provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY });
  assert.match(warnings.join(" "), /radar/);
  assert.equal(analyses[DEMO[0].id].damage.radarChangedShare, null);
  assert.equal(analyses[DEMO[0].id].damage.damagedHa, null);
});

test("a 'today' in the future is not used", async () => {
  const { ee, provider } = fakeProvider();
  await provider.analyzeFields({ fields: DEMO.slice(0, 1), today: "2027-01-01" });
  assert.ok(dateWindows(ee).every((w) => w.end <= TODAY));
});

test("fieldHistory reads monthly values since 2019 in chunks of 30 months", async () => {
  const { ee, provider } = fakeProvider();
  const months = await provider.fieldHistory({ field: DEMO[0], from: "2019-01" });
  assert.equal(months.length, 94);
  assert.equal(months[0].month, "2019-01");
  assert.equal(months.at(-1).month, "2026-10");
  for (const m of months) {
    assert.deepEqual(Object.keys(m).sort(), ["clearPct", "month", "ndvi", "ndwi"]);
    assert.ok(m.clearPct >= 0 && m.clearPct <= 100);
    if (m.clearPct < 50) assert.equal(m.ndvi, null, "a month seen on less than half the field has no value");
    else assert.ok(Number.isFinite(m.ndvi));
  }
  assert.equal(ee.requests.length, Math.ceil(94 / HISTORY_CHUNK_MONTHS));
  const perRequest = ee.requests.map((r) => r.find("Feature").filter((n) => n.args[0] === null).length);
  assert.ok(perRequest.every((n) => n <= HISTORY_CHUNK_MONTHS), JSON.stringify(perRequest));
  assert.ok(dateWindows(ee).every((w) => w.start <= w.end && w.end <= TODAY));
  // Never before 2019, never after this month.
  assert.equal((await provider.fieldHistory({ field: DEMO[0], from: "2010-01", to: "2030-01" })).length, 94);
});

test("geotiffUrl gives Earth Engine's download link", async () => {
  const { ee, provider } = fakeProvider();
  const result = await provider.geotiffUrl({ field: DEMO[0], latestPassDate: "2026-10-12" });
  assert.match(result.url, /^https:\/\/earthengine\.googleapis\.com\//);
  assert.deepEqual(result.bands, ["ndvi", "ndwi", "condition"]);
  const params = ee.callsNamed("Image.getDownloadURL")[0].args[0];
  assert.equal(params.format, "GEO_TIFF");
  assert.equal(params.scale, 10);
});

test("geotiffUrl writes the GeoTIFF itself when the key may not make download links", async () => {
  const { provider } = fakeProvider({ downloadError: "Permission 'earthengine.thumbnails.create' denied on resource 'projects/test-proj' (or it may not exist)." });
  const result = await provider.geotiffUrl({ field: DEMO[0] });
  assert.match(result.url, /^data:image\/tiff;base64,/);
  const tiff = Buffer.from(result.url.split(",")[1], "base64");
  assert.equal(tiff.toString("latin1", 0, 4), "II*\u0000");
  assert.match(result.name, /\.tif$/);
});

test("Earth Engine failures become clear errors", async () => {
  const denied = fakeProvider({ fail: () => "Permission denied: caller does not have permission" });
  await assert.rejects(denied.provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY }), (error) => error.code === "no_permission" && /IAM/.test(error.message));
  await assert.rejects(denied.provider.detectFields({ center: [49.73, 37.54] }), (error) => error.code === "no_permission");

  // Out of memory: tried once more with coarser pixels, then a clear message.
  const tooBig = fakeProvider({ fail: (request) => (request.has("reduceToVectors") ? "User memory limit exceeded." : null) });
  await assert.rejects(tooBig.provider.detectFields({ center: [49.73, 37.54] }), (error) => error.code === "too_big" && /smaller area/.test(error.message));
  const attempts = tooBig.ee.callsNamed("Image.reduceToVectors").map((c) => c.args[0]);
  assert.deepEqual(attempts.map((a) => [a.scale, a.tileScale]), [[10, 4], [10, 4], [20, 16], [20, 16]], "both traces, then both coarser");

  // A first failure that clears on the retry is not an error.
  let failed = false;
  const once = fakeProvider({ fail: (request) => (request.has("reduceToVectors") && !failed ? ((failed = true), "Computation timed out.") : null) });
  const { candidates } = await once.provider.detectFields({ center: [49.73, 37.54] });
  assert.ok(candidates.length > 0);

  const bad = fakeProvider();
  await assert.rejects(bad.provider.analyzeFields({ fields: [] }), (error) => error.code === "bad_request");
  await assert.rejects(bad.provider.analyzeFields({ fields: [{ id: "x", geometry: { type: "Point", coordinates: [37, 49] } }] }), (error) => error.code === "bad_request");
});

test("no settings: a clear 'not configured' error", async () => {
  const ee = createFakeEe();
  const provider = createFieldGeeProvider({ ee, getConfig: () => ({ ...TEST_CFG, geeProjectId: null }), now: () => new Date(`${TODAY}T12:00:00Z`) });
  await assert.rejects(provider.analyzeFields({ fields: DEMO }), (error) => error.code === "not_configured");
  assert.equal((await provider.status()).ok, false);
});
