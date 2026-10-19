// WHAT THIS FILE DOES
// Growing seasons for any place on Earth. Crops grow at different times of
// year depending on where you are, so every date window the analyses use
// (this season's images, the normal years, the windows used to find field
// edges) comes from here instead of a fixed "April to October".
//
// The season of a place comes from its own satellite record when the
// provider has it: the month in which its plants are greenest in the
// normal years 2019 to 2021 (the "peak month", see peakMonthFrom). The
// season is then the 3 months before that peak, the peak month and the 2
// months after it (6 months). That puts Australia's and Chile's winter
// wheat in May to October, the Mediterranean's and north India's winter
// crops in December to May, Iowa's maize in May to October.
//
// Without a peak month (sample data, a place with no clear season, or
// before it is known) the season comes from the latitude:
//   north    latitude 23.5° N or more: April to September
//   south    latitude 23.5° S or more: October to March, across the new year
//   tropics  in between: crops can grow all year, often twice, so a
//            "season" is simply the last 12 months
//
// Every function below takes the latitude and, as its last argument, the
// peak month (1 to 12) when it is known.
//
// Dates are text: "YYYY-MM-DD". A window is { start, end } with the end NOT
// included. Plain functions, used by the server and the pages. Tested in
// season.test.js.
//
// WHO EDITS IT
// Whoever changes how seasons are chosen.

// The normal years every reading is compared with.
export const BASELINE_YEARS = [2019, 2020, 2021];

// Where the tropics end, in degrees of latitude.
export const TROPIC_LAT = 23.5;

// The months (1 to 12) of the main growing season, by band, used when the
// peak month is not known. "end" is the first month AFTER the season.
export const SEASONS = {
  north: { label: "April to September", startMonth: 4, endMonth: 10 },
  south: { label: "October to March", startMonth: 10, endMonth: 4 },
  tropics: { label: "the last 12 months", startMonth: null, endMonth: null },
};

// A season found from the peak month: this many months before the peak,
// the peak month itself, and the rest after it (6 months in all).
export const PEAK_SEASON = { monthsBefore: 3, length: 6 };

// A place has a clear growing season when its greenest month is at least
// this much greener (NDVI) than its least green one; otherwise the band's
// season is used (in the tropics: the whole year).
export const MIN_SEASON_AMPLITUDE = 0.1;

const DAY_MS = 86400000;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");
const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const msOf = (day) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
// Any whole number -> a month 1..12 (0 -> 12, 13 -> 1).
const wrapMonth = (month) => ((((month - 1) % 12) + 12) % 12) + 1;

export function addDays(day, days) {
  return toDay(msOf(day) + days * DAY_MS);
}

function firstOfMonth(year, month) {
  // month may be outside 1..12; roll the year over.
  const y = year + Math.floor((month - 1) / 12);
  return `${y}-${pad(wrapMonth(month))}-01`;
}

// Which band a latitude is in.
export function climateBand(lat) {
  if (!Number.isFinite(lat)) return "north";
  if (lat >= TROPIC_LAT) return "north";
  if (lat <= -TROPIC_LAT) return "south";
  return "tropics";
}

// A peak month 1..12, or null.
function cleanPeak(peakMonth) {
  const month = Number(peakMonth);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

// The season's months at a place: { band, startMonth, endMonth, label,
// peakMonth } (startMonth null: the last 12 months).
export function seasonSpec(lat, peakMonth) {
  const band = climateBand(lat);
  const peak = cleanPeak(peakMonth);
  if (peak === null) return { band, ...SEASONS[band], peakMonth: null };
  const startMonth = wrapMonth(peak - PEAK_SEASON.monthsBefore);
  const endMonth = wrapMonth(startMonth + PEAK_SEASON.length);
  const label = `${MONTH_NAMES[startMonth - 1]} to ${MONTH_NAMES[wrapMonth(endMonth - 1) - 1]}`;
  return { band, startMonth, endMonth, label, peakMonth: peak };
}

// The peak month (1 to 12) from the mean NDVI of each calendar month in
// the normal years.
//   monthly  12 numbers, January first (null or missing where unknown)
// The peak is taken on a 3-month running mean, so one odd month does not
// decide it. Null when fewer than 8 months are known or the season is not
// clear (MIN_SEASON_AMPLITUDE).
export function peakMonthFrom(monthly) {
  if (!Array.isArray(monthly) || monthly.length !== 12) return null;
  const values = monthly.map((value) => (Number.isFinite(value) ? value : null));
  const known = values.filter((value) => value !== null);
  if (known.length < 8) return null;
  if (Math.max(...known) - Math.min(...known) < MIN_SEASON_AMPLITUDE) return null;
  let best = null;
  let bestValue = -Infinity;
  for (let i = 0; i < 12; i += 1) {
    if (values[i] === null) continue;
    const around = [values[(i + 11) % 12], values[i], values[(i + 1) % 12]].filter((value) => value !== null);
    const smooth = around.reduce((sum, value) => sum + value, 0) / around.length;
    if (smooth > bestValue) {
      bestValue = smooth;
      best = i + 1;
    }
  }
  return best;
}

// The season that STARTED in a given year. A season starting October 2025
// ends April 2026.
function seasonStartingIn(spec, year) {
  const { startMonth, endMonth } = spec;
  const start = firstOfMonth(year, startMonth);
  const end = firstOfMonth(endMonth > startMonth ? year : year + 1, endMonth);
  return { start, end };
}

// The latest season that has fully ended by `today`.
//   lat, today ("YYYY-MM-DD"), peakMonth (optional)
// Gives back { start, end, band, label, peakMonth }.
export function lastCompleteSeason(lat, today, peakMonth) {
  const spec = seasonSpec(lat, peakMonth);
  const about = { band: spec.band, label: spec.label, peakMonth: spec.peakMonth };
  if (spec.startMonth === null) {
    // The last 12 whole months before this month.
    const [y, m] = today.split("-").map(Number);
    return { start: firstOfMonth(y, m - 12), end: firstOfMonth(y, m), ...about };
  }
  const year = Number(today.slice(0, 4));
  for (const startYear of [year, year - 1, year - 2]) {
    const season = seasonStartingIn(spec, startYear);
    if (season.end <= today) return { ...season, ...about };
  }
  return { ...seasonStartingIn(spec, year - 2), ...about };
}

// Every growing season that is complete by `today` and lies wholly inside
// a damage window starting on `since` ("YYYY-MM-DD"), oldest first: one
// per year, the place's own season. In the tropics without a peak month a
// "season" is a calendar year (January to December), so it joins once a
// year like everywhere else (lastCompleteSeason's "last 12 months" would
// move every month). Damage radar compares each of them with the same
// season of 2019-2021 (src/lib/atlas/method.js FIRE_YEARS), so it changes
// only when a new season is complete. Empty when no season since `since`
// is over yet. Gives back [{ start, end }] (end not included).
//   lastYear  optional: leave out seasons that end after this year (the
//             year of their last day; areaDamageSeasons)
export function damageSeasons(lat, today, since, peakMonth, { lastYear = null } = {}) {
  if (!since) return [];
  const spec = damageSeasonSpec(lat, peakMonth);
  const out = [];
  let season = latestSeasonBy(spec, today);
  for (let guard = 0; season && season.start >= since && guard < 100; guard += 1) {
    if (!(Number.isFinite(lastYear) && seasonYear(season) > lastYear)) out.unshift(season);
    season = seasonStartingIn(spec, Number(season.start.slice(0, 4)) - 1);
  }
  return out;
}

// The season months damageSeasons uses: the place's own, or a calendar
// year in the tropics without a peak month.
function damageSeasonSpec(lat, peakMonth) {
  const spec = seasonSpec(lat, peakMonth);
  return spec.startMonth === null ? { ...spec, startMonth: 1, endMonth: 1 } : spec;
}
// The latest season (of `spec`) that has fully ended by `today`.
function latestSeasonBy(spec, today) {
  const year = Number(today.slice(0, 4));
  for (const startYear of [year, year - 1, year - 2]) {
    const season = seasonStartingIn(spec, startYear);
    if (season.end <= today) return season;
  }
  return null;
}
// The year a season belongs to: the year of its last day.
const seasonYear = (season) => Number(addDays(season.end, -1).slice(0, 4));

// The war seasons of every place in one area, so that a new season joins
// for the WHOLE area in one month: the month in which the last place's
// season of that year is complete. (Per place, real data, Ukraine 2026:
// the squares greenest in May have a February-July season and gained 2026
// in August, those greenest in June in September, so the area's total
// changed in two months, July to August included.)
//   places  [{ lat, peakMonth }]; today, since as damageSeasons
// Gives back one list per place (damageSeasons, the same order).
export function areaDamageSeasons(places, today, since) {
  const list = Array.isArray(places) ? places : [];
  const latest = list.map((p) => latestSeasonBy(damageSeasonSpec(p.lat, p.peakMonth), today)).filter(Boolean).map(seasonYear);
  const lastYear = latest.length ? Math.min(...latest) : null;
  return list.map((p) => damageSeasons(p.lat, today, since, p.peakMonth, { lastYear }));
}

// The season that is running now, cut off at today; or, outside the
// season, the one that just ended. Use it for "this season's images".
// In the tropics (no peak month): the 12 months up to today, this month
// included.
export function currentSeason(lat, today, peakMonth) {
  const spec = seasonSpec(lat, peakMonth);
  const about = { band: spec.band, label: spec.label, peakMonth: spec.peakMonth };
  if (spec.startMonth === null) {
    const [y, m] = today.split("-").map(Number);
    return { start: firstOfMonth(y, m - 11), end: addDays(today, 1), ...about, running: true };
  }
  const year = Number(today.slice(0, 4));
  for (const startYear of [year, year - 1]) {
    const season = seasonStartingIn(spec, startYear);
    if (season.start <= today && today < season.end) {
      return { start: season.start, end: addDays(today, 1), ...about, running: true };
    }
  }
  return { ...lastCompleteSeason(lat, today, peakMonth), running: false };
}

// The same calendar window in another year (both ends move by the same
// number of years). "2025-10-01 to 2026-04-01" in 2019 -> "2019-10-01 to
// 2020-04-01". 29 February becomes 1 March in years without it.
export function sameWindowIn(window, startYear) {
  const shift = startYear - Number(window.start.slice(0, 4));
  const move = (day) => {
    const y = Number(day.slice(0, 4)) + shift;
    const md = day.slice(5, 10);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return md === "02-29" && !leap ? `${y}-03-01` : `${y}-${md}`;
  };
  return { start: move(window.start), end: move(window.end) };
}

// The window in each of the normal years 2019 to 2021. A window that
// crosses the new year is placed so that it ENDS in each normal year
// (October 2025 to March 2026 -> October 2018 to March 2019, ..., October
// 2020 to March 2021), so the normal years never reach into 2022, when the
// wars in src/config/conflicts.js began.
export function baselineWindows(window, years = BASELINE_YEARS) {
  const startYear = Number(window.start.slice(0, 4));
  const lastYear = Number(addDays(window.end, -1).slice(0, 4));
  const across = Math.max(0, lastYear - startYear);
  return years.map((year) => sameWindowIn(window, year - across));
}

// Three windows across the last complete season (early, middle, late),
// plus the same three for the season before. Used to find field edges:
// neighbouring fields usually differ in at least one of them.
export function detectionWindows(lat, today, peakMonth) {
  const last = lastCompleteSeason(lat, today, peakMonth);
  const thirds = (season) => {
    const span = (msOf(season.end) - msOf(season.start)) / DAY_MS;
    const cut1 = addDays(season.start, Math.round(span / 3));
    const cut2 = addDays(season.start, Math.round((2 * span) / 3));
    return [
      { start: season.start, end: cut1 },
      { start: cut1, end: cut2 },
      { start: cut2, end: season.end },
    ];
  };
  const before = sameWindowIn(last, Number(last.start.slice(0, 4)) - 1);
  return [...thirds(last), ...thirds(before)];
}

// Where "this season's curve" (the plant-health line on the Fields page,
// and what harvest readiness is read from) starts. A month before the
// season so the green-up is visible; in the tropics without a peak month
// the last 8 months.
export function seasonCurveStart(lat, today, peakMonth) {
  const spec = seasonSpec(lat, peakMonth);
  if (spec.startMonth === null) return addDays(today, -243);
  const season = currentSeason(lat, today, peakMonth);
  const start = firstOfMonth(Number(season.start.slice(0, 4)), Number(season.start.slice(5, 7)) - 1);
  // Early in a new season there is little to show: fall back to 8 months.
  return (msOf(today) - msOf(start)) / DAY_MS < 45 ? addDays(today, -243) : start;
}

// The season a monthly Atlas run compares with the normal years: the last
// growing season that was COMPLETE by the end of that month. A season is
// compared only once it is over, so every month of one season gives the
// same answer and an early or late spring is not read as damage.
//   month "YYYY-MM"
// Gives back { from: "YYYY-MM", to: "YYYY-MM" } (both months included).
export function imageryMonths(lat, month, peakMonth) {
  const [y, m] = month.split("-").map(Number);
  const lastDayOfMonth = addDays(firstOfMonth(y, m + 1), -1);
  const season = lastCompleteSeason(lat, lastDayOfMonth, peakMonth);
  return { from: season.start.slice(0, 7), to: addDays(season.end, -1).slice(0, 7) };
}

// "April to September 2026", "October 2025 to March 2026", or
// "October 2025 to September 2026" for the tropics.
export function windowLabel({ from, to }) {
  const name = (ym) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1];
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear ? `${name(from)} to ${name(to)} ${to.slice(0, 4)}` : `${name(from)} ${from.slice(0, 4)} to ${name(to)} ${to.slice(0, 4)}`;
}
