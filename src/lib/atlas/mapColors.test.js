// WHAT THIS FILE DOES
// Checks which colour step each map square gets (mapColors.js).
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the map is coloured.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlaces } from "./scoring.js";
import { LOWEST_SHADE_NOTE, STEP_NONE, accessKeyNote, colorStep, colorVar, leftOutText, legendFor, methodsFor, priorityMethods, rankedCount, valueText } from "./mapColors.js";
import { atlasMethods } from "../../config/research.js";
import { makePlaces } from "./testPlaces.js";

const { places } = scorePlaces(makePlaces(12, 12));

test("priority: the top 10% are the darkest, squares left out for now get the lowest shade (no grey)", () => {
  const total = rankedCount(places, "nearTerm");
  const best = places.find((p) => p.nearTerm.rank === 1);
  const worst = places.find((p) => p.nearTerm.rank === total);
  assert.equal(colorStep(best, "priority", "nearTerm", total), 5);
  assert.equal(colorStep(worst, "priority", "nearTerm", total), 1);
  const aside = places.find((p) => p.nearTerm.tier === "setAside");
  assert.equal(colorStep(aside, "priority", "nearTerm", total), 1);
  assert.equal(colorVar("priority", colorStep(aside, "priority", "nearTerm", total)), "--map-priority-1");
  // Postwar sets nothing aside.
  const postTotal = rankedCount(places, "postwar");
  assert.equal(postTotal, 144);
  assert.ok(places.every((p) => colorStep(p, "priority", "postwar", postTotal) >= 1));
});

test("priority steps hold roughly 10 / 15 / 25 / 25 / 25 percent", () => {
  const total = rankedCount(places, "postwar");
  const counts = [0, 0, 0, 0, 0, 0];
  for (const p of places) counts[colorStep(p, "priority", "postwar", total)] += 1;
  assert.deepEqual(counts.slice(1).reverse(), [14, 22, 36, 36, 36]);
});

test("value, damage and access use fixed cut points", () => {
  assert.equal(colorStep({ soil: 0.1 }, "value"), 1);
  assert.equal(colorStep({ soil: 0.45 }, "value"), 3);
  assert.equal(colorStep({ soil: 0.95 }, "value"), 5);
  assert.equal(colorStep({ soil: null }, "value"), STEP_NONE);
  assert.equal(colorStep({ damage: 0.04 }, "damage"), 1);
  assert.equal(colorStep({ damage: 0.2 }, "damage"), 3);
  assert.equal(colorStep({ damage: 0.9 }, "damage"), 5);
  assert.equal(colorStep({ access: 0.1 }, "access"), 1);
  assert.equal(colorStep({ access: 1 }, "access"), 5);
  assert.equal(colorStep({ access: null }, "access"), STEP_NONE);
});

test("colour variables and hover text", () => {
  assert.equal(colorVar("damage", 3), "--map-damage-3");
  assert.equal(colorVar("value", 2), "--map-value-2");
  assert.equal(colorVar("priority", -1), "--map-nodata");
  assert.equal(colorVar("access", STEP_NONE), "--map-nodata");
  assert.equal(valueText({ damage: 0.454 }, "damage"), "Damage 45 / 100");
  assert.equal(valueText({ soil: 0.716 }, "value"), "Value 72 / 100");
  assert.equal(valueText({ raw: { conflictKm: 41.6 } }, "access"), "Feasibility: about 42 km from fighting");
  assert.equal(valueText({ raw: { conflictKm: 140 } }, "access"), "Feasibility: 100 km + from fighting");
  assert.equal(valueText({ access: 0.5 }, "access"), "Feasibility 50 / 100");
  assert.equal(valueText({ nearTerm: { rank: 12 } }, "priority", "nearTerm", 1176), "Rank 12 of 1,176");
  assert.equal(valueText({ nearTerm: { tier: "setAside" } }, "priority", "nearTerm", 10), "Left out for now (least feasible)");
  assert.equal(LOWEST_SHADE_NOTE, "Lowest priority, or left out for now (least feasible)");
  assert.equal(leftOutText(31), "Left out of the near-term ranking for now: among the least feasible 31% (Feasibility cutoff)");
});

test("the access key at peace says distance to fighting is not measured, and who decided there is no war", () => {
  assert.equal(legendFor("access", { conflict: { id: "ukraine-2022", since: "2022-02-24" }, accessSource: "fires" }).title, "Feasibility: distance to fighting");
  const listed = legendFor("access", { conflict: null, conflictSource: "list", accessSource: "none" });
  assert.deepEqual([listed.title, listed.high], ["Feasibility: not measured", "No war listed"]);
  const team = legendFor("access", { conflict: null, conflictSource: "area", accessSource: "none" });
  assert.deepEqual([team.title, team.high], ["Feasibility: not measured", "Not at war (your team)"]);
  // With an ACLED file access is measured even at peace.
  assert.equal(legendFor("access", { conflict: null, conflictSource: "area", accessSource: "acled" }).title, "Feasibility: distance to fighting");
  // A month that ends before its war began: not measured either.
  const early = legendFor("access", { month: "2025-12", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "none" });
  assert.deepEqual([early.title, early.high], ["Feasibility: not measured", "Before the war"]);
  assert.equal(legendFor("access", { month: "2026-08", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "fires" }).title, "Feasibility: distance to fighting");
});

// A run in a war where no fire looked like fighting (overview.js
// noFightingFound), and the same war with fires that did.
const lebanon = { id: "israel-hezbollah", name: "Israel–Hezbollah war", since: "2023-10-08" };
const quietWar = { month: "2026-09", conflict: lebanon, conflictSource: "list", accessSource: "fires-none" };
const firesWar = { ...quietWar, accessSource: "fires" };
const accessWords = (methods) => methods.items.find((item) => item.id === "access").what;

test("the map key where no fire looked like fighting: no Access colouring, a line that says why, never 'far from fighting'", () => {
  const legend = legendFor("access", quietWar);
  assert.deepEqual([legend.title, legend.high], ["Feasibility: not measured", "Fires too sparse to tell"]);
  assert.equal(legendFor("access", firesWar).title, "Feasibility: distance to fighting");
  assert.equal(legendFor("priority", quietWar).title, "Priority");
  assert.equal(accessKeyNote(quietWar), "Feasibility not measured here: no fires that look like fighting were found within 300 km");
  // Only there: at peace, before the war, with fires or an ACLED file, no line.
  for (const other of [firesWar, { ...firesWar, accessSource: "acled" }, { conflict: null, conflictSource: "list", accessSource: "none" }, { month: "2025-12", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "none" }, null]) {
    assert.equal(accessKeyNote(other), null);
  }
  // A war in part of the area: only the fires inside its region counted.
  const inPart = { ...quietWar, conflict: { ...lebanon, partOfCountry: true }, warSquares: 4, otherWarSquares: 0 };
  assert.equal(accessKeyNote(inPart), "Feasibility not measured here: no fires that look like fighting were found within 300 km inside the war's region");
});

test("the 'How it's measured' panel: safe access not measured where no fire looked like fighting, the other cases as before", () => {
  const quiet = methodsFor(quietWar);
  const why = atlasMethods.items.find((item) => item.id === "access").whatNoFighting;
  assert.equal(accessWords(quiet), `Not measured here: no fires that look like fighting were found within 300 km, and there is no ACLED file. ${why}`);
  assert.match(accessWords(quiet), /does NOT make the land safe/);
  // Both conditions of the fire rule, never only the density.
  assert.match(accessWords(quiet), /as dense as at a front line and well above the place's normal years/);
  assert.equal(quiet.note, atlasMethods.noteNoFighting);
  assert.doesNotMatch(quiet.note, /sets aside the least safe/);
  // The war's damage words stay.
  assert.equal(quiet.items.find((item) => item.id === "damage").what, atlasMethods.items.find((item) => item.id === "damage").what);
  // A war in part of the area: only the fires inside its region were
  // looked at, as the key's note above the panel says, and both notes.
  const inPart = methodsFor({ ...quietWar, conflict: { ...lebanon, partOfCountry: true } });
  assert.equal(accessWords(inPart), `Not measured here: no fires that look like fighting were found within 300 km inside the war's region, and there is no ACLED file. ${why}`);
  assert.ok(accessWords(inPart).startsWith(`Not measured here: ${accessKeyNote({ ...quietWar, conflict: { ...lebanon, partOfCountry: true } }).split(": ")[1]}`));
  assert.match(accessWords(methodsFor({ ...quietWar, conflict: { ...lebanon, partOfCountry: true }, otherWarSquares: 3 })), /within 300 km inside the war's region and its squares in another listed war, and there is no ACLED file\./);
  assert.ok(inPart.note.startsWith(`${atlasMethods.noteNoFighting} ${atlasMethods.notePartOfCountry}`), inPart.note);
  // An ACLED file connected without battles near the area (its warning on
  // the run): never "there is no ACLED file".
  const withFile = methodsFor({ ...quietWar, checks: { warnings: ["The ACLED file has no battles within 300 km of this area in the last 12 months."] } });
  assert.equal(accessWords(withFile), `Not measured here: no fires that look like fighting were found within 300 km, and the ACLED file has no battles within 300 km of this area. ${why}`);
  // Unchanged: a war with fires (the panel as written), with no run, at
  // peace, the team's peace and before the war.
  // The score words are exactly the research text; the panel also explains priority.
  const { priority: firesPriority, ...firesScores } = methodsFor(firesWar);
  assert.deepEqual(firesScores, atlasMethods);
  assert.equal(firesPriority.frames[0].steps[0].startsWith("Gate: the least feasible places are left out"), true);
  const { priority: nullPriority, ...nullScores } = methodsFor(null);
  assert.deepEqual(nullScores, atlasMethods);
  assert.ok(nullPriority);
  const firesInPart = methodsFor({ ...firesWar, conflict: { ...lebanon, partOfCountry: true } });
  assert.equal(accessWords(firesInPart), atlasMethods.items.find((item) => item.id === "access").what);
  assert.ok(firesInPart.note.startsWith(`${atlasMethods.note} ${atlasMethods.notePartOfCountry}`));
  const access = atlasMethods.items.find((item) => item.id === "access");
  assert.equal(accessWords(methodsFor({ conflict: null, conflictSource: "list", accessSource: "none" })), access.whatPeace);
  assert.equal(accessWords(methodsFor({ conflict: null, conflictSource: "area", accessSource: "none" })), access.whatTeamPeace);
  assert.equal(accessWords(methodsFor({ month: "2025-12", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "none" })), access.whatBeforeWar);
  assert.equal(methodsFor({ conflict: null, conflictSource: "list", accessSource: "none" }).note, atlasMethods.notePeace);
  assert.equal(accessWords(methodsFor({ conflict: null, conflictSource: "list", accessSource: "acled" })), access.what);
});

test("not ranked places are hatched, never the lowest green, and the key says why only when there are some", async () => {
  const { unrankedNote, unitsNote } = await import("./mapColors.js");
  const ranked = { id: "a", soil: 0.5, damage: 0.2, access: 1, nearTerm: { rank: 1, tier: "highest" }, postwar: { rank: 1, tier: "highest" } };
  const noSoil = { id: "b", soil: 0.3, damage: 0.1, access: 1, nearTerm: { rank: null, tier: "noBlackSoil" }, postwar: { rank: null, tier: "noBlackSoil" } };
  assert.equal(colorVar("priority", colorStep(noSoil, "priority", "nearTerm", 1)), "--map-nodata");
  assert.notEqual(colorVar("priority", colorStep(noSoil, "priority", "nearTerm", 1)), "--map-priority-1");
  assert.equal(unrankedNote([ranked], "priority", "nearTerm"), null);
  // Kenya-like: North Eastern has no black-soil cropland.
  assert.equal(unrankedNote([ranked, noSoil], "priority", "nearTerm"), "Not ranked: no black-soil cropland");
  // A state smaller than a square (Buenos Aires' urban partidos).
  const empty = { id: "c", cellIds: [], squares: 0, soil: null, damage: null, access: null, nearTerm: { rank: null, tier: "notAnalyzed" } };
  assert.equal(unrankedNote([ranked, noSoil, empty], "priority", "nearTerm"), "Not ranked: no black-soil cropland or no map square in it");
  // On the Value map the no-black-soil state has a value (coloured), the empty one none.
  assert.equal(unrankedNote([ranked, noSoil], "value", "nearTerm"), null);
  assert.equal(unrankedNote([ranked, empty], "value", "nearTerm"), "No reading");
  // The States view's note in the units' own words.
  assert.match(unitsNote(atlasMethods.noteUnits, { one: "district", many: "districts" }), /^A district's value, damage and feasibility .* across the districts .* A district is judged by its average/);
  assert.doesNotMatch(unitsNote(atlasMethods.noteUnits, { one: "district", many: "districts" }), /\{|state/);
  assert.match(unitsNote(atlasMethods.noteUnits), /^A state's/);
});

test("How it's measured explains the two time frames: the gate in Near term, the blend in Post-crisis", () => {
  const war = { conflict: { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }, accessSource: "fires" };
  const measured = priorityMethods(war);
  assert.deepEqual(measured.frames.map((f) => [f.name, f.tag]), [["Near term", "Gated"], ["Post-crisis", "Blended"]]);
  assert.match(measured.frames[0].steps.join(" "), /Gate: .*Ramp: .*Value and Damage only/);
  assert.match(measured.frames[1].steps.join(" "), /Nothing is left out/);
  assert.match(measured.frames[0].formula, /ramp/);
  assert.match(measured.frames[1].formula, /Feasibility/);
  assert.match(measured.blend, /r = 0\.5/);
  // Where Feasibility is not measured (at peace), the gate leaves nothing out.
  const peace = priorityMethods({ conflict: null, accessSource: "none" });
  assert.match(peace.frames[0].steps[0], /not measured here, so the gate leaves nothing out/);
  assert.doesNotMatch(peace.frames[0].steps.join(" "), /Ramp/);
  // The steps never leak the other set's key.
  assert.equal(measured.frames[0].stepsUnmeasured, undefined);
});
