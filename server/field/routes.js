// WHAT THIS FILE DOES
// The Field product's web addresses. server/app.js hands every /api/farm...
// and /api/geocode request here (after the access-code check).
//
//   GET    /api/farm                       the farm, each field's latest analysis (?full=1: with
//                                          season and normal curve; zones stay in downloads), the data source, the running job.
//                                          The farm comes with farm.conflict (the known war at its place, or null)
//                                          and every field with cropSource ("user" | "detected" | "demo" | null)
//   POST   /api/farm/demo                  { example?: "ukraine" | "iowa" | "argentina" } load an example farm of
//                                          real field outlines (default "ukraine": 7 fields near Kupiansk; iowa:
//                                          17 near Ames; argentina: 18 near Chivilcoy) and analyse it now.
//                                          The farm has demo: true and example: "<id>"
//   POST   /api/farm/detect                find fields: { source: "boundary", points: [[lat, lon], ...] }
//                                          or { source: "point", lat, lon, radiusM? } -> { job }
//   GET    /api/geocode?q=                 find a place (or read typed coordinates)
//   PUT    /api/farm                       save the farm with the chosen fields (and analyse them)
//   PATCH  /api/farm                       { name?, units?, autoUpdate?, location? }
//   DELETE /api/farm                       start over (removes fields, analyses, reports, photos)
//   POST   /api/farm/fields                add one drawn field
//   PATCH  /api/farm/fields/:id            { name?, crop? } -> { field, job } (a crop is the farmer's own,
//                                          cropSource "user"; crop null or "" goes back to the detected
//                                          crop; a changed crop starts a new analysis of the field: job)
//   DELETE /api/farm/fields/:id            remove a field (and its analysis and history)
//   POST   /api/farm/analyze               { fieldIds? } update the analysis now
//   GET    /api/farm/fields/:id/analysis   { analysis, history }
//   GET    /api/farm/fields/:id/geotiff    { url } (Earth Engine only)
//   GET    /api/farm/weather               now, 10 days, next rain, hourly pest-risk inputs { wetHours14, gdd14 }
//   POST   /api/farm/reports               "Tell us what happened" (up to 4 photos of 3.75 MB; 24 MB limit)
//   GET    /api/farm/reports               newest first
//   GET    /api/farm/uploads/:photoId      a report photo
//   GET    /api/farm/export/fields.geojson | readings.csv | history.csv
//
// Every save path (PUT, the examples, POST /fields) stores the fields
// ordered north-west -> south-east, and unnamed fields are numbered in that
// order ("Field 1" is the north-west one).
//
// Errors are thrown as HttpError and answered by app.js as { error: { code, message } }.
//
// WHO EDITS IT
// Whoever adds a Field route. Keep the list above up to date.

import { HttpError, readJson, sendJson } from "../http.js";
import {
  deleteFarm,
  deleteFieldData,
  deletePhoto,
  deleteReport,
  getFarm,
  getFieldAnalysis,
  getFieldHistory,
  isSafeId,
  listFieldAnalyses,
  listReports,
  newId,
  readPhoto,
  savePhoto,
  saveReport,
  updateFarm,
} from "../store.js";
import { createHash } from "node:crypto";
import { areaHa as sphericalAreaHa, bboxAreaKm2, bboxOf, FIELD_SEARCH_MAX_KM2, formatCoord } from "../geo.js";
import { fieldProviderStatus, getFieldProvider } from "../providers/index.js";
import { UNITS } from "../../src/lib/field/method.js";
import { CROP_SOURCES, cropSourceOf, stripForList } from "./analysis.js";
import { conflictAt } from "../conflicts.js";
import { exampleFarmParts } from "./demo.js";
import { fieldsGeoJson, historyCsv, readingsCsv } from "./exports.js";
import { geocode } from "./geocode.js";
import { farmCentre, orderNorthWestFirst, runningFieldAnalysis, startFieldAnalysis, startFieldDetection } from "./run.js";
import { getWeather } from "./weather.js";

export const LIMITS = {
  fields: { min: 1, max: 60 },
  fieldHa: { min: 0.1, max: 5000 },
  // The largest land searched for fields at once; its outline's box must
  // also fit in FIELD_SEARCH_MAX_KM2 (400 km² = 40,000 ha).
  boundaryHa: { min: 1, max: FIELD_SEARCH_MAX_KM2 * 100 },
  boundaryBoxKm2: FIELD_SEARCH_MAX_KM2,
  radiusM: { min: 300, max: 3000, default: 1200 },
  points: 5000,
  reportText: 2000,
  photos: 4,
  // 3.75 MB a photo: in base64 that is 5 MB, the most Claude takes per
  // image, and 4 of them (20 MB) fit in the 24 MB report body.
  photoBytes: 3.75 * 1024 * 1024,
  reportBodyBytes: 24 * 1024 * 1024,
};
const PHOTO_LIMIT_TEXT = "3.75 MB";
const REPORT_KINDS = ["shelling", "fire", "flood", "hail", "pests", "other"];
const SOURCES = ["detected", "drawn", "demo"];

const bad = (message, code = "bad_request") => new HttpError(400, code, message);
const notFound = (message, code = "not_found") => new HttpError(404, code, message);

// ---------- Checking what was sent ----------

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

function cleanText(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function checkLatLon(lat, lon, label) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw bad(`${label}: latitude must be a number from -90 to 90.`);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw bad(`${label}: longitude must be a number from -180 to 180.`);
}

// A ring of [lon, lat] -> a closed ring, or an error.
function cleanRing(ring, label) {
  if (!Array.isArray(ring)) throw bad(`${label}: the outline is not a list of points.`);
  const out = [];
  ring.forEach((point, i) => {
    if (!Array.isArray(point) || point.length < 2) throw bad(`${label}: point ${i + 1} must be [longitude, latitude].`);
    const lon = toNumber(point[0]);
    const lat = toNumber(point[1]);
    checkLatLon(lat, lon, `${label}, point ${i + 1}`);
    const last = out[out.length - 1];
    if (!last || last[0] !== lon || last[1] !== lat) out.push([lon, lat]);
  });
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  if (out.length < 3) throw bad(`${label}: an outline needs at least 3 different corners.`);
  if (out.length > LIMITS.points) throw bad(`${label}: too many points (the limit is ${LIMITS.points.toLocaleString("en-US")}).`);
  const lons = out.map(([lon]) => lon);
  if (Math.max(...lons) - Math.min(...lons) > 180) throw bad(`${label}: outlines that cross the 180° line are not supported.`);
  out.push([...out[0]]);
  return out;
}

function cleanPolygonRings(rings, label) {
  if (!Array.isArray(rings) || !rings.length) throw bad(`${label}: the outline is empty.`);
  return rings.slice(0, 50).map((ring, i) => cleanRing(ring, i === 0 ? label : `${label} (hole ${i})`));
}

// A field outline: a GeoJSON Polygon (a MultiPolygon gives its largest part).
export function cleanFieldGeometry(geometry, label = "Field") {
  const g = geometry?.type === "Feature" ? geometry.geometry : geometry;
  if (!g || typeof g !== "object") throw bad(`${label}: send its outline as a GeoJSON Polygon.`);
  let polygon;
  if (g.type === "Polygon") polygon = { type: "Polygon", coordinates: cleanPolygonRings(g.coordinates, label) };
  else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates) && g.coordinates.length) {
    const parts = g.coordinates.map((rings) => ({ type: "Polygon", coordinates: cleanPolygonRings(rings, label) }));
    polygon = parts.sort((a, b) => sphericalAreaHa(b) - sphericalAreaHa(a))[0];
  } else throw bad(`${label}: send its outline as a GeoJSON Polygon.`);
  return polygon;
}

function cleanBoundaryGeometry(geometry) {
  const g = geometry?.type === "Feature" ? geometry.geometry : geometry;
  if (g?.type === "Polygon") return { type: "Polygon", coordinates: cleanPolygonRings(g.coordinates, "Boundary") };
  if (g?.type === "MultiPolygon" && Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.length <= 100) {
    return { type: "MultiPolygon", coordinates: g.coordinates.map((rings) => cleanPolygonRings(rings, "Boundary")) };
  }
  throw bad("The boundary must be a GeoJSON Polygon or MultiPolygon.");
}

// [[lat, lon], ...] (as people type them) -> a GeoJSON Polygon.
function polygonFromPoints(points) {
  if (!Array.isArray(points)) throw bad("Send the corners as points: [[lat, lon], ...].");
  const ring = points.map((point, i) => {
    if (!Array.isArray(point) || point.length < 2) throw bad(`Corner ${i + 1} must be [lat, lon].`);
    return [toNumber(point[1]), toNumber(point[0])];
  });
  return { type: "Polygon", coordinates: [cleanRing(ring, "Boundary")] };
}

function checkBoundarySize(geometry) {
  const ha = sphericalAreaHa(geometry);
  if (!(ha >= LIMITS.boundaryHa.min)) throw bad(`That land is too small (${ha.toFixed(2)} ha). Draw at least 1 ha.`, "area_too_small");
  const boxKm2 = bboxAreaKm2(bboxOf(geometry));
  if (ha > LIMITS.boundaryHa.max || boxKm2 > LIMITS.boundaryBoxKm2) {
    const limit = `${LIMITS.boundaryHa.max.toLocaleString("en-US")} ha, inside a ${LIMITS.boundaryBoxKm2} km² box`;
    throw bad(`That land is too large (the limit is ${limit}). Draw a smaller part.`, "area_too_large");
  }
  return ha;
}

function cleanLocation(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw bad("location must be { label, lat, lon }.");
  const lat = toNumber(value.lat);
  const lon = toNumber(value.lon);
  checkLatLon(lat, lon, "Location");
  return { label: cleanText(value.label, 120) || formatCoord(lat, lon), lat, lon };
}

function cleanCrop(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw bad("crop must be text.");
  return cleanText(value, 40) || null;
}

function cleanUnits(value) {
  if (!Object.hasOwn(UNITS, value)) throw bad('units must be "ha", "acres" or "mu".');
  return value;
}

const round2 = (value) => Math.round(value * 100) / 100;

function centroidOf(geometry) {
  const ring = geometry.coordinates[0].slice(0, -1);
  return [ring.reduce((s, p) => s + p[1], 0) / ring.length, ring.reduce((s, p) => s + p[0], 0) / ring.length];
}

// A field's crop and where it came from, from what was sent:
//   - no crop sent: the old field's (same outline), else none;
//   - the same crop the old field already had: its old cropSource (a page
//     sending the farm back unchanged does not turn a detected crop into
//     the farmer's own);
//   - a crop with a cropSource ("demo" from the demo farm, "detected"):
//     that; any other crop sent is the farmer's own ("user").
function cropOf(item, old) {
  if (item?.crop === undefined) return old ? { crop: old.crop ?? null, cropSource: cropSourceOf(old) } : { crop: null, cropSource: null };
  const crop = cleanCrop(item.crop);
  if (!crop) return { crop: null, cropSource: null };
  if (CROP_SOURCES.includes(item.cropSource)) return { crop, cropSource: item.cropSource };
  if (old && old.crop === crop) return { crop, cropSource: cropSourceOf(old) || "user" };
  return { crop, cropSource: "user" };
}

// Fields ordered north-west -> south-east (run.js orderNorthWestFirst).
const northWestFirst = (fields) => orderNorthWestFirst(fields, (f) => centroidOf(f.geometry));

// Makes the farm's field list from what was sent, ordered north-west ->
// south-east. Fields with the same outline as an old field keep that
// field's id (and so its analysis); unnamed fields are numbered in that
// order.
//   labelFor(i) - what to call an unnamed field in error messages
function buildFields(list, oldFields = [], defaultSource = "detected", labelFor = (i) => `Field ${i + 1}`) {
  if (!Array.isArray(list)) throw bad("Send the fields as a list.");
  if (list.length < LIMITS.fields.min) throw bad("Pick at least one field.", "no_fields");
  if (list.length > LIMITS.fields.max) throw bad(`A farm can have at most ${LIMITS.fields.max} fields.`, "too_many_fields");
  const now = new Date().toISOString();
  const byShape = new Map(oldFields.map((field) => [JSON.stringify(field.geometry), field]));
  const usedIds = new Set();
  const fields = list.map((item, i) => {
    const label = cleanText(item?.name, 60) || labelFor(i);
    const geometry = cleanFieldGeometry(item?.geometry, label);
    const ha = sphericalAreaHa(geometry);
    if (ha < LIMITS.fieldHa.min) throw bad(`${label} is too small (${ha.toFixed(2)} ha). The minimum is 0.1 ha.`, "field_too_small");
    if (ha > LIMITS.fieldHa.max) throw bad(`${label} is too large (${Math.round(ha).toLocaleString("en-US")} ha). The maximum is 5,000 ha.`, "field_too_large");
    const old = byShape.get(JSON.stringify(geometry));
    const keepOld = old && !usedIds.has(old.id);
    const id = keepOld ? old.id : newId("fld");
    usedIds.add(id);
    const source = SOURCES.includes(item?.source) ? item.source : keepOld ? old.source : defaultSource;
    const { crop, cropSource } = cropOf(item, keepOld ? old : null);
    return {
      id,
      name: cleanText(item?.name, 60) || (keepOld ? old.name : null),
      geometry,
      areaHa: round2(ha),
      crop,
      cropSource,
      source,
      createdAt: keepOld ? old.createdAt : now,
    };
  });
  // Sorted north-west to south-east first, then the unnamed fields are
  // numbered in that order.
  const ordered = northWestFirst(fields);
  const taken = new Set(ordered.filter((field) => field.name).map((field) => field.name.toLowerCase()));
  let n = 1;
  for (const field of ordered.filter((f) => !f.name)) {
    while (taken.has(`field ${n}`)) n += 1;
    field.name = `Field ${n}`;
    taken.add(`field ${n}`);
  }
  return ordered;
}

// True when a place is within about 25 km of the middle of the farm's fields.
function nearFields(location, farm) {
  const centre = farmCentre(farm);
  if (!centre || !Number.isFinite(location?.lat) || !Number.isFinite(location?.lon)) return false;
  const dx = (location.lon - centre.lon) * 111.32 * Math.cos((centre.lat * Math.PI) / 180);
  const dy = (location.lat - centre.lat) * 110.57;
  return Math.hypot(dx, dy) <= 25;
}

// The lowest free "Field N" name on a farm.
function nextFieldName(fields) {
  const taken = new Set((fields || []).map((f) => String(f.name).toLowerCase()));
  let n = 1;
  while (taken.has(`field ${n}`)) n += 1;
  return `Field ${n}`;
}

function locationFor(farm) {
  const centre = farmCentre(farm);
  return centre ? { label: formatCoord(centre.lat, centre.lon), lat: Math.round(centre.lat * 1e5) / 1e5, lon: Math.round(centre.lon * 1e5) / 1e5 } : null;
}

// ---------- Farm ----------

const withCropSource = (field) => ({ ...field, cropSource: cropSourceOf(field) });

// The farm as the pages get it: every field with its cropSource (older
// farms have none saved) and farm.conflict, the known war at the farm's
// place (src/config/conflicts.js) or null, so a page can choose its words
// before any analysis exists.
export function presentFarm(farm) {
  if (!farm) return null;
  const centre = Number.isFinite(farm.location?.lat) && Number.isFinite(farm.location?.lon) ? { lat: farm.location.lat, lon: farm.location.lon } : farmCentre(farm);
  const war = centre ? conflictAt(centre.lat, centre.lon) : null;
  return {
    ...farm,
    fields: (farm.fields || []).map(withCropSource),
    conflict: war ? { id: war.id, name: war.name, since: war.since } : null,
  };
}

// full: each analysis with its season and normal curves; zones too only
// with zones: true (the downloads). The pages show the satellite map only,
// so /farm?full=1 leaves the zones grid out.
async function analysesMap({ full = false, zones = false } = {}) {
  const farm = await getFarm();
  const ids = new Set((farm?.fields || []).map((field) => field.id));
  const out = {};
  for (const analysis of await listFieldAnalyses()) {
    if (!ids.has(analysis.fieldId)) continue;
    if (!full) out[analysis.fieldId] = stripForList(analysis);
    else if (zones) out[analysis.fieldId] = analysis;
    else {
      const { zones: _grid, ...rest } = analysis;
      out[analysis.fieldId] = rest;
    }
  }
  return out;
}

async function removeOldFieldData(oldFields, keepIds) {
  for (const field of oldFields || []) {
    if (!keepIds.has(field.id)) await deleteFieldData(field.id).catch(() => {});
  }
}

async function replaceFarm(body, { demo = false } = {}) {
  const old = await getFarm();
  const fields = buildFields(body.fields, old?.fields || [], demo ? "demo" : "detected");
  const now = new Date().toISOString();
  let boundary = null;
  if (body.boundary != null) {
    boundary = cleanBoundaryGeometry(body.boundary);
    checkBoundarySize(boundary);
  }
  const farm = {
    id: old?.id || newId("farm"),
    name: cleanText(body.name, 80) || (old && !old.demo ? old.name : null) || (demo ? "Demo farm" : "My farm"),
    location: body.location !== undefined ? cleanLocation(body.location) : null,
    boundary,
    fields,
    units: old?.units && UNITS[old.units] ? old.units : "ha",
    autoUpdate: old?.autoUpdate ?? true,
    demo,
    // Which example farm this is ("ukraine", "iowa", "argentina"), or null.
    example: demo && typeof body.example === "string" ? body.example : null,
    createdAt: old?.createdAt || now,
    updatedAt: now,
  };
  // No location sent: keep the farm's place name (like "Kupiansk, Kharkiv
  // Oblast") while the fields are still near it (within 25 km); else name
  // the spot by its coordinates.
  if (body.location === undefined && old?.location && nearFields(old.location, farm)) farm.location = old.location;
  if (!farm.location) farm.location = locationFor(farm);
  await updateFarm(() => farm);
  await removeOldFieldData(old?.fields, new Set(fields.map((field) => field.id)));
  const job = await startFieldAnalysis({ trigger: demo ? "demo" : "setup" });
  return { farm, job };
}

async function patchFarm(body) {
  const saved = await updateFarm((farm) => {
    if (!farm) throw notFound("There is no farm yet.", "no_farm");
    if (body.name !== undefined) {
      const name = cleanText(body.name, 80);
      if (!name) throw bad("The farm name cannot be empty.");
      farm.name = name;
    }
    if (body.units !== undefined) farm.units = cleanUnits(body.units);
    if (body.autoUpdate !== undefined) farm.autoUpdate = Boolean(body.autoUpdate);
    if (body.location !== undefined) farm.location = cleanLocation(body.location) || locationFor(farm);
    farm.updatedAt = new Date().toISOString();
    return farm;
  });
  return saved;
}

async function addField(body) {
  let field;
  await updateFarm((farm) => {
    const now = new Date().toISOString();
    const base = farm || { id: newId("farm"), name: "My farm", location: null, boundary: null, fields: [], units: "ha", autoUpdate: true, demo: false, createdAt: now };
    if (base.fields.length >= LIMITS.fields.max) throw bad(`A farm can have at most ${LIMITS.fields.max} fields.`, "too_many_fields");
    // A new field gets the lowest free "Field N" name (also in error messages).
    const name = nextFieldName(base.fields);
    const [made] = buildFields([{ ...body, source: SOURCES.includes(body.source) ? body.source : "drawn" }], [], "drawn", () => name);
    if (!cleanText(body.name, 60)) made.name = name;
    field = made;
    base.fields = northWestFirst([...base.fields, made]);
    if (!base.location) base.location = locationFor(base);
    base.updatedAt = now;
    return base;
  });
  const job = await startFieldAnalysis({ fieldIds: [field.id], trigger: "added" });
  return { field, job };
}

// A changed crop changes the harvest rules (ready share, heat units, the
// standing-dry radar rule), so the field is analysed again with it
// (trigger "crop"); until then its analysis says which crop it used
// (analysis.cropUsed). Gives back { field, job }.
async function changeField(id, body) {
  let field;
  let cropChanged = false;
  const detected = body.crop !== undefined && isSafeId(id) ? (await getFieldAnalysis(id).catch(() => null))?.cropDetected : null;
  await updateFarm((farm) => {
    const found = farm?.fields?.find((f) => f.id === id);
    if (!found) throw notFound("That field is not on the farm.");
    if (body.name !== undefined) {
      const name = cleanText(body.name, 60);
      if (!name) throw bad("The field name cannot be empty.");
      found.name = name;
    }
    if (body.crop !== undefined) {
      const before = `${found.crop ?? ""}|${cropSourceOf(found) ?? ""}`;
      const crop = cleanCrop(body.crop);
      if (crop) Object.assign(found, { crop, cropSource: "user" });
      else {
        // Back to what the satellite found this season (or nothing yet).
        const known = detected && detected.id !== "unknown" && detected.season !== "last" ? detected.label : null;
        Object.assign(found, { crop: known, cropSource: known ? "detected" : null });
      }
      cropChanged = before !== `${found.crop ?? ""}|${found.cropSource ?? ""}`;
    }
    farm.updatedAt = new Date().toISOString();
    field = withCropSource({ ...found });
    return farm;
  });
  const job = cropChanged ? await startFieldAnalysis({ fieldIds: [id], trigger: "crop" }).catch(() => null) : null;
  return { field, job };
}

async function removeField(id) {
  let removed;
  await updateFarm((farm) => {
    removed = farm?.fields?.find((f) => f.id === id);
    if (!removed) throw notFound("That field is not on the farm.");
    farm.fields = farm.fields.filter((f) => f.id !== id);
    farm.updatedAt = new Date().toISOString();
    return farm;
  });
  await deleteFieldData(id);
  // Its reports stay, no longer tied to a field, with the old name kept.
  for (const report of await listReports()) {
    if (report.fieldId === id) await saveReport({ ...report, fieldId: null, removedFieldName: removed.name });
  }
}

async function startOver() {
  const farm = await getFarm();
  for (const field of farm?.fields || []) await deleteFieldData(field.id).catch(() => {});
  for (const report of await listReports()) {
    for (const photoId of report.photos || []) await deletePhoto(photoId).catch(() => {});
    await deleteReport(report.id);
  }
  await updateFarm(async () => {
    await deleteFarm();
    return null;
  });
}

async function fieldOf(id) {
  const farm = await getFarm();
  const field = isSafeId(id) ? farm?.fields?.find((f) => f.id === id) : null;
  if (!field) throw notFound("That field is not on the farm.");
  return { farm, field };
}

// ---------- Detection ----------

// The same search sent twice joins the running one.
const searchKey = (input) => createHash("sha1").update(JSON.stringify(input)).digest("hex").slice(0, 16);

async function detect(body) {
  if (body.source === "boundary") {
    const boundary = body.points !== undefined ? polygonFromPoints(body.points) : cleanBoundaryGeometry(body.boundary ?? body.geometry);
    checkBoundarySize(boundary);
    return startFieldDetection({ boundary, key: searchKey({ boundary }) });
  }
  if (body.source === "point") {
    const lat = toNumber(body.lat);
    const lon = toNumber(body.lon);
    checkLatLon(lat, lon, "The place");
    let radiusM = body.radiusM === undefined || body.radiusM === null ? LIMITS.radiusM.default : toNumber(body.radiusM);
    if (!Number.isFinite(radiusM)) throw bad("radiusM must be a number of metres.");
    radiusM = Math.min(LIMITS.radiusM.max, Math.max(LIMITS.radiusM.min, Math.round(radiusM)));
    return startFieldDetection({ center: { lat, lon }, radiusM, key: searchKey({ lat, lon, radiusM }) });
  }
  throw bad('source must be "boundary" (with points) or "point" (with lat and lon).');
}

// ---------- Reports and photos ----------

const MAGIC = [
  { ext: "jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: "webp", test: (b) => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
];

export function photoKind(buffer) {
  return MAGIC.find((item) => item.test(buffer))?.ext || null;
}

function decodePhoto(photo, i) {
  const label = `Photo ${i + 1}`;
  if (!photo || typeof photo !== "object") throw bad(`${label} is not a file.`, "bad_photo");
  let data = typeof photo.dataBase64 === "string" ? photo.dataBase64.trim() : "";
  const prefix = data.match(/^data:[^;,]*;base64,/i);
  if (prefix) data = data.slice(prefix[0].length);
  data = data.replace(/\s+/g, "");
  if (!data || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(data)) throw bad(`${label} is not a valid file.`, "bad_photo");
  const tooLarge = (bytes) =>
    new HttpError(413, "photo_too_large", `${label} is too large (${(bytes / 1048576).toFixed(1)} MB; the limit is ${PHOTO_LIMIT_TEXT}). Make the photo smaller and try again.`);
  if ((data.length * 3) / 4 > LIMITS.photoBytes + 4) throw tooLarge((data.length * 3) / 4);
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > LIMITS.photoBytes) throw tooLarge(buffer.length);
  const ext = photoKind(buffer);
  if (!ext) throw bad(`${label} must be a JPEG, PNG or WebP image.`, "bad_photo");
  return { buffer, ext };
}

async function createReport(body) {
  const kind = body.kind;
  if (!REPORT_KINDS.includes(kind)) throw bad(`kind must be one of: ${REPORT_KINDS.join(", ")}.`);
  const text = typeof body.text === "string" ? body.text.trim().slice(0, LIMITS.reportText) : "";
  const photos = body.photos == null ? [] : body.photos;
  if (!Array.isArray(photos)) throw bad("photos must be a list.", "bad_photo");
  if (photos.length > LIMITS.photos) throw bad(`At most ${LIMITS.photos} photos per report.`, "too_many_photos");
  if (!text && !photos.length) throw bad("Write what happened or add a photo.");
  let fieldId = null;
  if (body.fieldId != null && body.fieldId !== "") {
    const farm = await getFarm();
    if (!isSafeId(body.fieldId) || !farm?.fields?.some((f) => f.id === body.fieldId)) throw bad("That field is not on the farm.", "unknown_field");
    fieldId = body.fieldId;
  }
  // Check every photo before saving any.
  const decoded = photos.map(decodePhoto);
  const photoIds = [];
  for (const photo of decoded) {
    const photoId = newId("photo");
    await savePhoto(photoId, photo.ext, photo.buffer);
    photoIds.push(photoId);
  }
  const report = { id: newId("rep"), fieldId, kind, text, photos: photoIds, createdAt: new Date().toISOString() };
  await saveReport(report);
  return report;
}

// ---------- Sending files ----------

function sendFile(res, status, type, body, filename) {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (filename) res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}

async function exportsData() {
  const farm = await getFarm();
  if (!farm) throw notFound("There is no farm yet.", "no_farm");
  const analyses = await analysesMap({ full: true, zones: true });
  return { farm, analyses };
}

// ---------- Router ----------

export async function handleFieldRoutes(req, res, url) {
  const method = (req.method || "GET").toUpperCase();
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(2); // after "/api"
  const [first, second, third, fourth] = parts;
  const q = url.searchParams;

  if (first === "geocode" && !second) {
    if (method !== "GET") throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${url.pathname}.`);
    const text = (q.get("q") || "").trim();
    if (!text) throw bad("Type a place name or coordinates.");
    return sendJson(res, 200, { results: await geocode(text) }), true;
  }
  if (first !== "farm") return false;

  if (!second) {
    if (method === "GET") {
      const [farm, analyses, provider] = await Promise.all([getFarm(), analysesMap({ full: q.get("full") === "1" }), fieldProviderStatus()]);
      return sendJson(res, 200, { farm: presentFarm(farm), analyses, provider, job: runningFieldAnalysis() }), true;
    }
    if (method === "PUT") {
      const { farm, job } = await replaceFarm(await readJson(req));
      return sendJson(res, 200, { farm: presentFarm(farm), job }), true;
    }
    if (method === "PATCH") return sendJson(res, 200, { farm: presentFarm(await patchFarm(await readJson(req))) }), true;
    if (method === "DELETE") {
      await startOver();
      return sendJson(res, 200, { ok: true }), true;
    }
  }

  if (second === "demo" && !third && method === "POST") {
    const body = await readJson(req);
    const parts2 = await exampleFarmParts(body.example).catch((error) => {
      throw error.code === "unknown_example" ? bad(error.message, "unknown_example") : error;
    });
    const { farm, job } = await replaceFarm(parts2, { demo: true });
    return sendJson(res, 201, { farm: presentFarm(farm), job }), true;
  }

  if (second === "detect" && !third && method === "POST") {
    return sendJson(res, 202, { job: await detect(await readJson(req)) }), true;
  }

  if (second === "analyze" && !third && method === "POST") {
    const body = await readJson(req);
    let fieldIds = null;
    if (body.fieldIds != null) {
      if (!Array.isArray(body.fieldIds) || !body.fieldIds.every(isSafeId)) throw bad("fieldIds must be a list of field ids.");
      fieldIds = body.fieldIds;
    }
    return sendJson(res, 202, { job: await startFieldAnalysis({ fieldIds, trigger: "manual" }) }), true;
  }

  if (second === "fields") {
    if (!third && method === "POST") {
      const { field, job } = await addField(await readJson(req));
      return sendJson(res, 201, { field: withCropSource(field), job }), true;
    }
    if (third && !fourth && method === "PATCH") return sendJson(res, 200, await changeField(third, await readJson(req))), true;
    if (third && !fourth && method === "DELETE") {
      await removeField(third);
      return sendJson(res, 200, { ok: true }), true;
    }
    if (third && fourth === "analysis" && method === "GET") {
      await fieldOf(third);
      const [analysis, history] = await Promise.all([getFieldAnalysis(third), getFieldHistory(third)]);
      return sendJson(res, 200, { analysis, history }), true;
    }
    if (third && fourth === "geotiff" && method === "GET") {
      const { field } = await fieldOf(third);
      const provider = await getFieldProvider();
      if (provider.id !== "gee" || typeof provider.geotiffUrl !== "function") {
        throw bad("GeoTIFF downloads need Earth Engine (this is sample data).", "sample");
      }
      const url2 = await provider.geotiffUrl({ field, analysis: await getFieldAnalysis(field.id) });
      return sendJson(res, 200, { url: typeof url2 === "string" ? url2 : url2?.url }), true;
    }
  }

  if (second === "weather" && !third && method === "GET") {
    const farm = await getFarm();
    const centre = farmCentre(farm);
    if (!centre) throw notFound("Add your farm first.", "no_farm");
    const { current, rain, daily, hourly, today, at, stale } = await getWeather(centre);
    return sendJson(res, 200, { current, rain, daily, hourly: hourly ?? null, today: today ?? null, at, stale: Boolean(stale) }), true;
  }

  if (second === "reports" && !third) {
    if (method === "POST") return sendJson(res, 201, { report: await createReport(await readJson(req, { maxBytes: LIMITS.reportBodyBytes })) }), true;
    if (method === "GET") return sendJson(res, 200, { reports: await listReports() }), true;
  }

  if (second === "uploads" && third && !fourth && method === "GET") {
    const photo = await readPhoto(third);
    if (!photo) throw notFound("That photo does not exist.");
    res.statusCode = 200;
    res.setHeader("Content-Type", photo.type);
    res.setHeader("Content-Length", photo.buffer.length);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.end(photo.buffer);
    return true;
  }

  if (second === "export" && third && !fourth && method === "GET") {
    if (third === "fields.geojson") {
      const { farm, analyses } = await exportsData();
      return sendFile(res, 200, "application/geo+json; charset=utf-8", JSON.stringify(fieldsGeoJson(farm, analyses)), "chernozem-fields.geojson"), true;
    }
    if (third === "readings.csv") {
      const { farm, analyses } = await exportsData();
      return sendFile(res, 200, "text/csv; charset=utf-8", readingsCsv(farm, analyses), "chernozem-readings.csv"), true;
    }
    if (third === "history.csv") {
      const { farm } = await exportsData();
      const histories = {};
      for (const field of farm.fields) histories[field.id] = await getFieldHistory(field.id);
      return sendFile(res, 200, "text/csv; charset=utf-8", historyCsv(farm, histories), "chernozem-history.csv"), true;
    }
    throw notFound("No such download.");
  }

  // A known path with the wrong method, or an unknown one.
  const known = { undefined: 1, demo: 2, detect: 2, analyze: 2, fields: 4, weather: 2, reports: 2, uploads: 3, export: 3 };
  if (known[second] && parts.length <= known[second]) {
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${url.pathname}.`);
  }
  throw notFound(`No such API route: ${url.pathname}`);
}
