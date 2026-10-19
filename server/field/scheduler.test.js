// WHAT THIS FILE DOES
// Tests the Field part of server/scheduler.js: with "Update automatically"
// on, fields with no analysis (or one older than a day) are analysed; with
// it off, nothing happens (except one redo of sample analyses once Earth
// Engine is connected). Run with "npm test".
//
// WHO EDITS IT
// Whoever changes the Field check in scheduler.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-field-sched-"));
process.env.GEE_DISABLED = "1";
const store = await import("../store.js");
const { checkFieldsNow } = await import("../scheduler.js");
const { getJob } = await import("../jobs.js");
const { sampleWhileEarthEngine } = await import("./run.js");

const geometry = { type: "Polygon", coordinates: [[[37.5, 49.7], [37.506, 49.7], [37.506, 49.704], [37.5, 49.704], [37.5, 49.7]]] };
const farm = {
  id: "farm-test0001",
  name: "Test farm",
  location: null,
  boundary: null,
  fields: [{ id: "fld-sched001", name: "Field 1", geometry, areaHa: 19, crop: "Corn", source: "drawn", createdAt: "2026-01-01" }],
  units: "ha",
  autoUpdate: true,
  demo: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

async function waitFor(id) {
  for (let i = 0; i < 400; i += 1) {
    const job = getJob(id);
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

test("no farm: nothing to do", async () => {
  assert.equal(await checkFieldsNow(), null);
});

test("missing or day-old analyses are refreshed when auto-update is on", async () => {
  await store.saveFarm(farm);
  const job = await checkFieldsNow();
  assert.ok(job, "a field with no analysis is analysed");
  assert.equal(job.kind, "field-analyze");
  assert.equal(job.trigger, "auto");
  assert.equal((await waitFor(job.id)).status, "done");
  assert.ok(await store.getFieldAnalysis("fld-sched001"));
  assert.equal(await checkFieldsNow(), null, "fresh analyses are left alone");
  await store.releaseLock("field-scheduler");

  const old = await store.getFieldAnalysis("fld-sched001");
  await store.saveFieldAnalysis({ ...old, updatedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
  const again = await checkFieldsNow();
  assert.ok(again, "a day-old analysis is redone");
  await waitFor(again.id);
  await store.releaseLock("field-scheduler");
});

test("auto-update off: nothing happens", async () => {
  await store.saveFarm({ ...farm, autoUpdate: false });
  await store.deleteFieldData("fld-sched001");
  assert.equal(await checkFieldsNow(), null);
});

test("auto-update off: sample analyses are redone once when Earth Engine is connected", () => {
  const fields = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const analyses = { a: { provider: "sample" }, b: { provider: "gee" } };
  assert.deepEqual(sampleWhileEarthEngine({ fields }, analyses, "gee").map((f) => f.id), ["a"], "only stored sample analyses; a missing one waits for Update now");
  assert.deepEqual(sampleWhileEarthEngine({ fields }, analyses, "sample"), [], "nothing while Earth Engine is off");
  assert.deepEqual(sampleWhileEarthEngine(null, analyses, "gee"), []);
});
