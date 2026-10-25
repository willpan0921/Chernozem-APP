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
import { accessMeaning, accessMeasured, accessSourceOf, acledFileState, analysisMonths, areaWar, beforeWar, conflictOf, alertPlaces, atPeace, damageMeaning, describeAlert, keepsMonth, longTermAccessNote, monthsWithOtherWar, nearTermSetAside, heavyDamageRule, imageryText, kpis, nextSteps, noFightingFound, noFightingNote, notMeasuredReason, outsideWar, peaceReason, peaceSquares, recoveryCost, ruleText, seasonAdded, seasonJump, seasonLeft, seasonWords, setAsideNote, shownNewDamage, sourceBadge, springPlan, summarize, timeframeLabel, timeframeOptions, warInPart, warKey, warNote, warPartOf, warSetByTeam, warText, weightsText } from "./overview.js";
import { METHOD_VERSION, runsComparable } from "./method.js";
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
  assert.match(ruleText("nearTerm", settings, peaceRun), /nothing is left out/);
  assert.doesNotMatch(ruleText("nearTerm", settings, peaceRun), /nearest the fighting/);
  assert.match(ruleText("nearTerm", settings, run), /nearest the fighting/);
  // With an ACLED file, battles are measured even at peace.
  assert.match(ruleText("nearTerm", settings, { ...peaceRun, accessSource: "acled" }), /left out for now/);
  assert.equal(timeframeLabel("postwar", peaceRun), "Post-crisis");
  assert.equal(timeframeLabel("postwar", run), "Post-crisis");
  assert.deepEqual(timeframeOptions(peaceRun).map((o) => o.label), ["Near term", "Post-crisis"]);
});

test("the damage score and safe access are described as used (10.6)", () => {
  const warRun = { ...run, conflict: { id: "ukraine-2022", name: "War", since: "2022-02-24" }, accessSource: "fires" };
  const peaceRun = { ...run, conflict: null, accessSource: "none" };
  assert.equal(damageMeaning(warRun), "unusual fire and radar change against the normal years 2019–2021", "a run made with an older method");
  assert.equal(damageMeaning(run), damageMeaning(warRun), "older runs were made in a war");
  // Made with this method: the worst war year and the lasting radar change.
  const currentRun = { ...warRun, method: { version: METHOD_VERSION } };
  assert.equal(
    damageMeaning(currentRun),
    "unusual fire (the fires of the worst war year, in 12-month years from the day the war began, against a normal year) and lasting radar change (a change seen in at least two complete growing seasons since the war began, which need not include the latest; while only one is complete, that one) against the normal years 2019–2021",
  );
  assert.equal(damageMeaning({ ...warRun, method: { version: "2026-10-19.2" } }), damageMeaning(warRun));
  assert.equal(damageMeaning({ ...peaceRun, method: { version: METHOD_VERSION } }), damageMeaning(peaceRun), "at peace the same either way");
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
  assert.equal(weightsText(settings), "Value 30 · Damage 40 · Feasibility 30");
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
  assert.equal(nearTermSetAside(peaceRun, { gatePercentile: 30 }), "Near term leaves nothing out and ranks by value and damage.");
  assert.equal(nearTermSetAside(warRun, { gatePercentile: 0 }), "Near term leaves nothing out (Feasibility cutoff 0%) and ranks by value and damage.");
  assert.equal(nearTermSetAside(warRun, { gatePercentile: 30 }), "Near term leaves the least feasible 30% of black soil out for now (the Feasibility cutoff; squares 100 km or more from an unusual fire are never left out) and ranks the rest by value and damage.");
  assert.match(nearTermSetAside({ ...warRun, accessSource: "acled" }, { gatePercentile: 30 }), /from an ACLED battle/);
  assert.equal(ruleText("nearTerm", { gatePercentile: 0 }, warRun), "Nothing is left out (Feasibility cutoff 0%). Places are ranked by value and damage.");
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

test("the war in words (the Overview's chip, the report's line): from the app's list, or set by the team", () => {
  const ukraine = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const listed = warNote({ ...run, conflict: ukraine, conflictSource: "list" });
  assert.deepEqual(
    { badge: listed.badge, line: listed.line, team: listed.team },
    { badge: "War since 24 Feb 2022", line: "Full-scale invasion of Ukraine, since 24 February 2022: damage is counted from that day.", team: false }
  );
  const team = { id: "area-area-1", name: "Fighting in Amhara", since: "2023-08-03", source: "area" };
  const set = warNote({ ...run, conflict: team, conflictSource: "area" });
  assert.equal(set.badge, "War since 3 Aug 2023 · set by your team");
  assert.equal(set.line, "Fighting in Amhara, set by your team, since 3 August 2023: damage is counted from that day.");
  assert.equal(set.team, true);
  // Without a name of its own.
  const plain = warNote({ ...run, conflict: { ...team, name: "War (set for this area)" }, conflictSource: "area" });
  assert.equal(plain.line, "War since 3 August 2023, set by your team: damage is counted from that day.");
  // Not at war: the team's choice has a chip; the list's peace has none.
  const calm = warNote({ ...run, conflict: null, conflictSource: "area", accessSource: "none" });
  assert.equal(calm.badge, "Not at war · set by your team");
  assert.match(calm.line, /^Your team marked this area as not at war, so feasibility is not measured here and nothing is left out\./);
  const quiet = warNote({ ...run, conflict: null, conflictSource: "list", accessSource: "none" });
  assert.equal(quiet.badge, null);
  assert.match(quiet.line, /^No war recorded here, so feasibility is not measured here and nothing is left out\./);
  assert.match(warNote({ ...run, conflict: null, conflictSource: "area", accessSource: "acled" }).line, /^Your team marked this area as not at war; feasibility \(safe access\) is the distance to battles in the ACLED file/);
  assert.equal(warNote({ ...run }), null, "older runs that do not say");
  assert.equal(warSetByTeam({ conflict: team }), true);
  assert.equal(warSetByTeam({ conflict: null, conflictSource: "area" }), true);
  assert.equal(warSetByTeam({ conflict: ukraine }), false);
  assert.equal(warKey(undefined), undefined);
  assert.equal(warKey(null), null);
  assert.equal(warKey(team), "2023-08-03");
  assert.equal(warText(team), "at war since 3 Aug 2023");
  assert.equal(warText(null), "at peace");
});

test("an area's war now, and the saved months made with another setting (Atlas Settings offers the re-run)", () => {
  const ukraine = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const area = { id: "country-804", listConflict: ukraine };
  assert.deepEqual(areaWar(area), { conflict: ukraine, team: false });
  assert.deepEqual(areaWar({ ...area, war: { mode: "peace" } }), { conflict: null, team: true });
  assert.deepEqual(areaWar({ ...area, war: { mode: "war", since: "2023-08-01" } }), {
    conflict: { id: "area-country-804", name: "War (set for this area)", since: "2023-08-01", source: "area" },
    team: true,
  });
  assert.equal(areaWar({ id: "area-x" }), undefined, "the server did not say what the list gives");
  assert.equal(areaWar(null), undefined);

  const months = [
    { id: "run-sep", month: "2026-09", conflict: ukraine },
    { id: "run-aug", month: "2026-08", conflict: ukraine },
    { id: "run-old", month: "2026-07" },
  ];
  assert.deepEqual(monthsWithOtherWar(area, months), [], "all made with the list's war");
  // The team marks it as not at war: the months made at war need a re-run
  // (an older run that does not say is left out).
  assert.deepEqual(monthsWithOtherWar({ ...area, war: { mode: "peace" } }, months).map((item) => item.id), ["run-sep", "run-aug"]);
  // The same start day, set by the team under its own name: nothing to redo.
  assert.deepEqual(monthsWithOtherWar({ ...area, war: { mode: "war", since: "2022-02-24", name: "Our name" } }, months), []);
  assert.deepEqual(monthsWithOtherWar({ id: "area-x" }, months), [], "cannot be told");
});

test("a month that ends before its war began: no war's rules (no damage, nothing set aside, no demining), but the run keeps its war", () => {
  const team = { id: "area-area-1", name: "Fighting in the county", since: "2026-06-01", source: "area" };
  const early = { ...run, month: "2025-12", label: "December 2025", conflict: team, conflictSource: "area", accessSource: "none" };
  assert.equal(beforeWar(early), true);
  assert.equal(outsideWar(early), true);
  assert.equal(atPeace(early), false, "it is not at peace: the area's war began later");
  assert.equal(accessMeasured(early), false);
  assert.equal(accessMeasured({ ...early, accessSource: "acled" }), true, "an ACLED file measures it anyway");
  assert.equal(beforeWar({ ...early, month: "2026-06" }), false, "the month the war began counts from that day");
  assert.equal(timeframeLabel("postwar", early), "Post-crisis");
  assert.equal(kpis({ croplandHa: 1, blackSoilHa: 1, heavyDamageHa: 0, peopleOnDamagedSoil: 0 }, early).find((k) => k.id === "heavy-damage").tone, undefined);
  assert.deepEqual(peaceReason(early), { short: "Before the war", note: "before the war, which began on 1 June 2026", clause: "this month ends before the war began on 1 June 2026" });
  const note = warNote(early);
  assert.equal(note.badge, "Before the war (from 1 Jun 2026) · set by your team");
  assert.equal(note.line, "This month ends before Fighting in the county (set by your team) began on 1 June 2026: no war damage is counted, and feasibility (distance to fighting) is not measured, so nothing is left out (this does not prove the land is safe).");
  assert.equal(note.beforeWar, true);
  assert.equal(damageMeaning(early), "not counted for this month: it ends before the war began on 1 June 2026, so the damage score is 0 everywhere");
  assert.equal(accessMeaning(early), "full everywhere: this month ends before the war began on 1 June 2026, so every square counts as safe to reach (this does not prove the land is safe)");
  assert.equal(heavyDamageRule(early), "none counted: this month ends before the war began on 1 June 2026");
  assert.equal(nearTermSetAside(early, { gatePercentile: 30 }), "Near term leaves nothing out and ranks by value and damage.");
  assert.equal(ruleText("nearTerm", { gatePercentile: 30 }, early), "This month ends before the war began on 1 June 2026, so feasibility is not measured and nothing is left out. Places are ranked by value and damage.");
  assert.equal(ruleText("postwar", {}, early), "All three scores are blended into one long-term ranking.");
  for (const step of nextSteps({ run: early, hotspots, alerts })) assert.doesNotMatch(step.title, /demining|cleared|damage/i);
  // A war of the app's list, in a long re-run reaching back before it.
  const listed = warNote({ ...run, month: "2024-11", conflict: { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24" }, conflictSource: "list", accessSource: "none" });
  assert.equal(listed.badge, "Before the war (from 24 Jul 2025)");
  assert.match(listed.line, /^This month ends before Cambodia–Thailand border conflict began on 24 July 2025: no war damage is counted/);
});

test("a team's 'Not at war' over a war on the app's list is never called 'no war recorded'", () => {
  const teamPeace = { ...run, conflict: null, conflictSource: "area", accessSource: "none" };
  assert.deepEqual(peaceReason(teamPeace), { short: "Not at war (set by your team)", note: "not at war, set by your team", clause: "your team marked this area as not at war" });
  assert.equal(accessMeaning(teamPeace), "full everywhere: your team marked this area as not at war, so every square counts as safe to reach (this does not prove the land is safe)");
  assert.equal(ruleText("nearTerm", { gatePercentile: 30 }, teamPeace), "Your team marked this area as not at war, so feasibility is not measured and nothing is left out. Places are ranked by value and damage.");
  const words = [accessMeaning(teamPeace), ruleText("nearTerm", {}, teamPeace), peaceReason(teamPeace).short, peaceReason(teamPeace).note, warNote(teamPeace).line].join(" ");
  assert.doesNotMatch(words, /no war (is )?recorded/i);
  // The app's own peace keeps its words.
  const listPeace = { ...run, conflict: null, conflictSource: "list", accessSource: "none" };
  assert.equal(peaceReason(listPeace).short, "No war recorded");
  assert.equal(ruleText("nearTerm", {}, listPeace), "No war is recorded here, so feasibility is not measured and nothing is left out. Places are ranked by value and damage.");
  assert.equal(peaceReason({ ...run, conflict: { id: "ukraine-2022", since: "2022-02-24" } }), null, "a war's rules apply");
});

test("a war the team counts from the earliest day allowed is not given that day as its start", () => {
  const team = { id: "area-area-1", name: "War in the hills", since: "2022-01-01", source: "area" };
  const note = warNote({ ...run, conflict: team, conflictSource: "area", accessSource: "fires" });
  assert.equal(note.badge, "War · damage from 1 Jan 2022 · set by your team");
  assert.equal(note.line, "War in the hills, set by your team: damage is counted from 1 January 2022, the earliest day the app allows (the normal years 2019–2021 must come before the war). The war may be older: damage before that day is not counted, and the normal years may already include it.");
  assert.doesNotMatch(note.badge, /War since/);
  const unnamed = warNote({ ...run, conflict: { ...team, name: "War (set for this area)" }, conflictSource: "area" });
  assert.match(unnamed.line, /^A war set by your team: damage is counted from 1 January 2022/);
});

test("a war that covers a whole-country area only in part: its words only where its rules applied", () => {
  const border = { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24", partOfCountry: true };
  // Squares r0c* to r2c* touch the war's region; the rest have the peace rules.
  const cells = places.map((place) => ({ id: place.id, atWar: /^r[0-2]c/.test(place.id) }));
  const inPart = { ...run, conflict: border, conflictSource: "list", accessSource: "fires", method: { version: METHOD_VERSION }, warSquares: cells.filter((c) => c.atWar).length, cellCount: cells.length, cells };
  assert.equal(warInPart(inPart), true);
  assert.equal(warInPart({ ...inPart, conflict: { ...border, partOfCountry: false } }), false);
  assert.equal(peaceSquares(inPart).size, cells.filter((c) => !c.atWar).length);
  assert.equal(peaceSquares({ ...inPart, conflict: { ...border, partOfCountry: false } }).size, 0);
  const note = warNote(inPart);
  assert.equal(note.badge, "War since 24 Jul 2025 · in part of the country");
  assert.equal(
    note.line,
    `Cambodia–Thailand border conflict, since 24 July 2025: damage is counted from that day. The war covers only part of this country: its rules apply in the squares that touch the war's region (in ${inPart.warSquares} of ${cells.length} squares). The other squares also count damage from that day, but use the peace rules for heavy damage (strong radar change and an unusual fire) and for the damage score, and their distance to fighting is measured to the unusual fires inside the war's region.`
  );
  // With an ACLED file every square's distance is to its battles: nothing
  // is said of the war's region for it.
  assert.match(warNote({ ...inPart, accessSource: "acled" }).line, /for the damage score\.$/);
  assert.match(damageMeaning(inPart), /lasting radar change .* in the squares that touch the war's region; elsewhere the heavily damaged share of the black soil \(radar change backed by unusual fire\), full at 20%$/);
  assert.equal(heavyDamageRule(inPart), "radar change of 3 dB or more, or of 2 dB or more with an unusual fire within 1 km in the squares that touch the war's region; elsewhere radar change of 3 dB or more and an unusual fire within 1 km");
  assert.equal(accessMeaning(inPart), "the distance to unusual fires inside the war's region (an estimate of where fighting is; no ACLED file), full at 100 km");
  assert.equal(timeframeLabel("postwar", inPart), "Post-crisis");
  // Next steps: demining only for places that touch the war's region.
  const calm = peaceSquares(inPart);
  const outsideSpots = hotspots.filter((h) => h.cellIds.every((id) => calm.has(id)));
  const insideSpots = hotspots.filter((h) => h.cellIds.some((id) => !calm.has(id)));
  assert.ok(outsideSpots.length >= 3 && insideSpots.length >= 1, "the test places have both");
  const quiet = nextSteps({ run: inPart, hotspots: outsideSpots, alerts: [{ ...alerts[0], cellIds: [outsideSpots[0].cellIds[0]] }] });
  assert.equal(quiet[0].title, `Plan soil surveys in ${outsideSpots[0].label} and ${outsideSpots[1].label}`);
  assert.equal(quiet[1].title, "Check the radar change near 48.59° N, 38.00° E");
  assert.equal(quiet[1].tone, "amber");
  assert.equal(quiet[2].title, `Test soil in ${outsideSpots[2].label}`);
  const front = nextSteps({ run: inPart, hotspots: [insideSpots[0], ...outsideSpots], alerts: [{ ...alerts[0], cellIds: [insideSpots[0].cellIds[0]] }] });
  assert.match(front[0].title, /^Fund demining surveys in /);
  assert.equal(front[1].title, "Review new damage near 48.59° N, 38.00° E");
  // Its key differs from the same war with its rules all over the area.
  assert.equal(warKey(border), "2025-07-24 (in part of the country)");
  assert.equal(warKey({ ...border, partOfCountry: undefined }), "2025-07-24");
  assert.equal(runsComparable({ ...run, conflict: border }, { ...run, conflict: { ...border, partOfCountry: undefined } }).reason, "war");
  assert.equal(runsComparable({ ...run, conflict: border }, { ...run, conflict: { ...border, name: "Another name" } }).comparable, true);
});

test("which saved months an analysis keeps (the server and Atlas Settings use one rule), and the months it covers", () => {
  const current = { month: "2026-09", provider: "gee", method: { version: METHOD_VERSION }, conflict: null };
  const options = { provider: "gee", manual: true, warNow: null };
  assert.equal(keepsMonth(current, options), true);
  assert.equal(keepsMonth(undefined, options), false, "a missing month is analyzed");
  assert.equal(keepsMonth(current, { ...options, rerun: true }), false);
  assert.equal(keepsMonth({ ...current, provider: "sample" }, options), false, "sample data once Earth Engine is connected");
  assert.equal(keepsMonth({ ...current, provider: "sample" }, { ...options, provider: "sample" }), true);
  const older = { ...current, method: { version: "2026-10-19.2" } };
  assert.equal(keepsMonth(older, options), false, "an older method, in a run someone started");
  assert.equal(keepsMonth(older, { ...options, manual: false }), true, "the monthly job keeps it");
  const atWar = { ...current, conflict: { id: "area-x", since: "2023-08-01", source: "area" } };
  assert.equal(keepsMonth(atWar, options), false, "made at war, now at peace");
  assert.equal(keepsMonth(atWar, { ...options, warNow: "2023-08-01" }), true);
  assert.equal(keepsMonth(atWar, { ...options, manual: false }), true, "the monthly job keeps another war setting too");
  assert.equal(keepsMonth({ ...current, conflict: undefined }, options), true, "a run that does not say its war is kept");
  assert.deepEqual(analysisMonths(3, new Date(2026, 9, 20)), ["2026-09", "2026-08", "2026-07"]);
  assert.deepEqual(analysisMonths(2, new Date(2026, 0, 5)), ["2025-12", "2025-11"]);
});

test("a war in part of a region, a box or a drawn area says 'in part of the area'; a whole country keeps 'in part of the country'", () => {
  const amhara = { id: "amhara", name: "War in Ethiopia's Amhara region", since: "2023-08-01", partOfCountry: true, partOf: "area" };
  const cells = places.map((place) => ({ id: place.id, atWar: /^r[0-2]c/.test(place.id) }));
  const region = { ...run, conflict: amhara, conflictSource: "list", accessSource: "fires", method: { version: METHOD_VERSION }, warSquares: cells.filter((c) => c.atWar).length, cellCount: cells.length, cells };
  assert.equal(warPartOf(amhara), "area");
  assert.equal(warPartOf({ ...amhara, partOf: undefined }), "country", "runs saved before partOf were all whole countries");
  assert.equal(warPartOf({ ...amhara, partOfCountry: undefined }), null);
  assert.equal(warPartOf(null), null);
  assert.equal(warInPart(region), true);
  const note = warNote(region);
  assert.equal(note.badge, "War since 1 Aug 2023 · in part of the area");
  assert.equal(note.partOf, "area");
  assert.match(note.line, /^War in Ethiopia's Amhara region, since 1 August 2023: damage is counted from that day\. The war covers only part of this area: its rules apply in the squares that touch the war's region \(in 36 of 144 squares\)\. The other squares also count damage from that day, but use the peace rules for heavy damage/);
  assert.doesNotMatch(note.line, /another listed war/);
  // Across a border, squares in another listed war have its rules too
  // (run.otherWarSquares: a box over the Kursk front, with its squares in
  // Ukraine), and every line that says where its rules apply says so.
  const across = { ...region, otherWarSquares: 9 };
  assert.match(warNote(across).line, /its rules apply in the squares that touch the war's region or lie in another listed war \(in 36 of 144 squares\)\. .* their distance to fighting is measured to the unusual fires inside the war's region and its squares in another listed war\.$/);
  assert.match(damageMeaning(across), / in the squares that touch the war's region or lie in another listed war; elsewhere /);
  assert.match(heavyDamageRule(across), / in the squares that touch the war's region or lie in another listed war; elsewhere /);
  assert.equal(accessMeaning(across), "the distance to unusual fires inside the war's region and its squares in another listed war (an estimate of where fighting is; no ACLED file), full at 100 km");
  assert.doesNotMatch(note.line, /country|read as at peace/);
  assert.equal(warNote({ ...region, conflict: { ...amhara, partOf: undefined } }).badge, "War since 1 Aug 2023 · in part of the country");
  // The same war with its rules all over (a drawn area inside its boxes).
  const inside = warNote({ ...region, conflict: { id: "amhara", name: amhara.name, since: amhara.since } });
  assert.equal(inside.badge, "War since 1 Aug 2023");
  assert.doesNotMatch(inside.line, /part of/);
  assert.equal(warText(amhara), "at war since 1 Aug 2023 in part of the area");
});

test("a war setting in words shows where its rules applied when that is what differs (old Palestine runs against the Gaza war in part of the country now)", () => {
  const gazaNow = { id: "gaza-2023", name: "Gaza war", since: "2023-10-07", partOfCountry: true };
  const gazaOld = { id: "gaza-2023", name: "Gaza war", since: "2023-10-07" };
  assert.equal(warText(gazaNow), "at war since 7 Oct 2023 in part of the country");
  assert.equal(warText(gazaOld), "at war since 7 Oct 2023");
  // Against the setting now: the old months' rules were all over the country.
  assert.equal(warText(gazaOld, gazaNow), "at war since 7 Oct 2023, with its rules all over the country");
  assert.equal(warText(gazaNow, gazaOld), "at war since 7 Oct 2023, with its rules only in part of the country");
  assert.equal(warText(gazaOld, { ...gazaNow, partOf: "area" }), "at war since 7 Oct 2023, with its rules all over the area");
  // Another start day, or peace: the day (or the peace) is the difference.
  assert.equal(warText(gazaOld, { ...gazaNow, since: "2024-01-01" }), "at war since 7 Oct 2023");
  assert.equal(warText(null, gazaNow), "at peace");
  assert.equal(warText(gazaOld, null), "at war since 7 Oct 2023");
});

test("the month a new growing season joins the damage radar: its new heavy damage says so (real data: Kharkiv oblast, September 2026)", () => {
  const war = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const month = (m, imagery, more = {}) => ({ id: `run-${m}`, areaId: "admin1-gaul1-3154", month: m, provider: "gee", conflict: war, method: { version: METHOD_VERSION }, imagery, newHeavyDamageHa: 0, ...more });
  const aug = month("2026-08", { from: "2022-03", to: "2025-08", label: "March to August of 2022 to 2025", seasons: 4 }, { newHeavyDamageHa: 4725 });
  const sep = month("2026-09", { from: "2022-03", to: "2026-08", label: "March to August of 2022 to 2026", seasons: 5 }, { newHeavyDamageHa: 64904 });
  const runs = [sep, aug];
  assert.equal(seasonAdded(sep, runs), "2026");
  assert.equal(seasonJump(sep, runs), "2026");
  assert.deepEqual(seasonWords(sep, runs), {
    season: "2026",
    name: "2026 growing season",
    lasting: false,
    fact: "The 2026 season's radar images are counted from this month",
    jump: {
      tag: "incl. 2026 season",
      note: "Mostly older damage: the 2026 season's radar images are counted for the first time",
      why: "radar change seen over the whole 2026 growing season, counted for the first time this month, not damage done in September 2026",
      what: "older damage",
    },
  });
  assert.equal(seasonAdded(aug, runs), null, "no month before it");
  // The same seasons as the month before: nothing to say.
  const oct = month("2026-10", sep.imagery, { newHeavyDamageHa: 120 });
  assert.equal(seasonWords(oct, [oct, sep, aug]), null);
  // At peace the two-year window lets the oldest season go as a new one
  // joins: as many seasons, a later one (Kenya, January 2026).
  const kenyaDec = month("2025-12", { from: "2024-01", to: "2024-12", seasons: 1 }, { conflict: null });
  const kenyaJan = month("2026-01", { from: "2025-01", to: "2025-12", seasons: 1 }, { conflict: null, newHeavyDamageHa: 84 });
  assert.equal(seasonAdded(kenyaJan, [kenyaJan, kenyaDec]), "2025");
  assert.equal(seasonWords(kenyaJan, [kenyaJan, kenyaDec]).lasting, false, "the same count: never the two-season reason");
  // An old season leaving alone is not a new one (Iowa, April 2026).
  const iowaMar = month("2026-03", { from: "2024-04", to: "2025-09", seasons: 2 }, { conflict: null });
  const iowaApr = month("2026-04", { from: "2025-04", to: "2025-09", seasons: 1 }, { conflict: null, newHeavyDamageHa: 412 });
  assert.equal(seasonAdded(iowaApr, [iowaApr, iowaMar]), null);
  // ...but it is said: with fewer seasons compared, heavy damage can jump
  // (Heilongjiang, Saskatchewan and Iowa, April 2026).
  assert.equal(seasonLeft(iowaApr, [iowaApr, iowaMar]), "2024");
  const left = seasonWords(iowaApr, [iowaApr, iowaMar]);
  assert.equal(left.left, true);
  assert.equal(left.fact, "The 2024 season's radar images are no longer counted from this month (it left the two-year window)");
  assert.deepEqual(left.jump, {
    tag: "2024 season left",
    note: "Mostly a change in what is compared: the 2024 season left the two-year window",
    why: "the 2024 growing season left the two-year window this month, so a radar change has to show in fewer seasons to count as heavy damage; not damage done in April 2026",
    what: "a change in what is compared",
  });
  // No new damage that month: the fact, no jump.
  const flat = { ...iowaApr, newHeavyDamageHa: 0 };
  assert.equal(seasonWords(flat, [flat, iowaMar]).jump, null);
  // A season joining is never also called a season leaving.
  assert.equal(seasonLeft(sep, runs), null);
  // A first complete season after none (no count: runs.js keeps only 1 or more).
  const none = month("2025-12", { from: "2024-11", to: "2025-04" }, { conflict: null });
  const first = month("2026-01", { from: "2024-11", to: "2025-04", seasons: 1 }, { conflict: null, newHeavyDamageHa: 8193 });
  assert.equal(seasonAdded(first, [first, none]), "2025");
  // A season across the new year (the south: Buenos Aires, January 2026)
  // is named by both years and its months, never the year it ends in alone.
  assert.equal(seasonWords(first, [first, none]).season, "2024/25");
  assert.equal(seasonWords(first, [first, none]).name, "November 2024 to April 2025 growing season");
  assert.equal(seasonWords(first, [first, none]).jump.tag, "incl. 2024/25 season");
  assert.equal(seasonWords(first, [first, none]).jump.why, "radar change seen over the whole November 2024 to April 2025 growing season, counted for the first time this month, not damage done in January 2026");
  assert.equal(seasonAdded(none, [none, month("2025-11", { from: "2024-11", to: "2025-04" }, { conflict: null })]), null, "still no season");
  // Never where the new damage is not shown (the month before is not comparable).
  assert.equal(seasonAdded(sep, [sep, { ...aug, provider: "sample" }]), null);
  assert.equal(seasonAdded({ ...sep, newHeavyDamageHa: null }, runs), null);
});

test("a growing season that joins with no new heavy damage is named, never called mostly older damage (real data: Iowa, November 2025)", () => {
  // The damage radar went from 1 season to 2 (2024 and 2025): heavy damage
  // fell from 2,385 ha to 764 ha, 0 ha new.
  const month = (m, imagery, more = {}) => ({ id: `run-${m}`, areaId: "admin1-iowa", month: m, provider: "gee", conflict: null, method: { version: METHOD_VERSION }, imagery, ...more });
  const oct = month("2025-10", { from: "2024-04", to: "2024-09", seasons: 1 }, { totals: { heavyDamageHa: 2385 }, newHeavyDamageHa: null });
  const nov = month("2025-11", { from: "2024-04", to: "2025-09", seasons: 2 }, { totals: { heavyDamageHa: 764 }, newHeavyDamageHa: 0 });
  const runs = [nov, oct];
  // The fact stays (the trend's line and tooltip explain the fall with it)...
  assert.equal(seasonAdded(nov, runs), "2025");
  assert.equal(seasonWords(nov, runs).fact, "The 2025 season's radar images are counted from this month");
  assert.equal(seasonWords(nov, runs).lasting, true, "two complete seasons for the first time");
  // ...but nothing says most of the new damage is older damage: there is none.
  assert.equal(seasonJump(nov, runs), null);
  assert.equal(seasonWords(nov, runs).jump, null);
});

// ---------- Safe access in a war where no fire looked like fighting ----------

// The run's warning (server/providers/gee.js noFightingFiresWarning).
const NO_FIGHTING_WARNING =
  "No fires that look like fighting were found within 300 km in the last 12 months (the rule needs fire as dense as at a front line, about 1 detection per km² within 10 km and 3 times the normal years' rate; scattered strikes do not reach it). Safe access is not measured here: every square counts as far from fighting, which does NOT make the land safe. An ACLED file of recorded fighting would measure it.";
// The same line as Atlas Settings shows it (the score is called Feasibility).
const NO_FIGHTING_SHOWN = NO_FIGHTING_WARNING.replace("Safe access is not measured here", "Feasibility (safe access) is not measured here");
const lebanonWar = { id: "israel-hezbollah", name: "Israel–Hezbollah war (south Lebanon, northern Israel and the Golan Heights)", since: "2023-10-08" };
// Words that would say a distance was measured, or that the land is safe.
const MEASURED_OR_SAFE = /safe to reach|distance to unusual fires|is measured to|estimated|recorded fighting|nearest|treat .* as rough|full at 100 km|least safe/;

test("in a war where no fire looked like fighting, safe access is not measured: never safe, never a measured distance, nothing set aside", () => {
  const settings30 = { gatePercentile: 30 };
  const quiet = { ...run, conflict: lebanonWar, conflictSource: "list", accessSource: "fires-none", method: { version: METHOD_VERSION }, checks: { passed: 6, total: 6, warnings: [NO_FIGHTING_WARNING] } };
  assert.equal(accessSourceOf(quiet), "fires-none");
  assert.equal(noFightingFound(quiet), true);
  assert.equal(accessMeasured(quiet), false);
  // Still a war: the damage words, the red number stay; the second time frame is "Post-crisis" everywhere.
  assert.equal(outsideWar(quiet), false);
  assert.equal(atPeace(quiet), false);
  assert.equal(timeframeLabel("postwar", quiet), "Post-crisis");
  assert.equal(damageMeaning(quiet), damageMeaning({ ...quiet, accessSource: "fires" }));

  assert.equal(accessMeaning(quiet), "not measured here: no fires that look like fighting were found within 300 km, and there is no ACLED file, so every square counts as far from fighting (this does not make the land safe)");
  assert.equal(nearTermSetAside(quiet, settings30), "Near term leaves nothing out (feasibility is not measured here) and ranks by value and damage.");
  assert.equal(ruleText("nearTerm", settings30, quiet), "Feasibility is not measured here (no fires that look like fighting were found within 300 km, and there is no ACLED file), so nothing can be left out for it. Places are ranked by value and damage.");
  assert.equal(ruleText("postwar", settings30, quiet), "All three scores are blended; feasibility is not measured here, so it is the same in every square and changes no order.");
  assert.equal(setAsideNote(quiet), "Feasibility not measured here, so nothing can be left out for it");
  assert.equal(longTermAccessNote(quiet), " (feasibility is not measured here, so it is the same in every square and the order follows value and damage)");
  assert.deepEqual(notMeasuredReason(quiet), {
    short: "Feasibility not measured here",
    note: "feasibility not measured here",
    clause: "feasibility is not measured here (no fires that look like fighting were found within 300 km, and there is no ACLED file)",
    found: "no fires that look like fighting were found within 300 km",
    acled: "there is no ACLED file",
  });
  // The war's line (the Overview's chip, the Data page, the report).
  const note = warNote(quiet);
  assert.equal(note.badge, "War since 8 Oct 2023");
  assert.equal(note.line, "Israel–Hezbollah war (south Lebanon, northern Israel and the Golan Heights), since 8 October 2023: damage is counted from that day. Feasibility (safe access) is not measured here: no fires that look like fighting were found within 300 km, and there is no ACLED file (this does not make the land safe).");
  // A war the team set, also from the earliest day allowed, says it too.
  const team = { id: "area-area-1", name: "Fighting in the south", since: "2024-03-01", source: "area" };
  assert.match(warNote({ ...quiet, conflict: team, conflictSource: "area" }).line, /^Fighting in the south, set by your team, since 1 March 2024: damage is counted from that day\. Feasibility \(safe access\) is not measured here: /);
  assert.match(warNote({ ...quiet, conflict: { ...team, since: "2022-01-01" }, conflictSource: "area" }).line, /may already include it\. Feasibility \(safe access\) is not measured here: /);
  const words = [accessMeaning(quiet), nearTermSetAside(quiet, settings30), ruleText("nearTerm", settings30, quiet), ruleText("postwar", settings30, quiet), setAsideNote(quiet), longTermAccessNote(quiet), note.line];
  for (const text of words) assert.doesNotMatch(text, MEASURED_OR_SAFE, text);

  // Next steps: the same as with fires that look like fighting, and none
  // says a place is near the fighting, set aside or safe.
  const steps = nextSteps({ run: quiet, hotspots, alerts });
  assert.deepEqual(steps, nextSteps({ run: { ...quiet, accessSource: "fires" }, hotspots, alerts }));
  assert.deepEqual(steps.map((s) => s.icon), ["shield", "alert", "soil", "report"]);
  for (const step of steps) assert.doesNotMatch(step.title, /fighting|set aside|safe/i, step.title);

  // Atlas Settings shows the run's own line; a summary (no cells) is enough.
  assert.equal(noFightingNote(quiet), NO_FIGHTING_SHOWN);
  const { cells: _cells, ...summary } = { ...quiet, cells: [] };
  assert.equal(noFightingNote(summary), NO_FIGHTING_SHOWN);
  // Without the line (a run that lost its warnings), the same facts.
  assert.equal(noFightingNote({ ...quiet, checks: { warnings: [] } }), "No fires that look like fighting were found within 300 km. Feasibility (safe access) is not measured here: every square counts as far from fighting, which does NOT make the land safe. An ACLED file of recorded fighting would measure it.");
});

test("in a war in part of the area where no fire in its region looked like fighting: not measured, and no distance 'measured to the unusual fires'", () => {
  const border = { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24", partOfCountry: true };
  const cells = places.map((place) => ({ id: place.id, atWar: /^r[0-2]c/.test(place.id) }));
  const inPart = { ...run, conflict: border, conflictSource: "list", accessSource: "fires-none", method: { version: METHOD_VERSION }, warSquares: cells.filter((c) => c.atWar).length, cellCount: cells.length, cells };
  assert.equal(warInPart(inPart), true);
  assert.equal(noFightingFound(inPart), true);
  assert.equal(accessMeaning(inPart), "not measured here: no fires that look like fighting were found within 300 km inside the war's region, and there is no ACLED file, so every square counts as far from fighting (this does not make the land safe)");
  const line = warNote(inPart).line;
  assert.match(line, /and for the damage score\. Feasibility \(safe access\) is not measured here: no fires that look like fighting were found within 300 km inside the war's region, and there is no ACLED file \(this does not make the land safe\)\.$/);
  assert.doesNotMatch(line, /is measured to the unusual fires/);
  // Squares in another listed war count too.
  assert.match(accessMeaning({ ...inPart, otherWarSquares: 9 }), /within 300 km inside the war's region and its squares in another listed war, and there is no ACLED file/);
  // Steps outside the war's region keep the peace words, as before.
  const calm = peaceSquares(inPart);
  const outsideSpots = hotspots.filter((h) => h.cellIds.every((id) => calm.has(id)));
  assert.equal(nextSteps({ run: inPart, hotspots: outsideSpots, alerts: [] })[0].title, `Plan soil surveys in ${outsideSpots[0].label} and ${outsideSpots[1].label}`);
});

test("with an ACLED file connected but no battles near the area, or one that cannot be used, the pages never say there is no ACLED file", () => {
  const quiet = { ...run, conflict: lebanonWar, conflictSource: "list", accessSource: "fires-none", method: { version: METHOD_VERSION } };
  const withWarnings = (...warnings) => ({ ...quiet, checks: { passed: 6, total: 6, warnings } });
  // The file's own words (server/providers/acled.js; tied to them in gee.test.js).
  const noBattles = withWarnings("The ACLED file has no battles within 300 km of this area in the last 12 months.");
  const missing = withWarnings("ACLED file not found: /data/acled.csv. Fix ACLED_CSV_PATH in .env or leave it empty.");
  const notAcled = withWarnings("/data/x.csv does not look like an ACLED export (it needs latitude, longitude and event_type columns).");
  const unreadable = withWarnings("The ACLED file could not be read: EACCES: permission denied, open '/data/acled.csv'");
  assert.equal(acledFileState(noBattles), "no-battles");
  for (const broken of [missing, notAcled, unreadable]) assert.equal(acledFileState(broken), "unusable");
  assert.equal(acledFileState(withWarnings()), null);
  assert.equal(acledFileState(withWarnings(NO_FIGHTING_WARNING)), null);
  // The distance came from the file: nothing to say.
  assert.equal(acledFileState({ ...noBattles, accessSource: "acled" }), null);

  assert.equal(accessMeaning(noBattles), "not measured here: no fires that look like fighting were found within 300 km, and the ACLED file has no battles within 300 km of this area, so every square counts as far from fighting (this does not make the land safe)");
  assert.equal(notMeasuredReason(noBattles).clause, "feasibility is not measured here (no fires that look like fighting were found within 300 km, and the ACLED file has no battles within 300 km of this area)");
  assert.match(warNote(noBattles).line, /Feasibility \(safe access\) is not measured here: no fires that look like fighting were found within 300 km, and the ACLED file has no battles within 300 km of this area \(this does not make the land safe\)\.$/);
  assert.match(ruleText("nearTerm", { gatePercentile: 30 }, noBattles), /and the ACLED file has no battles within 300 km of this area\), so nothing can be left out for it\./);
  assert.equal(accessMeaning(missing), "not measured here: no fires that look like fighting were found within 300 km, and the ACLED file could not be used, so every square counts as far from fighting (this does not make the land safe)");
  for (const said of [noBattles, missing, notAcled, unreadable]) {
    for (const text of [accessMeaning(said), notMeasuredReason(said).clause, warNote(said).line, ruleText("nearTerm", { gatePercentile: 30 }, said)]) {
      assert.doesNotMatch(text, /there is no ACLED file/, text);
    }
    // Without the run's own line, Settings still never says to connect a file.
    assert.doesNotMatch(noFightingNote(said), /An ACLED file of recorded fighting would measure it/);
  }
  assert.equal(noFightingNote(noBattles), "No fires that look like fighting were found within 300 km. Feasibility (safe access) is not measured here: every square counts as far from fighting, which does NOT make the land safe. Nor can ACLED: the ACLED file has no battles within 300 km of this area.");
});

test("safe access at peace, before the war, with an ACLED file and with fires that look like fighting reads as before", () => {
  const listPeace = { ...run, conflict: null, conflictSource: "list", accessSource: "none" };
  const teamPeace = { ...run, conflict: null, conflictSource: "area", accessSource: "none" };
  const early = { ...run, month: "2025-12", conflict: { id: "area-x", name: "War (set for this area)", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "none" };
  const fires = { ...run, conflict: lebanonWar, conflictSource: "list", accessSource: "fires" };
  const acled = { ...fires, accessSource: "acled" };
  for (const measuredRun of [fires, acled, { ...listPeace, accessSource: "acled" }]) {
    assert.equal(noFightingFound(measuredRun), false);
    assert.equal(accessMeasured(measuredRun), true);
    assert.equal(setAsideNote(measuredRun), null);
    assert.equal(longTermAccessNote(measuredRun), "");
    assert.equal(notMeasuredReason(measuredRun), null);
    assert.equal(noFightingNote(measuredRun), null);
  }
  assert.equal(accessMeaning(fires), "the distance to unusual fires (an estimate of where fighting is; no ACLED file), full at 100 km");
  assert.equal(warNote(fires).line, "Israel–Hezbollah war (south Lebanon, northern Israel and the Golan Heights), since 8 October 2023: damage is counted from that day.");
  // The weights panel's line, word for word as it was.
  assert.equal(setAsideNote(listPeace), "Feasibility not measured here (no war recorded): nothing is left out");
  assert.equal(setAsideNote(teamPeace), "Feasibility not measured here (not at war, set by your team): nothing is left out");
  assert.equal(setAsideNote(early), "Feasibility not measured here (before the war, which began on 1 June 2026): nothing is left out");
  assert.equal(setAsideNote(null), null);
  assert.deepEqual(notMeasuredReason(teamPeace), peaceReason(teamPeace));
  assert.equal(notMeasuredReason(listPeace).note, "no war recorded");
  assert.equal(longTermAccessNote(listPeace), " (feasibility is not measured here: it is full everywhere, so the order follows value and damage)");
  for (const quiet of [listPeace, teamPeace, early]) {
    assert.equal(noFightingFound(quiet), false);
    assert.equal(noFightingNote(quiet), null);
  }
  // Outside a war the peace words win, whatever the run says.
  assert.equal(noFightingFound({ ...listPeace, accessSource: "fires-none" }), false);
  assert.equal(accessMeaning({ ...listPeace, accessSource: "fires-none" }), accessMeaning(listPeace));
});

test("warningWords: the server's saved warnings read in today's words (Feasibility, left out), nothing else changes", async () => {
  const { warningWords } = await import("./overview.js");
  const { NO_WAR_WARNING, TEAM_PEACE_WARNING, beforeWarWarning } = await import("../../../server/runs.js");
  for (const w of [NO_WAR_WARNING, TEAM_PEACE_WARNING, beforeWarWarning("2026-06-01")]) {
    const said = warningWords(w);
    assert.doesNotMatch(said, /set aside/);
    assert.match(said, /Feasibility \(distance to fighting\) is not measured/);
    assert.match(said, /nothing is left out for it/);
    assert.match(said, /does not mean the land is safe/);
  }
  assert.equal(warningWords("Safe access is not measured here: no fires that look like fighting were found within 300 km."), "Feasibility (safe access) is not measured here: no fires that look like fighting were found within 300 km.");
  assert.equal(warningWords("Cloudy month."), "Cloudy month.");
});
