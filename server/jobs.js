// WHAT THIS FILE DOES
// Runs an analysis in the background and keeps track of how far it got, so
// the page can show "Analyzing Ukraine… 7 of 12 months".
//
//   startAnalysis({ areaId, months, rerun })  starts (or joins) an Atlas job
//   startJob({ kind, key, ... run })          starts (or joins) any other job
//                                             (the Field: "field-detect",
//                                             "field-analyze"; see server/field/run.js)
//   getJob(id)                                 where a job is now
//   listJobs({ areaId, status, kind })         recent jobs, running first
//
// Every job has a kind: "atlas" (an area analysis), "field-detect" or
// "field-analyze". Atlas jobs keep their old shape (areaId, runIds...).
//
// A job analyzes the latest complete month first, then goes back one month
// at a time. Months that already have a run are skipped (unless rerun),
// except runs made from sample data once Earth Engine is connected: those
// are redone with the real data.
//
// A month that fails (Earth Engine busy or timed out after its retries) is
// skipped and the job goes on with the other months; at the end the job
// reports which months are missing, so running it again (without rerun)
// fills in only those. Problems that would fail every month (a bad key,
// no permission, a quota) stop the job at once (stopsJob).
//
// WHO EDITS IT
// Nobody, normally.

import { getArea, getRun, listRuns, newId, saveRun } from "./store.js";
import { planGrid } from "./geo.js";
import { buildRun, latestCompleteMonth, linkNewDamage, monthLabel, monthsBack } from "./runs.js";
import { getProvider, unavailableError } from "./providers/index.js";
import { conflictForArea } from "./conflicts.js";

// Kept on globalThis so the dev server, which reloads files after edits,
// still finds jobs that were started before.
const jobs = (globalThis.__chernozemJobs ??= new Map());
const KEEP_FINISHED_MS = 60 * 60 * 1000;

function publicJob(job) {
  if (!job) return null;
  const { internal, ...rest } = job;
  return job.runIds ? { ...rest, runIds: [...job.runIds] } : { ...rest };
}

export function getJob(id) {
  return publicJob(jobs.get(id));
}

export function listJobs({ areaId, status, kind } = {}) {
  prune();
  return [...jobs.values()]
    .filter((job) => (!areaId || job.areaId === areaId) && (!status || job.status === status) && (!kind || job.kind === kind))
    .sort((a, b) => (a.status === "running" ? -1 : 0) - (b.status === "running" ? -1 : 0) || b.startedAt.localeCompare(a.startedAt))
    .map(publicJob);
}

function prune() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== "running" && job.finishedAt && now - Date.parse(job.finishedAt) > KEEP_FINISHED_MS) jobs.delete(id);
  }
}

const pause = () => new Promise((resolve) => setImmediate(resolve));

// Error codes (server/providers/gee.js explainGeeError) that would fail
// every month the same way: the job stops at once instead of going on.
const STOPPING_CODES = new Set(["bad_key", "no_permission", "api_disabled", "not_registered", "asset_not_found", "quota", "bad_request", "gee_unavailable", "not_configured"]);
export function stopsJob(error) {
  return Boolean(error && (STOPPING_CODES.has(error.code) || error.status === 503));
}

// The error a job ends with when some months failed:
//   "2 of 12 months could not be analyzed (July 2026, May 2026): <first error>
//    Run the analysis again to fill them in."
export function missingMonthsError(failed, total) {
  const first = failed[0].error;
  const reason = String(first?.message || first || "unknown error").replace(/[.\s]+$/, "");
  const error = new Error(`${failed.length} of ${total} months could not be analyzed (${failed.map((f) => monthLabel(f.month)).join(", ")}): ${reason}. Run the analysis again to fill them in.`);
  error.code = first?.code || "months_missing";
  error.months = failed.map((f) => f.month);
  return error;
}

// Starts analyzing an area. Gives back the job right away; the work goes on
// in the background. If the area is already being analyzed, that job is
// given back instead of starting a second one.
export async function startAnalysis({ areaId, months = 12, rerun = false, trigger = "manual" }) {
  const area = await getArea(areaId);
  if (!area) {
    const error = new Error("That area does not exist.");
    error.status = 404;
    error.code = "not_found";
    throw error;
  }
  const running = [...jobs.values()].find((job) => job.kind === "atlas" && job.areaId === areaId && job.status === "running");
  if (running) return publicJob(running);

  const count = Math.min(24, Math.max(1, Math.round(Number(months) || 12)));
  const job = {
    id: newId("job"),
    kind: "atlas",
    areaId,
    areaName: area.name,
    trigger,
    status: "running",
    done: 0,
    total: count,
    message: `Analyzing ${area.name}…`,
    runIds: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  prune();
  runJob(job, area, count, Boolean(rerun)).catch((error) => {
    job.status = "error";
    job.error = error.message || String(error);
    job.errorCode = error.code || null;
    // Months missing: the error already says what to do.
    job.message = error.months ? job.error : `Analysis stopped: ${job.error}`;
    job.finishedAt = new Date().toISOString();
    console.error(`[chernozem] Analysis of ${area.name} failed:`, error);
  });
  return publicJob(job);
}

async function runJob(job, area, count, rerun) {
  await pause();
  const provider = await getProvider();
  // Earth Engine set up but unreachable: stop (retryable), never save
  // sample months for a real area.
  const down = unavailableError(provider);
  if (down) throw down;
  job.provider = provider.id;
  const grid = planGrid(area.geometry);
  // The known war covering the area (by its country, or its cells),
  // or null: it decides where damage is counted from and whether distance
  // to fighting means anything there (src/config/conflicts.js).
  const conflict = conflictForArea({ countryId: area.countryId, bbox: area.bbox || grid.bbox, cells: grid.cells });
  const months = monthsBack(latestCompleteMonth(), count);
  const existing = new Map();
  for (const summary of await listRuns(area.id)) if (!existing.has(summary.month)) existing.set(summary.month, summary);

  const failed = [];
  try {
    for (const month of months) {
      const old = existing.get(month);
      // Keep an existing run unless asked to redo it, or it is sample data and
      // the real source is now connected.
      if (old && !rerun && !(old.provider === "sample" && provider.id !== "sample")) {
        job.done += 1;
        job.runIds.push(old.id);
        continue;
      }
      job.message = `Analyzing ${area.name}: ${monthLabel(month)} (${job.done + 1} of ${job.total})`;
      let result;
      try {
        result = await provider.analyze({
          area,
          cells: grid.cells,
          month,
          cellSizeDeg: grid.cellSizeDeg,
          conflict,
          onProgress: (share) => {
            job.monthProgress = Math.max(0, Math.min(1, Number(share) || 0));
          },
        });
      } catch (error) {
        if (stopsJob(error)) throw error;
        // Skip this month and go on (an older run of it, if any, is kept).
        console.warn(`[chernozem] ${area.name} ${month} failed, going on with the other months: ${error.message}`);
        failed.push({ month, error });
        if (old) job.runIds.push(old.id);
        job.done += 1;
        job.monthProgress = 0;
        job.failedMonths = failed.map((f) => f.month);
        await pause();
        continue;
      }
      const run = buildRun({
        area,
        month,
        provider,
        readings: result.readings || [],
        alerts: result.alerts || [],
        warnings: result.warnings || [],
        cellSizeDeg: grid.cellSizeDeg,
        cells: grid.cells,
        baseline: result.baseline,
        conflict: result.conflict !== undefined ? result.conflict : conflict,
        imagery: result.imagery,
        accessSource: result.accessSource,
      });
      // Redoing a month keeps its id, so links to it keep working.
      if (old) run.id = old.id;
      await saveRun(run);
      job.runIds.push(run.id);
      job.done += 1;
      job.monthProgress = 0;
      await pause();
    }
  } finally {
    // "New heavy damage" needs the month before, which may have been
    // analyzed after this one, so it is filled in at the end (also when a
    // month failed, for the months that did finish).
    job.message = "Finishing…";
    try {
      const summaries = await listRuns(area.id);
      const full = (await Promise.all(summaries.map((summary) => getRun(summary.id)))).filter(Boolean);
      for (const run of linkNewDamage(full)) await saveRun(run);
    } catch (error) {
      console.warn(`[chernozem] Could not link new damage for ${area.name}: ${error.message}`);
    }
  }

  if (failed.length) throw missingMonthsError(failed, job.total);
  job.status = "done";
  job.message = `${area.name}: ${job.total === 1 ? "1 month" : `${job.total} months`} analyzed`;
  job.finishedAt = new Date().toISOString();
}

// ---------- Any other kind of job ----------
// Starts a background job of another kind. If a job with the same kind and
// key is running, that one is given back instead (pass no key to always
// start a new one).
//   kind     "field-detect" | "field-analyze" | ...
//   key      what makes two jobs "the same", e.g. "farm"
//   total    steps, for "3 of 7"
//   message  the first line the page shows
//   info     extra public fields (e.g. { fieldIds })
//   run(job) does the work; may set job.done, job.total, job.message and
//            gives back the result (job.result). Throwing marks the job failed.
export function startJob({ kind, key = null, total = 1, message = "Working…", trigger = "manual", info = {}, run }) {
  if (!kind || kind === "atlas") throw new Error('startJob needs a kind other than "atlas" (use startAnalysis).');
  if (key != null) {
    const running = [...jobs.values()].find((job) => job.kind === kind && job.key === key && job.status === "running");
    if (running) return publicJob(running);
  }
  const job = {
    ...info,
    id: newId("job"),
    kind,
    key,
    trigger,
    status: "running",
    done: 0,
    total: Math.max(1, Math.round(Number(total) || 1)),
    message,
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  prune();
  (async () => {
    await pause();
    const result = await run(job);
    job.result = result ?? null;
    job.status = "done";
    job.done = job.total;
    job.finishedAt = new Date().toISOString();
  })().catch((error) => {
    job.status = "error";
    job.error = error.message || String(error);
    job.errorCode = error.code || null;
    job.message = job.error;
    job.finishedAt = new Date().toISOString();
    console.error(`[chernozem] ${kind} job failed:`, error);
  });
  return publicJob(job);
}
