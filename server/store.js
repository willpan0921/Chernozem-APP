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
//
// Files are written safely (to a temporary file first, then renamed), and
// ids may only contain a-z, 0-9 and "-", so a request can never reach a
// file outside this folder.
//
// WHO EDITS IT
// Nobody, normally. To move to a real database later, replace the inside of
// these functions; the rest of the server only calls the functions.

import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { ROOT, refreshEnv } from "./env.js";
import { checkSettings, DEFAULT_SETTINGS } from "../src/lib/atlas/method.js";

const SAFE_ID = /^[a-z0-9-]{1,64}$/;

export function dataDir() {
  refreshEnv();
  const custom = (process.env.CHERNOZEM_DATA_DIR || "").trim();
  return custom ? path.resolve(custom) : path.join(ROOT, "server", ".data");
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

function defaultWorkspace() {
  const now = new Date().toISOString();
  return {
    name: "Regional office",
    currentAreaId: null,
    settings: checkSettings(DEFAULT_SETTINGS),
    budgetUsd: 10000000,
    doneSteps: [],
    schedule: { autoMonthly: true },
    team: [
      { id: newId("member"), name: "Oksana H.", email: "", role: "admin", addedAt: now },
      { id: newId("member"), name: "Taras M.", email: "", role: "analyst", addedAt: now },
    ],
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
  if (!Number.isFinite(merged.budgetUsd)) merged.budgetUsd = base.budgetUsd;
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
