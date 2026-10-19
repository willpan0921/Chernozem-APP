// WHAT THIS FILE DOES
// Tests the Field analysis job (server/field/run.js) end to end on a
// temporary data folder with sample data: a new field gets its monthly
// history in the same job (from the data source's analysis when it sends
// it, as Earth Engine does, else field by field), every field gets a
// detected crop, the detected crop replaces demo placeholders on the farm
// but never the farmer's own crop. The weather services answer offline.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever changes run.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-field-run-"));
process.env.GEE_DISABLED = "1";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (/^https:\/\/(api|archive-api)\.open-meteo\.com\//.test(String(url))) throw new Error("offline in the tests");
  return realFetch(url, options);
};

const store = await import("../store.js");
const { getJob } = await import("../jobs.js");
const { startFieldAnalysis } = await import("./run.js");
const { fieldSampleProvider } = await import("../providers/field-sample.js");

const square = (lat, lon, d = 0.006) => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });

async function waitFor(id) {
  for (let i = 0; i < 400; i += 1) {
    const job = getJob(id);
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

test("new fields get their history in the same job and a detected crop; the farmer's crop stays", async () => {
  const farm = {
    id: "farm-run00001",
    name: "Test farm",
    location: { label: "Ames", lat: 42.05, lon: -93.6 },
    boundary: null,
    units: "ha",
    autoUpdate: true,
    demo: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    fields: [
      // A demo placeholder saved before cropSource existed.
      { id: "fld-run00001", name: "Field 3", geometry: square(42.03, -93.62), areaHa: 33, crop: "Corn", source: "demo", createdAt: "2026-01-01" },
      // The farmer's own crop.
      { id: "fld-run00002", name: "Field 2", geometry: square(42.05, -93.62), areaHa: 33, crop: "Soybean", cropSource: "user", source: "drawn", createdAt: "2026-01-01" },
      // A new drawn field, no crop.
      { id: "fld-run00003", name: "Field 9", geometry: square(42.07, -93.62), areaHa: 33, crop: null, source: "drawn", createdAt: "2026-01-01" },
    ],
  };
  await store.saveFarm(farm);

  // A data source that reads the history with the analysis (like Earth Engine).
  const original = { analyzeFields: fieldSampleProvider.analyzeFields, fieldHistory: fieldSampleProvider.fieldHistory };
  const asked = { historyFor: null, sentCropSources: null, fieldHistory: 0 };
  fieldSampleProvider.analyzeFields = async (input) => {
    asked.historyFor = input.historyFor;
    asked.sentCropSources = input.fields.map((f) => f.cropSource);
    const result = await original.analyzeFields.call(fieldSampleProvider, input);
    const histories = {};
    for (const id of input.historyFor || []) {
      const field = input.fields.find((f) => f.id === id);
      histories[id] = await original.fieldHistory.call(fieldSampleProvider, { field, from: "2019-01", to: input.today.slice(0, 7) });
    }
    return { ...result, histories };
  };
  fieldSampleProvider.fieldHistory = async (args) => {
    asked.fieldHistory += 1;
    return original.fieldHistory.call(fieldSampleProvider, args);
  };
  try {
    const job = await startFieldAnalysis({ trigger: "manual" });
    const done = await waitFor(job.id);
    assert.equal(done.status, "done", done.error);
    assert.deepEqual([...asked.historyFor].sort(), ["fld-run00001", "fld-run00002", "fld-run00003"]);
    assert.deepEqual(asked.sentCropSources, ["demo", "user", null], "the data source is told which crops are the farmer's");
    assert.equal(asked.fieldHistory, 0, "no second pass when the history came with the analysis");
    for (const id of ["fld-run00001", "fld-run00002", "fld-run00003"]) {
      const history = await store.getFieldHistory(id);
      assert.equal(history.months[0].month, "2019-01");
      const analysis = await store.getFieldAnalysis(id);
      assert.ok(analysis.cropDetected?.id, id);
    }
    const saved = await store.getFarm();
    const byId = Object.fromEntries(saved.fields.map((f) => [f.id, f]));
    const detected = async (id) => (await store.getFieldAnalysis(id)).cropDetected;
    for (const id of ["fld-run00001", "fld-run00003"]) {
      const d = await detected(id);
      if (d.id === "unknown") assert.deepEqual([byId[id].crop, byId[id].cropSource], [null, null]);
      else assert.deepEqual([byId[id].crop, byId[id].cropSource], [d.label, "detected"]);
    }
    assert.deepEqual([byId["fld-run00002"].crop, byId["fld-run00002"].cropSource], ["Soybean", "user"]);
    assert.equal((await store.getFieldAnalysis("fld-run00002")).cropUsed.source, "user");

    // A second run: the histories are fresh, nothing more is read.
    asked.historyFor = null;
    const again = await waitFor((await startFieldAnalysis({ trigger: "manual" })).id);
    assert.equal(again.status, "done");
    assert.deepEqual(asked.historyFor, []);
  } finally {
    Object.assign(fieldSampleProvider, original);
  }
});
