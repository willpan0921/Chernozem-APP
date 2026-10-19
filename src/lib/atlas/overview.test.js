// WHAT THIS FILE DOES
// Checks the Overview rules in overview.js against a generated run. Run with:
//   node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes the rules behind the overview.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlaces } from "./scoring.js";
import { groupHotspots } from "./hotspots.js";
import { atPeace, describeAlert, imageryText, kpis, nextSteps, recoveryCost, ruleText, shownNewDamage, sourceBadge, springPlan, summarize, timeframeLabel, timeframeOptions, weightsText } from "./overview.js";
import { runsComparable } from "./method.js";
import { makePlaces } from "./testPlaces.js";

const { places, settings } = scorePlaces(makePlaces(12, 12));
const hotspots = groupHotspots(places, "nearTerm", { count: 5, cellSizeDeg: 0.25 });
const run = {
  id: "run-abc",
  month: "2026-09",
  label: "September 2026",
  imagery: { from: "2026-04", to: "2026-09" },
  baseline: { label: "2019 to 2021" },
};
const alerts = [
  { id: "alert-1", kind: "radar", date: "2026-09-24", place: "48.59° N, 38.00° E", cellIds: ["r3c11"], magnitude: 3.24, unit: "km² changed" },
  { id: "alert-2", kind: "fire", date: "2026-09-21", place: "47.10° N, 37.50° E", cellIds: ["r8c10"], magnitude: 14, unit: "detections" },
];

test("summarize adds up the squares", () => {
  const summary = summarize(places);
  assert.equal(summary.cellCount, 144);
  const cropland = places.reduce((total, p) => total + p.croplandHa, 0);
  assert.ok(Math.abs(summary.croplandHa - cropland) < 1e-6);
  assert.ok(summary.heavyDamageHa > 0 && summary.heavyDamageHa < summary.blackSoilHa);
  assert.ok(summary.blackSoilHa < summary.croplandHa);
});

test("the four big numbers are short and labelled", () => {
  const list = kpis({ croplandHa: 31_200_000, blackSoilHa: 16_100_000, heavyDamageHa: 1_860_000, peopleOnDamagedSoil: 3_560_000 });
  assert.deepEqual(list.map((k) => k.value), ["31.2M ha", "16.1M ha", "1.9M ha", "3.56M"]);
  assert.deepEqual(list.map((k) => k.label), ["Cropland analyzed", "Black-soil cropland", "Heavily damaged", "People on damaged land"]);
  // A farm reads in plain hectares.
  assert.deepEqual(kpis({ croplandHa: 31.4, blackSoilHa: 27.2, heavyDamageHa: 8.04, peopleOnDamagedSoil: 3 }).map((k) => k.value), ["31 ha", "27 ha", "8 ha", "3"]);
  // The damage number is red in a war, neutral at peace (Moldova, real data).
  const tone = (run) => kpis({ croplandHa: 1, blackSoilHa: 1, heavyDamageHa: 3187, peopleOnDamagedSoil: 0 }, run).find((k) => k.id === "heavy-damage").tone;
  assert.equal(tone({ id: "r", conflict: { id: "ukraine-2022" } }), "red");
  assert.equal(tone({ id: "r" }), "red", "older runs were made in a war");
  assert.equal(tone({ id: "r", conflict: null }), undefined);
});

test("next steps come from the top areas and the radar alerts", () => {
  const steps = nextSteps({ run, hotspots, alerts, settings });
  assert.deepEqual(
    steps.map((s) => s.icon),
    ["shield", "alert", "soil", "report"]
  );
  assert.equal(steps[0].title, `Fund demining surveys in ${hotspots[0].label} and ${hotspots[1].label}`);
  assert.equal(steps[0].to, `/atlas/map?focus=${hotspots[0].id}`);
  assert.equal(steps[1].title, "Review new damage near 48.59° N, 38.00° E");
  assert.equal(steps[1].due, "2026-10-01");
  assert.match(steps[1].to, /focus=r3c11/);
  assert.equal(steps[3].title, "Send the September report");
  assert.equal(steps[3].due, "2026-10-01");
  // Ids stay the same when the weights (and so the top areas) change.
  const other = nextSteps({ run, hotspots: hotspots.slice().reverse(), alerts });
  assert.deepEqual(other.map((s) => s.id), steps.map((s) => s.id));
});

test("at peace: no demining, no 'new damage', no war words", () => {
  const peaceRun = { ...run, conflict: null, accessSource: "none" };
  assert.equal(atPeace(peaceRun), true);
  assert.equal(atPeace(run), false, "older runs (no conflict field) were made in a war");
  const steps = nextSteps({ run: peaceRun, hotspots, alerts, settings });
  assert.equal(steps[0].title, `Plan soil surveys in ${hotspots[0].label} and ${hotspots[1].label}`);
  assert.equal(steps[1].title, "Check the radar change near 48.59° N, 38.00° E");
  assert.equal(steps[1].tone, "amber");
  assert.equal(steps[2].title, `Test soil in ${hotspots[2].label}`);
  for (const step of steps) assert.doesNotMatch(step.title, /demining|cleared|damage/i);
  // Same ids as in a war, so ticked steps stay ticked.
  assert.deepEqual(steps.map((s) => s.id), nextSteps({ run, hotspots, alerts }).map((s) => s.id));
  assert.match(ruleText("nearTerm", settings, peaceRun), /nothing is set aside/);
  assert.doesNotMatch(ruleText("nearTerm", settings, peaceRun), /nearest the fighting/);
  assert.match(ruleText("nearTerm", settings, run), /nearest the fighting/);
  // With an ACLED file, battles are measured even at peace.
  assert.match(ruleText("nearTerm", settings, { ...peaceRun, accessSource: "acled" }), /set aside/);
  assert.equal(timeframeLabel("postwar", peaceRun), "Long term");
  assert.equal(timeframeLabel("postwar", run), "Postwar");
  assert.deepEqual(timeframeOptions(peaceRun).map((o) => o.label), ["Near term", "Long term"]);
});

test("no run, no steps; no top areas, only the report", () => {
  assert.deepEqual(nextSteps({ run: null }), []);
  assert.deepEqual(nextSteps({ run, hotspots: [], alerts: [] }).map((s) => s.icon), ["report"]);
});

test("alerts read plainly", () => {
  assert.deepEqual(describeAlert(alerts[0]), {
    title: "Radar change",
    place: "48.59° N, 38.00° E",
    detail: "Sep 24 · 3.2 km² changed",
    tone: "amber",
    icon: "radar",
  });
  assert.equal(describeAlert(alerts[1]).detail, "Sep 21 · 14 detections");
  assert.equal(describeAlert(alerts[1]).tone, "red");
});

test("a $10M budget covers about 34,000 to 105,000 ha on the fast path", () => {
  const plan = springPlan(10_000_000, [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }]);
  assert.equal(plan.text, "About 34,000 to 105,000 ha, starting with A, B, and C");
  assert.equal(springPlan(0, hotspots).text, "Set a budget to see how much land it covers.");
  assert.equal(springPlan(5000, []).text, "About 17 to 53 ha");
});

test("recovery cost uses the method's per-hectare costs", () => {
  assert.deepEqual(recoveryCost(100), { fast: [9500, 29000], full: [26000, 62000] });
  assert.deepEqual(recoveryCost(NaN).fast, [0, 0]);
});

test("run description lines", () => {
  assert.equal(imageryText(run), "Imagery from April to September 2026, compared with 2019 to 2021");
  const mixed = { ...run, imagery: { from: "2025-04", to: "2025-09", label: "April to September 2025 (80% of the area); May to October 2025 (20% of the area)" } };
  assert.equal(imageryText(mixed), "Imagery from April to September 2025 (80% of the area); May to October 2025 (20% of the area), compared with 2019 to 2021");
  assert.equal(weightsText(settings), "Soil 30 · Damage 40 · Access 30");
});

test("month to month: no new damage or comparison across data sources; the source badge", () => {
  const aug = { id: "a", areaId: "k", month: "2026-08", provider: "sample", newHeavyDamageHa: 5 };
  const sep = { id: "b", areaId: "k", month: "2026-09", provider: "gee", newHeavyDamageHa: 0, cellSizeKm: 22.263 };
  assert.equal(shownNewDamage(sep, [sep, aug]), null);
  assert.equal(shownNewDamage({ ...sep, provider: "sample", newHeavyDamageHa: 3 }, [aug]), 3);
  assert.equal(runsComparable(aug, sep).text, "Not comparable: different data source");
  assert.equal(runsComparable({ provider: "gee", cellSizeKm: 10 }, { provider: "gee", cellSizeKm: 20 }).reason, "grid");
  const months = Array.from({ length: 11 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, provider: "sample" }));
  assert.deepEqual(sourceBadge([sep, ...months]), { text: "Earth Engine · 11 earlier months are sample data", tone: "amber" });
  assert.deepEqual(sourceBadge([sep]), { text: "Earth Engine", tone: null });
  assert.deepEqual(sourceBadge(months), { text: "Sample data", tone: "amber" });
  assert.equal(sourceBadge([]), null);
});
