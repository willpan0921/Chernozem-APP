// WHAT THIS FILE DOES
// Tests for server/runs.js: building runs, totals, comparing and months.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever changes runs.js.

import test from "node:test";
import assert from "node:assert/strict";
import { addMonths, buildRun, compareRuns, imageryWindow, latestCompleteMonth, linkNewDamage, monthLabel, monthsBack, summarizeRun } from "./runs.js";

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
