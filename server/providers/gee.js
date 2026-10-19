// WHAT THIS FILE DOES
// The real data source: Google Earth Engine. For every grid cell of an
// area it measures, for one month, the satellite readings the Atlas
// scores are built from. It follows the owner's research backend (the
// server.js in the Harvard Dataverse deposit) step by step, but for any
// area instead of only Ukraine, and for the month being analyzed instead
// of "the latest season".
//
//   status()               is Earth Engine set up, and does signing in work?
//   analyze({ area, cells, month, cellSizeDeg, onProgress })
//                          -> { readings, alerts, warnings, baseline, conflict,
//                               imagery, accessSource } (one reading per cell)
//   searchAdmin1(q)        regions (provinces, oblasts, states) by name
//   admin1Boundary(id)     one of those regions: { id, name, country, geometry }
//
// What each reading comes from (dataset ids are Earth Engine catalog ids):
//   chernozem      GEE_CHERNOZEM_ASSET band b1 / 89 (SoilGrids WRB Chernozem
//                  probability, the deposit's asset) when it is set and
//                  readable; else (and where it has no data) the share of
//                  black soil on OpenLandMap's USDA great-group map
//                  (OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01, Mollisols
//                  except the cold and bleached ones, see BLACK_SOIL); where
//                  that has no data either, SoilGrids soil organic carbon
//                  (projects/soilgrids-isric/soc_mean, 0-5 cm), see SOC
//   croplandShare  ESA/WorldCover/v200, share of pixels with class 40 (cropland)
//   chiDrop        drop of the Chernozem Health Index (COPERNICUS/S2_SR_HARMONIZED,
//                  formula below) from the same season of 2019-2021 (one
//                  composite) to the last complete growing season. A
//                  DIAGNOSTIC only: crop rotation moves it, so it is not
//                  part of the damage score or of heavy damage
//   radarDb        mean |change| of Sentinel-1 VV (COPERNICUS/S1_GRD, one
//                  orbit direction) over the cell's cropland: the last
//                  complete season's median against the same season's
//                  median in 2019-2021 (the owner's paper)
//   heavyShare     share of cropland pixels heavily damaged (method.js
//                  HEAVY_DAMAGE): radar change of 3 dB or more, or of 2 dB
//                  or more within 1 km of an unusual fire; away from any
//                  known war 3 dB or more AND within 1 km of an unusual fire
//   firesPer100Km2 FIRMS (band T21) detections in the damage window MINUS
//                  the cell's normal rate (2019-2021) for that long, for the
//                  whole cell, never below 0, per 100 km². The damage window
//                  starts the day a known war began (src/config/conflicts.js),
//                  else two years back, so farm burning that comes every year
//                  does not count
//   conflictKm     distance to recent battles (ACLED file, acled.js); without
//                  a file, inside a known war, to unusual fire detections of
//                  the last 12 months (FIGHTING_FIRES); outside any known war
//                  without a file, not measured: 300 km everywhere, so nothing
//                  is set aside for it (which does not make the land safe)
//   population     WorldPop/GP/100m/pop (2020), people living in the cell
//   lights         NASA/VIIRS/002/VNP46A2 night lights, median of the month
//   admin1/admin2  FAO/GAUL/2015/level2 names (best effort)
// Alerts: Sentinel-1 radar change (COPERNICUS/S1_GRD, VV, one orbit
// direction) in the month against the same month of 2019-2021, and FIRMS
// fires in the month above the same month's 2019-2021 count.
//
// Safety rules that keep a first real run from failing (each one is a
// problem Earth Engine really has):
//   - never a JavaScript null inside ee.Dictionary or ee.Algorithms.If:
//     "nothing found" is sent as -1 and turned back into null here
//   - cells are measured in chunks; big cells mean fewer cells per chunk
//     (see chunkSizeFor), at most 2 chunks at once, each with a time limit
//   - a chunk that runs out of memory or time is
//     split in halves with the same pixels (SPLIT_MIN_CELLS), and only a
//     small piece that still fails with coarser pixels (coarserScale),
//     before giving up
//   - population is never re-projected over a whole country (see
//     populationPlan)
//   - date windows stop at today, so nothing asks for future images
//
// Works anywhere on Earth: each cell's growing season comes from its own
// greenest month in 2019-2021 (MODIS NDVI, MODIS/061/MOD13A2; see
// src/lib/season.js), or from its latitude where that is not clear; cells
// are measured in groups of the same season. The war, if any, comes from
// server/conflicts.js. The result says which war it used (`conflict`, or
// null at peace), which season it compared (`imagery`) and where distance
// to fighting came from (`accessSource`).
//
// Nothing here runs until Earth Engine credentials are in .env (see
// docs/CONNECT-DATA.md). `npm run gee:check` tries it on real data.
// Tests (gee.test.js) run the whole analysis against a stand-in for Earth
// Engine (fake-ee.js), and check the plain helpers at the bottom.
//
// WHO EDITS IT
// Whoever changes how the satellite data is measured. Keep it in step with
// the research method (src/lib/atlas/method.js) and the deposit.

import { config, missingGeeSettings } from "../env.js";
import { cellAreaKm2, formatCoord } from "../geo.js";
import { NO_WAR_WARNING, addMonths, cleanConflict } from "../runs.js";
import { HEAVY_DAMAGE } from "../../src/lib/atlas/method.js";
import { baselineWindows, climateBand, lastCompleteSeason, peakMonthFrom, sameWindowIn, windowLabel } from "../../src/lib/season.js";
import { damageWindow } from "../../src/config/conflicts.js";
import { conflictForArea } from "../conflicts.js";
import { acledBattlesFor, expandBbox } from "./acled.js";

// ---------- Fixed choices ----------

export const DATASETS = {
  sentinel2: "COPERNICUS/S2_SR_HARMONIZED",
  sentinel1: "COPERNICUS/S1_GRD",
  worldCover: "ESA/WorldCover/v200",
  blackSoil: "OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01",
  soc: "projects/soilgrids-isric/soc_mean",
  firms: "FIRMS",
  modisNdvi: "MODIS/061/MOD13A2",
  viirs: "NASA/VIIRS/002/VNP46A2",
  worldPop: "WorldPop/GP/100m/pop",
  gaul1: "FAO/GAUL/2015/level1",
  gaul2: "FAO/GAUL/2015/level2",
};

export const BANDS = {
  chernozemAsset: "b1", // 0..89 in the deposit's asset, divided by 89 like the Colab notebook
  blackSoil: "grtgroup", // USDA great group, the most likely class, 250 m
  soc: "soc_0-5cm_mean", // soil organic carbon 0-5 cm, dg/kg
  worldCover: "Map",
  firms: "T21",
  viirs: "Gap_Filled_DNB_BRDF_Corrected_NTL",
  worldPop: "population",
  sentinel1: "VV",
  modisNdvi: "NDVI", // x 0.0001
};

// The "before" picture: the same months of 2019, 2020 and 2021, in one
// composite (the research compares several pre-war years with the war
// years). One year alone mixed weather and crop rotation into "damage":
// real run, Ukraine, September 2026, 2021 alone (a record harvest year):
// 8.8M ha of black-soil cropland "heavily damaged", most of it in the
// drought-hit centre and south; 2019-2021: 2.6M ha (probe, same month),
// in line with the research's ~2M ha.
export const BASELINE_FROM = 2019;
export const BASELINE_YEAR = 2021; // the last baseline year
export const BASELINE_YEARS = Array.from({ length: BASELINE_YEAR - BASELINE_FROM + 1 }, (_, i) => BASELINE_FROM + i);
export const GEE_BASELINE = { from: BASELINE_FROM, to: BASELINE_YEAR, label: `${BASELINE_FROM} to ${BASELINE_YEAR} (same months)` };
// The start of the full-scale invasion of Ukraine. Kept for the Field
// provider; the Atlas takes the war's start from src/config/conflicts.js.
export const WAR_START = "2022-02-24";
// The normal fire rate of a place: all its FIRMS detections in 2019, 2020
// and 2021 (whole years), per day. Fires in the damage window count only
// above that rate times the window's length.
export const FIRE_NORMAL = { start: `${BASELINE_FROM}-01-01`, end: `${BASELINE_YEAR + 1}-01-01` };
// What a run says when there is no war and no ACLED file (runs.js).
export { NO_WAR_WARNING };
// Sentinel-2 scenes cloudier than this are skipped (deposit: 55%).
export const MAX_CLOUD_PERCENT = 55;
// Distance to fighting is measured up to 300 km; farther counts as 300 km.
export const MAX_CONFLICT_M = 300000;
// Without an ACLED file, "fighting" is fire that is NOT normal for the
// place: a fire detection of the last 12 months where the fire density
// within radiusM is at least timesPrewar times the same 12 months' mean of
// 2019-2021 AND at least minPerKm2 detections per km² (per 1 km pixel).
// Farm burning comes back every year at the same places, so it cancels out;
// the front does not. Real data, October 2026 (probe): plain fires put Lviv
// 7 km and Odesa 5 km from "fighting" (Ukraine median 18 km); with this
// rule Kupiansk 1 km, Pokrovsk 2, Kherson 10, Kharkiv 28, Dnipro 75, Odesa
// 100, Poltava 140, Lviv and Uzhhorod 300+. A 90-day window failed in
// winter (too few fires anywhere: Kherson 295 km), so 12 months are used.
export const FIGHTING_FIRES = { radiusM: 10000, timesPrewar: 3, minPerKm2: 1 };
// A radar pixel "changed" when its VV backscatter moved by more than 2 dB
// (radar alerts: the month against the same month of 2019-2021).
export const RADAR_CHANGE_DB = 2;
// A season's median VV below this (dB) is open water, not farmland.
export const WATER_VV_DB = -18;
// Radar alerts: the median change within this many km of the cells (at
// this pixel size, m) is the neighbourhood's own shift.
export const RADAR_SHIFT = { aroundKm: 20, scale: 500, maxPixels: 1e7 };
// Radar alerts in a large area: a cell must have changed this many times as
// much as the area's median cell (with at least minCells cells to judge).
// An alert joins touching cells up to `reach` cells from its strongest one
// (a 5 x 5 block at most), so one alert is one event, not a whole front.
export const RADAR_ALERT = { timesTypical: 2, minCells: 20, reach: 2 };
// Sentinel-1 orbit directions; one is used per comparison (pickPass).
export const ORBIT_PASSES = ["ASCENDING", "DESCENDING"];
// Unusual fire for heavy damage: the fire density over this radius (m)
// above the normal years' (the paper smooths fire over 5 km).
export const FIRE_SMOOTH_M = 5000;
// Finding each place's growing season (src/lib/season.js): the mean MODIS
// NDVI of each calendar month in 2019-2021 over the cell's cropland,
// reduced at a pixel size between minScale and maxScale (m). At most
// maxGroups different seasons per area (smaller groups join the nearest
// season), each kept only when it has at least minShare of the cells.
export const SEASON_FINDER = { start: "2019-01-01", end: "2022-01-01", ndviScale: 0.0001, minScale: 250, maxScale: 1000, maxGroups: 3, minShare: 0.05 };
// The most cells in one Earth Engine request (small cells), the fewest
// (huge cells), and roughly how much ground one request covers (km²).
// The deposit measured all of Ukraine (~600,000 km²) in one request at
// 1 km pixels; 50,000 km² per request leaves a wide safety margin.
export const CHUNK_SIZE = 250;
export const MIN_CHUNK_SIZE = 10;
export const CHUNK_AREA_KM2 = 50000;
// At most this many requests run at the same time.
export const MAX_PARALLEL_CHUNKS = 2;
// A chunk that runs out of memory or time is split in two (same pixels)
// until its pieces have this many cells or fewer; only such a piece that
// still fails is measured with coarser pixels.
export const SPLIT_MIN_CELLS = 4;
// How long one request may take before it is given up (or retried).
export const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;
// Earth Engine splits work into smaller tiles when tileScale is higher:
// slower, but uses less memory. Cells this wide (km) or wider get 16.
export const BIG_CELL_KM = 10;
// The most pixels Earth Engine may read for one cell.
export const MAX_PIXELS_PER_CELL = 1e9;
// The WorldCover class for cropland.
export const CROPLAND_CLASS = 40;
// WorldPop 100 m pixels are 3 arc-seconds square. One pixel's area at the
// equator (m²); away from it, multiply by cos(latitude).
export const WORLDPOP_PIXEL_DEG = 3 / 3600;
export const WORLDPOP_PIXEL_M2_AT_EQUATOR = (WORLDPOP_PIXEL_DEG * 111319.49) ** 2;
// "Nothing found" inside Earth Engine (it does not accept null there).
export const NONE = -1;

// The black-soil map used when there is no chernozem asset (the owner's
// choice, 2026-10-18): OpenLandMap's USDA great groups. Black soil = the
// Mollisol great groups (names ending in "olls") except the cold ones
// (Cryolls, Cryaquolls, Cryoborolls) and the bleached ones (Albolls). The
// share of a cell or field in those groups is the "chernozem" value, so it
// works worldwide (Ukraine, the US prairie, north-east China). It is broader
// than the research's WRB Chernozem >= 0.5 (it also counts Phaeozems and
// Kastanozems), so national black-soil totals come out higher than the
// paper's 15.07 million ha.
export const BLACK_SOIL_SOURCE = "Black-soil map: OpenLandMap USDA soil classes (Mollisols), 250 m";
export const BLACK_SOIL = {
  keep: /olls$/i,
  drop: /cryolls$|albolls$|cryoborolls$|^cryaquolls$/i,
  // The class values when the map's own class list cannot be read
  // (grtgroup_class_values / grtgroup_class_names, read 2026-10-18).
  classes: [269, 271, 272, 273, 274, 276, 277, 278, 280, 283, 284, 285, 286, 289, 290, 291, 292, 294, 296, 297, 298, 300, 301, 302, 303, 306, 307, 308, 310, 311, 312],
};

// The black-soil class values from the map's properties, or null.
export function blackSoilClassesFrom(properties) {
  const values = properties?.grtgroup_class_values;
  const names = properties?.grtgroup_class_names;
  if (!Array.isArray(values) || !Array.isArray(names) || values.length !== names.length) return null;
  const picked = values.filter((value, i) => Number.isFinite(value) && typeof names[i] === "string" && BLACK_SOIL.keep.test(names[i]) && !BLACK_SOIL.drop.test(names[i]));
  return picked.length ? picked : null;
}

// The class list, read once per Earth Engine connection (checkChernozemAsset
// does it before any image is built).
const blackSoilClassesByEe = new WeakMap();
async function loadBlackSoilClasses(ee) {
  if (blackSoilClassesByEe.has(ee)) return blackSoilClassesByEe.get(ee);
  let classes = BLACK_SOIL.classes;
  try {
    classes = blackSoilClassesFrom((await getAsset(ee, DATASETS.blackSoil))?.properties) || BLACK_SOIL.classes;
  } catch {
    // The built-in list is the same classes.
  }
  blackSoilClassesByEe.set(ee, classes);
  return classes;
}

// 1 where the great group is black soil, 0 elsewhere; masked where the map
// has no data. Its mean over a cell or field is the black-soil share.
export function blackSoilImage(ee) {
  const classes = blackSoilClassesByEe.get(ee) || BLACK_SOIL.classes;
  return ee
    .Image(DATASETS.blackSoil)
    .select(BANDS.blackSoil)
    .remap(classes, classes.map(() => 1), 0)
    .rename("blackSoil");
}

// Soil organic carbon -> a 0..1 stand-in for chernozem, used only where
// the black-soil map has no data. SoilGrids stores SOC in dg/kg, so
// g/kg = value × 0.1. The 0..1 scale is the one the research notebook uses
// for its soil score: (SOC g/kg − 10) / 50, so 10 g/kg or less (poor soil)
// -> 0, 60 g/kg or more -> 1, a typical chernozem topsoil (30–40 g/kg) ->
// about 0.4–0.6.
export const SOC = { unitGkg: 0.1, offsetGkg: 10, spanGkg: 50 };

// The same formula as plain arithmetic, for tests and the gee:check script.
export function socToChernozem(rawValue) {
  if (!Number.isFinite(rawValue)) return null;
  const gkg = rawValue * SOC.unitGkg;
  return Math.min(1, Math.max(0, (gkg - SOC.offsetGkg) / SOC.spanGkg));
}

// ---------- The provider ----------

// The pause before the one retry of a request whose connection dropped
// (isTransientError).
export const TRANSIENT_RETRY_MS = 8000;

// Makes a provider. The app uses the ready-made one below; tests pass
//   ee         a stand-in Earth Engine library (fake-ee.js)
//   getConfig  settings to use instead of .env
//   now        the clock, () => Date (so "today" can be fixed in tests)
//   retryDelayMs  the pause before retrying a dropped request (default
//              TRANSIENT_RETRY_MS; tests use 0)
// Anything else in `options` is ignored (providers/index.js passes the
// .env settings here).
export function createGeeProvider(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const injectedEe = opts.ee && typeof opts.ee === "object" && opts.ee.data ? opts.ee : null;
  const getConfig = typeof opts.getConfig === "function" ? opts.getConfig : config;
  const now = typeof opts.now === "function" ? opts.now : () => new Date();
  // The real library signs in once for the whole server; a stand-in gets its own state.
  const state = injectedEe ? newState(injectedEe) : sharedState();
  const retryDelayMs = Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : TRANSIENT_RETRY_MS;
  const deps = { getConfig, now, state, retryDelayMs, connect: (cfg = getConfig()) => connectWith(state, cfg) };
  return {
    id: "gee",
    label: "Earth Engine",
    status: () => status(deps),
    analyze: (input) => analyze(deps, input),
    searchAdmin1: (q) => searchAdmin1(deps, q),
    admin1Boundary: (id) => admin1Details(deps, id),
    admin1Details: (id) => admin1Details(deps, id),
    probePoint: (point) => readPoint(deps, point),
    connect: deps.connect,
  };
}

export const geeProvider = createGeeProvider();
export default geeProvider;

// Signs in (see connectWith) and gives back the `ee` library.
export function connect(cfg = config()) {
  return geeProvider.connect(cfg);
}

// For the gee:check script: the raw soil values at one point.
export function probePoint(point) {
  return geeProvider.probePoint(point);
}

// True when .env has what Earth Engine needs (and it is not turned off).
export function isGeeConfigured(cfg = config()) {
  return !cfg.geeDisabled && !cfg.geeCredentialsError && missingGeeSettings(cfg).length === 0;
}

// What is missing, in words a person can act on. Empty when nothing is.
export function setupProblems(cfg = config()) {
  const problems = [];
  if (cfg.geeDisabled) problems.push("Earth Engine is turned off (GEE_DISABLED=1 in .env).");
  if (cfg.geeCredentialsError) problems.push(cfg.geeCredentialsError);
  const missing = missingGeeSettings(cfg).filter((name) => !(cfg.geeCredentialsError && name.includes("CREDENTIALS")));
  if (missing.length) problems.push(`Missing in .env: ${missing.join(", ")}.`);
  return problems;
}

async function status(deps) {
  const cfg = deps.getConfig();
  const problems = setupProblems(cfg);
  if (problems.length) return { ok: false, detail: problems.join(" ") };
  try {
    await deps.connect(cfg);
    return { ok: true, detail: `Connected to project ${cfg.geeProjectId} as ${cfg.geeCredentials.client_email}.` };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

// ---------- Signing in ----------

export class GeeError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "GeeError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

// Kept on globalThis so the dev server, which reloads this file after
// edits, does not sign in again for every request.
function newState(ee = null) {
  return { ee, key: null, promise: null, error: null, failedAt: 0, noMaxPixelsArg: false };
}
function sharedState() {
  const state = (globalThis.__chernozemGee ??= newState());
  state.noMaxPixelsArg ??= false;
  return state;
}
const RETRY_AFTER_MS = 60 * 1000;

async function loadEe(state) {
  if (!state.ee) {
    // The library is CommonJS; under ESM its exports are on .default.
    const mod = await import("@google/earthengine");
    state.ee = mod.default ?? mod;
  }
  return state.ee;
}

// Signs in with the service-account key and starts Earth Engine for the
// project, exactly like the deposit. Gives back the `ee` library.
// Remembers success; a failure is remembered for a minute so a broken key
// does not hammer Google.
async function connectWith(state, cfg) {
  const problems = setupProblems(cfg);
  if (problems.length) throw new GeeError("not_configured", problems.join(" "));
  const context = contextOf(cfg);
  const key = `${cfg.geeProjectId}|${cfg.geeCredentials.client_email}`;
  if (state.key === key && state.promise) return state.promise;
  if (state.key === key && state.error && Date.now() - state.failedAt < RETRY_AFTER_MS) throw state.error;

  const previousKey = state.key;
  state.key = key;
  state.error = null;
  state.promise = (async () => {
    const ee = await loadEe(state);
    if (previousKey && previousKey !== key && typeof ee.reset === "function") ee.reset();
    await withTimeout(
      new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
          cfg.geeCredentials,
          () => ee.initialize(null, null, () => resolve(), (error) => reject(asError(error)), null, cfg.geeProjectId),
          (error) => reject(asError(error)),
        );
      }),
      90 * 1000,
      "Signing in to Earth Engine",
    );
    if (ee.data && typeof ee.data.setDeadline === "function") ee.data.setDeadline(CHUNK_TIMEOUT_MS);
    return ee;
  })().catch((error) => {
    const friendly = explainGeeError(error, context);
    state.promise = null;
    state.error = friendly;
    state.failedAt = Date.now();
    throw friendly;
  });
  return state.promise;
}

export function contextOf(cfg) {
  return {
    projectId: cfg.geeProjectId,
    clientEmail: cfg.geeCredentials?.client_email,
    asset: cfg.chernozemAsset,
  };
}

function asError(error) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : error?.message || JSON.stringify(error));
}

// Runs one Earth Engine computation and waits for the answer.
export function evaluate(eeObject, { timeoutMs = CHUNK_TIMEOUT_MS, what = "Earth Engine request", context = {} } = {}) {
  const request = new Promise((resolve, reject) => {
    eeObject.evaluate((value, error) => (error ? reject(asError(error)) : resolve(value)));
  });
  return withTimeout(request, timeoutMs, what).catch((error) => {
    throw error instanceof GeeError ? error : explainGeeError(error, { ...context, what });
  });
}

// Reads an asset's description (used to check the chernozem map).
function getAsset(ee, id) {
  return withTimeout(
    new Promise((resolve, reject) => {
      ee.data.getAsset(id, (value, error) => (error ? reject(asError(error)) : resolve(value)));
    }),
    60 * 1000,
    `Reading asset ${id}`,
  );
}

// ---------- Images ----------

// Each helper builds an Earth Engine image or collection for a region and
// a date window ({ start, end }, end not included).

function rect(ee, bbox) {
  return ee.Geometry.Rectangle(bbox, null, false);
}

export function sentinel2(ee, region, window) {
  return ee
    .ImageCollection(DATASETS.sentinel2)
    .filterBounds(region)
    .filterDate(window.start, window.end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_CLOUD_PERCENT));
}

// Deposit's maskSentinel2Clouds: drop cloud shadow (3), clouds (8, 9),
// cirrus (10) and snow (11) using the scene classification band.
function maskSentinel2Clouds(image) {
  const scl = image.select("SCL");
  const clear = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(clear);
}

// Deposit's chiHealthImage, unchanged: Chernozem Health Index 0..1
// (higher = healthier) from a cloud-masked median composite:
//   CHI = 0.30 NDVI + 0.25 NDMI + 0.20 NBR + 0.15 (1 − BSI) + 0.10 RVI
// each index first stretched to 0..1 over a fixed range.
// `window` may be a list of windows: one composite over all their images
// (the multi-year "before" picture).
export function chiHealthImage(ee, region, window) {
  const windows = Array.isArray(window) ? window : [window];
  const collection = windows.map((w) => sentinel2(ee, region, w)).reduce((all, next) => all.merge(next));
  const img = collection.map(maskSentinel2Clouds).median();
  const b2 = img.select("B2");
  const b4 = img.select("B4");
  const b8 = img.select("B8");
  const b11 = img.select("B11");

  const ndvi = img.normalizedDifference(["B8", "B4"]);
  const ndmi = img.normalizedDifference(["B8", "B11"]);
  const nbr = img.normalizedDifference(["B8", "B12"]);
  const bsi = b11.add(b4).subtract(b8.add(b2)).divide(b11.add(b4).add(b8).add(b2));
  const rvi = b8.divide(b4);

  const norm = (band, min, max) => band.subtract(min).divide(max - min).clamp(0, 1);
  return norm(ndvi, 0, 0.9)
    .multiply(0.3)
    .add(norm(ndmi, -0.5, 0.5).multiply(0.25))
    .add(norm(nbr, -0.5, 0.8).multiply(0.2))
    .add(ee.Image(1).subtract(norm(bsi, -0.5, 0.5)).multiply(0.15))
    .add(norm(rvi, 0, 1.5).multiply(0.1))
    .rename("chi");
}

// pass: "ASCENDING" or "DESCENDING" to keep one orbit direction only
// (radar compared across windows must look from the same side).
export function sentinel1(ee, region, window, pass = null) {
  let collection = ee
    .ImageCollection(DATASETS.sentinel1)
    .filterBounds(region)
    .filterDate(window.start, window.end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"));
  if (pass) collection = collection.filter(ee.Filter.eq("orbitProperties_pass", pass));
  return collection.select(BANDS.sentinel1);
}

export function firms(ee, region, window) {
  return ee.ImageCollection(DATASETS.firms).filterBounds(region).filterDate(window.start, window.end).select(BANDS.firms);
}

function viirs(ee, region, window) {
  return ee.ImageCollection(DATASETS.viirs).filterBounds(region).filterDate(window.start, window.end).select(BANDS.viirs);
}

// The deposit's worldPopImage(): WorldPop 2020, band "population" (people
// per ~100 m pixel). The deposit filtered to Ukraine ("UKR"); here every
// country that touches the area is used.
function worldPop(ee, region) {
  return ee.ImageCollection(DATASETS.worldPop).filterBounds(region).filter(ee.Filter.eq("year", 2020)).select(BANDS.worldPop);
}

function croplandImage(ee) {
  return ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).eq(CROPLAND_CLASS).unmask(0).rename("cropland");
}

// A band with no data anywhere (its mean comes back empty).
function emptyBand(ee, name) {
  return ee.Image.constant(0).updateMask(ee.Image.constant(0)).rename(name);
}

// Chernozem 0..1: the chernozem asset where it has data, else the
// black-soil map (BLACK_SOIL), else soil organic carbon. Left masked over
// water so the mean is over land.
export function chernozemImage(ee, assetId) {
  const soc = ee
    .Image(DATASETS.soc)
    .select(BANDS.soc)
    .multiply(SOC.unitGkg)
    .subtract(SOC.offsetGkg)
    .divide(SOC.spanGkg)
    .clamp(0, 1);
  // false: also fill where the map has no pixels at all
  const blackSoil = blackSoilImage(ee).unmask(soc, false);
  if (!assetId) return blackSoil.rename("chernozem");
  return ee
    .Image(assetId)
    .select(BANDS.chernozemAsset)
    .divide(89)
    .clamp(0, 1)
    .unmask(blackSoil, false)
    .rename("chernozem");
}

// People in each cell. Two ways, picked by populationPlan():
//   native  small cells: add up WorldPop's own pixel values on WorldPop's
//           own grid (exact, and cheap because the cells are small)
//   density big cells: people per m² (pixel value ÷ that pixel's area,
//           worked out from the latitude, no re-projecting) times the
//           area of each coarser pixel, added up at a coarser scale
function populationImages(ee, region) {
  const pop = worldPop(ee, region);
  const perPixel = pop.mosaic().unmask(0).rename("people");
  // A WorldPop pixel's area (m²) at each latitude: no reproject needed.
  const nativeArea = ee.Image.pixelLonLat()
    .select("latitude")
    .multiply(Math.PI / 180)
    .cos()
    .multiply(WORLDPOP_PIXEL_M2_AT_EQUATOR);
  const density = perPixel.divide(nativeArea).multiply(ee.Image.pixelArea()).rename("people");
  // A mosaic forgets its grid; give it WorldPop's back (no pixels change).
  const nativeProjection = pop.first().projection();
  return { perPixel: perPixel.setDefaultProjection(nativeProjection), density, nativeProjection };
}

// ---------- One month for one area ----------

// Counts what imagery exists, so empty collections never reach a formula
// (an empty collection has no bands and would make the whole request fail).
// Never null inside the dictionary: "no image" is NONE (-1).
async function preflight(ee, { region, bufferRegion, windows, context }) {
  const latest = (collection) => ee.Algorithms.If(collection.size().gt(0), collection.aggregate_max("system:time_start"), ee.Number(NONE));
  const viirsSearch = viirs(ee, region, windows.viirsSearch);
  const s1 = (list, pass) => list.map((w) => sentinel1(ee, region, w, pass)).reduce((all, next) => all.merge(next)).size();
  const counts = ee.Dictionary({
    ...Object.fromEntries(ORBIT_PASSES.flatMap((pass) => [
      [`s1Month_${pass}`, s1([windows.month], pass)],
      [`s1MonthBase_${pass}`, s1(windows.radarBefore, pass)],
    ])),
    viirsMonth: viirs(ee, region, windows.month).size(),
    viirsLatest: latest(viirsSearch),
    firmsDamage: windows.damage ? firms(ee, region, windows.damage).size() : ee.Number(0),
    firmsNormal: firms(ee, region, windows.fireNormal).size(),
    firmsMonth: firms(ee, region, windows.month).size(),
    firmsMonthBase: windows.monthBaselines.map((w) => firms(ee, region, w)).reduce((all, next) => all.merge(next)).size(),
    // Within 300 km, like the distance; only needed inside a known war.
    firmsYear: windows.conflict ? firms(ee, bufferRegion, windows.lastYear).size() : ee.Number(0),
    worldPop: worldPop(ee, region).size(),
  });
  const raw = await evaluate(counts, { timeoutMs: 2 * 60 * 1000, what: "Checking which satellite images exist", context });
  return cleanCounts(raw);
}

// Can the service account read the chernozem asset, and does it have b1?
// Also reads the black-soil map's class list (once). Gives back
// { assetId|null, warning|null, source } (source: which soil map is used).
export async function checkChernozemAsset(ee, assetId) {
  await loadBlackSoilClasses(ee);
  const instead = { assetId: null, source: BLACK_SOIL_SOURCE };
  if (!assetId || /^(none|off|no)$/i.test(assetId)) return { ...instead, warning: null };
  try {
    const info = await getAsset(ee, assetId);
    const bands = (info?.bands || []).map((band) => band.id);
    if (bands.length && !bands.includes(BANDS.chernozemAsset)) {
      return { ...instead, warning: `The chernozem map ${assetId} has no band ${BANDS.chernozemAsset}; the ${lowerFirst(BLACK_SOIL_SOURCE)} was used instead.` };
    }
    return { assetId, warning: null, source: `Chernozem map: ${assetId} (band ${BANDS.chernozemAsset})` };
  } catch (error) {
    const reason = explainGeeError(error, { asset: assetId });
    return { ...instead, warning: `${reason.message} The ${lowerFirst(BLACK_SOIL_SOURCE)} was used instead.` };
  }
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// conflict: the known war covering the area ({ id, name, since }) or null;
// when it is not given it is looked up from the area's cells
// (server/conflicts.js).
async function analyze(deps, { area, cells, month, cellSizeDeg, onProgress, conflict: givenConflict } = {}) {
  if (!area?.bbox || !Array.isArray(cells) || !cells.length) throw new GeeError("bad_request", "Nothing to analyze: the area has no cells.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new GeeError("bad_request", `Not a month: ${month}`);
  if (!(Number(cellSizeDeg) > 0)) throw new GeeError("bad_request", `Not a cell size: ${cellSizeDeg}`);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = contextOf(cfg);
  const warnings = [];
  const bbox = area.bbox;
  // The Earth Engine region is built from the cells themselves (one box per
  // run of cells, split at the 180° line), not from the area's box: Russia's
  // or the USA's box spans the whole globe.
  const boxes = cellBoxes(cells, cellSizeDeg);
  const region = boxesGeometry(ee, boxes);
  const midLat = cellsMidLat(cells, bbox);
  const scale = reduceScale(cellSizeDeg, midLat);
  const tileScale = tileScaleFor(cellSizeDeg, midLat);
  const today = isoDay(deps.now());
  const conflict = cleanConflict(givenConflict !== undefined ? givenConflict : conflictForArea({ countryId: area.countryId, bbox, cells }));
  const shared = monthWindows(month, today, { lat: midLat, conflict });
  const chunkSize = chunkSizeFor(cellSizeDeg, midLat);
  let total = Math.ceil(cells.length / chunkSize) * 2 + 3;
  let done = 0;
  // onProgress gets the share done (0..1) and a short message.
  const step = (message) => onProgress?.(Math.min(1, done++ / total), message);
  if (shared.month.end < monthBounds(month).end) warnings.push(`${month} is not over yet; images up to ${shiftDays(today, -1)} were used.`);

  // 1. Each place's growing season, from its greenest month in 2019-2021
  // (MODIS NDVI over its cropland); cells with the same season are measured
  // together. Where the season is not clear, the latitude decides.
  step("Finding each place's growing season");
  const peaks = await seasonPeaks(ee, { cells, cellSizeDeg, scale, tileScale, chunkSize, state: deps.state, context }).catch((error) => {
    warnings.push(`The growing season could not be read from the satellite record (${error.message}); it was taken from the latitude.`);
    return new Map();
  });
  const groups = seasonGroups(cells, peaks).map((group) => {
    const groupBoxes = cellBoxes(group.cells, cellSizeDeg);
    return { ...group, region: boxesGeometry(ee, groupBoxes), windows: monthWindows(month, today, { lat: group.seasonLat, conflict, peakMonth: group.peakMonth }) };
  });
  total = groups.reduce((sum, group) => sum + Math.ceil(group.cells.length / chunkSize), 0) + Math.ceil(cells.length / chunkSize) + 3;

  // 2. What imagery is there, and can we read the chernozem map?
  step("Checking satellite images");
  const bufferRegion = boxesGeometry(ee, cellBoxes(cells, cellSizeDeg, MAX_CONFLICT_M / 1000));
  const [have, asset, ...groupHave] = await Promise.all([
    preflight(ee, { region, bufferRegion, windows: shared, context }),
    checkChernozemAsset(ee, cfg.chernozemAsset),
    ...groups.map((group) => seasonPreflight(ee, { region: group.region, windows: group.windows, context })),
  ]);
  if (asset.warning) warnings.push(asset.warning);

  // 3. Build the images (nothing is computed until a request below).
  const cropland = croplandImage(ee);
  const chernozem = chernozemImage(ee, asset.assetId);
  const fire = fireImages(ee, { region, windows: shared, have });

  // Distance to fighting: ACLED battles; else, inside a known war, unusual
  // fire detections; at peace, not measured (every cell reads 300 km and
  // nothing is set aside for it, which does not make the land safe).
  const acled = acledBattlesFor({ csvPath: cfg.acledCsvPath, bbox: boxesBbox(boxes), month });
  if (acled.warning) warnings.push(acled.warning);
  let conflictM = null;
  let accessSource = "none";
  if (acled.points.length) {
    const battles = ee.FeatureCollection(acled.points.map((point) => ee.Feature(ee.Geometry.Point(point))));
    conflictM = battles.distance(MAX_CONFLICT_M).unmask(MAX_CONFLICT_M).rename("conflictM");
    accessSource = "acled";
  } else if (!conflict) {
    // Fires in peaceful farm country (harvest burning, wildfires) are not
    // fighting, so nothing is estimated from them.
    warnings.push(NO_WAR_WARNING);
  } else if (have.firmsYear > 0) {
    warnings.push(`Distance to fighting is estimated from unusual fires of the last 12 months (far more than in ${BASELINE_FROM}-${BASELINE_YEAR}; no ACLED file), so treat safe access as rough.`);
    const fireBand = fightingFires(ee, bufferRegion, shared).rename("fire");
    const fires = fireBand.stratifiedSample({
      numPoints: 3000,
      classBand: "fire",
      region: bufferRegion,
      scale: 1000,
      // A fixed seed: the same fires give the same sample points every run.
      seed: 0,
      geometries: true,
      tileScale,
    });
    conflictM = fires.distance(MAX_CONFLICT_M).unmask(MAX_CONFLICT_M).rename("conflictM");
    accessSource = "fires";
  } else {
    warnings.push("No conflict data and no recent fires near this area; every cell counts as 300 km or more from fighting.");
    conflictM = ee.Image.constant(MAX_CONFLICT_M).rename("conflictM");
    accessSource = "fires";
  }

  let lights;
  if (have.viirsMonth > 0) {
    lights = viirs(ee, region, shared.month).median().rename("lights");
  } else if (have.viirsLatest !== null) {
    const latestWindow = daysBefore(have.viirsLatest, 30);
    lights = viirs(ee, region, latestWindow).median().rename("lights");
    warnings.push(`Night lights for ${month} are not published yet; the 30 days up to ${latestWindow.last} were used.`);
  } else {
    lights = emptyBand(ee, "lights");
    warnings.push("No night-light images were found for this area.");
  }

  // Radar alerts: this month against the same month of 2019-2021, one orbit
  // direction only (ascending and descending passes see the ground at
  // different angles, so mixing them reads as change).
  // The change common to the whole neighbourhood (an early or late harvest,
  // a wet or dry month: RADAR_SHIFT) is taken off first, so only patches
  // that changed more than their surroundings count.
  const monthPass = pickPass(have.s1Month, have.s1MonthBase);
  let radarShare;
  if (monthPass) {
    const change = sentinel1(ee, region, shared.month, monthPass)
      .median()
      .subtract(mergedSentinel1(ee, region, shared.radarBefore, monthPass).median())
      .rename("change");
    const aroundBoxes = cellBoxes(cells, cellSizeDeg, RADAR_SHIFT.aroundKm);
    const around = boxesGeometry(ee, aroundBoxes);
    // A pixel size fixed from the area (no "bestEffort", which picks its
    // own): the same area always gives the same shift.
    const shift = ee.Number(
      change.reduceRegion({ reducer: ee.Reducer.median(), geometry: around, scale: fixedScaleFor(aroundBoxes, RADAR_SHIFT.scale, RADAR_SHIFT.maxPixels), maxPixels: RADAR_SHIFT.maxPixels * 2, tileScale }).get("change", 0),
    );
    radarShare = change.subtract(shift).abs().gt(RADAR_CHANGE_DB).rename("radarShare");
  } else {
    radarShare = emptyBand(ee, "radarShare");
    warnings.push(`No Sentinel-1 radar images from one orbit direction for both ${month} and the same month of ${BASELINE_FROM}-${BASELINE_YEAR}; radar alerts are off.`);
  }

  const people = have.worldPop > 0 ? populationImages(ee, region) : null;
  if (!people) warnings.push("WorldPop has no population data for this area.");

  // The images that depend on the season: the health index (a diagnostic),
  // the season's radar change, and heavy damage from them and the fires.
  const seasonUsed = [];
  for (const [i, group] of groups.entries()) {
    const g = groupHave[i];
    const label = windowLabel(group.windows.season);
    seasonUsed.push({ label, from: group.windows.season.from, to: group.windows.season.to, cells: group.cells.length });
    let chiDrop;
    if (g.s2Current > 0 && g.s2Baseline > 0) {
      chiDrop = chiHealthImage(ee, group.region, group.windows.baselines).subtract(chiHealthImage(ee, group.region, group.windows.season)).rename("chiDrop");
    } else {
      chiDrop = emptyBand(ee, "chiDrop");
      warnings.push(`No usable Sentinel-2 images for ${g.s2Current > 0 ? `the same season of ${GEE_BASELINE.from}-${GEE_BASELINE.to}` : label}; the soil health index could not be measured there.`);
    }
    const seasonPass = pickPass(g.s1Season, g.s1SeasonBase);
    let radarDb;
    let heavy;
    if (seasonPass) {
      const now = sentinel1(ee, group.region, group.windows.season, seasonPass).median();
      const before = mergedSentinel1(ee, group.region, group.windows.baselines, seasonPass).median();
      // Open water in either season (a flooded field, a lake that rose) is
      // left out: water is radar-dark, so it reads as a huge change that is
      // not damage to the soil (real data: Lake Nakuru's shore, Kenya, 16 dB).
      const land = now.gt(WATER_VV_DB).and(before.gt(WATER_VV_DB));
      const change = now.subtract(before).abs().updateMask(land);
      radarDb = change.updateMask(cropland).rename("radarDb");
      // The paper's rule (method.js HEAVY_DAMAGE): strong radar change, or
      // clear radar change next to an unusual fire. No health index.
      // Where no known war covers the area, each piece of evidence alone
      // has an everyday cause: strong radar change is land-use change (a
      // new crop, ploughing, a meadow turned into a field, greenhouses),
      // and a 2 dB change next to a harvest fire is ordinary rotation. There
      // a pixel counts only with BOTH strong radar change and an unusual
      // fire within 1 km, the same rule as a field's damage
      // (src/lib/field/method.js damageDetected).
      const strong = change.gte(HEAVY_DAMAGE.radarDb);
      heavy = (conflict ? strong.or(change.gte(HEAVY_DAMAGE.radarWithFireDb).and(fire.near)) : strong.and(fire.near)).updateMask(cropland).rename("heavy");
    } else {
      radarDb = emptyBand(ee, "radarDb");
      heavy = emptyBand(ee, "heavy");
      warnings.push(`No Sentinel-1 radar images from one orbit direction for both ${label} and the same season of ${BASELINE_FROM}-${BASELINE_YEAR}; heavy damage could not be measured there.`);
    }
    group.meanImage = ee.Image.cat([
      chernozem.updateMask(cropland).rename("chernozemCrop"),
      chernozem.rename("chernozemAll"),
      cropland,
      chiDrop,
      radarDb,
      heavy,
      fire.excess,
      // Left out at peace: a missing distance reads as 300 km (toReading).
      ...(conflictM ? [conflictM] : []),
      lights,
      radarShare,
      fire.month,
    ]);
  }

  // 4. Reduce over the cells, group by group and chunk by chunk, two
  // requests at once. A chunk that runs out of memory or time is SPLIT in
  // two and each half measured again with the same pixels: a cell's reading
  // does not depend on which cells share its request, so the totals stay
  // the same. (Real data, Ukraine September 2026: the old coarser retry of
  // one group of 97 cells moved heavy damage by 61,517 ha, 4.7 %, between
  // two runs of the same code, and cropland by 113,000 ha.) Only a piece of
  // SPLIT_MIN_CELLS cells or fewer that still fails is measured with
  // coarser pixels, and the run says so.
  const means = new Map();
  const sums = new Map();
  let coarserCells = 0;
  let chunkCount = 0;
  const measure = (part, meanImage, plan) => {
    const squares = cellCollection(ee, part, cellSizeDeg);
    const regionArgs = (extra) => ({ collection: squares, tileScale: plan.tileScale, ...(deps.state.noMaxPixelsArg ? {} : { maxPixelsPerRegion: MAX_PIXELS_PER_CELL }), ...extra });
    // Sent as LISTS of features: real Earth Engine answers a FeatureCollection
    // nested inside a Dictionary with its description only, no features,
    // which made every cell read 0 (fake-ee.js does the same by default).
    const answer = {
      means: meanImage.reduceRegions(regionArgs({ reducer: ee.Reducer.mean(), scale: plan.scale, crs: "EPSG:4326" })).select([".*"], null, false).toList(part.length),
    };
    if (people) {
      const pop = populationPlan(cellSizeDeg, midLat, plan.scale);
      const sumReducer = ee.Reducer.sum().setOutputs(["people"]);
      answer.sums = (
        pop.native
          ? people.perPixel.reduceRegions(regionArgs({ reducer: sumReducer, crs: people.nativeProjection }))
          : people.density.reduceRegions(regionArgs({ reducer: sumReducer, scale: pop.scale, crs: "EPSG:4326" }))
      ).select([".*"], null, false).toList(part.length);
    }
    return ee.Dictionary(answer);
  };
  const featuresOf = (value) => (Array.isArray(value) ? value : value?.features || []);
  const keep = (result) => {
    for (const feature of featuresOf(result?.means)) if (feature?.properties) means.set(feature.properties.id, feature.properties);
    for (const feature of featuresOf(result?.sums)) if (feature?.properties) sums.set(feature.properties.id, feature.properties);
  };
  // One request for `part` with `plan`; a dropped connection is tried once
  // more as it is (retryTransient).
  const attempt = async (part, meanImage, plan) => {
    const label = `Measuring ${part.length} cells (${part[0].id} to ${part[part.length - 1].id}) of ${cells.length}`;
    for (;;) {
      try {
        return await retryTransient(() => evaluate(measure(part, meanImage, plan), { what: label, context }), deps.retryDelayMs);
      } catch (error) {
        // An older Earth Engine without maxPixelsPerRegion: drop it, try again.
        if (!deps.state.noMaxPixelsArg && isUnknownArgumentError(error, "maxPixelsPerRegion")) {
          deps.state.noMaxPixelsArg = true;
          continue;
        }
        throw error;
      }
    }
  };
  const measureSplitting = async (part, meanImage, plan) => {
    try {
      keep(await attempt(part, meanImage, plan));
    } catch (error) {
      if (!isTooMuchWorkError(error)) throw error;
      if (part.length > SPLIT_MIN_CELLS) {
        const half = Math.ceil(part.length / 2);
        const split = { scale: plan.scale, tileScale: 16 };
        await measureSplitting(part.slice(0, half), meanImage, split);
        await measureSplitting(part.slice(half), meanImage, split);
        return;
      }
      // The smallest piece still fails: coarser pixels (a second failure
      // stops the analysis).
      keep(await attempt(part, meanImage, { scale: coarserScale(plan.scale), tileScale: 16 }));
      coarserCells += part.length;
    }
  };
  const work = groups.flatMap((group) => chunk(group.cells, chunkSize).map((part) => ({ part, meanImage: group.meanImage })));
  chunkCount = work.length;
  let measured = 0;
  await mapLimit(work, MAX_PARALLEL_CHUNKS, async ({ part, meanImage }) => {
    await measureSplitting(part, meanImage, { scale, tileScale });
    measured += part.length;
    step(`Measured ${measured} of ${cells.length} cells`);
  });
  if (coarserCells) {
    warnings.push(`${coarserCells} of ${cells.length} cells were measured with coarser pixels (${coarserScale(scale)} m) because Earth Engine ran short of memory or time; totals can differ slightly from a run without this.`);
  }

  // 5. Place names (best effort: a failure only costs the names).
  step("Looking up place names");
  const names = await placeNames(ee, { region, cells, context }).catch((error) => {
    warnings.push(`Place names unavailable (${error.message}).`);
    return new Map();
  });

  // 6. Readings.
  const readings = [];
  let noHealth = 0;
  let noRadar = 0;
  for (const cell of cells) {
    const props = means.get(cell.id);
    // At peace without ACLED there is no distance band: 300 km everywhere.
    const reading = toReading(cell, props && !conflictM ? { ...props, conflictM: MAX_CONFLICT_M } : props, people ? sums.get(cell.id) : { people: 0 }, { cellSizeDeg, names: names.get(cell.id) });
    if (reading.chiDrop === null) noHealth += 1;
    if (reading.radarDb === null) noRadar += 1;
    readings.push(reading);
  }
  if (noRadar > 0 && noRadar < cells.length) {
    warnings.push(`${noRadar} of ${cells.length} cells had no radar reading on cropland; their damage uses fires only.`);
  }
  if (noHealth > 0 && noHealth < cells.length && groupHave.some((g) => g.s2Current > 0)) {
    warnings.push(`${noHealth} of ${cells.length} cells had no cloud-free Sentinel-2 view; the soil health index is missing there.`);
  }

  // 7. Alerts, with the day each one was last seen.
  step("Finding alerts");
  const candidates = cells.map((cell) => {
    const props = means.get(cell.id) || {};
    const areaKm2 = cellAreaKm2(cellSizeDeg, cell.lat);
    const n = names.get(cell.id) || {};
    return {
      id: cell.id,
      lat: cell.lat,
      lon: cell.lon,
      radarShare: numberOr(props.radarShare, 0),
      radarKm2: numberOr(props.radarShare, 0) * areaKm2,
      // Fires in the month above the same month's normal, for the whole cell
      // (FIRMS pixels are ~1 km², so mean × km² = detections), never below 0.
      fires: Math.max(0, numberOr(props.firesMonth, 0) * areaKm2),
      admin1: n.admin1,
      admin2: n.admin2,
    };
  });
  let alerts = pickAlerts(candidates, { cellSizeDeg, month });
  if (alerts.length) {
    alerts = await alertDates(ee, { alerts, cells, cellSizeDeg, region, windows: shared, month, scale, tileScale, context, hasFires: have.firmsMonth > 0, radarPass: monthPass }).catch((error) => {
      warnings.push(`Alert dates unavailable (${error.message}); the last day of the month is shown.`);
      return alerts;
    });
  }
  // A month that is not over yet: no alert dated after the last day with images.
  const lastImageDay = shared.month.end > shared.month.start ? shiftDays(shared.month.end, -1) : shared.month.start;
  alerts = alerts.map((alert) => (alert.date > lastImageDay ? { ...alert, date: lastImageDay } : alert));
  onProgress?.(1, "Done");
  // Damage is measured against the same season of 2019-2021 (see monthWindows).
  return { readings, alerts, warnings, baseline: GEE_BASELINE, conflict, imagery: imageryOf(seasonUsed, cells.length), accessSource };
}

// The imagery a run says it compared: the season used for most cells, with
// the others named in the label. -> { from, to, label }
export function imageryOf(seasons, cellCount) {
  if (!seasons.length) return null;
  const sorted = [...seasons].sort((a, b) => b.cells - a.cells);
  const main = sorted[0];
  const share = (s) => `${Math.round((100 * s.cells) / Math.max(1, cellCount))}%`;
  const label = sorted.length === 1 ? main.label : sorted.map((s) => `${s.label} (${share(s)} of the area)`).join("; ");
  return { from: main.from, to: main.to, label };
}

// The fire images of a month (FIRMS, 1 km), shared by every season group:
//   excess  detections in the damage window minus the normal years' rate
//           for that long, smoothed over FIRE_SMOOTH_M (the paper's 5 km)
//           and NOT clamped pixel by pixel, so the cell's mean is the
//           excess of the cell and its surroundings (clamped at 0 in
//           toReading): a pixel that burns now but not in 2019-2021 and one
//           nearby that burned then but not now cancel out, like rotating
//           stubble burning does, and one stray fire in a small cell does
//           not max out the indicator
//   near    1 within HEAVY_DAMAGE.fireNearM of an unusual fire: a pixel with
//           a detection in the damage window where the fire density
//           (smoothed over FIRE_SMOOTH_M) is above the normal years'
//   month   detections in the month minus the same month's mean in
//           2019-2021 (not clamped; alerts use the cell's total)
function fireImages(ee, { region, windows, have }) {
  const grid = (image) => image.setDefaultProjection("EPSG:4326", null, 1000);
  const count = (window) => grid(firms(ee, region, window).count().unmask(0));
  const zero = (name) => ee.Image.constant(0).rename(name);
  let excess = zero("firesExcess");
  let near = zero("fireNear");
  if (windows.damage && have.firmsDamage > 0) {
    const inWindow = count(windows.damage);
    const normal = have.firmsNormal > 0 ? count(windows.fireNormal).multiply(windows.fireNormalShare) : ee.Image.constant(0);
    const smooth = (image) => image.focal_mean(FIRE_SMOOTH_M, "circle", "meters");
    const smoothExcess = smooth(inWindow.subtract(normal));
    excess = smoothExcess.rename("firesExcess");
    const unusual = smoothExcess.gt(0);
    near = inWindow.gt(0).and(unusual).focal_max(HEAVY_DAMAGE.fireNearM, "circle", "meters").unmask(0).rename("fireNear");
  }
  let month = zero("firesMonth");
  if (have.firmsMonth > 0) {
    const now = count(windows.month);
    const before =
      have.firmsMonthBase > 0
        ? grid(windows.monthBaselines.map((w) => firms(ee, region, w)).reduce((all, next) => all.merge(next)).count().unmask(0)).divide(windows.monthBaselines.length)
        : ee.Image.constant(0);
    month = now.subtract(before).rename("firesMonth");
  }
  return { excess, near, month };
}

// Sentinel-1 over several windows, one collection.
function mergedSentinel1(ee, region, windows, pass) {
  return windows.map((window) => sentinel1(ee, region, window, pass)).reduce((all, next) => all.merge(next));
}

// The orbit direction to compare radar with: the one with the most passes
// in BOTH windows ({ ASCENDING, DESCENDING } counts each), or null when
// neither direction has passes in both.
export function pickPass(now = {}, before = {}) {
  let best = null;
  for (const pass of ORBIT_PASSES) {
    const a = Number(now?.[pass]) || 0;
    const b = Number(before?.[pass]) || 0;
    if (a <= 0 || b <= 0) continue;
    const score = Math.min(a, b) * 1e6 + a + b;
    if (!best || score > best.score) best = { pass, score };
  }
  return best ? best.pass : null;
}

// The images of one season group: Sentinel-2 and Sentinel-1 (each orbit
// direction) in the season and the same season of 2019-2021.
async function seasonPreflight(ee, { region, windows, context }) {
  const s1 = (list, pass) => list.map((w) => sentinel1(ee, region, w, pass)).reduce((all, next) => all.merge(next)).size();
  const counts = ee.Dictionary({
    s2Current: sentinel2(ee, region, windows.season).size(),
    s2Baseline: windows.baselines.map((w) => sentinel2(ee, region, w)).reduce((all, next) => all.merge(next)).size(),
    ...Object.fromEntries(ORBIT_PASSES.flatMap((pass) => [
      [`s1Season_${pass}`, s1([windows.season], pass)],
      [`s1SeasonBase_${pass}`, s1(windows.baselines, pass)],
    ])),
  });
  const raw = (await evaluate(counts, { timeoutMs: 2 * 60 * 1000, what: "Checking which satellite images exist for the season", context })) || {};
  const count = (key) => Math.max(0, numberOr(raw[key], 0));
  return {
    s2Current: count("s2Current"),
    s2Baseline: count("s2Baseline"),
    s1Season: Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`s1Season_${pass}`)])),
    s1SeasonBase: Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`s1SeasonBase_${pass}`)])),
  };
}

// The monthly NDVI climatology the season finder reads: 12 bands
// ndvi01..ndvi12, the mean MODIS NDVI of each calendar month in 2019-2021,
// over cropland only.
export function ndviClimatology(ee) {
  const ndvi = ee.ImageCollection(DATASETS.modisNdvi).filterDate(SEASON_FINDER.start, SEASON_FINDER.end).select(BANDS.modisNdvi);
  return ee.Image.cat(
    Array.from({ length: 12 }, (_, i) =>
      ndvi
        .filter(ee.Filter.calendarRange(i + 1, i + 1, "month"))
        .mean()
        .multiply(SEASON_FINDER.ndviScale)
        .rename(`ndvi${pad(i + 1)}`),
    ),
  ).updateMask(croplandImage(ee));
}

// The peak month (1-12) of the cropland greenness in a region (a farm, a
// search circle), or null when it is not clear or cannot be read. Used by
// the Field provider for its season windows (src/lib/season.js).
export async function peakMonthAt(ee, region, { context = {} } = {}) {
  try {
    const values = await evaluate(
      ndviClimatology(ee).reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 500, maxPixels: MAX_PIXELS_PER_CELL }),
      { timeoutMs: 60 * 1000, what: "Finding the growing season", context },
    );
    return peakMonthFrom(Array.from({ length: 12 }, (_, i) => numberOr(values?.[`ndvi${pad(i + 1)}`], null)));
  } catch {
    return null;
  }
}

// The peak month (1-12) of each cell's cropland greenness in 2019-2021, from
// MODIS NDVI (MOD13A2, 1 km, 16 days): the mean of each calendar month,
// then src/lib/season.js peakMonthFrom. -> Map(cell id -> month | null)
async function seasonPeaks(ee, { cells, cellSizeDeg, scale, tileScale, chunkSize, state, context }) {
  const monthly = ndviClimatology(ee);
  const peaks = new Map();
  const pixel = Math.max(SEASON_FINDER.minScale, Math.min(SEASON_FINDER.maxScale, scale));
  await mapLimit(chunk(cells, chunkSize), MAX_PARALLEL_CHUNKS, async (part) => {
    const squares = cellCollection(ee, part, cellSizeDeg);
    const args = { collection: squares, reducer: ee.Reducer.mean(), scale: pixel, crs: "EPSG:4326", tileScale, ...(state.noMaxPixelsArg ? {} : { maxPixelsPerRegion: MAX_PIXELS_PER_CELL }) };
    const result = await evaluate(monthly.reduceRegions(args).select([".*"], null, false).toList(part.length), { what: "Finding the growing season", context });
    for (const feature of Array.isArray(result) ? result : result?.features || []) {
      const p = feature?.properties || {};
      const values = Array.from({ length: 12 }, (_, i) => numberOr(p[`ndvi${pad(i + 1)}`], null));
      peaks.set(p.id, peakMonthFrom(values));
    }
  });
  return peaks;
}

// Cells as Earth Engine squares, each carrying its id.
function cellCollection(ee, cells, cellSizeDeg) {
  return ee.FeatureCollection(cells.map((cell) => ee.Feature(rect(ee, cellSquare(cell.lat, cell.lon, cellSizeDeg)), { id: cell.id })));
}

// admin1 / admin2 names for each cell centre, from FAO GAUL level 2.
async function placeNames(ee, { region, cells, context }) {
  const gaul2 = ee.FeatureCollection(DATASETS.gaul2).filterBounds(region);
  const join = ee.Join.saveFirst({ matchKey: "adm" });
  const touches = ee.Filter.intersects({ leftField: ".geo", rightField: ".geo", maxError: 100 });
  const names = new Map();
  for (const part of chunk(cells, 500)) {
    const points = ee.FeatureCollection(part.map((cell) => ee.Feature(ee.Geometry.Point([cell.lon, cell.lat]), { id: cell.id })));
    const joined = join.apply(points, gaul2, touches).map((feature) => {
      const adm = ee.Feature(feature.get("adm"));
      return ee.Feature(null, { id: feature.get("id"), admin1: adm.get("ADM1_NAME"), admin2: adm.get("ADM2_NAME") });
    });
    const result = await evaluate(joined, { timeoutMs: 2 * 60 * 1000, what: "Looking up place names", context });
    for (const feature of result?.features || []) {
      const p = feature.properties || {};
      names.set(p.id, { admin1: cleanName(p.admin1), admin2: cleanName(p.admin2) });
    }
  }
  return names;
}

// For each alert: the last radar pass over it and the last fire day in it.
async function alertDates(ee, { alerts, cells, cellSizeDeg, region, windows, month, scale, tileScale, context, hasFires, radarPass = null }) {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const s1Month = sentinel1(ee, region, windows.month, radarPass);
  const seeds = ee.FeatureCollection(
    alerts.map((alert) => {
      const cell = byId.get(alert.cellIds[0]);
      return ee.Feature(rect(ee, cellSquare(cell.lat, cell.lon, cellSizeDeg)), { aid: alert.id });
    }),
  );
  // No radar pass: NONE (-1), never null.
  const withRadar = seeds.map((feature) => {
    const passes = s1Month.filterBounds(feature.geometry());
    return feature.set("radarLast", ee.Algorithms.If(passes.size().gt(0), passes.aggregate_max("system:time_start"), ee.Number(NONE)));
  });
  // Day of the month of the last fire detection in each pixel.
  const fireDay = hasFires
    ? firms(ee, region, windows.month)
        .map((image) => ee.Image.constant(image.date().get("day")).toInt().updateMask(image.select(BANDS.firms).mask()).rename("day"))
        .max()
    : emptyBand(ee, "day");
  const result = await evaluate(
    fireDay
      .reduceRegions({ collection: withRadar, reducer: ee.Reducer.max().setOutputs(["fireDay"]), scale: Math.max(scale, 100), crs: "EPSG:4326", tileScale })
      .select([".*"], null, false),
    { timeoutMs: 2 * 60 * 1000, what: "Dating the alerts", context },
  );
  const found = new Map(
    (result?.features || []).map((feature) => {
      const p = feature.properties || {};
      return [p.aid, { radarLast: fromSentinel(p.radarLast), fireDay: fromSentinel(p.fireDay) }];
    }),
  );
  return alerts.map((alert) => ({ ...alert, date: alertDate(alert, found.get(alert.id), month) }));
}

// ---------- Regions (admin level 1) ----------

// Regions whose name contains the text. -> [{ id: "gaul1-1234", name, country }]
async function searchAdmin1(deps, q) {
  const text = String(q || "").trim();
  if (text.length < 2) return [];
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const variants = searchVariants(text);
  const filters = variants.map((variant) => ee.Filter.stringContains("ADM1_NAME", variant));
  const matches = ee
    .FeatureCollection(DATASETS.gaul1)
    .filter(filters.length === 1 ? filters[0] : ee.Filter.or(...filters))
    .limit(20)
    .select(["ADM0_NAME", "ADM1_NAME", "ADM1_CODE"], null, false);
  const result = await evaluate(matches, { timeoutMs: 60 * 1000, what: "Searching regions", context: contextOf(cfg) });
  return (result?.features || []).map((feature) => ({
    id: `gaul1-${feature.properties.ADM1_CODE}`,
    name: cleanName(feature.properties.ADM1_NAME),
    country: cleanName(feature.properties.ADM0_NAME),
  }));
}

// One region: { id, name, country, geometry } with the outline simplified
// to about 1 km (plenty for a planning map, and small to send). Names come
// back as lists (empty when there is no such region), so no null is needed.
async function admin1Details(deps, id) {
  const code = parseAdmin1Id(id);
  if (code === null) throw new GeeError("bad_request", `Not a region id: ${id}`);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const regions = ee.FeatureCollection(DATASETS.gaul1).filter(ee.Filter.eq("ADM1_CODE", code));
  const answer = ee.Dictionary({
    count: regions.size(),
    names: regions.aggregate_array("ADM1_NAME"),
    countries: regions.aggregate_array("ADM0_NAME"),
    geometry: regions.geometry().simplify(1000),
  });
  const result = await evaluate(answer, { timeoutMs: 2 * 60 * 1000, what: "Loading the region outline", context: contextOf(cfg) });
  const geometry = toPolygonal(result?.geometry);
  if (!result?.count || !geometry) throw new GeeError("not_found", `No region with id ${id}.`);
  return { id: `gaul1-${code}`, name: cleanName(result.names?.[0]), country: cleanName(result.countries?.[0]), geometry };
}

// For the gee:check script: the raw soil values at one point, to confirm
// the units (SoilGrids SOC 0-5 cm is expected around 300–500 dg/kg on
// Ukrainian chernozem) and the black-soil class there.
async function readPoint(deps, { lat, lon }) {
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const point = ee.Geometry.Point([lon, lat]);
  const { assetId, warning, source } = await checkChernozemAsset(ee, cfg.chernozemAsset);
  const bands = [
    ee.Image(DATASETS.soc).select(BANDS.soc).rename("socRaw"),
    ee.Image(DATASETS.blackSoil).select(BANDS.blackSoil).rename("greatGroup"),
    blackSoilImage(ee).rename("blackSoil"),
    ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).rename("worldCover"),
  ];
  if (assetId) bands.push(ee.Image(assetId).select(BANDS.chernozemAsset).rename("assetRaw"));
  const values = await evaluate(
    ee.Image.cat(bands).reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 250, maxPixels: MAX_PIXELS_PER_CELL }),
    { timeoutMs: 60 * 1000, what: "Reading soil values at the test point", context: contextOf(cfg) },
  );
  return { ...values, assetId, assetWarning: warning, soilSource: source };
}

// =====================================================================
// Plain helpers (no Earth Engine), tested in gee.test.js
// =====================================================================

const pad = (n) => String(n).padStart(2, "0");

// "2026-09" -> { start: "2026-09-01", end: "2026-10-01" } (end not included).
export function monthBounds(month) {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

// Every date window one month's analysis needs ({ start, end }, end not
// included, as Earth Engine's filterDate expects).
//   season     the last growing season that was COMPLETE by the end of the
//              month (src/lib/season.js lastCompleteSeason), with from / to
//              ("YYYY-MM") and its label: every month of one season compares
//              the same season, so an early or late spring is not damage.
//              By the place's peak month when known, else by latitude: north
//              April to September, south October to March (across the new
//              year), tropics the 12 whole months before the month
//   baselines  the same season in each normal year, 2019 to 2021 (a season
//              across the new year ENDS in each normal year); `baseline` is
//              the last of them
//   month      the month itself (alerts, night lights)
//   monthBaselines  the same month in 2019, 2020 and 2021 (fire alerts
//              compare the month with them), cut short like the month
//   radarBefore what radar alerts compare the month with: at peace the same
//              month of 2019-2021 (so harvest and tillage, which come every
//              year, cancel out); inside a known war the 3 months before (so
//              an alert is NEW change: against 2019-2021 a whole front reads
//              as changed every month)
//   damage     where damage is counted: from the day the known war began
//              (null for a month before it), else the two years up to the
//              end of the month (src/config/conflicts.js damageWindow)
//   fireNormal 2019-2021 (whole years), and fireNormalShare = the damage
//              window's length / fireNormal's length: the normal number of
//              fires in the damage window is fireNormal's count times it
//   lastYear   the 12 months up to the end of the month, and fireBaselines
//              the same 12 months of each baseline year (distance to
//              fighting, inside a known war only)
//   viirsSearch the 6 months up to the end of the month (night lights are
//              published with a delay)
//   conflict   the war used ({ id, name, since }) or null
// No window reaches past `today` ("YYYY-MM-DD", not included), so a month
// that is not over yet only asks for images that exist.
//   lat        the place's latitude (no latitude: the north's season)
//   peakMonth  the place's greenest month (1-12), when known
export function monthWindows(month, today = isoDay(new Date()), { lat, conflict = null, peakMonth = null } = {}) {
  const stop = (window) => clampWindow(window, today);
  const own = stop(monthBounds(month));
  // The season must be over by the end of the month AND by today.
  const asOf = lastDay(month) < today ? lastDay(month) : shiftDays(today, -1);
  const last = lastCompleteSeason(Number.isFinite(lat) ? lat : 50, asOf, peakMonth);
  const fullSeason = { start: last.start, end: last.end };
  const season = { ...stop(fullSeason), from: last.start.slice(0, 7), to: shiftDays(last.end, -1).slice(0, 7), label: last.label, peakMonth: last.peakMonth };
  const baselines = baselineWindows(fullSeason, BASELINE_YEARS);
  const war = cleanConflict(conflict);
  const counted = damageWindow(war, lastDay(month));
  const damage = counted.start < own.end ? stop({ start: counted.start, end: own.end }) : null;
  return {
    month: own,
    monthBaselines: BASELINE_YEARS.map((year) => sameWindowIn(own, year)),
    radarBefore: war ? [stop({ start: `${addMonths(month, -3)}-01`, end: monthBounds(month).start })] : BASELINE_YEARS.map((year) => sameWindowIn(own, year)),
    season,
    baseline: baselines[baselines.length - 1],
    baselines,
    damage,
    fireNormal: { ...FIRE_NORMAL },
    fireNormalShare: damage ? daysBetween(damage.start, damage.end) / daysBetween(FIRE_NORMAL.start, FIRE_NORMAL.end) : 0,
    conflict: war,
    lastYear: stop({ start: yearBefore(own.end), end: own.end }),
    fireBaselines: BASELINE_YEARS.map((year) => {
      const end = sameDayIn(year, own.end);
      return { start: yearBefore(end), end };
    }),
    viirsSearch: stop({ start: `${addMonths(month, -5)}-01`, end: own.end }),
  };
}

// ---------- Where the cells are ----------

// The boxes that cover some cells: one per run of neighbouring columns
// (a gap of more than two cells starts a new box), so an area across the
// 180° line (Russia, the USA, Fiji) becomes boxes on each side instead of a
// band around the globe. At most MAX_BOXES (the closest runs are joined).
//   padKm  grows each box by this much (for "within 300 km")
// -> [[west, south, east, north], ...]
export const MAX_BOXES = 8;
export function cellBoxes(cells, cellSizeDeg, padKm = 0) {
  const half = cellSizeDeg / 2;
  const sorted = [...cells].filter((cell) => Number.isFinite(cell.lat) && Number.isFinite(cell.lon)).sort((a, b) => a.lon - b.lon);
  if (!sorted.length) return [];
  let runs = [[sorted[0]]];
  for (const cell of sorted.slice(1)) {
    const run = runs[runs.length - 1];
    if (cell.lon - run[run.length - 1].lon > 2 * cellSizeDeg + 1e-9) runs.push([cell]);
    else run.push(cell);
  }
  const boxOf = (run) => [run[0].lon - half, Math.min(...run.map((c) => c.lat)) - half, run[run.length - 1].lon + half, Math.max(...run.map((c) => c.lat)) + half];
  let boxes = runs.map(boxOf);
  // Too many boxes (islands): join the two closest neighbours until few
  // enough (never across the gap that holds the 180° line: the largest).
  while (boxes.length > MAX_BOXES) {
    let best = 1;
    for (let i = 1; i < boxes.length; i += 1) if (boxes[i][0] - boxes[i - 1][2] < boxes[best][0] - boxes[best - 1][2]) best = i;
    const [a, b] = [boxes[best - 1], boxes[best]];
    boxes.splice(best - 1, 2, [a[0], Math.min(a[1], b[1]), b[2], Math.max(a[3], b[3])]);
  }
  const clampLon = (lon) => Math.min(180, Math.max(-180, lon));
  const clampLat = (lat) => Math.min(90, Math.max(-90, lat));
  return boxes.map((box) => {
    const [west, south, east, north] = padKm > 0 ? expandBbox(box, padKm) : box;
    return [clampLon(west), clampLat(south), clampLon(east), clampLat(north)].map((v) => Number(v.toFixed(7)));
  });
}

// A pixel size (m) for one reduction over some boxes: `minScale`, or
// coarser in steps of 100 m when the boxes hold more than `maxPixels`
// pixels at that size. Worked out here, not by Earth Engine's "bestEffort",
// so the same area always uses the same pixels.
export function fixedScaleFor(boxes, minScale, maxPixels) {
  const m2 = (boxes || []).reduce((sum, [w, south, e, n]) => sum + (e - w) * 111320 * Math.cos((((south + n) / 2) * Math.PI) / 180) * (n - south) * 110574, 0);
  if (!(m2 > 0) || !(maxPixels > 0)) return minScale;
  return Math.max(minScale, Math.ceil(Math.sqrt(m2 / maxPixels) / 100) * 100);
}

// Boxes as one Earth Engine geometry (planar, like the cells).
export function boxesGeometry(ee, boxes) {
  if (boxes.length === 1) return rect(ee, boxes[0]);
  const ring = ([w, s, e, n]) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  return ee.Geometry.MultiPolygon(boxes.map(ring), null, false);
}

// The box around some boxes ([west, south, east, north]).
export function boxesBbox(boxes) {
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

// The middle latitude of the cells (pixel sizes are worked out for it).
function cellsMidLat(cells, bbox) {
  const lats = cells.map((cell) => cell.lat).filter(Number.isFinite);
  if (!lats.length) return (bbox[1] + bbox[3]) / 2;
  return (Math.min(...lats) + Math.max(...lats)) / 2;
}

// Cells sorted into growing seasons. Each cell's season is its peak month
// (peaks: Map id -> 1..12 or null); without one, its latitude band's
// season (north = a July peak, south = a January peak, tropics = all year).
// The biggest seasons are kept (at most maxGroups, each with at least
// minShare of the cells); the cells of the others join the kept season
// whose peak is nearest in the year.
// -> [{ peakMonth (null: all year), seasonLat, cells }], biggest first
export function seasonGroups(cells, peaks = new Map(), { maxGroups = SEASON_FINDER.maxGroups, minShare = SEASON_FINDER.minShare } = {}) {
  const BAND_PEAK = { north: 7, south: 1, tropics: 0 }; // 0: all year
  const byKey = new Map();
  for (const cell of cells) {
    const peak = peaks.get(cell.id);
    const key = Number.isInteger(peak) && peak >= 1 && peak <= 12 ? peak : BAND_PEAK[climateBand(cell.lat)];
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(cell);
  }
  const sorted = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  const kept = sorted.filter(([, list], i) => i === 0 || (i < maxGroups && list.length >= minShare * cells.length)).map(([key, list]) => ({ key, cells: [...list] }));
  const distance = (a, b) => (a === 0 || b === 0 ? (a === b ? 0 : 3) : Math.min(Math.abs(a - b), 12 - Math.abs(a - b)));
  for (const [key, list] of sorted) {
    if (kept.some((group) => group.key === key)) continue;
    let target = kept[0];
    for (const group of kept) if (distance(key, group.key) < distance(key, target.key)) target = group;
    target.cells.push(...list);
  }
  return kept.map(({ key, cells: list }) => ({
    peakMonth: key || null,
    // "All year" needs a tropical latitude for season.js; a peak month does
    // not depend on the latitude.
    seasonLat: key ? list.reduce((sum, cell) => sum + cell.lat, 0) / list.length : 0,
    cells: list,
  }));
}

// Whole days from one "YYYY-MM-DD" to another.
export function daysBetween(start, end) {
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000));
}

// "2026-10-18" in another year ("2019-10-18"); 29 February becomes 1 March.
function sameDayIn(year, day) {
  const text = `${year}${day.slice(4)}`;
  return text.endsWith("-02-29") && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? `${year}-03-01` : text;
}

// The same day one year earlier.
function yearBefore(day) {
  return sameDayIn(Number(day.slice(0, 4)) - 1, day);
}

// Fire detections that are not normal for the place (FIGHTING_FIRES): 1 on
// 1 km pixels with an unusual fire in the last 12 months, masked elsewhere.
export function fightingFires(ee, region, windows) {
  const f = FIGHTING_FIRES;
  const count = (window) => firms(ee, region, window).count().unmask(0);
  const recent = count(windows.lastYear);
  const before = ee.ImageCollection(windows.fireBaselines.map(count)).mean();
  // On FIRMS's own 1 km grid (no resampling), so "per pixel" is per km².
  const density = (image) => image.setDefaultProjection("EPSG:4326", null, 1000).focal_mean(f.radiusM, "circle", "meters");
  const unusual = density(recent).gte(density(before).multiply(f.timesPrewar)).and(density(recent).gte(f.minPerKm2));
  return recent.gt(0).and(unusual).selfMask();
}

// A date window cut off at `today` (start and end never later than it).
export function clampWindow(window, today) {
  if (!today) return { ...window };
  const start = window.start > today ? today : window.start;
  const end = window.end > today ? today : window.end;
  return { ...window, start, end: end < start ? start : end };
}

// A Date -> "YYYY-MM-DD" (UTC, like Earth Engine's dates).
export function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// "2026-10-01" + -90 days -> "2026-07-03".
export function shiftDays(isoDay, days) {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The `days` days up to and including a timestamp's day.
export function daysBefore(timestampMs, days) {
  const last = new Date(timestampMs).toISOString().slice(0, 10);
  return { start: shiftDays(last, 1 - days), end: shiftDays(last, 1), last };
}

// The last day of a month: "2026-09" -> "2026-09-30".
export function lastDay(month) {
  return shiftDays(monthBounds(month).end, -1);
}

// Pixel size (m) for reducing over cells: about 20 pixels across a cell,
// never finer than 10 m (Sentinel-2) or coarser than 1 km.
export function reduceScale(cellSizeDeg, lat) {
  const cellMeters = cellSizeDeg * 111.32 * Math.cos((lat * Math.PI) / 180) * 1000;
  return Math.round(Math.min(1000, Math.max(10, cellMeters / 20)));
}

// Cell width in km at a latitude.
function cellWidthKm(cellSizeDeg, lat) {
  return cellSizeDeg * 111.32 * Math.cos((lat * Math.PI) / 180);
}

// How many cells go in one Earth Engine request: about CHUNK_AREA_KM2 of
// ground, never more than CHUNK_SIZE (250) cells or fewer than 10.
// Farm or town cells -> 250; Ukraine-size cells (0.25°) -> about 98.
export function chunkSizeFor(cellSizeDeg, lat) {
  const areaKm2 = cellAreaKm2(cellSizeDeg, lat);
  if (!(areaKm2 > 0)) return CHUNK_SIZE;
  return Math.max(MIN_CHUNK_SIZE, Math.min(CHUNK_SIZE, Math.floor(CHUNK_AREA_KM2 / areaKm2)));
}

// tileScale for a cell size: 4 normally (as in the deposit), 16 for cells
// BIG_CELL_KM wide or more (country-size areas), to stay inside memory.
export function tileScaleFor(cellSizeDeg, lat) {
  return cellWidthKm(cellSizeDeg, lat) >= BIG_CELL_KM ? 16 : 4;
}

// The pixel size for a retry after "out of memory" or "timed out": twice
// as coarse, at most 2 km.
export function coarserScale(scale) {
  return Math.min(2000, Math.round(scale * 2));
}

// How population is added up for cells of this size (see populationImages):
//   { native: true }            small cells (pixels of 100 m or finer):
//                               WorldPop's own pixels on its own grid
//   { native: false, scale }    bigger cells: density × pixel area, summed
//                               at max(100 m, the cells' pixel size)
// `scale` is the pixel size used for the other readings (it is coarser on
// a retry, which also makes population coarser).
export function populationPlan(cellSizeDeg, lat, scale = reduceScale(cellSizeDeg, lat)) {
  if (scale <= 100) return { native: true };
  return { native: false, scale: Math.max(100, scale) };
}

// Did Earth Engine stop because the work was too big (worth one more try
// with coarser pixels)? Looks at the raw message too, not just ours.
export function isTooMuchWorkError(error) {
  const texts = [error?.message, error?.cause?.message, typeof error === "string" ? error : ""].filter(Boolean).join(" ").toLowerCase();
  // "memory capacity exceeded": Earth Engine's own servers were full (real
  // data, Nakuru, Kenya, 2026-10-19, reading a field's history while other
  // requests ran); the retry with coarser pixels went through.
  if (/computation timed out|user memory limit exceeded|memory limit exceeded|memory capacity exceeded/.test(texts)) return true;
  return error instanceof GeeError && error.code === "timeout";
}

// Did the request fail on the way (a dropped connection, a busy server)
// rather than in the computation? Worth one more try of the same request
// after a pause. Real data, 2026-10-19: a Brazil box run failed after
// 321 s on "Server returned HTTP code: -1 for POST .../value:compute"
// while other runs were going; the same request passed on a retry.
export function isTransientError(error) {
  const texts = [error?.message, error?.cause?.message, typeof error === "string" ? error : ""].filter(Boolean).join(" ");
  return /HTTP code: -1\b|HTTP code: (429|5\d\d)\b|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|socket hang up|network error|fetch failed/i.test(texts);
}

// Runs `request` (a function giving a promise); on a transient failure
// waits `delayMs` and runs it once more.
export async function retryTransient(request, delayMs = TRANSIENT_RETRY_MS) {
  try {
    return await request();
  } catch (error) {
    if (!isTransientError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number.isFinite(delayMs) ? delayMs : TRANSIENT_RETRY_MS)));
    return request();
  }
}

// Did Earth Engine refuse an argument it does not know (older API)?
export function isUnknownArgumentError(error, name) {
  const texts = [error?.message, error?.cause?.message].filter(Boolean).join(" ");
  return /unrecognized argument|unknown argument|unexpected argument/i.test(texts) && texts.includes(name);
}

// A value that used NONE (-1) for "nothing found" -> the number, or null.
export function fromSentinel(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n !== NONE && n >= 0 ? n : null;
}

// The image counts from preflight() as plain numbers; viirsLatest is a
// timestamp or null.
export function cleanCounts(raw = {}) {
  const r = raw || {};
  const count = (key) => Math.max(0, numberOr(r[key], 0));
  const passes = (key) => Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`${key}_${pass}`)]));
  return {
    s1Month: passes("s1Month"),
    s1MonthBase: passes("s1MonthBase"),
    viirsMonth: count("viirsMonth"),
    viirsLatest: fromSentinel(r.viirsLatest),
    firmsDamage: count("firmsDamage"),
    firmsNormal: count("firmsNormal"),
    firmsMonth: count("firmsMonth"),
    firmsMonthBase: count("firmsMonthBase"),
    firmsYear: count("firmsYear"),
    worldPop: count("worldPop"),
  };
}

// The square of a cell: [west, south, east, north].
export function cellSquare(lat, lon, sizeDeg) {
  const half = sizeDeg / 2;
  const r = (value) => Number(value.toFixed(7));
  return [r(lon - half), r(lat - half), r(lon + half), r(lat + half)];
}

// The bounding box grown by `km` on every side (shared with acled.js).
export const expandBboxKm = expandBbox;

// [1..600] in pieces of 250 -> [[1..250], [251..500], [501..600]].
export function chunk(items, size) {
  const parts = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

// Runs `work` over items, at most `limit` at a time, in order of start.
export async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

// Gives up waiting after `ms` with a clear message.
export function withTimeout(promise, ms, what = "Earth Engine request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new GeeError("timeout", `${what} took longer than ${Math.round(ms / 1000)} seconds. Try a smaller area, or try again later.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function numberOr(value, fallback) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : fallback;
}
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)));

function cleanName(value) {
  const text = value == null ? "" : String(value).trim();
  // FAO GAUL uses "Administrative unit not available" for a missing name.
  if (!text || text === "null" || /^administrative unit not available$/i.test(text)) return undefined;
  return text;
}

// One cell's Earth Engine results -> the raw reading the runs expect.
//   means  { chernozemCrop, chernozemAll, cropland, chiDrop, radarDb, heavy,
//            firesExcess, conflictM, lights, ... } (means over the cell;
//            missing = no data; firesWar is the older name of firesExcess;
//            firesExcess is the cell's own excess, clamped at 0 here)
//   sums   { people } (people in the cell)
export function toReading(cell, means = {}, sums = {}, { cellSizeDeg, names } = {}) {
  const m = means || {};
  const areaKm2 = cellAreaKm2(cellSizeDeg, cell.lat);
  const population = Math.max(0, numberOr(sums?.people ?? sums?.sum, 0));
  const chiDrop = numberOr(m.chiDrop, null);
  const radarDb = numberOr(m.radarDb, null);
  // Chernozem on the cell's cropland; on its land when it has no cropland.
  const chernozem = numberOr(m.chernozemCrop, numberOr(m.chernozemAll, 0));
  const reading = {
    id: cell.id,
    chernozem: round(clamp01(chernozem), 4),
    croplandShare: round(clamp01(numberOr(m.cropland, 0)), 4),
    // FIRMS pixels are ~1 km², so the mean count per pixel is detections per km².
    firesPer100Km2: round(Math.max(0, numberOr(m.firesExcess, numberOr(m.firesWar, 0))) * 100, 2),
    chiDrop: chiDrop === null ? null : round(chiDrop, 4),
    // Mean radar change (dB) over the cell's cropland, last complete season
    // against the same season of 2019-2021 (null: no radar there).
    radarDb: radarDb === null ? null : round(Math.max(0, radarDb), 2),
    conflictKm: round(Math.max(0, numberOr(m.conflictM, MAX_CONFLICT_M)) / 1000, 2),
    popPerKm2: round(areaKm2 > 0 ? population / areaKm2 : 0, 2),
    lights: round(Math.max(0, numberOr(m.lights, 0)), 3),
    heavyShare: round(clamp01(numberOr(m.heavy, 0)), 4),
    population: Math.round(population),
  };
  if (names?.admin1) reading.admin1 = names.admin1;
  if (names?.admin2) reading.admin2 = names.admin2;
  return reading;
}

// "Kharkivs'ka" + "Chuhuivs'kyi" -> "Chuhuivs'kyi, Kharkivs'ka"; no names -> coordinates.
export function placeLabel({ admin1, admin2, lat, lon }) {
  const parts = [admin2, admin1].filter(Boolean);
  return parts.length ? parts.join(", ") : formatCoord(lat, lon);
}

// Picks at most `max` alerts from the cells' radar change and fires.
//   candidates [{ id, lat, lon, radarShare, radarKm2, fires, admin1?, admin2? }]
// A cell counts when at least 5% of it changed on radar (radar), or it had
// at least one fire detection (fire). Touching cells of the same kind join
// the strongest one, so one event is one alert. Radar and fire alerts take
// turns, strongest first, so both kinds are seen.
// In a large area (RADAR_ALERT.minCells cells or more with a radar reading)
// a cell must also have changed at least RADAR_ALERT.timesTypical times as
// much as the area's typical cell: a month's change that is everywhere (a
// harvest early or late across a whole region, a wet month) is not an
// event, and joining every touching cell of it gave alerts of 35,000 to
// 68,000 km² across Ukraine and of 320 km² in peaceful Iowa (real data,
// 2026-09). A group also stops RADAR_ALERT.reach cells from its strongest
// cell (with both rules, Ukraine 2026-09: 19,915 km² at most before the
// reach limit, 92,625 km² before either).
export function pickAlerts(candidates, { cellSizeDeg, month, max = 6, minRadarShare = 0.05, minFires = 1 } = {}) {
  const shares = candidates.map((c) => c.radarShare).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const typical = shares.length >= RADAR_ALERT.minCells ? shares[Math.floor(shares.length / 2)] : 0;
  const radarMin = Math.max(minRadarShare, RADAR_ALERT.timesTypical * typical);
  const near = (a, b) => Math.abs(a.lat - b.lat) <= cellSizeDeg * 1.01 && Math.abs(a.lon - b.lon) <= cellSizeDeg * 1.01;
  const groups = (kind, strength, keep) => {
    const pool = candidates.filter(keep).sort((a, b) => strength(b) - strength(a));
    const used = new Set();
    const out = [];
    for (const seed of pool) {
      if (used.has(seed.id)) continue;
      used.add(seed.id);
      const members = [seed];
      // Grow the group through touching cells, up to RADAR_ALERT.reach
      // cells from the seed.
      const inReach = (other) => Math.max(Math.abs(other.lat - seed.lat), Math.abs(other.lon - seed.lon)) <= cellSizeDeg * (RADAR_ALERT.reach + 0.01);
      for (let i = 0; i < members.length; i += 1) {
        for (const other of pool) {
          if (!used.has(other.id) && near(members[i], other) && inReach(other)) {
            used.add(other.id);
            members.push(other);
          }
        }
      }
      const magnitude = members.reduce((sum, member) => sum + strength(member), 0);
      out.push({
        id: `${kind}-${seed.id}`,
        kind,
        date: lastDay(month),
        lat: seed.lat,
        lon: seed.lon,
        place: placeLabel(seed),
        cellIds: members.map((member) => member.id),
        magnitude: kind === "radar" ? round(magnitude, 2) : Math.round(magnitude),
        unit: kind === "radar" ? "km² changed" : "detections",
      });
    }
    return out;
  };
  const radar = groups("radar", (c) => c.radarKm2, (c) => c.radarShare >= radarMin && c.radarKm2 > 0);
  const fire = groups("fire", (c) => c.fires, (c) => Math.round(c.fires) >= minFires);
  const alerts = [];
  for (let i = 0; alerts.length < max && (i < radar.length || i < fire.length); i += 1) {
    if (i < radar.length) alerts.push(radar[i]);
    if (i < fire.length && alerts.length < max) alerts.push(fire[i]);
  }
  return alerts;
}

// The day to show for an alert: the last radar pass or last fire day found
// in the month, else the month's last day.
export function alertDate(alert, found, month) {
  if (alert.kind === "radar" && Number.isFinite(found?.radarLast)) {
    const day = new Date(found.radarLast).toISOString().slice(0, 10);
    if (day.startsWith(month)) return day;
  }
  if (alert.kind === "fire" && Number.isFinite(found?.fireDay) && found.fireDay >= 1 && found.fireDay <= 31) {
    const day = `${month}-${pad(Math.round(found.fireDay))}`;
    if (day <= lastDay(month)) return day;
  }
  return lastDay(month);
}

// "gaul1-1234" or "1234" or 1234 -> 1234; anything else -> null.
export function parseAdmin1Id(id) {
  const match = String(id ?? "").match(/^(?:gaul1-)?(\d{1,9})$/);
  return match ? Number(match[1]) : null;
}

// Earth Engine's string match is case-sensitive, so a few spellings are
// tried: "kharkiv" -> ["kharkiv", "Kharkiv", "KHARKIV"].
export function searchVariants(text) {
  const lower = text.toLowerCase();
  const title = lower.replace(/(^|[\s'-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());
  return [...new Set([text, title, lower, text.toUpperCase()])];
}

// An outline from Earth Engine as a Polygon or MultiPolygon (a dissolved
// outline can come back as a GeometryCollection). Null when there is none.
export function toPolygonal(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry.coordinates?.length ? geometry : null;
  if (geometry.type === "GeometryCollection") {
    const coordinates = [];
    for (const part of geometry.geometries || []) {
      if (part.type === "Polygon") coordinates.push(part.coordinates);
      else if (part.type === "MultiPolygon") coordinates.push(...part.coordinates);
    }
    if (!coordinates.length) return null;
    return coordinates.length === 1 ? { type: "Polygon", coordinates: coordinates[0] } : { type: "MultiPolygon", coordinates };
  }
  return null;
}

// Turns an Earth Engine or Google sign-in error into one clear sentence
// that says what to do. Gives back a GeeError with a short `code`.
export function explainGeeError(error, { projectId, clientEmail, asset, what } = {}) {
  if (error instanceof GeeError) return error;
  const raw = (error && (error.message || String(error))) || "unknown error";
  const text = raw.toLowerCase();
  const project = projectId ? `"${projectId}"` : "your project";
  const account = clientEmail || "the service account";
  const prefix = what ? `${what}: ` : "";
  const make = (code, message) => new GeeError(code, message, error);

  if (/has not been used in project|service_disabled|api has not been used|it is disabled|is not enabled|enable it by visiting/.test(text)) {
    return make("api_disabled", `The Earth Engine API is not enabled in project ${project}. Enable it at https://console.cloud.google.com/apis/library/earthengine.googleapis.com${projectId ? `?project=${projectId}` : ""} and try again in a few minutes.`);
  }
  if (/not registered|not been registered|not signed up|register.*earth engine|earth engine.*register|unregistered|no project found|project.*not found.*earth engine/.test(text)) {
    return make("not_registered", `Project ${project} is not registered for Earth Engine. Register it at https://code.earthengine.google.com/register (pick the project, then choose noncommercial or commercial use).`);
  }
  if (/asset.*(not found|does not exist|cannot be found)|(not found|does not exist).*asset|image\.load|cannot find asset/.test(text) || (asset && text.includes(asset.toLowerCase()) && /not found|permission|denied|access/.test(text))) {
    return make("asset_not_found", `Asset not found: ${asset || "the chernozem map"} cannot be read by ${account}. Set GEE_CHERNOZEM_ASSET to an asset it can read (or share the asset with it).`);
  }
  if (/invalid_grant|invalid jwt|invalid_client|unauthorized_client|private key|pem|decoder routines|account not found|key.*(disabled|deleted|revoked)/.test(text)) {
    return make("bad_key", `Google rejected the service-account key for ${account}. Create a new JSON key (Google Cloud > IAM > Service accounts > Keys) and put it in .env.`);
  }
  if (/permission|forbidden|access denied|not authorized|unauthorized|\b403\b|does not have/.test(text)) {
    return make("no_permission", `The service account ${account} lacks permission in project ${project}. In Google Cloud > IAM, give it the roles "Earth Engine Resource Viewer" and "Service Usage Consumer", then wait a few minutes.`);
  }
  if (/quota|rate limit|too many requests|\b429\b|too many concurrent/.test(text)) {
    return make("quota", `${prefix}Earth Engine is limiting requests for project ${project}. Wait a few minutes and run the analysis again.`);
  }
  if (/user memory limit|memory limit exceeded|too many pixels|computation timed out|computed value is too large|too many elements|aggregation/.test(text)) {
    return make("too_big", `${prefix}Earth Engine could not finish this much work in one go. Try a smaller area, then run it again.`);
  }
  if (/timed out|timeout|deadline/.test(text)) {
    return make("timeout", `${prefix}Earth Engine did not answer in time. Try again, or use a smaller area.`);
  }
  if (/enotfound|econnrefused|econnreset|etimedout|eai_again|network|fetch failed|socket hang up|getaddrinfo/.test(text)) {
    return make("network", `${prefix}Could not reach Google Earth Engine. Check the internet connection and try again.`);
  }
  return make("gee_error", `${prefix}Earth Engine error: ${raw}`);
}
