// WHAT THIS FILE DOES
// Scores whole states, provinces or districts ("units") from their map
// squares, for the Map page's "States" detail level: the same three scores
// as a square (value, damage, feasibility), then the SAME priority method
// the squares get (scoring.js scorePlaces), applied across the units, so
// the weights and the Feasibility cutoff work the same way at both levels.
//
//   scoreUnits(places, units, cellUnit, { settings })
//     places    the scored squares (scoring.js scorePlaces(...).places)
//     units     the area's units (GET /api/areas/:id/units: .units)
//     cellUnit  which unit each square is in ({ cellId: unitId }, same
//               answer: .cellUnit)
//   -> { units: [...each unit with its scores, sums, ranks and tiers],
//        gate, setAsideShare, settings }
//
// A unit's three scores are the black-soil-weighted mean of its RANKED
// squares' scores (a square with 30,000 ha of black soil counts 30 times
// one with 1,000 ha); squares that are not ranked at all (too little
// black-soil cropland, missing data, not analyzed) are left out. Where
// the ranked squares carry no black-soil hectares (the research regions),
// they are weighted by cropland, then equally. A unit with no ranked square
// is not ranked itself (like a square without black soil): its scores are
// the cropland-weighted mean of its squares, for the Value, Damage and
// Feasibility maps, and its reason says why. A unit with no square at all
// (smaller than one square) has no scores ("No map square in it").
//
// Then, across the ranked units, exactly as for squares:
//   Near term  the least feasible units holding the Feasibility cutoff's
//              share of the black soil are left out for now (tier
//              "setAside"), the rest ranked by value and damage
//   Postwar    the weighted power mean of all three
// with ranks, shares and tiers ("highest", "high", "medium", "lower") as
// for squares. The squares' own scores are not changed.
//
// Each unit also carries the sums of its squares: black-soil, cropland and
// heavily damaged hectares, people and people on damaged land, and how many
// squares it has, how many are ranked and how many the near-term cutoff
// leaves out.
//
// Plain arithmetic, no React (like scoring.js). Tested in units.test.js.
//
// WHO EDITS IT
// Whoever changes how whole states are scored. The method itself is in
// scoring.js and method.js.

import { NO_BLACK_SOIL_REASON } from "./method.js";
import { SCORE_KEYS, ranking, scorePlaces } from "./scoring.js";

export const NO_SQUARES_REASON = "No map square in it";

// The three scores read straight from a unit's own columns.
const UNIT_COMPONENTS = { soil: ["soil"], damage: ["damage"], access: ["access"] };

const finite = (value) => Number.isFinite(value);
const sumOf = (squares, key) => squares.reduce((total, square) => total + (finite(square[key]) ? square[key] : 0), 0);

// The weighted mean of one score over some squares, skipping squares
// without it. weightOf(square) gives each square's weight.
function weightedMean(squares, key, weightOf) {
  let total = 0;
  let weights = 0;
  for (const square of squares) {
    const value = square[key];
    if (!finite(value)) continue;
    const weight = weightOf(square);
    total += weight * value;
    weights += weight;
  }
  return weights > 0 ? total / weights : null;
}

// How a group of squares is weighted: by black-soil hectares when they have
// any, else by cropland, else equally.
function weighting(squares) {
  if (sumOf(squares, "blackSoilHa") > 0) return { by: "blackSoilHa", weightOf: (s) => (finite(s.blackSoilHa) && s.blackSoilHa > 0 ? s.blackSoilHa : 0) };
  if (sumOf(squares, "croplandHa") > 0) return { by: "croplandHa", weightOf: (s) => (finite(s.croplandHa) && s.croplandHa > 0 ? s.croplandHa : 0) };
  return { by: "equal", weightOf: () => 1 };
}

// Why a unit with squares but no ranked one is not ranked.
function unrankedReason(squares) {
  if (squares.some((square) => square.reason === NO_BLACK_SOIL_REASON)) return NO_BLACK_SOIL_REASON;
  return squares.find((square) => square.reason)?.reason || "Not analyzed in this run";
}

export function scoreUnits(places, units, cellUnit, options = {}) {
  const lookup = cellUnit instanceof Map ? (id) => cellUnit.get(id) : (id) => cellUnit?.[id];
  const byUnit = new Map((units || []).map((unit) => [unit.id, []]));
  for (const place of places || []) {
    const unitId = lookup(place.id);
    if (byUnit.has(unitId)) byUnit.get(unitId).push(place);
  }

  // The units in a fixed order (by id), so ties always fall the same way.
  const ordered = [...(units || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const rows = ordered.map((unit) => {
    const squares = byUnit.get(unit.id) || [];
    const ranked = squares.filter((square) => square.analyzed);
    const pool = ranked.length ? ranked : squares;
    const { by, weightOf } = ranked.length ? weighting(ranked) : sumOf(squares, "croplandHa") > 0 ? { by: "croplandHa", weightOf: (s) => (finite(s.croplandHa) && s.croplandHa > 0 ? s.croplandHa : 0) } : { by: "equal", weightOf: () => 1 };
    const scores = Object.fromEntries(SCORE_KEYS.map((key) => [key, pool.length ? weightedMean(pool, key, weightOf) : null]));
    // The mean distance to fighting is only the cutoff's tie-break (as for
    // squares, scoring.js). The page is given the nearest distance instead:
    // a mean (up to 300 km) would call a state with squares at the front
    // "100 km + from fighting".
    const conflictKm = weightedMean(
      pool.map((square) => ({ ...square, conflictKm: square.raw?.conflictKm })),
      "conflictKm",
      weightOf,
    );
    const distances = pool.map((square) => square.raw?.conflictKm).filter(finite);
    const nearestConflictKm = distances.length ? Math.min(...distances) : null;
    return {
      unit,
      squares,
      ranked,
      weightedBy: by,
      row: {
        id: unit.id,
        ...scores,
        // The gate shares out the ranked squares' black soil.
        blackSoilHa: sumOf(ranked, "blackSoilHa"),
        raw: { conflictKm },
      },
      nearestConflictKm,
    };
  });

  // The same method as the squares, across the units that can be ranked.
  const rankable = rows.filter((entry) => entry.ranked.length > 0);
  const scored = scorePlaces(
    rankable.map((entry) => entry.row),
    { settings: options.settings, components: UNIT_COMPONENTS, minBlackSoilHa: 0 },
  );
  const results = new Map(scored.places.map((place) => [place.id, place]));

  const out = rows.map(({ unit, squares, ranked, weightedBy, row, nearestConflictKm }) => {
    const result = results.get(unit.id);
    const reason = result ? result.reason : squares.length ? unrankedReason(squares) : NO_SQUARES_REASON;
    const tier = reason === NO_BLACK_SOIL_REASON ? "noBlackSoil" : "notAnalyzed";
    const idle = { score: null, rank: null, tier, share: 0 };
    return {
      ...unit,
      soil: row.soil,
      damage: row.damage,
      access: row.access,
      // The distance from its nearest square to fighting (km), for the
      // map's hover text; null where none is known.
      nearestConflictKm,
      analyzed: Boolean(result?.analyzed),
      reason,
      weightedBy,
      squares: squares.length,
      rankedSquares: ranked.length,
      setAsideSquares: squares.filter((square) => square.nearTerm?.tier === "setAside").length,
      cellIds: squares.map((square) => square.id),
      blackSoilHa: sumOf(squares, "blackSoilHa"),
      rankedBlackSoilHa: row.blackSoilHa,
      croplandHa: sumOf(squares, "croplandHa"),
      heavyDamageHa: sumOf(squares, "heavyDamageHa"),
      people: sumOf(squares, "people"),
      peopleOnDamagedSoil: sumOf(squares, "peopleOnDamagedSoil"),
      nearTerm: result ? result.nearTerm : { ...idle, ramp: 0 },
      postwar: result ? result.postwar : idle,
    };
  });

  return { units: out, gate: scored.gate, setAsideShare: scored.setAsideShare, settings: scored.settings };
}

// The units in rank order for one time frame ("nearTerm" or "postwar"),
// leaving out those left out for now and those not ranked (as for squares).
export function unitRanking(scoredUnits, timeframe) {
  return ranking(scoredUnits || [], timeframe);
}
