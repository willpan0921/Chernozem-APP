// WHAT THIS FILE DOES
// Tests the damage evidence over time (method.js FIRE_YEARS): the war years
// fire is counted in, the worst war year, the heavy-damage pixel rule with
// radar persistence, the war seasons the radar compares (season.js
// damageSeasons, areaDamageSeasons) and the method version that keeps old
// runs from being compared with new ones.
// The guarantees: at war the evidence never falls from one month to the
// next (for the same radar change per season: gee.js can measure every
// season again from the other orbit direction when a new one joins), and
// two months of the same season differ only when a new war year adds fire
// evidence.
//
// WHO EDITS IT
// Whoever changes the damage rules. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { FIRE_YEARS, HEAVY_DAMAGE, METHOD_VERSION, fireNormal, fireYears, heavyDamagePixel, radarPersistence, runsComparable, worstFireYear } from "./method.js";
import { areaDamageSeasons, damageSeasons } from "../season.js";
import { damageWindow } from "../../config/conflicts.js";

const UKRAINE = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
const pad = (n) => String(n).padStart(2, "0");
const addMonth = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + m - 1 + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
};
const lastDayOf = (month) => new Date(Date.parse(`${addMonth(month, 1)}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
// The damage window of a run month (as gee.js monthWindows has it).
const windowOf = (month, conflict = UKRAINE) => {
  const w = damageWindow(conflict, lastDayOf(month));
  return { start: w.start, end: w.end };
};
const months = (from, to) => {
  const out = [];
  for (let m = from; m <= to; m = addMonth(m, 1)) out.push(m);
  return out;
};

test("the damage window is cut into war years from the day the war began; the year not over yet counts from 3 months", () => {
  const years = fireYears(windowOf("2026-09"));
  assert.deepEqual(years.map((y) => `${y.start}..${y.end}${y.part ? " part" : ""}`), [
    "2022-02-24..2023-02-24",
    "2023-02-24..2024-02-24",
    "2024-02-24..2025-02-24",
    "2025-02-24..2026-02-24",
    "2026-02-24..2026-10-01 part",
  ]);
  assert.ok(years.filter((y) => !y.part).every((y) => y.days >= 365 && y.days <= 366));
  // Years never overlap: each starts where the one before ended.
  for (let i = 1; i < years.length; i += 1) assert.equal(years[i].start, years[i - 1].end);
  // The year not over yet counts once it is 3 months long (FIRE_YEARS.minMonths).
  assert.equal(FIRE_YEARS.minMonths, 3);
  assert.deepEqual(fireYears(windowOf("2022-04")), []);
  assert.deepEqual(fireYears(windowOf("2022-05")).map((y) => y.end), ["2022-06-01"]);
  assert.deepEqual(fireYears(windowOf("2023-04")).map((y) => `${y.start}..${y.end}`), ["2022-02-24..2023-02-24"], "March 2023: the new year is 5 weeks old");
  assert.deepEqual(fireYears(null), []);
  // At peace the window moves: whole years back from its end.
  assert.deepEqual(fireYears({ start: "2024-09-30", end: "2026-10-01" }, { anchor: "end" }).map((y) => `${y.start}..${y.end}`), ["2024-10-01..2025-10-01", "2025-10-01..2026-10-01"]);
  // A normal year: a third of 2019-2021, whatever the year's length.
  assert.equal(fireNormal(9), 3);
  assert.equal(fireNormal(null), 0);
});

test("at war every year of a month is a year of the next month, or grows into it (the evidence can only grow)", () => {
  for (const month of months("2022-05", "2026-08")) {
    const now = fireYears(windowOf(month));
    const next = fireYears(windowOf(addMonth(month, 1)));
    for (const year of now) {
      const later = next.find((y) => y.start === year.start);
      assert.ok(later && later.end >= year.end, `${month}: ${year.start}..${year.end}`);
      if (!year.part) assert.equal(later.end, year.end, `${month}: a whole year never changes`);
    }
  }
});

// The fire days of a made-up pixel per month, 2019-01 to 2026-09, and the
// counts worstFireYear reads for the years of a window.
const DAYS_IN = (month) => Number(lastDayOf(month).slice(8, 10));
const countIn = (perMonth, start, end) => {
  // Fires spread evenly over each month's days.
  let total = 0;
  for (const [month, n] of Object.entries(perMonth)) {
    const first = `${month}-01`;
    const after = `${addMonth(month, 1)}-01`;
    const from = start > first ? start : first;
    const to = end < after ? end : after;
    if (from < to) total += (n * (Date.parse(to) - Date.parse(from))) / 86400000 / DAYS_IN(month);
  }
  return total;
};
const baseOf = (perMonth) => countIn(perMonth, "2019-01-01", "2022-01-01");
const worstAt = (perMonth, month) => {
  const years = fireYears(windowOf(month));
  return worstFireYear(years.map((y) => countIn(perMonth, y.start, y.end)), baseOf(perMonth), years);
};

test("fire that is as seasonal as in 2019-2021 is never excess, at any month (a spring-peaked pixel)", () => {
  // Real FIRMS fire days over central and eastern Ukraine, 2019-2021: most
  // of a year's burning is in spring and late summer. Here 70% in March to
  // May, the rest in August. War years burn exactly like 2019-2021.
  const shape = { "03": 0.25, "04": 0.3, "05": 0.15, "08": 0.3 };
  const perMonth = {};
  for (const month of months("2019-01", "2026-09")) perMonth[month] = 20 * (shape[month.slice(5)] || 0);
  for (const month of months("2022-05", "2026-09")) assert.ok(worstAt(perMonth, month).excess < 1e-9, `${month}: ${worstAt(perMonth, month).excess}`);
  // The rule the reviewer measured (normal = 2019-2021 x days / 365 / 3)
  // counted spring burning in the war's first part year as excess.
  const firstPart = { start: "2022-02-24", end: "2022-09-01" };
  const byDays = baseOf(perMonth) * (Date.parse(firstPart.end) - Date.parse(firstPart.start)) / 86400000 / 365 / 3;
  assert.ok(countIn(perMonth, firstPart.start, firstPart.end) - byDays > 3, "the old share by days found excess");
});

// A made-up pixel history over the war months.
function history(seed) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const front = rand() < 0.5;
  const perMonth = {};
  for (const [i, month] of months("2019-01", "2026-09").entries()) {
    const summer = /-0[7-9]$/.test(month) ? 1 : 0;
    const war = month >= "2022-03";
    if (front && war) perMonth[month] = i < 36 + 18 ? Math.round(6 * rand()) : rand() < 0.1 ? 1 : 0; // burned hard in 2022-2023, then abandoned
    else perMonth[month] = summer && rand() < 0.4 ? Math.round(3 * rand()) : 0; // stubble burning
  }
  return perMonth;
}

test("the worst war year never falls from one month to the next; the old whole-window rule did", () => {
  let oldFell = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const perMonth = history(seed);
    const base = baseOf(perMonth);
    let before = null;
    let oldBefore = null;
    for (const month of months("2022-05", "2026-09")) {
      const worst = worstAt(perMonth, month).excess;
      if (before !== null) assert.ok(worst >= before - 1e-9, `seed ${seed} ${month}: ${worst} < ${before}`);
      before = worst;
      // The old rule: all fires in the window minus the normal rate x its length.
      const w = windowOf(month);
      const days = (Date.parse(w.end) - Date.parse(w.start)) / 86400000;
      const old = Math.max(0, countIn(perMonth, w.start, w.end) - (base / 1096) * days);
      if (oldBefore !== null && old < oldBefore - 1e-9) oldFell += 1;
      oldBefore = old;
    }
  }
  assert.ok(oldFell > 0, "abandoned land made the old evidence fall");
});

test("worstFireYear: the year with the largest excess over a normal year, never below 0", () => {
  const years = fireYears(windowOf("2026-02"));
  const counts = years.map((_, i) => (i === 1 ? 12 : 2));
  const worst = worstFireYear(counts, 9, years);
  assert.equal(worst.fires, 12);
  assert.equal(worst.normal, 3);
  assert.equal(worst.excess, 9);
  assert.deepEqual(worst.year, { start: years[1].start, end: years[1].end });
  // Ordinary burning (as much as in 2019-2021): 0.
  assert.equal(worstFireYear(years.map(() => 3), 9, years).excess, 0);
  // Nothing measured: null; no year long enough yet: 0.
  assert.equal(worstFireYear(null, 9, years).excess, null);
  assert.equal(worstFireYear([], 9, []).excess, 0);
});

test("heavy damage per pixel on the lasting change (two war seasons): 3 dB, or 2 dB next to an unusual fire at war; 3 dB AND a fire at peace", () => {
  assert.deepEqual(HEAVY_DAMAGE, { radarDb: 3, radarWithFireDb: 2, fireNearM: 1000, persistSeasons: 2 });
  const cases = [
    [[3.1, 3.2], false, true, true],
    [[3.1, 0.2], false, true, false], // one season of change: rotation or weather
    [[3.1, 0.2], true, true, false], // ... even next to a fire
    [[3.1], false, true, true], // one season measured: that one
    [[0.2, 2.5, 2.1], true, true, true],
    [[2.5, 2.5], false, true, false],
    [[1.9, 2.5], true, true, false],
    [[3.1, 3.1], false, false, false],
    [[3.1, 3.4], true, false, true],
    [[3.1, 0.1], true, false, false],
    [[2.5, 2.5], true, false, false],
    [[null, null], true, true, false],
    [3.1, true, true, true], // a number = one season
  ];
  for (const [radarDb, fireNear, atWar, heavy] of cases) assert.equal(heavyDamagePixel({ radarDb, fireNear, atWar }), heavy, JSON.stringify({ radarDb, fireNear, atWar }));
  assert.deepEqual(radarPersistence([0.3, 4, 3.5, 0.2]), { persistent: 3.5, peak: 4, level: 3.5 });
  assert.deepEqual(radarPersistence([4]), { persistent: null, peak: 4, level: 4 });
  assert.deepEqual(radarPersistence([null]), { persistent: null, peak: null, level: null });
});

test("a pixel cratered in 2022 and 2023 and ordinary in 2024-2026 stays heavy (a median of the seasons would heal it); one damaged in 2022 alone stops counting when 2023 joins", () => {
  // Damaged in 2022 only: heavy while 2022 is the only war season, not once
  // 2023 joins (the one-to-two step), and not after.
  const once = { 2022: 4.5, 2023: 0.3, 2024: 0.3, 2025: 0.2, 2026: 0.4 };
  for (const month of months("2022-10", "2026-09")) {
    const seasons = damageSeasons(49.5, lastDayOf(month), UKRAINE.since, 7);
    const heavy = heavyDamagePixel({ radarDb: seasons.map((s) => once[Number(s.end.slice(0, 4))]), fireNear: false, atWar: true });
    assert.equal(heavy, seasons.length === 1, `${month}: ${seasons.length} season(s)`);
  }
  const change = { 2022: 4.5, 2023: 3.2, 2024: 0.3, 2025: 0.2, 2026: 0.4 };
  const median = (list) => {
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  let before = null;
  let medianHealed = false;
  for (const month of months("2022-09", "2026-09")) {
    const seasons = damageSeasons(49.5, lastDayOf(month), UKRAINE.since, 7);
    const changes = seasons.map((s) => change[Number(s.end.slice(0, 4))]);
    const heavy = heavyDamagePixel({ radarDb: changes, fireNear: false, atWar: true });
    if (before !== null) assert.ok(heavy >= before, `${month}: healed`);
    before = heavy;
    if (changes.length && median(changes) < HEAVY_DAMAGE.radarDb && heavyDamagePixel({ radarDb: changes, fireNear: false, atWar: true })) medianHealed = true;
  }
  assert.equal(before, true);
  assert.ok(medianHealed, "the median of the seasons fell under 3 dB while the pixel stays heavy");
});

test("heavy damage never falls month to month (from two war seasons on), and months that share their seasons give the same unless a new war year adds fire", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const perMonth = history(seed);
    // A fixed radar change per war season (by the year it ends).
    const changeOf = (year) => 1.6 + ((seed * 7 + year * 3) % 10) / 5; // 1.6 .. 3.4 dB
    let before = null;
    for (const month of months("2022-05", "2026-09")) {
      const seasons = damageSeasons(49.5, lastDayOf(month), UKRAINE.since, 6);
      const fireNear = worstAt(perMonth, month).excess > 0;
      const heavy = heavyDamagePixel({ radarDb: seasons.map((s) => changeOf(Number(s.end.slice(0, 4)))), fireNear, atWar: true });
      // From the second season on (a war's first year has one: its level
      // may fall once when the second joins).
      if (before !== null && before.seasons >= 2) assert.ok(heavy >= before.heavy, `seed ${seed} ${month}`);
      if (before !== null && seasons.length === before.seasons && fireNear === before.fireNear) assert.equal(heavy, before.heavy);
      before = { heavy, seasons: seasons.length, fireNear };
    }
  }
});

test("the radar seasons: every complete war season, one per year; months of one season share them", () => {
  // Ukraine, greenest in June: March to August each year.
  const at = (month) => damageSeasons(49.5, lastDayOf(month), UKRAINE.since, 6).map((s) => `${s.start}..${s.end}`);
  const four = ["2022-03-01..2022-09-01", "2023-03-01..2023-09-01", "2024-03-01..2024-09-01", "2025-03-01..2025-09-01"];
  for (const month of months("2025-10", "2026-08")) assert.deepEqual(at(month), four, month);
  // September 2026: the 2026 season is complete and joins.
  assert.deepEqual(at("2026-09"), [...four, "2026-03-01..2026-09-01"]);
  assert.deepEqual(at("2022-08"), []);
  assert.deepEqual(at("2022-09"), ["2022-03-01..2022-09-01"]);
  // A season that began before the war is not a war season (a war from 15
  // April 2023 in the north: April to September 2023 is left out).
  assert.deepEqual(damageSeasons(30, "2026-08-31", "2023-04-15").map((s) => s.start), ["2024-04-01", "2025-04-01"]);
  // The south: October to March, across the new year.
  assert.deepEqual(damageSeasons(-34.9, "2026-08-31", "2024-08-31").map((s) => `${s.start}..${s.end}`), ["2024-10-01..2025-04-01", "2025-10-01..2026-04-01"]);
  assert.deepEqual(damageSeasons(49.5, "2026-08-31", null), []);
});

test("in the tropics without a peak month a war season is a calendar year: it joins once a year (Sudan)", () => {
  const sudan = "2023-04-15";
  const at = (month) => damageSeasons(15, lastDayOf(month), sudan, null).map((s) => `${s.start}..${s.end}`);
  assert.deepEqual(at("2024-12"), []);
  assert.deepEqual(at("2025-01"), ["2024-01-01..2025-01-01"]);
  // Months 1-11 after a season completes give the same seasons.
  for (const month of months("2025-01", "2025-12")) assert.deepEqual(at(month), ["2024-01-01..2025-01-01"], month);
  for (const month of months("2026-01", "2026-09")) assert.deepEqual(at(month), ["2024-01-01..2025-01-01", "2025-01-01..2026-01-01"], month);
});

test("for an area the seasons join in one month: when the last group's season of that year is over", () => {
  // Ukraine 2026: the squares greenest in May (February to July) and in
  // June (March to August) gain 2026 together, in September.
  const places = [{ lat: 49, peakMonth: 5 }, { lat: 49, peakMonth: 6 }, { lat: 49, peakMonth: 7 }];
  const years = (month) => areaDamageSeasons(places, lastDayOf(month), UKRAINE.since).map((list) => list.map((s) => s.end.slice(0, 4)).join(","));
  for (const month of ["2026-07", "2026-08", "2026-09"]) assert.deepEqual(years(month), ["2023,2024,2025", "2022,2023,2024,2025", "2022,2023,2024,2025"], month);
  assert.deepEqual(years("2026-10"), ["2023,2024,2025,2026", "2022,2023,2024,2025,2026", "2022,2023,2024,2025,2026"]);
  // One place alone: its own season.
  assert.deepEqual(areaDamageSeasons([{ lat: 49, peakMonth: 5 }], "2026-08-31", UKRAINE.since)[0].map((s) => s.end.slice(0, 4)), ["2023", "2024", "2025", "2026"]);
});

test("runs made with another method version are not comparable", () => {
  const now = { provider: "gee", cellSizeKm: 18, method: { version: METHOD_VERSION, components: {}, scales: {} } };
  const before = { provider: "gee", cellSizeKm: 18, method: { components: {}, scales: {} } };
  assert.equal(runsComparable(before, now).reason, "method");
  assert.equal(runsComparable(before, now).text, "Not comparable: different method version");
  assert.equal(runsComparable(now, { ...now }).comparable, true);
});

test("runs made with another war setting are not comparable: at war against at peace, or another start day", () => {
  const base = { provider: "gee", cellSizeKm: 18, method: { version: METHOD_VERSION, components: {}, scales: {} } };
  const listed = { ...base, conflict: { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" } };
  const peace = { ...base, conflict: null };
  const team = { ...base, conflict: { id: "area-x", name: "Fighting", since: "2023-08-01", source: "area" } };
  assert.equal(runsComparable(listed, peace).reason, "war");
  assert.equal(runsComparable(peace, team).text, "Not comparable: different war setting");
  assert.equal(runsComparable(listed, team).why, "different war setting");
  // The name does not change a number: the same day compares.
  assert.equal(runsComparable(team, { ...team, conflict: { ...team.conflict, name: "Another name" } }).comparable, true);
  assert.equal(runsComparable(listed, { ...base, conflict: { id: "area-y", name: "Set by the team", since: "2022-02-24", source: "area" } }).comparable, true);
  // Runs saved before the war was stored count as matching.
  assert.equal(runsComparable(base, team).comparable, true);
});
