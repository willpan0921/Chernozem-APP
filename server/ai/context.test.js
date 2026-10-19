// WHAT THIS FILE DOES
// Tests what the AI knows (context.js): the context text, the tools and the
// local hotspot grouping. The last test builds a real sample run with
// server/runs.js and server/providers/sample.js; it is skipped if those
// files are not there.
//
// WHO EDITS IT
// Whoever changes context.js. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAtlasContext, fallbackGroupHotspots, coordLabel, placeLabel, ATLAS_TOOLS, conflictLine } from "./context.js";
import { scorePlaces } from "../../src/lib/atlas/scoring.js";

// A 6 x 6 grid with a strong corner (top left) and a weak rest.
function gridCells() {
  const cells = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const strong = r < 2 && c < 2;
      cells.push({
        id: `r${r}c${c}`,
        lat: 50 - r * 0.1,
        lon: 30 + c * 0.1,
        wrb: strong ? 0.95 : 0.3 + c * 0.02,
        agOutput: strong ? 0.9 : 0.4,
        firms: strong ? 0.8 : 0.1,
        chi: strong ? 0.7 : 0.1,
        distance: 0.5 + r * 0.05,
        croplandHa: 700,
        blackSoilHa: 500,
        heavyDamageHa: strong ? 120 : 5,
        people: 100,
        peopleOnDamagedSoil: strong ? 20 : 1,
        admin1: strong ? "Kyiv" : undefined,
        admin2: strong ? "Bucha" : undefined,
      });
    }
  }
  return cells;
}

function fakeStore(cells) {
  const run = (id, month, extra = 0) => ({
    id,
    areaId: "area-grid",
    month,
    label: month,
    provider: "sample",
    cellSizeDeg: 0.1,
    cellSizeKm: 7.1,
    cellCount: cells.length,
    imagery: { from: "2026-04", to: month },
    baseline: { from: 2019, to: 2021, label: "2019 to 2021" },
    totals: { croplandHa: 25200, blackSoilHa: 18000, heavyDamageHa: 640 + extra, peopleOnDamagedSoil: 96 },
    newHeavyDamageHa: extra,
    alertsCount: 0,
    checks: { passed: 2, total: 2, warnings: [] },
    cells: cells.map((c) => ({ ...c, heavyDamageHa: c.heavyDamageHa + (c.admin1 ? extra / 4 : 0) })),
    alerts: [],
  });
  const runs = { "run-aug": run("run-aug", "2026-08"), "run-sep": run("run-sep", "2026-09", 40) };
  return {
    async getWorkspace() {
      return { currentAreaId: "area-grid", settings: { weights: { soil: 30, damage: 40, access: 30 }, gatePercentile: 30 }, budgetUsd: 10000000 };
    },
    async getArea(id) {
      return id === "area-grid" ? { id, name: "Grid Oblast", kind: "custom", source: "coordinates", areaHa: 25200 } : null;
    },
    async getRun(id) {
      return runs[id] || null;
    },
    async listRuns() {
      return [runs["run-sep"], runs["run-aug"]].map(({ cells, alerts, ...s }) => s);
    },
  };
}

test("the war line: a known war, no war, ACLED at peace, older runs", () => {
  const war = conflictLine({ id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  assert.match(war, /^War: Full-scale invasion of Ukraine, since 2022-02-24\./);
  assert.match(war, /distance to recorded fighting/);
  const peace = conflictLine(null, "none");
  assert.match(peace, /none in the app's list covers this area/);
  assert.match(peace, /does NOT mean the land is safe/);
  assert.match(peace, /Do not talk about a war, a front line or demining/);
  assert.doesNotMatch(peace, /safe to reach|counts as safe/i);
  const acled = conflictLine(null, "acled");
  assert.match(acled, /battles in the ACLED file/);
  assert.doesNotMatch(acled, /nothing is set aside/);
  assert.equal(conflictLine(undefined), "");
});

test("labels", () => {
  assert.equal(coordLabel(49.6234, 37.7412), "49.62° N, 37.74° E");
  assert.equal(coordLabel(-1.29, -36.8), "1.29° S, 36.80° W");
  assert.equal(placeLabel({ lat: 1, lon: 2, admin1: "A", admin2: "B" }), "B, A");
  assert.equal(placeLabel({ lat: 1, lon: 2 }), "1.00° N, 2.00° E");
});

test("every tool is strict with a closed schema", () => {
  assert.deepEqual(ATLAS_TOOLS.map((t) => t.name), ["get_ranking", "get_place", "compare_months", "budget_coverage", "get_history"]);
  for (const tool of ATLAS_TOOLS) {
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.type, "object");
    assert.equal(tool.input_schema.additionalProperties, false);
    // Strict schemas do not support numeric limits.
    assert.doesNotMatch(JSON.stringify(tool.input_schema), /minimum|maximum/);
  }
});

test("local hotspot grouping joins the strong corner into one hotspot", () => {
  const { places } = scorePlaces(gridCells(), {});
  const hotspots = fallbackGroupHotspots(places, "postwar", { count: 3, cellSizeDeg: 0.1 });
  assert.equal(hotspots.length, 3);
  const first = hotspots[0];
  assert.equal(first.rank, 1);
  assert.equal(first.label, "Bucha, Kyiv");
  for (const id of ["r0c0", "r0c1", "r1c0", "r1c1"]) assert.ok(first.cellIds.includes(id), id);
  assert.ok(first.blackSoilHa >= 2000);
  // No cell is in two hotspots.
  const all = hotspots.flatMap((h) => h.cellIds);
  assert.equal(new Set(all).size, all.length);
});

test("context text and tools over a run", async () => {
  const store = fakeStore(gridCells());
  const compareRuns = (a, b) => ({
    a: { month: a.month, totals: a.totals },
    b: { month: b.month, totals: b.totals },
    deltas: { croplandHa: 0, blackSoilHa: 0, heavyDamageHa: b.totals.heavyDamageHa - a.totals.heavyDamageHa, peopleOnDamagedSoil: 0 },
    changedCells: [{ id: "r0c0", lat: 50, lon: 30, heavyDamageHaA: 120, heavyDamageHaB: 130, delta: 10 }],
  });
  const ctx = await buildAtlasContext({ store, runs: { compareRuns }, context: { timeframe: "postwar", selectedCellId: "r0c0" } });

  assert.equal(ctx.run.id, "run-sep"); // latest run by default
  assert.match(ctx.text, /Area: Grid Oblast/);
  assert.match(ctx.text, /2026-09/);
  assert.match(ctx.text, /SAMPLE DATA/);
  assert.match(ctx.text, /weights soil 30%, damage 40%, safe access 30%/);
  assert.match(ctx.text, /Top places, near term:/);
  assert.match(ctx.text, /Top places, postwar:\n1\. Bucha, Kyiv/);
  assert.match(ctx.text, /History by month/);
  assert.match(ctx.text, /selected on the map/);

  const ranking = await ctx.runTool("get_ranking", { timeframe: "postwar", limit: 2 });
  assert.equal(ranking.places.length, 2);
  assert.equal(ranking.places[0].label, "Bucha, Kyiv");

  const byId = await ctx.runTool("get_place", { cellId: "r0c0" });
  assert.equal(byId.place.cellId, "r0c0");
  assert.ok(byId.place.recoveryCostUsd.fastPath[0] > 0);
  const byPoint = await ctx.runTool("get_place", { lat: 49.71, lon: 30.29 });
  assert.equal(byPoint.place.cellId, "r3c3");
  const far = await ctx.runTool("get_place", { lat: 10, lon: 10 });
  assert.ok(far.error);
  assert.ok((await ctx.runTool("get_place", { cellId: "nope" })).error);

  const compare = await ctx.runTool("compare_months", { a: "2026-08", b: "2026-09" });
  assert.equal(compare.change.heavyDamageHa, 40);
  assert.equal(compare.biggestChanges[0].label, "Bucha, Kyiv");
  assert.match((await ctx.runTool("compare_months", { a: "2025-01", b: "2026-09" })).error, /Available months: 2026-09, 2026-08/);

  const budget = await ctx.runTool("budget_coverage", { usd: 1000000 });
  assert.deepEqual(budget.coversHa.fastPathHa, [Math.round(1e6 / 290), Math.round(1e6 / 95)]);
  assert.ok(budget.coversFirst.length >= 1);
  assert.ok((await ctx.runTool("budget_coverage", { usd: -5 })).error);

  const history = await ctx.runTool("get_history", {});
  assert.deepEqual(history.months.map((m) => m.month), ["2026-09", "2026-08"]);

  // A different run and different weights when asked.
  const aug = await buildAtlasContext({ store, context: { runId: "run-aug", settings: { weights: { soil: 100, damage: 0, access: 0 } } } });
  assert.equal(aug.run.id, "run-aug");
  assert.equal(aug.settings.weights.soil, 100);
  assert.ok((await aug.runTool("unknown_tool", {})).error);
});

test("no area yet gives a clear note, and tools explain there is no run", async () => {
  const store = {
    async getWorkspace() {
      return { currentAreaId: null };
    },
    async getArea() {
      return null;
    },
    async getRun() {
      return null;
    },
    async listRuns() {
      return [];
    },
  };
  const ctx = await buildAtlasContext({ store });
  assert.match(ctx.text, /No area has been chosen/);
  assert.ok((await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 5 })).error);
  assert.ok((await ctx.runTool("get_history", {})).error);
});

// Uses the real sample provider and run builder when they exist.
const here = new URL("../", import.meta.url);
const haveServer = ["runs.js", "providers/sample.js", "geo.js"].every((f) => fs.existsSync(new URL(f, here)));

test("context over a real sample run", { skip: haveServer ? false : "server/runs.js, providers/sample.js or geo.js not written yet" }, async () => {
  const runsMod = await import("../runs.js");
  const sampleMod = await import("../providers/sample.js");
  const geo = await import("../geo.js");
  const provider = sampleMod.default || sampleMod.sampleProvider || sampleMod.provider || sampleMod;
  // A small square area (about 20 km across) in central Ukraine.
  const ring = [
    [31.0, 49.0],
    [31.3, 49.0],
    [31.3, 49.2],
    [31.0, 49.2],
    [31.0, 49.0],
  ];
  const geometry = { type: "Polygon", coordinates: [ring] };
  const area = { id: "area-sampletest", name: "Sample square", kind: "custom", source: "bbox", bbox: [31.0, 49.0, 31.3, 49.2], geometry, areaHa: 48000, createdAt: new Date().toISOString() };

  const { cells, cellSizeDeg } = geo.planGrid(geometry);
  assert.equal(typeof provider.analyze, "function");
  const months = ["2026-08", "2026-09"];
  const built = {};
  for (const month of months) {
    const out = await provider.analyze({ area, cells, month, cellSizeDeg, onProgress: () => {} });
    built[month] = runsMod.buildRun({ area, month, provider: "sample", readings: out.readings, alerts: out.alerts, warnings: out.warnings, cellSizeDeg, cells });
    built[month].id = `run-${month}`;
  }
  const store = {
    async getWorkspace() {
      return { currentAreaId: area.id, settings: null };
    },
    async getArea() {
      return area;
    },
    async getRun(id) {
      return Object.values(built).find((r) => r.id === id) || null;
    },
    async listRuns() {
      return months
        .slice()
        .reverse()
        .map((m) => runsMod.summarizeRun(built[m]));
    },
  };
  const ctx = await buildAtlasContext({ store, runs: runsMod });
  assert.match(ctx.text, /Sample square/);
  assert.match(ctx.text, /SAMPLE DATA/);
  const ranking = await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 5 });
  assert.ok(ranking.places.length >= 1);
  const compare = await ctx.runTool("compare_months", { a: "2026-08", b: "2026-09" });
  assert.equal(compare.error, undefined);
  assert.ok(Number.isFinite(compare.change.heavyDamageHa));
});
