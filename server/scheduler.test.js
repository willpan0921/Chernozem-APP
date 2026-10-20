// WHAT THIS FILE DOES
// Tests for server/scheduler.js: the monthly check starts an analysis
// when last month is missing, and also when last month was made from
// sample data but Earth Engine is now connected; it does so for every
// saved area, the current one first and then by name, one at a time
// (server/jobs.js), and a failed area does not stop the next. With the
// switch off it starts none; another server's lock stops it. Run with
// "npm test".
//
// WHO EDITS IT
// Whoever changes scheduler.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-scheduler-"));
process.env.CHERNOZEM_DATA_DIR = dir;
process.env.GEE_DISABLED = "1";
const store = await import("./store.js");
const { checkNow } = await import("./scheduler.js");
const { getJob, listJobs } = await import("./jobs.js");
const { getProvider } = await import("./providers/index.js");
const { planGrid } = await import("./geo.js");
const { latestCompleteMonth } = await import("./runs.js");

const geometry = { type: "Polygon", coordinates: [[[30, 50], [30.05, 50], [30.05, 50.05], [30, 50.05], [30, 50]]] };
const grid = planGrid(geometry);
const area = { id: "area-sched", name: "Sched", kind: "custom", source: "bbox", geometry, bbox: grid.bbox, areaHa: grid.areaHa, createdAt: "2026-01-01" };

async function waitFor(jobId) {
  for (let i = 0; i < 400; i += 1) {
    const job = getJob(jobId);
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

test("sample months are redone once Earth Engine is connected", async () => {
  await store.saveArea(area);
  await store.updateWorkspace((ws) => {
    ws.currentAreaId = area.id;
    ws.schedule = { autoMonthly: true };
  });

  // Sample data: the first check analyzes, the second finds it up to date.
  const [first, ...more] = await checkNow();
  assert.ok(first, "a missing month starts an analysis");
  assert.deepEqual(more, [], "one saved area, one analysis");
  assert.equal(first.areaId, area.id);
  assert.equal(first.trigger, "monthly");
  assert.equal((await waitFor(first.id)).status, "done");
  const month = latestCompleteMonth();
  const before = (await store.listRuns(area.id)).find((run) => run.month === month);
  assert.equal(before.provider, "sample");
  assert.deepEqual(await checkNow(), [], "up to date on sample data");
  assert.equal(fs.existsSync(path.join(dir, "scheduler.lock")), true, "lock held until the job is seen as done");

  // Pretend Earth Engine is connected: the cached choice becomes a stand-in.
  await getProvider();
  const fakeGee = {
    id: "gee",
    label: "Earth Engine",
    async status() {
      return { ok: true };
    },
    async analyze({ cells }) {
      const readings = cells.map((cell) => ({ id: cell.id, chernozem: 0.9, croplandShare: 0.5, firesPer100Km2: 1, chiDrop: 0.1, conflictKm: 50, popPerKm2: 20, lights: 1, heavyShare: 0.2, population: 10 }));
      return { readings, alerts: [], warnings: [], baseline: { from: 2021, to: 2021, label: "2021 (same months)" } };
    },
  };
  globalThis.__chernozemProvider.provider = fakeGee;
  // Another server's lock would block it; ours (stale or not) does not.
  const [second] = await checkNow();
  assert.ok(second, "a sample month counts as missing once Earth Engine is connected");
  assert.equal((await waitFor(second.id)).status, "done");
  const after = (await store.listRuns(area.id)).find((run) => run.month === month);
  assert.equal(after.provider, "gee");
  assert.equal(after.id, before.id, "the month keeps its id");
  assert.deepEqual(after.baseline, { from: 2021, to: 2021, label: "2021 (same months)" });
  assert.deepEqual(await checkNow(), [], "up to date on Earth Engine data");
});

test("another server's lock stops the check", async () => {
  await store.updateWorkspace((ws) => {
    ws.currentAreaId = area.id;
  });
  // Make last month missing again and let another live program hold the lock.
  for (const run of await store.listRuns(area.id)) await store.deleteRun(run.id);
  fs.writeFileSync(path.join(dir, "scheduler.lock"), JSON.stringify({ pid: process.ppid, at: new Date().toISOString() }));
  const running = listJobs({ status: "running" }).length;
  assert.deepEqual(await checkNow(), []);
  assert.equal(listJobs({ status: "running" }).length, running, "nothing was started");
  assert.equal(schedulerState().lastResult, "another server is analyzing");
});

// ---------- Every saved area ----------

// A data source whose analyses wait until a test lets each area go
// (open(areaId)), so the tests can see who runs and who waits. It writes
// down the order the areas were analyzed in and the most analyses that ever
// ran at once; failOn makes an area's analysis fail with a key problem
// (which stops that area's job at once).
function heldProvider({ failOn = [] } = {}) {
  const order = [];
  const gates = new Map();
  let active = 0;
  const held = {
    id: "gee",
    label: "Earth Engine (test)",
    peak: 0,
    order,
    async status() {
      return { ok: true };
    },
    open(areaId) {
      gate(areaId).open();
    },
    async analyze({ area, cells }) {
      if (!order.includes(area.id)) order.push(area.id);
      active += 1;
      held.peak = Math.max(held.peak, active);
      try {
        await gate(area.id).promise;
        if (failOn.includes(area.id)) throw Object.assign(new Error("Google rejected the key."), { code: "bad_key" });
        const readings = cells.map((cell) => ({ id: cell.id, chernozem: 0.9, croplandShare: 0.5, firesPer100Km2: 1, chiDrop: 0.1, conflictKm: 50, popPerKm2: 20, lights: 1, heavyShare: 0.2, population: 10 }));
        return { readings, alerts: [], warnings: [] };
      } finally {
        active -= 1;
      }
    },
  };
  function gate(areaId) {
    if (!gates.has(areaId)) {
      let open;
      const promise = new Promise((resolve) => {
        open = resolve;
      });
      gates.set(areaId, { promise, open });
    }
    return gates.get(areaId);
  }
  return held;
}

// A fresh data folder for one test, and the data source it uses.
async function freshSetup(provider) {
  process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-scheduler-all-"));
  await getProvider();
  globalThis.__chernozemProvider.provider = provider;
}

const boxArea = (id, name, west) => {
  const geometry = { type: "Polygon", coordinates: [[[west, 50], [west + 0.05, 50], [west + 0.05, 50.05], [west, 50.05], [west, 50]]] };
  const grid = planGrid(geometry);
  return { id, name, kind: "custom", source: "bbox", geometry, bbox: grid.bbox, areaHa: grid.areaHa, createdAt: "2026-01-01" };
};

const schedulerState = () => globalThis.__chernozemScheduler;

test("the monthly check starts every saved area that misses last month: the current one first, then by name, one at a time; a failed one does not stop the next", async () => {
  const provider = heldProvider({ failOn: ["area-alpha"] });
  await freshSetup(provider);
  try {
    const charlie = boxArea("area-charlie", "Charlie", 30);
    const alpha = boxArea("area-alpha", "alpha", 31);
    const bravo = boxArea("area-bravo", "Bravo", 32);
    const delta = boxArea("area-delta", "Delta", 33);
    for (const item of [bravo, delta, alpha, charlie]) await store.saveArea(item);
    // Delta already has last month (from Earth Engine): it is up to date.
    const month = latestCompleteMonth();
    await store.saveRun({ id: "run-delta", areaId: delta.id, areaName: delta.name, month, label: month, provider: "gee", createdAt: "2026-10-01T00:00:00Z", totals: {}, cells: [], alerts: [] });
    await store.updateWorkspace((ws) => {
      ws.currentAreaId = charlie.id;
      ws.schedule = { autoMonthly: true };
    });

    const jobs = await checkNow();
    // The current area first, then the others by name (case aside); Delta
    // is up to date and not started.
    assert.deepEqual(jobs.map((job) => job.areaId), [charlie.id, alpha.id, bravo.id]);
    assert.ok(jobs.every((job) => job.trigger === "monthly" && job.status === "running" && job.total === 12));
    assert.match(schedulerState().lastResult, /^started 3 areas: /);
    // One at a time: Charlie is analyzed, the others wait their turn.
    const now = () => jobs.map((job) => getJob(job.id));
    assert.deepEqual(now().map((job) => job.queued), [false, true, true]);
    assert.equal(now()[1].waiting, "Waiting for Charlie's analysis to finish");
    assert.equal(now()[2].waiting, "Waiting for Charlie's analysis and 1 other to finish");
    assert.equal(now()[2].message, "Bravo: waiting for Charlie's analysis and 1 other to finish");
    assert.deepEqual(listJobs({ status: "running" }).map((job) => job.areaId), [charlie.id, alpha.id, bravo.id], "the line in order");
    // A second check meanwhile joins the same jobs; nothing starts twice.
    assert.deepEqual((await checkNow()).map((job) => job.id), jobs.map((job) => job.id));
    assert.equal(fs.existsSync(path.join(process.env.CHERNOZEM_DATA_DIR, "scheduler.lock")), true, "the lock is held while they run or wait");

    provider.open(charlie.id);
    assert.equal((await waitFor(jobs[0].id)).status, "done");
    // Alpha's turn: it fails at once (a key problem stops its job).
    provider.open(alpha.id);
    const failed = await waitFor(jobs[1].id);
    assert.equal(failed.status, "error");
    assert.match(failed.message, /^Analysis stopped: Google rejected the key/);
    // Bravo still goes.
    assert.equal(getJob(jobs[2].id).queued, false, "the next area started after the failed one");
    provider.open(bravo.id);
    assert.equal((await waitFor(jobs[2].id)).status, "done");
    assert.deepEqual(provider.order, [charlie.id, alpha.id, bravo.id]);
    assert.equal(provider.peak, 1, "never two analyses at once");
    assert.equal((await store.listRuns(bravo.id)).length, 12);
    assert.equal((await store.listRuns(delta.id)).length, 1, "the up-to-date area was left alone");
  } finally {
    for (const id of ["area-charlie", "area-alpha", "area-bravo"]) provider.open(id);
  }
});

test("with the switch off the monthly check starts nothing, for any area", async () => {
  const provider = heldProvider();
  await freshSetup(provider);
  try {
    await store.saveArea(boxArea("area-echo", "Echo", 34));
    await store.saveArea(boxArea("area-foxtrot", "Foxtrot", 35));
    await store.updateWorkspace((ws) => {
      ws.currentAreaId = "area-echo";
      ws.schedule = { autoMonthly: false };
    });
    const running = listJobs({ status: "running" }).length;
    assert.deepEqual(await checkNow(), []);
    assert.equal(schedulerState().lastResult, "nothing to do");
    assert.equal(listJobs({ status: "running" }).length, running);
    assert.deepEqual(provider.order, []);
    // Switched on, both go (the current one first).
    await store.updateWorkspace((ws) => {
      ws.schedule = { autoMonthly: true };
    });
    const jobs = await checkNow();
    assert.deepEqual(jobs.map((job) => job.areaId), ["area-echo", "area-foxtrot"]);
    provider.open("area-echo");
    provider.open("area-foxtrot");
    for (const job of jobs) assert.equal((await waitFor(job.id)).status, "done");
  } finally {
    provider.open("area-echo");
    provider.open("area-foxtrot");
  }
});

test("the lock is held until every job of every check has ended, also when a check comes while the jobs of the one before still run", async (t) => {
  const provider = heldProvider();
  await freshSetup(provider);
  // A fresh hold, renewed on a clock the test moves (every 30 s).
  const holds = schedulerState().holds;
  clearInterval(holds.scheduler?.timer);
  delete holds.scheduler;
  t.mock.timers.enable({ apis: ["setInterval"] });
  const settled = () => new Promise((resolve) => setTimeout(resolve, 100));
  try {
    const lock = path.join(process.env.CHERNOZEM_DATA_DIR, "scheduler.lock");
    await store.saveArea(boxArea("area-golf", "Golf", 36));
    await store.updateWorkspace((ws) => {
      ws.currentAreaId = "area-golf";
      ws.schedule = { autoMonthly: true };
    });
    const [golf] = await checkNow();
    // Ten seconds later a new area is saved, and the next check starts it
    // while Golf runs.
    t.mock.timers.tick(10 * 1000);
    await store.saveArea(boxArea("area-hotel", "Hotel", 37));
    const later = await checkNow();
    const hotel = later.find((job) => job.areaId === "area-hotel");
    assert.ok(hotel, "the later check started the new area");
    assert.ok(later.some((job) => job.id === golf.id), "and joined the one still running");

    // Golf ends while Hotel waits. When the first check's renewal comes
    // (30 s after it), the lock stays: one timer per check freed it here.
    provider.open("area-golf");
    assert.equal((await waitFor(golf.id)).status, "done");
    t.mock.timers.tick(20 * 1000);
    await settled();
    assert.equal(fs.existsSync(lock), true, "still held while Hotel runs");

    // Hotel ends: the lock is freed.
    provider.open("area-hotel");
    assert.equal((await waitFor(hotel.id)).status, "done");
    t.mock.timers.tick(30 * 1000);
    await settled();
    assert.equal(fs.existsSync(lock), false);
  } finally {
    provider.open("area-golf");
    provider.open("area-hotel");
    t.mock.timers.reset();
  }
});
