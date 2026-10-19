// WHAT THIS FILE DOES
// Turns one month of readings from the data source (sample or Earth
// Engine) into a "run": the grid cells with their 0-to-1 indicators and
// hectares, the area totals, the alerts and the quality checks. Also
// compares two runs and works with months.
//
//   buildRun({ area, month, provider, readings, alerts, warnings, cellSizeDeg, cells, baseline, conflict, imagery, accessSource })
//   summarizeRun(run)        the run without its cells and alerts (for lists)
//   compareRuns(a, b)        what changed from run a to run b
//   linkNewDamage(runs)      fills "new heavy damage" from each previous month
//   monthLabel("2026-09")    "September 2026"
//   latestCompleteMonth()    last month (this month is not over yet)
//
// The indicator scales come from src/lib/atlas/method.js, the same file
// the pages use, so the server and the map always agree.
//
// WHO EDITS IT
// Whoever changes what a run contains. Saved runs keep their numbers.

import { COMPONENTS, METHOD_VERSION, SCALES, runsComparable, scaleIndicator } from "../src/lib/atlas/method.js";
import { cellSizeKm } from "./geo.js";
import { imageryMonths } from "../src/lib/season.js";
import { newId } from "./store.js";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---------- Months ----------

export function isMonth(text) {
  return typeof text === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}

export function monthLabel(month) {
  if (!isMonth(month)) return String(month || "");
  const [year, mon] = month.split("-").map(Number);
  return `${MONTH_NAMES[mon - 1]} ${year}`;
}

// "2026-09" + 1 -> "2026-10"; "2026-01" - 1 -> "2025-12".
export function addMonths(month, count) {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + count;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

// The month before today's month (by the server's clock).
export function latestCompleteMonth(date = new Date()) {
  const now = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return addMonths(now, -1);
}

// The latest `count` months ending at `latest`, newest first.
export function monthsBack(latest, count) {
  return Array.from({ length: count }, (_, i) => addMonths(latest, -i));
}

// The satellite season a month's damage reading compares with the same
// season of 2019-2021 (src/lib/season.js): the last growing season that was
// COMPLETE by the end of the month, so every month of one season gives the
// same answer. By the area's centre latitude: in the north April to
// September, in the south October to March (across the new year), in the
// tropics the last 12 whole months. Earth Engine finds each place's own
// season from its greenest month and gives the one it used (`imagery`);
// this is the fallback. Without a latitude the northern season is used.
//   imageryWindow("2026-09", 49)  -> { from: "2025-04", to: "2025-09" }
//   imageryWindow("2026-10", 49)  -> { from: "2026-04", to: "2026-09" }
//   imageryWindow("2026-05", -35) -> { from: "2025-10", to: "2026-03" }
export function imageryWindow(month, lat, peakMonth) {
  return imageryMonths(Number.isFinite(lat) ? lat : 50, month, peakMonth);
}

// The season a provider says it used: { from, to } ("YYYY-MM"), or null.
function cleanImagery(value) {
  if (!value || typeof value !== "object" || !isMonth(value.from) || !isMonth(value.to)) return null;
  const out = { from: value.from, to: value.to };
  if (typeof value.label === "string" && value.label.trim()) out.label = value.label.trim().slice(0, 240);
  // How many growing seasons the damage radar's composite holds (gee.js).
  if (Number.isInteger(value.seasons) && value.seasons > 0) out.seasons = value.seasons;
  return out;
}

// What a run says when no war in src/config/conflicts.js covers the area and
// there is no ACLED file: distance to fighting is then not measured (every
// cell reads 300 km) and nothing is set aside for it.
export const NO_WAR_WARNING =
  "No war in the app's list covers this area, so distance to fighting is not measured and nothing is set aside for it. This does not mean the land is safe.";

// Where the distance to fighting came from: "acled" (battles in the ACLED
// file), "fires" (unusual fires inside a known war), "none" (no war in the
// list, nothing measured), or null when the data source does not say.
export const ACCESS_SOURCES = ["acled", "fires", "none"];
function cleanAccessSource(value) {
  return ACCESS_SOURCES.includes(value) ? value : null;
}

// The war stored on a run (or a field analysis): { id, name, since } or null.
export function cleanConflict(value) {
  if (!value || typeof value !== "object" || !value.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.since || ""))) return null;
  return { id: String(value.id), name: String(value.name || value.id), since: String(value.since) };
}

export const BASELINE = { from: 2019, to: 2021, label: "2019 to 2021" };

// Accepts a provider's { from, to, label }; anything incomplete gives BASELINE.
function cleanBaseline(value) {
  if (!value || typeof value !== "object") return { ...BASELINE };
  const from = Number(value.from);
  const to = Number(value.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return { ...BASELINE };
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 60) : from === to ? String(from) : `${from} to ${to}`;
  return { from, to, label };
}

// ---------- Building a run ----------

const num = (value) => (Number.isFinite(value) ? value : null);
const share = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null);
const r4 = (value) => (value == null ? null : Math.round(value * 10000) / 10000);
const r2 = (value) => Math.round(value * 100) / 100;

function providerId(provider) {
  return typeof provider === "string" ? provider : provider?.id || "sample";
}

// baseline: what the data source compared this month with. Earth Engine
// gives its own (the same months of 2019 to 2021); otherwise BASELINE is used.
// conflict: the known war covering the area ({ id, name, since }, from
// server/conflicts.js), or null for a place at peace. Damage there is
// counted from the war's start; at peace, over the last two years.
// imagery: the season the provider compared ({ from, to, label? }); without
// it, imageryWindow() by the area's centre latitude.
// accessSource: where distance to fighting came from (ACCESS_SOURCES).
export function buildRun({ area, month, provider, readings = [], alerts = [], warnings = [], cellSizeDeg, cells = [], baseline, conflict = null, imagery = null, accessSource = null }) {
  if (!isMonth(month)) throw new Error(`Not a month: ${month}`);
  const byId = new Map(readings.map((reading) => [reading.id, reading]));
  const outCells = [];
  let missing = 0;
  let badValues = 0;

  for (const cell of cells) {
    const raw = byId.get(cell.id);
    if (!raw) {
      missing += 1;
      continue;
    }
    for (const key of ["chernozem", "croplandShare", "firesPer100Km2", "radarDb", "conflictKm", "popPerKm2", "lights", "heavyShare", "population"]) {
      if (raw[key] != null && (!Number.isFinite(raw[key]) || raw[key] < 0)) badValues += 1;
    }
    const chernozem = share(raw.chernozem);
    const cropShare = share(raw.croplandShare);
    const heavy = share(raw.heavyShare) ?? 0;
    const population = Math.max(0, num(raw.population) ?? 0);
    const croplandHa = (cell.areaHa || 0) * (cropShare ?? 0);
    const blackSoilHa = croplandHa * (chernozem ?? 0);
    const heavyDamageHa = blackSoilHa * heavy;
    const out = {
      id: cell.id,
      lat: cell.lat,
      lon: cell.lon,
      wrb: r4(scaleIndicator("wrb", chernozem)),
      agOutput: r4(cropShare),
      firms: r4(scaleIndicator("firms", num(raw.firesPer100Km2))),
      radar: r4(scaleIndicator("radar", num(raw.radarDb))),
      // A diagnostic only: not part of the damage score (method.js).
      chi: r4(scaleIndicator("chi", num(raw.chiDrop))),
      distance: r4(scaleIndicator("distance", num(raw.conflictKm))),
      population: r4(scaleIndicator("population", num(raw.popPerKm2))),
      lights: r4(scaleIndicator("lights", num(raw.lights))),
      croplandHa: r2(croplandHa),
      blackSoilHa: r2(blackSoilHa),
      heavyDamageHa: r2(heavyDamageHa),
      people: Math.round(population),
      peopleOnDamagedSoil: Math.round(population * heavy * (cropShare ?? 0)),
      // The raw readings, kept for the AI and the report.
      raw: {
        chiDrop: r4(num(raw.chiDrop)),
        radarDb: num(raw.radarDb) == null ? null : r2(raw.radarDb),
        firesPer100Km2: r2(num(raw.firesPer100Km2) ?? 0),
        conflictKm: num(raw.conflictKm) == null ? null : r2(raw.conflictKm),
        popPerKm2: r2(num(raw.popPerKm2) ?? 0),
      },
    };
    if (raw.admin1) out.admin1 = String(raw.admin1);
    if (raw.admin2) out.admin2 = String(raw.admin2);
    outCells.push(out);
  }

  const totals = { croplandHa: 0, blackSoilHa: 0, heavyDamageHa: 0, peopleOnDamagedSoil: 0 };
  for (const cell of outCells) {
    totals.croplandHa += cell.croplandHa;
    totals.blackSoilHa += cell.blackSoilHa;
    totals.heavyDamageHa += cell.heavyDamageHa;
    totals.peopleOnDamagedSoil += cell.peopleOnDamagedSoil;
  }
  for (const key of Object.keys(totals)) totals[key] = Math.round(totals[key]);

  // Quality checks: each one either passes or adds a warning.
  const checks = [
    [missing === 0, `${missing} of ${cells.length} cells had no reading.`],
    [outCells.length > 0, "No cells could be measured."],
    [badValues === 0, `${badValues} readings were impossible (negative or not a number).`],
    [totals.croplandHa > 0, "No cropland was found in this area."],
    [outCells.every((cell) => cell.blackSoilHa <= cell.croplandHa + 0.01), "Black-soil hectares exceeded cropland."],
    [outCells.some((cell) => cell.raw.popPerKm2 > 0), "No population data was found."],
  ];
  const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
  const midLat = area.bbox ? (area.bbox[1] + area.bbox[3]) / 2 : outCells[0]?.lat || 0;

  const strongest = [...alerts]
    .filter((alert) => alert && (alert.kind === "radar" || alert.kind === "fire"))
    .slice(0, 6)
    .map((alert, i) => ({ ...alert, id: alert.id || `alert-${i + 1}` }));

  return {
    id: newId("run"),
    areaId: area.id,
    areaName: area.name,
    month,
    label: monthLabel(month),
    provider: providerId(provider),
    createdAt: new Date().toISOString(),
    imagery: cleanImagery(imagery) || imageryWindow(month, midLat),
    baseline: cleanBaseline(baseline),
    conflict: cleanConflict(conflict),
    accessSource: cleanAccessSource(accessSource),
    cellSizeDeg,
    cellSizeKm: Math.round(cellSizeKm(cellSizeDeg, midLat) * 1000) / 1000,
    cellCount: outCells.length,
    totals,
    newHeavyDamageHa: null,
    alertsCount: strongest.length,
    checks: { passed: checks.length - failed.length, total: checks.length, warnings: [...warnings, ...failed] },
    // The method version, components and scales: runs made with another
    // method are "not comparable" (method.js runsComparable).
    method: { version: METHOD_VERSION, components: COMPONENTS, scales: SCALES },
    cells: outCells,
    alerts: strongest,
  };
}

export function summarizeRun(run) {
  if (!run) return null;
  const { cells, alerts, ...summary } = run;
  return summary;
}

// Hectares newly heavily damaged from run a (earlier) to run b: how much
// the heavily damaged total grew. It is never below 0, and it always matches
// the change people see in the totals (a falling total means no new damage).
// Null when the two runs cannot be compared (method.js runsComparable:
// another data source, method or grid).
export function newDamageBetween(a, b) {
  if (!runsComparable(a, b).comparable) return null;
  const sum = (run) =>
    Number.isFinite(run.totals?.heavyDamageHa) ? run.totals.heavyDamageHa : (run.cells || []).reduce((total, cell) => total + (cell.heavyDamageHa || 0), 0);
  return Math.max(0, Math.round(sum(b) - sum(a)));
}

// Gives each run (full runs of one area) its new heavy damage compared with
// the run of the month before. Returns the runs whose value changed.
export function linkNewDamage(runs) {
  const byMonth = new Map(runs.map((run) => [run.month, run]));
  const changed = [];
  for (const run of runs) {
    const prev = byMonth.get(addMonths(run.month, -1));
    const value = prev && prev.cells && run.cells ? newDamageBetween(prev, run) : null;
    if (run.newHeavyDamageHa !== value) {
      run.newHeavyDamageHa = value;
      changed.push(run);
    }
  }
  return changed;
}

const TOTAL_KEYS = ["croplandHa", "blackSoilHa", "heavyDamageHa", "peopleOnDamagedSoil"];

// What changed from run a to run b (deltas are b minus a).
export function compareRuns(a, b) {
  const deltas = {};
  for (const key of TOTAL_KEYS) deltas[key] = Math.round((b.totals?.[key] || 0) - (a.totals?.[key] || 0));
  const before = new Map((a.cells || []).map((cell) => [cell.id, cell]));
  const changedCells = [];
  for (const cell of b.cells || []) {
    const prev = before.get(cell.id);
    if (!prev) continue;
    const delta = r2(cell.heavyDamageHa - prev.heavyDamageHa);
    if (delta === 0) continue;
    const item = { id: cell.id, lat: cell.lat, lon: cell.lon, heavyDamageHaA: prev.heavyDamageHa, heavyDamageHaB: cell.heavyDamageHa, delta };
    if (cell.admin1) item.admin1 = cell.admin1;
    if (cell.admin2) item.admin2 = cell.admin2;
    changedCells.push(item);
  }
  changedCells.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  // Runs from another data source, method or grid: the differences say
  // nothing about the land, so none are given.
  const check = runsComparable(a, b);
  if (!check.comparable) {
    return { a: summarizeRun(a), b: summarizeRun(b), comparable: false, notComparable: check.reason, notComparableText: check.text, deltas: Object.fromEntries(TOTAL_KEYS.map((key) => [key, null])), changedCells: [] };
  }
  return { a: summarizeRun(a), b: summarizeRun(b), comparable: true, deltas, changedCells: changedCells.slice(0, 20) };
}
