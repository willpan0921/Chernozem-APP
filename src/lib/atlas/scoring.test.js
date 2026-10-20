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
import { blackSoilFloor, componentScores, nearTermShares, peaceDamageScore, powerMean, rampFactor, ranking, scorePlaces } from "./scoring.js";
import { BLACK_SOIL_MIN, NO_BLACK_SOIL_REASON, PEACE_DAMAGE, cellAreaHa } from "./method.js";
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

test("fully safe places are never set aside: the cutoff only takes places near fighting", () => {
  // 80 places are 100 km or more from fighting (access 1), 20 are close.
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
  // A 55% cutoff can only take the 20 places near fighting.
  const result = scorePlaces(rows, { settings: { gatePercentile: 55 } });
  const aside = result.places.filter((p) => p.nearTerm.tier === "setAside");
  assert.equal(aside.length, 20);
  assert.ok(aside.every((p) => p.access < 1));
  close(result.setAsideShare, 0.2);
  // Kept places at full safe access keep their full score.
  const kept = result.places.filter((p) => p.nearTerm.tier !== "setAside");
  assert.ok(kept.every((p) => p.nearTerm.ramp === 1));
  // A smaller cutoff takes the least safe first.
  const fewer = scorePlaces(rows, { settings: { gatePercentile: 10 } }).places.filter((p) => p.nearTerm.tier === "setAside");
  assert.equal(fewer.length, 10);
  assert.ok(fewer.some((p) => p.id === "r0c080") && !fewer.some((p) => p.id === "r0c099"));
});

test("an area at peace keeps every place", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, wrb: 0.3 + i / 100, agOutput: 0.5, firms: 0, chi: 0.05, distance: 1, blackSoilHa: 1000 }));
  const result = scorePlaces(rows, { settings: { gatePercentile: 30 } });
  assert.equal(result.places.filter((p) => p.nearTerm.tier === "setAside").length, 0);
  assert.equal(result.setAsideShare, 0);
  assert.ok(result.places.every((p) => Number.isFinite(p.nearTerm.rank)));
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

test("a square with (almost) no black-soil cropland is not ranked", () => {
  // Real case, Kenya at peace (2026-10-19): arid squares with 0 ha of black
  // soil were ranked 1st to 7th on savanna fires.
  const cell = (id, lat, blackSoilHa, heavyDamageHa, firms) => ({ id, lat, lon: 36, wrb: 0.5, agOutput: 0.5, firms, radar: 0.3, distance: 1, blackSoilHa, heavyDamageHa });
  const rows = [cell("r1c1", -1.6, 0, 0, 1), cell("r2c1", -1.4, 200, 25, 1), cell("r3c1", 0.6, 25620, 0, 0), cell("r4c1", -1.4, 6019, 49, 1)];
  // 0.2° squares near the equator: about 49,500 ha, so the floor is ~250 ha.
  const { places } = scorePlaces(rows, { conflict: null, cellSizeDeg: 0.2 });
  const byId = Object.fromEntries(places.map((p) => [p.id, p]));
  assert.equal(byId.r1c1.reason, NO_BLACK_SOIL_REASON);
  assert.equal(byId.r1c1.nearTerm.tier, "noBlackSoil");
  assert.equal(byId.r1c1.nearTerm.rank, null);
  assert.equal(byId.r2c1.reason, NO_BLACK_SOIL_REASON);
  assert.equal(byId.r3c1.analyzed, true);
  assert.deepEqual(ranking(places, "nearTerm").map((p) => p.id).sort(), ["r3c1", "r4c1"]);
  assert.ok(Math.abs(blackSoilFloor({ lat: 0 }, 0.2) - 0.005 * cellAreaHa(0.2, 0)) < 1e-9);
  // Without the square's size: BLACK_SOIL_MIN.ha.
  assert.equal(blackSoilFloor({ lat: 0 }), BLACK_SOIL_MIN.ha);
  // Rows without blackSoilHa (the research regions) are ranked as before.
  assert.equal(scorePlaces([{ id: "a", wrb: 1, agOutput: 1, firms: 1, radar: 1, distance: 1 }]).places[0].analyzed, true);
});

test("at peace the damage score is the heavily damaged share of the black soil, so 0 ha damaged scores 0", () => {
  const rows = [
    { id: "a", lat: 0, wrb: 0.6, agOutput: 0.6, firms: 1, radar: 1, distance: 1, blackSoilHa: 20000, heavyDamageHa: 0 },
    { id: "b", lat: 0, wrb: 0.6, agOutput: 0.6, firms: 0, radar: 0, distance: 1, blackSoilHa: 20000, heavyDamageHa: 2000 },
  ];
  const peace = scorePlaces(rows, { conflict: null, cellSizeDeg: 0.2 }).places;
  assert.equal(peace[0].damage, 0);
  close(peace[1].damage, 2000 / 20000 / PEACE_DAMAGE.fullShare);
  assert.equal(peaceDamageScore({ blackSoilHa: 100, heavyDamageHa: 90 }), 1);
  assert.equal(peaceDamageScore({ blackSoilHa: 0, heavyDamageHa: 0 }), null);
  // Inside a war (or a run saved before conflict was stored): the indicators.
  const war = scorePlaces(rows, { conflict: { id: "ukraine-2022" }, cellSizeDeg: 0.2 }).places;
  assert.equal(war[0].damage, 1);
  assert.equal(war[1].damage, 0);
  assert.equal(scorePlaces(rows).places[0].damage, 1);
});

test("a war that covers the area only in part: squares outside its region (atWar false) are scored at peace, the others by the war's indicators", () => {
  const rows = [
    // Inside the war's region: unusual fire and radar change count.
    { id: "front", lat: 51.5, wrb: 0.6, agOutput: 0.6, firms: 1, radar: 1, distance: 0.2, blackSoilHa: 20000, heavyDamageHa: 0, atWar: true },
    // Far from it: the same fire and radar readings are everyday change,
    // so only the heavily damaged share counts (here none).
    { id: "far", lat: 55, wrb: 0.6, agOutput: 0.6, firms: 1, radar: 1, distance: 1, blackSoilHa: 20000, heavyDamageHa: 0, atWar: false },
    { id: "far-hit", lat: 55, wrb: 0.6, agOutput: 0.6, firms: 0, radar: 0, distance: 1, blackSoilHa: 20000, heavyDamageHa: 2000, atWar: false },
  ];
  const kursk = { id: "russia-kursk-belgorod", name: "Kursk", since: "2022-02-24", partOfCountry: true };
  const byId = Object.fromEntries(scorePlaces(rows, { conflict: kursk, cellSizeDeg: 0.2 }).places.map((p) => [p.id, p]));
  assert.equal(byId.front.damage, 1);
  assert.equal(byId.far.damage, 0);
  close(byId["far-hit"].damage, 2000 / 20000 / PEACE_DAMAGE.fullShare);
  assert.equal(byId.far.atWar, false, "the place keeps which rules it was read with");
});
