// WHAT THIS FILE DOES
// Analyzes every saved Atlas area automatically once a month. When the
// server starts, and every 6 hours after, it checks: is "Analyze every
// saved area automatically each month" on (Atlas Settings), and which
// areas still miss last month (or have it only from sample data while
// Earth Engine is now connected)? It starts an analysis for each of those,
// the current area (the one on screen) first, then the others by name.
// Only one Atlas analysis runs at a time (server/jobs.js), so the others
// wait in line and start one after the other; one that fails does not
// stop the next. An analysis a person asks for meanwhile goes before the
// ones this check put in line (jobs.js placeInLine).
//
//   startScheduler()     called once by the server (and the dev server)
//   checkNow()           the check now; gives back the Atlas jobs it
//                        started (or joined), current area first, [] if none
//   schedulerStatus()    { autoMonthly, lastCheck, fields } for /api/status
//   checkFieldsNow()     the Field check on its own (also part of every check)
//
// A lock file (store.js acquireLock "scheduler") keeps two servers that
// share one data folder from starting the same monthly analyses at the
// same time (a person can still start one on either server): it is held
// until every job the checks started (or joined) has ended, also when a
// check comes while the jobs of the one before still run or wait.
//
// The Field product: at the same times, if "Update automatically" is on
// for the farm (Settings), every field whose analysis is missing, older
// than 24 hours (Sentinel-2 passes every ~5 days), or sample data while
// Earth Engine is now connected, is analysed again. With it off, fields
// still on sample data are analysed once when Earth Engine is connected,
// so the pages never show sample readings next to a working Earth Engine.
//
// WHO EDITS IT
// Nobody, normally.

import { acquireLock, getFarm, getWorkspace, listAreas, listFieldAnalyses, listRuns, releaseLock } from "./store.js";
import { latestCompleteMonth } from "./runs.js";
import { getJob, startAnalysis } from "./jobs.js";
import { fieldUnavailableError, getFieldProvider, getProvider, unavailableError } from "./providers/index.js";
import { needsRefresh, sampleWhileEarthEngine, startFieldAnalysis } from "./field/run.js";

const EVERY_MS = 6 * 60 * 60 * 1000;
const LOCK_MAX_AGE_MS = 30 * 60 * 1000; // renewed every 30 s while a job runs
const state = (globalThis.__chernozemScheduler ??= { started: false, timer: null, lastCheck: null, lastResult: null });
// Per lock: the jobs it is held for and the timer that renews it
// (releaseWhenDone).
const holds = (state.holds ??= {});

// Only one check at a time in this server. Gives back the Atlas jobs it
// started or joined ([] when none); the Field check runs alongside.
export function checkNow() {
  if (state.checking) return state.checking;
  checkFieldsNow();
  state.checking = check().finally(() => {
    state.checking = null;
  });
  return state.checking;
}

// The Field check. Gives back the field job it started (or null).
export function checkFieldsNow() {
  if (state.checkingFields) return state.checkingFields;
  state.checkingFields = checkFields().finally(() => {
    state.checkingFields = null;
  });
  return state.checkingFields;
}

async function checkFields() {
  state.fieldsLastCheck = new Date().toISOString();
  try {
    const farm = await getFarm();
    if (!farm || !farm.fields?.length) {
      state.fieldsLastResult = "nothing to do";
      return null;
    }
    const provider = await getFieldProvider();
    if (fieldUnavailableError(provider)) {
      state.fieldsLastResult = "Earth Engine unavailable; trying again later";
      return null;
    }
    const analyses = Object.fromEntries((await listFieldAnalyses()).map((analysis) => [analysis.fieldId, analysis]));
    const stale = farm.autoUpdate === false ? sampleWhileEarthEngine(farm, analyses, provider.id) : needsRefresh(farm, analyses, provider.id);
    if (!stale.length) {
      state.fieldsLastResult = "up to date";
      return null;
    }
    if (!(await acquireLock("field-scheduler", LOCK_MAX_AGE_MS))) {
      state.fieldsLastResult = "another server is analysing";
      return null;
    }
    let job;
    try {
      job = await startFieldAnalysis({ fieldIds: stale.map((field) => field.id), trigger: "auto" });
    } catch (error) {
      if (!holding("field-scheduler")) await releaseLock("field-scheduler");
      throw error;
    }
    releaseWhenDone(job.id, "field-scheduler");
    state.fieldsLastResult = `started ${job.id}`;
    return job;
  } catch (error) {
    state.fieldsLastResult = `error: ${error.message}`;
    console.warn(`[chernozem] Field check failed: ${error.message}`);
    return null;
  }
}

async function check() {
  state.lastCheck = new Date().toISOString();
  try {
    const ws = await getWorkspace();
    if (!ws.schedule?.autoMonthly) {
      state.lastResult = "nothing to do";
      return [];
    }
    const areas = inOrder(await listAreas(), ws.currentAreaId);
    if (!areas.length) {
      state.lastResult = "nothing to do";
      return [];
    }
    const provider = await getProvider();
    if (unavailableError(provider)) {
      state.lastResult = "Earth Engine unavailable; trying again later";
      return [];
    }
    const month = latestCompleteMonth();
    const stale = [];
    for (const area of areas) {
      // A month made from sample data counts as missing once Earth Engine
      // is connected, so the real data replaces it without anyone clicking.
      const latest = (await listRuns(area.id)).find((run) => run.month === month);
      const upToDate = latest && !(latest.provider === "sample" && provider.id !== "sample");
      if (!upToDate) stale.push(area);
    }
    if (!stale.length) {
      state.lastResult = "up to date";
      return [];
    }
    // Another server using the same data folder may be doing this already.
    if (!(await acquireLock("scheduler", LOCK_MAX_AGE_MS))) {
      state.lastResult = "another server is analyzing";
      return [];
    }
    const started = [];
    for (const area of stale) {
      try {
        started.push(await startAnalysis({ areaId: area.id, months: 12, trigger: "monthly" }));
      } catch (error) {
        // Removed meanwhile, for example: the other areas still go.
        console.warn(`[chernozem] Monthly check: could not start ${area.name}: ${error.message}`);
      }
    }
    if (!started.length) {
      // Jobs of an earlier check may still hold it.
      if (!holding("scheduler")) await releaseLock("scheduler");
      state.lastResult = "nothing could be started";
      return [];
    }
    releaseWhenDone(started.map((job) => job.id));
    state.lastResult = `started ${started.length === 1 ? "1 area" : `${started.length} areas`}: ${started.map((job) => job.id).join(", ")}`;
    return started;
  } catch (error) {
    state.lastResult = `error: ${error.message}`;
    console.warn(`[chernozem] Monthly check failed: ${error.message}`);
    return [];
  }
}

// The current area first, then the others by name (then by id, so two
// areas with one name keep one order).
function inOrder(areas, currentAreaId) {
  return [...areas].sort(
    (a, b) =>
      (b.id === currentAreaId) - (a.id === currentAreaId) ||
      String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" }) ||
      String(a.id).localeCompare(String(b.id))
  );
}

// Keeps the lock while the jobs run or wait for their turn (a long Earth
// Engine job can take hours) and frees it once every one has ended. One
// hold per lock: the jobs of a later check join it, so the lock is not
// freed while some of them still run.
//   jobIds  one job id or a list of them
function releaseWhenDone(jobIds, lockName = "scheduler") {
  const hold = (holds[lockName] ??= { ids: new Set(), timer: null });
  for (const id of [].concat(jobIds)) hold.ids.add(id);
  if (hold.timer) return;
  hold.timer = setInterval(() => {
    for (const id of hold.ids) if (getJob(id)?.status !== "running") hold.ids.delete(id);
    if (hold.ids.size) {
      acquireLock(lockName, LOCK_MAX_AGE_MS).catch(() => {});
      return;
    }
    clearInterval(hold.timer);
    hold.timer = null;
    releaseLock(lockName);
  }, 30 * 1000);
  hold.timer.unref?.();
}

// True while a job this server started still holds the lock.
function holding(lockName) {
  return [...(holds[lockName]?.ids || [])].some((id) => getJob(id)?.status === "running");
}

export function startScheduler() {
  if (state.started) return;
  state.started = true;
  // A short delay so the server is fully up first.
  setTimeout(checkNow, 3000).unref?.();
  state.timer = setInterval(checkNow, EVERY_MS);
  state.timer.unref?.();
}

export async function schedulerStatus() {
  let autoMonthly = true;
  try {
    autoMonthly = Boolean((await getWorkspace()).schedule?.autoMonthly);
  } catch {
    // keep the default
  }
  return {
    autoMonthly,
    lastCheck: state.lastCheck,
    lastResult: state.lastResult,
    fields: { lastCheck: state.fieldsLastCheck || null, lastResult: state.fieldsLastResult || null },
  };
}
