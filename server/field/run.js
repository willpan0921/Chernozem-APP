// WHAT THIS FILE DOES
// The Field product's background jobs (they show up at /api/jobs/:id like
// the Atlas jobs, with kind "field-detect" or "field-analyze"):
//
//   startFieldDetection({ boundary, center, radiusM, key })  find the fields in /
//                         around a place; the job's result is
//                         { candidates, boundary, center, radiusM, provider, warnings }
//                         (center, radiusM: the circle searched around a point;
//                         the nearest farmland when the place is mostly town)
//   startFieldAnalysis({ fieldIds, trigger })   analyse the farm's fields
//                         (all, or some), save each analysis, and refresh
//                         a field's monthly history when it is missing,
//                         older than 30 days or from another data source
//   farmCentre(farm)      { lat, lon } of the farm, for the weather
//   orderNorthWestFirst(items, centroidOf)   sorts north-west -> south-east
//   needsRefresh(farm, analyses, providerId) fields whose analysis is
//                         missing, older than 24 h or sample data while
//                         Earth Engine is connected (used by the scheduler)
//   sampleWhileEarthEngine(farm, analyses, providerId) fields still on
//                         sample data although Earth Engine is connected;
//                         the scheduler redoes these once even when
//                         "Update automatically" is off
//
// WHO EDITS IT
// Whoever changes how fields are found or analysed.

import { startJob, listJobs } from "../jobs.js";
import { getFarm, getFieldHistory, saveFieldAnalysis, saveFieldHistory, whileFarmLocked } from "../store.js";
import { getFieldProvider, withTimeout } from "../providers/index.js";
import { areaHa as sphericalAreaHa, bboxOf } from "../geo.js";
import { finishAnalysis, localToday } from "./analysis.js";
import { getWeather } from "./weather.js";

const DAY_MS = 86400000;
const HISTORY_MAX_AGE_MS = 30 * DAY_MS;
export const ANALYSIS_MAX_AGE_MS = DAY_MS;
const WEATHER_WAIT_MS = 9000; // the weather request itself gives up after 8 s
// Fields whose monthly history is read at the same time. One at a time,
// a farm of 60 detected fields took 25 minutes on real Earth Engine
// (Iowa, 2026-10-19), most of it waiting.
export const HISTORY_PARALLEL = 2;

export function farmCentre(farm) {
  const boxes = (farm?.fields || []).map((field) => bboxOf(field.geometry)).filter(Boolean);
  if (boxes.length) {
    const west = Math.min(...boxes.map((b) => b[0]));
    const south = Math.min(...boxes.map((b) => b[1]));
    const east = Math.max(...boxes.map((b) => b[2]));
    const north = Math.max(...boxes.map((b) => b[3]));
    return { lat: (south + north) / 2, lon: (west + east) / 2 };
  }
  if (Number.isFinite(farm?.location?.lat) && Number.isFinite(farm?.location?.lon)) return { lat: farm.location.lat, lon: farm.location.lon };
  return null;
}

// North-west first, south-east last (rows from the north, then west to
// east), the way people number fields on a map.
export function orderNorthWestFirst(items, centroidOf) {
  const points = items.map((item) => ({ item, c: centroidOf(item) }));
  const lat0 = points.reduce((s, p) => s + p.c[0], 0) / (points.length || 1);
  const kx = Math.cos((lat0 * Math.PI) / 180);
  return points.sort((a, b) => (b.c[0] - a.c[0]) - kx * (b.c[1] - a.c[1]) || b.c[0] - a.c[0]).map((p) => p.item);
}

function centroidOfGeometry(geometry) {
  const ring = geometry?.coordinates?.[0] || [];
  if (!ring.length) return [0, 0];
  const pts = ring.slice(0, ring.length > 1 ? -1 : undefined);
  return [pts.reduce((s, p) => s + p[1], 0) / pts.length, pts.reduce((s, p) => s + p[0], 0) / pts.length];
}

// The largest polygon of a Polygon/MultiPolygon, as a Polygon.
function asPolygon(geometry) {
  if (geometry?.type === "Polygon") return geometry;
  if (geometry?.type === "MultiPolygon" && geometry.coordinates.length) {
    const best = [...geometry.coordinates]
      .map((coordinates) => ({ coordinates, ha: sphericalAreaHa({ type: "Polygon", coordinates }) }))
      .sort((a, b) => b.ha - a.ha)[0];
    return { type: "Polygon", coordinates: best.coordinates };
  }
  return null;
}

// ---------- Finding fields ----------

// At most this many searches run at once (each is a big Earth Engine job).
export const MAX_RUNNING_DETECTIONS = 2;

//   key - what makes two searches the same: the same search sent again
//         joins the running one instead of starting a second
export async function startFieldDetection({ boundary = null, center = null, radiusM = 1200, key = null }) {
  const running = listJobs({ kind: "field-detect", status: "running" });
  const same = key != null ? running.find((job) => job.key === key) : null;
  if (same) return same;
  if (running.length >= MAX_RUNNING_DETECTIONS) {
    const error = new Error("Still finding fields for an earlier search. Wait for it to finish, then try again.");
    error.status = 429;
    error.code = "busy";
    throw error;
  }
  return startJob({
    kind: "field-detect",
    key,
    total: 100,
    message: boundary ? "Finding the fields inside your land…" : "Finding the fields around this place…",
    info: { source: boundary ? "boundary" : "point" },
    run: async (job) => {
      const provider = await getFieldProvider();
      job.provider = provider.id;
      const result = await provider.detectFields({
        boundary,
        center,
        radiusM,
        onProgress: (share) => {
          job.done = Math.round(Math.max(0, Math.min(1, Number(share) || 0)) * 99);
        },
      });
      const cleaned = (result?.candidates || [])
        .map((candidate) => {
          const geometry = asPolygon(candidate.geometry);
          if (!geometry) return null;
          const areaHa = Number.isFinite(candidate.areaHa) ? candidate.areaHa : sphericalAreaHa(geometry);
          const centroid = Array.isArray(candidate.centroid) && candidate.centroid.every(Number.isFinite) ? candidate.centroid : centroidOfGeometry(geometry);
          return { geometry, areaHa: Math.round(areaHa * 100) / 100, centroid };
        })
        .filter((candidate) => candidate && candidate.areaHa > 0)
        .slice(0, 60);
      const candidates = orderNorthWestFirst(cleaned, (c) => c.centroid).map((candidate, i) => ({ id: `cand-${i + 1}`, ...candidate }));
      const warnings = [...(result?.warnings || [])].filter((w) => typeof w === "string");
      if (!candidates.length && !warnings.some((w) => /No fields found/i.test(w))) {
        warnings.push("No fields found here — try a larger area or draw your fields.");
      }
      job.message = candidates.length === 1 ? "Found 1 field" : `Found ${candidates.length} fields`;
      // center / radiusM: the circle searched in the end. When the place is
      // mostly town, forest or water the data source searches the nearest
      // farmland instead, so the centre can differ from the one asked for.
      const at = result?.center;
      const searchedCenter = center ? (Number.isFinite(at?.lat) && Number.isFinite(at?.lon) ? { lat: at.lat, lon: at.lon } : { lat: center.lat, lon: center.lon }) : null;
      const searchedRadius = center ? (Number.isFinite(result?.radiusM) ? result.radiusM : radiusM) : null;
      return { candidates, boundary, center: searchedCenter, radiusM: searchedRadius, provider: { id: provider.id, label: provider.id === "gee" ? provider.label || "Earth Engine" : "Sample data" }, warnings };
    },
  });
}

// ---------- Analysing fields ----------

const today = () => localToday();
const thisMonth = () => localToday().slice(0, 7);

// Saves something about a field only if the field is still on the farm at
// that moment (a field removed while it was being analysed stays removed).
async function saveWhileOnFarm(fieldId, save) {
  return whileFarmLocked(async (farm) => {
    if (!farm?.fields?.some((field) => field.id === fieldId)) return false;
    await save();
    return true;
  });
}

function historyIsStale(history, providerId) {
  if (!history || !Array.isArray(history.months) || !history.months.length) return true;
  if (history.provider && history.provider !== providerId) return true;
  const at = Date.parse(history.updatedAt || "");
  return !Number.isFinite(at) || Date.now() - at > HISTORY_MAX_AGE_MS;
}

export function needsRefresh(farm, analyses, providerId) {
  return (farm?.fields || []).filter((field) => {
    const analysis = analyses[field.id];
    if (!analysis) return true;
    if (analysis.provider === "sample" && providerId !== "sample") return true;
    const at = Date.parse(analysis.updatedAt || "");
    return !Number.isFinite(at) || Date.now() - at > ANALYSIS_MAX_AGE_MS;
  });
}

export function sampleWhileEarthEngine(farm, analyses, providerId) {
  if (providerId !== "gee") return [];
  return (farm?.fields || []).filter((field) => analyses[field.id] && analyses[field.id].provider !== "gee");
}

// The running analysis of the farm, if any.
export function runningFieldAnalysis() {
  return listJobs({ kind: "field-analyze", status: "running" })[0] || null;
}

export async function startFieldAnalysis({ fieldIds = null, trigger = "manual" } = {}) {
  const farm = await getFarm();
  if (!farm || !farm.fields?.length) {
    const error = new Error("Add your fields first.");
    error.status = 400;
    error.code = "no_fields";
    throw error;
  }
  const wanted = Array.isArray(fieldIds) && fieldIds.length ? farm.fields.filter((field) => fieldIds.includes(field.id)) : farm.fields;
  if (!wanted.length) {
    const error = new Error("None of those fields are on the farm.");
    error.status = 404;
    error.code = "not_found";
    throw error;
  }
  // A running analysis that already covers these fields is given back.
  const ids = wanted.map((field) => field.id);
  const covering = listJobs({ kind: "field-analyze", status: "running" }).find((job) => ids.every((id) => job.fieldIds?.includes(id)));
  if (covering) return covering;
  const key = [...ids].sort().join(",");

  return startJob({
    kind: "field-analyze",
    key,
    trigger,
    total: wanted.length,
    message: wanted.length === 1 ? `Analysing ${wanted[0].name}…` : `Analysing ${wanted.length} fields…`,
    info: { fieldIds: wanted.map((field) => field.id) },
    run: (job) => runAnalysis(job, farm, wanted),
  });
}

async function runAnalysis(job, farm, fields) {
  const provider = await getFieldProvider();
  job.provider = provider.id;
  const day = today();
  const centre = farmCentre(farm);
  const weatherAttempt = centre ? getWeather(centre).catch(() => null) : Promise.resolve(null);
  const result = await provider.analyzeFields({
    fields,
    today: day,
    onProgress: (share) => {
      job.done = Math.floor(Math.max(0, Math.min(1, Number(share) || 0)) * fields.length * 0.999);
    },
  });
  const weather = await withTimeout(weatherAttempt, WEATHER_WAIT_MS, null);
  const warnings = [...(result?.warnings || [])];

  // The farm may have changed while the data source worked: only save
  // analyses for fields that are still on it.
  const current = await getFarm();
  const stillThere = new Set((current?.fields || []).map((field) => field.id));
  const saved = [];
  for (const field of fields) {
    if (!stillThere.has(field.id)) continue;
    const raw = result?.analyses?.[field.id];
    if (!raw) {
      warnings.push(`${field.name}: no reading came back.`);
      continue;
    }
    const analysis = finishAnalysis({ field, raw, weather, today: day, provider: provider.id });
    if (await saveWhileOnFarm(field.id, () => saveFieldAnalysis(analysis))) saved.push(field.id);
  }

  // Monthly history (2019 to now), only where it is missing or old.
  const needHistory = [];
  for (const field of fields) {
    if (stillThere.has(field.id) && historyIsStale(await getFieldHistory(field.id), provider.id)) needHistory.push(field);
  }
  job.total = fields.length + needHistory.length;
  job.done = fields.length;
  const queue = [...needHistory];
  const readHistories = async () => {
    for (let field = queue.shift(); field; field = queue.shift()) {
      job.message = `Reading the history of ${field.name} since 2019…`;
      try {
        const months = await provider.fieldHistory({ field, from: "2019-01", to: thisMonth() });
        const history = { fieldId: field.id, provider: provider.id, updatedAt: new Date().toISOString(), months: Array.isArray(months) ? months : [] };
        await saveWhileOnFarm(field.id, () => saveFieldHistory(history));
      } catch (error) {
        warnings.push(`${field.name}: the history could not be read (${error.message}).`);
        console.warn(`[chernozem] Field history of ${field.name} failed: ${error.message}`);
      }
      job.done += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(HISTORY_PARALLEL, queue.length) }, readHistories));
  job.message = saved.length === 1 ? "1 field analysed" : `${saved.length} fields analysed`;
  return { fieldIds: saved, provider: provider.id, warnings };
}
