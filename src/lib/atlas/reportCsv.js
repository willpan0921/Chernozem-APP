// WHAT THIS FILE DOES
// The report's "Download CSV" (src/pages/atlas/ReportPage.jsx): one
// spreadsheet row per map square, with where it is, its hectares and
// people, the three scores and both rankings, and the raw indicators.
//
// In a war where no fire looked like fighting (overview.js
// noFightingFound: safe access is not measured there), safe_access and
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
//   accessUnknown safe access is not measured in this run (overview.js
//                 noFightingFound): safe_access and distance are left empty
export function cellsCsv(places, cellSizeDeg, { accessUnknown = false } = {}) {
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
    safe_access: accessUnknown ? "" : round(place.access, 4),
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
