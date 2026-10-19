// WHAT THIS FILE DOES
// Analyzes the current area automatically once a month. When the server
// starts, and every 6 hours after, it checks: is "Analyze automatically
// each month" on (Settings), is there a current area, and is last month
// still missing (or only made from sample data while Earth Engine is now
// connected)? If so it starts an analysis.
//
//   startScheduler()     called once by the server (and the dev server)
//   schedulerStatus()    { autoMonthly, lastCheck, fields } for /api/status
//   checkFieldsNow()     the Field check on its own (also part of every check)
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

import { acquireLock, getFarm, getWorkspace, listFieldAnalyses, listRuns, releaseLock } from "./store.js";
import { latestCompleteMonth } from "./runs.js";
import { getJob, startAnalysis } from "./jobs.js";
import { fieldUnavailableError, getFieldProvider, getProvider, unavailableError } from "./providers/index.js";
import { needsRefresh, sampleWhileEarthEngine, startFieldAnalysis } from "./field/run.js";

const EVERY_MS = 6 * 60 * 60 * 1000;
const LOCK_MAX_AGE_MS = 30 * 60 * 1000; // renewed every 30 s while a job runs
const state = (globalThis.__chernozemScheduler ??= { started: false, timer: null, lastCheck: null, lastResult: null });

// Only one check at a time in this server. Gives back the Atlas job it
// started (or null); the Field check runs alongside.
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
      await releaseLock("field-scheduler");
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
    if (!ws.schedule?.autoMonthly || !ws.currentAreaId) {
      state.lastResult = "nothing to do";
      return null;
    }
    const month = latestCompleteMonth();
    const runs = await listRuns(ws.currentAreaId);
    const provider = await getProvider();
    if (unavailableError(provider)) {
      state.lastResult = "Earth Engine unavailable; trying again later";
      return null;
    }
    // A month made from sample data counts as missing once Earth Engine is
    // connected, so the real data replaces it without anyone clicking.
    const latest = runs.find((run) => run.month === month);
    const upToDate = latest && !(latest.provider === "sample" && provider.id !== "sample");
    if (upToDate) {
      state.lastResult = "up to date";
      return null;
    }
    // Another server using the same data folder may be doing this already.
    if (!(await acquireLock("scheduler", LOCK_MAX_AGE_MS))) {
      state.lastResult = "another server is analyzing";
      return null;
    }
    let job;
    try {
      job = await startAnalysis({ areaId: ws.currentAreaId, months: 12, trigger: "monthly" });
    } catch (error) {
      await releaseLock("scheduler");
      throw error;
    }
    releaseWhenDone(job.id);
    state.lastResult = `started ${job.id}`;
    return job;
  } catch (error) {
    state.lastResult = `error: ${error.message}`;
    console.warn(`[chernozem] Monthly check failed: ${error.message}`);
    return null;
  }
}

// Keeps the lock while the job runs (a long Earth Engine job can take
// hours) and frees it once the job has finished.
function releaseWhenDone(jobId, lockName = "scheduler") {
  const timer = setInterval(() => {
    const job = getJob(jobId);
    if (job && job.status === "running") {
      acquireLock(lockName, LOCK_MAX_AGE_MS).catch(() => {});
      return;
    }
    clearInterval(timer);
    releaseLock(lockName);
  }, 30 * 1000);
  timer.unref?.();
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
