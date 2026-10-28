// WHAT THIS FILE DOES
// Saves and loads everything the Atlas keeps: the workspace (settings,
// team, budget), the areas people chose, the monthly runs and the AI chat
// threads. Each is a JSON file under server/.data/ (or the folder named by
// CHERNOZEM_DATA_DIR), so stopping and starting the server keeps it all.
//
//   workspace.json    one workspace
//   areas/<id>.json   one file per area
//   runs/<id>.json    one file per monthly run (with its grid cells)
//   chats/<id>.json   one file per AI chat thread
//   messages/<id>.json  one file per message from the public website's
//                     contact form (server/messages.js)
//   units/<areaId>.json  the area's states or districts with their borders
//                     (FAO GAUL 2015, server/units.js), worked out once
//   soil/<areaId>.json   the soil types of the area's squares and states
//                     looked at so far (server/soil.js)
//   farm.json, field-analysis/, field-history/, reports/, uploads/
//                     the Field product (see the Field section at the end)
//   users/<id>/       one such folder per registered account (below), with
//   users/<id>/profile.json   the account's profile (server/accounts.js)
//   users/<id>/session.json   when the account last signed out (server/auth.js)
//
// Files are written safely (to a temporary file first, then renamed), and
// ids may only contain a-z, 0-9 and "-", so a request can never reach a
// file outside this folder.
//
// ONE FOLDER PER ACCOUNT (added with the registered accounts, 2026-10)
// The folder above is the BASE folder: the demo everyone with the access
// code shares. A person who registered (server/accounts.js) gets a folder
// of their own under it, users/<32 hex characters made from their id>/,
// with the same files inside (workspace.json, areas/, farm.json...) and a
// profile.json on top. Nothing is copied into it: a fresh folder simply
// has no areas and no farm yet.
//
// Which folder a read or write goes to is decided by dataDir(): the base
// folder, unless the work runs inside withDataRoot(folder, work). The
// server opens that scope once per request (server/app.js) for the
// signed-in account's folder, and background jobs and the monthly check
// open it again for the folder they belong to (server/jobs.js,
// server/scheduler.js). Everything else in this file, and every module
// that calls it, needs no change: the scope follows the awaits.
//
// Always on the base folder, whatever the scope: baseDataDir(), used for
// the sign-in salt (server/auth.js), the data upload (server/import.js)
// and the lock release at shutdown (server/index.js).
//
// WHO EDITS IT
// Nobody, normally. To move to a real database later, replace the inside of
// these functions; the rest of the server only calls the functions.

import fs from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { ROOT, refreshEnv } from "./env.js";
import { checkSettings, DEFAULT_SETTINGS } from "../src/lib/atlas/method.js";

const SAFE_ID = /^[a-z0-9-]{1,64}$/;

// The base folder: CHERNOZEM_DATA_DIR, or server/.data. Read again on
// every call, so a change of the setting (the tests do this) is followed.
export function baseDataDir() {
  refreshEnv();
  const custom = (process.env.CHERNOZEM_DATA_DIR || "").trim();
  return custom ? path.resolve(custom) : path.join(ROOT, "server", ".data");
}

// The folder the work running now belongs to (see the top of this file).
// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps one scope for every copy of the server's files.
const scope = (globalThis.__chernozemDataScope ??= new AsyncLocalStorage());

// The folder every read and write in this file goes to right now: the
// account's folder inside withDataRoot, else the base folder.
export function dataDir() {
  const current = scope.getStore();
  return current?.root || baseDataDir();
}

// Runs work() (a function; it may return a promise) with every read and
// write inside it going to `root`, whatever called it. A root of null
// means the base folder. The scope reaches everything the work awaits or
// starts, so a route handler that calls store functions, or a job's
// run(), needs no root of its own.
export function withDataRoot(root, work) {
  return scope.run({ root: root || null }, work);
}

// The folder of one registered account: users/<the first 32 hex
// characters of the SHA-256 of the account id>/ under the base folder. A
// hash, because Firebase ids have capitals (SAFE_ID would refuse them) and
// so that a folder name says nothing about who it belongs to.
export function userRoot(uid) {
  if (typeof uid !== "string" || !uid || uid.length > 256) throw new Error("userRoot needs the account's id.");
  const name = createHash("sha256").update(uid).digest("hex").slice(0, 32);
  return path.join(baseDataDir(), "users", name);
}

// Every account folder on disk (full paths), for the monthly check. Only
// folders named like userRoot makes them count; anything else under
// users/ is left alone.
export async function listUserRoots() {
  const parent = path.join(baseDataDir(), "users");
  let names;
  try {
    names = await fs.readdir(parent, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((entry) => entry.isDirectory() && /^[0-9a-f]{32}$/.test(entry.name))
    .map((entry) => path.join(parent, entry.name))
    .sort();
}

export function isSafeId(id) {
  return typeof id === "string" && SAFE_ID.test(id);
}

function assertSafeId(id) {
  if (!isSafeId(id)) {
    const error = new Error(`Not a valid id: ${String(id).slice(0, 80)}`);
    error.status = 400;
    error.code = "bad_id";
    throw error;
  }
}

// "run" -> "run-3f9a0c12"
export function newId(prefix) {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

function fileFor(kind, id) {
  assertSafeId(id);
  return path.join(dataDir(), kind, `${id}.json`);
}

async function readFile(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeFile(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
}

// Writes value to file only if file does not exist yet. Gives back true if
// this call created it, false if it was already there. The content is
// complete the moment the name appears (written to a temporary file first).
async function createFileOnce(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  try {
    await fs.link(tmp, file);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

async function listFiles(kind) {
  try {
    const names = await fs.readdir(path.join(dataDir(), kind));
    return names.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).filter(isSafeId);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

// ---------- Workspace ----------

// A new workspace has no budget (the page asks for one) and no team (the
// first person added is its admin): nothing made up. The monthly Atlas
// update is on for the demo (the base folder) and OFF for a registered
// account's fresh folder (server/quotas.js: a self-registered account
// should not have Earth Engine work every month unless the person asks
// for it in Settings).
function defaultWorkspace() {
  return {
    name: "Regional office",
    currentAreaId: null,
    settings: checkSettings(DEFAULT_SETTINGS),
    budgetUsd: null,
    doneSteps: [],
    schedule: { autoMonthly: dataDir() === baseDataDir() },
    team: [],
  };
}

// Fills any missing field from the defaults, so older files keep working.
function normalizeWorkspace(ws) {
  const base = defaultWorkspace();
  const merged = { ...base, ...(ws || {}) };
  merged.settings = checkSettings(merged.settings || {});
  merged.schedule = { ...base.schedule, ...(merged.schedule || {}) };
  if (!Array.isArray(merged.doneSteps)) merged.doneSteps = [];
  if (!Array.isArray(merged.team)) merged.team = base.team;
  if (!Number.isFinite(merged.budgetUsd)) merged.budgetUsd = null;
  return merged;
}

export async function getWorkspace() {
  const file = path.join(dataDir(), "workspace.json");
  const saved = await readFile(file);
  if (saved) return normalizeWorkspace(saved);
  // First start. Several requests can arrive at once, so the file is only
  // created if it is still missing (a hard link fails if the name exists);
  // the requests that lose the race read the winner's file instead, and
  // everyone sees the same team ids.
  const fresh = defaultWorkspace();
  if (await createFileOnce(file, fresh)) return fresh;
  return normalizeWorkspace(await readFile(file));
}

export async function saveWorkspace(ws) {
  const clean = normalizeWorkspace(ws);
  await writeFile(path.join(dataDir(), "workspace.json"), clean);
  return clean;
}

// Changes the workspace one request at a time, so two quick edits (a
// weight slider and a ticked step) cannot overwrite each other.
// change(ws) edits ws in place or returns a new one.
const lock = (globalThis.__chernozemWorkspaceLock ??= { chain: Promise.resolve() });
export function updateWorkspace(change) {
  const next = lock.chain.then(async () => {
    const ws = await getWorkspace();
    const changed = (await change(ws)) || ws;
    return saveWorkspace(changed);
  });
  lock.chain = next.catch(() => {});
  return next;
}

// ---------- Areas ----------

export async function getArea(id) {
  if (!isSafeId(id)) return null;
  return readFile(fileFor("areas", id));
}

export async function listAreas() {
  const ids = await listFiles("areas");
  const areas = (await Promise.all(ids.map((id) => getArea(id)))).filter(Boolean);
  return areas.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function saveArea(area) {
  await writeFile(fileFor("areas", area.id), area);
  return area;
}

// Changes a saved area one request at a time (like updateWorkspace), so a
// new name and a new war setting sent together cannot overwrite each
// other, and a change never brings back an area that was just removed.
// change(area) edits it in place or gives back a new one. Gives back the
// saved area, or null when there is no such area (nothing is saved).
const areaLock = (globalThis.__chernozemAreaLock ??= { chain: Promise.resolve() });
function inAreaQueue(work) {
  const next = areaLock.chain.then(work);
  areaLock.chain = next.catch(() => {});
  return next;
}

export function updateArea(id, change) {
  return inAreaQueue(async () => {
    const area = await getArea(id);
    if (!area) return null;
    const changed = (await change(area)) || area;
    return saveArea(changed);
  });
}

// Removes an area and every monthly run made for it (and its saved states
// and soil types). Gives back how many runs went with it. A missing area is
// not an error (gives back 0).
export function deleteArea(id) {
  return inAreaQueue(async () => {
    if (!isSafeId(id)) return 0;
    const runs = await listRuns(id);
    for (const run of runs) await deleteRun(run.id);
    try {
      await fs.unlink(fileFor("areas", id));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const kind of ["units", "soil"]) {
      try {
        await fs.unlink(fileFor(kind, id));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return runs.length;
  });
}

// ---------- States and regions, soil types (the Atlas map) ----------
// Worked out from Earth Engine once and kept, so later reads are instant
// (server/units.js, server/soil.js). Null when there is none yet.

export async function getUnitsCache(areaId) {
  if (!isSafeId(areaId)) return null;
  return readFile(fileFor("units", areaId));
}

export async function saveUnitsCache(areaId, value) {
  await writeFile(fileFor("units", areaId), value);
  return value;
}

export async function getSoilCache(areaId) {
  if (!isSafeId(areaId)) return null;
  return readFile(fileFor("soil", areaId));
}

// Changes an area's soil file one request at a time (two squares looked at
// together both stay). change(file) edits the file ({ cells, units }) in
// place; gives back the saved file.
const soilLock = (globalThis.__chernozemSoilLock ??= { chain: Promise.resolve() });
export function updateSoilCache(areaId, change) {
  const next = soilLock.chain.then(async () => {
    assertSafeId(areaId);
    const file = (await readFile(fileFor("soil", areaId))) || { areaId, cells: {}, units: {} };
    file.cells ||= {};
    file.units ||= {};
    await change(file);
    await writeFile(fileFor("soil", areaId), file);
    return file;
  });
  soilLock.chain = next.catch(() => {});
  return next;
}

// ---------- Runs ----------
// The run list is read often, and run files are large (they hold every
// cell), so the summaries are kept in memory after the first read. If the
// runs folder changed on disk (for example "npm start" and "npm run dev"
// both use the same folder), only the files that changed are read again.

const runCache = (globalThis.__chernozemRunCache ??= new Map()); // dataDir -> { dirMtimeMs, summaries: Map(id -> summary), mtimes: Map(id -> ms) }

function summaryOf(run) {
  const { cells, alerts, ...summary } = run;
  return summary;
}

async function mtimeOf(file) {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function runSummaries() {
  const dir = dataDir();
  let cache = runCache.get(dir);
  if (!cache || !(cache.summaries instanceof Map)) {
    cache = { dirMtimeMs: undefined, summaries: new Map(), mtimes: new Map() };
    runCache.set(dir, cache);
  }
  const dirMtimeMs = await mtimeOf(path.join(dir, "runs"));
  if (dirMtimeMs === cache.dirMtimeMs) return cache.summaries;
  cache.dirMtimeMs = dirMtimeMs;
  const ids = new Set(await listFiles("runs"));
  for (const id of cache.summaries.keys()) {
    if (!ids.has(id)) {
      cache.summaries.delete(id);
      cache.mtimes.delete(id);
    }
  }
  for (const id of ids) {
    try {
      const file = fileFor("runs", id);
      const mtime = await mtimeOf(file);
      if (mtime != null && cache.mtimes.get(id) === mtime && cache.summaries.has(id)) continue;
      const run = await readFile(file);
      if (run) {
        cache.summaries.set(id, summaryOf(run));
        cache.mtimes.set(id, mtime);
      }
    } catch (error) {
      console.warn(`[chernozem] Skipping unreadable run ${id}: ${error.message}`);
    }
  }
  return cache.summaries;
}

export async function getRun(id) {
  if (!isSafeId(id)) return null;
  return readFile(fileFor("runs", id));
}

// Run summaries (no cells), newest month first. areaId is optional.
export async function listRuns(areaId) {
  const all = [...(await runSummaries()).values()];
  return all
    .filter((run) => !areaId || run.areaId === areaId)
    .sort((a, b) => b.month.localeCompare(a.month) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function saveRun(run) {
  const file = fileFor("runs", run.id);
  await writeFile(file, run);
  const summaries = await runSummaries();
  summaries.set(run.id, summaryOf(run));
  runCache.get(dataDir())?.mtimes.set(run.id, await mtimeOf(file));
  return run;
}

export async function deleteRun(id) {
  try {
    await fs.unlink(fileFor("runs", id));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const summaries = await runSummaries();
  summaries.delete(id);
  runCache.get(dataDir())?.mtimes.delete(id);
}

// ---------- Locks ----------
// A lock file stops two servers that share one data folder (for example
// "npm run dev" and "npm start") from doing the same work twice.
//   acquireLock("scheduler", 3 * 60 * 60 * 1000) -> true if this server got it
//   releaseLock("scheduler")
// A lock older than maxAgeMs, or held by a program that has stopped, is
// taken over. Calling acquireLock again while holding it renews it.

function lockFile(name) {
  assertSafeId(name);
  return path.join(dataDir(), `${name}.lock`);
}

function isRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export async function acquireLock(name, maxAgeMs) {
  const file = lockFile(name);
  const mine = { pid: process.pid, at: new Date().toISOString() };
  if (await createFileOnce(file, mine)) return true;
  let held = null;
  try {
    held = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    // unreadable: treat as stale
  }
  const age = held?.at ? Date.now() - Date.parse(held.at) : Infinity;
  if (held && isRunning(held.pid) && age < maxAgeMs) {
    if (held.pid !== process.pid) return false;
    // Ours already: renew it.
    await writeFile(file, mine);
    return true;
  }
  await fs.unlink(file).catch(() => {});
  return createFileOnce(file, mine);
}

export async function releaseLock(name) {
  const file = lockFile(name);
  try {
    const held = JSON.parse(await fs.readFile(file, "utf8"));
    if (held.pid === process.pid) await fs.unlink(file);
  } catch {
    // already gone
  }
}

// ---------- Chats ----------

export async function getChat(id) {
  if (!isSafeId(id)) return null;
  return readFile(fileFor("chats", id));
}

// [{ id, title, updatedAt, preview }] for one product, newest first.
export async function listChats(product) {
  const ids = await listFiles("chats");
  const chats = (await Promise.all(ids.map((id) => getChat(id)))).filter(Boolean);
  return chats
    .filter((chat) => !product || chat.product === product)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((chat) => {
      const last = [...(chat.messages || [])].reverse().find((message) => message.text);
      return {
        id: chat.id,
        title: chat.title || "New chat",
        updatedAt: chat.updatedAt,
        preview: last ? String(last.text).replace(/\s+/g, " ").slice(0, 120) : "",
      };
    });
}

export async function saveChat(chat) {
  await writeFile(fileFor("chats", chat.id), chat);
  return chat;
}

export async function deleteChat(id) {
  try {
    await fs.unlink(fileFor("chats", id));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// ---------- Messages from the website's contact form ----------
// One file per message (server/messages.js says what is in it):
// messages/<id>.json.

export async function getMessage(id) {
  if (!isSafeId(id)) return null;
  return readFile(fileFor("messages", id));
}

// Every message, newest first.
export async function listMessages() {
  const ids = await listFiles("messages");
  const messages = (await Promise.all(ids.map((id) => getMessage(id)))).filter(Boolean);
  return messages.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)) || String(b.id).localeCompare(String(a.id)));
}

export async function saveMessage(message) {
  await writeFile(fileFor("messages", message.id), message);
  return message;
}

// True when there was one to remove.
export async function deleteMessage(id) {
  if (!isSafeId(id)) return false;
  return removeFile(fileFor("messages", id));
}

// ---------- Field: the farm, its analyses, history, reports and photos ----------
// Added for the Field product (owner: field-core). Same safety rules as
// above: ids are checked, writes are atomic, everything lives in dataDir().
//
//   farm.json                       the one farm (or absent)
//   field-analysis/<fieldId>.json   the latest analysis of one field
//   field-history/<fieldId>.json    { fieldId, months: [...] } since 2019
//   reports/<id>.json               "Tell us what happened" reports
//   uploads/<photoId>.<jpg|png|webp> the photos sent with them
//   weather-cache.json              the last weather answer (1 h)

export async function getFarm() {
  return readFile(path.join(dataDir(), "farm.json"));
}

export async function saveFarm(farm) {
  await writeFile(path.join(dataDir(), "farm.json"), farm);
  return farm;
}

export async function deleteFarm() {
  try {
    await fs.unlink(path.join(dataDir(), "farm.json"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

// Changes the farm one request at a time (like updateWorkspace).
// change(farm) gets the saved farm (or null) and gives back the new one,
// or undefined to keep the edited object. Gives back the saved farm.
const farmLock = (globalThis.__chernozemFarmLock ??= { chain: Promise.resolve() });
export function updateFarm(change) {
  const next = farmLock.chain.then(async () => {
    const farm = await getFarm();
    const changed = await change(farm);
    const result = changed === undefined ? farm : changed;
    if (result) await saveFarm(result);
    return result;
  });
  farmLock.chain = next.catch(() => {});
  return next;
}

// Runs work(farm) in the same queue as updateFarm without saving the farm,
// so nothing can change the farm while it runs. Used to save a field's
// analysis only while the field is still on the farm.
export function whileFarmLocked(work) {
  const next = farmLock.chain.then(async () => work(await getFarm()));
  farmLock.chain = next.catch(() => {});
  return next;
}

async function removeFile(file) {
  try {
    await fs.unlink(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function getFieldAnalysis(fieldId) {
  if (!isSafeId(fieldId)) return null;
  return readFile(fileFor("field-analysis", fieldId));
}

export async function saveFieldAnalysis(analysis) {
  await writeFile(fileFor("field-analysis", analysis.fieldId), analysis);
  return analysis;
}

export async function listFieldAnalyses() {
  const ids = await listFiles("field-analysis");
  return (await Promise.all(ids.map((id) => getFieldAnalysis(id)))).filter(Boolean);
}

export async function getFieldHistory(fieldId) {
  if (!isSafeId(fieldId)) return null;
  return readFile(fileFor("field-history", fieldId));
}

export async function saveFieldHistory(history) {
  await writeFile(fileFor("field-history", history.fieldId), history);
  return history;
}

// Removes a field's analysis and history (the field itself is in farm.json).
export async function deleteFieldData(fieldId) {
  assertSafeId(fieldId);
  await Promise.all([removeFile(fileFor("field-analysis", fieldId)), removeFile(fileFor("field-history", fieldId))]);
}

export async function getReport(id) {
  if (!isSafeId(id)) return null;
  return readFile(fileFor("reports", id));
}

export async function saveReport(report) {
  await writeFile(fileFor("reports", report.id), report);
  return report;
}

// Newest first.
export async function listReports() {
  const ids = await listFiles("reports");
  const reports = (await Promise.all(ids.map((id) => getReport(id)))).filter(Boolean);
  return reports.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function deleteReport(id) {
  if (!isSafeId(id)) return false;
  return removeFile(fileFor("reports", id));
}

const PHOTO_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function photoFile(photoId, ext) {
  assertSafeId(photoId);
  if (!PHOTO_TYPES[ext]) {
    const error = new Error("Photos must be JPEG, PNG or WebP.");
    error.status = 400;
    error.code = "bad_photo";
    throw error;
  }
  return path.join(dataDir(), "uploads", `${photoId}.${ext}`);
}

// ext is "jpg", "png" or "webp"; buffer is the file's bytes.
export async function savePhoto(photoId, ext, buffer) {
  const file = photoFile(photoId, ext);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, file);
  return { photoId, ext, type: PHOTO_TYPES[ext] };
}

// { buffer, type } or null.
export async function readPhoto(photoId) {
  if (!isSafeId(photoId)) return null;
  for (const [ext, type] of Object.entries(PHOTO_TYPES)) {
    try {
      return { buffer: await fs.readFile(photoFile(photoId, ext)), type };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return null;
}

export async function deletePhoto(photoId) {
  if (!isSafeId(photoId)) return;
  await Promise.all(Object.keys(PHOTO_TYPES).map((ext) => removeFile(photoFile(photoId, ext))));
}

// How many bytes the photos in uploads/ take together (0 without any), for
// a registered account's photo allowance (server/quotas.js).
export async function uploadsBytes() {
  const dir = path.join(dataDir(), "uploads");
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
  let total = 0;
  for (const name of names) {
    try {
      total += (await fs.stat(path.join(dir, name))).size;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return total;
}

// The weather answer kept for an hour: { at, lat, lon, data } or null.
export async function getWeatherCache() {
  return readFile(path.join(dataDir(), "weather-cache.json"));
}

export async function saveWeatherCache(entry) {
  await writeFile(path.join(dataDir(), "weather-cache.json"), entry);
  return entry;
}

// ---------- The account's profile (registered accounts) ----------
// profile.json at the top of an account's folder (server/accounts.js says
// what is in it: the id, e-mail, name, role, product...). The base folder
// (the demo) has none. Null when there is none yet.

export async function getProfile() {
  return readFile(path.join(dataDir(), "profile.json"));
}

export async function saveProfile(profile) {
  await writeFile(path.join(dataDir(), "profile.json"), profile);
  return profile;
}

// ---------- The account's sign-outs ----------
// session.json beside profile.json: { sessionsValidFrom } is the moment of
// the account's last "Sign out" (server/accounts.js signOutAccount); an
// account cookie made before it is nobody (server/auth.js). Kept apart
// from profile.json, which holds the person's own words. Null when the
// account never signed out.

export async function getSessionFile() {
  return readFile(path.join(dataDir(), "session.json"));
}

export async function saveSessionFile(value) {
  await writeFile(path.join(dataDir(), "session.json"), value);
  return value;
}
