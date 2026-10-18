// Tests for farmSummary.js, using the real Field data file.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import * as farmData from "../../data/farm.js";
import { buildFarmSummary } from "./farmSummary.js";

test("the farm summary has every field, the steps and the recovery plan", () => {
  const summary = buildFarmSummary(farmData, "Field 7");
  assert.equal(summary.focus, "Field 7");
  assert.equal(summary.fields.length, farmData.fields.length);
  assert.deepEqual(Object.keys(summary.fields[0]).sort(), ["areaHa", "crop", "name", "soil", "sown", "status"]);
  assert.equal(summary.recoveryPlan.field, "Field 7");
  assert.equal(summary.recoveryPlan.paths.length, 2);
  assert.equal(summary.recoveryPlan.chosenPath, "Fast path");
  assert.ok(summary.nextSteps.length > 0);
  assert.ok(summary.weather.length > 0);
});

test("the summary stays small", () => {
  assert.ok(JSON.stringify(buildFarmSummary(farmData)).length < 8000, "the server keeps at most 8,000 characters");
});

test("missing parts do not break it", () => {
  const summary = buildFarmSummary({ farm: { name: "X" } });
  assert.equal(summary.name, "X");
  assert.deepEqual(summary.fields, []);
  assert.equal(summary.recoveryPlan, undefined);
});
