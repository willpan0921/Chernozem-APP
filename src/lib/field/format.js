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
//                                      (fallow or grass: "No crop", or "Cut or mown")
//   versusWord("below")             -> "Below normal"
//   waterWord("below")              -> "Drier than usual" (the Water tile's words)
//   stressWord("medium")            -> "Medium"
//   conditionWord("great")          -> "Very good"
//   cropInfo(field, analysis)       -> { name: "Corn", text: "Corn · detected", source: "user" | "detected" | null }
//   detectedChoice(analysis)        -> "Detected: Corn" (the crop select before the farmer picks)
//   analysingIds(farm, analyses, job)  the new fields the running update is analysing (a Set)
//   farmConflict(farm, analyses)    the war covering the farm, null at peace, undefined when unknown
//   mapLook(analysis)               -> { kind, cls, label, ... } how the map (and every field square) draws a field
//   mapMarks(fields, analyses)      what the map legend needs to know (a field needing recovery, not sown...)
//   seasonLine(analysis)            -> "Season: Good" (a harvested field: how its season went)
//   causeText("dry")                -> "Dry patch"
//   riskNote(analysis.pestRisk)     -> { text: "Disease risk high this week", tone: "red" } (medium or high only)
//   basisText("heat units")         -> "from heat units"
//   fieldTiles(analysis, { units, weather, crop })  the four tiles: Water, Plant health, Stress, Harvest readiness
//   statusOf(analysis)              the field's status { id, label, tone } (a no-crop field is never "Healthy")
//   GROUPS / groupOf(statusId)      the overview groups: growing, watch, recovery, noCrop
//   fieldGroup(analysis)            the group a field is counted in (high stress: "watch")
//   statusCounts(farm, analyses)    -> { growing, ready, harvestSoon, watch, recovery, noCrop, harvested, notSown, fallow, driedDown, total }
//   candidateTotals(candidates, selectedIds) -> { count, areaHa }
//
// The rules (what counts as stressed, ready, normal...) are NOT here: they
// are in method.js. This file only puts them into words. Tested in
// format.test.js.
//
// WHO EDITS IT
// Whoever changes how the Field pages word things.

import { CONDITION_CLASSES, DRIED_DOWN_LABEL, FALLOW_LABEL, FIELD_STATUSES, MOWN_LABEL, NO_CROP_LABEL, NO_CROP_STAGES, STATUS_GROUPS, STRESS_CAUSES, UNITS, convertArea, pestRiskLine } from "./method.js";

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
  // Fallow or grass: nothing to harvest; cut on radar is "Cut or mown".
  if (harvest?.fallow) return harvest.stage === "harvested" || harvest.mown || harvest.mownOn || harvest.radarHarvestOn ? "Cut or mown" : NO_CROP_LABEL;
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
export const POSSIBLY_GRASS_TEXT = "Unknown · possibly grass";
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
  // No known crop, but the field looks possibly like fallow or grass
  // (crops.js possiblyFallow): said, so the page agrees with the AI.
  if (found?.possiblyFallow && !own) return { name: null, text: POSSIBLY_GRASS_TEXT, source: "detected", confidence: "possible", reason: found.reason || null };
  return { name: null, text: null, source: null, confidence: null, reason: null };
}

// The empty choice of the crop select in Settings: what the field shows
// until the farmer picks a crop. "Detected: Corn", "Detected: Corn
// (possible)", "Last season: Corn" (as next to the field's name: this
// season has not peaked yet), "Detecting…" while the field is analysed,
// or "Not detected". Kept short: the select is 272 px wide
// (SettingsPage.css) and cuts what does not fit.
export function detectedChoice(analysis, { analysing = false } = {}) {
  const found = analysis?.cropDetected;
  if (found?.id && found.id !== "unknown" && found.label && found.season === "last") return `Last season: ${found.label}`;
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

// ---------- Status and groups ----------

// The overview groups (method.js STATUS_GROUPS): growing well, to watch,
// needs recovery and no crop. A field with no crop (harvested, not sown,
// fallow or grass, dried down) is never in "growing".
const NO_CROP_STATUSES = ["harvested", "notSown", "fallow", "driedDown"];
export const GROUPS = {
  growing: STATUS_GROUPS.growing || STATUS_GROUPS.healthy || ["healthy", "harvestSoon", "ready"],
  watch: STATUS_GROUPS.watch || ["watch", "unknown"],
  recovery: STATUS_GROUPS.recovery || ["recovery"],
  noCrop: [...new Set([...(STATUS_GROUPS.noCrop || []), ...NO_CROP_STATUSES])],
};

// The group a status is in ("growing" | "watch" | "recovery" | "noCrop"), or null.
export function groupOf(statusId) {
  return Object.keys(GROUPS).find((group) => GROUPS[group].includes(statusId)) || null;
}

const STATUS_FALLBACK = {
  fallow: { label: FALLOW_LABEL, tone: null },
  driedDown: { label: DRIED_DOWN_LABEL, tone: null },
  unclear: { label: "Crop unclear", tone: null },
};

// The field's status { id, label, tone }, or null before its analysis.
// An analysis saved before the fallow and dried-down statuses existed
// may still say "Healthy" (or "Watch") for a field with no crop growing:
// it is shown as "Fallow or grass" or "Dried down" here, and an unknown
// crop that is possibly grass as "Crop unclear", never "Growing well".
// The label is always today's word for the status (method.js
// FIELD_STATUSES), so an older "Healthy" reads "Growing well".
export function statusOf(analysis) {
  const status = analysis?.status;
  if (!status?.id) return null;
  let id = status.id;
  if (id === "healthy" || id === "watch") {
    if (analysis.harvest?.fallow) id = "fallow";
    else if (analysis.harvest?.dryDown === "dry") id = "driedDown";
    else if (id === "healthy" && possiblyGrass(analysis)) id = "unclear";
  }
  const known = FIELD_STATUSES?.[id] || STATUS_FALLBACK[id];
  if (id === status.id && (!known || (known.label === status.label && known.tone === status.tone))) return status;
  return { ...status, id, ...known };
}

// True for an unknown crop on a field that is possibly fallow or grass
// (crops.js possiblyFallow) when the rules ran with no crop.
function possiblyGrass(analysis) {
  return Boolean(analysis?.cropDetected?.possiblyFallow) && analysis?.cropDetected?.id === "unknown" && !analysis?.cropUsed?.id;
}

// ---------- The map's marks ----------

// No crop in the field: harvested, not sown, fallow (method.js NO_CROP_STAGES).
// Stress is not read then, nor once a crop has dried down (stress.applies
// false, stress.reason "driedDown").
const noCrop = (analysis) => analysis?.stress?.applies === false || NO_CROP_STAGES.includes(analysis?.harvest?.stage) || GROUPS.noCrop.includes(statusOf(analysis)?.id);

// Why the Stress tile shows no reading: "noCrop", "driedDown" or null.
// Older analyses without stress.reason: from the harvest stage.
function stressExempt(analysis) {
  const stage = analysis?.harvest?.stage;
  if (NO_CROP_STAGES.includes(stage)) return "noCrop";
  if (analysis?.stress?.applies !== false) return null;
  if (analysis.stress.reason) return analysis.stress.reason;
  return stage === "ready" ? "driedDown" : "noCrop";
}

// How the map draws one field, worked out once for the map, its legend and
// every list that shows a field's square:
//   { kind, cls, label, ready, patches, recovery, bare, bareKind, season }
// kind  "crop"       a crop in the field (growing, to watch, ready): its
//                    condition class (cls) now
//       "harvested"  stubble lines over the colour of how its season went
//                    (cls = analysis.lastSeason.class, or null)
//       "fallow"     fallow or grass: its own muted olive, never a class
//       "driedDown"  a crop the app cannot name, dried down: its own tan
//       "notSown"    bare ground
//       "recovery"   red hatch (damage found)
//       "none"       grey: no reading yet
// cls      "poor" | "fair" | "good" | "great" or null
// label    a few words for the square ("Good", "Harvested · season Good")
// ready    gold outline (ready to harvest, or within two weeks)
// patches  the stress patches to circle (none when there is no crop)
// recovery, bare, bareKind  the same facts as kind, for older callers
// season   analysis.lastSeason (how the season went) or null
const SEASON_KINDS = ["harvested", "driedDown"];
export function mapLook(analysis) {
  const status = statusOf(analysis)?.id;
  const recovery = Boolean(analysis) && (status === "recovery" || Boolean(analysis?.damage?.detected));
  const ready = !recovery && (status === "ready" || status === "harvestSoon");
  const bareKind = !recovery && !ready && GROUPS.noCrop.includes(status) ? status : null;
  const patches = !noCrop(analysis) && Array.isArray(analysis?.stress?.patches) ? analysis.stress.patches.filter((p) => isNum(p?.lat) && isNum(p?.lon)) : [];
  const season = seasonShown(analysis);
  const base = { ready, patches, recovery, bare: Boolean(bareKind), bareKind, season: season && (SEASON_KINDS.includes(bareKind) || ready) ? season : null };
  if (!analysis) return { ...base, kind: "none", cls: null, label: "No reading yet" };
  if (recovery) return { ...base, kind: "recovery", cls: null, label: FIELD_STATUSES.recovery?.label || "Needs recovery" };
  if (bareKind === "harvested") {
    const cls = season?.class || null;
    return { ...base, kind: "harvested", cls, label: cls ? `Harvested · season ${conditionWord(cls)}` : "Harvested" };
  }
  if (bareKind === "fallow") return { ...base, kind: "fallow", cls: null, label: FALLOW_LABEL };
  if (bareKind === "driedDown") return { ...base, kind: "driedDown", cls: null, label: DRIED_DOWN_LABEL };
  if (bareKind) return { ...base, kind: "notSown", cls: null, label: "Not sown" };
  const cls = analysis.condition?.class || null;
  if (!cls) return { ...base, kind: "none", cls: null, label: "No reading yet" };
  return { ...base, kind: "crop", cls, label: conditionWord(cls) };
}

// The season result shown for a field (analysis.lastSeason), or null. An
// unknown crop that is possibly grass has none (its cut may be a hay cut:
// analysis.js seasonOf), even in an analysis saved before that rule.
function seasonShown(analysis) {
  const r = analysis?.lastSeason;
  return r?.class && !possiblyGrass(analysis) ? r : null;
}

// "Season: Good" for a field whose season result is shown (a harvested
// field, a crop dried down), or null. With { peaks: true }:
// "Season: Good (peak 0.78, usual 0.85)"; a crop not cut yet says
// "Season so far: Good".
export function seasonLine(analysis, { peaks = false } = {}) {
  const r = seasonShown(analysis);
  if (!r) return null;
  const head = `${r.soFar ? "Season so far" : "Season"}: ${conditionWord(r.class)}`;
  if (!peaks || !isNum(r.peak) || !isNum(r.normalPeak)) return head;
  return `${head} (peak ${formatIndex(r.peak)}, usual ${formatIndex(r.normalPeak)})`;
}

// What the map legend needs to know beyond its fixed marks:
//   -> { classes, marks, recovery, notSown }
//   classes   true when any field is coloured by a class (now or its season)
//   marks     the marks on the map, any of "ready", "recovery", "stress",
//             "harvested", "notSown", "fallow", "driedDown"
//   recovery  a field needs recovery
//   notSown   a field is not sown
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
    if (look.cls) classes = true;
  }
  return { classes, marks: ["ready", "recovery", "stress", ...NO_CROP_STATUSES].filter((id) => marks.has(id)), recovery: marks.has("recovery"), notSown: marks.has("notSown") };
}

// ---------- The four tiles ----------

const VERSUS_TONES = { below: "amber", normal: "green", above: "blue" };
const STRESS_TONES = { low: "green", medium: "amber", high: "red" };
const WATER_WORDS = { below: "Drier than usual", normal: "Normal", above: "Wetter than usual" };
const HEALTH_WORDS = { below: "Below normal", normal: "Normal", above: "Above normal" };

// The Water tile's words for a reading ("Drier than usual"), for every page
// that names water against normal (the printable report too).
export function waterWord(versus) {
  return WATER_WORDS[versus] || "No reading";
}
const round2 = (value) => Math.round(value * 100) / 100;

// "Usual 0.26 to 0.29" (one number when both ends print the same). A
// normal range wider than WIDE_USUAL (fields whose 2019-2021 years mixed
// crops sown in different seasons, so the range spans bare soil to full
// canopy) tells a reader nothing: "Usual range varies (crop rotation)".
export const WIDE_USUAL = 0.4;
export const WIDE_USUAL_LABEL = "Usual range varies (crop rotation)";
export function usualRange(normal) {
  if (!isNum(normal?.low) || !isNum(normal?.high)) return null;
  if (normal.high - normal.low > WIDE_USUAL) return WIDE_USUAL_LABEL;
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

// Medium or high stress with no patch on the map is spread thin over the
// field: no single cause is named for it.
export const SPREAD_LABEL = "Spread across the field";
export function spreadOut(stress) {
  if (stress?.level !== "medium" && stress?.level !== "high") return false;
  return stress.cause === "spread" || (Array.isArray(stress.patches) && stress.patches.length === 0);
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
    // Fallow or grass first: a radar drop there is a cut, never "Harvested".
    const fallowLine = harvest.mown || harvest.stage === "harvested" ? MOWN_LABEL : FALLOW_LABEL;
    stressTile = { ...blank, id: "stress", label: "Stress", value: NO_CROP_LABEL, line: harvest.fallow ? fallowLine : harvest.stage === "harvested" ? "Harvested" : "Nothing growing" };
  } else {
    const share = isNum(stress.share) ? stress.share : null;
    const stressedHa = isNum(stress.stressedHa) && stress.stressedHa > 0 ? stress.stressedHa : null;
    const patches = Array.isArray(stress.patches) ? stress.patches.length : 0;
    const note = { note: risk?.text || null, noteTone: risk?.tone || null };
    if (share == null) {
      stressTile = { ...blank, id: "stress", label: "Stress", value: "–", ...note };
    } else if (share > 0 || stressedHa) {
      const pct = share * 100 < 1 ? "Under 1%" : `${Math.round(share * 100)}%`;
      // One unit on every field: hectares when a patch is mapped, else the
      // share of the field.
      const inHa = Boolean(patches && stressedHa);
      const where = [inHa ? `${pct} of the field` : null, patches ? `${patches} ${patches === 1 ? "patch" : "patches"}` : null].filter(Boolean).join(" · ") || null;
      // A cause is named only for medium or high stress (method.js
      // stressCauseShown): low stress names none.
      const strong = stress.level === "medium" || stress.level === "high";
      stressTile = {
        ...blank,
        id: "stress",
        label: "Stress",
        value: inHa ? formatArea(stressedHa, units) : pct,
        word: stress.level ? stressWord(stress.level) : null,
        tone: STRESS_TONES[stress.level] || null,
        line: spreadOut(stress) ? SPREAD_LABEL : (strong ? causeText(stress.cause) : null) || where || (strong ? null : "No weak patches to check"),
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
  // An unknown crop that is possibly grass and was cut: harvested, or a
  // hay cut (it is not certain enough to be read as fallow, "Cut or mown").
  const maybeHay = harvest.cropUnknown && harvest.stage === "harvested" && a.cropDetected?.possiblyFallow ? "Possibly grass: may be a hay cut" : null;
  // A crop was detected this season but not used for the estimate (its
  // dry-down did not fit its usual harvest, so the detection is only
  // "possible": server/field/analysis.js): "not confirmed", since the
  // page shows it next to the field's name, rather than "unknown".
  const detectedUnused = Boolean(a.cropDetected?.id) && !["unknown", "fallow"].includes(a.cropDetected.id) && a.cropDetected.season !== "last";
  const askNote = `${detectedUnused ? "Crop not confirmed" : "Crop unknown"}: pick it in Settings for a harvest estimate`;
  const unknownNote = harvest.cropUnknown && !["harvested", "notSown", "unknown"].includes(harvest.stage) ? (fallow ? `${FALLOW_LABEL}: no harvest expected` : askNote) : maybeHay;
  const gdd = harvest.gdd;
  // Fallow or grass: nothing to harvest. Cut on radar (or by the optical
  // drop) is "Cut or mown", never "Harvested".
  const fallowField = Boolean(harvest.fallow || statusOf(a)?.id === "fallow");
  const mownOn = fallowField ? harvest.mownOn || harvest.radarHarvestOn || harvest.harvestedOn || null : null;
  const mown = fallowField && (harvest.mown || harvest.stage === "harvested" || Boolean(mownOn));
  const harvestTile = {
    ...blank,
    id: "harvest",
    label: "Harvest readiness",
    value: fallowField ? (mown ? "Cut or mown" : NO_CROP_LABEL) : stageWord(harvest),
    word: fallowField ? null : word,
    tone: fallowField ? null : tone,
    line: fallowField ? (mownOn ? `About ${formatDay(mownOn)}` : null) : line,
    // A harvested field: how its season went (seasonLine), in place of how
    // the harvest was seen.
    note: fallowField
      ? `${FALLOW_LABEL}: no harvest expected`
      : (harvest.stage === "harvested" ? seasonLine(a, { peaks: true }) : null) || unknownNote || (basis ? (crop ? `${crop} · ${basis}` : basis[0].toUpperCase() + basis.slice(1)) : null),
    hint: isNum(gdd?.accumulated) && isNum(gdd?.needed) ? `${Math.round(gdd.accumulated).toLocaleString("en-US")} of about ${Math.round(gdd.needed).toLocaleString("en-US")} heat units (base ${gdd.base} °C) ${gddSince(gdd)}` : null,
  };

  return [waterTile, healthTile, stressTile, harvestTile];
}

// Where the heat units are counted from: "since Sep 1" when counting starts
// after the green-up (a winter cereal counted from the start of spring:
// crops.js gddStartDate), else "since green-up".
export function gddSince(gdd) {
  const from = typeof gdd?.from === "string" ? gdd.from.slice(0, 10) : null;
  const greenUp = typeof gdd?.greenUp === "string" ? gdd.greenUp.slice(0, 10) : null;
  return from && (!greenUp || from > greenUp) ? `since ${formatDay(from)}` : "since green-up";
}

// ---------- The farm at a glance ----------

// The overview group a field is counted in, or null before its analysis.
// A growing field with high stress is "watch".
export function fieldGroup(analysis) {
  const group = groupOf(statusOf(analysis)?.id);
  return group === "growing" && analysis?.stress?.applies !== false && analysis?.stress?.level === "high" ? "watch" : group;
}

// How many fields are in each overview group (GROUPS): growing well, to
// watch, needs recovery, no crop. A field with no analysis yet is not
// counted in any group. noCrop is split into harvested, notSown, fallow
// and driedDown too, and ready counts the growing fields ready to harvest.
// A growing field with high stress is counted "to
// watch", even when its status is a harvest one ("Harvest soon").
// healthy is the old name of growing (kept for older callers).
export function statusCounts(farm, analyses = {}) {
  const counts = { growing: 0, ready: 0, harvestSoon: 0, watch: 0, recovery: 0, noCrop: 0, harvested: 0, notSown: 0, fallow: 0, driedDown: 0, total: farm?.fields?.length || 0 };
  for (const field of farm?.fields || []) {
    const analysis = analyses[field.id];
    const id = statusOf(analysis)?.id;
    const counted = fieldGroup(analysis);
    if (!counted) continue;
    counts[counted] += 1;
    if (counted === "noCrop" && id in counts) counts[id] += 1;
    if (counted === "growing" && id === "ready") counts.ready += 1;
    if (counted === "growing" && id === "harvestSoon") counts.harvestSoon += 1;
  }
  counts.healthy = counts.growing;
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
