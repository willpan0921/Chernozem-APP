// WHAT THIS FILE DOES
// Turns what a data source measured for one field (Earth Engine or the
// sample) into the finished field analysis the pages show, by applying the
// Field method (src/lib/field/method.js). Both data sources go through
// here, so the rules are identical whichever one measured the field.
//
//   finishAnalysis({ field, raw, weather, today })  -> FieldAnalysis
//   stripForList(analysis)                           -> without the big parts
//
// What is worked out here (never by a data source):
//   water/plant health "below/normal/above" (versusNormal), stress level,
//   condition class, the harvest stage from this season's curve, the
//   harvest window and whether rain is due before it, damage
//   (damageDetected, from fires ABOVE the normal years' rate, radar change
//   and the health index; away from any war radar change alone is not
//   damage), the field's status and the soil type; and which
//   known war, if any, covers the field (analysis.conflict, from the data
//   source or server/conflicts.js).
//
// WHO EDITS IT
// Whoever changes how a field's analysis is put together. Thresholds live
// in method.js, not here.

import {
  conditionClass,
  conditionForDamage,
  conditionScore,
  damageDetected,
  damagedArea,
  fieldStatus,
  HARVEST_WINDOW_DAYS,
  harvestStage,
  healthScore,
  soilTypeFor,
  stressLevel,
  versusNormal,
  waterScore,
} from "../../src/lib/field/method.js";
import { areaHa as sphericalAreaHa, bboxOf } from "../geo.js";
import { conflictAt } from "../conflicts.js";

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
//   harvest - harvestStage() result
//   weather - the /api/farm/weather answer, or null
export function harvestWindow(harvest, weather, today) {
  if (harvest.stage !== "ready" && harvest.stage !== "ripening") return { window: null, rainBefore: null };
  const from = harvest.stage === "ready" ? today : addDays(today, harvest.daysToReady || 0);
  const window = { from, to: addDays(from, HARVEST_WINDOW_DAYS) };
  if (!weather) return { window, rainBefore: null };
  const rain = weather.rain;
  // Rain that falls while the crop is ready (before the window ends).
  return { window, rainBefore: Boolean(rain?.likely && rain.from && rain.from <= window.to && (rain.to || rain.from) >= window.from) };
}

export function finishAnalysis({ field, raw, weather = null, today, provider } = {}) {
  const day = today || localToday();
  const r = raw || {};
  const areaHa = Number.isFinite(field?.areaHa) ? field.areaHa : field?.geometry ? sphericalAreaHa(field.geometry) : null;

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

  const share = num(r.stress?.share);
  const stress = {
    share,
    level: stressLevel(share),
    stressedHa: num(r.stress?.stressedHa) ?? (Number.isFinite(share) && Number.isFinite(areaHa) ? round(share * areaHa, 2) : null),
    patches: (Array.isArray(r.stress?.patches) ? r.stress.patches : [])
      .filter((p) => [p?.lat, p?.lon].every(Number.isFinite))
      .slice(0, 3)
      .map((p) => ({ lat: p.lat, lon: p.lon, radiusM: num(p.radiusM), ha: num(p.ha) })),
  };


  const season = (Array.isArray(r.season) ? r.season : [])
    .filter((p) => p && typeof p.date === "string" && Number.isFinite(p.ndvi))
    .map((p) => ({ date: p.date.slice(0, 10), ndvi: p.ndvi, ndwi: num(p.ndwi), clearPct: num(p.clearPct) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const stage = harvestStage(season, day);
  const { window, rainBefore } = harvestWindow(stage, weather, day);
  const harvest = {
    stage: stage.stage,
    daysToReady: stage.daysToReady ?? null,
    window,
    rainBefore,
    peak: num(stage.peak),
    peakDate: stage.peakDate || null,
    lastDate: stage.lastDate || null,
    // The pass where the harvest shows (stage "harvested" only).
    harvestedOn: stage.harvestedOn || null,
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
    fires: num(r.damage?.fires),
    firesNormal: num(r.damage?.firesNormal),
    since: typeof r.damage?.since === "string" ? r.damage.since.slice(0, 10) : null,
    damagedHa: damagedArea({ ...evidence, atWar: Boolean(conflict) }, areaHa),
  };

  // The combined condition; a damaged field is never shown better than
  // "Fair" (conditionForDamage in method.js).
  const measured = num(r.condition?.score) ?? conditionScore({ health: plantHealth.score, water: water.score, stress: share });
  const score = conditionForDamage(measured, damage);
  const condition = { score: round(score), class: conditionClass(score)?.id || null };

  const status = fieldStatus({ damage, harvest: stage, condition: condition.score, stress: stress.level, health: plantHealth.versus });
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
    stress,
    harvest,
    condition,
    damage,
    conflict,
    status,
    soil: { chernozemProbability, soilTypeId: soilTypeFor(chernozemProbability) },
    season,
    normalCurve: Array.isArray(r.normalCurve) ? r.normalCurve : [],
    zones: r.zones && Array.isArray(r.zones.values) ? r.zones : null,
    warnings: (Array.isArray(r.warnings) ? r.warnings : []).filter((w) => typeof w === "string").slice(0, 10),
  };
}

// The analysis as GET /api/farm lists it: without the season curve, the
// normal curve and the zones grid.
export function stripForList(analysis) {
  if (!analysis) return null;
  const { season, normalCurve, zones, ...rest } = analysis;
  return rest;
}
