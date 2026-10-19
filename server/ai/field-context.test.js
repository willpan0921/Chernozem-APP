// WHAT THIS FILE DOES
// Tests what the Field AI knows (field-context.js) with a small in-memory
// stand-in for server/store.js: the context text names every field with its
// status and readings and says when the data is sample; the tools find
// fields by name or number; history gets its normal; a report's photos come
// back as images (only real JPEG/PNG/WebP files, at most 4).
//
// WHO EDITS IT
// Whoever changes field-context.js. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFieldContext,
  findField,
  imageTypeOf,
  historyWithNormal,
  FIELD_TOOLS,
} from "./field-context.js";

// The first bytes of each image type, padded to a plausible file.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 3)]);

function analysis(id, overrides = {}) {
  return {
    fieldId: id,
    provider: "sample",
    updatedAt: "2026-10-17T10:00:00.000Z",
    latestPass: { date: "2026-10-12", clearPct: 94 },
    water: { ndwi: 0.12, normal: { low: 0.1, high: 0.2, median: 0.15 }, versus: "normal", score: 0.9 },
    plantHealth: { ndvi: 0.48, normal: { low: 0.45, high: 0.6, median: 0.52 }, versus: "normal", score: 0.88 },
    stress: { share: 0.02, level: "low", stressedHa: 0.8, patches: [] },
    harvest: { stage: "ripening", daysToReady: 8, window: { from: "2026-10-26", to: "2026-11-02" }, rainBefore: true, peak: 0.81, peakDate: "2026-07-01", lastDate: "2026-10-12" },
    condition: { score: 0.82, class: "good" },
    damage: { detected: false, radarChangedShare: 0.01, firesSinceWar: 0, chiDrop: 0.02, damagedHa: null },
    status: { id: "harvestSoon", label: "Harvest soon", tone: "blue" },
    soil: { chernozemProbability: 0.83, soilTypeId: "chernozem" },
    season: [
      { date: "2026-06-01", ndvi: 0.7612, ndwi: 0.31, clearPct: 99 },
      { date: "2026-10-12", ndvi: 0.48, ndwi: 0.12, clearPct: 94 },
    ],
    normalCurve: [{ day: "10-01", low: 0.4, high: 0.6, median: 0.5 }],
    zones: { west: 37.5, south: 49.7, east: 37.6, north: 49.8, cols: 2, rows: 2, values: [0.9, 0.7, null, 0.3] },
    warnings: [],
    ...overrides,
  };
}

function fieldStore({ farm, analyses = {}, history = {}, reports = [], photos = {} } = {}) {
  const defaultFarm = {
    id: "farm-1",
    name: "Sunny Farm",
    location: { label: "Kupiansk", lat: 49.73, lon: 37.54 },
    units: "ha",
    demo: false,
    fields: [
      { id: "fld-aaaa1111", name: "Field 1", areaHa: 42.25, crop: "Winter wheat", source: "detected" },
      { id: "fld-bbbb2222", name: "Field 2", areaHa: 30, crop: null, source: "detected" },
      { id: "fld-cccc3333", name: "Field 13", areaHa: 12, crop: "Sunflower", source: "drawn" },
    ],
  };
  return {
    async getFarm() {
      return farm === undefined ? defaultFarm : farm;
    },
    async getFieldAnalysis(id) {
      return analyses[id] || null;
    },
    async getFieldHistory(id) {
      return history[id] || null;
    },
    async listReports() {
      return reports;
    },
    async getReport(id) {
      return reports.find((r) => r.id === id) || null;
    },
    async readPhoto(id) {
      return photos[id] ? { buffer: photos[id], type: "image/whatever" } : null;
    },
  };
}

const WEATHER = {
  current: { tempC: 11.6, code: 3, label: "Overcast" },
  rain: { likely: true, from: "2026-10-20", to: "2026-10-22", mm: 14.2 },
  daily: [{ date: "2026-10-18", tempMax: 13, tempMin: 4, rainMm: 0, rainChance: 10 }],
};

const recoveryAnalysis = analysis("fld-bbbb2222", {
  damage: { detected: true, radarChangedShare: 0.22, firesSinceWar: 5, chiDrop: 0.14, damagedHa: 6.6 },
  status: { id: "recovery", label: "Needs recovery", tone: "red" },
});

test("a farm at peace: no war wording, damage means fires above the usual rate", async () => {
  const iowa = {
    id: "farm-2",
    name: "Story County",
    location: { label: "Ames, Iowa", lat: 42.03, lon: -93.62 },
    units: "ha",
    demo: false,
    fields: [{ id: "fld-aaaa1111", name: "Field 1", areaHa: 42.25, crop: "Corn", source: "detected" }],
  };
  const burnt = analysis("fld-aaaa1111", {
    conflict: null,
    damage: { detected: false, radarChangedShare: 0.01, fires: 8, firesNormal: 8, excessFires: 0, since: "2024-10-18", chiDrop: 0.15, damagedHa: null },
  });
  const store = fieldStore({ farm: iowa, analyses: { "fld-aaaa1111": burnt }, history: { "fld-aaaa1111": { months: [{ month: "2026-07", ndvi: 0.8, ndwi: 0.3 }] } } });
  const ctx = await buildFieldContext({ store, getWeather: async () => null, today: "2026-10-18" });
  assert.match(ctx.text, /No war is recorded at this farm/);
  assert.match(ctx.text, /Damage: none detected \(radar change on 1% of the field, 0 fire detection\(s\) above the 2019 to 2021 rate since 2024-10-18 \(8 in all, 8 usual\)/);
  assert.doesNotMatch(ctx.text, /War damage|full-scale|24 Feb 2022|demining/);
  const detail = await ctx.runTool("get_field", { name_or_id: "Field 1" });
  assert.equal(detail.conflict, null);
  assert.doesNotMatch(detail.damage.note, /mines/);
  const history = await ctx.runTool("get_field_history", { name_or_id: "Field 1", months: 1 });
  assert.equal(history.war, null);
  assert.equal(history.warStarted, null);
});

test("the context text lists every field with status and readings, and says SAMPLE DATA", async () => {
  const store = fieldStore({
    analyses: { "fld-aaaa1111": analysis("fld-aaaa1111"), "fld-bbbb2222": recoveryAnalysis },
    reports: [
      { id: "rep-old", fieldId: "fld-aaaa1111", kind: "hail", text: "Hail on the east side", photos: [], createdAt: "2026-09-01T08:00:00Z" },
      { id: "rep-new", fieldId: "fld-bbbb2222", kind: "shelling", text: "Craters near the road", photos: ["p1"], createdAt: "2026-10-16T08:00:00Z" },
      { id: "rep-gone", fieldId: null, removedFieldName: "Field 9", kind: "pests", text: "Aphids", photos: [], createdAt: "2026-08-01T08:00:00Z" },
    ],
  });
  const ctx = await buildFieldContext({ store, getWeather: async () => WEATHER, today: "2026-10-18" });
  const text = ctx.text;
  assert.match(text, /Today: 2026-10-18/);
  assert.match(text, /Sunny Farm, Kupiansk, 49\.730° N, 37\.540° E\. 3 fields, 84\.3 ha in total/);
  assert.match(text, /SAMPLE DATA/);
  assert.match(text, /Field 1 \(id fld-aaaa1111\): Winter wheat, 42\.3 ha\. Status: Harvest soon\. Condition 82\/100 \(Good\)/);
  assert.match(text, /Plant health NDVI 0\.48 \(normal 0\.45 to 0\.60, normal\)/);
  assert.match(text, /ripening, ready in about 8 days; best window 2026-10-26 to 2026-11-02; rain forecast before it/);
  assert.match(text, /Field 2 .*Status: Needs recovery.*War damage: DETECTED .*about 6\.6 ha damaged; recovery \$627–\$1,914 fast path/);
  assert.match(text, /Field 13 .*Not analysed yet/);
  assert.match(text, /Soil: Chernozem \(black-soil probability 83%\)/);
  assert.match(text, /Weather now: 12°C, Overcast/);
  assert.match(text, /Rain likely 2026-10-20 to 2026-10-22, about 14\.2 mm/);
  // Reports newest first.
  assert.ok(text.indexOf("Craters near the road") < text.indexOf("Hail on the east side"));
  assert.match(text, /shelling: "Craters near the road" \(1 photo\)/);
  assert.match(text, /2026-08-01, Field 9 \(removed\), pests: "Aphids"/);
  assert.deepEqual(ctx.images, []);

  // Tool definitions are strict.
  assert.deepEqual(ctx.tools.map((t) => t.name), ["get_field", "get_field_history", "get_weather", "get_reports"]);
  for (const tool of FIELD_TOOLS) {
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.additionalProperties, false);
  }
});

test("real Earth Engine data is named, and acres are given when the farmer uses them", async () => {
  const store = fieldStore({
    farm: {
      name: "My farm",
      location: null,
      units: "acres",
      fields: [{ id: "fld-aaaa1111", name: "Field 1", areaHa: 10, crop: "Corn" }],
    },
    analyses: { "fld-aaaa1111": analysis("fld-aaaa1111", { provider: "gee" }) },
  });
  const ctx = await buildFieldContext({ store, getWeather: async () => null, today: "2026-10-18" });
  assert.match(ctx.text, /Google Earth Engine — real Sentinel-2/);
  assert.doesNotMatch(ctx.text, /SAMPLE DATA/);
  assert.match(ctx.text, /10 ha \(24\.7 acres\)/);
  assert.match(ctx.text, /give areas in that unit/);
  assert.match(ctx.text, /Weather: not available right now/);
});

test("no farm (or a store without farm functions) tells the farmer how to set one up", async () => {
  const empty = await buildFieldContext({ store: fieldStore({ farm: null }), getWeather: async () => WEATHER, today: "2026-10-18" });
  assert.match(empty.text, /has not set up a farm yet/);
  assert.deepEqual(await empty.runTool("get_field", { name_or_id: "Field 1" }), { error: "The farmer has not set up a farm yet." });
  const bare = await buildFieldContext({ store: {}, today: "2026-10-18" });
  assert.match(bare.text, /has not set up a farm yet/);
});

test("weather that hangs or fails does not block the chat", async () => {
  const store = fieldStore();
  const failed = await buildFieldContext({ store, getWeather: async () => { throw new Error("down"); }, today: "2026-10-18" });
  assert.match(failed.text, /Weather: not available/);
  assert.deepEqual(await failed.runTool("get_weather", {}), { error: "The weather forecast is not available right now." });
});

test("findField takes names, numbers and ids", () => {
  const fields = [
    { id: "fld-aaaa1111", name: "Field 1" },
    { id: "fld-cccc3333", name: "Field 13" },
    { id: "fld-dddd4444", name: "North meadow" },
  ];
  assert.equal(findField(fields, "Field 1").id, "fld-aaaa1111");
  assert.equal(findField(fields, "field 13").id, "fld-cccc3333");
  assert.equal(findField(fields, "13").id, "fld-cccc3333");
  assert.equal(findField(fields, "#1").id, "fld-aaaa1111");
  assert.equal(findField(fields, "fld-dddd4444").name, "North meadow");
  assert.equal(findField(fields, "meadow").id, "fld-dddd4444");
  assert.equal(findField(fields, "Field 7"), null);
  assert.equal(findField(fields, ""), null);
});

test("tools: get_field gives the full analysis, get_field_history adds the normal, get_reports and get_weather", async () => {
  const months = [
    { month: "2019-07", ndvi: 0.7, ndwi: 0.3, clearPct: 90 },
    { month: "2020-07", ndvi: 0.8, ndwi: 0.2, clearPct: 80 },
    { month: "2021-07", ndvi: 0.6, ndwi: 0.25, clearPct: 85 },
    { month: "2026-06", ndvi: 0.75, ndwi: 0.28, clearPct: 70 },
    { month: "2026-07", ndvi: 0.5, ndwi: 0.1, clearPct: 95 },
  ];
  const store = fieldStore({
    analyses: { "fld-aaaa1111": analysis("fld-aaaa1111"), "fld-bbbb2222": recoveryAnalysis },
    history: { "fld-aaaa1111": { fieldId: "fld-aaaa1111", months } },
    reports: [{ id: "rep-1", fieldId: "fld-bbbb2222", kind: "fire", text: "Stubble fire", photos: ["a", "b"], createdAt: "2026-10-01T00:00:00Z" }],
  });
  let weatherCalls = 0;
  const ctx = await buildFieldContext({ store, getWeather: async () => (weatherCalls++, WEATHER), today: "2026-10-18" });

  const one = await ctx.runTool("get_field", { name_or_id: "1" });
  assert.equal(one.field.name, "Field 1");
  assert.equal(one.status, "Harvest soon");
  assert.deepEqual(one.condition, { score: 82, class: "Good" });
  assert.equal(one.season[0].ndvi, 0.761);
  assert.equal(one.normalCurve.length, 1);
  assert.deepEqual(one.zones.shareOfFieldByCondition, { poor: 0.33, fair: 0, good: 0.33, great: 0.33 });
  assert.equal(one.soil.soilType, "Chernozem");
  assert.equal(one.damage.recoveryCostUsd, null);

  const two = await ctx.runTool("get_field", { name_or_id: "Field 2" });
  assert.deepEqual(two.damage.recoveryCostUsd, { fast: [627, 1914], full: [1716, 4092] });

  const missing = await ctx.runTool("get_field", { name_or_id: "Field 9" });
  assert.match(missing.error, /No field called "Field 9"\. The fields are: Field 1, Field 2, Field 13/);

  const history = await ctx.runTool("get_field_history", { name_or_id: "Field 1", months: 2 });
  assert.equal(history.warStarted, "2022-02-24");
  assert.equal(history.war.id, "ukraine-2022");
  assert.deepEqual(history.months, [
    { month: "2026-06", ndvi: 0.75, ndwi: 0.28, clearPct: 70, normalNdvi: null, normalNdwi: null },
    { month: "2026-07", ndvi: 0.5, ndwi: 0.1, clearPct: 95, normalNdvi: 0.7, normalNdwi: 0.25 },
  ]);
  const noHistory = await ctx.runTool("get_field_history", { name_or_id: "Field 2", months: 12 });
  assert.match(noHistory.error, /No monthly history for Field 2/);

  const reports = await ctx.runTool("get_reports", { limit: 50 });
  assert.deepEqual(reports.reports[0], { id: "rep-1", date: "2026-10-01T00:00:00Z", field: "Field 2", kind: "fire", text: "Stubble fire", photos: 2 });

  assert.deepEqual(await ctx.runTool("get_weather", {}), WEATHER);
  assert.equal(weatherCalls, 1); // loaded once, reused by the tool

  assert.match((await ctx.runTool("nope", {})).error, /Unknown tool/);
});

test("historyWithNormal averages the same month of 2019 to 2021 only", () => {
  const out = historyWithNormal([
    { month: "2019-03", ndvi: 0.2, ndwi: 0 },
    { month: "2021-03", ndvi: 0.4, ndwi: null },
    { month: "2022-03", ndvi: 0.9, ndwi: 0.5 },
  ]);
  assert.equal(out[2].normalNdvi, 0.3);
  assert.equal(out[2].normalNdwi, 0);
});

test("a report's photos come back as images: real types only, at most 4", async () => {
  assert.equal(imageTypeOf(PNG), "image/png");
  assert.equal(imageTypeOf(JPEG), "image/jpeg");
  assert.equal(imageTypeOf(WEBP), "image/webp");
  assert.equal(imageTypeOf(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);

  const photos = { p1: JPEG, p2: PNG, p3: Buffer.from("GIF89a not allowed here.."), p4: WEBP, p5: JPEG, p6: PNG };
  const report = { id: "rep-x", fieldId: "fld-aaaa1111", kind: "shelling", text: "Two craters", photos: ["p1", "p2", "p3", "gone", "p4", "p5", "p6"], createdAt: "2026-10-17T09:00:00Z" };
  const store = fieldStore({ reports: [report], photos });
  const ctx = await buildFieldContext({ store, reportId: "rep-x", getWeather: async () => null, today: "2026-10-18" });
  assert.deepEqual(ctx.images.map((i) => i.media_type), ["image/jpeg", "image/png", "image/webp", "image/jpeg"]);
  assert.equal(ctx.images[0].data, JPEG.toString("base64"));
  assert.match(ctx.text, /This chat is about the farmer's report: 2026-10-17, Field 1, shelling: "Two craters" \(7 photos\)/);
  assert.match(ctx.text, /Its 4 photos are attached above as images/);
  assert.match(ctx.text, /3 photos could not be shown/);

  const gone = await buildFieldContext({ store, reportId: "rep-missing", getWeather: async () => null, today: "2026-10-18" });
  assert.match(gone.text, /report that no longer exists/);
  assert.deepEqual(gone.images, []);

  const unsafe = await buildFieldContext({ store, reportId: "../etc/passwd", getWeather: async () => null, today: "2026-10-18" });
  assert.doesNotMatch(unsafe.text, /This chat is about|no longer exists/);
});

test("the new readings in words: detected crop, No crop, likely cause, pest risk, harvest basis", async () => {
  const farm = {
    id: "farm-3",
    name: "Story County",
    location: { label: "Ames, Iowa", lat: 42.03, lon: -93.62 },
    units: "ha",
    demo: false,
    fields: [
      { id: "fld-aaaa1111", name: "Field 1", areaHa: 40, crop: "Corn", cropSource: "detected", source: "detected" },
      { id: "fld-bbbb2222", name: "Field 2", areaHa: 30, crop: "Soybean", cropSource: "user", source: "detected" },
      { id: "fld-cccc3333", name: "Field 3", areaHa: 20, crop: null, cropSource: null, source: "drawn" },
    ],
  };
  const growing = analysis("fld-aaaa1111", {
    conflict: null,
    cropDetected: { id: "corn", label: "Corn", confidence: "likely", reason: "Greenest in early August" },
    stress: { applies: true, share: 0.08, level: "medium", stressedHa: 3.2, cause: "other", redEdge: true, patches: [{ lat: 42.03, lon: -93.62, radiusM: 60, ha: 1.2, cause: "other" }] },
    pestRisk: { disease: "high", insects: "medium", basis: { wetHours: 30, gdd14: 45 } },
    harvest: { stage: "growing", daysToReady: 25, basis: "heat units", gdd: { accumulated: 1100, needed: 1450, base: 10 }, window: { from: "2026-09-10", to: "2026-09-20" }, rainBefore: false, standingDry: false },
    status: { id: "healthy", label: "Healthy", tone: "green" },
  });
  const harvested = analysis("fld-bbbb2222", {
    conflict: null,
    stress: { applies: false, share: null, level: null, stressedHa: null, cause: null, redEdge: false, patches: [] },
    pestRisk: null,
    condition: { score: null, class: null },
    harvest: { stage: "harvested", radarHarvestOn: "2026-10-02", harvestedOn: "2026-10-02", basis: "radar" },
    status: { id: "harvested", label: "Harvested", tone: null },
  });
  const standing = analysis("fld-cccc3333", {
    conflict: null,
    cropDetected: { id: "soybean", label: "Soybean", confidence: "possible", reason: "" },
    harvest: { stage: "ready", daysToReady: 0, basis: "radar", standingDry: true },
    status: { id: "ready", label: "Ready to harvest", tone: "ink" },
  });
  const store = fieldStore({ farm, analyses: { "fld-aaaa1111": growing, "fld-bbbb2222": harvested, "fld-cccc3333": standing } });
  const ctx = await buildFieldContext({ store, getWeather: async () => null, today: "2026-08-15" });
  const text = ctx.text;
  assert.match(text, /Field 1 \(id fld-aaaa1111\): Corn \(detected from the satellite record, likely; not confirmed by the farmer\)/);
  assert.match(text, /Field 2 \(id fld-bbbb2222\): Soybean, 30 ha/);
  assert.match(text, /Field 3 \(id fld-cccc3333\): Soybean \(detected from the satellite record, possible/);
  assert.match(text, /Stress medium, 8% of the field \(3\.2 ha\); likely cause: Not water: check for pests or disease; the red edge/);
  assert.match(text, /Pest and disease risk from the weather \(a forecast, not a detection\): Disease risk high this week \(30 wet hours/);
  assert.match(text, /still growing, ready in about 25 days \(from heat units \(growing degree-days\) since green-up\); 1100 of about 1450 degree-days \(base 10 °C\)/);
  assert.match(text, /Field 2 .*Condition: none \(harvested, no crop to score\)\. .*Stress: No crop/);
  assert.match(text, /harvested \(the radar saw the crop cut on 2026-10-02\)/);
  assert.match(text, /dried down but still standing: the radar shows no cut/);
  assert.doesNotMatch(text, /\(Poor\)/);
  const detail = await ctx.runTool("get_field", { name_or_id: "Field 1" });
  assert.equal(detail.field.cropSource, "detected");
  assert.equal(detail.cropDetected.id, "corn");
  assert.equal(detail.pestRisk.line, "Disease risk high this week");
  assert.equal(detail.stress.causeLabel, "Not water: check for pests or disease");
  const two = await ctx.runTool("get_field", { name_or_id: "Field 2" });
  assert.match(two.stress.note, /No crop/);
});
