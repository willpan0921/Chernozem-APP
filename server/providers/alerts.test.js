// WHAT THIS FILE DOES
// Checks that radar alerts only land in squares the Atlas ranking keeps
// (server/providers/gee.js pickAlerts with the black-soil floor of
// src/lib/atlas/scoring.js). Fire alerts stay everywhere. Run with
// "npm test".
//
// WHO EDITS IT
// Whoever changes how Earth Engine alerts are picked.

import test from "node:test";
import assert from "node:assert/strict";
import { pickAlerts } from "./gee.js";
import { blackSoilFloor } from "../../src/lib/atlas/scoring.js";

const cand = (id, lat, lon, extra) => ({ id, lat, lon, radarShare: 0, radarKm2: 0, fires: 0, ...extra });
const SIZE = 0.2;
// The floor of a 0.2° square on the equator: about 248 ha (0.5% of ~49,600 ha).
const FLOOR = blackSoilFloor({ lat: 0 }, SIZE);

test("the floor is the ranking's own (10.8)", () => {
  assert.ok(FLOOR > 240 && FLOOR < 255, String(FLOOR));
});

test("radar alerts skip squares with too little black-soil cropland (10.8)", () => {
  const alerts = pickAlerts(
    [
      // Strong radar change in an arid square with no black soil: no alert.
      cand("r0c0", 0, 36, { radarShare: 0.9, radarKm2: 400, blackSoilHa: 0 }),
      // Its neighbour has black soil: it is an alert of its own, and the
      // arid square does not join it.
      cand("r0c1", 0, 36.2, { radarShare: 0.5, radarKm2: 200, blackSoilHa: FLOOR + 1 }),
      // Just under the floor: left out too.
      cand("r3c3", -0.6, 36.6, { radarShare: 0.8, radarKm2: 300, blackSoilHa: FLOOR - 1 }),
      // Fires are kept wherever they are.
      cand("r5c5", -1, 37, { fires: 12, blackSoilHa: 0 }),
    ],
    { cellSizeDeg: SIZE, month: "2026-09" }
  );
  const radar = alerts.filter((a) => a.kind === "radar");
  assert.deepEqual(radar.map((a) => a.cellIds), [["r0c1"]]);
  assert.equal(radar[0].magnitude, 200);
  assert.deepEqual(alerts.filter((a) => a.kind === "fire").map((a) => a.cellIds), [["r5c5"]]);
});

test("candidates without black-soil numbers are kept as before", () => {
  const alerts = pickAlerts([cand("a", 0, 36, { radarShare: 0.5, radarKm2: 20 })], { cellSizeDeg: SIZE, month: "2026-09" });
  assert.equal(alerts.length, 1);
});
