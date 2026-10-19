// WHAT THIS FILE DOES
// The real data source for the Field product: Google Earth Engine. It finds
// the fields inside a farmer's land (or around a place), and measures every
// field from real satellite images: plant health (NDVI), water in the
// plants (NDWI), stress, the season curve for harvest readiness, damage
// and soil. It works for any field on Earth: every date window comes from
// src/lib/season.js by the farm's latitude (north: April to September;
// south: October to March; tropics: the last 12 months), and damage is
// counted from the start of a known war (src/config/conflicts.js) where
// one covers the field, otherwise over the last two years.
//
//   status()                                  is Earth Engine set up and signed in?
//   detectFields({ boundary|null, center|null, radiusM, onProgress })
//                                             -> { candidates, warnings, center?, radiusM? }
//   analyzeFields({ fields, today, onProgress, historyFor, freshHistoryFor })
//                                             -> { analyses: { [fieldId]: analysis }, warnings, histories }
//                                             (historyFor: read the whole history too;
//                                             freshHistoryFor: a fresh history is saved,
//                                             so the recent months are not read)
//   fieldHistory({ field, from: "2019-01", to }) -> [{ month, ndvi, ndwi, clearPct }]
//   fieldHistories({ fields, from, to })      -> { [fieldId]: months } (all fields
//                                             batched: far fewer requests)
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
//   2. NDVI and NDWI median composites (clear pixels only) for the early,
//      middle and late thirds of the last complete growing season and the
//      season before (season.js detectionWindows, by latitude).
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
//   6. Touching parcels of the same crop (mean NDVI and NDWI within
//      DETECT.mergeMaxDiff in every window) are joined into one field: wet
//      hollows and soil patches draw edges inside one big field too. So
//      are touching parcels with the same phenology (season NDVI curves
//      correlated >= 0.95, peaks within 10 days) when the line between
//      them is not a real edge (PHENOLOGY_MERGE: the strip along it is
//      cropland and its Canny lines come and go between pictures).
//   7. Around a point, when the fields found cover less than
//      DETECT.widenBelowCover of the circle (the point is in a town, a
//      forest or on water), the nearest circle of the same size that is
//      mostly cropland (WorldCover, up to 8 km away) is searched instead,
//      and the result says so (its `center` is where it searched).
//
// HOW A FIELD IS MEASURED (analyzeFields, all fields of a farm in a few
// batched requests, never one request per field; up to PARALLEL_REQUESTS
// at once)
//   passes     every Sentinel-2 pass this season (from season.js
//              seasonCurveStart; COPERNICUS/S2_SR_HARMONIZED
//              linked to GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED band cs,
//              Danny's approach in scripts/fetch-ndvi.js; snow, which Cloud
//              Score+ calls clear, is removed too): field mean NDVI, NDWI,
//              NDRE (B8A, B5), NDYI (B3, B2: yellow flowers) and clear
//              share; one reading per day; a pass counts when at least
//              MIN_CLEAR_SHARE of the field was clear
//   radar      every Sentinel-1 picture this season (COPERNICUS/S1_GRD, IW,
//              band VH, both orbit directions): the field's mean
//              backscatter (averaged as power), cleaned by a 3-day running
//              median (VH_CLEAN), for method.js
//              radarHarvest (a tall crop cut down) and the crop type (the
//              VH peak near the NDVI peak; on real data soybean and canola
//              read brighter than corn, crops.js)
//   months     the field mean NDVI / NDWI of each of the last CROP_MONTHS
//              months (the crop type, method.js classifyCrop), and with
//              `historyFor` the whole history since 2019, in the same run
//   latest     median of clear pixels over the last 30 days, or over the 30
//              days up to the latest clear pass when that is 30-90 days old
//   normal     the same calendar window in 2019, 2020 and 2021 (season.js
//              baselineWindows):
//              per pixel the median of the three yearly composites; per field
//              the lowest / highest / middle of the three yearly field means
//   pixels     health, water, stress and condition per method.js, written as
//              Earth Engine image arithmetic; stressed = the NDVI rule OR
//              the red-edge rule (NDRE against the field median and the
//              2019-2021 normal), and the likely cause from the NDWI
//              anomaly over the stressed pixels (dry, or not water)
//   patches    stressed pixels in blobs of 0.3 ha or more, top 3 per
//              field, each with its own NDWI anomaly and cause
//   crop       method.js classifyCrop from the months, the passes and the
//              VH peak (cropDetected); the farmer's own crop (cropSource
//              "user") wins for the harvest's crop profile
//   harvest    method.js harvestStage with the crop's ready share, checked
//              against radar (combineHarvestEstimate: a tall crop cut
//              shows as a VH drop; low NDVI with no drop = still standing)
// The zones grid (the condition image sampled per field) is no longer
// measured (FINAL-SPEC 7.7): nothing draws it, the AI uses the stress
// patches and downloads use the GeoTIFF. That saved one request per 8
// fields.
//   curve      half-month NDVI of 2019-2021 for the "season vs normal" chart
//   damage     radar change (COPERNICUS/S1_GRD VV, IW, one orbit direction
//              (gee.js pickPass): each complete growing season of the
//              damage window vs the same months of 2019-2021, compared with
//              the field's own overall change that season; a pixel's change
//              counts when it lasts over two seasons, see
//              radarChangeImage); excess fire days (FIRMS T21)
//              in the WORST war year of the damage window (from the war
//              start where a known war covers the field, else the last 2
//              years): per year the fire days minus a normal year's (the
//              2019-2021 count / 3), never below 0, the largest
//              (fireWindows, excessFiresOf; src/lib/atlas/method.js
//              FIRE_YEARS), so yearly stubble burning is not damage and
//              damage does not fade as the war goes on; and the drop of the Chernozem
//              Health Index (same formula as the Atlas, the 2019-2021
//              seasons vs the last one)
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
import { conflictAt } from "../conflicts.js";
import { damageWindow } from "../../src/config/conflicts.js";
import { addDays, baselineWindows, damageSeasons, detectionWindows as seasonDetectionWindows, lastCompleteSeason, sameWindowIn, seasonCurveStart } from "../../src/lib/season.js";
import { fireYears, worstFireYear } from "../../src/lib/atlas/method.js";
import {
  BASELINE,
  CLEAR_PIXEL_SCORE,
  MIN_CLEAR_SHARE,
  CONDITION_WEIGHTS,
  HEALTH_SPAN,
  WATER_SPAN,
  STRESS_RULES,
  RED_EDGE_RULES,
  RADAR_CHANGE_DB,
  healthScore,
  waterScore,
  conditionScore,
  conditionClass,
  versusNormal,
  stressLevel,
  stressCause,
  redEdgeFound,
  harvestStage,
  radarForHarvest,
  combineHarvestEstimate,
  classifyCrop,
  cropProfile,
  CROP_PROFILES,
  cleanSeries,
  NOT_SOWN_PEAK,
  SEASON_DONE_DROP,
  damageDetected,
  damagedArea,
  soilTypeFor,
} from "../../src/lib/field/method.js";
import {
  DATASETS,
  BANDS,
  CROPLAND_CLASS,
  NONE,
  CHUNK_TIMEOUT_MS,
  GeeError,
  createGeeProvider,
  evaluate,
  peakMonthAt,
  contextOf,
  chiHealthImage,
  chernozemImage,
  checkChernozemAsset,
  sentinel1,
  sentinel2,
  firms,
  pickPass,
  ORBIT_PASSES,
  withTimeout,
  chunk,
  mapLimit,
  explainGeeError,
  isTooMuchWorkError,
  isInternalError,
  retryTransient,
  TRANSIENT_RETRY_MS,
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
  // A place name or a pin often lands in a town (real data, 2026-10-19: the
  // given points for Ames, Iowa; Sorriso, Mato Grosso; Daqing, Heilongjiang
  // and Nakuru, Kenya are 0-4% cropland within 1.2 km, so 0 or 1 field was
  // found). When the fields found cover less than widenBelowCover of the
  // circle, the nearest circle of the same size that is at least
  // farmlandFull (else farmlandMin) cropland (ESA WorldCover), up to
  // farmlandMaxKm away, is
  // searched instead (and the result says where and why). Tracing one
  // circle 6 km across instead took 1.5 to 10 minutes.
  widenBelowCover: 0.15,
  farmlandFull: 0.9,
  farmlandMin: 0.7,
  farmlandMaxKm: 8,
  // Holes smaller than this inside a traced field are edge noise (a few
  // pixels of a soft line), not a farmstead or a pond: they are filled.
  minHoleHa: 0.5,
  // No traced field is larger than this (the farm's own limit,
  // server/field/routes.js). Real data, Kenya (-0.354, 35.996): one traced
  // shape came back from Earth Engine as the whole globe (5.1e10 ha).
  maxHa: 5000,
  // Parcels traced before neighbours of the same crop are joined
  // (sameCropGroups); the maxFields largest are offered.
  maxParcels: 150,
  // Two touching parcels are one field when their mean NDVI and NDWI differ
  // by at most mergeMaxDiff in every one of the six windows (the same crop,
  // sown and harvested on the same days, two seasons running), and the
  // windows compared are at least mergeMinWindows values. Wet hollows and
  // soil patches inside one big field draw Canny lines too (real data,
  // Buenos Aires province, -34.90 -60.95, 2026-10-19: one 80 ha field cut
  // into a dozen 2-20 ha blobs, median 7.6 ha); neighbouring fields of
  // different crops differ by 0.15 or more in some window (the demo farm's
  // Field 7 and its neighbour: 0.15-0.19 NDVI).
  mergeMaxDiff: 0.05,
  mergeMinWindows: 8,
  // Join touching parcels with the same phenology too (spec 7.14), see
  // PHENOLOGY_MERGE. Off only to compare before / after.
  mergeByPhenology: true,
};

// Joining the pieces of one big field that Canny cut apart (spec 7.14;
// real data, Mato Grosso, 2026-10-19: median 16 ha where the soy fields
// are hundreds of hectares). Two touching parcels are one field when
//   - their season NDVI curves (10-day composites over the last complete
//     season, `stepDays`) are correlated at minCorrelation or more over at
//     least minPoints shared composites, and their peaks are at most
//     maxPeakDays apart (the same crop, sown the same week), AND
//   - the line between them is not a real edge. The strip of land along
//     the shared line (each parcel grown by stripM, intersected) is a real
//     edge when
//       less than minCropland of it is cropland (ESA WorldCover: a road,
//       a farmstead, trees), or
//       the line is straight (stripStraightness maxStraightness or more):
//       field boundaries are straight; the lines Canny draws inside one
//       field follow wet hollows, soil and terraces and wind, or
//       the Canny lines in it are persistent: of the strip pixels that
//       are an edge in any of the six detection windows, at least
//       maxPersistentRatio are edges in persistentWindows windows or more.
// Real data (2026-10-19). Every candidate pair had the same phenology
// (r 0.95 to 1.00, peaks 0 to 9 days apart), so the edge test decides.
// The persistent test alone kept almost nothing apart (Canny lines between
// two wheat fields show in 1 or 2 of the 6 pictures, like noise lines);
// straightness does the work:
//   demo farm (Kupiansk; 7 hand-drawn outlines): 8 same-phenology pairs,
//   real neighbours, straightness 0.78 to 0.99 but one 0.47. Joining all
//   8: mean IoU 0.81 -> 0.54; with maxStraightness 0.7: 1 joined, IoU
//   unchanged (0.805), 26 -> 25 fields.
//   Mato Grosso (soy, 6 km NE of -12.55 -55.72, 1.2 km circle): lines
//   0.36 to 1.00; 16 -> 8 fields, median 16 -> 49 ha, mean 49 -> 97 ha.
//   Iowa (42.06 -93.56): 4 pairs, all straight (0.87 to 0.96): 20 fields
//   either way.
export const PHENOLOGY_MERGE = {
  stepDays: 10,
  minCorrelation: 0.95,
  maxPeakDays: 10,
  minPoints: 6,
  stripM: 10,
  minCropland: 0.6,
  maxStraightness: 0.7,
  persistentWindows: 3,
  maxPersistentRatio: 0.4,
  maxPairs: 300,
};

export const LATEST_DAYS = 30;
export const LOOKBACK_DAYS = 90;
export const NORMAL_HALF_WINDOW_DAYS = 15;
export const PATCH_MIN_HA = 0.3;
export const MAX_PATCHES = 3;
// The zones grid is no longer measured (spec 7.7: nothing draws it, the AI
// uses the stress patches, downloads use the GeoTIFF); zoneGrid still
// shapes the GeoTIFF fallback.
export const ZONES_MAX = 64;
// Fields measured in one stats request.
export const FIELDS_PER_REQUEST = 8;
// Fields x pictures in one passes request (Sentinel-2 or Sentinel-1): far
// below Earth Engine's 5,000-element answer limit. The fields per request
// follow from the number of pictures this season (passesPerRequest).
export const PASS_ELEMENTS_PER_REQUEST = 3000;
export const MAX_FIELDS_PER_PASS_REQUEST = 30;
export const HISTORY_FROM = "2019-01";
export const HISTORY_CHUNK_MONTHS = 30;
// Batched monthly means (fieldHistories, and the 18 months the crop type
// is read from): at most this many months and fields x months per request.
export const MONTHS_PER_REQUEST = 24;
export const MONTH_ELEMENTS_PER_REQUEST = 1500;
// The months of field history the crop type is read from (classifyCrop).
export const CROP_MONTHS = 18;
// Requests that run at once. 2 left a 60-field farm waiting more than 20
// minutes (real data, Iowa, 2026-10-19); see the timing in the header.
export const PARALLEL_REQUESTS = 4;
// Sentinel-1 VH (cross-polarised radar, dB): tall crops give a strong
// return until they are cut (radarHarvest), corn the strongest
// (classifyCrop). Pixels below VH_MIN_DB are the dark border of a scene.
export const VH_BAND = "VH";
export const VH_SCALE = 20;
export const VH_MIN_DB = -30;
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
  const retryDelayMs = Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : TRANSIENT_RETRY_MS;
  const base = createGeeProvider({ ee: opts.ee, getConfig, now, retryDelayMs });
  const deps = { getConfig, now, retryDelayMs, connect: base.connect };
  return {
    id: "gee",
    label: "Earth Engine",
    status: () => base.status(),
    detectFields: (input) => detectFields(deps, input),
    analyzeFields: (input) => analyzeFields(deps, input),
    fieldHistory: (input) => fieldHistory(deps, input),
    fieldHistories: (input) => fieldHistories(deps, input),
    geotiffUrl: (input) => geotiffUrl(deps, input),
  };
}

export const fieldGeeProvider = createFieldGeeProvider();
export default fieldGeeProvider;

// ---------- Shared image helpers ----------

// Every Sentinel-2 pass over the region in the window, with Cloud Score+
// attached. Bands: ndvi, ndwi, ndre (red edge, B8A and B5 at 20 m) and
// ndyi (yellow flowers, B3 and B2), cloudy pixels masked; clear (1 clear,
// 0 cloudy or outside the picture, never masked).
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
      const ndre = image.normalizedDifference(["B8A", "B5"]).rename("ndre");
      const ndyi = image.normalizedDifference(["B3", "B2"]).rename("ndyi");
      // toFloat: the same plain type as the padding image, so collections merge.
      return ndvi
        .addBands(ndwi)
        .addBands(ndre)
        .addBands(ndyi)
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

// The bands every composite of the field measures carries.
const FIELD_BANDS = ["ndvi", "ndwi", "ndre"];

// Pixel health, water, stress and condition (method.js as image arithmetic).
//   latest  this window's composite (ndvi, ndwi, ndre)
//   normal  the 2019-2021 composite of the same weeks (ndvi, ndwi, ndre)
// The field medians of NDVI and NDRE (for "weaker than the rest of the
// field") are worked out per field inside Earth Engine and painted back as
// images. A pixel is stressed (method.js pixelStress) when
//   byNdvi    = ndvi < fieldMedianNdvi - 0.10 AND ndvi < normalNdvi - 0.08
//   byRedEdge = ndre < fieldMedianNdre - 0.06 AND ndre < normalNdre - 0.05
//   stressed  = byNdvi OR byRedEdge
// (a pixel with no red-edge normal is judged by NDVI alone). Also:
//   redEdgeOnly  stressed by red edge, not by NDVI (method.js redEdgeFound)
//   ndwiAnomaly  NDWI minus its normal, over the stressed pixels only
//                (method.js stressCause: dry, or not water)
function conditionImages(ee, { latest, normal, fc, crs, plan }) {
  const ndvi = latest.select("ndvi");
  const ndwi = latest.select("ndwi");
  const ndre = latest.select("ndre");
  const normalNdvi = normal.select("ndvi");
  const normalNdwi = normal.select("ndwi");
  const normalNdre = normal.select("ndre");
  const medians = latest
    .select(["ndvi", "ndre"])
    .rename(["medNdvi", "medNdre"])
    .reduceRegions({ collection: fc, reducer: ee.Reducer.median(), scale: plan.scale, crs, tileScale: plan.tileScale });
  const paint = (name) => medians.filter(ee.Filter.notNull([name])).reduceToImage({ properties: [name], reducer: ee.Reducer.first() }).rename(name);
  const medNdvi = paint("medNdvi");
  const medNdre = paint("medNdre");
  const health = ndvi.subtract(normalNdvi).divide(HEALTH_SPAN).add(1).clamp(0, 1).rename("health");
  const water = ndwi.subtract(normalNdwi).divide(WATER_SPAN).add(1).clamp(0, 1).rename("water");
  const byNdvi = ndvi.lt(medNdvi.subtract(STRESS_RULES.belowFieldMedian)).and(ndvi.lt(normalNdvi.subtract(STRESS_RULES.belowNormal)));
  const byRedEdge = ndre
    .lt(medNdre.subtract(RED_EDGE_RULES.belowFieldMedian))
    .and(ndre.lt(normalNdre.subtract(RED_EDGE_RULES.belowNormal)))
    .unmask(0);
  const stressed = byNdvi.or(byRedEdge).rename("stressed");
  const redEdgeOnly = byRedEdge.and(byNdvi.not()).rename("redEdgeOnly");
  const ndwiAnomaly = ndwi.subtract(normalNdwi).updateMask(stressed).rename("ndwiAnomaly");
  const w = CONDITION_WEIGHTS;
  const total = w.plantHealth + w.water + w.noStress;
  const condition = health
    .multiply(w.plantHealth)
    .add(water.multiply(w.water))
    .add(ee.Image(1).subtract(stressed).multiply(w.noStress))
    .divide(total)
    .rename("condition");
  return { health, water, stressed, redEdgeOnly, ndwiAnomaly, condition };
}

// Runs one request, once more with coarser pixels if Earth Engine runs out
// of memory or time, and once more as it is after a pause if the connection
// dropped (retryTransient; the pause is context.retryDelayMs) or Earth
// Engine had an internal error (real data, Iowa, 2026-10-19: "An internal
// error has occurred" once, the same request passed again).
// `build(plan)` makes the Earth Engine object.
async function runWithRetry(build, { what, context, timeoutMs = CHUNK_TIMEOUT_MS }) {
  let internalRetried = false;
  for (let i = 0; ; i += 1) {
    try {
      return await retryTransient(() => evaluate(build(PLANS[i]), { what, context, timeoutMs }), context?.retryDelayMs);
    } catch (error) {
      if (i + 1 < PLANS.length && isTooMuchWorkError(error)) continue;
      if (!internalRetried && isInternalError(error)) {
        internalRetried = true;
        i -= 1;
        continue;
      }
      throw error;
    }
  }
}

export { isInternalError };

// ---------- Finding fields ----------

async function detectFields(deps, input = {}) {
  const { boundary, center, radiusM } = detectInput(input);
  const onProgress = typeof input.onProgress === "function" ? input.onProgress : null;
  // onMerge(details): what the phenology join looked at (for checks on
  // real data): [{ a, b, r, peakDays, stripCropland, edgeAny, edgePersistent, joined }]
  const onMerge = typeof input.onMerge === "function" ? input.onMerge : null;
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = { ...contextOf(cfg), retryDelayMs: deps.retryDelayMs, onMerge };
  const today = isoDay(deps.now());
  const warnings = [];
  onProgress?.(0.05, "Reading satellite images");

  const anchor = boundary ? bboxCenter(bboxOf(boundary)) : center;
  const crs = utmCrs(anchor.lon, anchor.lat);
  if (boundary) {
    onProgress?.(0.2, "Tracing field edges");
    const candidates = await traceFields(ee, { region: ee.Geometry(boundary), keepWithin: null, boundary, crs, anchor, today, context });
    if (!candidates.length) warnings.push("No fields found here — try a larger area or draw your fields");
    onProgress?.(1, `Found ${candidates.length} field${candidates.length === 1 ? "" : "s"}`);
    return { candidates, warnings };
  }

  // Around a point: the circle asked for; when the fields found cover too
  // little of it (the point is in a town, a forest or on water), the
  // nearest circle of the same size that is mostly farmland.
  const traceAround = (at) => {
    const point = ee.Geometry.Point([at.lon, at.lat]);
    const keepWithin = point.buffer(radiusM);
    return traceFields(ee, { region: point.buffer(radiusM * DETECT.pointPad), keepWithin, boundary: null, crs, anchor, today, context });
  };
  onProgress?.(0.2, "Tracing field edges");
  let candidates = await traceAround(center);
  let searched = center;
  if (coverWithin(candidates, center, radiusM) < DETECT.widenBelowCover) {
    onProgress?.(0.55, "Few fields here, looking for the nearest farmland");
    const farmland = await nearestFarmland(ee, center, radiusM, { context });
    if (farmland) {
      const found = await traceAround(farmland);
      if (found.length > candidates.length) {
        candidates = found;
        searched = farmland;
        const away = distanceKm(center, farmland);
        warnings.push(
          `Few fields within ${formatKm(radiusM)} of this place (it is mostly town, forest or water), so the fields shown are around the nearest farmland, ${away < 10 ? away.toFixed(1) : Math.round(away)} km ${compassFrom(center, farmland)}.`,
        );
      }
    }
  }
  if (!candidates.length) warnings.push("No fields found here — try a larger area or draw your fields");
  onProgress?.(1, `Found ${candidates.length} field${candidates.length === 1 ? "" : "s"}`);
  return { candidates, warnings, center: { lat: round(searched.lat, 6), lon: round(searched.lon, 6) }, radiusM };
}

// The centre { lat, lon } of the nearest circle (radius radiusM) that is at
// least DETECT.farmlandMin cropland (ESA WorldCover), on a grid of centres
// radiusM apart up to DETECT.farmlandMaxKm away; else the one with the most
// cropland when that is at least DETECT.widenBelowCover; else null.
async function nearestFarmland(ee, center, radiusM, { context }) {
  const spots = farmlandSpots(center, radiusM);
  const cropland = ee.ImageCollection(FIELD_DATASETS.worldCover).first().select(BANDS.worldCover).eq(CROPLAND_CLASS).rename("cropland");
  const result = await evaluate(
    cropland
      .reduceRegions({
        collection: ee.FeatureCollection(spots.map((spot, i) => ee.Feature(ee.Geometry.Point([spot.lon, spot.lat]).buffer(radiusM), { i }))),
        reducer: ee.Reducer.mean(),
        scale: 30,
        tileScale: 4,
      })
      .select(["i", "mean"], null, false),
    { what: "Looking for the nearest farmland", context },
  );
  const shares = new Map(featuresOf(result).map((f) => [f.properties?.i, numberOr(f.properties?.mean, 0)]));
  return pickFarmland(spots.map((spot, i) => ({ ...spot, cropland: shares.get(i) ?? 0 })), center);
}

// The circle centres searched for farmland around a point: a square grid,
// radiusM (at least 1.2 km) apart, out to DETECT.farmlandMaxKm (the point
// itself left out).
export function farmlandSpots(center, radiusM) {
  // At least 1.2 km apart, so a small circle does not mean thousands of spots.
  const step = Math.max(radiusM, DETECT.defaultRadiusM);
  const steps = Math.floor((DETECT.farmlandMaxKm * 1000) / step);
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const spots = [];
  for (let dy = -steps; dy <= steps; dy += 1) {
    for (let dx = -steps; dx <= steps; dx += 1) {
      if ((!dx && !dy) || Math.hypot(dx, dy) * step > DETECT.farmlandMaxKm * 1000) continue;
      spots.push({ lat: center.lat + (dy * step) / 110574, lon: center.lon + (dx * step) / (111320 * cos) });
    }
  }
  return spots;
}

// The nearest spot that is (almost) all cropland (DETECT.farmlandFull),
// else the nearest with at least DETECT.farmlandMin, else the one with the
// most when that is at least DETECT.widenBelowCover, else null. Spots that
// are only partly cropland are often a town's edge, with garden plots
// (real data, Sorriso, Mato Grosso: 70% cropland 4 km out, median "field"
// 2.5 ha; the soy fields 1 to 2 km further out are hundreds of hectares).
export function pickFarmland(spots, center) {
  const byDistance = [...spots].sort((a, b) => distanceKm(center, a) - distanceKm(center, b));
  const near = byDistance.find((spot) => spot.cropland >= DETECT.farmlandFull) || byDistance.find((spot) => spot.cropland >= DETECT.farmlandMin);
  if (near) return { lat: near.lat, lon: near.lon };
  const best = byDistance.reduce((top, spot) => (!top || spot.cropland > top.cropland ? spot : top), null);
  return best && best.cropland >= DETECT.widenBelowCover ? { lat: best.lat, lon: best.lon } : null;
}

function distanceKm(a, b) {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((b.lat - a.lat) * 110.574, (b.lon - a.lon) * 111.32 * cos);
}

// "north-east" etc. from a to b.
export function compassFrom(a, b) {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const angle = (Math.atan2((b.lon - a.lon) * cos, b.lat - a.lat) * 180) / Math.PI;
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[((Math.round(angle / 45) % 8) + 8) % 8];
}

// "1.2 km", "6 km".
function formatKm(m) {
  const km = m / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

// The share of a circle (centre { lat, lon }, radius in m) covered by the
// candidates whose centre is inside it.
export function coverWithin(candidates, center, radiusM) {
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const inside = (candidates || []).filter(({ centroid: [lat, lon] }) => Math.hypot((lat - center.lat) * 110574, (lon - center.lon) * 111320 * cos) <= radiusM);
  const ha = inside.reduce((sum, c) => sum + (Number(c.areaHa) || 0), 0);
  return ha / ((Math.PI * radiusM * radiusM) / 1e4);
}

// One trace of the fields in `region` (a boundary, or a circle around a
// point; then only the fields touching `keepWithin` are kept) -> candidates.
async function traceFields(ee, { region, keepWithin, boundary, crs, anchor, today, context }) {
  // The place's own growing season (its greenest month in 2019-2021), else
  // its latitude's (src/lib/season.js).
  const peakMonth = await peakMonthAt(ee, region, { context });
  const build = (plan) => {
    const pictures = detectionWindows(today, anchor.lat, peakMonth).map((window) => composite(ee, clearCollection(ee, region, window), DETECT.edgeBands));
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
        // Measured in longitude/latitude BEFORE the cut to the boundary: a
        // broken shape (the whole globe) cut down to the boundary would
        // otherwise pass as one field covering everything (real data,
        // Beauce, France, 2026-10-19: a 265 ha field equal to the drawn box).
        parcels = parcels
          .map((feature) => withArea(feature.transform("EPSG:4326", 1)))
          .filter(ee.Filter.lte("areaHa", DETECT.maxHa))
          .map((feature) => withArea(feature.setGeometry(feature.geometry().intersection(region, 1))))
          .filter(ee.Filter.gte("areaHa", minHa));
      }
      return parcels;
    };
    // Each parcel's mean NDVI and NDWI in each window (its "profile"), to
    // tell whether two touching parcels are one crop (sameCropGroups).
    const profileImage = ee.Image.cat(pictures.map((picture, i) => picture.select(DETECT.edgeBands).rename(profileKeysOf(i))));
    const keys = pictures.flatMap((_, i) => profileKeysOf(i));
    // Each parcel's season NDVI curve (10-day composites of the last
    // complete season), to join the pieces of one field (PHENOLOGY_MERGE).
    const curveWindows = DETECT.mergeByPhenology ? phenologyWindows(today, anchor.lat, peakMonth) : [];
    const curveImage = curveWindows.length
      ? ee.Image.cat(curveWindows.map((window, i) => composite(ee, clearCollection(ee, region, window), ["ndvi"]).rename(curveKey(i))))
      : null;
    // The area is measured again after the move to longitude/latitude: a
    // broken shape (it came back as the whole globe once, in Kenya) is
    // dropped before anything is measured over it.
    const finish = (parcels, minHa, max, withCurve = false) => {
      const shapes = parcels
        .sort("areaHa", false)
        .limit(max)
        .map((feature) => withArea(feature.transform("EPSG:4326", 1)))
        .filter(ee.Filter.and(ee.Filter.gte("areaHa", minHa), ee.Filter.lte("areaHa", DETECT.maxHa)));
      const image = withCurve && curveImage ? profileImage.addBands(curveImage) : profileImage;
      const names = withCurve && curveImage ? [...keys, ...curveWindows.map((_, i) => curveKey(i))] : keys;
      return image
        .reduceRegions({ collection: shapes, reducer: ee.Reducer.mean(), scale: Math.max(20, plan.scale), crs, tileScale: plan.tileScale })
        .select(["areaHa", ...names])
        .toList(max);
    };
    const coarse = trace(DETECT.cannyThreshold, DETECT.minHa);
    // The finer pieces are only used inside a kept parcel, so around a point
    // they are not cut down to the circle.
    const fine = trace(DETECT.fineCannyThreshold, DETECT.splitMinHa);
    return ee.Dictionary({
      coarse: finish(boundary ? coarse : coarse.filterBounds(keepWithin), DETECT.minHa, DETECT.maxParcels, true),
      fine: finish(fine, DETECT.splitMinHa, DETECT.maxParcels * 2),
    });
  };

  const result = await runWithRetry(build, { what: "Finding fields", context });
  // Touching parcels of the same crop are one field: their outlines are
  // joined in one more request. Parcels with the same phenology are joined
  // too unless the line between them is a real edge (one more request
  // looks at the strip along each such line).
  const parcels = parcelShapes(featuresOf(result?.coarse));
  let links = [];
  if (DETECT.mergeByPhenology) {
    const pairs = phenologyPairs(parcels).slice(0, PHENOLOGY_MERGE.maxPairs);
    if (pairs.length) {
      const strips = await runWithRetry((plan) => edgeStripRequest(ee, { region, parcels, pairs, today, anchor, peakMonth, crs, plan }), { what: "Checking the lines between field pieces", context });
      const byPair = new Map(featuresOf(strips).map((feature) => [feature.properties?.pair, feature.properties]));
      links = pairs.filter((pair, i) => !isRealEdge(byPair.get(i)));
      context.onMerge?.(
        pairs.map(([a, b], i) => ({
          a: { areaHa: parcels[a].areaHa, centroid: parcels[a].centroid },
          b: { areaHa: parcels[b].areaHa, centroid: parcels[b].centroid },
          r: round(curveCorrelation(parcels[a].curve, parcels[b].curve).r, 3),
          peakDays: round(Math.abs(curvePeakDay(parcels[a].curve) - curvePeakDay(parcels[b].curve)), 1),
          ...Object.fromEntries(["stripCropland", "edgeAny", "edgePersistent", "perimeterM"].map((key) => [key, round(numberOr(byPair.get(i)?.[key], null), 3)])),
          profileDiff: round(profileDifference(parcels[a].profile, parcels[b].profile), 3),
          straightness: stripStraightness(byPair.get(i)),
          joined: !isRealEdge(byPair.get(i)),
        })),
      );
    }
  }
  const groups = sameCropGroups(parcels, { links });
  let coarse = parcels;
  const joined = groups.filter((group) => group.length > 1);
  if (joined.length) {
    const outlines = await evaluate(
      ee.List(joined.map((group) => ee.FeatureCollection(group.map((i) => ee.Feature(ee.Geometry(parcels[i].geometry)))).union(1).first().geometry())),
      { what: "Joining the parts of each field", context },
    );
    coarse = joinGroups(parcels, groups, Array.isArray(outlines) ? outlines : []);
  }
  return toCandidates(coarse, featuresOf(result?.fine));
}

// The profile keys of detection window i: n<i> (mean NDVI), w<i> (mean NDWI).
const profileKeysOf = (i) => [`n${i}`, `w${i}`];
// The key of phenology composite i: k<i> (mean NDVI).
const curveKey = (i) => `k${i}`;

// The 10-day windows (PHENOLOGY_MERGE.stepDays) of the last complete
// growing season at this latitude (season.js), never past today.
export function phenologyWindows(today, lat, peakMonth = null) {
  const season = lastCompleteSeason(lat, today, peakMonth);
  const windows = [];
  for (let start = season.start; start < season.end && windows.length < 40; start = addDays(start, PHENOLOGY_MERGE.stepDays)) {
    const end = addDays(start, PHENOLOGY_MERGE.stepDays);
    windows.push(clampWindow({ start, end: end < season.end ? end : season.end }, today));
  }
  return windows.filter((window) => window.start < window.end);
}

// Pearson correlation of two curves over the composites both have, and
// how many that is: { r, n } (r null below 3 shared values or with a flat
// curve).
export function curveCorrelation(a = {}, b = {}) {
  const keys = Object.keys(a).filter((key) => Number.isFinite(a[key]) && Number.isFinite(b[key]));
  const n = keys.length;
  if (n < 3) return { r: null, n };
  const xs = keys.map((key) => a[key]);
  const ys = keys.map((key) => b[key]);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return { r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, n };
}

// The day (from the season start) of a curve's peak: the greenest
// composite's middle, moved by a parabola through it and its neighbours.
// Null without values.
export function curvePeakDay(curve = {}) {
  const step = PHENOLOGY_MERGE.stepDays;
  const points = Object.entries(curve)
    .map(([key, value]) => [Number(key.slice(1)), value])
    .filter(([i, value]) => Number.isInteger(i) && Number.isFinite(value))
    .sort((x, y) => x[0] - y[0]);
  if (!points.length) return null;
  let best = 0;
  points.forEach(([, value], i) => {
    if (value > points[best][1]) best = i;
  });
  const [i, y1] = points[best];
  let shift = 0;
  const before = points[best - 1];
  const after = points[best + 1];
  if (before && after && before[0] === i - 1 && after[0] === i + 1) {
    const bend = before[1] - 2 * y1 + after[1];
    if (bend < 0) shift = Math.max(-0.5, Math.min(0.5, (0.5 * (before[1] - after[1])) / bend));
  }
  return (i + 0.5 + shift) * step;
}

// True when two parcels' curves say one crop sown together
// (PHENOLOGY_MERGE: correlated, peaks close).
export function samePhenology(a, b) {
  const m = PHENOLOGY_MERGE;
  const { r, n } = curveCorrelation(a?.curve, b?.curve);
  if (r === null || n < m.minPoints || r < m.minCorrelation) return false;
  const pa = curvePeakDay(a.curve);
  const pb = curvePeakDay(b.curve);
  return pa !== null && pb !== null && Math.abs(pa - pb) <= m.maxPeakDays;
}

// The touching parcel pairs [i, j] with the same phenology that the
// profile rule (sameCropGroups) does not already join.
export function phenologyPairs(parcels) {
  const pairs = [];
  for (let i = 0; i < parcels.length; i += 1) {
    for (let j = i + 1; j < parcels.length; j += 1) {
      const diff = profileDifference(parcels[i].profile, parcels[j].profile);
      if (diff !== null && diff <= DETECT.mergeMaxDiff) continue;
      if (samePhenology(parcels[i], parcels[j]) && parcelsTouch(parcels[i], parcels[j])) pairs.push([i, j]);
    }
  }
  return pairs;
}

// The strip along the line between each pair of parcels, measured: the
// share that is cropland (stripCropland), and the shares that are a Canny
// edge in any detection window (edgeAny) and in PHENOLOGY_MERGE.
// persistentWindows windows or more (edgePersistent). One feature per pair
// (property pair = its index).
function edgeStripRequest(ee, { region, parcels, pairs, today, anchor, peakMonth, crs, plan }) {
  const m = PHENOLOGY_MERGE;
  const pictures = detectionWindows(today, anchor.lat, peakMonth).map((window) => composite(ee, clearCollection(ee, region, window), DETECT.edgeBands));
  const edgeCount = ee
    .ImageCollection(
      pictures.map((picture) =>
        ee.Algorithms.CannyEdgeDetector({ image: picture, threshold: DETECT.cannyThreshold, sigma: DETECT.cannySigma }).neq(0).reduce(ee.Reducer.max()).unmask(0).rename("edge"),
      ),
    )
    .sum();
  const cropland = ee.ImageCollection(FIELD_DATASETS.worldCover).first().select(BANDS.worldCover).eq(CROPLAND_CLASS).unmask(0);
  const image = ee.Image.cat([
    cropland.rename("stripCropland"),
    edgeCount.gte(1).rename("edgeAny"),
    edgeCount.gte(m.persistentWindows).rename("edgePersistent"),
  ]);
  const strips = ee.FeatureCollection(
    pairs.map(([i, j], k) =>
      ee.Feature(
        ee.Geometry(parcels[i].geometry).buffer(m.stripM, 1).intersection(ee.Geometry(parcels[j].geometry).buffer(m.stripM, 1), 1),
        { pair: k },
      ),
    ),
  ).map((feature) => feature.set({ perimeterM: feature.geometry().perimeter(1), stripBounds: feature.geometry().bounds(1).coordinates() }));
  return image
    .reduceRegions({ collection: strips, reducer: ee.Reducer.mean(), scale: 10, crs, tileScale: plan.tileScale })
    .select(["pair", "stripCropland", "edgeAny", "edgePersistent", "perimeterM", "stripBounds"], null, false)
    .toList(pairs.length);
}

// How straight the line between two parcels is: the diagonal of its strip's
// bounding box over half the strip's perimeter (about its length). 1 for a
// straight line, lower for a winding one or a corner. Null when unknown.
export function stripStraightness(strip) {
  const perimeter = numberOr(strip?.perimeterM, null);
  const ring = Array.isArray(strip?.stripBounds?.[0]) ? strip.stripBounds[0] : null;
  if (!(perimeter > 0) || !ring) return null;
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const w = (Math.max(...lons) - Math.min(...lons)) * 111320 * Math.cos((lat * Math.PI) / 180);
  const h = (Math.max(...lats) - Math.min(...lats)) * 110574;
  return round(Math.min(1, Math.hypot(w, h) / (perimeter / 2)), 3);
}

// True when the strip between two parcels (edgeStripRequest) is a real
// field edge, or could not be measured.
export function isRealEdge(strip) {
  const m = PHENOLOGY_MERGE;
  const cropland = numberOr(strip?.stripCropland, null);
  const any = numberOr(strip?.edgeAny, null);
  const persistent = numberOr(strip?.edgePersistent, null);
  if (cropland === null || any === null || persistent === null) return true;
  if (cropland < m.minCropland) return true;
  const straightness = stripStraightness(strip);
  if (straightness === null || straightness >= m.maxStraightness) return true;
  return any > 0 && persistent / any >= m.maxPersistentRatio;
}

// Earth Engine features (or shapes already read) -> [{ geometry, areaHa,
// centroid, profile }]: the largest polygon of each, small holes filled,
// kept from DETECT.minHa to DETECT.maxHa. profile: { n0: .., w0: .., ... }.
export function parcelShapes(features) {
  const out = [];
  for (const feature of features || []) {
    const geometry = fillSmallHoles(largestPolygon(toPolygonal(feature?.geometry)));
    if (!geometry) continue;
    const areaHa = round(geoAreaHa(geometry), 2);
    // Too small, or a broken shape (larger than any farm field).
    if (!(areaHa >= DETECT.minHa) || !(areaHa <= DETECT.maxHa)) continue;
    const props = feature.profile || feature.properties || {};
    const profile = Object.fromEntries(Object.entries(props).filter(([key, value]) => /^[nw]\d+$/.test(key) && Number.isFinite(value)));
    const curveProps = feature.curve || feature.properties || {};
    const curve = Object.fromEntries(Object.entries(curveProps).filter(([key, value]) => /^k\d+$/.test(key) && Number.isFinite(value)));
    out.push({ geometry, areaHa, centroid: ringCentroid(geometry.coordinates[0]), profile, curve, ...(feature.joined ? { joined: true } : {}) });
  }
  return out;
}

// The largest difference between two profiles over the values both have,
// or null when they share fewer than DETECT.mergeMinWindows values.
export function profileDifference(a = {}, b = {}) {
  const shared = Object.keys(a).filter((key) => Number.isFinite(a[key]) && Number.isFinite(b[key]));
  if (shared.length < DETECT.mergeMinWindows) return null;
  return Math.max(...shared.map((key) => Math.abs(a[key] - b[key])));
}

// True when two traced parcels touch: they were each grown back by
// DETECT.growBackM over the 1-pixel edge between them, so at least two
// corners of one lie inside the other.
export function parcelsTouch(a, b) {
  const [aw, as, ae, an] = bboxOf(a.geometry);
  const [bw, bs, be, bn] = bboxOf(b.geometry);
  if (aw > be || bw > ae || as > bn || bs > an) return false;
  const inside = (from, to) => from.geometry.coordinates[0].filter(([lon, lat]) => pointInGeometry(lon, lat, to.geometry)).length;
  return inside(a, b) + inside(b, a) >= 2;
}

// Groups of parcel indexes that are one field: touching, and of the same
// crop (profileDifference <= DETECT.mergeMaxDiff), or joined by `links`
// ([i, j] pairs: the same phenology and no real edge between them).
// Every parcel is in exactly one group.
export function sameCropGroups(parcels, { maxDiff = DETECT.mergeMaxDiff, links = [] } = {}) {
  const parent = parcels.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [i, j] of links) if (parent[i] !== undefined && parent[j] !== undefined && find(i) !== find(j)) parent[find(j)] = find(i);
  for (let i = 0; i < parcels.length; i += 1) {
    for (let j = i + 1; j < parcels.length; j += 1) {
      const diff = profileDifference(parcels[i].profile, parcels[j].profile);
      if (diff === null || diff > maxDiff || find(i) === find(j)) continue;
      if (parcelsTouch(parcels[i], parcels[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  parcels.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  return [...groups.values()];
}

// The parcels with each joined group replaced by its joined outline
// (`outlines`, one GeoJSON geometry per group of 2 or more, in order). A
// group whose outline did not come back whole stays as its parts.
export function joinGroups(parcels, groups, outlines) {
  const out = [];
  let k = 0;
  for (const group of groups) {
    if (group.length === 1) {
      out.push(parcels[group[0]]);
      continue;
    }
    const outline = outlines[k++];
    const geometry = fillSmallHoles(largestPolygon(toPolygonal(outline)));
    const total = group.reduce((sum, i) => sum + parcels[i].areaHa, 0);
    const areaHa = geometry ? round(geoAreaHa(geometry), 2) : 0;
    // The parts overlap by the grown-back edge, so the whole is a little
    // smaller than their sum; much smaller means the join failed.
    if (!geometry || areaHa < 0.8 * total || areaHa > DETECT.maxHa) {
      out.push(...group.map((i) => parcels[i]));
      continue;
    }
    const largest = parcels[group.reduce((best, i) => (parcels[i].areaHa > parcels[best].areaHa ? i : best), group[0])];
    out.push({ geometry, areaHa, centroid: ringCentroid(geometry.coordinates[0]), profile: largest.profile, curve: largest.curve, joined: true });
  }
  return out;
}

// ---------- Measuring fields ----------

async function analyzeFields(deps, input = {}) {
  const fields = fieldsInput(input.fields);
  const onProgress = typeof input.onProgress === "function" ? input.onProgress : null;
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = { ...contextOf(cfg), retryDelayMs: deps.retryDelayMs };
  const nowDay = isoDay(deps.now());
  const today = isDay(input.today) && input.today < nowDay ? input.today : nowDay;
  // Fields whose whole monthly history (since HISTORY_FROM) is read too,
  // in the same batched requests (`histories` in the answer).
  const historyIds = new Set((Array.isArray(input.historyFor) ? input.historyFor : []).map(String));
  // Fields whose saved history is fresh (run.js): their recent months are
  // not read again (server/field/analysis.js reads the crop from the saved
  // history), which saves one request per few fields on a big farm.
  const freshIds = new Set((Array.isArray(input.freshHistoryFor) ? input.freshHistoryFor : []).map(String));
  const warnings = [];
  const farmBox = padBbox(unionBbox(fields.map((f) => f.bbox)), 0.002);
  const region = rect(ee, farmBox);
  const center = bboxCenter(farmBox);
  const crs = utmCrs(center.lon, center.lat);
  // Seasons by the farm's own greenest month in 2019-2021 (else its
  // latitude); the damage window by each field's own place (a farm on a
  // border could have fields in two countries).
  const peakMonth = await peakMonthAt(ee, region, { context });
  const windows = analysisWindows(today, center.lat, peakMonth);
  const fireById = new Map(fields.map((field) => [field.id, fireWindows(conflictAt(bboxCenter(field.bbox).lat, bboxCenter(field.bbox).lon), today, { lat: center.lat, peakMonth })]));
  const fireSets = new Map([...fireById.values()].map((fire) => [fire.key, fire]));

  // 1. Which images exist for the damage measures, how many pictures this
  // season, and can we read the soil map?
  onProgress?.(0.01, "Checking satellite images");
  const counts = ee.Dictionary({
    chiBaseline: windows.chiBaseline.map((w) => sentinel2(ee, region, w)).reduce((all, next) => all.merge(next)).size(),
    chiSeason: sentinel2(ee, region, windows.chiSeason).size(),
    s2Passes: ee.ImageCollection(FIELD_DATASETS.sentinel2).filterBounds(region).filterDate(windows.passes.start, windows.passes.end).size(),
    vhPasses: vhCollection(ee, region, windows.passes).size(),
    // Radar per orbit direction: one direction is compared (pickPass), as
    // the same ground looks different from the east and from the west.
    ...Object.fromEntries(
      ORBIT_PASSES.flatMap((pass) => [
        ...windows.radarBaselines.map((window, i) => [`radarBaseline${i}_${pass}`, sentinel1(ee, region, window, pass).size()]),
        // Each complete war season of each damage window (method.js FIRE_YEARS).
        ...[...fireSets.values()].flatMap((fire) => fire.radarSeasons.map((season, j) => [`radarSeason_${fire.key}_${j}_${pass}`, sentinel1(ee, region, season, pass).size()])),
      ]),
    ),
    ...Object.fromEntries(
      [...fireSets.values()].flatMap((fire) => [
        [`fires_${fire.key}`, firms(ee, region, fire.window).size()],
        [`firesBase_${fire.key}`, fire.baselines.map((w) => firms(ee, region, w)).reduce((all, next) => all.merge(next)).size()],
      ]),
    ),
  });
  const [rawCounts, asset] = await Promise.all([
    evaluate(counts, { timeoutMs: 2 * 60 * 1000, what: "Checking satellite images", context }),
    checkChernozemAsset(ee, cfg.chernozemAsset),
  ]);
  const have = Object.fromEntries(Object.entries(rawCounts || {}).map(([key, value]) => [key, Math.max(0, numberOr(value, 0))]));
  if (asset.warning) warnings.push(asset.warning);
  const radarCount = (prefix) => Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, Object.entries(have).filter(([key]) => key.startsWith(prefix) && key.endsWith(`_${pass}`)).reduce((sum, [, n]) => sum + n, 0)]));
  have.radarPass = pickPass(radarCount("radarSeason"), radarCount("radarBaseline"));
  // The war seasons with radar passes from that direction, per damage
  // window (by fire.key); a season without any has nothing to compare.
  have.radarSeasonsBy = Object.fromEntries([...fireSets.values()].map((fire) => [fire.key, have.radarPass ? fire.radarSeasons.filter((_, j) => have[`radarSeason_${fire.key}_${j}_${have.radarPass}`] > 0) : []]));
  have.radarSeasonBy = Object.fromEntries(Object.entries(have.radarSeasonsBy).map(([key, list]) => [key, list.length]));
  have.radarBaselines = have.radarPass ? windows.radarBaselines.filter((_, i) => have[`radarBaseline${i}_${have.radarPass}`] > 0) : [];
  if ([...fireSets.values()].some((fire) => !fire.radarSeasons.length)) warnings.push("No growing season since the damage window began is complete yet; radar damage was not measured.");
  else if (!(have.radarBaselines.length > 0 && Object.values(have.radarSeasonBy).some((n) => n > 0))) warnings.push("No Sentinel-1 radar images for the growing seasons compared; radar damage was not measured.");
  if (!(have.chiBaseline > 0 && have.chiSeason > 0)) warnings.push(`Too few clear Sentinel-2 images for ${BASELINE.label} or the last season; the soil health index was not measured.`);

  // 2. Every request, at most PARALLEL_REQUESTS at a time: the passes
  // (Sentinel-2 and Sentinel-1 VH) and the monthly means first, then the
  // stats (they need each field's latest clear pass).
  const run = limiter(PARALLEL_REQUESTS);
  const s2Chunks = chunk(fields, passesPerRequest(have.s2Passes));
  const vhChunks = have.vhPasses > 0 ? chunk(fields, passesPerRequest(have.vhPasses)) : [];
  const recent = monthRange(addMonths(today.slice(0, 7), 1 - CROP_MONTHS), today.slice(0, 7));
  const monthJobs = [
    ...monthlyJobs(fields.filter((f) => !historyIds.has(f.id) && !freshIds.has(f.id)), recent),
    ...monthlyJobs(fields.filter((f) => historyIds.has(f.id)), monthRange(HISTORY_FROM, today.slice(0, 7))),
  ];
  const statsCount = Math.ceil(fields.length / FIELDS_PER_REQUEST) + 1;
  const total = s2Chunks.length + vhChunks.length + monthJobs.length + statsCount;
  let done = 0;
  const step = (message) => onProgress?.(Math.min(0.99, 0.02 + (0.97 * ++done) / total), message);
  const names = (part) => `${part.length} field${part.length === 1 ? "" : "s"}`;

  const passesById = new Map(fields.map((f) => [f.id, []]));
  const s2Done = Promise.all(
    s2Chunks.map((part) =>
      run(async () => {
        const result = await runWithRetry((plan) => passesRequest(ee, { region, window: windows.passes, part, crs, plan }), { what: `Reading satellite passes for ${names(part)}`, context });
        for (const feature of featuresOf(result)) {
          const p = feature.properties || {};
          if (passesById.has(p.fid) && isDay(p.date)) passesById.get(p.fid).push(p);
        }
        step("Reading satellite passes");
      }),
    ),
  );
  const vhById = new Map(fields.map((f) => [f.id, []]));
  const vhDone = Promise.all(
    vhChunks.map((part) =>
      run(async () => {
        // Radar only adds to the harvest and the crop type: without it the
        // analysis goes on (and says so).
        const result = await runWithRetry((plan) => vhRequest(ee, { region, window: windows.passes, part, crs, plan }), { what: `Reading radar passes for ${names(part)}`, context }).catch(
          (error) => {
            warnings.push(`Radar passes for ${names(part)} could not be read (${error.message}); harvest is judged from the optical images only.`);
            return null;
          },
        );
        for (const feature of featuresOf(result)) {
          const p = feature.properties || {};
          if (vhById.has(p.fid) && isDay(p.date)) vhById.get(p.fid).push(p);
        }
        step("Reading radar passes");
      }),
    ),
  );
  const monthsById = new Map(fields.map((f) => [f.id, new Map()]));
  const failedMonths = new Set();
  const monthsDone = Promise.all(
    monthJobs.map((job) =>
      run(async () => {
        const what = `Reading monthly values ${job.months[0]} to ${job.months[job.months.length - 1]} for ${names(job.part)}`;
        // The months only add the crop type (and the history): without them
        // the analysis goes on (and says so).
        const result = await runWithRetry((plan) => monthlyRequest(ee, { region, ...job, crs, plan, today }), { what, context }).catch((error) => {
          warnings.push(`${what} failed (${error.message}).`);
          for (const field of job.part) failedMonths.add(field.id);
          return null;
        });
        for (const p of readMonthly(result, job.months)) monthsById.get(p.fid)?.set(p.month, p);
        step("Reading monthly values");
      }),
    ),
  );

  // Per field: one reading per day, its clear passes and its latest window.
  const measured = new Map();
  const shared = { ee, region, crs, windows, have, assetId: asset.assetId };
  const statsDone = s2Done.then(async () => {
    const plans = fields.map((field) => ({ ...fieldPlan(field, passesById.get(field.id), { today, windows }), fire: fireById.get(field.id) }));
    // Measured per group of fields that share a latest window and a damage window.
    const groups = new Map();
    for (const plan of plans) {
      const key = `${plan.latestWindow.start}|${plan.latestWindow.end}|${plan.fire.key}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(plan);
    }
    const jobs = [];
    for (const group of groups.values()) for (const part of chunk(group, FIELDS_PER_REQUEST)) jobs.push(part);
    await Promise.all(
      jobs.map((part) =>
        run(async () => {
          const result = await runWithRetry((plan) => statsRequest(shared, part, plan), { what: `Measuring ${names(part)}`, context });
          for (const [id, value] of Object.entries(readStats(result, part))) measured.set(id, value);
          step("Measuring fields");
        }),
      ),
    );
    return plans;
  });
  const [plans] = await Promise.all([statsDone, vhDone, monthsDone]);

  // 3. The analyses.
  const updatedAt = new Date(deps.now()).toISOString();
  const analyses = {};
  const histories = {};
  for (const plan of plans) {
    const months = monthsById.get(plan.id);
    const extra = {
      vh: vhSeriesOf(vhById.get(plan.id)),
      months: recent.map((month) => monthValue(month, months.get(month))),
      peakMonth,
    };
    analyses[plan.id] = buildAnalysis(plan, measured.get(plan.id) || {}, null, { today, updatedAt, ...extra });
    // A history with a failed part is left out (run.js reads it again later).
    if (historyIds.has(plan.id) && !failedMonths.has(plan.id)) histories[plan.id] = monthRange(HISTORY_FROM, today.slice(0, 7)).map((month) => monthValue(month, months.get(month)));
  }
  onProgress?.(1, "Done");
  return historyIds.size ? { analyses, histories, warnings } : { analyses, warnings };
}

// Runs async tasks at most `limit` at a time, in the order they are given.
//   const run = limiter(4); await run(() => work());
function limiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || !queue.length) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

// How many fields go in one passes request when the season has `pictures`
// pictures: fields x pictures stays at or under PASS_ELEMENTS_PER_REQUEST.
export function passesPerRequest(pictures) {
  const n = Math.max(1, Number(pictures) || 0);
  return Math.max(1, Math.min(MAX_FIELDS_PER_PASS_REQUEST, Math.floor(PASS_ELEMENTS_PER_REQUEST / n)));
}

// The monthly-means requests for these fields and months: months in runs
// of MONTHS_PER_REQUEST, fields so that fields x months stays at or under
// MONTH_ELEMENTS_PER_REQUEST. -> [{ part, months }]
export function monthlyJobs(fields, months) {
  if (!fields.length || !months.length) return [];
  const jobs = [];
  for (const monthPart of chunk(months, MONTHS_PER_REQUEST)) {
    const perRequest = Math.max(1, Math.floor(MONTH_ELEMENTS_PER_REQUEST / monthPart.length));
    for (const part of chunk(fields, perRequest)) jobs.push({ part, months: monthPart });
  }
  return jobs;
}

// The Sentinel-2 passes request: each picture's field means (ndvi, ndwi,
// ndre, ndyi, clear share) and date, for the pictures that saw some of the
// field clearly.
function passesRequest(ee, { region, window, part, crs, plan }) {
  const fc = fieldCollection(ee, part);
  return clearCollection(ee, region, window)
    .map((image) =>
      image
        .select(["ndvi", "ndwi", "ndre", "ndyi", "clear"])
        .reduceRegions({ collection: fc, reducer: ee.Reducer.mean(), scale: plan.scale, crs, tileScale: plan.tileScale })
        .map((feature) => feature.set("date", image.date().format("YYYY-MM-dd"))),
    )
    .flatten()
    .filter(ee.Filter.gt("clear", 0))
    .select([".*"], null, false);
}

// Sentinel-1 VH pictures (IW mode, both orbit directions) over the region.
export function vhCollection(ee, region, window) {
  return ee
    .ImageCollection(FIELD_DATASETS.sentinel1)
    .filterBounds(region)
    .filterDate(window.start, window.end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", VH_BAND))
    .select(VH_BAND);
}

// The Sentinel-1 VH request: each radar picture's field mean backscatter,
// averaged as power (linear), not as dB, then sent as vhPower; with the
// date and the orbit direction.
function vhRequest(ee, { region, window, part, crs, plan }) {
  const fc = fieldCollection(ee, part);
  return vhCollection(ee, region, window)
    .map((image) =>
      // dB -> power: 10^(dB / 10) = exp(dB x ln(10) / 10).
      image
        .updateMask(image.gt(VH_MIN_DB))
        .multiply(Math.LN10 / 10)
        .exp()
        .rename("vhPower")
        .reduceRegions({ collection: fc, reducer: ee.Reducer.mean().setOutputs(["vhPower"]), scale: Math.max(VH_SCALE, plan.scale), crs, tileScale: plan.tileScale })
        .map((feature) => feature.set({ date: image.date().format("YYYY-MM-dd"), orbit: image.get("orbitProperties_pass"), relOrbit: image.get("relativeOrbitNumber_start") })),
    )
    .flatten()
    .filter(ee.Filter.notNull(["vhPower"]))
    .select([".*"], null, false);
}

// Field means of each month (clear NDVI and NDWI median composite, and the
// share of the field seen clearly at least once), as ONE image with three
// bands per month (m<i>_ndvi, m<i>_ndwi, m<i>_clear) reduced once over the
// fields. (A collection of one reduceRegions per month failed on real
// Earth Engine with "An internal error has occurred" for 16 Iowa fields,
// and once ran past the time limit for 2 demo fields; one image: 2 to 3 s.)
// Read the answer with readMonthly.
export function monthlyRequest(ee, { region, part, months, crs, plan, today }) {
  const fc = fieldCollection(ee, part);
  const scale = Math.max(plan.scale, monthlyScale(part));
  const bands = months.map((month, i) => {
    const window = clampWindow({ start: `${month}-01`, end: `${addMonths(month, 1)}-01` }, today);
    const passes = clearCollection(ee, region, window);
    const seen = passes.select(["ndvi"]).merge(ee.ImageCollection([blankImage(ee, ["ndvi"])])).count().gt(0).unmask(0);
    return ee.Image.cat([composite(ee, passes), seen]).rename(monthKeys(i));
  });
  return ee.Image.cat(bands)
    .reduceRegions({ collection: fc, reducer: ee.Reducer.mean(), scale, crs, tileScale: plan.tileScale })
    .select([".*"], null, false);
}
const monthKeys = (i) => [`m${i}_ndvi`, `m${i}_ndwi`, `m${i}_clear`];

// A monthlyRequest answer -> [{ fid, month, ndvi, ndwi, clear }].
export function readMonthly(result, months) {
  const out = [];
  for (const feature of featuresOf(result)) {
    const p = feature.properties || {};
    months.forEach((month, i) => {
      const [ndvi, ndwi, clear] = monthKeys(i);
      out.push({ fid: p.fid, month, ndvi: p[ndvi], ndwi: p[ndwi], clear: p[clear] });
    });
  }
  return out;
}

// The pixel size (m) for batched monthly means: the history scale of the
// median field of the batch, at least 20 m (a field mean needs no more).
export function monthlyScale(fields) {
  const areas = (fields || []).map((f) => Number(f.areaHa) || 0).sort((a, b) => a - b);
  return Math.max(20, historyScale(areas.length ? areas[Math.floor(areas.length / 2)] : 0));
}

// One month's answer -> { month, ndvi, ndwi, clearPct } (values only when
// at least MIN_CLEAR_SHARE of the field was seen clearly, like a pass).
export function monthValue(month, p = {}) {
  const clear = clamp01(numberOr(p?.clear, 0));
  const seen = clear >= MIN_CLEAR_SHARE;
  return { month, ndvi: seen ? round(numberOr(p?.ndvi, null), 3) : null, ndwi: seen ? round(numberOr(p?.ndwi, null), 3) : null, clearPct: Math.round(clear * 100) };
}

// Radar answers for one field -> { passes, series }:
//   passes  every picture: [{ date, vh (dB), orbit, relOrbit }] by date
//           (the raw reading; vh from the mean backscatter power)
//   series  the cleaned VH series method.js radarHarvest reads, one value
//           per day: [{ date, vh }]
// Real VH over one field jumps 3 to 5 dB from one picture to the next with
// rain or dew (real data, demo farm, September 2026, stubble: -24.0, -16.1,
// -20.3, -23.0 dB in 6 days), which a plain "3 dB drop" rule reads as a
// harvest. Cleaning: same-day pictures (overlapping scenes, both orbit
// directions) are averaged, then a running median of VH_CLEAN.window days
// (at the two ends, of the days there are): one odd picture goes, a real
// step (a crop cut down) stays on its day, because a median keeps steps.
// Real data, Iowa, 2026-10-19: corn and soybean fields cut between 27
// September and 9 October fell 5 to 8 dB and stayed down; standing ones
// moved less than 1.5 dB. Removing each relative orbit's own offset (its
// season median) was tried and dropped: the orbits see different weeks,
// so the offsets were biased and added 2 dB steps to clean series.
export const VH_CLEAN = { window: 3 };

export function vhSeriesOf(features) {
  const passes = (features || [])
    .map((p) => {
      const power = numberOr(p?.vhPower, null);
      if (!(power > 0) || !isDay(p.date)) return null;
      const relOrbit = numberOr(p.relOrbit, null);
      return { date: p.date, vh: round(10 * Math.log10(power), 2), orbit: typeof p.orbit === "string" ? p.orbit : null, relOrbit: Number.isInteger(relOrbit) ? relOrbit : null };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.orbit).localeCompare(String(b.orbit)) || (a.relOrbit ?? 0) - (b.relOrbit ?? 0));
  return { passes, series: cleanVh(passes) };
}

// The cleaning above: [{ date, vh }] -> [{ date, vh }], one per day.
export function cleanVh(passes) {
  const byDay = new Map();
  for (const p of passes || []) if (isDay(p?.date) && Number.isFinite(p.vh)) byDay.set(p.date, [...(byDay.get(p.date) || []), p.vh]);
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, values]) => ({ date, vh: values.reduce((s, v) => s + v, 0) / values.length }));
  const half = Math.floor(VH_CLEAN.window / 2);
  return days.map((day, i) => ({ date: day.date, vh: round(median(days.slice(Math.max(0, i - half), i + half + 1).map((d) => d.vh)), 2) }));
}

// The season's radar peak, for the crop type: the highest value of the
// cleaned series within VH_PEAK_DAYS of the NDVI peak (a crop gives its
// strongest return when it is fullest; frozen or snowy ground in winter
// can read brighter still). { vhPeak, vhPeakDate } (null with fewer than
// 3 days in that span, or no NDVI peak).
export const VH_PEAK_DAYS = 30;
export function vhPeakOf(series, peakDate = null) {
  if (!isDay(peakDate)) return { vhPeak: null, vhPeakDate: null };
  const from = shiftDays(peakDate, -VH_PEAK_DAYS);
  const to = shiftDays(peakDate, VH_PEAK_DAYS);
  const near = (series || []).filter((p) => p.date >= from && p.date <= to && Number.isFinite(p.vh));
  if (near.length < 3) return { vhPeak: null, vhPeakDate: null };
  const best = near.reduce((top, p) => (p.vh > top.vh ? p : top));
  return { vhPeak: round(best.vh, 2), vhPeakDate: best.date };
}


// The stats request for one group of fields: per-field numbers, stress
// patches and the normal curve, as one ee.Dictionary.
function statsRequest({ ee, region, crs, windows, have, assetId }, part, plan) {
  const fc = fieldCollection(ee, part);
  const latestWindow = part[0].latestWindow;
  const latest = composite(ee, clearCollection(ee, region, latestWindow), FIELD_BANDS);
  const yearlyCollections = normalWindows(latestWindow).map((window) => clearCollection(ee, region, window));
  const yearly = yearlyCollections.map((collection) => composite(ee, collection, FIELD_BANDS));
  const normal = normalOfYears(ee, yearly);
  const images = conditionImages(ee, { latest, normal, fc, crs, plan });

  const fire = part[0].fire;
  const radarSeasons = have.radarSeasonsBy?.[fire.key] || [];
  const radarChanged =
    have.radarBaselines.length > 0 && radarSeasons.length
      ? radarChangeImage(ee, { region, seasons: radarSeasons, baselines: have.radarBaselines, pass: have.radarPass, fc, crs, plan })
      : emptyBand(ee, "radarChanged");
  const chiDrop =
    have.chiBaseline > 0 && have.chiSeason > 0
      ? chiHealthImage(ee, region, windows.chiBaseline).subtract(chiHealthImage(ee, region, windows.chiSeason)).rename("chiDrop")
      : emptyBand(ee, "chiDrop");
  // Fire days per ~1 km pixel in each war year of the damage window (fy0,
  // fy1, ...: fireWindows years), in the whole window and in 2019-2021: the
  // field's worst war year is worked out from them (method.js
  // worstFireYear).
  const fireDays = (list, name) =>
    list
      .map((window) => firms(ee, region, window))
      .reduce((all, next) => all.merge(next))
      .count()
      .unmask(0)
      .rename(name);
  const anyFires = have[`fires_${fire.key}`] > 0;
  const firesNow = anyFires ? fireDays([fire.window], "fires") : ee.Image.constant(0).rename("fires");
  const firesBase = have[`firesBase_${fire.key}`] > 0 ? fireDays(fire.baselines, "firesBase") : ee.Image.constant(0).rename("firesBase");
  const yearBands = fireYearImages(ee, { region, fire, anyFires });

  const meanBands = [
    ...yearly.flatMap((image, i) => FIELD_BANDS.map((band) => image.select(band).rename(`n${BASELINE_YEARS[i]}_${band}`))),
    images.stressed,
    images.redEdgeOnly,
    images.ndwiAnomaly,
    radarChanged,
    chiDrop,
    chernozemImage(ee, assetId).rename("chernozem"),
  ];
  const reduce = (image, reducer, scale = plan.scale) =>
    image.reduceRegions({ collection: fc, reducer, scale, crs, tileScale: plan.tileScale }).select([".*"], null, false);

  // Half-month NDVI of each baseline year (24 bands per year). Each
  // composite reads only its own 15 days (filtered BEFORE Cloud Score+ is
  // linked): one cloud-masked collection per year, filtered afterwards, ran
  // out of memory on real Earth Engine where Sentinel-2 tiles overlap (Iowa,
  // 41.99 N 93.70 W, 2026-10-18: "User memory limit exceeded" even for 4
  // fields; per-window collections: 8 fields in 9 s).
  const curveBands = BASELINE_YEARS.flatMap((year) =>
    CURVE_DAYS.map((day, i) => composite(ee, clearCollection(ee, region, curveWindow(year, day)), ["ndvi"]).rename(curveBand(year, i))),
  );

  // Stressed blobs of PATCH_MIN_HA or more, outlined, each with the mean
  // NDWI anomaly of its pixels (method.js stressCause).
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
    .map((feature) => feature.set("areaHa", feature.geometry().area(1).divide(1e4)))
    .filter(ee.Filter.gte("areaHa", PATCH_MIN_HA))
    .sort("areaHa", false)
    .limit(MAX_PATCHES * part.length * 3);
  const patchesMeasured = images.ndwiAnomaly
    .reduceRegions({ collection: patches, reducer: ee.Reducer.mean().setOutputs(["ndwiAnomaly"]), scale: plan.scale, crs, tileScale: plan.tileScale })
    .map((feature) => {
      const shape = feature.geometry();
      return ee.Feature(null, { areaHa: feature.get("areaHa"), ndwiAnomaly: feature.get("ndwiAnomaly"), centroid: shape.centroid(1).coordinates(), bounds: shape.bounds(1).coordinates() });
    });

  // .toList: a FeatureCollection nested inside an ee.Dictionary comes back
  // from real Earth Engine WITHOUT its features (only a description), so
  // each one is sent as a list of features.
  const asList = (collection, max = part.length) => collection.toList(max);
  return ee.Dictionary({
    // The field's scores are the medians of the per-pixel scores (the same
    // pixels the zone map shows), not scores of the field-median NDVI.
    medians: asList(reduce(ee.Image.cat([latest, images.health, images.water, images.condition]), ee.Reducer.median())),
    means: asList(reduce(ee.Image.cat(meanBands), ee.Reducer.mean())),
    // At the field's own pixel size, not FIRMS's 1 km: a narrow strip field
    // (real data, Daqing, Heilongjiang: 1.7 ha, about 20 m wide) holds no
    // 100 m pixel centre and came back with no fire count at all.
    fires: asList(reduce(ee.Image.cat([firesNow, firesBase, ...yearBands]), ee.Reducer.max())),
    curve: asList(reduce(ee.Image.cat(curveBands), ee.Reducer.mean(), Math.max(20, plan.scale))),
    patches: asList(patchesMeasured, MAX_PATCHES * part.length * 3),
  });
}

// Sentinel-1 VV over several windows, one collection.
function mergedS1(ee, region, windows, pass) {
  return windows.map((window) => sentinel1(ee, region, window, pass)).reduce((all, next) => all.merge(next));
}

// The fire days of each war year of a damage window (fire.years), per
// pixel, as bands fy0, fy1, ... (the same years as the Atlas: method.js
// fireYears).
function fireYearImages(ee, { region, fire, anyFires }) {
  const years = fire.years || [];
  if (!anyFires) return years.map((_, i) => ee.Image.constant(0).rename(`fy${i}`));
  return years.map((year, i) => firms(ee, region, year).count().unmask(0).rename(`fy${i}`));
}

// Radar change that marks cratering or compaction, per war season: the
// season's median VV against the median of the same months of 2019-2021
// (all their passes in one collection, as in the Atlas: gee.js), MINUS the
// field's own median change that season. Crop rotation and soil moisture
// shift a whole field by 3-6 dB from one summer to the next (real data,
// demo farm: 61-97% of each field "changed" by 3 dB between 2021 and
// 2019-2020, before the war); craters, trenches and burnt patches change
// parts of a field. A pixel counts (radarChanged, 0/1) when its change is
// RADAR_CHANGE_DB or more in at least two war seasons (with one season
// measured, that one): the Atlas's lasting change (src/lib/atlas/method.js
// radarPersistence), so one season's rotation is not damage and a later
// ordinary season never hides a cratered one.
// Only one orbit direction (`pass`, gee.js pickPass) is used, in both.
function radarChangeImage(ee, { region, seasons, baselines, pass = null, fc, crs, plan }) {
  const before = mergedS1(ee, region, baselines, pass).median();
  const NONE = -1;
  const changes = seasons.map((season) => {
    const change = sentinel1(ee, region, season, pass).median().subtract(before).rename("change");
    const fieldShift = change
      .reduceRegions({ collection: fc, reducer: ee.Reducer.median().setOutputs(["shift"]), scale: plan.scale, crs, tileScale: plan.tileScale })
      .filter(ee.Filter.notNull(["shift"]))
      .reduceToImage({ properties: ["shift"], reducer: ee.Reducer.first() });
    return change.subtract(fieldShift).abs().unmask(NONE);
  });
  let peak = changes[0];
  for (const change of changes.slice(1)) peak = peak.max(change);
  let second = ee.Image.constant(NONE);
  for (let i = 0; i < changes.length; i += 1) {
    for (let j = i + 1; j < changes.length; j += 1) second = second.max(changes[i].min(changes[j]));
  }
  const level = second.where(second.lt(0), peak);
  return level.gte(RADAR_CHANGE_DB).updateMask(peak.gte(0)).rename("radarChanged");
}

// ---------- History ----------

async function fieldHistory(deps, { field, from = HISTORY_FROM, to } = {}) {
  const [one] = fieldsInput([field]);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = { ...contextOf(cfg), retryDelayMs: deps.retryDelayMs };
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
              scale: Math.max(plan.scale, historyScale(one.areaHa)),
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

// The monthly history of several fields at once (batched: every month's
// composite is made once for the farm and read over all the fields), the
// same answer as fieldHistory per field.
//   fields      the fields; from / to: "YYYY-MM" (from HISTORY_FROM, to
//               this month)
// -> { [fieldId]: [{ month, ndvi, ndwi, clearPct }] }
async function fieldHistories(deps, { fields, from = HISTORY_FROM, to, onProgress } = {}) {
  const list = fieldsInput(fields);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = { ...contextOf(cfg), retryDelayMs: deps.retryDelayMs };
  const today = isoDay(deps.now());
  const thisMonth = today.slice(0, 7);
  const first = isMonth(from) ? (from < HISTORY_FROM ? HISTORY_FROM : from) : HISTORY_FROM;
  const last = isMonth(to) && to < thisMonth ? to : thisMonth;
  const months = monthRange(first, last);
  if (!months.length) return Object.fromEntries(list.map((f) => [f.id, []]));
  const box = padBbox(unionBbox(list.map((f) => f.bbox)), 0.001);
  const center = bboxCenter(box);
  const crs = utmCrs(center.lon, center.lat);
  const region = rect(ee, box);
  const jobs = monthlyJobs(list, months);
  const byId = new Map(list.map((f) => [f.id, new Map()]));
  let done = 0;
  await mapLimit(jobs, PARALLEL_REQUESTS, async (job) => {
    const result = await runWithRetry((plan) => monthlyRequest(ee, { region, ...job, crs, plan, today }), {
      what: `Reading the history ${job.months[0]} to ${job.months[job.months.length - 1]}`,
      context,
    });
    for (const p of readMonthly(result, job.months)) byId.get(p.fid)?.set(p.month, p);
    onProgress?.(++done / jobs.length, "Reading the field history");
  });
  return Object.fromEntries(list.map((f) => [f.id, months.map((month) => monthValue(month, byId.get(f.id).get(month)))]));
}

// The pixel size (m) a field's monthly history is read at: about
// HISTORY_PIXELS pixels over the field, 10 to 100 m. A field mean needs no
// more, and 10 m pixels over a 600 ha field for 30 months ran past Earth
// Engine's time limit (real data, Mato Grosso, 2026-10-19).
export const HISTORY_PIXELS = 2500;
export function historyScale(areaHa) {
  const side = Math.sqrt((Math.max(0, Number(areaHa) || 0) * 1e4) / HISTORY_PIXELS);
  return Math.min(100, Math.max(10, Math.ceil(side / 10) * 10));
}

// ---------- GeoTIFF download ----------

async function geotiffUrl(deps, { field, latestPassDate = null, analysis = null } = {}) {
  const [one] = fieldsInput([field]);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = { ...contextOf(cfg), retryDelayMs: deps.retryDelayMs };
  const today = isoDay(deps.now());
  const passDate = isDay(latestPassDate) ? latestPassDate : isDay(analysis?.latestPass?.date) ? analysis.latestPass.date : null;
  const window = latestWindowFor(passDate, today);
  const center = bboxCenter(one.bbox);
  const crs = utmCrs(center.lon, center.lat);
  const region = rect(ee, padBbox(one.bbox, 0.001));
  const shape = ee.Geometry(one.geometry);
  const fc = fieldCollection(ee, [one]);
  const latest = composite(ee, clearCollection(ee, region, window), FIELD_BANDS);
  const normal = normalOfYears(ee, normalWindows(window).map((w) => composite(ee, clearCollection(ee, region, w), FIELD_BANDS)));
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

// The fields to measure, checked: [{ id, name, geometry, areaHa, bbox, grid,
// crop }]. crop: the farmer's own choice (cropSource "user"), else null
// (a placeholder or a detected crop is not the farmer's word).
export function fieldsInput(fields) {
  if (!Array.isArray(fields) || !fields.length) throw new GeeError("bad_request", "No fields to measure.");
  return fields.map((field) => {
    const geometry = toPolygonal(field?.geometry?.type === "Feature" ? field.geometry.geometry : field?.geometry);
    if (!field?.id || !geometry) throw new GeeError("bad_request", `Field ${field?.name || field?.id || "?"} has no valid outline.`);
    const bbox = bboxOf(geometry);
    const areaHa = Number.isFinite(field.areaHa) && field.areaHa > 0 ? field.areaHa : geoAreaHa(geometry);
    const crop = field.cropSource === "user" && typeof field.crop === "string" && field.crop.trim() ? field.crop : null;
    return { id: String(field.id), name: field.name || null, geometry, areaHa, bbox, grid: zoneGrid(bbox), crop };
  });
}

// The six NDVI windows used to trace edges: the early, middle and late
// thirds of the last complete growing season at this latitude and of the
// season before (src/lib/season.js). Never past `today`.
//   peakMonth  the place's greenest month (1-12), when known
export function detectionWindows(today, lat, peakMonth = null) {
  return seasonDetectionWindows(lat, today, peakMonth).map((window) => clampWindow(window, today));
}

// Every date window an analysis uses ({ start, end }, end not included,
// never past `today`), by the farm's latitude (src/lib/season.js):
//   seasonStart    where this season's curve starts (seasonCurveStart: a
//                  month before the season, or 8 months back)
//   passes         from the earlier of seasonStart and 90 days back, to today
//   chiSeason      the last complete growing season; chiBaseline: the same
//                  months of 2019, 2020 and 2021 (one composite, as in the Atlas)
//   radarSeason    the last complete growing season; radarBaselines: the same
//                  months of 2019, 2020 and 2021 (damage radar compares every
//                  complete war season, fireWindows radarSeasons, with them)
// In the north that is April to September, in the south October to March
// (across the new year), in the tropics the last 12 whole months.
//   peakMonth  the farm's greenest month (1-12) in 2019-2021, when known
//              (gee.js peakMonthAt): the season is then the 3 months before
//              it, it and the 2 after (Australia's winter wheat: May to
//              October), else the latitude's
export function analysisWindows(today, lat, peakMonth = null) {
  const seasonStart = seasonCurveStart(lat, today, peakMonth);
  const lookback = shiftDays(today, -LOOKBACK_DAYS);
  const stop = (window) => clampWindow(window, today);
  const last = lastCompleteSeason(lat, today, peakMonth);
  const season = stop({ start: last.start, end: last.end });
  return {
    band: last.band,
    peakMonth: last.peakMonth,
    seasonLabel: last.label,
    seasonStart,
    passes: stop({ start: lookback < seasonStart ? lookback : seasonStart, end: today }),
    chiBaseline: baselineWindows(season),
    chiSeason: season,
    radarBaselines: baselineWindows(season),
    radarSeason: season,
  };
}

// The fire windows for one field:
//   conflict   the known war covering it (server/conflicts.js conflictAt), or null
//   lat, peakMonth  the farm's latitude and greenest month (for radarSeasons)
// Gives back
//   window        the damage window (damageWindow: from the war start, else
//                 the last 2 years), cut off at today
//   days          its length in days
//   years         its war years (src/lib/atlas/method.js fireYears: from
//                 the war's start, at peace back from today): the fire
//                 evidence is the worst year's excess
//   baselines     the normal years to take the usual fire count from: the
//                 whole of 2019 to 2021 (a normal year is a third of it)
//   baselineDays  their total length in days
//   radarSeasons  every complete growing season inside the window
//                 (src/lib/season.js damageSeasons; empty without lat)
//   conflict      { id, name, since } or null
//   key           a short name for this set (for grouping fields)
export function fireWindows(conflict, today, { lat = null, peakMonth = null } = {}) {
  const damage = damageWindow(conflict || null, today);
  const window = clampWindow({ start: damage.start, end: damage.end }, today);
  const days = daysBetween(window.start, window.end);
  const baselines = [{ start: `${BASELINE.from}-01-01`, end: `${BASELINE.to + 1}-01-01` }];
  const baselineDays = baselines.reduce((sum, w) => sum + daysBetween(w.start, w.end), 0);
  const years = fireYears(window, { anchor: conflict ? "start" : "end" });
  const radarSeasons = Number.isFinite(lat) ? damageSeasons(lat, today, window.start, peakMonth) : [];
  const summary = conflict ? { id: conflict.id, name: conflict.name, since: conflict.since } : null;
  return { window, days, years, baselines, baselineDays, radarSeasons, conflict: summary, key: (summary?.id || "none").replace(/[^\w]/g, "_") };
}

// Fires above the usual count in the field's WORST war year (method.js
// worstFireYear): per year, the fire days minus a normal year's (the
// 2019-2021 count / 3), never below 0; the largest.
//   fires      fire days in the whole window (kept for the record)
//   baseFires  fire days in 2019-2021
//   fire       fireWindows() result
//   bands      the measured fire bands ({ fy0, fy1, ... }, one per year)
// Gives back { fires, firesNormal, excessFires, fireYear } for the worst
// year (fires: that year's fire days, firesNormal: its usual count,
// fireYear: { start, end }), all null where nothing was measured. Without
// year bands (an older answer) the whole window counts as one year.
export function excessFiresOf(fires, baseFires, fire, bands = null) {
  const none = { fires: null, firesNormal: null, excessFires: null, fireYear: null };
  if (!Number.isFinite(fires)) return none;
  const years = fire?.years || [];
  const perYear = years.map((_, i) => numberOr(bands?.[`fy${i}`], null));
  const known = years.length && perYear.some(Number.isFinite);
  // Without year bands: the whole window against the normal rate x its length.
  const whole = () => {
    const normal = Number.isFinite(baseFires) && fire?.baselineDays > 0 ? (Math.max(0, baseFires) / fire.baselineDays) * fire.days : 0;
    return { excess: Math.max(0, fires - normal), fires, normal, year: fire?.window ? { start: fire.window.start, end: fire.window.end } : null };
  };
  const worst = known ? worstFireYear(perYear, baseFires, years) : whole();
  if (!Number.isFinite(worst.excess)) return none;
  const firesNormal = Number.isFinite(baseFires) ? round(worst.normal, 1) : null;
  return { fires: Math.round(worst.fires ?? 0), firesNormal, excessFires: round(worst.excess, 1), fireYear: worst.year };
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000));
}

// The window the latest condition is measured over: the last 30 days, or
// the 30 days up to the latest clear pass when that is older (up to 90 days).
export function latestWindowFor(latestClearDate, today) {
  const recent = { start: shiftDays(today, -LATEST_DAYS), end: today };
  if (!isDay(latestClearDate) || latestClearDate >= recent.start || latestClearDate < shiftDays(today, -LOOKBACK_DAYS)) return recent;
  return clampWindow({ start: shiftDays(latestClearDate, 1 - LATEST_DAYS), end: shiftDays(latestClearDate, 1) }, today);
}

// The same weeks in each baseline year (2019, 2020, 2021): the window moved
// to that year (src/lib/season.js baselineWindows).
export function normalWindows(window) {
  return baselineWindows(window, BASELINE_YEARS);
}
export function normalWindow(window, year) {
  return sameWindowIn(window, year);
}

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
export function fieldPlan(field, passes, { today, windows = analysisWindows(today, field?.bbox ? (field.bbox[1] + field.bbox[3]) / 2 : undefined) }) {
  const daily = oneReadingPerDay((passes || []).filter((p) => p.date < today));
  const clear = daily.filter((p) => numberOr(p.clear, 0) >= MIN_CLEAR_SHARE && Number.isFinite(numberOr(p.ndvi, null)));
  const latest = clear[clear.length - 1] || null;
  const inLookback = latest && latest.date >= shiftDays(today, -LOOKBACK_DAYS);
  const season = clear
    .filter((p) => p.date >= windows.seasonStart)
    .map((p) => ({
      date: p.date,
      ndvi: round(numberOr(p.ndvi, null), 3),
      ndwi: round(numberOr(p.ndwi, null), 3),
      ndre: round(numberOr(p.ndre, null), 3),
      ndyi: round(numberOr(p.ndyi, null), 3),
      clearPct: Math.round(clamp01(numberOr(p.clear, 0)) * 100),
    }));
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
    if (owner) out[owner.id].patches.push({ lat, lon, ha: numberOr(p.areaHa, 0), bounds: p.bounds, ndwiAnomaly: numberOr(p.ndwiAnomaly, null) });
  }
  return out;
}

// A stress patch -> { lat, lon, radiusM, ha, ndwiAnomaly, cause }: a circle
// around it (half the diagonal of its bounding box, at least 15 m), the
// mean NDWI anomaly of its pixels and the likely cause (method.js
// stressCause: "dry" or "other").
export function patchCircle({ lat, lon, ha, bounds, ndwiAnomaly = null }) {
  const ring = Array.isArray(bounds?.[0]) ? bounds[0] : [];
  const lons = ring.map((p) => p[0]).filter(Number.isFinite);
  const lats = ring.map((p) => p[1]).filter(Number.isFinite);
  let radiusM = Math.sqrt((ha * 1e4) / Math.PI);
  if (lons.length && lats.length) {
    const w = (Math.max(...lons) - Math.min(...lons)) * 111320 * Math.cos((lat * Math.PI) / 180);
    const h = (Math.max(...lats) - Math.min(...lats)) * 110574;
    radiusM = Math.max(radiusM, Math.hypot(w, h) / 2);
  }
  const anomaly = round(numberOr(ndwiAnomaly, null), 3);
  return { lat: round(lat, 6), lon: round(lon, 6), radiusM: Math.max(15, Math.round(radiusM)), ha: round(ha, 2), ndwiAnomaly: anomaly, cause: stressCause(anomaly) };
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

// Everything measured for one field -> its analysis (spec section 3 and
// FINAL-SPEC section 8, without `status` and the harvest window, which the
// route layer adds; it may work the harvest, stress and crop out again
// with the weather and the farmer's crop).
//   plan      fieldPlan() result (+ fire)
//   measured  readStats() result for the field
//   zones     null (no longer measured, spec 7.7) or a zones grid
//   extra     { today, updatedAt, vhSeries, months, peakMonth }:
//             vh         vhSeriesOf() result { passes, series }
//             months     the last CROP_MONTHS months [{ month, ndvi, ndwi, clearPct }]
//             peakMonth  the farm's greenest month in 2019-2021 (or null)
// Raw readings added for the route layer and the crop type:
//   redEdge.ndre / redEdge.normal  field median NDRE and its normal range
//   stress.ndwiAnomaly             mean NDWI anomaly over the stressed pixels
//   stress.redEdgeOnlyShare        share stressed by red edge only
//   stress.cause / stress.redEdge  method.js stressCause / redEdgeFound
//   stress.patches[].ndwiAnomaly, .cause
//   season[].ndre, season[].ndyi   per pass
//   radar                          { vhSeries (cleaned, per day), vhPasses (raw, per
//                                  picture), vhPeak, vhPeakDate, harvestedOn, dropDb }
//   cropInputs                     { months: [{ month, ndvi }], peakMonth, lat, vhPeak }
//                                  (with passes = season: classifyCrop's input)
//   cropDetected                   classifyCrop(cropInputs + season)
//   harvest.basis / gdd / radarHarvestOn / standingDry
//                                  (combineHarvestEstimate without heat units)
export function buildAnalysis(plan, measured, zones, { today, updatedAt, vh = { passes: [], series: [] }, months = [], peakMonth = null }) {
  const vhSeries = vh?.series || [];
  const warnings = [];
  const med = measured.medians || {};
  const means = measured.means || {};
  const hasLatest = Boolean(plan.latestPass);
  const ndvi = hasLatest ? round(numberOr(med.ndvi, null), 3) : null;
  const ndwi = hasLatest ? round(numberOr(med.ndwi, null), 3) : null;
  const ndre = hasLatest ? round(numberOr(med.ndre, null), 3) : null;
  const normalNdvi = range(BASELINE_YEARS.map((y) => numberOr(means[`n${y}_ndvi`], null)));
  const normalNdwi = range(BASELINE_YEARS.map((y) => numberOr(means[`n${y}_ndwi`], null)));
  const normalNdre = range(BASELINE_YEARS.map((y) => numberOr(means[`n${y}_ndre`], null)));
  if (!plan.latestPass) warnings.push(`No clear satellite view of this field in the last ${LOOKBACK_DAYS} days.`);
  else if (plan.latestPass.date < shiftDays(today, -LATEST_DAYS)) warnings.push(`The latest clear view is from ${plan.latestPass.date}.`);
  if (normalNdvi.median === null) warnings.push(`No clear images of these weeks in ${BASELINE.label}, so there is no normal to compare with.`);

  // Scores: the median of the per-pixel scores over the field (what the
  // sample data does too); worked out from the field medians only when
  // Earth Engine gave no pixel score.
  const pixelScore = (name) => (hasLatest ? round(clamp01(numberOr(med[name], NaN)), 3) : null);
  const known = (value) => (Number.isFinite(value) ? value : null);
  const healthValue = known(pixelScore("health")) ?? healthScore(ndvi, normalNdvi.median);
  const waterValue = known(pixelScore("water")) ?? waterScore(ndwi, normalNdwi.median);
  const share = hasLatest ? round(clamp01(numberOr(means.stressed, NaN)), 3) : null;
  const stressShare = Number.isFinite(share) ? share : null;
  const conditionValue = hasLatest ? known(pixelScore("condition")) ?? conditionScore({ health: healthValue, water: waterValue, stress: stressShare }) : null;
  const patches = hasLatest ? (measured.patches || []).sort((a, b) => b.ha - a.ha).slice(0, MAX_PATCHES).map(patchCircle) : [];
  const anyStress = stressShare !== null && stressShare > 0;
  const ndwiAnomaly = hasLatest && anyStress ? round(numberOr(means.ndwiAnomaly, null), 3) : null;
  const redEdgeOnlyShare = hasLatest ? round(clamp01(numberOr(means.redEdgeOnly, NaN)), 3) : null;

  const radarChangedShare = round(numberOr(means.radarChanged, null), 3);
  const { fires, firesNormal, excessFires, fireYear } = excessFiresOf(numberOr(measured.fires?.fires, null), numberOr(measured.fires?.firesBase, null), plan.fire, measured.fires);
  const chiDrop = round(numberOr(means.chiDrop, null), 3);
  const chernozem = round(numberOr(means.chernozem, null), 3);

  // Crop type (method.js classifyCrop) from the last months, this season's
  // passes and the radar peak; the farmer's own crop wins for the harvest.
  // The VH peak is read around the season's NDVI peak (harvestStage).
  const firstLook = harvestStage(plan.season, today);
  const { vhPeak, vhPeakDate } = vhPeakOf(vhSeries, firstLook.peakDate);
  const lat = Array.isArray(plan.bbox) ? round(bboxCenter(plan.bbox).lat, 4) : null;
  const cropInputs = { months: months.map((m) => ({ month: m.month, ndvi: m.ndvi })), peakMonth: peakMonth ?? null, lat, vhPeak };
  const cropDetected = classifyCrop({ ...cropInputs, passes: plan.season });
  // A detected crop is used for this season's harvest only when it was
  // read from this season (its curve has peaked and come down); otherwise
  // it is last season's crop (real data, Pampas, 2026-10-19: last summer's
  // soybean on a field now in winter wheat).
  // Fallow or grass has no crop profile: no crop rules for it.
  const crop = plan.crop || (CROP_PROFILES[cropDetected.id] && cropDetected.season === "this" && seasonDone(plan.season) ? cropDetected.id : null);

  // Harvest: the dry-down curve with the crop's own ready share, checked
  // against radar (a tall crop cut shows as a VH drop through cloud; a
  // tall crop low on NDVI with no drop is still standing).
  const stage = crop ? harvestStage(plan.season, today, { readyShare: cropProfile(crop).readyShare }) : firstLook;
  const { radar, leavesDownOn } = radarForHarvest({ vhSeries, season: plan.season, peakDate: stage.peakDate, crop });
  const harvest = combineHarvestEstimate({ ndvi: stage, gdd: null, radar, crop, today, leavesDownOn });

  return {
    fieldId: plan.id,
    provider: "gee",
    updatedAt,
    latestPass: plan.latestPass,
    water: { ndwi, normal: normalNdwi, versus: versusNormal(ndwi, normalNdwi.low, normalNdwi.high), score: waterValue },
    plantHealth: { ndvi, normal: normalNdvi, versus: versusNormal(ndvi, normalNdvi.low, normalNdvi.high), score: healthValue },
    redEdge: { ndre, normal: normalNdre },
    stress: {
      share: stressShare,
      level: stressLevel(stressShare),
      stressedHa: stressShare === null ? null : round(stressShare * plan.areaHa, 1),
      patches,
      ndwiAnomaly,
      redEdgeOnlyShare,
      cause: anyStress ? stressCause(ndwiAnomaly) : null,
      redEdge: anyStress && redEdgeFound(redEdgeOnlyShare),
    },
    harvest: {
      stage: harvest.stage,
      daysToReady: harvest.daysToReady ?? null,
      window: null,
      rainBefore: null,
      peak: round(stage.peak, 3),
      peakDate: stage.peakDate ?? null,
      lastDate: stage.lastDate ?? null,
      harvestedOn: harvest.harvestedOn ?? null,
      basis: harvest.basis ?? null,
      gdd: harvest.gdd ?? null,
      radarHarvestOn: harvest.radarHarvestOn ?? null,
      standingDry: Boolean(harvest.standingDry),
      leafDrop: Boolean(harvest.leafDrop),
    },
    condition: { score: conditionValue, class: conditionClass(conditionValue)?.id ?? null },
    damage: {
      detected: damageDetected({ radarChangedShare, excessFires, chiDrop, atWar: Boolean(plan.fire?.conflict) }),
      radarChangedShare,
      fires,
      firesNormal,
      excessFires,
      fireYear,
      since: plan.fire?.window?.start ?? null,
      chiDrop,
      damagedHa: damagedArea({ radarChangedShare, excessFires, chiDrop, atWar: Boolean(plan.fire?.conflict) }, plan.areaHa),
    },
    conflict: plan.fire?.conflict ?? null,
    soil: { chernozemProbability: chernozem, soilTypeId: soilTypeFor(chernozem) },
    season: plan.season,
    normalCurve: normalCurve(measured.curve || {}),
    radar: { vhSeries, vhPasses: vh?.passes || [], vhPeak, vhPeakDate, harvestedOn: radar.harvestedOn, dropDb: radar.dropDb },
    cropInputs,
    cropDetected,
    zones: zones ?? null,
    warnings,
  };
}

// True when this season's curve has peaked and come down (the crop type is
// then read from this season; method.js classifyCrop does the same).
export function seasonDone(season) {
  const series = cleanSeries(season || []);
  if (series.length < 5) return false;
  const i = series.reduce((best, p, k) => (p.ndvi > series[best].ndvi ? k : best), 0);
  const peak = series[i].ndvi;
  return peak >= NOT_SOWN_PEAK && series.slice(i + 1).some((p) => p.ndvi <= peak - SEASON_DONE_DROP);
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

// Detected parcels from Earth Engine (features, or shapes from
// parcelShapes) -> candidates
// [{ id: "cand-N", geometry: Polygon, areaHa, centroid: [lat, lon] }]: the
// DETECT.maxFields largest, numbered from north-west to south-east.
// `fineFeatures` (the finer trace, optional) split a parcel per
// splitByFinerEdges.
export function toCandidates(features, fineFeatures = []) {
  const list = withoutOverlaps(splitByFinerEdges(parcelShapes(features), parcelShapes(fineFeatures))).slice(0, DETECT.maxFields);
  list.sort((a, b) => order(a.centroid) - order(b.centroid));
  return list.map(({ profile, curve, joined, ...item }, i) => ({ id: `cand-${i + 1}`, ...item }));
}
const order = ([lat, lon]) => lon * Math.cos((lat * Math.PI) / 180) - lat;

// Replaces a parcel by the finer-trace pieces inside it (centre inside the
// parcel) when at least two of them are DETECT.splitMinHa or more and those
// cover at least DETECT.splitMinCover of the parcel, and (when the pieces'
// profiles are known) they are not all the same crop. Otherwise the parcel
// stays whole: small or scattered pieces, or pieces of one crop, are noise,
// not a field boundary.
export function splitByFinerEdges(parcels, pieces, { minHa = DETECT.splitMinHa, minCover = DETECT.splitMinCover } = {}) {
  if (!pieces?.length) return [...parcels];
  const out = [];
  const used = new Set();
  for (const parcel of parcels) {
    // A field joined from parts of one crop is not cut up again.
    if (parcel.joined) {
      out.push(parcel);
      continue;
    }
    // A piece larger than the parcel is not a part of it (a broken shape).
    const inside = pieces.filter(
      (piece) => !used.has(piece) && piece.areaHa >= minHa && piece.areaHa <= parcel.areaHa * 1.05 && pointInGeometry(piece.centroid[1], piece.centroid[0], parcel.geometry),
    );
    const cover = inside.reduce((sum, piece) => sum + piece.areaHa, 0) / parcel.areaHa;
    if (inside.length >= 2 && cover >= minCover && !oneCrop(inside)) {
      for (const piece of inside) used.add(piece);
      out.push(...inside);
    } else {
      out.push(parcel);
    }
  }
  return out;
}

// The fields, largest first, with no two offered for the same ground:
// - a "container" (more than half of it covered by other fields that each
//   lie mostly inside it, like one shape around the whole boundary) goes;
// - then a field more than half inside the larger fields kept goes (a
//   duplicate piece of a field already offered).
// Neighbours overlap only by the grown-back edge (DETECT.growBackM), far
// below half. Shares are measured on a grid of OVERLAP_GRID x OVERLAP_GRID
// points over each field's box.
export const OVERLAP_GRID = 14;
export function withoutOverlaps(fields, { maxShare = 0.5 } = {}) {
  const list = [...fields].sort((a, b) => b.areaHa - a.areaHa);
  const boxes = list.map((f) => bboxOf(f.geometry));
  const samples = list.map((f, i) => gridPoints(boxes[i]).filter(([lon, lat]) => pointInGeometry(lon, lat, f.geometry)));
  const touch = (i, j) => !(boxes[i][0] > boxes[j][2] || boxes[j][0] > boxes[i][2] || boxes[i][1] > boxes[j][3] || boxes[j][1] > boxes[i][3]);
  // Share of field i's points inside any of the fields `others`.
  const coveredBy = (i, others) => {
    const near = others.filter((j) => j !== i && touch(i, j));
    if (!near.length || !samples[i].length) return 0;
    return samples[i].filter(([lon, lat]) => near.some((j) => pointInGeometry(lon, lat, list[j].geometry))).length / samples[i].length;
  };
  const all = list.map((_, i) => i);
  const containers = new Set(
    all.filter((i) => {
      const inner = all.filter((j) => j !== i && list[j].areaHa < list[i].areaHa && touch(i, j) && coveredBy(j, [i]) > maxShare);
      return inner.length >= 2 && coveredBy(i, inner) > maxShare;
    }),
  );
  const kept = [];
  for (const i of all) {
    if (containers.has(i) || coveredBy(i, kept) > maxShare) continue;
    kept.push(i);
  }
  return kept.map((i) => list[i]);
}

// OVERLAP_GRID x OVERLAP_GRID points [lon, lat] spread over a box.
function gridPoints([w, s, e, n]) {
  const out = [];
  for (let r = 0; r < OVERLAP_GRID; r += 1) {
    for (let c = 0; c < OVERLAP_GRID; c += 1) out.push([w + ((c + 0.5) * (e - w)) / OVERLAP_GRID, s + ((r + 0.5) * (n - s)) / OVERLAP_GRID]);
  }
  return out;
}

// True when the pieces' profiles are known and all alike (one crop).
function oneCrop(pieces) {
  const diffs = [];
  for (let i = 0; i < pieces.length; i += 1) for (let j = i + 1; j < pieces.length; j += 1) diffs.push(profileDifference(pieces[i].profile, pieces[j].profile));
  return diffs.length > 0 && diffs.every((diff) => diff !== null && diff <= DETECT.mergeMaxDiff);
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

// A polygon without its holes smaller than DETECT.minHoleHa.
export function fillSmallHoles(polygon, minHoleHa = DETECT.minHoleHa) {
  if (!polygon) return null;
  const [outer, ...holes] = polygon.coordinates;
  const kept = holes.filter((ring) => geoAreaHa({ type: "Polygon", coordinates: [ring] }) >= minHoleHa);
  return { type: "Polygon", coordinates: [outer, ...kept] };
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
