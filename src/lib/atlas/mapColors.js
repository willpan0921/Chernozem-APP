// WHAT THIS FILE DOES
// Decides which colour step each map square (or state) gets, for the four
// ways of colouring the Atlas map (the Map page's tabs):
//
//   priority  by rank in the chosen time frame (top 10% = darkest green).
//             In Near term, squares left out for now by the Feasibility
//             cutoff (the least feasible) get the lightest green, the same
//             shade as the lowest priority: never grey.
//   value     by the soil value score (black soil and cropland; greens).
//   damage    by the damage score (fires and soil-health decline).
//   access    Feasibility: by distance to the fighting (darkest blue =
//             100 km or more). The code's key stays "access".
//
// Steps go from 1 (lightest) to 5 (darkest). The colours themselves are
// CSS variables in src/styles/tokens.css (--map-priority-1 ... -5 and so
// on), so the design can change them without touching this file.
//
// Value, damage and access use FIXED cut points (not "best = darkest"), so the
// same colour means the same thing in every month and every area.
//
// Also the words of the map key (src/components/atlas/MapLegend.jsx): its
// legend (legendFor), its note where safe access is not measured because
// no fire looked like fighting (accessKeyNote), and its "How it's
// measured" panel (methodsFor).
//
// WHO EDITS IT
// Whoever changes how the map is coloured. Tested in mapColors.test.js.

import { atlasDisasterMethods, atlasMethods } from "../../config/research.js";
import { accessMeasured, accessSourceOf, atPeace, beforeWar, disasterHitLabel, disasterNoun, disasterType, isDisasterRun, noFightingFound, notMeasuredReason, warInPart, warPartOf, warSetByTeam } from "./overview.js";
import { FLOOD, WILDFIRE } from "./method.js";

export const COLOR_MODES = ["priority", "value", "damage", "access"];

// The step returned for squares that are not coloured on the ramp.
export const STEP_NONE = 0; // no data

// Priority: the share of ranked squares, counted from the top, in each step.
const PRIORITY_CUTS = [0.1, 0.25, 0.5, 0.75]; // step 5, 4, 3, 2; the rest 1
// Soil value score (0..1) at which each step starts: 2, 3, 4, 5.
const VALUE_CUTS = [0.2, 0.4, 0.6, 0.8];
// Damage score (0..1) at which each step starts: 2, 3, 4, 5.
const DAMAGE_CUTS = [0.05, 0.15, 0.3, 0.5];
// Safe-access score (distance / 100 km) at which each step starts: 2, 3, 4, 5.
const ACCESS_CUTS = [0.2, 0.4, 0.6, 0.8];

// What the legend says at each end of the ramp, and its title.
export const LEGENDS = {
  priority: { title: "Priority", low: "Lower", high: "Highest" },
  value: { title: "Value (soil)", low: "Low", high: "High" },
  damage: { title: "Damage", low: "Little", high: "Severe" },
  access: { title: "Feasibility: distance to fighting", low: "Under 20 km", high: "100 km +" },
};

// The key's line for the lightest Priority shade in Near term, where the
// Feasibility cutoff leaves the least feasible places out for now: they
// share the lowest priority shade (no grey).
export const LOWEST_SHADE_NOTE = "Lowest priority, or left out for now (least feasible)";

// The details' line for a place left out by the cutoff, e.g. "Left out of
// the near-term ranking for now: among the least feasible 31% (Feasibility
// cutoff)".
export function leftOutText(gatePercentile) {
  const gate = Number.isFinite(gatePercentile) ? Math.round(gatePercentile) : null;
  return `Left out of the near-term ranking for now: among the least feasible${gate !== null ? ` ${gate}%` : ""} (Feasibility cutoff)`;
}

// The legend for a colour mode and a run. Where no war in the app's list
// covers the run, or the team marked the area as not at war (Atlas
// Settings: run.conflictSource "area"), or the month ends before its war
// began, and no ACLED file was used (overview.js accessMeasured), distance
// to fighting is not measured: every square reads 100 km +, which is not
// the same as safe. Nor is it in a war where no fire looked like fighting
// (overview.js noFightingFound): "Fires too sparse to tell", never a word
// that reads as "no fighting".
// A natural disaster (overview.js isDisasterRun): the Damage key is "Damage:
// hit since 4 Sep 2023", the Feasibility key "Feasibility: not under water
// now" (a flood: the share of cropland not under water) or "Feasibility:
// distance to a fire now" (a wildfire, full at 10 km), and the
// not-measured key says why ("Not measured for a drought", "Before the
// flood").
export const DISASTER_LEGENDS = {
  flood: { title: "Feasibility: not under water now", low: "80% + under water", high: `${Math.round(FLOOD.dryNowShare * 100)}% or less under water` },
  wildfire: { title: "Feasibility: distance to a fire now", low: `Under ${WILDFIRE.fullKm / 5} km`, high: `${WILDFIRE.fullKm} km +` },
};
export function legendFor(colorBy, run) {
  const legend = LEGENDS[colorBy] || LEGENDS.priority;
  if (run && isDisasterRun(run)) {
    if (colorBy === "damage") return { ...legend, title: `Damage: ${disasterHitLabel(run).replace(/^Black/, "black")}` };
    if (colorBy === "access") {
      if (!accessMeasured(run)) return { ...legend, title: "Feasibility: not measured", high: notMeasuredReason(run).short };
      return { ...legend, ...(DISASTER_LEGENDS[disasterType(run)] || {}) };
    }
    return legend;
  }
  if (colorBy === "access" && run && !accessMeasured(run)) {
    const high = noFightingFound(run) ? "Fires too sparse to tell" : beforeWar(run) ? "Before the war" : warSetByTeam(run) ? "Not at war (your team)" : "No war listed";
    return { ...legend, title: "Feasibility: not measured", high };
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
// A flood's or a wildfire's Feasibility that is full in every square
// (nothing seen in the way anywhere): a true reading, but its map would be
// one flat colour, so the Feasibility tab is not offered (MapTabs) and
// this says why; null otherwise.
//   flood     "No square has more than 5% of its cropland under water now"
//   wildfire  "No fire burning within 10 km in the month's last 7 days"
export function flatAccessNote(run, places = []) {
  if (!isDisasterRun(run) || !accessMeasured(run)) return null;
  const scored = (places || []).filter((place) => place.analyzed !== false && Number.isFinite(place.access));
  if (!scored.length || scored.some((place) => place.access < 1)) return null;
  if (accessSourceOf(run) === "flood-now") return `No square has more than ${Math.round(FLOOD.dryNowShare * 100)}% of its cropland under water now`;
  if (accessSourceOf(run) === "fire-now") return `No fire burning within ${WILDFIRE.fullKm} km in the month's last ${WILDFIRE.nowDays} days`;
  return null;
}

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
  // A natural disaster: the damage and Feasibility items in its own words
  // (atlasMethods items' whatDisaster, formulaDisaster, sourceDisaster by
  // type), and a note without war words.
  if (run && isDisasterRun(run)) return disasterMethods(run);
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

function disasterMethods(run) {
  const type = disasterType(run);
  const noun = disasterNoun(run);
  const before = beforeWar(run);
  const measured = accessMeasured(run);
  const words = atlasDisasterMethods;
  const fill = (text) => String(text || "").replaceAll("{noun}", noun);
  const items = atlasMethods.items.map((item) => {
    const own = words[item.id];
    if (!own) return item;
    const source = own.sourceDisaster?.[type] || item.source;
    if (item.id === "damage") {
      if (before) return { ...item, what: fill(words.whatBeforeDisaster), formula: "Not counted before the disaster began", source };
      return { ...item, what: fill(own.whatDisaster?.[type] || item.what), formula: own.formulaDisaster?.[type] || item.formula, source };
    }
    const what = before ? words.whatBeforeDisaster : !measured && accessSourceNone(run) ? own.whatDisasterNone : own.whatDisaster?.[type];
    return { ...item, what: fill(what || item.what), formula: (measured && own.formulaDisaster?.[type]) || "Not measured", source };
  });
  const note = measured ? words.noteDisaster : words.noteDisasterUnmeasured;
  return { ...atlasMethods, items, note, limits: words.limitsDisaster?.[type] || atlasMethods.limits };
}
// A flood or wildfire month without the images that would measure it.
const accessSourceNone = (run) => run?.accessSource === "disaster-none";

// The "How it's measured" note for the States view (atlasMethods.noteUnits),
// in the units' own words: "{one}" and "{many}" become "state" and
// "states", or "district" and "districts" (with a capital at the start).
export function unitsNote(note, words = null) {
  if (!note) return "";
  const one = words?.one || "state";
  const many = words?.many || "states";
  const text = String(note).replaceAll("{one}", one).replaceAll("{many}", many);
  return text.charAt(0).toUpperCase() + text.slice(1);
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

// The colour step (1..5, or STEP_NONE) of one place (a square or a state).
// A place left out for now by the Feasibility cutoff gets step 1, the
// lowest priority shade.
//   total - rankedCount(places, timeframe), passed in so it is worked out once
export function colorStep(place, colorBy, timeframe, total) {
  if (!place) return STEP_NONE;
  if (colorBy === "value") return stepFromCuts(place.soil, VALUE_CUTS);
  if (colorBy === "damage") return stepFromCuts(place.damage, DAMAGE_CUTS);
  if (colorBy === "access") return stepFromCuts(place.access, ACCESS_CUTS);
  const entry = place[timeframe] || {};
  if (entry.tier === "setAside") return 1;
  if (!Number.isFinite(entry.rank) || !(total > 0)) return STEP_NONE;
  const share = entry.rank / total;
  let step = 5;
  for (const cut of PRIORITY_CUTS) {
    if (share <= cut) return step;
    step -= 1;
  }
  return 1;
}

// The key's line for the places drawn hatched (no score on this map), or
// null when there are none on it: on the Priority map "Not ranked: no
// black-soil cropland" (or "... no map square in it" for a state smaller
// than a square, "... no data"); on the other maps "No reading".
//   places  the squares, or the states in the States view
export function unrankedNote(places, colorBy, timeframe) {
  const list = places || [];
  const total = rankedCount(list, timeframe);
  const idle = list.filter((place) => colorStep(place, colorBy, timeframe, total) === STEP_NONE);
  if (!idle.length) return null;
  if (colorBy !== "priority") return "No reading";
  const why = new Set(
    idle.map((place) =>
      place[timeframe]?.tier === "noBlackSoil" ? "no black-soil cropland" : Array.isArray(place.cellIds) && place.squares === 0 ? "no map square in it" : typeof place.notMeasured === "string" ? "damage not measured yet" : "no data",
    )
  );
  return `Not ranked: ${[...why].join(" or ")}`;
}

// The CSS variable name for a step: "--map-damage-3", "--map-nodata"...
// The Overview's key line for its hatched squares in a natural disaster
// (unrankedNote), with a word when most are hatched for lack of black soil:
// the cropland totals above carry the hit land then. Null otherwise (a
// war's and peace's Overview keep their key as it is).
export function overviewUnrankedNote(run, places, timeframe) {
  if (!isDisasterRun(run)) return null;
  const note = unrankedNote(places, "priority", timeframe);
  if (!note) return null;
  const list = places || [];
  const noSoil = list.filter((place) => place[timeframe]?.tier === "noBlackSoil").length;
  return noSoil > list.length / 2 ? `${note} (most squares here: the cropland hit above counts every soil)` : note;
}

export function colorVar(colorBy, step) {
  if (!(step >= 1)) return "--map-nodata";
  return `--map-${COLOR_MODES.includes(colorBy) ? colorBy : "priority"}-${step}`;
}

// The short value shown when hovering a square, e.g. "Rank 12 of 1,176",
// "Left out for now (least feasible)", "Value 72 / 100", "Damage 45 / 100",
// "Feasibility: about 42 km from fighting"; for a state "Feasibility 75 /
// 100 · nearest fighting about 12 km".
//   run   the run shown (optional): in a natural disaster Feasibility is
//         worded by its type ("Feasibility: 12% of cropland under water",
//         "Feasibility: about 4 km from a fire burning now")
export function valueText(place, colorBy, timeframe, total, run = null) {
  if (!place) return "";
  if (colorBy === "access" && (isDisasterRun(run) || Number.isFinite(place.raw?.wetNowShare) || Number.isFinite(place.raw?.fireKm))) {
    const type = run ? disasterType(run) : Number.isFinite(place.raw?.wetNowShare) ? "flood" : "wildfire";
    if (Array.isArray(place.cellIds)) {
      if (!Number.isFinite(place.access)) return "No feasibility data";
      const near = place.nearestConflictKm;
      const nearest = type === "wildfire" && Number.isFinite(near) ? (near >= WILDFIRE.fullKm ? ` · nearest fire now ${WILDFIRE.fullKm} km +` : ` · nearest fire now about ${Math.round(near)} km`) : "";
      return `Feasibility ${Math.round(place.access * 100)} / 100${nearest}`;
    }
    if (type === "flood" && Number.isFinite(place.raw?.wetNowShare)) {
      const pct = Math.round(place.raw.wetNowShare * 100);
      return place.raw.wetNowShare <= FLOOD.dryNowShare ? `Feasibility: ${pct}% of cropland under water (counts as nothing in the way)` : `Feasibility: ${pct}% of cropland under water`;
    }
    const km = place.raw?.fireKm;
    if (type === "wildfire" && Number.isFinite(km)) return km >= WILDFIRE.fullKm ? `Feasibility: ${WILDFIRE.fullKm} km + from a fire burning now` : `Feasibility: about ${Math.round(km)} km from a fire burning now`;
    return Number.isFinite(place.access) ? `Feasibility ${Math.round(place.access * 100)} / 100` : "No feasibility data";
  }
  if (colorBy === "value") {
    return Number.isFinite(place.soil) ? `Value ${Math.round(place.soil * 100)} / 100` : "No value data";
  }
  if (colorBy === "damage") {
    return Number.isFinite(place.damage) ? `Damage ${Math.round(place.damage * 100)} / 100` : "No damage data";
  }
  if (colorBy === "access") {
    // A state (src/lib/atlas/units.js): its score, and how near its nearest
    // square is to fighting; never one distance for the whole state.
    if (Array.isArray(place.cellIds)) {
      if (!Number.isFinite(place.access)) return "No feasibility data";
      const near = place.nearestConflictKm;
      const nearest = Number.isFinite(near) ? (near >= 100 ? " · nearest fighting 100 km +" : ` · nearest fighting about ${Math.round(near)} km`) : "";
      return `Feasibility ${Math.round(place.access * 100)} / 100${nearest}`;
    }
    const km = place.raw?.conflictKm;
    if (Number.isFinite(km)) return km >= 100 ? "Feasibility: 100 km + from fighting" : `Feasibility: about ${Math.round(km)} km from fighting`;
    return Number.isFinite(place.access) ? `Feasibility ${Math.round(place.access * 100)} / 100` : "No feasibility data";
  }
  const entry = place[timeframe] || {};
  if (entry.tier === "setAside") return "Left out for now (least feasible)";
  if (entry.tier === "noBlackSoil") return "Not ranked: no black-soil cropland";
  if (!Number.isFinite(entry.rank)) return "Not ranked";
  return `Rank ${entry.rank.toLocaleString("en-US")} of ${Number(total || 0).toLocaleString("en-US")}`;
}
