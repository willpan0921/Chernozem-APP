// WHAT THIS FILE DOES
// Tests for server/field/analysis.js: a data source's readings become the
// finished analysis by the rules of src/lib/field/method.js. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes analysis.js.

import test from "node:test";
import assert from "node:assert/strict";
import { finishAnalysis, harvestWindow, stripForList } from "./analysis.js";

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
  const a = finishAnalysis({ field, raw, today, weather: { rain: { likely: true, from: "2026-08-10", to: "2026-08-11", mm: 12 } } });
  assert.equal(a.harvest.stage, "ripening");
  assert.ok(a.harvest.daysToReady > 0);
  assert.ok(a.harvest.window.from > today);
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
