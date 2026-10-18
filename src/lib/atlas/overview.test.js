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
import { describeAlert, imageryText, kpis, nextSteps, recoveryCost, springPlan, summarize, weightsText } from "./overview.js";
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
  assert.equal(weightsText(settings), "Soil 30 · Damage 40 · Access 30");
});
