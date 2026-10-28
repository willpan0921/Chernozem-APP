// WHAT THIS FILE DOES
// The states and regions of an Atlas area, with their real borders, so the
// map can draw them on top of the squares (their outlines and names) and
// rank whole states ("States" / "Districts" detail on the Map page; the
// scores: src/lib/atlas/units.js).
//
//   GET /api/areas/:id/units?runId=   (server/app.js) -> unitsForArea()
//
// The borders are FAO GAUL 2015 in Earth Engine (the boundaries the app
// already uses for the squares' place names and region search), one level:
//   a country area         GAUL level 1 (states, provinces, oblasts) of
//                          that country: the units at least half inside
//                          the country's outline (COUNTRY_SHARE)
//   a region area (admin1) GAUL level 2 (districts, counties) inside it; a
//                          region GAUL has no named districts for (all of
//                          Ukraine: GAUL 2015 has no raions) is one unit,
//                          the region itself, with a note saying so
//   a box or a drawn area  level 1 cut to the area's outline, or level 2
//                          when level 1 gives fewer than MIN_UNITS units
//                          in it; slivers along its edge go
//                          (MIN_INSIDE_SHARE)
// Borders are simplified for drawing (about 1/2000 of the area's size:
// geo.js displayTolerance), each unit gets a point inside it for its name
// (geo.js labelPoint), and its display name (src/lib/atlas/placeNames.js).
// Worked out once per area and saved (server/.data/units/<areaId>.json,
// with the GAUL source and date): later reads are instant.
//
// Without Earth Engine (sample data, Earth Engine set up but not
// reachable, or the request failing) the units are made from the run's own
// squares grouped by their admin1 / admin2 names, each outline the union of
// its squares, marked approximate, and not saved: the next read tries
// Earth Engine again (at most once every FAILURE_PAUSE_MS after a failure).
// Squares with no names (sample data) give no units; the page says so.
//
// Every square of the run is put in one unit (cellUnit): by its own place
// name when that names one of the units (so a square and its state always
// agree), else the unit its centre is in, else the nearest unit within one
// square (the area's outline and GAUL's borders do not quite meet).
//
// WHO EDITS IT
// Whoever changes how the map's states and regions are made. Tested in
// units.test.js (the Earth Engine part with server/providers/fake-ee.js).

import { HttpError } from "./http.js";
import { dataDir, getArea, getRun, getUnitsCache, listRuns, saveUnitsCache } from "./store.js";
import { getProvider, unavailableError } from "./providers/index.js";
import { areaHa, bboxOf, displayTolerance, distanceToGeometry, labelPoint, pointInGeometry, roundGeometry, simplifyGeometry, squaresOutline } from "./geo.js";
import { displayPlaceName, nameKey } from "../src/lib/atlas/placeNames.js";

// Bumped when the saved units change shape or rule: older files are worked
// out again.
export const UNITS_VERSION = 1;
export const GAUL = { name: "FAO GAUL 2015", level1: "FAO/GAUL/2015/level1", level2: "FAO/GAUL/2015/level2" };
// A box or a drawn area: level 2 when level 1 gives fewer units than this.
export const MIN_UNITS = 3;
// A country area: a GAUL unit belongs to it when at least this share of the
// unit lies inside the country's outline (the outlines differ a little).
export const COUNTRY_SHARE = 0.5;
// A box or a drawn area: a unit cut to it must hold at least this share of
// the area, so slivers along its edge do not become units.
export const MIN_INSIDE_SHARE = 0.005;
// After Earth Engine failed for an area, the next try waits this long (the
// squares' units are shown meanwhile).
export const FAILURE_PAUSE_MS = 2 * 60 * 1000;

const round = (value, digits) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const rad = (deg) => (deg * Math.PI) / 180;

// The words for the units of a level, for the Detail switch and the lists.
export function levelWords(level) {
  return level === 2
    ? { level: 2, label: "Districts", one: "district", many: "districts", tooltip: "Districts, counties or raions (FAO GAUL level 2)" }
    : { level: 1, label: "States", one: "state", many: "states", tooltip: "States, provinces or oblasts (FAO GAUL level 1)" };
}

// What kind of area it is, for the level rule: { type: "country" },
// { type: "region", code } (its GAUL level-1 code, from its id
// "admin1-gaul1-3154") or { type: "custom" }.
export function areaKind(area) {
  if (area?.kind === "country") return { type: "country" };
  const match = /^admin1-gaul1-(\d{1,9})$/.exec(area?.id || "");
  if (area?.kind === "admin1" && match) return { type: "region", code: Number(match[1]) };
  return { type: "custom" };
}

// The drawing tolerance of an area's borders, in degrees and in metres.
export function unitTolerance(area) {
  const bbox = area?.bbox || bboxOf(area?.geometry);
  const deg = bbox ? displayTolerance(bbox) : 0.001;
  const midLat = bbox ? (bbox[1] + bbox[3]) / 2 : 0;
  const metres = Math.min(3000, Math.max(30, deg * 111320 * Math.max(0.2, Math.cos(rad(midLat)))));
  return { deg, metres: Math.round(metres) };
}

// An ASCII id part from a name ("Kharkivs'ka" -> "kharkivska-1a2b3c"): its
// letters, then a short hash of the whole name so two names never share
// an id (and a name in another script still gets one).
function slugId(text) {
  const key = String(text ?? "");
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const letters = key.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32);
  return `${letters ? `${letters}-` : ""}${(h >>> 0).toString(16).padStart(8, "0").slice(0, 6)}`;
}

const named = (rows) => rows.filter((row) => row.name).length;

// A to Z by display name, numbers in order ("Division No. 2" before
// "Division No. 10"); units without a name last.
const byName = (a, b) =>
  (a.displayName === null) - (b.displayName === null) ||
  String(a.displayName ?? "").localeCompare(String(b.displayName ?? ""), "en", { numeric: true, sensitivity: "base" }) ||
  a.id.localeCompare(b.id);

// One GAUL unit as the pages get it. A unit GAUL gives no name of its
// own takes the name of the country GAUL puts it in when that is not the
// area's country (Kenya's outline holds the "Ilemi triangle", a level-1
// unit of its own with no name): GAUL's name, never a made-up one.
function shapeUnit(row, level, tolerance, mainCountry = null) {
  const simplified = simplifyGeometry(row.geometry, tolerance.deg);
  const geometry = roundGeometry(simplified, tolerance.deg >= 0.002 ? 4 : 5);
  if (!geometry || !bboxOf(geometry)) return null;
  const point = labelPoint(geometry, tolerance.deg * 2);
  const parent = level === 2 ? row.adm1Name || null : null;
  return {
    id: `gaul${level}-${row.code}`,
    name: row.name || null,
    displayName: displayPlaceName(row.name) ?? (level === 1 && row.adm0Name && row.adm0Name !== mainCountry ? displayPlaceName(row.adm0Name) : null),
    level,
    code: row.code,
    parent,
    parentDisplayName: displayPlaceName(parent),
    country: row.adm0Name || null,
    areaKm2: round(row.insideKm2, 1),
    bbox: bboxOf(geometry).map((value) => round(value, 5)),
    labelPoint: point ? { lat: round(point[1], 5), lon: round(point[0], 5) } : null,
    geometry,
  };
}

// The GAUL units of an area (Earth Engine: provider.adminUnits), by the
// level rule above. Gives back { level, units, note }.
export async function computeGaulUnits(area, provider) {
  const tolerance = unitTolerance(area);
  const outline = simplifyGeometry(area.geometry, tolerance.deg);
  const kind = areaKind(area);
  const fetchLevel = (level, extra = {}) => provider.adminUnits({ geometry: outline, level, toleranceM: tolerance.metres, ...extra });
  let level = 1;
  let rows = [];
  let note = null;
  if (kind.type === "region") {
    level = 2;
    rows = await fetchLevel(2, { adm1Code: kind.code });
    if (named(rows) < 2) {
      level = 1;
      rows = await fetchLevel(1, { adm1Code: kind.code });
      note = "FAO GAUL 2015 has no districts with names for this region, so it is shown as one unit.";
    }
  } else if (kind.type === "country") {
    const all = await fetchLevel(1);
    const share = (row) => (row.areaKm2 > 0 ? row.insideKm2 / row.areaKm2 : 0);
    rows = all.filter((row) => share(row) >= COUNTRY_SHARE);
    // A country whose outline and GAUL's hardly meet (a small island
    // state): the units mostly inside it.
    if (!rows.length) rows = all.filter((row) => share(row) >= 0.2);
  } else {
    const areaKm2 = areaHa(area.geometry) / 100;
    const keep = (list) => list.filter((row) => row.insideKm2 >= MIN_INSIDE_SHARE * areaKm2 && row.insideKm2 > 0);
    rows = keep(await fetchLevel(1, { clip: true }));
    if (rows.length < MIN_UNITS) {
      const second = keep(await fetchLevel(2, { clip: true }));
      if (named(second) > named(rows)) {
        rows = second;
        level = 2;
      }
    }
  }
  // The area's own country: the one most of its units are in.
  const countries = new Map();
  for (const row of rows) if (row.adm0Name) countries.set(row.adm0Name, (countries.get(row.adm0Name) || 0) + 1);
  const mainCountry = [...countries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const units = rows
    .map((row) => shapeUnit(row, level, tolerance, mainCountry))
    .filter(Boolean)
    .sort(byName);
  return { level, units, note, toleranceDeg: round(tolerance.deg, 6) };
}

// Units made from the run's squares grouped by their place names (the
// fallback without Earth Engine), and which square is in which.
// Gives back { level, units, cellUnit }.
export function unitsFromSquares(area, run) {
  const cells = Array.isArray(run?.cells) ? run.cells : [];
  const size = run?.cellSizeDeg;
  const group = (level) => {
    const groups = new Map();
    for (const cell of cells) {
      const admin1 = displayPlaceName(cell.admin1) ? cell.admin1 : null;
      const admin2 = displayPlaceName(cell.admin2) ? cell.admin2 : null;
      if (!admin1 || (level === 2 && !admin2)) continue;
      const key = level === 2 ? `${nameKey(admin1)}|${nameKey(admin2)}` : nameKey(admin1);
      if (!groups.has(key)) groups.set(key, { key, name: level === 2 ? admin2 : admin1, parent: level === 2 ? admin1 : null, cells: [] });
      groups.get(key).cells.push(cell);
    }
    return groups;
  };
  const kind = areaKind(area);
  let level = 1;
  let groups = group(1);
  if (kind.type === "region" || (kind.type === "custom" && groups.size < MIN_UNITS)) {
    const second = group(2);
    if (second.size >= 2 && second.size > groups.size) {
      level = 2;
      groups = second;
    }
  }
  const units = [];
  const cellUnit = {};
  for (const g of groups.values()) {
    const geometry = squaresOutline(g.cells, size);
    if (!geometry) continue;
    const id = `sq${level}-${slugId(g.key)}`;
    const point = labelPoint(geometry);
    units.push({
      id,
      name: g.name,
      displayName: displayPlaceName(g.name),
      level,
      code: null,
      parent: g.parent,
      parentDisplayName: displayPlaceName(g.parent),
      country: null,
      areaKm2: round(areaHa(geometry) / 100, 1),
      bbox: bboxOf(geometry),
      labelPoint: point ? { lat: round(point[1], 5), lon: round(point[0], 5) } : null,
      geometry,
    });
    for (const cell of g.cells) cellUnit[cell.id] = id;
  }
  units.sort(byName);
  return { level, units, cellUnit };
}

const inBox = (bbox, cell, pad) => Array.isArray(bbox) && cell.lon >= bbox[0] - pad && cell.lon <= bbox[2] + pad && cell.lat >= bbox[1] - pad && cell.lat <= bbox[3] + pad;

// Which unit each square is in: { cellId: unitId }. By the square's own
// place name when it names exactly one of the units and the square is at
// most one square away from it; else the unit its centre is in; else the
// nearest unit within one square. A square near none is left out.
export function assignCells(cells, units, sizeDeg) {
  const out = {};
  if (!Array.isArray(units) || !units.length) return out;
  const level = units[0].level;
  // By display name, so two spellings of one name match (GAUL's level 1
  // and level 2 tables do not always agree).
  const keyOf = (admin1, admin2) => {
    const one = displayPlaceName(admin1);
    if (!one) return null;
    if (level !== 2) return nameKey(one);
    const two = displayPlaceName(admin2);
    return two ? `${nameKey(one)}|${nameKey(two)}` : null;
  };
  const byName = new Map();
  const twice = new Set();
  for (const unit of units) {
    const key = unit.name ? keyOf(level === 2 ? unit.parent : unit.name, unit.name) : null;
    if (!key) continue;
    if (byName.has(key)) twice.add(key);
    else byName.set(key, unit);
  }
  for (const key of twice) byName.delete(key);
  const reach = sizeDeg > 0 ? sizeDeg : 0;
  for (const cell of cells || []) {
    if (!cell?.id || !Number.isFinite(cell.lat) || !Number.isFinite(cell.lon)) continue;
    const key = keyOf(cell.admin1, cell.admin2);
    const byItsName = key ? byName.get(key) : null;
    if (byItsName && inBox(byItsName.bbox, cell, reach) && distanceToGeometry(cell.lon, cell.lat, byItsName.geometry) <= reach) {
      out[cell.id] = byItsName.id;
      continue;
    }
    const inside = units.find((unit) => inBox(unit.bbox, cell, 0) && pointInGeometry(cell.lon, cell.lat, unit.geometry));
    if (inside) {
      out[cell.id] = inside.id;
      continue;
    }
    let best = null;
    let bestDistance = Infinity;
    for (const unit of units) {
      if (!inBox(unit.bbox, cell, reach)) continue;
      const d = distanceToGeometry(cell.lon, cell.lat, unit.geometry);
      if (d < bestDistance) {
        bestDistance = d;
        best = unit;
      }
    }
    if (best && bestDistance <= reach) out[cell.id] = best.id;
  }
  return out;
}

// ---------- Saved GAUL units ----------

const state = (globalThis.__chernozemUnits ??= { inFlight: new Map(), failures: new Map(), assigned: new Map() });

// What is remembered in memory is remembered per data folder (store.js
// dataDir(): the shared demo's, or a registered account's), so two
// accounts with the same country (the same area id) each get their own
// saved file, and one's failure does not pause the other's.
const slotOf = (id) => `${dataDir()}\0${id}`;

// The area's saved GAUL units, worked out now when there are none (one
// request at a time per area). Gives back { file } or, when Earth Engine
// cannot give them, { reason, error? } with reason "no-gee" (sample data),
// "gee-unavailable" (set up but not reachable) or "gee-failed".
async function gaulUnitsOf(area) {
  const cached = await getUnitsCache(area.id);
  if (cached?.version === UNITS_VERSION && Array.isArray(cached.units)) return { file: cached };
  const provider = await getProvider();
  if (provider?.id !== "gee") return { reason: unavailableError(provider) ? "gee-unavailable" : "no-gee" };
  // Earth Engine is connected but the server still runs an older copy of
  // the code without the borders: not "no Earth Engine".
  if (typeof provider.adminUnits !== "function") return { reason: "gee-failed", restart: true };
  const slot = slotOf(area.id);
  const failed = state.failures.get(slot);
  if (failed && Date.now() - failed.at < FAILURE_PAUSE_MS) return { reason: "gee-failed", error: failed.message };
  if (!state.inFlight.has(slot)) {
    const work = (async () => {
      const started = Date.now();
      const result = await computeGaulUnits(area, provider);
      const words = levelWords(result.level);
      const file = {
        version: UNITS_VERSION,
        areaId: area.id,
        source: "gaul",
        dataset: result.level === 2 ? GAUL.level2 : GAUL.level1,
        sourceLabel: `${GAUL.name}, level ${result.level} (${words.many})`,
        level: result.level,
        note: result.note,
        toleranceDeg: result.toleranceDeg,
        computedAt: new Date().toISOString(),
        tookMs: Date.now() - started,
        units: result.units,
      };
      // Not for an area removed meanwhile.
      if (await getArea(area.id)) await saveUnitsCache(area.id, file);
      state.failures.delete(slot);
      return file;
    })();
    state.inFlight.set(slot, work);
    work.then(
      () => state.inFlight.delete(slot),
      () => state.inFlight.delete(slot),
    );
  }
  try {
    return { file: await state.inFlight.get(slot) };
  } catch (error) {
    state.failures.set(slot, { at: Date.now(), message: error?.message || String(error) });
    console.warn(`[chernozem] The states and regions of ${area.id} could not be loaded from Earth Engine: ${error?.message || error}`);
    return { reason: "gee-failed", error: error?.message || String(error) };
  }
}

// For tests: forget the failures and the squares already assigned.
export function resetUnitsState() {
  state.inFlight.clear();
  state.failures.clear();
  state.assigned.clear();
}

const FALLBACK_WORDS = {
  "no-gee": "Earth Engine is not connected (sample data)",
  "gee-unavailable": "Earth Engine cannot be reached right now",
  "gee-failed": "Earth Engine could not give the borders just now",
  restart: "Earth Engine is connected, but the server must be restarted to give the borders",
};

// The month the squares come from, as its summary (no squares: the run
// list is kept in memory, store.js): the one asked for (it must be the
// area's), else the area's newest; null when the area has none.
async function runSummaryFor(area, runId) {
  const summaries = await listRuns(area.id);
  if (!runId) return summaries[0] || null;
  const summary = summaries.find((item) => item.id === runId);
  if (!summary) throw new HttpError(404, "not_found", "That month does not exist for this area.");
  return summary;
}

// Everything GET /api/areas/:id/units gives back (see server/app.js).
export async function unitsForArea(areaId, { runId = null } = {}) {
  const area = await getArea(areaId);
  if (!area) throw new HttpError(404, "not_found", "That area does not exist.");
  const summary = await runSummaryFor(area, runId);
  const gaul = await gaulUnitsOf(area);
  if (gaul.file) {
    const file = gaul.file;
    // The squares' units, kept for the latest few runs (they never change
    // for a run and its saved units), so the run's squares are read only
    // the first time.
    const key = slotOf(`${area.id}|${summary?.id || ""}|${summary?.createdAt || ""}|${file.computedAt}`);
    let cellUnit = state.assigned.get(key);
    if (!cellUnit) {
      const run = summary ? await getRun(summary.id) : null;
      cellUnit = run ? assignCells(run.cells || [], file.units, run.cellSizeDeg) : {};
      state.assigned.set(key, cellUnit);
      if (state.assigned.size > 24) state.assigned.delete(state.assigned.keys().next().value);
    }
    return {
      areaId: area.id,
      runId: summary?.id || null,
      // A region shown as one unit (GAUL has no named districts there) is
      // still worded by districts: the switch reads "Districts", greyed out.
      ...levelWords(areaKind(area).type === "region" ? 2 : file.level),
      level: file.level,
      source: "gaul",
      sourceLabel: file.sourceLabel,
      approximate: false,
      note: file.note || null,
      computedAt: file.computedAt,
      units: file.units,
      cellUnit,
    };
  }
  const run = summary ? await getRun(summary.id) : null;
  const squares = unitsFromSquares(area, run);
  const words = levelWords(areaKind(area).type === "region" ? 2 : squares.level);
  const why = (gaul.restart && FALLBACK_WORDS.restart) || FALLBACK_WORDS[gaul.reason] || FALLBACK_WORDS["gee-failed"];
  const message = squares.units.length
    ? `${why}, so the ${words.many} are drawn from the squares' own place names: their borders follow the squares and are approximate.`
    : `${why}, and ${run ? "this month's squares have no state or region names" : "this area has no analyzed month yet"}, so no ${words.many} can be shown.`;
  return {
    areaId: area.id,
    runId: run?.id || null,
    ...words,
    level: squares.level,
    source: "squares",
    sourceLabel: "The squares' place names (FAO GAUL 2015), borders along the squares",
    approximate: true,
    reason: gaul.reason,
    message,
    note: null,
    computedAt: null,
    units: squares.units,
    cellUnit: squares.cellUnit,
  };
}
