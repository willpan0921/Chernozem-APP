// WHAT THIS FILE DOES
// The research method's fixed choices, shared by the server (which turns
// satellite readings into scores) and the pages (which rank and colour the
// map). Keeping them in one file means the two can never disagree.
//
//   COMPONENTS        which indicators make up each of the three scores
//   DEFAULT_SETTINGS  the research defaults for the weights and the gate
//   SCALES            how each raw reading becomes a 0-to-1 indicator
//   checkSettings()   cleans up settings typed in by a person
//
// The scales are FIXED numbers rather than "best region = 1, worst = 0".
// That way a score means the same thing in every month and every place, so
// the Data page can compare months and a farm can be compared with a country.
//
// WHO EDITS IT
// Whoever changes the research method. A change here changes every run made
// from then on; saved runs keep their numbers.

// Which indicators make up each score (the mean of the listed ones).
//   soil:   chernozem probability and cropland share (agricultural value)
//   damage: fire detections above the normal years' rate, and radar
//           (Sentinel-1 VV) change of the last complete growing season from
//           the same season in 2019-2021 -- the owner's paper (2026). The
//           Chernozem Health Index decline ("chi") is kept on every cell as a
//           diagnostic, but it is NOT part of the score: crop rotation and an
//           early or late season move it as much as damage does.
//   access: distance to recorded fighting (higher = farther = safer)
export const COMPONENTS = {
  soil: ["wrb", "agOutput"],
  damage: ["firms", "radar"],
  access: ["distance"],
};

// The research defaults. Weights are whole percentages that add up to 100.
export const DEFAULT_SETTINGS = {
  weights: { soil: 30, damage: 40, access: 30 },
  gatePercentile: 30,
  rampWidth: 0.2,
  r: 0.5,
};

// How each raw reading becomes an indicator from 0 to 1. "full" is the
// reading that counts as 1; anything above is capped at 1. "zero" (when
// given) is the reading that counts as 0; the scale runs from it to "full".
export const SCALES = {
  // Already a probability or share from 0 to 1.
  wrb: { unit: "probability", full: 1 },
  agOutput: { unit: "cropland share", full: 1 },
  // Fire detections per 100 km² in the damage window (from the start of a
  // known war, else the last two years) above the normal years' rate.
  firms: { unit: "detections per 100 km²", full: 25 },
  // Mean radar change over the cell's cropland: |VV| of the last complete
  // growing season's median minus the same season's median in 2019-2021.
  // Ordinary year-to-year change (crop rotation, soil moisture) stays under
  // about 0.5 dB on average; 3 dB is the change of shelled or cratered land.
  radar: { unit: "dB", zero: 0.5, full: 3 },
  // Drop in the Chernozem Health Index from the baseline years (diagnostic,
  // not in the score).
  chi: { unit: "index drop", full: 0.2 },
  // Distance to the nearest recorded fighting. 100 km or more scores full
  // access (1.0), which does not make the land safe.
  distance: { unit: "km", full: 100 },
  // People per km² and night-light radiance, on a log scale.
  population: { unit: "people per km²", full: 1000, log: true },
  lights: { unit: "nW/cm²/sr", full: 60, log: true },
};

// Turns one raw reading into an indicator from 0 to 1.
export function scaleIndicator(name, raw) {
  const scale = SCALES[name];
  if (!scale || !Number.isFinite(raw)) return null;
  const zero = scale.zero || 0;
  const value = scale.log ? Math.log1p(Math.max(raw, 0)) / Math.log1p(scale.full) : (raw - zero) / (scale.full - zero);
  return Math.min(1, Math.max(0, value));
}

// Heavily damaged land (the paper's rule, no health index): a black-soil
// cropland pixel whose radar changed by at least `radarDb` between the
// last complete growing season and the same season in 2019-2021, or by at
// least `radarWithFireDb` with an unusual fire (above the normal years'
// rate) within `fireNearM`. The server uses it to work out heavily damaged
// hectares. Where no known war covers the area (src/config/conflicts.js)
// a pixel needs BOTH: a change of at least `radarDb` AND an unusual fire
// within `fireNearM`. Either alone has an everyday cause there (real data,
// 2026-10-19, at peace, with the war rule: 0.75% of Iowa's and 1.2% of the
// Pampas' black-soil cropland, 6.4% around Nakuru, Kenya, with towns,
// greenhouses and new fields; the fire arm alone: 2.1% of the Beauce,
// France, after a summer of harvest fires). The same rule as a field's
// damage (src/lib/field/method.js damageDetected).
export const HEAVY_DAMAGE = { radarDb: 3, radarWithFireDb: 2, fireNearM: 1000 };

// A place is ranked only when at least `share` of its own area is
// black-soil cropland (a map square of a country, ~50,000 ha: 250 ha; a
// square of a farm, a fraction of a hectare: its share), or `ha` when the
// square's size is not known. Below that it has next to nothing for the
// method to restore: it gets the reason NO_BLACK_SOIL_REASON and is left
// out of the ranking, the top areas, the next steps and the budget.
// (Real data, Kenya, 2026-10-19: the top 7 places were arid squares with
// 0 ha of black soil, ranked first by savanna fires.)
export const BLACK_SOIL_MIN = { ha: 100, share: 0.005 };
export const NO_BLACK_SOIL_REASON = "No black-soil cropland";

// The damage score where no known war covers the area (run.conflict null):
// the share of the place's black-soil cropland that is heavily damaged
// (HEAVY_DAMAGE, which at peace needs radar change AND unusual fire), as a
// 0-to-1 score that is full at `fullShare`. The raw indicators (fires
// above the normal rate, radar change) have everyday causes at peace:
// savanna burning and seasonal radar change in arid land gave a damage
// score of 100 to squares with 0 ha damaged (Kenya, 2026-10-19).
export const PEACE_DAMAGE = { unit: "share of black-soil cropland heavily damaged", fullShare: 0.2 };

// Whether two runs of an area can be compared number for number: the same
// data source (Earth Engine or sample), the same method (its components
// and scales, saved on every run) and the same squares. Gives back
// { comparable: true } or { comparable: false, reason, text } with reason
//   "source"  one month is Earth Engine and the other sample data
//   "method"  the method changed between them (e.g. damage from the health
//             index before 2026-10-19, from radar and fire since)
//   "grid"    different square sizes
// Runs saved before a field existed count as matching on it.
//   why   "different data source" / "different method version" /
//         "different squares"; text "Not comparable: " + why
export const NOT_COMPARABLE_WHY = {
  source: "different data source",
  method: "different method version",
  grid: "different squares",
};
export function runsComparable(a, b) {
  const no = (reason) => ({ comparable: false, reason, why: NOT_COMPARABLE_WHY[reason], text: `Not comparable: ${NOT_COMPARABLE_WHY[reason]}` });
  if (!a || !b) return { comparable: true };
  if ((a.provider || null) !== (b.provider || null)) return no("source");
  if (a.method && b.method && JSON.stringify(a.method) !== JSON.stringify(b.method)) return no("method");
  if (Number.isFinite(a.cellSizeKm) && Number.isFinite(b.cellSizeKm) && Math.abs(a.cellSizeKm - b.cellSizeKm) > 0.001 * Math.max(a.cellSizeKm, b.cellSizeKm)) return no("grid");
  return { comparable: true };
}

// The area of one map square in hectares, from its size in degrees and
// its latitude.
export function cellAreaHa(sizeDeg, lat) {
  if (!(sizeDeg > 0) || !Number.isFinite(lat)) return null;
  const km = sizeDeg * 111.32;
  return km * km * Math.cos((lat * Math.PI) / 180) * 100;
}

// The old health-index rule, kept only for the sample data's made-up
// damage field (server/providers/sample.js).
export const HEAVY_DAMAGE_CHI_DROP = 0.1;

// Recovery costs in US dollars per hectare, before demining. PLANNING
// ASSUMPTIONS carried over from the product design, not measured and not
// tied to a published source: every place that shows them (pages and AI)
// says so with COST_NOTE.
export const COSTS = {
  fastPathPerHa: [95, 290],
  fullRecoveryPerHa: [260, 620],
};
export const COST_NOTE = "Planning assumption (not sourced)";

// Cleans up settings a person typed in: fills gaps from the defaults, keeps
// numbers in range, and makes the weights whole numbers that add up to 100.
export function checkSettings(input = {}) {
  const clamp = (value, low, high, fallback) =>
    Number.isFinite(Number(value)) ? Math.min(high, Math.max(low, Number(value))) : fallback;

  const raw = { ...DEFAULT_SETTINGS.weights, ...(input.weights || {}) };
  const keys = ["soil", "damage", "access"];
  let weights = Object.fromEntries(keys.map((key) => [key, clamp(raw[key], 0, 100, DEFAULT_SETTINGS.weights[key])]));
  const total = keys.reduce((sum, key) => sum + weights[key], 0);
  if (total <= 0) {
    weights = { ...DEFAULT_SETTINGS.weights };
  } else {
    // Scale to 100 and round, giving any rounding leftover to the largest.
    const scaled = keys.map((key) => [key, (weights[key] * 100) / total]);
    const rounded = Object.fromEntries(scaled.map(([key, value]) => [key, Math.round(value)]));
    const leftover = 100 - keys.reduce((sum, key) => sum + rounded[key], 0);
    const largest = keys.reduce((best, key) => (rounded[key] > rounded[best] ? key : best), keys[0]);
    rounded[largest] += leftover;
    weights = rounded;
  }

  return {
    weights,
    gatePercentile: Math.round(clamp(input.gatePercentile, 0, 60, DEFAULT_SETTINGS.gatePercentile)),
    rampWidth: clamp(input.rampWidth, 0, 0.5, DEFAULT_SETTINGS.rampWidth),
    r: clamp(input.r, 0, 1, DEFAULT_SETTINGS.r),
  };
}

// True when the settings are the research defaults.
export function isDefaultSettings(settings) {
  const clean = checkSettings(settings);
  const base = DEFAULT_SETTINGS;
  return (
    clean.gatePercentile === base.gatePercentile &&
    clean.rampWidth === base.rampWidth &&
    clean.r === base.r &&
    ["soil", "damage", "access"].every((key) => clean.weights[key] === base.weights[key])
  );
}
