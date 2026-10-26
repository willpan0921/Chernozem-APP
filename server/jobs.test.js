// WHAT THIS FILE DOES
// Checks that an Atlas job goes on past a month that fails (Earth Engine
// busy after its retries) and then says which months are missing, and that
// problems which would fail every month stop it at once; that the job
// says when a month waits for farm analyses and searches; that only one
// Atlas analysis runs at a time (the others wait in line, a person's
// request before the monthly check's, first come first served within each,
// and can be cancelled while they wait); that a started analysis can be
// stopped (the months done are kept, nothing more of its month is sent,
// and the next one starts at once); which saved months a run redoes (an
// older method, another war setting); that a run's war follows the
// area's own war setting (area.war), also one saved while it runs and a
// day after some of its months, on sample data and on the fake Earth
// Engine, and that a region or drawn area across a war's boxes holds it
// only in part. Also the queue paths the 2026-10-20 review found untested:
// the look at the line every 5 s (a job of an older copy of this file
// ending), a monthly request joining a person's waiting job, a Stop during
// the final linking; a person's request while the monthly update analyzes
// the area (a follow-up), and the last monthly update's failure kept for
// the pages. Run with:
//   node --test server/jobs.test.js
//
// WHO EDITS IT
// Whoever changes server/jobs.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-jobs-"));
process.env.GEE_DISABLED = "1";

const { startAnalysis, cancelAnalysis, getJob, listJobs, stopsJob, missingMonthsError, staleMethod, waitingText, lastMonthlyProblem } = await import("./jobs.js");
const { saveArea, listRuns, getRun, saveRun, updateArea, deleteArea } = await import("./store.js");
const { METHOD_VERSION } = await import("../src/lib/atlas/method.js");
const { sampleProvider } = await import("./providers/sample.js");
const { latestCompleteMonth, addMonths, monthLabel, NO_WAR_WARNING, TEAM_PEACE_WARNING } = await import("./runs.js");
const { getProvider } = await import("./providers/index.js");
const { createGeeProvider, monthWindows } = await import("./providers/gee.js");
const { createFakeEe } = await import("./providers/fake-ee.js");
const { planGrid } = await import("./geo.js");
const { teamConflict } = await import("../src/config/conflicts.js");

const AREA = {
  id: "area-jobtest",
  name: "Job test",
  kind: "custom",
  bbox: [30, 50, 30.2, 50.2],
  geometry: { type: "Polygon", coordinates: [[[30, 50], [30.2, 50], [30.2, 50.2], [30, 50.2], [30, 50]]] },
  areaHa: 30000,
  createdAt: "2026-10-01T00:00:00.000Z",
};

// A box-shaped area (west, south, east, north in degrees).
const box = (west, south, east, north) => ({ type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
function boxArea(id, name, geometry, more = {}) {
  const grid = planGrid(geometry);
  return { id, name, kind: "custom", source: "bbox", geometry, bbox: grid.bbox, areaHa: grid.areaHa, createdAt: "2026-10-01T00:00:00.000Z", ...more };
}

async function finished(id) {
  for (let i = 0; i < 400; i++) {
    const job = getJob(id);
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("job did not finish");
}

test("which errors stop a job, and the missing-months message", () => {
  assert.equal(stopsJob(Object.assign(new Error("bad key"), { code: "bad_key" })), true);
  assert.equal(stopsJob(Object.assign(new Error("down"), { code: "gee_unavailable", status: 503 })), true);
  assert.equal(stopsJob(Object.assign(new Error("Earth Engine error: Earth Engine capacity exceeded."), { code: "gee_error" })), false);
  assert.equal(stopsJob(Object.assign(new Error("timed out"), { code: "timeout" })), false);
  const error = missingMonthsError([{ month: "2026-07", error: Object.assign(new Error("Earth Engine error: Earth Engine capacity exceeded."), { code: "gee_error" }) }], 12);
  assert.equal(error.message, "1 of 12 months could not be analyzed (July 2026): Earth Engine error: Earth Engine capacity exceeded. Run the analysis again to fill it in.");
  assert.deepEqual(error.months, ["2026-07"]);
  const two = missingMonthsError([
    { month: "2025-12", error: new Error("Earth Engine took longer than 120 seconds.") },
    { month: "2026-02", error: new Error("Earth Engine error: Earth Engine capacity exceeded.") },
  ], 12);
  assert.equal(two.message, "2 of 12 months could not be analyzed: December 2025 (Earth Engine took longer than 120 seconds); February 2026 (Earth Engine error: Earth Engine capacity exceeded). Run the analysis again to fill them in.");
});

test("a failed month is skipped, the rest are saved, and a second run fills the gap", async () => {
  await saveArea(AREA);
  const latest = latestCompleteMonth();
  const bad = addMonths(latest, -1);
  const analyze = sampleProvider.analyze;
  let failOn = bad;
  sampleProvider.analyze = (input) => (input.month === failOn ? Promise.reject(Object.assign(new Error("Earth Engine error: Earth Engine capacity exceeded."), { code: "gee_error" })) : analyze(input));
  try {
    const job = await finished((await startAnalysis({ areaId: AREA.id, months: 3 })).id);
    assert.equal(job.status, "error");
    assert.match(job.message, /^1 of 3 months could not be analyzed \(/);
    assert.deepEqual(job.failedMonths, [bad]);
    const months = (await listRuns(AREA.id)).map((run) => run.month).sort();
    assert.deepEqual(months, [addMonths(latest, -2), latest].sort());

    failOn = null;
    const again = await finished((await startAnalysis({ areaId: AREA.id, months: 3 })).id);
    assert.equal(again.status, "done");
    assert.equal((await listRuns(AREA.id)).length, 3);

    // A problem that fails every month stops at once.
    sampleProvider.analyze = () => Promise.reject(Object.assign(new Error("Google rejected the key."), { code: "bad_key" }));
    const stopped = await finished((await startAnalysis({ areaId: AREA.id, months: 3, rerun: true })).id);
    assert.equal(stopped.status, "error");
    assert.equal(stopped.done, 0);
    assert.match(stopped.message, /^Analysis stopped: Google rejected the key/);
  } finally {
    sampleProvider.analyze = analyze;
  }
});

test("Earth Engine too busy ('Too many concurrent aggregations.') skips that month and the job goes on; a real quota stops it", async () => {
  const area = { ...AREA, id: "area-jobbusy", name: "Busy test" };
  await saveArea(area);
  // The errors as gee.js gives them after its retries.
  const { explainGeeError } = await import("./providers/gee.js");
  const busy = explainGeeError(new Error("Too many concurrent aggregations."), { projectId: "test-proj", what: "Measuring 98 cells" });
  const quota = explainGeeError(new Error("Quota exceeded for quota metric 'Requests' and limit 'Requests per minute'."), { projectId: "test-proj" });
  assert.equal(busy.code, "busy");
  assert.equal(stopsJob(busy), false);
  assert.equal(quota.code, "quota");
  assert.equal(stopsJob(quota), true);
  const latest = latestCompleteMonth();
  const bad = addMonths(latest, -1);
  const analyze = sampleProvider.analyze;
  let error = busy;
  sampleProvider.analyze = (input) => (input.month === bad ? Promise.reject(error) : analyze(input));
  try {
    const job = await finished((await startAnalysis({ areaId: area.id, months: 3 })).id);
    assert.equal(job.status, "error");
    assert.equal(job.done, 3, "the job went on with the other months");
    assert.deepEqual(job.failedMonths, [bad]);
    assert.equal(job.errorCode, "busy");
    assert.equal(job.message, `1 of 3 months could not be analyzed (${monthLabel(bad)}): Measuring 98 cells: Earth Engine was too busy ("Too many concurrent aggregations."). Wait a few minutes and try again. Run the analysis again to fill it in.`);
    assert.deepEqual((await listRuns(area.id)).map((run) => run.month).sort(), [addMonths(latest, -2), latest].sort());
    // A real quota stops the job at that month.
    error = quota;
    const stopped = await finished((await startAnalysis({ areaId: area.id, months: 3, rerun: true })).id);
    assert.equal(stopped.status, "error");
    assert.equal(stopped.done, 1, "stopped at the second month");
    assert.equal(stopped.errorCode, "quota");
    assert.match(stopped.message, /^Analysis stopped: Earth Engine is limiting requests for project "test-proj"/);
  } finally {
    sampleProvider.analyze = analyze;
  }
});

test("a month made with an older method version is redone; one made with this method is kept", async () => {
  const area = { ...AREA, id: "area-jobmethod" };
  await saveArea(area);
  const first = await finished((await startAnalysis({ areaId: area.id, months: 2 })).id);
  assert.equal(first.status, "done");
  const runs = await listRuns(area.id);
  assert.ok(runs.every((run) => run.method?.version === METHOD_VERSION && !staleMethod(run)));
  // Make the older month look like a run saved before 2026-10-19.2.
  const older = await getRun(runs.find((run) => run.month === addMonths(latestCompleteMonth(), -1)).id);
  delete older.method.version;
  older.createdAt = "2026-10-01T00:00:00.000Z";
  await saveRun(older);
  assert.equal(staleMethod(older), true);
  const again = await finished((await startAnalysis({ areaId: area.id, months: 2 })).id);
  assert.equal(again.status, "done");
  const after = await listRuns(area.id);
  const redone = after.find((run) => run.month === older.month);
  assert.equal(redone.id, older.id, "the redone month keeps its id");
  assert.equal(redone.method.version, METHOD_VERSION);
  assert.notEqual(redone.createdAt, "2026-10-01T00:00:00.000Z");
  const kept = after.find((run) => run.month === latestCompleteMonth());
  assert.equal(kept.createdAt, runs.find((run) => run.month === latestCompleteMonth()).createdAt, "the current-method month is kept");
});

test("while a month's requests wait for farm analyses and searches, the job says so (job.waiting, shown on the Atlas page, and the message), then shows the month again; a month that has ended cannot change it", async () => {
  const area = { ...AREA, id: "area-jobwait", name: "Wait test" };
  await saveArea(area);
  const latest = latestCompleteMonth();
  const before = addMonths(latest, -1);
  const analyze = sampleProvider.analyze;
  const seen = {};
  let jobId = null;
  let lateProgress = null;
  // What gee.js analyze reports while its requests wait.
  const { WAITING_MESSAGE: waiting } = await import("./providers/gee.js");
  sampleProvider.analyze = async (input) => {
    if (input.month === latest) {
      input.onProgress(0.2, "Checking satellite images");
      seen.plain = getJob(jobId).message;
      seen.plainFlag = getJob(jobId).waiting;
      input.onProgress(0.2, waiting, { waiting: true });
      seen.waiting = getJob(jobId).message;
      seen.waitingFlag = getJob(jobId).waiting;
      input.onProgress(0.2, "Checking satellite images", { waiting: false });
      seen.back = getJob(jobId).message;
      seen.backFlag = getJob(jobId).waiting;
      lateProgress = input.onProgress;
      // It fails while its requests wait.
      input.onProgress(0.2, waiting, { waiting: true });
      throw Object.assign(new Error("Earth Engine error: boom."), { code: "gee_error" });
    }
    // The month before: nothing is left waiting from the failed month, and
    // its requests that still report change nothing.
    seen.nextFlag = getJob(jobId).waiting;
    lateProgress(0.9, waiting, { waiting: true });
    seen.late = getJob(jobId).message;
    seen.lateFlag = getJob(jobId).waiting;
    seen.lateProgress = getJob(jobId).monthProgress;
    // The last month fails while its requests wait too: the job does not
    // end "waiting".
    input.onProgress(0.5, waiting, { waiting: true });
    seen.lastFlag = getJob(jobId).waiting;
    throw Object.assign(new Error("Earth Engine error: boom again."), { code: "gee_error" });
  };
  try {
    jobId = (await startAnalysis({ areaId: area.id, months: 2, rerun: true })).id;
    const job = await finished(jobId);
    assert.equal(job.status, "error", "the first month failed");
    assert.equal(seen.plain, `Analyzing Wait test: ${monthLabel(latest)} (1 of 2)`);
    assert.equal(seen.waiting, `Analyzing Wait test: ${monthLabel(latest)} (1 of 2): waiting for farm analyses and searches to finish`);
    assert.equal(seen.back, seen.plain);
    // What the Atlas page shows under the bar (AtlasData.jsx AnalysisProgress).
    assert.equal(seen.plainFlag, null);
    assert.equal(seen.waitingFlag, "Waiting for farm analyses and searches to finish");
    assert.equal(seen.backFlag, null);
    assert.equal(seen.nextFlag, null, "a month that failed while waiting leaves no wait behind");
    assert.equal(seen.late, `Analyzing Wait test: ${monthLabel(before)} (2 of 2)`, "the failed month's late progress changes nothing");
    assert.equal(seen.lateFlag, null);
    assert.equal(seen.lateProgress, 0, "nor its progress");
    assert.equal(seen.lastFlag, "Waiting for farm analyses and searches to finish");
    assert.equal(job.waiting, null, "the job does not end waiting");
    // The Atlas page reads the month from the message (AtlasData.jsx).
    assert.equal(/:\s*(.+?)\s*\(/.exec(seen.waiting)?.[1], monthLabel(latest));
  } finally {
    sampleProvider.analyze = analyze;
  }
});

test("the monthly job does not redo older-method months by itself; it adds the new month only", async () => {
  const area = { ...AREA, id: "area-jobmonthly" };
  await saveArea(area);
  await finished((await startAnalysis({ areaId: area.id, months: 2 })).id);
  const runs = await listRuns(area.id);
  const olderMonth = addMonths(latestCompleteMonth(), -1);
  const older = await getRun(runs.find((run) => run.month === olderMonth).id);
  delete older.method.version;
  older.createdAt = "2026-10-01T00:00:00.000Z";
  await saveRun(older);
  const monthly = await finished((await startAnalysis({ areaId: area.id, months: 2, trigger: "monthly" })).id);
  assert.equal(monthly.status, "done");
  const kept = (await listRuns(area.id)).find((run) => run.month === olderMonth);
  assert.equal(kept.createdAt, "2026-10-01T00:00:00.000Z", "kept as it was");
  assert.equal(staleMethod(kept), true);
});

// ---------- One Atlas analysis at a time ----------

// Holds the sample analyses of some areas until open() is called, and
// writes down the order areas were analyzed in and the most analyses that
// ever ran at once.
function holdAnalyses(heldIds) {
  const analyze = sampleProvider.analyze;
  let open;
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const seen = { order: [], peak: 0, active: 0 };
  sampleProvider.analyze = async (input) => {
    if (!seen.order.includes(input.area.id)) seen.order.push(input.area.id);
    seen.active += 1;
    seen.peak = Math.max(seen.peak, seen.active);
    try {
      if (heldIds.includes(input.area.id)) await gate;
      return await analyze(input);
    } finally {
      seen.active -= 1;
    }
  };
  return {
    seen,
    open: () => open(),
    restore: () => {
      open();
      sampleProvider.analyze = analyze;
    },
  };
}

test("one Atlas analysis at a time: the next areas wait in line; the same area gives back its job; a waiting job takes in a re-run and can be cancelled", async () => {
  const one = { ...AREA, id: "area-line-one", name: "First" };
  const two = { ...AREA, id: "area-line-two", name: "Second" };
  const three = { ...AREA, id: "area-line-three", name: "Third" };
  for (const area of [one, two, three]) await saveArea(area);
  const held = holdAnalyses([one.id]);
  try {
    const first = await startAnalysis({ areaId: one.id, months: 2 });
    assert.equal(first.queued, false, "nothing else runs: it starts at once");
    const second = await startAnalysis({ areaId: two.id, months: 2 });
    const third = await startAnalysis({ areaId: three.id, months: 1, trigger: "monthly" });
    // Waiting jobs are "running" (the pages follow them as before) and say why.
    assert.equal(second.status, "running");
    assert.equal(second.queued, true);
    assert.equal(second.done, 0);
    assert.equal(second.waiting, "Waiting for First's analysis to finish");
    assert.equal(second.message, "Second: waiting for First's analysis to finish");
    assert.equal(third.waiting, "Waiting for First's analysis and 1 other to finish");
    assert.equal(waitingText("Ukraine", 2), "Waiting for Ukraine's analysis and 2 others to finish");
    assert.equal(second.internal, undefined, "the job's own bookkeeping is not sent to the pages");

    // The same area again gives back its job. One that waits takes in what
    // the new request adds: a re-run, more months, a person over the
    // monthly check (whose job keeps older-method months as they are).
    assert.equal((await startAnalysis({ areaId: one.id, months: 2, rerun: true })).id, first.id);
    const again = await startAnalysis({ areaId: two.id, months: 3, rerun: true });
    assert.equal(again.id, second.id);
    assert.equal(again.total, 3);
    const joined = await startAnalysis({ areaId: three.id, months: 1 });
    assert.equal(joined.id, third.id);
    assert.equal(joined.trigger, "manual");

    // The one analyzed now first, then the line in order.
    const line = listJobs({ status: "running", kind: "atlas" }).map((job) => job.id);
    assert.deepEqual(line.filter((id) => [first.id, second.id, third.id].includes(id)), [first.id, second.id, third.id]);

    // A waiting job can be cancelled (a started one is stopped: its own
    // test below).
    const cancelled = cancelAnalysis(third.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.queued, false);
    assert.equal(cancelled.message, "Third: cancelled before it started");
    assert.ok(cancelled.finishedAt);
    assert.equal(cancelAnalysis(third.id).status, "cancelled", "asking again gives it back as it is");
    assert.equal(cancelAnalysis("job-missing"), null);
    assert.equal(getJob(second.id).waiting, "Waiting for First's analysis to finish", "the next one moves up");

    held.open();
    assert.equal((await finished(first.id)).status, "done");
    const done = await finished(second.id);
    assert.equal(done.status, "done");
    assert.equal(done.total, 3, "the joined request's months");
    assert.equal(done.waiting, null);
    assert.deepEqual(held.seen.order, [one.id, two.id], "in line order; the cancelled area was never analyzed");
    assert.equal(held.seen.peak, 1, "never two analyses at once");
    assert.equal((await listRuns(three.id)).length, 0);
    assert.equal(getJob(third.id).status, "cancelled");
  } finally {
    held.restore();
  }
});

test("a person's request goes before the areas waiting for the monthly check, first come first served within each; a person's request for a waiting monthly area moves it up", async () => {
  const [a, b, c, d, e] = ["A", "B", "C", "D", "E"].map((name) => ({ ...AREA, id: `area-order-${name.toLowerCase()}`, name: `Order ${name}` }));
  for (const area of [a, b, c, d, e]) await saveArea(area);
  const held = holdAnalyses([a.id]);
  try {
    const running = await startAnalysis({ areaId: a.id, months: 1 });
    assert.equal(running.queued, false);
    // The monthly check queues B and C (in its own order), then a person
    // asks for D: D goes first.
    const monthlyB = await startAnalysis({ areaId: b.id, months: 1, trigger: "monthly" });
    const monthlyC = await startAnalysis({ areaId: c.id, months: 1, trigger: "monthly" });
    const person = await startAnalysis({ areaId: d.id, months: 1 });
    const ids = [running.id, monthlyB.id, monthlyC.id, person.id];
    const lineNow = () => listJobs({ status: "running", kind: "atlas" }).map((job) => job.id).filter((id) => ids.includes(id) || id === later?.id);
    let later = null;
    assert.deepEqual(lineNow(), [running.id, person.id, monthlyB.id, monthlyC.id]);
    assert.equal(getJob(person.id).waiting, "Waiting for Order A's analysis to finish");
    assert.equal(getJob(monthlyB.id).waiting, "Waiting for Order A's analysis and 1 other to finish");
    assert.equal(getJob(monthlyC.id).waiting, "Waiting for Order A's analysis and 2 others to finish");

    // A person asks for C, which waits for the monthly check: it becomes
    // theirs and goes after D, before B.
    const joined = await startAnalysis({ areaId: c.id, months: 1 });
    assert.equal(joined.id, monthlyC.id);
    assert.equal(joined.trigger, "manual");
    assert.deepEqual(lineNow(), [running.id, person.id, monthlyC.id, monthlyB.id]);
    // Another person's request goes after the people's ones already there.
    later = await startAnalysis({ areaId: e.id, months: 1 });
    assert.deepEqual(lineNow(), [running.id, person.id, monthlyC.id, later.id, monthlyB.id]);
    assert.equal(getJob(monthlyB.id).waiting, "Waiting for Order A's analysis and 3 others to finish");

    held.open();
    for (const id of [...ids, later.id]) assert.equal((await finished(id)).status, "done");
    assert.deepEqual(held.seen.order, [a.id, d.id, c.id, e.id, b.id], "analyzed in line order, the analysis running never interrupted");
    assert.equal(held.seen.peak, 1);
  } finally {
    held.restore();
  }
});

// Holds one month of an area until open() is called (the other months go
// on), and writes down when that month's analysis was asked for and when
// other areas were analyzed.
function holdMonth(areaId, month) {
  const analyze = sampleProvider.analyze;
  let open;
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const seen = { held: false, others: [] };
  sampleProvider.analyze = async (input) => {
    if (input.area.id === areaId && input.month === month) {
      seen.held = true;
      seen.signal = input.signal;
      await gate;
    } else if (input.area.id !== areaId) {
      seen.others.push(input.area.id);
    }
    return analyze(input);
  };
  return {
    seen,
    open: () => open(),
    restore: () => {
      open();
      sampleProvider.analyze = analyze;
    },
  };
}

async function until(check, what = "the condition") {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
}

test("a started analysis can be stopped: the month in progress is given up at once, the months done are kept (with their new damage), and the next area starts", async () => {
  const area = { ...AREA, id: "area-stop", name: "Stop test" };
  const next = { ...AREA, id: "area-stop-next", name: "Stop next" };
  for (const item of [area, next]) await saveArea(item);
  const latest = latestCompleteMonth();
  const third = addMonths(latest, -2);
  const held = holdMonth(area.id, third);
  const warn = console.warn;
  console.warn = () => {};
  try {
    const job = await startAnalysis({ areaId: area.id, months: 3 });
    const waiting = await startAnalysis({ areaId: next.id, months: 1 });
    assert.equal(waiting.queued, true);
    await until(() => held.seen.held, "the third month");
    assert.equal(getJob(job.id).done, 2);
    assert.match(getJob(waiting.id).waiting, /^Waiting for Stop test's analysis \(2 of 3 months\) to finish$/, "the waiting card follows the one running");
    assert.equal(held.seen.signal?.aborted, false, "the provider gets the Stop as an AbortSignal");

    const stopping = cancelAnalysis(job.id);
    assert.equal(stopping.status, "running");
    assert.equal(stopping.stopping, true);
    assert.equal(stopping.message, "Stop test: stopping…");
    assert.equal(held.seen.signal.aborted, true);
    assert.equal(cancelAnalysis(job.id).stopping, true, "asking again changes nothing");

    // It ends without waiting for the held month's answer.
    const ended = await finished(job.id);
    assert.equal(ended.status, "cancelled");
    assert.equal(ended.stopping, false);
    assert.equal(ended.message, "Stop test: stopped after 2 of 3 months. The months analyzed before are kept.");
    assert.ok(ended.finishedAt);
    const runs = await listRuns(area.id);
    assert.deepEqual(runs.map((run) => run.month).sort(), [addMonths(latest, -1), latest].sort(), "the two months done are kept");
    const newest = await getRun(runs.find((run) => run.month === latest).id);
    assert.ok(Number.isFinite(newest.newHeavyDamageHa), "new damage is linked for the months done");

    // The next area starts at once, while the stopped month's answer is
    // still out.
    assert.equal((await finished(waiting.id)).status, "done");
    assert.deepEqual(held.seen.others, [next.id]);
    assert.equal(cancelAnalysis(job.id).status, "cancelled", "an ended job is given back as it is");

    // Nothing more of the stopped month is saved once its answer comes.
    held.open();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal((await listRuns(area.id)).length, 2);
  } finally {
    console.warn = warn;
    held.restore();
  }
});

test("the waiting card follows the analysis running month by month, also over the months it keeps", async () => {
  const area = { ...AREA, id: "area-follow", name: "Follow test" };
  const next = { ...AREA, id: "area-follow-next", name: "Follow next" };
  for (const item of [area, next]) await saveArea(item);
  const latest = latestCompleteMonth();
  // The latest month is analyzed already: the next job keeps it, then waits
  // on the month before.
  assert.equal((await finished((await startAnalysis({ areaId: area.id, months: 1 })).id)).status, "done");
  const held = holdMonth(area.id, addMonths(latest, -1));
  try {
    const job = await startAnalysis({ areaId: area.id, months: 2 });
    const waiting = await startAnalysis({ areaId: next.id, months: 1 });
    await until(() => held.seen.held, "the second month");
    assert.equal(getJob(job.id).done, 1, "the kept month counts as done");
    assert.equal(getJob(waiting.id).waiting, "Waiting for Follow test's analysis (1 of 2 months) to finish");
    held.open();
    assert.equal((await finished(job.id)).status, "done");
    assert.equal((await finished(waiting.id)).status, "done");
  } finally {
    held.restore();
  }
});

test("a job started by an older copy of jobs.js (nothing to stop it with) is not marked as stopping: 409", () => {
  const jobsMap = globalThis.__chernozemJobs;
  const old = { id: "job-older-copy", kind: "atlas", areaId: "area-older", areaName: "Older", status: "running", done: 0, total: 1, message: "Analyzing Older…", runIds: [], startedAt: new Date().toISOString(), finishedAt: null };
  jobsMap.set(old.id, old);
  try {
    assert.throws(() => cancelAnalysis(old.id), (error) => error.status === 409 && error.code === "cannot_stop" && /cannot be stopped from here/.test(error.message));
    assert.equal(old.stopping, undefined);
    assert.equal(old.status, "running");
  } finally {
    jobsMap.delete(old.id);
  }
});

test("on the fake Earth Engine, a Stop sends nothing more of the month (no retry either) and the job ends at once", async () => {
  const CFG = { geeProjectId: "test-proj", geeCredentials: { client_email: "atlas@test-proj.iam.gserviceaccount.com", private_key: "test-key" }, geeCredentialsError: null, geeDisabled: false, chernozemAsset: "none", acledCsvPath: null };
  const area = { ...AREA, id: "area-stop-gee", name: "Stop on Earth Engine" };
  await saveArea(area);
  await getProvider();
  const state = globalThis.__chernozemProvider;
  const before = state.provider;
  // Slow requests, and a dropped connection for every request over the
  // cells (the season finder's, the cell groups'): without the Stop each
  // would be sent again after a pause.
  const ee = createFakeEe({ delayMs: 25, fail: (request) => (request.has("reduceRegions") ? "Network error: socket hang up" : null) });
  state.provider = createGeeProvider({ ee, getConfig: () => CFG, memoryRetryMs: [0, 0], retryDelayMs: 50 });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const job = await startAnalysis({ areaId: area.id, months: 1, rerun: true });
    await until(() => ee.requests.some((request) => request.has("reduceRegions")), "the first request over the cells");
    const stoppedAt = Date.now();
    cancelAnalysis(job.id);
    const sent = ee.requests.length;
    const ended = await finished(job.id);
    assert.ok(Date.now() - stoppedAt < 1000, "the job did not wait for the month");
    assert.equal(ended.status, "cancelled");
    assert.equal(ended.message, "Stop on Earth Engine: stopped before its first month was done.");
    // Longer than the retry pause and the requests still out.
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(ee.requests.length, sent, "nothing was sent after the Stop, not even a retry");
    assert.equal((await listRuns(area.id)).length, 0);
  } finally {
    console.warn = warn;
    state.provider = before;
  }
});

test("the months a run redoes: another war setting, in a run a person started (only the months made with it); the monthly job keeps them", async () => {
  const iowa = boxArea("area-redo-war", "Redo test", box(-93.7, 42.0, -93.6, 42.1));
  await saveArea(iowa);
  const latest = latestCompleteMonth();
  const failing = [addMonths(latest, -1), addMonths(latest, -2)];
  // Three months at peace (no war in the app's list here).
  assert.equal((await finished((await startAnalysis({ areaId: iowa.id, months: 3 })).id)).status, "done");
  await updateArea(iowa.id, (saved) => {
    saved.war = { mode: "war", since: "2023-08-01" };
  });
  // The re-run that applies it, with Earth Engine too busy for two months:
  // they keep their peace runs.
  const analyze = sampleProvider.analyze;
  const asked = [];
  let fail = true;
  sampleProvider.analyze = (input) => {
    asked.push(input.month);
    if (fail && failing.includes(input.month)) return Promise.reject(Object.assign(new Error("Earth Engine was too busy."), { code: "busy" }));
    return analyze(input);
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const rerun = await finished((await startAnalysis({ areaId: iowa.id, months: 3, rerun: true })).id);
    assert.equal(rerun.status, "error");
    const made = async () => Object.fromEntries((await listRuns(iowa.id)).map((run) => [run.month, run.conflict?.since || null]));
    assert.deepEqual(await made(), { [latest]: "2023-08-01", [failing[0]]: null, [failing[1]]: null });
    fail = false;

    // The monthly job keeps them as they are.
    asked.length = 0;
    const monthly = await finished((await startAnalysis({ areaId: iowa.id, months: 3, trigger: "monthly" })).id);
    assert.equal(monthly.status, "done");
    assert.deepEqual(asked, []);
    assert.equal(monthly.analyzed, 0);
    assert.equal(monthly.message, "Redo test: all 3 months already up to date");

    // A plain run someone starts redoes exactly the two made at peace.
    const plain = await finished((await startAnalysis({ areaId: iowa.id, months: 3 })).id);
    assert.equal(plain.status, "done");
    assert.deepEqual(asked.sort(), [...failing].sort());
    assert.equal(plain.analyzed, 2);
    assert.equal(plain.message, "Redo test: 2 months analyzed, 1 already up to date");
    assert.deepEqual(await made(), { [latest]: "2023-08-01", [failing[0]]: "2023-08-01", [failing[1]]: "2023-08-01" });
  } finally {
    console.warn = warn;
    sampleProvider.analyze = analyze;
  }
});

test("a war setting saved while the area is being analyzed is used from the next month on", async () => {
  const iowa = boxArea("area-war-midway", "Midway test", box(-93.7, 42.0, -93.6, 42.1));
  await saveArea(iowa);
  const latest = latestCompleteMonth();
  const held = holdMonth(iowa.id, latest);
  try {
    const job = await startAnalysis({ areaId: iowa.id, months: 3 });
    await until(() => held.seen.held, "the first month");
    await updateArea(iowa.id, (saved) => {
      saved.war = { mode: "war", since: "2023-08-01", name: "Set midway" };
    });
    held.open();
    assert.equal((await finished(job.id)).status, "done");
    const runs = await listRuns(iowa.id);
    const byMonth = Object.fromEntries(runs.map((run) => [run.month, run]));
    assert.equal(byMonth[latest].conflict, null, "the month under way keeps the setting it began with");
    for (const month of [addMonths(latest, -1), addMonths(latest, -2)]) {
      assert.deepEqual(byMonth[month].conflict, { id: `area-${iowa.id}`, name: "Set midway", since: "2023-08-01", source: "area" });
      assert.equal(byMonth[month].conflictSource, "area");
    }
  } finally {
    held.restore();
  }
});

test("a waiting analysis reads its area when its turn comes: a new name and war setting are used, and an area removed meanwhile ends its job", async () => {
  const busy = { ...AREA, id: "area-turn-busy", name: "Busy" };
  const waits = { ...AREA, id: "area-turn-waits", name: "Waits" };
  const gone = { ...AREA, id: "area-turn-gone", name: "Gone" };
  for (const area of [busy, waits, gone]) await saveArea(area);
  const held = holdAnalyses([busy.id]);
  const errorLog = console.error;
  console.error = () => {};
  try {
    const first = await startAnalysis({ areaId: busy.id, months: 1 });
    const second = await startAnalysis({ areaId: waits.id, months: 1 });
    const third = await startAnalysis({ areaId: gone.id, months: 1 });
    assert.deepEqual([second.queued, third.queued], [true, true]);
    await updateArea(waits.id, (area) => {
      area.name = "Waits renamed";
      area.war = { mode: "war", since: "2024-05-01", name: "Set while waiting" };
    });
    await deleteArea(gone.id);
    held.open();
    assert.equal((await finished(first.id)).status, "done");
    const ran = await finished(second.id);
    assert.equal(ran.status, "done");
    assert.equal(ran.areaName, "Waits renamed");
    const run = await getRun(ran.runIds[0]);
    assert.deepEqual(run.conflict, { id: `area-${waits.id}`, name: "Set while waiting", since: "2024-05-01", source: "area" });
    const ended = await finished(third.id);
    assert.equal(ended.status, "error");
    assert.equal(ended.errorCode, "not_found");
    assert.equal(ended.message, "Analysis stopped: The area was removed before its analysis could start.");
  } finally {
    console.error = errorLog;
    held.restore();
  }
});

// ---------- The area's own war setting ----------


test("a run's war follows the area's own setting: at war from the team's day, not at war, or the app's list (sample data)", async () => {
  // Story County, Iowa: no war in the app's list; Kyiv oblast: the war in Ukraine.
  const iowa = boxArea("area-war-iowa", "Story County", box(-93.7, 42.0, -93.6, 42.1), { war: { mode: "war", since: "2023-08-01", name: "Test war" } });
  const peace = { ...AREA, id: "area-war-peace", name: "Kyiv, not at war", war: { mode: "peace" } };
  const listed = { ...AREA, id: "area-war-list", name: "Kyiv, the list" };
  for (const area of [iowa, peace, listed]) await saveArea(area);
  const runOf = async (area) => getRun((await finished((await startAnalysis({ areaId: area.id, months: 1 })).id)).runIds[0]);

  const atWar = await runOf(iowa);
  assert.deepEqual(atWar.conflict, { id: "area-area-war-iowa", name: "Test war", since: "2023-08-01", source: "area" });
  assert.equal(atWar.conflictSource, "area");
  assert.equal(atWar.accessSource, "fires", "in a war distance to fighting is estimated");
  assert.ok(!atWar.checks.warnings.includes(NO_WAR_WARNING));

  const calm = await runOf(peace);
  assert.equal(calm.conflict, null);
  assert.equal(calm.conflictSource, "area");
  assert.equal(calm.accessSource, "none");
  assert.ok(calm.checks.warnings.includes(TEAM_PEACE_WARNING), "the run says the team decided");
  assert.ok(!calm.checks.warnings.includes(NO_WAR_WARNING));
  assert.ok(calm.cells.every((cell) => cell.distance === 1), "nothing measured: full access everywhere");

  const list = await runOf(listed);
  assert.deepEqual(list.conflict, { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  assert.equal(list.conflictSource, "list");
});

test("with the fake Earth Engine, a war the team set is where damage is counted from: its fire years and war seasons start at the team's day", async () => {
  const CFG = { geeProjectId: "test-proj", geeCredentials: { client_email: "atlas@test-proj.iam.gserviceaccount.com", private_key: "test-key" }, geeCredentialsError: null, geeDisabled: false, chernozemAsset: "none", acledCsvPath: null };
  const war = { mode: "war", since: "2023-08-01", name: "Test war" };
  const area = boxArea("area-war-gee", "Story County (Earth Engine)", box(-93.7, 42.0, -93.65, 42.05), { war });
  await saveArea(area);
  await getProvider();
  const state = globalThis.__chernozemProvider;
  const before = state.provider;
  const runWith = async (rerun) => {
    const ee = createFakeEe();
    state.provider = createGeeProvider({ ee, getConfig: () => CFG, memoryRetryMs: [0, 0] });
    const job = await finished((await startAnalysis({ areaId: area.id, months: 1, rerun })).id);
    assert.equal(job.status, "done", job.error);
    const starts = new Set(ee.callsNamed("ImageCollection.filterDate").map((call) => call.args[0]));
    return { run: await getRun(job.runIds[0]), starts };
  };
  try {
    const month = latestCompleteMonth();
    const today = new Date().toISOString().slice(0, 10);
    const lat = (area.bbox[1] + area.bbox[3]) / 2;
    const atWar = await runWith(false);
    assert.equal(atWar.run.provider, "gee");
    assert.deepEqual(atWar.run.conflict, { id: "area-area-war-gee", name: "Test war", since: "2023-08-01", source: "area" });
    assert.equal(atWar.run.conflictSource, "area");
    assert.equal(atWar.run.accessSource, "fires");
    const windows = monthWindows(month, today, { lat, conflict: teamConflict(war, area.id) });
    assert.equal(windows.damage.start, "2023-08-01");
    for (const year of windows.fireYears) assert.ok(atWar.starts.has(year.start), `war year from ${year.start}`);
    assert.ok(atWar.starts.has("2023-08-01"));
    // The radar compares the complete war seasons since that day.
    assert.equal(atWar.run.imagery.from, windows.radarSeasons[0].start.slice(0, 7));
    assert.ok(atWar.run.imagery.from >= "2023-08");

    // Not at war: the last two years, at peace rules, nothing from 2023-08-01.
    await updateArea(area.id, (saved) => {
      saved.war = { mode: "peace" };
    });
    const calm = await runWith(true);
    assert.equal(calm.run.id, atWar.run.id, "the redone month keeps its id");
    assert.equal(calm.run.conflict, null);
    assert.equal(calm.run.accessSource, "none");
    assert.ok(calm.run.checks.warnings.includes(TEAM_PEACE_WARNING));
    const peaceWindows = monthWindows(month, today, { lat, conflict: null });
    for (const year of peaceWindows.fireYears) assert.ok(calm.starts.has(year.start), `peace year from ${year.start}`);
    assert.equal(calm.starts.has("2023-08-01"), false);
  } finally {
    state.provider = before;
  }
});

test("a re-run that reaches back past the war's start day: the months before it count no war damage and measure no distance, and keep the war (nothing to redo)", async () => {
  const { beforeWarWarning } = await import("./runs.js");
  const { monthsWithOtherWar, beforeWar } = await import("../src/lib/atlas/overview.js");
  const { runsComparable } = await import("../src/lib/atlas/method.js");
  const latest = latestCompleteMonth();
  // The war began on the first day of the month before the latest one.
  const since = `${addMonths(latest, -1)}-01`;
  const area = boxArea("area-war-span", "Span test", box(-93.7, 42.0, -93.6, 42.1), { war: { mode: "war", since, name: "Recent war" } });
  await saveArea(area);
  const job = await finished((await startAnalysis({ areaId: area.id, months: 3 })).id);
  assert.equal(job.status, "done", job.error);
  const runs = await listRuns(area.id);
  const byMonth = Object.fromEntries(runs.map((run) => [run.month, run]));
  const early = await getRun(byMonth[addMonths(latest, -2)].id);
  const first = await getRun(byMonth[addMonths(latest, -1)].id);
  assert.equal(beforeWar(early), true);
  assert.equal(early.accessSource, "none");
  assert.ok(early.checks.warnings.includes(beforeWarWarning(since)));
  assert.equal(early.totals.heavyDamageHa, 0);
  assert.ok(early.cells.every((cell) => cell.distance === 1), "nothing measured: full access");
  assert.deepEqual(early.conflict, first.conflict, "the same war on every month");
  assert.equal(beforeWar(first), false);
  assert.equal(first.accessSource, "fires");
  // Comparable, and nothing for Atlas Settings to redo.
  assert.equal(runsComparable(early, first).comparable, true);
  assert.deepEqual(monthsWithOtherWar({ ...area, listConflict: null }, runs), []);
});

test("a whole-country area whose war covers it only in part: the run says so, counts the war's squares and marks each square", async () => {
  const { listConflictForArea } = await import("./conflicts.js");
  const { warKey } = await import("../src/lib/atlas/overview.js");
  // A stand-in for Thailand: a small box across the south edge of the
  // Dângrêk box of the Cambodia-Thailand border conflict (14.05° N).
  const geometry = box(104.0, 13.85, 104.4, 14.25);
  const area = boxArea("area-thai-part", "Thailand (part)", geometry, { kind: "country", source: "country", countryId: "764" });
  await saveArea(area);
  const job = await finished((await startAnalysis({ areaId: area.id, months: 1 })).id);
  assert.equal(job.status, "done", job.error);
  const run = await getRun(job.runIds[0]);
  assert.deepEqual(run.conflict, { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24", partOfCountry: true });
  assert.equal(run.conflictSource, "list");
  const inside = run.cells.filter((cell) => cell.atWar === true);
  const outside = run.cells.filter((cell) => cell.atWar === false);
  assert.equal(inside.length + outside.length, run.cells.length);
  assert.ok(inside.length > 0 && outside.length > 0);
  assert.equal(run.warSquares, inside.length);
  assert.ok(inside.every((cell) => cell.lat + run.cellSizeDeg / 2 > 14.05));
  assert.ok(outside.every((cell) => cell.lat + run.cellSizeDeg / 2 <= 14.05 + 1e-9));
  assert.equal(outside.reduce((sum, cell) => sum + cell.heavyDamageHa, 0), 0, "no heavy damage at peace rules here");
  // What the app's list says for the area gives the same war key, so Atlas
  // Settings asks to redo nothing.
  assert.equal(warKey(listConflictForArea(area)), warKey(run.conflict));
});

test("a region or a drawn area across the edge of a war's boxes holds it only in part, like a whole country (in part of the area); one inside the boxes has its rules all over", async () => {
  const { listConflictForArea } = await import("./conflicts.js");
  const { warKey, warNote, warInPart } = await import("../src/lib/atlas/overview.js");
  // An Afar-like region along the east edge of the Amhara boxes (38.45 to
  // 39.85° E): its west squares touch them, the others do not.
  const region = boxArea("admin1-afar-edge", "Afar edge", box(39.6, 11.8, 40.4, 12.4), { kind: "admin1", source: "admin1", country: "Ethiopia" });
  await saveArea(region);
  const job = await finished((await startAnalysis({ areaId: region.id, months: 1 })).id);
  assert.equal(job.status, "done", job.error);
  const run = await getRun(job.runIds[0]);
  assert.deepEqual(run.conflict, { id: "amhara", name: "War in Ethiopia's Amhara region", since: "2023-08-01", partOfCountry: true, partOf: "area" });
  assert.equal(run.conflictSource, "list");
  const inside = run.cells.filter((cell) => cell.atWar === true);
  const outside = run.cells.filter((cell) => cell.atWar === false);
  assert.ok(inside.length > 0 && outside.length > 0);
  assert.equal(inside.length + outside.length, run.cells.length);
  assert.equal(run.warSquares, inside.length);
  assert.ok(inside.every((cell) => cell.lon - run.cellSizeDeg / 2 < 39.85), "only squares that touch the boxes");
  assert.equal(outside.reduce((sum, cell) => sum + cell.heavyDamageHa, 0), 0, "the peace rule outside the boxes");
  assert.equal(warInPart(run), true);
  assert.equal(warNote(run).badge, "War since 1 Aug 2023 · in part of the area");
  // Atlas Settings reads the same war key: nothing to redo.
  assert.equal(warKey(listConflictForArea(region)), warKey(run.conflict));

  // A drawn area inside one of the boxes: every square has the war's rules.
  const drawn = boxArea("area-gondar-drawn", "Gondar drawn", box(37.3, 12.4, 37.5, 12.6), { source: "draw" });
  await saveArea(drawn);
  const whole = await getRun((await finished((await startAnalysis({ areaId: drawn.id, months: 1 })).id)).runIds[0]);
  assert.deepEqual(whole.conflict, { id: "amhara", name: "War in Ethiopia's Amhara region", since: "2023-08-01" });
  assert.ok(whole.cells.every((cell) => !("atWar" in cell)));
  assert.equal(whole.warSquares, undefined);
  assert.equal(warNote(whole).badge, "War since 1 Aug 2023");
  assert.equal(warKey(listConflictForArea(drawn)), warKey(whole.conflict));
});

// ---------- Paths found untested in review (2026-10-20) ----------

test("the line is looked at again every 5 seconds: when a job started by an older copy of jobs.js ends, the next one starts", async (t) => {
  const area = { ...AREA, id: "area-after-older", name: "After older" };
  await saveArea(area);
  const jobsMap = globalThis.__chernozemJobs;
  // A job an older copy of this file started (the dev server reloads code
  // after an edit): this copy is never told when it ends.
  const old = { id: "job-older-running", kind: "atlas", areaId: "area-older-copy", areaName: "Older copy", status: "running", done: 0, total: 1, message: "Analyzing Older copy…", runIds: [], startedAt: new Date().toISOString(), finishedAt: null };
  jobsMap.set(old.id, old);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const job = await startAnalysis({ areaId: area.id, months: 1 });
    assert.equal(job.queued, true);
    assert.equal(job.waiting, "Waiting for Older copy's analysis to finish");
    old.status = "done";
    old.finishedAt = new Date().toISOString();
    t.mock.timers.tick(4999);
    assert.equal(getJob(job.id).queued, true, "nothing starts it before the next look at the line");
    t.mock.timers.tick(1);
    assert.equal(getJob(job.id).queued, false, "the look at the line 5 s later starts it");
    t.mock.timers.reset();
    assert.equal((await finished(job.id)).status, "done");
  } finally {
    t.mock.timers.reset();
    jobsMap.delete(old.id);
  }
});

test("a monthly request for an area whose person's analysis waits keeps it the person's: its trigger and its place before the monthly ones", async () => {
  const busy = { ...AREA, id: "area-keep-busy", name: "Keep busy" };
  const area = { ...AREA, id: "area-keep-person", name: "Keep person" };
  const other = { ...AREA, id: "area-keep-monthly", name: "Keep monthly" };
  for (const item of [busy, area, other]) await saveArea(item);
  const held = holdAnalyses([busy.id]);
  try {
    const running = await startAnalysis({ areaId: busy.id, months: 1 });
    const monthlyOther = await startAnalysis({ areaId: other.id, months: 1, trigger: "monthly" });
    const person = await startAnalysis({ areaId: area.id, months: 1 });
    const joined = await startAnalysis({ areaId: area.id, months: 2, trigger: "monthly" });
    assert.equal(joined.id, person.id);
    assert.equal(joined.trigger, "manual", "still the person's (a monthly job would keep older-method months as they are)");
    assert.equal(joined.total, 2, "it takes in the larger number of months");
    const ids = [running.id, person.id, monthlyOther.id];
    assert.deepEqual(listJobs({ status: "running", kind: "atlas" }).map((job) => job.id).filter((id) => ids.includes(id)), ids);
    held.open();
    for (const id of ids) assert.equal((await finished(id)).status, "done");
    assert.deepEqual(held.seen.order, [busy.id, area.id, other.id]);
  } finally {
    held.restore();
  }
});

test("a Stop that comes once every month is done (while the new damage is linked) ends the job 'done', not 'cancelled'", async () => {
  const area = { ...AREA, id: "area-stop-late", name: "Stop late" };
  await saveArea(area);
  const last = addMonths(latestCompleteMonth(), -1);
  const analyze = sampleProvider.analyze;
  let jobId = null;
  const seen = {};
  sampleProvider.analyze = async (input) => {
    const result = await analyze(input);
    // The last month's answer is in: the Stop comes while the job saves it
    // and links the new damage.
    if (input.month === last) setImmediate(() => (seen.stop = cancelAnalysis(jobId)));
    return result;
  };
  try {
    jobId = (await startAnalysis({ areaId: area.id, months: 2 })).id;
    const job = await finished(jobId);
    assert.equal(seen.stop?.stopping, true, "the Stop came while the job still ran");
    assert.equal(job.status, "done");
    assert.equal(job.stopping, false);
    assert.equal(job.done, 2);
    assert.equal(job.message, "Stop late: 2 months analyzed");
    assert.equal((await listRuns(area.id)).length, 2);
  } finally {
    sampleProvider.analyze = analyze;
  }
});

test("a person's request while the monthly update analyzes the area waits for it as a follow-up, then does what the person asked (here a re-run)", async () => {
  const area = { ...AREA, id: "area-follow-up", name: "Follow-up" };
  await saveArea(area);
  const latest = latestCompleteMonth();
  // The latest month is there already: the monthly job keeps it and
  // analyzes the missing month before it.
  assert.equal((await finished((await startAnalysis({ areaId: area.id, months: 1 })).id)).status, "done");
  const held = holdMonth(area.id, addMonths(latest, -1));
  try {
    const monthly = await startAnalysis({ areaId: area.id, months: 2, trigger: "monthly" });
    await until(() => held.seen.held, "the monthly job's second month");
    const person = await startAnalysis({ areaId: area.id, months: 2, rerun: true });
    assert.notEqual(person.id, monthly.id, "not folded into the monthly job");
    assert.equal(person.queued, true);
    assert.equal(person.trigger, "manual");
    assert.equal(person.waiting, "Waiting for this area's monthly update (1 of 2 months) to finish");
    assert.equal(person.message, "Follow-up: waiting for this area's monthly update (1 of 2 months) to finish");
    // Asked again (another page): the follow-up takes it in; a monthly
    // request too, and stays the person's.
    assert.equal((await startAnalysis({ areaId: area.id, months: 3 })).id, person.id);
    assert.equal((await startAnalysis({ areaId: area.id, months: 1, trigger: "monthly" })).id, person.id);
    assert.equal(getJob(person.id).total, 3);
    assert.equal(getJob(person.id).trigger, "manual");
    assert.equal(getJob(monthly.id).trigger, "monthly", "the monthly job goes on as it was");
    assert.equal(listJobs({ areaId: area.id, status: "running" }).length, 2);
    held.open();
    const ended = await finished(monthly.id);
    assert.equal(ended.status, "done");
    assert.equal(ended.analyzed, 1);
    const followUp = await finished(person.id);
    assert.equal(followUp.status, "done");
    assert.equal(followUp.analyzed, 3, "the re-run redid every month, after the monthly update");
    assert.equal(followUp.message, "Follow-up: 3 months analyzed");
  } finally {
    held.restore();
  }
});

test("what went wrong in the last monthly update is kept for the pages (also past the hour) until an analysis of the area ends well", async () => {
  const area = { ...AREA, id: "area-monthly-problem", name: "Monthly problem" };
  await saveArea(area);
  const latest = latestCompleteMonth();
  const analyze = sampleProvider.analyze;
  let fail = true;
  sampleProvider.analyze = (input) => (fail && input.month === latest ? Promise.reject(Object.assign(new Error("Earth Engine was too busy."), { code: "busy" })) : analyze(input));
  const [warn, errorLog] = [console.warn, console.error];
  console.warn = () => {};
  console.error = () => {};
  try {
    assert.equal(lastMonthlyProblem(area.id), null);
    const monthly = await finished((await startAnalysis({ areaId: area.id, months: 2, trigger: "monthly" })).id);
    assert.equal(monthly.status, "error");
    const problem = lastMonthlyProblem(area.id);
    assert.deepEqual(problem, {
      jobId: monthly.id,
      text: `The last monthly update could not analyze 1 month (${monthLabel(latest)}): Earth Engine was too busy. The next monthly check tries it again within 6 hours; to redo it now, run the analysis again from Atlas Settings.`,
      months: [latest],
      finishedAt: monthly.finishedAt,
    });
    // Finished jobs are forgotten after an hour; this one is kept.
    const saved = globalThis.__chernozemJobs.get(monthly.id);
    saved.finishedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    listJobs();
    assert.equal(lastMonthlyProblem(area.id)?.jobId, monthly.id);
    // An analysis of the area that ends well clears it.
    fail = false;
    assert.equal((await finished((await startAnalysis({ areaId: area.id, months: 2 })).id)).status, "done");
    assert.equal(lastMonthlyProblem(area.id), null);
    listJobs();
    assert.equal(getJob(monthly.id), null, "then it is forgotten like any job");
    // An older month that failed: the monthly check does not start the
    // area again for it (its latest month is there), so the line says to
    // run the analysis.
    const older = addMonths(latest, -1);
    sampleProvider.analyze = (input) => (input.month === older ? Promise.reject(Object.assign(new Error("Earth Engine was too busy."), { code: "busy" })) : analyze(input));
    const olderJob = await finished((await startAnalysis({ areaId: area.id, months: 2, rerun: true, trigger: "monthly" })).id);
    assert.equal(olderJob.status, "error");
    assert.deepEqual(lastMonthlyProblem(area.id), {
      jobId: olderJob.id,
      text: `The last monthly update could not analyze 1 month (${monthLabel(older)}): Earth Engine was too busy. To fill it in, run the analysis again from Atlas Settings.`,
      months: [older],
      finishedAt: olderJob.finishedAt,
    });
    // A monthly update stopped at once (a problem that fails every month).
    // Its month still has its older run, so no month is left out.
    sampleProvider.analyze = () => Promise.reject(Object.assign(new Error("Google rejected the key."), { code: "bad_key" }));
    await finished((await startAnalysis({ areaId: area.id, months: 1, rerun: true, trigger: "monthly" })).id);
    assert.equal(lastMonthlyProblem(area.id).text, "The last monthly update stopped: Google rejected the key.");
    assert.deepEqual(lastMonthlyProblem(area.id).months, []);
    // One stopped at once on an area that has no run of its month yet: the
    // months it left without a run (job.missingMonths; none failed one by
    // one), so the pages can hide the line once they are filled in.
    const fresh = { ...AREA, id: "area-monthly-stopped", name: "Monthly stopped" };
    await saveArea(fresh);
    const stoppedJob = await finished((await startAnalysis({ areaId: fresh.id, months: 1, trigger: "monthly" })).id);
    assert.equal(stoppedJob.status, "error");
    assert.deepEqual(lastMonthlyProblem(fresh.id), { jobId: stoppedJob.id, text: "The last monthly update stopped: Google rejected the key.", months: [latest], finishedAt: stoppedJob.finishedAt });
    // A person's analysis that fails does not count as the monthly one.
    assert.equal((await finished((await startAnalysis({ areaId: "area-jobtest", months: 1, rerun: true })).id)).status, "error");
    assert.equal(lastMonthlyProblem("area-jobtest"), null);
  } finally {
    console.warn = warn;
    console.error = errorLog;
    sampleProvider.analyze = analyze;
  }
});

test("a natural disaster set on the war's day redoes the months (another crisis); a disaster month made with the disaster method is then kept", async () => {
  const { DISASTER_METHOD_VERSION } = await import("../src/lib/atlas/method.js");
  const area = boxArea("area-redo-flood", "Flood redo", box(-93.5, 42.0, -93.4, 42.1), { war: { mode: "war", since: "2024-06-20" } });
  await saveArea(area);
  assert.equal((await finished((await startAnalysis({ areaId: area.id, months: 2 })).id)).status, "done");
  const before = await listRuns(area.id);
  assert.ok(before.every((run) => !run.conflict.kind && run.method.version === METHOD_VERSION));
  // The same day, now a flood: every month is made again with its rules.
  await updateArea(area.id, (saved) => {
    saved.war = { mode: "disaster", since: "2024-06-20", type: "flood", name: "Big Sioux floods" };
  });
  const redo = await finished((await startAnalysis({ areaId: area.id, months: 2 })).id);
  assert.equal(redo.status, "done");
  assert.equal(redo.analyzed, 2);
  const after = await listRuns(area.id);
  for (const summary of after) {
    assert.deepEqual(summary.conflict, { id: "area-area-redo-flood", name: "Big Sioux floods", since: "2024-06-20", source: "area", kind: "disaster", type: "flood" });
    assert.equal(summary.method.version, DISASTER_METHOD_VERSION);
    assert.equal(summary.accessSource, "flood-now");
    assert.ok(Number.isFinite(summary.totals.hitHa) && Number.isFinite(summary.totals.hitCropHa));
    const run = await getRun(summary.id);
    assert.ok(run.cells.every((cell) => cell.distance === null && Number.isFinite(cell.feasible)));
  }
  // Kept now: made with the disaster method and the same crisis.
  const again = await finished((await startAnalysis({ areaId: area.id, months: 2 })).id);
  assert.equal(again.analyzed, 0);
  // A wildfire on the same day is another crisis: redone again.
  await updateArea(area.id, (saved) => {
    saved.war = { mode: "disaster", since: "2024-06-20", type: "wildfire" };
  });
  const fire = await finished((await startAnalysis({ areaId: area.id, months: 2 })).id);
  assert.equal(fire.analyzed, 2);
  assert.ok((await listRuns(area.id)).every((run) => run.conflict.type === "wildfire" && run.conflict.name === "Wildfire (set for this area)"));
});
