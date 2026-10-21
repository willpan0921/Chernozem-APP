// WHAT THIS FILE DOES
// Checks which colour step each map square gets (mapColors.js).
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the map is coloured.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlaces } from "./scoring.js";
import { STEP_NONE, STEP_SET_ASIDE, accessKeyNote, colorStep, colorVar, legendFor, methodsFor, rankedCount, valueText } from "./mapColors.js";
import { atlasMethods } from "../../config/research.js";
import { makePlaces } from "./testPlaces.js";

const { places } = scorePlaces(makePlaces(12, 12));

test("priority: the top 10% are the darkest, set-aside squares are grey", () => {
  const total = rankedCount(places, "nearTerm");
  const best = places.find((p) => p.nearTerm.rank === 1);
  const worst = places.find((p) => p.nearTerm.rank === total);
  assert.equal(colorStep(best, "priority", "nearTerm", total), 5);
  assert.equal(colorStep(worst, "priority", "nearTerm", total), 1);
  const aside = places.find((p) => p.nearTerm.tier === "setAside");
  assert.equal(colorStep(aside, "priority", "nearTerm", total), STEP_SET_ASIDE);
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

test("damage and access use fixed cut points", () => {
  assert.equal(colorStep({ damage: 0.04 }, "damage"), 1);
  assert.equal(colorStep({ damage: 0.2 }, "damage"), 3);
  assert.equal(colorStep({ damage: 0.9 }, "damage"), 5);
  assert.equal(colorStep({ access: 0.1 }, "access"), 1);
  assert.equal(colorStep({ access: 1 }, "access"), 5);
  assert.equal(colorStep({ access: null }, "access"), STEP_NONE);
});

test("colour variables and hover text", () => {
  assert.equal(colorVar("damage", 3), "--map-damage-3");
  assert.equal(colorVar("priority", STEP_SET_ASIDE), "--map-setaside");
  assert.equal(colorVar("access", STEP_NONE), "--map-nodata");
  assert.equal(valueText({ damage: 0.454 }, "damage"), "Damage 45 / 100");
  assert.equal(valueText({ raw: { conflictKm: 41.6 } }, "access"), "About 42 km from fighting");
  assert.equal(valueText({ raw: { conflictKm: 140 } }, "access"), "100 km + from fighting");
  assert.equal(valueText({ nearTerm: { rank: 12 } }, "priority", "nearTerm", 1176), "Rank 12 of 1,176");
  assert.equal(valueText({ nearTerm: { tier: "setAside" } }, "priority", "nearTerm", 10), "Set aside (little safe access)");
});

test("the access key at peace says distance to fighting is not measured, and who decided there is no war", () => {
  assert.equal(legendFor("access", { conflict: { id: "ukraine-2022", since: "2022-02-24" }, accessSource: "fires" }).title, "Distance to fighting");
  const listed = legendFor("access", { conflict: null, conflictSource: "list", accessSource: "none" });
  assert.deepEqual([listed.title, listed.high], ["Distance to fighting: not measured", "No war listed"]);
  const team = legendFor("access", { conflict: null, conflictSource: "area", accessSource: "none" });
  assert.deepEqual([team.title, team.high], ["Distance to fighting: not measured", "Not at war (your team)"]);
  // With an ACLED file access is measured even at peace.
  assert.equal(legendFor("access", { conflict: null, conflictSource: "area", accessSource: "acled" }).title, "Distance to fighting");
  // A month that ends before its war began: not measured either.
  const early = legendFor("access", { month: "2025-12", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "none" });
  assert.deepEqual([early.title, early.high], ["Distance to fighting: not measured", "Before the war"]);
  assert.equal(legendFor("access", { month: "2026-08", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "fires" }).title, "Distance to fighting");
});

// A run in a war where no fire looked like fighting (overview.js
// noFightingFound), and the same war with fires that did.
const lebanon = { id: "israel-hezbollah", name: "Israel–Hezbollah war", since: "2023-10-08" };
const quietWar = { month: "2026-09", conflict: lebanon, conflictSource: "list", accessSource: "fires-none" };
const firesWar = { ...quietWar, accessSource: "fires" };
const accessWords = (methods) => methods.items.find((item) => item.id === "access").what;

test("the map key where no fire looked like fighting: no Access colouring, a line that says why, never 'far from fighting'", () => {
  const legend = legendFor("access", quietWar);
  assert.deepEqual([legend.title, legend.high], ["Distance to fighting: not measured", "Fires too sparse to tell"]);
  assert.equal(legendFor("access", firesWar).title, "Distance to fighting");
  assert.equal(legendFor("priority", quietWar).title, "Priority");
  assert.equal(accessKeyNote(quietWar), "Safe access not measured here: no fires that look like fighting were found within 300 km");
  // Only there: at peace, before the war, with fires or an ACLED file, no line.
  for (const other of [firesWar, { ...firesWar, accessSource: "acled" }, { conflict: null, conflictSource: "list", accessSource: "none" }, { month: "2025-12", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "none" }, null]) {
    assert.equal(accessKeyNote(other), null);
  }
  // A war in part of the area: only the fires inside its region counted.
  const inPart = { ...quietWar, conflict: { ...lebanon, partOfCountry: true }, warSquares: 4, otherWarSquares: 0 };
  assert.equal(accessKeyNote(inPart), "Safe access not measured here: no fires that look like fighting were found within 300 km inside the war's region");
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
  assert.equal(methodsFor(firesWar), atlasMethods);
  assert.equal(methodsFor(null), atlasMethods);
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
