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
import { accessMeaning, accessMeasured, accessSourceOf, conflictOf, alertPlaces, atPeace, damageMeaning, describeAlert, nearTermSetAside, heavyDamageRule, imageryText, kpis, nextSteps, recoveryCost, ruleText, shownNewDamage, sourceBadge, springPlan, summarize, timeframeLabel, timeframeOptions, weightsText } from "./overview.js";
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

test("the damage score and safe access are described as used (10.6)", () => {
  const warRun = { ...run, conflict: { id: "ukraine-2022", name: "War", since: "2022-02-24" }, accessSource: "fires" };
  const peaceRun = { ...run, conflict: null, accessSource: "none" };
  assert.equal(damageMeaning(warRun), "unusual fire and radar change against the normal years 2019–2021");
  assert.equal(damageMeaning(run), damageMeaning(warRun), "older runs were made in a war");
  assert.equal(damageMeaning(peaceRun), "the heavily damaged share of the black soil (radar change backed by unusual fire), full at 20%");
  // In a war with no ACLED file the distance is to unusual fires, an estimate.
  assert.equal(accessMeaning(warRun), "the distance to unusual fires (an estimate of where fighting is; no ACLED file), full at 100 km");
  assert.equal(accessMeaning({ ...warRun, accessSource: null }), "the distance to recorded fighting, full at 100 km");
  assert.equal(accessMeaning(peaceRun), "full everywhere: with no war recorded, every square counts as safe to reach (this does not prove the land is safe)");
  assert.doesNotMatch(accessMeaning(peaceRun) + damageMeaning(peaceRun) + ruleText("nearTerm", {}, peaceRun), /fighting/);
  assert.equal(accessMeasured(peaceRun), false);
  assert.equal(accessMeasured({ ...peaceRun, accessSource: "acled" }), true);
  assert.equal(accessMeaning({ ...peaceRun, accessSource: "acled" }), "the distance to battles in the ACLED file, full at 100 km");
  assert.equal(heavyDamageRule(peaceRun), "radar change of 3 dB or more and an unusual fire within 1 km");
  assert.match(heavyDamageRule(warRun), /3 dB or more, or of 2 dB or more with an unusual fire within 1 km/);
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
  // The damage radar's composite of every complete war season.
  const war = { ...run, imagery: { from: "2022-04", to: "2025-09", label: "April to September of 2022 to 2025", seasons: 4 } };
  assert.equal(imageryText(war), "Imagery from April to September of 2022 to 2025, compared with 2019 to 2021");
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

// Polish round 2 (critic's findings)
test("the Near term set-aside sentence: nothing at peace, nothing at 0%, else from what was measured", () => {
  const warRun = { ...run, conflict: { id: "ukraine-2022", name: "War", since: "2022-02-24" }, accessSource: "fires" };
  const peaceRun = { ...run, conflict: null, accessSource: "none" };
  assert.equal(nearTermSetAside(peaceRun, { gatePercentile: 30 }), "Near term sets nothing aside and ranks by soil value and damage.");
  assert.equal(nearTermSetAside(warRun, { gatePercentile: 0 }), "Near term sets nothing aside (cutoff 0%) and ranks by soil value and damage.");
  assert.equal(nearTermSetAside(warRun, { gatePercentile: 30 }), "Near term sets aside the least safe 30% of black soil (squares 100 km or more from an unusual fire are never set aside) and ranks the rest by soil value and damage.");
  assert.match(nearTermSetAside({ ...warRun, accessSource: "acled" }, { gatePercentile: 30 }), /from an ACLED battle/);
  assert.equal(ruleText("nearTerm", { gatePercentile: 0 }, warRun), "Nothing is set aside (cutoff 0%). Places are ranked by soil value and damage.");
  assert.match(ruleText("nearTerm", { gatePercentile: 30 }, warRun), /unusual fires that stand in for fighting/);
});

test("alerts keep their own place; coordinates only when two read the same", () => {
  const list = [
    { id: "a", place: "Nakuru, Rift Valley", lat: -0.21, lon: 35.8 },
    { id: "b", place: "Laikipia, Rift Valley", lat: 0.19, lon: 36.8 },
    { id: "c", place: "Nakuru, Rift Valley", lat: -0.5, lon: 36.1 },
    { id: "d", place: "", lat: 1, lon: 2 },
  ];
  const places = alertPlaces(list);
  assert.equal(places.get("b"), "Laikipia, Rift Valley");
  assert.equal(places.get("a"), "Nakuru, Rift Valley · 0.21° S, 35.80° E");
  assert.equal(places.get("c"), "Nakuru, Rift Valley · 0.50° S, 36.10° E");
  assert.equal(places.get("d"), "1.00° N, 2.00° E");
  const peaceRun = { ...run, conflict: null, accessSource: "none" };
  const steps = nextSteps({ run: peaceRun, hotspots: [], alerts: list.map((a) => ({ ...a, kind: "radar", cellIds: [] })) });
  assert.equal(steps.find((s) => s.id.endsWith("-b-review")).title, "Check the radar change near Laikipia, Rift Valley");
  assert.equal(steps.find((s) => s.id.endsWith("-a-review")).title, "Check the radar change near Nakuru, Rift Valley · 0.21° S, 35.80° E");
});

test("older runs: the access source from the fires warning, the war from the country (10.6)", () => {
  const firesWarning = "Distance to fighting is estimated from unusual fires of the last 12 months (far more than in 2019-2021; no ACLED file), so treat safe access as rough.";
  const old = { areaId: "country-804", provider: "gee", checks: { warnings: [firesWarning] } };
  assert.equal(accessSourceOf(old), "fires");
  assert.equal(conflictOf(old).id, "ukraine-2022");
  assert.equal(atPeace(old), false);
  assert.match(accessMeaning(old), /^the distance to unusual fires/);
  assert.doesNotMatch(accessMeaning(old), /recorded fighting/);
  assert.match(ruleText("nearTerm", { gatePercentile: 30 }, old), /unusual fires that stand in for fighting/);
  // What a run says always wins; a drawn area or a country at peace stays as it was.
  assert.equal(accessSourceOf({ ...old, accessSource: "acled" }), "acled");
  assert.equal(conflictOf({ ...old, conflict: null }), null);
  assert.equal(conflictOf({ areaId: "area-1234" }), undefined);
  assert.equal(conflictOf({ areaId: "country-404" }), undefined);
  assert.equal(accessSourceOf({ checks: { warnings: [] } }), null);
});
