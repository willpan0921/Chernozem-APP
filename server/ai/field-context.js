// WHAT THIS FILE DOES
// Gives the Field AI the facts it answers from, all read on the server from
// the farmer's saved farm (nothing is sent by the page):
//   - a short "context text" that goes at the top of every Field chat:
//     the farm, every field with its status, area, crop, the four readings
//     (water, plant health, stress, harvest readiness), condition, damage
//     and soil, the weather, the last 5 reports, where the data comes from
//     (it says clearly when it is SAMPLE DATA), and whether a known war
//     covers the farm (src/config/conflicts.js; most farms are at peace);
//   - the tools Claude may call to look things up: get_field,
//     get_field_history, get_weather and get_reports;
//   - the photos of one "Tell us what happened" report, when the chat is
//     about that report, so Claude can see them.
//
// buildFieldContext({ reportId }) -> { text, tools, runTool(name, input), images }
// images is a list of { media_type, data } (base64), at most 4.
//
// WHO EDITS IT
// Whoever changes what the Field AI knows or can look up. To add a tool, add
// its definition to FIELD_TOOLS and a matching case in runFieldTool().
// Keep the tool definitions in the same order (it keeps Claude's prompt
// cache working). The rules (statuses, normal ranges, costs) come from
// src/lib/field/method.js; do not repeat them here.

import { CONDITION_CLASSES, conditionClass, recoveryCost, UNITS, convertArea, BASELINE } from "../../src/lib/field/method.js";
import { soilTypes } from "../../src/data/soilTypes.js";
import { conflictAt } from "../conflicts.js";

// ---------- Tool definitions (sent to Claude) ----------
// strict: true makes Claude's tool inputs always match these shapes.
// Number limits (like "1 to 120") are checked in code, because strict
// schemas do not support minimum/maximum.
export const FIELD_TOOLS = [
  {
    name: "get_field",
    description:
      "Everything about one field: status, condition, the four readings (water, plant health, stress, harvest readiness) with their normal ranges for 2019 to 2021, stress patches, damage (war or other unusual fire and ground change) and recovery cost, soil, this season's plant-health and water curve from each clear satellite pass, the normal curve, and how much of the field is in each condition zone. Call this when the farmer asks about a particular field. name_or_id is the field's name (like \"Field 3\"), its number, or its id.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name_or_id: { type: "string", description: "The field's name, number or id." },
      },
      required: ["name_or_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_field_history",
    description:
      "Monthly plant health (NDVI) and water (NDWI) of one field since January 2019, newest last, each month with its normal (the same month in 2019 to 2021). Call this for questions about past years, trends, or how the field changed since a war began where one covers the farm.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name_or_id: { type: "string", description: "The field's name, number or id." },
        months: { type: "integer", description: "How many recent months to return, 1 to 120." },
      },
      required: ["name_or_id", "months"],
      additionalProperties: false,
    },
  },
  {
    name: "get_weather",
    description:
      "The weather at the farm: now, whether rain is likely soon (dates and millimetres), and the daily forecast (temperatures, rain, chance of rain). Call this for questions about rain, spraying, sowing or harvest timing.",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_reports",
    description:
      "What the farmer reported with \"Tell us what happened\" (shelling, fire, flood, hail, pests, other), newest first, with the field, the text and how many photos.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "How many reports to return, 1 to 20." },
      },
      required: ["limit"],
      additionalProperties: false,
    },
  },
];

// ---------- Small helpers ----------

const SAFE_ID = /^[a-z0-9-]{1,64}$/;
const MAX_IMAGES = 4;
// Claude takes base64 images up to 5 MB each.
const MAX_IMAGE_BASE64 = 5 * 1024 * 1024;
const WEATHER_TIMEOUT_MS = 8000;

const round = (value, digits = 0) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const score100 = (value) => (Number.isFinite(value) ? Math.round(value * 100) : null);
const pct = (share) => (Number.isFinite(share) ? `${Math.round(share * 100)}%` : "unknown");
const fixed = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "unknown");

// 42.1 ha, plus the farmer's own unit when it is not hectares.
function areaText(hectares, units = "ha") {
  if (!Number.isFinite(hectares)) return "unknown area";
  const ha = `${round(hectares, 1).toLocaleString("en-US")} ha`;
  if (!units || units === "ha" || !UNITS[units]) return ha;
  return `${ha} (${round(convertArea(hectares, units), 1).toLocaleString("en-US")} ${UNITS[units].short})`;
}

function coordLabel(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;
}

const VERSUS_WORDS = { below: "below normal", normal: "normal", above: "above normal" };

function soilName(id) {
  return soilTypes.find((s) => s.id === id)?.name || id || null;
}

// Runs a store call, giving null instead of an error (missing files, or a
// store function that does not exist on this server).
async function safe(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// The farm's weather, from the Field server code: getWeather({ lat, lon })
// in server/field/weather.js (Open-Meteo, cached 1 h) at farmCentre(farm)
// from server/field/run.js, the same as the weather tile. Gives back null
// when it cannot be had.
async function defaultGetWeather(farm) {
  const [weather, run] = await Promise.all([import("../field/weather.js"), import("../field/run.js")]);
  const centre = run.farmCentre(farm);
  if (!centre) return null;
  const { current, rain, daily, at, stale } = await weather.getWeather(centre);
  return { current, rain, daily, at, stale: Boolean(stale) };
}

// ---------- Finding a field by what the farmer calls it ----------

// "Field 3", "field 3", "3", "fld-1a2b3c4d" or a unique part of the name.
export function findField(fields, query) {
  const list = Array.isArray(fields) ? fields : [];
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return null;
  const byId = list.find((f) => String(f.id).toLowerCase() === q);
  if (byId) return byId;
  const byName = list.find((f) => String(f.name || "").trim().toLowerCase() === q);
  if (byName) return byName;
  const number = /^(?:field|fld|#)?\s*#?\s*(\d+)$/.exec(q)?.[1];
  if (number) {
    const byNumber = list.find((f) => new RegExp(`(^|\\D)${number}$`).test(String(f.name || "").trim()));
    if (byNumber) return byNumber;
  }
  const partial = list.filter((f) => String(f.name || "").toLowerCase().includes(q));
  return partial.length === 1 ? partial[0] : null;
}

// ---------- Loading the farm ----------

// Loads everything the Field AI needs.
//   reportId   - the report this chat is about (its photos are attached), optional
//   store      - server/store.js, or a stand-in in tests
//   getWeather - (farm) -> weather | null, a stand-in in tests
//   today      - "YYYY-MM-DD", a fixed day in tests
export async function buildFieldContext({ reportId = null, store, getWeather = defaultGetWeather, today } = {}) {
  const st = store || (await import("../store.js"));
  // The farmer's calendar day on this computer (not UTC).
  const day = today || new Date().toLocaleDateString("en-CA");

  const farm = typeof st.getFarm === "function" ? await safe(() => st.getFarm()) : null;
  const fields = Array.isArray(farm?.fields) ? farm.fields : [];

  const analyses = {};
  await Promise.all(
    fields.map(async (field) => {
      const analysis = typeof st.getFieldAnalysis === "function" ? await safe(() => st.getFieldAnalysis(field.id)) : null;
      if (analysis) analyses[field.id] = analysis;
    })
  );

  const allReports = typeof st.listReports === "function" ? (await safe(() => st.listReports())) || [] : [];
  const reports = [...allReports].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  let weather = null;
  let weatherLoaded = false;
  const loadWeather = async () => {
    if (!weatherLoaded) {
      weatherLoaded = true;
      weather = farm ? await safe(() => withTimeout(Promise.resolve(getWeather(farm)), WEATHER_TIMEOUT_MS)) : null;
    }
    return weather;
  };
  if (farm && fields.length) await loadWeather();

  // The report this chat is about, and its photos.
  let report = null;
  let images = [];
  let skippedPhotos = 0;
  if (!(typeof reportId === "string" && SAFE_ID.test(reportId))) reportId = null;
  if (reportId) {
    report =
      reports.find((r) => r.id === reportId) ||
      (typeof st.getReport === "function" ? await safe(() => st.getReport(reportId)) : null);
    if (report) ({ images, skipped: skippedPhotos } = await reportImages(st, report));
  }

  const data = { farm, fields, analyses, reports, weather, today: day, report, reportId, images, skippedPhotos };
  return {
    farm,
    analyses,
    reports,
    report,
    weather,
    images,
    text: fieldContextText(data),
    tools: FIELD_TOOLS,
    runTool: (name, input) => runFieldTool(name, input, { ...data, store: st, loadWeather }),
  };
}

// ---------- Photos ----------

// The image type from the file's first bytes (never trusted from the name).
export function imageTypeOf(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Up to 4 photos of a report as { media_type, data }. Photos that are
// missing, not JPEG/PNG/WebP, or too big for Claude are left out (counted
// in skipped).
export async function reportImages(store, report) {
  const ids = Array.isArray(report?.photos) ? report.photos.filter((id) => typeof id === "string") : [];
  const images = [];
  let skipped = 0;
  for (const id of ids) {
    if (images.length >= MAX_IMAGES) {
      skipped += 1;
      continue;
    }
    const photo = typeof store.readPhoto === "function" ? await safe(() => store.readPhoto(id)) : null;
    const buffer = photo?.buffer ? Buffer.from(photo.buffer) : null;
    const mediaType = imageTypeOf(buffer);
    if (!mediaType) {
      skipped += 1;
      continue;
    }
    const data = buffer.toString("base64");
    if (data.length > MAX_IMAGE_BASE64) {
      skipped += 1;
      continue;
    }
    images.push({ media_type: mediaType, data });
  }
  return { images, skipped };
}

// ---------- The context text ----------

function dataSourceLine(analyses) {
  const providers = new Set(Object.values(analyses).map((a) => a.provider));
  if (!providers.size) return "Data source: the fields have not been analysed yet (no satellite readings).";
  if (providers.size === 1 && providers.has("gee")) {
    return "Data source: Google Earth Engine — real Sentinel-2 satellite readings (10 m, cloudy pixels removed), radar (Sentinel-1) and fire detections (FIRMS).";
  }
  if (providers.has("gee")) {
    return "Data source: MIXED — some fields are real Google Earth Engine readings, others are SAMPLE DATA (made up for testing). Each field says which.";
  }
  return "Data source: SAMPLE DATA — made-up readings for testing, not real satellite measurements. Earth Engine is not connected yet.";
}

function harvestText(h) {
  if (!h) return "unknown";
  let text;
  switch (h.stage) {
    case "notSown":
      text = "not sown this season";
      break;
    case "growing":
      text = "still growing";
      break;
    case "ripening":
      text = Number.isFinite(h.daysToReady) ? `ripening, ready in about ${h.daysToReady} days` : "ripening";
      break;
    case "ready":
      text = "ready to harvest now";
      break;
    case "harvested":
      text = h.harvestedOn ? `harvested (the satellite first saw it cut or at stubble level on ${h.harvestedOn})` : "harvested";
      break;
    default:
      text = "not enough clear images to tell";
  }
  if (h.window?.from) text += `; best window ${h.window.from} to ${h.window.to || h.window.from}`;
  if (h.rainBefore === true) text += "; rain forecast before it";
  return text;
}

function damageText(d, units, conflict) {
  if (!d) return "unknown";
  const evidence = [];
  if (Number.isFinite(d.radarChangedShare)) evidence.push(`radar change on ${pct(d.radarChangedShare)} of the field`);
  if (Number.isFinite(d.excessFires)) {
    const all = Number.isFinite(d.fires) ? ` (${d.fires} in all, ${Number.isFinite(d.firesNormal) ? d.firesNormal : "?"} usual)` : "";
    evidence.push(`${d.excessFires} fire detection(s) above the ${BASELINE.label} rate${d.since ? ` since ${d.since}` : ""}${all}`);
  } else if (Number.isFinite(d.firesSinceWar)) {
    evidence.push(`${d.firesSinceWar} fire detection(s) since ${conflict?.since || "the war began"}`);
  }
  if (Number.isFinite(d.chiDrop)) evidence.push(`soil health index down ${fixed(d.chiDrop, 2)}`);
  if (!d.detected) return `none detected${evidence.length ? ` (${evidence.join(", ")})` : ""}`;
  let text = `DETECTED (${evidence.join(", ") || "see field"})`;
  if (Number.isFinite(d.damagedHa)) {
    const cost = recoveryCost(d.damagedHa);
    const usd = ([lo, hi]) => `$${Math.round(lo).toLocaleString("en-US")}–$${Math.round(hi).toLocaleString("en-US")}`;
    text += `, about ${areaText(d.damagedHa, units)} damaged; recovery ${usd(cost.fast.total)} fast path or ${usd(cost.full.total)} full${conflict ? ", before demining" : ""}`;
  }
  return text;
}

// The war for one field's analysis: its own, or (for an analysis saved
// before that was stored) the farm's.
const conflictFor = (analysis, farmWar) => (analysis && analysis.conflict !== undefined ? analysis.conflict : farmWar) || null;

function fieldLine(field, analysis, units, mixed, farmWar = null) {
  const head = `- ${field.name || field.id} (id ${field.id}): ${field.crop || "crop not set"}, ${areaText(field.areaHa, units)}.`;
  if (!analysis) return `${head} Not analysed yet.`;
  const ph = analysis.plantHealth || {};
  const w = analysis.water || {};
  const s = analysis.stress || {};
  const c = analysis.condition || {};
  const parts = [
    head,
    `Status: ${analysis.status?.label || "unknown"}.`,
    `Condition ${score100(c.score) ?? "unknown"}/100 (${conditionClass(c.score)?.label || "unknown"}).`,
    `Plant health NDVI ${fixed(ph.ndvi, 2)} (normal ${fixed(ph.normal?.low, 2)} to ${fixed(ph.normal?.high, 2)}, ${VERSUS_WORDS[ph.versus] || "no normal"}).`,
    `Water NDWI ${fixed(w.ndwi, 2)} (normal ${fixed(w.normal?.low, 2)} to ${fixed(w.normal?.high, 2)}, ${VERSUS_WORDS[w.versus] || "no normal"}).`,
    `Stress ${s.level || "unknown"}${Number.isFinite(s.share) ? `, ${pct(s.share)} of the field` : ""}${Number.isFinite(s.stressedHa) ? ` (${areaText(s.stressedHa, units)})` : ""}.`,
    `Harvest: ${harvestText(analysis.harvest)}.`,
    `${conflictFor(analysis, farmWar) ? "War damage" : "Damage"}: ${damageText(analysis.damage, units, conflictFor(analysis, farmWar))}.`,
  ];
  if (Number.isFinite(analysis.soil?.chernozemProbability)) {
    parts.push(`Soil: ${soilName(analysis.soil.soilTypeId) || "unknown"} (black-soil probability ${pct(analysis.soil.chernozemProbability)}).`);
  }
  if (analysis.latestPass?.date) parts.push(`Latest clear pass ${analysis.latestPass.date}${Number.isFinite(analysis.latestPass.clearPct) ? ` (${Math.round(analysis.latestPass.clearPct)}% clear)` : ""}.`);
  if (mixed) parts.push(analysis.provider === "gee" ? "Real data." : "SAMPLE DATA.");
  if (analysis.warnings?.length) parts.push(`Warnings: ${analysis.warnings.map((x) => String(x).replace(/[.\s]+$/, "")).join("; ")}.`);
  return parts.join(" ");
}

function weatherLines(weather) {
  if (!weather) return ["Weather: not available right now."];
  const lines = [];
  const now = weather.current;
  if (now) lines.push(`Weather now: ${Number.isFinite(now.tempC) ? `${Math.round(now.tempC)}°C` : "?"}${now.label ? `, ${now.label}` : ""}.`);
  if (weather.rain?.likely) {
    lines.push(`Rain likely ${weather.rain.from}${weather.rain.to && weather.rain.to !== weather.rain.from ? ` to ${weather.rain.to}` : ""}${Number.isFinite(weather.rain.mm) ? `, about ${round(weather.rain.mm, 1)} mm` : ""}.`);
  } else {
    lines.push("No rain likely in the forecast.");
  }
  const days = Array.isArray(weather.daily) ? weather.daily.slice(0, 7) : [];
  if (days.length) {
    lines.push(
      `Forecast: ${days
        .map((d) => `${d.date} ${Number.isFinite(d.tempMin) ? Math.round(d.tempMin) : "?"}–${Number.isFinite(d.tempMax) ? Math.round(d.tempMax) : "?"}°C, rain ${Number.isFinite(d.rainMm) ? round(d.rainMm, 1) : "?"} mm (${Number.isFinite(d.rainChance) ? `${Math.round(d.rainChance)}%` : "?"})`)
        .join("; ")}.`
    );
  }
  return lines;
}

// The field a report is about: its name, "<name> (removed)" for a field
// taken off the farm since, or null.
function reportFieldName(report, fields) {
  const field = fields.find((f) => f.id === report.fieldId);
  if (field) return field.name;
  return typeof report.removedFieldName === "string" && report.removedFieldName ? `${report.removedFieldName} (removed)` : null;
}

function reportLine(report, fields) {
  const photos = Array.isArray(report.photos) ? report.photos.length : 0;
  const text = String(report.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
  return `- ${String(report.createdAt || "").slice(0, 10)}, ${reportFieldName(report, fields) || "no field chosen"}, ${report.kind || "other"}: "${text}"${photos ? ` (${photos} photo${photos > 1 ? "s" : ""})` : ""}`;
}

// The known war covering the farm: from its analyses, else from its place.
// { id, name, since } or null.
export function farmConflict(farm, analyses = {}) {
  const analysed = Object.values(analyses || {}).filter((a) => a && a.conflict !== undefined);
  if (analysed.length) return analysed.find((a) => a.conflict)?.conflict || null;
  const lat = Number(farm?.location?.lat);
  const lon = Number(farm?.location?.lon);
  const found = Number.isFinite(lat) && Number.isFinite(lon) ? conflictAt(lat, lon) : null;
  return found ? { id: found.id, name: found.name, since: found.since } : null;
}

function conflictLine(conflict) {
  if (conflict) return `A known war covers this farm: ${conflict.name}, since ${conflict.since}. Damage is counted from that day, as fire and ground change above the ${BASELINE.label} normal.`;
  return `No war is recorded at this farm. "Damage" here means unusual fire or ground change over the last 2 years compared with ${BASELINE.label}, from any cause (fires above the usual rate only, so yearly stubble burning does not count).`;
}

export function fieldContextText({ farm, fields, analyses, reports, weather, today, report, reportId, images = [], skippedPhotos = 0 }) {
  const lines = [`Today: ${today}.`];
  if (!farm || !fields.length) {
    lines.push("The farmer has not set up a farm yet. Tell them to open Field → Settings (or the Overview) and type a place or coordinates, or try the demo farm. The app then finds their fields automatically.");
    return lines.join("\n");
  }
  const units = farm.units || "ha";
  const totalHa = fields.reduce((sum, f) => sum + (Number.isFinite(f.areaHa) ? f.areaHa : 0), 0);
  const where = farm.location ? [farm.location.label, coordLabel(farm.location.lat, farm.location.lon)].filter(Boolean).join(", ") : null;
  lines.push(`Farm: ${farm.name || "My farm"}${where ? `, ${where}` : ""}${farm.demo ? " (the demo farm)" : ""}. ${fields.length} field${fields.length > 1 ? "s" : ""}, ${areaText(totalHa, units)} in total.`);
  if (units !== "ha" && UNITS[units]) lines.push(`The farmer uses ${UNITS[units].label.toLowerCase()} (${UNITS[units].short}); give areas in that unit.`);
  lines.push(dataSourceLine(analyses));
  lines.push(`"Normal" means the same weeks of the normal years ${BASELINE.label}. Condition classes: ${CONDITION_CLASSES.map((c) => c.label).join(", ")}.`);
  const farmWar = farmConflict(farm, analyses);
  lines.push(conflictLine(farmWar));

  const providers = new Set(Object.values(analyses).map((a) => a.provider));
  lines.push("", "Fields:");
  for (const field of fields) lines.push(fieldLine(field, analyses[field.id], units, providers.size > 1, farmWar));

  lines.push("", ...weatherLines(weather));

  const recent = reports.slice(0, 5);
  lines.push("", recent.length ? "Recent reports from the farmer (newest first):" : "Reports from the farmer: none yet.");
  for (const r of recent) lines.push(reportLine(r, fields));

  if (reportId) {
    lines.push("");
    if (!report) {
      lines.push("This chat was opened about a report that no longer exists.");
    } else {
      lines.push(`This chat is about the farmer's report: ${reportLine(report, fields).slice(2)}`);
      if (images.length) lines.push(`Its ${images.length} photo${images.length > 1 ? "s are" : " is"} attached above as image${images.length > 1 ? "s" : ""}.`);
      if (skippedPhotos) lines.push(`${skippedPhotos} photo${skippedPhotos > 1 ? "s" : ""} could not be shown (missing, too large or not a JPEG, PNG or WebP image).`);
    }
  }
  return lines.join("\n");
}

// ---------- Tools ----------

function zonesSummary(zones) {
  const values = Array.isArray(zones?.values) ? zones.values.filter(Number.isFinite) : [];
  if (!values.length) return null;
  const share = {};
  for (const c of CONDITION_CLASSES) share[c.id] = 0;
  for (const v of values) {
    const c = conditionClass(v);
    if (c) share[c.id] += 1;
  }
  for (const id of Object.keys(share)) share[id] = round(share[id] / values.length, 2);
  return { shareOfFieldByCondition: share, gridCells: values.length };
}

function noField(fields, query) {
  return { error: `No field called "${query}". The fields are: ${fields.map((f) => f.name || f.id).join(", ") || "none"}.` };
}

const NO_FARM = { error: "The farmer has not set up a farm yet." };

export function fieldDetail(field, analysis, units, farmWar = null) {
  const base = { id: field.id, name: field.name, crop: field.crop || null, areaHa: round(field.areaHa, 2), source: field.source || null };
  if (units && units !== "ha" && UNITS[units]) base.area = `${round(convertArea(field.areaHa, units), 1)} ${UNITS[units].short}`;
  if (!analysis) return { field: base, analysed: false, note: "Not analysed yet." };
  const d = analysis.damage || {};
  return {
    field: base,
    dataSource: analysis.provider === "gee" ? "Google Earth Engine (real)" : "SAMPLE DATA (made up for testing)",
    updatedAt: analysis.updatedAt || null,
    latestPass: analysis.latestPass || null,
    status: analysis.status?.label || null,
    condition: { score: score100(analysis.condition?.score), class: conditionClass(analysis.condition?.score)?.label || null },
    plantHealth: analysis.plantHealth || null,
    water: analysis.water || null,
    stress: analysis.stress || null,
    harvest: analysis.harvest || null,
    damage: {
      ...d,
      recoveryCostUsd: d.detected && Number.isFinite(d.damagedHa)
        ? Object.fromEntries(Object.entries(recoveryCost(d.damagedHa)).map(([id, p]) => [id, p.total.map((x) => Math.round(x))]))
        : null,
      note: conflictFor(analysis, farmWar) ? "Costs exclude demining. Satellites cannot see mines." : "Costs are rough ranges for restoring the soil.",
    },
    conflict: conflictFor(analysis, farmWar),
    soil: analysis.soil ? { ...analysis.soil, soilType: soilName(analysis.soil.soilTypeId) } : null,
    season: (analysis.season || []).map((p) => ({ date: p.date, ndvi: round(p.ndvi, 3), ndwi: round(p.ndwi, 3), clearPct: round(p.clearPct) })),
    normalCurve: (analysis.normalCurve || []).map((p) => ({ day: p.day, low: round(p.low, 3), median: round(p.median, 3), high: round(p.high, 3) })),
    zones: zonesSummary(analysis.zones),
    warnings: analysis.warnings || [],
  };
}

// Adds each month's normal: the mean of the same month in the baseline years.
export function historyWithNormal(months) {
  const list = Array.isArray(months) ? months : [];
  const byMonth = {};
  for (const m of list) {
    const year = Number(String(m.month).slice(0, 4));
    if (year < BASELINE.from || year > BASELINE.to) continue;
    const mm = String(m.month).slice(5, 7);
    byMonth[mm] ||= { ndvi: [], ndwi: [] };
    if (Number.isFinite(m.ndvi)) byMonth[mm].ndvi.push(m.ndvi);
    if (Number.isFinite(m.ndwi)) byMonth[mm].ndwi.push(m.ndwi);
  }
  const mean = (xs) => (xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return list.map((m) => {
    const normal = byMonth[String(m.month).slice(5, 7)];
    return {
      month: m.month,
      ndvi: round(m.ndvi, 3),
      ndwi: round(m.ndwi, 3),
      clearPct: round(m.clearPct),
      normalNdvi: round(mean(normal?.ndvi), 3),
      normalNdwi: round(mean(normal?.ndwi), 3),
    };
  });
}

// Runs one tool. Always gives back a plain object (sent to Claude as JSON).
// Problems come back as { error } so Claude can explain them.
export async function runFieldTool(name, input = {}, data) {
  const { farm, fields, analyses, reports, store } = data;
  switch (name) {
    case "get_field": {
      if (!farm || !fields.length) return NO_FARM;
      const field = findField(fields, input.name_or_id);
      if (!field) return noField(fields, input.name_or_id);
      return fieldDetail(field, analyses[field.id], farm.units, farmConflict(farm, analyses));
    }
    case "get_field_history": {
      if (!farm || !fields.length) return NO_FARM;
      const field = findField(fields, input.name_or_id);
      if (!field) return noField(fields, input.name_or_id);
      const count = Math.min(120, Math.max(1, Math.round(Number(input.months) || 12)));
      const history = typeof store.getFieldHistory === "function" ? await safe(() => store.getFieldHistory(field.id)) : null;
      const months = historyWithNormal(history?.months).slice(-count);
      if (!months.length) return { error: `No monthly history for ${field.name} yet. It is filled in when the field is analysed.` };
      return {
        field: field.name,
        dataSource: analyses[field.id]?.provider === "gee" ? "Google Earth Engine (real)" : "SAMPLE DATA (made up for testing)",
        war: farmConflict(farm, analyses),
        warStarted: farmConflict(farm, analyses)?.since || null,
        normalYears: BASELINE.label,
        months,
      };
    }
    case "get_weather": {
      if (!farm) return NO_FARM;
      const weather = await data.loadWeather();
      return weather || { error: "The weather forecast is not available right now." };
    }
    case "get_reports": {
      const limit = Math.min(20, Math.max(1, Math.round(Number(input.limit) || 5)));
      return {
        reports: reports.slice(0, limit).map((r) => ({
          id: r.id,
          date: r.createdAt,
          field: reportFieldName(r, fields),
          kind: r.kind,
          text: String(r.text || "").slice(0, 2000),
          photos: Array.isArray(r.photos) ? r.photos.length : 0,
        })),
      };
    }
    default:
      return { error: `Unknown tool "${name}".` };
  }
}
