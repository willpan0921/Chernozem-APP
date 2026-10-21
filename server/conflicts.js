// WHAT THIS FILE DOES
// Works out which country a place is in, and whether one of the wars in
// src/config/conflicts.js covers it. Used by the analyses to decide where
// damage is counted from: the day the war started where there is one,
// otherwise the last two years (any cause, compared with 2019 to 2021).
//
//   countryAt(lat, lon)            -> { id, name } | null
//   conflictAt(lat, lon)           -> the war covering that point, or null
//   conflictForArea({ countryId, bbox, cells, war, areaId })
//                                  -> the war covering an Atlas area: the
//                                     team's own choice for it first (war:
//                                     area.war, set in Atlas Settings: a war
//                                     from a day of their choice, or none);
//                                     else by its country when it is one;
//                                     else the war covering the most of its
//                                     grid cells (or of a 9 x 9 set of points
//                                     over the box), so a box whose middle is
//                                     at sea or across a border still finds
//                                     the war
//   listWarFor(area, grid)         -> the war of the app's list for an area
//                                     with its grid, as an analysis uses it
//                                     (server/jobs.js): partOfCountry when
//                                     some of its squares are outside the
//                                     war's squares (warCellsFor)
//   warCellsFor(conflict, cells, cellSizeDeg)
//                                  -> the squares that have the war's rules
//                                     where it covers the area only in part:
//                                     those that touch its boxes, and those
//                                     another listed war covers (null: all)
//   listConflictForArea(area)      -> what the app's list alone says for a
//                                     saved area (Atlas Settings shows it),
//                                     by the same rule
//
// Wars are matched by COUNTRY, and where a war lists boxes (areas) only
// inside them (the Gaza war covers the Gaza Strip, not the West Bank; the
// war on Russia's border covers the Kursk and Belgorod border districts,
// not Kursk city or Moscow): src/config/conflicts.js. A whole-country area
// has its country's war also when the war has boxes. Any area (a whole
// country, a region, a box, a drawn area) has one war; when that war has
// boxes and some of the area's squares neither touch them nor lie in
// another listed war, the area holds it only in part (listWarFor): the
// war's rules apply only in its squares that touch the boxes or lie in
// another listed war (warCellsFor). A war that is not in the list counts
// as peace there, unless the team marks the area at war.
//
// WHO EDITS IT
// Nobody, normally. To add a war, edit src/config/conflicts.js.

import { getCountry, listCountries } from "./countries.js";
import { planGrid, pointInGeometry } from "./geo.js";
import { conflictForCountry, conflictForPoint, teamConflict, warSquares } from "../src/config/conflicts.js";

let boxes = null;

// Country outlines with their boxes, loaded once.
function countries() {
  if (!boxes) {
    boxes = listCountries()
      .map(({ id }) => getCountry(id))
      .filter((country) => country?.geometry && country.bbox);
  }
  return boxes;
}

export function countryAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const country of countries()) {
    const [west, south, east, north] = country.bbox;
    if (lat < south || lat > north) continue;
    // Boxes that cross the 180° line have west > east.
    const inLon = west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
    if (!inLon) continue;
    if (pointInGeometry(lon, lat, country.geometry)) return { id: country.id, name: country.name };
  }
  return null;
}

export function conflictAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return conflictForPoint(countryAt(lat, lon)?.id ?? null, lat, lon);
}

// At most this many cells are looked at (evenly spread), so a big area
// stays quick.
const MAX_POINTS = 400;
const BOX_STEPS = 9;

//   war     the area's own choice (area.war: { mode: "list" | "war" |
//           "peace", since, name }); "war" gives { id: "area-<areaId>",
//           name, since, source: "area" }, "peace" gives null, "list" (or
//           none) leaves it to the app's list
//   areaId  the area's id, for the id of a war the team set
export function conflictForArea({ countryId, bbox, cells, war, areaId } = {}) {
  const own = teamConflict(war, areaId);
  if (own !== undefined) return own;
  if (countryId) return conflictForCountry(countryId);
  const points = samplePoints(bbox, cells);
  if (!points.length) return null;
  // The war covering the most points; any one point in a war is enough
  // (land there is not safe), points at sea count for nothing.
  const counts = new Map();
  for (const { lat, lon } of points) {
    const conflict = conflictAt(lat, lon);
    if (conflict) counts.set(conflict, (counts.get(conflict) || 0) + 1);
  }
  let best = null;
  for (const [conflict, count] of counts) if (!best || count > best.count) best = { conflict, count };
  return best?.conflict || null;
}

// The war of the app's list for an area (whatever its team chose), as its
// analysis uses it, with the area's grid (geo.js planGrid): by its country
// when it is a whole country, else the war covering the most of its cells
// (conflictForArea). Null at peace. A war limited to boxes covers the area
// only in part when some of its squares are outside the war's squares
// (warCellsFor: they neither touch its boxes nor lie in another listed
// war): it comes back with partOfCountry: true (the name is older than the
// rule, which now holds for every kind of area), and with partOf: "area"
// too when the area is not a whole country (a region, a box, a drawn area:
// the pages then say "in part of the area"; a whole country keeps "in part
// of the country"). Its rules then apply only in the war's squares. A war
// whose squares are all of the area's (a drawn area inside its boxes, or a
// box over the Kursk front whose other squares are in Ukraine's war) has
// its rules all over. (Found in review, 2026-10-20: an Afar-like region
// box read all 1,375 of its squares with the Amhara war's rules, although
// only 47 touch its boxes; a Kursk-oblast-like box 660, with 102 touching.
// Then, in the same review: a box over the Sudzha front gave the peace
// rules to its 52 squares in Sumy oblast, which the war in Ukraine covers,
// before warCellsFor counted them.) Without a grid (a whole country with
// no outline) its squares cannot be counted: a war with boxes is then
// taken to cover it in part, as every listed country with such a war does.
export function listWarFor(area, grid) {
  const cells = Array.isArray(grid?.cells) ? grid.cells : [];
  const war = conflictForArea({ countryId: area?.countryId, bbox: area?.bbox || grid?.bbox, cells });
  if (!war?.areas?.length) return war || null;
  if (!cells.length) return area?.countryId ? { ...war, partOfCountry: true } : war;
  const ruled = warCellsFor({ ...war, partOfCountry: true }, cells, grid.cellSizeDeg);
  if (cells.every((cell) => ruled.has(cell.id))) return war;
  return { ...war, partOfCountry: true, ...(area?.countryId ? {} : { partOf: "area" }) };
}

// The squares of an area that its war's rules apply to, when the war
// covers the area only in part (conflict.partOfCountry): the ids of those
// that touch the war's boxes (src/config/conflicts.js warSquares), and of
// those whose centre another war of the list covers (conflictAt). An area
// has one war, but land inside another listed war never gets the peace
// rules: a box drawn over the Kursk front has the Kursk war (it covers
// most of its squares), and its squares in Sumy oblast, in the war in
// Ukraine, keep the war's rules (with the area's war's dates). Null when every
// square has the war's rules (no partOfCountry, or a war without boxes).
// The analyses (server/providers/gee.js, sample.js) and the war choice
// (listWarFor) use it, so they always agree.
export function warCellsFor(conflict, cells, cellSizeDeg) {
  const ids = warSquares(conflict, cells, cellSizeDeg);
  if (!ids) return null;
  for (const cell of cells || []) {
    if (!ids.has(cell?.id) && conflictAt(cell?.lat, cell?.lon)) ids.add(cell.id);
  }
  return ids;
}

// What the app's list says for a saved area, whatever the team chose: the
// same answer an analysis gets from the area's grid (listWarFor, used by
// server/jobs.js), as { id, name, since } (plus partOfCountry: true, and
// partOf: "area" for an area that is not a whole country, when some of its
// squares are outside the war's squares: its rules then apply only in the
// squares that touch the boxes or lie in another listed war; and
// otherWarSquares, how many of the second kind, when there are any), or
// null at peace. Undefined when it cannot be told (no outline). Worked out
// once per area (an outline never changes after it is saved).
const listCache = new Map();
const LIST_CACHE_SIZE = 200;
export function listConflictForArea(area) {
  if (!area?.id) return undefined;
  const key = `${area.id}|${area.createdAt || ""}`;
  if (listCache.has(key)) return listCache.get(key);
  let conflict;
  let otherWar = 0;
  try {
    // A whole country's outline is its country's.
    const geometry = area.geometry || (area.countryId ? getCountry(area.countryId)?.geometry : null);
    if (geometry) {
      const grid = planGrid(geometry);
      conflict = listWarFor(area, grid);
      // The squares with the war's rules because another listed war covers
      // them (the War card in Atlas Settings says so).
      if (conflict?.partOfCountry) otherWar = warCellsFor(conflict, grid.cells, grid.cellSizeDeg).size - warSquares(conflict, grid.cells, grid.cellSizeDeg).size;
    } else if (area.countryId) conflict = listWarFor(area, null);
    else return undefined;
  } catch {
    return undefined;
  }
  const out = conflict
    ? {
        id: conflict.id,
        name: conflict.name,
        since: conflict.since,
        ...(conflict.partOfCountry ? { partOfCountry: true } : {}),
        ...(conflict.partOfCountry && conflict.partOf === "area" ? { partOf: "area" } : {}),
        ...(otherWar > 0 ? { otherWarSquares: otherWar } : {}),
      }
    : null;
  if (listCache.size >= LIST_CACHE_SIZE) listCache.delete(listCache.keys().next().value);
  listCache.set(key, out);
  return out;
}

// The points an area is checked at: its cells' centres (at most
// MAX_POINTS, evenly spread), else a grid over its box plus the middle.
function samplePoints(bbox, cells) {
  const list = Array.isArray(cells) ? cells.filter((cell) => Number.isFinite(cell?.lat) && Number.isFinite(cell?.lon)) : [];
  if (list.length) {
    const step = Math.max(1, Math.ceil(list.length / MAX_POINTS));
    return list.filter((_, i) => i % step === 0);
  }
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) return [];
  const [west, south, east, north] = bbox;
  const points = [{ lat: (south + north) / 2, lon: (west + east) / 2 }];
  for (let i = 0; i < BOX_STEPS; i += 1) {
    for (let j = 0; j < BOX_STEPS; j += 1) {
      points.push({ lat: south + ((north - south) * (i + 0.5)) / BOX_STEPS, lon: west + ((east - west) * (j + 0.5)) / BOX_STEPS });
    }
  }
  return points;
}
