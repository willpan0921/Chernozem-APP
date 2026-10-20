// WHAT THIS FILE DOES
// Runs an analysis in the background and keeps track of how far it got, so
// the page can show "Analyzing Ukraine… 7 of 12 months".
//
//   startAnalysis({ areaId, months, rerun })  starts (or joins) an Atlas job
//   cancelAnalysis(id)                        takes an Atlas job that still
//                                             waits for its turn out of line,
//                                             or stops one that has started
//   startJob({ kind, key, ... run })          starts (or joins) any other job
//                                             (the Field: "field-detect",
//                                             "field-analyze"; see server/field/run.js)
//   getJob(id)                                 where a job is now
//   listJobs({ areaId, status, kind })         recent jobs, running first
//
// Every job has a kind: "atlas" (an area analysis), "field-detect" or
// "field-analyze". Atlas jobs keep their old shape (areaId, runIds...).
//
// ONE ATLAS ANALYSIS AT A TIME, for the whole server. Two areas at once
// would share the project's Earth Engine requests and limits and both go
// slower. Another area's analysis, asked for by a person or by the monthly
// check (scheduler.js, every saved area), waits in line and starts when the
// ones before it have ended. A person's request goes before the areas
// waiting for the monthly check (placeInLine): the monthly backlog can be
// hours of Earth Engine work (7 areas x 12 months), and the person is
// waiting at the screen; within each group, first come, first served, and
// the analysis running is never interrupted. While it waits its job is
// "running" like any other, so every page follows it as before, with
// job.queued true and job.waiting (and the message) saying "Waiting for
// Ukraine's analysis (3 of 12 months) and 1 other to finish"
// (AtlasData.jsx AnalysisProgress shows it). The area is read again when
// its turn comes, so a new name or war setting saved meanwhile is used. The
// same area asked again gives back its job; a job that still waits takes
// in the new request (a re-run, more months, a person's request over the
// monthly one, which also moves it up the line).
//
// STOP: a job that still waits can be cancelled (status "cancelled", it
// never ran). One that has started can be stopped (cancelAnalysis, Stop on
// the Atlas pages): the month being analyzed is given up at once (the
// provider gets an AbortSignal: gee.js sends nothing more of it, and the
// job does not wait for its requests already out), the months saved before
// are kept, new damage is linked for them, and the job ends "cancelled"
// ("Ukraine: stopped after 3 of 12 months ..."). The next job in line
// starts then. Without it, one slow or huge area (a 24-month re-run of
// Russia; one Ukraine month took 181 minutes while Earth Engine was slow)
// held every other area back for hours, with no way out but a restart.
//
// The war of an area (where damage is counted from): the team's own choice
// for it (area.war, Atlas Settings) first, else the app's list
// (server/conflicts.js conflictForArea). The run keeps it (run.conflict)
// and who decided (run.conflictSource: "area" or "list"); a war of the
// list limited to boxes, on a whole-country area, is marked partOfCountry
// (warFor): its rules then apply only in the squares that touch its boxes,
// and the others are read at peace (src/config/conflicts.js warSquares).
// The setting is read again before every month, so one saved while the job
// runs is used from the next month on (Atlas Settings then offers to redo
// the months made before it).
//
// A job analyzes the latest complete month first, then goes back one month
// at a time. Months that already have a run are skipped (unless rerun),
// except runs made from sample data once Earth Engine is connected, and,
// in a job someone started (not the monthly one: scheduler.js), runs made
// with an older method version (src/lib/atlas/method.js METHOD_VERSION) or
// with another war setting than the area's now (another start day, or war
// against peace: the months Atlas Settings counts, overview.js
// monthsWithOtherWar): those are redone, so the months of a series can be
// compared again. So the War card's re-run redoes only those months (and
// any missing one), not every month. The monthly job adds the new month
// only and leaves older months as they are (they then read "Not
// comparable: different method version" or "... war setting" until someone
// runs the area again), so a method or war change never sets off ~11
// months of Earth Engine work, and replaces the totals people saw, by
// itself.
//
// A month that fails (Earth Engine busy or timed out after its retries) is
// skipped and the job goes on with the other months; at the end the job
// reports which months are missing, so running it again (without rerun)
// fills in only those. Problems that would fail every month (a bad key,
// no permission, a quota) stop the job at once (stopsJob).
//
// While Earth Engine works for the Field or a region search, an Atlas
// month's requests wait (server/providers/gee.js evaluate), and the job
// says so: job.waiting is then "Waiting for farm analyses and searches to
// finish" (null otherwise), which the Atlas page shows under the progress
// bar (src/state/AtlasData.jsx AnalysisProgress), and the message reads
// "Analyzing Ukraine: August 2026 (3 of 12): waiting for farm analyses
// and searches to finish".
//
// WHO EDITS IT
// Nobody, normally.

import { getArea, getRun, listRuns, newId, saveRun } from "./store.js";
import { planGrid } from "./geo.js";
import { buildRun, latestCompleteMonth, linkNewDamage, monthLabel, monthsBack } from "./runs.js";
import { getProvider, unavailableError } from "./providers/index.js";
import { conflictForArea } from "./conflicts.js";
import { teamConflict } from "../src/config/conflicts.js";
import { METHOD_VERSION } from "../src/lib/atlas/method.js";
import { keepsMonth, warKey } from "../src/lib/atlas/overview.js";

// A saved run made with an older method (before versions were saved, or
// another version): its numbers cannot be compared with a new month's.
export function staleMethod(run) {
  return Boolean(run) && (run.method?.version || null) !== METHOD_VERSION;
}

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

// Running jobs first (the Atlas job analyzing now, then the ones waiting
// for their turn, in line order), then the others, newest first.
export function listJobs({ areaId, status, kind } = {}) {
  prune();
  const rank = (job) => (job.status !== "running" ? 2 : job.queued ? 1 : 0);
  const place = (job) => line.ids.indexOf(job.id);
  return [...jobs.values()]
    .filter((job) => (!areaId || job.areaId === areaId) && (!status || job.status === status) && (!kind || job.kind === kind))
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? place(a) - place(b) : 0) || b.startedAt.localeCompare(a.startedAt))
    .map(publicJob);
}

function prune() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== "running" && job.finishedAt && now - Date.parse(job.finishedAt) > KEEP_FINISHED_MS) jobs.delete(id);
  }
}

const pause = () => new Promise((resolve) => setImmediate(resolve));
const lowerFirst = (text) => String(text).charAt(0).toLowerCase() + String(text).slice(1);

// Error codes (server/providers/gee.js explainGeeError) that would fail
// every month the same way: the job stops at once instead of going on.
// "quota" (the project's own limit) is one; "busy" (Earth Engine too busy
// right now: "Too many concurrent aggregations.", "Earth Engine capacity
// exceeded.", after their retries) is not: that month is skipped and the
// job goes on, like any other month that fails.
const STOPPING_CODES = new Set(["bad_key", "no_permission", "api_disabled", "not_registered", "asset_not_found", "quota", "bad_request", "gee_unavailable", "not_configured"]);
export function stopsJob(error) {
  return Boolean(error && (STOPPING_CODES.has(error.code) || error.status === 503));
}

// The error a job ends with when some months failed:
//   "2 of 12 months could not be analyzed (July 2026, May 2026): <the error>.
//    Run the analysis again to fill them in."
// or, when the months failed for different reasons,
//   "2 of 12 months could not be analyzed: July 2026 (<its error>); May 2026
//    (<its error>). Run the analysis again to fill them in."
export function missingMonthsError(failed, total) {
  const first = failed[0].error;
  const reasonOf = (f) => String(f.error?.message || f.error || "unknown error").replace(/[.\s]+$/, "");
  const reasons = failed.map(reasonOf);
  // One reason for all: said once. Different reasons: each month with its own.
  const detail = reasons.every((r) => r === reasons[0])
    ? ` (${failed.map((f) => monthLabel(f.month)).join(", ")}): ${reasons[0]}`
    : `: ${failed.map((f, i) => `${monthLabel(f.month)} (${reasons[i]})`).join("; ")}`;
  const error = new Error(`${failed.length} of ${total} months could not be analyzed${detail}. Run the analysis again to fill them in.`);
  error.code = first?.code || "months_missing";
  error.months = failed.map((f) => f.month);
  return error;
}

// ---------- One Atlas analysis at a time ----------

// The Atlas jobs waiting for their turn (job ids, first come first served).
// On globalThis like the jobs, so the copies of this file the dev server
// loads after an edit share one line.
const line = (globalThis.__chernozemAtlasLine ??= { ids: [], timer: null });
// While jobs wait, the line is looked at again this often, in case the job
// analyzing now was started by another copy of this file and so will not
// start the next one when it ends.
const LINE_CHECK_MS = 5000;

const notFound = (message) => Object.assign(new Error(message), { status: 404, code: "not_found" });

// The Atlas job analyzing now (running and not waiting), or null.
function analyzingNow() {
  for (const job of jobs.values()) if (job.kind === "atlas" && job.status === "running" && !job.queued) return job;
  return null;
}

// What a waiting job waits for:
//   "Waiting for Ukraine's analysis to finish"
//   "Waiting for Ukraine's analysis (3 of 12 months) and 2 others to finish"
//   (how far the analysis running now is, once it has done a month; and
//   the others in line before this one)
//   busyProgress  e.g. "3 of 12 months" (optional)
export function waitingText(busyName, othersAhead = 0, busyProgress = "") {
  if (!busyName) return "Waiting to start";
  const progress = busyProgress ? ` (${busyProgress})` : "";
  const others = othersAhead > 0 ? ` and ${othersAhead} ${othersAhead === 1 ? "other" : "others"}` : "";
  return `Waiting for ${busyName}'s analysis${progress}${others} to finish`;
}

// Starts the first job in line when no Atlas job is analyzing, and tells
// every job still waiting what it waits for (looked at again every
// LINE_CHECK_MS, and after every month of the one running: describeLine).
function nextInLine() {
  clearTimeout(line.timer);
  line.timer = null;
  line.ids = line.ids.filter((id) => {
    const job = jobs.get(id);
    return job && job.status === "running" && job.queued;
  });
  if (!analyzingNow() && line.ids.length) begin(jobs.get(line.ids.shift()));
  describeLine();
  if (line.ids.length) {
    line.timer = setTimeout(nextInLine, LINE_CHECK_MS);
    line.timer.unref?.();
  }
}

// What each waiting job waits for: the analysis running now, with how far
// it is ("Waiting for Ukraine's analysis (3 of 12 months) and 1 other to
// finish"), and the others in line before it.
function describeLine() {
  const busy = analyzingNow();
  const busyProgress = busy?.done > 0 ? `${busy.done} of ${busy.total} months` : "";
  const waiting = line.ids.map((id) => jobs.get(id)).filter((job) => job && job.status === "running" && job.queued);
  waiting.forEach((job, i) => {
    job.waiting = waitingText(busy?.areaName, i, busyProgress);
    job.message = `${job.areaName}: ${lowerFirst(job.waiting)}`;
  });
}

// Puts a waiting job in its place in line: a person's request (any trigger
// but "monthly") just before the first job waiting for the monthly check,
// a monthly one at the end. Within each group first come, first served, so
// the monthly check's own order (current area first, then by name) is
// kept. A job already in line is taken out first (joinRequest moves it).
function placeInLine(job) {
  line.ids = line.ids.filter((id) => id !== job.id);
  const firstMonthly = job.trigger === "monthly" ? -1 : line.ids.findIndex((id) => jobs.get(id)?.trigger === "monthly");
  if (firstMonthly < 0) line.ids.push(job.id);
  else line.ids.splice(firstMonthly, 0, job.id);
}

// A job's turn: the area is read again (a new name or war setting saved
// while it waited is used; an area removed meanwhile ends the job), then
// its months are analyzed. When it ends, the next job in line starts.
function begin(job) {
  job.queued = false;
  job.waiting = null;
  job.message = `Analyzing ${job.areaName}…`;
  // What a person's Stop aborts (cancelAnalysis).
  job.internal.stop = new AbortController();
  const { count, rerun } = job.internal;
  (async () => {
    const area = await getArea(job.areaId);
    if (!area) throw notFound("The area was removed before its analysis could start.");
    job.areaName = area.name;
    await runJob(job, area, count, rerun);
  })()
    .catch((error) => {
      job.status = "error";
      job.error = error.message || String(error);
      job.errorCode = error.code || null;
      // Months missing: the error already says what to do.
      job.message = error.months ? job.error : `Analysis stopped: ${job.error}`;
      job.waiting = null;
      job.stopping = false;
      job.finishedAt = new Date().toISOString();
      console.error(`[chernozem] Analysis of ${job.areaName} failed:`, error);
    })
    .finally(nextInLine);
}

// A new request for an area whose job still waits: the job does what both
// ask (a re-run if either asks for one, the larger number of months, a
// person's request over the monthly check's, which keeps older-method
// months as they are, and moves up the line with it: placeInLine).
function joinRequest(job, { count, rerun, trigger }) {
  job.internal.rerun = job.internal.rerun || rerun;
  if (count > job.internal.count) {
    job.internal.count = count;
    job.total = count;
  }
  if (trigger !== "monthly" && job.trigger === "monthly") {
    job.trigger = trigger;
    placeInLine(job);
    nextInLine();
  } else if (trigger !== "monthly") {
    job.trigger = trigger;
  }
}

// Starts analyzing an area. Gives back the job right away; the work goes on
// in the background, at once or when its turn comes (placeInLine). If the
// area is already being analyzed (or waits), that job is given back
// instead of starting a second one.
export async function startAnalysis({ areaId, months = 12, rerun = false, trigger = "manual" }) {
  const area = await getArea(areaId);
  if (!area) throw notFound("That area does not exist.");
  const count = Math.min(24, Math.max(1, Math.round(Number(months) || 12)));
  // From here to jobs.set nothing waits, so two requests at once cannot
  // both start a job for the same area.
  const running = [...jobs.values()].find((job) => job.kind === "atlas" && job.areaId === areaId && job.status === "running");
  if (running) {
    if (running.queued && running.internal) joinRequest(running, { count, rerun: Boolean(rerun), trigger });
    return publicJob(running);
  }

  const job = {
    id: newId("job"),
    kind: "atlas",
    areaId,
    areaName: area.name,
    trigger,
    status: "running",
    queued: true,
    waiting: null,
    stopping: false,
    done: 0,
    // Of the months done, how many were analyzed (the others were kept as
    // they were, or failed): the pages say "Updated · 2 months".
    analyzed: 0,
    total: count,
    message: `Analyzing ${area.name}…`,
    runIds: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    // Not sent to the pages (publicJob leaves it out).
    internal: { count, rerun: Boolean(rerun) },
  };
  jobs.set(job.id, job);
  placeInLine(job);
  prune();
  nextInLine();
  return publicJob(job);
}

// Stops an Atlas job. One that still waits for its turn is taken out of
// line: it ends as "cancelled" at once and the next one moves up. One that
// has started stops now (job.stopping, then "cancelled" a moment later:
// runJob): the month in progress is given up, the months saved before are
// kept. Gives back the job as it is then (an ended job is left as it was),
// or null when there is no such Atlas job. Throws a 409 (code
// "cannot_stop") for a job started by an older copy of this file (the dev
// server reloads code after an edit): it has nothing to stop it with, and
// "stopping…" would stay on screen while it went on.
export function cancelAnalysis(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.kind !== "atlas") return null;
  if (job.status === "running" && job.queued) {
    job.status = "cancelled";
    job.queued = false;
    job.waiting = null;
    job.message = `${job.areaName}: cancelled before it started`;
    job.finishedAt = new Date().toISOString();
    nextInLine();
  } else if (job.status === "running" && !job.stopping) {
    if (!job.internal?.stop) {
      throw Object.assign(new Error("This analysis started before the server was updated, so it cannot be stopped from here. It ends by itself (a restart of the server ends it too)."), { status: 409, code: "cannot_stop" });
    }
    job.stopping = true;
    job.waiting = null;
    job.message = `${job.areaName}: stopping…`;
    job.internal?.stop?.abort();
  }
  return publicJob(job);
}

// The war covering the area, or null, and who decided it: the team's own
// choice for it (area.war, Atlas Settings) first, else the app's list (by
// its country, or its cells). It decides where damage is counted from and
// whether distance to fighting means anything there
// (src/config/conflicts.js). A war of the list limited to boxes, on an area
// that is the whole country (Thailand, Russia, Ethiopia...), is marked
// partOfCountry: the providers apply its rules only in the squares that
// touch its boxes and read the others at peace (gee.js, sample.js), and
// the Overview's chip, the report and the AI say so. (Found in review,
// 2026-10-19: "Ethiopia" counted all of the country as at war since 1 Aug
// 2023, so any lasting radar change anywhere was heavy damage.)
function warFor(area, grid) {
  const conflict = conflictForArea({ countryId: area.countryId, bbox: area.bbox || grid.bbox, cells: grid.cells, war: area.war, areaId: area.id });
  const conflictSource = teamConflict(area.war, area.id) !== undefined ? "area" : "list";
  const partOfCountry = conflictSource === "list" && Boolean(area.countryId) && Boolean(conflict?.areas?.length);
  return { conflict: partOfCountry ? { ...conflict, partOfCountry: true } : conflict, conflictSource };
}

// "Ukraine: stopped after 3 of 12 months. The months analyzed before are kept."
function stoppedMessage(name, done, total) {
  if (!done) return `${name}: stopped before its first month was done.`;
  return `${name}: stopped after ${done} of ${total} months. The months analyzed before are kept.`;
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
  let war = warFor(area, grid);
  let warSaved = JSON.stringify(area.war || null);
  // A person's Stop (cancelAnalysis): `stopped` settles when it comes.
  const signal = job.internal.stop?.signal;
  const stopped = new Promise((resolve) => {
    if (signal?.aborted) resolve();
    else signal?.addEventListener("abort", resolve, { once: true });
  });
  const months = monthsBack(latestCompleteMonth(), count);
  const existing = new Map();
  for (const summary of await listRuns(area.id)) if (!existing.has(summary.month)) existing.set(summary.month, summary);

  const failed = [];
  try {
    for (const month of months) {
      if (signal?.aborted) break;
      // A war setting saved while this job runs is used from this month on
      // (a removed or unreadable area keeps the one it had).
      const now = await getArea(area.id).catch(() => null);
      if (now && JSON.stringify(now.war || null) !== warSaved) {
        warSaved = JSON.stringify(now.war || null);
        war = warFor({ ...area, war: now.war }, grid);
      }
      const { conflict, conflictSource } = war;
      const old = existing.get(month);
      // Keep an existing run unless asked to redo it, it is sample data and
      // the real source is now connected, or it was made with an older
      // method or another war setting than the area's now (another start
      // day, or war against peace: the months Atlas Settings counts,
      // overview.js monthsWithOtherWar) and someone started this job. The
      // same rule tells Atlas Settings how many months a re-run redoes
      // (overview.js keepsMonth).
      if (keepsMonth(old, { rerun, provider: provider.id, manual: job.trigger !== "monthly", warNow: warKey(conflict) })) {
        job.done += 1;
        job.runIds.push(old.id);
        describeLine();
        continue;
      }
      const monthMessage = `Analyzing ${area.name}: ${monthLabel(month)} (${job.done + 1} of ${job.total})`;
      job.message = monthMessage;
      job.waiting = null;
      // Only this month's progress counts: a request of a month that has
      // already failed (or was stopped) can still report while the next
      // month runs, or after the job has ended.
      let live = true;
      let result;
      try {
        const analysis = Promise.resolve(
          provider.analyze({
            area,
            cells: grid.cells,
            month,
            cellSizeDeg: grid.cellSizeDeg,
            conflict,
            signal,
            onProgress: (share, message, info) => {
              if (!live) return;
              job.monthProgress = Math.max(0, Math.min(1, Number(share) || 0));
              // While its requests wait for farm analyses and searches
              // (gee.js evaluate), the job says so (job.waiting, and the
              // message); then the month's line again.
              if (typeof info?.waiting === "boolean") {
                job.waiting = info.waiting && message ? String(message) : null;
                job.message = job.waiting ? `${monthMessage}: ${lowerFirst(job.waiting)}` : monthMessage;
              }
            },
          }),
        ).finally(() => {
          // A month that ends while its requests wait says nothing more.
          live = false;
          job.waiting = null;
        });
        analysis.catch(() => {});
        // A Stop ends the wait at once: the month's requests already out
        // finish at Earth Engine, but nobody waits for them (gee.js sends
        // nothing more of the month).
        const outcome = await Promise.race([analysis.then((value) => ({ value })), stopped.then(() => ({ stopped: true }))]);
        if (outcome.stopped) {
          live = false;
          job.waiting = null;
          break;
        }
        result = outcome.value;
      } catch (error) {
        if (signal?.aborted) break;
        if (stopsJob(error)) throw error;
        // Skip this month and go on (an older run of it, if any, is kept).
        console.warn(`[chernozem] ${area.name} ${month} failed, going on with the other months: ${error.message}`);
        failed.push({ month, error });
        if (old) job.runIds.push(old.id);
        job.done += 1;
        job.monthProgress = 0;
        job.failedMonths = failed.map((f) => f.month);
        describeLine();
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
        conflictSource,
        imagery: result.imagery,
        accessSource: result.accessSource,
      });
      // Redoing a month keeps its id, so links to it keep working.
      if (old) run.id = old.id;
      await saveRun(run);
      job.runIds.push(run.id);
      job.done += 1;
      job.analyzed += 1;
      job.monthProgress = 0;
      describeLine();
      await pause();
    }
  } finally {
    // "New heavy damage" needs the month before, which may have been
    // analyzed after this one, so it is filled in at the end (also when a
    // month failed, or the job was stopped, for the months that did finish).
    job.message = signal?.aborted ? `${area.name}: stopping…` : "Finishing…";
    job.monthProgress = 0;
    try {
      const summaries = await listRuns(area.id);
      const full = (await Promise.all(summaries.map((summary) => getRun(summary.id)))).filter(Boolean);
      for (const run of linkNewDamage(full)) await saveRun(run);
    } catch (error) {
      console.warn(`[chernozem] Could not link new damage for ${area.name}: ${error.message}`);
    }
  }

  // Stopped before its last month was done (a Stop while new damage was
  // linked, after every month, changes nothing).
  if (signal?.aborted && job.done < job.total) {
    job.status = "cancelled";
    job.stopping = false;
    job.message = stoppedMessage(area.name, job.done, job.total);
    job.finishedAt = new Date().toISOString();
    console.warn(`[chernozem] ${job.message}`);
    return;
  }
  job.stopping = false;
  if (failed.length) throw missingMonthsError(failed, job.total);
  job.status = "done";
  // "Ukraine: 2 months analyzed, 10 already up to date", "Ukraine: 12
  // months analyzed", or "Ukraine: all 12 months already up to date".
  const kept = job.done - job.analyzed;
  const monthsText = (n) => (n === 1 ? "1 month" : `${n} months`);
  if (!job.analyzed) job.message = `${area.name}: ${kept === 1 ? "the month is" : `all ${kept} months`} already up to date`;
  else job.message = kept > 0 ? `${area.name}: ${monthsText(job.analyzed)} analyzed, ${kept} already up to date` : `${area.name}: ${monthsText(job.analyzed)} analyzed`;
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
