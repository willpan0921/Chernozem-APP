// WHAT THIS FILE DOES
// Tests for the sample data source (server/providers/sample.js): the same
// area and month always give the same numbers, values stay in range,
// damage builds up near the front (and "new damage" is exactly how much it
// grew), and a small farm near the real front in Ukraine shows damage and
// people. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes sample.js.

import test from "node:test";
import assert from "node:assert/strict";
import { sampleProvider, sampleReadings } from "./providers/sample.js";
import { planGrid } from "./geo.js";
import { getCountry } from "./countries.js";
import { buildRun, linkNewDamage, monthsBack } from "./runs.js";

const kenya = getCountry("404");
const grid = planGrid(kenya.geometry);
const area = { id: "country-404", name: "Kenya", bbox: grid.bbox };
const read = (month, which = area) => sampleReadings({ area: which, cells: grid.cells, month, cellSizeDeg: grid.cellSizeDeg });

test("same area and month give the same numbers", () => {
  assert.deepEqual(read("2026-09"), read("2026-09"));
});

test("a different area or month gives different numbers", () => {
  const base = read("2026-09").readings;
  const otherMonth = read("2026-08").readings;
  const otherArea = read("2026-09", { ...area, id: "area-other" }).readings;
  assert.notDeepEqual(base.map((r) => r.chiDrop), otherMonth.map((r) => r.chiDrop));
  assert.notDeepEqual(base.map((r) => r.chernozem), otherArea.map((r) => r.chernozem));
});

test("values stay in range", () => {
  const { readings, alerts, warnings } = read("2026-09");
  assert.equal(readings.length, grid.cells.length);
  for (const r of readings) {
    assert.ok(r.chernozem >= 0 && r.chernozem <= 1);
    assert.ok(r.croplandShare >= 0.2 && r.croplandShare <= 0.9);
    assert.ok(r.heavyShare >= 0 && r.heavyShare <= 1);
    assert.ok(r.firesPer100Km2 >= 0);
    assert.ok(r.conflictKm >= 0);
    assert.ok(r.popPerKm2 > 0);
    assert.ok(r.lights >= 0);
    assert.ok(r.chiDrop >= -0.05 && r.chiDrop <= 0.6);
    for (const value of Object.values(r)) if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
  assert.ok(alerts.length >= 1 && alerts.length <= 6);
  for (const alert of alerts) {
    assert.ok(["radar", "fire"].includes(alert.kind));
    assert.match(alert.date, /^2026-09-\d\d$/);
    assert.ok(alert.cellIds.length >= 1);
  }
  assert.match(warnings[0], /Sample/);
});

test("values vary across the area (not flat)", () => {
  const { readings } = read("2026-09");
  const spread = (key) => Math.max(...readings.map((r) => r[key])) - Math.min(...readings.map((r) => r[key]));
  assert.ok(spread("chernozem") > 0.5);
  assert.ok(spread("croplandShare") > 0.4);
  assert.ok(spread("conflictKm") > 100);
});

test("damage grows over a year and sits near the front", () => {
  const total = (month) => buildRun({ area, month, provider: "sample", ...read(month), cellSizeDeg: grid.cellSizeDeg, cells: grid.cells }).totals.heavyDamageHa;
  assert.ok(total("2026-09") > total("2025-09"));
  const { readings } = read("2026-09");
  const near = readings.filter((r) => r.conflictKm < 30);
  const far = readings.filter((r) => r.conflictKm > 150);
  const mean = (list) => list.reduce((s, r) => s + r.chiDrop, 0) / list.length;
  assert.ok(near.length && far.length);
  assert.ok(mean(near) > mean(far) * 3);
});

// A 50 ha farm near Kupiansk, in eastern Ukraine (like the demo farm).
const side = 0.00636;
const farm = { type: "Polygon", coordinates: [[[37.54, 49.74], [37.54 + side * 1.5, 49.74], [37.54 + side * 1.5, 49.74 + side], [37.54, 49.74 + side], [37.54, 49.74]]] };
const farmGrid = planGrid(farm);
const farmArea = { id: "area-farm", name: "Farm", bbox: farmGrid.bbox };

// Twelve monthly runs (oldest first) for an area, linked like the server does.
function yearOfRuns(which, whichGrid) {
  const runs = monthsBack("2026-09", 12)
    .reverse()
    .map((month) =>
      buildRun({ area: which, month, provider: "sample", ...sampleReadings({ area: which, cells: whichGrid.cells, month, cellSizeDeg: whichGrid.cellSizeDeg }), cellSizeDeg: whichGrid.cellSizeDeg, cells: whichGrid.cells })
    );
  linkNewDamage(runs);
  return runs;
}

test("works on a 50 ha farm", async () => {
  const result = await sampleProvider.analyze({ area: farmArea, cells: farmGrid.cells, month: "2026-09", cellSizeDeg: farmGrid.cellSizeDeg });
  assert.equal(result.readings.length, farmGrid.cells.length);
  const crop = result.readings.map((r) => r.croplandShare);
  assert.ok(Math.max(...crop) - Math.min(...crop) > 0.05, "a farm still has variation");
  const heavy = result.readings.map((r) => r.heavyShare);
  assert.ok(Math.max(...heavy) - Math.min(...heavy) > 0.05, "damage varies across the farm");
  // The real front passes Kupiansk, a few km east of the farm.
  assert.ok(result.readings.every((r) => r.conflictKm > 0.5 && r.conflictKm < 20), "the front is near, not on, the farm");
});

test("the farm near the front shows damage and people", () => {
  const runs = yearOfRuns(farmArea, farmGrid);
  for (const run of runs.slice(-3)) {
    assert.ok(run.totals.heavyDamageHa > 0, `${run.month}: some heavy damage`);
    assert.ok(run.totals.peopleOnDamagedSoil > 0, `${run.month}: a few people on damaged land`);
    assert.ok(run.totals.peopleOnDamagedSoil < 200, `${run.month}: only a few people`);
  }
  assert.ok(runs.at(-1).totals.heavyDamageHa > runs[0].totals.heavyDamageHa, "damage grew over the year");
});

test("Ukraine: damage builds up and new damage is exactly the growth", () => {
  const ukraine = getCountry("804");
  const ukraineGrid = planGrid(ukraine.geometry);
  const runs = yearOfRuns({ id: "country-804", name: "Ukraine", bbox: ukraineGrid.bbox }, ukraineGrid);
  for (let i = 1; i < runs.length; i += 1) {
    const before = runs[i - 1].totals.heavyDamageHa;
    const now = runs[i].totals.heavyDamageHa;
    assert.ok(now >= before, `${runs[i].month}: total did not fall (${before} -> ${now})`);
    assert.equal(runs[i].newHeavyDamageHa, now - before, `${runs[i].month}: new damage = growth`);
    assert.ok(runs[i].newHeavyDamageHa >= 0);
  }
  assert.equal(runs[0].newHeavyDamageHa, null, "no month before the first");
  // The damage sits in the east, along the real front.
  const last = runs.at(-1);
  const damaged = last.cells.filter((cell) => cell.heavyDamageHa > 0);
  const meanLon = damaged.reduce((s, cell) => s + cell.lon * cell.heavyDamageHa, 0) / damaged.reduce((s, cell) => s + cell.heavyDamageHa, 0);
  assert.ok(meanLon > 33 && meanLon < 39.5, `damage centred in the east (lon ${meanLon.toFixed(1)})`);
});

test("new damage is never positive while the total falls", () => {
  const runs = yearOfRuns(area, grid);
  for (let i = 1; i < runs.length; i += 1) {
    const growth = runs[i].totals.heavyDamageHa - runs[i - 1].totals.heavyDamageHa;
    assert.equal(runs[i].newHeavyDamageHa, Math.max(0, growth), runs[i].month);
  }
});
