// WHAT THIS FILE DOES
// The words and numbers the Field pages show, made from a farm and its
// analyses, so every page says things the same way:
//
//   formatArea(54.56, "acres")      -> "135 acres"   (units: "ha" | "acres" | "mu")
//   farmLine(farm)                  -> "7 fields · 336 ha"
//   formatIndex(-0.158)             -> "−0.16"          (NDVI / NDWI)
//   normalRange({ low, high })      -> "Normal 0.26 to 0.29"
//   formatDay("2026-10-16")         -> "Oct 16"
//   formatDayRange(from, to)        -> "Oct 18–28"
//   stageWord(harvest)              -> "Ready" | "8 days" | "Harvested" | "Growing" | "Not sown" | "No clear image"
//   versusWord("below")             -> "Below normal"
//   stressWord("medium")            -> "Medium"
//   conditionWord("great")          -> "Very good"
//   fieldTiles(analysis, { units, weather })  the four tiles: Water, Plant health, Stress, Harvest readiness
//   statusCounts(farm, analyses)    -> { healthy, watch, recovery, total }
//   candidateTotals(candidates, selectedIds) -> { count, areaHa }
//
// The rules (what counts as stressed, ready, normal...) are NOT here: they
// are in method.js. This file only puts them into words. Tested in
// format.test.js.
//
// WHO EDITS IT
// Whoever changes how the Field pages word things.

import { CONDITION_CLASSES, STATUS_GROUPS, UNITS, convertArea } from "./method.js";

const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

// 1.86 -> "1.9", 31.04 -> "31", 412.6 -> "413", 5321 -> "5,321".
function shortNumber(value) {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value).toLocaleString("en-US");
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

// ---------- Areas ----------

export function unitShort(units = "ha") {
  return (UNITS[units] || UNITS.ha).short;
}

// Hectares in the farm's unit: 54.56 -> "54.6 ha", "135 acres", "818 亩".
// The space before the unit is a no-break space, so "336 ha" never splits
// over two lines.
export function formatArea(hectares, units = "ha") {
  if (!isNum(hectares)) return "–";
  return `${shortNumber(convertArea(hectares, units))}\u00a0${unitShort(units)}`;
}

export function farmAreaHa(farm) {
  return (farm?.fields || []).reduce((sum, field) => sum + (isNum(field.areaHa) ? field.areaHa : 0), 0);
}

// "7 fields · 336 ha", "1 field · 54.6 ha", or "No fields yet".
export function farmLine(farm) {
  const count = farm?.fields?.length || 0;
  if (!count) return "No fields yet";
  return `${count} ${count === 1 ? "field" : "fields"} · ${formatArea(farmAreaHa(farm), farm.units)}`;
}

// ---------- Readings ----------

// -0.158 -> "−0.16", 0.281 -> "0.28".
export function formatIndex(value, digits = 2) {
  if (!isNum(value)) return "–";
  const text = Math.abs(value).toFixed(digits);
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

// { low, high } -> "Normal 0.26 to 0.29" (or null without a normal).
export function normalRange(normal) {
  if (!isNum(normal?.low) || !isNum(normal?.high)) return null;
  if (formatIndex(normal.low) === formatIndex(normal.high)) return `Normal ${formatIndex(normal.low)}`;
  return `Normal ${formatIndex(normal.low)} to ${formatIndex(normal.high)}`;
}

const VERSUS_WORDS = { below: "Below normal", normal: "Normal", above: "Above normal" };
export function versusWord(versus) {
  return VERSUS_WORDS[versus] || "No reading";
}

const STRESS_WORDS = { low: "Low", medium: "Medium", high: "High" };
export function stressWord(level) {
  return STRESS_WORDS[level] || "No reading";
}

export function conditionWord(classId) {
  return CONDITION_CLASSES.find((item) => item.id === classId)?.label || "No reading";
}

// ---------- Dates ----------

function parts(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

// "2026-10-16" -> "Oct 16".
export function formatDay(iso) {
  if (!iso) return "–";
  const { m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

// "Oct 18–28", "Oct 28 – Nov 7", or one day.
export function formatDayRange(from, to) {
  if (!from) return "–";
  if (!to || to === from) return formatDay(from);
  const a = parts(from);
  const b = parts(to);
  if (a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d}–${b.d}`;
  return `${formatDay(from)} – ${formatDay(to)}`;
}

// ---------- Harvest ----------

// The big word for harvest readiness.
export function stageWord(harvest) {
  switch (harvest?.stage) {
    case "ready":
      return "Ready";
    case "ripening": {
      const days = harvest.daysToReady;
      return isNum(days) ? `${days} ${days === 1 ? "day" : "days"}` : "Ripening";
    }
    case "harvested":
      return "Harvested";
    case "growing":
      return "Growing";
    case "notSown":
      return "Not sown";
    default:
      return "No clear image";
  }
}

// ---------- The four tiles ----------

const VERSUS_TONES = { below: "amber", normal: "green", above: "blue" };
const STRESS_TONES = { low: "green", medium: "amber", high: "red" };

// The four tiles of a field, in order. Each is
//   { id, label, value, word, tone, line }
// value - the big text ("0.28", "0.8 ha", "Ready")
// word  - one status word ("Normal", "Medium", "Now"), or null
// tone  - badge colour: "green" | "amber" | "red" | "blue" | "ink" | null
// line  - at most one short line, or null
//   options.units   - the farm's unit
//   options.weather - the /api/farm/weather answer, for the rain date (optional)
export function fieldTiles(analysis, { units = "ha", weather = null } = {}) {
  const a = analysis || {};
  const water = a.water || {};
  const health = a.plantHealth || {};
  const stress = a.stress || {};
  const harvest = a.harvest || {};

  const waterTile = {
    id: "water",
    label: "Water",
    value: formatIndex(water.ndwi),
    word: isNum(water.ndwi) ? versusWord(water.versus) : null,
    tone: VERSUS_TONES[water.versus] || null,
    line: normalRange(water.normal),
  };

  const healthTile = {
    id: "plantHealth",
    label: "Plant health",
    value: formatIndex(health.ndvi),
    word: isNum(health.ndvi) ? versusWord(health.versus) : null,
    tone: VERSUS_TONES[health.versus] || null,
    line: normalRange(health.normal),
  };

  const share = isNum(stress.share) ? stress.share : null;
  const stressedHa = isNum(stress.stressedHa) ? stress.stressedHa : null;
  const patches = Array.isArray(stress.patches) ? stress.patches.length : 0;
  let stressLine = null;
  if (share != null && share > 0) {
    const pct = share * 100 < 1 ? "Under 1%" : `${Math.round(share * 100)}%`;
    stressLine = patches ? `${pct} of the field · ${patches} ${patches === 1 ? "patch" : "patches"}` : `${pct} of the field`;
  } else if (share != null) stressLine = "No weak patches";
  const stressTile = {
    id: "stress",
    label: "Stress",
    value: share == null ? "–" : stressedHa && stressedHa > 0 ? formatArea(stressedHa, units) : "None",
    word: stress.level ? stressWord(stress.level) : null,
    tone: STRESS_TONES[stress.level] || null,
    line: stressLine,
  };

  const rain = weather?.rain?.likely ? weather.rain : null;
  const rainNote = harvest.rainBefore && rain?.from ? `Rain ${formatDay(rain.from)} · harvest first` : harvest.rainBefore ? "Rain due · harvest first" : null;
  let word = null;
  let tone = null;
  let line = null;
  switch (harvest.stage) {
    case "ready":
      word = "Now";
      tone = "ink";
      line = rainNote || (harvest.window?.to ? `Best by ${formatDay(harvest.window.to)}` : null);
      break;
    case "ripening":
      word = "Ripening";
      tone = "blue";
      line = rainNote || (harvest.window?.from ? `Ready about ${formatDay(harvest.window.from)}` : null);
      break;
    case "harvested":
      word = "Done";
      line = harvest.harvestedOn ? `Cut about ${formatDay(harvest.harvestedOn)}` : harvest.lastDate ? `Seen ${formatDay(harvest.lastDate)}` : null;
      break;
    case "growing":
      word = "Not yet";
      tone = "green";
      line = isNum(harvest.peak) ? `Greenest so far ${formatIndex(harvest.peak)}` : null;
      break;
    case "notSown":
      line = "No crop this season";
      break;
    default:
      line = "Waiting for a clear pass";
  }
  const harvestTile = { id: "harvest", label: "Harvest readiness", value: stageWord(harvest), word, tone, line };

  return [waterTile, healthTile, stressTile, harvestTile];
}

// ---------- The farm at a glance ----------

// How many fields are in each overview group (method.js STATUS_GROUPS).
// A field with no analysis yet is not counted in any group.
export function statusCounts(farm, analyses = {}) {
  const counts = { healthy: 0, watch: 0, recovery: 0, total: farm?.fields?.length || 0 };
  for (const field of farm?.fields || []) {
    const id = analyses[field.id]?.status?.id;
    for (const [group, ids] of Object.entries(STATUS_GROUPS)) if (ids.includes(id)) counts[group] += 1;
  }
  return counts;
}

// The chosen candidate fields in the farm setup: how many, and their area.
export function candidateTotals(candidates = [], selectedIds = []) {
  const chosen = new Set(selectedIds);
  let count = 0;
  let areaHa = 0;
  for (const candidate of candidates) {
    if (!chosen.has(candidate.id)) continue;
    count += 1;
    areaHa += isNum(candidate.areaHa) ? candidate.areaHa : 0;
  }
  return { count, areaHa: Math.round(areaHa * 100) / 100 };
}
