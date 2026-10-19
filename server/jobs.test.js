// WHAT THIS FILE DOES
// Checks that an Atlas job goes on past a month that fails (Earth Engine
// busy after its retries) and then says which months are missing, and that
// problems which would fail every month stop it at once. Run with:
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

const { startAnalysis, getJob, stopsJob, missingMonthsError, staleMethod } = await import("./jobs.js");
const { saveArea, listRuns, getRun, saveRun } = await import("./store.js");
const { METHOD_VERSION } = await import("../src/lib/atlas/method.js");
const { sampleProvider } = await import("./providers/sample.js");
const { latestCompleteMonth, addMonths } = await import("./runs.js");

const AREA = {
  id: "area-jobtest",
  name: "Job test",
  kind: "custom",
  bbox: [30, 50, 30.2, 50.2],
  geometry: { type: "Polygon", coordinates: [[[30, 50], [30.2, 50], [30.2, 50.2], [30, 50.2], [30, 50]]] },
  areaHa: 30000,
  createdAt: "2026-10-01T00:00:00.000Z",
};

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
  assert.equal(error.message, "1 of 12 months could not be analyzed (July 2026): Earth Engine error: Earth Engine capacity exceeded. Run the analysis again to fill them in.");
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
