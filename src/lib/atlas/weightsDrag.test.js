// WHAT THIS FILE DOES
// Checks that moving a weight slider and putting it back gives back the
// weights you started with. The weights panel
// (src/components/atlas/WeightsPanel.jsx) works every step of a drag out
// from the weights the drag started from; this shows why that is needed
// and that it works.
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the weight sliders behave.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rebalanceWeights } from "./weights.js";

const START = { soil: 30, damage: 40, access: 30 };

// One drag: every step is worked out from the weights at the start.
function drag(start, key, values) {
  let weights = start;
  for (const value of values) weights = rebalanceWeights(start, key, value);
  return weights;
}

const steps = (from, to) => {
  const list = [];
  const dir = to > from ? 1 : -1;
  for (let v = from + dir; dir > 0 ? v <= to : v >= to; v += dir) list.push(v);
  return list;
};

test("Safe access +30 then -30 in steps of 1 gives back 30/40/30", () => {
  assert.deepEqual(drag(START, "access", [...steps(30, 60), ...steps(60, 30)]), START);
});

test("Damage 40 -> 90 -> 40 gives back 30/40/30", () => {
  assert.deepEqual(drag(START, "damage", [...steps(40, 90), ...steps(90, 40)]), START);
});

test("even through 100 and 0 the start comes back", () => {
  assert.deepEqual(drag(START, "soil", [...steps(30, 100), ...steps(100, 0), ...steps(0, 30)]), START);
});

test("stepping from the last rounded result instead drifts (the old bug)", () => {
  let weights = START;
  for (const value of [...steps(30, 60), ...steps(60, 30)]) weights = rebalanceWeights(weights, "access", value);
  assert.notDeepEqual(weights, START);
});
