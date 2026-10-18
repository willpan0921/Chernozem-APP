// WHAT THIS FILE DOES
// Tests for server/scheduler.js: the monthly check starts an analysis
// when last month is missing, and also when last month was made from
// sample data but Earth Engine is now connected. Run with "npm test".
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
const { getJob } = await import("./jobs.js");
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
  const first = await checkNow();
  assert.ok(first, "a missing month starts an analysis");
  assert.equal((await waitFor(first.id)).status, "done");
  const month = latestCompleteMonth();
  const before = (await store.listRuns(area.id)).find((run) => run.month === month);
  assert.equal(before.provider, "sample");
  assert.equal(await checkNow(), null, "up to date on sample data");
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
  const second = await checkNow();
  assert.ok(second, "a sample month counts as missing once Earth Engine is connected");
  assert.equal((await waitFor(second.id)).status, "done");
  const after = (await store.listRuns(area.id)).find((run) => run.month === month);
  assert.equal(after.provider, "gee");
  assert.equal(after.id, before.id, "the month keeps its id");
  assert.deepEqual(after.baseline, { from: 2021, to: 2021, label: "2021 (same months)" });
  assert.equal(await checkNow(), null, "up to date on Earth Engine data");
});

test("another server's lock stops the check", async () => {
  await store.updateWorkspace((ws) => {
    ws.currentAreaId = area.id;
  });
  // Make last month missing again and let another live program hold the lock.
  for (const run of await store.listRuns(area.id)) await store.deleteRun(run.id);
  fs.writeFileSync(path.join(dir, "scheduler.lock"), JSON.stringify({ pid: process.ppid, at: new Date().toISOString() }));
  assert.equal(await checkNow(), null);
});
