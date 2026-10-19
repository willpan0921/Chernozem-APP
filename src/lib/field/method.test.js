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
  READY_MAX_DAYS,
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

test("a field flat at the ready level for months is harvested, not ready (real Pampas soy, Earth Engine)", () => {
  // Field 9 near -34.90, -60.95 (Buenos Aires province): peak 0.84 on
  // 2026-01-02, down to 0.32 by May 10, then flat at 0.30-0.56 (stubble,
  // weeds) to October. It read "Ready to harvest" 275 days after the peak.
  const curve = "251002:54 251004:49 251007:43 251009:38 251011:34 251014:32 251029:30 251031:28 251101:27 251113:37 251118:46 251123:42 251126:36 251128:36 251203:42 251206:45 251210:50 251216:65 251218:64 251223:78 251226:83 251228:82 251230:80 251231:81 260102:84 260105:83 260112:78 260115:79 260117:79 260120:79 260122:77 260125:66 260127:75 260130:74 260201:73 260206:80 260211:78 260214:77 260221:66 260224:73 260226:67 260301:68 260308:59 260311:61 260313:56 260316:54 260318:58 260323:54 260326:59 260331:60 260405:60 260410:62 260412:59 260422:57 260425:57 260427:56 260430:45 260502:46 260510:32 260512:31 260515:31 260517:32 260520:30 260522:30 260530:31 260611:40 260614:43 260616:38 260619:42 260626:36 260629:34 260701:32 260708:30 260726:43 260729:40 260807:56 260810:51 260823:47 260828:47 260830:40 260902:40 260904:48 260907:46 260914:43 260916:41 260917:40 260919:42 260922:43 261004:42";
  const points = curve.split(" ").map((item) => {
    const [d, v] = item.split(":");
    return { date: `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`, ndvi: Number(v) / 100 };
  });
  const stage = harvestStage(points, "2026-10-19");
  // The soy was cut when it reached the ready level (May 10); the August
  // green-up to 0.56 is a new cycle (a winter crop), read on its own.
  assert.equal(stage.stage, "growing");
  const cut = harvestStage(points.filter((p) => p.date <= "2026-07-08"), "2026-07-10");
  assert.equal(cut.stage, "harvested");
  assert.equal(cut.harvestedOn, "2026-05-10");
  // The same curve cut at mid-May (a week at the ready level) is still ready.
  const early = harvestStage(points.filter((p) => p.date <= "2026-05-17"), "2026-05-18");
  assert.equal(early.stage, "ready");
  assert.ok(READY_MAX_DAYS >= 21 && READY_MAX_DAYS <= 45);
});

test("a full second crop after an early harvest is read as its own season", () => {
  // Barley harvested late June, then a second crop that greens up to 0.78.
  const points = [
    ["2026-03-01", 0.4], ["2026-04-01", 0.65], ["2026-05-01", 0.82], ["2026-06-01", 0.6], ["2026-06-15", 0.45],
    ["2026-06-25", 0.2], ["2026-07-10", 0.25], ["2026-07-25", 0.4], ["2026-08-10", 0.6], ["2026-08-25", 0.74], ["2026-09-05", 0.78],
  ].map(([date, ndvi]) => ({ date, ndvi }));
  assert.equal(harvestStage(points, "2026-09-07").stage, "growing");
});

test("a cereal that dried down to bare soil is harvested, even with no sharp drop and a new crop coming up", () => {
  // Real shape, Beauce, France (2026): winter wheat, peak in May, dry-down
  // in June, bare from July to September, the next crop emerging in October.
  const dates = ["2026-04-14", "2026-05-09", "2026-05-27", "2026-06-13", "2026-06-18", "2026-06-20", "2026-06-23", "2026-06-28", "2026-07-08", "2026-08-10", "2026-09-14", "2026-10-01", "2026-10-06", "2026-10-14"];
  const ndvi = [0.86, 0.909, 0.899, 0.571, 0.429, 0.324, 0.261, 0.21, 0.172, 0.14, 0.135, 0.25, 0.299, 0.409];
  const stage = harvestStage(dates.map((date, i) => ({ date, ndvi: ndvi[i] })), "2026-10-19");
  assert.equal(stage.stage, "harvested");
  assert.equal(stage.harvestedOn, "2026-06-23");
  // A dry crop still standing just above bare soil stays "ready".
  const standing = harvestStage(["2026-06-24", "2026-08-03", "2026-09-07", "2026-09-29", "2026-10-07", "2026-10-12"].map((date, i) => ({ date, ndvi: [0.848, 0.733, 0.437, 0.333, 0.333, 0.35][i] })), "2026-10-19");
  assert.equal(standing.stage, "ready");
});

test("a decline too slow to be a dry-down is still growing (a cut forage crop that grew back)", () => {
  // Real shape, Nakuru, Kenya (2026): green in March, cut in June (down to
  // 0.36, not bare), grown back to 0.78 by late August, fading slowly in October.
  const dates = ["2026-03-21", "2026-04-30", "2026-06-04", "2026-06-14", "2026-06-19", "2026-07-14", "2026-08-25", "2026-09-14", "2026-09-27", "2026-10-04", "2026-10-12", "2026-10-17"];
  const ndvi = [0.875, 0.84, 0.7, 0.36, 0.37, 0.61, 0.77, 0.757, 0.741, 0.684, 0.66, 0.663];
  const stage = harvestStage(dates.map((date, i) => ({ date, ndvi: ndvi[i] })), "2026-10-19");
  assert.equal(stage.stage, "growing");
  assert.equal(stage.daysToReady ?? null, null);
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

test("away from any war, radar change alone is not damage; unusual fire with radar change is", () => {
  // Real data, Beauce, France (2026-10-19): 38% of a peaceful field changed on radar (ploughing, a new crop).
  assert.equal(damageDetected({ radarChangedShare: 0.38, excessFires: 0, atWar: false }), false);
  assert.equal(damageDetected({ radarChangedShare: 0.38, excessFires: 0, atWar: true }), true);
  assert.equal(damageDetected({ radarChangedShare: 0.38, excessFires: 0 }), true, "left out = at war (older analyses)");
  // A field that really burnt: fires above the usual rate AND radar change.
  assert.equal(damageDetected({ radarChangedShare: 0.06, excessFires: 4, atWar: false }), true);
  // The health index never decides it.
  assert.equal(damageDetected({ radarChangedShare: 0.01, excessFires: 4, chiDrop: 0.3, atWar: false }), false);
  assert.equal(damageDetected({ chiDrop: 0.5, atWar: false }), false);
  assert.equal(damagedArea({ radarChangedShare: 0.38, excessFires: 0, atWar: false }, 50), null);
  assert.equal(damagedArea({ radarChangedShare: 0.1, excessFires: 5, atWar: false }, 50), 5);
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

// ---------------------------------------------------------------------------
// Stress v2, pest risk, harvest v2 (FINAL-SPEC sections 2, 3, 7.11, 7.12)
// ---------------------------------------------------------------------------
import {
  combineHarvestEstimate,
  fieldCondition,
  greenUpDate,
  hasCrop,
  DRIED_DOWN_LABEL,
  STRESSED_CONDITION_MAX,
  stressApplies,
  stressExemption,
  unknownCropHarvest,
  hourlyRiskInputs,
  isStandingDry,
  ndre,
  ndyi,
  pestRisk,
  pestRiskLine,
  pixelStress,
  radarHarvest,
  radarForHarvest,
  readyReachedOn,
  redEdgeFound,
  stressCause,
  stressSummary,
  NO_CROP_LABEL,
  RED_EDGE_RULES,
  STRESS_CAUSES,
} from "./method.js";

test("red edge: NDRE and NDYI, and the pixel rule (NDVI rule OR red-edge rule)", () => {
  assert.ok(Math.abs(ndre(0.4, 0.2) - 1 / 3) < 1e-9);
  assert.equal(ndre(0, 0), null);
  assert.ok(Math.abs(ndyi(0.1, 0.06) - 0.25) < 1e-9);
  assert.deepEqual(RED_EDGE_RULES, { belowFieldMedian: 0.06, belowNormal: 0.05 });
  // NDVI looks fine, the red edge has dropped: caught early.
  const early = pixelStress({ ndvi: 0.7, fieldMedianNdvi: 0.72, normalNdvi: 0.7, ndre: 0.28, fieldMedianNdre: 0.36, normalNdre: 0.35 });
  assert.deepEqual(early, { stressed: true, byNdvi: false, byRedEdge: true, redEdgeOnly: true });
  // Weaker than the field but normal for this spot: not stressed.
  assert.equal(pixelStress({ ndvi: 0.7, fieldMedianNdvi: 0.72, normalNdvi: 0.7, ndre: 0.28, fieldMedianNdre: 0.36, normalNdre: 0.3 }).stressed, false);
  const both = pixelStress({ ndvi: 0.5, fieldMedianNdvi: 0.65, normalNdvi: 0.7, ndre: 0.2, fieldMedianNdre: 0.36, normalNdre: 0.35 });
  assert.equal(both.byNdvi && both.byRedEdge && !both.redEdgeOnly, true);
  // Without red-edge bands the NDVI rule still works.
  assert.equal(pixelStress({ ndvi: 0.5, fieldMedianNdvi: 0.65, normalNdvi: 0.7 }).stressed, true);
  assert.equal(redEdgeFound(0.02), true);
  assert.equal(redEdgeFound(0.002), false);
});

test("likely cause: dry when NDWI is 0.05 or more below normal, else not water", () => {
  assert.equal(stressCause(-0.08), "dry");
  assert.equal(stressCause(-0.05), "dry");
  assert.equal(stressCause(-0.02), "other");
  assert.equal(stressCause(null), null);
  assert.equal(STRESS_CAUSES.dry.label, "Dry patch");
  assert.match(STRESS_CAUSES.other.label, /pests or disease/);
});

test("no crop, no stress and no condition (harvested or not sown)", () => {
  assert.equal(hasCrop("harvested"), false);
  assert.equal(hasCrop({ stage: "notSown" }), false);
  assert.equal(hasCrop("growing"), true);
  assert.equal(NO_CROP_LABEL, "No crop");
  assert.deepEqual(stressSummary({ stage: "harvested", share: 0.3, ndwiAnomaly: -0.1 }), { applies: false, reason: "noCrop", share: null, level: null, cause: null, redEdge: false });
  assert.deepEqual(stressSummary({ stage: "growing", share: 0.08, ndwiAnomaly: -0.01, redEdgeOnlyShare: 0.03 }), { applies: true, reason: null, share: 0.08, level: "medium", cause: "other", redEdge: true });
  assert.deepEqual(stressSummary({ stage: "growing", share: 0, ndwiAnomaly: -0.2 }), { applies: true, reason: null, share: 0, level: "low", cause: null, redEdge: false });
  // A harvested field is "Harvested", never "Poor".
  assert.deepEqual(fieldCondition({ stage: "harvested", health: 0.1, water: 0.1, stress: 0.5 }), { score: null, class: null });
  assert.deepEqual(fieldCondition({ stage: { stage: "notSown" }, health: 1, water: 1, stress: 0 }), { score: null, class: null });
  assert.deepEqual(fieldCondition({ stage: "growing", health: 1, water: 1, stress: 0 }), { score: 1, class: "great" });
  assert.equal(fieldCondition({ stage: "growing", health: 1, water: 1, stress: 0, damage: { detected: true } }).class, "fair");
  assert.equal(fieldStatus({ harvest: { stage: "harvested" }, condition: null }).id, "harvested");
});

test("a crop dried down for harvest is not read for stress, and high stress is never 'Very good'", () => {
  // Real case, Iowa Field 13 (2026-10-19): ready, NDVI 0.40, "Stress High ·
  // Dry patch" next to normal water and a "Very good" condition.
  assert.equal(DRIED_DOWN_LABEL, "Dried down");
  assert.equal(stressExemption("ready"), "driedDown");
  assert.equal(stressExemption({ stage: "ready", standingDry: true }), "driedDown");
  assert.equal(stressExemption({ stage: "growing", dryDown: "dry" }), "driedDown");
  assert.equal(stressExemption({ stage: "growing", dryDown: "fading" }), null);
  assert.equal(stressExemption("ripening"), null);
  assert.equal(stressExemption("harvested"), "noCrop");
  assert.equal(stressApplies("growing"), true);
  assert.equal(stressApplies("ready"), false);
  assert.deepEqual(stressSummary({ stage: "ready", share: 0.3, ndwiAnomaly: -0.1 }), { applies: false, reason: "driedDown", share: null, level: null, cause: null, redEdge: false });
  assert.equal(stressSummary({ stage: "growing", dryDown: "dry", share: 0.3 }).reason, "driedDown");
  // A ready field still has a condition (its crop is there).
  assert.equal(fieldCondition({ stage: "ready", health: 1, water: 1, stress: null }).class, "great");
  // 15 % or more stressed: held under "Very good".
  const stressed = fieldCondition({ stage: "growing", health: 1, water: 1, stress: 0.2 });
  assert.equal(stressed.score, STRESSED_CONDITION_MAX);
  assert.equal(stressed.class, "good");
  assert.equal(fieldCondition({ stage: "growing", health: 1, water: 1, stress: 0.1 }).class, "great");
  assert.equal(fieldCondition({ stage: "growing", health: 0.2, water: 0.2, stress: 0.2 }).class, "poor");
});

test("a crop that is not known gets no harvest date: only what was measured", () => {
  // Real shape, the field drawn next to the Kupiansk demo farm (probably
  // grass): peak 0.88 on 29 June, 0.49 on 12 October -> "ripening, ready
  // about Oct 22" before this rule.
  const fading = { stage: "ripening", daysToReady: 3, peak: 0.88, peakDate: "2026-06-29", current: 0.49, readyLevel: 0.44, basis: "dry-down", lastDate: "2026-10-12" };
  const a = unknownCropHarvest(fading);
  assert.equal(a.stage, "growing");
  assert.equal(a.daysToReady, null);
  assert.equal(a.basis, null);
  assert.equal(a.dryDown, "fading");
  assert.equal(a.cropUnknown, true);
  assert.equal(a.peakDate, "2026-06-29");
  // Down at the ready level: "dry", still no date and never "ready".
  const dry = unknownCropHarvest({ stage: "ready", daysToReady: 0, peak: 0.66, current: 0.31, readyLevel: 0.36, basis: "dry-down", standingDry: true });
  assert.equal(dry.stage, "growing");
  assert.equal(dry.dryDown, "dry");
  assert.equal(dry.standingDry, false);
  assert.equal(dry.daysToReady, null);
  // Without a ready level: worked out from the peak.
  assert.equal(unknownCropHarvest({ stage: "ready", peak: 0.8, current: 0.5 }).dryDown, "fading");
  // Measurements stay as they are.
  assert.equal(unknownCropHarvest({ stage: "harvested", basis: "radar", harvestedOn: "2026-09-20" }).basis, "radar");
  assert.equal(unknownCropHarvest({ stage: "harvested", basis: "images" }).stage, "harvested");
  assert.equal(unknownCropHarvest({ stage: "notSown" }).stage, "notSown");
  const green = unknownCropHarvest({ stage: "growing", daysToReady: 40, basis: "heat units" });
  assert.equal(green.daysToReady, null);
  assert.equal(green.basis, null);
  assert.equal(green.dryDown, null);
  // No status says "Ready" or "Harvest soon" for it.
  assert.notEqual(fieldStatus({ harvest: a, condition: 0.9 }).id, "harvestSoon");
  assert.notEqual(fieldStatus({ harvest: dry, condition: 0.9 }).id, "ready");
});

// 14 days of hourly weather from 2026-10-12: `wet` hours a day at 95 %
// humidity and 15 °C, the rest at 60 %; daily mean `mean` °C.
function hourly({ wet = 0, mean = 15, days = 14, from = 12 } = {}) {
  const time = [];
  const temperature_2m = [];
  const relative_humidity_2m = [];
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const day = new Date(Date.UTC(2026, 9, from + d)).toISOString().slice(0, 10);
      time.push(`${day}T${String(h).padStart(2, "0")}:00`);
      const isWet = h < wet;
      temperature_2m.push(isWet ? 15 : mean + (mean - 15) * (wet / (24 - wet)));
      relative_humidity_2m.push(isWet ? 95 : 60);
    }
  }
  return { time, temperature_2m, relative_humidity_2m };
}

test("pest and disease risk from hourly weather (a forecast, not a detection)", () => {
  const high = pestRisk({ hourly: hourly({ wet: 3, mean: 18 }), stage: "growing" });
  assert.equal(high.basis.wetHours, 42);
  assert.ok(Math.abs(high.basis.gdd14 - 112) < 0.2, `gdd ${high.basis.gdd14}`);
  assert.deepEqual([high.disease, high.insects], ["high", "high"]);
  const medium = pestRisk({ hourly: hourly({ wet: 1, mean: 13 }) });
  assert.deepEqual([medium.disease, medium.insects], ["medium", "medium"]);
  const low = pestRisk({ hourly: hourly({ wet: 0, mean: 9 }), stage: "ripening" });
  assert.deepEqual([low.disease, low.insects, low.basis.gdd14], ["low", "low", 0]);
  // Wet but too cold or too hot for fungi does not count.
  const cold = hourly({ wet: 0, mean: 5 });
  cold.relative_humidity_2m = cold.relative_humidity_2m.map(() => 95);
  assert.equal(pestRisk({ hourly: cold }).disease, "low");
  // Only while a crop is growing or ripening.
  assert.equal(pestRisk({ hourly: hourly({ wet: 3 }), stage: "harvested" }), null);
  assert.equal(pestRisk({ hourly: hourly({ wet: 3 }), stage: { stage: "notSown" } }), null);
  assert.equal(pestRisk({ hourly: { time: [] } }), null);
  // With today: the 7 days before it and the 7 from it.
  const longer = hourlyRiskInputs(hourly({ wet: 2, days: 21, from: 5 }), "2026-10-19");
  assert.equal(longer.days, 14);
  assert.equal(longer.wetHours14, 28);
  assert.equal(pestRiskLine(high), "Disease risk and insect activity high this week");
  assert.equal(pestRiskLine({ disease: "high", insects: "low" }), "Disease risk high this week");
  assert.equal(pestRiskLine({ disease: "low", insects: "medium" }), "Insect activity medium this week");
  assert.equal(pestRiskLine(null), null);
});

test("green-up date: where the curve passes a quarter of the way from its low to its peak", () => {
  // Low 0.2, peak 0.8: level 0.35, between 0.3 (Apr 21) and 0.4 (May 1).
  assert.equal(greenUpDate(season([0.2, 0.25, 0.3, 0.4, 0.6, 0.8, 0.7])), "2026-04-26");
  // A winter low then spring regrowth: green-up after the low.
  const winter = [["2025-10-15", 0.45], ["2025-12-01", 0.3], ["2026-02-01", 0.22], ["2026-03-15", 0.3], ["2026-04-01", 0.5], ["2026-05-01", 0.85]].map(([date, ndvi]) => ({ date, ndvi }));
  assert.equal(greenUpDate(winter), "2026-03-22");
  // Already green at the start, or never green: unknown.
  assert.equal(greenUpDate(season([0.6, 0.7, 0.8, 0.75])), null);
  assert.equal(greenUpDate(season([0.2, 0.22, 0.25])), null);
  assert.equal(greenUpDate(season([0.6, 0.7, 0.8, 0.75]), { maxBase: 0.65 }), "2026-04-06");
});

test("crop-specific ready level: a cereal is ready lower down than a row crop", () => {
  const curve = season([0.3, 0.5, 0.7, 0.82, 0.75, 0.6, 0.48, 0.42, 0.4]);
  assert.equal(harvestStage(curve, "2026-06-22").stage, "ready");
  assert.equal(harvestStage(curve, "2026-06-22", { readyShare: 0.25 }).stage, "ripening");
});

test("radar harvest: a VH drop of 3 dB or more between passes up to 24 days apart, after the peak, that stays", () => {
  const vh = (text) => text.split(" ").map((item) => ({ date: `2026-${item.split(":")[0]}`, vh: Number(item.split(":")[1]) }));
  const cut = radarHarvest(vh("07-20:-13 08-01:-13.5 09-10:-15 09-22:-15.5 10-02:-20 10-08:-20.4"), "2026-07-28");
  assert.equal(cut.harvestedOn, "2026-10-02");
  assert.equal(cut.dropDb, 4.5);
  assert.equal(cut.passesAfterPeak, 5);
  assert.equal(cut.lastPass, "2026-10-08");
  // Before the peak, too far apart, too small, or back up again (frost): no harvest.
  assert.equal(radarHarvest(vh("06-01:-14 06-10:-18 08-01:-14"), "2026-07-28").harvestedOn, null);
  assert.equal(radarHarvest(vh("08-01:-14 08-30:-18"), "2026-07-28").harvestedOn, null);
  // One missed acquisition (13 days, or 24) still shows the cut.
  assert.equal(radarHarvest(vh("09-27:-15 10-10:-19 10-16:-19.5"), "2026-07-28").harvestedOn, "2026-10-10");
  assert.equal(radarHarvest(vh("09-15:-15 10-09:-19 10-15:-19.2"), "2026-07-28").harvestedOn, "2026-10-09");
  assert.equal(radarHarvest(vh("08-01:-14 08-10:-16"), "2026-07-28").harvestedOn, null);
  assert.equal(radarHarvest(vh("08-01:-14 08-10:-18 08-20:-14.5"), "2026-07-28").harvestedOn, null);
  // Ascending and descending passes on the same day are averaged.
  assert.equal(radarHarvest([...vh("08-01:-14 08-10:-18"), { date: "2026-08-10", vh: -17 }], "2026-07-28").dropDb, 3.5);
  assert.equal(radarHarvest([], null).passesAfterPeak, 0);
});

// Iowa soybean: dried down fast in September (NDVI to 0.24), and still
// standing on 19 October.
const IOWA_SOY = [
  ["2026-07-15", 0.7], ["2026-07-30", 0.8], ["2026-08-10", 0.85], ["2026-08-25", 0.8], ["2026-09-05", 0.65],
  ["2026-09-15", 0.45], ["2026-09-22", 0.28], ["2026-10-01", 0.25], ["2026-10-12", 0.24],
].map(([date, ndvi]) => ({ date, ndvi }));
const VH_STANDING = ["08-10:-14", "08-22:-14.5", "09-03:-15", "09-15:-15.8", "09-27:-16.2", "10-09:-16.5", "10-15:-16.4"].map((x) => ({ date: `2026-${x.slice(0, 5)}`, vh: Number(x.slice(6)) }));

test("standing dry vs harvested: NDVI at bare-soil level without a radar drop is still standing", () => {
  const optical = harvestStage(IOWA_SOY, "2026-10-19");
  assert.equal(optical.stage, "harvested");
  const radar = radarHarvest(VH_STANDING, optical.peakDate);
  assert.equal(radar.harvestedOn, null);
  assert.equal(isStandingDry({ ndvi: optical, radar, crop: "corn", today: "2026-10-19" }), true);
  // A soybean drops its leaves: the radar cannot tell it is standing.
  assert.equal(isStandingDry({ ndvi: optical, radar, crop: "soybean", today: "2026-10-19" }), false);
  const standing = combineHarvestEstimate({ ndvi: optical, radar, crop: "corn", today: "2026-10-19" });
  assert.equal(standing.stage, "ready");
  assert.equal(standing.daysToReady, 0);
  assert.equal(standing.standingDry, true);
  assert.equal(standing.basis, "radar");
  assert.equal(standing.harvestedOn, null);
  assert.equal(fieldStatus({ harvest: standing, condition: null }).id, "ready");

  // With the drop: harvested on the radar date.
  const cutVh = [...VH_STANDING.slice(0, 5), { date: "2026-10-09", vh: -20.5 }, { date: "2026-10-15", vh: -20.8 }];
  const cut = combineHarvestEstimate({ ndvi: optical, radar: radarHarvest(cutVh, optical.peakDate), crop: "corn", today: "2026-10-19" });
  assert.equal(cut.stage, "harvested");
  assert.equal(cut.radarHarvestOn, "2026-10-09");
  assert.equal(cut.harvestedOn, "2026-10-09");
  assert.equal(cut.basis, "radar");
  assert.equal(cut.standingDry, false);

  // A cereal (not tall), or radar that has not looked since: optical stands.
  assert.equal(combineHarvestEstimate({ ndvi: optical, radar, crop: "winterCereal", today: "2026-10-19" }).stage, "harvested");
  const blind = radarHarvest(VH_STANDING.slice(0, 3), optical.peakDate);
  assert.equal(combineHarvestEstimate({ ndvi: optical, radar: blind, crop: "corn", today: "2026-10-19" }).stage, "harvested");
  // Low for months with no radar drop: left harvested.
  assert.equal(isStandingDry({ ndvi: optical, radar, crop: "corn", today: "2026-12-30" }), false);
  // No radar at all: unchanged.
  const plain = combineHarvestEstimate({ ndvi: optical, crop: "corn", today: "2026-10-19" });
  assert.equal(plain.stage, "harvested");
  // Harvested by the optical record: the basis says so.
  assert.equal(plain.basis, "images");
  assert.equal(plain.radarHarvestOn, null);
});

test("leaf drop: a soybean's radar drop counts as the cut only after its leaves are down", () => {
  // Real shape, Iowa soybean 2026 (60-field run, Field 1): NDVI 0.78 on 10
  // September, 0.27 on 2 October; VH -14.7 dB on 27 September, -21.7 on 9
  // October, while USDA had 31 % of Iowa's soybeans cut on 11 October.
  const curve = [["2026-08-10", 0.88], ["2026-08-25", 0.86], ["2026-09-10", 0.78], ["2026-10-02", 0.27], ["2026-10-05", 0.23], ["2026-10-10", 0.23], ["2026-10-17", 0.19]].map(([date, ndvi]) => ({ date, ndvi }));
  const vh = ["09-03:-14.7", "09-15:-14", "09-27:-14.7", "10-09:-21.7", "10-14:-22.4"].map((x) => ({ date: `2026-${x.slice(0, 5)}`, vh: Number(x.slice(6)) }));
  // Seen yellow on 2 October (no guess across the cloudy gap): leaves down a week later.
  assert.equal(readyReachedOn(curve, { readyShare: 0.35 }), "2026-10-02");
  const down = "2026-10-09";
  const optical = harvestStage(curve, "2026-10-19", { readyShare: 0.35 });
  assert.equal(optical.stage, "harvested");
  const soy = radarForHarvest({ vhSeries: vh, season: curve, peakDate: optical.peakDate, crop: "soybean" });
  assert.equal(soy.leavesDownOn, down);
  assert.equal(soy.radar.harvestedOn, null, "the drop spans the leaves falling");
  const est = combineHarvestEstimate({ ndvi: optical, radar: soy.radar, crop: "soybean", today: "2026-10-19", leavesDownOn: soy.leavesDownOn });
  assert.equal(est.stage, "ready");
  assert.equal(est.leafDrop, true);
  assert.equal(est.basis, "dry-down");
  // Corn keeps its leaves: the same drop is the cut.
  const corn = radarForHarvest({ vhSeries: vh, season: curve, peakDate: optical.peakDate, crop: "corn" });
  assert.equal(corn.leavesDownOn, null);
  assert.equal(corn.radar.harvestedOn, "2026-10-09");
  // A soybean whose dry-down was never seen: no radar drop counts.
  assert.equal(radarForHarvest({ vhSeries: vh, season: curve.slice(0, 3), peakDate: "2026-08-10", crop: "soybean" }).radar.harvestedOn, null);
  // Long after the leaves came down: harvested.
  assert.equal(combineHarvestEstimate({ ndvi: optical, radar: soy.radar, crop: "soybean", today: "2026-11-15", leavesDownOn: soy.leavesDownOn }).stage, "harvested");
  assert.equal(radarHarvest(vh, "2026-08-10", { notBefore: "2026-10-09" }).harvestedOn, null);
  assert.equal(radarHarvest(vh, "2026-08-10", { notBefore: "2026-09-27" }).harvestedOn, "2026-10-09");
});

test("radar marks a harvest the clouds hid", () => {
  const ndvi = { stage: "ripening", daysToReady: 12, peak: 0.85, peakDate: "2026-08-10", current: 0.6, lastDate: "2026-09-10" };
  const radar = { harvestedOn: "2026-10-01", dropDb: 4, passesAfterPeak: 6, lastPass: "2026-10-13" };
  const cloudy = combineHarvestEstimate({ ndvi, radar, crop: "corn", today: "2026-10-19" });
  assert.equal(cloudy.stage, "harvested");
  assert.equal(cloudy.radarHarvestOn, "2026-10-01");
  // A recent clear pass that still shows the crop: the drop is not trusted.
  const clear = combineHarvestEstimate({ ndvi: { ...ndvi, lastDate: "2026-10-15" }, radar, crop: "corn", today: "2026-10-19" });
  assert.equal(clear.stage, "ripening");
});

test("dry-down vs heat units: basis dry-down, heat units or both", () => {
  const gdd = { accumulated: 1300, needed: 1450, base: 10, daysToReady: 14 };
  const ripening = { stage: "ripening", daysToReady: 10, peak: 0.85, peakDate: "2026-08-01", current: 0.6, lastDate: "2026-09-10" };
  const both = combineHarvestEstimate({ ndvi: ripening, gdd, crop: "corn", today: "2026-09-12" });
  assert.equal(both.basis, "both");
  assert.equal(both.daysToReady, 10); // the visible dry-down wins
  assert.deepEqual(both.gdd, { accumulated: 1300, needed: 1450, base: 10 });
  assert.equal(combineHarvestEstimate({ ndvi: ripening, gdd: { ...gdd, daysToReady: 40 }, crop: "corn", today: "2026-09-12" }).basis, "dry-down");
  assert.equal(combineHarvestEstimate({ ndvi: ripening, crop: "corn", today: "2026-09-12" }).basis, "dry-down");
  // Still green: the heat units give the estimate.
  const growing = { stage: "growing", daysToReady: null, peak: 0.85, peakDate: "2026-08-01", current: 0.84, lastDate: "2026-08-20" };
  const heat = combineHarvestEstimate({ ndvi: growing, gdd: { ...gdd, daysToReady: 9 }, crop: "corn", today: "2026-08-22" });
  assert.equal(heat.basis, "heat units");
  assert.equal(heat.daysToReady, 9);
  assert.equal(heat.stage, "growing");
  assert.equal(fieldStatus({ harvest: heat, condition: 0.9 }).id, "harvestSoon");
  assert.equal(combineHarvestEstimate({ ndvi: growing, gdd: { ...gdd, daysToReady: 0 }, crop: "corn", today: "2026-08-22" }).daysToReady, 1);
  // A heat-unit date far outside the crop's usual months is not used.
  assert.equal(combineHarvestEstimate({ ndvi: growing, gdd: { ...gdd, daysToReady: 200 }, crop: "corn", today: "2026-08-22" }).basis, null);
  // Growing with no heat units: no estimate, as before.
  const none = combineHarvestEstimate({ ndvi: growing, crop: "corn", today: "2026-08-22" });
  assert.equal(none.basis, null);
  assert.equal(none.daysToReady, null);
  assert.equal(fieldStatus({ harvest: none, condition: 0.9 }).id, "healthy");
  assert.equal(combineHarvestEstimate({ ndvi: { stage: "ready", daysToReady: 0 } }).basis, "dry-down");
  assert.equal(combineHarvestEstimate({}).stage, "unknown");
});

// Real data, Kupiansk demo farm, Field 3 (2026-10-19): peaked at 0.78 on
// 24 June, dried down slowly to 0.33-0.37 by mid September and stayed flat.
// Just above the spring-cereal ready level, flat: it used to read "growing"
// (Healthy, with a pest risk) four months after its peak.
const FIELD_3 = "03-08:0.23 03-10:0.20 03-11:0.25 03-13:0.24 03-16:0.20 03-21:0.23 03-23:0.23 04-02:0.18 04-05:0.27 04-12:0.30 04-25:0.37 05-05:0.37 05-07:0.38 05-09:0.42 05-10:0.44 05-19:0.53 05-20:0.55 05-22:0.56 06-08:0.71 06-11:0.71 06-21:0.76 06-24:0.78 07-01:0.77 07-04:0.74 07-08:0.74 07-28:0.65 08-03:0.64 08-05:0.58 08-07:0.55 08-08:0.55 08-10:0.55 08-13:0.56 08-15:0.54 08-17:0.50 08-18:0.50 08-23:0.46 08-25:0.44 08-30:0.43 09-02:0.40 09-07:0.40 09-09:0.40 09-12:0.35 09-17:0.36 09-19:0.33 09-26:0.33 09-29:0.35 10-02:0.35 10-07:0.34 10-09:0.34 10-12:0.37"
  .split(" ")
  .map((item) => ({ date: `2026-${item.slice(0, 5)}`, ndvi: Number(item.slice(6)) }));

test("long after the peak and far below it, a field is no longer 'growing'", () => {
  const field3 = harvestStage(FIELD_3, "2026-10-19", { readyShare: 0.25 });
  assert.equal(field3.stage, "harvested");
  assert.equal(field3.harvestedOn, "2026-08-23"); // first pass below 0.6 x peak
  // The same shape got low only recently: ready, not harvested.
  const recent = FIELD_3.filter((p) => p.date < "2026-08-10").concat(["08-20", "08-27", "09-01", "09-05"].map((day, i) => ({ date: `2026-${day}`, ndvi: i < 2 ? 0.45 : 0.46 })));
  assert.equal(harvestStage(recent, "2026-09-06", { readyShare: 0.25 }).stage, "ready");
  // Still near the peak 60+ days on (a long-season crop): growing.
  const late = FIELD_3.filter((p) => p.date <= "2026-07-08").concat([{ date: "2026-08-30", ndvi: 0.7 }, { date: "2026-09-05", ndvi: 0.69 }]);
  assert.equal(harvestStage(late, "2026-09-06", { readyShare: 0.25 }).stage, "growing");
  // A new season growing after the low (NEW_SEASON_PEAK) is left to the
  // other rules.
  const regrow = FIELD_3.concat([{ date: "2026-10-16", ndvi: 0.45 }, { date: "2026-10-18", ndvi: 0.5 }]).map((p) => (p.date === "2026-09-02" ? { ...p, ndvi: 0.56 } : p));
  assert.notEqual(harvestStage(regrow, "2026-10-19", { readyShare: 0.25 }).stage, "ready");
  // Weak regrowth after the low (weeds, a new sowing at 0.45) does not make
  // the old crop "growing" again. Real field drawn next to the demo farm
  // (Kupiansk, 2026-10-19).
  const drawn = [["06-16", 0.72], ["06-24", 0.72], ["07-14", 0.65], ["07-31", 0.62], ["08-07", 0.51], ["08-17", 0.42], ["08-30", 0.35], ["09-12", 0.31], ["09-26", 0.28], ["10-02", 0.40], ["10-09", 0.41], ["10-12", 0.45]].map(([d, ndvi]) => ({ date: `2026-${d}`, ndvi }));
  const weak = harvestStage(drawn, "2026-10-19");
  assert.equal(weak.stage, "harvested");
  assert.equal(weak.harvestedOn, "2026-08-17");
});

// ---------------------------------------------------------------------------
// No crop is never "Healthy" (FINAL-SPEC 10.1)
// ---------------------------------------------------------------------------
import { FIELD_STATUSES, MOWN_LABEL, STATUS_GROUPS, noCropState, pestRiskApplies, statusGroup, stressCauseShown } from "./method.js";

test("fallow, dried down, harvested and not sown: no condition, never Healthy", () => {
  const fallow = { stage: "growing", fallow: true, cropUnknown: true, dryDown: null };
  const dried = { stage: "growing", cropUnknown: true, dryDown: "dry" };
  const fading = { stage: "growing", cropUnknown: true, dryDown: "fading" };
  assert.equal(noCropState(fallow), "fallow");
  assert.equal(noCropState(dried), "driedDown");
  assert.equal(noCropState(fading), null);
  assert.equal(noCropState("harvested"), "harvested");
  assert.equal(noCropState({ stage: "notSown" }), "notSown");
  assert.equal(noCropState({ stage: "ready" }), null, "a known crop ready to harvest has a crop");
  for (const harvest of [fallow, dried, { stage: "harvested" }, { stage: "notSown" }]) {
    assert.deepEqual(fieldCondition({ stage: harvest, health: 1, water: 1, stress: 0 }), { score: null, class: null });
  }
  assert.equal(fieldCondition({ stage: fading, health: 1, water: 1, stress: 0 }).class, "great");
  assert.deepEqual(fieldStatus({ harvest: fallow, condition: null }), { id: "fallow", label: "Fallow or grass", tone: null });
  assert.deepEqual(fieldStatus({ harvest: dried, condition: null }), { id: "driedDown", label: "Dried down", tone: null });
  assert.equal(fieldStatus({ harvest: fading, condition: 0.9 }).id, "healthy");
  // Damage still comes first.
  assert.equal(fieldStatus({ damage: { detected: true }, harvest: fallow, condition: null }).id, "recovery");
});

test("a radar drop on a fallow field is a cut or mowing, not a harvest", () => {
  const mown = unknownCropHarvest({ stage: "harvested", basis: "radar", harvestedOn: "2026-09-09", radarHarvestOn: "2026-09-09" }, { fallow: true });
  assert.equal(mown.mown, true);
  assert.equal(mown.stage, "harvested");
  assert.equal(MOWN_LABEL, "Cut or mown");
  assert.equal(fieldStatus({ harvest: mown, condition: null }).id, "fallow");
  assert.equal(unknownCropHarvest({ stage: "harvested", basis: "radar" }).mown, undefined, "not fallow: a harvest");
});

test("status groups: growing, watch, recovery, noCrop; healthy is an alias of growing", () => {
  assert.deepEqual(Object.keys(STATUS_GROUPS), ["growing", "watch", "recovery", "noCrop"]);
  assert.deepEqual(STATUS_GROUPS.growing, ["healthy", "harvestSoon", "ready"]);
  assert.deepEqual(STATUS_GROUPS.noCrop, ["harvested", "notSown", "fallow", "driedDown"]);
  assert.equal(STATUS_GROUPS.healthy, STATUS_GROUPS.growing);
  // Every status is in exactly one group.
  for (const id of Object.keys(FIELD_STATUSES)) assert.equal(Object.values(STATUS_GROUPS).filter((ids) => ids.includes(id)).length, 1, id);
  assert.equal(statusGroup("fallow"), "noCrop");
  assert.equal(statusGroup("ready"), "growing");
  assert.equal(statusGroup("nope"), null);
});

test("pest risk only for a crop growing, never fallow, possibly grass or dried down", () => {
  assert.equal(pestRiskApplies("growing"), true);
  assert.equal(pestRiskApplies({ stage: "ripening" }), true);
  assert.equal(pestRiskApplies({ stage: "ready" }), false);
  assert.equal(pestRiskApplies({ stage: "growing", fallow: true }), false);
  assert.equal(pestRiskApplies({ stage: "growing", cropUnknown: true, dryDown: "dry" }), false);
  assert.equal(pestRiskApplies({ stage: "growing", cropUnknown: true, dryDown: "fading" }), true);
  assert.equal(pestRiskApplies("growing", { id: "unknown", possiblyFallow: true }), false);
});

test("medium or high stress with no mapped patch is spread across the field", () => {
  assert.equal(stressCauseShown({ level: "high", cause: "dry", patches: [] }), "spread");
  assert.equal(stressCauseShown({ level: "medium", cause: "other" }), "spread");
  assert.equal(stressCauseShown({ level: "medium", cause: "dry", patches: [{ lat: 1, lon: 2 }] }), "dry");
  // Low stress names no cause.
  assert.equal(stressCauseShown({ level: "low", cause: "other", patches: [] }), null);
  assert.equal(stressCauseShown({ level: "low", cause: "dry", patches: [{ lat: 1, lon: 2 }] }), null);
  assert.equal(STRESS_CAUSES.spread.label, "Spread across the field");
});

// Polish round 2: an unknown crop that is possibly grass is "Crop unclear".
test("fieldStatus: possibly grass with no crop known is unclear, not growing well", () => {
  const harvest = { stage: "growing", cropUnknown: true, dryDown: "fading" };
  assert.equal(fieldStatus({ harvest, condition: 0.9, stress: "low", health: "normal", possiblyFallow: true }).id, "unclear");
  assert.equal(fieldStatus({ harvest, condition: 0.9, stress: "low", health: "normal" }).label, "Growing well");
  // A known crop is never "unclear".
  assert.equal(fieldStatus({ harvest: { stage: "growing" }, condition: 0.9, possiblyFallow: true }).id, "healthy");
  assert.equal(statusGroup("unclear"), "watch");
});
