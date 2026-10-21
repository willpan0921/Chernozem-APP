// WHAT THIS FILE DOES
// Smoke test of the whole API (server/app.js) on a real local port, with a
// temporary data folder and sample data. Run with "npm test".
//
// WHO EDITS IT
// Whoever adds or changes a route.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-api-"));
process.env.GEE_DISABLED = "1";
// Open mode for these tests, even when .env sets an access code.
process.env.ATLAS_ACCESS_CODE = "";
const { handleApi } = await import("./app.js");

let server;
let base;
before(async () => {
  server = http.createServer(async (req, res) => {
    if (!(await handleApi(req, res))) {
      res.statusCode = 404;
      res.end("not api");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, text };
}

async function waitForJob(id) {
  for (let i = 0; i < 200; i += 1) {
    const { json } = await call("GET", `/api/jobs/${id}`);
    if (json.job.status !== "running") return json.job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("job did not finish");
}

test("non-API addresses are left alone", async () => {
  const res = await call("GET", "/atlas");
  assert.equal(res.text, "not api");
});

test("status reports sample data and AI state", async () => {
  const { status, json } = await call("GET", "/api/status");
  assert.equal(status, 200);
  assert.equal(json.provider.id, "sample");
  assert.equal(typeof json.ai.configured, "boolean");
  assert.equal(typeof json.scheduler.autoMonthly, "boolean");
});

test("country search, create, analyze, runs and compare", async () => {
  const search = await call("GET", "/api/areas/search?q=ukr");
  const ukraine = search.json.results.find((r) => r.name === "Ukraine");
  assert.ok(ukraine);
  const created = await call("POST", "/api/areas", { source: "country", id: ukraine.id });
  assert.equal(created.status, 201);
  const area = created.json.area;
  assert.equal(area.kind, "country");
  assert.ok(area.geometry);
  const again = await call("POST", "/api/areas", { source: "country", id: ukraine.id });
  assert.equal(again.json.area.id, area.id, "the same country is not saved twice");

  const started = await call("POST", "/api/analyze", { areaId: area.id, months: 3 });
  assert.equal(started.status, 202);
  const job = await waitForJob(started.json.job.id);
  assert.equal(job.status, "done", job.error);
  assert.equal(job.runIds.length, 3);
  assert.match(job.message, /: 3 months analyzed$/);

  const runs = (await call("GET", `/api/runs?areaId=${area.id}`)).json.runs;
  assert.equal(runs.length, 3);
  assert.ok(runs[0].month > runs[1].month, "newest first");
  assert.equal(runs[0].cells, undefined);
  assert.ok(Number.isFinite(runs[0].newHeavyDamageHa));
  assert.equal(runs[2].newHeavyDamageHa, null);

  const run = (await call("GET", `/api/runs/${runs[0].id}`)).json.run;
  assert.ok(run.cells.length >= 150 && run.cells.length <= 1500);
  assert.ok(run.totals.croplandHa > 1e6);
  // The war is stored on the run (the Data page marks it).
  assert.deepEqual(run.conflict, { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });

  const cmp = (await call("GET", `/api/runs/compare?a=${runs[2].id}&b=${runs[0].id}`)).json;
  assert.ok(cmp.changedCells.length > 0);
  assert.notEqual(cmp.deltas.heavyDamageHa, 0);

  const reanalyze = await call("POST", "/api/analyze", { areaId: area.id, months: 3 });
  const skipped = await waitForJob(reanalyze.json.job.id);
  assert.deepEqual([...skipped.runIds].sort(), runs.map((r) => r.id).sort(), "existing months are kept");
});

test("a country at peace: no war on the run, fully safe everywhere", async () => {
  const poland = (await call("GET", "/api/areas/search?q=pol")).json.results.find((r) => r.name === "Poland");
  const area = (await call("POST", "/api/areas", { source: "country", id: poland.id })).json.area;
  const started = await call("POST", "/api/analyze", { areaId: area.id, months: 1 });
  const job = await waitForJob(started.json.job.id);
  assert.equal(job.status, "done", job.error);
  const run = (await call("GET", `/api/runs/${job.runIds[0]}`)).json.run;
  assert.equal(run.conflict, null);
  assert.ok(run.cells.every((cell) => cell.distance === 1));
  assert.equal(run.totals.heavyDamageHa, 0);
  assert.ok(run.checks.warnings.some((w) => /No war in the app's list covers this area/.test(w) && /does not mean the land is safe/.test(w)));
});

test("coordinates and bbox areas, with validation", async () => {
  const ok = await call("POST", "/api/areas", {
    source: "coordinates",
    name: "My farm",
    points: [[49.74, 37.54], [49.74, 37.55], [49.7464, 37.55], [49.7464, 37.54]],
  });
  assert.equal(ok.status, 201, ok.text);
  assert.ok(ok.json.area.areaHa > 40 && ok.json.area.areaHa < 60);
  const box = await call("POST", "/api/areas", { source: "bbox", name: "Box", north: 50, south: 49.9, east: 30.1, west: 30 });
  assert.equal(box.status, 201);
  for (const body of [
    { source: "coordinates", points: [[49, 37], [49.1, 37]] },
    { source: "coordinates", points: [[95, 37], [49.1, 37], [49, 37.1]] },
    { source: "coordinates", points: [[49, 37], [49.000001, 37], [49, 37.000001]] },
    { source: "bbox", north: 40, south: 50, east: 30, west: 20 },
    { source: "bbox", north: 60, south: -60, east: 170, west: -170 },
    { source: "country", id: "999999" },
    { source: "nope" },
  ]) {
    const res = await call("POST", "/api/areas", body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.json.error.message);
  }
  const list = (await call("GET", "/api/areas")).json.areas;
  assert.ok(list.length >= 2);
  assert.equal(list[0].geometry, undefined);
});

test("areas can be renamed and removed (with their runs)", async () => {
  const made = await call("POST", "/api/areas", { source: "bbox", name: "Old name", north: 48.1, south: 48.0, east: 1.7, west: 1.6 });
  assert.equal(made.status, 201, made.text);
  const id = made.json.area.id;

  const renamed = await call("PATCH", `/api/areas/${id}`, { name: "  Beauce   test  " });
  assert.equal(renamed.status, 200, renamed.text);
  assert.equal(renamed.json.area.name, "Beauce test");
  assert.equal((await call("PATCH", `/api/areas/${id}`, { name: "   " })).status, 400);
  assert.equal((await call("PATCH", "/api/areas/area-missing", { name: "x" })).status, 404);

  // Analyze one month, make it the current area, then remove it.
  const job = (await call("POST", "/api/analyze", { areaId: id, months: 1 })).json.job;
  assert.equal((await waitForJob(job.id)).status, "done");
  assert.equal((await call("GET", `/api/runs?areaId=${id}`)).json.runs.length, 1);
  await call("PATCH", "/api/workspace", { currentAreaId: id });

  const removed = await call("DELETE", `/api/areas/${id}`);
  assert.equal(removed.status, 200, removed.text);
  assert.equal(removed.json.removedRuns, 1);
  assert.equal((await call("GET", `/api/areas/${id}`)).status, 404);
  assert.equal((await call("GET", `/api/runs?areaId=${id}`)).json.runs.length, 0);
  assert.equal((await call("GET", "/api/workspace")).json.workspace.currentAreaId, null);
  assert.equal((await call("DELETE", `/api/areas/${id}`)).status, 404);
});

test("an area's war setting: checked (400 with a clear message), saved, shown with what the app's list says, and followed by the next analysis", async () => {
  // Story County, Iowa: no war in the app's list.
  const made = await call("POST", "/api/areas", { source: "bbox", name: "War test", north: 42.05, south: 42.0, east: -93.6, west: -93.65 });
  assert.equal(made.status, 201, made.text);
  const id = made.json.area.id;
  assert.equal(made.json.area.listConflict, null, "the app's list: no war here");
  assert.equal(made.json.area.war, undefined, "the app's list is the default");

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const [war, message] of [
    [{ mode: "war", since: "2021-12-31" }, /1 January 2022 or later/],
    [{ mode: "war", since: tomorrow }, /cannot be after today/],
    [{ mode: "war", since: "2023-02-30" }, /YYYY-MM-DD/],
    [{ mode: "war" }, /YYYY-MM-DD/],
    [{ mode: "war", since: "2023-08-01", name: "x".repeat(81) }, /at most 80 characters/],
    [{ mode: "sometimes" }, /must be "list" \(the app's list\), "war" \(at war from a day\) or "peace" \(not at war\)/],
    ["war", /Send the war setting as/],
    [null, /Send the war setting as/],
  ]) {
    const res = await call("PATCH", `/api/areas/${id}`, { war });
    assert.equal(res.status, 400, JSON.stringify(war));
    assert.equal(res.json.error.code, "bad_war_setting");
    assert.match(res.json.error.message, message);
  }
  assert.equal((await call("PATCH", `/api/areas/${id}`, [1])).status, 400);
  assert.equal((await call("PATCH", "/api/areas/area-missing", { war: { mode: "peace" } })).status, 404);
  assert.equal((await call("GET", `/api/areas/${id}`)).json.area.war, undefined, "nothing saved by a bad request");

  const set = await call("PATCH", `/api/areas/${id}`, { war: { mode: "war", since: "2023-08-01", name: "  Fighting   in the county " } });
  assert.equal(set.status, 200, set.text);
  assert.equal(set.json.area.name, "War test", "the name is kept");
  assert.equal(set.json.area.war.mode, "war");
  assert.equal(set.json.area.war.since, "2023-08-01");
  assert.equal(set.json.area.war.name, "Fighting in the county");
  assert.ok(set.json.area.war.setAt);
  assert.equal(set.json.area.listConflict, null);

  // The next analysis counts damage from the team's day.
  const job = await waitForJob((await call("POST", "/api/analyze", { areaId: id, months: 1 })).json.job.id);
  assert.equal(job.status, "done", job.error);
  const run = (await call("GET", `/api/runs/${job.runIds[0]}`)).json.run;
  assert.deepEqual(run.conflict, { id: `area-${id}`, name: "Fighting in the county", since: "2023-08-01", source: "area" });
  assert.equal(run.conflictSource, "area");

  // Not at war, then back to the app's list; a rename and a war setting can come together.
  const calm = await call("PATCH", `/api/areas/${id}`, { name: "Story County", war: { mode: "peace", since: "2023-08-01" } });
  assert.equal(calm.status, 200, calm.text);
  assert.equal(calm.json.area.name, "Story County");
  assert.equal(calm.json.area.war.mode, "peace");
  assert.equal(calm.json.area.war.since, undefined);
  const redone = await waitForJob((await call("POST", "/api/analyze", { areaId: id, months: 1, rerun: true })).json.job.id);
  const calmRun = (await call("GET", `/api/runs/${redone.runIds[0]}`)).json.run;
  assert.equal(calmRun.conflict, null);
  assert.equal(calmRun.conflictSource, "area");
  assert.ok(calmRun.checks.warnings.some((w) => /^Your team marked this area as not at war/.test(w)));
  const back = await call("PATCH", `/api/areas/${id}`, { war: { mode: "list" } });
  assert.equal(back.status, 200);
  assert.equal(back.json.area.war, undefined);
  assert.equal((await call("GET", "/api/areas")).json.areas.find((item) => item.id === id).war, undefined);

  // A box in Ukraine: the app's list has its war.
  const kyiv = (await call("POST", "/api/areas", { source: "bbox", name: "Kyiv box", north: 50.5, south: 50.45, east: 30.55, west: 30.5 })).json.area;
  assert.deepEqual(kyiv.listConflict, { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
});

test("one area at a time: another area's analysis waits for the one running and can be cancelled; the one running can be stopped; removing an area takes its waiting analysis out of line", async () => {
  const { sampleProvider } = await import("./providers/sample.js");
  const analyze = sampleProvider.analyze;
  let open;
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const made = async (name, west) => (await call("POST", "/api/areas", { source: "bbox", name, north: 48.05, south: 48.0, east: west + 0.05, west })).json.area;
  const first = await made("Line first", 2.0);
  const second = await made("Line second", 2.1);
  const thirdArea = await made("Line third", 2.2);
  sampleProvider.analyze = async (input) => {
    if (input.area.id === first.id) await gate;
    return analyze(input);
  };
  try {
    const running = (await call("POST", "/api/analyze", { areaId: first.id, months: 1 })).json.job;
    assert.equal(running.queued, false);
    const waits = await call("POST", "/api/analyze", { areaId: second.id, months: 1 });
    assert.equal(waits.status, 202);
    assert.equal(waits.json.job.status, "running");
    assert.equal(waits.json.job.queued, true);
    assert.equal(waits.json.job.waiting, "Waiting for Line first's analysis to finish");
    const status = (await call("GET", "/api/status")).json;
    assert.deepEqual(status.jobs.filter((job) => [first.id, second.id].includes(job.areaId)).map((job) => job.areaId), [first.id, second.id]);

    // Cancel a job that waits: it is taken out of line.
    const cancelled = await call("POST", `/api/jobs/${waits.json.job.id}/cancel`);
    assert.equal(cancelled.status, 200, cancelled.text);
    assert.equal(cancelled.json.job.status, "cancelled");
    assert.equal(cancelled.json.job.message, "Line second: cancelled before it started");
    assert.equal((await call("POST", `/api/jobs/${waits.json.job.id}/cancel`)).json.job.status, "cancelled", "asking again gives it back as it is");
    assert.equal((await call("POST", "/api/jobs/job-missing/cancel")).status, 404);
    assert.equal((await call("GET", `/api/jobs/${running.id}/cancel`)).status, 404);

    // Removing an area whose analysis waits takes it out of line; one that
    // is being analyzed cannot be removed until its analysis is stopped.
    const third = (await call("POST", "/api/analyze", { areaId: thirdArea.id, months: 1 })).json.job;
    assert.equal(third.queued, true);
    const removed = await call("DELETE", `/api/areas/${thirdArea.id}`);
    assert.equal(removed.status, 200, removed.text);
    assert.equal((await call("GET", `/api/jobs/${third.id}`)).json.job.status, "cancelled");
    const busy = await call("DELETE", `/api/areas/${first.id}`);
    assert.equal(busy.status, 409);
    assert.equal(busy.json.error.code, "busy");
    // A saved area that is not open shows no progress bar: open it first.
    assert.equal(busy.json.error.message, "Line first is being analyzed right now. Open it and press Stop under its progress bar, then open another area and remove it from Saved areas.");

    // The analysis running is stopped (its month never answers here: the
    // job does not wait for it). Then the area can be removed.
    const stopped = await call("POST", `/api/jobs/${running.id}/cancel`);
    assert.equal(stopped.status, 200, stopped.text);
    assert.equal(stopped.json.job.stopping, true);
    const ended = await waitForJob(running.id);
    assert.equal(ended.status, "cancelled");
    assert.equal(ended.message, "Line first: stopped before its first month was done.");
    assert.equal((await call("GET", `/api/runs?areaId=${first.id}`)).json.runs.length, 0);
    const gone = await call("DELETE", `/api/areas/${first.id}`);
    assert.equal(gone.status, 200, gone.text);
    assert.equal((await call("GET", `/api/runs?areaId=${second.id}`)).json.runs.length, 0, "the cancelled analysis never ran");
  } finally {
    open();
    sampleProvider.analyze = analyze;
  }
});

test("removing an area whose analysis is stopping says to wait a moment; the cancel route refuses a Field job (400)", async () => {
  const area = (await call("POST", "/api/areas", { source: "bbox", name: "Stopping area", north: 48.25, south: 48.2, east: 2.55, west: 2.5 })).json.area;
  // An analysis between its Stop and its end (jobs.js cancelAnalysis: the
  // month in progress is being given up).
  const jobsMap = globalThis.__chernozemJobs;
  const stopping = { id: "job-api-stopping", kind: "atlas", areaId: area.id, areaName: area.name, status: "running", queued: false, stopping: true, done: 0, total: 1, message: "Stopping area: stopping…", runIds: [], startedAt: new Date().toISOString(), finishedAt: null };
  jobsMap.set(stopping.id, stopping);
  try {
    const res = await call("DELETE", `/api/areas/${area.id}`);
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, "busy");
    assert.equal(res.json.error.message, "Stopping area's analysis is stopping. Remove the area in a moment, once it has stopped.");
  } finally {
    jobsMap.delete(stopping.id);
  }
  assert.equal((await call("DELETE", `/api/areas/${area.id}`)).status, 200, "once it has stopped");

  // A Field job is not stopped here.
  const { startJob } = await import("./jobs.js");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const field = startJob({ kind: "field-analyze", key: "api-cancel-test", run: () => gate });
  try {
    const res = await call("POST", `/api/jobs/${field.id}/cancel`);
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, "bad_request");
    assert.equal(res.json.error.message, "Only an Atlas analysis can be cancelled here.");
    assert.equal((await call("GET", `/api/jobs/${field.id}`)).json.job.status, "running", "nothing was cancelled");
  } finally {
    release();
  }
});

test("an area whose last monthly update went wrong says so (monthlyProblem) until an analysis of it ends well", async () => {
  const { startAnalysis } = await import("./jobs.js");
  const { sampleProvider } = await import("./providers/sample.js");
  const area = (await call("POST", "/api/areas", { source: "bbox", name: "Monthly trouble", north: 48.35, south: 48.3, east: 2.65, west: 2.6 })).json.area;
  assert.equal(area.monthlyProblem, undefined);
  const analyze = sampleProvider.analyze;
  sampleProvider.analyze = () => Promise.reject(Object.assign(new Error("Earth Engine was too busy."), { code: "busy" }));
  const [warn, errorLog] = [console.warn, console.error];
  console.warn = () => {};
  console.error = () => {};
  try {
    const monthly = await waitForJob((await startAnalysis({ areaId: area.id, months: 1, trigger: "monthly" })).id);
    assert.equal(monthly.status, "error");
    const problem = (await call("GET", `/api/areas/${area.id}`)).json.area.monthlyProblem;
    assert.equal(problem.jobId, monthly.id);
    assert.match(problem.text, /^The last monthly update could not analyze 1 month \(.+\): Earth Engine was too busy\. The next monthly check tries it again within 6 hours; to redo it now, run the analysis again from Atlas Settings\.$/);
    assert.equal(problem.months.length, 1);
  } finally {
    console.warn = warn;
    console.error = errorLog;
    sampleProvider.analyze = analyze;
  }
  assert.equal((await waitForJob((await call("POST", "/api/analyze", { areaId: area.id, months: 1 })).json.job.id)).status, "done");
  assert.equal((await call("GET", `/api/areas/${area.id}`)).json.area.monthlyProblem, undefined);
});

test("workspace settings are cleaned", async () => {
  const res = await call("PATCH", "/api/workspace", { settings: { weights: { soil: -5, damage: 300, access: 100 }, gatePercentile: 99 } });
  assert.equal(res.status, 200);
  const { weights, gatePercentile } = res.json.workspace.settings;
  assert.equal(weights.soil + weights.damage + weights.access, 100);
  assert.equal(weights.soil, 0);
  assert.equal(gatePercentile, 60);
  assert.equal((await call("PATCH", "/api/workspace", { currentAreaId: "area-missing" })).status, 400);
  assert.equal((await call("PATCH", "/api/workspace", { budgetUsd: -1 })).status, 400);
  const steps = await call("PATCH", "/api/workspace", { doneSteps: ["a", "a", "b"], schedule: { autoMonthly: false } });
  assert.deepEqual(steps.json.workspace.doneSteps, ["a", "b"]);
  assert.equal(steps.json.workspace.schedule.autoMonthly, false);
});

test("team: add, change role, remove, last admin stays", async () => {
  // A new workspace has no team; the first person added is its admin.
  let ws = (await call("GET", "/api/workspace")).json.workspace;
  if (!ws.team.length) {
    const first = await call("POST", "/api/team", { name: "Olena P.", email: "", role: "viewer" });
    assert.equal(first.json.member.role, "admin");
    ws = (await call("GET", "/api/workspace")).json.workspace;
  }
  const admin = ws.team.find((m) => m.role === "admin");
  const added = await call("POST", "/api/team", { name: "Ivan K.", email: "ivan@example.org", role: "viewer" });
  assert.equal(added.status, 201);
  const id = added.json.member.id;
  assert.equal((await call("POST", "/api/team", { name: "", email: "" })).status, 400);
  assert.equal((await call("POST", "/api/team", { name: "X", email: "not-an-email" })).status, 400);
  assert.equal((await call("PATCH", `/api/team/${id}`, { role: "analyst" })).json.member.role, "analyst");
  assert.equal((await call("PATCH", `/api/team/${id}`, { role: "boss" })).status, 400);
  assert.equal((await call("DELETE", `/api/team/${admin.id}`)).status, 400, "last admin");
  assert.equal((await call("PATCH", `/api/team/${admin.id}`, { role: "viewer" })).status, 400, "last admin demoted");
  assert.equal((await call("DELETE", `/api/team/${id}`)).status, 200);
  assert.equal((await call("DELETE", `/api/team/${id}`)).status, 404);
});

test("errors are JSON", async () => {
  assert.equal((await call("GET", "/api/nope")).json.error.code, "not_found");
  assert.equal((await call("GET", "/api/runs/run-missing")).status, 404);
  assert.equal((await call("GET", "/api/areas/..%2F..%2Fetc")).status, 404);
  assert.equal((await call("DELETE", "/api/workspace")).status, 405);
  const badJson = await fetch(`${base}/api/team`, { method: "POST", body: "{nope" });
  assert.equal(badJson.status, 400);
});

test("contract edges: other areas, arrays, extra path parts, body size, status ok", async () => {
  // Two months from different areas cannot be compared.
  const box = (await call("POST", "/api/areas", { source: "bbox", name: "Small box", north: 50.05, south: 50, east: 30.05, west: 30 })).json.area;
  const job = await waitForJob((await call("POST", "/api/analyze", { areaId: box.id, months: 1 })).json.job.id);
  assert.equal(job.status, "done", job.error);
  assert.equal(job.message, "Small box: 1 month analyzed");
  const all = (await call("GET", "/api/runs")).json.runs;
  const other = all.find((run) => run.areaId !== box.id);
  const mixed = await call("GET", `/api/runs/compare?a=${other.id}&b=${job.runIds[0]}`);
  assert.equal(mixed.status, 400);
  assert.equal(mixed.json.error.code, "different_areas");

  // Settings and schedule must be objects, not lists.
  assert.equal((await call("PATCH", "/api/workspace", { settings: [1] })).status, 400);
  assert.equal((await call("PATCH", "/api/workspace", { schedule: [true] })).status, 400);

  // Extra parts on a known route are "not found"; a wrong method is 405.
  assert.equal((await call("GET", "/api/areas/x/y")).status, 404);
  assert.equal((await call("GET", "/api/status/x")).status, 404);
  assert.equal((await call("DELETE", "/api/runs")).status, 405);

  // Bodies over 1 MB are refused.
  const big = await call("PATCH", "/api/workspace", { name: "x".repeat(1.5 * 1024 * 1024) });
  assert.equal(big.status, 413);
  assert.equal((await call("PATCH", "/api/workspace", { name: "x".repeat(200 * 1024) })).status, 200);

  // Sample data on purpose (GEE_DISABLED=1) is not a failure.
  const status = (await call("GET", "/api/status")).json;
  assert.equal(status.provider.ok, true);
  assert.equal(status.provider.connecting, false);
});

test("server errors do not reveal file paths", async () => {
  // Make the workspace file unreadable as JSON: reading it fails with a
  // SyntaxError, which is not a message for people.
  const file = path.join(process.env.CHERNOZEM_DATA_DIR, "workspace.json");
  const saved = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, "{broken");
  const original = console.error;
  console.error = () => {};
  try {
    const res = await call("GET", "/api/workspace");
    assert.equal(res.status, 500);
    assert.equal(res.json.error.code, "server_error");
    assert.doesNotMatch(res.json.error.message, /workspace\.json|\/|JSON/);
  } finally {
    console.error = original;
    fs.writeFileSync(file, saved);
  }
});
