// WHAT THIS FILE DOES
// Checks the shaping of the public site's demo file (demoData.js): the
// border simplification, the flattening of polygons to outer rings, the
// shape of the file, and that the real scoring method, run through it,
// leaves the least feasible places out in Near term but not in
// Post-crisis. Run it from the project folder with:
//
//   node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes demoData.js. Add a test when you add a rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../atlas/method.js";
import { DEFAULT_EXCLUSION_NOTE, PAPER_EXCLUSION_NOTE, bboxOfRings, demoRings, outerRings, paperExclusions, shapeDemoData, simplifyLine, simplifyRing, summaryLines } from "./demoData.js";

// A closed square ring with many points along each side, plus one point
// nudged outwards on the east side.
function noisySquare({ west = 30, south = 48, size = 1, steps = 20, bump = 0.1 } = {}) {
  const ring = [];
  const step = size / steps;
  for (let i = 0; i < steps; i++) ring.push([west + i * step, south]);
  for (let i = 0; i < steps; i++) ring.push([west + size + (i === Math.floor(steps / 2) ? bump : 0), south + i * step]);
  for (let i = 0; i < steps; i++) ring.push([west + size - i * step, south + size]);
  for (let i = 0; i < steps; i++) ring.push([west, south + size - i * step]);
  ring.push([west, south]);
  return ring;
}

test("simplifyLine keeps the first and last points, drops points on the line and keeps the one that sticks out", () => {
  const line = [];
  for (let i = 0; i <= 10; i++) line.push([i, i % 5 === 0 ? 0 : 0.001]);
  line[5] = [5, 0.5];
  const out = simplifyLine(line, 0.01);
  assert.deepEqual(out[0], line[0]);
  assert.deepEqual(out[out.length - 1], line[line.length - 1]);
  assert.ok(out.length < line.length, `${out.length} of ${line.length}`);
  assert.ok(out.some((p) => p[0] === 5 && p[1] === 0.5), "the bump stays");
  // Noise alone, under the tolerance: only the two ends are left.
  assert.deepEqual(simplifyLine(line.map((p, i) => (i === 5 ? [5, 0.001] : p)), 0.01), [[0, 0], [10, 0]]);
  // A right angle: the corner stays, the points along its two sides go.
  assert.deepEqual(simplifyLine([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], 0.1), [[0, 0], [2, 0], [2, 2]]);
  // A tolerance of 0, or two points: nothing changes.
  assert.deepEqual(simplifyLine(line, 0), line);
  assert.deepEqual(simplifyLine([[0, 0], [1, 1]], 1), [[0, 0], [1, 1]]);
  assert.deepEqual(simplifyLine(null, 1), []);
});

test("simplifyRing keeps a closed ring closed, reduces its points and keeps its corners and bumps", () => {
  const ring = noisySquare();
  const out = simplifyRing(ring, 0.02);
  assert.deepEqual(out[0], ring[0]);
  assert.deepEqual(out[out.length - 1], ring[ring.length - 1]);
  assert.deepEqual(out[0], out[out.length - 1], "still closed");
  assert.ok(out.length < ring.length / 4, `${out.length} of ${ring.length}`);
  for (const corner of [[30, 48], [31, 48], [31, 49], [30, 49]]) assert.ok(out.some((p) => p[0] === corner[0] && p[1] === corner[1]), `corner ${corner}`);
  assert.ok(out.some((p) => p[0] === 31.1), "the bump on the east side stays");
  // A wider tolerance than the bump: the bump goes, the corners stay.
  const coarse = simplifyRing(ring, 0.2);
  assert.ok(!coarse.some((p) => p[0] === 31.1));
  assert.ok(coarse.length >= 5 && coarse.length <= 6, String(coarse.length));
});

test("outerRings flattens a Polygon and a MultiPolygon to their outer rings and drops holes", () => {
  const outer = noisySquare();
  const hole = noisySquare({ west: 30.3, south: 48.3, size: 0.4, steps: 4 });
  const island = noisySquare({ west: 32, south: 48, size: 0.5, steps: 4 });
  assert.deepEqual(outerRings({ type: "Polygon", coordinates: [outer, hole] }), [outer]);
  assert.deepEqual(outerRings({ type: "MultiPolygon", coordinates: [[outer, hole], [island]] }), [outer, island]);
  assert.deepEqual(outerRings({ type: "Point", coordinates: [1, 2] }), []);
  assert.deepEqual(outerRings(null), []);
});

test("demoRings simplifies, rounds to 3 decimals, keeps rings closed and drops a ring that collapsed", () => {
  const outer = noisySquare();
  // A speck: four points a few metres apart, well under the tolerance.
  const speck = [[33.0001, 48.0001], [33.0002, 48.0001], [33.0002, 48.0002], [33.0001, 48.0001]];
  const rings = demoRings({ type: "MultiPolygon", coordinates: [[outer], [speck]] }, { tolerance: 0.025, decimals: 3 });
  assert.equal(rings.length, 1, "the speck is dropped");
  const [ring] = rings;
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  for (const [lon, lat] of ring) {
    assert.equal(lon, Number(lon.toFixed(3)));
    assert.equal(lat, Number(lat.toFixed(3)));
  }
  assert.deepEqual(bboxOfRings(rings), [30, 48, 31.1, 49]);
  assert.equal(bboxOfRings([]), null);
});

// ---------- End to end with the real method ----------

// A square with its raw indicators, as a saved month holds them. Enough
// black soil to be ranked (above scoring.js blackSoilFloor at 0.25 deg).
function cell(id, { lat = 49, lon = 31, wrb = 0.8, agOutput = 0.6, firms = 0.5, radar = 0.5, distance = 1, conflictKm = 100, blackSoilHa = 20000 }) {
  return { id, lat, lon, wrb, agOutput, firms, radar, chi: 0, distance, population: 0.3, lights: 0.1, croplandHa: blackSoilHa * 1.5, blackSoilHa, heavyDamageHa: blackSoilHa * firms * 0.2, people: 1000, peopleOnDamagedSoil: Math.round(1000 * firms * 0.2), raw: { conflictKm } };
}
const unitOf = (id, name, west) => ({ id, name, displayName: name, level: 1, areaKm2: 1000, bbox: [west, 48, west + 1, 49], labelPoint: { lat: 48.5, lon: west + 0.5 }, geometry: { type: "Polygon", coordinates: [noisySquare({ west, bump: 0 })] } });

function fakeRun() {
  // Four oblasts, one square each, from the front (least feasible) to far
  // behind it (fully feasible). Soil value and damage are set so the front
  // one would lead if feasibility were ignored.
  const cells = [
    cell("c1", { lon: 30.5, distance: 0.05, conflictKm: 5, firms: 1, radar: 1, wrb: 0.9 }),
    cell("c2", { lon: 31.5, distance: 0.3, conflictKm: 30, firms: 0.8, radar: 0.8, wrb: 0.85 }),
    cell("c3", { lon: 32.5, distance: 0.7, conflictKm: 70, firms: 0.4, radar: 0.4, wrb: 0.8 }),
    cell("c4", { lon: 33.5, distance: 1, conflictKm: 150, firms: 0.1, radar: 0.1, wrb: 0.7 }),
  ];
  return {
    id: "run-test",
    areaId: "country-804",
    areaName: "Testland",
    month: "2026-09",
    label: "September 2026",
    conflict: { id: "test-war", name: "A war", since: "2022-02-24" },
    cellSizeDeg: 0.25,
    cellCount: 4,
    totals: { croplandHa: 120000, blackSoilHa: 80000, heavyDamageHa: 9200, peopleOnDamagedSoil: 460 },
    cells,
  };
}
const fakeUnits = () => [unitOf("u-front", "Front", 30), unitOf("u-near", "Near", 31), unitOf("u-mid", "Middle", 32), unitOf("u-far", "Far", 33), unitOf("u-empty", "Empty", 34)];
const fakeCellUnit = { c1: "u-front", c2: "u-near", c3: "u-mid", c4: "u-far" };

test("the demo file has the shape the site expects, built with the research defaults", () => {
  const data = shapeDemoData({ run: fakeRun(), units: fakeUnits(), cellUnit: fakeCellUnit, builtAt: "2026-10-27T00:00:00.000Z" });
  assert.equal(data.version, 1);
  assert.equal(data.builtAt, "2026-10-27T00:00:00.000Z");
  assert.deepEqual(data.area, { name: "Testland", month: "2026-09", monthLabel: "September 2026", cellCount: 4, totals: { croplandHa: 120000, blackSoilHa: 80000, heavyDamageHa: 9200, peopleOnDamagedSoil: 460 } });
  assert.deepEqual(data.settings, { weights: { soil: 30, damage: 40, access: 30 }, cutoffPercent: 30, rampWidth: 0.2, r: 0.5 });
  assert.deepEqual(data.settings.weights, DEFAULT_SETTINGS.weights);
  assert.equal(data.timeframes.nearTerm.label, "Near term");
  assert.equal(data.timeframes.postCrisis.label, "Post-crisis");
  assert.equal(data.units.length, 5);
  assert.deepEqual(data.units.map((u) => u.name), ["Empty", "Far", "Front", "Middle", "Near"], "by name");
  const far = data.units.find((u) => u.id === "u-far");
  for (const key of ["id", "name", "labelPoint", "centroidPct", "scores", "nearTerm", "postCrisis", "rankChange", "blackSoilHa", "croplandHa", "heavyDamageHa", "people", "peopleOnDamagedSoil", "squares", "rings"]) assert.ok(key in far, key);
  assert.deepEqual(Object.keys(far.scores), ["value", "damage", "access"]);
  assert.deepEqual(Object.keys(far.nearTerm), ["priority", "rank", "leftOut", "tier"]);
  assert.deepEqual(Object.keys(far.postCrisis), ["priority", "rank", "tier"]);
  assert.equal(far.scores.access, 1);
  assert.equal(far.blackSoilHa, 20000);
  assert.equal(far.croplandHa, 30000);
  assert.equal(far.squares, 1);
  assert.equal(far.rings.length, 1);
  assert.ok(far.rings[0].length >= 5 && far.rings[0].length < 20, String(far.rings[0].length));
  assert.deepEqual(far.labelPoint, { lat: 48.5, lon: 33.5 });
  assert.deepEqual(data.bbox, [30, 48, 35, 49]);
  assert.deepEqual(far.centroidPct, [70, 50]);
  // A unit with no square is kept, unranked, with a note.
  const empty = data.units.find((u) => u.id === "u-empty");
  assert.equal(empty.nearTerm.rank, null);
  assert.equal(empty.postCrisis.rank, null);
  assert.equal(empty.rankChange, null);
  assert.equal(empty.note, "No map square in it");
  assert.equal(empty.squares, 0);
  assert.ok(!("note" in far));
  // It survives a round trip through JSON unchanged.
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
});

test("with the real method, the cutoff leaves the least feasible place out in Near term but Post-crisis ranks every place", () => {
  const data = shapeDemoData({ run: fakeRun(), units: fakeUnits(), cellUnit: fakeCellUnit });
  const by = Object.fromEntries(data.units.map((u) => [u.id, u]));
  // 30% of 80,000 ha is 24,000: the front square (20,000 ha) is set aside;
  // the next one would take the total further from the target.
  assert.equal(by["u-front"].nearTerm.leftOut, true);
  assert.equal(by["u-front"].nearTerm.rank, null);
  assert.equal(by["u-front"].nearTerm.priority, null);
  assert.equal(by["u-front"].nearTerm.tier, "setAside");
  assert.equal(by["u-near"].nearTerm.leftOut, false);
  assert.equal(data.timeframes.nearTerm.leftOutCount, 1);
  assert.equal(data.timeframes.nearTerm.ranked, 3);
  assert.deepEqual(
    data.units.filter((u) => u.nearTerm.rank !== null).sort((a, b) => a.nearTerm.rank - b.nearTerm.rank).map((u) => u.nearTerm.rank),
    [1, 2, 3],
  );
  // Post-crisis: all four ranked, feasibility now counts, so the fully
  // feasible far place beats the front one on rank despite less damage.
  assert.equal(data.timeframes.postCrisis.ranked, 4);
  assert.ok(data.units.filter((u) => u.postCrisis.rank !== null).length === 4);
  assert.ok(Number.isFinite(by["u-front"].postCrisis.priority));
  assert.ok(by["u-front"].postCrisis.rank !== null);
  // Near term ranks by value and damage only: the most damaged kept place leads.
  assert.equal(by["u-near"].nearTerm.rank, 1);
  // rankChange = near-term rank minus post-crisis rank, where both exist.
  for (const u of data.units.filter((u) => u.nearTerm.rank !== null && u.postCrisis.rank !== null)) assert.equal(u.rankChange, u.nearTerm.rank - u.postCrisis.rank);
  // Scores are the same the app computes: a one-square unit carries its square's scores.
  assert.ok(Math.abs(by["u-far"].scores.value - (0.7 + 0.6) / 2) < 1e-3);
  assert.ok(Math.abs(by["u-far"].scores.damage - 0.1) < 1e-3);
  // No cutoff: nothing is left out.
  const open = shapeDemoData({ run: fakeRun(), units: fakeUnits(), cellUnit: fakeCellUnit, settings: { ...DEFAULT_SETTINGS, gatePercentile: 0 } });
  assert.equal(open.timeframes.nearTerm.leftOutCount, 0);
  assert.equal(open.settings.cutoffPercent, 0);
  // The report names the time frames and the place left out.
  const lines = summaryLines(data).join("\n");
  assert.match(lines, /Near term top 8 of 3 ranked \(1 left out by the cutoff\)/);
  assert.match(lines, /left out: Front/);
  assert.match(lines, /Post-crisis top 8 of 4 ranked/);
  assert.match(lines, /Not ranked: Empty/);
  assert.match(lines, /Biggest rank changes/);
});

test("an excluded state (the paper's Crimea) is drawn but not ranked, and the cutoff and ranks are worked out as if its squares were not there", () => {
  // The four oblasts above plus an occupied one: fully feasible on paper
  // and holding as much black soil as two of the others together.
  const withOccupied = () => {
    const run = fakeRun();
    run.cells.push(cell("c5", { lon: 34.5, distance: 1, conflictKm: 150, firms: 0.6, radar: 0.6, wrb: 0.95, blackSoilHa: 40000 }));
    run.cellCount = 5;
    return run;
  };
  const units = [...fakeUnits(), { ...unitOf("u-krym", "Krym", 34), displayName: "Crimea" }].filter((u) => u.id !== "u-empty");
  const cellUnit = { ...fakeCellUnit, c5: "u-krym" };

  // Found by its name, not by a fixed id.
  assert.deepEqual(paperExclusions(units), { "u-krym": PAPER_EXCLUSION_NOTE });
  assert.deepEqual(paperExclusions([{ id: "x", name: "Avtonomna Respublika Krym", displayName: "Crimea" }, { id: "y", name: "Kyyivs'ka", displayName: "Kyiv" }]), { x: PAPER_EXCLUSION_NOTE });

  // Ranked with it: 30% of 120,000 ha leaves out the front and the near
  // oblast, and the occupied one leads both time frames.
  const all = shapeDemoData({ run: withOccupied(), units, cellUnit });
  const allBy = Object.fromEntries(all.units.map((u) => [u.id, u]));
  assert.equal(all.timeframes.nearTerm.leftOutCount, 2);
  assert.equal(all.timeframes.nearTerm.excludedCount, 0);
  assert.equal(allBy["u-krym"].nearTerm.rank, 1);
  assert.equal(allBy["u-krym"].excluded, false);

  // Excluded: only 80,000 ha count, so the cutoff leaves out the front one only.
  const data = shapeDemoData({ run: withOccupied(), units, cellUnit, exclude: paperExclusions(units) });
  const by = Object.fromEntries(data.units.map((u) => [u.id, u]));
  const krym = by["u-krym"];
  assert.equal(krym.excluded, true);
  assert.equal(krym.scores, null);
  assert.equal(krym.nearTerm, null);
  assert.equal(krym.postCrisis, null);
  assert.equal(krym.rankChange, null);
  assert.equal(krym.nearestConflictKm, null);
  assert.equal(krym.note, "Not ranked, as in the research paper: occupied since 2014 and outside Ukrainian agricultural reporting.");
  // Still drawn, with its name and sums.
  assert.equal(krym.name, "Crimea");
  assert.equal(krym.rings.length, 1);
  assert.deepEqual(krym.labelPoint, { lat: 48.5, lon: 34.5 });
  assert.equal(krym.blackSoilHa, 40000);
  assert.equal(krym.squares, 1);
  assert.ok(Array.isArray(krym.centroidPct));
  assert.deepEqual(data.bbox, [30, 48, 35, 49], "its border counts for the map's box");
  assert.equal(data.timeframes.nearTerm.excludedCount, 1);
  assert.equal(data.timeframes.nearTerm.leftOutCount, 1);
  assert.equal(by["u-near"].nearTerm.leftOut, false);
  assert.equal(data.timeframes.nearTerm.ranked, 3, "ranked counts only ranked states");
  assert.equal(data.timeframes.postCrisis.ranked, 4);
  for (const u of data.units.filter((u) => !u.excluded)) assert.equal(u.excluded, false);

  // Exactly as if the occupied squares were not in the month at all.
  const dropped = shapeDemoData({ run: fakeRun(), units, cellUnit: fakeCellUnit });
  for (const u of dropped.units.filter((u) => u.id !== "u-krym")) {
    assert.deepEqual(by[u.id].scores, u.scores, u.id);
    assert.deepEqual(by[u.id].nearTerm, u.nearTerm, u.id);
    assert.deepEqual(by[u.id].postCrisis, u.postCrisis, u.id);
  }
  assert.equal(data.timeframes.nearTerm.gate, dropped.timeframes.nearTerm.gate);
  assert.equal(data.timeframes.nearTerm.setAsideShare, dropped.timeframes.nearTerm.setAsideShare);

  // A list of ids gets the plain note; the report names what was excluded.
  const byList = shapeDemoData({ run: withOccupied(), units, cellUnit, exclude: ["u-krym"] });
  assert.equal(byList.units.find((u) => u.id === "u-krym").note, DEFAULT_EXCLUSION_NOTE);
  const lines = summaryLines(data).join("\n");
  assert.match(lines, /Excluded from the ranking: Crimea \(1 squares\)/);
  assert.doesNotMatch(lines, /Not ranked: Crimea/);
});
