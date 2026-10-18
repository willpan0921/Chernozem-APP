// WHAT THIS FILE DOES
// Decides which colour step each map square gets, for the three ways of
// colouring the Atlas map:
//
//   priority  by rank in the chosen time frame (top 10% = darkest green).
//             In Near term, squares set aside for safety are grey.
//   damage    by the damage score (fires and soil-health decline).
//   access    by distance to the fighting (darkest blue = 100 km or more).
//
// Steps go from 1 (lightest) to 5 (darkest). The colours themselves are
// CSS variables in src/styles/tokens.css (--map-priority-1 ... -5 and so
// on), so the design can change them without touching this file.
//
// Damage and access use FIXED cut points (not "best = darkest"), so the
// same colour means the same thing in every month and every area.
//
// WHO EDITS IT
// Whoever changes how the map is coloured. Tested in mapColors.test.js.

export const COLOR_MODES = ["priority", "damage", "access"];

// Steps returned for squares that are not coloured on the ramp.
export const STEP_NONE = 0; // no data
export const STEP_SET_ASIDE = -1; // set aside in Near term (too little safe access)

// Priority: the share of ranked squares, counted from the top, in each step.
const PRIORITY_CUTS = [0.1, 0.25, 0.5, 0.75]; // step 5, 4, 3, 2; the rest 1
// Damage score (0..1) at which each step starts: 2, 3, 4, 5.
const DAMAGE_CUTS = [0.05, 0.15, 0.3, 0.5];
// Safe-access score (distance / 100 km) at which each step starts: 2, 3, 4, 5.
const ACCESS_CUTS = [0.2, 0.4, 0.6, 0.8];

// What the legend says at each end of the ramp, and its title.
export const LEGENDS = {
  priority: { title: "Priority", low: "Lower", high: "Highest" },
  damage: { title: "Damage", low: "Little", high: "Severe" },
  access: { title: "Distance to fighting", low: "Under 20 km", high: "100 km +" },
};

function stepFromCuts(value, cuts) {
  if (!Number.isFinite(value)) return STEP_NONE;
  let step = 1;
  for (const cut of cuts) if (value >= cut) step += 1;
  return step;
}

// The number of ranked places in a time frame (for priority steps).
export function rankedCount(places, timeframe) {
  let count = 0;
  for (const place of places || []) if (Number.isFinite(place?.[timeframe]?.rank)) count += 1;
  return count;
}

// The colour step (1..5, STEP_NONE or STEP_SET_ASIDE) of one place.
//   total - rankedCount(places, timeframe), passed in so it is worked out once
export function colorStep(place, colorBy, timeframe, total) {
  if (!place) return STEP_NONE;
  if (colorBy === "damage") return stepFromCuts(place.damage, DAMAGE_CUTS);
  if (colorBy === "access") return stepFromCuts(place.access, ACCESS_CUTS);
  const entry = place[timeframe] || {};
  if (entry.tier === "setAside") return STEP_SET_ASIDE;
  if (!Number.isFinite(entry.rank) || !(total > 0)) return STEP_NONE;
  const share = entry.rank / total;
  let step = 5;
  for (const cut of PRIORITY_CUTS) {
    if (share <= cut) return step;
    step -= 1;
  }
  return 1;
}

// The CSS variable name for a step: "--map-damage-3", "--map-setaside"...
export function colorVar(colorBy, step) {
  if (step === STEP_SET_ASIDE) return "--map-setaside";
  if (step === STEP_NONE) return "--map-nodata";
  return `--map-${COLOR_MODES.includes(colorBy) ? colorBy : "priority"}-${step}`;
}

// The short value shown when hovering a square, e.g. "Rank 12 of 1,176",
// "Set aside in Near term", "Damage 45 / 100", "About 42 km from fighting".
export function valueText(place, colorBy, timeframe, total) {
  if (!place) return "";
  if (colorBy === "damage") {
    return Number.isFinite(place.damage) ? `Damage ${Math.round(place.damage * 100)} / 100` : "No damage data";
  }
  if (colorBy === "access") {
    const km = place.raw?.conflictKm;
    if (Number.isFinite(km)) return km >= 100 ? "100 km + from fighting" : `About ${Math.round(km)} km from fighting`;
    return Number.isFinite(place.access) ? `Access ${Math.round(place.access * 100)} / 100` : "No access data";
  }
  const entry = place[timeframe] || {};
  if (entry.tier === "setAside") return "Set aside (little safe access)";
  if (!Number.isFinite(entry.rank)) return "Not ranked";
  return `Rank ${entry.rank.toLocaleString("en-US")} of ${Number(total || 0).toLocaleString("en-US")}`;
}
