// Tests for format.js (the Field pages' words and numbers). Run with npm test.

import test from "node:test";
import assert from "node:assert/strict";
import {
  analysingIds,
  basisText,
  candidateTotals,
  causeText,
  conditionWord,
  cropInfo,
  detectedChoice,
  farmConflict,
  mapLook,
  mapMarks,
  riskNote,
  farmLine,
  fieldTiles,
  formatArea,
  formatDay,
  formatDayRange,
  formatIndex,
  normalRange,
  stageWord,
  statusCounts,
  statusOf,
  groupOf,
  stressWord,
  versusWord,
  gddSince,
  usualRange,
  waterWord,
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
  assert.deepEqual(water, { id: "water", label: "Water", value: "−0.16", word: "Normal", tone: "green", line: "Usual −0.18 to −0.14", note: null, noteTone: null, hint: null });
  assert.equal(health.word, "Below normal");
  assert.equal(health.tone, "amber");
  assert.equal(stress.value, "0.8\u00a0ha");
  assert.equal(stress.line, "2% of the field · 1 patch");
  assert.equal(harvest.value, "Ready");
  assert.equal(harvest.line, "Rain Oct 19 · harvest first");
});

test("tiles without readings or without stress", () => {
  const tiles = fieldTiles(null);
  assert.equal(tiles.length, 4);
  assert.equal(tiles[0].value, "–");
  assert.equal(tiles[0].word, null);
  assert.equal(tiles[2].value, "–");
  assert.equal(tiles[3].value, "No clear image");
  const calm = fieldTiles({ stress: { share: 0, level: "low", stressedHa: 0, patches: [] }, harvest: { stage: "ripening", daysToReady: 9, window: { from: "2026-10-27", to: "2026-11-06" } } });
  assert.equal(calm[2].value, "None");
  assert.equal(calm[2].line, "No weak patches");
  assert.equal(calm[3].value, "9 days");
  assert.equal(calm[3].line, "Ready about Oct 27");
});

test("stress: no crop, the likely cause and the pest risk", () => {
  const harvested = fieldTiles({ stress: { share: null, level: null, applies: false, patches: [] }, harvest: { stage: "harvested", harvestedOn: "2026-10-02" } });
  assert.equal(harvested[2].value, "No crop");
  assert.equal(harvested[2].word, null);
  // An older analysis without "applies" still says No crop after harvest.
  assert.equal(fieldTiles({ stress: { share: 0.2, level: "high" }, harvest: { stage: "notSown" } })[2].value, "No crop");
  const dry = fieldTiles({ stress: { share: 0.12, level: "medium", stressedHa: 3.4, patches: [{}, {}], cause: "dry", redEdge: true, applies: true }, harvest: { stage: "growing" } })[2];
  assert.equal(dry.value, "3.4\u00a0ha");
  assert.equal(dry.word, "Medium");
  assert.equal(dry.line, "Dry patch");
  assert.match(dry.hint, /12% of the field · 2 patches\. Found early by the red-edge band/);
  const other = fieldTiles({ stress: { share: 0.08, level: "medium", stressedHa: 1, patches: [{}], cause: "other" }, pestRisk: { disease: "high", insects: "low" }, harvest: { stage: "growing" } })[2];
  assert.equal(other.line, "Not water: check for pests or disease");
  // Low stress names no cause; with no patch mapped the share is the value.
  const low = fieldTiles({ stress: { share: 0.01, level: "low", stressedHa: 0.1, patches: [], cause: "dry" }, harvest: { stage: "growing" } })[2];
  assert.equal(low.value, "1%");
  assert.equal(low.line, "No weak patches to check");
  const lowPatch = fieldTiles({ stress: { share: 0.01, level: "low", stressedHa: 0.4, patches: [{}], cause: "dry" }, harvest: { stage: "growing" } })[2];
  assert.equal(lowPatch.value, "0.4\u00a0ha");
  assert.equal(lowPatch.line, "1% of the field · 1 patch");
  assert.equal(other.note, "Disease risk high this week");
  assert.equal(other.noteTone, "red");
  const calm = fieldTiles({ stress: { share: 0, level: "low" }, pestRisk: { disease: "low", insects: "medium" }, harvest: { stage: "ripening" } })[2];
  assert.equal(calm.value, "None");
  assert.equal(calm.note, "Insect activity medium this week");
  assert.equal(fieldTiles({ stress: { share: 0 }, pestRisk: { disease: "low", insects: "low" } })[2].note, null);
  assert.equal(causeText("dry"), "Dry patch");
  assert.equal(causeText(null), null);
  assert.deepEqual(riskNote({ disease: "medium", insects: "low" }), { text: "Disease risk medium this week", tone: "amber" });
  assert.equal(riskNote(null), null);
});

test("harvest: crop-aware, with how it was worked out", () => {
  const heat = fieldTiles({ harvest: { stage: "growing", basis: "heat units", daysToReady: 23, window: { from: "2026-11-11", to: "2026-11-21" }, gdd: { accumulated: 1180.4, needed: 1450, base: 10 } } }, { crop: "Corn" })[3];
  assert.equal(heat.value, "23 days");
  assert.equal(heat.word, "Growing");
  assert.equal(heat.line, "Ready about Nov 11");
  assert.equal(heat.note, "Corn · from heat units");
  assert.equal(heat.hint, "1,180 of about 1,450 heat units (base 10 °C) since green-up");
  const standing = fieldTiles({ harvest: { stage: "ready", daysToReady: 0, basis: "radar", standingDry: true } }, { crop: "Soybean" })[3];
  assert.equal(standing.value, "Ready");
  assert.equal(standing.line, "Standing, dry");
  assert.equal(standing.note, "Soybean · from radar");
  // A soybean with its leaves down: ready, and the radar cannot tell if it is cut yet.
  const leaves = fieldTiles({ harvest: { stage: "ready", daysToReady: 0, basis: "dry-down", leafDrop: true } }, { crop: "Soybean" })[3];
  assert.equal(leaves.value, "Ready");
  assert.equal(leaves.line, "Leaves down · check if cut");
  const cut = fieldTiles({ harvest: { stage: "harvested", basis: "radar", harvestedOn: null, radarHarvestOn: "2026-10-04" } })[3];
  assert.equal(cut.line, "Cut about Oct 4");
  assert.equal(cut.note, "From radar");
  const both = fieldTiles({ harvest: { stage: "ripening", daysToReady: 6, basis: "both" } }, { crop: "Sunflower" })[3];
  assert.equal(both.note, "Sunflower · from dry-down and heat units");
  assert.equal(fieldTiles({ harvest: { stage: "growing", peak: 0.71 } })[3].line, "Greenest so far 0.71");
  assert.equal(basisText("dry-down"), "from dry-down");
  assert.equal(basisText(null), null);
});

test("the crop a field shows", () => {
  const detected = { cropDetected: { id: "corn", label: "Corn", confidence: "likely", reason: "Peak in August" } };
  assert.deepEqual(cropInfo({ crop: "Winter wheat", cropSource: "user" }, detected), { name: "Winter wheat", text: "Winter wheat", source: "user", confidence: null, reason: null });
  assert.equal(cropInfo({ crop: "Barley" }, detected).source, "user"); // saved before crops were detected
  assert.equal(cropInfo({ crop: "Sunflower", cropSource: "demo" }, detected).text, "Corn · detected");
  assert.equal(cropInfo({ crop: "Sunflower", cropSource: "demo" }, null).text, null);
  assert.equal(cropInfo({ crop: null, cropSource: null }, detected).text, "Corn · detected");
  assert.equal(cropInfo({ crop: null }, { cropDetected: { id: "unknown", label: "Unknown" } }).text, null);
  assert.equal(detectedChoice(detected), "Detected: Corn");
  assert.equal(detectedChoice({ cropDetected: { id: "soybean", label: "Soybean", confidence: "possible" } }), "Detected: Soybean (possible)");
  assert.equal(detectedChoice({ cropDetected: { id: "unknown", label: "Unknown" } }), "Not detected");
  assert.equal(detectedChoice(null), "Detecting…");
});

test("fields being analysed", () => {
  const farm = { fields: [{ id: "a" }, { id: "b" }, { id: "c" }] };
  const analyses = { a: {} };
  assert.deepEqual([...analysingIds(farm, analyses, { status: "running", kind: "field-analyze", fieldIds: ["a", "c"] })], ["c"]);
  assert.deepEqual([...analysingIds(farm, analyses, { status: "running", kind: "field-analyze" })], ["b", "c"]);
  assert.equal(analysingIds(farm, analyses, { status: "done", kind: "field-analyze", fieldIds: ["c"] }).size, 0);
  assert.equal(analysingIds(farm, analyses, { status: "running", kind: "field-detect" }).size, 0);
});

test("war or peace for the farm", () => {
  const war = { id: "ukraine-2022", name: "War", since: "2022-02-24" };
  assert.equal(farmConflict({ conflict: null }, {}), null);
  assert.equal(farmConflict({}, {}), undefined);
  assert.equal(farmConflict({ conflict: war }, {}), war);
  assert.equal(farmConflict({}, { a: { conflict: null } }), null);
  assert.equal(farmConflict({}, { a: { conflict: null }, b: { conflict: war } }), war);
});

test("the map's marks and its legend", () => {
  const fields = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const analyses = {
    a: { status: { id: "healthy" }, condition: { class: "good" }, stress: { applies: true, patches: [{ lat: 1, lon: 2 }] }, harvest: { stage: "growing" } },
    b: { status: { id: "harvested" }, condition: { class: null }, stress: { applies: false, patches: [{ lat: 1, lon: 2 }] }, harvest: { stage: "harvested" } },
    c: { status: { id: "ready" }, condition: { class: "great" }, harvest: { stage: "ready" } },
  };
  assert.deepEqual(mapLook(analyses.b), { recovery: false, ready: false, bare: true, bareKind: "harvested", patches: [] });
  assert.equal(mapLook(analyses.a).patches.length, 1);
  assert.deepEqual(mapMarks(fields, analyses), { classes: true, marks: ["ready", "stress", "harvested"] });
  assert.deepEqual(mapMarks([{ id: "b" }], analyses), { classes: false, marks: ["harvested"] });
});

test("status counts follow the method's groups", () => {
  const farm = { fields: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] };
  const analyses = { a: { status: { id: "ready" } }, b: { status: { id: "watch" } }, c: { status: { id: "recovery" } } };
  assert.deepEqual(statusCounts(farm, analyses), { growing: 1, ready: 1, harvestSoon: 0, watch: 1, recovery: 1, noCrop: 0, harvested: 0, notSown: 0, fallow: 0, driedDown: 0, total: 4, healthy: 1 });
  // A harvested or not-sown field is not "healthy": it has no crop.
  const bare = { a: { status: { id: "harvested" } }, b: { status: { id: "notSown" } }, c: { status: { id: "healthy" } } };
  assert.deepEqual(statusCounts(farm, bare), { growing: 1, ready: 0, harvestSoon: 0, watch: 0, recovery: 0, noCrop: 2, harvested: 1, notSown: 1, fallow: 0, driedDown: 0, total: 4, healthy: 1 });
  // Fallow or grass and dried down have no crop either.
  const more = { a: { status: { id: "fallow" } }, b: { status: { id: "driedDown" } }, c: { status: { id: "healthy" }, harvest: { fallow: true } }, d: { status: { id: "healthy" }, harvest: { dryDown: "dry" } } };
  const counts = statusCounts(farm, more);
  assert.deepEqual([counts.growing, counts.noCrop, counts.fallow, counts.driedDown], [0, 4, 2, 2]);
  assert.equal(groupOf("harvestSoon"), "growing");
  assert.equal(groupOf("fallow"), "noCrop");
  assert.equal(groupOf("unknown"), "watch");
  assert.equal(groupOf("unclear"), "watch");
});

// Polish round 2 (critic's findings, 2026-10-19)
test("an old 'Healthy' reads 'Growing well'; possibly grass is 'Crop unclear'", () => {
  assert.deepEqual(statusOf({ status: { id: "healthy", label: "Healthy", tone: "green" } }), { id: "healthy", label: "Growing well", tone: "green" });
  const grass = { status: { id: "healthy", label: "Healthy", tone: "green" }, harvest: { stage: "growing", cropUnknown: true, dryDown: "fading" }, cropDetected: { id: "unknown", label: "Unknown", possiblyFallow: true }, cropUsed: { id: null } };
  assert.equal(statusOf(grass).id, "unclear");
  assert.equal(statusOf(grass).label, "Crop unclear");
  assert.equal(cropInfo({ crop: null, cropSource: null }, grass).text, "Unknown · possibly grass");
  // The farmer's crop wins.
  assert.equal(cropInfo({ crop: "Corn", cropSource: "user" }, grass).text, "Corn");
  // Possibly grass and cut: "Harvested", with a hay-cut note.
  const cut = fieldTiles({ harvest: { stage: "harvested", cropUnknown: true, radarHarvestOn: "2026-09-09" }, cropDetected: { id: "unknown", possiblyFallow: true } })[3];
  assert.equal(cut.value, "Harvested");
  assert.equal(cut.note, "Possibly grass: may be a hay cut");
});

test("a fallow field cut on radar: the Stress tile says 'Cut or mown', never 'Harvested'", () => {
  const mown = fieldTiles({ stress: { applies: false, reason: "noCrop" }, harvest: { stage: "harvested", fallow: true, mown: true, radarHarvestOn: "2026-09-09", cropUnknown: true } });
  assert.equal(mown[2].value, "No crop");
  assert.equal(mown[2].line, "Cut or mown");
  assert.equal(mown[3].value, "Cut or mown");
  const grass = fieldTiles({ stress: { applies: false, reason: "noCrop" }, harvest: { stage: "growing", fallow: true, cropUnknown: true } });
  assert.equal(grass[2].line, "Fallow or grass");
  assert.equal(fieldTiles({ stress: { applies: false }, harvest: { stage: "harvested" } })[2].line, "Harvested");
});

test("heat units since the day counting starts, when that is after the green-up", () => {
  const wheat = fieldTiles({ harvest: { stage: "growing", basis: "heat units", daysToReady: 40, gdd: { accumulated: 660, needed: 1400, base: 0, greenUp: "2026-06-20", from: "2026-09-01" } } })[3];
  assert.equal(wheat.hint, "660 of about 1,400 heat units (base 0 °C) since Sep 1");
  assert.equal(gddSince({ greenUp: "2026-05-20", from: "2026-05-20" }), "since green-up");
  assert.equal(gddSince({}), "since green-up");
});

test("a very wide usual range says it varies, not the numbers", () => {
  assert.equal(usualRange({ low: 0.19, high: 0.89 }), "Usual range varies (crop rotation)");
  assert.equal(usualRange({ low: -0.26, high: 0.52 }), "Usual range varies (crop rotation)");
  assert.equal(usualRange({ low: 0.26, high: 0.29 }), "Usual 0.26 to 0.29");
});

test("the print table uses the Water tile's words", () => {
  assert.equal(waterWord("below"), "Drier than usual");
  assert.equal(waterWord("above"), "Wetter than usual");
  assert.equal(waterWord(undefined), "No reading");
});

test("a crop not known, fallow or grass, a dried-down crop and an optical harvest", () => {
  // Crop unknown: what was measured, never a date, and where to set the crop.
  const fading = fieldTiles({ harvest: { stage: "growing", cropUnknown: true, dryDown: "fading", peak: 0.884, peakDate: "2026-06-29" }, cropDetected: { id: "unknown" } })[3];
  assert.equal(fading.value, "Past peak");
  assert.equal(fading.line, "Greenest 0.88 on Jun 29");
  assert.equal(fading.note, "Crop unknown: pick it in Settings for a harvest estimate");
  const dry = fieldTiles({ harvest: { stage: "growing", cropUnknown: true, dryDown: "dry", peak: 0.66 } })[3];
  assert.equal(dry.value, "Dried down");
  assert.equal(stageWord({ stage: "growing", dryDown: "dry" }), "Dried down");
  const green = fieldTiles({ harvest: { stage: "growing", cropUnknown: true, peak: 0.6 } })[3];
  assert.equal(green.value, "Growing");
  assert.match(green.note, /^Crop unknown/);
  // Fallow or grass: no harvest, and no crop to stress.
  const fallow = fieldTiles({ harvest: { stage: "growing", cropUnknown: true, fallow: true, dryDown: "fading", peak: 0.88 }, stress: { applies: false, reason: "noCrop" }, cropDetected: { id: "fallow", label: "Fallow or grass" } });
  assert.equal(fallow[3].note, "Fallow or grass: no harvest expected");
  assert.equal(fallow[3].value, "No crop");
  // Cut on radar: "Cut or mown", never "Harvested".
  const mown = fieldTiles({ status: { id: "fallow" }, harvest: { stage: "harvested", fallow: true, radarHarvestOn: "2026-09-02" }, stress: { applies: false, reason: "noCrop" } })[3];
  assert.equal(mown.value, "Cut or mown");
  assert.equal(mown.line, "About Sep 2");
  assert.equal(fallow[2].value, "No crop");
  assert.equal(fallow[2].line, "Fallow or grass");
  // A crop dried down for harvest: "Dried down", not a stress reading.
  const ready = fieldTiles({ harvest: { stage: "ready", basis: "dry-down" }, stress: { applies: false, reason: "driedDown", share: null, level: null } })[2];
  assert.equal(ready.value, "Dried down");
  assert.equal(ready.word, null);
  // Saved before stress.reason existed: from the stage.
  assert.equal(fieldTiles({ harvest: { stage: "ready" }, stress: { applies: false } })[2].value, "Dried down");
  assert.equal(fieldTiles({ harvest: { stage: "harvested" }, stress: { applies: false } })[2].value, "No crop");
  // Harvested by the optical drop: the tile says how it was seen.
  const cut = fieldTiles({ harvest: { stage: "harvested", basis: "images", harvestedOn: "2026-09-19" } })[3];
  assert.equal(cut.line, "Cut about Sep 19");
  assert.equal(cut.note, "From satellite images");
  assert.equal(basisText("images"), "from satellite images");
  // Fallow or grass in the crop select and next to the field's name.
  assert.equal(detectedChoice({ cropDetected: { id: "fallow", label: "Fallow or grass", confidence: "possible" } }), "Detected: Fallow or grass (possible)");
  assert.equal(cropInfo({ crop: null }, { cropDetected: { id: "fallow", label: "Fallow or grass", confidence: "possible" } }).text, "Fallow or grass · detected");
});

test("a field with high stress is counted to watch, never healthy", () => {
  const farm = { fields: [{ id: "a" }, { id: "b" }] };
  const analyses = { a: { status: { id: "harvestSoon" }, stress: { applies: true, level: "high" } }, b: { status: { id: "healthy" }, stress: { applies: true, level: "medium" } } };
  const counts = statusCounts(farm, analyses);
  assert.equal(counts.healthy, 1);
  assert.equal(counts.watch, 1);
});

test("candidate totals", () => {
  const candidates = [{ id: "cand-1", areaHa: 20.5 }, { id: "cand-2", areaHa: 30.25 }, { id: "cand-3", areaHa: 9 }];
  assert.deepEqual(candidateTotals(candidates, ["cand-1", "cand-2"]), { count: 2, areaHa: 50.75 });
  assert.deepEqual(candidateTotals(candidates, []), { count: 0, areaHa: 0 });
});

test("a field with no crop is never 'Healthy' or a condition colour", () => {
  // Saved before the fallow and dried-down statuses existed.
  const old = { status: { id: "healthy", label: "Healthy", tone: "green" }, condition: { class: "great" }, harvest: { stage: "growing", fallow: true } };
  assert.deepEqual(statusOf(old), { id: "fallow", label: "Fallow or grass", tone: null });
  assert.equal(statusOf({ status: { id: "healthy", label: "Healthy" }, harvest: { stage: "growing", dryDown: "dry" } }).label, "Dried down");
  assert.equal(statusOf({ status: { id: "ready", label: "Ready to harvest" }, harvest: { stage: "ready" } }).id, "ready");
  assert.equal(statusOf(null), null);
  assert.deepEqual(mapLook(old), { recovery: false, ready: false, bare: true, bareKind: "fallow", patches: [] });
  const look = mapLook({ status: { id: "driedDown" }, condition: { class: null }, harvest: { stage: "growing", dryDown: "dry" } });
  assert.equal(look.bareKind, "driedDown");
  assert.deepEqual(mapMarks([{ id: "a" }, { id: "b" }], { a: old, b: { status: { id: "harvested" } } }), { classes: false, marks: ["harvested", "fallow"] });
});

test("medium or high stress with no patch is spread across the field", () => {
  const tile = (stress) => fieldTiles({ harvest: { stage: "growing" }, stress: { applies: true, share: 0.12, stressedHa: 6, ...stress } })[2];
  assert.equal(tile({ level: "medium", patches: [], cause: "other" }).line, "Spread across the field");
  assert.equal(tile({ level: "high", patches: [], cause: "dry" }).line, "Spread across the field");
  assert.equal(tile({ level: "medium", patches: [{ lat: 1, lon: 2 }], cause: "dry" }).line, "Dry patch");
  assert.equal(tile({ level: "low", patches: [], cause: "dry" }).line, "No weak patches to check");
});
