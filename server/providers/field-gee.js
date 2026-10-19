// WHAT THIS FILE DOES
// The real data source for the Field product: Google Earth Engine. It finds
// the fields inside a farmer's land (or around a place), and measures every
// field from real satellite images: plant health (NDVI), water in the
// plants (NDWI), stress, the season curve for harvest readiness, war damage
// and soil.
//
//   status()                                  is Earth Engine set up and signed in?
//   detectFields({ boundary|null, center|null, radiusM, onProgress })
//                                             -> { candidates, warnings }
//   analyzeFields({ fields, today, onProgress })
//                                             -> { analyses: { [fieldId]: analysis }, warnings }
//   fieldHistory({ field, from: "2019-01", to }) -> [{ month, ndvi, ndwi, clearPct }]
//   geotiffUrl({ field, latestPassDate? })    -> { url, date, bands, name }
//                                             (an Earth Engine download link; when the
//                                             key may not make links, a data: URL of a
//                                             GeoTIFF written here from the same pixels)
//
// Every rule (what counts as clear, stressed, normal, damaged...) comes from
// src/lib/field/method.js, the same file the pages use. The route layer
// (server/field/analysis.js) applies the final rules again (status, harvest
// window with the weather), so the sample source and this one are judged
// the same way.
//
// HOW FIELDS ARE FOUND (detectFields)
//   1. Cropland = ESA/WorldCover/v200 band Map == 40.
//   2. NDVI and NDWI median composites (clear pixels only) for Apr-May,
//      Jun-Jul and Aug-Sep of the last complete season and the season before.
//   3. Field edges = Canny edges (ee.Algorithms.CannyEdgeDetector, see
//      DETECT for the threshold tuned on real images) of any band of any
//      composite. Roads, tree lines and the line between two crops all show
//      up as edges in some window.
//   4. Field interiors = cropland that is not an edge. Each connected blob is
//      one field (reduceToVectors, 4-connected, 10 m), grown by 10 m (the
//      edge pixels it lost), simplified to 10 m, kept from 1.5 ha up; inside
//      a boundary each is cut to the boundary. The 60 largest are kept.
//   5. The same trace with weaker edges (DETECT.fineCannyThreshold) splits a
//      parcel only into big pieces that cover most of it (two crops whose
//      line is soft), in the same request.
//
// HOW A FIELD IS MEASURED (analyzeFields, all fields of a farm in a few
// batched requests, never one request per field)
//   passes     every Sentinel-2 pass this season (COPERNICUS/S2_SR_HARMONIZED
//              linked to GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED band cs,
//              Danny's approach in scripts/fetch-ndvi.js; snow, which Cloud
//              Score+ calls clear, is removed too): field mean NDVI, NDWI and
//              clear share; one reading per day; a pass counts when at least
//              MIN_CLEAR_SHARE of the field was clear
//   latest     median of clear pixels over the last 30 days, or over the 30
//              days up to the latest clear pass when that is 30-90 days old
//   normal     the same calendar window (+-15 days) of 2019, 2020 and 2021:
//              per pixel the median of the three yearly composites; per field
//              the lowest / highest / middle of the three yearly field means
//   pixels     health, water, stress and condition per method.js, written as
//              Earth Engine image arithmetic
//   zones      the condition image sampled on a grid of at most 64 x 64 over
//              the field (sampleRectangle; outside the field = null)
//   patches    stressed pixels in blobs of 0.3 ha or more, top 3 per field
//   curve      half-month NDVI of 2019-2021 for the "season vs normal" chart
//   damage     radar change (COPERNICUS/S1_GRD VV, IW: the last Jun-Aug vs
//              Jun-Aug 2019-2021, compared with the field's own overall
//              change, see radarChangeImage), fire days (FIRMS T21) since
//              24 Feb 2022, and the drop of the Chernozem Health Index (same
//              formula as the Atlas, 2019-2021 seasons vs last season)
//   soil       mean chernozem probability: the Atlas soil map (gee.js
//              chernozemImage: the chernozem asset when set, else the
//              OpenLandMap black-soil share, else soil organic carbon)
//
// Safety rules (each one is a problem real Earth Engine has): no JavaScript
// null inside ee.Dictionary or ee.Algorithms.If; no date window past today;
// empty image collections are padded with one fully masked float image so a
// median never has zero bands (and all bands are cast to plain float so the
// padding merges); a FeatureCollection is never sent inside an ee.Dictionary
// (it would come back without its features) but as .toList(n); every request
// has a time limit, and one that runs out of memory or time is tried once
// more with coarser pixels.
//
// Tests: field-gee.test.js (against the stand-in fake-ee.js). Real Earth
// Engine needs the key in .env; see docs/CONNECT-DATA.md. First real run
// (2026-10-18, demo farm near Kupiansk): 7 fields measured in 4 requests,
// about 30 s; history since 2019 in about 6 s.
//
// WHO EDITS IT
// Whoever changes how fields are found or measured from satellite data. Keep
// the thresholds in src/lib/field/method.js, not here.

import { config } from "../env.js";
import { areaHa as geoAreaHa, bboxAreaKm2, bboxOf, FIELD_SEARCH_MAX_KM2, pointInGeometry, polygonsOf } from "../geo.js";
import { addMonths } from "../runs.js";
import {
  BASELINE,
  CLEAR_PIXEL_SCORE,
  MIN_CLEAR_SHARE,
  CONDITION_WEIGHTS,
  HEALTH_SPAN,
  WATER_SPAN,
  STRESS_RULES,
  RADAR_CHANGE_DB,
  healthScore,
  waterScore,
  conditionScore,
  conditionClass,
  versusNormal,
  stressLevel,
  harvestStage,
  damageDetected,
  damagedArea,
  soilTypeFor,
} from "../../src/lib/field/method.js";
import {
  DATASETS,
  BANDS,
  CROPLAND_CLASS,
  NONE,
  WAR_START,
  CHUNK_TIMEOUT_MS,
  GeeError,
  createGeeProvider,
  evaluate,
  contextOf,
  chiHealthImage,
  chernozemImage,
  checkChernozemAsset,
  sentinel1,
  sentinel2,
  firms,
  withTimeout,
  chunk,
  mapLimit,
  explainGeeError,
  isTooMuchWorkError,
  isoDay,
  shiftDays,
  clampWindow,
  toPolygonal,
} from "./gee.js";

// ---------- Fixed choices ----------

export const FIELD_DATASETS = {
  sentinel2: DATASETS.sentinel2, // COPERNICUS/S2_SR_HARMONIZED
  cloudScore: "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED",
  worldCover: DATASETS.worldCover, // ESA/WorldCover/v200
  sentinel1: DATASETS.sentinel1, // COPERNICUS/S1_GRD
  firms: DATASETS.firms, // FIRMS
};
export const CLOUD_SCORE_BAND = "cs";
export const SNOW_CLASS = 11; // Sentinel-2 scene classification (band SCL): snow or ice
export const SNOW_NDSI = 0.42; // (B3 - B11) / (B3 + B11) above this is snow (standard Sentinel-2 snow test)

// Field detection.
export const DETECT = {
  // Tuned on real data around the demo farm (49.73 N, 37.54 E, 2026-10-18):
  // mean IoU 0.85 against the 7 hand-drawn outlines. The first guess (NDVI
  // only, threshold 0.12, edges grown by a pixel) marked 86% of the land as
  // edge and found 2 slivers.
  cannyThreshold: 0.3,
  cannySigma: 1,
  // A second, finer trace (weaker edges) splits a traced parcel only when
  // it cuts it into big pieces (each splitMinHa or more, together at least
  // splitMinCover of it): a long soft line between two crops, not noise.
  // Real data, demo farm (2026-10-18): Field 7 and its northern neighbour
  // differ by only 0.15-0.19 NDVI, so at 0.3 they came out as one 90 ha
  // parcel (IoU 0.49); with the split, IoU 0.95 and no other field worse
  // (mean IoU 0.85 -> 0.92). Lowering the one threshold to 0.25 instead
  // shattered Field 6 (IoU 0.11).
  fineCannyThreshold: 0.25,
  splitMinHa: 10,
  splitMinCover: 0.8,
  edgeBands: ["ndvi", "ndwi"], // two crops at the same NDVI usually differ in NDWI
  // A pixel is an edge when it is a Canny edge in at least this many of the
  // six windows (1 = any window).
  minEdgeWindows: 1,
  edgeGrowM: 0, // grow the edges (m) before tracing; 0 = keep Canny's 1-pixel lines
  growBackM: 10, // grow each traced field by this much (it lost its edge pixels)
  simplifyM: 10,
  minHa: 1.5,
  maxFields: 60,
  maxAreaKm2: FIELD_SEARCH_MAX_KM2, // the largest boundary box searched in one go (geo.js)
  defaultRadiusM: 1200,
  minRadiusM: 300,
  maxRadiusM: 3000,
  // Around a point, fields are traced over a circle this much larger and
  // kept when they touch the real circle, so fields on its edge stay whole.
  pointPad: 1.5,
};

export const LATEST_DAYS = 30;
export const LOOKBACK_DAYS = 90;
export const NORMAL_HALF_WINDOW_DAYS = 15;
export const PATCH_MIN_HA = 0.3;
export const MAX_PATCHES = 3;
export const ZONES_MAX = 64;
// Fields measured in one request (passes: fields x passes stays far below
// Earth Engine's 5,000-element answer limit).
export const FIELDS_PER_REQUEST = 8;
export const HISTORY_FROM = "2019-01";
export const HISTORY_CHUNK_MONTHS = 30;
export const PARALLEL_REQUESTS = 2;
const BASELINE_YEARS = Array.from({ length: BASELINE.to - BASELINE.from + 1 }, (_, i) => BASELINE.from + i);
// Pixel plans: normal, then (after "out of memory" or "timed out") coarser.
const PLANS = [
  { scale: 10, tileScale: 4 },
  { scale: 20, tileScale: 16 },
];

// ---------- The provider ----------

// Makes the provider. The app uses the ready-made one below; tests pass
//   ee         a stand-in Earth Engine library (fake-ee.js)
//   getConfig  settings to use instead of .env
//   now        the clock, () => Date
// Without `ee` it shares the Atlas's Earth Engine sign-in.
export function createFieldGeeProvider(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const getConfig = typeof opts.getConfig === "function" ? opts.getConfig : config;
  const now = typeof opts.now === "function" ? opts.now : () => new Date();
  const base = createGeeProvider({ ee: opts.ee, getConfig, now });
  const deps = { getConfig, now, connect: base.connect };
  return {
    id: "gee",
    label: "Earth Engine",
    status: () => base.status(),
    detectFields: (input) => detectFields(deps, input),
    analyzeFields: (input) => analyzeFields(deps, input),
    fieldHistory: (input) => fieldHistory(deps, input),
    geotiffUrl: (input) => geotiffUrl(deps, input),
  };
}

export const fieldGeeProvider = createFieldGeeProvider();
export default fieldGeeProvider;

// ---------- Shared image helpers ----------

// Every Sentinel-2 pass over the region in the window, with Cloud Score+
// attached. Bands: ndvi and ndwi (cloudy pixels masked), clear (1 clear, 0
// cloudy or outside the picture, never masked).
export function clearCollection(ee, region, window) {
  return ee
    .ImageCollection(FIELD_DATASETS.sentinel2)
    .filterBounds(region)
    .filterDate(window.start, window.end)
    .linkCollection(ee.ImageCollection(FIELD_DATASETS.cloudScore), [CLOUD_SCORE_BAND])
    .map((image) => {
      // Clear = Cloud Score+ says clear AND it is not snow (scene class 11,
      // or a snow index NDSI above SNOW_NDSI): snow otherwise reads as
      // "very wet, no plants" and Cloud Score+ does not flag it.
      const notSnow = image.select("SCL").neq(SNOW_CLASS).and(image.normalizedDifference(["B3", "B11"]).lt(SNOW_NDSI));
      const clearPixel = image.select(CLOUD_SCORE_BAND).gte(CLEAR_PIXEL_SCORE).and(notSnow);
      const ndvi = image.normalizedDifference(["B8", "B4"]).rename("ndvi");
      const ndwi = image.normalizedDifference(["B8", "B11"]).rename("ndwi");
      // toFloat: the same plain type as the padding image, so collections merge.
      return ndvi
        .addBands(ndwi)
        .toFloat()
        .updateMask(clearPixel)
        .addBands(clearPixel.unmask(0).rename("clear"))
        .set("system:time_start", image.get("system:time_start"));
    });
}

// A fully masked image with these bands (pads collections that may be empty).
function blankImage(ee, bands) {
  return ee.Image.constant(bands.map(() => 0)).rename(bands).toFloat().updateMask(ee.Image.constant(0));
}

// Median of the clear pixels; always has the bands, masked where nothing was clear.
function composite(ee, collection, bands = ["ndvi", "ndwi"]) {
  return collection.select(bands).merge(ee.ImageCollection([blankImage(ee, bands)])).median();
}

// The per-pixel normal: the median of the three yearly composites, so each
// baseline year counts once. (A median of all their pixels together leaned
// to the year with the most clear passes: real data, demo Field 6, October
// 2026: a water score of 0.43 while its NDWI sat inside the normal range.)
function normalOfYears(ee, yearly) {
  return ee.ImageCollection(yearly).median();
}

function emptyBand(ee, name) {
  return ee.Image.constant(0).updateMask(ee.Image.constant(0)).rename(name);
}

function rect(ee, bbox) {
  return ee.Geometry.Rectangle(bbox, null, false);
}

function fieldCollection(ee, fields) {
  return ee.FeatureCollection(fields.map((field) => ee.Feature(ee.Geometry(field.geometry), { fid: field.id })));
}

// Pixel health, water, stress and condition (method.js as image arithmetic).
//   latest  this window's composite (ndvi, ndwi)
//   normal  the 2019-2021 composite of the same weeks (ndvi, ndwi)
// The field median NDVI (for "weaker than the rest of the field") is worked
// out per field inside Earth Engine and painted back as an image.
function conditionImages(ee, { latest, normal, fc, crs, plan }) {
  const ndvi = latest.select("ndvi");
  const ndwi = latest.select("ndwi");
  const normalNdvi = normal.select("ndvi");
  const normalNdwi = normal.select("ndwi");
  const fieldMedian = ndvi
    .reduceRegions({ collection: fc, reducer: ee.Reducer.median().setOutputs(["med"]), scale: plan.scale, crs, tileScale: plan.tileScale })
    .filter(ee.Filter.notNull(["med"]))
    .reduceToImage({ properties: ["med"], reducer: ee.Reducer.first() })
    .rename("fieldMedian");
  const health = ndvi.subtract(normalNdvi).divide(HEALTH_SPAN).add(1).clamp(0, 1).rename("health");
  const water = ndwi.subtract(normalNdwi).divide(WATER_SPAN).add(1).clamp(0, 1).rename("water");
  const stressed = ndvi
    .lt(fieldMedian.subtract(STRESS_RULES.belowFieldMedian))
    .and(ndvi.lt(normalNdvi.subtract(STRESS_RULES.belowNormal)))
    .rename("stressed");
  const w = CONDITION_WEIGHTS;
  const total = w.plantHealth + w.water + w.noStress;
  const condition = health
    .multiply(w.plantHealth)
    .add(water.multiply(w.water))
    .add(ee.Image(1).subtract(stressed).multiply(w.noStress))
    .divide(total)
    .rename("condition");
  return { health, water, stressed, condition };
}

// Runs one request, once more with coarser pixels if Earth Engine runs out
// of memory or time. `build(plan)` makes the Earth Engine object.
async function runWithRetry(build, { what, context, timeoutMs = CHUNK_TIMEOUT_MS }) {
  for (let i = 0; ; i += 1) {
    try {
      return await evaluate(build(PLANS[i]), { what, context, timeoutMs });
    } catch (error) {
      if (i + 1 < PLANS.length && isTooMuchWorkError(error)) continue;
      throw error;
    }
  }
}

// ---------- Finding fields ----------

async function detectFields(deps, input = {}) {
  const { boundary, center, radiusM } = detectInput(input);
  const onProgress = typeof input.onProgress === "function" ? input.onProgress : null;
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = contextOf(cfg);
  const today = isoDay(deps.now());
  const warnings = [];
  onProgress?.(0.05, "Reading satellite images");

  const anchor = boundary ? bboxCenter(bboxOf(boundary)) : center;
  const crs = utmCrs(anchor.lon, anchor.lat);
  let region;
  let keepWithin = null;
  if (boundary) {
    region = ee.Geometry(boundary);
  } else {
    const point = ee.Geometry.Point([center.lon, center.lat]);
    keepWithin = point.buffer(radiusM);
    region = point.buffer(radiusM * DETECT.pointPad);
  }

  const build = (plan) => {
    const pictures = detectionWindows(today).map((window) => composite(ee, clearCollection(ee, region, window), DETECT.edgeBands));
    const cropland = ee.ImageCollection(FIELD_DATASETS.worldCover).first().select(BANDS.worldCover).eq(CROPLAND_CLASS);
    const withArea = (feature) => feature.set("areaHa", feature.geometry().area(1).divide(1e4));
    // The parcels traced with Canny edges at `threshold`, of at least `minHa`.
    const trace = (threshold, minHa) => {
      const edgeImages = pictures.map((picture) =>
        ee.Algorithms.CannyEdgeDetector({ image: picture, threshold, sigma: DETECT.cannySigma }).neq(0).reduce(ee.Reducer.max()).unmask(0).rename("edge"),
      );
      let edges = ee.ImageCollection(edgeImages).sum().gte(DETECT.minEdgeWindows);
      if (DETECT.edgeGrowM > 0) edges = edges.focal_max(DETECT.edgeGrowM, "square", "meters");
      const interior = cropland.and(edges.not()).selfMask().toByte().rename("interior");
      let parcels = interior
        .reduceToVectors({
          geometry: region,
          crs,
          scale: plan.scale,
          geometryType: "polygon",
          eightConnected: false,
          labelProperty: "label",
          maxPixels: 1e10,
          bestEffort: true,
          tileScale: plan.tileScale,
        })
        .map((feature) => withArea((DETECT.growBackM > 0 ? feature.buffer(DETECT.growBackM, 1) : feature).simplify(DETECT.simplifyM)))
        .filter(ee.Filter.gte("areaHa", minHa));
      if (boundary) {
        parcels = parcels.map((feature) => withArea(feature.setGeometry(feature.geometry().intersection(region, 1)))).filter(ee.Filter.gte("areaHa", minHa));
      }
      return parcels;
    };
    const finish = (parcels, max) =>
      parcels
        .sort("areaHa", false)
        .limit(max)
        .map((feature) => feature.transform("EPSG:4326", 1))
        .select(["areaHa"])
        .toList(max);
    const coarse = trace(DETECT.cannyThreshold, DETECT.minHa);
    // The finer pieces are only used inside a kept parcel, so around a point
    // they are not cut down to the circle.
    const fine = trace(DETECT.fineCannyThreshold, DETECT.splitMinHa);
    return ee.Dictionary({
      coarse: finish(boundary ? coarse : coarse.filterBounds(keepWithin), DETECT.maxFields),
      fine: finish(fine, DETECT.maxFields * 3),
    });
  };

  onProgress?.(0.2, "Tracing field edges");
  const result = await runWithRetry(build, { what: "Finding fields", context });
  const candidates = toCandidates(featuresOf(result?.coarse), featuresOf(result?.fine));
  if (!candidates.length) warnings.push("No fields found here — try a larger area or draw your fields");
  onProgress?.(1, `Found ${candidates.length} field${candidates.length === 1 ? "" : "s"}`);
  return { candidates, warnings };
}

// ---------- Measuring fields ----------

async function analyzeFields(deps, input = {}) {
  const fields = fieldsInput(input.fields);
  const onProgress = typeof input.onProgress === "function" ? input.onProgress : null;
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = contextOf(cfg);
  const nowDay = isoDay(deps.now());
  const today = isDay(input.today) && input.today < nowDay ? input.today : nowDay;
  const warnings = [];
  const windows = analysisWindows(today);
  const farmBox = padBbox(unionBbox(fields.map((f) => f.bbox)), 0.002);
  const region = rect(ee, farmBox);
  const center = bboxCenter(farmBox);
  const crs = utmCrs(center.lon, center.lat);

  const passChunks = chunk(fields, FIELDS_PER_REQUEST);
  const total = 1 + passChunks.length + 2 * passChunks.length + 1;
  let done = 0;
  const step = (message) => onProgress?.(Math.min(0.99, done++ / total), message);

  // 1. Which images exist for the damage measures, and can we read the soil map?
  step("Checking satellite images");
  const counts = ee.Dictionary({
    chiBaseline: windows.chiBaseline.map((w) => sentinel2(ee, region, w)).reduce((all, next) => all.merge(next)).size(),
    chiSeason: sentinel2(ee, region, windows.chiSeason).size(),
    ...Object.fromEntries(windows.radarBaselines.map((window, i) => [`radarBaseline${i}`, sentinel1(ee, region, window).size()])),
    radarSeason: sentinel1(ee, region, windows.radarSeason).size(),
    firesWar: firms(ee, region, windows.firesWar).size(),
  });
  const [rawCounts, asset] = await Promise.all([
    evaluate(counts, { timeoutMs: 2 * 60 * 1000, what: "Checking satellite images", context }),
    checkChernozemAsset(ee, cfg.chernozemAsset),
  ]);
  const have = Object.fromEntries(Object.entries(rawCounts || {}).map(([key, value]) => [key, Math.max(0, numberOr(value, 0))]));
  if (asset.warning) warnings.push(asset.warning);
  have.radarBaselines = windows.radarBaselines.filter((_, i) => have[`radarBaseline${i}`] > 0);
  if (!(have.radarBaselines.length > 0 && have.radarSeason > 0)) warnings.push("No Sentinel-1 radar images for the summers compared; radar damage was not measured.");
  if (!(have.chiBaseline > 0 && have.chiSeason > 0)) warnings.push(`Too few clear Sentinel-2 images for ${BASELINE.label} or the last season; the soil health index was not measured.`);

  // 2. Every satellite pass this season, per field.
  const passesById = new Map(fields.map((f) => [f.id, []]));
  await mapLimit(passChunks, PARALLEL_REQUESTS, async (part) => {
    const build = (plan) => {
      const fc = fieldCollection(ee, part);
      return clearCollection(ee, region, windows.passes)
        .map((image) =>
          image
            .select(["ndvi", "ndwi", "clear"])
            .reduceRegions({ collection: fc, reducer: ee.Reducer.mean(), scale: plan.scale, crs, tileScale: plan.tileScale })
            .map((feature) => feature.set("date", image.date().format("YYYY-MM-dd"))),
        )
        .flatten()
        .filter(ee.Filter.gt("clear", 0))
        .select([".*"], null, false);
    };
    const result = await runWithRetry(build, { what: `Reading satellite passes for ${part.length} field${part.length === 1 ? "" : "s"}`, context });
    for (const feature of result?.features || []) {
      const p = feature.properties || {};
      if (passesById.has(p.fid) && isDay(p.date)) passesById.get(p.fid).push(p);
    }
    step("Reading satellite passes");
  });

  // Per field: one reading per day, its clear passes and its latest window.
  const plans = fields.map((field) => fieldPlan(field, passesById.get(field.id), { today, windows }));

  // 3. Measure, per group of fields that share a latest window.
  const groups = new Map();
  for (const plan of plans) {
    const key = `${plan.latestWindow.start}|${plan.latestWindow.end}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(plan);
  }
  const jobs = [];
  for (const group of groups.values()) for (const part of chunk(group, FIELDS_PER_REQUEST)) jobs.push(part);
  const measured = new Map();
  const zonesById = new Map();
  const shared = { ee, region, crs, windows, have, assetId: asset.assetId };
  const tasks = jobs.flatMap((part) => [
    { kind: "stats", part },
    { kind: "zones", part },
  ]);
  await mapLimit(tasks, PARALLEL_REQUESTS, async ({ kind, part }) => {
    const names = `${part.length} field${part.length === 1 ? "" : "s"}`;
    if (kind === "stats") {
      const result = await runWithRetry((plan) => statsRequest(shared, part, plan), { what: `Measuring ${names}`, context });
      for (const [id, value] of Object.entries(readStats(result, part))) measured.set(id, value);
      step("Measuring fields");
    } else {
      const result = await runWithRetry((plan) => zonesRequest(shared, part, plan), { what: `Mapping the condition of ${names}`, context });
      for (const field of part) zonesById.set(field.id, readZones(result?.[field.id], field.grid));
      step("Mapping field condition");
    }
  });

  // 4. The analyses.
  const updatedAt = new Date(deps.now()).toISOString();
  const analyses = {};
  for (const plan of plans) {
    analyses[plan.id] = buildAnalysis(plan, measured.get(plan.id) || {}, zonesById.get(plan.id) || emptyZones(plan.grid), { today, updatedAt });
  }
  onProgress?.(1, "Done");
  return { analyses, warnings };
}

// The stats request for one group of fields: per-field numbers, stress
// patches and the normal curve, as one ee.Dictionary.
function statsRequest({ ee, region, crs, windows, have, assetId }, part, plan) {
  const fc = fieldCollection(ee, part);
  const latestWindow = part[0].latestWindow;
  const latest = composite(ee, clearCollection(ee, region, latestWindow));
  const yearlyCollections = BASELINE_YEARS.map((year) => clearCollection(ee, region, normalWindow(latestWindow, year)));
  const yearly = yearlyCollections.map((collection) => composite(ee, collection));
  const normal = normalOfYears(ee, yearly);
  const images = conditionImages(ee, { latest, normal, fc, crs, plan });

  const radarChanged =
    have.radarBaselines.length > 0 && have.radarSeason > 0 ? radarChangeImage(ee, { region, windows, baselines: have.radarBaselines, fc, crs, plan }) : emptyBand(ee, "radarChanged");
  const chiDrop =
    have.chiBaseline > 0 && have.chiSeason > 0
      ? chiHealthImage(ee, region, windows.chiBaseline).subtract(chiHealthImage(ee, region, windows.chiSeason)).rename("chiDrop")
      : emptyBand(ee, "chiDrop");
  const fireDays = have.firesWar > 0 ? firms(ee, region, windows.firesWar).count().unmask(0).rename("fires") : ee.Image.constant(0).rename("fires");

  const meanBands = [
    ...yearly.flatMap((image, i) => [image.select("ndvi").rename(`n${BASELINE_YEARS[i]}_ndvi`), image.select("ndwi").rename(`n${BASELINE_YEARS[i]}_ndwi`)]),
    images.stressed,
    radarChanged,
    chiDrop,
    chernozemImage(ee, assetId).rename("chernozem"),
  ];
  const reduce = (image, reducer, scale = plan.scale) =>
    image.reduceRegions({ collection: fc, reducer, scale, crs, tileScale: plan.tileScale }).select([".*"], null, false);

  // Half-month NDVI of each baseline year (24 bands per year).
  const curveBands = BASELINE_YEARS.flatMap((year) => {
    const yearCollection = clearCollection(ee, region, { start: `${year - 1}-12-20`, end: `${year + 1}-01-12` });
    return CURVE_DAYS.map((day, i) => {
      const w = curveWindow(year, day);
      return composite(ee, yearCollection.filterDate(w.start, w.end), ["ndvi"]).rename(curveBand(year, i));
    });
  });

  // Stressed blobs of PATCH_MIN_HA or more, outlined.
  const minPixels = Math.max(2, Math.ceil((PATCH_MIN_HA * 1e4) / (plan.scale * plan.scale)));
  const stressedOnly = images.stressed.selfMask();
  const patches = stressedOnly
    .updateMask(stressedOnly.connectedPixelCount(Math.max(100, minPixels + 1), true).gte(minPixels))
    .toByte()
    .rename("patch")
    .reduceToVectors({
      geometry: fc.geometry(),
      crs,
      scale: plan.scale,
      geometryType: "polygon",
      eightConnected: true,
      labelProperty: "label",
      maxPixels: 1e9,
      bestEffort: true,
      tileScale: plan.tileScale,
    })
    .map((feature) => {
      const shape = feature.geometry();
      return ee.Feature(null, { areaHa: shape.area(1).divide(1e4), centroid: shape.centroid(1).coordinates(), bounds: shape.bounds(1).coordinates() });
    })
    .filter(ee.Filter.gte("areaHa", PATCH_MIN_HA))
    .sort("areaHa", false)
    .limit(MAX_PATCHES * part.length * 3);

  // .toList: a FeatureCollection nested inside an ee.Dictionary comes back
  // from real Earth Engine WITHOUT its features (only a description), so
  // each one is sent as a list of features.
  const asList = (collection, max = part.length) => collection.toList(max);
  return ee.Dictionary({
    // The field's scores are the medians of the per-pixel scores (the same
    // pixels the zone map shows), not scores of the field-median NDVI.
    medians: asList(reduce(ee.Image.cat([latest, images.health, images.water, images.condition]), ee.Reducer.median())),
    means: asList(reduce(ee.Image.cat(meanBands), ee.Reducer.mean())),
    fires: asList(reduce(fireDays, ee.Reducer.max().setOutputs(["fires"]), Math.max(100, plan.scale))),
    curve: asList(reduce(ee.Image.cat(curveBands), ee.Reducer.mean(), Math.max(20, plan.scale))),
    patches: asList(patches, MAX_PATCHES * part.length * 3),
  });
}

// Radar change that marks cratering or compaction: last summer's VV median
// against the per-pixel median of the 2019-2021 summers, MINUS the field's
// own median change. Crop rotation and soil moisture shift a whole field by
// 3-6 dB from one summer to the next (real data, demo farm: 61-97% of each
// field "changed" by 3 dB between 2021 and 2019-2020, before the war); craters,
// trenches and burnt patches change parts of a field. A pixel counts when
// its change differs from the field's by RADAR_CHANGE_DB or more.
function radarChangeImage(ee, { region, windows, baselines, fc, crs, plan }) {
  const before = ee.ImageCollection(baselines.map((window) => sentinel1(ee, region, window).median().rename("VV"))).median();
  const change = sentinel1(ee, region, windows.radarSeason).median().subtract(before).rename("change");
  const fieldShift = change
    .reduceRegions({ collection: fc, reducer: ee.Reducer.median().setOutputs(["shift"]), scale: plan.scale, crs, tileScale: plan.tileScale })
    .filter(ee.Filter.notNull(["shift"]))
    .reduceToImage({ properties: ["shift"], reducer: ee.Reducer.first() });
  return change.subtract(fieldShift).abs().gte(RADAR_CHANGE_DB).rename("radarChanged");
}

// The zones request: the condition image on each field's grid.
function zonesRequest({ ee, region, crs }, part, plan) {
  const fc = fieldCollection(ee, part);
  const latestWindow = part[0].latestWindow;
  const latest = composite(ee, clearCollection(ee, region, latestWindow));
  const normal = normalOfYears(ee, BASELINE_YEARS.map((year) => composite(ee, clearCollection(ee, region, normalWindow(latestWindow, year)))));
  const { condition } = conditionImages(ee, { latest, normal, fc, crs, plan });
  const grids = {};
  for (const field of part) {
    const grid = field.grid;
    grids[field.id] = condition
      .clip(ee.Geometry(field.geometry))
      .reproject({ crs, scale: plan.scale })
      .reduceResolution({ reducer: ee.Reducer.mean(), bestEffort: true, maxPixels: 1024 })
      .reproject({ crs: "EPSG:4326", crsTransform: grid.transform })
      .toFloat() // a plain float band accepts the -1 "outside" value
      .sampleRectangle({ region: ee.Geometry.Rectangle(grid.inner, "EPSG:4326", false), defaultValue: NONE });
  }
  return ee.Dictionary(grids);
}

// ---------- History ----------

async function fieldHistory(deps, { field, from = HISTORY_FROM, to } = {}) {
  const [one] = fieldsInput([field]);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = contextOf(cfg);
  const today = isoDay(deps.now());
  const thisMonth = today.slice(0, 7);
  const first = isMonth(from) ? (from < HISTORY_FROM ? HISTORY_FROM : from) : HISTORY_FROM;
  const last = isMonth(to) && to < thisMonth ? to : thisMonth;
  const months = monthRange(first, last);
  if (!months.length) return [];
  const center = bboxCenter(one.bbox);
  const crs = utmCrs(center.lon, center.lat);
  const region = rect(ee, padBbox(one.bbox, 0.001));
  const parts = chunk(months, HISTORY_CHUNK_MONTHS);
  const results = await mapLimit(parts, PARALLEL_REQUESTS, (part) =>
    runWithRetry(
      (plan) => {
        const shape = ee.Geometry(one.geometry);
        return ee.FeatureCollection(
          part.map((month) => {
            const window = clampWindow({ start: `${month}-01`, end: `${addMonths(month, 1)}-01` }, today);
            const passes = clearCollection(ee, region, window);
            const seen = passes.select(["ndvi"]).merge(ee.ImageCollection([blankImage(ee, ["ndvi"])])).count().gt(0).unmask(0).rename("clear");
            const values = ee.Image.cat([composite(ee, passes), seen]).reduceRegion({
              reducer: ee.Reducer.mean(),
              geometry: shape,
              scale: plan.scale,
              crs,
              maxPixels: 1e9,
              bestEffort: true,
              tileScale: plan.tileScale,
            });
            return ee.Feature(null, values).set("month", month);
          }),
        );
      },
      { what: `Reading the history ${part[0]} to ${part[part.length - 1]}`, context },
    ),
  );
  const byMonth = new Map();
  for (const result of results) for (const feature of result?.features || []) byMonth.set(feature.properties?.month, feature.properties);
  return months.map((month) => {
    const p = byMonth.get(month) || {};
    const clear = clamp01(numberOr(p.clear, 0));
    // Like a pass: a month counts when at least MIN_CLEAR_SHARE of the field was seen clearly.
    const seen = clear >= MIN_CLEAR_SHARE;
    return { month, ndvi: seen ? round(numberOr(p.ndvi, null), 3) : null, ndwi: seen ? round(numberOr(p.ndwi, null), 3) : null, clearPct: Math.round(clear * 100) };
  });
}

// ---------- GeoTIFF download ----------

async function geotiffUrl(deps, { field, latestPassDate = null, analysis = null } = {}) {
  const [one] = fieldsInput([field]);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = contextOf(cfg);
  const today = isoDay(deps.now());
  const passDate = isDay(latestPassDate) ? latestPassDate : isDay(analysis?.latestPass?.date) ? analysis.latestPass.date : null;
  const window = latestWindowFor(passDate, today);
  const center = bboxCenter(one.bbox);
  const crs = utmCrs(center.lon, center.lat);
  const region = rect(ee, padBbox(one.bbox, 0.001));
  const shape = ee.Geometry(one.geometry);
  const fc = fieldCollection(ee, [one]);
  const latest = composite(ee, clearCollection(ee, region, window));
  const normal = normalOfYears(ee, BASELINE_YEARS.map((year) => composite(ee, clearCollection(ee, region, normalWindow(window, year)))));
  const { condition } = conditionImages(ee, { latest, normal, fc, crs, plan: PLANS[0] });
  const image = ee.Image.cat([latest.select("ndvi"), latest.select("ndwi"), condition]).toFloat().clip(shape);
  const date = shiftDays(window.end, -1);
  const name = `${safeFileName(one.name || one.id)}-${date}`;
  const bands = GEOTIFF_BANDS;
  const params = { name, region: shape, scale: 10, crs, format: "GEO_TIFF", filePerBand: false };
  try {
    const url = await withTimeout(
      new Promise((resolve, reject) => {
        image.getDownloadURL(params, (value, error) => (error || !value ? reject(error instanceof Error ? error : new Error(String(error || "No download link."))) : resolve(value)));
      }),
      2 * 60 * 1000,
      "Making the GeoTIFF",
    );
    return { url, date, bands, name: `${name}.tif` };
  } catch (error) {
    // Download links need the permission earthengine.thumbnails.create
    // (role "Earth Engine Resource Writer"). Without it the pixels are read
    // like any other request and the GeoTIFF is written here instead.
    if (!isThumbnailPermissionError(error)) throw error instanceof GeeError ? error : explainGeeError(error, { ...context, what: "Making the GeoTIFF" });
  }
  const grid = zoneGrid(one.bbox, { maxCells: GEOTIFF_MAX_PIXELS, minCellM: 10 });
  const sampled = await runWithRetry(
    () =>
      image
        .reproject({ crs, scale: 10 })
        .reduceResolution({ reducer: ee.Reducer.mean(), bestEffort: true, maxPixels: 1024 })
        .reproject({ crs: "EPSG:4326", crsTransform: grid.transform })
        .sampleRectangle({ region: ee.Geometry.Rectangle(grid.inner, "EPSG:4326", false), defaultValue: GEOTIFF_NODATA }),
    { what: "Reading the pixels for the GeoTIFF", context },
  );
  const arrays = bands.map((band) => sampled?.properties?.[band]);
  if (!arrays.every((a) => Array.isArray(a) && a.length && Array.isArray(a[0]))) throw new GeeError("gee_error", "Earth Engine sent no pixels for the GeoTIFF.");
  const height = arrays[0].length;
  const width = arrays[0][0].length;
  const tiff = encodeGeoTiff({ width, height, bands: arrays, west: grid.west, north: grid.north, dx: grid.dx, dy: grid.dy, nodata: GEOTIFF_NODATA });
  return { url: `data:image/tiff;base64,${tiff.toString("base64")}`, date, bands, name: `${name}.tif` };
}

export const GEOTIFF_BANDS = ["ndvi", "ndwi", "condition"];
export const GEOTIFF_NODATA = -9999;
// The local fallback reads at most this many pixels along each side
// (512 x 512 x 3 bands stays inside one sampleRectangle request).
export const GEOTIFF_MAX_PIXELS = 512;

export function isThumbnailPermissionError(error) {
  const text = [error?.message, error?.cause?.message].filter(Boolean).join(" ");
  return /thumbnails\.create/i.test(text);
}

// A minimal GeoTIFF: one strip, 32-bit float samples interleaved per pixel,
// EPSG:4326 (lon/lat), north-up. bands = [rows x cols arrays], row 0 north.
export function encodeGeoTiff({ width, height, bands, west, north, dx, dy, nodata = GEOTIFF_NODATA }) {
  const samples = bands.length;
  const dataBytes = width * height * samples * 4;
  const nodataText = `${nodata}\0`;
  const geoKeys = [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326];
  // [tag, type, values]; types: 2 ASCII, 3 SHORT, 4 LONG, 12 DOUBLE
  const tags = [
    [256, 4, [width]],
    [257, 4, [height]],
    [258, 3, new Array(samples).fill(32)],
    [259, 3, [1]],
    [262, 3, [1]],
    [273, 4, [0]], // strip offset, filled in below
    [277, 3, [samples]],
    [278, 4, [height]],
    [279, 4, [dataBytes]],
    [284, 3, [1]],
    ...(samples > 1 ? [[338, 3, new Array(samples - 1).fill(0)]] : []),
    [339, 3, new Array(samples).fill(3)],
    [33550, 12, [dx, dy, 0]],
    [33922, 12, [0, 0, 0, west, north, 0]],
    [34735, 3, geoKeys],
    [42113, 2, nodataText],
  ];
  const size = { 2: 1, 3: 2, 4: 4, 12: 8 };
  const count = (type, values) => (type === 2 ? values.length : values.length);
  const ifdBytes = 2 + tags.length * 12 + 4;
  let extraOffset = 8 + ifdBytes;
  const extras = [];
  for (const tag of tags) {
    const bytes = size[tag[1]] * count(tag[1], tag[2]);
    if (bytes > 4) {
      tag.push(extraOffset);
      extras.push(tag);
      extraOffset += bytes + (bytes % 2);
    }
  }
  const dataOffset = extraOffset;
  tags.find((tag) => tag[0] === 273)[2] = [dataOffset];
  const buffer = Buffer.alloc(dataOffset + dataBytes);
  buffer.write("II", 0, "ascii");
  buffer.writeUInt16LE(42, 2);
  buffer.writeUInt32LE(8, 4);
  buffer.writeUInt16LE(tags.length, 8);
  const writeValues = (offset, type, values) => {
    if (type === 2) return buffer.write(values, offset, "latin1");
    values.forEach((value, i) => {
      if (type === 3) buffer.writeUInt16LE(value, offset + i * 2);
      else if (type === 4) buffer.writeUInt32LE(value, offset + i * 4);
      else buffer.writeDoubleLE(value, offset + i * 8);
    });
  };
  tags.forEach((tag, i) => {
    const [id, type, values, offset] = tag;
    const at = 10 + i * 12;
    buffer.writeUInt16LE(id, at);
    buffer.writeUInt16LE(type, at + 2);
    buffer.writeUInt32LE(count(type, values), at + 4);
    if (offset === undefined) writeValues(at + 8, type, values);
    else buffer.writeUInt32LE(offset, at + 8);
  });
  buffer.writeUInt32LE(0, 10 + tags.length * 12);
  for (const [, type, values, offset] of extras) writeValues(offset, type, values);
  let at = dataOffset;
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      for (let b = 0; b < samples; b += 1) {
        const v = numberOr(bands[b]?.[r]?.[c], nodata);
        buffer.writeFloatLE(v, at);
        at += 4;
      }
    }
  }
  return buffer;
}

// =====================================================================
// Plain helpers (no Earth Engine), tested in field-gee.test.js
// =====================================================================

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value) => typeof value === "string" && DAY_RE.test(value);
const isMonth = (value) => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const pad2 = (n) => String(n).padStart(2, "0");
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function numberOr(value, fallback) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}
function round(value, digits) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

// The UTM zone (as an EPSG code) for a point: square 10 m pixels, like
// Sentinel-2's own tiles.
export function utmCrs(lon, lat) {
  const zone = Math.min(60, Math.max(1, Math.floor((((lon + 180) % 360) + 360) % 360 / 6) + 1));
  return `EPSG:${lat >= 0 ? 326 : 327}${pad2(zone)}`;
}

function bboxCenter([w, s, e, n]) {
  return { lon: (w + e) / 2, lat: (s + n) / 2 };
}
function unionBbox(boxes) {
  return boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
}
function padBbox([w, s, e, n], deg) {
  return [w - deg, s - deg, e + deg, n + deg];
}

// The detect input in one shape:
//   boundary  GeoJSON Polygon / MultiPolygon / Feature, or corner points
//             [[lat, lon], ...] (at least 3)
//   center    { lat, lon } or [lat, lon]
//   radiusM   300..3000 (default 1200)
export function detectInput({ boundary = null, center = null, radiusM } = {}) {
  let outline = null;
  if (boundary) {
    if (Array.isArray(boundary)) {
      const points = boundary.map((p) => (Array.isArray(p) ? [Number(p[1]), Number(p[0])] : [Number(p?.lon), Number(p?.lat)]));
      if (points.length < 3 || !points.every(validLonLat)) throw new GeeError("bad_request", "A boundary needs at least 3 corners, each as latitude, longitude.");
      const ring = [...points];
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push([...ring[0]]);
      outline = { type: "Polygon", coordinates: [ring] };
    } else {
      outline = toPolygonal(boundary.type === "Feature" ? boundary.geometry : boundary);
      if (!outline || !polygonsOf(outline).every((polygon) => polygon[0]?.length >= 4 && polygon[0].every(validLonLat))) {
        throw new GeeError("bad_request", "The boundary is not a valid outline.");
      }
    }
    const areaKm2 = bboxAreaKm2(bboxOf(outline));
    if (areaKm2 > DETECT.maxAreaKm2) {
      throw new GeeError("too_big", `That area is too large to search at once (about ${Math.round(areaKm2)} km²; up to ${DETECT.maxAreaKm2} km²). Draw a smaller area.`);
    }
    return { boundary: outline, center: null, radiusM: null };
  }
  const lat = Number(Array.isArray(center) ? center[0] : center?.lat);
  const lon = Number(Array.isArray(center) ? center[1] : center?.lon);
  if (!validLonLat([lon, lat])) throw new GeeError("bad_request", "Give a boundary or a place (latitude and longitude) to search for fields.");
  const r = Number(radiusM);
  const radius = Number.isFinite(r) && r > 0 ? Math.min(DETECT.maxRadiusM, Math.max(DETECT.minRadiusM, r)) : DETECT.defaultRadiusM;
  return { boundary: null, center: { lat, lon }, radiusM: radius };
}

function validLonLat([lon, lat]) {
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

// The fields to measure, checked: [{ id, name, geometry, areaHa, bbox, grid }].
export function fieldsInput(fields) {
  if (!Array.isArray(fields) || !fields.length) throw new GeeError("bad_request", "No fields to measure.");
  return fields.map((field) => {
    const geometry = toPolygonal(field?.geometry?.type === "Feature" ? field.geometry.geometry : field?.geometry);
    if (!field?.id || !geometry) throw new GeeError("bad_request", `Field ${field?.name || field?.id || "?"} has no valid outline.`);
    const bbox = bboxOf(geometry);
    const areaHa = Number.isFinite(field.areaHa) && field.areaHa > 0 ? field.areaHa : geoAreaHa(geometry);
    return { id: String(field.id), name: field.name || null, geometry, areaHa, bbox, grid: zoneGrid(bbox) };
  });
}

// The six NDVI windows used to trace edges: Apr-May, Jun-Jul, Aug-Sep of
// the last complete season (it ends on 1 October) and of the season before.
export function detectionWindows(today) {
  const year = Number(today.slice(0, 4));
  const last = today >= `${year}-10-01` ? year : year - 1;
  return [last, last - 1].flatMap((y) => [
    { start: `${y}-04-01`, end: `${y}-06-01` },
    { start: `${y}-06-01`, end: `${y}-08-01` },
    { start: `${y}-08-01`, end: `${y}-10-01` },
  ]);
}

// Every date window an analysis uses ({ start, end }, end not included,
// never past `today`).
//   seasonStart   1 March of this year (from April on), else 8 months back
//   passes        from the earlier of seasonStart and 90 days back, to today
//   chiBaseline   Apr-Sep of 2019, 2020 and 2021 (one composite, as in the
//                 Atlas); chiSeason: Apr-Sep of the last complete season
//   radarBaselines Jun-Aug of 2019, 2020 and 2021; radarSeason: the last complete Jun-Aug
//   firesWar      24 Feb 2022 to today
export function analysisWindows(today) {
  const year = Number(today.slice(0, 4));
  const seasonStart = today >= `${year}-04-01` ? `${year}-03-01` : shiftDays(today, -243);
  const lookback = shiftDays(today, -LOOKBACK_DAYS);
  const stop = (window) => clampWindow(window, today);
  const chiYear = today >= `${year}-10-01` ? year : year - 1;
  const radarYear = today >= `${year}-09-01` ? year : year - 1;
  return {
    seasonStart,
    passes: stop({ start: lookback < seasonStart ? lookback : seasonStart, end: today }),
    chiBaseline: BASELINE_YEARS.map((y) => ({ start: `${y}-04-01`, end: `${y}-10-01` })),
    chiSeason: stop({ start: `${chiYear}-04-01`, end: `${chiYear}-10-01` }),
    radarBaselines: BASELINE_YEARS.map((y) => ({ start: `${y}-06-01`, end: `${y}-09-01` })),
    radarSeason: stop({ start: `${radarYear}-06-01`, end: `${radarYear}-09-01` }),
    firesWar: stop({ start: WAR_START, end: today }),
  };
}

// The window the latest condition is measured over: the last 30 days, or
// the 30 days up to the latest clear pass when that is older (up to 90 days).
export function latestWindowFor(latestClearDate, today) {
  const recent = { start: shiftDays(today, -LATEST_DAYS), end: today };
  if (!isDay(latestClearDate) || latestClearDate >= recent.start || latestClearDate < shiftDays(today, -LOOKBACK_DAYS)) return recent;
  return clampWindow({ start: shiftDays(latestClearDate, 1 - LATEST_DAYS), end: shiftDays(latestClearDate, 1) }, today);
}

// The same weeks in a baseline year: +-15 days around the window's middle.
export function normalWindow(window, year) {
  const startMs = Date.parse(`${window.start}T00:00:00Z`);
  const endMs = Date.parse(`${window.end}T00:00:00Z`);
  const middle = new Date((startMs + endMs) / 2).toISOString().slice(0, 10);
  let day = `${year}${middle.slice(4)}`;
  if (day.endsWith("02-29") && !isLeap(year)) day = `${year}-02-28`;
  return { start: shiftDays(day, -NORMAL_HALF_WINDOW_DAYS), end: shiftDays(day, NORMAL_HALF_WINDOW_DAYS + 1) };
}
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// The normal curve's days: the 1st and 16th of each month.
export const CURVE_DAYS = Array.from({ length: 24 }, (_, i) => `${pad2(Math.floor(i / 2) + 1)}-${i % 2 ? "16" : "01"}`);
function curveWindow(year, day) {
  const center = `${year}-${day}`;
  return { start: shiftDays(center, -7), end: shiftDays(center, 8) };
}
const curveBand = (year, i) => `c${year}_${pad2(i)}`;

// The zones grid over a field's bounding box: square-ish cells of at least
// 10 m, at most ZONES_MAX across. `transform` places the grid for
// Earth Engine; `inner` is the box shrunk by a quarter cell so sampling it
// gives exactly rows x cols pixels.
export function zoneGrid([w, s, e, n], { maxCells = ZONES_MAX, minCellM = 10 } = {}) {
  const lat = (s + n) / 2;
  const widthM = Math.max(1, (e - w) * 111320 * Math.cos((lat * Math.PI) / 180));
  const heightM = Math.max(1, (n - s) * 110574);
  const cellM = Math.max(minCellM, Math.max(widthM, heightM) / maxCells);
  const cols = Math.min(maxCells, Math.max(1, Math.ceil(widthM / cellM - 1e-9)));
  const rows = Math.min(maxCells, Math.max(1, Math.ceil(heightM / cellM - 1e-9)));
  const dx = (e - w) / cols || 1e-5;
  const dy = (n - s) / rows || 1e-5;
  return {
    west: w,
    south: s,
    east: w + cols * dx,
    north: n,
    cols,
    rows,
    dx,
    dy,
    transform: [dx, 0, w, 0, -dy, n],
    inner: [w + dx / 4, n - rows * dy + dy / 4, w + cols * dx - dx / 4, n - dy / 4],
  };
}

// A sampleRectangle answer -> { west, south, east, north, cols, rows, values }
// (row-major, north row first, null outside the field). Uses the shape
// Earth Engine really sent if it differs from the planned grid.
export function readZones(sampled, grid) {
  const array = sampled?.properties?.condition;
  if (!Array.isArray(array) || !array.length || !Array.isArray(array[0])) return emptyZones(grid);
  const rows = array.length;
  const cols = array[0].length;
  const values = [];
  for (const row of array) {
    for (let c = 0; c < cols; c += 1) {
      const v = numberOr(row?.[c], null);
      values.push(v === null || v === NONE || v < 0 ? null : round(clamp01(v), 3));
    }
  }
  return { west: grid.west, south: grid.north - rows * grid.dy, east: grid.west + cols * grid.dx, north: grid.north, cols, rows, values };
}

export function emptyZones(grid) {
  return { west: grid.west, south: grid.south, east: grid.east, north: grid.north, cols: grid.cols, rows: grid.rows, values: new Array(grid.cols * grid.rows).fill(null) };
}

// Danny's rule: one reading per day; where two pictures cover the same day,
// keep the clearer one.
export function oneReadingPerDay(passes) {
  const byDate = new Map();
  for (const pass of passes || []) {
    const kept = byDate.get(pass.date);
    if (!kept || numberOr(pass.clear, 0) > numberOr(kept.clear, 0)) byDate.set(pass.date, pass);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// A field's passes -> its clear passes, season, latest pass and latest window.
export function fieldPlan(field, passes, { today, windows = analysisWindows(today) }) {
  const daily = oneReadingPerDay((passes || []).filter((p) => p.date < today));
  const clear = daily.filter((p) => numberOr(p.clear, 0) >= MIN_CLEAR_SHARE && Number.isFinite(numberOr(p.ndvi, null)));
  const latest = clear[clear.length - 1] || null;
  const inLookback = latest && latest.date >= shiftDays(today, -LOOKBACK_DAYS);
  const season = clear
    .filter((p) => p.date >= windows.seasonStart)
    .map((p) => ({ date: p.date, ndvi: round(numberOr(p.ndvi, null), 3), ndwi: round(numberOr(p.ndwi, null), 3), clearPct: Math.round(clamp01(numberOr(p.clear, 0)) * 100) }));
  return {
    ...field,
    passCount: daily.length,
    season,
    latestPass: inLookback ? { date: latest.date, clearPct: Math.round(clamp01(numberOr(latest.clear, 0)) * 100) } : null,
    latestWindow: latestWindowFor(inLookback ? latest.date : null, today),
  };
}

// Features from a list of features or a FeatureCollection answer.
export function featuresOf(value) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  return Array.isArray(value?.features) ? value.features : [];
}

// One stats answer -> { [fieldId]: { medians, means, fires, curve, patches } }.
export function readStats(result, part) {
  const out = Object.fromEntries(part.map((field) => [field.id, { medians: {}, means: {}, fires: {}, curve: {}, patches: [] }]));
  for (const key of ["medians", "means", "fires", "curve"]) {
    for (const feature of featuresOf(result?.[key])) {
      const p = feature.properties || {};
      if (out[p.fid]) out[p.fid][key] = p;
    }
  }
  for (const feature of featuresOf(result?.patches)) {
    const p = feature.properties || {};
    const [lon, lat] = Array.isArray(p.centroid) ? p.centroid : [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const owner = part.find((field) => pointInGeometry(lon, lat, field.geometry));
    if (owner) out[owner.id].patches.push({ lat, lon, ha: numberOr(p.areaHa, 0), bounds: p.bounds });
  }
  return out;
}

// A stress patch -> { lat, lon, radiusM, ha }: a circle around it (half the
// diagonal of its bounding box, at least 15 m).
export function patchCircle({ lat, lon, ha, bounds }) {
  const ring = Array.isArray(bounds?.[0]) ? bounds[0] : [];
  const lons = ring.map((p) => p[0]).filter(Number.isFinite);
  const lats = ring.map((p) => p[1]).filter(Number.isFinite);
  let radiusM = Math.sqrt((ha * 1e4) / Math.PI);
  if (lons.length && lats.length) {
    const w = (Math.max(...lons) - Math.min(...lons)) * 111320 * Math.cos((lat * Math.PI) / 180);
    const h = (Math.max(...lats) - Math.min(...lats)) * 110574;
    radiusM = Math.max(radiusM, Math.hypot(w, h) / 2);
  }
  return { lat: round(lat, 6), lon: round(lon, 6), radiusM: Math.max(15, Math.round(radiusM)), ha: round(ha, 2) };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
function range(values) {
  const list = values.filter(Number.isFinite);
  if (!list.length) return { low: null, high: null, median: null };
  return { low: round(Math.min(...list), 3), high: round(Math.max(...list), 3), median: round(median(list), 3) };
}

// Everything measured for one field -> its analysis (spec section 3, without
// `status` and the harvest window, which the route layer adds).
export function buildAnalysis(plan, measured, zones, { today, updatedAt }) {
  const warnings = [];
  const med = measured.medians || {};
  const means = measured.means || {};
  const hasLatest = Boolean(plan.latestPass);
  const ndvi = hasLatest ? round(numberOr(med.ndvi, null), 3) : null;
  const ndwi = hasLatest ? round(numberOr(med.ndwi, null), 3) : null;
  const normalNdvi = range(BASELINE_YEARS.map((y) => numberOr(means[`n${y}_ndvi`], null)));
  const normalNdwi = range(BASELINE_YEARS.map((y) => numberOr(means[`n${y}_ndwi`], null)));
  if (!plan.latestPass) warnings.push(`No clear satellite view of this field in the last ${LOOKBACK_DAYS} days.`);
  else if (plan.latestPass.date < shiftDays(today, -LATEST_DAYS)) warnings.push(`The latest clear view is from ${plan.latestPass.date}.`);
  if (normalNdvi.median === null) warnings.push(`No clear images of these weeks in ${BASELINE.label}, so there is no normal to compare with.`);

  // Scores: the median of the per-pixel scores over the field (what the
  // zone map shows, and what the sample data does); worked out from the
  // field medians only when Earth Engine gave no pixel score.
  const pixelScore = (name) => (hasLatest ? round(clamp01(numberOr(med[name], NaN)), 3) : null);
  const known = (value) => (Number.isFinite(value) ? value : null);
  const healthValue = known(pixelScore("health")) ?? healthScore(ndvi, normalNdvi.median);
  const waterValue = known(pixelScore("water")) ?? waterScore(ndwi, normalNdwi.median);
  const share = hasLatest ? round(clamp01(numberOr(means.stressed, NaN)), 3) : null;
  const stressShare = Number.isFinite(share) ? share : null;
  const conditionValue = hasLatest ? known(pixelScore("condition")) ?? conditionScore({ health: healthValue, water: waterValue, stress: stressShare }) : null;
  const patches = hasLatest ? (measured.patches || []).sort((a, b) => b.ha - a.ha).slice(0, MAX_PATCHES).map(patchCircle) : [];

  const stage = harvestStage(plan.season, today);
  const radarChangedShare = round(numberOr(means.radarChanged, null), 3);
  const firesRaw = numberOr(measured.fires?.fires, null);
  const firesSinceWar = firesRaw === null ? null : Math.max(0, Math.round(firesRaw));
  const chiDrop = round(numberOr(means.chiDrop, null), 3);
  const chernozem = round(numberOr(means.chernozem, null), 3);

  return {
    fieldId: plan.id,
    provider: "gee",
    updatedAt,
    latestPass: plan.latestPass,
    water: { ndwi, normal: normalNdwi, versus: versusNormal(ndwi, normalNdwi.low, normalNdwi.high), score: waterValue },
    plantHealth: { ndvi, normal: normalNdvi, versus: versusNormal(ndvi, normalNdvi.low, normalNdvi.high), score: healthValue },
    stress: {
      share: stressShare,
      level: stressLevel(stressShare),
      stressedHa: stressShare === null ? null : round(stressShare * plan.areaHa, 1),
      patches,
    },
    harvest: {
      stage: stage.stage,
      daysToReady: stage.daysToReady ?? null,
      window: null,
      rainBefore: null,
      peak: round(stage.peak, 3),
      peakDate: stage.peakDate ?? null,
      lastDate: stage.lastDate ?? null,
    },
    condition: { score: conditionValue, class: conditionClass(conditionValue)?.id ?? null },
    damage: {
      detected: damageDetected({ radarChangedShare, firesSinceWar, chiDrop }),
      radarChangedShare,
      firesSinceWar,
      chiDrop,
      damagedHa: damagedArea({ radarChangedShare, firesSinceWar, chiDrop }, plan.areaHa),
    },
    soil: { chernozemProbability: chernozem, soilTypeId: soilTypeFor(chernozem) },
    season: plan.season,
    normalCurve: normalCurve(measured.curve || {}),
    zones,
    warnings,
  };
}

// The curve answer (bands c2019_00 .. c2021_23) -> [{ day, low, high, median }]
// for the days that have at least one year's value.
export function normalCurve(curve) {
  const points = [];
  CURVE_DAYS.forEach((day, i) => {
    const values = BASELINE_YEARS.map((year) => numberOr(curve[curveBand(year, i)], null)).filter(Number.isFinite);
    if (values.length) points.push({ day, ...range(values) });
  });
  return points;
}

// Detected parcels from Earth Engine -> candidates
// [{ id: "cand-N", geometry: Polygon, areaHa, centroid: [lat, lon] }],
// numbered from north-west to south-east. `fineFeatures` (the finer trace,
// optional) split a parcel per splitByFinerEdges.
export function toCandidates(features, fineFeatures = []) {
  const shapes = (list) => {
    const out = [];
    for (const feature of list || []) {
      const geometry = largestPolygon(toPolygonal(feature?.geometry));
      if (!geometry) continue;
      const areaHa = round(geoAreaHa(geometry), 2);
      if (!(areaHa >= DETECT.minHa)) continue;
      out.push({ geometry, areaHa, centroid: ringCentroid(geometry.coordinates[0]) });
    }
    return out;
  };
  const list = splitByFinerEdges(shapes(features), shapes(fineFeatures));
  list.sort((a, b) => order(a.centroid) - order(b.centroid));
  return list.slice(0, DETECT.maxFields).map((item, i) => ({ id: `cand-${i + 1}`, ...item }));
}
const order = ([lat, lon]) => lon * Math.cos((lat * Math.PI) / 180) - lat;

// Replaces a parcel by the finer-trace pieces inside it (centre inside the
// parcel) when at least two of them are DETECT.splitMinHa or more and those
// cover at least DETECT.splitMinCover of the parcel. Otherwise the parcel
// stays whole: small or scattered pieces are noise, not a field boundary.
export function splitByFinerEdges(parcels, pieces, { minHa = DETECT.splitMinHa, minCover = DETECT.splitMinCover } = {}) {
  if (!pieces?.length) return [...parcels];
  const out = [];
  const used = new Set();
  for (const parcel of parcels) {
    const inside = pieces.filter((piece) => !used.has(piece) && piece.areaHa >= minHa && pointInGeometry(piece.centroid[1], piece.centroid[0], parcel.geometry));
    const cover = inside.reduce((sum, piece) => sum + piece.areaHa, 0) / parcel.areaHa;
    if (inside.length >= 2 && cover >= minCover) {
      for (const piece of inside) used.add(piece);
      out.push(...inside);
    } else {
      out.push(parcel);
    }
  }
  return out;
}

// The biggest polygon of a (multi)polygon, holes kept, coordinates rounded
// to 6 decimals (about 10 cm).
export function largestPolygon(geometry) {
  const polygons = polygonsOf(geometry);
  if (!polygons.length) return null;
  let best = null;
  let bestArea = -1;
  for (const polygon of polygons) {
    const area = geoAreaHa({ type: "Polygon", coordinates: polygon });
    if (area > bestArea) {
      best = polygon;
      bestArea = area;
    }
  }
  const coordinates = best
    .map((ring) => ring.map(([lon, lat]) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))]))
    .filter((ring) => ring.length >= 4);
  return coordinates.length ? { type: "Polygon", coordinates } : null;
}

// Centre of a ring (area-weighted), as [lat, lon].
export function ringCentroid(ring) {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  if (Math.abs(a) < 1e-15) {
    const lons = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    return [round(lats.reduce((s, v) => s + v, 0) / lats.length, 6), round(lons.reduce((s, v) => s + v, 0) / lons.length, 6)];
  }
  return [round(y / (3 * a), 6), round(x / (3 * a), 6)];
}

// "2019-01".."2019-04" -> ["2019-01", "2019-02", "2019-03", "2019-04"].
export function monthRange(from, to) {
  const months = [];
  for (let m = from; m <= to && months.length < 1200; m = addMonths(m, 1)) months.push(m);
  return months;
}

function safeFileName(text) {
  return String(text).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "field";
}
