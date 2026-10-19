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
// Each is compared with the NORMAL for the same weeks of 2019 to 2021, the
// years before the full-scale war. "Normal" is a range: the lowest and
// highest of those three years.
//
// WHO EDITS IT
// Whoever changes the Field method. A change here changes every analysis
// made from then on.

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
// only 0.15 to 0.2 (real example: barley near Kupiansk, 0.44 to 0.28 in five
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
//   points - this season's clear passes, { date, ndvi }
//   today  - "YYYY-MM-DD"
// Gives back { stage, daysToReady, peak, peakDate, current, lastDate, slope }
// where stage is one of
//   "unknown"   too few clear passes
//   "notSown"   the field never greened up this season
//   "growing"   still green, no steady dry-down yet
//   "ripening"  drying down; daysToReady estimates when it will be ready
//   "ready"     dried down to harvest level
//   "harvested" a sharp drop to bare soil after the peak
export function harvestStage(points, today) {
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
  for (let i = 1; i < series.length; i++) {
    const before = series[i - 1];
    const after = series[i];
    const afterPeak = after.date > series[peakIndex].date;
    const quick = dayNumber(after.date) - dayNumber(before.date) <= HARVEST_DROP_DAYS;
    if (afterPeak && quick && after.ndvi < HARVESTED_NDVI && before.ndvi - after.ndvi > HARVEST_DROP) {
      const harvestedOn = after.date;
      const harvested = { ...base, stage: "harvested", harvestedOn };
      const regrowth = series.slice(i);
      const regrowthPeak = Math.max(...regrowth.map((p) => p.ndvi));
      const regrowthDays = dayNumber(last.date) - dayNumber(harvestedOn);
      if (regrowthPeak < NEW_SEASON_PEAK || regrowthDays < NEW_SEASON_DAYS) return harvested;
      const next = harvestStage(regrowth, today);
      return next.stage === "unknown" || next.stage === "notSown" ? harvested : next;
    }
  }

  const recent = series.filter((p) => dayNumber(last.date) - dayNumber(p.date) <= 30).slice(-4);
  const slope = slopePerDay(recent);
  const readyLevel = BARE_NDVI + READY_SHARE * (peak - BARE_NDVI);
  const withSlope = { ...base, slope, readyLevel };

  if (peakIndex === series.length - 1 || current > 0.85 * peak) return { ...withSlope, stage: "growing" };
  if (current <= readyLevel) {
    return current < HARVESTED_NDVI ? { ...withSlope, stage: "harvested" } : { ...withSlope, stage: "ready", daysToReady: 0 };
  }
  if (slope < -0.001) {
    const fromLastPass = Math.ceil((current - readyLevel) / -slope);
    const sinceLastPass = today ? Math.max(0, dayNumber(today) - dayNumber(last.date)) : 0;
    const days = Math.max(0, Math.min(90, fromLastPass - sinceLastPass));
    return days === 0 ? { ...withSlope, stage: "ready", daysToReady: 0 } : { ...withSlope, stage: "ripening", daysToReady: days };
  }
  return { ...withSlope, stage: "growing" };
}

// ---------------------------------------------------------------------------
// War damage and the field's status
// ---------------------------------------------------------------------------

// Radar roughness change (Sentinel-1 VV, summer before the war vs last
// summer) that marks cratering or compaction, in decibels.
export const RADAR_CHANGE_DB = 3;

// The evidence levels.
export const DAMAGE_RULES = {
  radarShare: 0.1, // radar change over this share of the field is damage on its own
  supportRadarShare: 0.05, // a smaller radar change that supports other evidence
  supportChiDrop: 0.1, // a drop in the Chernozem Health Index that supports other evidence
  fires: 3, // fire detections since the invasion
};

const atLeast = (value, level) => Number.isFinite(value) && value >= level;

// When a field counts as war-damaged. Same evidence as the research: excess
// fire and radar change, with the health index as support.
//   radarChangedShare - share of the field with a radar change of RADAR_CHANGE_DB or more
//   firesSinceWar     - fire detections inside the field since 24 Feb 2022
//   chiDrop           - drop in the Chernozem Health Index from the baseline
// Fires never count on their own: a fire pixel is about 1 km across, so one
// fire is "in" every field within about 1 km, and stubble burning is
// common. They count when the radar or the health index backs them up.
export function damageDetected({ radarChangedShare, firesSinceWar, chiDrop } = {}) {
  const r = DAMAGE_RULES;
  if (atLeast(radarChangedShare, r.radarShare)) return true;
  const support = atLeast(radarChangedShare, r.supportRadarShare) || atLeast(chiDrop, r.supportChiDrop);
  if (atLeast(firesSinceWar, r.fires) && support) return true;
  if (atLeast(chiDrop, r.supportChiDrop) && atLeast(radarChangedShare, r.supportRadarShare)) return true;
  return false;
}

// The damaged area in hectares: the radar-changed share of the field. When
// the damage is shown only by fires and the health index (the radar change
// is too small to measure an extent) the area is unknown: null, never a
// misleading near-zero number.
export function damagedArea({ radarChangedShare, firesSinceWar, chiDrop } = {}, areaHa) {
  if (!damageDetected({ radarChangedShare, firesSinceWar, chiDrop })) return null;
  if (!atLeast(radarChangedShare, DAMAGE_RULES.supportRadarShare) || !Number.isFinite(areaHa)) return null;
  return Math.round(radarChangedShare * areaHa * 100) / 100;
}

// A war-damaged field is never shown better than "Fair". The crop readings
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
  watch: { label: "Watch", tone: "amber" },
  healthy: { label: "Healthy", tone: "green" },
  unknown: { label: "No clear image yet", tone: null },
};

// The field's one status, most urgent first.
//   damage    - { detected }
//   harvest   - the result of harvestStage()
//   condition - the field's condition score, 0 to 1
//   stress    - stressLevel()
//   health    - versusNormal() for plant health
export function fieldStatus({ damage, harvest, condition, stress, health }) {
  let id = "healthy";
  if (damage?.detected) id = "recovery";
  else if (harvest?.stage === "ready") id = "ready";
  else if (harvest?.stage === "ripening" && harvest.daysToReady <= HARVEST_SOON_DAYS) id = "harvestSoon";
  else if (harvest?.stage === "harvested") id = "harvested";
  else if (harvest?.stage === "notSown") id = "notSown";
  else if (!Number.isFinite(condition)) id = "unknown";
  else if (condition < CONDITION_CLASSES[1].upTo || stress === "medium" || stress === "high" || health === "below") id = "watch";
  return { id, ...FIELD_STATUSES[id] };
}

// Which statuses count in the overview's three groups.
export const STATUS_GROUPS = {
  healthy: ["healthy", "harvestSoon", "ready", "harvested", "notSown"],
  watch: ["watch", "unknown"],
  recovery: ["recovery"],
};

// ---------------------------------------------------------------------------
// Recovery cost and units
// ---------------------------------------------------------------------------

// US dollars per hectare before demining, the same numbers as the Atlas.
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
