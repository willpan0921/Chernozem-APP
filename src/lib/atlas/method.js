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
//   damage: fire detections and the Chernozem Health Index decline
//   access: distance to recorded fighting (higher = farther = safer)
export const COMPONENTS = {
  soil: ["wrb", "agOutput"],
  damage: ["firms", "chi"],
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
// reading that counts as 1; anything above is capped at 1.
export const SCALES = {
  // Already a probability or share from 0 to 1.
  wrb: { unit: "probability", full: 1 },
  agOutput: { unit: "cropland share", full: 1 },
  // Fire detections per 100 km² since the start of the war.
  firms: { unit: "detections per 100 km²", full: 25 },
  // Drop in the Chernozem Health Index from the baseline years.
  chi: { unit: "index drop", full: 0.2 },
  // Distance to the nearest recorded fighting. 100 km or more counts as safe.
  distance: { unit: "km", full: 100 },
  // People per km² and night-light radiance, on a log scale.
  population: { unit: "people per km²", full: 1000, log: true },
  lights: { unit: "nW/cm²/sr", full: 60, log: true },
};

// Turns one raw reading into an indicator from 0 to 1.
export function scaleIndicator(name, raw) {
  const scale = SCALES[name];
  if (!scale || !Number.isFinite(raw)) return null;
  const value = scale.log ? Math.log1p(Math.max(raw, 0)) / Math.log1p(scale.full) : raw / scale.full;
  return Math.min(1, Math.max(0, value));
}

// A cell counts as heavily damaged where the health index fell by at least
// this much. The server uses it to work out heavily damaged hectares.
export const HEAVY_DAMAGE_CHI_DROP = 0.1;

// Recovery costs in US dollars per hectare, before demining.
export const COSTS = {
  fastPathPerHa: [95, 290],
  fullRecoveryPerHa: [260, 620],
};

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
