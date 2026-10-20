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
import { buildAtlasContext, fallbackGroupHotspots, coordLabel, placeLabel, ATLAS_TOOLS, conflictLine, settingsLine, warSettingNote } from "./context.js";
import { scorePlaces } from "../../src/lib/atlas/scoring.js";
import { METHOD_VERSION } from "../../src/lib/atlas/method.js";

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

function fakeStore(cells, more = {}) {
  const run = (id, month, extra = 0) => ({
    ...more,
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
  // At peace: the damage score as used, and never "distance to fighting" (10.6).
  assert.match(peace, /Damage score: the share of each place's black-soil cropland that is heavily damaged \(radar change of 3 dB or more backed by an unusual fire within 1 km/);
  assert.match(peace, /full at 20%/);
  assert.match(peace, /Safe access: no war is recorded here, so it is full \(100\) everywhere/);
  assert.doesNotMatch(peace, /fighting/);
  assert.match(war, /Damage score: the mean of unusual fire and radar change/);
  // How damage behaves over time, as the current method does it.
  assert.match(war, /Unusual fire is the fires of the worst war year \(12-month years counted from the day the war began; the current one so far, once it is 3 months long\) above a normal year/);
  assert.match(war, /Radar change is the change that lasts: reached in at least two complete growing seasons since the war began \(while only one is complete, that one\)/);
  assert.match(war, /while the war seasons stay the same, heavily damaged land does not shrink from one month to the next: it can only grow, with new fires\./);
  // A new season can lower it: the step from one measured season to two,
  // and a new orbit direction (gee.js pickPass over all war seasons).
  assert.match(war, /When a new year's growing season joins \(once a year\) it usually grows, but it can fall where a place goes from one measured season to two \(normally the war's second year\), or when the new season changes the orbit direction the radar is compared from/);
  assert.match(war, /coarser pixels, or took the growing season from the latitude, can differ either way/);
  assert.match(war, /a square scored on fire alone \(no radar reading\) can drop when radar is first read, and priority scores, ranks and tiers can go up or down/);
  assert.doesNotMatch(war, /older method/);
  // A run made with an older method is said to be one.
  const older = conflictLine({ id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }, "fires", { currentMethod: false });
  assert.match(older, /This month was made with an older method \(fires over the whole window, the last season's radar\): its heavy damage could fall from month to month, and it is not comparable with months made with the current method \(2026-10-19\.3\)/);
  assert.doesNotMatch(older, /does not shrink|worst war year/);
  assert.match(older, /distance to unusual fires/);
  assert.doesNotMatch(peace, /safe to reach|counts as safe/i);
  const acled = conflictLine(null, "acled");
  assert.match(acled, /battles in the ACLED file/);
  assert.doesNotMatch(acled, /nothing is set aside/);
  assert.equal(conflictLine(undefined), "");
  // In a war with no ACLED file: unusual fires, an estimate, not "recorded fighting".
  const fires = conflictLine({ id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }, "fires");
  assert.match(fires, /distance to unusual fires \(an estimate of where fighting is; there is no ACLED file/);
  assert.doesNotMatch(fires, /recorded fighting,/);
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
  // The weights as each ranking uses them (10.6).
  assert.match(ctx.text, /Near term ranks by soil value 43% and damage 57%; safe access is a cutoff, not a weight/);
  assert.match(ctx.text, /Postwar blends soil value 30%, damage 40% and safe access 30%/);
  assert.match(ctx.text, /1\. Bucha, Kyiv \([^)]*\), \d+ squares?:/);
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
  // Each place says what its hectares are; black soil is never called damage.
  for (const item of budget.coversFirst) {
    assert.equal(item.countedHa, item.heavyDamageHa > 0 ? item.heavyDamageHa : item.blackSoilHa);
    assert.equal(item.counted, item.heavyDamageHa > 0 ? "heavily damaged hectares" : "black-soil cropland (no heavy damage found)");
    assert.ok(item.squares >= 1);
  }
  assert.equal((await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 2 })).weightsUsed.soil, 43);
  assert.ok((await ctx.runTool("budget_coverage", { usd: -5 })).error);

  const history = await ctx.runTool("get_history", {});
  assert.deepEqual(history.months.map((m) => m.month), ["2026-09", "2026-08"]);

  // A different run and different weights when asked.
  const aug = await buildAtlasContext({ store, context: { runId: "run-aug", settings: { weights: { soil: 100, damage: 0, access: 0 } } } });
  assert.equal(aug.run.id, "run-aug");
  assert.equal(aug.settings.weights.soil, 100);
  assert.ok((await aug.runTool("unknown_tool", {})).error);
});

test("costs say 'before demining' only where a war is listed (7.1)", async () => {
  const war = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" } }), context: { selectedCellId: "r0c0" } });
  assert.equal((await war.runTool("get_place", { cellId: "r0c0" })).place.recoveryCostUsd.note, "before demining; planning assumption (not sourced)");
  assert.match((await war.runTool("budget_coverage", { usd: 1e6 })).note, /exclude demining/);
  assert.match(war.text, /"note":"before demining; planning assumption \(not sourced\)"/);
  // Every cost is labelled a planning assumption, war or peace.
  assert.match((await war.runTool("budget_coverage", { usd: 1e6 })).note, /planning assumptions \(not sourced\)/);

  const peace = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: null }), context: { selectedCellId: "r0c0" } });
  const place = (await peace.runTool("get_place", { cellId: "r0c0" })).place;
  assert.doesNotMatch(place.recoveryCostUsd.note, /demin/);
  const budget = await peace.runTool("budget_coverage", { usd: 1e6 });
  assert.doesNotMatch(budget.note, /demin/);
  assert.match(budget.note, /does not say the land is safe/);
  assert.match(place.recoveryCostUsd.note, /planning assumption \(not sourced\)/);
  assert.doesNotMatch(peace.text, /demining"/);
  // The tool's description (sent every time) only mentions demining for a war.
  assert.match(ATLAS_TOOLS.find((t) => t.name === "budget_coverage").description, /where a war is listed, before demining/);
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

test("the weights as used, in a war and at peace (10.6)", () => {
  const settings = { weights: { soil: 30, damage: 40, access: 30 }, gatePercentile: 30, r: 0.5 };
  const scored = { places: [{ nearTerm: { tier: "setAside" } }, { nearTerm: { tier: "high" } }] };
  const war = settingsLine(settings, { conflict: { id: "x", since: "2022-02-24" }, accessSource: "fires" }, scored, "nearTerm");
  assert.match(war, /Near term ranks by soil value 43% and damage 57%/);
  assert.match(war, /least safe 30% of the black soil is set aside first \(1 squares set aside\)|least safe 30% of the black soil is set aside first \(1 square/);
  assert.match(war, /Postwar blends soil value 30%, damage 40% and safe access 30% \(weighted power mean, r = 0.5\)\./);
  assert.match(war, /viewing Near term/);
  const peace = settingsLine(settings, { conflict: null, accessSource: "none" }, scored, "postwar");
  assert.match(peace, /nothing is set aside \(no war recorded\)/);
  assert.match(peace, /Long term blends soil value 30%/);
  assert.match(peace, /changes no order: both rankings put the squares in the same order/);
  assert.match(peace, /viewing Long term/);
  assert.doesNotMatch(peace, /fighting|least safe/);
  // With an ACLED file at peace, access is measured and can set land aside.
  assert.match(settingsLine(settings, { conflict: null, accessSource: "acled" }, scored, "nearTerm"), /set aside first/);
});

test("at peace both rankings really sort the same way (10.6)", async () => {
  const peace = await buildAtlasContext({ store: fakeStore(gridCells().map((c) => ({ ...c, distance: 1 })), { conflict: null, accessSource: "none" }) });
  const order = (tf) => peace.scored.places.filter((p) => Number.isFinite(p[tf].rank)).sort((a, b) => a[tf].rank - b[tf].rank).map((p) => p.id);
  assert.deepEqual(order("nearTerm"), order("postwar"));
  assert.match(peace.text, /Top places, long term:/);
  assert.doesNotMatch(peace.text, /fighting/);
});

test("at peace the data warnings do not repeat the no-war note or say 'fires only' (10.6)", async () => {
  const { NO_WAR_WARNING } = await import("../runs.js");
  const base = fakeStore(gridCells(), { conflict: null, accessSource: "none" });
  const checks = { passed: 2, total: 2, warnings: [NO_WAR_WARNING, "5 of 36 cells had no radar reading on cropland; their damage uses fires only."] };
  const store = { ...base, getRun: async (id) => ({ ...(await base.getRun(id)), checks }) };
  const ctx = await buildAtlasContext({ store });
  assert.doesNotMatch(ctx.text, /distance to fighting|fires only/);
  assert.match(ctx.text, /5 of 36 cells had no radar reading on cropland; no heavy damage can be found there \(here it needs radar change\)/);
  assert.equal((await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 1 })).weightsUsed.safeAccess, "not used: full everywhere (no war recorded)");
});

test("the war line says when the user's team set the war, or marked the area as not at war", () => {
  const team = { id: "area-area-grid", name: "Fighting in Amhara", since: "2023-08-01", source: "area" };
  const set = conflictLine(team, "fires", { setByTeam: true });
  assert.match(set, /^War: Fighting in Amhara, since 2023-08-01\. This war was set by the user's team for this area in Atlas Settings \(its name and start date are the team's, not from the app's list of wars\); say so when you name it\. Damage is counted from that day\./);
  assert.doesNotMatch(set, /earliest day/);
  assert.match(set, /distance to unusual fires/);
  // Counted from the earliest day allowed: the war may be older.
  const earliest = conflictLine({ ...team, since: "2022-01-01" }, "fires", { setByTeam: true });
  assert.match(earliest, /That is the earliest day the app allows \(the normal years 2019 to 2021 must come before the war\): the war may have begun earlier, so damage before that day is not counted, and the normal years may already include the war\./);
  // A war from the app's list says nothing of the kind.
  const listed = conflictLine({ id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }, "fires");
  assert.doesNotMatch(listed, /user's team|earliest day/);
  // Not at war by the team's choice: no war talk, and why.
  const calm = conflictLine(null, "none", { setByTeam: true });
  assert.match(calm, /^War: none\. The user's team marked this area as not at war in Atlas Settings, so the app's list of wars is not used for it \(say so if asked about a war here\)\./);
  assert.match(calm, /Do not talk about a war, a front line or demining for this area unless the user raises it\./);
  assert.match(conflictLine(null, "none"), /^War: none in the app's list covers this area/);
});

test("the AI is told when the team set the war, and when the area's war setting changed after the month was made", async () => {
  const { TEAM_PEACE_WARNING } = await import("../runs.js");
  const team = { id: "area-area-grid", name: "Fighting in Amhara", since: "2023-08-01", source: "area" };
  const set = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: team, conflictSource: "area", accessSource: "fires" }) });
  assert.match(set.text, /War: Fighting in Amhara, since 2023-08-01\. This war was set by the user's team/);
  assert.doesNotMatch(set.text, /War setting changed/, "the area has no other setting");
  assert.match(set.text, /never subtract them/);

  // The team marked the area as not at war after this month was made at war.
  const base = fakeStore(gridCells(), { conflict: team, conflictSource: "area", accessSource: "fires" });
  const changed = { ...base, getArea: async (id) => ({ ...(await base.getArea(id)), war: { mode: "peace" } }) };
  const ctx = await buildAtlasContext({ store: changed });
  assert.match(ctx.text, /War setting changed: this month was made at war since 2023-08-01, but the user's team has since marked this area not at war\. Its numbers follow the setting it was made with until the analysis is re-run \(Atlas Settings, Re-run analysis\)\./);
  // And the other way: made at peace, now at war from a day the team set.
  const calmBase = fakeStore(gridCells(), { conflict: null, conflictSource: "list", accessSource: "none" });
  const nowWar = { ...calmBase, getArea: async (id) => ({ ...(await calmBase.getArea(id)), war: { mode: "war", since: "2024-05-01", name: "Fighting in the county" } }) };
  assert.match((await buildAtlasContext({ store: nowWar })).text, /this month was made at peace, but the user's team has since marked this area at war \(Fighting in the county\) since 2024-05-01/);
  // The same day by another name changes no number: nothing is said.
  assert.equal(warSettingNote({ id: "area-grid", war: { mode: "war", since: "2023-08-01", name: "Another name" } }, { conflict: team }), "");
  assert.equal(warSettingNote({ id: "area-grid" }, { conflict: team }), "", "no outline: what the list says cannot be told");
  assert.equal(warSettingNote({ id: "area-grid", war: { mode: "peace" } }, {}), "", "an older run that does not say");

  // At peace by the team's choice, the data warnings do not repeat it.
  const peaceBase = fakeStore(gridCells(), { conflict: null, conflictSource: "area", accessSource: "none" });
  const checks = { passed: 2, total: 2, warnings: [TEAM_PEACE_WARNING] };
  const peace = { ...peaceBase, getRun: async (id) => ({ ...(await peaceBase.getRun(id)), checks }) };
  const peaceText = (await buildAtlasContext({ store: peace })).text;
  assert.match(peaceText, /War: none\. The user's team marked this area as not at war/);
  assert.doesNotMatch(peaceText, /Data warnings:/);
});

test("how damage behaves over time is said only for a run made with the current method", async () => {
  const ukraine = { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" };
  const current = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: ukraine, method: { version: METHOD_VERSION } }) });
  assert.match(current.text, /does not shrink from one month to the next/);
  assert.doesNotMatch(current.text, /older method/);
  for (const method of [undefined, { version: "2026-10-19.2" }]) {
    const older = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: ukraine, ...(method ? { method } : {}) }) });
    assert.match(older.text, /This month was made with an older method/);
    assert.doesNotMatch(older.text, /does not shrink/);
  }
});

test("an older Ukraine run (no conflict, no accessSource) still reads as the war, fires-based access (10.6)", async () => {
  const base = fakeStore(gridCells());
  const firesWarning = "Distance to fighting is estimated from unusual fires of the last 12 months (far more than in 2019-2021; no ACLED file), so treat safe access as rough.";
  const store = {
    ...base,
    getRun: async (id) => {
      const run = await base.getRun(id);
      return run && { ...run, areaId: "country-804", checks: { passed: 2, total: 2, warnings: [firesWarning] } };
    },
  };
  const ctx = await buildAtlasContext({ store });
  assert.match(ctx.text, /War: Full-scale invasion of Ukraine, since 2022-02-24/);
  assert.match(ctx.text, /distance to unusual fires \(an estimate of where fighting is/);
  assert.doesNotMatch(ctx.text, /distance to recorded fighting/);
});

test("a month that ends before its war began: the AI is told no war damage is counted and no distance was measured, never 'recorded fighting'", async () => {
  const recent = { id: "area-area-grid", name: "Recent war", since: "2026-10-01", source: "area" };
  const line = conflictLine(recent, "none", { setByTeam: true, beforeWar: true });
  assert.match(line, /^War: Recent war, since 2026-10-01\. This war was set by the user's team/);
  assert.match(line, /This month ends before the war began, so no war damage is counted for it \(no war year of fires, no war season of radar: the damage score is 0 everywhere\) and distance to fighting was not measured for it\./);
  assert.match(line, /Safe access: not measured for this month, so it is full \(100\) everywhere and nothing is set aside for it\. That does NOT mean the land is safe/);
  assert.doesNotMatch(line, /Damage is counted from that day|recorded fighting|worst war year/);
  // In a war month, "none" (nothing measured) is not recorded fighting either.
  assert.doesNotMatch(conflictLine({ id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }, "none"), /recorded fighting/);

  const ctx = await buildAtlasContext({ store: fakeStore(gridCells().map((c) => ({ ...c, distance: 1 })), { conflict: recent, conflictSource: "area", accessSource: "none" }) });
  assert.match(ctx.text, /This month ends before the war began/);
  assert.match(ctx.text, /nothing is set aside \(this month ends before the war began on 2026-10-01\)/);
  assert.match(ctx.text, /Long term blends/);
  assert.match(ctx.text, /Top places, long term:/);
  assert.doesNotMatch(ctx.text, /recorded fighting|Damage is counted from that day/);
  assert.equal((await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 1 })).weightsUsed.safeAccess, "not used: full everywhere (this month ends before the war began on 2026-10-01)");
});

test("a team's 'Not at war' is never 'no war recorded' for the AI: the war line, the weights, get_ranking and budget_coverage", async () => {
  const calm = conflictLine(null, "none", { setByTeam: true });
  assert.match(calm, /Safe access: the user's team marked this area as not at war, so it is full \(100\) everywhere and nothing is set aside for it\. That does NOT mean the land is safe/);
  const settings = { weights: { soil: 30, damage: 40, access: 30 }, gatePercentile: 30, r: 0.5 };
  const teamPeaceRun = { conflict: null, conflictSource: "area", accessSource: "none" };
  assert.match(settingsLine(settings, teamPeaceRun, { places: [] }, "nearTerm"), /nothing is set aside \(the user's team marked this area as not at war\)/);
  const ctx = await buildAtlasContext({ store: fakeStore(gridCells().map((c) => ({ ...c, distance: 1 })), teamPeaceRun) });
  assert.doesNotMatch(ctx.text, /no war (is )?recorded/i);
  const ranking = await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 1 });
  assert.equal(ranking.weightsUsed.safeAccess, "not used: full everywhere (the user's team marked this area as not at war)");
  const budget = await ctx.runTool("budget_coverage", { usd: 1000000 });
  assert.match(budget.note, /^Rough ranges for restoring damaged soil\. The user's team marked this area as not at war; this does not say the land is safe\./);
  // The app's own peace keeps its words.
  const listPeace = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: null, conflictSource: "list", accessSource: "none" }) });
  assert.match((await listPeace.runTool("budget_coverage", { usd: 1000000 })).note, /No war is recorded in this area/);
});

test("a war the team set without a name is not called by the stand-in name", () => {
  const unnamed = conflictLine({ id: "area-area-grid", name: "War (set for this area)", since: "2024-06-25", source: "area" }, "fires", { setByTeam: true });
  assert.match(unnamed, /its start date is the team's; the team gave it no name, so call it the war the user's team set for this area, not by a name/);
  assert.doesNotMatch(unnamed, /its name and start date are the team's/);
});

test("a war that covers a whole-country area only in part: the AI is told where its rules apply, and which places and costs are outside it", async () => {
  const border = { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24", partOfCountry: true };
  // The strong corner (rows 0 and 1) touches the war's region; the rest was read at peace.
  const cells = gridCells().map((c) => ({ ...c, atWar: /^r[01]c/.test(c.id) }));
  const ctx = await buildAtlasContext({ store: fakeStore(cells, { conflict: border, conflictSource: "list", accessSource: "fires", warSquares: 12, method: { version: METHOD_VERSION } }) });
  assert.match(ctx.text, /This war covers only part of this country: its rules apply only in the map squares that touch the war's region \(12 of 36 squares\), which have atWar true in their details\. The other squares were read as at peace: there heavy damage needs radar change of 3 dB or more AND an unusual fire within 1 km/);
  assert.match(ctx.text, /Do not talk about fighting, a front line or demining for a place outside the war's region unless the user raises it\./);
  assert.match(ctx.text, /\(outside the war's region: read as at peace\)/);
  const inside = await ctx.runTool("get_place", { cellId: "r0c0" });
  const outside = await ctx.runTool("get_place", { cellId: "r5c5" });
  assert.equal(inside.place.atWar, true);
  assert.match(inside.place.recoveryCostUsd.note, /before demining/);
  assert.equal(outside.place.atWar, false);
  assert.doesNotMatch(outside.place.recoveryCostUsd.note, /demining/);
  // (The strong corner is set aside in Near term: the long view has it.)
  const ranking = await ctx.runTool("get_ranking", { timeframe: "postwar", limit: 10 });
  assert.ok(ranking.places.some((p) => p.outsideWarRegion === true));
  assert.ok(ranking.places.some((p) => !p.outsideWarRegion && p.cellIds.includes("r0c0")));
  // A war over the whole area says nothing of the kind.
  const whole = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: { ...border, partOfCountry: undefined }, conflictSource: "list", accessSource: "fires" }) });
  assert.doesNotMatch(whole.text, /covers only part|outside the war's region/);
});
