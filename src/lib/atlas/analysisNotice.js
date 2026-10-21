// WHAT THIS FILE DOES
// The short line the Atlas pages show when an analysis of the area did not
// end as asked, so a progress bar never just goes away without a word
// (found in review, 2026-10-20: after a Stop on the Overview, the Data page
// or the first-analysis screen the bar simply disappeared, and a monthly
// update that failed was shown on no page):
//
//   analysisNotice({ area, runs, job, followed })
//     -> { key, tone, text } or null
//        key   changes with what happened (a page can hide one it closed)
//        tone  "muted" for a person's own Stop, "error" when months are
//              missing
//        text  the job's own words: "Kharkiv oblast: stopped after 3 of 12
//              months. The months analyzed before are kept.", "1 of 12
//              months could not be analyzed (July 2026): ... Run the
//              analysis again to fill it in."; or the last monthly
//              update's (area.monthlyProblem, server/jobs.js
//              lastMonthlyProblem): "The last monthly update could not
//              analyze 1 month (September 2026): ... The next monthly check
//              tries it again within 6 hours; to redo it now, run the
//              analysis again from Atlas Settings." (also on a page that
//              followed that very job, so it reads the same everywhere)
//
//   area      the area on screen (with monthlyProblem from the server)
//   runs      its run summaries: the monthly update's line goes once each
//             month it left out has a run made after it
//   job       the analysis the page followed (useAtlasData().job): once it
//             has ended for this area, "cancelled" (a Stop) or "error"
//   followed  false: only the monthly update's line (Atlas Settings, which
//             says how its own re-runs ended)
//
// While an analysis of the area runs, nothing is said: its progress is on
// screen.
//
//   lineMarks(jobs)
//     -> Map areaId -> "analyzing" | "waiting": the saved areas in the line
//        of Atlas analyses (one area at a time, server/jobs.js), for the
//        marks on the saved-area rows of Atlas Settings
//
// WHO EDITS IT
// Whoever changes what the Atlas pages say after an analysis.

export function analysisNotice({ area, runs = [], job = null, followed = true } = {}) {
  if (!area?.id) return null;
  const ofArea = Boolean(job) && job.areaId === area.id;
  if (ofArea && job.status === "running") return null;
  const problem = area.monthlyProblem;
  if (followed && ofArea) {
    if (job.status === "cancelled") return { key: `job-${job.id}`, tone: "muted", text: job.message || "Stopped. The months analyzed before are kept." };
    // The monthly update the page followed says what a page opened later
    // says (below), not its own words.
    if (job.status === "error" && !(problem?.text && problem.jobId === job.id)) return { key: `job-${job.id}`, tone: "error", text: job.message || job.error || "The analysis stopped." };
  }
  if (!problem?.text) return null;
  // A month is filled in once it has a run made after the update failed.
  const after = String(problem.finishedAt || "");
  const filled = (month) => (runs || []).some((run) => run?.month === month && String(run.createdAt || "") > after);
  const months = Array.isArray(problem.months) ? problem.months : [];
  if (months.length && months.every(filled)) return null;
  return { key: `monthly-${problem.jobId || after}`, tone: "error", text: problem.text };
}

// The areas with an Atlas analysis running ("analyzing") or waiting for its
// turn ("waiting"), from a job list (GET /api/jobs). An area with both (a
// person's request waiting behind the area's monthly update) is
// "analyzing".
export function lineMarks(jobs) {
  const marks = new Map();
  for (const job of jobs || []) {
    if (job?.kind !== "atlas" || job.status !== "running" || !job.areaId) continue;
    if (!job.queued) marks.set(job.areaId, "analyzing");
    else if (!marks.has(job.areaId)) marks.set(job.areaId, "waiting");
  }
  return marks;
}
