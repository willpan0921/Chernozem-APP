// WHAT THIS FILE DOES
// Checks which colour step each map square gets (mapColors.js).
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the map is coloured.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlaces } from "./scoring.js";
import { STEP_NONE, STEP_SET_ASIDE, colorStep, colorVar, rankedCount, valueText } from "./mapColors.js";
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
