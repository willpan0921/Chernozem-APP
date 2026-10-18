// WHAT THIS FILE DOES
// The rule behind the three weight sliders (Soil value, Damage, Safe
// access): they always add up to 100. Moving one slider gives the rest of
// the 100 to the other two, in the same proportion they had before.
//
//   rebalanceWeights({ soil: 30, damage: 40, access: 30 }, "damage", 60)
//     -> { soil: 20, damage: 60, access: 20 }
//
// WHO EDITS IT
// Whoever changes how the weight sliders behave. Tested in weights.test.js.

export const WEIGHT_KEYS = ["soil", "damage", "access"];

// Sets one weight and rescales the other two so the three add up to 100.
// All three stay whole numbers.
export function rebalanceWeights(weights, key, value) {
  const target = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  const others = WEIGHT_KEYS.filter((other) => other !== key);
  const rest = 100 - target;
  const before = others.reduce((sum, other) => sum + Math.max(0, Number(weights?.[other]) || 0), 0);

  // Share the rest in the old proportion, or equally when both were 0.
  const exact = others.map((other) => (before > 0 ? (rest * Math.max(0, Number(weights?.[other]) || 0)) / before : rest / 2));
  const rounded = exact.map(Math.floor);
  // Hand out what rounding down left over, biggest remainder first.
  let leftover = rest - rounded[0] - rounded[1];
  const order = [0, 1].sort((a, b) => exact[b] - rounded[b] - (exact[a] - rounded[a]));
  for (const index of order) {
    if (leftover <= 0) break;
    rounded[index] += 1;
    leftover -= 1;
  }

  const next = { [key]: target };
  others.forEach((other, index) => {
    next[other] = rounded[index];
  });
  return { soil: next.soil, damage: next.damage, access: next.access };
}
