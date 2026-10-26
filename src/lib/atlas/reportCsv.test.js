// Tests for the report's CSV (reportCsv.js). Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlaces } from "./scoring.js";
import { makePlaces } from "./testPlaces.js";
import { cellsCsv } from "./reportCsv.js";
import { noFightingFound } from "./overview.js";
import { parseCsv } from "../csv.js";

const { places } = scorePlaces(makePlaces(6, 6), { conflict: { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" } });

// The columns, in order (feasibility was called safe_access before
// 2026-10-25: the same numbers in the same place).
const COLUMNS = [
  "cell_id", "place", "lat", "lon", "admin1", "admin2", "cropland_ha", "black_soil_ha", "heavy_damage_ha", "people", "people_on_damaged_soil",
  "soil_value", "damage", "feasibility", "near_term_rank", "near_term_score", "near_term_tier", "postwar_rank", "postwar_score", "postwar_tier",
  "wrb", "ag_output", "firms", "radar", "chi", "distance", "population", "lights",
];

test("the CSV has one row per square, best Postwar rank first, with the scores and the raw indicators", () => {
  const { columns, rows } = parseCsv(cellsCsv(places, 0.25));
  assert.deepEqual(columns, COLUMNS);
  assert.equal(rows.length, places.length);
  const ranks = rows.map((row) => row.postwar_rank).filter(Boolean).map(Number);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  const best = places.find((place) => place.postwar.rank === 1);
  assert.equal(rows[0].cell_id, best.id);
  assert.equal(rows[0].feasibility, String(Number(best.access.toFixed(4))));
  assert.equal("safe_access" in rows[0], false);
  assert.equal(rows[0].distance, String(best.distance));
  // Without the flag, as with it set to false: the same text.
  assert.equal(cellsCsv(places, 0.25), cellsCsv(places, 0.25, { accessUnknown: false }));
});

test("where feasibility is not measured (no fire looked like fighting), feasibility and distance are empty in every row, and nothing else changes", () => {
  const war = { id: "israel-hezbollah", name: "Israel–Hezbollah war", since: "2023-10-08" };
  const quiet = { month: "2026-09", conflict: war, conflictSource: "list", accessSource: "fires-none" };
  assert.equal(noFightingFound(quiet), true);
  const blank = parseCsv(cellsCsv(places, 0.25, { accessUnknown: noFightingFound(quiet) }));
  const full = parseCsv(cellsCsv(places, 0.25));
  assert.deepEqual(blank.columns, COLUMNS, "the same columns: a spreadsheet or GIS reads them the same way");
  for (const row of blank.rows) {
    assert.equal(row.feasibility, "", row.cell_id);
    assert.equal(row.distance, "", row.cell_id);
  }
  // Every other column is as it was, row by row.
  blank.rows.forEach((row, i) => {
    const { feasibility: _a, distance: _d, ...rest } = row;
    const { feasibility: _fa, distance: _fd, ...fullRest } = full.rows[i];
    assert.deepEqual(rest, fullRest);
  });

  // The runs whose feasibility is measured, or at peace (where it reads 1,
  // as the tables read 100), keep their numbers.
  for (const measured of [
    { ...quiet, accessSource: "fires" },
    { ...quiet, accessSource: "acled" },
    { month: "2026-09", conflict: null, conflictSource: "list", accessSource: "none" },
    { month: "2025-12", conflict: { id: "area-x", since: "2026-06-01", source: "area" }, conflictSource: "area", accessSource: "none" },
  ]) {
    assert.equal(noFightingFound(measured), false);
    assert.equal(cellsCsv(places, 0.25, { accessUnknown: noFightingFound(measured) }), cellsCsv(places, 0.25));
  }
});

test("a natural disaster's CSV has its own columns (hit land, its indicators, Post-crisis); a war's columns stay as they are", () => {
  const place = { id: "r0c0", lat: 39.4, lon: 22.1, croplandHa: 100, blackSoilHa: 80, heavyDamageHa: 8, hitHa: 16, hitCropHa: 20, heavyCropHa: 10, grassHitHa: 3, hit: 1, heavy: 0.5, feasible: 0.75, soil: 0.7, damage: 0.75, access: 0.75, nearTerm: { rank: 1, score: 0.5, tier: "highest" }, postwar: { rank: 1, score: 0.6, tier: "highest" } };
  const table = (text) => {
    // Fields may be quoted ("39.40° N, 22.10° E").
    const split = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"'));
    const [head, ...rows] = text.trim().split(/\r?\n/);
    const columns = split(head);
    return rows.map((row) => Object.fromEntries(split(row).map((value, i) => [columns[i], value])));
  };
  const [row] = table(cellsCsv([place], 0.01, { disaster: true }));
  assert.equal(row.hit_black_soil_ha, "16");
  assert.equal(row.heavy_black_soil_ha, "8");
  assert.equal(row.hit_cropland_ha, "20");
  assert.equal(row.grassland_hit_ha, "3");
  assert.equal(row.feasibility, "0.75");
  assert.equal(row.post_crisis_rank, "1");
  for (const key of ["postwar_rank", "firms", "radar", "distance"]) assert.ok(!(key in row), key);
  // Feasibility not measured (a drought): empty, never 1; a square whose
  // damage was not measured: empty hit land and why.
  const open = { ...place, id: "r0c1", hit: null, heavy: null, hitHa: null, hitCropHa: null, heavyCropHa: null, grassHitHa: null, damage: null, notMeasured: "Damage not measured yet: the crop season has not run long enough", feasible: 1, access: 1 };
  const rows = table(cellsCsv([place, open], 0.01, { disaster: true, accessUnknown: true }));
  assert.ok(rows.every((r) => r.feasibility === "" && r.feasible === ""));
  const unmeasured = rows.find((r) => r.cell_id === "r0c1");
  assert.deepEqual([unmeasured.hit, unmeasured.hit_black_soil_ha, unmeasured.heavy_black_soil_ha], ["", "", ""]);
  assert.match(unmeasured.damage_note, /not measured yet/);
  const war = cellsCsv([place], 0.01).trim().split(/\r?\n/)[0].split(",");
  assert.equal(war.at(-1), "lights");
  assert.ok(!war.includes("hit") && war.includes("postwar_rank"));
});
