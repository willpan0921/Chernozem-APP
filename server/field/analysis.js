// WHAT THIS FILE DOES
// Turns what a data source measured for one field (Earth Engine or the
// sample) into the finished field analysis the pages show, by applying the
// Field method (src/lib/field/method.js, with crops.js). Both data sources
// go through here, so the rules are identical whichever one measured the
// field.
//
//   finishAnalysis({ field, raw, weather, today, history, temperatures })
//                                -> FieldAnalysis
//   stripForList(analysis)       -> without the big parts
//   seasonOf({ harvest, season, normalCurve, cropDetected, crop }) -> lastSeason or null
//   cropSourceOf(field)          -> "user" | "detected" | "demo" | null
//   cropForRules(field, detected) -> the crop the rules use { id, label, source }
//
// What is worked out here (never by a data source):
//   - water/plant health "below/normal/above" (versusNormal);
//   - the crop type from the field's own record (classifyCrop: the last 18
//     months of its monthly history, this season's passes with their
//     yellow-flower index, the place's peak month, the radar peak);
//   - harvest readiness from three sources (combineHarvestEstimate): this
//     season's plant-health curve (the dry-down), heat units since green-up
//     (gddEstimate, daily highs and lows from Open-Meteo) for the crop, and
//     the Sentinel-1 radar (a VH drop = cut; no drop on a low tall crop =
//     still standing, "ready"); the harvest window and rain before it;
//   - for a field whose crop is not known this season, no harvest date
//     (unknownCropHarvest: only what was measured);
//   - stress (NDVI or red-edge rule, from the data source) with its likely
//     cause (dry or not water), "No crop" when the field is harvested
//     or not sown and "Dried down" when the crop has dried down for harvest; the weather-based pest and disease RISK while a crop
//     grows (hours of wet warm weather, insect degree-days);
//   - how the season went (lastSeason: this season's plant health from
//     green-up to harvest against the normal on the same days, method.js
//     seasonResult) for a harvested, dried-down or ready crop;
//   - the condition (none for a field with no crop: harvested, not sown,
//     fallow or grass, or an unknown crop dried down), damage
//     (damageDetected, from fires ABOVE the normal years' rate, radar change
//     and the health index; away from any war radar change alone is not
//     damage), the field's status and the soil type; and which known war,
//     if any, covers the field (analysis.conflict, from the data source or
//     server/conflicts.js).
//
// WHO EDITS IT
// Whoever changes how a field's analysis is put together. Thresholds live
// in method.js and crops.js, not here.

import {
  classifyCrop,
  combineHarvestEstimate,
  cropIdFor,
  cropProfile,
  CROP_PROFILES,
  damageDetected,
  damagedArea,
  diseaseRisk,
  fieldCondition,
  fieldStatus,
  gddEstimate,
  gddStartDate,
  greenUpDate,
  HARVEST_WINDOW_DAYS,
  harvestStage,
  healthScore,
  insectRisk,
  pestRiskApplies,
  unknownCropHarvest,
  radarForHarvest,
  seasonResult,
  soilTypeFor,
  STRESS_CAUSES,
  stressCause,
  stressCauseShown,
  stressSummary,
  cleanSeries,
  NOT_SOWN_PEAK,
  noCropState,
  SEASON_DONE_DROP,
  versusNormal,
  vhPeakNear,
  waterScore,
} from "../../src/lib/field/method.js";
import { BASELINE_YEARS, peakMonthFrom } from "../../src/lib/season.js";
import { areaHa as sphericalAreaHa, bboxOf } from "../geo.js";
import { conflictAt } from "../conflicts.js";
import { isDemoCrop } from "./demo.js";

export { HARVEST_WINDOW_DAYS, soilTypeFor };

// Today on this computer's calendar, "YYYY-MM-DD" (not the UTC date, which
// is already tomorrow in the evening west of Greenwich). Used for every
// Field date so the analysis, the harvest window and the AI agree.
export function localToday(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}

const DAY_MS = 86400000;
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const round = (value, digits = 3) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);

// The months of history the crop classifier reads.
export const CROP_HISTORY_MONTHS = 18;
// A winter crop's season curve often starts already green (sown in
// autumn): its green-up (spring regrowth) may start from this high.
const WINTER_GREEN_UP_MAX_BASE = 0.6;

// ---------- The field's crop ----------

export const CROP_SOURCES = ["user", "detected", "demo"];

// Where the field's crop came from:
//   "user"      the farmer picked or typed it
//   "detected"  the analysis found it (classifyCrop); field.crop holds its label
//   "demo"      a placeholder of the demo farm, replaced by the detected
//               crop on the next analysis
//   null        no crop yet
// Fields saved before cropSource existed: a demo field with its demo crop is
// "demo", any other crop was set by the farmer ("user").
export function cropSourceOf(field) {
  if (!field) return null;
  if (CROP_SOURCES.includes(field.cropSource)) return field.crop || field.cropSource === "detected" ? field.cropSource : null;
  if (!field.crop) return null;
  return field.source === "demo" && isDemoCrop(field.name, field.crop) ? "demo" : "user";
}

// The crop the rules use (crop profile, heat units, radar): the farmer's
// crop when they set one, else the detected crop, else none.
//   detected  analysis.cropDetected (classifyCrop result) or null
// A crop detected from LAST season (classifyCrop season "last": this season
// has not peaked yet) is not used: fields are rotated, so last summer's
// soybean says nothing about this season's wheat.
export function cropForRules(field, detected) {
  if (cropSourceOf(field) === "user" && field.crop) {
    const id = cropIdFor(field.crop);
    return { id, label: field.crop, source: "user" };
  }
  if (detected && detected.id && detected.id !== "unknown" && detected.season !== "last" && CROP_PROFILES[detected.id]) {
    return { id: detected.id, label: detected.label || CROP_PROFILES[detected.id].label, source: "detected" };
  }
  return { id: null, label: null, source: null };
}

// The place's greenest month (1-12) from the field's monthly history: the
// mean of each calendar month in the normal years 2019-2021 (all years when
// those are missing), then season.js peakMonthFrom. Null when unclear.
export function peakMonthFromHistory(months) {
  const list = (Array.isArray(months) ? months : []).filter((m) => typeof m?.month === "string" && Number.isFinite(m.ndvi));
  const pick = (rows) => {
    const sums = Array.from({ length: 12 }, () => []);
    for (const m of rows) sums[Number(m.month.slice(5, 7)) - 1]?.push(m.ndvi);
    return sums.map((values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null));
  };
  const baseline = list.filter((m) => BASELINE_YEARS.includes(Number(m.month.slice(0, 4))));
  return peakMonthFrom(pick(baseline)) ?? peakMonthFrom(pick(list));
}

// The war covering a field: what the data source said, else looked up from
// the field's centre. { id, name, since } or null.
function conflictOf(raw, field) {
  if (raw && raw.conflict !== undefined) {
    const c = raw.conflict;
    return c && c.id ? { id: String(c.id), name: String(c.name || c.id), since: typeof c.since === "string" ? c.since : null } : null;
  }
  if (!field?.geometry) return null;
  const [west, south, east, north] = bboxOf(field.geometry);
  const found = conflictAt((south + north) / 2, (west + east) / 2);
  return found ? { id: found.id, name: found.name, since: found.since } : null;
}

function cleanNormal(normal) {
  return { low: num(normal?.low), high: num(normal?.high), median: num(normal?.median) };
}

// When to harvest and whether rain is due first.
//   harvest - combineHarvestEstimate() (or harvestStage()) result
//   weather - the /api/farm/weather answer, or null
// A window for a crop that is ready, ripening, or still green with a
// heat-unit estimate (basis "heat units").
export function harvestWindow(harvest, weather, today) {
  const growingByHeat = harvest.stage === "growing" && harvest.basis === "heat units" && Number.isFinite(harvest.daysToReady);
  if (harvest.stage !== "ready" && harvest.stage !== "ripening" && !growingByHeat) return { window: null, rainBefore: null };
  const from = harvest.stage === "ready" ? today : addDays(today, harvest.daysToReady || 0);
  const window = { from, to: addDays(from, HARVEST_WINDOW_DAYS) };
  if (!weather) return { window, rainBefore: null };
  const rain = weather.rain;
  // Rain that falls while the crop is ready (before the window ends).
  return { window, rainBefore: Boolean(rain?.likely && rain.from && rain.from <= window.to && (rain.to || rain.from) >= window.from) };
}

// The weather-based pest and disease risk from the weather's hourly
// summary ({ wetHours14, gdd14 }, server/field/weather.js), only while a
// crop is growing or ripening and the field is not fallow, possibly grass
// or dried down (method.js pestRiskApplies). Null otherwise.
//   harvest       the harvest object (or a stage id)
//   cropDetected  classifyCrop() result (optional)
export function pestRiskFrom(hourly, harvest, cropDetected = null) {
  if (!hourly || !pestRiskApplies(harvest, cropDetected)) return null;
  const wetHours = num(hourly.wetHours14);
  const gdd14 = num(hourly.gdd14);
  const disease = diseaseRisk(wetHours);
  const insects = insectRisk(gdd14);
  if (!disease && !insects) return null;
  return { disease, insects, basis: { wetHours, gdd14 } };
}

// True when this season's own curve has peaked and come down (the crop
// classifier then reads this season; otherwise it reads the last complete
// season from the monthly history, and this season's radar peak does not
// belong to that season, so it is not passed on).
function seasonPassesDone(season) {
  const series = cleanSeries(season);
  if (series.length < 5) return false;
  const i = series.reduce((best, p, k) => (p.ndvi > series[best].ndvi ? k : best), 0);
  const peak = series[i].ndvi;
  return peak >= NOT_SOWN_PEAK && series.slice(i + 1).some((p) => p.ndvi <= peak - SEASON_DONE_DROP);
}

// How the season went (method.js seasonResult) for a harvested field, a
// crop dried down (an unknown crop: noCropState "driedDown") or a crop
// ready to harvest (these two "so far": not cut yet). Null otherwise, and
// null for a field with no crop known that is possibly grass (crops.js
// possiblyFallow: the page says "Unknown · possibly grass", so its cut may
// be a hay cut, not a crop season to grade).
//   cropDetected  classifyCrop() result, crop  cropForRules() result (both
//                 optional)
export function seasonOf({ harvest, season, normalCurve, cropDetected = null, crop = null }) {
  if (!harvest || harvest.fallow) return null;
  if (!crop?.id && cropDetected?.possiblyFallow) return null;
  const cut = harvest.stage === "harvested";
  const soFar = harvest.stage === "ready" || noCropState(harvest) === "driedDown";
  if (!cut && !soFar) return null;
  const harvestedOn = cut ? [harvest.harvestedOn, harvest.radarHarvestOn].filter(Boolean).sort()[0] || null : null;
  const result = seasonResult({ points: season, normalCurve: Array.isArray(normalCurve) ? normalCurve : [], harvestedOn });
  return result ? { ...result, soFar: !cut, harvestedOn } : null;
}

// The radar series a data source sent: [{ date, vh }] (dB) and the peak.
// Without the source's peak, the highest pass within VH_PEAK_DAYS of this
// season's NDVI peak (ndviPeakDate), never the whole series' maximum
// (frozen winter ground reads brighter than any crop).
function radarOf(r, ndviPeakDate) {
  const block = r.radar && typeof r.radar === "object" ? r.radar : r;
  const series = (Array.isArray(block.vhSeries) ? block.vhSeries : [])
    .filter((p) => p && typeof p.date === "string" && Number.isFinite(p.vh))
    .map((p) => ({ date: p.date.slice(0, 10), vh: p.vh, ...(typeof p.orbit === "string" ? { orbit: p.orbit } : {}) }));
  if (num(block.vhPeak) !== null) return { series, peak: num(block.vhPeak), peakDate: typeof block.vhPeakDate === "string" ? block.vhPeakDate.slice(0, 10) : null };
  const near = vhPeakNear(series, ndviPeakDate);
  return { series, peak: near.vhPeak, peakDate: near.vhPeakDate };
}

// The date of this season's NDVI peak (cleaned curve), or null.
function ndviPeakDate(season) {
  const series = cleanSeries(season);
  if (!series.length) return null;
  return series.reduce((best, p) => (p.ndvi > best.ndvi ? p : best)).date;
}

//   field         the farm's field (crop, cropSource, geometry, areaHa)
//   raw           what the data source measured (field-gee.js / field-sample.js)
//   weather       getWeather() answer (rain, hourly risk inputs) or null
//   today         "YYYY-MM-DD"
//   history       the field's saved monthly history { months } or null
//   temperatures  dailyTemperatures() list [{ date, tmax, tmin }] covering
//                 this season up to the forecast, or null
export function finishAnalysis({ field, raw, weather = null, today, provider, history = null, temperatures = null } = {}) {
  const day = today || localToday();
  const r = raw || {};
  const areaHa = Number.isFinite(field?.areaHa) ? field.areaHa : field?.geometry ? sphericalAreaHa(field.geometry) : null;
  const centre = field?.geometry ? bboxOf(field.geometry) : null;
  const lat = centre ? (centre[1] + centre[3]) / 2 : null;

  const waterNormal = cleanNormal(r.water?.normal);
  const healthNormal = cleanNormal(r.plantHealth?.normal);
  const ndwi = num(r.water?.ndwi);
  const ndvi = num(r.plantHealth?.ndvi);
  // Scores measured per pixel by the data source (median over the field);
  // worked out from the field medians when a source does not give them.
  const waterValue = num(r.water?.score) ?? waterScore(ndwi, waterNormal.median);
  const healthValue = num(r.plantHealth?.score) ?? healthScore(ndvi, healthNormal.median);
  const water = { ndwi, normal: waterNormal, versus: versusNormal(ndwi, waterNormal.low, waterNormal.high), score: round(waterValue) };
  const plantHealth = { ndvi, normal: healthNormal, versus: versusNormal(ndvi, healthNormal.low, healthNormal.high), score: round(healthValue) };

  // This season's clear passes (NDYI, the yellow-flower index, when the
  // data source measured it).
  const season = (Array.isArray(r.season) ? r.season : [])
    .filter((p) => p && typeof p.date === "string" && Number.isFinite(p.ndvi))
    .map((p) => ({
      date: p.date.slice(0, 10),
      ndvi: p.ndvi,
      ndwi: num(p.ndwi),
      clearPct: num(p.clearPct),
      ...(Number.isFinite(p.ndre) ? { ndre: p.ndre } : {}),
      ...(Number.isFinite(p.ndyi) ? { ndyi: p.ndyi } : {}),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // The crop: detected from the field's own record; the farmer's choice
  // wins for the rules.
  const radar = radarOf(r, ndviPeakDate(season));
  // The monthly record: the saved history, else the recent months the
  // data source measured with this analysis (cropInputs.months).
  const saved = Array.isArray(history?.months) && history.months.length ? history.months : Array.isArray(r.cropInputs?.months) ? r.cropInputs.months : [];
  const months = saved.filter((m) => typeof m?.month === "string").sort((a, b) => a.month.localeCompare(b.month));
  // The place's peak month: the data source's (2019-2021, MODIS), else
  // from the field's own history.
  const rawPeakMonth = num(r.peakMonth) ?? num(r.cropInputs?.peakMonth);
  const peakMonth = rawPeakMonth >= 1 && rawPeakMonth <= 12 ? rawPeakMonth : peakMonthFromHistory(months);
  const vhPeak = seasonPassesDone(season) && Number.isFinite(radar.peak) ? radar.peak : undefined;
  let cropDetected = classifyCrop({ months: months.slice(-CROP_HISTORY_MONTHS), passes: season, peakMonth, lat, vhPeak });
  let crop = cropForRules(field, cropDetected);

  // Harvest readiness: the dry-down (crop's ready share), heat units since
  // green-up, and the radar.
  // (A soybean's leaves falling looks like a cut on radar: radarForHarvest.)
  const estimate = (cropId) => {
    const profile = cropProfile(cropId);
    const stage = harvestStage(season, day, { readyShare: profile.readyShare });
    // The crop now in the field: from cycleStart when one was harvested
    // earlier in the curve (a double crop), so its green-up is its own.
    const cycle = stage.cycleStart ? season.filter((p) => p.date >= stage.cycleStart) : season;
    const cropping = stage.stage === "growing" || stage.stage === "ripening";
    const greenUp = cropping && cropId ? greenUpDate(cycle, profile.gddFrom === "spring regrowth" ? { maxBase: WINTER_GREEN_UP_MAX_BASE } : {}) : null;
    // Counted from the green-up, or from the start of spring for a crop
    // counted from spring regrowth (crops.js gddStartDate).
    const from = gddStartDate({ crop: cropId, greenUp, today: day, lat });
    const gdd = from && Array.isArray(temperatures) && temperatures.length ? gddEstimate({ crop: cropId, greenUp: from, temperatures, today: day }) : null;
    const read = radarForHarvest({ vhSeries: radar.series, season: cycle, peakDate: stage.peakDate, crop: cropId });
    const radarRead = radar.series.length && stage.peakDate ? read.radar : null;
    return { greenUp, gddFrom: from, combined: combineHarvestEstimate({ ndvi: stage, gdd, radar: radarRead, crop: cropId, today: day, leavesDownOn: read.leavesDownOn }) };
  };
  let { greenUp, gddFrom, combined } = estimate(crop.id);
  // A detected crop whose dry-down does not fit its usual harvest months
  // (cropMismatch) was probably misread: its rules are dropped (the field
  // is read as an unknown crop) and the detection is only "possible".
  if (combined.cropMismatch && crop.source === "detected") {
    cropDetected = { ...cropDetected, confidence: "possible", reason: `${cropDetected.reason}; the dry-down does not fit a usual ${String(cropDetected.label).toLowerCase()} harvest, so it is uncertain` };
    crop = { id: null, label: null, source: null };
    ({ greenUp, gddFrom, combined } = estimate(null));
  }
  // No crop known for this season: no date is estimated (a harvest date
  // for a crop the app cannot name would be a guess); only what was
  // measured is said, and the farmer is asked for the crop.
  // Fallow or grass (crops.js FALLOW): no crop at all, so no crop stress
  // or pest risk either, and its slow fade is not a harvest.
  if (!crop.id) combined = unknownCropHarvest(combined, { fallow: cropDetected?.id === "fallow" });
  const { window, rainBefore } = harvestWindow(combined, weather, day);
  const harvest = {
    stage: combined.stage,
    daysToReady: Number.isFinite(combined.daysToReady) ? combined.daysToReady : null,
    window,
    rainBefore,
    peak: num(combined.peak),
    peakDate: combined.peakDate || null,
    lastDate: combined.lastDate || null,
    // The day the harvest shows (stage "harvested" only): the optical pass,
    // or the radar pass when the radar saw it through cloud.
    harvestedOn: combined.stage === "harvested" ? combined.harvestedOn || null : null,
    // What the estimate rests on: "dry-down" (plant-health curve), "heat
    // units" (growing degree-days), "both" (they agree), "radar" or null.
    basis: combined.basis || null,
    // greenUp: the green-up the satellite saw; from: the day heat units are
    // counted from (the start of spring for a winter cereal or rapeseed
    // that greened up earlier: crops.js gddStartDate).
    gdd: combined.gdd ? { ...combined.gdd, greenUp, from: gddFrom } : null,
    radarHarvestOn: combined.radarHarvestOn || null,
    // A tall crop dried down but not cut (no radar drop): "ready".
    standingDry: Boolean(combined.standingDry),
    // A soybean whose leaves are down: "ready", the radar cannot tell
    // whether it has been cut yet (method.js radarForHarvest).
    leafDrop: Boolean(combined.leafDrop),
    // No crop known for this season (method.js unknownCropHarvest): no
    // days or window, and dryDown says what was seen after the peak
    // ("fading" or "dry", else null).
    cropUnknown: Boolean(combined.cropUnknown),
    dryDown: combined.dryDown || null,
    // Read as fallow or grass: no crop in the field.
    fallow: Boolean(combined.fallow),
    // Fallow or grass with a radar drop: cut or mown (method.js MOWN_LABEL),
    // not harvested.
    mown: Boolean(combined.mown),
  };

  // How the season went, for a crop that is harvested, dried down or ready
  // (method.js seasonResult): this season from green-up to the cut (or to
  // the last pass, "so far", for a crop not cut yet) against the normal on
  // the same days. Never for fallow or grass (nor an unknown crop that is
  // possibly grass) or a field not sown. The
  // condition stays null for a field with no crop: this is the season,
  // not the crop now.
  const lastSeason = seasonOf({ harvest, season, normalCurve: r.normalCurve, cropDetected, crop });

  // Stress: the share the data source found (NDVI rule OR red-edge rule),
  // its likely cause, and nothing at all when there is no crop.
  const share = num(r.stress?.share);
  // A crop dried down for harvest is not read for stress either (its
  // leaves die back on purpose: method.js stressExemption).
  const summary = stressSummary({ stage: harvest.stage, dryDown: harvest.dryDown, fallow: harvest.fallow, share, ndwiAnomaly: num(r.stress?.ndwiAnomaly), redEdgeOnlyShare: num(r.stress?.redEdgeOnlyShare) });
  const givenCause = STRESS_CAUSES[r.stress?.cause] && r.stress.cause !== "spread" ? r.stress.cause : null;
  const patches = summary.applies
    ? (Array.isArray(r.stress?.patches) ? r.stress.patches : [])
        .filter((p) => [p?.lat, p?.lon].every(Number.isFinite))
        .slice(0, 3)
        .map((p) => ({ lat: p.lat, lon: p.lon, radiusM: num(p.radiusM), ha: num(p.ha), cause: STRESS_CAUSES[p.cause] && p.cause !== "spread" ? p.cause : stressCause(num(p.ndwiAnomaly)) }))
    : [];
  const measuredCause = summary.cause ?? (summary.applies && Number.isFinite(share) && share > 0 ? givenCause : null);
  const stress = {
    applies: summary.applies,
    // Why stress is not read: "noCrop" or "driedDown" (null when it is).
    reason: summary.reason,
    share: summary.share,
    level: summary.level,
    stressedHa: summary.applies ? num(r.stress?.stressedHa) ?? (Number.isFinite(share) && Number.isFinite(areaHa) ? round(share * areaHa, 2) : null) : null,
    // The cause shown: "dry" or "other" (measured over the stressed
    // pixels), or "spread" when medium or high stress has no mapped patch
    // (method.js stressCauseShown).
    cause: summary.applies ? stressCauseShown({ level: summary.level, cause: measuredCause, patches }) : null,
    redEdge: summary.redEdge,
    ndwiAnomaly: summary.applies ? round(num(r.stress?.ndwiAnomaly)) : null,
    redEdgeOnlyShare: summary.applies ? round(num(r.stress?.redEdgeOnlyShare)) : null,
    patches,
  };

  // Fires count only above the normal years' rate (excessFires). An
  // analysis saved before that was measured has only firesSinceWar, which
  // method.js still reads.
  // Away from any known war, radar change alone is not damage (method.js).
  const excessFires = num(r.damage?.excessFires);
  const conflict = conflictOf(r, field);
  const evidence = {
    radarChangedShare: num(r.damage?.radarChangedShare),
    ...(excessFires !== null || r.damage?.firesSinceWar === undefined ? { excessFires } : { firesSinceWar: num(r.damage?.firesSinceWar) }),
    chiDrop: num(r.damage?.chiDrop),
  };
  const detected = damageDetected({ ...evidence, atWar: Boolean(conflict) });
  // The damaged area always follows the method (radar extent, or unknown),
  // whatever the data source sent.
  const damage = {
    detected,
    ...evidence,
    // In the worst war year (fireYear: { start, end }; method.js
    // worstFireYear): its fire days and their usual count.
    fires: num(r.damage?.fires),
    firesNormal: num(r.damage?.firesNormal),
    fireYear: r.damage?.fireYear && typeof r.damage.fireYear.start === "string" && typeof r.damage.fireYear.end === "string" ? { start: r.damage.fireYear.start.slice(0, 10), end: r.damage.fireYear.end.slice(0, 10) } : null,
    since: typeof r.damage?.since === "string" ? r.damage.since.slice(0, 10) : null,
    damagedHa: damagedArea({ ...evidence, atWar: Boolean(conflict) }, areaHa),
  };

  // The combined condition: none for a field with no crop (harvested, not
  // sown, fallow or grass, an unknown crop dried down: method.js
  // noCropState); a damaged field is never shown better than "Fair".
  const measured = fieldCondition({ stage: harvest, health: plantHealth.score, water: water.score, stress: stress.share, damage });
  const condition = { score: round(measured.score), class: measured.class };

  // An unknown crop on a field that is possibly fallow or grass is "Crop
  // unclear" (To watch), never "Growing well".
  const status = fieldStatus({ damage, harvest, condition: condition.score, stress: stress.level, health: plantHealth.versus, possiblyFallow: !crop.id && Boolean(cropDetected?.possiblyFallow) });
  const chernozemProbability = num(r.soil?.chernozemProbability);

  const latestPass = r.latestPass?.date
    ? { date: String(r.latestPass.date).slice(0, 10), clearPct: num(r.latestPass.clearPct) }
    : season.length
      ? { date: season[season.length - 1].date, clearPct: season[season.length - 1].clearPct }
      : null;

  return {
    fieldId: field?.id || r.fieldId,
    provider: provider || r.provider || "sample",
    updatedAt: r.updatedAt || new Date().toISOString(),
    latestPass,
    water,
    plantHealth,
    // The red-edge reading (field median NDRE and its 2019-2021 normal),
    // when the data source measured it.
    redEdge: r.redEdge && Number.isFinite(r.redEdge.ndre) ? { ndre: r.redEdge.ndre, normal: cleanNormal(r.redEdge.normal) } : null,
    stress,
    // No risk for a field dried down to harvest level (nothing left to
    // infect) or with no crop (fallow, possibly grass).
    pestRisk: pestRiskFrom(weather?.hourly, harvest, cropDetected),
    harvest,
    cropDetected,
    // The crop the rules used and where it came from.
    cropUsed: crop,
    condition,
    // { score, class, label, peak, highest, normalPeak, mean, normalMean,
    // from, to, passes, soFar, harvestedOn } or null (seasonOf).
    lastSeason,
    damage,
    conflict,
    status,
    soil: { chernozemProbability, soilTypeId: soilTypeFor(chernozemProbability) },
    season,
    normalCurve: Array.isArray(r.normalCurve) ? r.normalCurve : [],
    radar: radar.series.length ? { vhSeries: radar.series, vhPeak: round(radar.peak, 2), vhPeakDate: radar.peakDate } : null,
    zones: r.zones && Array.isArray(r.zones.values) ? r.zones : null,
    warnings: (Array.isArray(r.warnings) ? r.warnings : []).filter((w) => typeof w === "string").slice(0, 10),
  };
}

// The analysis as GET /api/farm lists it: without the season curve, the
// normal curve, the radar series and the zones grid.
export function stripForList(analysis) {
  if (!analysis) return null;
  const { season, normalCurve, zones, radar, ...rest } = analysis;
  return rest;
}
