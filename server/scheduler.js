// WHAT THIS FILE DOES
// Analyzes the current area automatically once a month. When the server
// starts, and every 6 hours after, it checks: is "Analyze automatically
// each month" on (Settings), is there a current area, and is last month
// still missing (or only made from sample data while Earth Engine is now
// connected)? If so it starts an analysis.
//
//   startScheduler()     called once by the server (and the dev server)
//   schedulerStatus()    { autoMonthly, lastCheck } for /api/status
//
// WHO EDITS IT
// Nobody, normally.

import { acquireLock, getWorkspace, listRuns, releaseLock } from "./store.js";
import { latestCompleteMonth } from "./runs.js";
import { getJob, startAnalysis } from "./jobs.js";
import { getProvider } from "./providers/index.js";

const EVERY_MS = 6 * 60 * 60 * 1000;
const LOCK_MAX_AGE_MS = 30 * 60 * 1000; // renewed every 30 s while a job runs
const state = (globalThis.__chernozemScheduler ??= { started: false, timer: null, lastCheck: null, lastResult: null });

// Only one check at a time in this server.
export function checkNow() {
  if (state.checking) return state.checking;
  state.checking = check().finally(() => {
    state.checking = null;
  });
  return state.checking;
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
function releaseWhenDone(jobId) {
  const timer = setInterval(() => {
    const job = getJob(jobId);
    if (job && job.status === "running") {
      acquireLock("scheduler", LOCK_MAX_AGE_MS).catch(() => {});
      return;
    }
    clearInterval(timer);
    releaseLock("scheduler");
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
  return { autoMonthly, lastCheck: state.lastCheck, lastResult: state.lastResult };
}
