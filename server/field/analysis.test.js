// WHAT THIS FILE DOES
// Tests for server/field/analysis.js: a data source's readings become the
// finished analysis by the rules of src/lib/field/method.js. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes analysis.js.

import test from "node:test";
import assert from "node:assert/strict";
import { cropForRules, cropSourceOf, finishAnalysis, harvestWindow, peakMonthFromHistory, pestRiskFrom, stripForList } from "./analysis.js";
import { KUPIANSK_FALLOW, KUPIANSK_FALLOW_SLOW, KUPIANSK_UNKNOWN } from "../../src/lib/field/crops.test-data.js";

const field = { id: "fld-test0001", name: "Field 1", areaHa: 40, geometry: { type: "Polygon", coordinates: [[[37.5, 49.7], [37.51, 49.7], [37.51, 49.705], [37.5, 49.705], [37.5, 49.7]]] } };

function season(values, start = "2026-04-01", everyDays = 10) {
  const day0 = Date.parse(`${start}T00:00:00Z`);
  return values.map((ndvi, i) => ({ date: new Date(day0 + i * everyDays * 86400000).toISOString().slice(0, 10), ndvi, ndwi: ndvi - 0.4, clearPct: 90 }));
}

const base = {
  water: { ndwi: 0.2, normal: { low: 0.15, high: 0.3, median: 0.22 } },
  plantHealth: { ndvi: 0.7, normal: { low: 0.65, high: 0.8, median: 0.72 } },
  stress: { share: 0.02, patches: [] },
  damage: { radarChangedShare: 0, firesSinceWar: 0, chiDrop: 0.02 },
  soil: { chernozemProbability: 0.8 },
  season: season([0.3, 0.5, 0.7, 0.8, 0.82, 0.8, 0.79]),
  normalCurve: [{ day: "01-01", low: 0.2, high: 0.3, median: 0.25 }],
  zones: { west: 37.5, south: 49.7, east: 37.51, north: 49.705, cols: 2, rows: 1, values: [0.9, null] },
};

test("a healthy growing field", () => {
  const a = finishAnalysis({ field, raw: base, today: "2026-06-10", provider: "sample" });
  assert.equal(a.fieldId, field.id);
  assert.equal(a.provider, "sample");
  assert.equal(a.plantHealth.versus, "normal");
  assert.equal(a.water.versus, "normal");
  assert.ok(a.plantHealth.score > 0.9 && a.water.score > 0.9, "scores worked out when the source gave none");
  assert.equal(a.stress.level, "low");
  assert.equal(a.stress.stressedHa, 0.8);
  assert.equal(a.harvest.stage, "growing");
  assert.equal(a.harvest.window, null);
  assert.equal(a.condition.class, "great");
  assert.equal(a.status.id, "healthy");
  assert.equal(a.soil.soilTypeId, "chernozem");
  assert.equal(a.latestPass.date, a.season.at(-1).date);
  const listed = stripForList(a);
  assert.equal(listed.season, undefined);
  assert.equal(listed.zones, undefined);
  assert.equal(listed.normalCurve, undefined);
});

test("damage evidence makes the field Needs recovery, with its damaged area", () => {
  const raw = { ...base, damage: { radarChangedShare: 0.3, firesSinceWar: 1, chiDrop: 0.2 } };
  const a = finishAnalysis({ field, raw, today: "2026-06-10" });
  assert.equal(a.damage.detected, true);
  assert.equal(a.damage.damagedHa, 12);
  assert.equal(a.status.id, "recovery");
  assert.equal(a.status.label, "Needs recovery");
});

test("only fires above the normal rate count; the war comes from the data source or the field's place", () => {
  const iowa = { ...field, geometry: { type: "Polygon", coordinates: [[[-93.62, 42.03], [-93.61, 42.03], [-93.61, 42.035], [-93.62, 42.035], [-93.62, 42.03]]] } };
  // Yearly stubble burning backed by a soil-index drop: 8 fires, 8 usual.
  const raw = { ...base, damage: { radarChangedShare: 0.01, fires: 8, firesNormal: 8, excessFires: 0, since: "2024-10-18", chiDrop: 0.2 }, conflict: null };
  const a = finishAnalysis({ field: iowa, raw, today: "2026-10-18" });
  assert.equal(a.damage.detected, false);
  assert.deepEqual([a.damage.fires, a.damage.firesNormal, a.damage.excessFires, a.damage.since], [8, 8, 0, "2024-10-18"]);
  assert.equal(a.conflict, null);
  // The same fires above the usual rate are damage when the radar backs
  // them up (a field that burnt); away from a war the soil index does not.
  const b = finishAnalysis({ field: iowa, raw: { ...raw, damage: { ...raw.damage, excessFires: 6 } }, today: "2026-10-18" });
  assert.equal(b.damage.detected, false);
  const c = finishAnalysis({ field: iowa, raw: { ...raw, damage: { ...raw.damage, excessFires: 6, radarChangedShare: 0.08 } }, today: "2026-10-18" });
  assert.equal(c.damage.detected, true);
  // Radar change alone on a peaceful field (ploughing, a new crop) is not damage.
  const d = finishAnalysis({ field: iowa, raw: { ...raw, damage: { ...raw.damage, radarChangedShare: 0.38 } }, today: "2026-10-18" });
  assert.equal(d.damage.detected, false);
  assert.notEqual(d.status.id, "recovery");
  // An analysis saved before the war was stored: looked up from the field's centre.
  const old = finishAnalysis({ field, raw: base, today: "2026-10-18" });
  assert.equal(old.conflict.id, "ukraine-2022");
  assert.equal(old.conflict.since, "2022-02-24");
  assert.equal(finishAnalysis({ field: iowa, raw: base, today: "2026-10-18" }).conflict, null);
});

test("below-normal plant health and stress make it Watch", () => {
  const raw = { ...base, plantHealth: { ndvi: 0.5, normal: { low: 0.65, high: 0.8, median: 0.72 } }, stress: { share: 0.08 } };
  const a = finishAnalysis({ field, raw, today: "2026-06-10" });
  assert.equal(a.plantHealth.versus, "below");
  assert.equal(a.stress.level, "medium");
  assert.equal(a.status.id, "watch");
});

test("a ripening field gets a harvest window and is warned about rain inside it", () => {
  const raw = { ...base, season: season([0.3, 0.6, 0.8, 0.85, 0.8, 0.72, 0.65, 0.6], "2026-06-01", 7) };
  const today = "2026-07-28";
  const a = finishAnalysis({ field, raw, today, weather: { rain: { likely: true, from: "2026-08-16", to: "2026-08-17", mm: 12 } } });
  assert.equal(a.harvest.stage, "ripening");
  assert.ok(a.harvest.daysToReady > 0);
  assert.ok(a.harvest.window.from > today);
  assert.equal(a.harvest.basis, "dry-down");
  assert.equal(a.harvest.rainBefore, true);
  const dry = finishAnalysis({ field, raw, today, weather: { rain: null } });
  assert.equal(dry.harvest.rainBefore, false);
  const unknown = finishAnalysis({ field, raw, today, weather: null });
  assert.equal(unknown.harvest.rainBefore, null);
});

test("rain before the crop is ready does not count", () => {
  const result = harvestWindow({ stage: "ripening", daysToReady: 20 }, { rain: { likely: true, from: "2026-08-01", to: "2026-08-02" } }, "2026-07-30");
  assert.equal(result.window.from, "2026-08-19");
  assert.equal(result.rainBefore, false);
});

test("missing readings give unknown, not a crash", () => {
  const a = finishAnalysis({ field, raw: {}, today: "2026-06-10" });
  assert.equal(a.harvest.stage, "unknown");
  assert.equal(a.condition.score, null);
  assert.equal(a.status.id, "unknown");
  assert.equal(a.latestPass, null);
  assert.equal(a.zones, null);
});

const iowa = { id: "fld-iowa0001", name: "Field 2", areaHa: 30, geometry: { type: "Polygon", coordinates: [[[-93.62, 42.03], [-93.61, 42.03], [-93.61, 42.035], [-93.62, 42.035], [-93.62, 42.03]]] } };
const daysFrom = (start, count, fn) => Array.from({ length: count }, (_, i) => fn(new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10), i));

test("no crop, no stress: a harvested field says No crop, has no condition and no pest risk", () => {
  const raw = { ...base, stress: { share: 0.3, ndwiAnomaly: -0.1, redEdgeOnlyShare: 0.05, patches: [{ lat: 49.7, lon: 37.5, radiusM: 50, ha: 1, ndwiAnomaly: -0.1 }] }, season: season([0.3, 0.6, 0.85, 0.8, 0.5, 0.2, 0.18, 0.2], "2026-05-01", 10) };
  const a = finishAnalysis({ field, raw, today: "2026-07-20", weather: { hourly: { wetHours14: 40, gdd14: 90 } } });
  assert.equal(a.harvest.stage, "harvested");
  assert.deepEqual(
    { applies: a.stress.applies, share: a.stress.share, level: a.stress.level, cause: a.stress.cause, redEdge: a.stress.redEdge, patches: a.stress.patches, ha: a.stress.stressedHa },
    { applies: false, share: null, level: null, cause: null, redEdge: false, patches: [], ha: null },
  );
  assert.deepEqual(a.condition, { score: null, class: null });
  assert.equal(a.pestRisk, null);
  assert.equal(a.status.id, "harvested");
});

test("stress v2: the likely cause for the field and each patch, the red-edge flag, the pest risk", () => {
  const raw = {
    ...base,
    stress: { share: 0.12, ndwiAnomaly: -0.08, redEdgeOnlyShare: 0.03, patches: [{ lat: 49.701, lon: 37.501, radiusM: 60, ha: 1.1, ndwiAnomaly: -0.09 }, { lat: 49.702, lon: 37.502, radiusM: 40, ha: 0.5, ndwiAnomaly: 0.01 }] },
  };
  const a = finishAnalysis({ field, raw, today: "2026-06-10", weather: { hourly: { wetHours14: 30, gdd14: 45 } } });
  assert.equal(a.stress.applies, true);
  assert.equal(a.stress.level, "medium");
  assert.equal(a.stress.cause, "dry");
  assert.equal(a.stress.redEdge, true);
  assert.deepEqual(a.stress.patches.map((p) => p.cause), ["dry", "other"]);
  assert.deepEqual(a.pestRisk, { disease: "high", insects: "medium", basis: { wetHours: 30, gdd14: 45 } });
  const wet = finishAnalysis({ field, raw: { ...raw, stress: { ...raw.stress, ndwiAnomaly: 0.02, redEdgeOnlyShare: 0 } }, today: "2026-06-10" });
  assert.equal(wet.stress.cause, "other");
  assert.equal(wet.stress.redEdge, false);
  assert.equal(wet.pestRisk, null, "no weather, no risk");
  // A data source that sends the cause itself.
  const given = finishAnalysis({ field, raw: { ...raw, stress: { share: 0.1, cause: "other", patches: raw.stress.patches } }, today: "2026-06-10" });
  assert.equal(given.stress.cause, "other");
  // Low stress names no cause (a few weak pixels say nothing about water or pests).
  const low = finishAnalysis({ field, raw: { ...raw, stress: { share: 0.03, cause: "other", ndwiAnomaly: -0.2, patches: raw.stress.patches } }, today: "2026-06-10" });
  assert.equal(low.stress.level, "low");
  assert.equal(low.stress.cause, null);
  // Medium or high stress with no patch mapped: spread across the field, no cause named.
  const spread = finishAnalysis({ field, raw: { ...raw, stress: { share: 0.1, ndwiAnomaly: -0.2, patches: [] } }, today: "2026-06-10" });
  assert.equal(spread.stress.level, "medium");
  assert.equal(spread.stress.cause, "spread");
  assert.equal(pestRiskFrom({ wetHours14: 3, gdd14: 10 }, "ripening").disease, "low");
  assert.equal(pestRiskFrom({ wetHours14: 3, gdd14: 10 }, "ready"), null);
  assert.equal(pestRiskFrom({ wetHours14: 30, gdd14: 10 }, { stage: "growing", fallow: true }), null, "fallow: no crop to infect");
  assert.equal(pestRiskFrom({ wetHours14: 30, gdd14: 10 }, "growing", { id: "unknown", possiblyFallow: true }), null, "possibly grass: no risk");
});

test("harvest v2: a standing dry corn crop is ready, a radar drop is a harvest", () => {
  const soy = { ...iowa, crop: "Corn", cropSource: "user" };
  const curve = season([0.3, 0.6, 0.85, 0.88, 0.8, 0.6, 0.4, 0.28, 0.25, 0.24], "2026-07-01", 10);
  const standing = finishAnalysis({ field: soy, raw: { ...base, conflict: null, season: curve, radar: { vhSeries: daysFrom("2026-07-01", 100, (d) => ({ date: d, vh: -16 })).filter((_, i) => i % 6 === 0) } }, today: "2026-10-12" });
  assert.equal(standing.harvest.standingDry, true);
  assert.equal(standing.harvest.stage, "ready");
  assert.equal(standing.harvest.basis, "radar");
  assert.equal(standing.status.id, "ready");
  const cutSeries = daysFrom("2026-07-01", 100, (d, i) => ({ date: d, vh: i < 85 ? -16 : -21 })).filter((_, i) => i % 6 === 0);
  const cut = finishAnalysis({ field: soy, raw: { ...base, conflict: null, season: curve, radar: { vhSeries: cutSeries } }, today: "2026-10-12" });
  assert.equal(cut.harvest.stage, "harvested");
  assert.equal(cut.harvest.basis, "radar");
  assert.ok(cut.harvest.radarHarvestOn >= "2026-09-24");
  assert.equal(cut.radar.vhSeries.length, cutSeries.length);
  assert.equal(stripForList(cut).radar, undefined);
});

test("harvest v2: a soybean's leaves falling is not a cut; a radar drop after they are down is", () => {
  const soy = { ...iowa, crop: "Soybean", cropSource: "user" };
  // Peak 22 July, seen yellow (ready level) 12 August, leaves down 19 August.
  const curve = season([0.3, 0.6, 0.85, 0.88, 0.8, 0.6, 0.4, 0.28, 0.25, 0.24], "2026-07-01", 7);
  const vh = (dropOn) => daysFrom("2026-07-01", 70, (d) => ({ date: d, vh: d < dropOn ? -14 : -21 })).filter((_, i) => i % 6 === 0);
  // The drop spans the leaves falling (passes 12 and 18 August): ready, leaves down.
  const leaves = finishAnalysis({ field: soy, raw: { ...base, conflict: null, season: curve, radar: { vhSeries: vh("2026-08-15") } }, today: "2026-09-05" });
  assert.equal(leaves.harvest.stage, "ready");
  assert.equal(leaves.harvest.leafDrop, true);
  assert.equal(leaves.harvest.standingDry, false);
  assert.equal(leaves.harvest.radarHarvestOn, null);
  assert.equal(leaves.status.id, "ready");
  // A drop after the leaves were down (24 to 30 August): the cut.
  const cut = finishAnalysis({ field: soy, raw: { ...base, conflict: null, season: curve, radar: { vhSeries: vh("2026-08-26") } }, today: "2026-09-05" });
  assert.equal(cut.harvest.stage, "harvested");
  assert.equal(cut.harvest.radarHarvestOn, "2026-08-30");
  assert.equal(cut.harvest.leafDrop, false);
  // More than 30 days after the leaves came down: taken as harvested.
  const later = finishAnalysis({ field: soy, raw: { ...base, conflict: null, season: curve, radar: { vhSeries: vh("2026-08-15") } }, today: "2026-09-20" });
  assert.equal(later.harvest.stage, "harvested");
  assert.equal(later.harvest.leafDrop, false);
});

test("double crop: the heat units count from the green-up of the crop now growing, never last summer's", () => {
  // Real Pampas field (-34.90, -60.95): corn-like summer crop peaking in
  // January, harvested by June, wheat rising in October. It read "Corn,
  // ready in 1 day" (2030 GDD since a November 2025 green-up).
  const pampas = { id: "fld-pampas9", name: "Field 9", areaHa: 3, geometry: { type: "Polygon", coordinates: [[[-60.97, -34.9], [-60.965, -34.9], [-60.965, -34.895], [-60.97, -34.895], [-60.97, -34.9]]] } };
  const values = "2025-10-02:0.21 2025-11-01:0.17 2025-11-26:0.28 2025-12-06:0.43 2025-12-16:0.72 2025-12-26:0.84 2026-01-05:0.86 2026-01-20:0.82 2026-01-30:0.78 2026-02-24:0.58 2026-03-16:0.37 2026-04-10:0.38 2026-05-10:0.38 2026-05-30:0.25 2026-06-19:0.33 2026-06-29:0.26 2026-07-14:0.17 2026-07-29:0.35 2026-08-20:0.41 2026-08-28:0.58 2026-09-07:0.54 2026-09-17:0.62 2026-10-02:0.82";
  const curve = values.split(" ").map((x) => ({ date: x.slice(0, 10), ndvi: Number(x.slice(11)), ndwi: 0.1 }));
  const temperatures = daysFrom("2025-09-01", 440, (date) => ({ date, tmax: 24, tmin: 10 }));
  const a = finishAnalysis({ field: pampas, raw: { ...base, conflict: null, season: curve }, today: "2026-10-19", temperatures });
  assert.equal(a.harvest.stage, "growing");
  // The wheat now growing is detected for this season (crops.js
  // WINTER_CEREAL_IN_SEASON), so its heat units run from ITS green-up.
  assert.deepEqual([a.cropDetected.id, a.cropDetected.season], ["winterCereal", "this"], JSON.stringify(a.cropDetected));
  assert.equal(a.cropUsed.id, "winterCereal");
  assert.equal(a.harvest.basis, "heat units");
  assert.ok(a.harvest.gdd.greenUp >= "2026-07-01", JSON.stringify(a.harvest.gdd));
  assert.ok(a.harvest.daysToReady >= 1 && a.harvest.daysToReady < 90, String(a.harvest.daysToReady));
  // With the farmer's wheat: heat units from the wheat's own green-up (August), not November 2025.
  const wheat = finishAnalysis({ field: { ...pampas, crop: "Winter wheat", cropSource: "user" }, raw: { ...base, conflict: null, season: curve }, today: "2026-10-19", temperatures });
  assert.ok(wheat.harvest.gdd && wheat.harvest.gdd.greenUp >= "2026-07-01", JSON.stringify(wheat.harvest));
});

test("harvest v2: a green crop gets a heat-unit estimate (and Harvest soon when close)", () => {
  const corn = { ...iowa, crop: "Corn", cropSource: "user" };
  const curve = season([0.22, 0.25, 0.4, 0.6, 0.78, 0.84, 0.86, 0.86], "2026-05-20", 10);
  const temperatures = daysFrom("2026-05-01", 140, (date) => ({ date, tmax: 30, tmin: 18 }));
  // 14 GDD a day (86/50) since green-up in early June.
  const a = finishAnalysis({ field: corn, raw: { ...base, conflict: null, season: curve }, today: "2026-07-31", temperatures, weather: { rain: { likely: true, from: "2026-08-20", to: "2026-08-21" } } });
  assert.equal(a.harvest.stage, "growing");
  assert.equal(a.harvest.basis, "heat units");
  assert.equal(a.harvest.gdd.base, 10);
  assert.equal(a.harvest.gdd.needed, 1450);
  assert.ok(a.harvest.gdd.accumulated > 700 && a.harvest.gdd.accumulated < 1000, String(a.harvest.gdd.accumulated));
  assert.ok(a.harvest.daysToReady > 14 && a.harvest.daysToReady < 70);
  assert.ok(a.harvest.window.from > "2026-07-31");
  assert.equal(a.harvest.gdd.greenUp >= "2026-06-01" && a.harvest.gdd.greenUp <= "2026-06-20", true);
  // Without temperatures: no heat-unit estimate.
  const none = finishAnalysis({ field: corn, raw: { ...base, conflict: null, season: curve }, today: "2026-07-31" });
  assert.equal(none.harvest.basis, null);
  assert.equal(none.harvest.window, null);
  // Nearly there: Harvest soon.
  const late = finishAnalysis({ field: corn, raw: { ...base, conflict: null, season: curve }, today: "2026-08-10", temperatures: daysFrom("2026-05-01", 140, (date) => ({ date, tmax: 40, tmin: 30 })) });
  assert.ok(late.harvest.daysToReady <= 14, String(late.harvest.daysToReady));
  assert.equal(late.status.id, "harvestSoon");
});

test("crop detection from the field's history; the farmer's crop wins for the rules", () => {
  // Monthly NDVI of a spring cereal: bare over winter, green-up May, peak June, harvest July-August.
  const shape = { "01": 0.2, "02": 0.2, "03": 0.21, "04": 0.25, "05": 0.5, "06": 0.8, "07": 0.4, "08": 0.22, "09": 0.22, 10: 0.22, 11: 0.21, 12: 0.2 };
  const months = [];
  for (let y = 2019; y <= 2026; y += 1) for (let m = 1; m <= 12; m += 1) if (`${y}-${String(m).padStart(2, "0")}` <= "2026-09") months.push({ month: `${y}-${String(m).padStart(2, "0")}`, ndvi: shape[String(m).padStart(2, "0")] ?? shape[m] });
  assert.equal(peakMonthFromHistory(months), 6);
  const a = finishAnalysis({ field: iowa, raw: { ...base, conflict: null, season: [] }, today: "2026-10-10", history: { months } });
  assert.equal(a.cropDetected.id, "springCereal");
  // Read from the monthly record (this season's passes have not peaked):
  // last season's crop, which never drives this season's harvest rules.
  assert.equal(a.cropDetected.season, "last");
  assert.deepEqual(a.cropUsed, { id: null, label: null, source: null });
  const mine = finishAnalysis({ field: { ...iowa, crop: "Maize", cropSource: "user" }, raw: { ...base, conflict: null, season: [] }, today: "2026-10-10", history: { months } });
  assert.equal(mine.cropDetected.id, "springCereal");
  assert.deepEqual(mine.cropUsed, { id: "corn", label: "Maize", source: "user" });
  // No history, no clear season: unknown.
  assert.equal(finishAnalysis({ field: iowa, raw: { ...base, conflict: null, season: [] }, today: "2026-10-10" }).cropDetected.id, "unknown");
});

test("where a field's crop came from", () => {
  assert.equal(cropSourceOf({ crop: "Corn", cropSource: "user" }), "user");
  assert.equal(cropSourceOf({ crop: "Corn", cropSource: "detected" }), "detected");
  assert.equal(cropSourceOf({ crop: null, cropSource: "user" }), null);
  // Saved before cropSource existed: the demo farm's placeholder, or the farmer's own.
  assert.equal(cropSourceOf({ name: "Field 3", crop: "Corn", source: "demo" }), "demo");
  assert.equal(cropSourceOf({ name: "Field 3", crop: "Sugar beet", source: "demo" }), "user");
  assert.equal(cropSourceOf({ name: "Field 3", crop: "Corn", source: "drawn" }), "user");
  assert.equal(cropSourceOf({ name: "Field 3", crop: null }), null);
  // A demo placeholder never drives the rules.
  assert.deepEqual(cropForRules({ name: "Field 3", crop: "Corn", cropSource: "demo" }, { id: "unknown" }), { id: null, label: null, source: null });
  assert.equal(cropForRules({ crop: "Corn", cropSource: "demo" }, { id: "soybean", label: "Soybean" }).id, "soybean");
});

// Real fields of the Kupiansk demo farm, 2026 (src/lib/field/crops.test-data.js).
const kupiansk = (fixture) => ({
  water: { ndwi: 0, normal: { low: -0.07, high: 0.07, median: 0 } },
  plantHealth: { ndvi: 0.45, normal: { low: 0.4, high: 0.6, median: 0.5 } },
  stress: { share: 0.3, ndwiAnomaly: -0.1, patches: [{ lat: 49.7, lon: 37.5, radiusM: 50, ha: 1, ndwiAnomaly: -0.1 }] },
  season: fixture.passes,
  cropInputs: { months: fixture.months, peakMonth: 6 },
});
const hot = { hourly: { wetHours14: 40, gdd14: 80 } };

test("a field whose crop is not known gets no harvest date, only what was measured", () => {
  // Field 4 of the demo farm: no rule names its crop. It dried down to the
  // ready level: before, "Ready to harvest · Best by ..." for a crop the
  // app could not name.
  const a = finishAnalysis({ field, raw: kupiansk(KUPIANSK_UNKNOWN), today: "2026-10-19", weather: hot });
  assert.equal(a.cropDetected.id, "unknown");
  assert.equal(a.cropUsed.id, null);
  assert.equal(a.harvest.stage, "growing");
  assert.equal(a.harvest.dryDown, "dry");
  assert.equal(a.harvest.cropUnknown, true);
  assert.equal(a.harvest.daysToReady, null);
  assert.equal(a.harvest.window, null);
  assert.equal(a.harvest.basis, null);
  assert.notEqual(a.status.id, "ready");
  // Dried down: stress is not read ("Dried down"), and no pest risk.
  assert.equal(a.stress.applies, false);
  assert.equal(a.stress.reason, "driedDown");
  assert.deepEqual(a.stress.patches, []);
  assert.equal(a.pestRisk, null);
  // The same field with the farmer's crop gets the crop's estimate again.
  const own = finishAnalysis({ field: { ...field, crop: "Sunflower", cropSource: "user" }, raw: kupiansk(KUPIANSK_UNKNOWN), today: "2026-10-19" });
  assert.equal(own.harvest.cropUnknown, false);
  assert.notEqual(own.harvest.dryDown, "dry");
});

test("fallow or grass (the field drawn next to the demo farm): no harvest, no crop stress, no pest risk", () => {
  // Before: "ripening, ready about Oct 22" and "Field 11 ready to harvest
  // in 3 days" for land that never went bare.
  const a = finishAnalysis({ field, raw: kupiansk(KUPIANSK_FALLOW_SLOW), today: "2026-10-19", weather: hot });
  assert.equal(a.cropDetected.id, "fallow");
  assert.equal(a.cropDetected.label, "Fallow or grass");
  assert.equal(a.cropUsed.id, null);
  assert.equal(a.harvest.stage, "growing");
  assert.equal(a.harvest.dryDown, "fading");
  assert.equal(a.harvest.fallow, true);
  assert.equal(a.harvest.daysToReady, null);
  assert.equal(a.harvest.window, null);
  assert.notEqual(a.status.id, "harvestSoon");
  assert.equal(a.stress.applies, false);
  assert.equal(a.stress.reason, "noCrop");
  assert.equal(a.pestRisk, null);
  // Its slow fade to dry grass is not a cut: never "harvested" from the images.
  const b = finishAnalysis({ field, raw: kupiansk(KUPIANSK_FALLOW), today: "2026-10-19" });
  assert.equal(b.cropDetected.id, "fallow");
  assert.equal(b.harvest.stage, "growing");
  assert.equal(b.harvest.dryDown, "dry");
  assert.equal(b.harvest.harvestedOn, null);
});

test("a dried-down (ready) crop is not read for stress; a harvested one says how it was seen", () => {
  // Real case, Iowa Field 13 (2026-10-19): ready, "Stress High · Dry patch"
  // while water was normal and the condition "Very good".
  const raw = { ...base, stress: { share: 0.3, ndwiAnomaly: -0.1, patches: [{ lat: 42.03, lon: -93.62, radiusM: 50, ha: 1, ndwiAnomaly: -0.1 }] }, season: season([0.3, 0.6, 0.85, 0.88, 0.86, 0.7, 0.5, 0.35], "2026-06-01", 10) };
  const a = finishAnalysis({ field: { ...iowa, crop: "Corn", cropSource: "user" }, raw, today: "2026-08-12" });
  assert.equal(a.harvest.stage, "ready");
  assert.equal(a.stress.applies, false);
  assert.equal(a.stress.reason, "driedDown");
  assert.equal(a.stress.level, null);
  assert.ok(a.condition.class, "a ready crop keeps its condition");
  // Growing with 30 % stressed: never "Very good".
  const g = finishAnalysis({ field, raw: { ...base, stress: { share: 0.3, ndwiAnomaly: -0.1 } }, today: "2026-06-10" });
  assert.equal(g.stress.level, "high");
  assert.notEqual(g.condition.class, "great");
  assert.equal(g.status.id, "watch");
  // Harvested by the optical drop: basis "images" (shown as "From satellite images").
  const h = finishAnalysis({ field, raw: { ...base, season: season([0.3, 0.6, 0.85, 0.8, 0.5, 0.2, 0.18, 0.2], "2026-05-01", 10) }, today: "2026-07-20" });
  assert.equal(h.harvest.stage, "harvested");
  assert.equal(h.harvest.basis, "images");
});
