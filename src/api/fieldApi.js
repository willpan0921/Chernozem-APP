// WHAT THIS FILE DOES
// The one place the Field pages talk to the Field server routes
// (server/field/routes.js). Pages normally use these through
// src/state/FieldData.jsx (useFieldData) rather than directly.
//
//   getFarm({ full })                 the farm, each field's analysis, the data source, the running job
//   loadDemoFarm()                    the demo farm (7 real fields near Kupiansk) -> { farm, job }
//   detectFields(body)                find fields -> the job (poll it with pollJob)
//                                       { source: "boundary", points: [[lat, lon], ...] }
//                                       { source: "point", lat, lon, radiusM? }
//   geocode(q)                        places for a name or typed coordinates
//   saveFarm(body)                    replace the farm with the chosen fields -> { farm, job }
//   patchFarm(body)                   { name?, units?, autoUpdate?, location? } -> farm
//   deleteFarm()                      start over
//   addField(body) / updateField(id, body) -> { field, job } / removeField(id)
//   analyze(fieldIds?)                update the analysis now -> the job
//   getFieldAnalysis(id)              { analysis, history }
//   getGeotiffUrl(id)                 { url } (Earth Engine only)
//   getWeather()                      now, 10 days, next rain
//   createReport(body) / listReports()  "Tell us what happened"
//   preparePhoto(file)                shrinks a photo for a report (JPEG, at most 2000 px, under 3.5 MB)
//   photoUrl(photoId) / exportUrl(name)   addresses for <img> and download links
//   getJob(id) / pollJob(id, { onProgress, signal })   follow a background job
//
// Errors are thrown as ApiError (from atlasApi.js) with { code, message,
// status }. A 401 "not signed in" brings the access screen back, exactly
// as on the Atlas pages.
//
// WHO EDITS IT
// Whoever adds a Field route on the server. Add its function here too.

import { API_ROOT, ApiError, AUTH_REQUIRED_EVENT } from "./atlasApi.js";

export { ApiError };

function noticeSignedOut(error) {
  if (error?.status === 401 && error.code === "auth_required" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }
}

async function readError(response) {
  try {
    const body = await response.json();
    if (body?.error?.message) return new ApiError(body.error.message, { code: body.error.code, status: response.status });
  } catch {
    // Not JSON: fall through to the generic message.
  }
  if (response.status === 413) return new ApiError("That is too large to send. Use smaller photos.", { code: "too_large", status: 413 });
  return new ApiError(`The server answered with error ${response.status}.`, { status: response.status });
}

async function request(method, path, body, { signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Could not reach the server. Check that it is running and try again.", { code: "offline" });
  }
  if (!response.ok) {
    const error = await readError(response);
    noticeSignedOut(error);
    throw error;
  }
  return response.json();
}

const enc = (value) => encodeURIComponent(value);

// ---------- The farm ----------

// -> { farm | null, analyses: { [fieldId]: analysis }, provider: { id, label, ... }, job | null }
// farm.conflict is the known war at the farm's place ({ id, name, since })
// or null at peace; each field has cropSource "user" | "detected" | "demo" | null.
// An analysis (server/field/analysis.js) has water, plantHealth, condition
// { score, class } (null when harvested or not sown), stress { share, level,
// stressedHa, patches: [{ lat, lon, radiusM, ha, cause }], cause, redEdge,
// applies, reason ("noCrop" | "driedDown" | null) }, pestRisk { disease,
// insects, basis } | null, harvest { stage, daysToReady, window,
// harvestedOn, basis ("dry-down" | "heat units" | "both" | "radar" |
// "images" | null), gdd, radarHarvestOn, standingDry, leafDrop,
// cropUnknown, dryDown ("fading" | "dry" | null), fallow }, cropDetected
// { id (a crop, "fallow" or "unknown"), label, confidence, reason },
// damage, status, conflict.
// full: true adds each analysis's season curve and normal curve (the
// season charts need them; the zones grid stays on the server, for
// downloads and the AI).
export const getFarm = ({ full = true, signal } = {}) => request("GET", `/farm${full ? "?full=1" : ""}`, undefined, { signal });

// -> { farm, job }
export const loadDemoFarm = () => request("POST", "/farm/demo", {});

// body: { name?, location?: { label, lat, lon }, boundary?: GeoJSON, fields: [{ geometry, name?, crop?, source? }] }
// -> { farm, job }
export const saveFarm = (body) => request("PUT", "/farm", body);

export async function patchFarm(body) {
  const { farm } = await request("PATCH", "/farm", body);
  return farm;
}

export async function deleteFarm() {
  await request("DELETE", "/farm");
  return true;
}

// ---------- Fields ----------

// body: { geometry, name?, crop? } -> { field, job }
export const addField = (body) => request("POST", "/farm/fields", body);

// body: { name?, crop? } -> { field, job }. crop: the farmer's crop, or
// null to go back to the detected crop; a changed crop starts a new
// analysis of the field (job, else null).
export async function updateField(fieldId, body) {
  const { field, job = null } = await request("PATCH", `/farm/fields/${enc(fieldId)}`, body);
  return { field, job };
}

export async function removeField(fieldId) {
  await request("DELETE", `/farm/fields/${enc(fieldId)}`);
  return true;
}

// -> { analysis, history: { fieldId, provider, updatedAt, months: [{ month, ndvi, ndwi, clearPct }] } | null }
export const getFieldAnalysis = (fieldId, options) => request("GET", `/farm/fields/${enc(fieldId)}/analysis`, undefined, options);

// -> { url } (throws code "sample" on sample data)
export const getGeotiffUrl = (fieldId) => request("GET", `/farm/fields/${enc(fieldId)}/geotiff`);

// ---------- Finding fields and places ----------

// -> the detection job. Its result (once done) is
//    { candidates: [{ id, geometry, areaHa, centroid: [lat, lon] }], boundary, provider, warnings }
export async function detectFields(body) {
  const { job } = await request("POST", "/farm/detect", body);
  return job;
}

// -> [{ label, lat, lon, bbox: [w, s, e, n] }]
export async function geocode(q, options) {
  const { results } = await request("GET", `/geocode?q=${enc(q)}`, undefined, options);
  return results || [];
}

// ---------- Analysis ----------

// fieldIds: a list, or nothing for every field -> the analysis job
export async function analyze(fieldIds) {
  const { job } = await request("POST", "/farm/analyze", fieldIds?.length ? { fieldIds } : {});
  return job;
}

// ---------- Weather ----------

// -> { current: { tempC, code, label }, rain: { likely, from, to, mm } | null,
//      daily: [{ date, tempMax, tempMin, rainMm, rainChance }],
//      hourly: { wetHours14, gdd14 } (the pest and disease risk inputs), at, stale }
export const getWeather = (options) => request("GET", "/farm/weather", undefined, options);

// ---------- Reports ("Tell us what happened") ----------

// body: { fieldId?, kind: "shelling"|"fire"|"flood"|"hail"|"pests"|"other", text,
//         photos?: [{ name, type, dataBase64 }] } -> report
export async function createReport(body) {
  const { report } = await request("POST", "/farm/reports", body);
  return report;
}

// -> reports, newest first: [{ id, fieldId, kind, text, photos: [photoId], createdAt, removedFieldName? }]
export async function listReports(options) {
  const { reports } = await request("GET", "/farm/reports", undefined, options);
  return reports || [];
}

export const photoUrl = (photoId) => `${API_ROOT}/farm/uploads/${enc(photoId)}`;

// name: "fields.geojson" | "readings.csv" | "history.csv"
export const exportUrl = (name) => `${API_ROOT}/farm/export/${name}`;

// The photo limits: the server takes 3.75 MB; the AI 5 MB once encoded.
export const PHOTO_MAX_SIDE = 2000;
export const PHOTO_MAX_BYTES = 3.5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read the photo."));
    reader.readAsDataURL(blob);
  });
}

// A photo from an <input type="file"> -> { name, type: "image/jpeg", dataBase64 },
// shrunk so its longest side is at most 2000 px and it is under 3.5 MB.
// Throws ApiError "bad_photo" for anything that is not an image.
export async function preparePhoto(file) {
  if (!file || !/^image\//.test(file.type || "")) throw new ApiError(`${file?.name || "That file"} is not a photo.`, { code: "bad_photo" });
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiError(`${file.name} could not be opened as a photo.`, { code: "bad_photo" });
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  // A small photo that is already a JPEG/PNG/WebP under the limit is sent as it is.
  if (scale === 1 && PHOTO_TYPES.includes(file.type) && file.size <= PHOTO_MAX_BYTES) {
    bitmap.close?.();
    return { name: file.name, type: file.type, dataBase64: await blobToBase64(file) };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let blob = null;
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= PHOTO_MAX_BYTES) break;
  }
  if (!blob || blob.size > PHOTO_MAX_BYTES) throw new ApiError(`${file.name} is too large even after shrinking it.`, { code: "photo_too_large" });
  return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", dataBase64: await blobToBase64(blob) };
}

// ---------- Background jobs ----------

// -> { id, kind, status: "running"|"done"|"error", done, total, message, result, error }
export async function getJob(jobId, options) {
  const { job } = await request("GET", `/jobs/${enc(jobId)}`, undefined, options);
  return job;
}

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    });
  });

// Follows a job until it ends. onProgress(job) is called each time it is
// read. Gives back the finished job; a failed job throws an ApiError with
// the job's error (code from the server, or "job_failed").
export async function pollJob(jobId, { onProgress, signal, intervalMs = 800 } = {}) {
  let misses = 0;
  for (;;) {
    let job;
    try {
      job = await getJob(jobId, { signal });
      misses = 0;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (error.status === 404) throw new ApiError("The server restarted and lost this task. Try again.", { code: "job_lost", status: 404 });
      misses += 1;
      if (misses > 5) throw error;
      await wait(intervalMs * 2, signal);
      continue;
    }
    onProgress?.(job);
    if (job.status === "done") return job;
    if (job.status === "error") throw new ApiError(job.error || "The task failed.", { code: job.errorCode || "job_failed" });
    await wait(intervalMs, signal);
  }
}
