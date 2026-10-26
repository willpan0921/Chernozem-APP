// WHAT THIS FILE DOES
// Checks the growing-season rules (season.js) for the north, the south and
// the tropics. Run with: npm test
//
// WHO EDITS IT
// Whoever changes how seasons are chosen.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baselineWindows,
  climateBand,
  currentSeason,
  detectionWindows,
  imageryMonths,
  lastCompleteSeason,
  peakMonthFrom,
  sameWindowIn,
  seasonSpec,
  seasonCurveStart,
  windowLabel,
} from "./season.js";

const KUPIANSK = 49.7;
const IOWA = 42.0;
const MATO_GROSSO = -13.0; // tropics
const BUENOS_AIRES = -34.6;
const NAIROBI = -1.3;

test("bands", () => {
  assert.equal(climateBand(KUPIANSK), "north");
  assert.equal(climateBand(BUENOS_AIRES), "south");
  assert.equal(climateBand(MATO_GROSSO), "tropics");
  assert.equal(climateBand(NAIROBI), "tropics");
});

test("north: running season and last complete season", () => {
  assert.deepEqual(
    { start: currentSeason(IOWA, "2026-07-15").start, end: currentSeason(IOWA, "2026-07-15").end },
    { start: "2026-04-01", end: "2026-07-16" }
  );
  assert.deepEqual(lastCompleteSeason(KUPIANSK, "2026-10-18").start, "2026-04-01");
  assert.deepEqual(lastCompleteSeason(KUPIANSK, "2026-10-18").end, "2026-10-01");
  assert.equal(lastCompleteSeason(KUPIANSK, "2026-05-01").start, "2025-04-01");
  // In winter the current season is the one that just ended.
  assert.equal(currentSeason(KUPIANSK, "2026-12-10").running, false);
  assert.equal(currentSeason(KUPIANSK, "2026-12-10").start, "2026-04-01");
});

test("south: the season crosses the new year", () => {
  const running = currentSeason(BUENOS_AIRES, "2026-01-20");
  assert.equal(running.start, "2025-10-01");
  assert.equal(running.running, true);
  const last = lastCompleteSeason(BUENOS_AIRES, "2026-10-18");
  assert.deepEqual([last.start, last.end], ["2025-10-01", "2026-04-01"]);
  assert.equal(currentSeason(BUENOS_AIRES, "2026-10-18").start, "2026-10-01");
});

test("tropics: the last 12 months", () => {
  const last = lastCompleteSeason(NAIROBI, "2026-10-18");
  assert.deepEqual([last.start, last.end], ["2025-10-01", "2026-10-01"]);
  assert.equal(currentSeason(NAIROBI, "2026-10-18").start, "2025-11-01");
});

test("the same window in the normal years", () => {
  assert.deepEqual(sameWindowIn({ start: "2025-10-01", end: "2026-04-01" }, 2019), { start: "2019-10-01", end: "2020-04-01" });
  assert.deepEqual(baselineWindows({ start: "2026-04-01", end: "2026-10-01" }).map((w) => w.start), ["2019-04-01", "2020-04-01", "2021-04-01"]);
  assert.deepEqual(sameWindowIn({ start: "2024-02-29", end: "2024-03-10" }, 2021), { start: "2021-03-01", end: "2021-03-10" });
});

test("detection uses six windows from the last two seasons", () => {
  const windows = detectionWindows(BUENOS_AIRES, "2026-10-18");
  assert.equal(windows.length, 6);
  assert.equal(windows[0].start, "2025-10-01");
  assert.equal(windows[2].end, "2026-04-01");
  assert.equal(windows[3].start, "2024-10-01");
});

test("season curve start", () => {
  assert.equal(seasonCurveStart(KUPIANSK, "2026-10-18"), "2026-03-01");
  assert.equal(seasonCurveStart(BUENOS_AIRES, "2026-12-20"), "2026-09-01");
  assert.equal(seasonCurveStart(NAIROBI, "2026-10-18"), "2026-02-17");
});

test("imagery months and labels for Atlas runs: the last COMPLETE season", () => {
  // Every month of the 2026 northern season compares the 2025 season; the
  // 2026 one is used from October, once it is over.
  assert.deepEqual(imageryMonths(KUPIANSK, "2026-06"), { from: "2025-04", to: "2025-09" });
  assert.deepEqual(imageryMonths(KUPIANSK, "2026-09"), { from: "2025-04", to: "2025-09" });
  assert.deepEqual(imageryMonths(KUPIANSK, "2026-10"), { from: "2026-04", to: "2026-09" });
  assert.deepEqual(imageryMonths(KUPIANSK, "2026-12"), { from: "2026-04", to: "2026-09" });
  assert.deepEqual(imageryMonths(BUENOS_AIRES, "2026-02"), { from: "2024-10", to: "2025-03" });
  assert.deepEqual(imageryMonths(BUENOS_AIRES, "2026-04"), { from: "2025-10", to: "2026-03" });
  assert.equal(windowLabel({ from: "2026-04", to: "2026-09" }), "April to September 2026");
  assert.equal(windowLabel({ from: "2025-10", to: "2026-02" }), "October 2025 to February 2026");
});

test("tropics: windows are 12 months, never 13", () => {
  const months = imageryMonths(-0.3, "2026-09");
  assert.deepEqual(months, { from: "2025-09", to: "2026-08" });
  assert.equal(windowLabel(months), "September 2025 to August 2026");
  const running = currentSeason(-0.3, "2026-09-30");
  assert.equal(running.start, "2025-10-01");
  assert.equal(running.end, "2026-10-01");
});

test("normal-year windows end in 2019 to 2021, never in 2022", () => {
  // A window across the new year ends in each normal year.
  const south = baselineWindows({ start: "2025-10-01", end: "2026-04-01" });
  assert.deepEqual(south, [
    { start: "2018-10-01", end: "2019-04-01" },
    { start: "2019-10-01", end: "2020-04-01" },
    { start: "2020-10-01", end: "2021-04-01" },
  ]);
  // The tropics' 12 months (Atlas and Field): no overlap, last one ends in 2021.
  const tropicsAtlas = baselineWindows({ start: "2025-09-01", end: "2026-09-01" });
  assert.deepEqual(tropicsAtlas.map((w) => w.end), ["2019-09-01", "2020-09-01", "2021-09-01"]);
  const tropicsField = lastCompleteSeason(NAIROBI, "2026-10-18");
  const windows = baselineWindows(tropicsField);
  assert.deepEqual(windows.map((w) => [w.start, w.end]), [
    ["2018-10-01", "2019-10-01"],
    ["2019-10-01", "2020-10-01"],
    ["2020-10-01", "2021-10-01"],
  ]);
  for (const list of [south, tropicsAtlas, windows]) for (const w of list) assert.ok(w.end <= "2022-01-01", `${w.start}..${w.end}`);
  for (let i = 1; i < windows.length; i += 1) assert.ok(windows[i].start >= windows[i - 1].end, "the windows do not overlap");
  // A window inside one year is unchanged.
  assert.deepEqual(baselineWindows({ start: "2026-04-01", end: "2026-10-01" }).map((w) => w.end), ["2019-10-01", "2020-10-01", "2021-10-01"]);
  // A window ending on 1 January stays in its own year.
  assert.deepEqual(baselineWindows({ start: "2025-07-01", end: "2026-01-01" })[2], { start: "2021-07-01", end: "2022-01-01" });
});

test("the season from the place's own peak month", () => {
  // Peak in July: April to September (the north's band season).
  assert.deepEqual([seasonSpec(50, 7).startMonth, seasonSpec(50, 7).endMonth, seasonSpec(50, 7).label], [4, 10, "April to September"]);
  // Australia's wheat belt (winter rain), peak in August: May to October.
  const wheatBelt = lastCompleteSeason(-31.5, "2026-10-18", 8);
  assert.deepEqual([wheatBelt.start, wheatBelt.end, wheatBelt.label], ["2025-05-01", "2025-11-01", "May to October"]);
  // North India's rabi wheat, peak in February: November to April, across the new year.
  const rabi = lastCompleteSeason(30.9, "2026-10-18", 2);
  assert.deepEqual([rabi.start, rabi.end], ["2025-11-01", "2026-05-01"]);
  assert.deepEqual(imageryMonths(30.9, "2026-04", 2), { from: "2024-11", to: "2025-04" });
  assert.deepEqual(imageryMonths(30.9, "2026-05", 2), { from: "2025-11", to: "2026-04" });
  // The tropics with a clear season: 6 months, not the whole year.
  const matoGrosso = lastCompleteSeason(MATO_GROSSO, "2026-10-18", 2);
  assert.deepEqual([matoGrosso.start, matoGrosso.end], ["2025-11-01", "2026-05-01"]);
  assert.equal(seasonCurveStart(MATO_GROSSO, "2026-03-20", 2), "2025-10-01");
  // Detection windows follow the same season.
  assert.equal(detectionWindows(-31.5, "2026-10-18", 8)[0].start, "2025-05-01");
  // An unusable peak falls back to the band.
  assert.equal(seasonSpec(50, 13).startMonth, 4);
  assert.equal(seasonSpec(MATO_GROSSO, null).startMonth, null);
});

test("peak month from monthly NDVI", () => {
  const northern = [0.2, 0.2, 0.25, 0.35, 0.55, 0.75, 0.8, 0.7, 0.45, 0.3, 0.22, 0.2];
  assert.equal(peakMonthFrom(northern), 7);
  const winterWheat = [0.45, 0.6, 0.75, 0.7, 0.4, 0.2, 0.18, 0.18, 0.2, 0.22, 0.3, 0.38];
  assert.equal(peakMonthFrom(winterWheat), 3);
  // Across the new year.
  assert.equal(peakMonthFrom([0.8, 0.7, 0.5, 0.3, 0.2, 0.2, 0.2, 0.2, 0.25, 0.4, 0.6, 0.75]), 1);
  // No clear season (evergreen or irrigated all year) or too little data.
  assert.equal(peakMonthFrom(Array(12).fill(0.6).map((v, i) => v + 0.004 * i)), null);
  assert.equal(peakMonthFrom([0.8, null, null, null, null, null, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75]), null);
  assert.equal(peakMonthFrom(null), null);
});

test("a natural disaster's seasons: the season that contains its day (damageSeasons containing), and a drought's crop-loss season", async () => {
  const { damageSeasons, areaDamageSeasons, cropLossSeason, noLossSeasonWarning } = await import("./season.js");
  // Iowa, a flood on 2024-06-20 (peak July: April to September): the 2024
  // season counts from November 2024 for a disaster, never for a war.
  assert.deepEqual(damageSeasons(42.7, "2024-11-30", "2024-06-20", 7, { containing: true }), [{ start: "2024-04-01", end: "2024-10-01" }]);
  assert.deepEqual(damageSeasons(42.7, "2024-11-30", "2024-06-20", 7), []);
  assert.deepEqual(damageSeasons(42.7, "2025-11-30", "2024-06-20", 7, { containing: true }), [{ start: "2024-04-01", end: "2024-10-01" }, { start: "2025-04-01", end: "2025-10-01" }]);
  assert.deepEqual(damageSeasons(42.7, "2024-09-30", "2024-06-20", 7, { containing: true }), [], "not complete yet");
  // A day before its season: that season counts (it ends after the day).
  assert.deepEqual(damageSeasons(50, "2023-10-31", "2023-01-10", null, { containing: true }), [{ start: "2023-04-01", end: "2023-10-01" }]);
  assert.deepEqual(areaDamageSeasons([{ lat: 42.7, peakMonth: 7 }], "2024-11-30", "2024-06-20", { containing: true }), [[{ start: "2024-04-01", end: "2024-10-01" }]]);
  // cropLossSeason: northern summer crop (no peak month: April to September).
  assert.deepEqual(cropLossSeason(41.2, "2026-06-30", "2026-02-10", null), { start: "2026-04-01", end: "2026-07-01", running: true });
  // Winter wheat, greenest in May (February to July).
  assert.deepEqual(cropLossSeason(41.2, "2026-06-30", "2026-02-10", 5), { start: "2026-02-01", end: "2026-07-01", running: true });
  // The southern hemisphere (October to March, across the new year).
  assert.deepEqual(cropLossSeason(-34, "2026-01-31", "2025-11-01", null), { start: "2025-10-01", end: "2026-02-01", running: true });
  // The tropics (no peak month: the calendar year).
  assert.deepEqual(cropLossSeason(5, "2026-08-31", "2026-03-01", null), { start: "2026-01-01", end: "2026-09-01", running: true });
  // After the season: the last complete season, if it ends after the day.
  assert.deepEqual(cropLossSeason(41.2, "2026-11-30", "2026-02-10", null), { start: "2026-04-01", end: "2026-10-01", running: false });
  assert.equal(cropLossSeason(41.2, "2026-11-30", "2026-10-15", null), null, "a day after the season: nothing to measure yet");
  // Fewer than 60 days in: the season before, if it ends after the day; else nothing.
  assert.equal(cropLossSeason(41.2, "2026-05-15", "2026-04-10", null), null);
  assert.deepEqual(cropLossSeason(41.2, "2026-05-15", "2025-08-01", null), { start: "2025-04-01", end: "2025-10-01", running: false });
  assert.equal(noLossSeasonWarning("2026-04-10"), "No crop season since 2026-04-10 has run long enough to measure yet.");
});
