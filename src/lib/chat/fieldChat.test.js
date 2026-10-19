// Tests for fieldChat.js (the wording on the Field AI page).
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { starterFields, latestPass, sourceRow, weatherLine, reportRow, reportLine, reportFirstQuestion } from "./fieldChat.js";
import { fieldSuggestions, REPORT_KINDS, reportKind } from "../../data/chats.js";

const farm = {
  fields: [
    { id: "a", name: "Field 1" },
    { id: "b", name: "Field 2" },
    { id: "c", name: "Field 3" },
    { id: "d", name: "Field 4" },
  ],
};
const analyses = {
  a: { status: { id: "watch" }, latestPass: { date: "2026-10-11" } },
  b: { status: { id: "harvestSoon" }, harvest: { daysToReady: 5 }, latestPass: { date: "2026-10-16" } },
  c: { status: { id: "harvestSoon" }, harvest: { daysToReady: 2 }, latestPass: null },
  d: { status: { id: "recovery" } },
};

test("the starters name the field that most needs work and the one nearest harvest", () => {
  assert.deepEqual(starterFields(farm, analyses), { urgent: "Field 4", harvest: "Field 3" });
  const ready = { ...analyses, a: { status: { id: "ready" } } };
  assert.deepEqual(starterFields(farm, ready), { urgent: "Field 4", harvest: "Field 1" });
  const calm = { a: { status: { id: "healthy" } } };
  assert.deepEqual(starterFields(farm, calm), { urgent: null, harvest: null });
  assert.deepEqual(starterFields(null, {}), { urgent: null, harvest: null });
});

test("there are always four starters, named when there is a field to name", () => {
  const named = fieldSuggestions({ urgent: "Field 7", harvest: "Field 3" });
  assert.equal(named.length, 4);
  assert.equal(named[0], "What should I do on Field 7?");
  assert.equal(named[1], "When should I harvest Field 3?");
  const plain = fieldSuggestions();
  assert.equal(plain.length, 4);
  assert.equal(plain[0], "Which field needs me first?");
});

test("the source line shows the newest pass and says when it is sample data", () => {
  assert.equal(latestPass(analyses), "2026-10-16");
  assert.equal(latestPass({}), null);
  assert.deepEqual(sourceRow({ id: "gee" }, analyses), { label: "Sentinel-2", value: "Oct 16" });
  assert.deepEqual(sourceRow({ id: "sample" }, analyses), { label: "Sample data", value: "Oct 16" });
  assert.deepEqual(sourceRow(null, {}), { label: "Sample data", value: "–" });
});

test("the weather line is the temperature and the sky, or nothing", () => {
  assert.equal(weatherLine({ current: { tempC: 12.6, label: "Cloudy" } }), "13° · Cloudy");
  assert.equal(weatherLine({ current: { tempC: 4 } }), "4°");
  assert.equal(weatherLine(null), null);
});

test("a report becomes one line and a first question", () => {
  const report = { id: "rep-1", fieldId: "d", kind: "shelling", text: "Craters", photos: ["p1", "p2"] };
  assert.deepEqual(reportRow(report, farm), { label: "Shelling", value: "Field 4 · 2 photos" });
  assert.equal(reportFirstQuestion(report, farm), "I reported shelling on Field 4. What should I do now?");
  const farmWide = { id: "rep-2", fieldId: null, kind: "other", text: "", photos: [] };
  assert.deepEqual(reportRow(farmWide, farm), { label: "Other", value: "Whole farm" });
  assert.equal(reportFirstQuestion(farmWide, farm), "I reported a problem on my farm. What should I do now?");
  const gone = { id: "rep-3", fieldId: "zz", removedFieldName: "Field 9", kind: "fire", photos: ["p"] };
  assert.deepEqual(reportRow(gone, farm), { label: "Fire", value: "Field 9 · 1 photo" });
  assert.equal(reportRow(null, farm), null);
  assert.equal(reportLine(report, farm), "Shelling · Field 4 · 2 photos");
  assert.equal(reportLine(null, farm), null);
});

test("one list of report kinds, with unknown kinds counted as other", () => {
  assert.deepEqual(
    REPORT_KINDS.map((kind) => kind.id),
    ["shelling", "fire", "flood", "hail", "pests", "other"]
  );
  for (const kind of REPORT_KINDS) assert.ok(kind.label && kind.phrase);
  assert.equal(reportKind("hail").label, "Hail");
  assert.equal(reportKind("meteor").id, "other");
  assert.equal(reportKind(undefined).phrase, "a problem");
});
