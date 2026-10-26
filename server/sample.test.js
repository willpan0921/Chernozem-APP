// WHAT THIS FILE DOES
// Tests for the sample data source (server/providers/sample.js): the same
// area and month always give the same numbers, values stay in range, a
// place at peace (Kenya, Moldova) has no front and no war damage, inside a
// known war (Sudan, Ukraine) damage builds up near the front (and "new
// damage" is exactly how much it grew), a month before its war began has
// no war damage and no front, a war that covers a whole country only in
// part (Thailand) has its readings in its squares only, and a small farm
// near the real front in Ukraine shows damage and people. Run with "npm
// test".
//
// WHO EDITS IT
// Whoever changes sample.js.

import test from "node:test";
import assert from "node:assert/strict";
import { sampleProvider, sampleReadings } from "./providers/sample.js";
import { planGrid } from "./geo.js";
import { getCountry } from "./countries.js";
import { NO_WAR_WARNING, beforeWarWarning, buildRun, linkNewDamage, monthsBack } from "./runs.js";
import { warSquares } from "../src/config/conflicts.js";
import { scorePlaces } from "../src/lib/atlas/scoring.js";

// Kenya: at peace.
const kenya = getCountry("404");
const grid = planGrid(kenya.geometry);
const area = { id: "country-404", name: "Kenya", bbox: grid.bbox };
const read = (month, which = area) => sampleReadings({ area: which, cells: grid.cells, month, cellSizeDeg: grid.cellSizeDeg });

// Sudan: inside a known war (since April 2023), with a made-up front.
const sudan = getCountry("729");
const sudanGrid = planGrid(sudan.geometry);
const sudanArea = { id: "country-729", name: "Sudan", countryId: "729", bbox: sudanGrid.bbox };
const readSudan = (month) => sampleReadings({ area: sudanArea, cells: sudanGrid.cells, month, cellSizeDeg: sudanGrid.cellSizeDeg });

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
  const { readings, warnings } = read("2026-09");
  const { alerts } = readSudan("2026-09");
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
  const war = readSudan("2026-09").readings;
  assert.ok(Math.max(...war.map((r) => r.conflictKm)) - Math.min(...war.map((r) => r.conflictKm)) > 100);
});

test("at peace (Kenya; Moldova, inside Ukraine's box): no front, fully safe, no war damage", () => {
  const moldova = getCountry("498");
  const moldovaGrid = planGrid(moldova.geometry);
  const places = [
    [area, grid],
    [{ id: "country-498", name: "Moldova", countryId: "498", bbox: moldovaGrid.bbox }, moldovaGrid],
  ];
  for (const [which, whichGrid] of places) {
    const result = sampleReadings({ area: which, cells: whichGrid.cells, month: "2026-09", cellSizeDeg: whichGrid.cellSizeDeg });
    assert.equal(result.conflict, null, which.name);
    assert.ok(result.warnings.includes(NO_WAR_WARNING), which.name);
    assert.ok(result.readings.every((r) => r.conflictKm === 300 && r.heavyShare === 0 && r.chiDrop < 0.05), which.name);
    assert.ok(result.readings.every((r) => r.firesPer100Km2 < 1), which.name);
    const run = buildRun({ area: which, month: "2026-09", provider: "sample", ...result, cellSizeDeg: whichGrid.cellSizeDeg, cells: whichGrid.cells });
    assert.equal(run.totals.heavyDamageHa, 0, which.name);
    assert.equal(run.conflict, null);
    assert.equal(scorePlaces(run.cells, {}).places.filter((p) => p.nearTerm.tier === "setAside").length, 0, `${which.name}: nothing set aside`);
  }
});

test("inside a known war: damage grows over a year and sits near the front", () => {
  const total = (month) => buildRun({ area: sudanArea, month, provider: "sample", ...readSudan(month), cellSizeDeg: sudanGrid.cellSizeDeg, cells: sudanGrid.cells }).totals.heavyDamageHa;
  assert.ok(total("2026-09") > total("2025-09"));
  const { readings, conflict, warnings } = readSudan("2026-09");
  assert.equal(conflict.id, "sudan-2023");
  assert.ok(!warnings.includes(NO_WAR_WARNING));
  const near = readings.filter((r) => r.conflictKm < 30);
  const far = readings.filter((r) => r.conflictKm > 150);
  const mean = (list) => list.reduce((s, r) => s + r.chiDrop, 0) / list.length;
  assert.ok(near.length && far.length);
  assert.ok(mean(near) > mean(far) * 3);
});

test("a month that ends before its war began: no front, no war damage, distance to fighting not measured (as on Earth Engine)", () => {
  // Sudan's grid with a war its team set from 2026-06-01.
  const war = { id: "area-country-729", name: "Test war", since: "2026-06-01", source: "area" };
  const at = (month) => sampleReadings({ area: sudanArea, cells: sudanGrid.cells, month, cellSizeDeg: sudanGrid.cellSizeDeg, conflict: war });
  const before = at("2025-12");
  assert.deepEqual(before.conflict, war, "the run keeps its war");
  assert.equal(before.accessSource, "none");
  assert.deepEqual(before.warnings.slice(1), [beforeWarWarning("2026-06-01")]);
  assert.ok(before.readings.every((r) => r.conflictKm === 300 && r.heavyShare === 0 && r.firesPer100Km2 === 0 && r.radarDb === null));
  const run = buildRun({ area: sudanArea, month: "2025-12", provider: "sample", ...before, cellSizeDeg: sudanGrid.cellSizeDeg, cells: sudanGrid.cells });
  assert.equal(run.totals.heavyDamageHa, 0);
  // The war scores no damage then, and sets nothing aside.
  const scored = scorePlaces(run.cells, { conflict: run.conflict, cellSizeDeg: sudanGrid.cellSizeDeg }).places;
  assert.ok(scored.every((p) => p.damage === 0 || p.damage === null));
  assert.equal(scored.filter((p) => p.nearTerm.tier === "setAside").length, 0);
  // From its first month on, the front and its damage.
  const during = at("2026-08");
  assert.equal(during.accessSource, "fires");
  assert.ok(during.readings.some((r) => r.conflictKm < 30));
  assert.ok(during.readings.some((r) => r.heavyShare > 0));
});

test("a war that covers a whole country only in part (Thailand): the front and the war's readings in the squares that touch its boxes, peace readings elsewhere", () => {
  const thailand = getCountry("764");
  const thaiGrid = planGrid(thailand.geometry);
  const thaiArea = { id: "country-764", name: "Thailand", countryId: "764", bbox: thaiGrid.bbox };
  const border = { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24", partOfCountry: true };
  const result = sampleReadings({ area: thaiArea, cells: thaiGrid.cells, month: "2026-09", cellSizeDeg: thaiGrid.cellSizeDeg, conflict: border });
  const squares = warSquares(border, thaiGrid.cells, thaiGrid.cellSizeDeg);
  assert.ok(squares.size > 0 && squares.size < thaiGrid.cells.length);
  assert.ok(result.readings.every((r) => r.atWar === squares.has(r.id)));
  const inside = result.readings.filter((r) => r.atWar);
  const outside = result.readings.filter((r) => !r.atWar);
  // Outside: the readings of peace (no heavy damage, ordinary radar change).
  assert.ok(outside.every((r) => r.heavyShare === 0 && r.radarDb <= 0.6 && r.chiDrop < 0.05));
  // The made-up front runs through the war's squares.
  assert.ok(inside.some((r) => r.heavyShare > 0));
  assert.ok(Math.min(...inside.map((r) => r.conflictKm)) < 30);
  // Far from the border (Chiang Mai, in the north) the front is far away.
  const north = outside.filter((r) => thaiGrid.cells.find((cell) => cell.id === r.id).lat > 18);
  assert.ok(north.length && north.every((r) => r.conflictKm > 200));
  const run = buildRun({ area: thaiArea, month: "2026-09", provider: "sample", ...result, cellSizeDeg: thaiGrid.cellSizeDeg, cells: thaiGrid.cells });
  assert.equal(run.warSquares, squares.size);
  assert.equal(run.cells.filter((cell) => cell.atWar === false).length, thaiGrid.cells.length - squares.size);
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

test("sample data in a natural disaster: no front, a hit patch around the middle, Feasibility per type", async () => {
  const geometry = { type: "Polygon", coordinates: [[[22.05, 39.35], [22.35, 39.35], [22.35, 39.55], [22.05, 39.55], [22.05, 39.35]]] };
  const grid = planGrid(geometry);
  const area = { id: "sample-flood", name: "Sample flood", bbox: grid.bbox, geometry };
  const conflict = (type) => ({ id: "area-sample-flood", name: "x", since: "2023-09-04", source: "area", kind: "disaster", type });
  const flood = sampleReadings({ area, cells: grid.cells, month: "2023-09", cellSizeDeg: grid.cellSizeDeg, conflict: conflict("flood") });
  assert.equal(flood.accessSource, "flood-now");
  assert.ok(flood.readings.every((r) => r.conflictKm === 300), "no front line: no distance to fighting");
  const hit = flood.readings.filter((r) => r.hitShare > 0);
  assert.ok(hit.length > 0 && hit.length < flood.readings.length, "a patch, not everywhere");
  assert.ok(Math.max(...flood.readings.map((r) => r.hitShare)) <= 0.6);
  assert.ok(flood.readings.every((r) => Math.abs(r.heavyShare - r.hitShare / 2) < 1e-4));
  assert.ok(hit.every((r) => r.wetNowShare === 0.3));
  // The month after: no water now; the same hit land.
  const after = sampleReadings({ area, cells: grid.cells, month: "2023-10", cellSizeDeg: grid.cellSizeDeg, conflict: conflict("flood") });
  assert.ok(after.readings.every((r) => r.wetNowShare === 0));
  assert.deepEqual(after.readings.map((r) => r.hitShare), flood.readings.map((r) => r.hitShare));
  // A wildfire: the distance to the fire in its month, 300 km after.
  const fire = sampleReadings({ area, cells: grid.cells, month: "2023-09", cellSizeDeg: grid.cellSizeDeg, conflict: conflict("wildfire") });
  assert.equal(fire.accessSource, "fire-now");
  assert.ok(Math.min(...fire.readings.map((r) => r.conflictKm)) < 5);
  assert.ok(sampleReadings({ area, cells: grid.cells, month: "2023-10", cellSizeDeg: grid.cellSizeDeg, conflict: conflict("wildfire") }).readings.every((r) => r.conflictKm === 300));
  // A drought: not measured; before the day: nothing at all.
  assert.equal(sampleReadings({ area, cells: grid.cells, month: "2023-09", cellSizeDeg: grid.cellSizeDeg, conflict: conflict("drought") }).accessSource, "none");
  const before = sampleReadings({ area, cells: grid.cells, month: "2023-08", cellSizeDeg: grid.cellSizeDeg, conflict: conflict("flood") });
  assert.ok(before.readings.every((r) => r.hitShare === 0));
  assert.ok(before.warnings.includes("This month ends before the flood began (2023-09-04): no disaster damage is counted, and Feasibility is not measured."));
});
