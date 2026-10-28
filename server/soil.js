// WHAT THIS FILE DOES
// The soil types of one map square, or of one state or district, for the
// Atlas map's details ("Soil: Black soil (chernozem type) 78% · Grey
// forest soil 15% · ..."), on demand when a square or a unit is picked.
//
//   GET /api/soil?areaId=&cellId=[&runId=]   one square of an area
//   GET /api/soil?areaId=&unitId=            one state or district
//                                            (server/units.js)
//   GET /api/soil?lat=&lon=&sizeDeg=         any square (not saved to a file)
//
// From the soil map the app already uses (OpenLandMap USDA great groups,
// 250 m: server/providers/gee.js soilHistogram): the share of each soil
// class in the square's cropland (the whole square when it has almost no
// cropland), the top 3 in plain words (server/soil-names.js). Saved per
// area once worked out (server/.data/soil/<areaId>.json), so a square
// looked at again is instant.
//
// Without Earth Engine nothing is made up: the answer says the soil type
// needs Earth Engine (available false).
//
// WHO EDITS IT
// Whoever changes how a place's soil type is found. Tested in soil.test.js.

import { HttpError } from "./http.js";
import { dataDir, getArea, getRun, getSoilCache, listRuns, updateSoilCache } from "./store.js";
import { getProvider, unavailableError } from "./providers/index.js";
import { pointInGeometry } from "./geo.js";
import { BUILT_IN_CLASSES, soilMix } from "./soil-names.js";
import { unitsForArea } from "./units.js";

// Bumped when the saved answers change: older ones are worked out again.
export const SOIL_VERSION = 1;
export const SOIL_SOURCE = "OpenLandMap USDA soil great groups (SOL_GRTGROUP_USDA-SOILTAX_C/v01), 250 m; cropland from ESA WorldCover";

const bad = (message) => new HttpError(400, "bad_request", message);
const notFound = (message) => new HttpError(404, "not_found", message);

const NEEDS_GEE = {
  "no-gee": "The soil type needs Earth Engine, which is not connected (sample data), so no soil type is shown.",
  "gee-unavailable": "The soil type needs Earth Engine, which cannot be reached right now. Try again in a few minutes.",
};

// A map square [west, south, east, north] around a centre.
const square = (lat, lon, size) => {
  const half = size / 2;
  const r = (value) => Number(value.toFixed(7));
  return { type: "Polygon", coordinates: [[[r(lon - half), r(lat - half)], [r(lon + half), r(lat - half)], [r(lon + half), r(lat + half)], [r(lon - half), r(lat + half)], [r(lon - half), r(lat - half)]]] };
};

const state = (globalThis.__chernozemSoil ??= { inFlight: new Map(), points: new Map() });

// For tests.
export function resetSoilState() {
  state.inFlight.clear();
  state.points.clear();
}

// What the answer looks like when Earth Engine cannot give it.
function unavailable(reason, extra = {}) {
  return { available: false, reason, message: NEEDS_GEE[reason] || "The soil type could not be read from Earth Engine just now. Try again in a minute.", ...extra };
}

// What is saved for a place is what Earth Engine counted (the pixel counts
// per class), so the names are always today's (server/soil-names.js):
//   { version, ...place, histogram: { cropland, all }, classes?, computedAt, tookMs }
// classes only when the map's class list differs from the built-in one.
// The answer the pages get adds the plain names (soilMix) and the source.
function answerOf(saved) {
  const { histogram, classes, ...rest } = saved;
  return { available: true, ...rest, ...soilMix(histogram, classes || []), source: SOIL_SOURCE };
}

// Only the classes the built-in list names differently (none, today).
function changedClasses(classes) {
  const changed = (classes || []).filter((c) => BUILT_IN_CLASSES.get(c.value) !== c.name);
  return changed.length ? changed : undefined;
}

// Reads one place's soil from Earth Engine (one request per place at a
// time). Gives back what to save (see answerOf), or { available: false }
// without Earth Engine.
async function measure(key, geometry, place) {
  const provider = await getProvider();
  if (provider?.id !== "gee") return unavailable(unavailableError(provider) ? "gee-unavailable" : "no-gee", place);
  // Connected, but the server still runs an older copy of the code.
  if (typeof provider.soilHistogram !== "function") return unavailable("gee-failed", { ...place, message: "The soil type needs a restart of the server: Earth Engine is connected, but the server still runs an older copy of the app." });
  // One request at a time per place AND per data folder (store.js
  // dataDir()): a registered account's square is never answered from the
  // demo's request, whose result is saved in the demo's folder.
  const slot = `${dataDir()}\0${key}`;
  if (!state.inFlight.has(slot)) {
    const work = (async () => {
      const started = Date.now();
      const counted = await provider.soilHistogram({ geometry });
      const classes = changedClasses(counted.classes);
      return {
        version: SOIL_VERSION,
        ...place,
        histogram: { cropland: counted.cropland || {}, all: counted.all || {} },
        ...(classes ? { classes } : {}),
        computedAt: new Date().toISOString(),
        tookMs: Date.now() - started,
      };
    })();
    state.inFlight.set(slot, work);
    work.then(
      () => state.inFlight.delete(slot),
      () => state.inFlight.delete(slot),
    );
  }
  try {
    return await state.inFlight.get(slot);
  } catch (error) {
    console.warn(`[chernozem] Soil type for ${key} failed: ${error?.message || error}`);
    return unavailable("gee-failed", { ...place, error: error?.message || String(error) });
  }
}

const toNumber = (value) => (value === null || value === undefined || String(value).trim() === "" ? NaN : Number(value));

// Everything GET /api/soil gives back: { soil } (see the top of the file).
//   query  the request's URLSearchParams
export async function soilFor(query) {
  const areaId = query.get("areaId");
  const cellId = query.get("cellId");
  const unitId = query.get("unitId");

  // Any square, by its centre and size.
  if (!areaId) {
    const lat = toNumber(query.get("lat"));
    const lon = toNumber(query.get("lon"));
    const sizeDeg = toNumber(query.get("sizeDeg") ?? query.get("size"));
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) throw bad("Send areaId with cellId or unitId, or lat and lon (with sizeDeg).");
    if (!(sizeDeg > 0 && sizeDeg <= 2)) throw bad("sizeDeg (the square's size in degrees) must be a number above 0, at most 2.");
    const key = `point|${lat.toFixed(5)}|${lon.toFixed(5)}|${sizeDeg}`;
    if (state.points.has(key)) return { soil: answerOf(state.points.get(key)) };
    const saved = await measure(key, square(lat, lon, sizeDeg), { lat, lon, sizeDeg });
    if (saved.available === false) return { soil: saved };
    state.points.set(key, saved);
    if (state.points.size > 500) state.points.delete(state.points.keys().next().value);
    return { soil: answerOf(saved) };
  }

  const area = await getArea(areaId);
  if (!area) throw notFound("That area does not exist.");
  if (!cellId === !unitId) throw bad("Send either cellId (a square, like r12c40) or unitId (a state or district).");

  if (cellId) {
    if (!/^r\d{1,5}c\d{1,5}$/.test(cellId)) throw bad("A square's id looks like r12c40.");
    // An area's squares never change, so a square measured once is kept.
    const cached = (await getSoilCache(area.id))?.cells?.[cellId];
    if (cached?.version === SOIL_VERSION && cached.histogram) return { soil: answerOf(cached) };
    // The square as the map shows it: the run's (the one asked for, else
    // the newest), else worked out from the area's grid.
    const runId = query.get("runId");
    const summary = runId ? null : (await listRuns(area.id))[0];
    const run = runId || summary ? await getRun(runId || summary.id) : null;
    if (runId && (!run || run.areaId !== area.id)) throw notFound("That month does not exist for this area.");
    let cell = run?.cells?.find((c) => c.id === cellId) || null;
    const sizeDeg = run?.cellSizeDeg || area.cellSizeDeg;
    if (!cell && !run) {
      const match = /^r(\d+)c(\d+)$/.exec(cellId);
      const [west, , , north] = area.bbox || [];
      const lat = north - (Number(match[1]) + 0.5) * sizeDeg;
      const lon = west + (Number(match[2]) + 0.5) * sizeDeg;
      if (Number.isFinite(lat) && Number.isFinite(lon) && pointInGeometry(lon, lat, area.geometry)) cell = { id: cellId, lat, lon };
    }
    if (!cell) throw notFound(`No square ${cellId} in this area.`);
    const place = { areaId: area.id, cellId, lat: cell.lat, lon: cell.lon, sizeDeg };
    const saved = await measure(`${area.id}|cell|${cellId}|${sizeDeg}`, square(cell.lat, cell.lon, sizeDeg), place);
    if (saved.available === false) return { soil: saved };
    await updateSoilCache(area.id, (file) => void (file.cells[cellId] = saved));
    return { soil: answerOf(saved) };
  }

  const cached = (await getSoilCache(area.id))?.units?.[unitId];
  const layer = await unitsForArea(area.id);
  const unit = layer.units.find((u) => u.id === unitId);
  if (!unit) throw notFound("No such state or district in this area.");
  // A unit's soil is kept only for the borders it was measured on (the
  // squares' approximate ones are never saved).
  if (cached?.version === SOIL_VERSION && cached.histogram && cached.unitSource === layer.source && cached.unitComputedAt === layer.computedAt) return { soil: answerOf(cached) };
  const place = { areaId: area.id, unitId, name: unit.name, displayName: unit.displayName, unitSource: layer.source, unitComputedAt: layer.computedAt, approximateBorders: layer.approximate };
  const saved = await measure(`${area.id}|unit|${unitId}|${layer.computedAt}`, unit.geometry, place);
  if (saved.available === false) return { soil: saved };
  if (!layer.approximate) await updateSoilCache(area.id, (file) => void (file.units[unitId] = saved));
  return { soil: answerOf(saved) };
}
