// WHAT THIS FILE DOES
// Checks that the three weight sliders always add up to 100 (weights.js).
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the weight sliders behave.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rebalanceWeights } from "./weights.js";

const total = (w) => w.soil + w.damage + w.access;

test("moving one weight rescales the other two in proportion", () => {
  assert.deepEqual(rebalanceWeights({ soil: 30, damage: 40, access: 30 }, "damage", 60), { soil: 20, damage: 60, access: 20 });
  assert.deepEqual(rebalanceWeights({ soil: 30, damage: 40, access: 30 }, "soil", 0), { soil: 0, damage: 57, access: 43 });
  assert.deepEqual(rebalanceWeights({ soil: 30, damage: 40, access: 30 }, "access", 100), { soil: 0, damage: 0, access: 100 });
});

test("when the other two are both 0 they share the rest equally", () => {
  assert.deepEqual(rebalanceWeights({ soil: 0, damage: 0, access: 100 }, "access", 61), { soil: 20, damage: 19, access: 61 });
});

test("always whole numbers that add up to 100", () => {
  let weights = { soil: 30, damage: 40, access: 30 };
  for (let i = 0; i < 300; i++) {
    const key = ["soil", "damage", "access"][i % 3];
    weights = rebalanceWeights(weights, key, (i * 37) % 101);
    assert.equal(total(weights), 100);
    for (const value of Object.values(weights)) assert.ok(Number.isInteger(value) && value >= 0 && value <= 100);
  }
});

test("values outside 0..100 are clamped", () => {
  assert.equal(rebalanceWeights({ soil: 30, damage: 40, access: 30 }, "soil", 150).soil, 100);
  assert.equal(rebalanceWeights({ soil: 30, damage: 40, access: 30 }, "soil", -5).soil, 0);
});
