// Tests for format.js (the Field pages' words and numbers). Run with npm test.

import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateTotals,
  conditionWord,
  farmLine,
  fieldTiles,
  formatArea,
  formatDay,
  formatDayRange,
  formatIndex,
  normalRange,
  stageWord,
  statusCounts,
  stressWord,
  versusWord,
} from "./format.js";

test("areas in each unit", () => {
  assert.equal(formatArea(54.56), "54.6\u00a0ha");
  assert.equal(formatArea(54.56, "acres"), "135\u00a0acres");
  assert.equal(formatArea(54.56, "mu"), "818\u00a0亩");
  assert.equal(formatArea(336.16), "336\u00a0ha");
  assert.equal(formatArea(5321), "5,321\u00a0ha");
  assert.equal(formatArea(31.04), "31\u00a0ha");
  assert.equal(formatArea(null), "–");
});

test("the farm line", () => {
  assert.equal(farmLine(null), "No fields yet");
  assert.equal(farmLine({ fields: [] }), "No fields yet");
  assert.equal(farmLine({ units: "ha", fields: [{ areaHa: 54.56 }] }), "1 field · 54.6\u00a0ha");
  assert.equal(farmLine({ units: "acres", fields: [{ areaHa: 100 }, { areaHa: 50 }] }), "2 fields · 371\u00a0acres");
});

test("readings and normal ranges", () => {
  assert.equal(formatIndex(-0.158), "−0.16");
  assert.equal(formatIndex(0.281), "0.28");
  assert.equal(formatIndex(-0.001), "0.00");
  assert.equal(formatIndex(undefined), "–");
  assert.equal(normalRange({ low: 0.259, high: 0.286 }), "Normal 0.26 to 0.29");
  assert.equal(normalRange({ low: 0.32, high: 0.321 }), "Normal 0.32");
  assert.equal(normalRange({ low: null, high: 0.3 }), null);
});

test("dates", () => {
  assert.equal(formatDay("2026-10-16"), "Oct 16");
  assert.equal(formatDay("2026-10-16T08:00:00Z"), "Oct 16");
  assert.equal(formatDayRange("2026-10-18", "2026-10-28"), "Oct 18–28");
  assert.equal(formatDayRange("2026-10-28", "2026-11-07"), "Oct 28 – Nov 7");
  assert.equal(formatDayRange("2026-10-28", "2026-10-28"), "Oct 28");
});

test("words", () => {
  assert.equal(stageWord({ stage: "ripening", daysToReady: 8 }), "8 days");
  assert.equal(stageWord({ stage: "ripening", daysToReady: 1 }), "1 day");
  assert.equal(stageWord({ stage: "ready" }), "Ready");
  assert.equal(stageWord({ stage: "harvested" }), "Harvested");
  assert.equal(stageWord({ stage: "notSown" }), "Not sown");
  assert.equal(stageWord(null), "No clear image");
  assert.equal(versusWord("below"), "Below normal");
  assert.equal(stressWord("high"), "High");
  assert.equal(conditionWord("great"), "Very good");
  assert.equal(conditionWord(null), "No reading");
});

const analysis = {
  water: { ndwi: -0.158, normal: { low: -0.176, high: -0.138 }, versus: "normal" },
  plantHealth: { ndvi: 0.21, normal: { low: 0.259, high: 0.286 }, versus: "below" },
  stress: { share: 0.024, level: "low", stressedHa: 0.78, patches: [{ lat: 1, lon: 2 }] },
  harvest: { stage: "ready", window: { from: "2026-10-18", to: "2026-10-28" }, rainBefore: true },
};

test("the four tiles", () => {
  const [water, health, stress, harvest] = fieldTiles(analysis, { units: "ha", weather: { rain: { likely: true, from: "2026-10-19" } } });
  assert.deepEqual(water, { id: "water", label: "Water", value: "−0.16", word: "Normal", tone: "green", line: "Normal −0.18 to −0.14" });
  assert.equal(health.word, "Below normal");
  assert.equal(health.tone, "amber");
  assert.equal(stress.value, "0.8\u00a0ha");
  assert.equal(stress.line, "2% of the field · 1 patch");
  assert.equal(harvest.value, "Ready");
  assert.equal(harvest.word, "Now");
  assert.equal(harvest.line, "Rain Oct 19 · harvest first");
});

test("tiles without readings or without stress", () => {
  const tiles = fieldTiles(null);
  assert.equal(tiles.length, 4);
  assert.equal(tiles[0].value, "–");
  assert.equal(tiles[0].word, null);
  assert.equal(tiles[3].value, "No clear image");
  const calm = fieldTiles({ stress: { share: 0, level: "low", stressedHa: 0, patches: [] }, harvest: { stage: "ripening", daysToReady: 9, window: { from: "2026-10-27", to: "2026-11-06" } } });
  assert.equal(calm[2].value, "None");
  assert.equal(calm[2].line, "No weak patches");
  assert.equal(calm[3].value, "9 days");
  assert.equal(calm[3].line, "Ready about Oct 27");
});

test("status counts follow the method's groups", () => {
  const farm = { fields: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] };
  const analyses = { a: { status: { id: "ready" } }, b: { status: { id: "watch" } }, c: { status: { id: "recovery" } } };
  assert.deepEqual(statusCounts(farm, analyses), { healthy: 1, watch: 1, recovery: 1, total: 4 });
});

test("candidate totals", () => {
  const candidates = [{ id: "cand-1", areaHa: 20.5 }, { id: "cand-2", areaHa: 30.25 }, { id: "cand-3", areaHa: 9 }];
  assert.deepEqual(candidateTotals(candidates, ["cand-1", "cand-2"]), { count: 2, areaHa: 50.75 });
  assert.deepEqual(candidateTotals(candidates, []), { count: 0, areaHa: 0 });
});
