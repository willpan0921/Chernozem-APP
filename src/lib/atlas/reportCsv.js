// WHAT THIS FILE DOES
// The report's "Download CSV" (src/pages/atlas/ReportPage.jsx): one
// spreadsheet row per map square, with where it is, its hectares and
// people, the three scores (soil_value, damage, feasibility) and both
// rankings, and the raw indicators.
//
// "feasibility" is the score the pages call Feasibility (safe access: the
// distance to fighting, full at 100 km; the code's key "access"). Until
// 2026-10-25 the column was called safe_access; nothing in the app reads
// it back, so it was renamed in place (same position, same numbers).
//
// In a war where no fire looked like fighting (overview.js
// noFightingFound: feasibility is not measured there), feasibility and
// distance are left empty in every row, as the report's tables show "–"
// and the Map page "Not measured": every square reads 1 (100 km or more
// from fighting) there, which in a war zone is not "safe to reach". An
// empty cell is how this CSV already marks a missing value, and keeps the
// columns numeric in a spreadsheet or GIS. Every other run's CSV is as
// before, and no number of the run changes.
//
// WHO EDITS IT
// Whoever changes what goes into the report's CSV. Tested in
// reportCsv.test.js.

import { placeLabel } from "./hotspots.js";
import { toCsv } from "../csv.js";

const round = (value, digits) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : "");

//   places        the scored places (scoring.js scorePlaces(...).places)
//   cellSizeDeg   the run's square size, for the place names
//   accessUnknown feasibility is not measured in this run (overview.js
//                 noFightingFound): feasibility and distance are left empty
//   disaster      a natural disaster's run (overview.js isDisasterRun): its
//                 own columns (disasterRow); every other run's columns stay
//                 as they are
export function cellsCsv(places, cellSizeDeg, { accessUnknown = false, disaster = false } = {}) {
  if (disaster) return disasterCsv(places, cellSizeDeg, { accessUnknown });
  const rows = places.map((place) => ({
    cell_id: place.id,
    place: placeLabel(place, cellSizeDeg),
    lat: place.lat,
    lon: place.lon,
    admin1: place.admin1 || "",
    admin2: place.admin2 || "",
    cropland_ha: round(place.croplandHa, 1),
    black_soil_ha: round(place.blackSoilHa, 1),
    heavy_damage_ha: round(place.heavyDamageHa, 1),
    people: round(place.people, 0),
    people_on_damaged_soil: round(place.peopleOnDamagedSoil, 0),
    soil_value: round(place.soil, 4),
    damage: round(place.damage, 4),
    feasibility: accessUnknown ? "" : round(place.access, 4),
    near_term_rank: place.nearTerm.rank ?? "",
    near_term_score: round(place.nearTerm.score, 4),
    near_term_tier: place.nearTerm.tier,
    postwar_rank: place.postwar.rank ?? "",
    postwar_score: round(place.postwar.score, 4),
    postwar_tier: place.postwar.tier,
    wrb: place.wrb,
    ag_output: place.agOutput,
    firms: place.firms,
    radar: place.radar,
    chi: place.chi,
    distance: accessUnknown ? "" : place.distance,
    population: place.population,
    lights: place.lights,
  }));
  // Best Postwar rank first, unranked squares last.
  rows.sort((a, b) => (a.postwar_rank || Infinity) - (b.postwar_rank || Infinity));
  return toCsv(rows);
}

// A natural disaster's CSV: the same place and score columns, the time
// frame named Post-crisis (post_crisis_*), the hit hectares (black soil,
// all cropland, grassland) and the disaster's indicators (hit, heavy,
// feasible) instead of the war's (fires, radar, distance), and why a
// square's damage was not measured (damage_note). Feasibility is empty
// where it is not measured (accessUnknown: a drought, a storm, a month
// without images), never 1; so are the hit hectares of a square not
// measured.
function disasterCsv(places, cellSizeDeg, { accessUnknown = false } = {}) {
  const rows = places.map((place) => ({
    cell_id: place.id,
    place: placeLabel(place, cellSizeDeg),
    lat: place.lat,
    lon: place.lon,
    admin1: place.admin1 || "",
    admin2: place.admin2 || "",
    cropland_ha: round(place.croplandHa, 1),
    black_soil_ha: round(place.blackSoilHa, 1),
    hit_black_soil_ha: round(place.hitHa, 1),
    heavy_black_soil_ha: Number.isFinite(place.hit) ? round(place.heavyDamageHa, 1) : "",
    hit_cropland_ha: round(place.hitCropHa, 1),
    heavy_cropland_ha: round(place.heavyCropHa, 1),
    grassland_hit_ha: round(place.grassHitHa, 1),
    soil_value: round(place.soil, 4),
    damage: round(place.damage, 4),
    feasibility: accessUnknown ? "" : round(place.access, 4),
    near_term_rank: place.nearTerm.rank ?? "",
    near_term_score: round(place.nearTerm.score, 4),
    near_term_tier: place.nearTerm.tier,
    post_crisis_rank: place.postwar.rank ?? "",
    post_crisis_score: round(place.postwar.score, 4),
    post_crisis_tier: place.postwar.tier,
    wrb: place.wrb,
    ag_output: place.agOutput,
    hit: place.hit ?? "",
    heavy: place.heavy ?? "",
    feasible: accessUnknown ? "" : place.feasible,
    chi: place.chi,
    population: place.population,
    lights: place.lights,
    people: round(place.people, 0),
    damage_note: place.notMeasured || "",
  }));
  rows.sort((a, b) => (a.post_crisis_rank || Infinity) - (b.post_crisis_rank || Infinity));
  return toCsv(rows);
}
