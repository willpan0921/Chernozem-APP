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
//   stageWord(harvest)              -> "Ready" | "8 days" | "Harvested" | "Growing" | "Past peak" | "Dried down" | "Not sown" | "No clear image"
//   versusWord("below")             -> "Below normal"
//   stressWord("medium")            -> "Medium"
//   conditionWord("great")          -> "Very good"
//   cropInfo(field, analysis)       -> { name: "Corn", text: "Corn · detected", source: "user" | "detected" | null }
//   detectedChoice(analysis)        -> "Detected: Corn" (the crop select before the farmer picks)
//   analysingIds(farm, analyses, job)  the new fields the running update is analysing (a Set)
//   farmConflict(farm, analyses)    the war covering the farm, null at peace, undefined when unknown
//   mapLook(analysis) / mapMarks(fields, analyses)  how the map draws a field; the marks its legend lists
//   causeText("dry")                -> "Dry patch"
//   riskNote(analysis.pestRisk)     -> { text: "Disease risk high this week", tone: "red" } (medium or high only)
//   basisText("heat units")         -> "from heat units"
//   fieldTiles(analysis, { units, weather, crop })  the four tiles: Water, Plant health, Stress, Harvest readiness
//   statusCounts(farm, analyses)    -> { healthy, noCrop, harvested, notSown, watch, recovery, total }
//   candidateTotals(candidates, selectedIds) -> { count, areaHa }
//
// The rules (what counts as stressed, ready, normal...) are NOT here: they
// are in method.js. This file only puts them into words. Tested in
// format.test.js.
//
// WHO EDITS IT
// Whoever changes how the Field pages word things.

import { CONDITION_CLASSES, DRIED_DOWN_LABEL, FALLOW_LABEL, NO_CROP_LABEL, NO_CROP_STAGES, STATUS_GROUPS, STRESS_CAUSES, UNITS, convertArea, pestRiskLine } from "./method.js";

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
    case "growing": {
      // A crop of unknown kind past its peak (method.js unknownCropHarvest):
      // what was measured, never a date.
      if (harvest.dryDown === "dry") return DRIED_DOWN_LABEL;
      if (harvest.dryDown === "fading") return "Past peak";
      // A green crop with a heat-unit estimate: the days to go.
      const days = harvest.daysToReady;
      return harvest.basis === "heat units" && isNum(days) ? `${days} ${days === 1 ? "day" : "days"}` : "Growing";
    }
    case "notSown":
      return "Not sown";
    default:
      return "No clear image";
  }
}

// ---------- Crops ----------

// The crop a field shows: the farmer's own choice, else the crop the
// satellite record points to (analysis.cropDetected), marked "detected".
// A placeholder crop from the old demo data (cropSource "demo") is never
// shown as if it were real.
//   -> { name, text, source: "user" | "detected" | null, confidence, reason }
//      name  "Corn"              (for sentences: "Corn · from heat units")
//      text  "Corn · detected"   (next to the field's name)
export function cropInfo(field, analysis) {
  const found = analysis?.cropDetected;
  const detected = found?.id && found.id !== "unknown" && found.label ? found : null;
  const source = field?.cropSource;
  const own = typeof field?.crop === "string" && field.crop.trim() ? field.crop.trim() : null;
  // Fields saved before crops were detected have no cropSource: their crop
  // was picked by the farmer.
  if (own && (source === "user" || source == null)) return { name: own, text: own, source: "user", confidence: null, reason: null };
  // Read from last season (this season has not peaked yet): shown as last
  // season's crop, never as this season's.
  if (detected?.season === "last") return { name: null, text: `Last season: ${detected.label}`, source: "detected", confidence: detected.confidence || null, reason: detected.reason || null, lastSeason: true };
  if (detected) return { name: detected.label, text: `${detected.label} · detected`, source: "detected", confidence: detected.confidence || null, reason: detected.reason || null };
  if (own && source === "detected") return { name: own, text: `${own} · detected`, source: "detected", confidence: null, reason: null };
  return { name: null, text: null, source: null, confidence: null, reason: null };
}

// The empty choice of the crop select in Settings: what the field shows
// until the farmer picks a crop. "Detected: Corn", "Detected: Corn
// (possible)", "Detecting…" while the field is analysed, or "Not detected".
export function detectedChoice(analysis, { analysing = false } = {}) {
  const found = analysis?.cropDetected;
  if (found?.id && found.id !== "unknown" && found.label && found.season === "last") return `Detected last season: ${found.label}`;
  if (found?.id && found.id !== "unknown" && found.label) return `Detected: ${found.label}${found.confidence === "possible" ? " (possible)" : ""}`;
  if (analysing || !analysis) return "Detecting…";
  return "Not detected";
}

// ---------- Fields being analysed ----------

// The fields with no analysis yet that the running update is working on
// (a new field, or a farm saved a moment ago). They show "Analysing…"
// everywhere until their analysis is saved.
export function analysingIds(farm, analyses = {}, job = null) {
  if (job?.status !== "running" || job.kind === "field-detect") return new Set();
  const ids = Array.isArray(job.fieldIds) && job.fieldIds.length ? job.fieldIds : (farm?.fields || []).map((field) => field.id);
  return new Set(ids.filter((id) => !analyses?.[id]));
}

export const ANALYSING_LABEL = "Analysing…";

// ---------- War or peace ----------

// The known war covering the farm (src/config/conflicts.js), from the
// analyses or, before any analysis, from the farm's place (farm.conflict):
// the war { id, name, since }, null at peace, or undefined when nothing
// says yet.
export function farmConflict(farm, analyses = {}) {
  const known = Object.values(analyses || {}).filter((item) => item && item.conflict !== undefined);
  const war = known.find((item) => item.conflict)?.conflict || farm?.conflict || null;
  if (war) return war;
  if (known.length || farm?.conflict === null) return null;
  return undefined;
}

// ---------- The map's marks ----------

// No crop in the field: harvested or not sown (method.js NO_CROP_STAGES).
// Stress is not read then, nor once a crop has dried down (stress.applies
// false, stress.reason "driedDown").
const noCrop = (analysis) => analysis?.stress?.applies === false || NO_CROP_STAGES.includes(analysis?.harvest?.stage);

// Why the Stress tile shows no reading: "noCrop", "driedDown" or null.
// Older analyses without stress.reason: from the harvest stage.
function stressExempt(analysis) {
  const stage = analysis?.harvest?.stage;
  if (NO_CROP_STAGES.includes(stage)) return "noCrop";
  if (analysis?.stress?.applies !== false) return null;
  if (analysis.stress.reason) return analysis.stress.reason;
  return stage === "ready" ? "driedDown" : "noCrop";
}

// How the map draws one field, worked out once for the map and its legend:
//   { recovery, ready, bare, bareKind: "harvested" | "notSown" | null, patches }
// recovery  red (damage found)
// ready     gold outline (ready to harvest, or within two weeks)
// bare      straw tint (harvested or not sown: no condition colour)
// patches   the stress patches to circle (none when there is no crop)
export function mapLook(analysis) {
  const status = analysis?.status?.id;
  const recovery = status === "recovery" || Boolean(analysis?.damage?.detected);
  const ready = !recovery && (status === "ready" || status === "harvestSoon");
  const bareKind = !recovery && !ready && (status === "harvested" || status === "notSown") ? status : null;
  const patches = !noCrop(analysis) && Array.isArray(analysis?.stress?.patches) ? analysis.stress.patches.filter((p) => isNum(p?.lat) && isNum(p?.lon)) : [];
  return { recovery, ready, bare: Boolean(bareKind), bareKind, patches };
}

// Which marks the map legend lists: only the ones on the map.
//   -> { classes: true when any field has a condition colour, marks: [...] }
//   marks: any of "ready", "recovery", "stress", "harvested", "notSown"
export function mapMarks(fields = [], analyses = {}) {
  const marks = new Set();
  let classes = false;
  for (const field of fields) {
    const analysis = analyses?.[field.id];
    if (!analysis) continue;
    const look = mapLook(analysis);
    if (look.recovery) marks.add("recovery");
    if (look.ready) marks.add("ready");
    if (look.bareKind) marks.add(look.bareKind);
    if (look.patches.length) marks.add("stress");
    if (!look.recovery && !look.bare && analysis.condition?.class) classes = true;
  }
  return { classes, marks: ["ready", "recovery", "stress", "harvested", "notSown"].filter((id) => marks.has(id)) };
}

// ---------- The four tiles ----------

const VERSUS_TONES = { below: "amber", normal: "green", above: "blue" };
const STRESS_TONES = { low: "green", medium: "amber", high: "red" };
const WATER_WORDS = { below: "Drier than usual", normal: "Normal", above: "Wetter than usual" };
const HEALTH_WORDS = { below: "Below normal", normal: "Normal", above: "Above normal" };
const round2 = (value) => Math.round(value * 100) / 100;

// "Usual 0.26 to 0.29" (one number when both ends print the same).
export function usualRange(normal) {
  if (!isNum(normal?.low) || !isNum(normal?.high)) return null;
  const low = formatIndex(normal.low);
  const high = formatIndex(normal.high);
  return low === high ? `Usual ${low}` : `Usual ${low} to ${high}`;
}

// The status word of a reading. The server decides below / normal / above
// (method.js versusNormal, which allows a small margin); "Normal" is said
// only when the printed value is inside the printed range, and "Near
// normal" when it is just outside it.
function readingStatus(reading, value, words) {
  if (!isNum(value) || !reading?.versus) return { word: null, tone: null };
  if (reading.versus === "normal" && isNum(reading.normal?.low) && isNum(reading.normal?.high)) {
    const v = round2(value);
    const inside = v >= round2(reading.normal.low) && v <= round2(reading.normal.high);
    return { word: inside ? "Normal" : "Near normal", tone: "green" };
  }
  return { word: words[reading.versus] || null, tone: VERSUS_TONES[reading.versus] || null };
}

// The highest normal plant health of the year (2019 to 2021), or null.
function usualPeak(normalCurve) {
  const values = (normalCurve || []).map((point) => point?.median).filter(isNum);
  return values.length ? Math.max(...values) : null;
}

// The likely cause of stress in a few words (method.js stressCause).
export function causeText(cause) {
  return STRESS_CAUSES[cause]?.label || null;
}

// The weather-based pest and disease risk as one short note, only when it
// is medium or high (low says nothing): { text, tone } or null.
export function riskNote(risk) {
  if (!risk) return null;
  const rank = { low: 0, medium: 1, high: 2 };
  const top = Math.max(rank[risk.disease] ?? -1, rank[risk.insects] ?? -1);
  if (top < 1) return null;
  return { text: pestRiskLine(risk), tone: top === 2 ? "red" : "amber" };
}

// How the harvest estimate was made (analysis.harvest.basis).
const BASIS_TEXT = { "dry-down": "dry-down", "heat units": "heat units", both: "dry-down and heat units", radar: "radar", images: "satellite images" };
export function basisText(basis) {
  return BASIS_TEXT[basis] ? `from ${BASIS_TEXT[basis]}` : null;
}

// The four tiles of a field, in order. Each is
//   { id, label, value, word, tone, line, note, noteTone, hint }
// value - the big text ("0.28", "0.8 ha", "Ready")
// word  - one status word ("Normal", "Medium", "Ripening"), or null
// tone  - its badge colour: "green" | "amber" | "red" | "blue" | "ink" | null
// line  - at most one short line, or null
// note  - a second, smaller line (the pest risk; how the harvest date was
//         worked out), or null; noteTone colours it
// hint  - a longer explanation for the tooltip, or null
// One big value, at most one status word, nothing said twice.
//   options.units   - the farm's unit
//   options.weather - the /api/farm/weather answer, for the rain date (optional)
//   options.crop    - the crop's name ("Corn"), for the harvest note (optional)
export function fieldTiles(analysis, { units = "ha", weather = null, crop = null } = {}) {
  const a = analysis || {};
  const water = a.water || {};
  const health = a.plantHealth || {};
  const stress = a.stress || {};
  const harvest = a.harvest || {};
  const blank = { word: null, tone: null, line: null, note: null, noteTone: null, hint: null };

  const waterTile = { ...blank, id: "water", label: "Water", value: formatIndex(water.ndwi), ...readingStatus(water, water.ndwi, WATER_WORDS), line: usualRange(water.normal) };

  // A field that never greened up this season is not "Normal", whatever
  // its bare-soil reading today.
  let healthTile;
  if (harvest.stage === "notSown") {
    const peak = usualPeak(a.normalCurve);
    healthTile = {
      ...blank,
      id: "plantHealth",
      label: "Plant health",
      value: formatIndex(health.ndvi),
      word: "No crop",
      tone: "amber",
      line: isNum(harvest.peak) && isNum(peak) ? `Peak ${formatIndex(harvest.peak)}, usual ${formatIndex(peak)}` : "Did not green up this season",
    };
  } else {
    healthTile = { ...blank, id: "plantHealth", label: "Plant health", value: formatIndex(health.ndvi), ...readingStatus(health, health.ndvi, HEALTH_WORDS), line: usualRange(health.normal) };
  }

  // Stress: nothing to stress in an empty field ("No crop", never "None").
  const risk = riskNote(a.pestRisk);
  let stressTile;
  const exempt = analysis ? stressExempt(a) : null;
  if (exempt === "driedDown") {
    stressTile = { ...blank, id: "stress", label: "Stress", value: DRIED_DOWN_LABEL, line: "Not read once a crop dries down", hint: "Leaves die back unevenly as a crop dries for harvest, so the stress rules are not used then." };
  } else if (exempt) {
    stressTile = { ...blank, id: "stress", label: "Stress", value: NO_CROP_LABEL, line: harvest.stage === "harvested" ? "Harvested" : harvest.fallow ? FALLOW_LABEL : "Nothing growing" };
  } else {
    const share = isNum(stress.share) ? stress.share : null;
    const stressedHa = isNum(stress.stressedHa) && stress.stressedHa > 0 ? stress.stressedHa : null;
    const patches = Array.isArray(stress.patches) ? stress.patches.length : 0;
    const note = { note: risk?.text || null, noteTone: risk?.tone || null };
    if (share == null) {
      stressTile = { ...blank, id: "stress", label: "Stress", value: "–", ...note };
    } else if (share > 0 || stressedHa) {
      const pct = share * 100 < 1 ? "Under 1%" : `${Math.round(share * 100)}%`;
      const where = [stressedHa ? `${pct} of the field` : null, patches ? `${patches} ${patches === 1 ? "patch" : "patches"}` : null].filter(Boolean).join(" · ") || null;
      stressTile = {
        ...blank,
        id: "stress",
        label: "Stress",
        value: stressedHa ? formatArea(stressedHa, units) : pct,
        word: stress.level ? stressWord(stress.level) : null,
        tone: STRESS_TONES[stress.level] || null,
        line: causeText(stress.cause) || where,
        ...note,
        hint: [where, stress.redEdge ? "Found early by the red-edge band, before plant health drops" : null].filter(Boolean).join(". ") || null,
      };
    } else {
      stressTile = { ...blank, id: "stress", label: "Stress", value: "None", line: "No weak patches", ...note };
    }
  }

  // Harvest readiness, worded for the crop and saying how it was worked out.
  const rain = weather?.rain?.likely ? weather.rain : null;
  const rainNote = harvest.rainBefore && rain?.from ? `Rain ${formatDay(rain.from)} · harvest first` : harvest.rainBefore ? "Rain due · harvest first" : null;
  const days = isNum(harvest.daysToReady) ? harvest.daysToReady : null;
  const byHeat = harvest.stage === "growing" && harvest.basis === "heat units" && days != null;
  let word = null;
  let tone = null;
  let line = null;
  switch (harvest.stage) {
    case "ready":
      line = harvest.standingDry ? "Standing, dry" : harvest.leafDrop ? "Leaves down · check if cut" : rainNote || (harvest.window?.to ? `Best by ${formatDay(harvest.window.to)}` : null);
      break;
    case "ripening":
      word = "Ripening";
      tone = "blue";
      line = rainNote || (harvest.window?.from ? `Ready about ${formatDay(harvest.window.from)}` : null);
      break;
    case "harvested": {
      const cut = harvest.harvestedOn || harvest.radarHarvestOn;
      line = cut ? `Cut about ${formatDay(cut)}` : harvest.lastDate ? `By ${formatDay(harvest.lastDate)}` : null;
      break;
    }
    case "growing":
      if (harvest.dryDown && isNum(harvest.peak)) line = harvest.peakDate ? `Greenest ${formatIndex(harvest.peak)} on ${formatDay(harvest.peakDate)}` : `Greenest ${formatIndex(harvest.peak)}`;
      else if (byHeat) {
        word = "Growing";
        tone = "green";
        line = harvest.window?.from ? `Ready about ${formatDay(harvest.window.from)}` : null;
      } else line = isNum(harvest.peak) ? `Greenest so far ${formatIndex(harvest.peak)}` : null;
      break;
    case "notSown":
      break;
    default:
      line = "Waiting for a clear pass";
  }
  const basis = harvest.stage === "notSown" ? null : basisText(harvest.basis);
  // No crop known this season (method.js unknownCropHarvest): no date, and
  // a pointer to where the farmer can set it. Fallow or grass has no harvest.
  const fallow = harvest.fallow || (a.cropDetected?.id === "fallow" && (!crop || crop === FALLOW_LABEL));
  const unknownNote = harvest.cropUnknown && !["harvested", "notSown", "unknown"].includes(harvest.stage) ? (fallow ? `${FALLOW_LABEL}: no harvest expected` : "Crop unknown: pick it in Settings for a harvest estimate") : null;
  const gdd = harvest.gdd;
  const harvestTile = {
    ...blank,
    id: "harvest",
    label: "Harvest readiness",
    value: stageWord(harvest),
    word,
    tone,
    line,
    note: unknownNote || (basis ? (crop ? `${crop} · ${basis}` : basis[0].toUpperCase() + basis.slice(1)) : null),
    hint: isNum(gdd?.accumulated) && isNum(gdd?.needed) ? `${Math.round(gdd.accumulated).toLocaleString("en-US")} of about ${Math.round(gdd.needed).toLocaleString("en-US")} heat units (base ${gdd.base} °C) since green-up` : null,
  };

  return [waterTile, healthTile, stressTile, harvestTile];
}

// ---------- The farm at a glance ----------

// How many fields are in each overview group (method.js STATUS_GROUPS).
// A field with no analysis yet is not counted in any group.
// noCrop (harvested or not sown) is split into harvested and notSown too.
// A field with high stress is never counted "healthy", even when its
// status is a harvest one ("Harvest soon"): it is counted "to watch".
export function statusCounts(farm, analyses = {}) {
  const counts = { healthy: 0, noCrop: 0, harvested: 0, notSown: 0, watch: 0, recovery: 0, total: farm?.fields?.length || 0 };
  for (const field of farm?.fields || []) {
    const analysis = analyses[field.id];
    const id = analysis?.status?.id;
    for (const [group, ids] of Object.entries(STATUS_GROUPS)) {
      if (!ids.includes(id)) continue;
      counts[group === "healthy" && analysis?.stress?.applies !== false && analysis?.stress?.level === "high" ? "watch" : group] += 1;
    }
    if (id === "harvested" || id === "notSown") counts[id] += 1;
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
