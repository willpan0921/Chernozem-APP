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
  MAX_FIELDS_PER_PASS_REQUEST,
  MONTHS_PER_REQUEST,
  MONTH_ELEMENTS_PER_REQUEST,
  PARALLEL_REQUESTS,
  PHENOLOGY_MERGE,
  passesPerRequest,
  monthlyJobs,
  monthlyScale,
  monthValue,
  vhSeriesOf,
  vhPeakOf,
  cleanVh,
  VH_PEAK_DAYS,
  phenologyWindows,
  curveCorrelation,
  curvePeakDay,
  samePhenology,
  phenologyPairs,
  isRealEdge,
  stripStraightness,
  seasonDone,
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
  normalWindows,
  fireWindows,
  excessFiresOf,
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
  withoutOverlaps,
  largestPolygon,
  fillSmallHoles,
  coverWithin,
  farmlandSpots,
  pickFarmland,
  compassFrom,
  historyScale,
  parcelShapes,
  profileDifference,
  parcelsTouch,
  sameCropGroups,
  joinGroups,
  monthRange,
  encodeGeoTiff,
  isThumbnailPermissionError,
  CURVE_DAYS,
  buildAnalysis,
} from "./field-gee.js";
import { createFakeEe } from "./fake-ee.js";
import { areaHa } from "../geo.js";
import { shiftDays } from "./gee.js";
import { CONDITION_CLASSES, MIN_CLEAR_SHARE, RED_EDGE_RULES, STRESS_RULES, classifyCrop, radarHarvest, conditionScore, healthScore, waterScore } from "../../src/lib/field/method.js";

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
    detectionWindows("2026-10-18", 49.73).map((w) => w.start),
    ["2026-04-01", "2026-06-01", "2026-08-01", "2025-04-01", "2025-06-01", "2025-08-01"],
  );
  const july = detectionWindows("2026-07-10", 49.73);
  assert.equal(july[0].start, "2025-04-01");
  assert.ok(july.every((w) => w.end <= "2026-07-10"));
  // South: October to March, across the new year.
  const pampas = detectionWindows("2026-10-18", -34.9);
  assert.equal(pampas[0].start, "2025-10-01");
  assert.equal(pampas[2].end, "2026-04-01");
  assert.equal(pampas[3].start, "2024-10-01");
  // Tropics: the last 12 whole months, and the 12 before.
  const tropics = detectionWindows("2026-10-18", -12.55);
  assert.equal(tropics[0].start, "2025-10-01");
  assert.equal(tropics[2].end, "2026-10-01");
  assert.equal(tropics[3].start, "2024-10-01");
  for (const list of [pampas, tropics]) assert.ok(list.every((w) => w.start < w.end && w.end <= "2026-10-18"));
});

test("analysis windows stop at today (north)", () => {
  const w = analysisWindows(TODAY, 49.73);
  assert.equal(w.band, "north");
  assert.equal(w.seasonStart, "2026-03-01");
  assert.deepEqual(w.passes, { start: "2026-03-01", end: TODAY });
  assert.deepEqual(w.chiSeason, { start: "2026-04-01", end: "2026-10-01" });
  assert.deepEqual(w.chiBaseline.map((x) => x.start), ["2019-04-01", "2020-04-01", "2021-04-01"], "the soil health index baseline is 2019-2021, as in the Atlas");
  // Radar compares the growing season too (not a fixed June to August).
  assert.deepEqual(w.radarSeason, { start: "2026-04-01", end: "2026-10-01" });
  assert.deepEqual(w.radarBaselines, [
    { start: "2019-04-01", end: "2019-10-01" },
    { start: "2020-04-01", end: "2020-10-01" },
    { start: "2021-04-01", end: "2021-10-01" },
  ]);
  // Out of season: last year's whole season (from a month before it), and last year's season for radar.
  const feb = analysisWindows("2026-02-10", 49.73);
  assert.equal(feb.seasonStart, "2025-03-01");
  assert.equal(feb.passes.start, "2025-03-01");
  assert.deepEqual(feb.radarSeason, { start: "2025-04-01", end: "2025-10-01" });
  assert.deepEqual(feb.chiSeason, { start: "2025-04-01", end: "2025-10-01" });
  // In April the passes reach back 90 days for the latest clear view.
  assert.equal(analysisWindows("2026-04-15", 49.73).passes.start, "2026-01-15");
});

test("analysis windows in the south cross the new year; the tropics use the last 12 months", () => {
  const south = analysisWindows(TODAY, -34.9);
  assert.equal(south.band, "south");
  // The season that started on 1 Oct 2026 is running: its curve starts a month before.
  assert.equal(south.seasonStart, "2026-09-01");
  assert.equal(south.passes.start, "2026-07-20", "90 days back reaches further than the season start");
  assert.deepEqual(south.chiSeason, { start: "2025-10-01", end: "2026-04-01" });
  // The normal years END in 2019, 2020 and 2021 (never reaching into 2022).
  assert.deepEqual(south.radarBaselines, [
    { start: "2018-10-01", end: "2019-04-01" },
    { start: "2019-10-01", end: "2020-04-01" },
    { start: "2020-10-01", end: "2021-04-01" },
  ]);
  const tropics = analysisWindows(TODAY, -12.55);
  assert.equal(tropics.band, "tropics");
  assert.equal(tropics.seasonStart, "2026-02-17", "the last 8 months");
  assert.deepEqual(tropics.chiSeason, { start: "2025-10-01", end: "2026-10-01" });
  assert.deepEqual(tropics.chiBaseline.map((w) => w.end), ["2019-10-01", "2020-10-01", "2021-10-01"]);
  for (const w of [south, tropics]) assert.ok([w.passes, w.chiSeason, w.radarSeason].every((x) => x.end <= TODAY));
});

test("fire windows: from the war start inside a known war, else the last 2 years; normal rate from 2019-2021", () => {
  const war = fireWindows({ id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }, TODAY);
  assert.deepEqual(war.window, { start: "2022-02-24", end: TODAY });
  assert.deepEqual(war.conflict, { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  assert.deepEqual(war.baselines, [{ start: "2019-01-01", end: "2022-01-01" }], "a window over a year long is compared with the whole of 2019-2021");
  assert.equal(war.baselineDays, 1096);
  const peace = fireWindows(null, TODAY);
  assert.deepEqual(peace.window, { start: "2024-10-18", end: TODAY });
  assert.equal(peace.days, 730);
  assert.equal(peace.conflict, null);
  assert.equal(peace.key, "none");
  // A war that began less than a year ago: the same calendar span of each normal year.
  const recent = fireWindows({ id: "x", name: "X", since: "2026-03-01" }, TODAY);
  assert.deepEqual(recent.baselines.map((w) => w.start), ["2019-03-01", "2020-03-01", "2021-03-01"]);
  assert.equal(recent.baselineDays, 3 * recent.days);
  // Excess: detections minus the normal rate x window length, never below 0.
  assert.deepEqual(excessFiresOf(8, 12, peace), { fires: 8, firesNormal: 8, excessFires: 0 });
  assert.deepEqual(excessFiresOf(2, 12, peace), { fires: 2, firesNormal: 8, excessFires: 0 });
  assert.deepEqual(excessFiresOf(20, 3, war), { fires: 20, firesNormal: 4.6, excessFires: 15.4 });
  assert.deepEqual(excessFiresOf(null, 3, war), { fires: null, firesNormal: null, excessFires: null });
});

test("the latest window is the last 30 days, or the 30 days up to an older clear pass", () => {
  assert.deepEqual(latestWindowFor("2026-10-12", TODAY), { start: "2026-09-18", end: TODAY });
  assert.deepEqual(latestWindowFor("2026-08-20", TODAY), { start: "2026-07-22", end: "2026-08-21" });
  assert.deepEqual(latestWindowFor(null, TODAY), { start: "2026-09-18", end: TODAY });
  assert.deepEqual(latestWindowFor("2026-05-01", TODAY), { start: "2026-09-18", end: TODAY }, "older than 90 days: no special window");
});

test("the normal is the same weeks of each baseline year", () => {
  assert.deepEqual(normalWindow({ start: "2026-09-18", end: "2026-10-18" }, 2019), { start: "2019-09-18", end: "2019-10-18" });
  assert.deepEqual(normalWindows({ start: "2026-09-18", end: "2026-10-18" }).map((w) => w.start), ["2019-09-18", "2020-09-18", "2021-09-18"]);
  // Across the new year (southern summer): both ends move together.
  assert.deepEqual(normalWindow({ start: "2025-12-20", end: "2026-01-19" }, 2019), { start: "2019-12-20", end: "2020-01-19" });
  // 29 February in a year without it.
  assert.deepEqual(normalWindow({ start: "2028-02-14", end: "2028-02-29" }, 2019), { start: "2019-02-14", end: "2019-03-01" });
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
  // A field inside a known war (near Kupiansk).
  const plan = { ...PLAN, fire: fireWindows({ id: "ukraine-2022", name: "Russia's full-scale invasion of Ukraine", since: "2022-02-24" }, TODAY) };
  // Real Earth Engine near the front: 3-5 fire days on every field, radar change 0-3.5%.
  const quiet = buildAnalysis(plan, measuredFor({ fires: 5, means: { radarChanged: 0.035, chiDrop: 0.02 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(quiet.damage.detected, false);
  assert.equal(quiet.damage.damagedHa, null);
  // Fires backed by a soil-index drop: damaged, but with no radar extent the area is unknown.
  const burnt = buildAnalysis(plan, measuredFor({ fires: 5, means: { radarChanged: 0.02, chiDrop: 0.15 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(burnt.damage.detected, true);
  assert.equal(burnt.damage.damagedHa, null);
  // Radar change over a fifth of the field: damaged, with its area.
  const cratered = buildAnalysis(plan, measuredFor({ fires: 1, means: { radarChanged: 0.2 } }), null, { today: TODAY, updatedAt: "x" });
  assert.equal(cratered.damage.detected, true);
  assert.equal(cratered.damage.damagedHa, 10);
  // The same radar change on a field no war covers (real data, Beauce, France:
  // ploughing or a new crop): not damage. With unusual fire too, it is.
  const peaceful = { ...PLAN, fire: fireWindows(null, TODAY) };
  assert.equal(buildAnalysis(peaceful, measuredFor({ fires: 0, means: { radarChanged: 0.38 } }), null, { today: TODAY, updatedAt: "x" }).damage.detected, false);
  assert.equal(buildAnalysis(peaceful, measuredFor({ fires: 6, means: { radarChanged: 0.2 } }), null, { today: TODAY, updatedAt: "x" }).damage.detected, true);
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

test("detected shapes: small holes (edge noise) are filled, broken whole-globe shapes dropped", () => {
  const outer = [[37.50, 49.70], [37.52, 49.70], [37.52, 49.71], [37.50, 49.71], [37.50, 49.70]];
  const speck = [[37.505, 49.703], [37.5052, 49.703], [37.5052, 49.7032], [37.505, 49.703]]; // about 0.02 ha
  const pond = [[37.51, 49.703], [37.513, 49.703], [37.513, 49.706], [37.51, 49.706], [37.51, 49.703]]; // about 7 ha
  assert.equal(fillSmallHoles({ type: "Polygon", coordinates: [outer, speck, pond] }).coordinates.length, 2, "the pond stays a hole");
  // Real Earth Engine, Kenya (-0.354, 35.996), 2026-10-19: one traced field came back as the whole globe.
  const globe = { type: "Polygon", coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]] };
  const candidates = toCandidates([{ geometry: globe }, { geometry: { type: "Polygon", coordinates: [outer] } }]);
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].areaHa < DETECT.maxHa);
});

test("touching parcels of the same crop are joined into one field; different crops stay apart", () => {
  const box = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const profile = (ndvi, ndwi = 0.1) => Object.fromEntries([0, 1, 2, 3, 4, 5].flatMap((i) => [[`n${i}`, ndvi + i * 0.01], [`w${i}`, ndwi]]));
  // Three parcels in a row, each grown back 10 m over the 1-pixel line between them.
  const west = { geometry: box(-60.96, -34.91, -60.9499, -34.90), properties: profile(0.6) };
  const middle = { geometry: box(-60.9501, -34.91, -60.94, -34.90), properties: profile(0.62) }; // same crop (0.02 apart)
  const east = { geometry: box(-60.9401, -34.91, -60.93, -34.90), properties: profile(0.3) }; // another crop
  const far = { geometry: box(-60.90, -34.91, -60.89, -34.90), properties: profile(0.6) }; // same crop, across a road
  const parcels = parcelShapes([west, middle, east, far]);
  assert.equal(parcels.length, 4);
  assert.ok(profileDifference(parcels[0].profile, parcels[1].profile) <= DETECT.mergeMaxDiff);
  assert.ok(profileDifference(parcels[1].profile, parcels[2].profile) > 0.25);
  assert.equal(profileDifference({ n0: 0.5 }, { n0: 0.5 }), null, "too few windows to judge");
  assert.equal(parcelsTouch(parcels[0], parcels[1]), true);
  assert.equal(parcelsTouch(parcels[0], parcels[3]), false);
  const groups = sameCropGroups(parcels);
  assert.deepEqual(groups, [[0, 1], [2], [3]]);
  // The joined outline replaces the parts; a join that came back broken keeps them.
  const joined = joinGroups(parcels, groups, [box(-60.96, -34.91, -60.94, -34.90)]);
  assert.equal(joined.length, 3);
  assert.ok(Math.abs(joined[0].areaHa / (parcels[0].areaHa + parcels[1].areaHa) - 1) < 0.03, "the whole, less the overlap");
  assert.equal(joinGroups(parcels, groups, [box(-60.96, -34.91, -60.959, -34.909)]).length, 4);
  assert.equal(joinGroups(parcels, groups, []).length, 4);
  // A finer trace does not split a parcel into pieces of one crop.
  const whole = parcelShapes([{ geometry: box(-60.96, -34.91, -60.94, -34.90), properties: profile(0.6) }]);
  assert.equal(splitByFinerEdges(whole, parcels.slice(0, 2), { minHa: 1 }).length, 1);
  assert.equal(splitByFinerEdges(whole, parcelShapes([west, { ...middle, properties: profile(0.3) }]), { minHa: 1 }).length, 2);
});

test("pieces of one big field with the same phenology are joined unless a real edge lies between them (7.14)", () => {
  const box = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  // Different profiles (a wet hollow made one piece darker in one window)...
  const profile = (ndvi) => Object.fromEntries([0, 1, 2, 3, 4, 5].flatMap((i) => [[`n${i}`, ndvi + (i === 2 ? 0.1 : 0)], [`w${i}`, 0.1]]));
  // ...but one season curve (soy sown the same week): peak at composite 9.
  const season = (scale, shift = 0) => Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`k${i}`, 0.2 + scale * Math.exp(-(((i - 9 - shift) / 4) ** 2))]));
  const a = { geometry: box(-55.73, -12.56, -55.7199, -12.55), properties: { ...profile(0.5), ...season(0.6) } };
  const b = { geometry: box(-55.7201, -12.56, -55.71, -12.55), properties: { ...profile(0.6), ...season(0.55) } };
  const c = { geometry: box(-55.7101, -12.56, -55.70, -12.55), properties: { ...profile(0.3), ...season(0.6, 3) } }; // sown a month later
  const parcels = parcelShapes([a, b, c]);
  assert.equal(Object.keys(parcels[0].curve).length, 18);
  assert.ok(profileDifference(parcels[0].profile, parcels[1].profile) > DETECT.mergeMaxDiff, "the profile rule alone would not join them");
  assert.equal(sameCropGroups(parcels).length, 3);
  // The phenology test.
  assert.ok(curveCorrelation(parcels[0].curve, parcels[1].curve).r > 0.99);
  assert.ok(Math.abs(curvePeakDay(parcels[0].curve) - 95) < 1, curvePeakDay(parcels[0].curve));
  assert.equal(samePhenology(parcels[0], parcels[1]), true);
  assert.equal(samePhenology(parcels[1], parcels[2]), false, "peaks 30 days apart");
  assert.equal(samePhenology({ curve: { k0: 0.2, k1: 0.5, k2: 0.3 } }, { curve: { k0: 0.2, k1: 0.5, k2: 0.3 } }), false, "too few composites to judge");
  assert.deepEqual(curveCorrelation({ k0: 0.5, k1: 0.5, k2: 0.5 }, { k0: 0.1, k1: 0.5, k2: 0.3 }), { r: null, n: 3 });
  assert.equal(curvePeakDay({}), null);
  assert.deepEqual(phenologyPairs(parcels), [[0, 1]]);
  // The strip between them: a real edge (not cropland, a straight line, a
  // line in most pictures) or not. A strip 1 km x 1 km in its box: a
  // straight diagonal 1.41 km long has a perimeter of about 2.83 km.
  const bounds = [[[-55.73, -12.56], [-55.7208, -12.56], [-55.7208, -12.551], [-55.73, -12.551], [-55.73, -12.56]]];
  const winding = { stripBounds: bounds, perimeterM: 7000 };
  const straight = { stripBounds: bounds, perimeterM: 2900 };
  assert.ok(stripStraightness(straight) > 0.95 && stripStraightness(winding) < 0.45, `${stripStraightness(straight)} ${stripStraightness(winding)}`);
  assert.equal(stripStraightness({}), null);
  assert.equal(isRealEdge({ ...winding, stripCropland: 0.95, edgeAny: 0.3, edgePersistent: 0.05 }), false, "a winding line in one or two pictures only");
  assert.equal(isRealEdge({ ...straight, stripCropland: 0.95, edgeAny: 0.3, edgePersistent: 0.05 }), true, "a straight line: a field boundary");
  assert.equal(isRealEdge({ ...winding, stripCropland: 0.95, edgeAny: 0.3, edgePersistent: 0.2 }), true, "a line in most pictures");
  assert.equal(isRealEdge({ ...winding, stripCropland: 0.4, edgeAny: 0.1, edgePersistent: 0 }), true, "not cropland");
  assert.equal(isRealEdge({ ...winding, stripCropland: 0.95, edgeAny: 0, edgePersistent: 0 }), false);
  assert.equal(isRealEdge({ stripCropland: 0.95, edgeAny: 0, edgePersistent: 0 }), true, "shape unknown: kept apart");
  assert.equal(isRealEdge(undefined), true, "not measured: kept apart");
  const groups = sameCropGroups(parcels, { links: [[0, 1]] });
  assert.deepEqual(groups, [[0, 1], [2]]);
  // A joined field is not cut up again by the finer trace.
  const joined = joinGroups(parcels, groups, [box(-55.73, -12.56, -55.71, -12.55)]);
  assert.equal(joined[0].joined, true);
  assert.equal(splitByFinerEdges(joined, parcels.slice(0, 2), { minHa: 1 }).length, 2);
  assert.equal(toCandidates(joined).length, 2);
  assert.ok(toCandidates(joined).every((c) => !("joined" in c) && !("curve" in c)));
});

test("phenology composites: 10-day windows over the last complete season, never past today", () => {
  const north = phenologyWindows(TODAY, 42.03, null);
  assert.equal(north[0].start, "2026-04-01");
  assert.equal(north.at(-1).end, "2026-10-01");
  assert.equal(north.length, 19);
  assert.ok(north.every((w) => w.start < w.end && w.end <= TODAY));
  const tropics = phenologyWindows(TODAY, -12.55, null);
  assert.equal(tropics[0].start, "2025-10-01");
  assert.ok(tropics.length >= 36 && tropics.length <= 37, tropics.length);
  assert.equal(PHENOLOGY_MERGE.minCorrelation, 0.95);
  assert.equal(PHENOLOGY_MERGE.maxPeakDays, 10);
});

test("detectFields joins touching parcels of one crop with no real edge between them, one request more", async () => {
  const box = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  // Two ~30 ha halves of one field, overlapping by the grown-back edge.
  const halves = [box(37.52, 49.71, 37.5301, 49.7145), box(37.5299, 49.71, 37.54, 49.7145)];
  const boundary = [[49.716, 37.518], [49.716, 37.542], [49.709, 37.542], [49.709, 37.518]];
  const apart = fakeProvider({ parcelGrid: 0, extraParcels: halves, values: { edgePersistent: 0.02 } });
  const two = await apart.provider.detectFields({ boundary });
  assert.equal(two.candidates.length, 2, "a straight line between them: two fields");
  const strips = apart.ee.callsNamed("Image.rename").filter((c) => c.args[0] === "edgePersistent");
  assert.equal(strips.length, 1, "the strip between them was measured");
  const merges = [];
  const together = fakeProvider({ parcelGrid: 0, extraParcels: halves, values: { edgePersistent: 0.02, perimeterM: 6000 } });
  const one = await together.provider.detectFields({ boundary, onMerge: (m) => merges.push(...m) });
  assert.equal(one.candidates.length, 1, "a winding line in one picture only: one field");
  assert.equal(merges.length, 1);
  assert.equal(merges[0].joined, true);
  assert.ok(merges[0].r > 0.95 && merges[0].straightness < 0.7, JSON.stringify(merges[0]));
  assert.ok(one.candidates[0].areaHa > 1.6 * Math.min(...two.candidates.map((c) => c.areaHa)));
  // Off: the parts stay apart and no strip is measured.
  const before = DETECT.mergeByPhenology;
  DETECT.mergeByPhenology = false;
  try {
    const off = fakeProvider({ parcelGrid: 0, extraParcels: halves, values: { edgePersistent: 0.02 } });
    assert.equal((await off.provider.detectFields({ boundary })).candidates.length, 2);
    assert.equal(off.ee.callsNamed("Image.rename").filter((c) => c.args[0] === "edgePersistent").length, 0);
  } finally {
    DETECT.mergeByPhenology = before;
  }
});

test("the share of a search circle covered by fields (to widen a search that landed in a town)", () => {
  const center = { lat: 42.03, lon: -93.62 };
  const near = { centroid: [42.031, -93.621], areaHa: 100 };
  const far = { centroid: [42.2, -93.62], areaHa: 1000 };
  const circleHa = (Math.PI * 1200 * 1200) / 1e4;
  assert.ok(Math.abs(coverWithin([near, far], center, 1200) - 100 / circleHa) < 1e-9, "only fields centred inside count");
  assert.equal(coverWithin([], center, 1200), 0);
});

test("detectFields around a point in a town searches the nearest farmland and says so", async () => {
  // No fields anywhere: the nearest farmland is looked for once, then "No fields found".
  const { ee, provider } = fakeProvider({ parcelGrid: 0 });
  const empty = await provider.detectFields({ center: { lat: 42.03, lon: -93.62 }, radiusM: 1200 });
  assert.equal(empty.candidates.length, 0);
  assert.match(empty.warnings.at(-1), /No fields found here/);
  assert.deepEqual(empty.center, { lat: 42.03, lon: -93.62 });
  const circles = ee.calls.filter((c) => c.name === "Geometry.buffer").map((c) => c.args[0]);
  assert.ok(circles.filter((r) => r === 1200).length >= 1 + farmlandSpots({ lat: 42.03, lon: -93.62 }, 1200).length, "the circle and each farmland spot");
  assert.ok(circles.every((r) => r <= 1200 * DETECT.pointPad), "never a bigger circle");
  assert.ok(ee.callsNamed("Image.reduceRegions").some((c) => c.args[0].scale === 30), "cropland share of each spot");
  // Plenty of fields at once: no farmland search, the circle asked for is given back.
  const { ee: ee2, provider: p2 } = fakeProvider();
  const full = await p2.detectFields({ center: { lat: 49.73, lon: 37.54 }, radiusM: 1200 });
  assert.deepEqual([full.center, full.radiusM], [{ lat: 49.73, lon: 37.54 }, 1200]);
  assert.ok(!full.warnings.some((w) => /nearest farmland/.test(w)));
  assert.equal(ee2.calls.filter((c) => c.name === "Geometry.buffer").length, 2);
});

test("the nearest farmland: the closest circle that is mostly cropland, else the best one, else none", () => {
  const center = { lat: 42.03, lon: -93.62 };
  const spots = farmlandSpots(center, 1200);
  assert.equal(farmlandSpots(center, 300).length, spots.length, "small circles: no more spots");
  assert.ok(spots.length > 100 && spots.every((s) => Math.hypot((s.lat - center.lat) * 110.574, (s.lon - center.lon) * 111.32 * Math.cos((42.03 * Math.PI) / 180)) <= DETECT.farmlandMaxKm + 1e-6));
  const at = (dx, dy, cropland) => ({ lat: center.lat + dy / 110.574, lon: center.lon + dx / (111.32 * Math.cos((42.03 * Math.PI) / 180)), cropland });
  const near = at(2.4, 0, 0.75);
  const far = at(0, -7.2, 0.98);
  const picked = pickFarmland([at(1.2, 0, 0.1), far, near], center);
  assert.deepEqual(picked, { lat: far.lat, lon: far.lon }, "all cropland first, even further away");
  const full = at(4.8, 0, 0.92);
  assert.deepEqual(pickFarmland([full, far, near], center), { lat: full.lat, lon: full.lon }, "the nearest that is all cropland");
  assert.deepEqual(pickFarmland([at(1.2, 0, 0.1), near, at(0, -7.2, 0.8)], center), { lat: near.lat, lon: near.lon }, "else the nearest mostly cropland");
  assert.deepEqual(pickFarmland([at(1.2, 0, 0.1), at(3.6, 0, 0.3)], center), { lat: at(3.6, 0, 0.3).lat, lon: at(3.6, 0, 0.3).lon });
  assert.equal(pickFarmland([at(1.2, 0, 0.05)], center), null);
  assert.equal(compassFrom(center, near), "east");
  assert.equal(compassFrom(center, far), "south");
  assert.equal(compassFrom(center, at(-3, 3, 1)), "north-west");
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

test("no two candidates for the same ground: a shape around them all and duplicate pieces go", () => {
  const box = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const shape = (geometry) => ({ geometry, areaHa: areaHa(geometry), centroid: [(geometry.coordinates[0][0][1] + geometry.coordinates[0][2][1]) / 2, (geometry.coordinates[0][0][0] + geometry.coordinates[0][2][0]) / 2] });
  // Real case (Beauce, France, 2026-10-19): one shape equal to the drawn
  // boundary around every field, and a piece lying inside another field.
  const whole = shape(box(1.60, 48.20, 1.62, 48.21));
  const a = shape(box(1.600, 48.200, 1.609, 48.2095));
  const b = shape(box(1.6102, 48.200, 1.62, 48.2095));
  const piece = shape(box(1.601, 48.201, 1.607, 48.208)); // mostly inside a
  const kept = withoutOverlaps([whole, a, b, piece]);
  assert.deepEqual(kept.map((f) => f.geometry), [a.geometry, b.geometry].sort((x, y) => areaHa(y) - areaHa(x)));
  // Neighbours that overlap only along a shared edge both stay.
  const left = shape(box(1.600, 48.200, 1.6102, 48.21));
  const right = shape(box(1.6100, 48.200, 1.62, 48.21));
  assert.equal(withoutOverlaps([left, right]).length, 2);
  // A finer piece larger than the parcel is not a part of it.
  const small = shape(box(1.600, 48.200, 1.605, 48.205));
  assert.equal(splitByFinerEdges([small], [whole, shape(box(1.601, 48.201, 1.602, 48.202))]).length, 1);
});

test("detectFields inside a boundary drops a broken whole-globe shape cut down to the boundary", async () => {
  const globe = { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] };
  const { provider } = fakeProvider({ extraParcels: [globe] });
  const boundary = [[49.735, 37.512], [49.735, 37.562], [49.702, 37.562], [49.702, 37.512]];
  const outline = { type: "Polygon", coordinates: [[...boundary, boundary[0]].map(([lat, lon]) => [lon, lat])] };
  const boundaryHa = areaHa(outline);
  const { candidates } = await provider.detectFields({ boundary });
  assert.ok(candidates.length >= 4, `found ${candidates.length}`);
  assert.ok(candidates.every((c) => c.areaHa < boundaryHa * 0.5), candidates.map((c) => c.areaHa).join(", "));
  const total = candidates.reduce((sum, c) => sum + c.areaHa, 0);
  assert.ok(total <= boundaryHa, `${total} ha of fields in a ${boundaryHa} ha boundary`);
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
  assert.equal(ee.requests.length, 2, "one request for the growing season, one for the fields");
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
function assertAnalysis(a, field, seasonFrom = "2026-03-01") {
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
  assert.deepEqual(Object.keys(a.stress).sort(), ["cause", "level", "ndwiAnomaly", "patches", "redEdge", "redEdgeOnlyShare", "share", "stressedHa"]);
  inRange(a.stress.share, 0, 1, "stress.share");
  inRange(a.stress.redEdgeOnlyShare, 0, 1, "stress.redEdgeOnlyShare");
  inRange(a.stress.ndwiAnomaly, -2, 2, "stress.ndwiAnomaly");
  assert.ok([null, "low", "medium", "high"].includes(a.stress.level));
  assert.ok([null, "dry", "other"].includes(a.stress.cause));
  assert.equal(typeof a.stress.redEdge, "boolean");
  assert.ok(a.stress.patches.length <= 3);
  for (const p of a.stress.patches) {
    assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.radiusM >= 15 && p.ha > 0);
    assert.ok([null, "dry", "other"].includes(p.cause) && (p.ndwiAnomaly === null || Number.isFinite(p.ndwiAnomaly)));
  }
  assert.deepEqual(Object.keys(a.redEdge).sort(), ["ndre", "normal"]);
  inRange(a.redEdge.ndre, -1, 1, "redEdge.ndre");
  assert.deepEqual(
    Object.keys(a.harvest).sort(),
    ["basis", "daysToReady", "gdd", "harvestedOn", "lastDate", "leafDrop", "peak", "peakDate", "radarHarvestOn", "rainBefore", "stage", "standingDry", "window"],
  );
  assert.ok(["unknown", "notSown", "growing", "ripening", "ready", "harvested"].includes(a.harvest.stage));
  assert.ok([null, "dry-down", "heat units", "both", "radar", "images"].includes(a.harvest.basis));
  assert.equal(a.harvest.window, null);
  assert.equal(typeof a.harvest.standingDry, "boolean");
  // Radar and crop-type inputs.
  assert.deepEqual(Object.keys(a.radar).sort(), ["dropDb", "harvestedOn", "vhPasses", "vhPeak", "vhPeak".concat("Date"), "vhSeries"].sort());
  for (const p of a.radar.vhPasses) assert.ok(p.date < TODAY && p.vh > -35 && p.vh < 5 && [null, "ASCENDING", "DESCENDING"].includes(p.orbit) && (p.relOrbit === null || Number.isInteger(p.relOrbit)));
  for (const [i, p] of a.radar.vhSeries.entries()) assert.ok(Object.keys(p).join() === "date,vh" && (!i || p.date > a.radar.vhSeries[i - 1].date));
  assert.deepEqual(Object.keys(a.cropInputs).sort(), ["lat", "months", "peakMonth", "vhPeak"]);
  assert.equal(a.cropInputs.months.length, 18);
  assert.equal(a.cropInputs.months.at(-1).month, TODAY.slice(0, 7));
  assert.ok(a.cropDetected && typeof a.cropDetected.id === "string" && typeof a.cropDetected.label === "string");
  inRange(a.condition.score, 0, 1, "condition.score");
  assert.ok(a.condition.class === null || CONDITION_CLASSES.some((c) => c.id === a.condition.class));
  assert.deepEqual(Object.keys(a.damage).sort(), ["chiDrop", "damagedHa", "detected", "excessFires", "fires", "firesNormal", "radarChangedShare", "since"]);
  assert.equal(typeof a.damage.detected, "boolean");
  inRange(a.damage.radarChangedShare, 0, 1, "radarChangedShare");
  inRange(a.damage.fires, 0, 1e5, "fires");
  inRange(a.damage.excessFires, 0, 1e5, "excessFires");
  if (a.damage.fires !== null) assert.ok(a.damage.excessFires <= a.damage.fires);
  assert.match(a.damage.since, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(a.conflict === null || (a.conflict.id && a.conflict.name && a.conflict.since));
  inRange(a.damage.chiDrop, -1, 1, "chiDrop");
  inRange(a.soil.chernozemProbability, 0, 1, "chernozem");
  assert.ok([null, "chernozem"].includes(a.soil.soilTypeId));
  assert.ok(Array.isArray(a.season));
  for (const [i, p] of a.season.entries()) {
    assert.ok(p.date >= seasonFrom && p.date < TODAY);
    if (i) assert.ok(p.date > a.season[i - 1].date, "one reading per day, in order");
    assert.ok(p.clearPct >= 50 && Number.isFinite(p.ndvi));
    assert.deepEqual(Object.keys(p).sort(), ["clearPct", "date", "ndre", "ndvi", "ndwi", "ndyi"]);
  }
  for (const p of a.normalCurve) {
    assert.match(p.day, /^\d\d-(01|16)$/);
    assert.ok(p.low <= p.median && p.median <= p.high);
  }
  // The zones grid is no longer measured (spec 7.7).
  assert.equal(a.zones, null);
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
  // The growing season, the image check, 1 Sentinel-2 passes, 1 radar
  // passes, 1 monthly (18 months) and 1 stats request: NOT one per field,
  // and no zones request (spec 7.7).
  assert.equal(ee.requests.length, 6, `requests: ${ee.requests.length}`);
  assert.equal(ee.callsNamed("Image.sampleRectangle").length, 0, "no zones grid");
  // Each fields collection sent carries all 7 fields.
  const fieldFeatures = ee.callsNamed("Feature").filter((c) => c.args[1]?.fid);
  assert.equal(new Set(fieldFeatures.map((c) => c.args[1].fid)).size, 7);
  // Real values came back (the stats were not lost inside the Dictionary).
  const some = Object.values(analyses);
  assert.ok(some.every((a) => a.plantHealth.normal.median !== null && a.soil.chernozemProbability !== null && a.damage.fires !== null));
  // The demo farm is in Ukraine: damage is counted from the war's start.
  assert.ok(some.every((a) => a.conflict?.id === "ukraine-2022" && a.damage.since === "2022-02-24"));
  assert.ok(some.some((a) => a.season.length >= 10), "a season curve");
  assert.ok(some.every((a) => a.normalCurve.length === 24));
  // Datasets and bands are the real catalog ids.
  const loaded = new Set(ee.callsNamed("ImageCollection").map((c) => c.args[0]).filter((id) => typeof id === "string"));
  for (const id of ["COPERNICUS/S2_SR_HARMONIZED", "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED", "COPERNICUS/S1_GRD", "FIRMS"]) assert.ok(loaded.has(id), id);
  assert.ok(ee.calls.some((c) => c.name === "Image.select" && c.args[0] === "cs"));
  assert.ok(ee.calls.some((c) => c.name === "Image.select" && c.args[0] === "SCL"));
  // The per-pixel normal is the median of the three yearly composites (each
  // year counts once).
  const yearlySets = ee.callsNamed("ImageCollection").filter((c) => Array.isArray(c.args[0]) && c.args[0].length === 3);
  assert.ok(yearlySets.length >= 1, `yearly normals: ${yearlySets.length}`);
  // Red edge and yellow flowers are read from Sentinel-2 B8A/B5 and B3/B2.
  const nd = ee.callsNamed("Image.normalizedDifference").map((c) => c.args[0].join("/"));
  for (const pair of ["B8/B4", "B8/B11", "B8A/B5", "B3/B2"]) assert.ok(nd.includes(pair), pair);
  // Radar VH: IW pictures with VH, both orbit directions, averaged as power.
  assert.ok(ee.calls.some((c) => c.name === "Filter.listContains" && c.args[1] === "VH"));
  assert.ok(ee.calls.some((c) => c.name === "ImageCollection.select" && c.args[0] === "VH"));
  assert.ok(some.every((a) => a.radar.vhSeries.length > 10 && Number.isFinite(a.radar.vhPeak)), "a VH series and its peak");
  assert.ok(some.every((a) => a.season.some((p) => Number.isFinite(p.ndyi) && Number.isFinite(p.ndre))), "NDYI and NDRE per pass");
  // Never a future date.
  assert.ok(dateWindows(ee).every((w) => w.start <= w.end && w.end <= TODAY), JSON.stringify(dateWindows(ee).filter((w) => w.end > TODAY)));
  // The normal curve reads each half-month on its own (a whole year of
  // cloud-masked passes ran out of memory on real Earth Engine in Iowa).
  const curveWindows = dateWindows(ee).filter((w) => w.start >= "2018-12-01" && w.end <= "2022-01-31");
  assert.ok(curveWindows.length >= 72, `curve windows: ${curveWindows.length}`);
  assert.ok(!dateWindows(ee).some((w) => w.start.endsWith("-12-20") && w.end.endsWith("-01-12")), "no year-long curve collection");
  assert.ok(progress.length >= 4 && progress.at(-1)[0] === 1);
  assert.ok(progress.every(([share], i) => i === 0 || share >= progress[i - 1][0]), "progress only goes up");
  // Radar is compared from one orbit direction only (the same ground looks
  // different from the east and from the west): the radar change image
  // (the request with "abs") filters every Sentinel-1 collection by it.
  const passes = ee.calls.filter((c) => c.name === "Filter.eq" && c.args[0] === "orbitProperties_pass").map((c) => c.args[1]);
  assert.ok(passes.includes("ASCENDING") && passes.includes("DESCENDING"), "both directions counted");
  const stats = ee.requests.find((r) => r.has("abs"));
  assert.ok(stats, "the stats request measures radar change");
  const used = new Set(stats.find("Filter.eq").filter((n) => n.args[0] === "orbitProperties_pass").map((n) => n.args[1]));
  assert.equal(used.size, 1, `one orbit direction in the radar change: ${[...used]}`);
});

test("many fields go in batched requests, at most PARALLEL_REQUESTS at once", async () => {
  const fields = Array.from({ length: 20 }, (_, i) => ({ ...DEMO[i % 7], id: `fld-${i}` }));
  // 100 pictures this season: 30 fields per passes request would be 3,000.
  const { ee, provider } = fakeProvider({ sizes: { "COPERNICUS/S2_SR_HARMONIZED": 100, "COPERNICUS/S1_GRD": 100 } });
  const { analyses } = await provider.analyzeFields({ fields, today: TODAY });
  assert.equal(Object.keys(analyses).length, 20);
  assert.equal(passesPerRequest(100), 30);
  assert.equal(passesPerRequest(150), 20);
  assert.equal(passesPerRequest(0), MAX_FIELDS_PER_PASS_REQUEST);
  const stats = ee.requests.filter((r) => r.has("abs")).length;
  assert.equal(stats, Math.ceil(20 / FIELDS_PER_REQUEST));
  // season + check + 1 S2 passes + 1 radar passes + 1 monthly + stats
  assert.equal(ee.requests.length, 5 + stats);
  assert.ok(ee.stats.peakActive <= PARALLEL_REQUESTS && ee.stats.peakActive > 2, `at most ${PARALLEL_REQUESTS} requests at once (${ee.stats.peakActive})`);
  // 150 pictures and 45 fields: passes in 3 requests of at most 20 fields.
  const many = Array.from({ length: 45 }, (_, i) => ({ ...DEMO[i % 7], id: `fld-${i}` }));
  const big = fakeProvider({ sizes: { "COPERNICUS/S2_SR_HARMONIZED": 150 } });
  await big.provider.analyzeFields({ fields: many, today: TODAY });
  const passRequests = big.ee.requests.filter((r) => r.find("select").some((n) => Array.isArray(n.args[0]) && n.args[0].includes("ndyi")));
  assert.equal(passRequests.length, 3);
});

test("monthly requests: months in runs of 24, fields x months at most 1,500", () => {
  const fields = Array.from({ length: 70 }, (_, i) => ({ id: `f${i}`, areaHa: 20 }));
  const months = monthRange("2019-01", "2026-10");
  const jobs = monthlyJobs(fields, months);
  assert.ok(jobs.every((job) => job.months.length <= MONTHS_PER_REQUEST && job.months.length * job.part.length <= MONTH_ELEMENTS_PER_REQUEST));
  // Every field-month exactly once.
  const seen = new Set(jobs.flatMap((job) => job.part.flatMap((f) => job.months.map((m) => `${f.id}|${m}`))));
  assert.equal(seen.size, 70 * 94);
  assert.equal(jobs.length, 4 * 2);
  assert.deepEqual(monthlyJobs([], months), []);
  assert.equal(monthlyScale([{ areaHa: 2 }, { areaHa: 30 }, { areaHa: 600 }]), 20);
  assert.equal(monthlyScale([{ areaHa: 2000 }]), 90);
  assert.deepEqual(monthValue("2026-05", { ndvi: 0.81234, ndwi: 0.1, clear: 0.9 }), { month: "2026-05", ndvi: 0.812, ndwi: 0.1, clearPct: 90 });
  assert.deepEqual(monthValue("2026-05", { ndvi: 0.8, clear: 0.3 }), { month: "2026-05", ndvi: null, ndwi: null, clearPct: 30 });
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

// ---------- Stress v2, radar harvest, crop type, batched history ----------

// A batched monthly request: one image with bands m<i>_ndvi, m<i>_ndwi, m<i>_clear.
const isMonthlyRequest = (r) => r.find("rename").some((n) => Array.isArray(n.args[0]) && n.args[0][0] === "m0_ndvi");

test("stress v2: the red-edge rule OR the NDVI rule, as image arithmetic; the cause from the NDWI anomaly", async () => {
  const dry = fakeProvider({ values: { stressed: 0.2, redEdgeOnly: 0.05, ndwiAnomaly: -0.1 } });
  const { analyses } = await dry.provider.analyzeFields({ fields: DEMO.slice(0, 2), today: TODAY });
  const a = analyses[DEMO[0].id];
  assert.equal(a.stress.share, 0.2);
  assert.equal(a.stress.level, "high");
  assert.equal(a.stress.ndwiAnomaly, -0.1);
  assert.equal(a.stress.redEdgeOnlyShare, 0.05);
  assert.equal(a.stress.cause, "dry");
  assert.equal(a.stress.redEdge, true);
  assert.ok(a.stress.patches.length > 0 && a.stress.patches.every((p) => p.cause === "dry" && p.ndwiAnomaly === -0.1));
  // The stats request: field medians of NDVI and NDRE painted back, the
  // two rules joined with OR, the NDWI anomaly over the stressed pixels.
  const stats = dry.ee.requests.find((r) => r.has("abs"));
  assert.ok(stats.find("rename").some((n) => JSON.stringify(n.args[0]) === JSON.stringify(["medNdvi", "medNdre"])));
  assert.ok(stats.has("or") && stats.has("not"), "stressed = byNdvi OR byRedEdge; redEdgeOnly = byRedEdge AND NOT byNdvi");
  for (const name of ["stressed", "redEdgeOnly", "ndwiAnomaly"]) assert.ok(stats.find("rename").some((n) => n.args[0] === name), name);
  // The red-edge thresholds are method.js's.
  const constants = stats.find("subtract").map((n) => n.args[0]).filter((v) => typeof v === "number");
  for (const v of [RED_EDGE_RULES.belowFieldMedian, RED_EDGE_RULES.belowNormal, STRESS_RULES.belowFieldMedian, STRESS_RULES.belowNormal]) assert.ok(constants.includes(v), `${v}`);
  // Wetter than normal where stressed: not water.
  const wet = fakeProvider({ values: { stressed: 0.1, redEdgeOnly: 0, ndwiAnomaly: 0.02 } });
  const b = (await wet.provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY })).analyses[DEMO[0].id];
  assert.deepEqual([b.stress.cause, b.stress.redEdge], ["other", false]);
  // No stress: no cause.
  const none = fakeProvider({ values: { stressed: 0, redEdgeOnly: 0 } });
  const c = (await none.provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY })).analyses[DEMO[0].id];
  assert.deepEqual([c.stress.share, c.stress.cause, c.stress.ndwiAnomaly, c.stress.redEdge], [0, null, null, false]);
  // The red-edge normal is read from the same 2019-2021 weeks.
  assert.ok(a.redEdge.normal.median !== null && a.redEdge.ndre !== null);
});

test("radar harvest: a tall crop cut shows as a VH drop through cloud; with no drop it is still standing", async () => {
  const corn = DEMO.slice(0, 1).map((f) => ({ ...f, crop: "Corn", cropSource: "user" }));
  // VH: -12 dB under the crop until 10 September 2026, then -18 dB (cut).
  const cut = fakeProvider({ values: { vhPower: (u, { date }) => 10 ** ((date < Date.parse("2026-09-10") ? -12 : -18) / 10) } });
  const a = (await cut.provider.analyzeFields({ fields: corn, today: TODAY })).analyses[corn[0].id];
  assert.ok(a.radar.harvestedOn >= "2026-09-10" && a.radar.harvestedOn <= "2026-09-14", a.radar.harvestedOn);
  assert.ok(a.radar.dropDb >= 5.9);
  assert.equal(a.harvest.stage, "harvested");
  assert.equal(a.harvest.basis, "radar");
  assert.equal(a.harvest.radarHarvestOn, a.radar.harvestedOn);
  assert.equal(a.harvest.standingDry, false);
  // The same field, dry and low on NDVI, with no drop: still standing, ready.
  const standing = fakeProvider({ values: { vhPower: () => 10 ** (-13 / 10) } });
  const b = (await standing.provider.analyzeFields({ fields: corn, today: TODAY })).analyses[corn[0].id];
  assert.equal(b.radar.harvestedOn, null);
  assert.equal(b.harvest.standingDry, true);
  assert.equal(b.harvest.stage, "ready");
  assert.equal(b.harvest.radarHarvestOn, null);
  // A placeholder crop (not the farmer's word) is not used as the crop.
  assert.equal(fieldsInput([{ ...DEMO[0], crop: "Corn", cropSource: "demo" }])[0].crop, null);
  assert.equal(fieldsInput([{ ...DEMO[0], crop: "Corn" }])[0].crop, null);
  assert.equal(fieldsInput(corn)[0].crop, "Corn");
});

test("the VH series: dB from the mean power per picture, cleaned by a running median; the peak near the NDVI peak", () => {
  const { passes, series } = vhSeriesOf([
    { date: "2026-07-02", vhPower: 0.05, orbit: "DESCENDING", relOrbit: 36 },
    { date: "2026-07-01", vhPower: 10 ** -1.3, orbit: "ASCENDING", relOrbit: 14 },
    { date: "2026-07-03", vhPower: 0 },
    { date: "bad", vhPower: 0.05 },
  ]);
  assert.deepEqual(passes, [
    { date: "2026-07-01", vh: -13, orbit: "ASCENDING", relOrbit: 14 },
    { date: "2026-07-02", vh: -13.01, orbit: "DESCENDING", relOrbit: 36 },
  ]);
  // Two days only: each is the median (mean) of the two.
  assert.deepEqual(series, [{ date: "2026-07-01", vh: -13 }, { date: "2026-07-02", vh: -13 }]);
  // Real noise over stubble (demo farm, September 2026): one bright
  // wet-day picture. Cleaned: no 3 dB "drop" left.
  const day = (i) => shiftDays("2026-09-01", i);
  const noisy = [-22.9, -23.8, -21.7, -23.7, -23.9, -16.1, -20.3, -23.0, -24.0].map((vh, i) => ({ date: day(i * 2), vh }));
  assert.ok(radarHarvest(noisy, "2026-07-01").harvestedOn, "raw: a false harvest");
  const cleaned = cleanVh(noisy);
  assert.ok(cleaned.every((p, i) => !i || cleaned[i - 1].vh - p.vh < 3), JSON.stringify(cleaned));
  assert.equal(radarHarvest(cleaned, "2026-07-01").harvestedOn, null);
  // Real Iowa corn (field 1, 2026): cut between 27 September and 9 October.
  const iowa = [
    ["2026-09-15", -14.77], ["2026-09-20", -14.52], ["2026-09-27", -13.96], ["2026-10-09", -19.43], ["2026-10-14", -22.5],
  ].map(([date, vh]) => ({ date, vh }));
  assert.equal(radarHarvest(cleanVh(iowa), "2026-08-20").harvestedOn, "2026-10-09");
  // A real cut (-12 -> -19 dB and staying there) keeps its step and its day.
  const cut = [-12, -12.5, -12, -12.2, -19, -19.5, -19, -18.8].map((vh, i) => ({ date: day(i * 3), vh }));
  assert.equal(radarHarvest(cleanVh(cut), "2026-07-01").harvestedOn, day(12));
  // The peak: only within VH_PEAK_DAYS of the NDVI peak (frozen ground in
  // winter reads bright too).
  const year = [
    { date: "2026-02-10", vh: -11 },
    { date: "2026-07-10", vh: -14 },
    { date: "2026-07-20", vh: -12.5 },
    { date: "2026-07-30", vh: -13 },
  ];
  assert.deepEqual(vhPeakOf(year, "2026-07-18"), { vhPeak: -12.5, vhPeakDate: "2026-07-20" });
  assert.deepEqual(vhPeakOf(year, null), { vhPeak: null, vhPeakDate: null });
  assert.deepEqual(vhPeakOf(year, "2026-03-01"), { vhPeak: null, vhPeakDate: null });
  assert.equal(VH_PEAK_DAYS, 30);
});

test("the crop type is read from 18 months, this season's passes (with NDYI) and the VH peak", async () => {
  const { ee, provider } = fakeProvider();
  const { analyses } = await provider.analyzeFields({ fields: DEMO.slice(0, 3), today: TODAY });
  for (const field of DEMO.slice(0, 3)) {
    const a = analyses[field.id];
    assert.equal(a.cropInputs.months[0].month, "2025-05");
    assert.ok(a.cropInputs.months.every((m) => Object.keys(m).join() === "month,ndvi"));
    assert.ok(a.cropInputs.months.some((m) => Number.isFinite(m.ndvi)));
    assert.equal(a.cropInputs.peakMonth, 7);
    assert.ok(Math.abs(a.cropInputs.lat - 49.72) < 0.05);
    assert.equal(a.cropInputs.vhPeak, a.radar.vhPeak);
    assert.deepEqual(a.cropDetected, classifyCrop({ ...a.cropInputs, passes: a.season }));
  }
  // Last season's crop is not used for this season's harvest.
  const pass = (date, ndvi) => ({ date, ndvi });
  assert.equal(seasonDone([pass("2026-06-01", 0.3), pass("2026-07-01", 0.6), pass("2026-08-01", 0.85), pass("2026-09-01", 0.6), pass("2026-10-01", 0.3)]), true);
  assert.equal(seasonDone([pass("2026-08-01", 0.2), pass("2026-08-20", 0.3), pass("2026-09-05", 0.5), pass("2026-09-20", 0.7), pass("2026-10-05", 0.85)]), false, "still greening up");
  assert.equal(seasonDone([]), false);
  // The 18 months of all fields in one batched request (18 x 3 values).
  const monthly = ee.requests.filter(isMonthlyRequest);
  assert.equal(monthly.length, 1);
});

test("histories in the same run (historyFor) and fieldHistories: batched, the same answer as fieldHistory", async () => {
  const { ee, provider } = fakeProvider();
  const result = await provider.analyzeFields({ fields: DEMO.slice(0, 3), today: TODAY, historyFor: [DEMO[1].id] });
  assert.deepEqual(Object.keys(result.histories), [DEMO[1].id]);
  const months = result.histories[DEMO[1].id];
  assert.equal(months.length, 94);
  assert.deepEqual(months[0], { ...months[0], month: "2019-01" });
  for (const m of months) {
    assert.deepEqual(Object.keys(m).sort(), ["clearPct", "month", "ndvi", "ndwi"]);
    if (m.clearPct < 50) assert.equal(m.ndvi, null);
  }
  // The field with history still gets its 18 crop months (the last 18 of them).
  assert.deepEqual(result.analyses[DEMO[1].id].cropInputs.months, months.slice(-18).map(({ month, ndvi }) => ({ month, ndvi })));
  // 18 months for the 2 others (1 request) + 94 months for 1 field (4 requests of at most 24 months).
  assert.equal(ee.requests.filter(isMonthlyRequest).length, 5);
  assert.equal((await fakeProvider().provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY })).histories, undefined);
  // Fields with a fresh saved history (freshHistoryFor): no monthly request at all.
  const fresh = fakeProvider();
  const skipped = await fresh.provider.analyzeFields({ fields: DEMO.slice(0, 3), today: TODAY, freshHistoryFor: DEMO.slice(0, 3).map((f) => f.id) });
  assert.equal(fresh.ee.requests.filter(isMonthlyRequest).length, 0);
  assert.deepEqual(Object.keys(skipped.analyses).sort(), DEMO.slice(0, 3).map((f) => f.id).sort());

  const batch = fakeProvider();
  const all = await batch.provider.fieldHistories({ fields: DEMO, from: "2019-01" });
  assert.deepEqual(Object.keys(all).sort(), DEMO.map((f) => f.id).sort());
  assert.ok(Object.values(all).every((list) => list.length === 94 && list.at(-1).month === "2026-10"));
  // 7 fields x 94 months in 4 requests, not 7 x 4.
  assert.equal(batch.ee.requests.length, 4);
  assert.ok(dateWindows(batch.ee).every((w) => w.start <= w.end && w.end <= TODAY));
  assert.equal((await batch.provider.fieldHistories({ fields: DEMO.slice(0, 1), from: "2026-03", to: "2026-05" }))[DEMO[0].id].length, 3);
});

test("radar or monthly values that fail do not stop the analysis; an internal error is tried once more", async () => {
  const failing = fakeProvider({ fail: (r) => (r.has("exp") || isMonthlyRequest(r) ? "Computation timed out." : null) });
  const { analyses, warnings, histories } = await failing.provider.analyzeFields({ fields: DEMO.slice(0, 2), today: TODAY, historyFor: [DEMO[0].id] });
  const a = analyses[DEMO[0].id];
  assert.ok(a.plantHealth.ndvi !== null);
  assert.deepEqual(a.radar.vhSeries, []);
  assert.ok(a.cropInputs.months.every((m) => m.ndvi === null));
  assert.deepEqual(histories, {}, "a failed history is not saved as empty");
  assert.match(warnings.join(" "), /Radar passes .* could not be read/);
  assert.match(warnings.join(" "), /Reading monthly values .* failed/);
  let failed = 0;
  const once = fakeProvider({ fail: (r) => (r.has("abs") && failed++ === 0 ? "An internal error has occurred (request: x)" : null) });
  const ok = await once.provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY });
  assert.equal(failed, 2);
  assert.ok(ok.analyses[DEMO[0].id].plantHealth.normal.median !== null);
  const always = fakeProvider({ fail: (r) => (r.has("abs") ? "An internal error has occurred (request: x)" : null) });
  await assert.rejects(always.provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY }), /internal error/);
});

// ---------- Anywhere on Earth ----------

// A square field of about 40 ha with its south-west corner at lat, lon.
function squareField(id, lat, lon, d = 0.006) {
  return { id, name: id, geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] } };
}
const PAMPAS = squareField("fld-pampas", -34.9, -60.95);
const MATO_GROSSO = squareField("fld-mt", -12.55, -55.72);
const IOWA = squareField("fld-iowa", 42.03, -93.62);

test("a southern-hemisphere farm: October-to-March seasons, no war, damage over the last 2 years", async () => {
  const { ee, provider } = fakeProvider();
  const { analyses } = await provider.analyzeFields({ fields: [PAMPAS], today: TODAY });
  const a = analyses[PAMPAS.id];
  assertAnalysis(a, PAMPAS, "2026-09-01");
  assert.equal(a.conflict, null);
  assert.equal(a.damage.since, "2024-10-18");
  const asked = dateWindows(ee).map((w) => `${w.start}/${w.end}`);
  for (const w of ["2025-10-01/2026-04-01", "2018-10-01/2019-04-01", "2020-10-01/2021-04-01", "2024-10-18/2026-10-18", "2019-01-01/2022-01-01", "2026-07-20/2026-10-18"]) {
    assert.ok(asked.includes(w), `${w} in ${[...new Set(asked)].join(" ")}`);
  }
  assert.ok(!asked.includes("2026-04-01/2026-10-01"), "no northern season");
  assert.ok(!asked.some((w) => w.startsWith("2022-02-24")), "no Ukraine war window");
  assert.ok(a.season.every((p) => p.date >= "2026-09-01"));
});

test("a farm's own greenest month sets its season (a winter-wheat farm, peak in August)", async () => {
  // MODIS NDVI of 2019-2021 greenest in August, at a southern latitude.
  const values = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`ndvi${String(i + 1).padStart(2, "0")}`, 0.25 + 0.5 * Math.exp(-(Math.min(Math.abs(i + 1 - 8), 12 - Math.abs(i + 1 - 8)) ** 2) / 2)]));
  const { ee, provider } = fakeProvider({ values });
  const { analyses } = await provider.analyzeFields({ fields: [PAMPAS], today: TODAY });
  assert.ok(analyses[PAMPAS.id]);
  const asked = dateWindows(ee).map((w) => `${w.start}/${w.end}`);
  // May to October, not the latitude's October to March.
  for (const w of ["2025-05-01/2025-11-01", "2019-05-01/2019-11-01", "2021-05-01/2021-11-01"]) assert.ok(asked.includes(w), `${w} in ${[...new Set(asked)].join(" ")}`);
  assert.ok(!asked.includes("2025-10-01/2026-04-01"), "no band season");
  const windows = analysisWindows(TODAY, -34.9, 8);
  assert.deepEqual(windows.chiSeason, { start: "2025-05-01", end: "2025-11-01" });
  assert.equal(windows.seasonLabel, "May to October");
});

test("a southern farm in February reads the dry-down after a December peak", async () => {
  const ee = createFakeEe({ nestedCollections: "describe" });
  const provider = createFieldGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date("2026-02-15T12:00:00Z") });
  const { analyses } = await provider.analyzeFields({ fields: [PAMPAS], today: "2026-02-15" });
  const a = analyses[PAMPAS.id];
  assert.ok(a.season.length >= 10 && a.season[0].date >= "2025-09-01");
  assert.ok(a.harvest.peakDate >= "2025-12-01" && a.harvest.peakDate <= "2026-01-31", a.harvest.peakDate);
  assert.ok(["ripening", "ready", "harvested"].includes(a.harvest.stage), a.harvest.stage);
});

test("a tropical farm: the last 12 months, no war", async () => {
  const { ee, provider } = fakeProvider();
  const { analyses } = await provider.analyzeFields({ fields: [MATO_GROSSO], today: TODAY });
  const a = analyses[MATO_GROSSO.id];
  assertAnalysis(a, MATO_GROSSO, "2026-02-17");
  assert.equal(a.conflict, null);
  const asked = dateWindows(ee).map((w) => `${w.start}/${w.end}`);
  for (const w of ["2025-10-01/2026-10-01", "2018-10-01/2019-10-01", "2020-10-01/2021-10-01", "2026-02-17/2026-10-18"]) assert.ok(asked.includes(w), w);
  // Fields are traced from the last two 12-month spans too.
  const { ee: ee2, provider: p2 } = fakeProvider();
  await p2.detectFields({ center: { lat: -12.55, lon: -55.72 }, radiusM: 1200 });
  const traced = dateWindows(ee2).map((w) => w.start);
  assert.ok(traced.includes("2025-10-01") && traced.includes("2024-10-01") && !traced.includes("2026-04-01"), traced.join(" "));
});

test("a peaceful farm that burns its stubble every year is NOT damaged; the same fires above the war-time normal are", async () => {
  // 8 fire days in the last 2 years, 12 in 2019-2021 (4 a year): just the usual burning.
  // A soil-index drop that would back up fires is there too.
  const values = { fires: 8, firesBase: 12, chiDrop: 0.15, radarChanged: 0.01 };
  const { provider } = fakeProvider({ values });
  const { analyses } = await provider.analyzeFields({ fields: [IOWA], today: TODAY });
  const a = analyses[IOWA.id];
  assert.equal(a.conflict, null);
  assert.deepEqual([a.damage.fires, a.damage.firesNormal, a.damage.excessFires], [8, 8, 0]);
  assert.equal(a.damage.detected, false);
  assert.equal(a.damage.damagedHa, null);
  // Near Kupiansk: 20 fire days since the invasion against about 1 a year before it.
  const war = fakeProvider({ values: { ...values, fires: 20, firesBase: 3 } });
  const result = await war.provider.analyzeFields({ fields: DEMO.slice(0, 1), today: TODAY });
  const b = result.analyses[DEMO[0].id];
  assert.equal(b.conflict.id, "ukraine-2022");
  assert.equal(b.damage.since, "2022-02-24");
  assert.equal(b.damage.excessFires, 15.4);
  assert.equal(b.damage.detected, true);
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
  // A big field is read at coarser pixels (a field mean needs no more).
  assert.equal(historyScale(1.6), 10);
  assert.equal(historyScale(30), 20);
  assert.equal(historyScale(624), 50);
  assert.equal(historyScale(5000), 100);
  const big = fakeProvider();
  const square = { id: "big", name: "Big", geometry: { type: "Polygon", coordinates: [[[-55.7, -12.55], [-55.675, -12.55], [-55.675, -12.525], [-55.7, -12.525], [-55.7, -12.55]]] } };
  await big.provider.fieldHistory({ field: square, from: "2026-01" });
  const scales = big.ee.callsNamed("Image.reduceRegion").map((c) => c.args[0].scale);
  assert.ok(scales.length && scales.every((x) => x >= 50), JSON.stringify(scales));
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

  // A dropped connection is tried once more, as it is.
  let dropped = false;
  const flaky = createFakeEe({ nestedCollections: "describe", fail: (request) => (request.has("reduceToVectors") && !dropped ? ((dropped = true), "Server returned HTTP code: -1 for POST /v1/projects/test-proj/value:compute") : null) });
  const retried = createFieldGeeProvider({ ee: flaky, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const again = await retried.detectFields({ center: [49.73, 37.54] });
  assert.ok(dropped && again.candidates.length > 0);
  assert.deepEqual(flaky.callsNamed("Image.reduceToVectors").map((c) => c.args[0].scale), [10, 10, 10, 10], "same pixels on the retry");

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
