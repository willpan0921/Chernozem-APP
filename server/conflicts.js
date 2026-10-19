// WHAT THIS FILE DOES
// Works out which country a place is in, and whether one of the wars in
// src/config/conflicts.js covers it. Used by the analyses to decide where
// damage is counted from: the day the war started where there is one,
// otherwise the last two years (any cause, compared with 2019 to 2021).
//
//   countryAt(lat, lon)            -> { id, name } | null
//   conflictAt(lat, lon)           -> the war covering that point, or null
//   conflictForArea({ countryId, bbox, cells })
//                                  -> the war covering an Atlas area: by its
//                                     country when it is one; otherwise the
//                                     war covering the most of its grid cells
//                                     (or of a 9 x 9 set of points over the
//                                     box), so a box whose middle is at sea or
//                                     across a border still finds the war
//
// Wars are matched by COUNTRY only (src/config/conflicts.js): fighting
// across a border (Russia's Kursk and Belgorod, Lebanon) or a war that is
// not in the list counts as peace there.
//
// WHO EDITS IT
// Nobody, normally. To add a war, edit src/config/conflicts.js.

import { getCountry, listCountries } from "./countries.js";
import { pointInGeometry } from "./geo.js";
import { conflictForCountry } from "../src/config/conflicts.js";

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
  return conflictForCountry(countryAt(lat, lon)?.id);
}

// At most this many cells are looked at (evenly spread), so a big area
// stays quick.
const MAX_POINTS = 400;
const BOX_STEPS = 9;

export function conflictForArea({ countryId, bbox, cells } = {}) {
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
