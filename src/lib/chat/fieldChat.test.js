// Tests for fieldChat.js (the wording on the Field AI page).
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { starterFields, latestPass, sourceRow, weatherLine, reportRow, reportLine, reportFirstQuestion, reportMessage, localDay, reportChatStep } from "./fieldChat.js";
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
  assert.equal(plain[3], "Is any field damaged?");
  // On a peaceful farm the last starter asks about stress, not damage.
  assert.equal(fieldSuggestions({ peace: true })[3], "Is any field under stress?");
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

test("the report becomes the chat's first message: what was chosen, written and photographed", () => {
  const report = { id: "rep-1", fieldId: "d", kind: "shelling", text: "  Craters in the north corner after last night.  ", photos: ["p1", "p2"], createdAt: "2026-10-24T12:18:25.818Z" }; // midday UTC: 24 October wherever the test runs (the day shown is the farmer's own: see the Kyiv test below)
  const url = (id) => `/api/farm/uploads/${id}`;
  assert.deepEqual(reportMessage(report, farm, url), {
    kind: "Shelling",
    where: "Field 4",
    text: "Craters in the north corner after last night.",
    photos: [
      { id: "p1", url: "/api/farm/uploads/p1", alt: "Photo 1 of 2" },
      { id: "p2", url: "/api/farm/uploads/p2", alt: "Photo 2 of 2" },
    ],
    when: "Oct 24",
  });
  // Nothing written, no photos, the whole farm, no date: still a message.
  assert.deepEqual(reportMessage({ id: "rep-2", kind: "other", photos: [] }, farm), { kind: "Other", where: "Whole farm", text: "", photos: [], when: null });
  // A removed field keeps its name; odd photo ids are left out.
  const gone = reportMessage({ id: "rep-3", fieldId: "zz", removedFieldName: "Field 9", kind: "fire", photos: ["p", 7, ""] }, farm);
  assert.equal(gone.where, "Field 9");
  assert.deepEqual(gone.photos.map((p) => p.id), ["p"]);
  assert.equal(gone.photos[0].url, null);
  assert.equal(reportMessage(null, farm, url), null);
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

test("a report's day is the farmer's own day, not the UTC one", () => {
  const before = process.env.TZ;
  try {
    // 23:30 UTC on 1 November is 01:30 on 2 November in Kyiv.
    process.env.TZ = "Europe/Kyiv";
    assert.equal(localDay("2026-11-01T23:30:00.000Z"), "2026-11-02");
    assert.equal(reportMessage({ id: "r", kind: "shelling", photos: [], createdAt: "2026-11-01T23:30:00.000Z" }, { fields: [] }).when, "Nov 2");
    // Midday is the same day everywhere near Ukraine.
    assert.equal(localDay("2026-11-01T12:00:00.000Z"), "2026-11-01");
    process.env.TZ = "America/Chicago";
    assert.equal(localDay("2026-11-01T03:00:00.000Z"), "2026-10-31");
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
  assert.equal(localDay("not a date"), null);
  assert.equal(localDay(""), null);
  assert.equal(localDay(undefined), null);
});

test("a report stays only with the chat its own question created", () => {
  // Arriving from "Tell us what happened": a new chat, the question goes by itself.
  assert.equal(reportChatStep({ reportId: "rep-1", chatId: null }), "keep");
  // That question created chat-9: the report stays with it.
  assert.equal(reportChatStep({ reportId: "rep-1", chatId: "chat-9", created: "chat-9" }), "adopt");
  assert.equal(reportChatStep({ reportId: "rep-1", chatId: "chat-9", adopted: "chat-9", created: "chat-9" }), "keep");
  // The assistant could not answer (no key, its limit, an error), so no chat
  // was created, and the farmer opens a saved chat: the report must not
  // join it (it would show at its top and go to the assistant with it).
  assert.equal(reportChatStep({ reportId: "rep-1", chatId: "chat-old" }), "drop");
  // After the report's own chat: another chat, or a new one, lets it go.
  assert.equal(reportChatStep({ reportId: "rep-1", chatId: "chat-old", adopted: "chat-9", created: "chat-9" }), "drop");
  assert.equal(reportChatStep({ reportId: "rep-1", chatId: null, adopted: "chat-9" }), "drop");
  // A reload of /field/ai?report=rep-1&chat=chat-9: nothing was created on
  // this page; the address lets the report go and the saved chat shows its
  // own report (the server keeps it with the chat).
  assert.equal(reportChatStep({ reportId: "rep-1", chatId: "chat-9" }), "drop");
  // No report in the address.
  assert.equal(reportChatStep({ reportId: null, chatId: "chat-9", adopted: "chat-9" }), "reset");
});
