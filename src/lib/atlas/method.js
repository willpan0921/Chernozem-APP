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
//   damage: fire detections above the normal years' count in the worst
//           war year, and radar (Sentinel-1 VV) change that persists over
//           the complete war growing seasons, each against the same season
//           in 2019-2021 -- the owner's paper (2026); see FIRE_YEARS below. The
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
  // Fire detections per 100 km² above the normal years' rate, in the worst
  // year of the damage window (from the start of a known war, else the last
  // two years; FIRE_YEARS, worstFireYear).
  firms: { unit: "detections per 100 km² above normal, worst war year", full: 25 },
  // Mean radar change over the cell's cropland: per pixel the change that
  // persists over the complete war seasons (radarPersistence level: reached
  // in at least two of them, each season's median VV against the same
  // season's median in 2019-2021; with one season, that one).
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
// cropland pixel whose LASTING radar change (radarPersistence: reached in
// at least `persistSeasons` complete war growing seasons, each against the
// same season in 2019-2021) is at least `radarDb`, or at least
// `radarWithFireDb` with an unusual fire (a pixel above a normal year's
// fires in some war year) within `fireNearM` (heavyDamagePixel). The server
// uses it to work out heavily damaged hectares. Where no known war covers
// the area (src/config/conflicts.js) a pixel needs BOTH: a lasting change
// of at least `radarDb` AND an unusual fire within `fireNearM`. Either
// alone has an everyday cause there (real data, 2026-10-19, at peace, with
// the war rule: 0.75% of Iowa's and 1.2% of the Pampas' black-soil
// cropland, 6.4% around Nakuru, Kenya, with towns, greenhouses and new
// fields; the fire arm alone: 2.1% of the Beauce, France, after a summer of
// harvest fires). The same evidence as a field's damage
// (src/lib/field/method.js damageDetected).
export const HEAVY_DAMAGE = { radarDb: 3, radarWithFireDb: 2, fireNearM: 1000, persistSeasons: 2 };

// ---------------------------------------------------------------------------
// The damage evidence over time (the same rules for the Atlas and a field)
// ---------------------------------------------------------------------------
// Soil damage persists (the owner's paper): abandoned land near the front
// is not burned again, and a crater does not heal in a year. So no piece
// of evidence may fade just because the window it is counted over grows.
// Before (2026-10-19, the real 12-month Ukraine run) fires were counted
// over the whole window minus the normal rate x its length, and heavy
// damage "healed" from 2.96M ha to 1.93M ha as the window grew while the
// front stopped burning.
//
// FIRE: the WORST war year. The damage window (from the day a known war
// began, else the last two years: src/config/conflicts.js damageWindow) is
// cut into war years of 12 months that do not overlap: at war counted from
// the day the war began (24 February 2022 to 24 February 2023, ...), at
// peace back from the end of the window (the window itself moves there).
// The last war year is usually not over yet: it runs to the end of the
// analysed month and counts once it is FIRE_YEARS.minMonths long.
// Per place (FIRMS's 1 km footprint):
//   normal       = the place's 2019-2021 count / 3 (an average year)
//   excess(year) = fires in the year - normal, never below 0
//   evidence     = the largest excess over the years
// A year that is not over yet is compared with a WHOLE normal year, not a
// share of it. Fire is seasonal (real FIRMS fire days 2019-2021, 30-38.5E
// 46.5-50.5N: 24 February to 1 September holds 68% of a year's, where a
// share by days gives 52%), so a share by days counts ordinary burning as
// excess; and a share by calendar span would make the excess fall in a
// month that burns less than usual. Against the whole year the running
// year's excess only grows, and it is the full year's once the year is
// over. (Before, 2026-10-19: ~60 overlapping rolling years with a share by
// days put 70% of Ukraine's squares above 0, and Lviv oblast, far from the
// front, at 0.43.)
// A map square's place is the square: each year's excess is the mean over
// its pixels (smoothed over 5 km, not floored pixel by pixel, so a field
// that burns this year and one nearby that burned in 2019-2021 cancel out),
// and the square's worst year counts. For heavy damage an "unusual fire" is
// a pixel that burned in a year its neighbourhood was above its normal. A
// field's place is its pixels' largest count.
// At war every year of a month is a year of every later month, and the
// running year's excess only grows, so the evidence never falls from one
// month to the next: once a pixel had an unusual fire year it stays
// counted. At peace fire years older than two years drop out by design.
//
// RADAR: every complete war season, each on its own. The median Sentinel-1
// VV of each complete growing season inside the damage window (one per
// year: src/lib/season.js damageSeasons, the same years for a whole area:
// areaDamageSeasons) against the median of the same season in 2019-2021.
// A pixel's radar evidence is the change that LASTS: reached in at least
// HEAVY_DAMAGE.persistSeasons seasons (radarPersistence; with one season
// measured, that one), so one season's rotation or weather is not damage,
// and later ordinary-looking seasons never outvote a cratered one. (A
// median over all seasons did: real data, 2026-10-19, Ukraine lost 215,613
// ha of heavy damage from August to September 2026 when the 2026 season
// joined. The largest change of any one season instead, with fire nearby
// at 2 dB, put 5.8M ha, 22% of Ukraine's black soil, under heavy damage:
// the largest of four or five noisy seasons is 2 dB almost anywhere fire
// was unusual once.) From two measured seasons on it only grows as seasons
// join, seen from the same orbit direction; the step from one measured
// season to two (a war's second year, or later where a season was not
// measured) can lower it once, and so can a new season that changes the
// direction compared (server/providers/gee.js pickPass, over the passes of
// all war seasons): every season is then measured from the other side.
//
// HEAVY DAMAGE (HEAVY_DAMAGE above) is then a pixel rule on these two
// (heavyDamagePixel), and "new damage" is the increase over the previous
// comparable month.
export const FIRE_YEARS = { months: 12, minMonths: 3, baselineYears: 3 };

const pad2 = (n) => String(n).padStart(2, "0");
// "2022-02-24" + 3 months -> "2022-05-24" (a missing day rolls to the next month's 1st).
function addMonthsToDay(day, count) {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const index = y * 12 + (m - 1) + count;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return d > last ? `${year + Math.floor(month / 12)}-${pad2((month % 12) + 1)}-01` : `${year}-${pad2(month)}-${pad2(d)}`;
}
const daysFrom = (start, end) => Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000));

// The war years of a damage window ({ start, end }, end not included,
// "YYYY-MM-DD"), oldest first.
//   anchor  "start" (at war: years from the day the war began) or "end"
//           (at peace: whole years back from the end of the window)
// Gives back [{ start, end, days, part }]: part true for the year that is
// not over yet (from its start to the window's end; counted once it is
// FIRE_YEARS.minMonths long). An empty window (or none) has no years.
export function fireYears(window, { anchor = "start" } = {}) {
  if (!window?.start || !window?.end || !(window.start < window.end)) return [];
  const { start, end } = window;
  const years = [];
  if (anchor === "end") {
    for (let k = 1; k < 100; k += 1) {
      const from = addMonthsToDay(end, -FIRE_YEARS.months * k);
      if (from < start) break;
      years.unshift({ start: from, end: addMonthsToDay(end, -FIRE_YEARS.months * (k - 1)), part: false });
    }
  } else {
    for (let from = start, k = 0; from < end && k < 100; k += 1) {
      const to = addMonthsToDay(start, FIRE_YEARS.months * (k + 1));
      if (to <= end) years.push({ start: from, end: to, part: false });
      else if (addMonthsToDay(from, FIRE_YEARS.minMonths) <= end) years.push({ start: from, end, part: true });
      from = to;
    }
  }
  return years.map((year) => ({ ...year, days: daysFrom(year.start, year.end) }));
}

// The normal fire count of one war year: the 2019-2021 count (all three
// years together) / 3, whatever the year's length (see FIRE_YEARS).
export function fireNormal(baseFires) {
  return Number.isFinite(baseFires) ? Math.max(0, baseFires) / FIRE_YEARS.baselineYears : 0;
}

// The worst war year of one place (a pixel, or a field's pixels), as plain
// numbers; Earth Engine does the same arithmetic per pixel.
//   fires      the fire count in each year of `years` (same order)
//   baseFires  the fire count in 2019-2021 (all three years)
//   years      fireYears(window)
// Gives back { excess, fires, normal, year } for the year with the largest
// excess (the latest of equals), or all null when nothing is known. With
// no year long enough yet the excess is 0.
export function worstFireYear(fires, baseFires, years) {
  if (!Array.isArray(years) || !Array.isArray(fires) || !years.length) return { excess: Array.isArray(years) && Array.isArray(fires) ? 0 : null, fires: null, normal: null, year: null };
  const normal = fireNormal(baseFires);
  let best = null;
  for (const [i, year] of years.entries()) {
    if (!Number.isFinite(fires[i])) continue;
    const count = Math.max(0, fires[i]);
    const excess = Math.max(0, count - normal);
    if (!best || excess >= best.excess) best = { excess, fires: count, normal, year: { start: year.start, end: year.end } };
  }
  return best || { excess: null, fires: null, normal: null, year: null };
}

// The radar evidence of one pixel from its change in each war season
// (|VV - the same season of 2019-2021|, dB; null where not measured):
//   level       the change reached in at least HEAVY_DAMAGE.persistSeasons
//               seasons (the second largest); with one season measured,
//               that one. Heavy damage and the square's radar indicator
//               (SCALES.radar) use it
//   persistent  the same, null with fewer seasons than persistSeasons
//   peak        the largest change of any season (for reference)
// With two seasons or more, all three only grow as seasons join, as long
// as the earlier seasons' changes stay as they are (a new orbit direction,
// gee.js pickPass, measures every season again). All null when no season
// was measured.
export function radarPersistence(changes) {
  const known = (Array.isArray(changes) ? changes : [changes]).filter(Number.isFinite).sort((a, b) => b - a);
  if (!known.length) return { persistent: null, peak: null, level: null };
  const persistent = known.length >= HEAVY_DAMAGE.persistSeasons ? known[HEAVY_DAMAGE.persistSeasons - 1] : null;
  return { persistent, peak: known[0], level: persistent ?? known[0] };
}

// Heavy damage for one pixel (the rule Earth Engine applies per pixel):
//   radarDb   its radar change in each complete war season (dB, a list
//             oldest first; one number = one season)
//   fireNear  an excess-fire pixel (worst war year) within HEAVY_DAMAGE.fireNearM
//   atWar     a known war covers the place
// On the lasting change (radarPersistence level): at war 3 dB, or 2 dB
// with a fire nearby; at peace 3 dB AND a fire nearby.
export function heavyDamagePixel({ radarDb, fireNear, atWar }) {
  const { level } = radarPersistence(radarDb);
  if (level === null) return false;
  const near = Boolean(fireNear);
  if (!atWar) return level >= HEAVY_DAMAGE.radarDb && near;
  return level >= HEAVY_DAMAGE.radarDb || (level >= HEAVY_DAMAGE.radarWithFireDb && near);
}

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

// The method version saved on every run (with its components and scales).
// Bumped whenever a reading changes meaning, so older runs are marked "not
// comparable" (runsComparable) instead of showing a made-up change.
//   2026-10-19.3  damage from the worst war fire year (years from the war's
//                 start, each against a whole normal year) and radar change
//                 that lasts over two complete war seasons (before:
//                 fires over the whole window, the last complete season's
//                 radar)
export const METHOD_VERSION = "2026-10-19.3";

// Whether two runs of an area can be compared number for number: the same
// data source (Earth Engine or sample), the same method (its components
// and scales, saved on every run), the same squares and the same war
// setting. Gives back { comparable: true } or { comparable: false, reason,
// text } with reason
//   "source"  one month is Earth Engine and the other sample data
//   "method"  the method changed between them (e.g. damage from the health
//             index before 2026-10-19, from radar and fire since)
//   "grid"    different square sizes
//   "war"     one was made at war and the other at peace, or with another
//             war start (run.conflict.since), or one with the war's rules
//             all over the area and the other only in the war's squares
//             (partOfCountry: server/conflicts.js warCellsFor): the
//             damage window, the fire years, the war seasons and the rules
//             differ (warKey). Happens when the team changes the area's war
//             setting (Atlas Settings) or the app's list of wars changes,
//             until the area is re-run
// Runs saved before a field existed count as matching on it.
//   why   "different data source" / "different method version" /
//         "different squares" / "different war setting"; text
//         "Not comparable: " + why
export const NOT_COMPARABLE_WHY = {
  source: "different data source",
  method: "different method version",
  grid: "different squares",
  war: "different war setting",
};
// What decides a war's numbers: the day it began (the damage window, the
// fire years and the war seasons follow it), and, for a war that covers its
// area only in part (conflict.partOfCountry, a whole country or any other
// kind of area: server/conflicts.js listWarFor), that its rules apply only
// in its squares (those that touch its region or lie in another listed
// war: server/conflicts.js warCellsFor); null at peace,
// undefined when not known. Two runs (or a run and a setting) with the same
// key give the same numbers; the war's name does not matter.
export function warKey(conflict) {
  if (conflict === undefined) return undefined;
  if (!conflict?.since) return null;
  return conflict.partOfCountry ? `${conflict.since} (in part of the country)` : conflict.since;
}

export function runsComparable(a, b) {
  const no = (reason) => ({ comparable: false, reason, why: NOT_COMPARABLE_WHY[reason], text: `Not comparable: ${NOT_COMPARABLE_WHY[reason]}` });
  if (!a || !b) return { comparable: true };
  if ((a.provider || null) !== (b.provider || null)) return no("source");
  if (a.method && b.method && JSON.stringify(a.method) !== JSON.stringify(b.method)) return no("method");
  if (Number.isFinite(a.cellSizeKm) && Number.isFinite(b.cellSizeKm) && Math.abs(a.cellSizeKm - b.cellSizeKm) > 0.001 * Math.max(a.cellSizeKm, b.cellSizeKm)) return no("grid");
  if (a.conflict !== undefined && b.conflict !== undefined && warKey(a.conflict) !== warKey(b.conflict)) return no("war");
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
