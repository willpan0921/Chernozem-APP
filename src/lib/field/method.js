// WHAT THIS FILE DOES
// The Field method: how satellite readings for one field become the four
// things a farmer sees (water, plant health, stress, harvest readiness), the
// one combined "field condition" layer on the map, and the field's status
// (Healthy, Watch, Harvest soon, Ready to harvest, Needs recovery...).
//
// The server uses it to analyse fields and the pages use it to colour the
// map and write the labels, so the two can never disagree. Plain functions
// with no React. Tested in method.test.js.
//
// THE READINGS (all from Sentinel-2, 10 m pixels, cloudy pixels removed)
//   NDVI  plant health   (B8 - B4) / (B8 + B4)     -1..1, crops ~0.2 to 0.9
//   NDWI  water in plants (B8 - B11) / (B8 + B11)  -1..1, crops ~-0.2 to 0.5
// Each is compared with the NORMAL for the same weeks of the normal years
// 2019 to 2021. "Normal" is a range: the lowest and highest of those three
// years.
//
//   NDRE  red edge       (B8A - B5) / (B8A + B5)    20 m, reacts to chlorophyll
//                        loss 1 to 2 weeks before NDVI does
//   NDYI  yellow flowers (B3 - B2) / (B3 + B2)      used to spot rapeseed
//
// Crop profiles, heat units (growing degree-days) and the crop-type
// classifier are in crops.js and are re-exported from here, so every rule
// can be imported from this one file.
//
// WHO EDITS IT
// Whoever changes the Field method. A change here changes every analysis
// made from then on.

import { addDays } from "../season.js";
import { cropProfile, harvestPlausible } from "./crops.js";

export * from "./crops.js";

// The years used as "normal".
export const BASELINE = { from: 2019, to: 2021, label: "2019 to 2021" };

// Cloud Score+ cut-off: a pixel counts as clear at this score or above
// (0 = surely cloud, 1 = surely clear). Google's suggested starting point.
export const CLEAR_PIXEL_SCORE = 0.6;
// A satellite pass counts only when at least this share of the field was clear.
export const MIN_CLEAR_SHARE = 0.5;

// ---------------------------------------------------------------------------
// The combined field condition (the one map layer)
// ---------------------------------------------------------------------------

// How much each part counts in the field condition. Harvest readiness is
// not a separate weight: plant health and water are compared with the
// normal for the SAME WEEKS, so a crop drying down on schedule for harvest
// still scores well, and one drying down early does not.
export const CONDITION_WEIGHTS = { plantHealth: 0.5, water: 0.3, noStress: 0.2 };

// How far below normal counts as "as bad as it gets" (score 0).
export const HEALTH_SPAN = 0.3; // NDVI
export const WATER_SPAN = 0.25; // NDWI

// A pixel is "stressed" when it is clearly weaker than the rest of the same
// field AND weaker than normal. Both are needed: the first alone flags
// natural soil patterns, the second alone flags a whole late-sown field.
export const STRESS_RULES = { belowFieldMedian: 0.1, belowNormal: 0.08 };

// Kept to 6 decimals so arithmetic noise never shows up as 0.0000000001.
const clamp01 = (value) => Math.round(Math.min(1, Math.max(0, value)) * 1e6) / 1e6;

// Plant health score, 0 to 1: 1 at or above normal, falling to 0 when NDVI
// is HEALTH_SPAN below normal.
export function healthScore(ndvi, normalNdvi) {
  if (!Number.isFinite(ndvi) || !Number.isFinite(normalNdvi)) return null;
  return clamp01(1 + (ndvi - normalNdvi) / HEALTH_SPAN);
}

// Water score, 0 to 1, the same way for NDWI.
export function waterScore(ndwi, normalNdwi) {
  if (!Number.isFinite(ndwi) || !Number.isFinite(normalNdwi)) return null;
  return clamp01(1 + (ndwi - normalNdwi) / WATER_SPAN);
}

// True when one pixel counts as stressed.
export function isStressed(ndvi, fieldMedianNdvi, normalNdvi) {
  if (![ndvi, fieldMedianNdvi, normalNdvi].every(Number.isFinite)) return false;
  return ndvi < fieldMedianNdvi - STRESS_RULES.belowFieldMedian && ndvi < normalNdvi - STRESS_RULES.belowNormal;
}

// The field condition, 0 to 1, from the three parts. "stress" is 0 or 1 for
// one pixel, or the stressed share for a whole field. Missing parts are left
// out and the rest re-weighted, so one cloudy band does not blank the map.
export function conditionScore({ health, water, stress }) {
  const parts = [
    [health, CONDITION_WEIGHTS.plantHealth],
    [water, CONDITION_WEIGHTS.water],
    [Number.isFinite(stress) ? 1 - stress : null, CONDITION_WEIGHTS.noStress],
  ].filter(([value]) => Number.isFinite(value));
  if (parts.length === 0) return null;
  const weight = parts.reduce((sum, [, w]) => sum + w, 0);
  return clamp01(parts.reduce((sum, [value, w]) => sum + value * w, 0) / weight);
}

// The four classes of the map layer, worst first.
export const CONDITION_CLASSES = [
  { id: "poor", label: "Poor", upTo: 0.4 },
  { id: "fair", label: "Fair", upTo: 0.65 },
  { id: "good", label: "Good", upTo: 0.85 },
  { id: "great", label: "Very good", upTo: Infinity },
];

export function conditionClass(score) {
  if (!Number.isFinite(score)) return null;
  return CONDITION_CLASSES.find((item) => score < item.upTo);
}

// ---------------------------------------------------------------------------
// The four tiles
// ---------------------------------------------------------------------------

// Where a reading sits against its normal range: "below", "normal" or
// "above". A small margin stops a hair's difference from flipping the word.
export const NORMAL_MARGIN = 0.02;

export function versusNormal(value, low, high) {
  if (![value, low, high].every(Number.isFinite)) return null;
  if (value < low - NORMAL_MARGIN) return "below";
  if (value > high + NORMAL_MARGIN) return "above";
  return "normal";
}

// Stress level from the stressed share of the field.
export function stressLevel(stressedShare) {
  if (!Number.isFinite(stressedShare)) return null;
  if (stressedShare >= 0.15) return "high";
  if (stressedShare >= 0.05) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Stress v2: red-edge early warning, the likely cause, no crop
// ---------------------------------------------------------------------------

// A normalized difference (a - b) / (a + b); null when it cannot be worked out.
export function normalizedDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a + b === 0) return null;
  return (a - b) / (a + b);
}

// Red-edge index from Sentinel-2 B8A and B5 (20 m).
export const ndre = (b8a, b5) => normalizedDifference(b8a, b5);
// Yellowness index from Sentinel-2 B3 and B2 (rapeseed flowers).
export const ndyi = (b3, b2) => normalizedDifference(b3, b2);

// The red-edge rule, the same idea as STRESS_RULES: clearly weaker than the
// rest of the field AND weaker than normal (normal NDRE from the same
// 2019-2021 windows as NDVI).
export const RED_EDGE_RULES = { belowFieldMedian: 0.06, belowNormal: 0.05 };

export function isStressedRedEdge(ndreValue, fieldMedianNdre, normalNdre) {
  if (![ndreValue, fieldMedianNdre, normalNdre].every(Number.isFinite)) return false;
  return ndreValue < fieldMedianNdre - RED_EDGE_RULES.belowFieldMedian && ndreValue < normalNdre - RED_EDGE_RULES.belowNormal;
}

// The pixel rule the providers mirror as ee.Image arithmetic:
//   stressed = NDVI rule (isStressed) OR red-edge rule (isStressedRedEdge)
// Gives back { stressed, byNdvi, byRedEdge, redEdgeOnly } (redEdgeOnly:
// the red-edge rule caught a pixel the NDVI rule missed).
// In Earth Engine terms, with ndvi/ndre this pass, med* the field medians
// (reduceRegion median) and norm* the 2019-2021 normal:
//   byNdvi    = ndvi.lt(medNdvi - 0.1).and(ndvi.lt(normNdvi - 0.08))
//   byRedEdge = ndre.lt(medNdre - 0.06).and(ndre.lt(normNdre - 0.05))
//   stressed  = byNdvi.or(byRedEdge)
export function pixelStress({ ndvi, fieldMedianNdvi, normalNdvi, ndre: ndreValue, fieldMedianNdre, normalNdre } = {}) {
  const byNdvi = isStressed(ndvi, fieldMedianNdvi, normalNdvi);
  const byRedEdge = isStressedRedEdge(ndreValue, fieldMedianNdre, normalNdre);
  return { stressed: byNdvi || byRedEdge, byNdvi, byRedEdge, redEdgeOnly: byRedEdge && !byNdvi };
}

// stress.redEdge is true when the red-edge rule found stress the NDVI rule
// missed over at least this share of the field (one stray pixel is noise).
export const RED_EDGE_ONLY_MIN_SHARE = 0.01;

export function redEdgeFound(redEdgeOnlyShare) {
  return Number.isFinite(redEdgeOnlyShare) && redEdgeOnlyShare >= RED_EDGE_ONLY_MIN_SHARE;
}

// The likely cause of stress, from the mean NDWI anomaly (NDWI minus its
// normal) over the stressed pixels of the field or of one patch: drier
// than normal by this much or more -> "dry"; otherwise "other" (not water:
// a satellite cannot name a pest or a disease, so check on the ground).
export const DRY_NDWI_ANOMALY = -0.05;

export const STRESS_CAUSES = {
  dry: { id: "dry", label: "Dry patch" },
  other: { id: "other", label: "Not water: check for pests or disease" },
  // Medium or high stress with no patch mapped: weak plants scattered over
  // the field, not one place to look at (stressCauseShown).
  spread: { id: "spread", label: "Spread across the field" },
};

export function stressCause(ndwiAnomaly) {
  if (!Number.isFinite(ndwiAnomaly)) return null;
  return ndwiAnomaly <= DRY_NDWI_ANOMALY ? "dry" : "other";
}

// The cause the field shows. A cause is named only for medium or high
// stress: at "low" a few weak pixels say nothing about water or pests (real
// data, Argentina 2026-10-19: "Low · 1% · Dry patch" next to "Wetter than
// usual"), so it is null. A medium or high stress with no patch mapped is
// spread thinly over the field: "spread" (STRESS_CAUSES.spread), not a
// cause named for a place nobody can find. Otherwise the measured cause.
//   level    stressLevel(); cause  stressCause() of the field; patches  the mapped patches
export function stressCauseShown({ level, cause = null, patches = [] } = {}) {
  if (level !== "medium" && level !== "high") return null;
  if (!(Array.isArray(patches) && patches.length)) return "spread";
  return cause ?? null;
}

// Stages with no crop in the field: no stress, no condition, no pest risk.
export const NO_CROP_STAGES = ["harvested", "notSown"];
// What the Stress tile says then (not "None", which would mean "no stress").
export const NO_CROP_LABEL = "No crop";
// A crop dried down for harvest: its leaves are dying back on purpose, so
// the stress rules (weaker than the rest of the field and than normal, on
// NDVI or red edge) would read the uneven senescence as stress (real data,
// Iowa, 2026-10-19: a dried-down field read "Stress high · Dry patch" while
// its water was normal and its condition "Very good"). Stress is not read
// then; the tile says this instead.
export const DRIED_DOWN_LABEL = "Dried down";

const stageId = (stage) => (typeof stage === "string" ? stage : stage?.stage) ?? null;

// False when the field has no crop (harvested or not sown).
export function hasCrop(stage) {
  return !NO_CROP_STAGES.includes(stageId(stage));
}

// A radar drop (Sentinel-1 VH) on a field read as fallow or grass is a
// mowing or a cut for hay, not a harvest (unknownCropHarvest sets mown).
export const MOWN_LABEL = "Cut or mown";

// Why a field has no crop to score, or null when it has one:
//   "fallow"     read as fallow or grass (harvest.fallow), mown or not
//   "harvested"  harvested, "notSown" never greened up this season
//   "driedDown"  a crop the app cannot name, dried down to the ready level
//                (harvest.cropUnknown with dryDown "dry"): no harvest date
//                and no condition can be given for it
//   harvest  the harvest object (or a stage id)
// These fields have no condition (score and class null) and are never
// "Healthy": they are counted in the "noCrop" group (STATUS_GROUPS).
export function noCropState(harvest) {
  const h = harvest && typeof harvest === "object" ? harvest : { stage: stageId(harvest) };
  if (h.fallow) return "fallow";
  if (NO_CROP_STAGES.includes(h.stage)) return h.stage;
  if (h.cropUnknown && h.dryDown === "dry") return "driedDown";
  return null;
}

// Why stress is not read for a field, or null when it is:
//   "noCrop"     harvested or not sown
//   "driedDown"  stage "ready" (a crop dried down, standing dry or with
//                its leaves down), or a field of an unknown crop dried down
//                to the ready level (harvest.dryDown "dry", unknownCropHarvest)
//   harvest  the harvest stage id, or the harvest object { stage, dryDown }
//   A field read as fallow or grass (harvest.fallow, unknownCropHarvest)
//   has no crop either: "noCrop".
export function stressExemption(harvest) {
  const stage = stageId(harvest);
  if (NO_CROP_STAGES.includes(stage) || (harvest && typeof harvest === "object" && harvest.fallow)) return "noCrop";
  if (stage === "ready" || (harvest && typeof harvest === "object" && harvest.dryDown === "dry")) return "driedDown";
  return null;
}

// True when stress is read for the field (stressExemption is null).
export function stressApplies(harvest) {
  return stressExemption(harvest) === null;
}

// The field's stress in one object (the FieldAnalysis "stress" fields
// besides patches and hectares).
//   stage            harvest stage id (or the harvest / harvestStage result)
//   dryDown, fallow  harvest.dryDown / harvest.fallow (unknownCropHarvest),
//                    when stage is an id
//   share            stressed share of the field (NDVI OR red-edge rule)
//   ndwiAnomaly      mean NDWI anomaly over the stressed pixels
//   redEdgeOnlyShare share stressed by the red-edge rule only
// Gives back { applies, reason, share, level, cause, redEdge }. With no
// crop, or a crop dried down: applies false, reason "noCrop" or
// "driedDown" (stressExemption) and everything else empty.
export function stressSummary({ stage, dryDown = null, fallow = false, share, ndwiAnomaly, redEdgeOnlyShare } = {}) {
  const reason = stressExemption(typeof stage === "object" && stage ? stage : { stage, dryDown, fallow });
  if (reason) return { applies: false, reason, share: null, level: null, cause: null, redEdge: false };
  const level = stressLevel(share);
  const any = Number.isFinite(share) && share > 0;
  return { applies: true, reason: null, share: Number.isFinite(share) ? share : null, level, cause: any ? stressCause(ndwiAnomaly) : null, redEdge: any && redEdgeFound(redEdgeOnlyShare) };
}

// A field with high stress (stressLevel "high": 15 % or more of it) is
// never shown as "Very good": its condition is held just under that class.
export const STRESSED_CONDITION_MAX = 0.84;

// The field condition { score, class } with the "no crop" rule: a
// harvested, not-sown, fallow or dried-down (unknown crop) field has no
// condition (null, never "Poor" or "Very good": noCropState), and its
// stress never counts as "no stress".
//   stage           the harvest object (or a stage id)
//   health, water   scores 0..1; stress the stressed share
//   damage          { detected } (a damaged field is never above "Fair")
// High stress caps the score at STRESSED_CONDITION_MAX.
export function fieldCondition({ stage, health, water, stress, damage } = {}) {
  if (noCropState(stage)) return { score: null, class: null };
  let score = conditionForDamage(conditionScore({ health, water, stress }), damage);
  if (Number.isFinite(score) && stressLevel(stress) === "high") score = Math.min(score, STRESSED_CONDITION_MAX);
  return { score: Number.isFinite(score) ? score : null, class: conditionClass(score)?.id ?? null };
}

// ---------------------------------------------------------------------------
// How the season went (after harvest)
// ---------------------------------------------------------------------------
// A harvested field has no crop to grade NOW (fieldCondition gives it no
// class: bare stubble is not "Very good" plant health), but it has a season
// to look back on. seasonResult compares this season's plant health from
// green-up to harvest with the normal years on the same days:
//   mean NDVI of the clear passes in that window, against the 2019-2021
//   normal median on those same days (normalCurve, half-month points
//   "MM-DD", read in a straight line between them),
//   scored with healthScore against that normal mean and put in the four
//   CONDITION_CLASSES (Poor, Fair, Good, Very good);
//   peak  the mean of the season's SEASON_PEAK_PASSES greenest passes in
//   the window (one pass alone runs high against a smoothed median),
//   normalPeak the highest normal median over the same days; the peak is
//   scored the same way and the season gets the LOWER of the two scores
//   (see below). In practice the peak decides most seasons; the mean
//   lowers the grade of a season that was green only briefly.
// Null when there are fewer than SEASON_MIN_PASSES clear passes in the
// window or the field was never cropped (fallow or grass, or a season that
// never got greener than NOT_SOWN_PEAK).
//   points       this season's clear passes [{ date, ndvi }]
//   normalCurve  [{ day: "MM-DD", low, high, median }]
//   greenUp      "YYYY-MM-DD" or null (then found from the curve, else the
//                first pass)
//   harvestedOn  "YYYY-MM-DD": passes from this day on are stubble and left
//                out; null for a crop not cut yet (ready or dried down:
//                the season so far, to the last pass)
//   fallow       true for a field read as fallow or grass
// -> { score, class, label, mean, normalMean, peak, highest, normalPeak, from, to, passes } or null
//    highest  the single greenest pass
export const SEASON_MIN_PASSES = 4;
// The season's peak is the mean of this many greenest passes (fewer when
// the window has fewer).
export const SEASON_PEAK_PASSES = 3;
// A winter crop's curve may start already green (sown in autumn): its
// green-up is its spring regrowth, from up to this level.
const SEASON_GREEN_UP_MAX_BASE = 0.6;

const DAYS_IN_YEAR = 365;
const dayOfYear = (mmdd) => {
  const [m, d] = String(mmdd).split("-").map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return null;
  return Math.round((Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 1)) / DAY_MS);
};

// The normal median on one date ("YYYY-MM-DD"), read in a straight line
// between the half-month points either side (over New Year too), or null.
export function normalMedianOn(normalCurve, iso) {
  const points = (Array.isArray(normalCurve) ? normalCurve : [])
    .map((p) => ({ at: dayOfYear(p?.day), median: p?.median }))
    .filter((p) => Number.isFinite(p.at) && Number.isFinite(p.median))
    .sort((a, b) => a.at - b.at);
  const at = dayOfYear(String(iso).slice(5, 10));
  if (!points.length || !Number.isFinite(at)) return null;
  if (points.length === 1) return points[0].median;
  let after = points.findIndex((p) => p.at >= at);
  const a = after <= 0 ? points[points.length - 1] : points[after - 1];
  const b = after === -1 ? points[0] : points[after];
  if (after === -1) after = 0;
  const span = (b.at - a.at + DAYS_IN_YEAR) % DAYS_IN_YEAR || DAYS_IN_YEAR;
  const t = ((at - a.at + DAYS_IN_YEAR) % DAYS_IN_YEAR) / span;
  return a.median + (b.median - a.median) * Math.min(1, Math.max(0, t));
}

const round3 = (value) => Math.round(value * 1000) / 1000;

export function seasonResult({ points, normalCurve, greenUp = null, harvestedOn = null, fallow = false } = {}) {
  if (fallow) return null;
  const series = cleanSeries((Array.isArray(points) ? points : []).filter((p) => p && typeof p.date === "string" && Number.isFinite(p.ndvi)));
  const before = harvestedOn ? series.filter((p) => p.date < harvestedOn) : series;
  if (before.length < SEASON_MIN_PASSES) return null;
  if (Math.max(...before.map((p) => p.ndvi)) < NOT_SOWN_PEAK) return null;
  const from = greenUp || greenUpDate(before, { maxBase: SEASON_GREEN_UP_MAX_BASE }) || before[0].date;
  const pairs = before
    .filter((p) => p.date >= from)
    .map((p) => ({ date: p.date, ndvi: p.ndvi, normal: normalMedianOn(normalCurve, p.date) }))
    .filter((p) => Number.isFinite(p.normal));
  if (pairs.length < SEASON_MIN_PASSES) return null;
  const mean = pairs.reduce((sum, p) => sum + p.ndvi, 0) / pairs.length;
  const normalMean = pairs.reduce((sum, p) => sum + p.normal, 0) / pairs.length;
  const to = pairs[pairs.length - 1].date;
  // The normal's highest median over the same days: the passes' days and
  // the half-month points between the first and the last of them.
  const startAt = dayOfYear(from.slice(5, 10));
  const endAt = dayOfYear(to.slice(5, 10));
  const inside = (at) => (startAt <= endAt ? at >= startAt && at <= endAt : at >= startAt || at <= endAt);
  const normals = [
    ...pairs.map((p) => p.normal),
    ...(Array.isArray(normalCurve) ? normalCurve : []).filter((p) => Number.isFinite(p?.median) && inside(dayOfYear(p.day))).map((p) => p.median),
  ];
  const greenest = pairs.map((p) => p.ndvi).sort((a, b) => b - a).slice(0, SEASON_PEAK_PASSES);
  const peak = greenest.reduce((sum, v) => sum + v, 0) / greenest.length;
  const normalPeak = Math.max(...normals);
  // The lower of the two scores: a season is only as good as both its
  // greenness over the weeks and its peak. The normal median of each day
  // mixes the three years' crops (rotation, sowing dates), so it runs lower
  // than any one crop's curve and the mean alone flatters nearly every
  // season (real data, near Kupiansk, 2026-10-19: all ten fields "Very
  // good" on the mean, while most peaked below the usual peak).
  const score = Math.min(healthScore(mean, normalMean), healthScore(peak, normalPeak) ?? Infinity);
  const cls = conditionClass(score);
  if (!cls) return null;
  return {
    score: round3(score),
    class: cls.id,
    label: cls.label,
    mean: round3(mean),
    normalMean: round3(normalMean),
    peak: round3(peak),
    highest: round3(greenest[0]),
    normalPeak: round3(normalPeak),
    from,
    to,
    passes: pairs.length,
  };
}

// ---------------------------------------------------------------------------
// Pest and disease RISK from the weather (a forecast, not a detection)
// ---------------------------------------------------------------------------
// From Open-Meteo hourly temperature_2m and relative_humidity_2m, asked
// with past_days=7 and forecast_days=7 (14 days in all):
//   fungal disease: hours with humidity >= 90 % and 10 to 25 °C
//   insects:        growing degree-days base 10 °C (daily mean - 10, never
//                   below 0), summed over the same 14 days

export const DISEASE_RISK = { minHumidity: 90, minTemp: 10, maxTemp: 25, highHours: 24, mediumHours: 8 };
export const INSECT_RISK = { base: 10, highGdd: 70, mediumGdd: 30 };
export const RISK_DAYS = 14;
// A day's mean temperature counts only with at least this many hours.
export const RISK_MIN_HOURS_PER_DAY = 18;
// Risk is given only while a crop is growing or ripening.
export const PEST_RISK_STAGES = ["growing", "ripening"];

// True when the weather risk is given for a field: a crop is growing or
// ripening, and the field is not read as fallow or grass (harvest.fallow,
// or "possibly fallow or grass" in the crop detection) nor dried down.
//   harvest       the harvest object (or a stage id)
//   cropDetected  classifyCrop() result (possiblyFallow), optional
export function pestRiskApplies(harvest, cropDetected = null) {
  const h = harvest && typeof harvest === "object" ? harvest : { stage: stageId(harvest) };
  if (!PEST_RISK_STAGES.includes(h.stage) || noCropState(h)) return false;
  if (h.dryDown === "dry") return false;
  return !cropDetected?.possiblyFallow;
}

export function diseaseRisk(wetHours) {
  if (!Number.isFinite(wetHours)) return null;
  if (wetHours >= DISEASE_RISK.highHours) return "high";
  if (wetHours >= DISEASE_RISK.mediumHours) return "medium";
  return "low";
}

export function insectRisk(gdd14) {
  if (!Number.isFinite(gdd14)) return null;
  if (gdd14 >= INSECT_RISK.highGdd) return "high";
  if (gdd14 >= INSECT_RISK.mediumGdd) return "medium";
  return "low";
}

// Hourly rows from Open-Meteo's { time, temperature_2m,
// relative_humidity_2m } arrays, or from [{ time, temperature, humidity }].
function hourlyRows(hourly) {
  if (Array.isArray(hourly)) {
    return hourly.map((h) => ({ time: String(h?.time || ""), t: h?.temperature ?? h?.temperature_2m, rh: h?.humidity ?? h?.relative_humidity_2m }));
  }
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  return times.map((time, i) => ({ time: String(time), t: hourly.temperature_2m?.[i], rh: hourly.relative_humidity_2m?.[i] }));
}

// The two inputs of the risk: { wetHours14, gdd14, hours, days }.
//   today  "YYYY-MM-DD": the 14 days are the 7 before today and the 7 from
//          today; left out, the first 14 days of the data.
// Null when there is no usable hour.
export function hourlyRiskInputs(hourly, today = null) {
  const rows = hourlyRows(hourly).filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.time));
  if (!rows.length) return null;
  const first = today ? addDays(today, -7) : rows.map((r) => r.time.slice(0, 10)).sort()[0];
  const end = addDays(first, RISK_DAYS);
  const inside = rows.filter((r) => r.time.slice(0, 10) >= first && r.time.slice(0, 10) < end);
  const usable = inside.filter((r) => Number.isFinite(r.t));
  if (!usable.length) return null;
  const d = DISEASE_RISK;
  const withHumidity = usable.filter((r) => Number.isFinite(r.rh));
  const wetHours14 = withHumidity.length ? withHumidity.filter((r) => r.rh >= d.minHumidity && r.t >= d.minTemp && r.t <= d.maxTemp).length : null;
  const byDay = new Map();
  for (const r of usable) {
    const day = r.time.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) || []), r.t]);
  }
  let gdd = 0;
  let days = 0;
  for (const temps of byDay.values()) {
    if (temps.length < RISK_MIN_HOURS_PER_DAY) continue;
    gdd += Math.max(0, temps.reduce((a, b) => a + b, 0) / temps.length - INSECT_RISK.base);
    days += 1;
  }
  return { wetHours14, gdd14: days ? Math.round(gdd * 10) / 10 : null, hours: usable.length, days };
}

// The weather-based pest and disease risk.
//   hourly  Open-Meteo hourly block (see hourlyRiskInputs)
//   stage   harvest stage id or harvestStage result; when given, risk is
//           only worked out while the crop is growing or ripening
//   today   "YYYY-MM-DD" (optional, see hourlyRiskInputs)
// Gives back { disease, insects, basis: { wetHours, gdd14 } } or null (no
// crop growing, or no weather).
export function pestRisk({ hourly, stage, today = null } = {}) {
  if (stage !== undefined && !PEST_RISK_STAGES.includes(stageId(stage))) return null;
  const inputs = hourlyRiskInputs(hourly, today);
  if (!inputs) return null;
  return { disease: diseaseRisk(inputs.wetHours14), insects: insectRisk(inputs.gdd14), basis: { wetHours: inputs.wetHours14, gdd14: inputs.gdd14 } };
}

// One short line for the Stress tile and the AI: the higher of the two
// risks ("Disease risk high this week", "Insect activity medium this
// week", "Disease risk and insect activity high this week"). Null without
// a risk.
export function pestRiskLine(risk) {
  if (!risk) return null;
  const rank = { low: 0, medium: 1, high: 2 };
  const d = rank[risk.disease] ?? -1;
  const i = rank[risk.insects] ?? -1;
  if (d < 0 && i < 0) return null;
  if (d === i) return `Disease risk and insect activity ${risk.disease} this week`;
  return d > i ? `Disease risk ${risk.disease} this week` : `Insect activity ${risk.insects} this week`;
}

// ---------------------------------------------------------------------------
// Harvest readiness, from this season's plant-health curve
// ---------------------------------------------------------------------------

// NDVI of bare soil, and the levels used to read the season curve.
export const BARE_NDVI = 0.2;
export const NOT_SOWN_PEAK = 0.35; // a season that never got greener than this
export const HARVESTED_NDVI = 0.3; // after a sharp drop to below this
export const READY_SHARE = 0.35; // ready when NDVI is back down to 35% of the green-up
export const HARVEST_SOON_DAYS = 14;
// A harvest shows as a fall of more than HARVEST_DROP within
// HARVEST_DROP_DAYS to below HARVESTED_NDVI. The crop has usually dried
// down before the combine comes, so in a field's average the fall is often
// only 0.15 to 0.2 (real example: a barley field, 0.44 to 0.28 in five
// days, August 2026).
export const HARVEST_DROP = 0.15;
export const HARVEST_DROP_DAYS = 20;
// Days a crop stays at its best once ready (the harvest window, "best
// before ...").
export const HARVEST_WINDOW_DAYS = 10;
// Growth after a harvest counts as a new season only when it gets at least
// this green and has had at least this many days since the harvest.
export const NEW_SEASON_PEAK = NOT_SOWN_PEAK + 0.2;
export const NEW_SEASON_DAYS = 60;
// A crop dries down from its peak to harvest in a few weeks. A decline so
// slow that it would take longer than this to reach the ready level is not
// a dry-down (a cut forage crop greening up and fading again, a perennial
// in a dry spell): the field stays "growing". Real data, Nakuru, Kenya,
// 2026-10-19: fields cut in June and grown back read "ready in 70-90 days".
export const RIPENING_MAX_DAYS = 45;
// A crop stays at the ready level for a few weeks at most before it is cut
// or lodges. A field that has sat at or below that level for longer than
// this was harvested (or abandoned) when it first got there: the flat low
// curve is stubble, weeds or a cover crop. Real data, 2026-10-19: Pampas
// and Kenya fields that peaked 4-9 months earlier and sat flat at NDVI
// 0.30-0.45 read "Ready to harvest".
export const READY_MAX_DAYS = 30;
// Long after the peak: a field whose peak is more than LONG_AFTER_PEAK.days
// back and that has since fallen below LONG_AFTER_PEAK.share of that peak,
// with no new season growing after (weak regrowth does not count), is not
// "growing" any more even when it never got
// quite down to the ready level: it is ready (when it got that low within
// READY_MAX_DAYS) or it was harvested (or left) when it got that low. Real
// data, Kupiansk demo farm, 2026-10-19: fields that peaked at 0.66-0.84 in
// late June, dried down slowly to 0.30-0.37 by mid September and stayed
// flat read "Growing" with a pest risk four months after their peak.
export const LONG_AFTER_PEAK = { days: 60, share: 0.6 };

const DAY_MS = 86400000;
const dayNumber = (iso) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

// Cleans a season curve. Clouds and their shadows that slip past the cloud
// mask make NDVI read LOW, almost never high, so a pass that sits far below
// both of its neighbours is dropped. Real peaks are kept as they are.
// Points are { date: "YYYY-MM-DD", ndvi }.
export const OUTLIER_DROP = 0.15;

export function cleanSeries(points) {
  const sorted = points.filter((p) => Number.isFinite(p.ndvi)).sort((a, b) => a.date.localeCompare(b.date));
  return sorted.filter((p, i) => {
    if (i === 0 || i === sorted.length - 1) return true;
    return !(p.ndvi < sorted[i - 1].ndvi - OUTLIER_DROP && p.ndvi < sorted[i + 1].ndvi - OUTLIER_DROP);
  });
}

// Straight-line slope (NDVI per day) through points.
function slopePerDay(points) {
  if (points.length < 2) return 0;
  const xs = points.map((p) => dayNumber(p.date));
  const ys = points.map((p) => p.ndvi);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  return den > 0 ? num / den : 0;
}

// Reads the stage of the crop from this season's curve.
//   points  - this season's clear passes, { date, ndvi }
//   today   - "YYYY-MM-DD"
//   options - { readyShare } (crop profile, crops.js), READY_SHARE when left out
// Gives back { stage, daysToReady, peak, peakDate, current, lastDate, slope }
// (and cycleStart when a new crop has grown after a harvest: the stage is
// then that crop's, read from cycleStart on) where stage is one of
//   "unknown"   too few clear passes
//   "notSown"   the field never greened up this season
//   "growing"   still green, no steady dry-down yet
//   "ripening"  drying down; daysToReady estimates when it will be ready
//   "ready"     dried down to harvest level
//   "harvested" a sharp drop to bare soil after the peak
export function harvestStage(points, today, { readyShare = READY_SHARE } = {}) {
  const share = Number.isFinite(readyShare) ? readyShare : READY_SHARE;
  const series = cleanSeries(points);
  const empty = { stage: "unknown", daysToReady: null, peak: null, peakDate: null, current: null, lastDate: null, slope: null };
  if (series.length < 3) return empty;

  let peakIndex = 0;
  series.forEach((p, i) => {
    if (p.ndvi > series[peakIndex].ndvi) peakIndex = i;
  });
  const peak = series[peakIndex].ndvi;
  const last = series[series.length - 1];
  const current = last.ndvi;
  const base = { ...empty, peak, peakDate: series[peakIndex].date, current, lastDate: last.date };

  if (peak < NOT_SOWN_PEAK) return { ...base, stage: "notSown" };

  // Harvest: after the peak, a fall of more than HARVEST_DROP within
  // HARVEST_DROP_DAYS to below the harvested level (combines leave stubble
  // almost overnight).
  // What grows after that (weeds, volunteers, the next autumn sowing) is a
  // NEW cycle: it is read as a season of its own only once it has really
  // grown (NEW_SEASON_PEAK and NEW_SEASON_DAYS); until then the field stays
  // "harvested", so a crop sown after harvest is never "ready to harvest".
  const afterHarvest = (i) => {
    const harvestedOn = series[i].date;
    const harvested = { ...base, stage: "harvested", harvestedOn };
    const regrowth = series.slice(i);
    const regrowthPeak = Math.max(...regrowth.map((p) => p.ndvi));
    const regrowthDays = dayNumber(last.date) - dayNumber(harvestedOn);
    if (regrowthPeak < NEW_SEASON_PEAK || regrowthDays < NEW_SEASON_DAYS) return harvested;
    const next = harvestStage(regrowth, today, { readyShare: share });
    // cycleStart: where the crop now in the field starts (the passes before
    // it belong to the crop harvested then).
    return next.stage === "unknown" || next.stage === "notSown" ? harvested : { cycleStart: harvestedOn, ...next };
  };
  for (let i = 1; i < series.length; i++) {
    const before = series[i - 1];
    const after = series[i];
    const afterPeak = after.date > series[peakIndex].date;
    const quick = dayNumber(after.date) - dayNumber(before.date) <= HARVEST_DROP_DAYS;
    if (afterPeak && quick && after.ndvi < HARVESTED_NDVI && before.ndvi - after.ndvi > HARVEST_DROP) return afterHarvest(i);
  }
  // A slower fall that still ends at bare soil (two passes in a row below
  // HARVESTED_NDVI after the peak) is a harvest too: a cereal dries down
  // over weeks and the combine leaves little change. What grows after that
  // is the next cycle. Without this, a winter wheat field harvested in July
  // read "ready to harvest" in October once the next crop came up (real
  // data, Beauce, France, 2026-10-19: 0.9 in May, 0.15 from July to
  // September, 0.25 to 0.41 in October).
  for (let i = peakIndex + 1; i < series.length - 1; i++) {
    if (series[i].ndvi < HARVESTED_NDVI && series[i + 1].ndvi < HARVESTED_NDVI) return afterHarvest(i);
  }

  const recent = series.filter((p) => dayNumber(last.date) - dayNumber(p.date) <= 30).slice(-4);
  const slope = slopePerDay(recent);
  const readyLevel = BARE_NDVI + share * (peak - BARE_NDVI);
  const withSlope = { ...base, slope, readyLevel };

  // "Growing", unless the peak is long past and the field has stayed far
  // below it with no new season (LONG_AFTER_PEAK).
  const growing = () => {
    const sincePeak = dayNumber(today || last.date) - dayNumber(series[peakIndex].date);
    const low = LONG_AFTER_PEAK.share * peak;
    if (sincePeak <= LONG_AFTER_PEAK.days) return { ...withSlope, stage: "growing" };
    // Regrowth after the low (weeds, volunteers, a new sowing) that has not
    // become a new season (NEW_SEASON_PEAK) does not make the old crop
    // "growing" again. Real data, Kupiansk, 2026-10-19: a field drawn next
    // to the demo farm peaked at 0.72 in June, faded to 0.28-0.35 in
    // September and came back to 0.45 in October: it read "Growing" with a
    // high disease risk.
    const firstLow = series.findIndex((p, i) => i > peakIndex && p.ndvi <= low);
    if (firstLow < 0) return { ...withSlope, stage: "growing" };
    if (Math.max(...series.slice(firstLow).map((p) => p.ndvi)) >= NEW_SEASON_PEAK) return { ...withSlope, stage: "growing" };
    if (dayNumber(last.date) - dayNumber(series[firstLow].date) <= READY_MAX_DAYS) return { ...withSlope, stage: "ready", daysToReady: 0 };
    return afterHarvest(firstLow);
  };

  if (peakIndex === series.length - 1 || current > 0.85 * peak) return { ...withSlope, stage: "growing" };
  if (current <= readyLevel) {
    const firstAtReady = series.findIndex((p, i) => i > peakIndex && p.ndvi <= readyLevel);
    if (firstAtReady > 0 && dayNumber(last.date) - dayNumber(series[firstAtReady].date) > READY_MAX_DAYS) return afterHarvest(firstAtReady);
    return current < HARVESTED_NDVI ? { ...withSlope, stage: "harvested", harvestedOn: last.date } : { ...withSlope, stage: "ready", daysToReady: 0 };
  }
  if (slope < -0.001) {
    const fromLastPass = Math.ceil((current - readyLevel) / -slope);
    if (fromLastPass > RIPENING_MAX_DAYS) return growing();
    const sinceLastPass = today ? Math.max(0, dayNumber(today) - dayNumber(last.date)) : 0;
    const days = Math.max(0, Math.min(90, fromLastPass - sinceLastPass));
    return days === 0 ? { ...withSlope, stage: "ready", daysToReady: 0 } : { ...withSlope, stage: "ripening", daysToReady: days };
  }
  return growing();
}

// ---------------------------------------------------------------------------
// Harvest readiness v2: green-up, heat units, radar through cloud
// ---------------------------------------------------------------------------

// Green-up: the first date the cleaned curve passes
//   base + GREEN_UP_SHARE x (peak - base)
// where base is the lowest point before the peak (so a winter crop's
// green-up is its spring regrowth after the winter low). Straight line
// between the two passes either side. Null when the curve has no clear
// green-up: fewer than 3 passes, a peak under NOT_SOWN_PEAK, or a curve
// that is already green at its start (base above maxBase; a winter crop
// whose curve starts in spring can pass a higher maxBase).
export const GREEN_UP_SHARE = 0.25;

export function greenUpDate(points, { maxBase = NOT_SOWN_PEAK } = {}) {
  const series = cleanSeries(Array.isArray(points) ? points : []);
  if (series.length < 3) return null;
  let peakIndex = 0;
  series.forEach((p, i) => {
    if (p.ndvi > series[peakIndex].ndvi) peakIndex = i;
  });
  const peak = series[peakIndex].ndvi;
  if (peak < NOT_SOWN_PEAK || peakIndex === 0) return null;
  let baseIndex = 0;
  for (let i = 0; i <= peakIndex; i++) if (series[i].ndvi < series[baseIndex].ndvi) baseIndex = i;
  const base = series[baseIndex].ndvi;
  if (base > maxBase || baseIndex === peakIndex) return null;
  const level = base + GREEN_UP_SHARE * (peak - base);
  for (let i = baseIndex + 1; i <= peakIndex; i++) {
    if (series[i].ndvi < level) continue;
    const a = series[i - 1];
    const b = series[i];
    const t = b.ndvi === a.ndvi ? 1 : (level - a.ndvi) / (b.ndvi - a.ndvi);
    return addDays(a.date, Math.round(t * (dayNumber(b.date) - dayNumber(a.date))));
  }
  return null;
}

// Radar harvest (Sentinel-1 VH, through cloud): after the NDVI peak, a
// fall of RADAR_HARVEST.dropDb or more between two passes at most
// maxGapDays apart (a tall crop cut to stubble). The fall must not be
// undone: when the next pass is within maxGapDays it must still be at
// least keepDb below the pass before the fall (a frost or a wet day comes
// back; a harvest does not). Ascending and descending passes may be
// mixed; passes on the same day are averaged. Sentinel-1 passes over one
// place are usually 6 to 12 days apart; maxGapDays allows one missed
// acquisition (real data, Iowa, 2026: passes exactly 12 days apart, 27 Sep
// to 9 Oct), since keepDb already guards against a wet day.
export const RADAR_HARVEST = { dropDb: 3, maxGapDays: 24, keepDb: 2 };

//   vhSeries  [{ date: "YYYY-MM-DD", vh }] field-mean VH per pass, dB
//   peakDate  the NDVI peak date ("YYYY-MM-DD")
//   notBefore a drop counts only when the pass before it is on or after
//             this date (radarForHarvest: a soybean's leaves falling)
// Gives back { harvestedOn, dropDb, passesAfterPeak, lastPass }
// (harvestedOn null: no harvest seen on radar).
export function radarHarvest(vhSeries, peakDate, { notBefore = null } = {}) {
  const byDay = new Map();
  for (const p of Array.isArray(vhSeries) ? vhSeries : []) {
    if (!p || typeof p.date !== "string" || !Number.isFinite(p.vh)) continue;
    const day = p.date.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) || []), p.vh]);
  }
  const passes = [...byDay.entries()]
    .map(([date, values]) => ({ date, vh: values.reduce((a, b) => a + b, 0) / values.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const after = peakDate ? passes.filter((p) => p.date >= peakDate.slice(0, 10)) : [];
  const result = { harvestedOn: null, dropDb: null, passesAfterPeak: after.length, lastPass: after.length ? after[after.length - 1].date : null };
  const r = RADAR_HARVEST;
  for (let i = 1; i < after.length; i++) {
    const a = after[i - 1];
    const b = after[i];
    if (dayNumber(b.date) - dayNumber(a.date) > r.maxGapDays) continue;
    if (notBefore && a.date < notBefore) continue;
    const drop = a.vh - b.vh;
    if (drop < r.dropDb) continue;
    const next = after[i + 1];
    if (next && dayNumber(next.date) - dayNumber(b.date) <= r.maxGapDays && a.vh - next.vh < r.keepDb) continue;
    return { ...result, harvestedOn: b.date, dropDb: Math.round(drop * 100) / 100 };
  }
  return result;
}

// The first clear pass after the peak at or below the ready level
// (BARE_NDVI + readyShare x (peak - BARE_NDVI)): the day the satellite
// SAW the crop dried down (no guess across a cloudy gap). Null when none.
export function readyReachedOn(points, { readyShare = READY_SHARE } = {}) {
  const series = cleanSeries(Array.isArray(points) ? points : []);
  if (series.length < 3) return null;
  const peakAt = series.reduce((best, p, i) => (p.ndvi > series[best].ndvi ? i : best), 0);
  const level = BARE_NDVI + readyShare * (series[peakAt].ndvi - BARE_NDVI);
  const seen = series.find((p, i) => i > peakAt && p.ndvi <= level);
  return seen ? seen.date : null;
}

// A crop that drops its leaves when it matures (soybean, crops.js
// shedsLeaves) loses most of its radar return then, a week or more before
// the combine comes, so a VH drop that spans the dry-down may be the leaves
// falling, not a cut. Real data, 60 fields near Ames, Iowa, 2026-10-19:
// 20 of the 23 fields that were soybean by the corn-soybean rotation (CDL
// 2024 and 2025) fell 4 to 8 dB between the 27 September and 9 October
// passes, to the level of cut corn, while USDA had only 31 % of Iowa's
// soybeans harvested on 11 October (94 % dropping leaves). For such a crop
// the leaves are taken as down LEAF_FALL_DAYS after the first clear pass
// at the ready level (readyReachedOn: yellow, the leaves start to fall),
// and a drop counts as the cut only when the pass before it is on or after
// that day; with no such pass, no drop counts. A field low on NDVI with no
// drop that counts stays "ready" (leafDrop: the leaves are down, the radar
// cannot tell whether it has been cut) for LEAF_DROP_MAX_DAYS after the
// leaves came down, then is taken as harvested (soybean is cut within
// weeks of maturity: the pods split open when it waits).
export const LEAF_FALL_DAYS = 7;
export const LEAF_DROP_MAX_DAYS = 30;
const NEVER = "9999-12-31";

// The radar reading for the harvest, for the crop.
//   vhSeries  field-mean VH per pass; season this season's passes
//   peakDate  the NDVI peak (harvestStage); crop crop id or name
// Gives back { radar (radarHarvest result), leavesDownOn (a leaf-shedding
// crop: LEAF_FALL_DAYS after its first clear pass at the ready level, or
// null) }.
export function radarForHarvest({ vhSeries, season, peakDate, crop } = {}) {
  const profile = crop ? cropProfile(crop) : null;
  const yellowOn = profile?.shedsLeaves ? readyReachedOn(season, { readyShare: profile.readyShare }) : null;
  const leavesDownOn = yellowOn ? addDays(yellowOn, LEAF_FALL_DAYS) : null;
  const notBefore = profile?.shedsLeaves ? leavesDownOn || NEVER : null;
  return { radar: radarHarvest(Array.isArray(vhSeries) ? vhSeries : [], peakDate || null, { notBefore }), leavesDownOn };
}

// Optical images count as "cloudy" when the last clear pass is older than this.
export const OPTICAL_STALE_DAYS = 15;
// The dry-down and heat-unit estimates "agree" within this many days.
export const HARVEST_AGREE_DAYS = 10;
// A tall crop stands dry in the field for weeks, rarely longer: a field
// low for longer than this with no radar harvest is left "harvested".
export const STANDING_DRY_MAX_DAYS = 60;

// Radar looked at the field after the peak (two passes or more) and up to
// `since` (the date optical imagery called it harvested).
function radarLooked(radar, since) {
  return Boolean(radar) && radar.passesAfterPeak >= 2 && Boolean(radar.lastPass) && (!since || radar.lastPass >= since);
}

// Standing dry crop (section 3c / 7.11): a TALL crop (corn, soybean,
// sunflower) whose NDVI is down at the ready level or below (bare-soil
// low, at or under HARVESTED_NDVI) but with NO radar harvest after the
// peak is still standing: ready, not harvested.
//   ndvi   harvestStage() result; radar radarHarvest() result; crop id or name
export function isStandingDry({ ndvi, radar, crop, today = null } = {}) {
  if (!ndvi || !isTallCropId(crop) || !radar || radar.harvestedOn) return false;
  // Leaves down: no radar return left to tell standing from cut.
  if (cropProfile(crop).shedsLeaves) return false;
  if (ndvi.stage !== "harvested" && ndvi.stage !== "ready") return false;
  if (!radarLooked(radar, ndvi.stage === "harvested" ? ndvi.harvestedOn : null)) return false;
  if (!Number.isFinite(ndvi.current) || !Number.isFinite(ndvi.peak)) return false;
  const readyLevel = BARE_NDVI + cropProfile(crop).readyShare * (ndvi.peak - BARE_NDVI);
  if (ndvi.current > Math.max(HARVESTED_NDVI, readyLevel)) return false;
  if (ndvi.stage === "harvested" && today && ndvi.harvestedOn && dayNumber(today) - dayNumber(ndvi.harvestedOn) > STANDING_DRY_MAX_DAYS) return false;
  return true;
}

const isTallCropId = (crop) => Boolean(crop) && cropProfile(crop).tall;

// The harvest estimate from all three sources.
//   ndvi   harvestStage() result (the dry-down estimate)
//   gdd    gddEstimate() result (crops.js) or null
//   radar  radarHarvest() result or null
//   crop   crop id or name (null: unknown)
//   today  "YYYY-MM-DD"
// Rules:
//   1. Radar harvest (tall or unknown crop): a VH drop after the peak marks
//      the field harvested when optical already says ready / harvested
//      (confirmation), or when optical is cloudy (no clear pass for
//      OPTICAL_STALE_DAYS) and the drop came after the last clear pass.
//   2. Standing dry (tall crop): optical "harvested" with no radar drop ->
//      "ready" (isStandingDry).
//   3. Ripening (visibly drying down): the dry-down days; basis "both" when
//      the heat-unit estimate agrees within HARVEST_AGREE_DAYS, else
//      "dry-down". Ready: "dry-down".
//   4. Growing (not drying down yet): the heat-unit days, basis "heat
//      units" (at least 1 day: the crop is still green). A heat-unit date
//      outside the crop's usual months after the peak is not used.
//   5. A ripening or ready date outside the crop's usual months after the
//      peak (harvestPlausible) sets cropMismatch: true.
//   6. Leaves down (a leaf-shedding crop, radarForHarvest): optical
//      "harvested" with no radar drop that counts, within
//      LEAF_DROP_MAX_DAYS of leavesDownOn -> "ready" with leafDrop: true.
// Gives back the harvestStage fields plus { basis, gdd: { accumulated,
// needed, base } | null, radarHarvestOn, standingDry, leafDrop }.
export function combineHarvestEstimate({ ndvi, gdd = null, radar = null, crop = null, today = null, leavesDownOn = null } = {}) {
  const n = ndvi || { stage: "unknown" };
  const gddInfo = gdd && [gdd.accumulated, gdd.needed, gdd.base].every(Number.isFinite) ? { accumulated: gdd.accumulated, needed: gdd.needed, base: gdd.base } : null;
  const out = { ...n, daysToReady: n.daysToReady ?? null, harvestedOn: n.harvestedOn ?? null, basis: null, gdd: gddInfo, radarHarvestOn: null, standingDry: false, leafDrop: false };

  const drop = radar?.harvestedOn || null;
  if (drop && (!crop || cropProfile(crop).id === "other" || isTallCropId(crop))) {
    const stale = !n.lastDate || (today && dayNumber(today) - dayNumber(n.lastDate) > OPTICAL_STALE_DAYS);
    const confirms = n.stage === "ready" || n.stage === "harvested";
    const unseen = (n.stage === "growing" || n.stage === "ripening") && stale && (!n.lastDate || drop > n.lastDate);
    if (confirms || unseen) return { ...out, stage: "harvested", daysToReady: null, harvestedOn: drop, radarHarvestOn: drop, basis: "radar" };
  }

  const leavesDown = Boolean(crop && cropProfile(crop).shedsLeaves && leavesDownOn && !drop && (n.stage === "harvested" || n.stage === "ready"));
  if (leavesDown && (!today || dayNumber(today) - dayNumber(leavesDownOn) <= LEAF_DROP_MAX_DAYS)) {
    return { ...out, stage: "ready", daysToReady: 0, harvestedOn: null, leafDrop: true, basis: "dry-down" };
  }

  if (isStandingDry({ ndvi: n, radar, crop, today })) {
    return n.stage === "harvested"
      ? { ...out, stage: "ready", daysToReady: 0, harvestedOn: null, standingDry: true, basis: "radar" }
      : { ...out, standingDry: true, basis: "dry-down" };
  }

  let gddDays = Number.isFinite(gdd?.daysToReady) ? gdd.daysToReady : null;
  if (gddDays !== null && today && crop && !harvestPlausible(crop, n.peakDate, addDays(today, gddDays))) gddDays = null;
  // A dry-down that ends outside the crop's usual harvest months after its
  // peak (a spring cereal "ripening" four months after its peak) does not
  // fit the crop: cropMismatch, so the caller can drop the crop-specific
  // rules and treat the crop as uncertain.
  const knownCrop = crop && cropProfile(crop).id !== "other";
  const readyOn = n.stage === "ready" ? today || n.lastDate : n.stage === "ripening" && today && Number.isFinite(n.daysToReady) ? addDays(today, n.daysToReady) : null;
  const cropMismatch = Boolean(knownCrop && readyOn && n.peakDate && !harvestPlausible(crop, n.peakDate, readyOn));
  if (n.stage === "ripening") {
    const agree = gddDays !== null && Number.isFinite(n.daysToReady) && Math.abs(gddDays - n.daysToReady) <= HARVEST_AGREE_DAYS;
    return { ...out, basis: agree ? "both" : "dry-down", ...(cropMismatch ? { cropMismatch } : {}) };
  }
  if (n.stage === "ready") return { ...out, basis: "dry-down", ...(cropMismatch ? { cropMismatch } : {}) };
  if (n.stage === "growing" && gddDays !== null) return { ...out, daysToReady: Math.max(1, gddDays), basis: "heat units" };
  // Harvested by the optical record: plant health fell to bare-soil level
  // (a sharp drop, two low passes in a row, or a long stay at that level).
  if (n.stage === "harvested") return { ...out, basis: "images" };
  return out;
}

// Harvest readiness for a field whose crop is not known (no crop set by
// the farmer, none detected for this season, or a detection that did not
// fit its harvest months): a date can only be estimated for a known crop,
// so only what was measured is said.
//   h  combineHarvestEstimate() result made with no crop
// "ripening" and "ready" become "growing" with no days, no window and no
// basis, and dryDown says what was seen: "dry" (plant health down to the
// ready level: BARE_NDVI + READY_SHARE x (peak - BARE_NDVI)) or "fading"
// (past the peak and falling, not that low yet). "harvested" (the optical
// drop, or the radar), "notSown" and "unknown" are measurements and stay.
// Every result has cropUnknown: true. (Real data, 2026-10-19: a field of
// unknown crop near Kupiansk, probably grass, read "ready about Oct 22";
// unknown Iowa fields read "Ready to harvest · Best by Oct 29".)
//   options.fallow  the field reads as fallow or grass (crops.js FALLOW):
//                   never bare after green-up, so a "harvest" seen in the
//                   optical record is its slow fade to dry grass, not a
//                   cut: it is read as "dry". A radar drop is a mowing or a
//                   cut for hay: the stage stays "harvested" with mown: true
//                   (MOWN_LABEL, "Cut or mown"). The result has fallow: true.
export function unknownCropHarvest(h, { fallow = false } = {}) {
  const out = { ...(h || { stage: "unknown" }), cropUnknown: true, dryDown: null, ...(fallow ? { fallow: true } : {}) };
  if (fallow && out.stage === "harvested" && out.basis === "radar") return { ...out, mown: true };
  if (fallow && out.stage === "harvested") return { ...out, stage: "growing", harvestedOn: null, daysToReady: null, basis: null, dryDown: "dry" };
  if (out.stage === "growing") return { ...out, daysToReady: null, basis: null };
  if (out.stage !== "ripening" && out.stage !== "ready") return out;
  const level = Number.isFinite(out.readyLevel) ? out.readyLevel : Number.isFinite(out.peak) ? BARE_NDVI + READY_SHARE * (out.peak - BARE_NDVI) : null;
  const dry = Number.isFinite(out.current) && Number.isFinite(level) ? out.current <= level : out.stage === "ready";
  return { ...out, stage: "growing", daysToReady: null, basis: null, standingDry: false, leafDrop: false, dryDown: dry ? "dry" : "fading" };
}

// ---------------------------------------------------------------------------
// Damage and the field's status
// ---------------------------------------------------------------------------
// Damage is looked for anywhere on Earth. Where a known war covers the farm
// (src/config/conflicts.js) it is counted from the day the war started;
// elsewhere over the last two years. Either way it is compared with the
// normal years 2019 to 2021, so a farm that burns its stubble every year
// is not "damaged" (only fires ABOVE the usual rate count).

// Radar roughness change (Sentinel-1 VV, the growing season in the normal
// years vs the last one) that marks cratering or compaction, in decibels.
export const RADAR_CHANGE_DB = 3;

// The evidence levels.
export const DAMAGE_RULES = {
  radarShare: 0.1, // radar change over this share of the field is damage on its own
  supportRadarShare: 0.05, // a smaller radar change that supports other evidence
  supportChiDrop: 0.1, // a drop in the Chernozem Health Index that supports other evidence
  fires: 3, // fire detections above the usual rate, in the damage window
};

const atLeast = (value, level) => Number.isFinite(value) && value >= level;

// When a field counts as damaged. Same evidence as the research: excess
// fire and radar change, with the health index as support.
//   radarChangedShare - share of the field with a radar change of RADAR_CHANGE_DB or more
//   excessFires       - fire detections inside the field in the damage window,
//                       minus what the normal years' rate would give for a
//                       window that long (never below 0). "firesSinceWar" is
//                       the old name and is still read.
//   chiDrop           - drop in the Chernozem Health Index from the baseline
//   atWar             - false when no known war covers the field
//                       (src/config/conflicts.js); left out = at war (older
//                       analyses were all inside Ukraine)
// Fires never count on their own: a fire pixel is about 1 km across, so one
// fire is "in" every field within about 1 km, and stubble burning is
// common. They count when the radar or the health index backs them up.
// The health index is never enough on its own either.
// Away from any war, radar change alone is not damage: ploughing, a new
// crop, a meadow turned into a field or a flooded corner all change the
// radar by 3 dB over part of a field (real data, Beauce, France,
// 2026-10-19: 38% of a peaceful wheat field "changed"). There a field is
// damaged only when unusual fire AND radar change are both found (a field
// that really burnt).
export function damageDetected({ radarChangedShare, excessFires, firesSinceWar, chiDrop, atWar } = {}) {
  const r = DAMAGE_RULES;
  const fires = Number.isFinite(excessFires) ? excessFires : firesSinceWar;
  if (atWar === false) return atLeast(fires, r.fires) && atLeast(radarChangedShare, r.supportRadarShare);
  if (atLeast(radarChangedShare, r.radarShare)) return true;
  const support = atLeast(radarChangedShare, r.supportRadarShare) || atLeast(chiDrop, r.supportChiDrop);
  if (atLeast(fires, r.fires) && support) return true;
  if (atLeast(chiDrop, r.supportChiDrop) && atLeast(radarChangedShare, r.supportRadarShare)) return true;
  return false;
}

// The damaged area in hectares: the radar-changed share of the field. When
// the damage is shown only by fires and the health index (the radar change
// is too small to measure an extent) the area is unknown: null, never a
// misleading near-zero number.
export function damagedArea(evidence = {}, areaHa) {
  const { radarChangedShare } = evidence;
  if (!damageDetected(evidence)) return null;
  if (!atLeast(radarChangedShare, DAMAGE_RULES.supportRadarShare) || !Number.isFinite(areaHa)) return null;
  return Math.round(radarChangedShare * areaHa * 100) / 100;
}

// A damaged field is never shown better than "Fair". The crop readings
// cannot see craters, mines or compacted soil: in autumn a cratered patch
// reads about the same as stubble, which is normal for the season, so the
// readings alone could call a damaged field "Very good".
export const DAMAGED_CONDITION_MAX = 0.64; // just under the top of "Fair"

export function conditionForDamage(score, damage) {
  if (!Number.isFinite(score) || !damage?.detected) return score;
  return Math.min(score, DAMAGED_CONDITION_MAX);
}

// ---------------------------------------------------------------------------
// Soil and weather
// ---------------------------------------------------------------------------

// A field is on chernozem (black soil) when the black-soil probability over
// the field is at least this.
export const CHERNOZEM_SOIL_MIN = 0.5;

// The soil type id from src/data/soilTypes.js, or null.
export function soilTypeFor(probability) {
  return Number.isFinite(probability) && probability >= CHERNOZEM_SOIL_MIN ? "chernozem" : null;
}

// A forecast day counts as rainy at this chance (%) AND amount (mm).
export const RAINY_DAY = { chance: 50, mm: 1 };

export function isRainyDay({ rainChance, rainMm } = {}) {
  return (rainChance ?? 0) >= RAINY_DAY.chance && (rainMm ?? 0) >= RAINY_DAY.mm;
}

// Every status a field can have, with its badge colour.
export const FIELD_STATUSES = {
  recovery: { label: "Needs recovery", tone: "red" },
  ready: { label: "Ready to harvest", tone: "ink" },
  harvestSoon: { label: "Harvest soon", tone: "blue" },
  harvested: { label: "Harvested", tone: null },
  notSown: { label: "Not sown", tone: null },
  // Read as fallow or grass (crops.js FALLOW), mown or not: no crop.
  fallow: { label: "Fallow or grass", tone: null },
  // A crop the app cannot name, dried down to the ready level: no crop to
  // score and no harvest date (noCropState).
  driedDown: { label: "Dried down", tone: null },
  watch: { label: "Watch", tone: "amber" },
  // A crop the app cannot name, on a field that looks possibly like fallow
  // or grass (crops.js possiblyFallow): not "Growing well" until the farmer
  // says what grows there. Counted "To watch".
  unclear: { label: "Crop unclear", tone: null },
  healthy: { label: "Growing well", tone: "green" },
  unknown: { label: "No clear image yet", tone: null },
};

// Harvest within HARVEST_SOON_DAYS: a crop drying down, or a green crop
// whose heat units say so (combineHarvestEstimate, basis "heat units").
function harvestDue(harvest) {
  if (!Number.isFinite(harvest?.daysToReady) || harvest.daysToReady > HARVEST_SOON_DAYS) return false;
  return harvest.stage === "ripening" || (harvest.stage === "growing" && harvest.basis === "heat units");
}

// The field's one status, most urgent first.
//   damage    - { detected }
//   harvest   - the harvest object (harvestStage / combineHarvestEstimate /
//               unknownCropHarvest result)
//   condition - the field's condition score, 0 to 1
//   stress    - stressLevel()
//   health    - versusNormal() for plant health
//   possiblyFallow - true for an unknown crop on a field that is possibly
//               fallow or grass (crops.js possiblyFallow): "unclear"
// A field with no crop (noCropState: fallow, harvested, not sown, dried
// down) is never "Growing well" or "Watch".
export function fieldStatus({ damage, harvest, condition, stress, health, possiblyFallow = false }) {
  let id = "healthy";
  const noCrop = harvest ? noCropState(harvest) : null;
  if (damage?.detected) id = "recovery";
  else if (noCrop === "fallow") id = "fallow";
  else if (harvest?.stage === "ready") id = "ready";
  else if (harvestDue(harvest)) id = "harvestSoon";
  else if (noCrop) id = noCrop;
  else if (!Number.isFinite(condition)) id = "unknown";
  else if (possiblyFallow && harvest?.cropUnknown) id = "unclear";
  else if (condition < CONDITION_CLASSES[1].upTo || stress === "medium" || stress === "high" || health === "below") id = "watch";
  return { id, ...FIELD_STATUSES[id] };
}

// Which statuses count in the overview's groups:
//   growing   a crop in the field, "In crop": growing well (healthy),
//             harvest soon, ready to harvest
//   watch     to watch (or no clear image yet, or the crop is unclear)
//   recovery  needs recovery (damage)
//   noCrop    no crop to score: harvested, not sown, fallow or grass,
//             dried down (a crop the app cannot name)
// STATUS_GROUPS.healthy is the old name of "growing", kept so older code
// still works; it is not enumerable, so Object.keys / entries list each
// group once.
export const STATUS_GROUPS = {
  growing: ["healthy", "harvestSoon", "ready"],
  watch: ["watch", "unknown", "unclear"],
  recovery: ["recovery"],
  noCrop: ["harvested", "notSown", "fallow", "driedDown"],
};
Object.defineProperty(STATUS_GROUPS, "healthy", { value: STATUS_GROUPS.growing, enumerable: false });

// The group of a status id ("growing", "watch", "recovery", "noCrop"), or null.
export function statusGroup(statusId) {
  return Object.keys(STATUS_GROUPS).find((group) => STATUS_GROUPS[group].includes(statusId)) || null;
}

// ---------------------------------------------------------------------------
// Recovery cost and units
// ---------------------------------------------------------------------------

// US dollars per hectare before demining, the same numbers as the Atlas.
// PLANNING ASSUMPTIONS from the product design, not measured and not tied
// to a published source: shown everywhere with COST_NOTE.
export const COST_NOTE = "Planning assumption (not sourced)";
export const RECOVERY_COSTS = {
  fast: { label: "Fast path", perHa: [95, 290] },
  full: { label: "Full recovery", perHa: [260, 620] },
};

export function recoveryCost(hectares) {
  const ha = Number.isFinite(hectares) ? hectares : 0;
  return Object.fromEntries(
    Object.entries(RECOVERY_COSTS).map(([id, path]) => [id, { ...path, total: [path.perHa[0] * ha, path.perHa[1] * ha] }])
  );
}

// Area units. 1 ha = 2.4711 acres = 15 mu.
export const UNITS = {
  ha: { label: "Hectares", short: "ha", perHa: 1 },
  acres: { label: "Acres", short: "acres", perHa: 2.471054 },
  mu: { label: "亩", short: "亩", perHa: 15 },
};

export function convertArea(hectares, unit = "ha") {
  return hectares * (UNITS[unit] || UNITS.ha).perHa;
}
