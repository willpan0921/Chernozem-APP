// Tests for overview.js (the Field overview's status sentence and "What
// needs doing"). Run with npm test.

import test from "node:test";
import assert from "node:assert/strict";
import { fieldNames, latestPass, likelyRain, needsDoing, shortUsd, showRecoveryTile, statusSentence, usdRange } from "./overview.js";

const STATUS = {
  recovery: { id: "recovery", label: "Needs recovery", tone: "red" },
  ready: { id: "ready", label: "Ready to harvest", tone: "ink" },
  harvestSoon: { id: "harvestSoon", label: "Harvest soon", tone: "blue" },
  harvested: { id: "harvested", label: "Harvested", tone: null },
  notSown: { id: "notSown", label: "Not sown", tone: null },
  watch: { id: "watch", label: "Watch", tone: "amber" },
  healthy: { id: "healthy", label: "Healthy", tone: "green" },
  fallow: { id: "fallow", label: "Fallow or grass", tone: null },
  driedDown: { id: "driedDown", label: "Dried down", tone: null },
  unknown: { id: "unknown", label: "No clear image yet", tone: null },
};

function analysis(status, extra = {}) {
  return {
    status: STATUS[status],
    stress: { level: "low", stressedHa: 0 },
    harvest: {},
    damage: { detected: status === "recovery", damagedHa: null },
    plantHealth: { versus: "normal" },
    water: { versus: "normal" },
    condition: { class: "great" },
    latestPass: { date: "2026-10-16" },
    ...extra,
  };
}

// The demo farm as the sample provider analyses it on 2026-10-18.
function demoFarm() {
  const fields = [
    ["f1", 54.56], ["f2", 54.58], ["f3", 57.95], ["f4", 32.2], ["f5", 62.32], ["f6", 29.79], ["f7", 44.76],
  ].map(([id, areaHa], i) => ({ id, name: `Field ${i + 1}`, areaHa }));
  const farm = { name: "Demo farm", units: "ha", fields };
  const analyses = {
    f1: analysis("harvested"),
    f2: analysis("ready", { harvest: { stage: "ready", window: { from: "2026-10-18", to: "2026-10-28" }, rainBefore: true } }),
    f3: analysis("watch", { plantHealth: { versus: "below" }, water: { versus: "below" }, condition: { class: "good" }, stress: { level: "low", stressedHa: 0.58 } }),
    f4: analysis("harvestSoon", { harvest: { stage: "ripening", daysToReady: 1, window: { from: "2026-10-19", to: "2026-10-29" }, rainBefore: true } }),
    f5: analysis("ready", { harvest: { stage: "ready", window: { from: "2026-10-18", to: "2026-10-28" }, rainBefore: true } }),
    f6: analysis("harvested"),
    f7: analysis("recovery", { damage: { detected: true, damagedHa: 20.5 }, condition: { class: "fair" } }),
  };
  return { farm, analyses };
}

const WEATHER = { rain: { likely: true, from: "2026-10-19", to: "2026-10-19", mm: 4 } };

test("the demo farm's status sentence", () => {
  const { farm, analyses } = demoFarm();
  assert.deepEqual(statusSentence(farm, analyses), { text: "1 field needs recovery · 1 to watch · 2 ready to harvest · 1 harvest soon · 2 harvested", tone: "red" });
});

test("the demo farm's five things to do, in order", () => {
  const { farm, analyses } = demoFarm();
  const items = needsDoing({ farm, analyses, weather: WEATHER, job: null });
  assert.deepEqual(
    items.map((item) => item.title),
    ["Field 7 needs recovery", "Field 2 is ready to harvest", "Field 5 is ready to harvest", "Field 4 ready to harvest in 1 day", "Plant health below normal in Field 3"]
  );
  const recovery = items[0];
  assert.equal(recovery.amount, "20.5 ha damaged");
  assert.deepEqual(recovery.costs, [
    { id: "fast", label: "Quick fix", value: "$1.9k–5.9k" },
    { id: "full", label: "Full restore", value: "$5.3k–12.7k" },
  ]);
  assert.equal(recovery.costNote, "Planning assumption (not sourced)");
  assert.equal(recovery.action.to, "/field/ai?about=f7");
  assert.equal(items[1].line, "Before the rain on Oct 19");
  assert.equal(items[1].action.to, "/field/fields?field=f2");
  assert.equal(items[3].line, "Harvest before the rain on Oct 19");
});

test("fields with no crop are never counted as growing well", () => {
  const { farm } = demoFarm();
  const analyses = {};
  farm.fields.forEach((field, i) => (analyses[field.id] = analysis(i < 4 ? "harvested" : i < 6 ? "healthy" : "ready")));
  assert.deepEqual(statusSentence(farm, analyses), { text: "1 ready to harvest · 2 growing well · 4 harvested", tone: "green" });
  for (const field of farm.fields) analyses[field.id] = analysis("harvested");
  assert.equal(statusSentence(farm, analyses).text, "All 7 fields harvested");
  analyses.f1 = analysis("notSown");
  assert.equal(statusSentence(farm, analyses).text, "6 harvested · 1 not sown");
  analyses.f2 = analysis("watch");
  assert.equal(statusSentence(farm, analyses).text, "1 field to watch · 5 harvested · 1 not sown");
});

test("all fields growing well", () => {
  const { farm, analyses } = demoFarm();
  for (const id of Object.keys(analyses)) analyses[id] = analysis("healthy");
  assert.deepEqual(statusSentence(farm, analyses), { text: "All 7 fields growing well", tone: "green" });
  assert.deepEqual(needsDoing({ farm, analyses }), []);
  const one = { units: "ha", fields: [farm.fields[0]] };
  assert.equal(statusSentence(one, analyses).text, "Your field is growing well");
});

test("fields waiting for analysis", () => {
  const { farm, analyses } = demoFarm();
  assert.deepEqual(statusSentence(farm, {}), { text: "7 fields waiting for analysis", tone: "green" });
  const some = { f1: analyses.f1, f6: analyses.f6 };
  assert.equal(statusSentence(farm, some).text, "All 2 fields harvested · 5 waiting for analysis");
  const withWatch = { f3: analyses.f3 };
  assert.deepEqual(statusSentence(farm, withWatch), { text: "1 field to watch · 6 waiting for analysis", tone: "amber" });
  assert.deepEqual(needsDoing({ farm, analyses: {} }), []);
});

test("several damaged fields make one recovery item", () => {
  const { farm, analyses } = demoFarm();
  analyses.f6 = analysis("recovery", { damage: { detected: true, damagedHa: 9.5 } });
  assert.equal(statusSentence(farm, analyses).text, "2 fields need recovery · 1 to watch · 2 ready to harvest · 1 harvest soon · 1 harvested");
  const recovery = needsDoing({ farm, analyses }).find((item) => item.id === "recovery");
  assert.equal(recovery.title, "Fields 6 and 7 need recovery");
  assert.equal(recovery.amount, "30 ha damaged");
  assert.equal(recovery.action.to, "/field/ai?about=f6");
});

test("explosives are mentioned only inside a known war", () => {
  const { farm, analyses } = demoFarm();
  const line = () => needsDoing({ farm, analyses }).find((item) => item.id === "recovery").line;
  assert.equal(line(), "Check it on the ground first");
  analyses.f7.conflict = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  assert.equal(line(), "Have it checked for explosives first");
});

test("unknown damaged area falls back to the field area, 'to check'", () => {
  const { farm, analyses } = demoFarm();
  analyses.f7 = analysis("recovery", { damage: { detected: true, damagedHa: null } });
  const recovery = needsDoing({ farm, analyses }).find((item) => item.id === "recovery");
  assert.equal(recovery.amount, "44.8 ha to check");
});

test("ready fields with rain coming come first", () => {
  const { farm, analyses } = demoFarm();
  analyses.f2.harvest.rainBefore = false;
  const ready = needsDoing({ farm, analyses, weather: WEATHER }).filter((item) => item.id.startsWith("ready-"));
  assert.deepEqual(ready.map((item) => item.fieldId), ["f5", "f2"]);
  assert.equal(ready[0].line, "Before the rain on Oct 19");
  assert.equal(ready[1].line, "Best by Oct 28");
  // Without a forecast there is no rain line.
  const dry = needsDoing({ farm, analyses }).find((item) => item.id === "ready-f5");
  assert.equal(dry.line, "Best by Oct 28");
});

test("a failed update comes first, with Try again", () => {
  const { farm, analyses } = demoFarm();
  const items = needsDoing({ farm, analyses, job: { status: "error", error: "Earth Engine timed out." } });
  assert.deepEqual(items[0], {
    id: "update-failed",
    tone: "red",
    icon: "alert",
    title: "The last update failed",
    line: "Earth Engine timed out.",
    action: { label: "Try again", run: "analyze" },
  });
  assert.equal(needsDoing({ farm, analyses, job: { status: "running" } })[0].id, "recovery");
});

test("stress and the other watch reasons", () => {
  const { farm, analyses } = demoFarm();
  analyses.f3.stress = { level: "medium", share: 0.15, stressedHa: 2.1, patches: [{ lat: 0, lon: 0, radiusM: 50, ha: 2.1 }] };
  analyses.f2.stress = { level: "medium", share: 0.072, stressedHa: 0.2, patches: [] };
  analyses.f1 = analysis("watch", { water: { versus: "below" } });
  analyses.f6 = analysis("unknown");
  const titles = needsDoing({ farm, analyses }).map((item) => item.title);
  assert.ok(titles.includes("Stress on 2.1 ha in Field 3"));
  assert.ok(!titles.includes("Plant health below normal in Field 3"), "a stressed field is listed once");
  assert.ok(titles.includes("Field 1 is drier than normal"));
  assert.ok(titles.includes("No clear image of Field 6 yet"));
});

test("money, names, rain and the latest pass", () => {
  assert.equal(shortUsd(1948), "$1.9k");
  assert.equal(shortUsd(12710), "$12.7k");
  assert.equal(shortUsd(640), "$640");
  assert.equal(shortUsd(1.24e6), "$1.2M");
  assert.equal(shortUsd(NaN), "–");
  assert.equal(usdRange([1948, 5945]), "$1.9k–5.9k");
  assert.equal(fieldNames([{ name: "Field 7" }]), "Field 7");
  assert.equal(fieldNames([{ name: "Field 1" }, { name: "Field 2" }, { name: "Field 5" }]), "Fields 1, 2 and 5");
  assert.equal(fieldNames([{ name: "North" }, { name: "South" }]), "North and South");
  assert.equal(likelyRain(WEATHER).mm, 4);
  assert.equal(likelyRain({ rain: { likely: false, from: "2026-10-19" } }), null);
  assert.equal(likelyRain(null), null);
  const { farm, analyses } = demoFarm();
  analyses.f3.latestPass = { date: "2026-10-17" };
  assert.equal(latestPass(farm, analyses), "2026-10-17");
  assert.equal(latestPass(farm, {}), null);
});

test("new fields being analysed", () => {
  const { farm, analyses } = demoFarm();
  const more = { ...farm, fields: [...farm.fields, { id: "f8", name: "Field 8", areaHa: 12 }] };
  const job = { status: "running", kind: "field-analyze", fieldIds: ["f8"] };
  assert.match(statusSentence(more, analyses, job).text, /1 being analysed$/);
  assert.match(statusSentence(more, analyses).text, /1 waiting for analysis$/);
  const fresh = { fields: [{ id: "n1", name: "Field 1" }, { id: "n2", name: "Field 2" }] };
  assert.equal(statusSentence(fresh, {}, { status: "running", kind: "field-analyze" }).text, "2 fields being analysed");
});

test("a peaceful farm hides the empty recovery tile", () => {
  assert.equal(showRecoveryTile({ recovery: 0 }, null), false);
  assert.equal(showRecoveryTile({ recovery: 0 }, undefined), false);
  assert.equal(showRecoveryTile({ recovery: 0 }, { id: "ukraine-2022" }), true);
  assert.equal(showRecoveryTile({ recovery: 1 }, null), true);
});

test("stress says its likely cause; a high pest risk is one item", () => {
  const farm = { units: "ha", fields: [{ id: "a", name: "Field 1" }, { id: "b", name: "Field 2" }] };
  const analyses = {
    a: analysis("watch", { stress: { level: "medium", stressedHa: 2, cause: "other" }, pestRisk: { disease: "high", insects: "low" } }),
    b: analysis("healthy", { pestRisk: { disease: "high", insects: "medium" } }),
  };
  const items = needsDoing({ farm, analyses });
  const stress = items.find((item) => item.id === "stress-a");
  assert.equal(stress.line, "Not water: check for pests or disease");
  const risk = items.find((item) => item.id === "pest-risk");
  assert.equal(risk.title, "Disease risk high this week");
  assert.equal(risk.line, "Fields 1 and 2 · from the weather, check on the ground");
  assert.equal(needsDoing({ farm, analyses: { a: analysis("healthy", { pestRisk: { disease: "medium", insects: "low" } }) } }).some((item) => item.id === "pest-risk"), false);
});

test("fallow and dried-down fields are 'no crop', in the sentence and the counts", () => {
  const { farm } = demoFarm();
  const analyses = {};
  farm.fields.forEach((field, i) => (analyses[field.id] = analysis(["harvested", "harvested", "fallow", "driedDown", "ready", "ready", "watch"][i])));
  assert.deepEqual(statusSentence(farm, analyses), { text: "1 field to watch · 2 ready to harvest · 2 harvested · 1 fallow or grass · 1 dried down", tone: "amber" });
  for (const field of farm.fields) analyses[field.id] = analysis("fallow");
  assert.equal(statusSentence(farm, analyses).text, "All 7 fields fallow or grass");
  // Saved before the fallow status existed: still never "growing well".
  for (const field of farm.fields) analyses[field.id] = analysis("healthy", { harvest: { stage: "growing", fallow: true } });
  assert.equal(statusSentence(farm, analyses).text, "All 7 fields fallow or grass");
  analyses.f1 = analysis("healthy", { harvest: { stage: "growing", dryDown: "dry", cropUnknown: true } });
  assert.equal(statusSentence(farm, analyses).text, "6 fallow or grass · 1 dried down");
});

test("stress with no patch on the map is spread across the field", () => {
  const { farm, analyses } = demoFarm();
  analyses.f3 = analysis("watch", { stress: { level: "medium", stressedHa: 9, patches: [], cause: "other" } });
  const item = needsDoing({ farm, analyses }).find((entry) => entry.id === "stress-f3");
  assert.equal(item.line, "Spread across the field");
  analyses.f3.stress.patches = [{ lat: 1, lon: 2, radiusM: 30, ha: 1, cause: "dry" }];
  analyses.f3.stress.cause = "dry";
  assert.equal(needsDoing({ farm, analyses }).find((entry) => entry.id === "stress-f3").line, "Dry patch");
});

// Polish round 2: the sentence names each status inside "In crop".
test("ready, harvest soon and growing well are named apart; a crop unclear is to watch", () => {
  const { farm } = demoFarm();
  const analyses = {};
  farm.fields.forEach((field, i) => (analyses[field.id] = analysis(i < 5 ? "ready" : i < 6 ? "healthy" : "driedDown")));
  assert.equal(statusSentence(farm, analyses).text, "5 ready to harvest · 1 growing well · 1 dried down");
  analyses.f6 = analysis("unclear", { status: { id: "unclear", label: "Crop unclear", tone: null } });
  assert.equal(statusSentence(farm, analyses).text, "1 field to watch · 5 ready to harvest · 1 dried down");
  const item = needsDoing({ farm, analyses }).find((x) => x.fieldId === "f6");
  assert.equal(item.title, "Field 6: crop unclear");
  assert.equal(item.action.to, "/field/settings");
});
