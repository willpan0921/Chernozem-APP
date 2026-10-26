// Natural disasters on the Earth Engine provider (gee.js), against the
// stand-in Earth Engine (fake-ee.js): the windows, the image counts, the
// access branch per type, a month before the day, no ACLED for a disaster,
// the hazard grid. Wars keep their windows and requests (gee.test.js).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createGeeProvider, monthWindows, onHazardGrid, onFloodGrid, cleanHazardCounts, DATASETS } from "./gee.js";
import { createFakeEe } from "./fake-ee.js";
import { teamConflict } from "../../src/config/conflicts.js";
import { HAZARD_GRID_M } from "../../src/lib/atlas/method.js";
import { buildRun } from "../runs.js";

const TODAY = "2026-10-18";
const CFG = {
  geeProjectId: "test-proj",
  geeCredentials: { client_email: "atlas@test-proj.iam.gserviceaccount.com", private_key: "test-key" },
  geeCredentialsError: null,
  geeDisabled: false,
  chernozemAsset: null,
  acledCsvPath: null,
};

function provider(fakeOptions = {}, cfg = CFG) {
  const ee = createFakeEe(fakeOptions);
  return { ee, provider: createGeeProvider({ ee, getConfig: () => cfg, now: () => new Date(`${TODAY}T12:00:00Z`), memoryRetryMs: [0, 0] }) };
}

function gridArea(rows, cols, sizeDeg, north = 39.55, west = 22.05) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) cells.push({ id: `r${r}c${c}`, row: r, col: c, lat: Number((north - (r + 0.5) * sizeDeg).toFixed(6)), lon: Number((west + (c + 0.5) * sizeDeg).toFixed(6)), areaHa: 100 });
  }
  const bbox = [west, north - rows * sizeDeg, west + cols * sizeDeg, north];
  const area = { id: "dis", name: "Disaster test", kind: "custom", source: "bbox", bbox, geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]] } };
  return { area, cells };
}

const disaster = (type, since) => teamConflict({ mode: "disaster", since, type }, "dis");
const WAR = { id: "area-dis", name: "War (set for this area)", since: "2023-09-04", source: "area" };
const dictionaryKeys = (ee) => new Set(ee.callsNamed("Dictionary").flatMap((call) => Object.keys(call.args[0] || {})));

test("monthWindows: a disaster's windows, and none of their keys for a war", () => {
  const flood = monthWindows("2023-09", TODAY, { lat: 39.4, conflict: disaster("flood", "2023-09-04") });
  assert.deepEqual(flood.hazard, { start: "2023-09-04", end: "2023-10-01" });
  assert.deepEqual(flood.hazardNow, { start: "2023-09-19", end: "2023-10-01" }, "the last 12 days");
  assert.deepEqual(flood.hazardMonths, [9, 11], "the whole 60-day window: the guard is the same every month");
  assert.deepEqual(flood.burnMonths, ["2023-09"]);
  assert.equal(flood.hazardNormals.length, 3);
  assert.ok(flood.hazardNormals.every((w) => w.end <= "2022-01-01"));
  // Later months keep the 60-day window from the day.
  const later = monthWindows("2023-12", TODAY, { lat: 39.4, conflict: disaster("flood", "2023-09-04") });
  assert.deepEqual(later.hazard, { start: "2023-09-04", end: "2023-11-03" });
  assert.deepEqual(later.hazardMonths, [9, 11]);
  const fire = monthWindows("2024-07", TODAY, { lat: 42, conflict: disaster("wildfire", "2024-07-17") });
  assert.deepEqual(fire.hazardNow, { start: "2024-07-25", end: "2024-08-01" }, "the last 7 days");
  assert.deepEqual(fire.burnPre, { start: "2024-06-17", end: "2024-07-17" });
  assert.deepEqual(fire.burnPost, { start: "2024-07-17", end: "2024-08-01" }, "cut at the month's end");
  // A drought: the crop season running now, against the same span of 2019-2021.
  const drought = monthWindows("2026-06", TODAY, { lat: 41.2, conflict: disaster("drought", "2026-02-10"), peakMonth: 5 });
  assert.deepEqual(drought.lossWindow, { start: "2026-02-01", end: "2026-07-01" });
  assert.deepEqual(drought.lossBaselines.map((w) => w.start), ["2019-02-01", "2020-02-01", "2021-02-01"]);
  // A storm/earthquake/landslide: the season that contains the day is a radar season.
  const ground = monthWindows("2023-10", TODAY, { lat: 44.2, conflict: disaster("ground", "2023-05-16") });
  assert.deepEqual(ground.radarSeasons, [{ start: "2023-04-01", end: "2023-10-01" }]);
  // Before the day: nothing.
  const before = monthWindows("2023-08", TODAY, { lat: 39.4, conflict: disaster("flood", "2023-09-04") });
  assert.equal(before.beforeWar, true);
  assert.equal(before.hazard, null);
  // A war on the same day: exactly the keys it always had.
  const war = monthWindows("2023-09", TODAY, { lat: 39.4, conflict: WAR });
  const peace = monthWindows("2023-09", TODAY, { lat: 39.4, conflict: null });
  assert.deepEqual(Object.keys(war), Object.keys(peace));
  for (const key of ["disaster", "hazard", "hazardNow", "lossWindow", "burnMonths"]) assert.ok(!(key in war), key);
  // The war's seasons never include the one that contains its day.
  assert.deepEqual(monthWindows("2023-10", TODAY, { lat: 44.2, conflict: { ...WAR, since: "2023-05-16" } }).radarSeasons, []);
});

test("onHazardGrid: the 100 m grid for cells reduced with coarser and finer pixels", () => {
  const ee = createFakeEe();
  const image = ee.Image.constant(1);
  for (const scale of [HAZARD_GRID_M + 1, HAZARD_GRID_M, 40]) {
    const node = ee.nodeOf(onHazardGrid(image, scale));
    assert.equal(node.op, "reproject");
    assert.equal(node.args[0].scale, HAZARD_GRID_M);
  }
});

test("onFloodGrid: a flood on the 100 m grid only for cells reduced with coarser pixels, otherwise on the reduce's own pixels", () => {
  const ee = createFakeEe();
  const image = ee.Image.constant(1);
  const node = ee.nodeOf(onFloodGrid(image, HAZARD_GRID_M + 1));
  assert.equal(node.op, "reproject");
  assert.equal(node.args[0].scale, HAZARD_GRID_M);
  for (const scale of [HAZARD_GRID_M, 47]) assert.equal(ee.nodeOf(onFloodGrid(image, scale)).op, "unmask", `scale ${scale}`);
});

test("cleanHazardCounts: plain counts, the burned-area maps per month", () => {
  const counts = cleanHazardCounts({ s1Hazard: 4, s2Now: "2", burnedModis0: 1, burnedViirs1: 3, firmsNow: -1 }, { burnMonths: ["2024-07", "2024-08"] });
  assert.equal(counts.s1Hazard, 4);
  assert.equal(counts.s2Now, 2);
  assert.equal(counts.firmsNow, 0);
  assert.deepEqual(counts.burnedModis, [1, 0]);
  assert.deepEqual(counts.burnedViirs, [0, 3]);
});

test("a flood month: its images counted with the others, its bands read, Feasibility from the water now, no ACLED", async () => {
  const { area, cells } = gridArea(3, 4, 0.05);
  const cfg = { ...CFG, acledCsvPath: "/nowhere/acled.csv" };
  const { ee, provider: gee } = provider({}, cfg);
  const result = await gee.analyze({ area, cells, month: "2023-09", cellSizeDeg: 0.05, conflict: disaster("flood", "2023-09-04") });
  const keys = dictionaryKeys(ee);
  for (const key of ["s1Hazard", "s2Hazard", "s1Now", "s2Now", "jrcMonthly"]) assert.ok(keys.has(key), key);
  for (const key of ["firmsHazard", "firmsNow", "s2Pre"]) assert.ok(!keys.has(key), key);
  assert.equal(result.accessSource, "flood-now");
  assert.equal(result.conflict.kind, "disaster");
  assert.ok(result.readings.every((r) => Number.isFinite(r.hitShare) && Number.isFinite(r.wetNowShare) && Number.isFinite(r.grassShare) && Number.isFinite(r.grassHitShare)));
  assert.ok(result.warnings.some((w) => /^Flood looks: \d+ radar passes and \d+ optical images between 2023-09-04 and 2023-09-30\.$/.test(w)));
  // No ACLED file is read for a disaster (a war would say it was not found).
  assert.ok(!result.warnings.some((w) => /ACLED/.test(w)));
  // The JRC, HAND and burned-area datasets: the flood's, not the wildfire's.
  const datasets = new Set(ee.callsNamed("ImageCollection").map((c) => c.args[0]).concat(ee.callsNamed("Image").map((c) => c.args[0])));
  assert.ok(datasets.has(DATASETS.jrcWater) && datasets.has(DATASETS.hand) && datasets.has(DATASETS.jrcMonthly));
  assert.ok(!datasets.has(DATASETS.burnedModis));
  // No fighting fires are sampled.
  assert.equal(ee.callsNamed("Image.stratifiedSample").length, 0);
  // buildRun turns them into the disaster's fields.
  const run = buildRun({ area, month: "2023-09", provider: "gee", readings: result.readings, cells, cellSizeDeg: 0.05, conflict: result.conflict, accessSource: result.accessSource });
  assert.equal(run.accessSource, "flood-now");
  assert.ok(run.cells.every((cell) => cell.feasible >= 0 && cell.feasible <= 1 && cell.distance === null && cell.raw.conflictKm === null));
});

test("a flood month without a look in its last 12 days: Feasibility not measured", async () => {
  const { area, cells } = gridArea(2, 2, 0.05);
  // No Sentinel-1 or -2 image at all.
  const { provider: none } = provider({ sizes: { [DATASETS.sentinel1]: 0, [DATASETS.sentinel2]: 0 } });
  const result = await none.analyze({ area, cells, month: "2023-09", cellSizeDeg: 0.05, conflict: disaster("flood", "2023-09-04") });
  assert.equal(result.accessSource, "disaster-none");
  assert.ok(result.warnings.includes("No radar or satellite image in the last 12 days of September 2023, so Feasibility (land under water now) is not measured."));
});

test("a wildfire month: burned-area maps per month, fires burning now as the distance", async () => {
  const { area, cells } = gridArea(3, 3, 0.05, 42.16, 26.8);
  const { ee, provider: gee } = provider();
  const result = await gee.analyze({ area, cells, month: "2024-07", cellSizeDeg: 0.05, conflict: disaster("wildfire", "2024-07-17") });
  const keys = dictionaryKeys(ee);
  for (const key of ["firmsHazard", "firmsHazardBase", "firmsNow", "burnedModis0", "burnedViirs0", "s2Pre", "s2Post"]) assert.ok(keys.has(key), key);
  assert.equal(result.accessSource, "fire-now");
  assert.equal(ee.callsNamed("Image.stratifiedSample").length, 1, "one sample: the fires burning now");
  // No 12-month FIRMS count within 300 km for a disaster (it has no fighting).
  const firmsYear = ee.callsNamed("Dictionary").map((call) => call.args[0]?.firmsYear).find(Boolean);
  assert.deepEqual([ee.nodeOf(firmsYear).op, ee.nodeOf(firmsYear).args], ["Number", [0]]);
  assert.ok(result.readings.every((r) => Number.isFinite(r.conflictKm) && Number.isFinite(r.hitShare) && r.wetNowShare === undefined));
  const run = buildRun({ area, month: "2024-07", provider: "gee", readings: result.readings, cells, cellSizeDeg: 0.05, conflict: result.conflict, accessSource: result.accessSource });
  assert.ok(run.cells.every((cell) => cell.feasible === Math.min(1, Math.round((cell.raw.fireKm / 10) * 10000) / 10000) || Math.abs(cell.feasible - Math.min(1, cell.raw.fireKm / 10)) < 1e-4));
  // Without fire data in the last 7 days: not measured.
  const { provider: dry } = provider({ sizes: { FIRMS: 0 } });
  const gap = await dry.analyze({ area, cells, month: "2024-07", cellSizeDeg: 0.05, conflict: disaster("wildfire", "2024-07-17") });
  assert.equal(gap.accessSource, "disaster-none");
  assert.ok(gap.warnings.includes("No fire data for the last 7 days of July 2024, so Feasibility (distance to a fire burning now) is not measured."));
  // Without burned-area maps (not out yet): the run says the rest may be low.
  const { provider: early } = provider({ sizes: { [DATASETS.burnedModis]: 0, [DATASETS.burnedViirs]: 0 } });
  const soon = await early.analyze({ area, cells, month: "2024-07", cellSizeDeg: 0.05, conflict: disaster("wildfire", "2024-07-17") });
  assert.ok(soon.warnings.some((w) => w.startsWith("No burned-area map covers July 2024 yet; the rest is counted from fire detections and Sentinel-2 alone")));
});

test("a drought and a storm/earthquake/landslide: Feasibility not measured; their own images per season group", async () => {
  const { area, cells } = gridArea(2, 3, 0.05, 41.39, -103.38);
  const { ee, provider: gee } = provider();
  const drought = await gee.analyze({ area, cells, month: "2026-06", cellSizeDeg: 0.05, conflict: disaster("drought", "2026-02-10") });
  assert.equal(drought.accessSource, "none");
  assert.ok(drought.warnings.includes("Feasibility is not measured for a drought: satellites do not show what stops fieldwork after it. Nothing is set aside; this does not prove the land can be worked."));
  const keys = dictionaryKeys(ee);
  for (const key of ["ndviLoss", "ndviLossBase", "ndviViirsLoss", "ndviViirsLossBase"]) assert.ok(keys.has(key), key);
  assert.ok(drought.readings.every((r) => Number.isFinite(r.hitShare) && r.grassShare === undefined));
  assert.ok(ee.callsNamed("ImageCollection").some((c) => c.args[0] === DATASETS.ndvi250));

  const romagna = gridArea(2, 2, 0.05, 44.28, 11.62);
  const { ee: ee2, provider: gee2 } = provider();
  const ground = await gee2.analyze({ ...romagna, month: "2023-10", cellSizeDeg: 0.05, conflict: disaster("ground", "2023-05-16") });
  assert.equal(ground.accessSource, "none");
  assert.ok(ground.warnings.some((w) => w.startsWith("Feasibility is not measured for a storm, earthquake or landslide")));
  const keys2 = dictionaryKeys(ee2);
  assert.ok(keys2.has("s2First") && keys2.has("s2FirstBase"));
  assert.ok(ground.readings.every((r) => Number.isFinite(r.hitShare)));
  // Before its season is complete: said, nothing measured.
  const early = await gee2.analyze({ ...romagna, month: "2023-06", cellSizeDeg: 0.05, conflict: disaster("ground", "2023-05-16") });
  assert.ok(early.warnings.includes("No growing season since the storm, earthquake or landslide began on 2023-05-16 is complete yet; its damage could not be measured yet."));
});

test("a month before the disaster's day: no damage, Feasibility not measured, no war words", async () => {
  const { area, cells } = gridArea(2, 2, 0.05);
  const { ee, provider: gee } = provider();
  const result = await gee.analyze({ area, cells, month: "2023-08", cellSizeDeg: 0.05, conflict: disaster("flood", "2023-09-04") });
  assert.equal(result.accessSource, "none");
  assert.ok(result.warnings.includes("This month ends before the flood began (2023-09-04): no disaster damage is counted, and Feasibility is not measured."));
  assert.ok(!result.warnings.some((w) => /war|fighting/i.test(w)));
  assert.ok(!dictionaryKeys(ee).has("s1Hazard"));
});

test("a war keeps its requests: no disaster count, its fighting fires sampled", async () => {
  const { area, cells } = gridArea(2, 2, 0.05);
  const { ee, provider: gee } = provider();
  const result = await gee.analyze({ area, cells, month: "2023-09", cellSizeDeg: 0.05, conflict: WAR });
  const keys = dictionaryKeys(ee);
  for (const key of ["s1Hazard", "firmsNow", "ndviLoss", "s2First"]) assert.ok(!keys.has(key), key);
  assert.ok(keys.has("firmsYear"));
  assert.equal(result.accessSource, "fires");
  assert.ok(result.readings.every((r) => r.hitShare === undefined && r.wetNowShare === undefined));
});

// ---------- The rules' own constants (so a revert or a moved line fails) ----------

const argsOf = (ee, name) => ee.callsNamed(name).map((call) => call.args[0]);

test("a storm, earthquake, landslide or other month says its rule is provisional; no other type, and not before the day", async () => {
  const { GROUND_PROVISIONAL } = await import("./gee.js");
  const romagna = gridArea(2, 2, 0.05, 44.28, 11.62);
  for (const type of ["ground", "other"]) {
    const { provider: gee } = provider();
    const noun = type === "ground" ? "storm, earthquake or landslide" : "disaster";
    const result = await gee.analyze({ ...romagna, month: "2023-10", cellSizeDeg: 0.05, conflict: disaster(type, "2023-05-16") });
    assert.ok(result.warnings.includes(GROUND_PROVISIONAL(noun)), type);
    const before = await gee.analyze({ ...romagna, month: "2023-04", cellSizeDeg: 0.05, conflict: disaster(type, "2023-05-16") });
    assert.ok(!before.warnings.some((w) => /provisional/.test(w)), `${type} before its day`);
  }
  for (const [type, since, month] of [["flood", "2023-09-04", "2023-09"], ["wildfire", "2024-07-17", "2024-07"], ["drought", "2026-02-10", "2026-06"]]) {
    const { provider: gee } = provider();
    const result = await gee.analyze({ ...romagna, month, cellSizeDeg: 0.05, conflict: disaster(type, since) });
    assert.ok(!result.warnings.some((w) => /provisional/.test(w)), type);
  }
});

test("a disaster whose damage could not be measured: its squares read null (never 0), the run says why, the imagery says none yet", async () => {
  const romagna = gridArea(2, 2, 0.05, 44.28, 11.62);
  const { provider: gee } = provider();
  // The season that contains the day is not complete yet.
  const early = await gee.analyze({ ...romagna, month: "2023-06", cellSizeDeg: 0.05, conflict: disaster("ground", "2023-05-16") });
  assert.ok(early.readings.every((r) => r.hitShare === null && r.heavyShare === null));
  assert.deepEqual(early.disasterDamage, { notMeasured: "season-incomplete", unmeasuredShare: 1, mayBeLow: [] });
  assert.match(early.imagery.label, /^none yet: the growing season that contains 16 May 2023 is not complete yet/);
  const run = buildRun({ area: romagna.area, month: "2023-06", provider: "gee", readings: early.readings, cells: romagna.cells, cellSizeDeg: 0.05, conflict: early.conflict, accessSource: early.accessSource, imagery: early.imagery, disasterDamage: early.disasterDamage });
  assert.ok(run.cells.every((cell) => cell.hit === null && cell.hitHa === null && typeof cell.notMeasured === "string"));
  assert.equal(run.totals.measuredCropHa, 0);
  assert.equal(run.disasterDamage.notMeasured, "season-incomplete");
  // A drought before its season has run 60 days.
  const nebraska = gridArea(2, 2, 0.05, 41.39, -103.38);
  const march = await gee.analyze({ ...nebraska, month: "2026-03", cellSizeDeg: 0.05, conflict: disaster("drought", "2026-02-10") });
  assert.ok(march.readings.every((r) => r.hitShare === null));
  assert.equal(march.disasterDamage.notMeasured, "season-incomplete");
  assert.match(march.imagery.label, /^none yet: no crop season since 10 February 2026 has run long enough to measure/);
  // A measured month: numbers, and nothing to say.
  const june = await gee.analyze({ ...nebraska, month: "2026-06", cellSizeDeg: 0.05, conflict: disaster("drought", "2026-02-10") });
  assert.ok(june.readings.every((r) => Number.isFinite(r.hitShare)));
  assert.equal(june.disasterDamage.notMeasured, null);
  assert.match(june.imagery.label, /^of the crop season/);
  // A month before the day counts 0 on purpose: not "not measured".
  const before = await gee.analyze({ ...nebraska, month: "2026-01", cellSizeDeg: 0.05, conflict: disaster("drought", "2026-02-10") });
  assert.ok(before.readings.every((r) => r.hitShare !== null && (r.hitShare ?? 0) === 0));
  assert.equal(before.disasterDamage.notMeasured, null);
  const beforeRun = buildRun({ area: nebraska.area, month: "2026-01", provider: "gee", readings: before.readings, cells: nebraska.cells, cellSizeDeg: 0.05, conflict: before.conflict, accessSource: before.accessSource, disasterDamage: before.disasterDamage });
  assert.ok(beforeRun.cells.every((cell) => cell.hit === 0 && cell.hitHa === 0 && cell.notMeasured === undefined));
  // A wildfire before its burned-area map: may read low.
  const yambol = gridArea(2, 2, 0.05, 42.16, 26.8);
  const { provider: noMaps } = provider({ sizes: { [DATASETS.burnedModis]: 0, [DATASETS.burnedViirs]: 0 } });
  const fresh = await noMaps.analyze({ ...yambol, month: "2024-07", cellSizeDeg: 0.05, conflict: disaster("wildfire", "2024-07-17") });
  assert.deepEqual(fresh.disasterDamage.mayBeLow, ["burn-map-pending"]);
  // A war's result has no such field.
  const war = await gee.analyze({ ...yambol, month: "2024-07", cellSizeDeg: 0.05, conflict: WAR });
  assert.equal("disasterDamage" in war, false);
});

test("disasterImagery: every drought group's own window with its share, the share not measured, never the war's seasons", async () => {
  const { disasterImagery } = await import("./gee.js");
  const drought = disaster("drought", "2026-02-10");
  const shared = { beforeWar: false, hazard: null, month: { start: "2026-04-01", end: "2026-05-01" } };
  const groups = [
    { cells: [{ id: "a" }, { id: "b" }, { id: "c" }], windows: { lossWindow: { start: "2026-03-01", end: "2026-05-01" } } },
    { cells: [{ id: "d" }], windows: { lossWindow: null } },
  ];
  const label = disasterImagery(drought, shared, groups, { cellCount: 4, unmeasured: new Map([["d", "season-incomplete"]]) });
  assert.deepEqual(label, { from: "2026-03", to: "2026-04", label: "of the crop season from 1 March 2026 to 30 April 2026 (75% of the area) (this season's crop loss); not measured yet on 25% of the area" });
  const two = disasterImagery(drought, shared, [groups[0], { cells: [{ id: "d" }], windows: { lossWindow: { start: "2026-04-01", end: "2026-05-01" } } }], { cellCount: 4 });
  assert.match(two.label, /^of the crop seasons from 1 March 2026 to 30 April 2026 \(75% of the area\) and from 1 April 2026 to 30 April 2026 \(25% of the area\)/);
  const none = disasterImagery(drought, shared, [groups[1]], { cellCount: 1, unmeasured: new Map([["d", "season-incomplete"]]) });
  assert.deepEqual(none, { from: "2026-04", to: "2026-04", label: "none yet: no crop season since 10 February 2026 has run long enough to measure" });
});

test("cropLossImage: the 0.3 normal-greenness floor per composite, the 20% / 35% thresholds, the season's worst month-end reading", async () => {
  const { cropLossImage, compositeDays, lossCuts } = await import("./gee.js");
  const { DROUGHT } = await import("../../src/lib/atlas/method.js");
  const ee = createFakeEe();
  const window = { start: "2026-03-01", end: "2026-07-01" };
  const baselines = [{ start: "2019-03-01", end: "2019-07-01" }, { start: "2020-03-01", end: "2020-07-01" }, { start: "2021-03-01", end: "2021-07-01" }];
  const cropland = ee.Image.constant(1);
  const loss = cropLossImage(ee, { region: ee.Geometry.Rectangle([0, 0, 1, 1]), window, baselines, have: { disaster: { ndviLoss: 5, ndviLossBase: 5 } }, cropland });
  assert.ok(loss && !loss.viirs);
  // One floor per composite, never one on the season's mean.
  assert.equal(argsOf(ee, "Image.gte").filter((v) => v === DROUGHT.minBaseNdvi).length, compositeDays(window).length);
  assert.ok(argsOf(ee, "Image.gte").includes(DROUGHT.hitLoss) && argsOf(ee, "Image.gte").includes(DROUGHT.heavyLoss));
  // Read at each month's end from 90 days in (June, July 1), the worst kept.
  assert.deepEqual(lossCuts(window), ["2026-06-01", "2026-07-01"]);
  assert.ok(ee.callsNamed("ImageCollection.max").length >= 1);
  assert.deepEqual(lossCuts({ start: "2026-03-01", end: "2026-05-01" }), ["2026-05-01"]);
});

test("floodImages: radar darker than the same days of 2019-2021, recurring water left out, the 4-day span for heavy, snowy days only when there were some", async () => {
  const { floodImages } = await import("./gee.js");
  const { FLOOD } = await import("../../src/lib/atlas/method.js");
  const windows = monthWindows("2023-09", TODAY, { lat: 39.4, conflict: disaster("flood", "2023-09-04") });
  const base = { s1Hazard: 5, s2Hazard: 5, s1Now: 2, s2Now: 2, jrcMonthly: 36, s1HazardBase: 10, s2HazardBase: 10, s1NowBase: 4, s2NowBase: 4, coldDays: 0, coldNowDays: 0, coldNormalDays: 0 };
  const ee = createFakeEe();
  const images = floodImages(ee, { region: ee.Geometry.Rectangle([0, 0, 1, 1]), windows, have: { hazard: base } });
  assert.ok(images.hit && images.heavy && images.wetNow && images.routine);
  assert.ok(argsOf(ee, "Image.gte").includes(FLOOD.heavyDays), "heavy: the first and last wet look 4 days apart");
  assert.ok(argsOf(ee, "Image.subtract").includes(FLOOD.darkerDb), "radar: darker than normal");
  assert.ok(argsOf(ee, "Image.gte").includes(FLOOD.normalWetYears), "recurring water: in 2 of the 3 normal years");
  assert.ok(ee.callsNamed("Filter.eq").some((call) => call.args[0] === "relativeOrbitNumber_start"), "the normal of the same orbit");
  assert.ok(!ee.callsNamed("ImageCollection").some((call) => call.args[0] === DATASETS.era5Daily), "no snow lookup in a warm month");
  assert.ok(argsOf(ee, "ImageCollection.sort").includes("system:time_start"), "under water now: the latest look on top");
  // A paddy's normal water does not hide a flood: JRC water per normal
  // year (2 of 3), the normally wet mask grown, a look far darker than the
  // field's normal near that day of the year still counts.
  for (const year of [2019, 2020, 2021]) assert.ok(ee.callsNamed("Filter.calendarRange").some((call) => call.args[0] === year && call.args[1] === year && call.args[2] === "year"), `JRC water in ${year}`);
  assert.ok(argsOf(ee, "Image.focal_max").includes(FLOOD.normalGrowM), "the normally wet mask grown");
  assert.ok(argsOf(ee, "Image.gte").includes(FLOOD.deepDb), "deeper than the field's normal");
  assert.ok(ee.callsNamed("Filter.gte").some((call) => call.args[0] === "doy"), "the normal near that day of the year");
  // Under water now: optical water confirmed by the radar where it looked.
  assert.ok(argsOf(ee, "ImageCollection.select").includes("radar"), "radar confirmation of water now");
  const noRadarNow = createFakeEe();
  floodImages(noRadarNow, { region: noRadarNow.Geometry.Rectangle([0, 0, 1, 1]), windows, have: { hazard: { ...base, s1Now: 0 } } });
  assert.ok(!argsOf(noRadarNow, "ImageCollection.select").includes("radar"), "no radar in those days: optical water alone");
  const cold = createFakeEe();
  floodImages(cold, { region: cold.Geometry.Rectangle([0, 0, 1, 1]), windows, have: { hazard: { ...base, coldDays: 3 } } });
  assert.ok(cold.callsNamed("ImageCollection").some((call) => call.args[0] === DATASETS.era5Daily), "snowy or frozen days looked up");
});

test("burnImages: the burned-area day counted from the disaster's day (offset - 1), and burning clearly above normal on cropland", async () => {
  const { burnImages } = await import("./gee.js");
  const { WILDFIRE } = await import("../../src/lib/atlas/method.js");
  const windows = monthWindows("2024-07", TODAY, { lat: 42, conflict: disaster("wildfire", "2024-07-17") });
  const ee = createFakeEe();
  const images = burnImages(ee, { region: ee.Geometry.Rectangle([0, 0, 1, 1]), windows, have: { hazard: { firmsHazard: 5, firmsHazardBase: 5, firmsNow: 1, s2Pre: 3, s2Post: 3, burnedModis: [1], burnedViirs: [1] } } });
  assert.ok(images.hit && images.heavy && images.routine && images.nowPoints);
  // 1 January 2024 is 198 days before 17 July 2024; BurnDate 1 is that day: -198 - 1.
  assert.ok(argsOf(ee, "Image.add").includes(-199));
  assert.ok(argsOf(ee, "Image.multiply").includes(WILDFIRE.excessTimes));
  assert.ok(argsOf(ee, "Image.gte").includes(WILDFIRE.excessPerKm2) && argsOf(ee, "Image.gte").includes(WILDFIRE.excessBurnShare));
  assert.ok(argsOf(ee, "Image.gte").includes(WILDFIRE.severeDnbr));
});
