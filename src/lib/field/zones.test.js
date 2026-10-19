// Tests for zones.js (the Zones map picture). Run with npm test.

import test from "node:test";
import assert from "node:assert/strict";
import { NO_BAND, ZONE_BANDS, prepareGrid, renderZoneBands, sampleGrid, zoneBand } from "./zones.js";
import { conditionClass } from "./method.js";

test("bands follow the condition classes", () => {
  for (const score of [0, 0.2, 0.39, 0.4, 0.5, 0.64, 0.65, 0.8, 0.849, 0.85, 0.9, 0.99, 1]) {
    const band = ZONE_BANDS[zoneBand(score)];
    const base = band.base === "deep" ? "great" : band.base;
    assert.equal(base, conditionClass(score).id, `score ${score}`);
  }
  assert.equal(zoneBand(null), NO_BAND);
  assert.equal(zoneBand(NaN), NO_BAND);
});

test("edge gaps are filled and far gaps stay empty", () => {
  // 5 x 1: data in the middle only.
  const grid = prepareGrid({ cols: 5, rows: 1, values: [null, null, 0.5, null, null] }, { fillPasses: 1, smoothPasses: 0 });
  assert.equal(grid.values[2], 0.5);
  assert.equal(grid.values[1], 0.5);
  assert.equal(grid.values[3], 0.5);
  assert.ok(Number.isNaN(grid.values[0]));
});

test("smoothing removes a single speck", () => {
  const values = Array(25).fill(0.9);
  values[12] = 0.1;
  const grid = prepareGrid({ cols: 5, rows: 5, values }, { smoothPasses: 1 });
  assert.ok(grid.values[12] > 0.75);
});

test("bilinear sampling skips empty squares", () => {
  const grid = { cols: 2, rows: 1, values: new Float32Array([0.2, NaN]) };
  assert.equal(sampleGrid(grid, 0.5, 0), 0.20000000298023224);
  const full = { cols: 2, rows: 1, values: new Float32Array([0, 1]) };
  assert.equal(sampleGrid(full, 0.25, 0), 0.25);
});

test("the picture has one band per pixel", () => {
  const values = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) values.push(x < 4 ? 0.3 : 0.95);
  const out = renderZoneBands({ cols: 8, rows: 4, values }, { maxSide: 32 });
  assert.equal(out.width, 32);
  assert.equal(out.height, 16);
  assert.equal(out.bands[0], zoneBand(0.3));
  assert.equal(out.bands[31], zoneBand(0.95));
  assert.deepEqual(renderZoneBands(null), { width: 0, height: 0, bands: new Uint8Array(0) });
});
