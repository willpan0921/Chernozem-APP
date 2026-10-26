// WHAT THIS FILE DOES
// Turns one month of readings from the data source (sample or Earth
// Engine) into a "run": the grid cells with their 0-to-1 indicators and
// hectares, the area totals, the alerts and the quality checks. Also
// compares two runs and works with months.
//
//   buildRun({ area, month, provider, readings, alerts, warnings, cellSizeDeg, cells, baseline, conflict, conflictSource, imagery, accessSource, disasterDamage })
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

import { COMPONENTS, DISASTER_COMPONENTS, DISASTER_METHOD_VERSION, DISASTER_NOUNS, DISASTER_RULES, DISASTER_SCALES, DISASTER_TYPES, FLOOD, METHOD_VERSION, SCALES, WILDFIRE, isDisaster, runsComparable, scaleDisaster, scaleIndicator } from "../src/lib/atlas/method.js";
import { warSquares } from "../src/config/conflicts.js";
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
// The same where the team marked the area as not at war (Atlas Settings,
// area.war), whatever the app's list says: buildRun says it instead.
export const TEAM_PEACE_WARNING =
  "Your team marked this area as not at war (Atlas Settings), so distance to fighting is not measured and nothing is set aside for it. This does not mean the land is safe.";
// What a run says for a month that ends before its war began
// (src/config/conflicts.js endsBeforeWar: a war the team set from a later
// day, or a long re-run reaching back past a new war's start). Real data
// would otherwise read pre-war fires as fighting and give every square a
// heavy damage of 0 next to "War since ...".
//   since          the day the war began ("YYYY-MM-DD")
//   accessMeasured true when an ACLED file measured the distance anyway
export function beforeWarWarning(since, { accessMeasured = false } = {}) {
  const access = accessMeasured ? "" : ", and distance to fighting is not measured (nothing is set aside for it; this does not mean the land is safe)";
  return `This month ends before the war began (${since}): no war damage is counted${access}.`;
}

// The same for a natural disaster the team set (src/lib/atlas/method.js
// isDisaster): no disaster damage before its day, and Feasibility is not
// measured. "This month ends before the flood began (2023-09-04): ..."
export function beforeDisasterWarning(since, type) {
  return `This month ends before the ${DISASTER_NOUNS[type] || "disaster"} began (${since}): no disaster damage is counted, and Feasibility is not measured.`;
}

// Where the distance to fighting came from: "acled" (battles in the ACLED
// file), "fires" (unusual fires inside a known war), "fires-none" (inside
// a known war, but no fire within 300 km of any square looked like
// fighting: nothing measured, server/providers/gee.js), "none" (no war, or
// a month before its war began: nothing measured), or null when the data
// source does not say. For a natural disaster (Feasibility, not distance
// to fighting): "flood-now" (the share of cropland under water at the
// latest look of the month's last 12 days), "fire-now" (the distance to
// fires burning in its last 7 days), "disaster-none" (no images to measure
// them from), and "none" for the types it is not measured for.
export const ACCESS_SOURCES = ["acled", "fires", "fires-none", "none", "flood-now", "fire-now", "disaster-none"];
function cleanAccessSource(value) {
  return ACCESS_SOURCES.includes(value) ? value : null;
}

// The war stored on a run (or a field analysis): { id, name, since } or
// null; a war the team set for the area (server/conflicts.js
// conflictForArea) also keeps source: "area", and a war of the app's list
// limited to boxes that covers the area only in part (its rules apply only
// in the squares that touch the boxes or lie in another listed war:
// server/conflicts.js listWarFor) keeps partOfCountry: true, and partOf:
// "area" when the area is not a whole country (a region, a box or a drawn
// area).
// A natural disaster the team set (kind "disaster", a type of
// DISASTER_TYPES) keeps both: { id, name, since, source: "area", kind:
// "disaster", type }.
export function cleanConflict(value) {
  if (!value || typeof value !== "object" || !value.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.since || ""))) return null;
  const war = { id: String(value.id), name: String(value.name || value.id), since: String(value.since) };
  if (value.kind === "disaster" && DISASTER_TYPES.includes(value.type)) return { ...war, source: "area", kind: "disaster", type: value.type };
  if (value.source === "area") return { ...war, source: "area" };
  if (value.partOfCountry !== true) return war;
  return value.partOf === "area" ? { ...war, partOfCountry: true, partOf: "area" } : { ...war, partOfCountry: true };
}

// Who decided a run's war (or its peace): "area" when the team set it for
// the area in Atlas Settings (area.war), "list" when the app's list did.
function cleanConflictSource(value, conflict) {
  if (value === "area" || value === "list") return value;
  return conflict?.source === "area" ? "area" : "list";
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
// A reading may say atWar (true or false): for a war that covers the area
// only in part, whether the square had the war's rules; the run then keeps
// it on the cell and counts the war's squares (warSquares), and of them
// those that had its rules because another listed war covers them, not
// because they touch its boxes (otherWarSquares, when there are any:
// server/conflicts.js warCellsFor; the pages and the AI then say so).
// conflictSource: "area" when the team set the war (or the peace) for the
// area, "list" (the default) when the app's list decided. At peace by the
// team's choice the run says so (TEAM_PEACE_WARNING) instead of "no war in
// the app's list", which may not be true there.
export function buildRun({ area, month, provider, readings = [], alerts = [], warnings = [], cellSizeDeg, cells = [], baseline, conflict = null, conflictSource = null, imagery = null, accessSource = null, disasterDamage = null }) {
  if (!isMonth(month)) throw new Error(`Not a month: ${month}`);
  // A natural disaster the team set: hit and heavily damaged land, and
  // Feasibility (src/lib/atlas/method.js DISASTER_*); a war's run gets no
  // new key.
  const disaster = isDisaster(conflict) ? cleanConflict(conflict) : null;
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
    // A natural disaster's square whose damage was not measured (gee.js:
    // no hit or heavy share) keeps null: "not measured", never 0.
    const heavyUnmeasured = Boolean(disaster) && raw.heavyShare === null;
    const heavy = heavyUnmeasured ? 0 : share(raw.heavyShare) ?? 0;
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
    // Which rules the square was read with, where the war covers the area
    // only in part (conflict.partOfCountry): false outside the war's squares
    // (peace rules; scoring.js gives it the peace damage score).
    if (typeof raw.atWar === "boolean") out.atWar = raw.atWar;
    if (disaster) addDisasterFields(out, raw, { type: disaster.type, areaHa: cell.areaHa || 0, croplandHa, blackSoilHa, heavy: heavyUnmeasured ? null : heavy, reason: disasterDamage?.notMeasured });
    outCells.push(out);
  }

  // A disaster's totals add the hit land, and the cropland whose damage
  // was measured (measuredCropHa: the hit is "of" that, not of all).
  const totals = { croplandHa: 0, blackSoilHa: 0, heavyDamageHa: 0, peopleOnDamagedSoil: 0, ...(disaster ? { hitHa: 0, hitCropHa: 0, heavyCropHa: 0, grassHitHa: 0, measuredCropHa: 0 } : {}) };
  for (const cell of outCells) {
    totals.croplandHa += cell.croplandHa;
    totals.blackSoilHa += cell.blackSoilHa;
    totals.heavyDamageHa += cell.heavyDamageHa;
    totals.peopleOnDamagedSoil += cell.peopleOnDamagedSoil;
    if (disaster) {
      for (const key of ["hitHa", "hitCropHa", "heavyCropHa", "grassHitHa"]) totals[key] += cell[key] || 0;
      if (cell.hit !== null) totals.measuredCropHa += cell.croplandHa;
    }
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
  const war = cleanConflict(conflict);
  const decidedBy = cleanConflictSource(conflictSource, war);
  const said = !war && decidedBy === "area" ? warnings.map((w) => (w === NO_WAR_WARNING ? TEAM_PEACE_WARNING : w)) : warnings;
  // A war that covers the area only in part: how many squares had its rules
  // (the Overview's chip, the report and the AI say "in 12 of 340 squares"),
  // and how many of them lie in another listed war without touching the
  // war's boxes.
  const marked = war?.partOfCountry && outCells.some((cell) => typeof cell.atWar === "boolean");
  const touching = marked ? warSquares(war, outCells, cellSizeDeg) : null;
  const otherWar = touching ? outCells.filter((cell) => cell.atWar === true && !touching.has(cell.id)).length : 0;

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
    conflict: war,
    conflictSource: decidedBy,
    accessSource: cleanAccessSource(accessSource),
    cellSizeDeg,
    cellSizeKm: Math.round(cellSizeKm(cellSizeDeg, midLat) * 1000) / 1000,
    cellCount: outCells.length,
    ...(marked ? { warSquares: outCells.filter((cell) => cell.atWar !== false).length } : {}),
    ...(otherWar > 0 ? { otherWarSquares: otherWar } : {}),
    totals,
    newHeavyDamageHa: null,
    alertsCount: strongest.length,
    checks: { passed: checks.length - failed.length, total: checks.length, warnings: [...said, ...failed] },
    // The method version, components and scales: runs made with another
    // method are "not comparable" (method.js runsComparable).
    ...(disaster ? { disasterDamage: cleanDisasterDamage(disasterDamage) } : {}),
    method: disaster
      ? { version: DISASTER_METHOD_VERSION, components: DISASTER_COMPONENTS, scales: { ...SCALES, ...DISASTER_SCALES }, disaster: { type: disaster.type, rules: DISASTER_RULES[disaster.type] } }
      : { version: METHOD_VERSION, components: COMPONENTS, scales: SCALES },
    cells: outCells,
    alerts: strongest,
  };
}

// The disaster fields of one cell (buildRun, a disaster run only):
//   hitHa        black-soil cropland hit since the date (blackSoilHa x
//                hitShare, the convention of heavyDamageHa)
//   hitCropHa    all cropland hit, heavyCropHa all cropland heavily
//                damaged (so a place with little black soil still has
//                honest totals)
//   grassHitHa   grassland and pasture hit (flood and wildfire; reported,
//                not scored)
//   hit, heavy   the damage indicators (DISASTER_SCALES, full at 20%)
//   feasible     Feasibility: flood 1 - the cropland share under water now
//                above FLOOD.dryNowShare, rescaled (feasibleFromWet);
//                wildfire the distance to a fire burning now / 10 km; else 1
//   distance     null: there is no distance to fighting
//   notMeasured  only for a square whose damage was not measured (no hit
//                share: gee.js), the reason the ranking gives; hit, heavy
//                and the hit hectares are then null, never 0
// raw keeps hitShare, heavyShare, wetNowShare and fireKm; raw.conflictKm
// is the distance to a fire for a wildfire, else null (scoring.js uses it
// to break ties in the Feasibility cutoff).
export const NOT_MEASURED_REASONS = {
  "season-incomplete": "Damage not measured yet: the crop season has not run long enough",
  "no-images": "Damage not measured: no usable images",
};
function addDisasterFields(out, raw, { type, areaHa, croplandHa, blackSoilHa, heavy, reason }) {
  const measured = raw.hitShare !== null && heavy !== null;
  const hitShare = measured ? share(raw.hitShare) ?? 0 : null;
  const grassShare = share(raw.grassShare) ?? 0;
  const grassHitShare = share(raw.grassHitShare) ?? 0;
  const wetNowShare = share(raw.wetNowShare);
  const fireKm = type === "wildfire" && num(raw.conflictKm) != null ? Math.max(0, raw.conflictKm) : null;
  out.hitHa = measured ? r2(blackSoilHa * hitShare) : null;
  out.hitCropHa = measured ? r2(croplandHa * hitShare) : null;
  out.heavyCropHa = measured ? r2(croplandHa * heavy) : null;
  out.grassHitHa = measured ? r2(areaHa * grassShare * grassHitShare) : null;
  out.hit = measured ? r4(scaleDisaster("hit", hitShare)) : null;
  out.heavy = measured ? r4(scaleDisaster("heavy", heavy)) : null;
  if (!measured) out.notMeasured = NOT_MEASURED_REASONS[reason] || NOT_MEASURED_REASONS["no-images"];
  out.feasible = type === "flood" ? r4(feasibleFromWet(wetNowShare ?? 0)) : type === "wildfire" ? r4(fireKm == null ? 1 : Math.min(1, fireKm / WILDFIRE.fullKm)) : 1;
  out.distance = null;
  out.raw = {
    ...out.raw,
    conflictKm: fireKm == null ? null : r2(fireKm),
    hitShare: measured ? r4(hitShare) : null,
    heavyShare: measured ? r4(heavy) : null,
    wetNowShare: wetNowShare == null ? null : r4(wetNowShare),
    fireKm: fireKm == null ? null : r2(fireKm),
  };
}

// A flood square's Feasibility from the share of its cropland under water
// now: 1 (nothing in the way) at FLOOD.dryNowShare or less, so puddles,
// ponds and stray wet pixels never set a square aside; above it, falling
// to 0 for a square all under water. (Real data, 2026-10-25: Iowa in July
// 2024 had 14 ha under water in the whole box, yet 32 of 1,340 squares
// were left out for it.)
export function feasibleFromWet(wetShare) {
  const wet = Math.min(1, Math.max(0, Number(wetShare) || 0));
  const floor = FLOOD.dryNowShare;
  return wet <= floor ? 1 : 1 - (wet - floor) / (1 - floor);
}

// What a disaster run could not measure (gee.js analyze), for the pages:
//   notMeasured     "season-incomplete" | "no-images" when some squares'
//                   damage was not measured, else null
//   unmeasuredShare the share of the squares not measured (0..1)
//   mayBeLow        why the damage may read low: "burn-map-pending" (no
//                   burned-area map yet), "no-dnbr" (no Sentinel-2 around the
//                   day), "snow" (snowy or frozen days left out)
export const MAY_BE_LOW = ["burn-map-pending", "no-dnbr", "snow"];
export function cleanDisasterDamage(value) {
  const v = value && typeof value === "object" ? value : {};
  const notMeasured = Object.hasOwn(NOT_MEASURED_REASONS, v.notMeasured) ? v.notMeasured : null;
  const shareOf = Number.isFinite(v.unmeasuredShare) ? Math.min(1, Math.max(0, v.unmeasuredShare)) : notMeasured ? 1 : 0;
  return { notMeasured, unmeasuredShare: notMeasured ? shareOf : 0, mayBeLow: (Array.isArray(v.mayBeLow) ? v.mayBeLow : []).filter((key) => MAY_BE_LOW.includes(key)) };
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
