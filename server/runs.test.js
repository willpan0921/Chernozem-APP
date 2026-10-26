// WHAT THIS FILE DOES
// Tests for server/runs.js: building runs, totals, comparing and months.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever changes runs.js.

import test from "node:test";
import assert from "node:assert/strict";
import { NO_WAR_WARNING, TEAM_PEACE_WARNING, addMonths, buildRun, compareRuns, imageryWindow, latestCompleteMonth, linkNewDamage, monthLabel, monthsBack, summarizeRun } from "./runs.js";

const area = { id: "area-test", name: "Test", bbox: [30, 49, 31, 50] };
const cells = [
  { id: "r0c0", lat: 49.75, lon: 30.25, areaHa: 1000 },
  { id: "r0c1", lat: 49.75, lon: 30.75, areaHa: 1000 },
];
const reading = (id, heavyShare) => ({
  id,
  chernozem: 0.8,
  croplandShare: 0.5,
  firesPer100Km2: 12.5,
  chiDrop: 0.1,
  conflictKm: 50,
  popPerKm2: 100,
  lights: 5,
  heavyShare,
  population: 1000,
});

function makeArgs(month) {
  return { area, month, provider: "sample", readings: [reading("r0c0", 0), reading("r0c1", 0)], cellSizeDeg: 0.5, cells };
}

function makeRun(month, heavy) {
  return buildRun({
    area,
    month,
    provider: "sample",
    readings: [reading("r0c0", heavy), reading("r0c1", 0)],
    alerts: [{ id: "a1", kind: "radar", date: `${month}-03`, lat: 49.75, lon: 30.25, place: "x", cellIds: ["r0c0"], magnitude: 1, unit: "km² changed" }],
    warnings: ["sample"],
    cellSizeDeg: 0.5,
    cells,
  });
}

test("buildRun converts readings into hectares and indicators", () => {
  const run = makeRun("2026-09", 0.25);
  assert.equal(run.cellCount, 2);
  assert.equal(run.label, "September 2026");
  assert.equal(run.totals.croplandHa, 1000); // 2 × 1000 ha × 0.5
  assert.equal(run.totals.blackSoilHa, 800); // × 0.8
  assert.equal(run.totals.heavyDamageHa, 100); // 400 × 0.25 in one cell
  assert.equal(run.totals.peopleOnDamagedSoil, 125); // 1000 × 0.25 × 0.5
  const cell = run.cells[0];
  assert.equal(cell.firms, 0.5); // 12.5 of 25
  assert.equal(cell.chi, 0.5); // 0.1 of 0.2
  assert.equal(cell.distance, 0.5); // 50 of 100 km
  assert.equal(cell.wrb, 0.8);
  assert.equal(cell.agOutput, 0.5);
  assert.equal(run.checks.passed, run.checks.total);
  assert.deepEqual(run.checks.warnings, ["sample"]);
  assert.equal(run.alertsCount, 1);
  // September compares the last COMPLETE season (2026's ends with September).
  assert.deepEqual(run.imagery, { from: "2025-04", to: "2025-09" });
});

test("missing readings fail a check", () => {
  const run = buildRun({ area, month: "2026-09", provider: "sample", readings: [reading("r0c0", 0)], cellSizeDeg: 0.5, cells });
  assert.equal(run.cellCount, 1);
  assert.ok(run.checks.passed < run.checks.total);
  assert.match(run.checks.warnings.join(" "), /1 of 2 cells/);
});

test("summarizeRun drops cells and alerts", () => {
  const summary = summarizeRun(makeRun("2026-09", 0.1));
  assert.equal(summary.cells, undefined);
  assert.equal(summary.alerts, undefined);
  assert.equal(summary.cellCount, 2);
});

test("compareRuns gives deltas b minus a and the biggest changed cells", () => {
  const a = makeRun("2026-08", 0.1);
  const b = makeRun("2026-09", 0.35);
  const result = compareRuns(a, b);
  assert.equal(result.deltas.heavyDamageHa, 100); // 140 - 40
  assert.equal(result.deltas.croplandHa, 0);
  assert.equal(result.changedCells.length, 1);
  assert.equal(result.changedCells[0].id, "r0c0");
  assert.equal(result.changedCells[0].delta, 100);
  assert.equal(result.a.cells, undefined);
});

test("linkNewDamage fills the increase from the month before", () => {
  const a = makeRun("2026-08", 0.1);
  const b = makeRun("2026-09", 0.35);
  const gap = makeRun("2026-06", 0.2);
  linkNewDamage([b, a, gap]);
  assert.equal(b.newHeavyDamageHa, 100);
  assert.equal(a.newHeavyDamageHa, null, "no July run");
  assert.equal(gap.newHeavyDamageHa, null);
});

test("months", () => {
  assert.equal(monthLabel("2026-09"), "September 2026");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2025-12", 1), "2026-01");
  assert.equal(latestCompleteMonth(new Date(2026, 9, 18)), "2026-09");
  assert.equal(latestCompleteMonth(new Date(2026, 0, 5)), "2025-12");
  assert.deepEqual(monthsBack("2026-02", 3), ["2026-02", "2026-01", "2025-12"]);
  // North (the default): the last COMPLETE April-September season, so
  // every month of one season compares the same one.
  assert.deepEqual(imageryWindow("2026-01"), { from: "2025-04", to: "2025-09" });
  assert.deepEqual(imageryWindow("2026-11", 49), { from: "2026-04", to: "2026-09" });
  assert.deepEqual(imageryWindow("2026-06", 49), { from: "2025-04", to: "2025-09" });
  // South: October to March, across the new year.
  assert.deepEqual(imageryWindow("2026-01", -34.9), { from: "2024-10", to: "2025-03" });
  assert.deepEqual(imageryWindow("2026-08", -34.9), { from: "2025-10", to: "2026-03" });
  // A place's own peak month (Australian winter wheat, August).
  assert.deepEqual(imageryWindow("2026-12", -31.5, 8), { from: "2026-05", to: "2026-10" });
});

test("the imagery window follows the area's latitude, and the war is stored", () => {
  const pampas = { id: "area-pampas", name: "Pampas", bbox: [-61.2, -35.1, -60.7, -34.7] };
  const cell = { id: "r0c0", lat: -34.9, lon: -60.95, areaHa: 1000 };
  const run = buildRun({ area: pampas, month: "2026-01", provider: "gee", readings: [reading("r0c0", 0)], cellSizeDeg: 0.5, cells: [cell] });
  assert.deepEqual(run.imagery, { from: "2024-10", to: "2025-03" });
  assert.equal(run.conflict, null, "no war unless one is given");
  // The season the data source says it used wins.
  const told = buildRun({ area: pampas, month: "2026-01", provider: "gee", readings: [reading("r0c0", 0)], cellSizeDeg: 0.5, cells: [cell], imagery: { from: "2024-11", to: "2025-04", label: "November 2024 to April 2025" }, accessSource: "none" });
  assert.deepEqual(told.imagery, { from: "2024-11", to: "2025-04", label: "November 2024 to April 2025" });
  assert.equal(told.accessSource, "none");
  assert.equal(run.accessSource, null);
  // Every source a data source can give is kept, "fires-none" (inside a war,
  // no fire looked like fighting: not measured) too; anything else is null.
  for (const source of ["acled", "fires", "fires-none", "none"]) {
    assert.equal(buildRun({ area: pampas, month: "2026-01", provider: "gee", readings: [reading("r0c0", 0)], cellSizeDeg: 0.5, cells: [cell], accessSource: source }).accessSource, source);
  }
  assert.equal(buildRun({ area: pampas, month: "2026-01", provider: "gee", readings: [reading("r0c0", 0)], cellSizeDeg: 0.5, cells: [cell], accessSource: "guess" }).accessSource, null);
  const war = buildRun({ ...makeArgs("2026-09"), conflict: { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24", countries: ["804"] } });
  assert.deepEqual(war.conflict, { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  assert.equal(buildRun({ ...makeArgs("2026-09"), conflict: { id: "x" } }).conflict, null, "a war needs its start date");
});

test("the baseline comes from the data source, else 2019 to 2021", () => {
  assert.deepEqual(makeRun("2026-09", 0).baseline, { from: 2019, to: 2021, label: "2019 to 2021" });
  const gee = buildRun({ area, month: "2026-09", provider: "gee", readings: [reading("r0c0", 0)], cells: [cells[0]], cellSizeDeg: 0.5, baseline: { from: 2021, to: 2021, label: "2021 (same months)" } });
  assert.deepEqual(gee.baseline, { from: 2021, to: 2021, label: "2021 (same months)" });
  const unlabeled = buildRun({ area, month: "2026-09", provider: "gee", readings: [], cells: [], cellSizeDeg: 0.5, baseline: { from: 2021, to: 2021 } });
  assert.equal(unlabeled.baseline.label, "2021");
});

test("months from another data source or method are not compared", () => {
  // Real case, Kenya (2026-10-19): one Earth Engine month against sample
  // months read "Cropland −27,371,469 ha" and "−1.93M ha vs Aug 2026".
  const a = { ...makeRun("2026-08", 0.1), provider: "sample" };
  const b = { ...makeRun("2026-09", 0.35), provider: "gee" };
  const result = compareRuns(a, b);
  assert.equal(result.comparable, false);
  assert.equal(result.notComparable, "source");
  assert.equal(result.notComparableText, "Not comparable: different data source");
  assert.equal(result.deltas.heavyDamageHa, null);
  assert.deepEqual(result.changedCells, []);
  linkNewDamage([a, b]);
  assert.equal(b.newHeavyDamageHa, null);
  // A different method version (damage from the health index, then radar).
  const older = { ...makeRun("2026-08", 0.1), method: { components: { damage: ["firms", "chi"] } } };
  const newer = { ...makeRun("2026-09", 0.35), method: { components: { damage: ["firms", "radar"] } } };
  assert.equal(compareRuns(older, newer).notComparable, "method");
  assert.equal(compareRuns(makeRun("2026-08", 0.1), makeRun("2026-09", 0.35)).comparable, true);
});

test("a run keeps who decided its war (the team, area.war, or the app's list); at peace by the team's choice it says so; months with another war setting are not compared", () => {
  const ukraine = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const team = { id: "area-area-test", name: "Fighting in the county", since: "2023-08-01", source: "area" };
  assert.equal(buildRun({ ...makeArgs("2026-09"), conflict: ukraine }).conflictSource, "list");
  const set = buildRun({ ...makeArgs("2026-09"), conflict: team, conflictSource: "area" });
  assert.deepEqual(set.conflict, team);
  assert.equal(set.conflictSource, "area");
  assert.equal(summarizeRun(set).conflictSource, "area", "the run list keeps it");
  // A war marked as the team's says so by itself.
  assert.equal(buildRun({ ...makeArgs("2026-09"), conflict: team }).conflictSource, "area");
  // At peace: the app's list's words, or the team's.
  const warnings = [NO_WAR_WARNING, "Something else."];
  const listPeace = buildRun({ ...makeArgs("2026-09"), warnings });
  assert.equal(listPeace.conflictSource, "list");
  assert.deepEqual(listPeace.checks.warnings.slice(0, 2), warnings);
  const teamPeace = buildRun({ ...makeArgs("2026-09"), warnings, conflictSource: "area" });
  assert.equal(teamPeace.conflict, null);
  assert.equal(teamPeace.conflictSource, "area");
  assert.deepEqual(teamPeace.checks.warnings.slice(0, 2), [TEAM_PEACE_WARNING, "Something else."]);
  // A month made at peace and one made at war (the team's setting changed
  // in between): no differences, no "new damage".
  const before = buildRun({ ...makeArgs("2026-08") });
  const after = buildRun({ ...makeArgs("2026-09"), conflict: team, conflictSource: "area" });
  const result = compareRuns(before, after);
  assert.equal(result.comparable, false);
  assert.equal(result.notComparable, "war");
  assert.equal(result.notComparableText, "Not comparable: different crisis setting");
  linkNewDamage([before, after]);
  assert.equal(after.newHeavyDamageHa, null);
  // The same start day by another name (or by the list) compares.
  const sameDay = buildRun({ ...makeArgs("2026-08"), conflict: { ...team, name: "Another name" } });
  assert.equal(compareRuns(sameDay, after).comparable, true);
});

test("cleanConflict keeps a natural disaster's kind and type; a war's comes out as before", async () => {
  const { cleanConflict } = await import("./runs.js");
  const flood = { id: "area-a", name: "Storm Daniel floods", since: "2023-09-04", source: "area", kind: "disaster", type: "flood", extra: 1 };
  assert.deepEqual(cleanConflict(flood), { id: "area-a", name: "Storm Daniel floods", since: "2023-09-04", source: "area", kind: "disaster", type: "flood" });
  // An unknown type is not a disaster: read as the team's war it would be.
  assert.deepEqual(cleanConflict({ ...flood, type: "volcano" }), { id: "area-a", name: "Storm Daniel floods", since: "2023-09-04", source: "area" });
  assert.deepEqual(cleanConflict({ id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }), { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  assert.deepEqual(cleanConflict({ id: "gaza", name: "Gaza war", since: "2023-10-07", partOfCountry: true, partOf: "area" }), { id: "gaza", name: "Gaza war", since: "2023-10-07", partOfCountry: true, partOf: "area" });
  assert.equal(cleanConflict(null), null);
});

test("buildRun in a natural disaster: hit and heavy land, Feasibility, the disaster's method; a war's run gets no new key", async () => {
  const { DISASTER_METHOD_VERSION, DISASTER_COMPONENTS, DISASTER_SCALES, SCALES, COMPONENTS, METHOD_VERSION, FLOOD } = await import("../src/lib/atlas/method.js");
  const flood = { id: "area-test", name: "Flood (set for this area)", since: "2023-09-04", source: "area", kind: "disaster", type: "flood" };
  const wet = (id, extra) => ({ ...reading(id, 0.1), conflictKm: 300, hitShare: 0.2, grassShare: 0.1, grassHitShare: 0.5, wetNowShare: 0.25, ...extra });
  const run = buildRun({ area, month: "2023-09", provider: "gee", readings: [wet("r0c0"), wet("r0c1", { hitShare: 0, heavyShare: 0, wetNowShare: 0 })], cellSizeDeg: 0.5, cells, conflict: flood, conflictSource: "area", accessSource: "flood-now" });
  const [a, b] = run.cells;
  // 1000 ha x 0.5 cropland = 500 ha, x 0.8 black soil = 400 ha.
  assert.equal(a.hitHa, 80); // 400 x 0.2
  assert.equal(a.hitCropHa, 100); // 500 x 0.2
  assert.equal(a.heavyDamageHa, 40); // 400 x 0.1
  assert.equal(a.heavyCropHa, 50);
  assert.equal(a.grassHitHa, 50); // 1000 x 0.1 x 0.5
  assert.equal(a.hit, 1); // 20% of the black soil: full
  assert.equal(a.heavy, 0.5); // 10% of 20%
  assert.equal(a.feasible, 0.7895); // 25% under water now: 1 - (0.25 - 0.05) / 0.95
  assert.equal(a.distance, null);
  assert.deepEqual(a.raw, { chiDrop: 0.1, radarDb: null, firesPer100Km2: 12.5, conflictKm: null, popPerKm2: 100, hitShare: 0.2, heavyShare: 0.1, wetNowShare: 0.25, fireKm: null });
  assert.equal(b.feasible, 1);
  assert.deepEqual(run.totals, { croplandHa: 1000, blackSoilHa: 800, heavyDamageHa: 40, peopleOnDamagedSoil: 50, hitHa: 80, hitCropHa: 100, heavyCropHa: 50, grassHitHa: 100, measuredCropHa: 1000 });
  assert.deepEqual(run.disasterDamage, { notMeasured: null, unmeasuredShare: 0, mayBeLow: [] });
  assert.deepEqual(run.method, { version: DISASTER_METHOD_VERSION, components: DISASTER_COMPONENTS, scales: { ...SCALES, ...DISASTER_SCALES }, disaster: { type: "flood", rules: FLOOD } });
  assert.deepEqual(run.conflict, flood);
  assert.equal(run.accessSource, "flood-now");
  // A wildfire: Feasibility is the distance to a fire burning now, full at 10 km.
  const fire = buildRun({ area, month: "2024-07", provider: "gee", readings: [reading("r0c0", 0), { ...reading("r0c1", 0), conflictKm: 300 }].map((r, i) => ({ ...r, conflictKm: i ? 300 : 4, hitShare: 0.1 })), cellSizeDeg: 0.5, cells, conflict: { ...flood, type: "wildfire" }, accessSource: "fire-now" });
  assert.deepEqual(fire.cells.map((cell) => [cell.feasible, cell.raw.fireKm, cell.raw.conflictKm]), [[0.4, 4, 4], [1, 300, 300]]);
  // A drought: Feasibility not measured, 1 everywhere.
  const drought = buildRun({ area, month: "2026-06", provider: "gee", readings: [reading("r0c0", 0), reading("r0c1", 0)].map((r) => ({ ...r, hitShare: 0.3 })), cellSizeDeg: 0.5, cells, conflict: { ...flood, type: "drought" }, accessSource: "none" });
  assert.ok(drought.cells.every((cell) => cell.feasible === 1 && cell.raw.conflictKm === null && cell.grassHitHa === 0));
  // A war's run: exactly the keys and method it always had.
  const war = buildRun({ area, month: "2023-09", provider: "gee", readings: [reading("r0c0", 0.1), reading("r0c1", 0)], cellSizeDeg: 0.5, cells, conflict: { id: "area-test", name: "War (set for this area)", since: "2023-09-04", source: "area" }, accessSource: "fires" });
  assert.deepEqual(Object.keys(war.cells[0]), ["id", "lat", "lon", "wrb", "agOutput", "firms", "radar", "chi", "distance", "population", "lights", "croplandHa", "blackSoilHa", "heavyDamageHa", "people", "peopleOnDamagedSoil", "raw"]);
  assert.deepEqual(Object.keys(war.cells[0].raw), ["chiDrop", "radarDb", "firesPer100Km2", "conflictKm", "popPerKm2"]);
  assert.deepEqual(Object.keys(war.totals), ["croplandHa", "blackSoilHa", "heavyDamageHa", "peopleOnDamagedSoil"]);
  assert.deepEqual(war.method, { version: METHOD_VERSION, components: COMPONENTS, scales: SCALES });
  assert.deepEqual(war.conflict, { id: "area-test", name: "War (set for this area)", since: "2023-09-04", source: "area" });
  assert.equal(war.cells[0].distance, 0.5);
  assert.equal("disasterDamage" in war, false);
});

test("buildRun in a natural disaster: a square whose damage was not measured reads null, never 0, and is not ranked", async () => {
  const { scorePlaces } = await import("../src/lib/atlas/scoring.js");
  const drought = { id: "area-test", name: "Drought (set for this area)", since: "2026-02-10", source: "area", kind: "disaster", type: "drought" };
  const readings = [{ ...reading("r0c0", 0.1), hitShare: 0.3 }, { ...reading("r0c1", 0.1), hitShare: null, heavyShare: null }];
  const run = buildRun({ area, month: "2026-04", provider: "gee", readings, cellSizeDeg: 0.5, cells, conflict: drought, accessSource: "none", disasterDamage: { notMeasured: "season-incomplete", unmeasuredShare: 0.5, mayBeLow: ["snow", "bogus"] } });
  const [measured, open] = run.cells;
  assert.equal(measured.hit, 1);
  assert.equal(measured.notMeasured, undefined);
  assert.deepEqual([open.hit, open.heavy, open.hitHa, open.hitCropHa, open.heavyCropHa, open.grassHitHa], [null, null, null, null, null, null]);
  assert.equal(open.raw.hitShare, null);
  assert.equal(open.heavyDamageHa, 0);
  assert.match(open.notMeasured, /not measured yet/);
  // The totals hold the measured square only, and say how much was measured.
  assert.equal(run.totals.hitCropHa, measured.hitCropHa);
  assert.equal(run.totals.measuredCropHa, measured.croplandHa);
  assert.deepEqual(run.disasterDamage, { notMeasured: "season-incomplete", unmeasuredShare: 0.5, mayBeLow: ["snow"] });
  const scored = scorePlaces(run.cells, { conflict: run.conflict, cellSizeDeg: 0.5, minBlackSoilHa: 0 });
  const notRanked = scored.places.find((place) => place.id === open.id);
  assert.equal(notRanked.analyzed, false);
  assert.equal(notRanked.reason, open.notMeasured);
});

test("feasibleFromWet: 5% or less under water is nothing in the way; more falls to 0", async () => {
  const { feasibleFromWet } = await import("./runs.js");
  assert.equal(feasibleFromWet(0), 1);
  assert.equal(feasibleFromWet(0.003), 1);
  assert.equal(feasibleFromWet(0.012), 1);
  assert.equal(feasibleFromWet(0.05), 1);
  assert.ok(feasibleFromWet(0.06) < 1 && feasibleFromWet(0.06) > 0.98);
  assert.equal(feasibleFromWet(1), 0);
  assert.ok(feasibleFromWet(0.5) > feasibleFromWet(0.8));
});
