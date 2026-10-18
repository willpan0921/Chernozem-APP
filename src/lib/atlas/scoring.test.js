// WHAT THIS FILE DOES
// Checks that the Atlas scoring method and the overview rules give the
// right answers. Run it from the project folder with:
//
//   node --test "src/lib/**/*.test.js"
//
// It needs no extra libraries. Every "test" below states one thing the
// method must do; if a change to scoring.js breaks one, the
// command says which.
//
// WHO EDITS IT
// Whoever changes the method. Add a test when you add a rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { componentScores, nearTermShares, powerMean, rampFactor, ranking, scorePlaces } from "./scoring.js";
import { makePlaces } from "./testPlaces.js";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

test("a score is the mean of its indicator columns, skipping blanks", () => {
  const scores = componentScores(
    { wrb: 0.8, agOutput: 0.6, firms: null, chi: 0.4, distance: 0.9 },
    { soil: ["wrb", "agOutput"], damage: ["firms", "chi"], access: ["distance"] }
  );
  close(scores.soil, 0.7);
  close(scores.damage, 0.4);
  close(scores.access, 0.9);
});

test("power mean: r = 1 is a weighted average, r = 0 a geometric mean", () => {
  close(powerMean([0.2, 0.8], [1, 1], 1), 0.5);
  close(powerMean([0.25, 1], [1, 1], 0), 0.5);
  close(powerMean([0, 1], [1, 1], 0), 0);
  // Weights on any scale are made to add up to 1.
  close(powerMean([0.2, 0.8], [30, 70], 1), 0.62);
});

test("r = 0 matches the research deposit's formula Value^0.3 × Damage^0.3 × Feasibility^0.4", () => {
  const [v, d, f] = [0.7, 0.4, 0.9];
  close(powerMean([v, d, f], [0.3, 0.3, 0.4], 0), Math.pow(v, 0.3) * Math.pow(d, 0.3) * Math.pow(f, 0.4));
});

test("Near term shows soil and damage as shares of 100", () => {
  assert.deepEqual(nearTermShares({ soil: 30, damage: 40, access: 30 }), { soil: 43, damage: 57 });
  assert.deepEqual(nearTermShares({ soil: 0, damage: 0, access: 100 }), { soil: 50, damage: 50 });
  assert.deepEqual(nearTermShares({ soil: 10, damage: 0, access: 90 }), { soil: 100, damage: 0 });
});

test("the ramp fades scores in above the gate", () => {
  close(rampFactor(0.3, 0.3, 0.2), 0);
  close(rampFactor(0.4, 0.3, 0.2), 0.5);
  close(rampFactor(0.9, 0.3, 0.2), 1);
  close(rampFactor(0.2, 0.3, 0.2), 0);
});

test("the ramp ends at 1: a gate near or at the top does not zero everything", () => {
  // Gate 0.9: the ramp is squeezed into 0.9..1.
  close(rampFactor(0.95, 0.9, 0.2), 0.5);
  close(rampFactor(1, 0.9, 0.2), 1);
  // Gate 1 (most places 100 km or more from fighting): places at 1 keep all.
  close(rampFactor(1, 1, 0.2), 1);
});

test("when most squares are fully safe, Near term still ranks them by soil and damage", () => {
  // 80 squares at full safe access, 20 close to fighting.
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: `r0c${i}`,
    wrb: (i % 10) / 10,
    agOutput: 0.5,
    firms: 0.1,
    chi: 0.1,
    distance: i < 80 ? 1 : 0.2,
    blackSoilHa: 100,
  }));
  const { places } = scorePlaces(rows, { settings: { gatePercentile: 20 } });
  const kept = places.filter((p) => p.nearTerm.tier !== "setAside");
  assert.equal(kept.length, 80);
  assert.ok(kept.every((p) => p.nearTerm.score > 0));
  const best = ranking(places, "nearTerm")[0];
  assert.equal(best.wrb, 0.9);
});

test("the cutoff splits ties: with 80% of places at full safe access, 55% sets aside about 55%", () => {
  // 80 places tie at access 1; their raw distance to fighting breaks the tie.
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: `r0c${String(i).padStart(3, "0")}`,
    wrb: 0.5,
    agOutput: 0.5,
    firms: 0.2,
    chi: 0.2,
    distance: i < 80 ? 1 : 0.1 + i / 1000,
    blackSoilHa: 100,
    raw: { conflictKm: i < 80 ? 100 + i : 10 + i / 10 },
  }));
  const result = scorePlaces(rows, { settings: { gatePercentile: 55 } });
  const aside = result.places.filter((p) => p.nearTerm.tier === "setAside");
  const share = aside.reduce((sum, p) => sum + p.blackSoilHa, 0) / 10000;
  assert.ok(Math.abs(share - 0.55) <= 0.01, `set aside ${share}`);
  close(result.setAsideShare, share);
  // The 20 least safe go first, then the tied places nearest to fighting.
  assert.ok(aside.some((p) => p.id === "r0c080") && aside.some((p) => p.id === "r0c000"));
  assert.ok(!aside.some((p) => p.id === "r0c079"));
  // Kept places tied at the top keep their full score.
  const kept = result.places.filter((p) => p.nearTerm.tier !== "setAside");
  assert.ok(kept.every((p) => p.nearTerm.ramp === 1));
  // A different cutoff gives a different split.
  const fewer = scorePlaces(rows, { settings: { gatePercentile: 30 } }).places.filter((p) => p.nearTerm.tier === "setAside");
  assert.equal(fewer.length, 30);
});

test("the cutoff counts black-soil hectares, not places", () => {
  // One big place holds half of all the hectares.
  const rows = [
    { id: "a", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.1, blackSoilHa: 300 },
    { id: "b", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.5, blackSoilHa: 100 },
    { id: "c", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.7, blackSoilHa: 100 },
    { id: "d", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.9, blackSoilHa: 100 },
  ];
  const result = scorePlaces(rows, { settings: { gatePercentile: 50 } });
  assert.deepEqual(result.places.filter((p) => p.nearTerm.tier === "setAside").map((p) => p.id), ["a"]);
  close(result.setAsideShare, 0.5);
  // The ramp starts at the line: just above the safest place set aside.
  close(result.gate, 0.1);
  close(result.places.find((p) => p.id === "b").nearTerm.ramp, 1);
});

test("a kept place tied with a set-aside one still gets a score", () => {
  // b and c tie at 0.5; the cutoff takes a and b, keeps c.
  const rows = [
    { id: "a", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.3, blackSoilHa: 100 },
    { id: "b", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.5, blackSoilHa: 100 },
    { id: "c", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.5, blackSoilHa: 100 },
    { id: "d", wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.8, blackSoilHa: 100 },
  ];
  const result = scorePlaces(rows, { settings: { gatePercentile: 50 } });
  assert.deepEqual(result.places.filter((p) => p.nearTerm.tier === "setAside").map((p) => p.id), ["a", "b"]);
  // The line sits below every kept place: at a, not at the tie.
  close(result.gate, 0.3);
  const c = result.places.find((p) => p.id === "c");
  assert.ok(c.nearTerm.ramp > 0 && c.nearTerm.score > 0, `c ramp ${c.nearTerm.ramp}`);
  assert.ok(Number.isFinite(c.nearTerm.rank));
});

test("when every place ties, the kept ones keep their whole score", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: `r0c${i}`, wrb: 0.5, agOutput: 0.5, firms: 0.2, chi: 0.2, distance: 0.4, blackSoilHa: 100,
  }));
  const result = scorePlaces(rows, { settings: { gatePercentile: 30 } });
  assert.equal(result.gate, null);
  const kept = result.places.filter((p) => p.nearTerm.tier !== "setAside");
  assert.equal(kept.length, 7);
  assert.ok(kept.every((p) => p.nearTerm.ramp === 1 && p.nearTerm.score > 0));
});

// A generated 12 x 12 grid of squares: the east (high columns) is close
// to the fighting and badly damaged, the west is safe and less damaged.
const rows = makePlaces(12, 12);
const { places } = scorePlaces(rows);

test("generated grid: every square is scored", () => {
  assert.equal(places.length, 144);
  assert.ok(places.every((place) => place.analyzed));
});

test("generated grid: the least safe squares are set aside in Near term", () => {
  const setAside = places.filter((place) => place.nearTerm.tier === "setAside");
  assert.ok(setAside.length > 20 && setAside.length < 70, `set aside: ${setAside.length}`);
  // Everything set aside is less safe than everything kept.
  const kept = places.filter((place) => place.nearTerm.tier !== "setAside");
  assert.ok(Math.max(...setAside.map((p) => p.access)) <= Math.min(...kept.map((p) => p.access)));
});

test("generated grid: ranks run 1..n with no gaps, best score first", () => {
  for (const timeframe of ["nearTerm", "postwar"]) {
    const list = ranking(places, timeframe);
    list.forEach((place, index) => assert.equal(place[timeframe].rank, index + 1));
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1][timeframe].score >= list[i][timeframe].score);
    assert.equal(list[0][timeframe].tier, "highest");
    assert.equal(list[0][timeframe].share, 1);
  }
});

test("generated grid: more damage weight pulls Postwar toward the damaged east", () => {
  const meanCol = (list) => list.reduce((sum, place) => sum + Number(place.id.split("c")[1]), 0) / list.length;
  const soilHeavy = ranking(scorePlaces(rows, { settings: { weights: { soil: 80, damage: 10, access: 10 } } }).places, "postwar").slice(0, 10);
  const damageHeavy = ranking(scorePlaces(rows, { settings: { weights: { soil: 10, damage: 80, access: 10 } } }).places, "postwar").slice(0, 10);
  assert.ok(meanCol(damageHeavy) > meanCol(soilHeavy), `${meanCol(damageHeavy)} vs ${meanCol(soilHeavy)}`);
});

test("a gate of 0 sets nothing aside", () => {
  const result = scorePlaces(rows, { settings: { gatePercentile: 0 } });
  assert.equal(result.places.filter((place) => place.nearTerm.tier === "setAside").length, 0);
});

test("an excluded square is not analyzed", () => {
  const result = scorePlaces(rows, { excluded: ["r0c0"] });
  const place = result.places.find((item) => item.id === "r0c0");
  assert.equal(place.analyzed, false);
  assert.equal(place.postwar.tier, "notAnalyzed");
});

test("a square missing a score is not analyzed and says why", () => {
  const result = scorePlaces([{ id: "r0c0", wrb: 0.5, agOutput: 0.5, firms: null, chi: null, distance: 0.5 }]);
  assert.equal(result.places[0].analyzed, false);
  assert.match(result.places[0].reason, /damage/);
});
