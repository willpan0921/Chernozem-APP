// WHAT THIS FILE DOES
// The Atlas scoring method. It turns each place's indicators into the three
// scores (soil value, damage, safe access) and then into a priority score, a
// rank and a tier, for both time frames.
//
// A "place" is anything with an "id" and indicator columns: a grid cell of
// the map (what the app uses), or a whole region (what the research deposit
// uses). The method is the same.
//
//   Near term  The least safe places, holding the chosen share of the black
//              soil, are set aside (counted by rank, so ties still split).
//              Just above them a "ramp" fades scores in, so a place a hair
//              over the line does not jump to full strength. The rest are
//              ranked by soil value and damage, blended with their weights.
//   Postwar    All three scores are blended with a weighted power mean. With
//              r = 1 it is a plain weighted average; as r falls toward 0 it
//              becomes a weighted geometric mean (r = 0 is the deposit's
//              formula: Value^w × Damage^w × Access^w).
//
// Plain arithmetic with no React, so the server (for the AI and reports) and
// the pages (for the live map) run the very same code. Tested in
// scoring.test.js.
//
// WHO EDITS IT
// Whoever changes the research method. The fixed choices (which indicators,
// the defaults, the scales) are in method.js.

import { COMPONENTS, checkSettings } from "./method.js";

// The names of the three scores, in the order the pages show them.
export const SCORE_KEYS = ["soil", "damage", "access"];

// Near term uses only soil value and damage (safe access is the cutoff
// there), so this gives their weights as shares of 100, the way the pages
// show them: { soil: 30, damage: 40, access: 30 } -> { soil: 43, damage: 57 }.
// When both are 0 they count equally.
export function nearTermShares(weights = {}) {
  const soil = Math.max(0, Number(weights.soil) || 0);
  const damage = Math.max(0, Number(weights.damage) || 0);
  const total = soil + damage;
  const soilShare = total > 0 ? Math.round((100 * soil) / total) : 50;
  return { soil: soilShare, damage: 100 - soilShare };
}

// How tiers are cut, by rank. "upTo" is the share of ranked places counted
// from the top: the best quarter is "highest", the next quarter "high", the
// next fifth "medium" and the rest "lower". Cutting by rank keeps the map
// readable even when scores sit close together.
export const TIER_CUTS = [
  { tier: "highest", upTo: 0.25 },
  { tier: "high", upTo: 0.5 },
  { tier: "medium", upTo: 0.7 },
  { tier: "lower", upTo: 1 },
];

// Averages the indicator columns that make up one score, skipping blanks.
// Gives back null when none of the columns has a number.
export function meanOf(row, columns) {
  const numbers = columns.map((column) => row[column]).filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

// Works out a place's three scores from its indicator columns.
export function componentScores(row, components = COMPONENTS) {
  const scores = {};
  for (const key of SCORE_KEYS) scores[key] = meanOf(row, components[key] || []);
  return scores;
}

// The weighted power mean of a few numbers between 0 and 1.
//   values  - the numbers
//   weights - their weights (any scale; they are made to add up to 1)
//   r       - the blend strength. 1 is a plain average, 0 a geometric mean.
export function powerMean(values, weights, r) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return null;
  const shares = weights.map((weight) => weight / total);

  if (Math.abs(r) < 1e-9) {
    // Geometric mean: a zero with any weight makes the whole score zero.
    let product = 1;
    values.forEach((value, i) => {
      if (shares[i] > 0) product *= Math.pow(Math.max(value, 0), shares[i]);
    });
    return product;
  }

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += shares[i] * Math.pow(Math.max(values[i], 0), r);
  }
  return Math.pow(sum, 1 / r);
}

// How much of its score a place keeps just above the gate: 0 at the gate,
// rising in a straight line to 1 at "gate + ramp width".
// Safe access cannot go above 1, so the ramp ends at 1 at the latest. When
// the gate itself is at the top (most of the area is far from any
// fighting, so the gate lands on 1), places at the top keep their full
// score instead of all scoring 0.
export function rampFactor(access, gate, rampWidth) {
  if (!(access >= gate)) return 0;
  const top = Math.min(1, gate + (rampWidth > 0 ? rampWidth : 0));
  if (!(top > gate)) return 1;
  return Math.min(1, Math.max(0, (access - gate) / (top - gate)));
}

// Picks the places Near term sets aside: the least safe ones, counted by
// rank, until they hold "percent" of the black-soil hectares.
// Counting by rank (not "access below a line") matters because many places
// tie: everything 100 km or more from fighting has safe access 1, so a line
// could not split them and the cutoff slider would seem stuck. Ties are
// broken by the raw distance to fighting (nearer goes first), then by id.
// A place is set aside when that brings the total closer to the target.
// Gives back
//   aside          the set of ids set aside
//   gate           the line the ramp starts from: the safe access of the
//                  safest place set aside that is still LESS safe than every
//                  kept place. A kept place tied with a set-aside one so
//                  sits above the line and keeps part of its score, instead
//                  of silently scoring 0. null when nothing is set aside, or
//                  when every set-aside place ties with the least safe kept
//                  one (then there is no line below them, so nothing fades)
//   setAsideShare  the share of hectares actually set aside, 0..1
export function setAsideLeastSafe(places, percent) {
  const weightOf = (place) => (place.blackSoilHa > 0 ? place.blackSoilHa : 1);
  const order = [...places].sort(
    (a, b) =>
      a.access - b.access ||
      (a.raw?.conflictKm ?? Infinity) - (b.raw?.conflictKm ?? Infinity) ||
      String(a.id).localeCompare(String(b.id))
  );
  const total = order.reduce((sum, place) => sum + weightOf(place), 0);
  const target = (Math.max(0, percent) / 100) * total;
  const aside = new Set();
  let running = 0;
  let next = 0;
  while (next < order.length && running + weightOf(order[next]) / 2 <= target) {
    running += weightOf(order[next]);
    aside.add(order[next].id);
    next += 1;
  }
  // The least safe kept place (the list is sorted, so it is the next one).
  const lowestKept = next < order.length ? order[next].access : Infinity;
  // Walk back past set-aside places tied with it.
  let below = next - 1;
  while (below >= 0 && order[below].access >= lowestKept) below -= 1;
  return {
    aside,
    gate: below >= 0 ? order[below].access : null,
    setAsideShare: total > 0 ? running / total : 0,
  };
}

// Gives each scored place a rank (1 = best) and a tier, in place.
function rankAndTier(entries) {
  const ranked = entries.filter((entry) => Number.isFinite(entry.score)).sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score || 0;
  ranked.forEach((entry, index) => {
    entry.rank = index + 1;
    // "share" is the score as a share of the leader's, for drawing bars.
    entry.share = best > 0 ? entry.score / best : 0;
    entry.tier = TIER_CUTS.find((cut) => entry.rank <= Math.max(1, Math.round(cut.upTo * ranked.length))).tier;
  });
}

// Scores every place, for both time frames.
//   rows     - the places, each with an "id" and indicator columns
//   options  - { settings, components, excluded }
//              settings:   { weights: {soil, damage, access}, gatePercentile,
//                            rampWidth, r } (cleaned by checkSettings)
//              components: which columns make each score (method.js default)
//              excluded:   ids that are not analyzed
//
// Gives back { places, gate, setAsideShare, settings } where every place
// has its three scores plus
//   nearTerm: { score, rank, tier, share, ramp }  (tier "setAside" when gated)
//   postwar:  { score, rank, tier, share }
// share = score as a share of the leader's (for bars). Places that cannot be
// scored have tier "notAnalyzed" and a "reason".
export function scorePlaces(rows, options = {}) {
  const settings = checkSettings(options.settings);
  const components = options.components || COMPONENTS;
  const excludedSet = new Set(options.excluded || []);

  const places = rows.map((row) => {
    const scores = componentScores(row, components);
    const missing = SCORE_KEYS.filter((key) => scores[key] === null);
    let reason = null;
    if (excludedSet.has(row.id)) reason = "Not analyzed in this run";
    else if (missing.length) reason = `Missing data for ${missing.join(", ")}`;
    return {
      ...row,
      ...scores,
      analyzed: reason === null,
      reason,
      nearTerm: { score: null, rank: null, tier: "notAnalyzed", share: 0, ramp: 0 },
      postwar: { score: null, rank: null, tier: "notAnalyzed", share: 0 },
    };
  });

  const analyzed = places.filter((place) => place.analyzed);
  const { weights } = settings;

  // Near term: set aside the least safe share of the land, rank the rest.
  const { aside, gate, setAsideShare } = setAsideLeastSafe(analyzed, settings.gatePercentile);
  for (const place of analyzed) {
    if (aside.has(place.id)) {
      place.nearTerm = { score: null, rank: null, tier: "setAside", share: 0, ramp: 0 };
      continue;
    }
    // Kept places fade in just above the line. The line is always below
    // every kept place (see setAsideLeastSafe), and places at full safe
    // access keep their whole score (see rampFactor); with no line,
    // nothing fades.
    const ramp = gate === null ? 1 : rampFactor(place.access, gate, settings.rampWidth);
    // Safe access is the gate here, so only soil value and damage are blended.
    const base = powerMean([place.soil, place.damage], [weights.soil, weights.damage], settings.r) ?? 0;
    place.nearTerm = { score: ramp * base, rank: null, tier: null, share: 0, ramp };
  }
  rankAndTier(analyzed.map((place) => place.nearTerm).filter((entry) => entry.tier !== "setAside"));

  // Postwar: blend all three, no gate.
  const weightList = SCORE_KEYS.map((key) => weights[key]);
  for (const place of analyzed) {
    const score = powerMean(SCORE_KEYS.map((key) => place[key]), weightList, settings.r);
    place.postwar = { score, rank: null, tier: null, share: 0 };
  }
  rankAndTier(analyzed.map((place) => place.postwar));

  return { places, gate, setAsideShare, settings };
}

// The places in rank order for one time frame ("nearTerm" or "postwar"),
// leaving out set-aside and unanalyzed ones.
export function ranking(places, timeframe) {
  return places
    .filter((place) => Number.isFinite(place[timeframe].rank))
    .sort((a, b) => a[timeframe].rank - b[timeframe].rank);
}
