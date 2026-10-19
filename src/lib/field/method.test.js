// WHAT THIS FILE DOES
// Checks the Field method (method.js). Run with: npm test
//
// WHO EDITS IT
// Whoever changes the Field method. Add a test when you add a rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conditionClass,
  conditionForDamage,
  conditionScore,
  convertArea,
  damageDetected,
  damagedArea,
  isRainyDay,
  soilTypeFor,
  fieldStatus,
  harvestStage,
  healthScore,
  isStressed,
  recoveryCost,
  stressLevel,
  versusNormal,
  waterScore,
} from "./method.js";

// A season curve: green-up to a peak, then a dry-down.
function season(values, start = "2026-04-01", everyDays = 10) {
  const day0 = Date.parse(`${start}T00:00:00Z`);
  return values.map((ndvi, i) => ({ date: new Date(day0 + i * everyDays * 86400000).toISOString().slice(0, 10), ndvi }));
}

test("health and water scores are 1 at normal and fall to 0 well below it", () => {
  assert.equal(healthScore(0.7, 0.7), 1);
  assert.equal(healthScore(0.8, 0.7), 1);
  assert.equal(healthScore(0.4, 0.7), 0);
  assert.ok(Math.abs(healthScore(0.55, 0.7) - 0.5) < 1e-9);
  assert.equal(waterScore(0.2, 0.2), 1);
  assert.equal(healthScore(null, 0.7), null);
});

test("stress needs both: weaker than the field and weaker than normal", () => {
  assert.equal(isStressed(0.5, 0.65, 0.7), true);
  assert.equal(isStressed(0.5, 0.65, 0.55), false); // normal for this spot
  assert.equal(isStressed(0.6, 0.65, 0.75), false); // not much weaker than the field
});

test("condition score re-weights when a part is missing", () => {
  assert.equal(conditionScore({ health: 1, water: 1, stress: 0 }), 1);
  assert.ok(Math.abs(conditionScore({ health: 0.5, water: null, stress: 0 }) - (0.5 * 0.5 + 0.2) / 0.7) < 1e-6);
  assert.equal(conditionScore({}), null);
  assert.equal(conditionClass(0.3).id, "poor");
  assert.equal(conditionClass(0.9).id, "great");
});

test("versus normal and stress level", () => {
  assert.equal(versusNormal(0.5, 0.55, 0.7), "below");
  assert.equal(versusNormal(0.56, 0.55, 0.7), "normal");
  assert.equal(versusNormal(0.8, 0.55, 0.7), "above");
  assert.equal(stressLevel(0.02), "low");
  assert.equal(stressLevel(0.08), "medium");
  assert.equal(stressLevel(0.2), "high");
});

test("harvest stage: growing, ripening with an estimate, ready, harvested, not sown", () => {
  const growing = harvestStage(season([0.3, 0.45, 0.6, 0.72, 0.8, 0.82]), "2026-06-01");
  assert.equal(growing.stage, "growing");

  const ripening = harvestStage(season([0.3, 0.5, 0.7, 0.82, 0.8, 0.72, 0.64, 0.56]), "2026-06-12");
  assert.equal(ripening.stage, "ripening");
  assert.ok(ripening.daysToReady > 0 && ripening.daysToReady < 60, `days ${ripening.daysToReady}`);

  const ready = harvestStage(season([0.3, 0.5, 0.7, 0.82, 0.75, 0.6, 0.48, 0.42, 0.4]), "2026-06-22");
  assert.equal(ready.stage, "ready");

  const harvested = harvestStage(season([0.3, 0.5, 0.7, 0.82, 0.7, 0.55, 0.18, 0.17]), "2026-06-22");
  assert.equal(harvested.stage, "harvested");

  assert.equal(harvestStage(season([0.18, 0.2, 0.22, 0.25, 0.21]), "2026-05-20").stage, "notSown");
  assert.equal(harvestStage(season([0.5, 0.6]), "2026-05-20").stage, "unknown");
});

// Winter wheat: peak in May, harvested mid-July, then the autumn regrowth
// (volunteers, or the next sowing) greening up to 0.39 by mid-October.
const WHEAT_THEN_REGROWTH = (last) =>
  [
    ["2026-03-01", 0.45], ["2026-03-20", 0.6], ["2026-04-10", 0.72], ["2026-05-01", 0.8], ["2026-05-20", 0.82],
    ["2026-06-10", 0.7], ["2026-06-25", 0.55], ["2026-07-05", 0.45], ["2026-07-15", 0.21], ["2026-08-01", 0.2],
    ["2026-08-20", 0.18], ["2026-09-10", 0.2], ["2026-09-25", 0.28], ["2026-10-05", 0.33], ["2026-10-15", last],
  ].map(([date, ndvi]) => ({ date, ndvi }));

test("regrowth after harvest stays harvested, never ready to harvest", () => {
  for (const last of [0.39, 0.5]) {
    const stage = harvestStage(WHEAT_THEN_REGROWTH(last), "2026-10-18");
    assert.equal(stage.stage, "harvested", `regrowth to ${last}`);
    assert.equal(stage.harvestedOn, "2026-07-15");
    assert.equal(fieldStatus({ harvest: stage, condition: 0.8 }).id, "harvested");
  }
});

test("a real harvest in a field's average: barley near Kupiansk, 2026 (Earth Engine)", () => {
  // Field 6 of the demo farm: dried down to 0.44, harvested Aug 18-23
  // (0.44 -> 0.28), then weeds and volunteers green up to 0.40 by October.
  const curve = "06-21:0.73 06-24:0.73 07-01:0.69 07-04:0.61 07-06:0.65 07-08:0.65 07-11:0.65 07-31:0.63 08-03:0.60 08-05:0.53 08-07:0.50 08-08:0.48 08-10:0.49 08-15:0.47 08-17:0.43 08-18:0.44 08-23:0.28 08-25:0.27 08-30:0.30 09-02:0.29 09-07:0.29 09-09:0.30 09-12:0.27 09-17:0.31 09-19:0.28 09-26:0.29 09-29:0.35 10-04:0.36 10-07:0.36 10-09:0.37 10-12:0.40";
  const points = curve.split(" ").map((item) => ({ date: `2026-${item.slice(0, 5)}`, ndvi: Number(item.slice(6)) }));
  const stage = harvestStage(points, "2026-10-18");
  assert.equal(stage.stage, "harvested");
  assert.equal(stage.harvestedOn, "2026-08-23");
});

test("a full second crop after an early harvest is read as its own season", () => {
  // Barley harvested late June, then a second crop that greens up to 0.78.
  const points = [
    ["2026-03-01", 0.4], ["2026-04-01", 0.65], ["2026-05-01", 0.82], ["2026-06-01", 0.6], ["2026-06-15", 0.45],
    ["2026-06-25", 0.2], ["2026-07-10", 0.25], ["2026-07-25", 0.4], ["2026-08-10", 0.6], ["2026-08-25", 0.74], ["2026-09-05", 0.78],
  ].map(([date, ndvi]) => ({ date, ndvi }));
  assert.equal(harvestStage(points, "2026-09-07").stage, "growing");
});

test("a single cloudy outlier does not end the season", () => {
  const stage = harvestStage(season([0.3, 0.5, 0.7, 0.8, 0.15, 0.82, 0.83]), "2026-06-05");
  assert.equal(stage.stage, "growing");
});

test("damage needs radar change, or repeated fires backed by radar or soil health", () => {
  assert.equal(damageDetected({ radarChangedShare: 0.12 }), true);
  // Fires alone are not enough: a ~1 km fire pixel touches every nearby field.
  assert.equal(damageDetected({ firesSinceWar: 4 }), false);
  assert.equal(damageDetected({ firesSinceWar: 5, radarChangedShare: 0.035, chiDrop: 0.02 }), false);
  assert.equal(damageDetected({ firesSinceWar: 4, radarChangedShare: 0.06 }), true);
  assert.equal(damageDetected({ firesSinceWar: 4, radarChangedShare: 0.01, chiDrop: 0.12 }), true);
  assert.equal(damageDetected({ chiDrop: 0.15, radarChangedShare: 0.06 }), true);
  assert.equal(damageDetected({ chiDrop: 0.15, radarChangedShare: 0.01 }), false);
  assert.equal(damageDetected({}), false);
});

test("damaged area comes from the radar extent, or is unknown", () => {
  assert.equal(damagedArea({ radarChangedShare: 0.3 }, 40), 12);
  assert.equal(damagedArea({ radarChangedShare: 0.06, firesSinceWar: 4 }, 50), 3);
  // Detected from fires and the health index only: no tiny made-up area.
  assert.equal(damagedArea({ radarChangedShare: 0.01, firesSinceWar: 4, chiDrop: 0.12 }, 50), null);
  assert.equal(damagedArea({ radarChangedShare: 0.02 }, 50), null); // not damaged
  assert.equal(damagedArea({ radarChangedShare: 0.3 }, null), null);
});

test("a damaged field is never shown better than Fair", () => {
  assert.equal(conditionClass(conditionForDamage(0.92, { detected: true })).id, "fair");
  assert.equal(conditionForDamage(0.3, { detected: true }), 0.3);
  assert.equal(conditionForDamage(0.92, { detected: false }), 0.92);
  assert.equal(conditionForDamage(null, { detected: true }), null);
});

test("soil type and rainy days", () => {
  assert.equal(soilTypeFor(0.5), "chernozem");
  assert.equal(soilTypeFor(0.49), null);
  assert.equal(soilTypeFor(null), null);
  assert.equal(isRainyDay({ rainChance: 60, rainMm: 3 }), true);
  assert.equal(isRainyDay({ rainChance: 60, rainMm: 0.5 }), false);
  assert.equal(isRainyDay({ rainChance: 30, rainMm: 8 }), false);
});

test("status: recovery beats harvest beats condition", () => {
  assert.equal(fieldStatus({ damage: { detected: true }, harvest: { stage: "ready" }, condition: 0.9 }).id, "recovery");
  assert.equal(fieldStatus({ harvest: { stage: "ready" }, condition: 0.3 }).id, "ready");
  assert.equal(fieldStatus({ harvest: { stage: "ripening", daysToReady: 8 }, condition: 0.8 }).id, "harvestSoon");
  assert.equal(fieldStatus({ harvest: { stage: "growing" }, condition: 0.5 }).id, "watch");
  assert.equal(fieldStatus({ harvest: { stage: "growing" }, condition: 0.9, stress: "medium" }).id, "watch");
  assert.equal(fieldStatus({ harvest: { stage: "growing" }, condition: 0.9, stress: "low", health: "normal" }).id, "healthy");
});

test("recovery cost and units", () => {
  const cost = recoveryCost(10);
  assert.deepEqual(cost.fast.total, [950, 2900]);
  assert.deepEqual(cost.full.total, [2600, 6200]);
  assert.equal(convertArea(10, "mu"), 150);
  assert.ok(Math.abs(convertArea(48.6, "acres") - 120.1) < 0.05);
});
