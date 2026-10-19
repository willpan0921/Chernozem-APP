// WHAT THIS FILE DOES
// Crops: what each crop needs to ripen (heat units, "growing degree-days"),
// how dry it looks when it is ready, when it is usually harvested, and how
// to tell from the satellite which crop a field has (classifyCrop).
//
// Plain functions with no React, shared by the server and the pages, and
// re-exported by method.js (the Field method). Tested in crops.test.js.
//
// GROWING DEGREE-DAYS (GDD)
// A crop ripens after a fairly fixed amount of warmth. One day gives
//   GDD = (daily max + daily min) / 2 - base temperature, never below 0.
// Row crops (corn, soybean, sunflower) use the standard "86/50" method:
// daily max and min are first held between the base and 30 °C, because
// growth stops above about 30 °C. Totals below are typical values from
// green-up to harvest maturity (approximations; real totals vary with the
// variety by about ±15 %):
//   corn          base 10 °C  ~1450  (Iowa State / Purdue corn GDD guides,
//                                     ~2600 °F GDD for a mid-season hybrid)
//   soybean       base 10 °C  ~1300  (University of Nebraska / NDSU)
//   sunflower     base  6 °C  ~1500  (NDSU sunflower production guide)
//   winter cereal base  0 °C  ~1400  from spring regrowth (AHDB wheat
//                                     growth guide, Zadoks stages)
//   spring cereal base  0 °C  ~1500  from emergence (NDSU / Alberta
//                                     spring wheat and barley)
//   rapeseed      base  5 °C  ~1300  from spring regrowth (Canola Council
//                                     of Canada / AHDB oilseed rape)
// "other" has no total: no heat-unit estimate is made for it.
//
// CROP TYPE FROM THE SATELLITE (classifyCrop)
// A rule-based phenology classifier, a standard remote-sensing approach:
// each crop greens up, peaks and dries down at its own time of year, and
// gives its own radar return. The rules are written in northern-hemisphere
// days and moved by 6 months in the south. In the tropics a crop is named
// only when the field has a clear season, and never more than "possible".
// The windows were calibrated on real fields against the USDA Cropland
// Data Layer 2025 (Iowa, South Dakota, Minnesota, Montana) and measured on
// held-out North Dakota fields; a crop under 70 % there is capped at
// "possible" in CROP_CONFIDENCE_CAP (docs/METHODS.md, "Crop type").
//
// WHO EDITS IT
// Whoever changes the Field method. A change here changes every analysis
// made from then on.

// method.js imports this file and re-exports it, and this file imports
// method.js: nothing imported from method.js may be used at the top level
// here (only inside functions), or loading would fail.
import { addDays, climateBand } from "../season.js";
import { BARE_NDVI, NOT_SOWN_PEAK, READY_SHARE, cleanSeries, greenUpDate, harvestStage } from "./method.js";

// ---------------------------------------------------------------------------
// Crop profiles
// ---------------------------------------------------------------------------

// For each crop:
//   gddBase          base temperature, °C
//   gddCap           upper limit for the 86/50 method, °C (null: none)
//   gddToMaturity    typical GDD from green-up to harvest maturity (null: unknown)
//   gddFrom          what "green-up" means for this crop
//   readyShare       ready when NDVI is back down to this share of the
//                    green-up above bare soil (see harvestStage)
//   harvestMonthsAfterPeak  [min, max] months from the NDVI peak to harvest
//   tall             a tall crop whose harvest shows on radar (section 3c)
//   shedsLeaves      drops its leaves when it matures, a week or more before
//                    the combine: the canopy falling looks like a cut on
//                    radar (method.js radarForHarvest)
export const CROP_PROFILES = {
  winterCereal: { id: "winterCereal", label: "Winter cereal", gddBase: 0, gddCap: null, gddToMaturity: 1400, gddFrom: "spring regrowth", readyShare: 0.25, harvestMonthsAfterPeak: [1, 3], tall: false, shedsLeaves: false },
  springCereal: { id: "springCereal", label: "Spring cereal", gddBase: 0, gddCap: null, gddToMaturity: 1500, gddFrom: "emergence", readyShare: 0.25, harvestMonthsAfterPeak: [1, 3], tall: false, shedsLeaves: false },
  rapeseed: { id: "rapeseed", label: "Rapeseed", gddBase: 5, gddCap: null, gddToMaturity: 1300, gddFrom: "spring regrowth", readyShare: 0.25, harvestMonthsAfterPeak: [1, 3], tall: false, shedsLeaves: false },
  sunflower: { id: "sunflower", label: "Sunflower", gddBase: 6, gddCap: 30, gddToMaturity: 1500, gddFrom: "emergence", readyShare: 0.35, harvestMonthsAfterPeak: [1, 3], tall: true, shedsLeaves: false },
  corn: { id: "corn", label: "Corn", gddBase: 10, gddCap: 30, gddToMaturity: 1450, gddFrom: "emergence", readyShare: 0.35, harvestMonthsAfterPeak: [1, 4], tall: true, shedsLeaves: false },
  soybean: { id: "soybean", label: "Soybean", gddBase: 10, gddCap: 30, gddToMaturity: 1300, gddFrom: "emergence", readyShare: 0.35, harvestMonthsAfterPeak: [1, 3], tall: true, shedsLeaves: true },
  other: { id: "other", label: "Other", gddBase: 5, gddCap: null, gddToMaturity: null, gddFrom: "emergence", readyShare: 0.35, harvestMonthsAfterPeak: [0, 6], tall: false, shedsLeaves: false },
};

// The profile for a crop id, or for a crop name a farmer typed or picked
// ("Winter wheat", "Barley", "Maize", "Canola"...). Unknown -> "other".
export function cropProfile(crop) {
  if (crop && CROP_PROFILES[crop]) return CROP_PROFILES[crop];
  return CROP_PROFILES[cropIdFor(crop)];
}

// A crop id from a crop name. Plain "wheat" is taken as winter wheat (most
// wheat in the world is sown in autumn); plain "barley" and "oats" as
// spring cereals.
export function cropIdFor(name) {
  if (typeof name !== "string" || !name.trim()) return "other";
  if (CROP_PROFILES[name]) return name;
  const text = name.toLowerCase();
  if (/rape|canola|colza/.test(text)) return "rapeseed";
  if (/sunflower/.test(text)) return "sunflower";
  if (/corn|maize/.test(text)) return "corn";
  if (/soy/.test(text)) return "soybean";
  if (/spring/.test(text) && /wheat|barley|cereal|oat|triticale|rye/.test(text)) return "springCereal";
  if (/winter/.test(text) && /wheat|barley|cereal|oat|triticale|rye/.test(text)) return "winterCereal";
  if (/wheat|rye|triticale/.test(text)) return "winterCereal";
  if (/barley|oat|cereal/.test(text)) return "springCereal";
  return "other";
}

// A tall crop whose harvest shows as a radar drop (corn, soybean, sunflower).
export function isTallCrop(crop) {
  return Boolean(crop) && cropProfile(crop).tall;
}

// ---------------------------------------------------------------------------
// Growing degree-days
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;
const dayNumber = (iso) => Math.round(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / DAY_MS);
const round = (value, places = 1) => (Number.isFinite(value) ? Math.round(value * 10 ** places) / 10 ** places : null);

// GDD for one day from the daily max and min (°C). With a cap (86/50
// method) both are first held between base and cap. Null when a
// temperature is missing.
export function dailyGdd(tmax, tmin, base, cap = null) {
  if (![tmax, tmin, base].every(Number.isFinite)) return null;
  if (Number.isFinite(cap)) {
    const hold = (t) => Math.min(cap, Math.max(base, t));
    return (hold(tmax) + hold(tmin)) / 2 - base;
  }
  return Math.max(0, (tmax + tmin) / 2 - base);
}

// GDD for one day from the daily MEAN temperature (used for insects).
export function meanGdd(mean, base) {
  return Number.isFinite(mean) && Number.isFinite(base) ? Math.max(0, mean - base) : null;
}

// The sum of GDD over days from `from` to `to` (both included, either may
// be left out).
//   days  [{ date: "YYYY-MM-DD", tmax, tmin }]
// Gives back { total, days } (days = the days that had both temperatures).
export function accumulateGdd(days, { base, cap = null, from = null, to = null } = {}) {
  let total = 0;
  let count = 0;
  for (const day of Array.isArray(days) ? days : []) {
    const date = String(day?.date || "").slice(0, 10);
    if (!date || (from && date < from) || (to && date > to)) continue;
    const gdd = dailyGdd(day.tmax, day.tmin, base, cap);
    if (gdd === null) continue;
    total += gdd;
    count += 1;
  }
  return { total: round(total), days: count };
}

// Days until the crop has had the warmth it needs.
//   accumulated     GDD since green-up
//   needed          GDD from green-up to harvest maturity
//   recentDailyGdd  mean GDD per day (the last 14 days and the forecast)
// 0 when enough has accumulated; null when it cannot be worked out (no
// warmth at all lately, or a missing input).
export function gddDaysToReady({ accumulated, needed, recentDailyGdd } = {}) {
  if (!Number.isFinite(accumulated) || !Number.isFinite(needed)) return null;
  const remaining = needed - accumulated;
  if (remaining <= 0) return 0;
  if (!Number.isFinite(recentDailyGdd) || recentDailyGdd <= 0) return null;
  return Math.ceil(remaining / recentDailyGdd);
}

// The heat-unit estimate is used only when the temperatures cover at least
// this share of the days from green-up to today.
export const GDD_MIN_COVERAGE = 0.9;
// The days before today whose warmth sets the pace, with the forecast.
export const GDD_RECENT_DAYS = 14;

// The heat-unit (GDD) estimate for one field.
//   crop          crop id or name
//   greenUp       "YYYY-MM-DD" (greenUpDate in method.js)
//   temperatures  [{ date, tmax, tmin }], past days and forecast days
//                 (Open-Meteo daily temperature_2m_max / _min)
//   today         "YYYY-MM-DD"
// Gives back { accumulated, needed, base, cap, recentDailyGdd, daysToReady,
// greenUp, readyOn } or null (no total for this crop, no green-up date, or
// too many missing days).
export function gddEstimate({ crop, greenUp, temperatures, today } = {}) {
  const profile = cropProfile(crop);
  if (!Number.isFinite(profile.gddToMaturity) || !greenUp || !today || greenUp > today) return null;
  const base = profile.gddBase;
  const cap = profile.gddCap;
  const past = accumulateGdd(temperatures, { base, cap, from: greenUp, to: today });
  const expected = dayNumber(today) - dayNumber(greenUp) + 1;
  if (past.days < GDD_MIN_COVERAGE * expected) return null;
  const recentFrom = addDays(today, -(GDD_RECENT_DAYS - 1));
  const recent = (Array.isArray(temperatures) ? temperatures : [])
    .filter((day) => String(day?.date || "").slice(0, 10) >= recentFrom)
    .map((day) => dailyGdd(day.tmax, day.tmin, base, cap))
    .filter((gdd) => gdd !== null);
  const recentDailyGdd = recent.length ? round(recent.reduce((a, b) => a + b, 0) / recent.length, 2) : null;
  const daysToReady = gddDaysToReady({ accumulated: past.total, needed: profile.gddToMaturity, recentDailyGdd });
  return {
    accumulated: past.total,
    needed: profile.gddToMaturity,
    base,
    cap,
    recentDailyGdd,
    daysToReady,
    greenUp,
    readyOn: Number.isFinite(daysToReady) ? addDays(today, daysToReady) : null,
  };
}

// Crops whose heat units count from spring regrowth (gddFrom "spring
// regrowth": winter cereal, rapeseed) count them from the start of spring
// at the earliest: 1 March in the north, 1 September in the south. Their
// winter growth is held back by short days and the cold whatever the
// thermometer says, and the totals above are from spring regrowth. Where
// winters are mild the curve greens up in winter: real data, Chivilcoy,
// Argentina, 2026-10-19: a field green from mid June had "1,453 of 1,400"
// heat units by 19 October while still at full canopy (NDVI 0.88), and
// read "Harvest soon" two months early.
export const SPRING_REGROWTH_START = { north: "03-01", south: "09-01" };

// The day heat units are counted from: the green-up, or for a crop counted
// from spring regrowth the latest start of spring on or before today when
// that is later. Null without a green-up.
//   crop  crop id or name; greenUp, today  "YYYY-MM-DD"; lat  latitude
export function gddStartDate({ crop, greenUp, today, lat } = {}) {
  if (!greenUp) return null;
  if (cropProfile(crop).gddFrom !== "spring regrowth" || !today) return greenUp;
  const md = Number.isFinite(lat) && lat < 0 ? SPRING_REGROWTH_START.south : SPRING_REGROWTH_START.north;
  const year = Number(today.slice(0, 4));
  const spring = `${year}-${md}` <= today ? `${year}-${md}` : `${year - 1}-${md}`;
  return greenUp > spring ? greenUp : spring;
}

// True when a harvest on `date` fits the crop's usual months after its
// NDVI peak (harvestMonthsAfterPeak, with a month to spare either side).
export function harvestPlausible(crop, peakDate, date) {
  if (!peakDate || !date) return true;
  const [min, max] = cropProfile(crop).harvestMonthsAfterPeak;
  const months = (dayNumber(date) - dayNumber(peakDate)) / 30.44;
  return months >= min - 1 && months <= max + 1;
}

// ---------------------------------------------------------------------------
// Crop type from the satellite record
// ---------------------------------------------------------------------------

// The season's radar peak for the crop type: the highest field-mean VH
// within VH_PEAK_DAYS of the NDVI peak (a crop gives its strongest return
// when it is fullest; frozen or snowy ground in winter can read brighter
// still: -13.2 dB in February on the demo farm). Null with fewer than 3
// passes in that span, or no NDVI peak. Field-gee.js vhPeakOf does the
// same on its cleaned series.
export const VH_PEAK_DAYS = 30;
export function vhPeakNear(series, peakDate) {
  if (typeof peakDate !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(peakDate)) return { vhPeak: null, vhPeakDate: null };
  const from = addDays(peakDate.slice(0, 10), -VH_PEAK_DAYS);
  const to = addDays(peakDate.slice(0, 10), VH_PEAK_DAYS);
  const near = (Array.isArray(series) ? series : []).filter((p) => p && typeof p.date === "string" && p.date.slice(0, 10) >= from && p.date.slice(0, 10) <= to && Number.isFinite(p.vh));
  if (near.length < 3) return { vhPeak: null, vhPeakDate: null };
  const best = near.reduce((top, p) => (p.vh > top.vh ? p : top));
  return { vhPeak: round(best.vh, 2), vhPeakDate: best.date.slice(0, 10) };
}

// The rules, CALIBRATED on real data against the USDA Cropland Data Layer
// (CDL 2025, the 2025 season read on 2025-10-19 with this app's Earth
// Engine provider): 58 fields near Ames, Iowa (corn, soybean) and 95
// sample fields in central South Dakota, north-west Minnesota and north
// Montana (spring wheat, barley, winter wheat, canola, sunflower, corn,
// soybean). North Dakota was HELD OUT and only used to measure accuracy
// (docs/METHODS.md, "Crop type"). Each window is about the 10th to 90th
// percentile of the calibration fields, in northern days of the year:
//   peak       the NDVI peak
//   greenUp    the green-up (greenUpDate)
//   harvest    when NDVI is back down to READY_SHARE of the green-up
//   dryDown    days from the peak to that date
//   vh         the season's Sentinel-1 VH peak near the NDVI peak, dB
//   winterGreen  green over winter (true) or bare over winter (false)
//   flowering    a yellow-flowering signal (NDYI above what NDVI predicts)
//   reGap        the red-edge gap near the peak: mean NDVI - NDRE over the
//                passes within RED_EDGE_GAP_DAYS of the NDVI peak
//                (redEdgeGap). Added 2026-10-19: radar VH peaks shift by
//                a decibel or more from one region to the next (North
//                Dakota corn -15.1 dB against Iowa corn -16.2 dB, median),
//                so VH alone could not tell corn from soybean or
//                sunflower outside the calibration area; the red-edge gap
//                is a property of the canopy (corn keeps NDRE close to its
//                NDVI): pooled calibration fields (10th-90th percentile)
//                corn 0.111-0.155 (128 fields), soybean 0.161-0.195 (71),
//                sunflower 0.193-0.267 (10).
// What the real data showed, against the textbook: near its NDVI peak
// SOYBEAN gives a stronger VH return than corn (Iowa: soybean -15.6 to
// -13.2 dB, corn -16.6 to -14.5 dB), and canola the strongest of all (-14
// to -9.6 dB); cereals are low (-23 to -16 dB). Corn peaks earlier in
// Iowa than soybean (late June to late July, against late July to mid
// August). The same crop's dates shift by region (Montana corn peaked in
// early September), so dates alone do not separate corn, soybean and
// sunflower; their accuracy on the held-out set sets their cap below.
// Month starts: Mar 60, Apr 91, May 121, Jun 152, Jul 182, Aug 213, Sep
// 244, Oct 274, Nov 305, Dec 335.
//   id   the crop the rule names (two rules can name the same crop)
export const CROP_RULES = {
  winterCereal: { id: "winterCereal", peak: [128, 170], greenUp: [60, 130], harvest: [170, 200], dryDown: [20, 50], vh: [-23, -16], reGap: [0.152, 0.243], winterGreen: true },
  // Winter rapeseed (Europe, Ukraine): green over winter, yellow flowers in
  // April-May. Not in the CDL calibration (the US grows spring canola):
  // from the literature (d'Andrimont et al. 2020, NDYI), never "likely".
  winterRapeseed: { id: "rapeseed", peak: [100, 160], harvest: [160, 212], winterGreen: true, flowering: true },
  // Spring canola (North America): sown in May, flowers late June to July.
  springRapeseed: { id: "rapeseed", peak: [166, 208], greenUp: [146, 164], harvest: [203, 240], dryDown: [20, 56], vh: [-14.6, -9], reGap: [0.178, 0.26], winterGreen: false },
  springCereal: { id: "springCereal", peak: [160, 186], greenUp: [128, 157], harvest: [178, 213], dryDown: [10, 42], vh: [-21, -15.8], reGap: [0.154, 0.21], winterGreen: false },
  sunflower: { id: "sunflower", peak: [203, 222], greenUp: [170, 190], harvest: [258, 278], dryDown: [44, 70], vh: [-15, -12.9], reGap: [0.193, 0.267], winterGreen: false },
  corn: { id: "corn", peak: [185, 225], greenUp: [148, 180], harvest: [240, 285], dryDown: [34, 72], vh: [-16.8, -15.3], reGap: [0.111, 0.155], winterGreen: false },
  soybean: { id: "soybean", peak: [205, 238], greenUp: [154, 186], harvest: [252, 270], dryDown: [28, 60], vh: [-15.3, -13.2], reGap: [0.161, 0.195], winterGreen: false },
};

// How much each piece of evidence counts.
export const CROP_EVIDENCE_WEIGHTS = { peak: 3, winterGreen: 3, flowering: 3, vh: 3, reGap: 3, greenUp: 2, harvest: 2, dryDown: 2 };

// A value just outside a window still counts in part: full inside, falling
// in a straight line to nothing this far outside (days, or dB for VH).
export const CROP_WINDOW_SLACK_DAYS = 10;
export const CROP_VH_SLACK_DB = 0.6;
export const CROP_RE_GAP_SLACK = 0.015;
// The red-edge gap is read over the passes this many days either side of
// the NDVI peak (at least RED_EDGE_GAP_MIN_PASSES of them).
export const RED_EDGE_GAP_DAYS = 20;
export const RED_EDGE_GAP_MIN_PASSES = 2;
// "Green" for the winter test, and the rise that marks a newly sown crop
// in autumn (not last summer's crop fading).
export const WINTER_GREEN_NDVI = 0.35;
export const AUTUMN_RISE = 0.05;
// Yellow flowers: NDYI ((B3 - B2) / (B3 + B2)) rises with any green
// canopy, so it is compared with what the field's own NDVI predicts (a
// robust straight line fitted over its green passes). Flowering = at least
// minPasses green passes (NDVI >= minNdvi) in the weeks around the NDVI
// peak (fromDays before to toDays after) at least `rise` above that line,
// and no more than maxShare of all green passes (haze or smoke lifts NDYI
// on every pass: the August 2025 smoke over Iowa did).
export const FLOWERING = { rise: 0.08, minPasses: 2, minNdvi: 0.4, fromDays: 35, toDays: 15, maxShare: 0.4 };
// A season counts as over once NDVI has fallen this far below its peak.
export const SEASON_DONE_DROP = 0.1;
// In the tropics a crop is named only when the field's own NDVI swings at
// least this much over the year (a clear season).
export const TROPICS_MIN_AMPLITUDE = 0.3;
// Grass or hay: cut and grown back again and again in one season. A cut
// is a fall of at least `drop` from a pass at `minHigh` or more within
// `fallDays`, followed by regrowth of at least `drop` back to `minHigh` or
// more within `regrowDays`. Two or more cuts: not a field crop the rules
// know (real data, Ames, Iowa, 2026: an alfalfa field (CDL 2025) cut on
// about 1 June, 14 July and 28 August, each time from 0.84-0.92 to
// 0.35-0.48 and back above 0.8 within two weeks, was read as "Winter
// cereal"). A cereal followed by a second crop is one cut, not two.
export const HAY_CUTS = { minHigh: 0.6, drop: 0.25, fallDays: 21, regrowDays: 45, minCuts: 2 };
// Fallow or grass: land that greens up in spring and fades slowly over the
// summer without ever going back to bare soil, and whose canopy has a
// red-edge gap (NDVI - NDRE near the peak) wider than any field crop's
// calibrated window (the widest, sunflower, ends at 0.267): mixed grasses
// and weeds, not a sown crop. Read only when no crop rule fits (a crop
// rule always wins). All four must hold:
//   maxPeakDoy  greenest before this northern day of the year (early July)
//   minFadeDays at least this many days from the peak to the ready level,
//               or to the latest pass when it has not got that low yet
//   minReGap    a red-edge gap wider than this
//   minNdvi     never down to bare soil after green-up (cleaned passes)
// Real data, demo farm near Kupiansk, Ukraine, 2026 (a few kilometres from
// the front line): 8 of 11 fields green up in early April, peak in late
// June (0.66-0.89), fade over 60-105 days to 0.26-0.35 and never go bare,
// with a red-edge gap of 0.28-0.35, the same pattern in 2025: fallow or
// abandoned cropland gone to grass. Checked against the USDA Cropland
// Data Layer 2025 (2026-10-19): not one of 528 crop fields (Iowa, the
// Dakotas, Minnesota, Montana) is called fallow or grass, but neither is
// any of 60 CDL grassland, hay or summer-fallow fields in the Dakotas and
// Montana (prairie grass there has a red-edge gap of 0.10-0.28, mostly
// under 0.25, and US "fallow" is bare tilled land). The rule therefore
// rests on one region and is only ever "possible" (FALLOW_CONFIDENCE).
export const FALLOW = { maxPeakDoy: 185, minFadeDays: 50, minReGap: 0.27, minNdvi: 0.25 };
export const FALLOW_LABEL = "Fallow or grass";
export const FALLOW_CONFIDENCE = "possible";

// A winter cereal growing NOW, before its season can be read the usual
// way (the rules above need the peak and the dry-down). The southern
// wheat and barley of the Pampas are sown in June and July, green through
// the southern winter and peak in September to November (northern March to
// May), so in October their curve is still at its highest: without this
// rule the classifier fell back to LAST summer's crop (soybean) and the
// field had no crop for this season, so no harvest estimate (real data,
// near Chivilcoy, Argentina, 2026-10-19: fields green from June to
// August, 0.78 to 0.94 on 2 October). All must hold, in northern days of
// the year (the south moved by 6 months), outside the tropics, for the
// crop now in the field (from the last harvest in the curve, if any):
//   greenBy / greenFrom  first at WINTER_GREEN_NDVI or more on or before
//                        greenBy (1 March) or from greenFrom (1 October,
//                        an autumn sowing): green through the winter
//   latest               the latest clear pass between these days (March
//                        to mid July): the time a winter cereal is at or
//                        near its peak and not yet harvested
//   minHigh              its highest NDVI so far at least this
//   nearHigh             either that highest pass is in March to May, or
//                        the latest pass is still at this share of it
//   not harvested        harvestStage of the curve says "growing" or "ripening"
// Never more than "possible": dates alone cannot tell wheat from barley,
// oats or a winter pasture.
export const WINTER_CEREAL_IN_SEASON = { greenBy: 60, greenFrom: 274, latest: [60, 196], peak: [60, 151], minHigh: 0.55, nearHigh: 0.85 };

// Confidence: "likely" needs this score, this much evidence (weights) and
// this lead over the next crop; "possible" needs MIN_POSSIBLE_SCORE.
export const CROP_LIKELY = { score: 0.8, evidence: 10, lead: 0.1 };
export const MIN_POSSIBLE_SCORE = 0.65;
// The best confidence each crop may get: "possible" for a crop whose
// accuracy on the held-out North Dakota fields stayed under 70 %, or whose
// "likely" calls there were right less than 80 % of the time
// (docs/METHODS.md has the table). Set from the validation run of
// 2026-10-19 (248 North Dakota fields, CDL 2025): corn 76 % (likely right
// 17 of 17), soybean 80 % (41 of 46), sunflower 84 % (14 of 14), spring
// cereal 58 %, winter cereal 40 %, rapeseed 77 % but only 59 % of its
// "likely" calls right (spring wheat read as canola).
export const CROP_CONFIDENCE_CAP = { winterCereal: "possible", rapeseed: "possible", springCereal: "possible", sunflower: "likely", corn: "likely", soybean: "likely" };

const UNKNOWN = { id: "unknown", label: "Unknown" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayOfYear(iso) {
  const year = Number(iso.slice(0, 4));
  return dayNumber(iso) - dayNumber(`${year}-01-01`) + 1;
}

// "early June", "mid July", "late August".
function whenText(iso) {
  const day = Number(iso.slice(8, 10));
  const part = day <= 10 ? "early" : day <= 20 ? "mid" : "late";
  return `${part} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

// How well a value fits a window: 1 inside, falling to 0 at `slack`
// outside.
function fit(value, [from, to], slack) {
  if (value >= from && value <= to) return 1;
  const off = value < from ? from - value : value - to;
  return Math.max(0, 1 - off / slack);
}

// Month entries -> { date (mid-month), ndvi, index (months since year 0) }.
function monthPoints(months) {
  return (Array.isArray(months) ? months : [])
    .map((item) => {
      const month = String(item?.month || item?.date || "").slice(0, 7);
      return /^\d{4}-\d{2}$/.test(month) && Number.isFinite(item?.ndvi)
        ? { date: `${month}-15`, ndvi: item.ndvi, index: Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
}

const peakIndexOf = (points) => points.reduce((best, p, i) => (p.ndvi > points[best].ndvi ? i : best), 0);

// The season to read: this season's passes when their peak is over; else
// the latest complete season in the monthly record. { points, peakDate,
// source, last } or { early: true } (still greening up) or null. last:
// the crop read was harvested and another has grown since (a southern
// double crop: last summer's crop, then wheat), so it is not the crop in
// the field now.
function pickSeason(passes, months) {
  const series = cleanSeries(Array.isArray(passes) ? passes : []);
  if (series.length >= 5) {
    const i = peakIndexOf(series);
    const peak = series[i].ndvi;
    if (peak >= NOT_SOWN_PEAK) {
      const done = series.slice(i + 1).some((p) => p.ndvi <= peak - SEASON_DONE_DROP);
      if (done) {
        const now = harvestStage(series, series[series.length - 1].date);
        if (now.cycleStart && series[i].date < now.cycleStart) {
          return { points: series.filter((p) => p.date < now.cycleStart), peakDate: series[i].date, source: "passes", last: true };
        }
        return { points: series, peakDate: series[i].date, source: "passes" };
      }
    }
  }
  const monthly = monthPoints(months);
  for (let i = monthly.length - 2; i >= 1; i -= 1) {
    const p = monthly[i];
    if (p.ndvi < NOT_SOWN_PEAK) continue;
    const near = monthly.filter((q) => Math.abs(q.index - p.index) <= 2);
    if (near.some((q) => q.ndvi > p.ndvi)) continue;
    if (!monthly.slice(i + 1).some((q) => q.ndvi <= p.ndvi - SEASON_DONE_DROP)) continue;
    const points = monthly.filter((q) => q.index >= p.index - 9 && q.index <= p.index + 6).map(({ date, ndvi }) => ({ date, ndvi }));
    return { points, peakDate: p.date, source: "months" };
  }
  if (series.length >= 3 && Math.max(...series.map((p) => p.ndvi)) >= NOT_SOWN_PEAK) return { early: true };
  return null;
}

// The first date after the peak when NDVI is back down to the ready level
// (straight line between passes).
function dryDownDate(points, peakDate) {
  const peakAt = points.findIndex((p) => p.date === peakDate);
  if (peakAt < 0) return null;
  const level = BARE_NDVI + READY_SHARE * (points[peakAt].ndvi - BARE_NDVI);
  for (let i = peakAt + 1; i < points.length; i += 1) {
    if (points[i].ndvi > level) continue;
    const a = points[i - 1];
    const b = points[i];
    const t = a.ndvi === b.ndvi ? 1 : (a.ndvi - level) / (a.ndvi - b.ndvi);
    return addDays(a.date, Math.round(t * (dayNumber(b.date) - dayNumber(a.date))));
  }
  return null;
}

// Green over winter before this season's peak: a crop sown in autumn (a
// rise to WINTER_GREEN_NDVI in October to December, northern months, from
// a lower month since August: last summer's crop fading does not count)
// or green in March. Null when none of those months is known.
function winterGreenFrom(months, peakDate, shift) {
  const monthly = monthPoints(months).map((p) => ({ ...p, north: p.index + shift }));
  const peakNorth = Number(peakDate.slice(0, 4)) * 12 + Number(peakDate.slice(5, 7)) - 1 + shift;
  const peakYear = Math.floor(peakNorth / 12);
  const at = (year, month) => monthly.find((p) => p.north === year * 12 + month - 1);
  let known = false;
  for (const month of [10, 11, 12]) {
    const p = at(peakYear - 1, month);
    if (!p) continue;
    known = true;
    const before = monthly.filter((q) => q.north >= (peakYear - 1) * 12 + 7 && q.north < p.north).map((q) => q.ndvi);
    const rising = before.length > 0 && p.ndvi >= Math.min(...before) + AUTUMN_RISE;
    if (p.ndvi >= WINTER_GREEN_NDVI && rising) return true;
  }
  const march = peakNorth % 12 >= 3 ? at(peakYear, 3) : null;
  if (march) {
    known = true;
    if (march.ndvi >= WINTER_GREEN_NDVI) return true;
  }
  return known ? false : null;
}

// A yellow-flowering signal (FLOWERING) around the NDVI peak: true, false,
// or null when too few passes carry NDYI.
function floweringFrom(passes, peakDate) {
  const f = FLOWERING;
  const green = cleanSeries((Array.isArray(passes) ? passes : []).filter((p) => p && typeof p.date === "string" && Number.isFinite(p.ndyi) && Number.isFinite(p.ndvi))).filter((p) => p.ndvi >= f.minNdvi);
  if (green.length < 5) return null;
  // A robust line (Theil-Sen: the median of the slopes between every two
  // passes), so the flowering passes themselves do not bend it.
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const slopes = [];
  for (let i = 0; i < green.length; i += 1) {
    for (let j = i + 1; j < green.length; j += 1) {
      const dx = green[j].ndvi - green[i].ndvi;
      if (Math.abs(dx) >= 0.02) slopes.push((green[j].ndyi - green[i].ndyi) / dx);
    }
  }
  const slope = slopes.length ? median(slopes) : 0;
  const intercept = median(green.map((p) => p.ndyi - slope * p.ndvi));
  const above = green.filter((p) => p.ndyi - (intercept + slope * p.ndvi) >= f.rise);
  if (above.length > f.maxShare * green.length) return false;
  const from = addDays(peakDate, -f.fromDays);
  const to = addDays(peakDate, f.toDays);
  return above.filter((p) => p.date >= from && p.date <= to).length >= f.minPasses;
}

// How many times this season's curve was cut and grew back (HAY_CUTS).
export function cutsAndRegrowth(passes) {
  const h = HAY_CUTS;
  const series = cleanSeries((Array.isArray(passes) ? passes : []).filter((p) => p && typeof p.date === "string" && Number.isFinite(p.ndvi)));
  let cuts = 0;
  let i = 0;
  while (i < series.length) {
    const high = series[i];
    if (high.ndvi < h.minHigh) {
      i += 1;
      continue;
    }
    // The lowest pass within fallDays after this high.
    let low = -1;
    for (let j = i + 1; j < series.length && dayNumber(series[j].date) - dayNumber(high.date) <= h.fallDays; j += 1) {
      if (series[j].ndvi > high.ndvi) break; // still rising: start from the higher pass
      if (low < 0 || series[j].ndvi < series[low].ndvi) low = j;
    }
    if (low < 0 || high.ndvi - series[low].ndvi < h.drop) {
      i += 1;
      continue;
    }
    const back = series.findIndex((p, k) => k > low && dayNumber(p.date) - dayNumber(series[low].date) <= h.regrowDays && p.ndvi >= h.minHigh && p.ndvi - series[low].ndvi >= h.drop);
    if (back < 0) {
      i = low + 1;
      continue;
    }
    cuts += 1;
    i = back;
  }
  return cuts;
}

// The red-edge gap near the peak: the mean of NDVI - NDRE over this
// season's clear passes within RED_EDGE_GAP_DAYS of the NDVI peak. Null
// with fewer than RED_EDGE_GAP_MIN_PASSES such passes carrying NDRE.
export function redEdgeGap(passes, peakDate) {
  if (typeof peakDate !== "string") return null;
  const peak = dayNumber(peakDate);
  const near = cleanSeries((Array.isArray(passes) ? passes : []).filter((p) => p && typeof p.date === "string" && Number.isFinite(p.ndvi)))
    .filter((p) => Number.isFinite(p.ndre) && Math.abs(dayNumber(p.date) - peak) <= RED_EDGE_GAP_DAYS);
  if (near.length < RED_EDGE_GAP_MIN_PASSES) return null;
  return near.reduce((sum, p) => sum + (p.ndvi - p.ndre), 0) / near.length;
}

// Scores one rule: { id, rule, score, evidence (weight of the known
// evidence), matched } or null when the peak does not fit at all.
function scoreCrop(key, f) {
  const rule = CROP_RULES[key];
  const w = CROP_EVIDENCE_WEIGHTS;
  const days = CROP_WINDOW_SLACK_DAYS;
  const peakFit = fit(f.peakDoy, rule.peak, days);
  if (peakFit <= 0) return null;
  let evidence = w.peak;
  let matched = w.peak * peakFit;
  const check = (known, share, weight) => {
    if (!known) return;
    evidence += weight;
    matched += weight * share;
  };
  if (rule.greenUp) check(f.greenUpDoy !== null, f.greenUpDoy !== null ? fit(f.greenUpDoy, rule.greenUp, days) : 0, w.greenUp);
  check(f.harvestDoy !== null, f.harvestDoy !== null ? fit(f.harvestDoy, rule.harvest, days) : 0, w.harvest);
  if (rule.dryDown) check(f.dryDownDays !== null, f.dryDownDays !== null ? fit(f.dryDownDays, rule.dryDown, days) : 0, w.dryDown);
  if (rule.vh) check(Number.isFinite(f.vh), Number.isFinite(f.vh) ? fit(f.vh, rule.vh, CROP_VH_SLACK_DB) : 0, w.vh);
  if (rule.reGap) check(Number.isFinite(f.reGap), Number.isFinite(f.reGap) ? fit(f.reGap, rule.reGap, CROP_RE_GAP_SLACK) : 0, w.reGap);
  check(f.winterGreen !== null, f.winterGreen === rule.winterGreen ? 1 : 0, w.winterGreen);
  if (rule.flowering !== undefined) check(f.flowering !== null, f.flowering === rule.flowering ? 1 : 0, w.flowering);
  return { id: rule.id, rule: key, score: matched / evidence, evidence, matched };
}

// What classifyCrop reads from a field's record (same inputs): the season
// it read ({ source: "passes" | "months" }), its peak, green-up and
// dry-down dates and the features the rules score. { unknown: reason }
// when no season can be read.
export function cropFeatures({ months = [], passes = [], peakMonth, lat, vhPeak } = {}) {
  const band = climateBand(lat);
  const south = Number.isFinite(lat) && lat < 0;
  const shiftMonths = south ? 6 : 0;
  const toNorthDoy = (iso) => dayOfYear(south ? addDays(iso, 182) : iso);

  if (band === "tropics" && peakMonth === null) return { unknown: "No clear growing season here", tropicsUnclear: true };
  const cuts = cutsAndRegrowth(passes);
  if (cuts >= HAY_CUTS.minCuts) return { unknown: `Cut and grown back ${cuts} times this season: grass or hay, not a field crop the satellite can name`, hay: true };
  const season = pickSeason(passes, months);
  if (!season) return { unknown: "No crop season found in the last 18 months" };
  if (season.early) return { unknown: "Still greening up: the crop can be told once it has peaked", early: true };
  if (band === "tropics") {
    const values = monthPoints(months).slice(-12).map((p) => p.ndvi);
    const swing = values.length >= 8 ? Math.max(...values) - Math.min(...values) : null;
    if (!(swing >= TROPICS_MIN_AMPLITUDE)) return { unknown: "No clear growing season in this field", tropicsUnclear: true };
  }

  const { points, peakDate } = season;
  const greenUp = greenUpDate(points.filter((p) => p.date <= peakDate));
  const harvest = dryDownDate(points, peakDate);
  // How long the fade has lasted (to the ready level, or to the latest
  // point while it is not that low yet) and the lowest point since green-up
  // (fallow or grass: FALLOW).
  const cleaned = cleanSeries(points);
  const lastDate = cleaned.length ? cleaned[cleaned.length - 1].date : peakDate;
  const sinceGreenUp = cleaned.filter((p) => p.date >= (greenUp || peakDate));
  const features = {
    peakDoy: toNorthDoy(peakDate),
    greenUpDoy: greenUp ? toNorthDoy(greenUp) : null,
    harvestDoy: harvest ? toNorthDoy(harvest) : null,
    dryDownDays: harvest ? dayNumber(harvest) - dayNumber(peakDate) : null,
    winterGreen: winterGreenFrom(months, peakDate, shiftMonths),
    flowering: season.source === "passes" ? floweringFrom(passes, peakDate) : null,
    vh: Number.isFinite(vhPeak) ? vhPeak : null,
    reGap: season.source === "passes" ? redEdgeGap(passes, peakDate) : null,
    fadeDays: dayNumber(harvest || lastDate) - dayNumber(peakDate),
    lowSinceGreenUp: sinceGreenUp.length ? Math.min(...sinceGreenUp.map((p) => p.ndvi)) : null,
  };
  return { band, source: season.source, last: Boolean(season.last), peakDate, greenUp, harvest, features };
}

// The winter cereal growing now (WINTER_CEREAL_IN_SEASON): { greenSince,
// highDate, high, latestDate } or null when the rule does not hold.
//   passes  this season's clear passes [{ date, ndvi }]; lat  latitude
export function inSeasonWinterCereal({ passes = [], lat } = {}) {
  const rule = WINTER_CEREAL_IN_SEASON;
  if (climateBand(lat) === "tropics") return null;
  const south = Number.isFinite(lat) && lat < 0;
  const toNorthDoy = (iso) => dayOfYear(south ? addDays(iso, 182) : iso);
  const series = cleanSeries((Array.isArray(passes) ? passes : []).filter((p) => p && typeof p.date === "string" && Number.isFinite(p.ndvi)));
  if (series.length < 3) return null;
  const latest = series[series.length - 1];
  const now = harvestStage(series, latest.date);
  if (now.stage !== "growing" && now.stage !== "ripening") return null;
  const cycle = now.cycleStart ? series.filter((p) => p.date >= now.cycleStart) : series;
  if (cycle.length < 3) return null;
  const latestDoy = toNorthDoy(latest.date);
  if (latestDoy < rule.latest[0] || latestDoy > rule.latest[1]) return null;
  const top = cycle.reduce((best, p) => (p.ndvi > best.ndvi ? p : best));
  if (top.ndvi < rule.minHigh) return null;
  const topDoy = toNorthDoy(top.date);
  const peakInWindow = topDoy >= rule.peak[0] && topDoy <= rule.peak[1];
  if (!peakInWindow && latest.ndvi < rule.nearHigh * top.ndvi) return null;
  const green = cycle.find((p) => p.ndvi >= WINTER_GREEN_NDVI);
  if (!green || green.date > top.date) return null;
  const greenDoy = toNorthDoy(green.date);
  if (!(greenDoy <= rule.greenBy || greenDoy >= rule.greenFrom)) return null;
  return { greenSince: green.date, highDate: top.date, high: top.ndvi, latestDate: latest.date };
}

// True when a season read from this season's passes has the fallow or
// grass pattern (FALLOW).
export function isFallowPattern(read) {
  const f = read?.features;
  if (!f || read.source !== "passes" || read.last) return false;
  return (
    f.peakDoy <= FALLOW.maxPeakDoy &&
    f.fadeDays >= FALLOW.minFadeDays &&
    Number.isFinite(f.reGap) &&
    f.reGap > FALLOW.minReGap &&
    Number.isFinite(f.lowSinceGreenUp) &&
    f.lowSinceGreenUp >= FALLOW.minNdvi
  );
}

// What the satellite saw, for a field no rule names: "Green from early
// April, greenest in late June, a slow fade over 105 days".
function seenText(read) {
  const { greenUp, peakDate, harvest, features } = read;
  const parts = [];
  if (greenUp) parts.push(`green from ${whenText(greenUp)}`);
  parts.push(`greenest in ${whenText(peakDate)}`);
  if (features.fadeDays >= FALLOW.minFadeDays) parts.push(`a slow fade over ${features.fadeDays} days`);
  else if (harvest) parts.push(`dried down by ${whenText(harvest)}`);
  const text = parts.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

// Which crop a field has, from its satellite record.
//   months    monthly NDVI for the last 18 months: [{ month: "YYYY-MM", ndvi }]
//   passes    this season's clear passes: [{ date, ndvi, ndyi }] (NDYI =
//             (B3 - B2) / (B3 + B2), yellow flowers)
//   peakMonth the place's usual peak month (season.js peakMonthFrom), null
//             when the place has no clear season
//   lat       latitude (south: months moved by 6)
//   vhPeak    the season's field-mean Sentinel-1 VH near the NDVI peak, dB (vhPeakNear)
// Gives back { id, label, confidence: "likely" | "possible", reason,
// season: "this" | "last" } or { id: "unknown", label: "Unknown", reason }.
export function classifyCrop(input = {}) {
  const read = cropFeatures(input);
  // This season's crop cannot be read the usual way yet (still greening
  // up, or only last season's crop can be read): a winter cereal growing
  // now is named from its curve so far (WINTER_CEREAL_IN_SEASON).
  if (read.early || read.last || read.source === "months" || (read.unknown && !read.hay)) {
    const now = !read.hay && !read.tropicsUnclear ? inSeasonWinterCereal({ passes: input.passes, lat: input.lat }) : null;
    if (now) {
      const reason = `Green through the winter (from ${whenText(now.greenSince)}) and ${now.highDate === now.latestDate ? "still greening" : `greenest in ${whenText(now.highDate)}`}, not harvested yet: a winter cereal (wheat or barley) growing now`;
      return { id: "winterCereal", label: CROP_PROFILES.winterCereal.label, confidence: "possible", reason, season: "this", inSeason: true };
    }
  }
  if (read.unknown) return { ...UNKNOWN, reason: read.unknown };
  const { features, peakDate, greenUp, harvest, band } = read;
  const { vhPeak } = input;
  // The best rule per crop (two rules can name the same crop), best first.
  const byCrop = new Map();
  for (const key of Object.keys(CROP_RULES)) {
    const scored = scoreCrop(key, features);
    if (scored && (!byCrop.has(scored.id) || scored.score > byCrop.get(scored.id).score)) byCrop.set(scored.id, scored);
  }
  const ranked = [...byCrop.values()].sort((a, b) => b.score - a.score || b.matched - a.matched);
  const top = ranked[0];
  const seasonTag = read.source === "passes" && !read.last ? "this" : "last";
  if (!top || top.score < MIN_POSSIBLE_SCORE) {
    // No crop fits: fallow or grass when the field has that pattern, else
    // unknown, saying what was seen.
    if (isFallowPattern(read)) {
      const reason = `${seenText(read)}, never back to bare soil, and a leaf canopy unlike any field crop's (red-edge gap ${round(features.reGap, 2)}): fallow or grass, not a sown crop`;
      return { id: "fallow", label: FALLOW_LABEL, confidence: FALLOW_CONFIDENCE, reason, season: seasonTag };
    }
    // possiblyFallow: close to the fallow pattern, so no pest risk is given
    // (method.js pestRiskApplies).
    const maybe = features.peakDoy <= FALLOW.maxPeakDoy + CROP_WINDOW_SLACK_DAYS && features.fadeDays >= FALLOW.minFadeDays && features.lowSinceGreenUp >= FALLOW.minNdvi;
    return { ...UNKNOWN, reason: `${seenText(read)}: not the pattern of a known crop${maybe ? "; possibly fallow or grass" : ""}`, season: seasonTag, ...(maybe ? { possiblyFallow: true } : {}) };
  }

  const lead = ranked[1] ? top.score - ranked[1].score : 1;
  const likely =
    top.score >= CROP_LIKELY.score &&
    top.evidence >= CROP_LIKELY.evidence &&
    lead >= CROP_LIKELY.lead &&
    band !== "tropics" &&
    CROP_CONFIDENCE_CAP[top.id] !== "possible";

  const reasons = [`greenest in ${whenText(peakDate)}`];
  if (greenUp) reasons.push(`green-up in ${whenText(greenUp)}`);
  if (harvest) reasons.push(`dried down by ${whenText(harvest)}`);
  if (features.winterGreen === true) reasons.push("green over winter");
  if (features.winterGreen === false) reasons.push("bare over winter");
  if (features.flowering === true) reasons.push("yellow flowers around the peak");
  if (Number.isFinite(vhPeak)) reasons.push(`radar VH ${round(vhPeak)} dB at the peak`);
  if (ranked[1] && lead < CROP_LIKELY.lead) reasons.push(`could also be ${CROP_PROFILES[ranked[1].id].label.toLowerCase()}`);
  const reason = reasons.join(", ").replace(/^./, (c) => c.toUpperCase());

  // season: "this" when read from this season's passes, "last" when read
  // from the last complete season in the monthly record (this season has
  // not peaked yet) or from a crop harvested before the one now growing:
  // last season's crop is not this season's (rotation), so it must not
  // drive this season's harvest rules.
  return { id: top.id, label: CROP_PROFILES[top.id].label, confidence: likely ? "likely" : "possible", reason, season: seasonTag };
}
