// WHAT THIS FILE DOES
// Tests for server/providers/field-sample.js: the demo farm looks like a
// real farm near the front on one day (a mix of crop stages, a stress
// patch with its likely cause in the corn, Field 7 damaged, "No crop" on
// harvested fields), any field on Earth gets complete, repeatable
// readings (with the red edge, yellow flowers and radar), and every known
// war gets war damage near a front. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes field-sample.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chernozemChance, createFieldSampleProvider, cropKey, frontDistanceKm, seasonStart, warFront } from "./field-sample.js";
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
  // The corn is still in the field and has a stress patch with its likely cause.
  const corn = result["Field 3"];
  assert.equal(corn.stress.applies, true);
  assert.ok(corn.stress.patches.length >= 1, "Field 3 has a stress patch");
  assert.ok(corn.stress.patches[0].ha >= 0.3);
  assert.ok(["dry", "other"].includes(corn.stress.patches[0].cause));
  assert.ok(["dry", "other"].includes(corn.stress.cause));
  // Harvested and unsown fields: "No crop", no condition class (never "Poor").
  for (const a of Object.values(result).filter((x) => ["harvested", "notSown"].includes(x.harvest.stage))) {
    assert.equal(a.stress.applies, false);
    assert.deepEqual(a.stress.patches, []);
    assert.equal(a.condition.score, null);
    assert.equal(a.condition.class, null);
  }
});

test("every analysis is complete and uses only clear passes", async () => {
  const result = await analyse(demo, "2026-10-18");
  for (const a of Object.values(result)) {
    for (const value of [a.plantHealth.ndvi, a.water.ndwi, a.plantHealth.normal.median, a.water.normal.median]) {
      assert.ok(Number.isFinite(value), JSON.stringify(a.fieldId));
    }
    if (a.stress.applies) assert.ok(Number.isFinite(a.condition.score) && Number.isFinite(a.stress.share), a.fieldId);
    assert.ok(a.season.every((p) => Number.isFinite(p.ndyi)), "every pass has the yellow-flower index");
    assert.ok(a.radar.vhSeries.length >= 20, "a radar pass every 6 days");
    assert.ok(a.season.length >= 10);
    assert.ok(a.season.every((p) => p.clearPct >= MIN_CLEAR_SHARE * 100 && p.date >= seasonStart("2026-10-18", 49.7) && p.date <= "2026-10-18"));
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
    assert.ok(Number.isFinite(a.condition.score) || !a.stress.applies);
    assert.equal(a.damage.detected, false);
    assert.ok(a.status.id);
  }
  assert.equal(frontDistanceKm(41.9, -93.6), Infinity);
  assert.ok(frontDistanceKm(49.72, 37.53) < 15);
});

const square = (id, lat, lon, crop, d = 0.006) => ({ id, name: id, crop, geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] } });

test("seasons follow the hemisphere: mid-October wheat is green in the Pampas, corn dries down in Iowa", async () => {
  const fields = [square("fld-pampas01", -34.9, -60.95, "Winter wheat"), square("fld-iowa0002", 42.03, -93.62, "Corn"), square("fld-iowa0003", 42.05, -93.62, "Soybean")];
  const result = await analyse(fields, "2026-10-18");
  assert.equal(result["fld-pampas01"].harvest.stage, "growing");
  assert.ok(result["fld-pampas01"].season.every((p) => p.date >= "2026-09-01"), "the southern season's curve starts a month before October");
  assert.ok(["ripening", "ready"].includes(result["fld-iowa0002"].harvest.stage), result["fld-iowa0002"].harvest.stage);
  assert.ok(["ripening", "ready", "harvested"].includes(result["fld-iowa0003"].harvest.stage));
  // The same Pampas wheat in mid-January has been harvested or is ready.
  const january = await analyse(fields.slice(0, 1), "2027-01-20");
  assert.ok(["ready", "harvested"].includes(january["fld-pampas01"].harvest.stage), january["fld-pampas01"].harvest.stage);
});

test("a peaceful farm that burns its stubble every year is not damaged; damage is counted over the last 2 years", async () => {
  const fields = Array.from({ length: 30 }, (_, i) => square(`fld-iowa-${String(i).padStart(3, "0")}`, 42.03 + i * 0.01, -93.62, "Corn"));
  const raw = await provider.analyzeFields({ fields, today: "2026-10-18" });
  const burning = Object.values(raw.analyses).filter((a) => a.damage.fires >= 3);
  assert.ok(burning.length >= 3, "some fields burn their stubble");
  for (const field of fields) {
    const a = finishAnalysis({ field, raw: raw.analyses[field.id], today: "2026-10-18" });
    assert.equal(a.conflict, null);
    assert.equal(a.damage.since, "2024-10-18");
    assert.equal(a.damage.excessFires, 0);
    assert.equal(a.damage.fires, a.damage.firesNormal);
    assert.equal(a.damage.detected, false);
    assert.notEqual(a.status.id, "recovery");
  }
});

test("no front line outside the war: Moldova is in Ukraine's box but at peace", async () => {
  assert.equal(frontDistanceKm(47.0, 28.85), Infinity);
  const result = await analyse([square("fld-moldova1", 47.0, 28.85, "Sunflower")], "2026-10-18");
  assert.equal(result["fld-moldova1"].conflict, null);
  assert.equal(result["fld-moldova1"].damage.detected, false);
  // Inside the war: counted from its start, and the demo farm's Field 7 fires are above the normal.
  const demoResult = await analyse(demo, "2026-10-18");
  const seven = demoResult["Field 7"];
  assert.equal(seven.conflict.id, "ukraine-2022");
  assert.equal(seven.damage.since, "2022-02-24");
  assert.ok(seven.damage.excessFires > 0 && seven.damage.fires >= seven.damage.excessFires);
});

test("history: one row per month since 2019, never in the future", async () => {
  const months = await provider.fieldHistory({ field: demo[0], from: "2019-01", to: "2026-10" });
  assert.equal(months.length, 8 * 12 - 2);
  assert.equal(months[0].month, "2019-01");
  assert.equal(months.at(-1).month, "2026-10");
  const summer = months.filter((m) => m.month.endsWith("-05") && Number.isFinite(m.ndvi));
  const winter = months.filter((m) => m.month.endsWith("-01") && Number.isFinite(m.ndvi));
  assert.ok(summer.length && winter.length);
  // Winter wheat is greener in May than in January.
  assert.ok(Math.min(...summer.map((m) => m.ndvi)) > Math.max(...winter.map((m) => m.ndvi)));
});

test("detection labels itself as sample data", async () => {
  const { candidates, warnings } = await provider.detectFields({ center: { lat: 49.73, lon: 37.54 }, radiusM: 1200 });
  assert.ok(candidates.length >= 6);
  assert.match(warnings[0], /Sample data/);
});

test("sample black soil is high in the black-soil belts, Iowa and north-east China included", () => {
  assert.ok(chernozemChance(42.03, -93.62) >= 0.4, "Iowa");
  assert.ok(chernozemChance(46.6, 125.0) >= 0.4, "Heilongjiang");
  assert.ok(chernozemChance(-34.9, -60.95) >= 0.4, "the Pampas");
  assert.ok(chernozemChance(-0.3, 36.05) <= 0.2, "Kenya");
});

test("radar: a tall crop keeps its radar return while it stands dry, and it drops when cut", async () => {
  const fields = [square("fld-iowa-soy1", 42.07, -93.62, "Soybean"), square("fld-iowa-corn", 42.09, -93.62, "Corn")];
  const raw = await provider.analyzeFields({ fields, today: "2026-12-20" });
  for (const field of fields) {
    const series = raw.analyses[field.id].radar.vhSeries;
    const drops = series.slice(1).map((p, i) => series[i].vh - p.vh);
    assert.ok(Math.max(...drops) >= 3, `${field.name}: the cut shows as a drop of 3 dB or more`);
  }
  // Corn has the strongest return.
  assert.ok(raw.analyses["fld-iowa-corn"].radar.vhPeak > raw.analyses["fld-iowa-soy1"].radar.vhPeak);
  // In mid October the soybean has dried down but is not cut yet: standing, "Ready to harvest".
  const october = await analyse([{ ...fields[0], cropSource: "user" }], "2026-10-18");
  const soy = october["fld-iowa-soy1"];
  assert.equal(soy.harvest.stage, "ready");
  assert.equal(soy.status.id, "ready");
  // In December the radar has seen the cut.
  const december = await analyse([{ ...fields[0], cropSource: "user" }], "2026-12-20");
  assert.equal(december["fld-iowa-soy1"].harvest.stage, "harvested");
  assert.ok(december["fld-iowa-soy1"].harvest.radarHarvestOn);
});

test("rapeseed flowers yellow in spring (NDYI)", async () => {
  const fields = [square("fld-rape0001", 49.5, 31.5, "Rapeseed"), square("fld-wheat001", 49.52, 31.5, "Winter wheat")];
  const raw = await provider.analyzeFields({ fields, today: "2026-06-30" });
  const springMax = (id) => Math.max(...raw.analyses[id].season.filter((p) => p.date >= "2026-04-15" && p.date <= "2026-05-31").map((p) => p.ndyi));
  assert.ok(springMax("fld-rape0001") - springMax("fld-wheat001") >= 0.06);
});

test("stress v2: the red edge, and the likely cause per patch", async () => {
  const fields = Array.from({ length: 40 }, (_, i) => square(`fld-re-${String(i).padStart(3, "0")}`, 42.03 + i * 0.01, -93.5, "Corn"));
  const raw = await provider.analyzeFields({ fields, today: "2026-08-01" });
  const all = Object.values(raw.analyses);
  assert.ok(all.some((a) => a.stress.redEdgeOnlyShare > 0.01), "some stress shows in the red edge only");
  const patches = all.flatMap((a) => a.stress.patches);
  assert.ok(patches.some((p) => p.ndwiAnomaly <= -0.05) && patches.some((p) => p.ndwiAnomaly > -0.05), "dry patches and not-water patches");
});

test("war damage near a front in every known war, not only Ukraine", () => {
  for (const id of ["sudan-2023", "gaza-2023"]) {
    const line = warFront({ id });
    assert.ok(Array.isArray(line) && line.length >= 2, id);
  }
  // Gaza: a field in the Strip is near the front; the West Bank is at peace.
  assert.ok(frontDistanceKm(31.5, 34.45) < 30);
  assert.equal(frontDistanceKm(31.9, 35.2), Infinity);
  // Sudan, near Khartoum: inside the war.
  assert.ok(Number.isFinite(frontDistanceKm(15.6, 32.5)));
});

test("crop names, including the detected crops, map to the sample's crops", () => {
  assert.equal(cropKey("Winter cereal"), "winter wheat");
  assert.equal(cropKey("Spring cereal"), "barley");
  assert.equal(cropKey("Corn"), "corn");
  assert.equal(cropKey("Rapeseed"), "rapeseed");
  assert.equal(cropKey(null, "seed-a"), cropKey(null, "seed-a"));
});
