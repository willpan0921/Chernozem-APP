// Tests for the scores of whole states and districts (units.js). Run with
// `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_BLACK_SOIL_REASON, checkSettings } from "./method.js";
import { scorePlaces, setAsideLeastSafe } from "./scoring.js";
import { makePlaces } from "./testPlaces.js";
import { NO_SQUARES_REASON, scoreUnits, unitRanking } from "./units.js";

const WAR = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };

// A ranked square with its three scores given directly (scorePlaces is not
// needed for the weighting tests).
const square = (id, { soil, damage, access, blackSoilHa = 1000, croplandHa = 2000, analyzed = true, reason = null, heavyDamageHa = 0, people = 100, peopleOnDamagedSoil = 0, conflictKm = 50, tier = "high" }) => ({
  id,
  soil,
  damage,
  access,
  blackSoilHa,
  croplandHa,
  heavyDamageHa,
  people,
  peopleOnDamagedSoil,
  analyzed,
  reason,
  raw: { conflictKm },
  nearTerm: { score: null, rank: null, tier, share: 0, ramp: 0 },
  postwar: { score: null, rank: null, tier, share: 0 },
});
const unit = (id, name = id) => ({ id, name, displayName: name, level: 1 });

test("a unit's scores are the black-soil-weighted mean of its ranked squares, and its sums add up all its squares", () => {
  const places = [
    square("a1", { soil: 0.9, damage: 0.2, access: 1, blackSoilHa: 3000, heavyDamageHa: 100, people: 500, peopleOnDamagedSoil: 20 }),
    square("a2", { soil: 0.1, damage: 0.6, access: 0.5, blackSoilHa: 1000, heavyDamageHa: 300, people: 100, peopleOnDamagedSoil: 30 }),
    // Not ranked (too little black soil): left out of the means, kept in the sums.
    square("a3", { soil: 0, damage: 1, access: 0, blackSoilHa: 50, croplandHa: 400, analyzed: false, reason: NO_BLACK_SOIL_REASON, tier: "noBlackSoil" }),
  ];
  const { units } = scoreUnits(places, [unit("A")], { a1: "A", a2: "A", a3: "A" }, { settings: {} });
  const [a] = units;
  assert.ok(Math.abs(a.soil - (0.9 * 3000 + 0.1 * 1000) / 4000) < 1e-12, String(a.soil));
  assert.ok(Math.abs(a.damage - (0.2 * 3000 + 0.6 * 1000) / 4000) < 1e-12);
  assert.ok(Math.abs(a.access - (1 * 3000 + 0.5 * 1000) / 4000) < 1e-12);
  assert.equal(a.weightedBy, "blackSoilHa");
  assert.equal(a.squares, 3);
  assert.equal(a.rankedSquares, 2);
  assert.deepEqual(a.cellIds, ["a1", "a2", "a3"]);
  assert.equal(a.blackSoilHa, 4050);
  assert.equal(a.rankedBlackSoilHa, 4000);
  assert.equal(a.croplandHa, 4400);
  assert.equal(a.heavyDamageHa, 400);
  assert.equal(a.people, 700);
  assert.equal(a.peopleOnDamagedSoil, 50);
  assert.equal(a.analyzed, true);
  assert.equal(a.reason, null);
  assert.equal(a.postwar.rank, 1);
  assert.equal(a.name, "A", "the unit's own fields are kept");
});

test("ranked squares without black-soil hectares are weighted by cropland, then equally", () => {
  const byCrop = scoreUnits(
    [square("x", { soil: 1, damage: 0, access: 1, blackSoilHa: null, croplandHa: 3000 }), square("y", { soil: 0, damage: 0, access: 1, blackSoilHa: null, croplandHa: 1000 })],
    [unit("U")],
    { x: "U", y: "U" },
  ).units[0];
  assert.equal(byCrop.weightedBy, "croplandHa");
  assert.equal(byCrop.soil, 0.75);
  const equal = scoreUnits(
    [square("x", { soil: 1, damage: 0, access: 1, blackSoilHa: null, croplandHa: null }), square("y", { soil: 0, damage: 0, access: 1, blackSoilHa: null, croplandHa: null })],
    [unit("U")],
    { x: "U", y: "U" },
  ).units[0];
  assert.equal(equal.weightedBy, "equal");
  assert.equal(equal.soil, 0.5);
});

test("a unit without black soil is not ranked but keeps cropland-weighted scores for the maps; an empty unit has none", () => {
  const places = [
    square("d1", { soil: 0.2, damage: 0.5, access: 1, blackSoilHa: 10, croplandHa: 3000, analyzed: false, reason: NO_BLACK_SOIL_REASON, tier: "noBlackSoil" }),
    square("d2", { soil: 0.6, damage: 0.1, access: 1, blackSoilHa: 0, croplandHa: 1000, analyzed: false, reason: NO_BLACK_SOIL_REASON, tier: "noBlackSoil" }),
    square("g1", { soil: 0.8, damage: 0.4, access: 1 }),
  ];
  const { units } = scoreUnits(places, [unit("Dry"), unit("Good"), unit("Tiny")], { d1: "Dry", d2: "Dry", g1: "Good" });
  const dry = units.find((u) => u.id === "Dry");
  assert.equal(dry.analyzed, false);
  assert.equal(dry.reason, NO_BLACK_SOIL_REASON);
  assert.equal(dry.nearTerm.tier, "noBlackSoil");
  assert.equal(dry.postwar.tier, "noBlackSoil");
  assert.equal(dry.nearTerm.rank, null);
  assert.equal(dry.weightedBy, "croplandHa");
  assert.ok(Math.abs(dry.soil - (0.2 * 3000 + 0.6 * 1000) / 4000) < 1e-12);
  assert.equal(dry.rankedSquares, 0);
  const tiny = units.find((u) => u.id === "Tiny");
  assert.equal(tiny.reason, NO_SQUARES_REASON);
  assert.equal(tiny.squares, 0);
  assert.deepEqual([tiny.soil, tiny.damage, tiny.access], [null, null, null]);
  assert.equal(tiny.nearTerm.tier, "notAnalyzed");
  assert.equal(tiny.blackSoilHa, 0);
  const good = units.find((u) => u.id === "Good");
  assert.equal(good.postwar.rank, 1, "only the ranked unit has a rank");
  assert.deepEqual(unitRanking(units, "postwar").map((u) => u.id), ["Good"]);
  // No units, or squares in no unit: nothing breaks.
  assert.deepEqual(scoreUnits(places, [], {}).units, []);
  assert.equal(scoreUnits(places, [unit("Good")], {}).units[0].reason, NO_SQUARES_REASON);
});

test("one square per unit: each unit gets exactly its square's scores, ranks and tiers (the same method)", () => {
  for (const settings of [checkSettings({}), checkSettings({ gatePercentile: 45, weights: { soil: 60, damage: 20, access: 20 }, r: 1 })]) {
    const { places } = scorePlaces(makePlaces(8, 8), { settings, conflict: WAR, cellSizeDeg: 0.25 });
    const ranked = places.filter((p) => p.analyzed);
    assert.ok(ranked.length > 40);
    const units = ranked.map((p) => unit(`u-${p.id}`));
    const cellUnit = Object.fromEntries(ranked.map((p) => [p.id, `u-${p.id}`]));
    const result = scoreUnits(places, units, cellUnit, { settings });
    for (const p of ranked) {
      const u = result.units.find((x) => x.id === `u-${p.id}`);
      for (const key of ["soil", "damage", "access"]) assert.ok(Math.abs(u[key] - p[key]) < 1e-12, `${p.id} ${key}`);
      assert.equal(u.nearTerm.tier, p.nearTerm.tier, p.id);
      assert.equal(u.nearTerm.rank, p.nearTerm.rank, p.id);
      assert.equal(u.postwar.rank, p.postwar.rank, p.id);
      assert.equal(u.postwar.tier, p.postwar.tier, p.id);
      if (p.nearTerm.score === null) assert.equal(u.nearTerm.score, null);
      else assert.ok(Math.abs(u.nearTerm.score - p.nearTerm.score) < 1e-12, p.id);
      assert.ok(Math.abs(u.postwar.score - p.postwar.score) < 1e-12, p.id);
    }
  }
});

test("the Feasibility cutoff works at unit level: the least feasible units holding the cutoff's share of the black soil are left out for now", () => {
  // Four units of 1,000 ha each, from least to most feasible.
  const places = [
    square("s1", { soil: 0.9, damage: 0.9, access: 0.1, conflictKm: 10 }),
    square("s2", { soil: 0.8, damage: 0.8, access: 0.4, conflictKm: 40 }),
    square("s3", { soil: 0.7, damage: 0.7, access: 0.7, conflictKm: 70 }),
    square("s4", { soil: 0.6, damage: 0.6, access: 1, conflictKm: 100 }),
  ];
  const cellUnit = { s1: "U1", s2: "U2", s3: "U3", s4: "U4" };
  const units = ["U1", "U2", "U3", "U4"].map((id) => unit(id));
  const settings = checkSettings({ gatePercentile: 30 });
  const result = scoreUnits(places, units, cellUnit, { settings });
  const tier = (id) => result.units.find((u) => u.id === id).nearTerm.tier;
  assert.equal(tier("U1"), "setAside", "the least feasible quarter is left out for now");
  assert.notEqual(tier("U2"), "setAside");
  assert.equal(result.units.find((u) => u.id === "U1").setAsideSquares, 0, "the squares' own cutoff is reported separately (none set aside here)");
  // The same choice as the squares' rule applied to the units' rows.
  const rows = result.units.map((u) => ({ id: u.id, access: u.access, blackSoilHa: u.rankedBlackSoilHa, raw: { conflictKm: null } }));
  assert.deepEqual([...setAsideLeastSafe(rows, 30).aside], ["U1"]);
  assert.ok(Math.abs(result.setAsideShare - 0.25) < 1e-12);
  // No cutoff: nothing left out; Postwar never leaves anything out.
  const open = scoreUnits(places, units, cellUnit, { settings: checkSettings({ gatePercentile: 0 }) });
  assert.ok(open.units.every((u) => u.nearTerm.tier !== "setAside"));
  assert.ok(result.units.every((u) => Number.isFinite(u.postwar.rank)));
  // The near-term ranking leaves the set-aside unit out.
  assert.deepEqual(unitRanking(result.units, "nearTerm").map((u) => u.id).includes("U1"), false);
});

test("near term ranks by value and damage only; postwar blends feasibility too", () => {
  // Same value and damage, very different feasibility.
  const places = [square("near", { soil: 0.8, damage: 0.8, access: 0.3, conflictKm: 30 }), square("far", { soil: 0.8, damage: 0.8, access: 1, conflictKm: 100 })];
  const cellUnit = { near: "Near", far: "Far" };
  const units = [unit("Near"), unit("Far")];
  const result = scoreUnits(places, units, cellUnit, { settings: checkSettings({ gatePercentile: 0, weights: { soil: 30, damage: 30, access: 40 } }) });
  const near = result.units.find((u) => u.id === "Near");
  const far = result.units.find((u) => u.id === "Far");
  assert.equal(near.nearTerm.score, far.nearTerm.score, "feasibility is a cutoff in the near term, not a weight");
  assert.ok(far.postwar.score > near.postwar.score);
  assert.equal(far.postwar.rank, 1);
});

test("ties rank the same way whatever order the units come in", () => {
  const places = [square("p", { soil: 0.5, damage: 0.5, access: 1 }), square("q", { soil: 0.5, damage: 0.5, access: 1 })];
  const cellUnit = { p: "B", q: "A" };
  const one = scoreUnits(places, [unit("A"), unit("B")], cellUnit).units;
  const two = scoreUnits([...places].reverse(), [unit("B"), unit("A")], cellUnit).units;
  const ranks = (list) => Object.fromEntries(list.map((u) => [u.id, [u.nearTerm.rank, u.postwar.rank]]));
  assert.deepEqual(ranks(one), ranks(two));
  assert.deepEqual(new Set(Object.values(ranks(one)).map((r) => r[1])), new Set([1, 2]));
  assert.equal(one.find((u) => u.id === "A").postwar.score, one.find((u) => u.id === "B").postwar.score);
});

test("scoring units changes nothing about the squares", () => {
  const rows = makePlaces(6, 6);
  const before = scorePlaces(rows, { conflict: WAR, cellSizeDeg: 0.25 });
  const snapshot = JSON.stringify(before.places);
  const half = Object.fromEntries(before.places.map((p) => [p.id, p.lon < 24.75 ? "West" : "East"]));
  scoreUnits(before.places, [unit("West"), unit("East")], half, { settings: before.settings });
  assert.equal(JSON.stringify(before.places), snapshot, "the squares are not touched");
  // The squares score the same as before the units' floor option existed.
  assert.equal(JSON.stringify(scorePlaces(rows, { conflict: WAR, cellSizeDeg: 0.25 }).places), snapshot);
  assert.equal(JSON.stringify(scorePlaces(rows, { conflict: WAR, cellSizeDeg: 0.25, minBlackSoilHa: undefined }).places), snapshot);
  // The cellUnit answer may also be a Map.
  const asMap = scoreUnits(before.places, [unit("West"), unit("East")], new Map(Object.entries(half)), { settings: before.settings });
  assert.deepEqual(asMap.units.map((u) => u.squares), [18, 18]);
});

test("units on the map: a unit left out for now gets the lowest priority shade (no grey), and its hover text reads its score and nearest fighting", async () => {
  const { colorStep, colorVar, rankedCount, valueText } = await import("./mapColors.js");
  const places = [
    square("s1", { soil: 0.9, damage: 0.9, access: 0.1, conflictKm: 10 }),
    square("s2", { soil: 0.8, damage: 0.8, access: 0.4, conflictKm: 40 }),
    square("s3", { soil: 0.7, damage: 0.7, access: 0.7, conflictKm: 70 }),
    square("s4", { soil: 0.6, damage: 0.6, access: 1, conflictKm: 100 }),
  ];
  const cellUnit = { s1: "U1", s2: "U2", s3: "U3", s4: "U4" };
  const { units } = scoreUnits(places, ["U1", "U2", "U3", "U4"].map((id) => unit(id)), cellUnit, { settings: checkSettings({ gatePercentile: 30 }) });
  const total = rankedCount(units, "nearTerm");
  const u1 = units.find((u) => u.id === "U1");
  assert.equal(u1.nearTerm.tier, "setAside");
  assert.equal(colorVar("priority", colorStep(u1, "priority", "nearTerm", total)), "--map-priority-1");
  assert.equal(valueText(u1, "priority", "nearTerm", total), "Left out for now (least feasible)");
  assert.equal(valueText(u1, "access"), "Feasibility 10 / 100 · nearest fighting about 10 km");
  assert.equal(colorStep(u1, "value"), 5, "Value colours by the unit's soil value (0.9)");
  assert.equal(valueText(units.find((u) => u.id === "U2"), "priority", "nearTerm", total).startsWith("Rank "), true);
});

test("a state's hover gives its Feasibility score and its nearest fighting, never a mean distance that hides the front", async () => {
  const { valueText } = await import("./mapColors.js");
  // One square at the front (10 km, Feasibility 0.1), one far away (300 km,
  // capped at 1); the far one holds most of the black soil.
  const places = [square("front", { soil: 0.8, damage: 0.5, access: 0.1, blackSoilHa: 1000, conflictKm: 10 }), square("far", { soil: 0.8, damage: 0.5, access: 1, blackSoilHa: 9000, conflictKm: 300 })];
  const { units } = scoreUnits(places, [unit("S")], { front: "S", far: "S" }, { settings: checkSettings({ gatePercentile: 0 }) });
  const s = units[0];
  assert.equal(s.nearestConflictKm, 10);
  assert.equal(s.raw, undefined, "no mean distance for the page");
  const text = valueText(s, "access");
  assert.equal(text, "Feasibility 91 / 100 · nearest fighting about 10 km");
  assert.doesNotMatch(text, /100 km \+/);
  // All far: says so, still as a score.
  const calm = scoreUnits([square("x", { soil: 0.5, damage: 0.5, access: 1, conflictKm: 250 })], [unit("C")], { x: "C" }).units[0];
  assert.equal(valueText(calm, "access"), "Feasibility 100 / 100 · nearest fighting 100 km +");
});
