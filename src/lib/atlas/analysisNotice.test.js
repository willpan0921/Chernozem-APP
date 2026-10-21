// WHAT THIS FILE DOES
// Checks the line the Atlas pages show after an analysis that did not end
// as asked (analysisNotice.js): a Stop, missing months, and the last
// monthly update's failure until its months are filled in. Run with:
//   node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes analysisNotice.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisNotice } from "./analysisNotice.js";

const area = { id: "area-k", name: "Kharkiv oblast" };

test("after a Stop, or months that failed, the job's own words; nothing while it runs or after it went well", () => {
  const stopped = { id: "job-1", areaId: "area-k", status: "cancelled", message: "Kharkiv oblast: stopped after 3 of 12 months. The months analyzed before are kept." };
  assert.deepEqual(analysisNotice({ area, job: stopped }), { key: "job-job-1", tone: "muted", text: stopped.message });
  const failed = { id: "job-2", areaId: "area-k", status: "error", message: "1 of 12 months could not be analyzed (July 2026): Earth Engine was too busy. Run the analysis again to fill it in." };
  assert.deepEqual(analysisNotice({ area, job: failed }), { key: "job-job-2", tone: "error", text: failed.message });
  // A job the server forgot (a restart) still says what to do.
  assert.equal(analysisNotice({ area, job: { id: "job-3", areaId: "area-k", status: "error", error: "The analysis was interrupted. Run it again." } }).text, "The analysis was interrupted. Run it again.");
  assert.equal(analysisNotice({ area, job: { ...stopped, status: "running" } }), null);
  assert.equal(analysisNotice({ area, job: { ...stopped, status: "done" } }), null);
  // Another area's job, or no area.
  assert.equal(analysisNotice({ area, job: { ...stopped, areaId: "area-other" } }), null);
  assert.equal(analysisNotice({ area: null, job: stopped }), null);
  // Atlas Settings says how its own re-runs ended: not the job's words there.
  assert.equal(analysisNotice({ area, job: stopped, followed: false }), null);
});

test("the last monthly update's failure shows until each month it left out has a run made after it", () => {
  const monthlyProblem = {
    jobId: "job-m",
    text: "The last monthly update could not analyze 1 month (September 2026): Earth Engine was too busy. The next monthly check tries it again within 6 hours; to redo it now, run the analysis again from Atlas Settings.",
    months: ["2026-09"],
    finishedAt: "2026-10-02T03:00:00.000Z",
  };
  const failedArea = { ...area, monthlyProblem };
  const older = [{ month: "2026-08", createdAt: "2026-09-02T03:00:00.000Z" }];
  assert.deepEqual(analysisNotice({ area: failedArea, runs: older }), { key: "monthly-job-m", tone: "error", text: monthlyProblem.text });
  assert.equal(analysisNotice({ area: failedArea, runs: older, followed: false }).text, monthlyProblem.text, "Atlas Settings shows it too");
  // A run of that month made before the failure (sample data Earth Engine
  // could not redo) does not fill it in; one made after does.
  assert.ok(analysisNotice({ area: failedArea, runs: [...older, { month: "2026-09", createdAt: "2026-09-30T00:00:00.000Z" }] }));
  assert.equal(analysisNotice({ area: failedArea, runs: [...older, { month: "2026-09", createdAt: "2026-10-02T09:00:00.000Z" }] }), null);
  // Months not known: shown until the server drops it.
  assert.ok(analysisNotice({ area: { ...area, monthlyProblem: { ...monthlyProblem, months: [], text: "The last monthly update stopped: Google rejected the key." } }, runs: older }));
  // One that stopped at once on a month with no run yet (its months come
  // from the months the job left without a run): gone once that month has
  // a run made after it.
  const stopped = { ...area, monthlyProblem: { ...monthlyProblem, months: ["2026-09"], text: "The last monthly update stopped: Google rejected the key." } };
  assert.equal(analysisNotice({ area: stopped, runs: older }).text, "The last monthly update stopped: Google rejected the key.");
  assert.equal(analysisNotice({ area: stopped, runs: [...older, { month: "2026-09", createdAt: "2026-10-02T09:00:00.000Z" }] }), null);
  // Not while an analysis of the area runs (its progress is on screen).
  assert.equal(analysisNotice({ area: failedArea, runs: older, job: { id: "job-p", areaId: "area-k", status: "running" } }), null);
  // The page followed the monthly job itself: the same words as a page
  // opened later (one wording on both paths), once the area says so; its
  // own words until then.
  const followedJob = { id: "job-m", areaId: "area-k", status: "error", message: "1 of 12 months could not be analyzed (September 2026): Earth Engine was too busy. Run the analysis again to fill it in." };
  assert.deepEqual(analysisNotice({ area: failedArea, runs: older, job: followedJob }), { key: "monthly-job-m", tone: "error", text: monthlyProblem.text });
  assert.equal(analysisNotice({ area, runs: older, job: followedJob }).text, followedJob.message);
  // A later job of another area does not hide it.
  assert.equal(analysisNotice({ area: failedArea, runs: older, job: { id: "job-x", areaId: "area-other", status: "running" } }).key, "monthly-job-m");
});

test("the saved areas in the line of analyses: analyzing, or waiting for their turn", async () => {
  const { lineMarks } = await import("./analysisNotice.js");
  const marks = lineMarks([
    { id: "j1", kind: "atlas", areaId: "area-a", status: "running", queued: false },
    { id: "j2", kind: "atlas", areaId: "area-b", status: "running", queued: true },
    // A person's request waiting behind the area's own monthly update.
    { id: "j3", kind: "atlas", areaId: "area-a", status: "running", queued: true },
    { id: "j4", kind: "atlas", areaId: "area-c", status: "done", queued: false },
    { id: "j5", kind: "field-analyze", status: "running" },
  ]);
  assert.deepEqual([...marks.entries()].sort(), [["area-a", "analyzing"], ["area-b", "waiting"]]);
  assert.equal(lineMarks(null).size, 0);
});
