// WHAT THIS FILE DOES
// Tests for server/providers/field-sample.js: the demo farm looks like a
// real farm near the front on one day (a mix of crop stages, a stress
// patch in Field 4, Field 7 damaged), and any field on Earth gets complete,
// repeatable readings. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes field-sample.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFieldSampleProvider, frontDistanceKm, seasonStart } from "./field-sample.js";
import { finishAnalysis } from "../field/analysis.js";
import { areaHa } from "../geo.js";
import { MIN_CLEAR_SHARE } from "../../src/lib/field/method.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const collection = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fields.geojson"), "utf8"));
const crops = ["Winter wheat", "Sunflower", "Corn", "Sunflower", "Soybean", "Barley", "Winter wheat"];
const demo = collection.features.map((f, i) => ({ id: `fld-demo000${i + 1}`, name: f.properties.name, geometry: f.geometry, crop: crops[i], areaHa: areaHa(f.geometry) }));
const provider = createFieldSampleProvider({ now: () => new Date("2026-10-18T12:00:00Z") });

async function analyse(fields, today) {
  const raw = await provider.analyzeFields({ fields, today });
  return Object.fromEntries(fields.map((field) => [field.name, finishAnalysis({ field, raw: raw.analyses[field.id], today })]));
}

test("the demo farm on 18 Oct 2026: Field 7 needs recovery, the rest do not, and stages differ", async () => {
  const result = await analyse(demo, "2026-10-18");
  assert.equal(result["Field 7"].status.id, "recovery");
  assert.ok(result["Field 7"].damage.damagedHa > 5);
  for (const name of ["Field 1", "Field 2", "Field 3", "Field 4", "Field 5", "Field 6"]) {
    assert.notEqual(result[name].status.id, "recovery", name);
    assert.equal(result[name].damage.detected, false, name);
  }
  const stages = new Set(Object.values(result).map((a) => a.harvest.stage));
  assert.ok(stages.size >= 4, `stages: ${[...stages]}`);
  assert.ok(result["Field 4"].stress.patches.length >= 1, "Field 4 has a stress patch");
  assert.ok(result["Field 4"].stress.patches[0].ha >= 0.3);
});

test("every analysis is complete and uses only clear passes", async () => {
  const result = await analyse(demo, "2026-10-18");
  for (const a of Object.values(result)) {
    for (const value of [a.plantHealth.ndvi, a.water.ndwi, a.plantHealth.normal.median, a.water.normal.median, a.condition.score, a.stress.share]) {
      assert.ok(Number.isFinite(value), JSON.stringify(a.fieldId));
    }
    assert.ok(a.season.length >= 10);
    assert.ok(a.season.every((p) => p.clearPct >= MIN_CLEAR_SHARE * 100 && p.date >= seasonStart("2026-10-18") && p.date <= "2026-10-18"));
    assert.equal(a.normalCurve.length, 24);
    assert.equal(a.zones.values.length, a.zones.cols * a.zones.rows);
    assert.ok(a.zones.cols <= 64 && a.zones.rows <= 64);
    assert.ok(a.zones.values.some((v) => v === null) && a.zones.values.some((v) => v !== null));
    assert.equal(a.soil.soilTypeId, "chernozem");
  }
});

test("the same field on the same day always gives the same numbers", async () => {
  const one = await provider.analyzeFields({ fields: demo.slice(0, 2), today: "2026-10-18" });
  const two = await provider.analyzeFields({ fields: demo.slice(0, 2), today: "2026-10-18" });
  const strip = (r) => Object.values(r.analyses).map(({ updatedAt, ...rest }) => rest);
  assert.deepEqual(strip(one), strip(two));
});

test("works for a field anywhere on Earth, with no war damage far from the front", async () => {
  const square = (lat, lon, d = 0.004) => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });
  const fields = [
    { id: "fld-iowa0001", name: "Iowa", geometry: square(41.9, -93.6), crop: "Corn" },
    { id: "fld-nsw00001", name: "NSW", geometry: square(-33.1, 147.2), crop: null },
    { id: "fld-uganda01", name: "Uganda", geometry: square(0.3, 32.5), crop: "Other" },
    { id: "fld-kyiv0001", name: "Kyiv", geometry: square(50.3, 30.6), crop: "Barley" },
  ];
  const result = await analyse(fields, "2026-06-15");
  for (const a of Object.values(result)) {
    assert.ok(Number.isFinite(a.condition.score));
    assert.equal(a.damage.detected, false);
    assert.ok(a.status.id);
  }
  assert.equal(frontDistanceKm(41.9, -93.6), Infinity);
  assert.ok(frontDistanceKm(49.72, 37.53) < 15);
});

test("history: one row per month since 2019, never in the future", async () => {
  const months = await provider.fieldHistory({ field: demo[0], from: "2019-01", to: "2026-10" });
  assert.equal(months.length, 8 * 12 - 2);
  assert.equal(months[0].month, "2019-01");
  assert.equal(months.at(-1).month, "2026-10");
  const summer = months.filter((m) => m.month.endsWith("-06") && Number.isFinite(m.ndvi));
  const winter = months.filter((m) => m.month.endsWith("-01") && Number.isFinite(m.ndvi));
  assert.ok(summer.length && winter.length);
  // Winter wheat is greener in June than in January.
  assert.ok(Math.min(...summer.map((m) => m.ndvi)) > Math.max(...winter.map((m) => m.ndvi)));
});

test("detection labels itself as sample data", async () => {
  const { candidates, warnings } = await provider.detectFields({ center: { lat: 49.73, lon: 37.54 }, radiusM: 1200 });
  assert.ok(candidates.length >= 6);
  assert.match(warnings[0], /Sample data/);
});
