// WHAT THIS FILE DOES
// Checks the crop rules (crops.js): crop profiles, heat units (growing
// degree-days) and the crop-type classifier. Run with: npm test
//
// WHO EDITS IT
// Whoever changes the Field method. Add a test when you add a rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CROP_CONFIDENCE_CAP,
  CROP_PROFILES,
  FALLOW,
  FALLOW_CONFIDENCE,
  FALLOW_LABEL,
  accumulateGdd,
  classifyCrop,
  cropFeatures,
  cropIdFor,
  cropProfile,
  cutsAndRegrowth,
  dailyGdd,
  gddDaysToReady,
  gddEstimate,
  gddStartDate,
  harvestPlausible,
  inSeasonWinterCereal,
  isFallowPattern,
  isTallCrop,
  meanGdd,
  redEdgeGap,
  vhPeakNear,
} from "./crops.js";
import { IOWA_CORN, IOWA_SOYBEAN, IOWA_SOYBEAN_EARLY, KUPIANSK_FALLOW, KUPIANSK_FALLOW_SLOW, KUPIANSK_UNKNOWN, MN_CANOLA, PAMPAS_WHEAT_AFTER_SOY, PAMPAS_WHEAT_DOUBLE, PAMPAS_WHEAT_EARLY, MT_WINTER_WHEAT, SD_SPRING_WHEAT, SD_SUNFLOWER } from "./crops.test-data.js";
import * as method from "./method.js";

// "MM-DD:ndvi" pairs in one year -> passes.
const passes = (year, text) =>
  text.split(" ").map((item) => {
    const [md, ndvi] = item.split(":");
    return { date: `${year}-${md}`, ndvi: Number(ndvi) };
  });

// Monthly NDVI from a first month "YYYY-MM".
function months(first, values) {
  let [y, m] = first.split("-").map(Number);
  return values.map((ndvi) => {
    const item = { month: `${y}-${String(m).padStart(2, "0")}`, ndvi };
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return item;
  });
}

test("harvest months after the peak", () => {
  assert.equal(harvestPlausible("corn", "2026-07-28", "2026-10-15"), true);
  assert.equal(harvestPlausible("springCereal", "2026-06-20", "2027-01-15"), false);
  assert.equal(harvestPlausible("corn", null, "2026-10-15"), true);
});

test("real fields (calibration set, USDA CDL 2025) are read as their crop", () => {
  const expect = [
    [IOWA_CORN, "corn"],
    [IOWA_SOYBEAN, "soybean"],
    [SD_SUNFLOWER, "sunflower"],
    [MN_CANOLA, "rapeseed"],
    [SD_SPRING_WHEAT, "springCereal"],
    [MT_WINTER_WHEAT, "winterCereal"],
  ];
  for (const [field, id] of expect) {
    const crop = classifyCrop(field);
    assert.equal(crop.id, id, `${field.truth}: ${crop.reason}`);
    assert.equal(crop.season, "this");
    // Never more than the crop's cap (from the held-out North Dakota fields).
    if (CROP_CONFIDENCE_CAP[id] === "possible") assert.equal(crop.confidence, "possible", field.truth);
  }
  // Corn, soybean and sunflower passed on the held-out fields; the cereals
  // and rapeseed did not.
  assert.deepEqual(Object.keys(CROP_CONFIDENCE_CAP).filter((id) => CROP_CONFIDENCE_CAP[id] === "likely").sort(), ["corn", "soybean", "sunflower"]);
});

test("the red-edge gap near the peak tells an early soybean from corn (real Iowa field)", () => {
  assert.equal(redEdgeGap(IOWA_SOYBEAN_EARLY.passes, "2025-07-19").toFixed(3), "0.180");
  assert.equal(classifyCrop(IOWA_SOYBEAN_EARLY).id, "soybean");
  // Without the red-edge band it reads as corn (what it did before).
  const noRedEdge = IOWA_SOYBEAN_EARLY.passes.map(({ ndre, ...p }) => p);
  assert.equal(redEdgeGap(noRedEdge, "2025-07-19"), null);
  assert.equal(classifyCrop({ ...IOWA_SOYBEAN_EARLY, passes: noRedEdge }).id, "corn");
  // Too few passes near the peak: no gap.
  assert.equal(redEdgeGap(IOWA_SOYBEAN_EARLY.passes.slice(0, 18), "2025-09-30"), null);
});

test("near the peak soybean gives a stronger radar return than corn (real data)", () => {
  // The same Iowa corn field with a soybean-like VH and a later peak and dry-down reads soybean.
  assert.equal(classifyCrop({ ...IOWA_CORN, vhPeak: -16.2 }).id, "corn");
  assert.notEqual(classifyCrop({ ...IOWA_SOYBEAN, vhPeak: -14 }).id, "corn");
  // Without radar, corn and soybean are only possible.
  assert.equal(classifyCrop({ ...IOWA_SOYBEAN, vhPeak: null }).confidence, "possible");
});

test("an Iowa soybean peaking in mid July is never 'sunflower' (old bug: soy window started 22 July)", () => {
  const july = IOWA_SOYBEAN.passes.map((p) => ({ ...p, date: p.date.replace(/^2025-(\d\d)-(\d\d)$/, (m, mm, dd) => { const d = new Date(Date.UTC(2025, Number(mm) - 1, Number(dd) - 25)); return d.toISOString().slice(0, 10); }) }));
  const crop = classifyCrop({ ...IOWA_SOYBEAN, passes: july });
  assert.notEqual(crop.id, "sunflower", crop.reason);
});

test("NDYI rising with a green canopy is not 'yellow flowering'", () => {
  // NDYI that just follows NDVI (any green crop): no flowering.
  const plain = IOWA_CORN.passes.map((p) => ({ ...p, ndyi: 0.05 + 0.3 * p.ndvi }));
  const crop = classifyCrop({ ...IOWA_CORN, passes: plain });
  assert.doesNotMatch(crop.reason, /yellow/);
  // A yellow bump above that line on passes around the peak: flowering.
  const peak = cropFeatures({ ...IOWA_CORN, passes: plain }).peakDate;
  const near = (date) => Math.abs(Date.parse(date) - Date.parse(peak)) <= 12 * 86400000 && date <= peak;
  const bumped = plain.map((p) => (near(p.date) && p.ndvi >= 0.4 ? { ...p, ndyi: p.ndyi + 0.15 } : p));
  assert.equal(cropFeatures({ ...IOWA_CORN, passes: bumped }).features.flowering, true);
  // Haze on every pass (NDYI high everywhere): not flowering.
  const hazy = plain.map((p, i) => (i % 2 ? { ...p, ndyi: p.ndyi + 0.3 } : p));
  assert.equal(cropFeatures({ ...IOWA_CORN, passes: hazy }).features.flowering, false);
});

// Beauce, France: sown in autumn 2025 (green from November), peak in May,
// dried down in June (real 2026 curve, Earth Engine).
const BEAUCE_MONTHS = months("2025-05", [0.8, 0.6, 0.25, 0.2, 0.18, 0.25, 0.4, 0.45, 0.42, 0.45, 0.6, 0.8, 0.9, 0.55, 0.18, 0.15, 0.15]);
const BEAUCE = [
  ["2026-03-10", 0.6], ["2026-03-25", 0.7], ["2026-04-14", 0.86], ["2026-05-09", 0.909], ["2026-05-27", 0.899], ["2026-06-13", 0.571], ["2026-06-18", 0.429], ["2026-06-20", 0.324],
  ["2026-06-23", 0.261], ["2026-06-28", 0.21], ["2026-07-08", 0.172], ["2026-08-10", 0.14], ["2026-09-14", 0.135],
].map(([date, ndvi]) => ({ date, ndvi, ndyi: 0.05 + 0.3 * ndvi }));

test("winter cereal: green over winter, peak in May, dry in June", () => {
  const crop = classifyCrop({ months: BEAUCE_MONTHS, passes: BEAUCE, peakMonth: 5, lat: 48.2, vhPeak: -19 });
  assert.equal(crop.id, "winterCereal");
  assert.equal(crop.confidence, "possible");
  assert.match(crop.reason, /green over winter/);
});

test("winter rapeseed: like a winter cereal with yellow flowers before the peak (never 'likely')", () => {
  const flowers = BEAUCE.map((p) => (p.date === "2026-04-14" || p.date === "2026-05-09" ? { ...p, ndyi: p.ndyi + 0.15 } : p));
  const crop = classifyCrop({ months: BEAUCE_MONTHS, passes: flowers, peakMonth: 5, lat: 48.2 });
  assert.equal(crop.id, "rapeseed");
  assert.equal(crop.confidence, "possible");
  assert.match(crop.reason, /yellow flowers/);
});

test("southern hemisphere: months move by 6 (Pampas soybean peaking in mid February)", () => {
  const pampasMonths = months("2025-04", [0.6, 0.4, 0.3, 0.25, 0.22, 0.25, 0.3, 0.22, 0.25, 0.6, 0.85, 0.75, 0.35, 0.3, 0.3, 0.32, 0.3, 0.3]);
  // IOWA_SOYBEAN's curve moved by half a year.
  const soy = IOWA_SOYBEAN.passes.map((p) => ({ ...p, date: new Date(Date.parse(p.date) - 182 * 86400000).toISOString().slice(0, 10) }));
  const crop = classifyCrop({ months: pampasMonths, passes: soy, peakMonth: 2, lat: -34.9, vhPeak: IOWA_SOYBEAN.vhPeak });
  assert.equal(crop.id, "soybean");
  // The same curve in the north (peak in February) is no known crop.
  assert.equal(classifyCrop({ months: pampasMonths, passes: soy, peakMonth: 2, lat: 42, vhPeak: -14 }).id, "unknown");
});

test("tropics: no crop named without a clear season, and never more than possible", () => {
  const flat = months("2025-04", Array(18).fill(0.7));
  const none = classifyCrop({ months: flat, passes: [], peakMonth: null, lat: -0.3 });
  assert.equal(none.id, "unknown");
  assert.equal(none.label, "Unknown");
  const mtMonths = months("2025-04", [0.6, 0.5, 0.3, 0.25, 0.22, 0.25, 0.3, 0.22, 0.25, 0.6, 0.85, 0.75, 0.35, 0.3, 0.3, 0.32, 0.3, 0.3]);
  const soy = IOWA_SOYBEAN.passes.map((p) => ({ ...p, date: new Date(Date.parse(p.date) - 182 * 86400000).toISOString().slice(0, 10) }));
  const crop = classifyCrop({ months: mtMonths, passes: soy, peakMonth: 1, lat: -12.55, vhPeak: IOWA_SOYBEAN.vhPeak });
  assert.equal(crop.id, "soybean");
  assert.equal(crop.confidence, "possible");
});

test("a slow fade from a June peak (demo farm, Kupiansk 2026) is no known crop", () => {
  const kupiansk = passes(2026, "03-08:0.23 03-21:0.23 04-02:0.18 04-12:0.30 04-25:0.37 05-09:0.42 05-19:0.53 06-08:0.71 06-24:0.78 07-08:0.74 07-28:0.65 08-07:0.55 08-17:0.50 08-25:0.44 09-02:0.40 09-12:0.35 09-26:0.33 10-07:0.34 10-12:0.37");
  const uaMonths = months("2025-05", [0.5, 0.6, 0.55, 0.45, 0.35, 0.3, 0.28, 0.25, 0.22, 0.22, 0.22, 0.25, 0.4, 0.62, 0.74, 0.6, 0.42, 0.35]);
  const crop = classifyCrop({ months: uaMonths, passes: kupiansk, peakMonth: 6, lat: 49.7 });
  assert.equal(crop.id, "unknown", crop.reason);
});

test("fallow or grass: the real demo farm near Kupiansk (2026) is not 'Unknown'", () => {
  // Green from early April, greenest in late June, a slow fade that never
  // reaches bare soil, and a red-edge gap wider than any crop's window.
  for (const field of [KUPIANSK_FALLOW, KUPIANSK_FALLOW_SLOW]) {
    const crop = classifyCrop(field);
    assert.equal(crop.id, "fallow", crop.reason);
    assert.equal(crop.label, FALLOW_LABEL);
    assert.equal(crop.confidence, FALLOW_CONFIDENCE);
    assert.equal(crop.season, "this");
    assert.match(crop.reason, /green from (early|mid) April, greenest in late June, a slow fade over \d+ days/i);
    assert.match(crop.reason, /never back to bare soil/);
  }
  // The field drawn next to the farm never got down to the ready level: the
  // fade is counted to its latest pass.
  const slow = cropFeatures(KUPIANSK_FALLOW_SLOW);
  assert.equal(slow.harvest, null);
  assert.ok(slow.features.fadeDays >= FALLOW.minFadeDays);
  // A red-edge gap of 0.24 is inside the sunflower window: no rule names
  // it, and the reason says what was seen.
  const other = classifyCrop(KUPIANSK_UNKNOWN);
  assert.equal(other.id, "unknown");
  assert.match(other.reason, /^Green from early May, greenest in late June, a slow fade over \d+ days: not the pattern of a known crop; possibly fallow or grass$/);
});

test("fallow or grass needs all four signs, and never wins over a crop that fits", () => {
  for (const field of [IOWA_CORN, IOWA_SOYBEAN, IOWA_SOYBEAN_EARLY, MN_CANOLA, MT_WINTER_WHEAT, SD_SPRING_WHEAT, SD_SUNFLOWER]) {
    assert.equal(isFallowPattern(cropFeatures(field)), false, field.truth);
    assert.notEqual(classifyCrop(field).id, "fallow", field.truth);
  }
  const read = cropFeatures(KUPIANSK_FALLOW);
  assert.equal(isFallowPattern(read), true);
  assert.equal(isFallowPattern({ ...read, features: { ...read.features, reGap: 0.25 } }), false);
  assert.equal(isFallowPattern({ ...read, features: { ...read.features, lowSinceGreenUp: 0.2 } }), false);
  assert.equal(isFallowPattern({ ...read, features: { ...read.features, peakDoy: 200 } }), false);
  assert.equal(isFallowPattern({ ...read, features: { ...read.features, fadeDays: 30 } }), false);
  assert.equal(isFallowPattern({ ...read, source: "months" }), false);
  // A fallow field has no crop profile: no harvest rules are made for it.
  assert.equal(CROP_PROFILES.fallow, undefined);
});

test("grass or hay cut again and again is no field crop (real alfalfa, Ames 2026)", () => {
  // CDL 2025 alfalfa; read as "Winter cereal" before this rule.
  const alfalfa = passes(2026, "03-09:0.23 03-21:0.28 03-29:0.40 04-05:0.63 04-18:0.83 04-28:0.87 05-05:0.91 05-15:0.85 05-23:0.91 05-25:0.89 06-01:0.43 06-02:0.50 06-04:0.66 06-09:0.85 06-12:0.89 06-22:0.90 06-24:0.92 07-04:0.69 07-11:0.74 07-12:0.55 07-14:0.35 07-17:0.38 07-19:0.51 07-27:0.81 08-01:0.82 08-08:0.88 08-18:0.84 08-21:0.80 08-26:0.58 08-28:0.48 09-10:0.80 10-02:0.86 10-12:0.74 10-17:0.84");
  assert.equal(cutsAndRegrowth(alfalfa), 3);
  const crop = classifyCrop({ months: months("2025-05", Array(18).fill(0.6)), passes: alfalfa, peakMonth: 7, lat: 42.06 });
  assert.equal(crop.id, "unknown");
  assert.match(crop.reason, /grass or hay/);
  // A wheat harvest followed by a second crop is at most one cut; a row crop none.
  const doubleCrop = passes(2026, "04-01:0.4 04-20:0.7 05-10:0.85 05-30:0.8 06-15:0.55 06-25:0.3 07-05:0.25 07-25:0.45 08-10:0.7 08-25:0.82 09-10:0.75");
  assert.ok(cutsAndRegrowth(doubleCrop) <= 1);
  assert.equal(cutsAndRegrowth(IOWA_CORN.passes), 0);
  assert.equal(cutsAndRegrowth(IOWA_SOYBEAN.passes), 0);
});

// Real Pampas field (-34.90, -60.95), 2026-10-19: a summer crop peaking in
// January, harvested by July, and wheat now growing (0.82 on 2 October).
const PAMPAS_DOUBLE = "2025-10-02:0.21 2025-10-07:0.23 2025-11-01:0.17 2025-11-13:0.20 2025-11-26:0.28 2025-12-03:0.40 2025-12-06:0.43 2025-12-16:0.72 2025-12-21:0.81 2025-12-26:0.84 2025-12-31:0.84 2026-01-05:0.86 2026-01-12:0.81 2026-01-20:0.82 2026-01-25:0.80 2026-01-30:0.78 2026-02-24:0.58 2026-03-01:0.52 2026-03-16:0.37 2026-03-26:0.36 2026-04-10:0.38 2026-04-25:0.38 2026-05-10:0.38 2026-05-22:0.31 2026-05-30:0.25 2026-06-11:0.29 2026-06-19:0.33 2026-06-29:0.26 2026-07-14:0.17 2026-07-19:0.27 2026-07-29:0.35 2026-08-20:0.41 2026-08-23:0.47 2026-08-28:0.58 2026-09-07:0.54 2026-09-17:0.62 2026-09-22:0.68 2026-10-02:0.82"
  .split(" ")
  .map((item) => ({ date: item.slice(0, 10), ndvi: Number(item.slice(11)) }));

test("a crop harvested before the one now growing is LAST season's (southern double crop)", () => {
  // The crop now growing greened up only in late September (spring): not a
  // winter cereal, so the crop read is last summer's.
  const spring = [...PAMPAS_DOUBLE.filter((p) => p.date <= "2026-07-14"), ...passes(2026, "09-07:0.25 09-17:0.3 09-22:0.45 10-02:0.62")];
  const crop = classifyCrop({ months: [], passes: spring, peakMonth: 1, lat: -34.9 });
  assert.notEqual(crop.id, "unknown", crop.reason);
  assert.equal(crop.season, "last", crop.reason);
  assert.equal(method.harvestStage(PAMPAS_DOUBLE, "2026-10-19").cycleStart, "2026-05-30");
});

test("a winter cereal growing now in the southern spring is this season's crop (Pampas, real curves)", () => {
  // The synthetic double crop above, with the wheat green from late July.
  const now = classifyCrop({ months: [], passes: PAMPAS_DOUBLE, peakMonth: 1, lat: -34.9 });
  assert.equal(now.id, "winterCereal", now.reason);
  assert.equal(now.season, "this");
  assert.equal(now.confidence, "possible");
  assert.equal(now.inSeason, true);
  // Real fields near Chivilcoy, 2026-10-19: they read "Last season: Soybean" or "Unknown" before.
  for (const f of [PAMPAS_WHEAT_AFTER_SOY, PAMPAS_WHEAT_DOUBLE, PAMPAS_WHEAT_EARLY]) {
    const crop = classifyCrop(f);
    assert.deepEqual([crop.id, crop.season, crop.confidence], ["winterCereal", "this", "possible"], crop.reason);
    assert.match(crop.reason, /winter cereal/);
  }
  const read = inSeasonWinterCereal({ passes: PAMPAS_WHEAT_AFTER_SOY.passes, lat: -34.9 });
  assert.equal(read.highDate, "2026-10-02");
  assert.ok(read.greenSince >= "2026-08-01" && read.greenSince <= "2026-08-31", read.greenSince);
});

test("the in-season winter cereal rule stays out of other cases", () => {
  // The same curve in the north (October is autumn there): no.
  assert.equal(inSeasonWinterCereal({ passes: PAMPAS_WHEAT_AFTER_SOY.passes, lat: 34.9 }), null);
  // In the tropics: no.
  assert.equal(inSeasonWinterCereal({ passes: PAMPAS_WHEAT_AFTER_SOY.passes, lat: -10 }), null);
  // Harvested already (the curve stops after a fall to bare soil): no.
  const cut = [...PAMPAS_WHEAT_AFTER_SOY.passes, { date: "2026-10-10", ndvi: 0.22 }, { date: "2026-10-15", ndvi: 0.2 }];
  assert.equal(inSeasonWinterCereal({ passes: cut, lat: -34.9 }), null);
  // A northern winter wheat still green in April is one too.
  const april = passes(2026, "01-10:0.4 02-05:0.42 03-01:0.45 03-20:0.55 04-05:0.7 04-20:0.82");
  assert.ok(inSeasonWinterCereal({ passes: april, lat: 49.7 }));
  // A northern spring crop greening in May is not (not green over winter).
  assert.equal(inSeasonWinterCereal({ passes: passes(2026, "03-01:0.2 04-01:0.22 05-01:0.3 05-20:0.5 06-10:0.75"), lat: 49.7 }), null);
  // The real Iowa and Kupiansk fields in October: not touched.
  assert.notEqual(classifyCrop(IOWA_CORN).inSeason, true);
  assert.notEqual(classifyCrop(KUPIANSK_FALLOW).inSeason, true);
});

test("a field near the fallow pattern is flagged possiblyFallow", () => {
  const read = classifyCrop(KUPIANSK_UNKNOWN);
  if (read.id === "unknown" && /possibly fallow/.test(read.reason)) assert.equal(read.possiblyFallow, true);
  else assert.equal(read.possiblyFallow, undefined);
  assert.equal(classifyCrop(IOWA_CORN).possiblyFallow, undefined);
});

test("too early, or no crop at all: unknown with a reason", () => {
  const rising = passes(2026, "05-01:0.2 05-20:0.25 06-05:0.35 06-15:0.5 06-25:0.62");
  const early = classifyCrop({ months: [], passes: rising, peakMonth: 8, lat: 42 });
  assert.equal(early.id, "unknown");
  assert.match(early.reason, /greening up/);
  const bare = classifyCrop({ months: months("2025-04", Array(18).fill(0.2)), passes: [], peakMonth: 7, lat: 42 });
  assert.equal(bare.id, "unknown");
  assert.equal(classifyCrop().id, "unknown");
});

test("from the monthly record alone, the latest complete season is read, as LAST season's crop", () => {
  // No passes this season: the 2025 season of the Iowa corn field from its monthly NDVI.
  const crop = classifyCrop({ months: IOWA_CORN.months, peakMonth: 7, lat: IOWA_CORN.lat });
  assert.notEqual(crop.id, "unknown", crop.reason);
  assert.equal(crop.season, "last");
  // Last season's passes would be read from this season's (done) passes instead.
  assert.equal(classifyCrop(IOWA_CORN).season, "this");
});

test("the radar peak is taken near the NDVI peak, never from frozen winter ground", () => {
  const series = [{ date: "2026-02-10", vh: -13.2 }, { date: "2026-06-10", vh: -17 }, { date: "2026-06-22", vh: -16.2 }, { date: "2026-07-04", vh: -15.9 }, { date: "2026-07-16", vh: -16.4 }];
  assert.deepEqual(vhPeakNear(series, "2026-06-24"), { vhPeak: -15.9, vhPeakDate: "2026-07-04" });
  assert.deepEqual(vhPeakNear(series.slice(0, 2), "2026-06-24"), { vhPeak: null, vhPeakDate: null });
  assert.deepEqual(vhPeakNear(series, null), { vhPeak: null, vhPeakDate: null });
});

test("method.js re-exports the crop rules", () => {
  assert.equal(method.classifyCrop, classifyCrop);
  assert.equal(method.CROP_PROFILES, CROP_PROFILES);
  assert.equal(method.gddDaysToReady, gddDaysToReady);
});

test("winter crops count heat units from the start of spring at the earliest", () => {
  // Southern wheat green in June: counted from 1 September.
  assert.equal(gddStartDate({ crop: "winterCereal", greenUp: "2026-06-17", today: "2026-10-19", lat: -34.9 }), "2026-09-01");
  // Green-up after that: from the green-up.
  assert.equal(gddStartDate({ crop: "winterCereal", greenUp: "2026-09-10", today: "2026-10-19", lat: -34.9 }), "2026-09-10");
  // North: from 1 March; an autumn green-up is not counted through the winter.
  assert.equal(gddStartDate({ crop: "Winter wheat", greenUp: "2025-10-20", today: "2026-05-10", lat: 49.7 }), "2026-03-01");
  assert.equal(gddStartDate({ crop: "rapeseed", greenUp: "2026-03-20", today: "2026-05-10", lat: 49.7 }), "2026-03-20");
  // Crops counted from emergence: the green-up as it is.
  assert.equal(gddStartDate({ crop: "corn", greenUp: "2026-06-05", today: "2026-07-31", lat: 42 }), "2026-06-05");
  assert.equal(gddStartDate({ crop: "corn", greenUp: null, today: "2026-07-31", lat: 42 }), null);
});
