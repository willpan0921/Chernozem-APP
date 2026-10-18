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
//                          -> { readings, alerts, warnings, baseline } (one reading per cell)
//   searchAdmin1(q)        regions (provinces, oblasts, states) by name
//   admin1Boundary(id)     one of those regions: { id, name, country, geometry }
//
// What each reading comes from (dataset ids are Earth Engine catalog ids):
//   chernozem      GEE_CHERNOZEM_ASSET band b1 / 89 (SoilGrids WRB Chernozem
//                  probability, the deposit's asset), and where that map has
//                  no data: OpenLandMap soil organic carbon (band b0), see SOC
//   croplandShare  ESA/WorldCover/v200, share of pixels with class 40 (cropland)
//   chiDrop        drop of the Chernozem Health Index (COPERNICUS/S2_SR_HARMONIZED,
//                  formula below) from the 2021 baseline to this year's season
//   heavyShare     share of cropland pixels whose drop is at least
//                  HEAVY_DAMAGE_CHI_DROP (method.js)
//   firesPer100Km2 FIRMS (band T21) detections since 24 Feb 2022, per 100 km²
//   conflictKm     distance to recent battles (ACLED file, acled.js), or to
//                  fire detections of the last 90 days when there is no file
//   population     WorldPop/GP/100m/pop (2020), people living in the cell
//   lights         NASA/VIIRS/002/VNP46A2 night lights, median of the month
//   admin1/admin2  FAO/GAUL/2015/level2 names (best effort)
// Alerts: Sentinel-1 radar change (COPERNICUS/S1_GRD, VV) and FIRMS fires
// in the month.
//
// Safety rules that keep a first real run from failing (each one is a
// problem Earth Engine really has):
//   - never a JavaScript null inside ee.Dictionary or ee.Algorithms.If:
//     "nothing found" is sent as -1 and turned back into null here
//   - cells are measured in chunks; big cells mean fewer cells per chunk
//     (see chunkSizeFor), at most 2 chunks at once, each with a time limit
//   - a chunk that runs out of memory or time is tried once more with
//     coarser pixels (see coarserScale) before giving up
//   - population is never re-projected over a whole country (see
//     populationPlan)
//   - date windows stop at today, so nothing asks for future images
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
import { addMonths, imageryWindow } from "../runs.js";
import { HEAVY_DAMAGE_CHI_DROP } from "../../src/lib/atlas/method.js";
import { acledBattlesFor, expandBbox } from "./acled.js";

// ---------- Fixed choices ----------

export const DATASETS = {
  sentinel2: "COPERNICUS/S2_SR_HARMONIZED",
  sentinel1: "COPERNICUS/S1_GRD",
  worldCover: "ESA/WorldCover/v200",
  soc: "OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02",
  firms: "FIRMS",
  viirs: "NASA/VIIRS/002/VNP46A2",
  worldPop: "WorldPop/GP/100m/pop",
  gaul1: "FAO/GAUL/2015/level1",
  gaul2: "FAO/GAUL/2015/level2",
};

export const BANDS = {
  chernozemAsset: "b1", // 0..89 in the deposit's asset, divided by 89 like the Colab notebook
  soc: "b0", // surface (0 cm) soil organic carbon
  worldCover: "Map",
  firms: "T21",
  viirs: "Gap_Filled_DNB_BRDF_Corrected_NTL",
  worldPop: "population",
  sentinel1: "VV",
};

// The research season: the 2021 growing season is the "before" picture.
export const BASELINE_YEAR = 2021;
export const GEE_BASELINE = { from: BASELINE_YEAR, to: BASELINE_YEAR, label: `${BASELINE_YEAR} (same months)` };
// Fire counting starts with the full-scale invasion, as in the deposit.
export const WAR_START = "2022-02-24";
// Sentinel-2 scenes cloudier than this are skipped (deposit: 55%).
export const MAX_CLOUD_PERCENT = 55;
// Distance to fighting is measured up to 300 km; farther counts as 300 km.
export const MAX_CONFLICT_M = 300000;
// A radar pixel "changed" when its VV backscatter moved by more than 2 dB.
export const RADAR_CHANGE_DB = 2;
// The most cells in one Earth Engine request (small cells), the fewest
// (huge cells), and roughly how much ground one request covers (km²).
// The deposit measured all of Ukraine (~600,000 km²) in one request at
// 1 km pixels; 50,000 km² per request leaves a wide safety margin.
export const CHUNK_SIZE = 250;
export const MIN_CHUNK_SIZE = 10;
export const CHUNK_AREA_KM2 = 50000;
// At most this many requests run at the same time.
export const MAX_PARALLEL_CHUNKS = 2;
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

// Soil organic carbon -> a 0..1 stand-in for chernozem, used only where
// the chernozem map has no data (outside Ukraine). OpenLandMap stores SOC
// in units of 5 g/kg, so g/kg = value × 5. The 0..1 scale is the one the
// research notebook uses for its soil score: (SOC g/kg − 10) / 50, so
// 10 g/kg or less (poor soil) -> 0, 60 g/kg or more -> 1, a typical
// chernozem topsoil (30–40 g/kg) -> about 0.4–0.6.
export const SOC = { unitGkg: 5, offsetGkg: 10, spanGkg: 50 };

// The same formula as plain arithmetic, for tests and the gee:check script.
export function socToChernozem(rawValue) {
  if (!Number.isFinite(rawValue)) return null;
  const gkg = rawValue * SOC.unitGkg;
  return Math.min(1, Math.max(0, (gkg - SOC.offsetGkg) / SOC.spanGkg));
}

// ---------- The provider ----------

// Makes a provider. The app uses the ready-made one below; tests pass
//   ee         a stand-in Earth Engine library (fake-ee.js)
//   getConfig  settings to use instead of .env
//   now        the clock, () => Date (so "today" can be fixed in tests)
// Anything else in `options` is ignored (providers/index.js passes the
// .env settings here).
export function createGeeProvider(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const injectedEe = opts.ee && typeof opts.ee === "object" && opts.ee.data ? opts.ee : null;
  const getConfig = typeof opts.getConfig === "function" ? opts.getConfig : config;
  const now = typeof opts.now === "function" ? opts.now : () => new Date();
  // The real library signs in once for the whole server; a stand-in gets its own state.
  const state = injectedEe ? newState(injectedEe) : sharedState();
  const deps = { getConfig, now, state, connect: (cfg = getConfig()) => connectWith(state, cfg) };
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

function contextOf(cfg) {
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
function evaluate(eeObject, { timeoutMs = CHUNK_TIMEOUT_MS, what = "Earth Engine request", context = {} } = {}) {
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

function sentinel2(ee, region, window) {
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
function chiHealthImage(ee, region, window) {
  const img = sentinel2(ee, region, window).map(maskSentinel2Clouds).median();
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

function sentinel1(ee, region, window) {
  return ee
    .ImageCollection(DATASETS.sentinel1)
    .filterBounds(region)
    .filterDate(window.start, window.end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .select(BANDS.sentinel1);
}

function firms(ee, region, window) {
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

// Chernozem 0..1: the chernozem asset where it has data, else soil organic
// carbon. Left masked over water so the mean is over land.
function chernozemImage(ee, assetId) {
  const soc = ee
    .Image(DATASETS.soc)
    .select(BANDS.soc)
    .multiply(SOC.unitGkg)
    .subtract(SOC.offsetGkg)
    .divide(SOC.spanGkg)
    .clamp(0, 1);
  if (!assetId) return soc.rename("chernozem");
  return ee
    .Image(assetId)
    .select(BANDS.chernozemAsset)
    .divide(89)
    .clamp(0, 1)
    .unmask(soc, false) // false: also fill where the asset has no pixels at all
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
  const counts = ee.Dictionary({
    s2Current: sentinel2(ee, region, windows.season).size(),
    s2Baseline: sentinel2(ee, region, windows.baseline).size(),
    s1Month: sentinel1(ee, region, windows.month).size(),
    s1Prior: sentinel1(ee, region, windows.s1Prior).size(),
    viirsMonth: viirs(ee, region, windows.month).size(),
    viirsLatest: latest(viirsSearch),
    firmsWar: windows.firmsWar ? firms(ee, region, windows.firmsWar).size() : ee.Number(0),
    firmsMonth: firms(ee, region, windows.month).size(),
    firms90: firms(ee, bufferRegion, windows.last90).size(), // within 300 km, like the distance
    worldPop: worldPop(ee, region).size(),
  });
  const raw = await evaluate(counts, { timeoutMs: 2 * 60 * 1000, what: "Checking which satellite images exist", context });
  return cleanCounts(raw);
}

// Can the service account read the chernozem asset, and does it have b1?
// Gives back { assetId|null, warning|null }.
async function checkChernozemAsset(ee, assetId) {
  if (!assetId || /^(none|off|no)$/i.test(assetId)) return { assetId: null, warning: null };
  try {
    const info = await getAsset(ee, assetId);
    const bands = (info?.bands || []).map((band) => band.id);
    if (bands.length && !bands.includes(BANDS.chernozemAsset)) {
      return { assetId: null, warning: `The chernozem map ${assetId} has no band ${BANDS.chernozemAsset}; soil organic carbon was used instead.` };
    }
    return { assetId, warning: null };
  } catch (error) {
    const reason = explainGeeError(error, { asset: assetId });
    return { assetId: null, warning: `${reason.message} Soil organic carbon was used instead.` };
  }
}

async function analyze(deps, { area, cells, month, cellSizeDeg, onProgress } = {}) {
  if (!area?.bbox || !Array.isArray(cells) || !cells.length) throw new GeeError("bad_request", "Nothing to analyze: the area has no cells.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new GeeError("bad_request", `Not a month: ${month}`);
  if (!(Number(cellSizeDeg) > 0)) throw new GeeError("bad_request", `Not a cell size: ${cellSizeDeg}`);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = contextOf(cfg);
  const warnings = [];
  const bbox = area.bbox;
  const region = rect(ee, bbox);
  const midLat = (bbox[1] + bbox[3]) / 2;
  const scale = reduceScale(cellSizeDeg, midLat);
  const tileScale = tileScaleFor(cellSizeDeg, midLat);
  const today = isoDay(deps.now());
  const windows = monthWindows(month, today);
  const chunks = chunk(cells, chunkSizeFor(cellSizeDeg, midLat));
  const total = chunks.length + 3;
  let done = 0;
  // onProgress gets the share done (0..1) and a short message.
  const step = (message) => onProgress?.(Math.min(1, done++ / total), message);
  if (windows.month.end < monthBounds(month).end) warnings.push(`${month} is not over yet; images up to ${shiftDays(today, -1)} were used.`);

  // 1. What imagery is there, and can we read the chernozem map?
  step("Checking satellite images");
  const bufferRegion = rect(ee, expandBboxKm(bbox, MAX_CONFLICT_M / 1000));
  const [have, asset] = await Promise.all([preflight(ee, { region, bufferRegion, windows, context }), checkChernozemAsset(ee, cfg.chernozemAsset)]);
  if (asset.warning) warnings.push(asset.warning);

  // 2. Build the images (nothing is computed until a request below).
  const cropland = croplandImage(ee);
  const chernozem = chernozemImage(ee, asset.assetId);

  let chiDrop;
  if (have.s2Current > 0 && have.s2Baseline > 0) {
    chiDrop = chiHealthImage(ee, region, windows.baseline).subtract(chiHealthImage(ee, region, windows.season)).rename("chiDrop");
  } else {
    chiDrop = emptyBand(ee, "chiDrop");
    warnings.push(`No usable Sentinel-2 images for ${have.s2Current > 0 ? "the 2021 baseline" : "this season"}; the soil health index could not be measured.`);
  }
  const heavy = chiDrop.gte(HEAVY_DAMAGE_CHI_DROP).updateMask(cropland).rename("heavy");

  const firesWar =
    windows.firmsWar && have.firmsWar > 0
      ? firms(ee, region, windows.firmsWar).count().unmask(0).rename("firesWar")
      : ee.Image.constant(0).rename("firesWar");

  // Distance to fighting: ACLED battles, else recent fire detections.
  const acled = acledBattlesFor({ csvPath: cfg.acledCsvPath, bbox, month });
  if (acled.warning) warnings.push(acled.warning);
  let conflictM;
  if (acled.points.length) {
    const battles = ee.FeatureCollection(acled.points.map((point) => ee.Feature(ee.Geometry.Point(point))));
    conflictM = battles.distance(MAX_CONFLICT_M).unmask(MAX_CONFLICT_M).rename("conflictM");
  } else if (have.firms90 > 0) {
    warnings.push("Distance to fighting is measured to fire detections of the last 90 days (no ACLED file). Fires include farm burning, so treat safe access as rough.");
    const fireBand = firms(ee, bufferRegion, windows.last90).count().gt(0).selfMask().rename("fire");
    const fires = fireBand.stratifiedSample({
      numPoints: 3000,
      classBand: "fire",
      region: bufferRegion,
      scale: 1000,
      geometries: true,
      tileScale,
    });
    conflictM = fires.distance(MAX_CONFLICT_M).unmask(MAX_CONFLICT_M).rename("conflictM");
  } else {
    warnings.push("No conflict data and no recent fires near this area; every cell counts as 300 km or more from fighting.");
    conflictM = ee.Image.constant(MAX_CONFLICT_M).rename("conflictM");
  }

  let lights;
  if (have.viirsMonth > 0) {
    lights = viirs(ee, region, windows.month).median().rename("lights");
  } else if (have.viirsLatest !== null) {
    const latestWindow = daysBefore(have.viirsLatest, 30);
    lights = viirs(ee, region, latestWindow).median().rename("lights");
    warnings.push(`Night lights for ${month} are not published yet; the 30 days up to ${latestWindow.last} were used.`);
  } else {
    lights = emptyBand(ee, "lights");
    warnings.push("No night-light images were found for this area.");
  }

  let radarShare;
  if (have.s1Month > 0 && have.s1Prior > 0) {
    radarShare = sentinel1(ee, region, windows.month)
      .median()
      .subtract(sentinel1(ee, region, windows.s1Prior).median())
      .abs()
      .gt(RADAR_CHANGE_DB)
      .rename("radarShare");
  } else {
    radarShare = emptyBand(ee, "radarShare");
    warnings.push("No Sentinel-1 radar images for this month; radar alerts are off.");
  }
  const firesMonth = have.firmsMonth > 0 ? firms(ee, region, windows.month).count().unmask(0).rename("firesMonth") : ee.Image.constant(0).rename("firesMonth");

  const meanImage = ee.Image.cat([
    chernozem.updateMask(cropland).rename("chernozemCrop"),
    chernozem.rename("chernozemAll"),
    cropland,
    chiDrop,
    heavy,
    firesWar,
    conflictM,
    lights,
    radarShare,
    firesMonth,
  ]);

  const people = have.worldPop > 0 ? populationImages(ee, region) : null;
  if (!people) warnings.push("WorldPop has no population data for this area.");

  // 3. Reduce over the cells, chunk by chunk, two requests at once. A chunk
  // that runs out of memory or time is tried once more, coarser.
  const means = new Map();
  const sums = new Map();
  let coarserChunks = 0;
  const measure = (part, plan) => {
    const squares = cellCollection(ee, part, cellSizeDeg);
    const regionArgs = (extra) => ({ collection: squares, tileScale: plan.tileScale, ...(deps.state.noMaxPixelsArg ? {} : { maxPixelsPerRegion: MAX_PIXELS_PER_CELL }), ...extra });
    const answer = {
      means: meanImage.reduceRegions(regionArgs({ reducer: ee.Reducer.mean(), scale: plan.scale, crs: "EPSG:4326" })).select([".*"], null, false),
    };
    if (people) {
      const pop = populationPlan(cellSizeDeg, midLat, plan.scale);
      const sumReducer = ee.Reducer.sum().setOutputs(["people"]);
      answer.sums = (
        pop.native
          ? people.perPixel.reduceRegions(regionArgs({ reducer: sumReducer, crs: people.nativeProjection }))
          : people.density.reduceRegions(regionArgs({ reducer: sumReducer, scale: pop.scale, crs: "EPSG:4326" }))
      ).select([".*"], null, false);
    }
    return ee.Dictionary(answer);
  };
  let measured = 0;
  await mapLimit(chunks, MAX_PARALLEL_CHUNKS, async (part) => {
    const label = `Measuring ${part.length} cells (${part[0].id} to ${part[part.length - 1].id}) of ${cells.length}`;
    let plan = { scale, tileScale };
    let retried = false;
    let result;
    for (;;) {
      try {
        result = await evaluate(measure(part, plan), { what: label, context });
        break;
      } catch (error) {
        // An older Earth Engine without maxPixelsPerRegion: drop it, try again.
        if (!deps.state.noMaxPixelsArg && isUnknownArgumentError(error, "maxPixelsPerRegion")) {
          deps.state.noMaxPixelsArg = true;
          continue;
        }
        if (!retried && isTooMuchWorkError(error)) {
          retried = true;
          plan = { scale: coarserScale(plan.scale), tileScale: 16 };
          continue;
        }
        throw error;
      }
    }
    if (retried) coarserChunks += 1;
    for (const feature of result?.means?.features || []) means.set(feature.properties.id, feature.properties);
    for (const feature of result?.sums?.features || []) sums.set(feature.properties.id, feature.properties);
    measured += part.length;
    step(`Measured ${measured} of ${cells.length} cells`);
  });
  if (coarserChunks) {
    warnings.push(`${coarserChunks} of ${chunks.length} groups of cells were measured with coarser pixels (${coarserScale(scale)} m) because Earth Engine ran short of memory or time.`);
  }

  // 4. Place names (best effort: a failure only costs the names).
  step("Looking up place names");
  const names = await placeNames(ee, { region, cells, context }).catch((error) => {
    warnings.push(`Place names unavailable (${error.message}).`);
    return new Map();
  });

  // 5. Readings.
  const readings = [];
  let noHealth = 0;
  for (const cell of cells) {
    const reading = toReading(cell, means.get(cell.id), people ? sums.get(cell.id) : { people: 0 }, { cellSizeDeg, names: names.get(cell.id) });
    if (reading.chiDrop === null) noHealth += 1;
    readings.push(reading);
  }
  if (noHealth > 0 && noHealth < cells.length && have.s2Current > 0) {
    warnings.push(`${noHealth} of ${cells.length} cells had no cloud-free Sentinel-2 view; their damage uses fires only.`);
  }

  // 6. Alerts, with the day each one was last seen.
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
      fires: numberOr(props.firesMonth, 0) * areaKm2, // FIRMS pixels are ~1 km², so mean × km² = detections
      admin1: n.admin1,
      admin2: n.admin2,
    };
  });
  let alerts = pickAlerts(candidates, { cellSizeDeg, month });
  if (alerts.length) {
    alerts = await alertDates(ee, { alerts, cells, cellSizeDeg, region, windows, month, scale, tileScale, context, hasFires: have.firmsMonth > 0 }).catch((error) => {
      warnings.push(`Alert dates unavailable (${error.message}); the last day of the month is shown.`);
      return alerts;
    });
  }
  // A month that is not over yet: no alert dated after the last day with images.
  const lastImageDay = windows.month.end > windows.month.start ? shiftDays(windows.month.end, -1) : windows.month.start;
  alerts = alerts.map((alert) => (alert.date > lastImageDay ? { ...alert, date: lastImageDay } : alert));
  onProgress?.(1, "Done");
  // Damage is measured against the same months of 2021 (see monthWindows).
  return { readings, alerts, warnings, baseline: GEE_BASELINE };
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
async function alertDates(ee, { alerts, cells, cellSizeDeg, region, windows, month, scale, tileScale, context, hasFires }) {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const s1Month = sentinel1(ee, region, windows.month);
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
// the units (SOC is expected around 4–8 on Ukrainian chernozem).
async function readPoint(deps, { lat, lon }) {
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const point = ee.Geometry.Point([lon, lat]);
  const { assetId, warning } = await checkChernozemAsset(ee, cfg.chernozemAsset);
  const bands = [ee.Image(DATASETS.soc).select(BANDS.soc).rename("socRaw"), ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).rename("worldCover")];
  if (assetId) bands.push(ee.Image(assetId).select(BANDS.chernozemAsset).rename("assetRaw"));
  const values = await evaluate(
    ee.Image.cat(bands).reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 250, bestEffort: true, maxPixels: MAX_PIXELS_PER_CELL }),
    { timeoutMs: 60 * 1000, what: "Reading soil values at the test point", context: contextOf(cfg) },
  );
  return { ...values, assetId, assetWarning: warning };
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
//   season     this year's growing season up to the month (Apr..month;
//              Nov–Mar use the last full Apr–Oct season), from runs.js
//   baseline   the same months of 2021, so April is compared with April
//              and a whole season with a whole season
//   month      the month itself (alerts, night lights)
//   s1Prior    the 3 months before it (radar "before" picture)
//   firmsWar   24 Feb 2022 to the end of the month (null before the war)
//   last90     the 90 days up to the end of the month
//   viirsSearch the 6 months up to the end of the month (night lights are
//              published with a delay)
// No window reaches past `today` ("YYYY-MM-DD", not included), so a month
// that is not over yet only asks for images that exist.
export function monthWindows(month, today = isoDay(new Date())) {
  const stop = (window) => clampWindow(window, today);
  const own = stop(monthBounds(month));
  const season = imageryWindow(month);
  const seasonEnd = stop({ start: `${season.from}-01`, end: `${addMonths(season.to, 1)}-01` });
  const seasonWindow = { ...seasonEnd, from: season.from, to: season.to };
  const shift = (ym) => `${BASELINE_YEAR}${ym.slice(4)}`;
  // When the season is cut short by today, the baseline stops on the same day of 2021.
  const fullSeasonEnd = `${addMonths(season.to, 1)}-01`;
  const baselineEnd = seasonEnd.end < fullSeasonEnd && seasonEnd.end > seasonEnd.start ? `${BASELINE_YEAR}${seasonEnd.end.slice(4)}` : `${addMonths(shift(season.to), 1)}-01`;
  const baseline = { start: `${shift(season.from)}-01`, end: baselineEnd };
  return {
    month: own,
    season: seasonWindow,
    baseline,
    s1Prior: stop({ start: `${addMonths(month, -3)}-01`, end: monthBounds(month).start }),
    firmsWar: own.end > WAR_START ? stop({ start: WAR_START, end: own.end }) : null,
    last90: stop({ start: shiftDays(own.end, -90), end: own.end }),
    viirsSearch: stop({ start: `${addMonths(month, -5)}-01`, end: own.end }),
  };
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
  if (/computation timed out|user memory limit exceeded|memory limit exceeded/.test(texts)) return true;
  return error instanceof GeeError && error.code === "timeout";
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
  return {
    s2Current: count("s2Current"),
    s2Baseline: count("s2Baseline"),
    s1Month: count("s1Month"),
    s1Prior: count("s1Prior"),
    viirsMonth: count("viirsMonth"),
    viirsLatest: fromSentinel(r.viirsLatest),
    firmsWar: count("firmsWar"),
    firmsMonth: count("firmsMonth"),
    firms90: count("firms90"),
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
  return text && text !== "null" ? text : undefined;
}

// One cell's Earth Engine results -> the raw reading the runs expect.
//   means  { chernozemCrop, chernozemAll, cropland, chiDrop, heavy, firesWar,
//            conflictM, lights, ... } (means over the cell; missing = no data)
//   sums   { people } (people in the cell)
export function toReading(cell, means = {}, sums = {}, { cellSizeDeg, names } = {}) {
  const m = means || {};
  const areaKm2 = cellAreaKm2(cellSizeDeg, cell.lat);
  const population = Math.max(0, numberOr(sums?.people ?? sums?.sum, 0));
  const chiDrop = numberOr(m.chiDrop, null);
  // Chernozem on the cell's cropland; on its land when it has no cropland.
  const chernozem = numberOr(m.chernozemCrop, numberOr(m.chernozemAll, 0));
  const reading = {
    id: cell.id,
    chernozem: round(clamp01(chernozem), 4),
    croplandShare: round(clamp01(numberOr(m.cropland, 0)), 4),
    // FIRMS pixels are ~1 km², so the mean count per pixel is detections per km².
    firesPer100Km2: round(Math.max(0, numberOr(m.firesWar, 0)) * 100, 2),
    chiDrop: chiDrop === null ? null : round(chiDrop, 4),
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
export function pickAlerts(candidates, { cellSizeDeg, month, max = 6, minRadarShare = 0.05, minFires = 1 } = {}) {
  const near = (a, b) => Math.abs(a.lat - b.lat) <= cellSizeDeg * 1.01 && Math.abs(a.lon - b.lon) <= cellSizeDeg * 1.01;
  const groups = (kind, strength, keep) => {
    const pool = candidates.filter(keep).sort((a, b) => strength(b) - strength(a));
    const used = new Set();
    const out = [];
    for (const seed of pool) {
      if (used.has(seed.id)) continue;
      used.add(seed.id);
      const members = [seed];
      // Grow the group through touching cells.
      for (let i = 0; i < members.length; i += 1) {
        for (const other of pool) {
          if (!used.has(other.id) && near(members[i], other)) {
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
  const radar = groups("radar", (c) => c.radarKm2, (c) => c.radarShare >= minRadarShare && c.radarKm2 > 0);
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
