// WHAT THIS FILE DOES
// Tests for server/scheduler.js: the monthly check starts an analysis
// when last month is missing, and also when last month was made from
// sample data but Earth Engine is now connected; it does so for every
// saved area, the current one first and then by name, one at a time
// (server/jobs.js), and a failed area does not stop the next. With the
// switch off it starts none; another server's lock stops it. And it
// visits every registered account's folder after the demo's, each with
// its own areas, farm, switch and lock. Run with "npm test".
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
const { checkNow, checkFieldsNow, holdKey, schedulerStatus } = await import("./scheduler.js");
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
  const key = holdKey("scheduler", process.env.CHERNOZEM_DATA_DIR);
  clearInterval(holds[key]?.timer);
  delete holds[key];
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

// ---------- Every folder: the demo's and each registered account's ----------

test("the monthly check visits the demo's folder and every account's folder, each with its own areas, switch, lock and result", async () => {
  const provider = heldProvider();
  await freshSetup(provider);
  const base = process.env.CHERNOZEM_DATA_DIR;
  const mine = store.userRoot("sched-account-1");
  const other = store.userRoot("sched-account-2");
  try {
    await store.saveArea(boxArea("area-demo", "Demo", 38));
    await store.updateWorkspace((ws) => {
      ws.currentAreaId = "area-demo";
      ws.schedule = { autoMonthly: true };
    });
    // The account's area has the demo's id (a country's id is the same
    // for everyone): separate all the same.
    await store.withDataRoot(mine, async () => {
      await store.saveArea(boxArea("area-demo", "Mine", 39));
      await store.updateWorkspace((ws) => {
        ws.schedule = { autoMonthly: true };
      });
    });
    // The other account switched the monthly check off.
    await store.withDataRoot(other, async () => {
      await store.saveArea(boxArea("area-other", "Other", 40));
      await store.updateWorkspace((ws) => {
        ws.schedule = { autoMonthly: false };
      });
    });

    const jobs = await checkNow();
    assert.deepEqual(jobs.map((job) => [job.areaId, job.areaName]), [["area-demo", "Demo"], ["area-demo", "Mine"]], "the demo's folder first, then the account's; the switched-off account is left alone");
    assert.notEqual(jobs[0].id, jobs[1].id);
    assert.match(schedulerState().lastResult, /^started 1 area: /);
    assert.match(schedulerState().roots[mine].lastResult, /^started 1 area: /);
    assert.equal(schedulerState().roots[other].lastResult, "nothing to do");
    // Each folder's own lock, and the status for the folder asking.
    assert.equal(fs.existsSync(path.join(base, "scheduler.lock")), true);
    assert.equal(fs.existsSync(path.join(mine, "scheduler.lock")), true);
    assert.equal(fs.existsSync(path.join(other, "scheduler.lock")), false);
    assert.match((await schedulerStatus()).lastResult, /^started 1 area/);
    const otherStatus = await store.withDataRoot(other, () => schedulerStatus());
    assert.equal(otherStatus.lastResult, "nothing to do");
    assert.equal(otherStatus.autoMonthly, false);
    // Each job is seen from its own folder only; the account's waits for
    // the demo's (one at a time), named as another workspace's.
    assert.equal(getJob(jobs[0].id).queued, false);
    assert.equal(getJob(jobs[1].id), null);
    const waiting = await store.withDataRoot(mine, () => getJob(jobs[1].id));
    assert.equal(waiting.queued, true);
    assert.equal(waiting.waiting, "Waiting for another workspace's analysis to finish");

    provider.open("area-demo");
    assert.equal((await waitFor(jobs[0].id)).status, "done");
    assert.equal((await store.withDataRoot(mine, () => waitFor(jobs[1].id))).status, "done");
    assert.equal((await store.listRuns("area-demo")).length, 12);
    assert.equal((await store.withDataRoot(mine, () => store.listRuns("area-demo"))).length, 12);
    assert.equal((await store.withDataRoot(other, () => store.listRuns("area-other"))).length, 0);
    assert.deepEqual(await checkNow(), [], "up to date everywhere");
  } finally {
    provider.open("area-demo");
    provider.open("area-other");
  }
});

test("the Field check visits the accounts' folders too", async () => {
  // The weather services are not called from the tests (offline at once).
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (/^https:\/\/(api|archive-api)\.open-meteo\.com\//.test(String(url))) throw new Error("offline in the tests");
    return realFetch(url, options);
  };
  const provider = heldProvider();
  await freshSetup(provider);
  const mine = store.userRoot("sched-field-1");
  const geometry = { type: "Polygon", coordinates: [[[37.5, 49.7], [37.506, 49.7], [37.506, 49.704], [37.5, 49.704], [37.5, 49.7]]] };
  const farm = {
    id: "farm-acc00001",
    name: "Account farm",
    location: null,
    boundary: null,
    fields: [{ id: "fld-acc00001", name: "Field 1", geometry, areaHa: 19, crop: "Corn", source: "drawn", createdAt: "2026-01-01" }],
    units: "ha",
    autoUpdate: true,
    demo: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  try {
    await store.withDataRoot(mine, () => store.saveFarm(farm));
    assert.equal(await store.getFarm(), null, "the demo has no farm");
    const job = await checkFieldsNow();
    assert.ok(job, "the account's farm is analysed");
    assert.equal(job.kind, "field-analyze");
    assert.equal(job.trigger, "auto");
    assert.equal(getJob(job.id), null, "the demo's folder does not see it");
    assert.equal((await store.withDataRoot(mine, () => waitFor(job.id))).status, "done");
    assert.ok(await store.withDataRoot(mine, () => store.getFieldAnalysis("fld-acc00001")));
    assert.equal(await store.getFieldAnalysis("fld-acc00001"), null, "nothing in the demo's folder");
    assert.equal(schedulerState().fieldsLastResult, "nothing to do");
    assert.match(schedulerState().roots[mine].fieldsLastResult, /^started /);
    assert.equal(fs.existsSync(path.join(mine, "field-scheduler.lock")), true);
    assert.equal(fs.existsSync(path.join(process.env.CHERNOZEM_DATA_DIR, "field-scheduler.lock")), false);
    await store.withDataRoot(mine, () => store.releaseLock("field-scheduler"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
