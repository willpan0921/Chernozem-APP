// WHAT THIS FILE DOES
// Tests the Earth Engine provider (gee.js) and the ACLED reader
// (acled.js): date windows, cell sizes, chunking, turning Earth Engine
// results into readings, alerts, error messages and CSV parsing. The whole
// analysis is also run end to end against a stand-in for Earth Engine
// (fake-ee.js), which checks what gee.js asks Earth Engine for (no null
// values, pixel sizes, chunks, dates) and gives back believable numbers.
// Requests that take minutes (time limits, the library's deadline) run on
// a mocked clock (t.mock.timers), and so does the Atlas giving way to the
// Field, its retry pauses included, and a failed month sending nothing
// more (the last tests).
// Real Earth Engine needs credentials; `npm run gee:check` does that.
//
// WHO EDITS IT
// Whoever changes gee.js or acled.js. Run with `npm test`.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  monthBounds,
  monthWindows,
  daysBetween,
  seasonGroups,
  cellBoxes,
  pickPass,
  shiftDays,
  daysBefore,
  lastDay,
  reduceScale,
  cellSquare,
  expandBboxKm,
  chunk,
  mapLimit,
  withTimeout,
  toReading,
  placeLabel,
  pickAlerts,
  alertDate,
  parseAdmin1Id,
  searchVariants,
  toPolygonal,
  explainGeeError,
  socToChernozem,
  blackSoilClassesFrom,
  BLACK_SOIL,
  BLACK_SOIL_SOURCE,
  setupProblems,
  isGeeConfigured,
  GeeError,
  geeProvider,
  createGeeProvider,
  clampWindow,
  chunkSizeFor,
  tileScaleFor,
  coarserScale,
  fixedScaleFor,
  SPLIT_MIN_CELLS,
  populationPlan,
  isTooMuchWorkError,
  isTransientError,
  isBusyError,
  FINE_SCALE_M,
  FIRE_GRID_M,
  RING_GRID_M,
  fightingFires,
  keepTokenFresh,
  evaluate,
  yieldStatus,
  resetYieldState,
  newFailure,
  markFailed,
  holdInteractive,
  checkChernozemAsset,
  blackSoilImage,
  YIELD,
  WAITING_MESSAGE,
  CHUNK_TIMEOUT_MS,
  COUNT_TIMEOUT_MS,
  EE_DEADLINE_MS,
  TRANSIENT_RETRY_MS,
  BUSY_RETRY_FACTOR,
  retryTransient,
  retryTooMuchWork,
  tooMuchWorkKind,
  seasonRadarImages,
  MEMORY_RETRY_MS,
  BUSY_RETRIES,
  isUnknownArgumentError,
  fromSentinel,
  cleanCounts,
  DATASETS,
  NO_WAR_WARNING,
  squareRuns,
  noFightingFiresWarning,
  farFromAnyFighting,
  MAX_CONFLICT_M,
} from "./gee.js";
import { createFakeEe } from "./fake-ee.js";
import { createFieldGeeProvider } from "./field-gee.js";
import { TEAM_PEACE_WARNING, addMonths, beforeWarWarning, buildRun } from "../runs.js";
import { teamConflict, warBoxes } from "../../src/config/conflicts.js";
import { scorePlaces } from "../../src/lib/atlas/scoring.js";
import { HEAVY_DAMAGE, METHOD_VERSION, heavyDamagePixel, radarPersistence, worstFireYear } from "../../src/lib/atlas/method.js";
import { FIGHTING_SEARCH_KM, accessMeaning, acledFileState, noFightingFound, noFightingNote, notMeasuredReason, warNote } from "../../src/lib/atlas/overview.js";
import { areaDamageSeasons } from "../../src/lib/season.js";
import { parseCsvRecords, parseCsv, parseAcledDate, toEvent, battlePoints, acledWindow, acledBattlesFor, acledStatus, ACLED_NO_BATTLES_WARNING } from "./acled.js";

// The count of interactive requests the Atlas gives way to is shared by the
// whole process (gee.js yieldState). Every test starts from nothing, so one
// that fails with a request still counted cannot make the next one fail.
beforeEach(() => resetYieldState());

// ---------- Date windows ----------

test("monthBounds gives the month with an exclusive end", () => {
  assert.deepEqual(monthBounds("2026-09"), { start: "2026-09-01", end: "2026-10-01" });
  assert.deepEqual(monthBounds("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
});

test("each month compares the last COMPLETE growing season with the same season of 2019-2021", () => {
  // June and September 2026 both use the 2025 season (2026's is not over).
  const jun = monthWindows("2026-06", "2026-10-18");
  const sep = monthWindows("2026-09", "2026-10-18");
  assert.deepEqual(sep.season, { start: "2025-04-01", end: "2025-10-01", from: "2025-04", to: "2025-09", label: "April to September", peakMonth: null });
  assert.deepEqual([jun.season.start, jun.season.end], [sep.season.start, sep.season.end]);
  assert.deepEqual(jun.baselines, sep.baselines);
  assert.deepEqual(sep.baselines, [
    { start: "2019-04-01", end: "2019-10-01" },
    { start: "2020-04-01", end: "2020-10-01" },
    { start: "2021-04-01", end: "2021-10-01" },
  ]);
  assert.deepEqual(sep.baseline, { start: "2021-04-01", end: "2021-10-01" });
  // October is the first month to use the 2026 season.
  const oct = monthWindows("2026-10", "2026-10-25");
  assert.deepEqual([oct.season.start, oct.season.end], ["2026-04-01", "2026-10-01"]);
  // The current month never uses a season that is not over by today.
  assert.equal(monthWindows("2026-09", "2026-09-15").season.start, "2025-04-01");
  // Radar and fire alerts: the month against the same month of 2019-2021,
  // cut short like the month.
  assert.deepEqual(monthWindows("2026-09", "2026-09-15").monthBaselines.map((b) => b.end), ["2019-09-15", "2020-09-15", "2021-09-15"]);
});

test("months outside the northern season use the last whole April-September season", () => {
  const feb = monthWindows("2026-02", "2026-10-18");
  assert.deepEqual([feb.season.start, feb.season.end, feb.season.from, feb.season.to], ["2025-04-01", "2025-10-01", "2025-04", "2025-09"]);
  assert.deepEqual(feb.baseline, { start: "2021-04-01", end: "2021-10-01" });
  const dec = monthWindows("2025-12", "2026-10-18", { lat: 49 });
  assert.equal(dec.season.start, "2025-04-01");
  assert.equal(dec.season.end, "2025-10-01");
});

test("southern hemisphere: the October-March season crosses the new year", () => {
  // The Pampas, January 2026: the 2025-26 season is not over, so the last
  // complete one (October 2024 to March 2025) is compared.
  const jan = monthWindows("2026-01", "2026-10-18", { lat: -34.9 });
  assert.deepEqual([jan.season.start, jan.season.end], ["2024-10-01", "2025-04-01"]);
  // Its normal years END in 2019, 2020 and 2021 (never in 2022).
  assert.deepEqual(jan.baselines, [
    { start: "2018-10-01", end: "2019-04-01" },
    { start: "2019-10-01", end: "2020-04-01" },
    { start: "2020-10-01", end: "2021-04-01" },
  ]);
  // August is winter there: the last whole season, October 2025 to March 2026.
  const aug = monthWindows("2026-08", "2026-10-18", { lat: -34.9 });
  assert.deepEqual([aug.season.start, aug.season.end, aug.season.from, aug.season.to], ["2025-10-01", "2026-04-01", "2025-10", "2026-03"]);
  assert.deepEqual(aug.baseline, { start: "2020-10-01", end: "2021-04-01" });
});

test("a place's own peak month sets its season (Australia's winter wheat)", () => {
  const w = monthWindows("2026-12", "2026-12-20", { lat: -31.5, peakMonth: 8 });
  assert.deepEqual([w.season.start, w.season.end, w.season.label], ["2026-05-01", "2026-11-01", "May to October"]);
  assert.deepEqual(w.baselines.map((b) => b.start), ["2019-05-01", "2020-05-01", "2021-05-01"]);
});

test("tropics: the season is the 12 whole months before the month", () => {
  const w = monthWindows("2026-08", "2026-10-18", { lat: -0.3 });
  assert.deepEqual([w.season.start, w.season.end], ["2025-08-01", "2026-08-01"]);
  assert.deepEqual(w.baselines.map((b) => b.end), ["2019-08-01", "2020-08-01", "2021-08-01"]);
  for (let i = 1; i < 3; i += 1) assert.ok(w.baselines[i].start >= w.baselines[i - 1].end, "no overlap");
});

test("cells are grouped by growing season, at most three groups", () => {
  const cells = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, lat: 48 + i * 0.1, lon: 30 }));
  const peaks = new Map(cells.map((cell, i) => [cell.id, i < 12 ? 6 : i < 17 ? 7 : i < 19 ? 3 : null]));
  const groups = seasonGroups(cells, peaks);
  assert.deepEqual(groups.map((g) => [g.peakMonth, g.cells.length]), [[6, 12], [7, 6], [3, 2]]);
  // A cell without a peak takes its band's season: July in the north.
  assert.ok(groups[1].cells.some((cell) => cell.id === "c19"));
  // Small groups join the nearest kept season.
  const few = seasonGroups(cells, new Map(cells.map((cell, i) => [cell.id, i === 0 ? 1 : 6])), { minShare: 0.1 });
  assert.deepEqual(few.map((g) => [g.peakMonth, g.cells.length]), [[6, 20]]);
  // The tropics without a clear season: all year.
  const tropics = seasonGroups([{ id: "t", lat: -0.3, lon: 36 }], new Map());
  assert.deepEqual(tropics.map((g) => [g.peakMonth, g.seasonLat]), [[null, 0]]);
});

test("the Earth Engine region comes from the cells, split at the 180 degree line", () => {
  // Russia-like: cells on both sides of 180°, and Kaliningrad apart.
  const cells = [
    { lat: 54.7, lon: 20.5 },
    { lat: 55.7, lon: 37.5 },
    { lat: 55.7, lon: 38.5 },
    { lat: 64.0, lon: 179.5 },
    { lat: 65.0, lon: -179.5 },
    { lat: 66.0, lon: -172.5 },
  ];
  const boxes = cellBoxes(cells, 1);
  assert.equal(boxes.length, 5);
  for (const [west, , east] of boxes) assert.ok(east - west < 180, `${west}..${east} is not a band around the globe`);
  assert.deepEqual(boxes[0], [-180, 64.5, -179, 65.5]);
  assert.deepEqual(cellBoxes([{ lat: 50, lon: 30 }, { lat: 50.5, lon: 30.5 }], 0.5), [[29.75, 49.75, 30.75, 50.75]]);
  // Many islands: at most MAX_BOXES boxes.
  const islands = Array.from({ length: 30 }, (_, i) => ({ lat: 0, lon: 100 + i * 3 }));
  assert.equal(cellBoxes(islands, 0.5).length, 8);
});

test("radar compares one orbit direction: the one with the most passes in both windows", () => {
  assert.equal(pickPass({ ASCENDING: 10, DESCENDING: 2 }, { ASCENDING: 30, DESCENDING: 40 }), "ASCENDING");
  assert.equal(pickPass({ ASCENDING: 0, DESCENDING: 5 }, { ASCENDING: 30, DESCENDING: 1 }), "DESCENDING");
  assert.equal(pickPass({ ASCENDING: 5, DESCENDING: 0 }, { ASCENDING: 0, DESCENDING: 9 }), null);
});

test("damage window: from the war's start inside a known war, else the last two years", () => {
  const ukraine = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const war = monthWindows("2026-01", "2026-10-18", { lat: 49, conflict: ukraine });
  assert.deepEqual(war.damage, { start: "2022-02-24", end: "2026-02-01" });
  assert.deepEqual(war.conflict, ukraine);
  // Radar alerts: new change in a war (the 3 months before), the same month
  // of 2019-2021 at peace.
  assert.deepEqual(war.radarBefore, [{ start: "2025-10-01", end: "2026-01-01" }]);
  const peace = monthWindows("2026-01", "2026-10-18", { lat: 42 });
  assert.deepEqual(peace.damage, { start: "2024-01-31", end: "2026-02-01" });
  assert.equal(peace.conflict, null);
  assert.deepEqual(peace.radarBefore.map((w) => w.start), ["2019-01-01", "2020-01-01", "2021-01-01"]);
  // Fires count above the place's normal 2019-2021 count, war year by war
  // year (method.js fireYears): at war from the day the war began, the year
  // not over yet up to the end of the month; at peace two whole years back
  // from the end of the month.
  assert.deepEqual(peace.fireNormal, { start: "2019-01-01", end: "2022-01-01" });
  assert.deepEqual(war.fireYears.map((y) => `${y.start}..${y.end}${y.part ? " part" : ""}`), [
    "2022-02-24..2023-02-24",
    "2023-02-24..2024-02-24",
    "2024-02-24..2025-02-24",
    "2025-02-24..2026-02-01 part",
  ]);
  assert.deepEqual(peace.fireYears.map((y) => `${y.start}..${y.end}`), ["2024-02-01..2025-02-01", "2025-02-01..2026-02-01"]);
  // The damage radar: every complete war season (April to September 2022
  // to 2025 in January 2026), against the same season of 2019-2021.
  assert.deepEqual(war.radarSeasons.map((w) => w.start), ["2022-04-01", "2023-04-01", "2024-04-01", "2025-04-01"]);
  assert.deepEqual(war.radarSeasonBaselines.map((w) => w.start), ["2019-04-01", "2020-04-01", "2021-04-01"]);
  assert.deepEqual(peace.radarSeasons, [{ start: "2024-04-01", end: "2024-10-01" }, { start: "2025-04-01", end: "2025-10-01" }]);
  // Before the war began there is nothing to count.
  assert.equal(monthWindows("2021-06", "2026-10-18", { conflict: ukraine }).damage, null);
  assert.deepEqual(monthWindows("2022-02", "2026-10-18", { conflict: ukraine }).damage, { start: "2022-02-24", end: "2022-03-01" });
});

test("radar, fire and night-light windows", () => {
  const w = monthWindows("2026-01");
  assert.deepEqual(w.month, { start: "2026-01-01", end: "2026-02-01" });
  assert.deepEqual(w.monthBaselines, [
    { start: "2019-01-01", end: "2019-02-01" },
    { start: "2020-01-01", end: "2020-02-01" },
    { start: "2021-01-01", end: "2021-02-01" },
  ]);
  // Distance to fighting: the last 12 months against the same 12 months of 2019-2021.
  assert.deepEqual(w.lastYear, { start: "2025-02-01", end: "2026-02-01" });
  assert.deepEqual(w.fireBaselines, [
    { start: "2018-02-01", end: "2019-02-01" },
    { start: "2019-02-01", end: "2020-02-01" },
    { start: "2020-02-01", end: "2021-02-01" },
  ]);
  assert.deepEqual(w.viirsSearch, { start: "2025-08-01", end: "2026-02-01" });
});

test("in a war's first year the fires that stand in for fighting start on the day it began, against the same days of 2019-2021 (a war the team set, and one of the list)", () => {
  // A war the team set from 1 June 2026.
  const team = { id: "area-kenya", name: "War (set for this area)", since: "2026-06-01", source: "area" };
  const june = monthWindows("2026-06", TODAY, { lat: 0.5, conflict: team });
  assert.deepEqual(june.lastYear, { start: "2026-06-01", end: "2026-07-01" });
  assert.equal(june.fightingSince, "2026-06-01");
  assert.deepEqual(june.fireBaselines, [
    { start: "2019-06-01", end: "2019-07-01" },
    { start: "2020-06-01", end: "2020-07-01" },
    { start: "2021-06-01", end: "2021-07-01" },
  ]);
  const september = monthWindows("2026-09", TODAY, { lat: 0.5, conflict: team });
  assert.deepEqual(september.lastYear, { start: "2026-06-01", end: "2026-10-01" });
  assert.deepEqual(september.fireBaselines.map((w) => `${w.start}..${w.end}`), ["2019-06-01..2019-10-01", "2020-06-01..2020-10-01", "2021-06-01..2021-10-01"]);
  // A month not over yet: up to today, on the same days of each normal year.
  const october = monthWindows("2026-10", TODAY, { lat: 0.5, conflict: team });
  assert.deepEqual(october.lastYear, { start: "2026-06-01", end: "2026-10-18" });
  assert.deepEqual(october.fireBaselines.at(-1), { start: "2021-06-01", end: "2021-10-18" });
  // Before the war began, and at peace: no war's first day (and no fires
  // stand in for fighting: analyze measures no distance then).
  assert.equal(monthWindows("2026-05", TODAY, { lat: 0.5, conflict: team }).fightingSince, null);
  assert.equal(monthWindows("2026-09", TODAY, { lat: 0.5 }).fightingSince, null);

  // The Cambodia–Thailand border conflict (since 24 July 2025), for an area
  // analyzed now: December 2025 reads the fires since the war began, not
  // those since 1 January 2025.
  const thai = { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24" };
  const december = monthWindows("2025-12", TODAY, { lat: 14.4, conflict: thai });
  assert.deepEqual(december.lastYear, { start: "2025-07-24", end: "2026-01-01" });
  assert.deepEqual(december.fireBaselines, [
    { start: "2018-07-24", end: "2019-01-01" },
    { start: "2019-07-24", end: "2020-01-01" },
    { start: "2020-07-24", end: "2021-01-01" },
  ]);
  assert.deepEqual(monthWindows("2026-06", TODAY, { lat: 14.4, conflict: thai }).lastYear, { start: "2025-07-24", end: "2026-07-01" });
  // Once the war is a year old, the 12 months up to the end of the month
  // again, as before.
  const july = monthWindows("2026-07", TODAY, { lat: 14.4, conflict: thai });
  assert.deepEqual(july.lastYear, { start: "2025-08-01", end: "2026-08-01" });
  assert.equal(july.fightingSince, null);
  assert.deepEqual(july.fireBaselines.map((w) => w.start), ["2018-08-01", "2019-08-01", "2020-08-01"]);
});

test("day arithmetic", () => {
  assert.equal(shiftDays("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDays("2024-03-01", -1), "2024-02-29");
  assert.equal(lastDay("2026-09"), "2026-09-30");
  assert.equal(lastDay("2026-02"), "2026-02-28");
  const w = daysBefore(Date.UTC(2026, 8, 20, 13), 30);
  assert.deepEqual(w, { start: "2026-08-22", end: "2026-09-21", last: "2026-09-20" });
});

// ---------- Sizes ----------

test("reduceScale is about 20 pixels per cell, between 10 m and 1 km", () => {
  // Ukraine-sized cells (0.25° ≈ 18 km wide at 49° N) -> ~913 m.
  assert.equal(reduceScale(0.25, 49), 913);
  // Bigger cells hit the 1 km cap.
  assert.equal(reduceScale(0.5, 49), 1000);
  // 0.05° at 49° N is ~3.65 km wide -> ~183 m.
  assert.equal(reduceScale(0.05, 49), 183);
  // A farm cell (0.0005°) is ~36 m wide -> floor of 10 m.
  assert.equal(reduceScale(0.0005, 49), 10);
});

test("cellSquare is centred on the cell", () => {
  assert.deepEqual(cellSquare(49.74, 37.54, 0.01), [37.535, 49.735, 37.545, 49.745]);
});

test("expandBboxKm grows the box and stays on the globe", () => {
  const [w, s, e, n] = expandBboxKm([30, 48, 31, 49], 300);
  assert.ok(Math.abs(s - (48 - 300 / 111.32)) < 1e-9);
  assert.ok(Math.abs(n - (49 + 300 / 111.32)) < 1e-9);
  assert.ok(w < 30 - 2.7 && e > 31 + 2.7);
  assert.deepEqual(expandBboxKm([-179.9, -89, 179.9, 89], 300), [-180, -90, 180, 90]);
});

test("chunk splits into pieces of at most 250", () => {
  const cells = Array.from({ length: 600 }, (_, i) => i);
  const parts = chunk(cells, 250);
  assert.deepEqual(parts.map((p) => p.length), [250, 250, 100]);
  assert.equal(parts[2][0], 500);
  assert.deepEqual(chunk([], 250), []);
});

test("mapLimit keeps order and the limit", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([30, 10, 20, 5], 2, async (ms, i) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, ms));
    running -= 1;
    return i * 10;
  });
  assert.deepEqual(out, [0, 10, 20, 30]);
  assert.equal(peak, 2);
});

test("mapLimit starts no further item once one has failed; those running finish; the first error is thrown", async () => {
  const started = [];
  const finished = [];
  // Item 0 fails after 5 ms while item 1 runs for 30 ms; before, the other
  // runner went on with items 2, 3 and 4 after item 1.
  const run = mapLimit([5, 30, 1, 1, 1], 2, async (ms, i) => {
    started.push(i);
    await new Promise((r) => setTimeout(r, ms));
    if (i === 0) throw new Error("item 0 failed");
    finished.push(i);
  });
  await assert.rejects(run, /item 0 failed/);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(started, [0, 1], "nothing new after the first failure");
  assert.deepEqual(finished, [1], "the item running then finished");
  // Two failures: the first one is thrown.
  const both = mapLimit([5, 20, 1], 2, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms));
    throw new Error(`item ${i} failed`);
  });
  await assert.rejects(both, /item 0 failed/);
  await new Promise((r) => setTimeout(r, 40));
});

test("withTimeout rejects with a clear GeeError", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, "Measuring cells"), (error) => {
    assert.ok(error instanceof GeeError);
    assert.equal(error.code, "timeout");
    assert.match(error.message, /Measuring cells took longer than 0 seconds/);
    return true;
  });
  assert.equal(await withTimeout(Promise.resolve(7), 1000), 7);
});

// ---------- Readings ----------

test("toReading maps Earth Engine means and sums to the raw reading", () => {
  const cell = { id: "r1c2", lat: 49.74, lon: 37.54 };
  const reading = toReading(
    cell,
    { id: "r1c2", chernozemCrop: 0.81234, chernozemAll: 0.5, cropland: 0.7, chiDrop: 0.123456, radarDb: 1.2345, heavy: 0.3, firesWar: 0.12, conflictM: 15500, lights: 2.5 },
    { id: "r1c2", people: 1234.6 },
    { cellSizeDeg: 0.01, names: { admin1: "Kharkivs'ka", admin2: "Chuhuivs'kyi" } },
  );
  assert.deepEqual(reading, {
    id: "r1c2",
    chernozem: 0.8123,
    croplandShare: 0.7,
    firesPer100Km2: 12,
    chiDrop: 0.1235,
    radarDb: 1.23,
    conflictKm: 15.5,
    popPerKm2: Math.round((1234.6 / ((0.01 * 111.32) ** 2 * Math.cos((49.74 * Math.PI) / 180))) * 100) / 100,
    lights: 2.5,
    heavyShare: 0.3,
    population: 1235,
    admin1: "Kharkivs'ka",
    admin2: "Chuhuivs'kyi",
  });
});

test("toReading fills gaps safely", () => {
  const reading = toReading({ id: "a", lat: 0, lon: 0 }, undefined, undefined, { cellSizeDeg: 0.1 });
  assert.equal(reading.chernozem, 0);
  assert.equal(reading.croplandShare, 0);
  assert.equal(reading.chiDrop, null); // no imagery: unknown, not "no damage"
  assert.equal(reading.conflictKm, 300);
  assert.equal(reading.population, 0);
  assert.equal(reading.heavyShare, 0);
  assert.equal("admin1" in reading, false);
  // No cropland: chernozem from the land; values kept in range.
  const r2 = toReading({ id: "b", lat: 0, lon: 0 }, { chernozemAll: 1.4, cropland: -0.1, heavy: 2, sum: 10 }, { sum: 10 }, { cellSizeDeg: 0.1 });
  assert.equal(r2.chernozem, 1);
  assert.equal(r2.croplandShare, 0);
  assert.equal(r2.heavyShare, 1);
  assert.equal(r2.population, 10);
});

test("socToChernozem uses SoilGrids dg/kg and the notebook's (SOC-10)/50 scale", () => {
  assert.equal(socToChernozem(100), 0); // 10 g/kg
  assert.ok(Math.abs(socToChernozem(400) - 0.6) < 1e-9); // 40 g/kg
  assert.equal(socToChernozem(1000), 1); // 100 g/kg, capped
  assert.equal(socToChernozem(NaN), null);
});

test("black soil = Mollisol great groups except the cold and bleached ones", () => {
  const names = ["NODATA", "Hapludalfs", "Argialbolls", "Argiaquolls", "Argicryolls", "Cryaquolls", "Cryrendolls", "Hapludolls", "Haplustolls", "Cryoborolls", "Paleborolls"];
  const values = [0, 18, 268, 269, 270, 279, 280, 290, 291, 309, 312];
  assert.deepEqual(blackSoilClassesFrom({ grtgroup_class_names: names, grtgroup_class_values: values }), [269, 280, 290, 291, 312]);
  assert.equal(blackSoilClassesFrom({}), null);
  assert.equal(blackSoilClassesFrom({ grtgroup_class_names: ["a"], grtgroup_class_values: [1, 2] }), null);
  // The built-in list: 31 classes, none of the excluded ones.
  assert.equal(BLACK_SOIL.classes.length, 31);
  for (const dropped of [268, 270, 275, 279, 287, 299, 309]) assert.ok(!BLACK_SOIL.classes.includes(dropped), `${dropped}`);
});

// ---------- Alerts ----------

const cand = (id, lat, lon, extra) => ({ id, lat, lon, radarShare: 0, radarKm2: 0, fires: 0, ...extra });

test("pickAlerts groups touching cells, alternates kinds, keeps 6", () => {
  const size = 0.1;
  const candidates = [
    cand("r0c0", 50, 30, { radarShare: 0.4, radarKm2: 30 }),
    cand("r0c1", 50, 30.1, { radarShare: 0.2, radarKm2: 15 }), // touches r0c0 -> same alert
    cand("r5c5", 49.5, 30.5, { radarShare: 0.1, radarKm2: 8, admin1: "Kyivs'ka", admin2: "Bucha" }),
    cand("r9c9", 49.1, 30.9, { radarShare: 0.01, radarKm2: 1 }), // under 5%: no alert
    ...Array.from({ length: 6 }, (_, i) => cand(`f${i}`, 40 + i, 20, { fires: 10 - i })),
  ];
  const alerts = pickAlerts(candidates, { cellSizeDeg: size, month: "2026-09" });
  assert.equal(alerts.length, 6);
  assert.deepEqual(alerts.map((a) => a.kind), ["radar", "fire", "radar", "fire", "fire", "fire"]);
  assert.deepEqual(alerts[0].cellIds, ["r0c0", "r0c1"]);
  assert.equal(alerts[0].magnitude, 45);
  assert.equal(alerts[0].unit, "km² changed");
  assert.equal(alerts[0].date, "2026-09-30");
  assert.equal(alerts[0].place, "50.00° N, 30.00° E");
  assert.equal(alerts[2].place, "Bucha, Kyivs'ka");
  assert.equal(alerts[1].unit, "detections");
  assert.equal(alerts[1].magnitude, 10);
  assert.ok(alerts.every((a) => a.id && Array.isArray(a.cellIds)));
});

test("pickAlerts: a change that is everywhere in a large area is not an alert; a cell well above it is", () => {
  // 10 x 10 cells that all changed about 30% (a late harvest across the
  // region), and one that changed 90%.
  const cells = [];
  for (let r = 0; r < 10; r += 1) for (let c = 0; c < 10; c += 1) cells.push(cand(`r${r}c${c}`, 50 - r * 0.1, 30 + c * 0.1, { radarShare: 0.28 + ((r + c) % 3) * 0.02, radarKm2: 20 }));
  cells[55] = { ...cells[55], radarShare: 0.9, radarKm2: 60 };
  const alerts = pickAlerts(cells, { cellSizeDeg: 0.1, month: "2026-09" });
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].cellIds, ["r5c5"]);
  assert.equal(alerts[0].magnitude, 60);
});

test("pickAlerts: one alert covers at most a 5 x 5 block around its strongest cell", () => {
  // A line of 12 touching cells that all changed a lot (a front line).
  const line = Array.from({ length: 12 }, (_, i) => cand(`c${i}`, 48, 35 + i * 0.1, { radarShare: i === 5 ? 0.9 : 0.6, radarKm2: i === 5 ? 60 : 40 }));
  const alerts = pickAlerts(line, { cellSizeDeg: 0.1, month: "2026-09" });
  assert.deepEqual(alerts[0].cellIds.sort(), ["c3", "c4", "c5", "c6", "c7"]);
  assert.ok(alerts.every((a) => a.cellIds.length <= 25));
  assert.equal(alerts.reduce((n, a) => n + a.cellIds.length, 0), 12, "every changed cell is in one alert");
});

test("pickAlerts with nothing notable gives no alerts", () => {
  assert.deepEqual(pickAlerts([cand("a", 1, 1, { fires: 0.3 })], { cellSizeDeg: 0.1, month: "2026-09" }), []);
});

test("alertDate uses what Earth Engine found, else the month's last day", () => {
  const radar = { kind: "radar" };
  const fire = { kind: "fire" };
  assert.equal(alertDate(radar, { radarLast: Date.UTC(2026, 8, 14, 4) }, "2026-09"), "2026-09-14");
  assert.equal(alertDate(radar, { radarLast: Date.UTC(2026, 7, 31) }, "2026-09"), "2026-09-30");
  assert.equal(alertDate(fire, { fireDay: 7 }, "2026-09"), "2026-09-07");
  assert.equal(alertDate(fire, { fireDay: 31 }, "2026-09"), "2026-09-30");
  assert.equal(alertDate(fire, null, "2026-02"), "2026-02-28");
});

test("placeLabel", () => {
  assert.equal(placeLabel({ admin1: "A", admin2: "B", lat: 1, lon: 2 }), "B, A");
  assert.equal(placeLabel({ admin1: "A", lat: 1, lon: 2 }), "A");
  assert.equal(placeLabel({ lat: -1.5, lon: -60.25 }), "1.50° S, 60.25° W");
});

// ---------- Regions ----------

test("parseAdmin1Id and searchVariants", () => {
  assert.equal(parseAdmin1Id("gaul1-1234"), 1234);
  assert.equal(parseAdmin1Id(55), 55);
  assert.equal(parseAdmin1Id("ukraine"), null);
  assert.equal(parseAdmin1Id("gaul1-12; drop"), null);
  assert.deepEqual(searchVariants("kharkiv"), ["kharkiv", "Kharkiv", "KHARKIV"]);
  assert.deepEqual(searchVariants("ivano-frankivs'ka"), ["ivano-frankivs'ka", "Ivano-Frankivs'Ka", "IVANO-FRANKIVS'KA"]);
});

test("toPolygonal flattens a GeometryCollection", () => {
  const square = [[[0, 0], [1, 0], [1, 1], [0, 0]]];
  assert.deepEqual(toPolygonal({ type: "Polygon", coordinates: square }), { type: "Polygon", coordinates: square });
  assert.deepEqual(toPolygonal({ type: "GeometryCollection", geometries: [{ type: "Polygon", coordinates: square }, { type: "LineString", coordinates: [] }] }), {
    type: "Polygon",
    coordinates: square,
  });
  assert.deepEqual(
    toPolygonal({ type: "GeometryCollection", geometries: [{ type: "Polygon", coordinates: square }, { type: "MultiPolygon", coordinates: [square, square] }] }).coordinates.length,
    3,
  );
  assert.equal(toPolygonal({ type: "GeometryCollection", geometries: [] }), null);
  assert.equal(toPolygonal(null), null);
});

// ---------- Errors ----------

test("explainGeeError turns Google errors into clear advice", () => {
  const ctx = { projectId: "my-proj", clientEmail: "atlas@my-proj.iam.gserviceaccount.com", asset: "projects/zhaobo/assets/chernozem_wrb_ukraine" };
  const code = (message) => explainGeeError(new Error(message), ctx).code;
  assert.equal(code("Earth Engine API has not been used in project 123 before or it is disabled. Enable it by visiting https://..."), "api_disabled");
  assert.equal(code("Not signed up for Earth Engine or project is not registered. Visit https://developers.google.com/earth-engine/guides/access"), "not_registered");
  assert.equal(code("Project 'projects/my-proj' has not been registered for use with Earth Engine."), "not_registered");
  assert.equal(code("Image.load: Image asset 'projects/zhaobo/assets/chernozem_wrb_ukraine' not found (does not exist or caller does not have access)."), "asset_not_found");
  assert.equal(code("Asset 'projects/zhaobo/assets/chernozem_wrb_ukraine' does not exist or doesn't allow this operation."), "asset_not_found");
  assert.equal(code("invalid_grant: Invalid JWT Signature."), "bad_key");
  assert.equal(code("error:1E08010C:DECODER routines::unsupported"), "bad_key");
  assert.equal(code("Caller does not have required permission to use project my-proj. Grant the caller the roles/serviceusage.serviceUsageConsumer role"), "no_permission");
  // Earth Engine too busy right now is "busy" (a job skips the month and
  // goes on: jobs.js); a real quota is "quota" (a job stops).
  assert.equal(code("Too many concurrent aggregations."), "busy");
  assert.equal(code("Earth Engine capacity exceeded."), "busy");
  assert.match(explainGeeError(new Error("Too many concurrent aggregations."), { ...ctx, what: "Measuring 98 cells" }).message, /^Measuring 98 cells: Earth Engine was too busy \("Too many concurrent aggregations\."\)\. Wait a few minutes and try again\.$/);
  assert.equal(code("Quota exceeded for quota metric 'Requests' and limit 'Requests per minute'."), "quota");
  assert.equal(code("Too many requests"), "quota");
  assert.equal(code("Server returned HTTP code: 429"), "quota");
  assert.equal(code("Earth Engine memory capacity exceeded."), "gee_error", "too much work, not busy");
  assert.equal(code("User memory limit exceeded."), "too_big");
  assert.equal(code("Computation timed out."), "too_big");
  assert.equal(code("getaddrinfo ENOTFOUND earthengine.googleapis.com"), "network");
  assert.equal(code("Something odd"), "gee_error");
  const message = explainGeeError(new Error("Not signed up for Earth Engine"), ctx).message;
  assert.match(message, /my-proj/);
  assert.match(message, /code\.earthengine\.google\.com\/register/);
  assert.match(explainGeeError("caller does not have permission", ctx).message, /atlas@my-proj/);
  const already = new GeeError("timeout", "x");
  assert.equal(explainGeeError(already), already);
});

// ---------- Setup checks ----------

test("setupProblems names exactly what is missing", () => {
  const base = { geeProjectId: null, geeCredentials: null, geeCredentialsError: null, geeDisabled: false };
  assert.deepEqual(setupProblems(base), ["Missing in .env: GEE_PROJECT_ID, GEE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS."]);
  assert.equal(isGeeConfigured(base), false);
  const ready = { ...base, geeProjectId: "p", geeCredentials: { client_email: "a@b", private_key: "k" } };
  assert.deepEqual(setupProblems(ready), []);
  assert.equal(isGeeConfigured(ready), true);
  assert.equal(isGeeConfigured({ ...ready, geeDisabled: true }), false);
  const badFile = { ...base, geeProjectId: "p", geeCredentialsError: "GOOGLE_APPLICATION_CREDENTIALS points to x.json, but that file cannot be read." };
  assert.deepEqual(setupProblems(badFile), [badFile.geeCredentialsError]);
});

test("the provider has the shared interface", () => {
  assert.equal(geeProvider.id, "gee");
  for (const name of ["status", "analyze", "searchAdmin1", "admin1Boundary"]) assert.equal(typeof geeProvider[name], "function");
});

// ---------- ACLED ----------

test("parseCsvRecords handles quotes, commas and line breaks", () => {
  const text = '﻿a,b,c\r\n1,"x, y","say ""hi""\nthere"\n2,,3\n\n';
  assert.deepEqual(parseCsvRecords(text), [
    ["a", "b", "c"],
    ["1", "x, y", 'say "hi"\nthere'],
    ["2", "", "3"],
  ]);
  assert.deepEqual(parseCsv("EVENT_TYPE,Latitude\nBattles,48.1"), [{ event_type: "Battles", latitude: "48.1" }]);
  assert.deepEqual(parseCsv(""), []);
});

test("parseAcledDate reads ACLED's date styles", () => {
  assert.equal(parseAcledDate("2024-03-15"), "2024-03-15");
  assert.equal(parseAcledDate("15 March 2024"), "2024-03-15");
  assert.equal(parseAcledDate("5-Sep-2025"), "2025-09-05");
  assert.equal(parseAcledDate("3/15/2024"), "2024-03-15");
  assert.equal(parseAcledDate("soon"), null);
  assert.equal(parseAcledDate(""), null);
});

test("toEvent skips rows without a position", () => {
  assert.equal(toEvent({ latitude: "", longitude: "30" }), null);
  assert.equal(toEvent({ latitude: "95", longitude: "30" }), null);
  assert.deepEqual(toEvent({ event_date: "2025-01-02", year: "2025", event_type: "Battles", latitude: "48.5", longitude: "37.9", fatalities: "3", country: "Ukraine" }), {
    date: "2025-01-02",
    year: 2025,
    type: "Battles",
    lat: 48.5,
    lon: 37.9,
    fatalities: 3,
    country: "Ukraine",
  });
});

test("acledWindow is the 12 months ending with the month", () => {
  assert.deepEqual(acledWindow("2026-09"), { from: "2025-10-01", to: "2026-09-30" });
  assert.deepEqual(acledWindow("2026-01"), { from: "2025-02-01", to: "2026-01-31" });
});

test("battlePoints keeps recent battles near the area, in sustained squares", () => {
  const battle = (lat, lon, date, type = "Battles") => ({ date, year: Number(date.slice(0, 4)), type, lat, lon, fatalities: 0 });
  const events = [
    // 6 battles in one ~5 km square near the area, inside the window.
    ...Array.from({ length: 6 }, (_, i) => battle(48.01 + i * 0.001, 37.01, "2026-05-0" + (i + 1))),
    // 2 battles elsewhere: too few to count as the front.
    battle(48.5, 36.5, "2026-06-01"),
    battle(48.5, 36.5, "2026-06-02"),
    // Strikes, too old, too far: ignored.
    battle(48.01, 37.01, "2026-05-01", "Explosions/Remote violence"),
    battle(48.01, 37.01, "2024-01-01"),
    battle(10, 10, "2026-05-01"),
  ];
  const result = battlePoints(events, { bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.equal(result.battles, 8);
  assert.equal(result.squares, 1);
  assert.equal(result.relaxed, false);
  assert.deepEqual(result.points, [[37, 48]]);
  // With only quiet squares, all battle squares are used.
  const quiet = battlePoints(events.slice(6, 8), { bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.equal(quiet.relaxed, true);
  assert.deepEqual(quiet.points, [[36.5, 48.5]]);
});

test("acledBattlesFor reads a file and never throws", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acled-"));
  const file = path.join(dir, "acled.csv");
  const rows = Array.from({ length: 5 }, (_, i) => `2026-08-0${i + 1},2026,Battles,"Notes, with comma",48.00,37.00,1,Ukraine`);
  fs.writeFileSync(file, ["event_date,year,event_type,notes,latitude,longitude,fatalities,country", ...rows].join("\n"));
  const found = acledBattlesFor({ csvPath: file, bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.equal(found.source, "acled");
  assert.deepEqual(found.points, [[37, 48]]);
  assert.equal(found.warning, null);
  assert.equal(found.status, "ok");
  assert.equal(acledStatus(file).ok, true);

  const none = acledBattlesFor({ csvPath: file, bbox: [-60, -10, -50, 0], month: "2026-09" });
  assert.deepEqual(none.points, []);
  assert.match(none.warning, /no battles within 300 km/);
  assert.equal(none.status, "no-battles");

  const missing = acledBattlesFor({ csvPath: path.join(dir, "nope.csv"), bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.match(missing.warning, /ACLED file not found/);
  assert.equal(missing.status, "unusable");
  assert.deepEqual(acledBattlesFor({ csvPath: null, bbox: [0, 0, 1, 1], month: "2026-09" }), { points: [], warning: null, source: null, status: "none" });

  const wrong = path.join(dir, "wrong.csv");
  fs.writeFileSync(wrong, "name,value\na,1\n");
  const notAcled = acledBattlesFor({ csvPath: wrong, bbox: [0, 0, 1, 1], month: "2026-09" });
  assert.match(notAcled.warning, /does not look like an ACLED export/);
  assert.equal(notAcled.status, "unusable");
  // A file that cannot be read at all (here a folder) is the ACLED file's
  // problem too, never a bare system message.
  const folder = acledBattlesFor({ csvPath: dir, bbox: [0, 0, 1, 1], month: "2026-09" });
  assert.equal(folder.status, "unusable");
  assert.match(folder.warning, /^The ACLED file could not be read: /);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- Safety helpers ----------

test("date windows never reach past today", () => {
  assert.deepEqual(clampWindow({ start: "2026-10-01", end: "2026-11-01" }, "2026-10-18"), { start: "2026-10-01", end: "2026-10-18" });
  assert.deepEqual(clampWindow({ start: "2026-11-01", end: "2026-12-01" }, "2026-10-18"), { start: "2026-10-18", end: "2026-10-18" });
  const w = monthWindows("2026-10", "2026-10-18");
  for (const window of [w.month, w.season, w.damage, w.lastYear, w.viirsSearch, ...w.monthBaselines, ...w.baselines, ...w.fireBaselines]) assert.ok(window.end <= "2026-10-18", JSON.stringify(window));
  assert.deepEqual(w.month, { start: "2026-10-01", end: "2026-10-18" });
  // October is after the northern season: the whole April-September season.
  assert.equal(w.season.end, "2026-10-01");
  // The southern season is running, so the last complete one is used.
  const south = monthWindows("2026-10", "2026-10-18", { lat: -34.9 });
  assert.deepEqual([south.season.start, south.season.end], ["2025-10-01", "2026-04-01"]);
  assert.deepEqual(south.baseline, { start: "2020-10-01", end: "2021-04-01" });
  assert.deepEqual(w.monthBaselines.at(-1), { start: "2021-10-01", end: "2021-10-18" });
  assert.deepEqual(w.lastYear, { start: "2025-10-18", end: "2026-10-18" });
  assert.deepEqual(w.fireBaselines.at(-1), { start: "2020-10-18", end: "2021-10-18" });
  // A finished month is not changed.
  assert.deepEqual(monthWindows("2026-09", "2026-10-18"), monthWindows("2026-09", "2030-01-01"));
});

test("chunk size shrinks for big cells; tileScale grows", () => {
  assert.equal(chunkSizeFor(0.01, 49), 250); // town or farm cells
  assert.equal(chunkSizeFor(0.25, 49), 98); // Ukraine-size cells
  assert.equal(chunkSizeFor(0.5, 49), 24);
  assert.equal(chunkSizeFor(2, 49), 10); // never fewer than 10
  assert.equal(tileScaleFor(0.01, 49), 4);
  assert.equal(tileScaleFor(0.25, 49), 16);
  assert.equal(coarserScale(913), 1826);
  assert.equal(coarserScale(1500), 2000);
  // Fixed pixel sizes for one reduction (no bestEffort): small areas keep
  // the minimum, a country-size area gets a coarser, still fixed, size.
  assert.equal(fixedScaleFor([[37, 49, 38, 50]], 500, 1e7), 500);
  assert.equal(fixedScaleFor([[22, 44, 40.5, 52.5]], 500, 1e7), 500);
  const ukraine = fixedScaleFor([[22, 44, 40.5, 52.5]], 500, 1e6);
  assert.ok(ukraine > 500 && ukraine % 100 === 0, String(ukraine));
  assert.equal(fixedScaleFor([[22, 44, 40.5, 52.5]], 500, 1e6), ukraine);
});

test("population: WorldPop's own pixels for small cells, density x area for big ones", () => {
  assert.deepEqual(populationPlan(0.001, 49), { native: true });
  assert.deepEqual(populationPlan(0.01, 49), { native: true });
  assert.deepEqual(populationPlan(0.25, 49), { native: false, scale: 913 });
  assert.deepEqual(populationPlan(0.05, 49), { native: false, scale: 183 });
  // A coarser retry makes population coarser too.
  assert.deepEqual(populationPlan(0.05, 49, 366), { native: false, scale: 366 });
});

test("which errors are worth one coarser retry", () => {
  assert.equal(isTooMuchWorkError(new Error("User memory limit exceeded.")), true);
  assert.equal(isTooMuchWorkError(new Error("Earth Engine memory capacity exceeded.")), true);
  assert.equal(isTooMuchWorkError(explainGeeError(new Error("Computation timed out."))), true);
  assert.equal(isTooMuchWorkError(new GeeError("timeout", "took too long")), true);
  assert.equal(isTooMuchWorkError(new Error("Caller does not have required permission")), false);
  assert.equal(isUnknownArgumentError(new Error("Image.reduceRegions: Unrecognized argument type for 'maxPixelsPerRegion'"), "maxPixelsPerRegion"), true);
  assert.equal(isUnknownArgumentError(new Error("User memory limit exceeded."), "maxPixelsPerRegion"), false);
});

test("-1 means nothing found", () => {
  assert.equal(fromSentinel(-1), null);
  assert.equal(fromSentinel(null), null);
  assert.equal(fromSentinel(1700000000000), 1700000000000);
  assert.equal(fromSentinel("12"), 12);
  const counts = cleanCounts({ s1Month_ASCENDING: 4, viirsLatest: -1, firmsDamage: "3" });
  assert.equal(counts.viirsLatest, null);
  assert.deepEqual(counts.s1Month, { ASCENDING: 4, DESCENDING: 0 });
  assert.equal(counts.firmsDamage, 3);
  assert.equal(counts.worldPop, 0);
});

// ---------- The whole analysis, against the stand-in Earth Engine ----------

const TEST_CFG = {
  geeProjectId: "test-proj",
  geeCredentials: { client_email: "atlas@test-proj.iam.gserviceaccount.com", private_key: "test-key" },
  geeCredentialsError: null,
  geeDisabled: false,
  chernozemAsset: "projects/zhaobo/assets/chernozem_wrb_ukraine",
  acledCsvPath: null,
};
const TODAY = "2026-10-18";

function fakeProvider(fakeOptions = {}, cfg = TEST_CFG) {
  const ee = createFakeEe(fakeOptions);
  // No pauses before the retries after "out of memory" (MEMORY_RETRY_MS in the app).
  const provider = createGeeProvider({ ee, getConfig: () => cfg, now: () => new Date(`${TODAY}T12:00:00Z`), memoryRetryMs: [0, 0] });
  return { ee, provider };
}

// A rows x cols grid of square cells, north-west corner at (north, west).
function gridArea(rows, cols, sizeDeg, north = 49.8, west = 37.4) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push({ id: `r${r}c${c}`, row: r, col: c, lat: Number((north - (r + 0.5) * sizeDeg).toFixed(6)), lon: Number((west + (c + 0.5) * sizeDeg).toFixed(6)) });
    }
  }
  const bbox = [west, north - rows * sizeDeg, west + cols * sizeDeg, north];
  const area = { id: "test-area", name: "Test", kind: "custom", source: "bbox", bbox, geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]] } };
  return { area, cells };
}

// Every raw-reading field of spec 2.2, in range.
function assertReading(reading, cellIds) {
  assert.ok(cellIds.has(reading.id), `unknown id ${reading.id}`);
  const inRange = (name, min, max) => {
    const v = reading[name];
    assert.equal(typeof v, "number", `${reading.id}.${name} is ${v}`);
    assert.ok(Number.isFinite(v) && v >= min && v <= max, `${reading.id}.${name} = ${v} not in ${min}..${max}`);
  };
  inRange("chernozem", 0, 1);
  inRange("croplandShare", 0, 1);
  inRange("firesPer100Km2", 0, 1e6);
  inRange("chiDrop", -1, 1);
  inRange("conflictKm", 0, 300);
  inRange("popPerKm2", 0, 1e6);
  inRange("lights", 0, 1e4);
  inRange("heavyShare", 0, 1);
  inRange("population", 0, 1e9);
  assert.ok(Number.isInteger(reading.population));
  for (const name of ["admin1", "admin2"]) if (name in reading) assert.equal(typeof reading[name], "string");
}

// A mocked clock for requests that take minutes: t.mock.timers (setTimeout
// and Date) moved forward by hand, with promise callbacks run in between.
const flush = () => new Promise((resolve) => setImmediate(resolve));
function mockClock(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
}
// Moves the mocked clock `ms` forward, in steps.
async function advance(t, ms, step = 50) {
  for (let moved = 0; moved < ms; moved += step) {
    await flush();
    t.mock.timers.tick(Math.min(step, ms - moved));
  }
  await flush();
}
// Moves the mocked clock forward until `promise` settles; gives it back.
async function settle(t, promise, { step = 100, maxMs = 2 * 60 * 60 * 1000 } = {}) {
  let done = false;
  const watched = Promise.resolve(promise).finally(() => {
    done = true;
  });
  watched.catch(() => {});
  for (let moved = 0; !done && moved < maxMs; moved += step) {
    await flush();
    if (!done) t.mock.timers.tick(step);
  }
  await flush();
  return watched;
}

const filterDates = (ee) => ee.callsNamed("ImageCollection.filterDate").map((c) => c.args);
const meanRequests = (ee) => ee.requests.filter((r) => r.find("reduceRegions").some((n) => n.args[0]?.reducer && n.parent.bands?.some((b) => b.name === "chiDrop")));

test("analyze() on a 9-cell area gives every reading for every cell", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(3, 3, 0.01);
  const progress = [];
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01, onProgress: (share, message) => progress.push([share, message]) });

  assert.deepEqual(Object.keys(result).sort(), ["accessSource", "alerts", "baseline", "conflict", "imagery", "readings", "warnings"]);
  // August 2026 compares every complete war season, April to September
  // 2022 to 2025 (the fake's NDVI peaks in July: the north's season).
  assert.deepEqual(result.imagery, { from: "2022-04", to: "2025-09", label: "April to September of 2022 to 2025", seasons: 4 });
  assert.equal(result.accessSource, "fires");
  // Kharkiv oblast: inside the war in Ukraine, found from the area's box.
  assert.deepEqual(result.conflict, { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  assert.equal(result.readings.length, 9);
  const ids = new Set(cells.map((c) => c.id));
  assert.deepEqual(new Set(result.readings.map((r) => r.id)), ids);
  for (const reading of result.readings) {
    assertReading(reading, ids);
    assert.equal(reading.admin1, "Kharkivs'ka");
  }
  assert.ok(Array.isArray(result.warnings) && result.warnings.every((w) => typeof w === "string"));
  // Every step worked: no "... unavailable" fallbacks were needed.
  assert.deepEqual(result.warnings.filter((w) => /unavailable/.test(w)), []);
  assert.ok(result.alerts.length > 0 && result.alerts.length <= 6);
  for (const alert of result.alerts) {
    assert.ok(["radar", "fire"].includes(alert.kind));
    assert.match(alert.date, /^2026-08-\d\d$/);
    assert.ok(alert.cellIds.length && alert.cellIds.every((id) => ids.has(id)));
    assert.ok(alert.magnitude > 0);
  }
  assert.deepEqual(progress.at(-1), [1, "Done"]);
  assert.ok(progress.every(([share], i) => i === 0 || share >= progress[i - 1][0]), "progress only goes up");

  // Signed in like the deposit, once.
  assert.equal(ee.callsNamed("data.authenticateViaPrivateKey").length, 1);
  assert.deepEqual(ee.callsNamed("initialize")[0].args, ["test-proj"]);
  // Every per-cell reduction has a tileScale. 1 km cells are measured
  // with pixels finer than FINE_SCALE_M, so the fire images and the
  // distance to fighting (and nothing else) are put on the 1 km grid, and
  // the ring around an unusual fire on the RING_GRID_M grid.
  const reprojects = ee.calls.filter((c) => c.name.endsWith(".reproject"));
  assert.ok(reprojects.length > 0);
  assert.ok(reprojects.every((c) => [FIRE_GRID_M, RING_GRID_M].includes(c.args[0]?.scale) && c.args[0]?.crs === "EPSG:4326"), JSON.stringify(reprojects.map((c) => c.args[0])));
  assert.equal(reprojects.filter((c) => c.args[0]?.scale === RING_GRID_M).length, 1);
  for (const call of ee.callsNamed("Image.reduceRegions")) assert.ok(call.args[0].tileScale >= 4);
  // Small cells: population summed on WorldPop's own grid.
  const popCalls = ee.callsNamed("Image.reduceRegions").filter((c) => c.args[0].crs && typeof c.args[0].crs !== "string");
  assert.equal(popCalls.length, 1);
  // One request measured all 9 cells.
  assert.equal(meanRequests(ee).length, 1);
  assert.ok(ee.stats.peakActive <= 2);
  // The health index "before" picture is the same months of 2019, 2020 AND
  // 2021 (2021 alone made 8.8M ha of Ukraine "heavily damaged", real run).
  for (const year of [2019, 2020, 2021]) assert.ok(hasWindow(ee, `${year}-04-01`, `${year}-10-01`), `baseline ${year}`);
  assert.ok(hasWindow(ee, "2025-04-01", "2025-10-01"), "the last complete season");
  // Radar is compared within one orbit direction; inside the war, radar
  // alerts are new change (the 3 months before), fire alerts are above the
  // same month of 2019-2021.
  assert.ok(ee.calls.some((c) => c.name === "Filter.eq" && c.args[0] === "orbitProperties_pass"));
  for (const year of [2019, 2020, 2021]) assert.ok(hasWindow(ee, `${year}-08-01`, `${year}-09-01`), `same month ${year}`);
  assert.ok(hasWindow(ee, "2026-05-01", "2026-08-01"), "3-months-before radar window in a war");
  assert.deepEqual(result.baseline, { from: 2019, to: 2021, label: "2019 to 2021 (same months)" });
  // Distance to fighting without ACLED: only fires far above the pre-war
  // normal for the place count (plain fires put Lviv 7 km from "fighting").
  const focal = ee.calls.filter((c) => c.name === "Image.focal_mean" && c.args[0] === 10000).map((c) => c.args.slice(0, 3));
  assert.deepEqual(focal, [[10000, "circle", "meters"], [10000, "circle", "meters"], [10000, "circle", "meters"]]);
  const fireStarts = filterDates(ee).map(([start]) => start);
  for (const year of [2018, 2019, 2020]) assert.ok(fireStarts.includes(`${year}-09-01`), `pre-war fires ${year}`);
  assert.ok(result.warnings.some((w) => /unusual fires of the last 12 months/.test(w)));
});

test("an area's own war setting decides where damage is counted from: at war from the team's day, or not at war in Ukraine", async () => {
  // Story County, Iowa (no war in the app's list), marked at war by its team.
  const iowa = gridArea(3, 3, 0.01, 42.05, -93.7);
  const war = { mode: "war", since: "2023-08-01", name: "Fighting in the county" };
  const atWar = fakeProvider();
  const result = await atWar.provider.analyze({ area: { ...iowa.area, war }, cells: iowa.cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.deepEqual(result.conflict, { id: "area-test-area", name: "Fighting in the county", since: "2023-08-01", source: "area" });
  assert.equal(result.accessSource, "fires", "distance to fighting is estimated from unusual fires, as in any war");
  assert.ok(!result.warnings.includes(NO_WAR_WARNING));
  const windows = monthWindows("2026-08", TODAY, { lat: 42.035, conflict: teamConflict(war, "test-area") });
  assert.deepEqual(windows.damage, { start: "2023-08-01", end: "2026-09-01" });
  // Three whole war years (the one begun on 2026-08-01 is a month old: it
  // counts from 3 months on).
  assert.deepEqual(windows.fireYears.map((y) => `${y.start}..${y.end}`), ["2023-08-01..2024-08-01", "2024-08-01..2025-08-01", "2025-08-01..2026-08-01"]);
  const starts = filterDates(atWar.ee).map(([start]) => start);
  for (const year of windows.fireYears) assert.ok(starts.includes(year.start), `fire year from ${year.start}`);
  // The radar compares the complete war seasons since that day (2024 and
  // 2025: the 2023 season began before it).
  assert.deepEqual(windows.radarSeasons.map((w) => w.start), ["2024-04-01", "2025-04-01"]);
  assert.deepEqual(result.imagery, { from: "2024-04", to: "2025-09", label: "April to September of 2024 to 2025", seasons: 2 });
  // The run keeps the team's war, and says who decided.
  const run = buildRun({ area: iowa.area, month: "2026-08", provider: "gee", readings: result.readings, warnings: result.warnings, cellSizeDeg: 0.01, cells: iowa.cells, conflict: result.conflict, conflictSource: "area", imagery: result.imagery, accessSource: result.accessSource });
  assert.equal(run.conflict.source, "area");
  assert.equal(run.conflictSource, "area");

  // Kharkiv oblast (the war in Ukraine in the app's list), marked "Not at
  // war": the last two years, the peace rules, no distance to fighting.
  const kharkiv = gridArea(3, 3, 0.01);
  const atPeace = fakeProvider();
  const calm = await atPeace.provider.analyze({ area: { ...kharkiv.area, war: { mode: "peace" } }, cells: kharkiv.cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(calm.conflict, null);
  assert.equal(calm.accessSource, "none");
  assert.ok(calm.readings.every((reading) => reading.conflictKm === 300));
  assert.ok(calm.warnings.includes(NO_WAR_WARNING));
  const calmStarts = filterDates(atPeace.ee).map(([start]) => start);
  assert.equal(calmStarts.includes("2022-02-24"), false, "nothing is counted from the war's start");
  for (const year of monthWindows("2026-08", TODAY, { lat: 49.785, conflict: null }).fireYears) assert.ok(calmStarts.includes(year.start), `peace year from ${year.start}`);
  // The run says the team decided, not "no war in the app's list".
  const calmRun = buildRun({ area: kharkiv.area, month: "2026-08", provider: "gee", readings: calm.readings, warnings: calm.warnings, cellSizeDeg: 0.01, cells: kharkiv.cells, conflict: calm.conflict, conflictSource: "area", accessSource: calm.accessSource });
  assert.ok(calmRun.checks.warnings.includes(TEAM_PEACE_WARNING));
  assert.ok(!calmRun.checks.warnings.includes(NO_WAR_WARNING));
  assert.equal(calmRun.conflictSource, "area");
});

test("a month that ends before its war began: no war damage, no distance to fighting from the fires before it, and one warning that says why", async () => {
  // Story County, Iowa, marked at war by its team from 2026-06-01: December
  // 2025 ends before that day (a re-run of 12 months reaches back to it).
  const iowa = gridArea(3, 3, 0.01, 42.05, -93.7);
  const war = { mode: "war", since: "2026-06-01", name: "Fighting in the county" };
  const conflict = teamConflict(war, "test-area");
  const lat = 42.035;
  const windows = monthWindows("2025-12", TODAY, { lat, conflict });
  assert.equal(windows.beforeWar, true);
  assert.equal(windows.damage, null);
  assert.deepEqual(windows.fireYears, []);
  assert.deepEqual(windows.radarSeasons, []);
  // Radar alerts compare the month with the same month of 2019-2021, as at
  // peace (the 3 months before would compare it with more months before
  // the war).
  assert.deepEqual(windows.radarBefore, monthWindows("2025-12", TODAY, { lat, conflict: null }).radarBefore);

  const before = fakeProvider();
  const result = await before.provider.analyze({ area: { ...iowa.area, war }, cells: iowa.cells, month: "2025-12", cellSizeDeg: 0.01, conflict });
  assert.deepEqual(result.conflict, conflict, "the run keeps its war, so it compares with the area's other months");
  assert.equal(result.accessSource, "none");
  assert.ok(result.readings.every((reading) => reading.conflictKm === 300 && reading.heavyShare === 0 && reading.radarDb === null));
  // One warning says why; not "No growing season since ... is complete",
  // and no distance estimated from the fires before the war.
  assert.deepEqual(result.warnings.filter((w) => /before the war|growing season since|estimated from unusual fires|no recent fires/.test(w)), [beforeWarWarning("2026-06-01")]);
  assert.equal(before.ee.callsNamed("Image.stratifiedSample").length, 0);
  assert.equal(measuredWindows(before.ee, DATASETS.firms).has(`${windows.lastYear.start}..${windows.lastYear.end}`), false, "no fires of the last 12 months are looked at for fighting");
  // The fire evidence is the constant 0 (no war year to count).
  const [request] = meanRequests(before.ee);
  const value = pixelEvaluator(before.ee, { firesOn: ["2025-12-05", "2025-11-20"], leaves: { [DATASETS.worldCover]: 40 } });
  assert.equal(value(request.nodes.find((n) => n.op === "rename" && n.args[0] === "fx0")), 0);

  // A month the war had begun by estimates the distance from unusual fires.
  const during = fakeProvider();
  const atWar = await during.provider.analyze({ area: { ...iowa.area, war }, cells: iowa.cells, month: "2026-08", cellSizeDeg: 0.01, conflict });
  assert.equal(atWar.accessSource, "fires");
  assert.ok(during.ee.callsNamed("Image.stratifiedSample").length > 0);
  assert.ok(!atWar.warnings.includes(beforeWarWarning("2026-06-01")));
  // Only the fires since the war began stand in for fighting (the war is
  // 3 months old), against the same days of 2019-2021; and the run says so.
  const fires = measuredWindows(during.ee, DATASETS.firms);
  assert.ok(fires.has("2026-06-01..2026-09-01"), "the fires since the war began");
  assert.equal(fires.has("2025-09-01..2026-09-01"), false, "not the 12 months before the end of the month");
  for (const year of [2019, 2020, 2021]) assert.ok(fires.has(`${year}-06-01..${year}-09-01`), `the same days of ${year}`);
  assert.ok(atWar.warnings.some((w) => w.startsWith("Distance to fighting is estimated from unusual fires since the war began on 2026-06-01 (far more than on the same days of the normal years; no ACLED file)")));
});

test("a war that covers a whole-country area only in part: its rules in the squares that touch its boxes, the peace rule elsewhere, and fighting estimated from fires inside the boxes", async () => {
  // Eight 0.1° squares across the north edge of the Kursk box (51.6° N):
  // rows 0 and 1 outside it, rows 2 and 3 touching it.
  const { area, cells } = gridArea(4, 2, 0.1, 51.87, 34.5);
  const kursk = { id: "russia-kursk-belgorod", name: "Fighting in Russia's Kursk and Belgorod border areas", since: "2022-02-24", partOfCountry: true };
  const { ee, provider } = fakeProvider();
  const result = await provider.analyze({ area: { ...area, countryId: "643" }, cells, month: "2026-08", cellSizeDeg: 0.1, conflict: kursk });
  assert.deepEqual(result.conflict, kursk);
  const atWar = Object.fromEntries(result.readings.map((reading) => [reading.id, reading.atWar]));
  assert.deepEqual(atWar, { r0c0: false, r0c1: false, r1c0: false, r1c1: false, r2c0: true, r2c1: true, r3c0: true, r3c1: true });

  // Each measuring request holds squares of one kind only. A pixel with
  // lasting radar change of 4 dB and no fire is heavy damage by the war's
  // rule only (at peace it needs an unusual fire as well).
  const idsOf = (request) => request.nodes.filter((n) => n.op === "Feature" && n.args[1]?.id).map((n) => n.args[1].id);
  const value = pixelEvaluator(ee, { firesOn: [], vv: (w) => (w.start < "2022-01-01" ? -12 : -8), leaves: { [DATASETS.worldCover]: 40 } });
  const seen = { inside: 0, outside: 0 };
  for (const request of meanRequests(ee)) {
    const ids = [...new Set(idsOf(request))];
    const inside = ids.every((id) => atWar[id]);
    assert.ok(inside || ids.every((id) => !atWar[id]), `one request mixes the war's squares and the others: ${ids}`);
    const heavy = value(request.nodes.find((n) => n.op === "rename" && n.args[0] === "heavy"));
    assert.equal(heavy, inside ? 1 : 0, `heavy damage by ${inside ? "the war's" : "the peace"} rule`);
    seen[inside ? "inside" : "outside"] += 1;
  }
  assert.ok(seen.inside > 0 && seen.outside > 0);

  // The fires that stand in for fighting come from inside the war's boxes.
  const ring = ([w, s, e, n]) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  const [sample] = ee.callsNamed("Image.stratifiedSample");
  assert.deepEqual(ee.nodeOf(sample.args[0].region).args[0], warBoxes(kursk).map(ring));
  assert.equal(result.accessSource, "fires");
  assert.ok(result.warnings.some((w) => /estimated from unusual fires of the last 12 months .*inside the war's region/.test(w)));

  // The run counts the war's squares; scoring reads the others at peace.
  const run = buildRun({ area, month: "2026-08", provider: "gee", readings: result.readings, warnings: result.warnings, cellSizeDeg: 0.1, cells: cells.map((cell) => ({ ...cell, areaHa: 7000 })), conflict: result.conflict, accessSource: result.accessSource });
  assert.equal(run.conflict.partOfCountry, true);
  assert.equal(run.warSquares, 4);
  assert.equal(run.otherWarSquares, undefined, "no square lies in another listed war");
  assert.deepEqual(run.cells.map((cell) => cell.atWar), [false, false, false, false, true, true, true, true]);

  // A region or a drawn area across the boxes' edge (partOf "area"): the
  // same rules square by square, and the war it gives back says so.
  const regionFake = fakeProvider();
  const region = await regionFake.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.1, conflict: { ...kursk, partOf: "area" } });
  assert.deepEqual(region.conflict, { ...kursk, partOf: "area" });
  assert.deepEqual(Object.fromEntries(region.readings.map((reading) => [reading.id, reading.atWar])), atWar);

  // The same war without partOfCountry (an area inside its boxes): one
  // rule for every square, nothing marked.
  const plain = fakeProvider();
  const whole = await plain.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.1, conflict: { ...kursk, partOfCountry: false } });
  assert.ok(whole.readings.every((reading) => !("atWar" in reading)));
  assert.notDeepEqual(plain.ee.nodeOf(plain.ee.callsNamed("Image.stratifiedSample")[0].args[0].region).args[0], warBoxes(kursk).map(ring));
});

test("a war in part of an area across a border: its squares in another listed war keep the war's rules, and their unusual fires stand in for fighting", async () => {
  // Sixteen 0.1° squares over the Sumy-Kursk border, north-west of Sudzha
  // (2026-10-20 review): T touch the Kursk box, U are in Ukraine (the war
  // in Ukraine) without touching it, p are Russian squares in no war.
  //   r0  U U U U
  //   r1  U p p p
  //   r2  U U T T
  //   r3  U U T T
  const { area, cells } = gridArea(4, 4, 0.1, 51.8, 34.0);
  const kursk = { id: "russia-kursk-belgorod", name: "Fighting in Russia's Kursk and Belgorod border areas", since: "2022-02-24", partOfCountry: true, partOf: "area" };
  const { ee, provider } = fakeProvider();
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.1, conflict: kursk });
  const peace = ["r1c1", "r1c2", "r1c3"];
  for (const reading of result.readings) assert.equal(reading.atWar, !peace.includes(reading.id), reading.id);
  // The fires that stand in for fighting: inside the Kursk boxes and the
  // Ukrainian squares, row by row, not the Russian squares between them.
  const ring = ([w, s, e, n]) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  const [sample] = ee.callsNamed("Image.stratifiedSample");
  const ukraineRows = [
    [34, 51.7, 34.4, 51.8],
    [34, 51.6, 34.1, 51.7],
    [34, 51.5, 34.2, 51.6],
    [34, 51.4, 34.2, 51.5],
  ];
  assert.deepEqual(ee.nodeOf(sample.args[0].region).args[0], [...warBoxes(kursk), ...ukraineRows].map(ring));
  assert.ok(result.warnings.some((w) => / inside the war's region and its squares in another listed war, so treat safe access as rough\.$/.test(w)));
  // The run counts them: 13 squares with the war's rules, 9 of them for
  // lying in another listed war.
  const run = buildRun({ area, month: "2026-08", provider: "gee", readings: result.readings, warnings: result.warnings, cellSizeDeg: 0.1, cells: cells.map((cell) => ({ ...cell, areaHa: 7000 })), conflict: result.conflict, accessSource: result.accessSource });
  assert.equal(run.warSquares, 13);
  assert.equal(run.otherWarSquares, 9);
  // Without such squares the run says nothing of them (the test above).
  assert.equal(squareRuns([], 0.1).length, 0);
  // A gap in a row starts a new box.
  assert.deepEqual(squareRuns([{ lat: 50.05, lon: 30.05 }, { lat: 50.05, lon: 30.15 }, { lat: 50.05, lon: 30.45 }], 0.1), [[30, 50, 30.2, 50.1], [30.4, 50, 30.5, 50.1]]);
});

// ---------- Safe access in a war where no fire looks like fighting ----------

// The run's warning, word for word (ACCESS-SPEC, 2026-10-21).
const NO_FIGHTING_12_MONTHS =
  "No fires that look like fighting were found within 300 km in the last 12 months (the rule needs fire as dense as at a front line, about 1 detection per km² within 10 km and 3 times the normal years' rate; scattered strikes do not reach it). Safe access is not measured here: every square counts as far from fighting, which does NOT make the land safe. An ACLED file of recorded fighting would measure it.";
const ESTIMATED = /estimated from unusual fires/;

test("the warning where no fire looks like fighting, and when every square counts as that far", () => {
  assert.equal(noFightingFiresWarning(), NO_FIGHTING_12_MONTHS);
  assert.equal(noFightingFiresWarning({ since: "2026-06-01" }), NO_FIGHTING_12_MONTHS.replace("in the last 12 months", "since the war began on 2026-06-01").replace("per km² within", "per km² a year within"));
  assert.match(noFightingFiresWarning({ region: "war" }), /^No fires that look like fighting were found within 300 km inside the war's region in the last 12 months \(/);
  assert.match(noFightingFiresWarning({ region: "war+other" }), /^No fires that look like fighting were found within 300 km inside the war's region and its squares in another listed war in the last 12 months \(/);
  // No FIRMS data for the window: a gap in the data, never "no fires".
  assert.equal(
    noFightingFiresWarning({ fireData: false }),
    "No fire data (NASA FIRMS) was available for the last 12 months, so fires that look like fighting could not be looked for. Safe access is not measured here: every square counts as far from fighting, which does NOT make the land safe. An ACLED file of recorded fighting would measure it.",
  );
  assert.match(noFightingFiresWarning({ fireData: false, since: "2026-06-01" }), /^No fire data \(NASA FIRMS\) was available since the war began on 2026-06-01, so /);
  // An ACLED file is connected: never "an ACLED file would measure it" as
  // if there were none.
  const SAFE_ACCESS = "Safe access is not measured here: every square counts as far from fighting, which does NOT make the land safe.";
  assert.equal(
    noFightingFiresWarning({ acled: "no-battles" }),
    NO_FIGHTING_12_MONTHS.replace(
      "An ACLED file of recorded fighting would measure it.",
      "The ACLED file has no battles within 300 km of this area in the last 12 months either (only battles count, not strikes or shelling), so it cannot measure it: check that the export covers this country and its neighbours, or rely on your team's knowledge of where the fighting is.",
    ),
  );
  assert.ok(noFightingFiresWarning({ acled: "unusable" }).endsWith(`${SAFE_ACCESS} The ACLED file could not be used (see its warning), so it cannot measure it either: fix the file that ACLED_CSV_PATH names.`));
  assert.equal(noFightingFiresWarning({ acled: "none" }), NO_FIGHTING_12_MONTHS);
  // Never the words of a measured distance, never "safe".
  for (const options of [{}, { since: "2026-06-01" }, { region: "war" }, { fireData: false }, { acled: "no-battles" }, { acled: "unusable" }]) {
    const said = noFightingFiresWarning(options);
    assert.ok(said.includes(SAFE_ACCESS), said);
    assert.doesNotMatch(said, ESTIMATED);
    assert.doesNotMatch(said, /safe to reach|treat safe access as rough/);
  }
  // The pages say "within 300 km" from their own copy of the distance cap.
  assert.equal(FIGHTING_SEARCH_KM, MAX_CONFLICT_M / 1000);
  const at = (km) => ({ id: "r0c0", conflictKm: km });
  assert.equal(farFromAnyFighting([at(300), at(300)]), true);
  assert.equal(farFromAnyFighting([at(300), at(299.99)]), false, "one square has a fighting fire within 300 km");
  assert.equal(farFromAnyFighting([]), false, "no squares, nothing to tell");
});

test("a war where no fire looks like fighting (south Lebanon): the sample of fighting fires is empty, every square reads 300 km, and safe access is not measured", async () => {
  // A 3 x 3 km box in south Lebanon, inside the Israel–Hezbollah war's box.
  const lebanon = gridArea(3, 3, 0.01, 33.3, 35.4);
  const { ee, provider } = fakeProvider({ samplePoints: 0 });
  const result = await provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.equal(result.conflict.id, "israel-hezbollah");
  // The fires were sampled as in any war; none looked like fighting.
  assert.equal(ee.callsNamed("Image.stratifiedSample").length, 1);
  assert.equal(result.accessSource, "fires-none");
  // The readings keep their numbers: 300 km everywhere.
  assert.ok(result.readings.every((reading) => reading.conflictKm === 300));
  // The run says safe access is not measured, not "estimated from unusual fires".
  assert.ok(result.warnings.includes(NO_FIGHTING_12_MONTHS), result.warnings.join(" | "));
  assert.equal(result.warnings.filter((w) => ESTIMATED.test(w) || /Safe access is not measured/.test(w)).length, 1);
  assert.ok(!result.warnings.some((w) => ESTIMATED.test(w)));

  // Found without another Earth Engine request: the same requests as a run
  // whose fires do look like fighting.
  const found = fakeProvider();
  const withFires = await found.provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.equal(withFires.accessSource, "fires");
  assert.equal(ee.requests.length, found.ee.requests.length);

  // The run keeps it, and nothing is set aside for it.
  const cells = lebanon.cells.map((cell) => ({ ...cell, areaHa: 100 }));
  const run = buildRun({ area: lebanon.area, month: "2026-09", provider: "gee", readings: result.readings, warnings: result.warnings, cellSizeDeg: 0.01, cells, conflict: result.conflict, imagery: result.imagery, accessSource: result.accessSource });
  assert.equal(run.accessSource, "fires-none");
  assert.ok(run.checks.warnings.includes(NO_FIGHTING_12_MONTHS));
  assert.ok(run.cells.every((cell) => cell.raw.conflictKm === 300 && cell.distance === 1));
  const scored = scorePlaces(run.cells, { settings: { weights: { soil: 30, damage: 40, access: 30 }, gatePercentile: 30, rampWidth: 0.2, r: 0.5 }, conflict: run.conflict, cellSizeDeg: 0.01 });
  assert.equal(scored.places.filter((place) => place.nearTerm.tier === "setAside").length, 0);
});

test("one fire that looks like fighting within 300 km of one square keeps the distance estimated from fires", async () => {
  const lebanon = gridArea(3, 3, 0.01, 33.3, 35.4);
  // r1c1 is 299 km from the nearest fighting fire, the others 300 km.
  const { provider } = fakeProvider({ values: { conflictM: (u, { id }) => (id === "r1c1" ? 299000 : 300000) } });
  const result = await provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.deepEqual(result.readings.map((reading) => reading.conflictKm), [300, 300, 300, 300, 299, 300, 300, 300, 300]);
  assert.equal(result.accessSource, "fires");
  assert.ok(result.warnings.some((w) => w.startsWith("Distance to fighting is estimated from unusual fires of the last 12 months")));
  assert.ok(!result.warnings.some((w) => /Safe access is not measured/.test(w)));
});

test("no fire that looks like fighting in a war's first year, in a war in part of the area, or no fires at all: not measured either", async () => {
  // A war the team set from 2026-06-01 (Story County, Iowa): only the fires
  // since then are looked at, and the warning says so.
  const iowa = gridArea(3, 3, 0.01, 42.05, -93.7);
  const war = { mode: "war", since: "2026-06-01", name: "Fighting in the county" };
  const young = fakeProvider({ samplePoints: 0 });
  const first = await young.provider.analyze({ area: { ...iowa.area, war }, cells: iowa.cells, month: "2026-08", cellSizeDeg: 0.01, conflict: teamConflict(war, "test-area") });
  assert.equal(first.accessSource, "fires-none");
  assert.ok(first.warnings.includes(noFightingFiresWarning({ since: "2026-06-01" })), first.warnings.join(" | "));
  assert.ok(first.warnings.some((w) => w.startsWith("No fires that look like fighting were found within 300 km since the war began on 2026-06-01 (")));
  assert.ok(!first.warnings.some((w) => ESTIMATED.test(w)));

  // A war that covers the area only in part (the Kursk box): only the fires
  // inside its region stand in for fighting, and none does.
  const { area, cells } = gridArea(4, 2, 0.1, 51.87, 34.5);
  const kursk = { id: "russia-kursk-belgorod", name: "Fighting in Russia's Kursk and Belgorod border areas", since: "2022-02-24", partOfCountry: true };
  const part = fakeProvider({ samplePoints: 0 });
  const inPart = await part.provider.analyze({ area: { ...area, countryId: "643" }, cells, month: "2026-08", cellSizeDeg: 0.1, conflict: kursk });
  const ring = ([w, s, e, n]) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  assert.deepEqual(part.ee.nodeOf(part.ee.callsNamed("Image.stratifiedSample")[0].args[0].region).args[0], warBoxes(kursk).map(ring));
  assert.equal(inPart.accessSource, "fires-none");
  assert.ok(inPart.readings.every((reading) => reading.conflictKm === 300));
  assert.ok(inPart.warnings.includes(noFightingFiresWarning({ region: "war" })));
  assert.ok(inPart.warnings.some((w) => w.startsWith("No fires that look like fighting were found within 300 km inside the war's region in the last 12 months")));
  // ... and with squares in another listed war (a box over the Sumy-Kursk border).
  const border = gridArea(4, 4, 0.1, 51.8, 34.0);
  const across = fakeProvider({ samplePoints: 0 });
  const both = await across.provider.analyze({ area: border.area, cells: border.cells, month: "2026-08", cellSizeDeg: 0.1, conflict: { ...kursk, partOf: "area" } });
  assert.equal(both.accessSource, "fires-none");
  assert.ok(both.warnings.includes(noFightingFiresWarning({ region: "war+other" })));

  // No FIRMS fire data at all for the last 12 months (a gap in the data):
  // no sample is taken, and safe access is not measured. (The distance is
  // then the constant 300 km; the stand-in cannot read a constant's value,
  // so it is given.)
  const quiet = fakeProvider({ sizes: { [DATASETS.firms]: 0 }, values: { conflictM: 300000 } });
  const lebanon = gridArea(3, 3, 0.01, 33.3, 35.4);
  const none = await quiet.provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.equal(quiet.ee.callsNamed("Image.stratifiedSample").length, 0);
  assert.equal(none.accessSource, "fires-none");
  assert.ok(none.readings.every((reading) => reading.conflictKm === 300));
  assert.ok(none.warnings.includes(noFightingFiresWarning({ fireData: false })), none.warnings.join(" | "));
  assert.ok(!none.warnings.some((w) => /No conflict data and no recent fires|No fire detections at all/.test(w)));
});

test("an ACLED file connected but with no battles near the area, or one that cannot be used: no fire looks like fighting, and nothing says there is no ACLED file", async () => {
  // The team exported Ukraine only, then analyses south Lebanon.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acled-"));
  const file = path.join(dir, "acled.csv");
  const rows = Array.from({ length: 6 }, (_, i) => `2026-08-0${i + 1},2026,Battles,,48.00,37.00,1,Ukraine`);
  fs.writeFileSync(file, ["event_date,year,event_type,notes,latitude,longitude,fatalities,country", ...rows].join("\n"));
  const lebanon = gridArea(3, 3, 0.01, 33.3, 35.4);
  const cells = lebanon.cells.map((cell) => ({ ...cell, areaHa: 100 }));
  const runOf = (result) => buildRun({ area: lebanon.area, month: "2026-09", provider: "gee", readings: result.readings, warnings: result.warnings, cellSizeDeg: 0.01, cells, conflict: result.conflict, imagery: result.imagery, accessSource: result.accessSource });
  const far = fakeProvider({ samplePoints: 0 }, { ...TEST_CFG, acledCsvPath: file });
  const elsewhere = await far.provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.equal(elsewhere.accessSource, "fires-none");
  assert.ok(elsewhere.warnings.includes(ACLED_NO_BATTLES_WARNING));
  assert.ok(elsewhere.warnings.includes(noFightingFiresWarning({ acled: "no-battles" })), elsewhere.warnings.join(" | "));
  assert.ok(!elsewhere.warnings.some((w) => /An ACLED file of recorded fighting would measure it/.test(w)));
  // The pages read the file's state from the run's own warnings (the
  // acled.js words), so they never say "there is no ACLED file" or "Connect one".
  const run = runOf(elsewhere);
  assert.equal(acledFileState(run), "no-battles");
  assert.equal(noFightingFound(run), true);
  const pageWords = [accessMeaning(run), warNote(run).line, notMeasuredReason(run).clause, noFightingNote(run)];
  for (const text of pageWords) {
    assert.doesNotMatch(text, /there is no ACLED file|Connect one|would measure it/, text);
  }
  assert.match(accessMeaning(run), /and the ACLED file has no battles within 300 km of this area/);

  // A file that cannot be used (ACLED_CSV_PATH names a missing file).
  const broken = fakeProvider({ samplePoints: 0 }, { ...TEST_CFG, acledCsvPath: path.join(dir, "missing.csv") });
  const unusable = await broken.provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.equal(unusable.accessSource, "fires-none");
  assert.ok(unusable.warnings.some((w) => /^ACLED file not found: /.test(w)));
  assert.ok(unusable.warnings.includes(noFightingFiresWarning({ acled: "unusable" })), unusable.warnings.join(" | "));
  const brokenRun = runOf(unusable);
  assert.equal(acledFileState(brokenRun), "unusable");
  assert.match(accessMeaning(brokenRun), /and the ACLED file could not be used/);
  assert.doesNotMatch(accessMeaning(brokenRun), /there is no ACLED file/);

  // Without a file, as before (the spec's words), and the state is null.
  const plain = runOf(await fakeProvider({ samplePoints: 0 }).provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 }));
  assert.equal(acledFileState(plain), null);
  assert.match(accessMeaning(plain), /and there is no ACLED file/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an ACLED file, and peace, are not changed by it: with battles the distance is to them, at peace it is not measured as before", async () => {
  // An ACLED file with battles near the area: its distance, even where the
  // fires found nothing and every square is 300 km away.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acled-"));
  const file = path.join(dir, "acled.csv");
  const rows = Array.from({ length: 6 }, (_, i) => `2026-08-0${i + 1},2026,Battles,,33.27,35.42,1,Lebanon`);
  fs.writeFileSync(file, ["event_date,year,event_type,notes,latitude,longitude,fatalities,country", ...rows].join("\n"));
  const lebanon = gridArea(3, 3, 0.01, 33.3, 35.4);
  const { ee, provider } = fakeProvider({ samplePoints: 0, values: { conflictM: 300000 } }, { ...TEST_CFG, acledCsvPath: file });
  const acled = await provider.analyze({ area: lebanon.area, cells: lebanon.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.equal(acled.accessSource, "acled");
  assert.equal(ee.callsNamed("Image.stratifiedSample").length, 0);
  assert.ok(!acled.warnings.some((w) => /Safe access is not measured|estimated from unusual fires/.test(w)), acled.warnings.join(" | "));

  // At peace (Iowa): "none", the list's warning, nothing about fires.
  const calm = fakeProvider({ samplePoints: 0 });
  const iowa = gridArea(3, 3, 0.01, 42.05, -93.65);
  const peace = await calm.provider.analyze({ area: iowa.area, cells: iowa.cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(peace.accessSource, "none");
  assert.ok(peace.warnings.includes(NO_WAR_WARNING));
  assert.ok(!peace.warnings.some((w) => /Safe access is not measured|look like fighting/.test(w)));
});

test("600 small cells are measured in chunks of 250, two at a time", async () => {
  const { ee, provider } = fakeProvider({ delayMs: 5 });
  const { area, cells } = gridArea(20, 30, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(result.readings.length, 600);
  const ids = new Set(cells.map((c) => c.id));
  for (const reading of result.readings) assertReading(reading, ids);
  const chunks = meanRequests(ee);
  assert.equal(chunks.length, 3);
  const sizes = ee.callsNamed("Image.reduceRegions").filter((c) => c.args[0].reducer && c.args[0].crs === "EPSG:4326" && c.args[0].scale < 100);
  assert.ok(sizes.length >= 3);
  assert.ok(ee.stats.peakActive <= 2, `peak ${ee.stats.peakActive}`);
});

test("600 big (country-size) cells: smaller chunks, tileScale 16, population from density x pixel area", async () => {
  const { ee, provider } = fakeProvider({ delayMs: 2 });
  const { area, cells } = gridArea(20, 30, 0.25, 52, 24);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.25 });
  assert.equal(result.readings.length, 600);
  const ids = new Set(cells.map((c) => c.id));
  for (const reading of result.readings) assertReading(reading, ids);
  const perChunk = chunkSizeFor(0.25, (52 + 47) / 2);
  assert.ok(perChunk < 250);
  assert.equal(meanRequests(ee).length, Math.ceil(600 / perChunk));
  const reduceCalls = ee.callsNamed("Image.reduceRegions");
  assert.ok(reduceCalls.every((c) => c.args[0].tileScale === 16));
  // Population: summed in EPSG:4326 at 100 m or coarser, using pixelArea, never reprojected.
  const pop = reduceCalls.filter((c) => c.args[0].crs === "EPSG:4326" && c.args[0].scale >= 100);
  assert.ok(pop.length > 0);
  assert.ok(ee.callsNamed("Image.pixelArea").length >= 1);
  assert.equal(ee.calls.filter((c) => c.name.endsWith(".reproject")).length, 0);
  assert.ok(ee.stats.peakActive <= 2);
});

test("a chunk that runs out of memory is split in two with the SAME pixels (the totals do not change)", async () => {
  let failed = 0;
  const { ee, provider } = fakeProvider({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (isChunk && failed === 0) {
        failed += 1;
        return "User memory limit exceeded.";
      }
      return null;
    },
  });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(failed, 1);
  assert.equal(result.readings.length, 9);
  const base = reduceScale(0.05, (area.bbox[1] + area.bbox[3]) / 2);
  const scales = ee.callsNamed("Image.reduceRegions").map((c) => c.args[0].scale);
  assert.ok(scales.includes(base) && !scales.includes(coarserScale(base)), JSON.stringify(scales));
  assert.ok(!result.warnings.some((w) => /coarser pixels/.test(w)));
  // The same readings as a run that never failed.
  const clean = await fakeProvider().provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  const byId = (list) => Object.fromEntries(list.map((r) => [r.id, r]));
  assert.deepEqual(byId(result.readings), byId(clean.readings));
});

test("only a small piece that keeps failing is measured with coarser pixels, and the run says so", async () => {
  // Every chunk request at the normal pixel size runs out of memory: the
  // chunk is split down to SPLIT_MIN_CELLS cells, and those pieces go
  // through with coarser pixels.
  const { area, cells } = gridArea(3, 3, 0.05);
  const base = reduceScale(0.05, (area.bbox[1] + area.bbox[3]) / 2);
  const sizes = [];
  const { provider } = fakeProvider({
    fail: (request) => {
      if (!(request.find("reduceRegions").length > 0 && request.has("Dictionary"))) return null;
      sizes.push(Math.max(...request.find("toList").map((n) => Number(n.args?.[0]) || 0)));
      return request.find("reduceRegions").some((n) => n.args?.[0]?.scale === base) ? "User memory limit exceeded." : null;
    },
  });
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(result.readings.length, 9);
  assert.ok(Math.max(...sizes.slice(-4)) <= SPLIT_MIN_CELLS, JSON.stringify(sizes));
  assert.ok(result.warnings.some((w) => /9 of 9 cells were measured with coarser pixels/.test(w)), JSON.stringify(result.warnings));
});

test("a chunk whose connection drops is tried once more as it is", async () => {
  const dropped = "Server returned HTTP code: -1 for POST https://earthengine.googleapis.com/v1/projects/test-proj/value:compute";
  let failed = 0;
  const ee = createFakeEe({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (isChunk && failed === 0) {
        failed += 1;
        return dropped;
      }
      return null;
    },
  });
  const provider = createGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(failed, 1);
  assert.equal(result.readings.length, 9);
  assert.ok(!result.warnings.some((w) => /coarser pixels/.test(w)), "same pixels on the retry");
  // Which failures count as a dropped request.
  assert.equal(isTransientError(explainGeeError(new Error(dropped))), true);
  for (const text of ["read ECONNRESET", "socket hang up", "connect ETIMEDOUT 1.2.3.4:443", "Server returned HTTP code: 503", "Server returned HTTP code: 429"]) assert.equal(isTransientError(new Error(text)), true, text);
  for (const text of ["User memory limit exceeded.", "Permission denied", "Server returned HTTP code: 400"]) assert.equal(isTransientError(new Error(text)), false, text);
  // A connection that keeps dropping still stops the analysis.
  const down = createGeeProvider({ ee: createFakeEe({ fail: (request) => (request.has("Dictionary") && request.find("reduceRegions").length ? dropped : null) }), getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  await assert.rejects(down.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), /HTTP code: -1/);
});

// Real data, Kenya 12 months, 2026-10-19: the request that went out as the
// 1-hour sign-in token ran out was sent again by @google/earthengine with no
// body, and Earth Engine answered with this. The next request worked.
const EMPTY_REQUEST = "Unknown reference to value named ''. Currently known value names are: [].";

test("a request Earth Engine got with no expression (token refreshed mid-send) is tried once more", async () => {
  let failed = 0;
  const ee = createFakeEe({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (isChunk && failed === 0) {
        failed += 1;
        return EMPTY_REQUEST;
      }
      return null;
    },
  });
  const provider = createGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(failed, 1);
  assert.equal(result.readings.length, 9);
  assert.equal(isTransientError(explainGeeError(new Error(EMPTY_REQUEST))), true);
  // A value that is really missing is still an error, not tried again.
  assert.equal(isTransientError(new Error("Unknown reference to value named '7'. Currently known value names are: [0, 1].")), false);
});

test("an expired token is refreshed BEFORE a request is sent, so its body is never dropped", async () => {
  const sent = [];
  let token = null;
  const ee = {
    data: {
      getAuthToken: () => token,
      refreshAuthToken: (ok) => {
        token = "Bearer fresh";
        setTimeout(ok, 0);
      },
      // Like @google/earthengine: with no token it refreshes, then sends again with NO body.
      computeValue: (obj, cb) => {
        sent.push(token ? obj : "");
        setTimeout(() => (token ? cb(2) : ((token = "Bearer fresh"), cb(undefined, EMPTY_REQUEST))), 0);
      },
    },
  };
  keepTokenFresh(ee);
  keepTokenFresh(ee); // wrapping twice changes nothing
  const value = await new Promise((resolve, reject) => ee.data.computeValue({ expr: 1 }, (v, e) => (e ? reject(new Error(e)) : resolve(v))));
  assert.equal(value, 2);
  assert.deepEqual(sent, [{ expr: 1 }]);
  // With a token that is still good, the request goes straight out.
  const again = await new Promise((resolve, reject) => ee.data.computeValue({ expr: 2 }, (v, e) => (e ? reject(new Error(e)) : resolve(v))));
  assert.equal(again, 2);
  assert.deepEqual(sent, [{ expr: 1 }, { expr: 2 }]);
});

test("a busy Earth Engine ('capacity exceeded') is tried again after longer pauses, not with coarser pixels", async () => {
  const busy = "Earth Engine capacity exceeded.";
  // What counts as busy: not "memory capacity exceeded" (too much work).
  for (const text of [busy, "Too many concurrent aggregations."]) {
    assert.equal(isBusyError(new Error(text)), true, text);
    assert.equal(isTransientError(new Error(text)), true, text);
    assert.equal(isTransientError(explainGeeError(new Error(text))), true, `${text} (explained)`);
  }
  assert.equal(isTooMuchWorkError(new Error(busy)), false);
  assert.equal(isBusyError(new Error("Earth Engine memory capacity exceeded.")), false);
  assert.equal(isTransientError(new Error("Earth Engine memory capacity exceeded.")), false);

  // Up to BUSY_RETRIES more tries; a dropped connection only one.
  let calls = 0;
  assert.equal(await retryTransient(async () => (++calls <= BUSY_RETRIES ? Promise.reject(new Error(busy)) : "ok"), 0), "ok");
  assert.equal(calls, BUSY_RETRIES + 1);
  calls = 0;
  await assert.rejects(retryTransient(async () => { calls += 1; throw new Error(busy); }, 0), /capacity exceeded/);
  assert.equal(calls, BUSY_RETRIES + 1);
  calls = 0;
  await assert.rejects(retryTransient(async () => { calls += 1; throw new Error("socket hang up"); }, 0), /socket hang up/);
  assert.equal(calls, 2);

  // In an analysis: the image check and a chunk each fail once, the month still finishes.
  let failedChunk = 0;
  let failedCheck = 0;
  const ee = createFakeEe({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (isChunk && failedChunk === 0) return (failedChunk += 1), busy;
      if (!isChunk && request.has("Dictionary") && failedCheck === 0) return (failedCheck += 1), busy;
      return null;
    },
  });
  const provider = createGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(failedChunk, 1);
  assert.equal(failedCheck, 1);
  assert.equal(result.readings.length, 9);
  assert.ok(!result.warnings.some((w) => /coarser pixels/.test(w)), "same pixels on the retry");
});

test("'Too many concurrent aggregations.' for a group of cells: after its retries the month fails as 'busy', not as a quota", async () => {
  // Real Earth Engine says this when too many requests of the project run
  // at once (two workloads on one project): a busy answer. A job skips such
  // a month and goes on (server/jobs.test.js); before, it read as a quota
  // and stopped the whole job.
  const isChunk = (request) => request.find("reduceRegions").length > 0 && request.has("Dictionary");
  let tries = 0;
  const ee = createFakeEe({ fail: (request) => (isChunk(request) ? (tries++, "Too many concurrent aggregations.") : null) });
  const provider = createGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const { area, cells } = gridArea(3, 3, 0.05);
  await assert.rejects(provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), (error) => {
    assert.equal(error.code, "busy");
    assert.match(error.message, /^Measuring 9 cells \(r0c0 to r2c2\) of 9: Earth Engine was too busy \("Too many concurrent aggregations\."\)/);
    return true;
  });
  // The same request again BUSY_RETRIES times, never lighter: it is not
  // too much work.
  assert.equal(tries, BUSY_RETRIES + 1);
});

test("out of memory or time: servers full -> the same after 5 s, then lighter after 20 s; too big -> lighter at once", async () => {
  assert.deepEqual(MEMORY_RETRY_MS, [5000, 20000]);
  const full = "Earth Engine memory capacity exceeded.";
  assert.equal(tooMuchWorkKind(new Error(full)), "full");
  assert.equal(tooMuchWorkKind(new Error("User memory limit exceeded.")), "too big");
  assert.equal(tooMuchWorkKind(new Error("Computation timed out.")), "too big");
  assert.equal(tooMuchWorkKind(new GeeError("timeout", "Measuring 9 cells took longer than 300 seconds.")), "too big", "our own time limit");
  assert.equal(tooMuchWorkKind(new Error("Permission denied")), null);
  // Servers full: the same request again after the first pause, then the
  // lighter one after the second; the pauses are waited, in order.
  const tries = [];
  let last = Date.now();
  const log = (how) => {
    tries.push([how, Date.now() - last]);
    last = Date.now();
  };
  const result = await retryTooMuchWork(
    async () => {
      log("same");
      throw new Error(full);
    },
    {
      delays: [40, 120],
      lighter: async () => {
        log("lighter");
        return "lighter";
      },
    },
  );
  assert.equal(result, "lighter");
  assert.deepEqual(tries.map(([how]) => how), ["same", "same", "lighter"]);
  assert.ok(tries[1][1] >= 35 && tries[2][1] >= 110, JSON.stringify(tries));
  // Too big (Earth Engine's limit, or ours: a 5-minute request would take
  // 5 minutes again): never the same request again, the lighter one at once.
  for (const error of [new Error("Computation timed out."), new Error("User memory limit exceeded."), new GeeError("timeout", "took longer than 300 seconds")]) {
    tries.length = 0;
    last = Date.now();
    const out = await retryTooMuchWork(
      async () => {
        log("same");
        throw error;
      },
      {
        delays: [400, 400],
        lighter: async () => {
          log("lighter");
          return "lighter";
        },
      },
    );
    assert.equal(out, "lighter");
    assert.deepEqual(tries.map(([how]) => how), ["same", "lighter"], error.message);
    assert.ok(tries[1][1] < 200, `no pause before the lighter try: ${tries[1][1]} ms`);
  }
  // A lighter request that is too big too: the error, after two tries in all.
  let n = 0;
  await assert.rejects(
    retryTooMuchWork(async () => { n += 1; throw new Error("Computation timed out."); }, { delays: [0, 0], lighter: async () => { n += 1; throw new Error("Computation timed out."); } }),
    /timed out/,
  );
  assert.equal(n, 2);
  // Not too much work: no retry.
  let other = 0;
  await assert.rejects(retryTooMuchWork(async () => { other += 1; throw new Error("Permission denied"); }, { delays: [0, 0] }), /Permission denied/);
  assert.equal(other, 1);
  // Without a lighter request: servers full, three tries of the same;
  // too big, one.
  let same = 0;
  await assert.rejects(retryTooMuchWork(async () => { same += 1; throw new Error(full); }, { delays: [0, 0] }), /capacity/);
  assert.equal(same, 3);
  let big = 0;
  await assert.rejects(retryTooMuchWork(async () => { big += 1; throw new Error("Computation timed out."); }, { delays: [0, 0] }), /timed out/);
  assert.equal(big, 1);
});

test("a chunk that times out every time: no second 5-minute try, split at once, then a clear error", async () => {
  const sizesSeen = [];
  const { provider } = fakeProvider({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (!isChunk) return null;
      sizesSeen.push(Math.max(...request.find("toList").map((n) => Number(n.args?.[0]) || 0)));
      // "Deadline exceeded" reads as our own time limit (GeeError "timeout").
      return "Deadline exceeded";
    },
  });
  const { area, cells } = gridArea(3, 3, 0.05);
  await assert.rejects(provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), (error) => error.code === "timeout");
  // The whole chunk once, then its first half at once (never the same
  // 9 cells again), down to the smallest piece, which fails once with
  // coarser pixels and stops the month.
  assert.equal(sizesSeen[0], 9);
  assert.equal(sizesSeen.filter((n) => n === 9).length, 1, JSON.stringify(sizesSeen));
  assert.equal(sizesSeen[1], 5);
  assert.ok(sizesSeen.length <= 4, JSON.stringify(sizesSeen));
});

test("a group of cells that runs past our 5-minute limit is split: the library's own deadline comes a minute later", async (t) => {
  mockClock(t);
  const isChunk = (request) => request.find("reduceRegions").length > 0 && request.has("Dictionary");
  const sizes = [];
  const { ee, provider } = fakeProvider({
    delayMs: (request) => {
      if (!isChunk(request)) return 1;
      const cellsIn = Math.max(...request.find("toList").map((n) => Number(n.args?.[0]) || 0));
      sizes.push(cellsIn);
      // The whole group would take 10 minutes; each half takes 2 s.
      return cellsIn === 9 ? 10 * 60 * 1000 : 2000;
    },
  });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await settle(t, provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), { step: 1000 });
  // The library is given a deadline a minute after our longest limit.
  assert.deepEqual(ee.callsNamed("data.setDeadline").map((c) => c.args[0]), [EE_DEADLINE_MS]);
  assert.ok(EE_DEADLINE_MS > CHUNK_TIMEOUT_MS && COUNT_TIMEOUT_MS < EE_DEADLINE_MS);
  // So at 5 minutes our own limit ends the group (too big): it is split at
  // once, never sent again whole. (With the deadline at 5 minutes the
  // library's "HTTP code: -1" came first: the same 9 cells again, then the
  // month failed.)
  assert.deepEqual(sizes, [9, 5, 4]);
  assert.equal(result.readings.length, 9);
  assert.ok(result.warnings.some((w) => /asked again: Measuring cells \(1 retry\)/.test(w)), JSON.stringify(result.warnings));
  // A real dropped connection (before our limit) is still sent again as it is.
  assert.equal(isTransientError(explainGeeError(new Error("Server returned HTTP code: -1 for POST https://earthengine.googleapis.com/v1/projects/test-proj/value:compute"))), true);
});

test("an image check may take 4 minutes; past that, its counts go one by one at once", async (t) => {
  mockClock(t);
  const isWholeCheck = (request) => !request.find("reduceRegions").length && request.has("Dictionary");
  const singleCounts = (ee) => ee.requests.filter((request) => request.node.op === "size").length;
  const { area, cells } = gridArea(3, 3, 0.05);
  // 3 minutes (past the 2 minutes it had before): answered as it is.
  const slow = fakeProvider({ delayMs: (request) => (isWholeCheck(request) ? 3 * 60 * 1000 : 1) });
  const ok = await settle(t, slow.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), { step: 1000 });
  assert.equal(ok.readings.length, 9);
  assert.equal(singleCounts(slow.ee), 0, "no count went on its own");
  // 5 minutes: at 4 our own limit gives it up (too big), and the counts go
  // one per request at once; the month still finishes.
  const slower = fakeProvider({ delayMs: (request) => (isWholeCheck(request) ? 5 * 60 * 1000 : 1) });
  const light = await settle(t, slower.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), { step: 1000 });
  assert.equal(light.readings.length, 9);
  assert.ok(singleCounts(slower.ee) > 10, String(singleCounts(slower.ee)));
  assert.ok(light.warnings.some((w) => /asked again: checking which satellite images exist/.test(w)), JSON.stringify(light.warnings));
  assert.equal(COUNT_TIMEOUT_MS, 4 * 60 * 1000);
});

// The season finder's requests: MODIS NDVI of 2019-2021 (ndviClimatology).
const isSeasonFinder = (request) => request.nodes.some((n) => n.dataset === DATASETS.modisNdvi);

test("a season-finder group that runs past our 5-minute limit is sent once more before the latitude decides", async (t) => {
  mockClock(t);
  const { area, cells } = gridArea(3, 3, 0.05);
  // 5.5 minutes the first time (past our limit, before the library's
  // deadline), 1 s the second. Before, the month took the latitude's
  // season at once.
  let tries = 0;
  const slowOnce = fakeProvider({ delayMs: (request) => (isSeasonFinder(request) ? (tries++ === 0 ? 5.5 * 60 * 1000 : 1000) : 1) });
  const once = await settle(t, slowOnce.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), { step: 1000 });
  assert.equal(tries, 2, "sent once more after our time limit");
  assert.equal(once.readings.length, 9);
  assert.ok(!once.warnings.some((w) => /taken from the latitude/.test(w)), JSON.stringify(once.warnings));
  assert.ok(once.warnings.some((w) => /asked again: Finding the growing season \(1 retry\)/.test(w)), JSON.stringify(once.warnings));
  // Past our limit both times: two tries, then the latitude, and the run
  // says why.
  let always = 0;
  const slow = fakeProvider({ delayMs: (request) => (isSeasonFinder(request) ? (always++, 5.5 * 60 * 1000) : 1) });
  const fallback = await settle(t, slow.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), { step: 1000 });
  assert.equal(always, 2);
  assert.equal(fallback.readings.length, 9);
  assert.ok(fallback.warnings.some((w) => /growing season could not be read from the satellite record \(Finding the growing season took longer than 300 seconds.*it was taken from the latitude/.test(w)), JSON.stringify(fallback.warnings));
  assert.ok(!fallback.warnings.some((w) => /asked again: Finding the growing season/.test(w)), "no 'the readings are the same' for a retry that failed");
  // Any other error is not sent again here (a dropped connection has its
  // own retry: retryTransient).
  let broken = 0;
  const other = fakeProvider({ fail: (request) => (isSeasonFinder(request) ? (broken++, "Image.reduceRegions: broken.") : null) });
  const plain = await settle(t, other.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), { step: 1000 });
  assert.equal(broken, 1);
  assert.ok(plain.warnings.some((w) => /taken from the latitude/.test(w)));
});

test("the season's image check that runs out of memory is tried again, then one count per request (real data: Ukraine, May 2026)", async () => {
  const isSeasonCheck = (request) => !request.find("reduceRegions").length && request.has("Dictionary") && request.find("filterDate").some((n) => n.dataset === DATASETS.sentinel2);
  const singles = {};
  for (const failures of [0, 1, 2]) {
    let failed = 0;
    const single = [];
    const { ee, provider } = fakeProvider({
      fail: (request) => {
        if (isSeasonCheck(request) && failed < failures) return (failed += 1), "Earth Engine memory capacity exceeded.";
        if (!request.has("Dictionary") && request.find("size").length === 1) single.push(request);
        return null;
      },
    });
    const { area, cells } = gridArea(3, 3, 0.05);
    const result = await provider.analyze({ area, cells, month: "2026-05", cellSizeDeg: 0.05 });
    assert.equal(failed, failures);
    assert.equal(result.readings.length, 9);
    // The second retry is lighter: each count its own request.
    singles[failures] = single.length;
    assert.ok(ee.requests.length > 0);
  }
  assert.equal(singles[1], singles[0], "the first retry is the same request");
  assert.ok(singles[2] >= singles[0] + 6, JSON.stringify(singles));
  // Too big ("User memory limit exceeded"): the whole check is not sent
  // again, the counts go one by one at once; still failing, the month fails
  // with the clear error.
  let whole = 0;
  const { provider } = fakeProvider({
    fail: (request) => {
      if (!(!request.find("reduceRegions").length && request.find("filterDate").some((n) => n.dataset === DATASETS.sentinel2))) return null;
      if (isSeasonCheck(request)) whole += 1;
      return "User memory limit exceeded.";
    },
  });
  const { area, cells } = gridArea(2, 2, 0.05);
  await assert.rejects(provider.analyze({ area, cells, month: "2026-05", cellSizeDeg: 0.05 }), (error) => error.code === "too_big");
  assert.ok(whole >= 1 && whole <= 2, `the season check and the area check, each once: ${whole}`);
});

test("a chunk that runs out of memory is first tried again as it is, then split", async () => {
  const sizesSeen = [];
  let failed = 0;
  const { provider } = fakeProvider({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (!isChunk) return null;
      sizesSeen.push(Math.max(...request.find("toList").map((n) => Number(n.args?.[0]) || 0)));
      if (failed < 1) return (failed += 1), "Earth Engine memory capacity exceeded.";
      return null;
    },
  });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(result.readings.length, 9);
  // Once failed, once again with the same 9 cells: no split was needed.
  assert.deepEqual(sizesSeen, [9, 9]);
  assert.ok(result.warnings.some((w) => /ran short of memory or time and was asked again: Measuring cells \(1 retry\)/.test(w)), JSON.stringify(result.warnings));
  // Full twice: the third try is lighter (two halves, same pixels).
  const byId = (list) => Object.fromEntries(list.map((r) => [r.id, r]));
  sizesSeen.length = 0;
  let twice = 0;
  const again = fakeProvider({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (!isChunk) return null;
      sizesSeen.push(Math.max(...request.find("toList").map((n) => Number(n.args?.[0]) || 0)));
      if (twice < 2) return (twice += 1), "Earth Engine memory capacity exceeded.";
      return null;
    },
  });
  const split = await again.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.deepEqual(sizesSeen, [9, 9, 5, 4]);
  assert.ok(!split.warnings.some((w) => /coarser pixels/.test(w)));
  assert.deepEqual(byId(split.readings), byId(result.readings));
  // Too big ("Computation timed out"): split at once, never the same again.
  sizesSeen.length = 0;
  let once = 0;
  const big = fakeProvider({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (!isChunk) return null;
      sizesSeen.push(Math.max(...request.find("toList").map((n) => Number(n.args?.[0]) || 0)));
      if (once < 1) return (once += 1), "Computation timed out.";
      return null;
    },
  });
  const halves = await big.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.deepEqual(sizesSeen, [9, 5, 4]);
  assert.deepEqual(byId(halves.readings), byId(result.readings));
});

test("a chunk that fails with an Earth Engine internal error is tried once more as it is (real data: Ukraine, August 2026)", async () => {
  const internal = "An internal error has occurred (request: a703f526-9f21-4176-8d2d-408e40eb6168).";
  let failed = 0;
  const ee = createFakeEe({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (isChunk && failed === 0) return (failed += 1), internal;
      return null;
    },
  });
  const provider = createGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(failed, 1);
  assert.equal(result.readings.length, 9);
  assert.ok(result.warnings.some((w) => /internal error/.test(w)), JSON.stringify(result.warnings));
  // Twice in a row: the month fails.
  const twice = createGeeProvider({ ee: createFakeEe({ fail: (request) => (request.find("reduceRegions").length > 0 && request.has("Dictionary") ? internal : null) }), getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  await assert.rejects(twice.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), /internal error/);
});

test("GAUL's \"Administrative unit not available\" is dropped from place names", async () => {
  const { provider } = fakeProvider({ gaul2: [{ ADM0_NAME: "Ukraine", ADM1_NAME: "Kharkivs'ka", ADM2_NAME: "Administrative unit not available", ADM2_CODE: 31899 }] });
  const { area, cells } = gridArea(2, 2, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(result.readings.length, 4);
  for (const reading of result.readings) {
    assert.equal(reading.admin1, "Kharkivs'ka");
    assert.equal(reading.admin2, undefined, "the placeholder is not a place name");
    assert.equal(placeLabel(reading), "Kharkivs'ka");
  }
  for (const alert of result.alerts) assert.doesNotMatch(alert.place || "", /not available/i);
});

test("a chunk that fails twice stops the analysis with a clear error", async () => {
  const { provider } = fakeProvider({ fail: (request) => (request.has("Dictionary") && request.find("reduceRegions").length ? "Computation timed out." : null) });
  const { area, cells } = gridArea(2, 2, 0.05);
  await assert.rejects(provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), (error) => {
    assert.ok(error instanceof GeeError);
    assert.equal(error.code, "too_big");
    return true;
  });
});

test("once a group of cells has failed, the month sends no further group", async () => {
  // 900 small cells: 4 groups of at most 250, two at a time. The first
  // fails with an error nothing tries again; the second was out already.
  const isChunk = (request) => request.find("reduceRegions").length > 0 && request.has("Dictionary");
  let first = null;
  const { ee, provider } = fakeProvider({
    delayMs: (request) => {
      if (isChunk(request) && !first) first = request;
      return isChunk(request) ? 20 : 1;
    },
    fail: (request) => (request === first ? "Image.reduceRegions: Collection.reduceRegions: Error in map(ID=r0c0): broken." : null),
  });
  const { area, cells } = gridArea(20, 45, 0.01);
  await assert.rejects(provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 }), /broken/);
  // Anything the month still had queued would go out within these 100 ms.
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(meanRequests(ee).length, 2, "the failed group and the one already out, not all 4");
});

test("an Earth Engine without maxPixelsPerRegion still works", async () => {
  const { ee, provider } = fakeProvider({
    fail: (request) =>
      request.find("reduceRegions").some((n) => n.args[0]?.maxPixelsPerRegion) ? "Image.reduceRegions: Unrecognized argument type for 'maxPixelsPerRegion'." : null,
  });
  const { area, cells } = gridArea(2, 2, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(result.readings.length, 4);
  assert.ok(ee.callsNamed("Image.reduceRegions").some((c) => !("maxPixelsPerRegion" in c.args[0])));
});

test("the current month never asks for future images", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(2, 2, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-10", cellSizeDeg: 0.01 });
  const dates = filterDates(ee);
  assert.ok(dates.length > 5);
  for (const [start, end] of dates) {
    assert.ok(start <= TODAY && end <= TODAY, `${start}..${end}`);
  }
  // FIRMS since the invasion stops at today too, and the normal years'
  // fires (2019-2021) are subtracted.
  assert.ok(dates.some(([start, end]) => start === "2022-02-24" && end === TODAY));
  assert.ok(dates.some(([start, end]) => start === "2019-01-01" && end === "2022-01-01"));
  assert.ok(result.warnings.some((w) => /not over yet/.test(w)));
  for (const alert of result.alerts) assert.ok(alert.date < TODAY);
});

// ---------- Anywhere on Earth ----------

const hasWindow = (ee, start, end) => filterDates(ee).some(([a, b]) => a === start && b === end);

// The date windows of one dataset in the measuring request ("start..end").
const measuredWindows = (ee, dataset) => {
  const [request] = meanRequests(ee);
  return new Set(request.find("filterDate").filter((n) => n.dataset === dataset).map((n) => n.args.join("..")));
};

test("two months of one season give the same heavy damage, and no made-up new damage", async () => {
  const { area, cells } = gridArea(3, 3, 0.01);
  const grid = cells.map((cell) => ({ ...cell, areaHa: 100 }));
  const runFor = async (month) => {
    const { ee, provider } = fakeProvider();
    const result = await provider.analyze({ area, cells, month, cellSizeDeg: 0.01 });
    return {
      run: buildRun({ area, month, provider: "gee", ...result, cellSizeDeg: 0.01, cells: grid }),
      radar: measuredWindows(ee, DATASETS.sentinel1),
      fires: measuredWindows(ee, DATASETS.firms),
    };
  };
  const jul = await runFor("2026-07");
  const aug = await runFor("2026-08");
  const sep = await runFor("2026-09");
  const oct = await runFor("2026-10");
  // The damage radar is the same in July, August and September 2026: each
  // complete war season, April to September 2022 to 2025 (the fake's NDVI
  // peaks in July), against the same season of 2019-2021.
  const war = ["2022-04-01..2022-10-01", "2023-04-01..2023-10-01", "2024-04-01..2024-10-01", "2025-04-01..2025-10-01"];
  const normal = ["2019-04-01..2019-10-01", "2020-04-01..2020-10-01", "2021-04-01..2021-10-01"];
  const seasonal = (set) => [...set].filter((w) => daysBetween(...w.split("..")) > 120 && daysBetween(...w.split("..")) < 200).sort();
  for (const run of [jul, aug, sep]) assert.deepEqual(seasonal(run.radar), [...normal, ...war].sort());
  assert.deepEqual(jul.run.imagery, { from: "2022-04", to: "2025-09", label: "April to September of 2022 to 2025", seasons: 4 });
  assert.deepEqual(jul.run.imagery, sep.run.imagery);
  // October: the 2026 season is complete and joins (the only way the radar
  // evidence changes).
  assert.deepEqual(seasonal(oct.radar), [...normal, ...war, "2026-04-01..2026-10-01"].sort());
  assert.equal(oct.run.imagery.seasons, 5);
  // Fire: the war years from 24 February 2022; the whole years are the
  // same in July and August, the year not over yet runs a month longer.
  const years = ["2022-02-24..2023-02-24", "2023-02-24..2024-02-24", "2024-02-24..2025-02-24", "2025-02-24..2026-02-24"];
  for (const w of years) assert.ok(jul.fires.has(w) && aug.fires.has(w), w);
  assert.ok(jul.fires.has("2026-02-24..2026-08-01") && aug.fires.has("2026-02-24..2026-09-01"));
  assert.ok(aug.fires.has("2019-01-01..2022-01-01"), "the normal years' count");
  assert.equal(jul.run.totals.heavyDamageHa, aug.run.totals.heavyDamageHa);
  assert.ok(jul.run.totals.heavyDamageHa > 0);
  // Heavy damage is the paper's rule (radar, fire), never the health index.
  assert.ok(sep.run.cells.every((cell) => Number.isFinite(cell.radar)));
  assert.deepEqual(sep.run.method.components.damage, ["firms", "radar"]);
  assert.equal(sep.run.method.version, METHOD_VERSION);
  assert.ok(sep.run.conflict?.id === "ukraine-2022");
});

// A one-pixel evaluator of the fake's image graph: the pixel's
// neighbourhood looks like the pixel (so 5 km smoothing and "within 1 km"
// leave it as it is), FIRMS counts come from the days it burned, Sentinel-1
// medians from its VV in each window, every other step is the arithmetic
// the graph holds (masked = null). So the Earth Engine arithmetic is
// checked against method.js, not just which windows were asked for.
//   firesOn  the days ("YYYY-MM-DD") the pixel burned
//   vv       (window) => its median VV (dB) in that window, or null
//   leaves   { dataset: value } for single images (WorldCover: 40, cropland)
function pixelEvaluator(ee, { firesOn = [], vv = () => null, leaves = {} } = {}) {
  const nodeOf = (x) => ee.nodeOf(x) || x;
  const windowsOf = (node) => {
    if (node.op === "merge") return [...windowsOf(node.parent), ...windowsOf(nodeOf(node.args[0]))];
    for (let n = node; n; n = n.parent) if (n.op === "filterDate") return [{ start: n.args[0], end: n.args[1] }];
    return [];
  };
  const datasetOf = (node) => {
    for (let n = node; n; n = n.parent) if (n.dataset) return n.dataset;
    return null;
  };
  const value = (x) => {
    if (typeof x === "number" || x === null || x === undefined) return x;
    const node = nodeOf(x);
    const p = () => value(node.parent);
    const a = (i = 0) => value(node.args[i]);
    const both = (f) => {
      const l = p();
      const r = a();
      return l === null || r === null ? null : f(l, r);
    };
    switch (node.op) {
      case "Image.constant":
        return node.args[0];
      case "count":
        assert.equal(datasetOf(node.parent), DATASETS.firms);
        return windowsOf(node.parent).reduce((sum, w) => sum + firesOn.filter((d) => d >= w.start && d < w.end).length, 0);
      case "median": {
        const list = windowsOf(node.parent).map(vv).filter((v) => v !== null).sort((x1, x2) => x1 - x2);
        if (!list.length) return null;
        const mid = Math.floor(list.length / 2);
        return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
      }
      case "first":
        return leaves[datasetOf(node.parent)] ?? null;
      case "select":
      case "rename":
      case "setDefaultProjection":
      case "reproject":
      case "focal_mean":
      case "focal_max":
        return p();
      case "abs": {
        const v = p();
        return v === null ? null : Math.abs(v);
      }
      case "unmask": {
        const v = p();
        return v === null ? (node.args[0] ?? 0) : v;
      }
      case "updateMask": {
        const v = p();
        const m = a();
        return m === null || !m ? null : v;
      }
      case "where": {
        const v = p();
        return a(0) ? a(1) : v;
      }
      case "add":
        return both((l, r) => l + r);
      case "subtract":
        return both((l, r) => l - r);
      case "multiply":
        return both((l, r) => l * r);
      case "max":
        return both((l, r) => Math.max(l, r));
      case "min":
        return both((l, r) => Math.min(l, r));
      case "gt":
        return both((l, r) => (l > r ? 1 : 0));
      case "gte":
        return both((l, r) => (l >= r ? 1 : 0));
      case "lt":
        return both((l, r) => (l < r ? 1 : 0));
      case "eq":
        return both((l, r) => (l === r ? 1 : 0));
      case "and":
        return both((l, r) => (l && r ? 1 : 0));
      case "or":
        return both((l, r) => (l || r ? 1 : 0));
      default:
        throw new Error(`pixelEvaluator: no rule for ${node.op}`);
    }
  };
  return value;
}

test("the Earth Engine graph works out the same evidence as method.js: worst fire year, fire nearby, radar persistence, heavy damage", async () => {
  const ukraine = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const { area, cells } = gridArea(3, 3, 0.01);
  const days = (month, n, from = 1) => Array.from({ length: n }, (_, i) => `${month}-${String(from + i).padStart(2, "0")}`);
  const normalYears = (perYear) => ["2019", "2020", "2021"].flatMap((y) => perYear(y));
  // Pixel histories (VV change per war season by the year it ends; 0.3 dB
  // is an ordinary year).
  const pixels = {
    // Burned and cratered in 2022, still marked in 2023, ordinary since
    // (the reviewer's case): once heavy, it stays heavy as the ordinary
    // seasons 2024-2026 join.
    hitIn2022: { fires: [...days("2022-07", 10), ...normalYears((y) => [`${y}-08-10`])], change: { 2022: 4.5, 2023: 2.6 } },
    // Cratered in 2022 and 2023, never a fire: heavy, and it stays heavy.
    craters: { fires: [], change: { 2022: 4, 2023: 3.5 } },
    // One season of 4 dB, no fire: rotation, never heavy.
    rotation: { fires: [], change: { 2024: 4 } },
    // One season of 4 dB next to the war's fires: still one season only.
    burntOnce: { fires: days("2024-08", 12), change: { 2024: 4 } },
    // Spring burning just as in 2019-2021 (10 fire days each March), war
    // or not: never an unusual fire, whatever the month.
    springBurning: { fires: ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"].flatMap((y) => days(`${y}-03`, 10)), change: { 2023: 2.5, 2025: 2.5 } },
    // The front: burned hard in 2022-2023, abandoned since.
    front: { fires: [...days("2022-08", 20), ...days("2023-06", 15), "2025-05-02"], change: { 2022: 2.4, 2023: 2.2, 2024: 1.0 } },
  };
  const before = -12;
  const vvOf = (pixel) => (w) => (w.start < "2022-01-01" ? before : before + (pixel.change[Number(w.end.slice(0, 4))] ?? 0.3));
  const last = {};
  const months = [];
  for (let m = "2022-10"; m <= "2026-10"; m = addMonths(m, 1)) months.push(m);
  for (const month of months) {
    const { ee, provider } = fakeProvider();
    await provider.analyze({ area, cells, month, cellSizeDeg: 0.01, conflict: ukraine });
    const [request] = meanRequests(ee);
    const named = (name) => request.nodes.find((n) => n.op === "rename" && n.args[0] === name);
    const w = monthWindows(month, TODAY, { lat: 49.8, conflict: ukraine, peakMonth: 7 });
    for (const [name, pixel] of Object.entries(pixels)) {
      const value = pixelEvaluator(ee, { firesOn: pixel.fires, vv: vvOf(pixel), leaves: { [DATASETS.worldCover]: 40 } });
      // Fire: one band per war year = fires that year - a normal year.
      const count = (start, end) => pixel.fires.filter((d) => d >= start && d < end).length;
      const base = count("2019-01-01", "2022-01-01");
      const perYear = w.fireYears.map((y) => count(y.start, y.end));
      const fx = w.fireYears.map((_, i) => value(named(`fx${i}`)));
      fx.forEach((v, i) => assert.ok(Math.abs(v - (perYear[i] - base / 3)) < 1e-9, `${name} ${month} fx${i}: ${v}`));
      const worst = worstFireYear(perYear, base, w.fireYears).excess;
      assert.ok(Math.abs(Math.max(0, ...fx) - worst) < 1e-9, `${name} ${month}`);
      const fireNear = w.fireYears.some((y, i) => perYear[i] > 0 && perYear[i] - base / 3 > 0);
      assert.equal(value(named("fireNear")), fireNear ? 1 : 0, `${name} ${month} fireNear`);
      // Radar: each war season against 2019-2021; heavy = method.js's rule.
      const changes = w.radarSeasons.map((season) => Math.abs(vvOf(pixel)(season) - before));
      const heavy = value(named("heavy"));
      assert.equal(heavy, heavyDamagePixel({ radarDb: changes, fireNear, atWar: true }) ? 1 : 0, `${name} ${month} heavy`);
      assert.ok(Math.abs(value(named("radarDb")) - radarPersistence(changes).level) < 1e-9, `${name} ${month} radarDb`);
      // Never falls from one month to the next (from two war seasons on).
      if (last[name]) {
        if (changes.length > 2) assert.ok(heavy >= last[name].heavy, `${name} healed in ${month}`);
        assert.ok(worst >= last[name].worst - 1e-9, `${name} fire evidence fell in ${month}`);
      }
      last[name] = { heavy, worst };
      if (name === "springBurning") assert.equal(worst, 0, `spring burning as usual is no excess (${month})`);
    }
  }
  assert.deepEqual(Object.fromEntries(Object.entries(last).map(([name, v]) => [name, v.heavy])), { hitIn2022: 1, craters: 1, rotation: 0, burntOnce: 0, springBurning: 0, front: 1 });
});

test("fire evidence is the worst war year: one excess per year, the cell's largest kept", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(2, 2, 0.01);
  await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  const w = monthWindows("2026-08", TODAY, { lat: 49.7, conflict: { id: "ukraine-2022", name: "U", since: "2022-02-24" }, peakMonth: 7 });
  // One count per war year, and one for 2019-2021 (a normal year is a third of it).
  const fires = measuredWindows(ee, DATASETS.firms);
  for (const year of w.fireYears) assert.ok(fires.has(`${year.start}..${year.end}`), `${year.start}..${year.end}`);
  const factors = ee.calls.filter((c) => c.name === "Image.multiply" && typeof c.args[0] === "number").map((c) => c.args[0]);
  assert.ok(factors.includes(1 / 3));
  // One band per year (fx0, fx1, ...), measured as the cell's mean.
  const bands = new Set(ee.calls.filter((c) => c.name === "Image.rename").map((c) => c.args[0]));
  assert.ok(bands.has("fx0") && bands.has(`fx${w.fireYears.length - 1}`) && !bands.has(`fx${w.fireYears.length}`));
  // The reading is the worst year's excess, never below 0, per 100 km².
  assert.equal(toReading({ id: "a", lat: 49 }, { fx0: 0.02, fx1: 0.31, fx2: -0.4 }, {}, { cellSizeDeg: 0.01 }).firesPer100Km2, 31);
  assert.equal(toReading({ id: "a", lat: 49 }, { fx0: -0.02, fx1: -0.3 }, {}, { cellSizeDeg: 0.01 }).firesPer100Km2, 0);
  assert.equal(toReading({ id: "a", lat: 49 }, { firesExcess: 0.05 }, {}, { cellSizeDeg: 0.01 }).firesPer100Km2, 5, "an older answer");
});

test("the war seasons join for the whole area at once: a group whose season ends earlier waits for the others", async () => {
  // Two groups: one greenest in May (February to July), one in July (April
  // to September). In August 2026 the May group's 2026 season is over, but
  // it joins only in October, with the July group's.
  const { area, cells } = gridArea(2, 2, 0.01);
  const peaks = new Map(cells.map((cell, i) => [cell.id, i < 2 ? 5 : 7]));
  const groups = seasonGroups(cells, peaks, { minShare: 0.1 });
  assert.equal(groups.length, 2);
  for (const month of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    const asOf = monthWindows(month, TODAY).asOf;
    const lists = areaDamageSeasons(groups.map((g) => ({ lat: g.seasonLat, peakMonth: g.peakMonth })), asOf, "2022-02-24");
    const years = lists.map((list) => list.map((s) => s.end.slice(0, 4)).join(","));
    // (February to July 2022 began before the war: not a war season.)
    if (month < "2026-10") assert.deepEqual(years, ["2023,2024,2025", "2022,2023,2024,2025"], month);
    else assert.deepEqual(years, ["2023,2024,2025,2026", "2022,2023,2024,2025,2026"], month);
  }
});

test("heavy damage: strong radar change counts on its own only inside a known war; at peace it needs an unusual fire too", async () => {
  const strong = (ee) => ee.calls.filter((c) => c.name === "Image.gte" && c.args[0] === HEAVY_DAMAGE.radarDb).length;
  const withFire = (ee) => ee.calls.filter((c) => c.name === "Image.gte" && c.args[0] === HEAVY_DAMAGE.radarWithFireDb).length;
  const war = fakeProvider();
  const ukraine = gridArea(3, 3, 0.01);
  await war.provider.analyze({ area: ukraine.area, cells: ukraine.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.ok(strong(war.ee) > 0 && withFire(war.ee) > 0);
  // Iowa: a new crop or a ploughed meadow changes the radar by 3 dB too, and
  // harvest fires sit next to 2 dB rotation changes: only strong radar
  // change AND an unusual fire within 1 km count.
  const peace = fakeProvider();
  const iowa = gridArea(3, 3, 0.01, 42.05, -93.65);
  await peace.provider.analyze({ area: iowa.area, cells: iowa.cells, month: "2026-09", cellSizeDeg: 0.01 });
  assert.ok(strong(peace.ee) > 0);
  assert.equal(withFire(peace.ee), 0);

});

test("a peaceful area (Iowa): no war, fully safe everywhere, fires above the normal rate, nothing set aside", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(3, 3, 0.01, 42.05, -93.65);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(result.conflict, null);
  assert.ok(result.warnings.includes(NO_WAR_WARNING), result.warnings.join(" | "));
  assert.ok(!result.warnings.some((w) => /unusual fires/.test(w)));
  // No fighting is made up from farm fires: every cell is 300 km away.
  assert.ok(result.readings.every((r) => r.conflictKm === 300));
  assert.equal(ee.calls.filter((c) => c.name === "Image.focal_mean" && c.args[0] === 10000).length, 0, "no fire-anomaly front");
  assert.equal(result.accessSource, "none");
  assert.equal(ee.calls.filter((c) => c.name === "Image.stratifiedSample").length, 0);
  // Damage: the last two years, minus the place's own 2019-2021 rate.
  assert.ok(hasWindow(ee, "2024-08-31", "2026-09-01"), JSON.stringify(filterDates(ee)));
  assert.ok(hasWindow(ee, "2019-01-01", "2022-01-01"));
  assert.ok(!filterDates(ee).some(([start]) => start === "2022-02-24"), "no war start outside a war");
  // Excess fires per year are worked out for the whole cell (not clamped
  // pixel by pixel, which turned rotating stubble burning and ordinary
  // year-to-year swings into "excess"); the reading is never below 0.
  assert.ok(!ee.calls.some((c) => c.name === "Image.max" && c.args[0] === 0), "no per-pixel clamp");
  assert.ok(ee.calls.some((c) => c.name === "Image.focal_mean" && c.args[0] === 5000), "smoothed over 5 km");
  assert.ok(result.readings.every((r) => r.firesPer100Km2 >= 0));
  // The last complete northern season, April to September 2025, against the
  // same months of 2019-2021.
  for (const year of [2019, 2020, 2021]) assert.ok(hasWindow(ee, `${year}-04-01`, `${year}-10-01`), `baseline ${year}`);

  const grid = cells.map((cell) => ({ ...cell, areaHa: 100 }));
  const run = buildRun({ area, month: "2026-08", provider: "gee", ...result, cellSizeDeg: 0.01, cells: grid });
  assert.equal(run.conflict, null);
  assert.ok(run.cells.every((cell) => cell.distance === 1));
  assert.ok(run.checks.warnings.includes(NO_WAR_WARNING));
  const { places } = scorePlaces(run.cells, {});
  assert.equal(places.filter((p) => p.nearTerm.tier === "setAside").length, 0, "nothing set aside at peace");
});

test("a southern-hemisphere area (the Pampas): the season crosses the new year", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(2, 2, 0.01, -34.88, -60.97);
  const result = await provider.analyze({ area, cells, month: "2026-01", cellSizeDeg: 0.01 });
  assert.equal(result.readings.length, 4);
  assert.equal(result.conflict, null);
  // The last complete season: October 2024 to March 2025 (the fake's NDVI
  // peaks in January there); the normal years END in 2019, 2020 and 2021.
  assert.ok(hasWindow(ee, "2024-10-01", "2025-04-01"), JSON.stringify(filterDates(ee)));
  for (const year of [2019, 2020, 2021]) assert.ok(hasWindow(ee, `${year - 1}-10-01`, `${year}-04-01`), `baseline ${year}`);
  assert.ok(!filterDates(ee).some(([start, end]) => end > "2022-01-01" && end <= "2022-12-31"), "no normal year reaches into 2022");
  assert.ok(!filterDates(ee).some(([start, end]) => /-04-01$/.test(start) && daysBetween(start, end) > 120), "no northern April season");
  assert.ok(result.warnings.includes(NO_WAR_WARNING));
  const run = buildRun({ area, month: "2026-01", provider: "gee", ...result, cellSizeDeg: 0.01, cells });
  // At peace the damage window is the last two years: one complete season in it.
  assert.deepEqual(run.imagery, { from: "2024-10", to: "2025-03", label: "October 2024 to March 2025", seasons: 1 });
});

test("a tropical area (Kenya): the season is the last 12 months", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(2, 2, 0.01, -0.28, 36.03);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(result.conflict, null);
  // No clear season in the fake's flat tropical NDVI: the 12 whole months
  // before August, and the same 12 months ENDING in each normal year.
  assert.ok(hasWindow(ee, "2025-08-01", "2026-08-01"), JSON.stringify(filterDates(ee)));
  for (const year of [2019, 2020, 2021]) assert.ok(hasWindow(ee, `${year - 1}-08-01`, `${year}-08-01`), `baseline ${year}`);
  assert.ok(!hasWindow(ee, "2025-08-01", "2026-09-01"), "never 13 months");
  assert.ok(result.readings.every((r) => r.conflictKm === 300));
});

test("the war given by the job is used as it is (a known war elsewhere)", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(2, 2, 0.01, 13.2, 30.2);
  const sudan = { id: "sudan-2023", name: "War in Sudan", since: "2023-04-15" };
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01, conflict: sudan });
  assert.deepEqual(result.conflict, sudan);
  assert.ok(hasWindow(ee, "2023-04-15", "2026-09-01"));
  assert.ok(!result.warnings.includes(NO_WAR_WARNING));
  assert.ok(result.warnings.some((w) => /unusual fires of the last 12 months/.test(w)));
});

test("no Sentinel-2 or radar images: damage unknown, warnings say so", async () => {
  const { provider } = fakeProvider({ sizes: { [DATASETS.sentinel2]: 0, [DATASETS.sentinel1]: 0 } });
  const { area, cells } = gridArea(3, 3, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.ok(result.readings.every((r) => r.chiDrop === null && r.heavyShare === 0));
  assert.ok(result.warnings.some((w) => /Sentinel-2/.test(w)));
  assert.ok(result.warnings.some((w) => /radar alerts are off/.test(w)));
  assert.ok(result.alerts.every((a) => a.kind === "fire"));
});

test("an unreadable chernozem map falls back to the OpenLandMap black-soil map", async () => {
  const { ee, provider } = fakeProvider({ assets: { [TEST_CFG.chernozemAsset]: "missing" } });
  const { area, cells } = gridArea(1, 1, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(result.readings.length, 1);
  assertReading(result.readings[0], new Set(["r0c0"]));
  assert.ok(result.warnings.some((w) => w.includes("The black-soil map: OpenLandMap USDA soil classes (Mollisols), 250 m was used instead")), result.warnings.join(" | "));
  assert.ok(!ee.callsNamed("Image").some((c) => c.args[0] === TEST_CFG.chernozemAsset));
  assert.ok(ee.callsNamed("Image").some((c) => c.args[0] === DATASETS.blackSoil));
});

test("with GEE_CHERNOZEM_ASSET=none the black-soil map is used, from the map's own class list", async () => {
  const names = ["NODATA", "Argialbolls", "Hapludolls", "Haplustolls", "Argicryolls"];
  const values = [0, 268, 290, 291, 270];
  const assets = { [DATASETS.blackSoil]: { id: DATASETS.blackSoil, type: "IMAGE", bands: [{ id: "grtgroup" }], properties: { grtgroup_class_names: names, grtgroup_class_values: values } } };
  const { ee, provider } = fakeProvider({ assets }, { ...TEST_CFG, chernozemAsset: "none" });
  const { area, cells } = gridArea(1, 1, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assertReading(result.readings[0], new Set(["r0c0"]));
  assert.ok(!result.warnings.some((w) => /zhaobo|chernozem map/i.test(w)), "no asset warning when the asset is none");
  assert.ok(!ee.callsNamed("data.getAsset").some((c) => /zhaobo/.test(c.args[0])), "the asset is not even looked up");
  const remap = ee.callsNamed("Image.remap")[0];
  assert.deepEqual(remap.args[0], [290, 291], "classes read from grtgroup_class_values / names");
  assert.deepEqual(remap.args[1], [1, 1]);
  assert.equal(remap.args[2], 0);
  // SoilGrids SOC fills where the class map has no data.
  assert.ok(ee.callsNamed("Image").some((c) => c.args[0] === "projects/soilgrids-isric/soc_mean"));
  assert.ok(ee.callsNamed("Image.select").some((c) => c.args[0] === "soc_0-5cm_mean"));

  // The map's class list cannot be read: the built-in list is used.
  const fallback = fakeProvider({ assets: { [DATASETS.blackSoil]: "missing" } }, { ...TEST_CFG, chernozemAsset: "none" });
  await fallback.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.deepEqual(fallback.ee.callsNamed("Image.remap")[0].args[0], BLACK_SOIL.classes);

  const soil = await provider.probePoint({ lat: 49.74, lon: 37.54 });
  assert.equal(soil.assetId, null);
  assert.equal(soil.soilSource, BLACK_SOIL_SOURCE);
  assert.equal(soil.blackSoil, 1);
});

test("a rejected key gives clear advice, and regions are searchable", async () => {
  const bad = fakeProvider({ authError: "invalid_grant: Invalid JWT Signature." });
  const status = await bad.provider.status();
  assert.equal(status.ok, false);
  assert.match(status.detail, /rejected the service-account key/);

  const { provider } = fakeProvider();
  assert.deepEqual(await provider.searchAdmin1("kharkiv"), [{ id: "gaul1-3180", name: "Kharkivs'ka", country: "Ukraine" }]);
  const region = await provider.admin1Boundary("gaul1-3180");
  assert.equal(region.name, "Kharkivs'ka");
  assert.equal(region.country, "Ukraine");
  assert.equal(region.geometry.type, "Polygon");
  await assert.rejects(provider.admin1Boundary("gaul1-1"), (error) => error.code === "not_found");
  const soil = await provider.probePoint({ lat: 49.74, lon: 37.54 });
  assert.ok(Number.isFinite(soil.socRaw) && soil.worldCover === 40 && soil.assetId === TEST_CFG.chernozemAsset);
});

test("the stand-in refuses a null inside ee.Dictionary and ee.Algorithms.If", () => {
  const ee = createFakeEe();
  assert.throws(() => ee.Dictionary({ a: null }), /null/);
  assert.throws(() => ee.Algorithms.If(true, 1, null), /null/);
  assert.doesNotThrow(() => ee.Algorithms.If(true, 1, ee.Number(-1)));
});

// ---------- The Atlas gives way to the Field ----------
// (Last in this file: these tests use the shared count of interactive
// requests on a mocked clock. The count starts from nothing in every test:
// beforeEach at the top.)

// An Earth Engine object whose answer the test gives by hand.
function held() {
  const h = { sent: false, callback: null };
  h.object = {
    evaluate: (callback) => {
      h.sent = true;
      h.callback = callback;
    },
  };
  h.answer = (value) => h.callback(value);
  h.fail = (message) => h.callback(undefined, message);
  return h;
}
const background = (extra = {}) => ({ context: { background: true, ...extra } });
// Starts on a mocked clock with nothing counted (beforeEach), past the
// settle time of any earlier request.
async function quietClock(t) {
  mockClock(t);
  await advance(t, YIELD.settleMs);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
}

test("an Atlas request waits while a Field request is out and is sent 3 s after it ends; its time limit starts then", async (t) => {
  await quietClock(t);
  const field = held();
  const fieldDone = evaluate(field.object, { what: "Measuring 8 fields" });
  assert.equal(field.sent, true, "the Field request is sent at once");
  const waits = [];
  const atlas = held();
  const atlasDone = evaluate(atlas.object, { timeoutMs: 60 * 1000, what: "Measuring cells", ...background({ onWait: (on) => waits.push(on) }) });
  assert.deepEqual(yieldStatus(), { interactive: 1, waiting: 1 });
  await advance(t, 2 * 60 * 1000, 1000);
  assert.equal(atlas.sent, false, "nothing new while the Field request is out");
  assert.deepEqual(waits, [true]);
  field.answer("field");
  assert.equal(await fieldDone, "field");
  await advance(t, YIELD.settleMs - 1);
  assert.equal(atlas.sent, false, "not before the settle time");
  await advance(t, 1);
  assert.equal(atlas.sent, true);
  assert.deepEqual(waits, [true, false]);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
  // Its 60 s limit counts from when it was sent, not from when it was asked.
  await advance(t, 59 * 1000, 1000);
  atlas.answer("atlas");
  assert.equal(await atlasDone, "atlas");
  // With nothing interactive out, an Atlas request goes at once.
  await advance(t, YIELD.settleMs);
  const next = held();
  const nextDone = evaluate(next.object, background());
  assert.equal(next.sent, true);
  next.answer(1);
  await nextDone;
});

test("a Field request never waits behind the Atlas", async (t) => {
  await quietClock(t);
  // Atlas requests out: a Field request is still sent at once.
  const out = [held(), held(), held()];
  const outDone = out.map((h) => evaluate(h.object, background()));
  assert.ok(out.every((h) => h.sent));
  const field = held();
  const fieldDone = evaluate(field.object);
  assert.equal(field.sent, true);
  // An Atlas request now waits; another Field request still goes at once.
  const waiting = held();
  const waitingDone = evaluate(waiting.object, background());
  assert.equal(waiting.sent, false);
  const second = held();
  const secondDone = evaluate(second.object);
  assert.equal(second.sent, true);
  assert.deepEqual(yieldStatus(), { interactive: 2, waiting: 1 });
  for (const h of [...out, field, second]) h.answer("ok");
  await Promise.all([...outDone, fieldDone, secondDone]);
  await advance(t, YIELD.settleMs);
  assert.equal(waiting.sent, true);
  waiting.answer("ok");
  await waitingDone;
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("a farmer who keeps Earth Engine busy only slows the Atlas: after 10 minutes its request goes", async (t) => {
  await quietClock(t);
  // Field requests of 3 minutes, one after another, 1 s apart (less than
  // the settle time), for 15 minutes.
  const fieldDone = [];
  const farm = (i) => {
    if (i >= 5) return;
    fieldDone.push(evaluate({ evaluate: (callback) => setTimeout(() => (callback(`field ${i}`), setTimeout(() => farm(i + 1), 1000)), 3 * 60 * 1000) }));
  };
  farm(0);
  const atlas = held();
  const waits = [];
  const atlasDone = evaluate(atlas.object, background({ onWait: (on, info) => waits.push([on, info?.capped]) }));
  await advance(t, YIELD.maxWaitMs - 1000, 1000);
  assert.equal(atlas.sent, false);
  assert.equal(yieldStatus().interactive, 1);
  await advance(t, 1000);
  assert.equal(atlas.sent, true, "the cap: it goes while the farm still works");
  assert.equal(yieldStatus().interactive, 1);
  // It says it went at the limit (the server log says so: analyze).
  assert.deepEqual(waits, [[true, undefined], [false, true]]);
  atlas.answer("atlas");
  assert.equal(await atlasDone, "atlas");
  await advance(t, 6 * 60 * 1000, 1000);
  assert.deepEqual(await Promise.all(fieldDone), ["field 0", "field 1", "field 2", "field 3", "field 4"]);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("nothing is left counted after errors and time limits", async (t) => {
  await quietClock(t);
  await assert.rejects(evaluate({ evaluate: (callback) => callback(undefined, "Boom") }), /Boom/);
  await assert.rejects(
    evaluate({
      evaluate: () => {
        throw new Error("Thrown while sending");
      },
    }),
    /Thrown while sending/,
  );
  const hanging = evaluate({ evaluate: () => {} }, { timeoutMs: 1000, what: "Hanging" });
  hanging.catch(() => {});
  assert.equal(yieldStatus().interactive, 1);
  await advance(t, 1000);
  await assert.rejects(hanging, /Hanging took longer than 1 seconds/);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
  // A waiting Atlas request that fails once sent, and one that runs out of time.
  await advance(t, YIELD.settleMs);
  const field = held();
  const fieldDone = evaluate(field.object);
  fieldDone.catch(() => {});
  const failing = evaluate({ evaluate: (callback) => callback(undefined, "Atlas boom") }, background());
  failing.catch(() => {});
  const late = evaluate({ evaluate: () => {} }, { timeoutMs: 2000, what: "Atlas hanging", ...background() });
  late.catch(() => {});
  assert.deepEqual(yieldStatus(), { interactive: 1, waiting: 2 });
  field.fail("Field boom");
  await assert.rejects(fieldDone, /Field boom/);
  await advance(t, YIELD.settleMs);
  await assert.rejects(failing, /Atlas boom/);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
  await advance(t, 2000);
  await assert.rejects(late, /Atlas hanging took longer than 2 seconds/);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("two loaded copies of gee.js (the dev server reloads it after an edit) count the same requests", async (t) => {
  const copy = await import(new URL("./gee.js?second-copy", import.meta.url).href);
  assert.notEqual(copy.evaluate, evaluate, "a second copy of the module");
  await quietClock(t);
  // A Field provider made from one copy, the Atlas from the other.
  const field = held();
  const fieldDone = copy.evaluate(field.object);
  const atlas = held();
  const atlasDone = evaluate(atlas.object, background());
  assert.deepEqual(copy.yieldStatus(), { interactive: 1, waiting: 1 });
  await advance(t, 60 * 1000, 1000);
  assert.equal(atlas.sent, false);
  field.answer("f");
  await fieldDone;
  await advance(t, YIELD.settleMs);
  assert.equal(atlas.sent, true);
  atlas.answer("a");
  assert.equal(await atlasDone, "a");
  // And the other way round.
  await advance(t, YIELD.settleMs);
  const field2 = held();
  const field2Done = evaluate(field2.object);
  const atlas2 = held();
  const atlas2Done = copy.evaluate(atlas2.object, background());
  assert.equal(atlas2.sent, false);
  field2.answer("f2");
  await field2Done;
  await advance(t, YIELD.settleMs);
  assert.equal(atlas2.sent, true);
  atlas2.answer("a2");
  await atlas2Done;
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("with the fake Earth Engine: an Atlas month sends nothing while a farm is analyzed and says it waits; the farm is not slowed", async (t) => {
  await quietClock(t);
  const fieldCfg = { ...TEST_CFG, geeCredentials: { client_email: "field@test-proj.iam.gserviceaccount.com", private_key: "test-key" } };
  // Each Field request takes 20 s.
  const farm = createFieldGeeProvider({ ee: createFakeEe({ delayMs: 20 * 1000 }), getConfig: () => fieldCfg, now: () => new Date(`${TODAY}T12:00:00Z`) });
  const fields = [{ id: "fld-1", name: "Field 1", geometry: { type: "Polygon", coordinates: [[[37.54, 49.72], [37.55, 49.72], [37.55, 49.727], [37.54, 49.727], [37.54, 49.72]]] } }];
  // Alone first: how long the farm takes.
  let started = Date.now();
  await settle(t, farm.analyzeFields({ fields, today: TODAY }), { step: 10 });
  const alone = Date.now() - started;
  assert.ok(alone >= 60 * 1000, String(alone));
  await advance(t, YIELD.settleMs);
  // Again, with an Atlas month asked for once the farm's first request is out.
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(3, 3, 0.05);
  const progress = [];
  started = Date.now();
  const farmDone = farm.analyzeFields({ fields, today: TODAY }).then(() => Date.now() - started);
  await advance(t, 1000, 10);
  assert.equal(yieldStatus().interactive, 1);
  const month = provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05, onProgress: (share, message, info) => progress.push({ share, message, info, at: Date.now() - started }) });
  month.catch(() => {});
  const farmTook = await settle(t, farmDone, { step: 10 });
  assert.ok(Math.abs(farmTook - alone) <= 10, `the farm took ${farmTook} ms, alone ${alone} ms`);
  assert.equal(ee.requests.length, 0, "the Atlas sent nothing while the farm was analyzed");
  assert.ok(progress.some((p) => p.info?.waiting === true && p.message === WAITING_MESSAGE), JSON.stringify(progress));
  await advance(t, YIELD.settleMs - 500);
  assert.equal(ee.requests.length, 0);
  const result = await settle(t, month, { step: 100 });
  assert.equal(result.readings.length, 9);
  const resumed = progress.find((p) => p.info?.waiting === false);
  assert.ok(resumed && resumed.at >= farmTook + YIELD.settleMs - 10, JSON.stringify(progress));
  assert.equal(resumed.message, "Finding each place's growing season", "back to the step it waited in");
  assert.ok(progress.every(({ share }, i) => i === 0 || share >= progress[i - 1].share), "progress only goes up");
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

// A Field request whose tries the test answers by hand, through
// retryTransient as field-gee.js sends it (with its interactive context).
function heldWithRetries() {
  const tries = [];
  const context = { projectId: "test-proj" };
  const done = retryTransient(
    () => {
      const h = held();
      tries.push(h);
      return evaluate(h.object, { what: "Measuring 8 fields", context });
    },
    TRANSIENT_RETRY_MS,
    context,
  );
  done.catch(() => {});
  return { tries, done };
}
const DROPPED = "Server returned HTTP code: -1 for POST https://earthengine.googleapis.com/v1/projects/test-proj/value:compute";

test("a Field request that waits to be tried again (8 s after a dropped connection) still holds the Atlas back", async (t) => {
  await quietClock(t);
  const field = heldWithRetries();
  field.tries[0].fail(DROPPED);
  // 4 s into the 8 s pause, past the settle time: an Atlas request waits.
  await advance(t, YIELD.settleMs + 1000);
  assert.equal(field.tries.length, 1);
  const atlas = held();
  const atlasDone = evaluate(atlas.object, background());
  assert.equal(atlas.sent, false, "the Field request is about to be tried again");
  assert.deepEqual(yieldStatus(), { interactive: 1, waiting: 1 });
  await advance(t, TRANSIENT_RETRY_MS - YIELD.settleMs - 1000);
  assert.equal(field.tries.length, 2, "tried again after 8 s");
  assert.equal(atlas.sent, false);
  field.tries[1].answer("field");
  assert.equal(await field.done, "field");
  await advance(t, YIELD.settleMs - 50);
  assert.equal(atlas.sent, false, "not before the settle time");
  await advance(t, 50);
  assert.equal(atlas.sent, true, "3 s after the retry answered");
  atlas.answer("atlas");
  assert.equal(await atlasDone, "atlas");
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
  // The Atlas's own retries hold nothing: during its pause a second Atlas
  // request goes at once.
  await advance(t, YIELD.settleMs);
  const own = [];
  const ownDone = retryTransient(
    () => {
      const h = held();
      own.push(h);
      return evaluate(h.object, background());
    },
    TRANSIENT_RETRY_MS,
    background().context,
  );
  own[0].fail(DROPPED);
  await advance(t, 1000);
  assert.equal(yieldStatus().interactive, 0);
  const other = held();
  const otherDone = evaluate(other.object, background());
  assert.equal(other.sent, true);
  other.answer(1);
  await otherDone;
  await advance(t, TRANSIENT_RETRY_MS);
  own[1].answer("again");
  assert.equal(await ownDone, "again");
});

test("a Field request that finds Earth Engine busy holds the Atlas back through its 40 s and 80 s pauses; nothing stays counted when the last try fails too", async (t) => {
  await quietClock(t);
  const busy = "Earth Engine capacity exceeded.";
  const field = heldWithRetries();
  field.tries[0].fail(busy);
  await advance(t, 10 * 1000, 1000);
  const atlas = held();
  const atlasDone = evaluate(atlas.object, background());
  // The first pause: 40 s.
  await advance(t, TRANSIENT_RETRY_MS * BUSY_RETRY_FACTOR - 10 * 1000, 1000);
  assert.equal(field.tries.length, 2);
  assert.equal(atlas.sent, false);
  field.tries[1].fail(busy);
  // The second: 80 s.
  await advance(t, TRANSIENT_RETRY_MS * BUSY_RETRY_FACTOR * 2 - 1000, 1000);
  assert.equal(field.tries.length, 2);
  assert.equal(atlas.sent, false, "not during the 80 s pause either");
  await advance(t, 1000);
  assert.equal(field.tries.length, 3);
  field.tries[2].fail(busy);
  await assert.rejects(field.done, /capacity exceeded/);
  assert.equal(yieldStatus().interactive, 0, "nothing stays counted");
  assert.equal(atlas.sent, false);
  await advance(t, YIELD.settleMs);
  assert.equal(atlas.sent, true, "3 s after the Field gave up");
  atlas.answer(1);
  await atlasDone;
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("with the fake Earth Engine: a farm whose image check drops once and whose passes request finds Earth Engine busy once still holds the Atlas back all through", async (t) => {
  await quietClock(t);
  const fieldCfg = { ...TEST_CFG, geeCredentials: { client_email: "field@test-proj.iam.gserviceaccount.com", private_key: "test-key" } };
  const isImageCheck = (r) => r.has("Dictionary") && !r.find("reduceRegions").length && !r.find("reduceToVectors").length;
  const isPasses = (r) => r.find("select").some((n) => Array.isArray(n.args[0]) && n.args[0].includes("ndyi"));
  let checks = 0;
  let passes = 0;
  // Each Field request takes 20 s; the app's own pauses (8 s after a
  // dropped connection, 40 s when busy) are not shortened.
  const farm = createFieldGeeProvider({
    ee: createFakeEe({
      delayMs: 20 * 1000,
      fail: (r) => {
        if (isImageCheck(r) && checks++ === 0) return DROPPED;
        if (isPasses(r) && passes++ === 0) return "Earth Engine capacity exceeded.";
        return null;
      },
    }),
    getConfig: () => fieldCfg,
    now: () => new Date(`${TODAY}T12:00:00Z`),
  });
  const fields = [{ id: "fld-1", name: "Field 1", geometry: { type: "Polygon", coordinates: [[[37.54, 49.72], [37.55, 49.72], [37.55, 49.727], [37.54, 49.727], [37.54, 49.72]]] } }];
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(3, 3, 0.05);
  const farmDone = farm.analyzeFields({ fields, today: TODAY });
  await advance(t, 1000, 10);
  const month = provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  month.catch(() => {});
  await settle(t, farmDone, { step: 100 });
  assert.equal(checks, 2, "the image check was tried again");
  assert.equal(passes, 2, "so was the passes request");
  // Before, the Atlas went 3 s into each pause.
  assert.equal(ee.requests.length, 0, "the Atlas sent nothing until the farm was done");
  const result = await settle(t, month, { step: 100 });
  assert.equal(result.readings.length, 9);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("an Atlas month's asset reads wait for a Field request too", async (t) => {
  await quietClock(t);
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(3, 3, 0.05);
  let field = null;
  const month = provider.analyze({
    area,
    cells,
    month: "2026-08",
    cellSizeDeg: 0.05,
    onProgress: (share, message) => {
      // A farmer's request goes out just as the month checks its images
      // and its soil maps (checkChernozemAsset).
      if (message === "Checking satellite images" && !field) {
        field = held();
        field.done = evaluate(field.object, { what: "Measuring 8 fields" });
      }
    },
  });
  month.catch(() => {});
  await advance(t, 60 * 1000, 1000);
  assert.equal(field?.sent, true);
  assert.equal(ee.callsNamed("data.getAsset").length, 0, "no asset read while the Field request is out");
  field.answer("field");
  await field.done;
  await advance(t, YIELD.settleMs + 100);
  assert.ok(ee.callsNamed("data.getAsset").length >= 1, "read once the Field request had ended");
  const result = await settle(t, month, { step: 100 });
  assert.equal(result.readings.length, 9);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("once a month has failed, its requests not out yet are not sent: a group waiting for a farm, the other half of a split group", async (t) => {
  await quietClock(t);
  // 900 small cells: 4 groups of at most 250, two at a time.
  const { area, cells } = gridArea(20, 45, 0.01);
  const isGroup = (r) => r.find("reduceRegions").some((n) => n.args[0]?.reducer && n.parent.bands?.some((b) => b.name === "chiDrop"));
  const sizeOf = (r) => Math.max(...r.find("toList").map((n) => Number(n.args?.[0]) || 0));

  // 1. Group 1 fails at 200 ms with an error nothing tries again. Group 2
  // answers at 20 ms; just then a farmer's request goes out, so the group
  // after it waits. When the farmer's request ends, that group is not sent.
  let first = null;
  const one = fakeProvider({
    delayMs: (r) => {
      if (!isGroup(r)) return 1;
      if (!first) first = r;
      return r === first ? 200 : 20;
    },
    fail: (r) => (r === first ? "Image.reduceRegions: Collection.reduceRegions: Error in map(ID=r0c0): broken." : null),
  });
  let field = null;
  const month = one.provider.analyze({
    area,
    cells,
    month: "2026-08",
    cellSizeDeg: 0.01,
    onProgress: (share, message) => {
      if (/^Measured/.test(message) && !field) {
        field = held();
        field.done = evaluate(field.object, { what: "Measuring 8 fields" });
      }
    },
  });
  await assert.rejects(settle(t, month, { step: 10 }), /broken/);
  assert.equal(yieldStatus().waiting, 1, "the next group waits for the farmer");
  field.answer("field");
  await field.done;
  await advance(t, YIELD.settleMs + 1000);
  assert.equal(yieldStatus().waiting, 0);
  assert.equal(meanRequests(one.ee).length, 2, "the group that waited was not sent: its month had failed");

  // 2. Group 1 is too big ("User memory limit exceeded"): split at once,
  // its first half takes 1 s. Group 2 fails at 100 ms. The second half is
  // not sent.
  const sizes = [];
  let big = null;
  let broken = null;
  const two = fakeProvider({
    delayMs: (r) => {
      if (!isGroup(r)) return 1;
      sizes.push(sizeOf(r));
      if (!big) return (big = r), 10;
      if (!broken) return (broken = r), 100;
      return 1000;
    },
    fail: (r) => (r === big ? "User memory limit exceeded." : r === broken ? "Image.reduceRegions: Collection.reduceRegions: Error in map(ID=r0c0): broken." : null),
  });
  await assert.rejects(settle(t, two.provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 }), { step: 10 }), /broken/);
  await advance(t, 5000);
  assert.deepEqual(sizes, [250, 250, 125], "the first half of the split group only");
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("a request counted before the count is started again (resetYieldState, for tests) ends against its own count", async (t) => {
  await quietClock(t);
  const old = held();
  const oldDone = evaluate(old.object, { what: "Measuring 8 fields" });
  resetYieldState();
  const fresh = held();
  const freshDone = evaluate(fresh.object, { what: "Measuring 8 fields" });
  assert.equal(yieldStatus().interactive, 1);
  old.answer("old");
  await oldDone;
  assert.equal(yieldStatus().interactive, 1, "the old request does not end the new one");
  fresh.answer("fresh");
  await freshDone;
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("a region search and a region outline count as interactive at the provider: the Atlas holds back while they are out", async (t) => {
  await quietClock(t);
  // Each region request takes 30 s.
  const { provider } = fakeProvider({ delayMs: 30 * 1000 });
  const asks = [
    ["search", () => provider.searchAdmin1("kharkiv"), (value) => assert.deepEqual(value, [{ id: "gaul1-3180", name: "Kharkivs'ka", country: "Ukraine" }])],
    ["outline", () => provider.admin1Boundary("gaul1-3180"), (value) => assert.equal(value.name, "Kharkivs'ka")],
  ];
  for (const [name, ask, check] of asks) {
    const asked = ask();
    asked.catch(() => {});
    await advance(t, 1000, 10);
    assert.equal(yieldStatus().interactive, 1, `${name}: counted while it is out`);
    const atlas = held();
    const atlasDone = evaluate(atlas.object, background());
    await advance(t, 20 * 1000, 1000);
    assert.equal(atlas.sent, false, `${name}: no Atlas request while it is out`);
    check(await settle(t, asked, { step: 100 }));
    assert.equal(yieldStatus().interactive, 0);
    await advance(t, YIELD.settleMs);
    assert.equal(atlas.sent, true, `${name}: the Atlas goes 3 s after it`);
    atlas.answer(1);
    await atlasDone;
    await advance(t, YIELD.settleMs);
  }
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("the server log says how long an Atlas month waited, and when a request went ahead at the 10-minute limit while a farm's request was still out", async (t) => {
  await quietClock(t);
  const warn = t.mock.method(console, "warn", () => {});
  const { provider } = fakeProvider();
  const { area, cells } = gridArea(3, 3, 0.05);
  // Field work out for 15 minutes, from just before the month: one long
  // request here, standing for a farm's requests one after another.
  const field = held();
  const fieldDone = evaluate(field.object, { what: "Measuring 8 fields", timeoutMs: 20 * 60 * 1000 });
  const month = provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  month.catch(() => {});
  await advance(t, 15 * 60 * 1000, 1000);
  field.answer("field");
  await fieldDone;
  const result = await settle(t, month, { step: 100 });
  assert.equal(result.readings.length, 9);
  const lines = warn.mock.calls.map((call) => String(call.arguments[0])).filter((line) => / waited /.test(line));
  assert.equal(lines.length, 2, JSON.stringify(lines));
  // The season finder's request went at the cap, the farmer's still out...
  assert.equal(lines[0], "[chernozem] Test 2026-08: waited 600 s for farm analyses and searches with Earth Engine, then went ahead after the 10-minute limit while they were still out");
  // ...and the image checks then waited for it to end (5 minutes more and
  // the 3 s settle time).
  assert.match(lines[1], /^\[chernozem\] Test 2026-08: waited 30\d s for farm analyses and searches with Earth Engine$/);
});

test("a month that has failed reads no map description, and the black-soil class list is not remembered from such a read", async () => {
  const classList = { id: DATASETS.blackSoil, properties: { grtgroup_class_values: [290, 291], grtgroup_class_names: ["Hapludolls", "Cryolls"] } };
  const ee = createFakeEe({ assets: { [DATASETS.blackSoil]: classList } });
  const remapped = () => ee.callsNamed("Image.remap").at(-1).args[0];
  const failed = newFailure("the month");
  markFailed(failed, new Error("Measuring 9 cells: broken."));
  const refused = await checkChernozemAsset(ee, TEST_CFG.chernozemAsset, { background: true, failed });
  assert.equal(ee.callsNamed("data.getAsset").length, 0, "nothing was read");
  assert.equal(refused.assetId, null);
  assert.match(refused.warning, /^Reading asset projects\/zhaobo\/assets\/chernozem_wrb_ukraine was not sent: the month had already failed\./);
  // Not remembered: the built-in classes for now, and the next month reads
  // the map's own list (then remembers it).
  blackSoilImage(ee);
  assert.deepEqual(remapped(), BLACK_SOIL.classes);
  const next = await checkChernozemAsset(ee, TEST_CFG.chernozemAsset, { background: true, failed: newFailure("the month") });
  assert.equal(next.assetId, TEST_CFG.chernozemAsset);
  assert.deepEqual(ee.callsNamed("data.getAsset").map((c) => c.args[0]), [DATASETS.blackSoil, TEST_CFG.chernozemAsset]);
  blackSoilImage(ee);
  assert.deepEqual(remapped(), [290]);
  await checkChernozemAsset(ee, TEST_CFG.chernozemAsset, { background: true, failed: newFailure("the month") });
  assert.equal(ee.callsNamed("data.getAsset").filter((c) => c.args[0] === DATASETS.blackSoil).length, 1, "read once");
  // A farm's analysis that has failed reads nothing either.
  const farmEe = createFakeEe();
  const farmFailed = newFailure("the farm's analysis");
  markFailed(farmFailed, new Error("Checking satellite images: broken."));
  const farm = await checkChernozemAsset(farmEe, TEST_CFG.chernozemAsset, { projectId: "test-proj", failed: farmFailed });
  assert.equal(farmEe.callsNamed("data.getAsset").length, 0);
  assert.match(farm.warning, /was not sent: the farm's analysis had already failed\./);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("once an analysis has failed, its interactive requests and waits stop counting at once (and never twice), and nothing more of it is sent", async (t) => {
  await quietClock(t);
  const failed = newFailure("the farm's analysis");
  const context = { projectId: "test-proj", failed };
  const out = held();
  const outDone = evaluate(out.object, { what: "Measuring 8 fields", context });
  let release;
  const hold = holdInteractive(() => new Promise((resolve) => (release = resolve)), context);
  // A request that is not part of it (another farmer's search).
  const other = held();
  const otherDone = evaluate(other.object, { what: "Searching regions" });
  assert.equal(yieldStatus().interactive, 3);
  markFailed(failed, new Error("Reading satellite passes for 1 field: broken."));
  assert.equal(yieldStatus().interactive, 1, "only the request of no failed analysis");
  out.answer("late");
  release("late");
  await outDone;
  await hold;
  assert.equal(yieldStatus().interactive, 1, "ending them later changes nothing");
  other.answer("ok");
  await otherDone;
  assert.equal(yieldStatus().interactive, 0);
  const after = held();
  const refused = evaluate(after.object, { what: "Measuring 8 fields", context });
  refused.catch(() => {});
  assert.equal(after.sent, false, "not sent");
  await assert.rejects(refused, (error) => error.code === "stopped" && /^Measuring 8 fields was not sent: the farm's analysis had already failed\.$/.test(error.message));
  // A retry of it is not waited for either: no 8 s pause (the mocked clock
  // does not move here).
  let tries = 0;
  let settled = false;
  const retry = retryTransient(
    async () => {
      tries += 1;
      throw new Error(DROPPED);
    },
    TRANSIENT_RETRY_MS,
    context,
  ).finally(() => (settled = true));
  retry.catch(() => {});
  for (let i = 0; i < 5; i += 1) await flush();
  assert.equal(settled, true, "no pause before giving up");
  await assert.rejects(retry, /HTTP code: -1/);
  assert.equal(tries, 1);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

// One small field for the farm tests below.
const ONE_FIELD = [{ id: "fld-1", name: "Field 1", geometry: { type: "Polygon", coordinates: [[[37.54, 49.72], [37.55, 49.72], [37.55, 49.727], [37.54, 49.727], [37.54, 49.72]]] } }];
const FIELD_CFG = { ...TEST_CFG, geeCredentials: { client_email: "field@test-proj.iam.gserviceaccount.com", private_key: "test-key" } };
const isPassesRequest = (r) => r.find("select").some((n) => Array.isArray(n.args[0]) && n.args[0].includes("ndyi"));
const isMonthlyRequest = (r) => r.find("rename").some((n) => Array.isArray(n.args[0]) && n.args[0][0] === "m0_ndvi");
const isRadarRequest = (r) => r.has("exp");

test("with the fake Earth Engine: a farm's analysis that has failed sends no retry, and its leftover work does not hold the Atlas back", async (t) => {
  await quietClock(t);
  // The monthly values drop at 20 ms (to be tried again 8 s later), the
  // passes request fails for good at 50 ms (so does the farm's analysis),
  // the radar passes drop at 1 s. Before, both dropped requests were sent
  // again after 8 s, and the Atlas waited for them.
  const sent = { passes: 0, monthly: 0, radar: 0 };
  const farm = createFieldGeeProvider({
    ee: createFakeEe({
      delayMs: (r) => {
        if (isPassesRequest(r)) return (sent.passes += 1), 50;
        if (isMonthlyRequest(r)) return (sent.monthly += 1), 20;
        if (isRadarRequest(r)) return (sent.radar += 1), 1000;
        return 1;
      },
      fail: (r) => (isPassesRequest(r) ? "Image.select: Pattern 'B8A' did not match any bands." : isMonthlyRequest(r) || isRadarRequest(r) ? DROPPED : null),
    }),
    getConfig: () => FIELD_CFG,
    now: () => new Date(`${TODAY}T12:00:00Z`),
  });
  const farmDone = farm.analyzeFields({ fields: ONE_FIELD, today: TODAY });
  farmDone.catch(() => {});
  await assert.rejects(settle(t, farmDone, { step: 10 }), /did not match any bands/);
  assert.deepEqual(sent, { passes: 1, monthly: 1, radar: 1 }, "all three were out");
  // The radar request is still out and the monthly values wait to be tried
  // again, but nobody waits for their answers.
  assert.equal(yieldStatus().interactive, 0);
  // An Atlas request asked for 1.9 s later goes 3 s after the failure.
  await advance(t, 1900, 10);
  const atlas = held();
  const atlasDone = evaluate(atlas.object, background());
  await advance(t, 1000, 10);
  assert.equal(atlas.sent, false, "not before the settle time");
  await advance(t, 200, 10);
  assert.equal(atlas.sent, true, "3 s after the farm failed");
  atlas.answer(1);
  await atlasDone;
  // Nothing of the failed farm was sent again: not the radar passes that
  // dropped at 1 s, not the monthly values after their 8 s pause.
  await advance(t, 20 * 1000, 100);
  assert.deepEqual(sent, { passes: 1, monthly: 1, radar: 1 });
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

// A field's history is read in parts, four at once (field-gee.js
// mapLimit); like a farm's analysis, one that has failed sends nothing more
// (stopWhenFailed): the part that dropped is not sent again 8 s later, and
// the parts still out stop holding the Atlas back.
for (const [which, isPart, read] of [
  ["fieldHistory", (r) => r.find("set").some((n) => n.args[0] === "month"), (provider) => provider.fieldHistory({ field: ONE_FIELD[0], from: "2019-01" })],
  ["fieldHistories", isMonthlyRequest, (provider) => provider.fieldHistories({ fields: ONE_FIELD, from: "2019-01" })],
]) {
  test(`with the fake Earth Engine: a field's history (${which}) that has failed sends no retry, and its parts still out do not hold the Atlas back`, async (t) => {
    await quietClock(t);
    // The first part fails for good at 50 ms, the second drops at 20 ms (to
    // be sent again 8 s later), the others answer after 1 s.
    let parts = 0;
    const role = new Map();
    const roleOf = (r) => {
      if (!isPart(r)) return null;
      if (!role.has(r)) role.set(r, ++parts === 1 ? "fails" : parts === 2 ? "drops" : "slow");
      return role.get(r);
    };
    const farm = createFieldGeeProvider({
      ee: createFakeEe({
        delayMs: (r) => ({ fails: 50, drops: 20, slow: 1000 })[roleOf(r)] ?? 1,
        fail: (r) => (roleOf(r) === "fails" ? "Image.select: Pattern 'B8' did not match any bands." : roleOf(r) === "drops" ? DROPPED : null),
      }),
      getConfig: () => FIELD_CFG,
      now: () => new Date(`${TODAY}T12:00:00Z`),
    });
    const done = read(farm);
    done.catch(() => {});
    await assert.rejects(settle(t, done, { step: 10 }), /did not match any bands/);
    const sent = parts;
    assert.ok(sent >= 3, `parts out at once: ${sent}`);
    // The slow parts are still out, but nobody waits for their answers.
    assert.equal(yieldStatus().interactive, 0);
    await advance(t, 20 * 1000, 100);
    assert.equal(parts, sent, "the part that dropped was not sent again, and no new part was started");
    assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
  });
}

test("a farm's map description read that is still out when the analysis fails stops holding the Atlas back too", async (t) => {
  await quietClock(t);
  // The image check fails for good at 10 ms; the soil map reads take 30 s.
  const isImageCheck = (r) => r.has("Dictionary") && !r.find("reduceRegions").length;
  const farm = createFieldGeeProvider({
    ee: createFakeEe({ assetDelayMs: 30 * 1000, delayMs: (r) => (isImageCheck(r) ? 10 : 1), fail: (r) => (isImageCheck(r) ? "Image.select: Pattern 'B8A' did not match any bands." : null) }),
    getConfig: () => FIELD_CFG,
    now: () => new Date(`${TODAY}T12:00:00Z`),
  });
  const farmDone = farm.analyzeFields({ fields: ONE_FIELD, today: TODAY });
  farmDone.catch(() => {});
  await advance(t, 5, 1);
  // The image check (its request, and its hold for a retry: retryTransient)
  // and a map read.
  assert.equal(yieldStatus().interactive, 3);
  await assert.rejects(settle(t, farmDone, { step: 1 }), /did not match any bands/);
  assert.equal(yieldStatus().interactive, 0, "the map read still out holds nothing back");
  await advance(t, 31 * 1000, 1000);
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

test("a farm's map description reads and a field's GeoTIFF link count as interactive: the Atlas holds back while they are out", async (t) => {
  await quietClock(t);
  // Each map description read takes 30 s (the black-soil class list, then
  // the chernozem map); every other request 1 ms.
  const farm = createFieldGeeProvider({ ee: createFakeEe({ assetDelayMs: 30 * 1000 }), getConfig: () => FIELD_CFG, now: () => new Date(`${TODAY}T12:00:00Z`) });
  const farmDone = farm.analyzeFields({ fields: ONE_FIELD, today: TODAY });
  farmDone.catch(() => {});
  await advance(t, 1000, 10);
  assert.equal(yieldStatus().interactive, 1, "the image check has answered; a map read is out");
  const atlas = held();
  const atlasDone = evaluate(atlas.object, background());
  await advance(t, 50 * 1000, 1000);
  assert.equal(atlas.sent, false, "no Atlas request while the farm's map reads are out");
  const { analyses } = await settle(t, farmDone, { step: 100 });
  assert.ok(analyses[ONE_FIELD[0].id]);
  await advance(t, YIELD.settleMs);
  assert.equal(atlas.sent, true);
  atlas.answer(1);
  await atlasDone;
  await advance(t, YIELD.settleMs);

  // The GeoTIFF link: 60 s to make. (The download itself, when the
  // browser fetches the link, is made by Earth Engine and not seen here.)
  const linker = createFieldGeeProvider({ ee: createFakeEe({ delayMs: (r) => (r.download ? 60 * 1000 : 1) }), getConfig: () => FIELD_CFG, now: () => new Date(`${TODAY}T12:00:00Z`) });
  const link = linker.geotiffUrl({ field: ONE_FIELD[0], latestPassDate: "2026-10-10" });
  link.catch(() => {});
  await advance(t, 1000, 10);
  assert.equal(yieldStatus().interactive, 1, "the link is being made");
  const atlas2 = held();
  const atlas2Done = evaluate(atlas2.object, background());
  await advance(t, 30 * 1000, 1000);
  assert.equal(atlas2.sent, false);
  const { url } = await settle(t, link, { step: 100 });
  assert.match(url, /^https:\/\/earthengine\.googleapis\.com\//);
  assert.equal(yieldStatus().interactive, 0);
  await advance(t, YIELD.settleMs);
  assert.equal(atlas2.sent, true);
  atlas2.answer(1);
  await atlas2Done;
  assert.deepEqual(yieldStatus(), { interactive: 0, waiting: 0 });
});

// The neighbourhood operations (5 km smoothing, the 1 km ring, distances)
// a measuring request computes at the cells' own pixel size: every one not
// reached through a reproject. For a small area there must be none: at
// the cells' fine pixels they made a month run over 30 minutes (real data,
// south Lebanon, 2026-10-20).
function unpinnedNeighbourhoodOps(ee) {
  const HEAVY = new Set(["focal_mean", "focal_max", "focal_min", "convolve", "reduceNeighborhood", "distance", "fastDistanceTransform"]);
  let count = 0;
  for (const request of ee.requests) {
    if (!request.has("reduceRegions")) continue;
    const seen = new Set();
    const visit = (value) => {
      if (value === null || value === undefined || typeof value === "function") return;
      const node = ee.nodeOf(value) || (value && value.kind && value.op && !Array.isArray(value) ? value : null);
      if (node) {
        if (seen.has(node) || node.op === "reproject") return;
        seen.add(node);
        if (HEAVY.has(node.op)) count += 1;
        visit(node.parent);
        visit(node.body);
        node.args.forEach(visit);
        return;
      }
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(request.node);
  }
  return count;
}

test("small areas: no fire smoothing, ring or distance at the cells' fine pixels; from 300 m pixels everything as before", async () => {
  const war = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const run = async (sizeDeg) => {
    const ee = createFakeEe();
    const provider = createGeeProvider({ ee, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
    const { area, cells } = gridArea(3, 3, sizeDeg, 50.15);
    await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: sizeDeg, conflict: war });
    return ee;
  };
  // Either side of FINE_SCALE_M at 50 N: 0.05 deg cells are measured at
  // about 179 m (pinned), 0.1 deg cells at about 358 m (as before).
  assert.ok(reduceScale(0.05, 50) < FINE_SCALE_M && reduceScale(0.1, 50) >= FINE_SCALE_M);
  for (const size of [0.01, 0.05]) assert.equal(unpinnedNeighbourhoodOps(await run(size)), 0, `${size} deg cells`);
  const coarse = await run(0.1);
  assert.ok(unpinnedNeighbourhoodOps(coarse) > 0, "0.1 deg cells keep their graph");
  assert.equal(coarse.requests.flatMap((r) => r.find("reproject")).filter((n) => [FIRE_GRID_M, RING_GRID_M].includes(n.args?.[0]?.scale)).length, 0);
  // The ring around an unusual fire is drawn on the RING_GRID_M grid, around
  // fire pixels worked out on the 1 km grid.
  const small = await run(0.01);
  const rings = small.requests.flatMap((r) => r.find("reproject")).filter((n) => n.args?.[0]?.scale === RING_GRID_M);
  assert.ok(rings.length > 0);
  assert.ok(rings.every((n) => (small.nodeOf(n.parent) || n.parent)?.op === "focal_max"), JSON.stringify(rings.map((n) => (small.nodeOf(n.parent) || n.parent)?.op)));
});

test("small areas: the fire images and the distance to fighting are worked out on the 1 km grid; bigger areas as before", async () => {
  const war = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const pinned = (ee) =>
    ee.requests
      .filter((r) => r.find("reduceRegions").length > 0 && r.has("Dictionary"))
      .flatMap((r) => r.find("reproject"))
      .filter((n) => n.args?.[0]?.scale === FIRE_GRID_M && n.args?.[0]?.crs === "EPSG:4326");
  // 1 km cells: measured at about 36 m, finer than FINE_SCALE_M.
  assert.ok(reduceScale(0.01, 49.7) < FINE_SCALE_M);
  const small = createFakeEe();
  const smallProvider = createGeeProvider({ ee: small, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const tiny = gridArea(3, 3, 0.01);
  const result = await smallProvider.analyze({ area: tiny.area, cells: tiny.cells, month: "2026-08", cellSizeDeg: 0.01, conflict: war });
  assert.equal(result.readings.length, 9);
  // Every fire-year band, the fire-nearby ring and the distance to fighting.
  assert.ok(pinned(small).length >= 3, `pinned images: ${pinned(small).length}`);
  // 0.1 deg cells (Kharkiv oblast): measured at about 360 m, unchanged.
  assert.ok(reduceScale(0.1, 49.7) >= FINE_SCALE_M);
  const big = createFakeEe();
  const bigProvider = createGeeProvider({ ee: big, getConfig: () => TEST_CFG, now: () => new Date(`${TODAY}T12:00:00Z`), retryDelayMs: 0 });
  const wide = gridArea(3, 3, 0.1);
  await bigProvider.analyze({ area: wide.area, cells: wide.cells, month: "2026-08", cellSizeDeg: 0.1, conflict: war });
  assert.equal(pinned(big).length, 0);
});

test("in a war's first year the fighting-fire floor is scaled to the shorter window", () => {
  const floors = (lastYear) => {
    const ee = createFakeEe();
    const region = ee.Geometry.Rectangle([100, 13, 104, 15], null, false);
    const image = fightingFires(ee, region, { lastYear, fireBaselines: [lastYear] });
    // The gte against a plain number is the floor (the other gte compares two images).
    const node = ee.nodeOf(image);
    const seen = new Set();
    const out = [];
    const visit = (value) => {
      const n = ee.nodeOf(value) || (value && value.kind && value.op ? value : null);
      if (!n || seen.has(n)) return;
      seen.add(n);
      if (n.op === "gte" && typeof n.args?.[0] === "number") out.push(n.args[0]);
      visit(n.parent);
      n.args.forEach((a) => (Array.isArray(a) ? a.forEach(visit) : visit(a)));
    };
    visit(node);
    return out;
  };
  // A whole year: the floor as it was (1 detection per km²).
  assert.deepEqual(floors({ start: "2025-10-01", end: "2026-10-01" }), [1]);
  // 100 days since the war began (Thailand-Cambodia, October 2025): 100/365.
  const [young] = floors({ start: "2025-07-24", end: "2025-11-01" });
  assert.ok(Math.abs(young - 100 / 365) < 1e-9, String(young));
});
