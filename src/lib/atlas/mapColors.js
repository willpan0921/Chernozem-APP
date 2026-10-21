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
// Also the words of the map key (src/components/atlas/MapLegend.jsx): its
// legend (legendFor), its note where safe access is not measured because
// no fire looked like fighting (accessKeyNote), and its "How it's
// measured" panel (methodsFor).
//
// WHO EDITS IT
// Whoever changes how the map is coloured. Tested in mapColors.test.js.

import { atlasMethods } from "../../config/research.js";
import { accessMeasured, atPeace, beforeWar, noFightingFound, notMeasuredReason, warInPart, warPartOf, warSetByTeam } from "./overview.js";

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

// The legend for a colour mode and a run. Where no war in the app's list
// covers the run, or the team marked the area as not at war (Atlas
// Settings: run.conflictSource "area"), or the month ends before its war
// began, and no ACLED file was used (overview.js accessMeasured), distance
// to fighting is not measured: every square reads 100 km +, which is not
// the same as safe. Nor is it in a war where no fire looked like fighting
// (overview.js noFightingFound): "Fires too sparse to tell", never a word
// that reads as "no fighting".
export function legendFor(colorBy, run) {
  const legend = LEGENDS[colorBy] || LEGENDS.priority;
  if (colorBy === "access" && run && !accessMeasured(run)) {
    const high = noFightingFound(run) ? "Fires too sparse to tell" : beforeWar(run) ? "Before the war" : warSetByTeam(run) ? "Not at war (your team)" : "No war listed";
    return { ...legend, title: "Distance to fighting: not measured", high };
  }
  return legend;
}

// The map key's line where safe access is not measured because no fire
// looked like fighting (overview.js noFightingFound): the key leaves the
// Access colouring out (every square would read "100 km +", which in a war
// zone is not safe to reach) and says why: "Safe access not measured here:
// no fires that look like fighting were found within 300 km". Null for any
// other run (at peace the key has no Access colouring either, and the
// "How it's measured" panel says why).
export function accessKeyNote(run) {
  if (!noFightingFound(run)) return null;
  const reason = notMeasuredReason(run);
  return `${reason.short}: ${reason.found}`;
}

// The "How it's measured" panel's words for this run (src/config/
// research.js atlasMethods):
//   at peace           the damage score is the heavily damaged share, and
//                      safe access is not measured unless an ACLED file is
//                      (whatTeamPeace when the team marked the area as not
//                      at war, Atlas Settings)
//   before its war     the month ends before its war began: no war damage
//                      is counted and distance is not measured
//   no fighting found  in a war where no fire looked like fighting
//                      (overview.js noFightingFound): the war's words, but
//                      safe access is not measured (whatNoFighting) and
//                      nothing is set aside (noteNoFighting)
//   a war in part      a war that covers the area (a whole country, or a
//                      region, box or drawn area) only in part: the note
//                      says its rules apply in the squares that touch its
//                      region (and those in another listed war, when there
//                      are any: run.otherWarSquares), and the two peace
//                      rules used elsewhere
export function methodsFor(run) {
  const peace = atPeace(run);
  const before = beforeWar(run);
  const measured = !run || accessMeasured(run);
  const noFighting = noFightingFound(run);
  // Where no fire looked like fighting: what was searched (inside the war's
  // region, for a war in part of the area) and what the ACLED file did, as
  // the key's note and the war line say it (overview.js notMeasuredReason).
  const notMeasuredItems = () => {
    const reason = notMeasuredReason(run);
    const what = (item) => `Not measured here: ${reason.found}, and ${reason.acled}. ${item.whatNoFighting}`;
    return atlasMethods.items.map((item) => (item.id === "access" && item.whatNoFighting ? { ...item, what: what(item) } : item));
  };
  const warNote = noFighting ? atlasMethods.noteNoFighting || atlasMethods.note : atlasMethods.note;
  // A war in part of the area: the war's words, and where they apply.
  if (warInPart(run)) {
    const part = warPartOf(run.conflict) === "area" ? atlasMethods.notePartOfArea : atlasMethods.notePartOfCountry;
    const other = run.otherWarSquares > 0 ? atlasMethods.notePartOtherWar : "";
    return { ...atlasMethods, ...(noFighting ? { items: notMeasuredItems() } : {}), note: [warNote, part, other, atlasMethods.notePartElsewhere].filter(Boolean).join(" ") };
  }
  if (noFighting) return { ...atlasMethods, items: notMeasuredItems(), note: warNote };
  if (!peace && !before && measured) return atlasMethods;
  const team = warSetByTeam(run);
  const words = (item) => {
    if (item.id === "access") {
      if (measured) return {};
      return { what: (before && item.whatBeforeWar) || (team && item.whatTeamPeace) || item.whatPeace || item.what };
    }
    if (before && item.whatBeforeWar) return { what: item.whatBeforeWar, ...(item.formulaBeforeWar ? { formula: item.formulaBeforeWar } : {}) };
    if (peace && item.whatPeace) return { what: item.whatPeace, ...(item.formulaPeace ? { formula: item.formulaPeace } : {}) };
    return {};
  };
  return {
    ...atlasMethods,
    items: atlasMethods.items.map((item) => ({ ...item, ...words(item) })),
    note: measured ? atlasMethods.note : atlasMethods.notePeace || atlasMethods.note,
  };
}

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
  if (entry.tier === "noBlackSoil") return "Not ranked: no black-soil cropland";
  if (!Number.isFinite(entry.rank)) return "Not ranked";
  return `Rank ${entry.rank.toLocaleString("en-US")} of ${Number(total || 0).toLocaleString("en-US")}`;
}
