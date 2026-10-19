// WHAT THIS FILE DOES
// Gives the Field AI the facts it answers from, all read on the server from
// the farmer's saved farm (nothing is sent by the page):
//   - a short "context text" that goes at the top of every Field chat:
//     the farm, every field with its status, area, crop (the farmer's, or
//     the one detected from the satellite record, with how sure it is), the
//     four readings (water, plant health, stress with its likely cause or
//     "No crop", harvest readiness with what it rests on: dry-down, heat
//     units, radar), the weather-based pest and disease risk, condition,
//     how the season went for a harvested or dried-down crop (lastSeason),
//     damage and soil, the weather, the last 5 reports, where the data comes from
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

import { CONDITION_CLASSES, conditionClass, recoveryCost, UNITS, convertArea, BASELINE, DRIED_DOWN_LABEL, MOWN_LABEL, NO_CROP_LABEL, noCropState, pestRiskLine, STRESS_CAUSES } from "../../src/lib/field/method.js";
import { cropSourceOf } from "../field/analysis.js";
import { statusOf } from "../../src/lib/field/format.js";
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
      "Everything about one field: status, condition, the crop (the farmer's or the one detected from the satellite record, with the reason), the four readings (water, plant health, stress with its likely cause, harvest readiness with its basis: dry-down, heat units or radar) with their normal ranges for 2019 to 2021, stress patches, the weather-based pest and disease risk, damage (war or other unusual fire and ground change) and recovery cost, soil, this season's plant-health and water curve from each clear satellite pass, the radar (Sentinel-1 VH) passes, the normal curve, and how much of the field is in each condition zone. Call this when the farmer asks about a particular field. name_or_id is the field's name (like \"Field 3\"), its number, or its id.",
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

const BASIS_WORDS = {
  "dry-down": "from the plant-health dry-down",
  "heat units": "from heat units (growing degree-days) since green-up",
  both: "the dry-down and heat units agree",
  radar: "from the radar (Sentinel-1), which sees through cloud",
  images: "from the satellite images: plant health fell to bare-soil level",
};

// Why a field has no condition, in words (method.js noCropState).
const NO_CROP_WORDS = {
  fallow: "fallow or grass",
  harvested: "harvested",
  notSown: "not sown",
  driedDown: "dried down, crop not known",
};

function harvestText(h) {
  if (!h) return "unknown";
  if (h.fallow && (h.mown || h.stage === "harvested")) {
    const on = h.radarHarvestOn || h.harvestedOn;
    return `fallow or grass, no crop to harvest; ${MOWN_LABEL.toLowerCase()}${on ? ` (the radar saw it cut on ${on})` : ""}, not a harvest`;
  }
  let text;
  switch (h.stage) {
    case "notSown":
      text = "not sown this season";
      break;
    case "growing":
      if (h.fallow) text = `fallow or grass, no crop to harvest${h.dryDown === "dry" ? " (dried off for the season)" : h.dryDown === "fading" ? " (past its peak and fading)" : ""}`;
      else if (h.dryDown === "dry") text = "dried down to harvest level, but the crop is not known, so no harvest date is given (the farmer can set the crop in Settings)";
      else if (h.dryDown === "fading") text = "past its peak and fading, but the crop is not known, so no harvest date is given (the farmer can set the crop in Settings)";
      else text = h.basis === "heat units" && Number.isFinite(h.daysToReady) ? `still growing, ready in about ${h.daysToReady} days` : h.cropUnknown ? "still growing (crop not known, so no harvest date)" : "still growing";
      break;
    case "ripening":
      text = Number.isFinite(h.daysToReady) ? `ripening, ready in about ${h.daysToReady} days` : "ripening";
      break;
    case "ready":
      text = h.standingDry
        ? "ready to harvest now (dried down but still standing: the radar shows no cut)"
        : h.leafDrop
          ? "ready, leaves down: the radar cannot tell whether it has been cut yet (check the field)"
          : "ready to harvest now";
      break;
    case "harvested":
      if (h.radarHarvestOn) text = `harvested (the radar saw the crop cut on ${h.radarHarvestOn})`;
      else text = h.harvestedOn ? `harvested (the satellite first saw it cut or at stubble level on ${h.harvestedOn})` : "harvested";
      break;
    default:
      text = "not enough clear images to tell";
  }
  if (h.basis && BASIS_WORDS[h.basis] && h.stage !== "harvested") text += ` (${BASIS_WORDS[h.basis]})`;
  if (h.gdd && Number.isFinite(h.gdd.accumulated) && Number.isFinite(h.gdd.needed) && ["growing", "ripening"].includes(h.stage)) {
    const since = h.gdd.from && h.gdd.greenUp && h.gdd.from > h.gdd.greenUp ? `the start of spring (${h.gdd.from}; green-up was ${h.gdd.greenUp})` : "green-up";
    text += `; ${Math.round(h.gdd.accumulated)} of about ${Math.round(h.gdd.needed)} degree-days (base ${h.gdd.base} °C) since ${since}`;
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
    text += `, about ${areaText(d.damagedHa, units)} damaged; recovery ${usd(cost.fast.total)} fast path or ${usd(cost.full.total)} full${conflict ? ", before demining" : ""} (a planning assumption, not sourced: not a measured cost)`;
  }
  return text;
}

// The war for one field's analysis: its own, or (for an analysis saved
// before that was stored) the farm's.
const conflictFor = (analysis, farmWar) => (analysis && analysis.conflict !== undefined ? analysis.conflict : farmWar) || null;

// The field's crop in words: the farmer's own, the one detected from the
// satellite record (with how sure), a demo placeholder, or not known.
export function cropText(field, analysis) {
  const source = cropSourceOf(field);
  const detected = analysis?.cropDetected;
  if (source === "user" && field.crop) return field.crop;
  if (source === "detected" && field.crop) return `${field.crop} (detected from the satellite record${detected?.confidence ? `, ${detected.confidence}` : ""}; not confirmed by the farmer)`;
  if (detected && detected.id && detected.id !== "unknown" && detected.season === "last") return `this season's crop not known yet (it can be read once the crop has peaked); last season it was probably ${detected.label} (detected, ${detected.confidence})`;
  if (detected && detected.id && detected.id !== "unknown") return `${detected.label} (detected from the satellite record, ${detected.confidence}; not confirmed by the farmer)`;
  if (source === "demo" && field.crop) return `${field.crop} (a demo placeholder, not detected yet)`;
  return "crop not known yet";
}

function stressText(s, units, harvest = null) {
  if (s && s.applies === false && s.reason === "driedDown") return `Stress: ${DRIED_DOWN_LABEL} (the crop has dried down for harvest; its leaves die back unevenly, so stress is not read).`;
  if (s && s.applies === false && harvest?.fallow) return `Stress: ${NO_CROP_LABEL} (fallow or grass, so no crop stress).`;
  if (s && s.applies === false) return `Stress: ${NO_CROP_LABEL} (nothing growing, so no crop stress).`;
  const parts = [`Stress ${s?.level || "unknown"}${Number.isFinite(s?.share) ? `, ${pct(s.share)} of the field` : ""}${Number.isFinite(s?.stressedHa) ? ` (${areaText(s.stressedHa, units)})` : ""}`];
  const strong = s?.level === "medium" || s?.level === "high";
  if (s?.cause === "spread") parts.push("spread across the field, with no single patch to point to (no cause named)");
  else if (strong && s?.cause && STRESS_CAUSES[s.cause]) parts.push(`likely cause: ${STRESS_CAUSES[s.cause].label}`);
  else if (!strong && Number.isFinite(s?.share) && s.share > 0) parts.push("low, so no cause is named");
  if (s?.redEdge) parts.push("the red edge (Sentinel-2 B5/B8A) shows early stress that plant health does not show yet");
  const patches = Array.isArray(s?.patches) ? s.patches : [];
  if (patches.length) parts.push(`${patches.length} patch${patches.length > 1 ? "es" : ""} (${patches.map((p) => `${Number.isFinite(p.ha) ? `${round(p.ha, 1)} ha` : "?"}${p.cause && STRESS_CAUSES[p.cause] ? ` ${p.cause === "dry" ? "dry" : "not water"}` : ""}`).join(", ")})`);
  return `${parts.join("; ")}.`;
}

// The weather-based pest and disease risk in words, or null.
function riskText(risk) {
  const line = pestRiskLine(risk);
  if (!line) return null;
  const b = risk.basis || {};
  const why = [Number.isFinite(b.wetHours) ? `${b.wetHours} wet hours (humidity 90%+ at 10-25 °C)` : null, Number.isFinite(b.gdd14) ? `${b.gdd14} insect degree-days over 10 °C` : null].filter(Boolean).join(", ");
  return `Pest and disease risk from the weather (a forecast, not a detection): ${line}${why ? ` (${why} in the 7 days before and after today)` : ""}; disease ${risk.disease || "unknown"}, insects ${risk.insects || "unknown"}.`;
}

// How the season went (analysis.lastSeason, method.js seasonResult), in
// words, or null: "This season (harvested): Good, peak 0.78 vs usual
// 0.85 (...)".
export function seasonText(lastSeason) {
  const r = lastSeason;
  if (!r?.label) return null;
  const head = r.soFar ? "This season so far" : "This season (harvested)";
  const peak = Number.isFinite(r.peak) && Number.isFinite(r.normalPeak) ? `, peak ${fixed(r.peak, 2)} vs usual ${fixed(r.normalPeak, 2)}` : "";
  const mean = Number.isFinite(r.mean) && Number.isFinite(r.normalMean) ? `; mean plant health ${fixed(r.mean, 2)} vs normal ${fixed(r.normalMean, 2)} on the same days` : "";
  const span = r.soFar ? `to the last pass ${r.to || "?"}` : `to the last pass before harvest ${r.to || "?"}${r.harvestedOn ? `, cut about ${r.harvestedOn}` : ""}`;
  return `${head}: ${r.label}${peak} (green-up ${r.from || "?"} ${span}${mean}; the peak is the mean of the 3 greenest passes; graded on the lower of the mean and the peak against ${BASELINE.label}, so mostly by the peak; this is how the season went, not the crop now).`;
}

function fieldLine(field, analysis, units, mixed, farmWar = null) {
  const head = `- ${field.name || field.id} (id ${field.id}): ${cropText(field, analysis)}, ${areaText(field.areaHa, units)}.`;
  if (!analysis) return `${head} Not analysed yet.`;
  const ph = analysis.plantHealth || {};
  const w = analysis.water || {};
  const s = analysis.stress || {};
  const c = analysis.condition || {};
  const noCrop = noCropState(analysis.harvest) || (s.applies === false && !Number.isFinite(c.score) ? (analysis.harvest?.stage === "notSown" ? "notSown" : "harvested") : null);
  const parts = [
    head,
    `Status: ${statusOf(analysis)?.label || "unknown"}.`,
    noCrop && !Number.isFinite(c.score) ? `Condition: none (${NO_CROP_WORDS[noCrop]}, no crop to score).` : `Condition ${score100(c.score) ?? "unknown"}/100 (${conditionClass(c.score)?.label || "unknown"}).`,
    seasonText(analysis.lastSeason),
    `Plant health NDVI ${fixed(ph.ndvi, 2)} (normal ${fixed(ph.normal?.low, 2)} to ${fixed(ph.normal?.high, 2)}, ${VERSUS_WORDS[ph.versus] || "no normal"}).`,
    `Water NDWI ${fixed(w.ndwi, 2)} (normal ${fixed(w.normal?.low, 2)} to ${fixed(w.normal?.high, 2)}, ${VERSUS_WORDS[w.versus] || "no normal"}).`,
    stressText(s, units, analysis.harvest),
    riskText(analysis.pestRisk),
    `Harvest: ${harvestText(analysis.harvest)}.`,
    `${conflictFor(analysis, farmWar) ? "War damage" : "Damage"}: ${damageText(analysis.damage, units, conflictFor(analysis, farmWar))}.`,
  ];
  if (Number.isFinite(analysis.soil?.chernozemProbability)) {
    parts.push(`Soil: ${soilName(analysis.soil.soilTypeId) || "unknown"} (black-soil probability ${pct(analysis.soil.chernozemProbability)}).`);
  }
  if (analysis.latestPass?.date) parts.push(`Latest clear pass ${analysis.latestPass.date}${Number.isFinite(analysis.latestPass.clearPct) ? ` (${Math.round(analysis.latestPass.clearPct)}% clear)` : ""}.`);
  if (mixed) parts.push(analysis.provider === "gee" ? "Real data." : "SAMPLE DATA.");
  if (analysis.warnings?.length) parts.push(`Warnings: ${analysis.warnings.map((x) => String(x).replace(/[.\s]+$/, "")).join("; ")}.`);
  return parts.filter(Boolean).join(" ");
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
    lines.push("The farmer has not set up a farm yet. Tell them to open Field → Settings (or the Overview) and type a place or coordinates, or try an example farm (Ukraine, Iowa or Argentina). The app then finds their fields automatically.");
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
  const base = { id: field.id, name: field.name, crop: field.crop || null, cropSource: cropSourceOf(field), areaHa: round(field.areaHa, 2), source: field.source || null };
  if (units && units !== "ha" && UNITS[units]) base.area = `${round(convertArea(field.areaHa, units), 1)} ${UNITS[units].short}`;
  if (!analysis) return { field: base, analysed: false, note: "Not analysed yet." };
  const d = analysis.damage || {};
  return {
    field: base,
    dataSource: analysis.provider === "gee" ? "Google Earth Engine (real)" : "SAMPLE DATA (made up for testing)",
    updatedAt: analysis.updatedAt || null,
    latestPass: analysis.latestPass || null,
    status: statusOf(analysis)?.label || null,
    condition: { score: score100(analysis.condition?.score), class: conditionClass(analysis.condition?.score)?.label || null },
    lastSeason: analysis.lastSeason ? { ...analysis.lastSeason, score: score100(analysis.lastSeason.score), line: seasonText(analysis.lastSeason) } : null,
    plantHealth: analysis.plantHealth || null,
    water: analysis.water || null,
    stress: analysis.stress
      ? {
          ...analysis.stress,
          ...(analysis.stress.applies === false
            ? { note: analysis.stress.reason === "driedDown" ? `${DRIED_DOWN_LABEL}: the crop has dried down for harvest, so stress is not read.` : `${NO_CROP_LABEL}: ${analysis.harvest?.fallow ? "fallow or grass" : "harvested or not sown"}, so no crop stress.` }
            : {}),
          // A cause is named for medium or high stress only.
          causeLabel: analysis.stress.level === "medium" || analysis.stress.level === "high" ? STRESS_CAUSES[analysis.stress.cause]?.label || null : null,
        }
      : null,
    pestRisk: analysis.pestRisk ? { ...analysis.pestRisk, line: pestRiskLine(analysis.pestRisk), note: "A forecast from the weather (hours of wet, warm weather; insect degree-days), not a detection. Check the crop on the ground." } : null,
    harvest: analysis.harvest || null,
    cropDetected: analysis.cropDetected || null,
    radar: analysis.radar ? { vhPeakDb: analysis.radar.vhPeak, passes: (analysis.radar.vhSeries || []).length, last: (analysis.radar.vhSeries || []).slice(-6) } : null,
    damage: {
      ...d,
      recoveryCostUsd: d.detected && Number.isFinite(d.damagedHa)
        ? Object.fromEntries(Object.entries(recoveryCost(d.damagedHa)).map(([id, p]) => [id, p.total.map((x) => Math.round(x))]))
        : null,
      note: `${conflictFor(analysis, farmWar) ? "Costs exclude demining. Satellites cannot see mines." : "Costs are rough ranges for restoring the soil."} The per-hectare costs are planning assumptions (not sourced), not measurements: say so.`,
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
