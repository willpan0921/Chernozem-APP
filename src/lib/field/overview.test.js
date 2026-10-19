// Tests for overview.js (the Field overview's status sentence and "What
// needs doing"). Run with npm test.

import test from "node:test";
import assert from "node:assert/strict";
import { fieldNames, latestPass, likelyRain, needsDoing, shortUsd, statusSentence, usdRange } from "./overview.js";

const STATUS = {
  recovery: { id: "recovery", label: "Needs recovery", tone: "red" },
  ready: { id: "ready", label: "Ready to harvest", tone: "ink" },
  harvestSoon: { id: "harvestSoon", label: "Harvest soon", tone: "blue" },
  harvested: { id: "harvested", label: "Harvested", tone: null },
  watch: { id: "watch", label: "Watch", tone: "amber" },
  healthy: { id: "healthy", label: "Healthy", tone: "green" },
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
  assert.deepEqual(statusSentence(farm, analyses), { text: "1 field needs recovery · 1 to watch · 2 ready to harvest", tone: "red" });
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
  assert.equal(recovery.action.to, "/field/ai?about=f7");
  assert.equal(items[1].line, "Before the rain on Oct 19");
  assert.equal(items[1].action.to, "/field/fields?field=f2");
  assert.equal(items[3].line, "Harvest before the rain on Oct 19");
});

test("all fields healthy", () => {
  const { farm, analyses } = demoFarm();
  for (const id of Object.keys(analyses)) analyses[id] = analysis("healthy");
  assert.deepEqual(statusSentence(farm, analyses), { text: "All 7 fields healthy", tone: "green" });
  assert.deepEqual(needsDoing({ farm, analyses }), []);
  const one = { units: "ha", fields: [farm.fields[0]] };
  assert.equal(statusSentence(one, analyses).text, "Your field is healthy");
});

test("fields waiting for analysis", () => {
  const { farm, analyses } = demoFarm();
  assert.deepEqual(statusSentence(farm, {}), { text: "7 fields waiting for analysis", tone: "green" });
  const some = { f1: analyses.f1, f6: analyses.f6 };
  assert.equal(statusSentence(farm, some).text, "All 2 fields healthy · 5 waiting for analysis");
  const withWatch = { f3: analyses.f3 };
  assert.deepEqual(statusSentence(farm, withWatch), { text: "1 field to watch · 6 waiting for analysis", tone: "amber" });
  assert.deepEqual(needsDoing({ farm, analyses: {} }), []);
});

test("several damaged fields make one recovery item", () => {
  const { farm, analyses } = demoFarm();
  analyses.f6 = analysis("recovery", { damage: { detected: true, damagedHa: 9.5 } });
  assert.equal(statusSentence(farm, analyses).text, "2 fields need recovery · 1 to watch · 2 ready to harvest");
  const recovery = needsDoing({ farm, analyses }).find((item) => item.id === "recovery");
  assert.equal(recovery.title, "Fields 6 and 7 need recovery");
  assert.equal(recovery.amount, "30 ha damaged");
  assert.equal(recovery.action.to, "/field/ai?about=f6");
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
  analyses.f3.stress = { level: "medium", stressedHa: 2.1 };
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
