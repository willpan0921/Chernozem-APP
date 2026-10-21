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
import { buildAtlasContext, fallbackGroupHotspots, coordLabel, placeLabel, ATLAS_TOOLS, conflictLine, settingsLine, warSettingNote, newSeasonFact } from "./context.js";
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

test("the war-setting note never calls a war the team set without a name by the stand-in name (as the war line)", () => {
  const geometry = { type: "Polygon", coordinates: [[[36, -1], [37, -1], [37, 0], [36, 0], [36, -1]]] };
  const area = { id: "area-k", createdAt: "x", geometry, bbox: [36, -1, 37, 0], war: { mode: "war", since: "2026-06-01" } };
  const madeAtPeace = { month: "2026-09", conflict: null, conflictSource: "list" };
  const note = warSettingNote(area, madeAtPeace);
  assert.equal(note, "War setting changed: this month was made at peace, but the user's team has since marked this area at war since 2026-06-01. Its numbers follow the setting it was made with until the analysis is re-run (Atlas Settings, Re-run analysis).");
  assert.doesNotMatch(note, /War \(set for this area\)/);
  // A name of its own is said.
  assert.match(warSettingNote({ ...area, war: { mode: "war", since: "2026-06-01", name: "Fighting in the Rift" } }, madeAtPeace), /marked this area at war \(Fighting in the Rift\) since 2026-06-01\./);
});

test("a war that covers a whole-country area only in part: the AI is told where its rules apply, and which places and costs are outside it", async () => {
  const border = { id: "thailand-cambodia", name: "Cambodia–Thailand border conflict", since: "2025-07-24", partOfCountry: true };
  // The strong corner (rows 0 and 1) touches the war's region; the rest has the peace rules.
  const cells = gridCells().map((c) => ({ ...c, atWar: /^r[01]c/.test(c.id) }));
  const ctx = await buildAtlasContext({ store: fakeStore(cells, { conflict: border, conflictSource: "list", accessSource: "fires", warSquares: 12, method: { version: METHOD_VERSION } }) });
  assert.match(ctx.text, /This war covers only part of this country: its rules apply only in the map squares that touch the war's region \(12 of 36 squares\), which have atWar true in their details\. The other squares \(atWar false\) keep the war's dates \(damage counted from the day it began, its fire years and war seasons\), but two things there follow the peace rules: heavy damage needs radar change of 3 dB or more AND an unusual fire within 1 km, and the damage score is the heavily damaged share of the black soil \(full at 20%\)\. Without an ACLED file, every square's distance to fighting is measured to the unusual fires inside the war's region; unusual fires in the other squares do not count as fighting/);
  assert.doesNotMatch(ctx.text, /read as at peace/, "the other squares keep the war's dates: never 'read as at peace'");
  assert.doesNotMatch(ctx.text, /another listed war/, "no square lies in another listed war");
  assert.match(ctx.text, /Do not talk about fighting, a front line or demining for a place whose squares all have atWar false unless the user raises it\./);
  assert.match(ctx.text, /\(outside the war's squares: heavy damage and the damage score by the peace rules\)/);
  // A region (or a box, or a drawn area) across the edge of the war's
  // boxes: "this area", not "this country".
  const region = await buildAtlasContext({ store: fakeStore(cells, { conflict: { ...border, partOf: "area" }, conflictSource: "list", accessSource: "fires", warSquares: 12, method: { version: METHOD_VERSION } }) });
  assert.match(region.text, /This war covers only part of this area: its rules apply only in the map squares that touch the war's region \(12 of 36 squares\)/);
  assert.doesNotMatch(region.text, /part of this country/);
  // Across a border, squares in another listed war have the war's rules
  // too (run.otherWarSquares); with an ACLED file nothing is said of
  // fires standing in for fighting (distance is to its battles).
  const across = await buildAtlasContext({ store: fakeStore(cells, { conflict: { ...border, partOf: "area" }, conflictSource: "list", accessSource: "acled", warSquares: 12, otherWarSquares: 4, method: { version: METHOD_VERSION } }) });
  assert.match(across.text, /its rules apply only in the map squares that touch the war's region or lie in another listed war \(12 of 36 squares\), which have atWar true in their details\. 4 of them lie in another war of the app's list without touching this war's region: that is land at war too \(counted with this war's dates\)\./);
  assert.match(across.text, /Safe access: the distance to battles in the ACLED file/);
  assert.doesNotMatch(across.text, /measured to the unusual fires|ordinary causes|three things/);
  const acrossFires = await buildAtlasContext({ store: fakeStore(cells, { conflict: { ...border, partOf: "area" }, conflictSource: "list", accessSource: "fires", warSquares: 12, otherWarSquares: 4, method: { version: METHOD_VERSION } }) });
  assert.match(acrossFires.text, /every square's distance to fighting is measured to the unusual fires inside the war's region and its squares in another listed war;/);
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
  assert.doesNotMatch(whole.text, /covers only part|outside the war's squares/);
});

test("the month a new growing season joins the damage radar: the AI is told most of the new damage is older damage (context text, history, get_history)", async () => {
  // Kharkiv oblast, real data: September 2026 holds the 2026 season (5
  // seasons), August 2026 did not (4): +64,904 ha.
  const imagery = {
    "2026-08": { from: "2022-03", to: "2025-08", label: "March to August of 2022 to 2025", seasons: 4 },
    "2026-09": { from: "2022-03", to: "2026-08", label: "March to August of 2022 to 2026", seasons: 5 },
  };
  const base = fakeStore(gridCells(), { conflict: { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" }, conflictSource: "list", accessSource: "fires", method: { version: METHOD_VERSION } });
  const withSeasons = (run) => (run ? { ...run, imagery: imagery[run.month] } : run);
  const store = { ...base, getRun: async (id) => withSeasons(await base.getRun(id)), listRuns: async () => (await base.listRuns()).map(withSeasons) };
  const ctx = await buildAtlasContext({ store });
  assert.match(ctx.text, /New heavy damage since the previous month: 40 ha\. This is the first month that counts the radar images of the 2026 growing season: most of this month's new heavy damage is older damage, radar change seen over that whole season, not damage done within this one month\. Say so when you talk about this month's new damage\./);
  assert.match(ctx.text, /- 2026-09: heavily damaged 680 ha, new 40 ha \(first month with the radar images of the 2026 growing season\),/);
  assert.match(ctx.text, /- 2026-08: heavily damaged 640 ha, new 0 ha, black-soil/, "no month before it: no season joined");
  const history = await ctx.runTool("get_history", {});
  assert.match(history.months.find((m) => m.month === "2026-09").newGrowingSeason, /^the radar images of the 2026 growing season are counted from this month: most of this month's new heavy damage is older damage/);
  assert.equal(history.months.find((m) => m.month === "2026-08").newGrowingSeason, undefined);

  // The same seasons in both months: nothing is said.
  const same = { ...base, getRun: async (id) => ({ ...(await base.getRun(id)), imagery: imagery["2026-09"] }), listRuns: async () => (await base.listRuns()).map((s) => ({ ...s, imagery: imagery["2026-09"] })) };
  const plain = await buildAtlasContext({ store: same });
  assert.doesNotMatch(plain.text, /radar images of the|first month that counts/);
});

test("a growing season that joins with no new heavy damage: the AI is told which season joined and why heavily damaged land can fall, never that most of it is older damage (real data: Iowa, November 2025)", async () => {
  // Iowa, real data: the damage radar went from 1 season to 2 (2024 and
  // 2025), heavy damage fell from 2,385 ha to 764 ha, 0 ha new.
  const imagery = {
    "2026-08": { from: "2024-04", to: "2024-09", label: "April to September 2024", seasons: 1 },
    "2026-09": { from: "2024-04", to: "2025-09", label: "April to September of 2024 to 2025", seasons: 2 },
  };
  const base = fakeStore(gridCells(), { conflict: null, conflictSource: "list", accessSource: "none", method: { version: METHOD_VERSION } });
  const fell = (run) => (run ? { ...run, imagery: imagery[run.month], ...(run.month === "2026-09" ? { newHeavyDamageHa: 0, totals: { ...run.totals, heavyDamageHa: 764 } } : { totals: { ...run.totals, heavyDamageHa: 2385 } }) } : run);
  const store = { ...base, getRun: async (id) => fell(await base.getRun(id)), listRuns: async () => (await base.listRuns()).map(fell) };
  const ctx = await buildAtlasContext({ store });
  assert.match(ctx.text, /New heavy damage since the previous month: 0 ha\. This is the first month that counts the radar images of the 2025 growing season\. No new heavy damage was found: with two complete seasons for the first time, a change must now last over both to count as heavy damage, so heavily damaged land can fall this month; that alone does not mean land recovered\./);
  assert.doesNotMatch(ctx.text, /older damage|most of this month's new heavy damage|Say so when you talk/);
  assert.match(ctx.text, /- 2026-09: heavily damaged 764 ha, new 0 ha \(first month with the radar images of the 2025 growing season\),/);
  const history = await ctx.runTool("get_history", {});
  const sep = history.months.find((m) => m.month === "2026-09");
  assert.equal(sep.newHeavyDamageHa, 0);
  assert.equal(sep.newGrowingSeason, "the radar images of the 2025 growing season are counted from this month; no new heavy damage: with two complete seasons for the first time, a change must now last over both to count as heavy damage, so heavily damaged land can fall this month; that alone does not mean land recovered.");
  // As many seasons, a later one (at peace the two-year window lets the
  // oldest go: Kenya, January 2026), and no new damage: the general reason,
  // never "two seasons".
  const swap = {
    "2026-08": { from: "2024-01", to: "2024-12", seasons: 1 },
    "2026-09": { from: "2025-01", to: "2025-12", seasons: 1 },
  };
  const swapped = (run) => (run ? { ...run, imagery: swap[run.month], ...(run.month === "2026-09" ? { newHeavyDamageHa: 0 } : {}) } : run);
  const kenya = await buildAtlasContext({ store: { ...base, getRun: async (id) => swapped(await base.getRun(id)), listRuns: async () => (await base.listRuns()).map(swapped) } });
  assert.match(kenya.text, /This is the first month that counts the radar images of the 2025 growing season\. No new heavy damage was found: heavily damaged land is now measured over other seasons than the month before's \(the new season can also change the orbit direction the radar is compared from\), so it can fall;/);
  assert.doesNotMatch(kenya.text, /two complete seasons|older damage/);
});

test("the AI is told when a season left the two-year window, and why heavy damage moved", () => {
  const month = (m, imagery, more = {}) => ({ id: `run-${m}`, areaId: "admin1-gaul1-908", month: m, provider: "gee", conflict: null, method: { version: METHOD_VERSION }, imagery, newHeavyDamageHa: 0, ...more });
  const mar = month("2026-03", { from: "2024-04", to: "2025-09", seasons: 2 });
  const apr = month("2026-04", { from: "2025-04", to: "2025-09", seasons: 1 }, { newHeavyDamageHa: 12300 });
  const fact = newSeasonFact(apr, [apr, mar]);
  assert.match(fact, /first month without the radar images of the 2024 growing season \(it left the two-year window\)/);
  assert.match(fact, /change in what is compared/);
  assert.doesNotMatch(fact, /older damage/);
  assert.equal(newSeasonFact(mar, [apr, mar]), "");
});

// ---------- Safe access in a war where no fire looked like fighting ----------

// The AI's line, word for word (ACCESS-SPEC, 2026-10-21).
const NOT_MEASURED_LINE =
  "Safe access: not measured here (no fires that look like fighting were found within 300 km, and there is no ACLED file); every square reads as far from fighting, which does not mean safe. Never call land safe; point to local authorities and an ACLED file.";
const NO_FIGHTING_WARNING =
  "No fires that look like fighting were found within 300 km in the last 12 months (the rule needs fire as dense as at a front line, about 1 detection per km² within 10 km and 3 times the normal years' rate; scattered strikes do not reach it). Safe access is not measured here: every square counts as far from fighting, which does NOT make the land safe. An ACLED file of recorded fighting would measure it.";
const lebanonWar = { id: "israel-hezbollah", name: "Israel–Hezbollah war (south Lebanon, northern Israel and the Golan Heights)", since: "2023-10-08" };

test("in a war where no fire looked like fighting, the AI is told safe access is not measured and never to call land safe", async () => {
  const line = conflictLine(lebanonWar, "fires-none");
  assert.ok(line.endsWith(NOT_MEASURED_LINE), line);
  assert.match(line, /^War: Israel–Hezbollah war .*, since 2023-10-08\. Damage is counted from that day\./);
  assert.doesNotMatch(line, /distance to unusual fires|full at 100 km|Treat it as rough|recorded fighting/);
  // A war in part of the area: only the fires inside its region counted,
  // none looked like fighting, and no square's distance "is measured".
  const inPart = conflictLine({ ...lebanonWar, partOfCountry: true }, "fires-none", { inPart: { warSquares: 12, squares: 36, of: "country", otherWar: 0 } });
  assert.match(inPart, /Safe access: not measured here \(no fires that look like fighting were found within 300 km inside the war's region, and there is no ACLED file\)/);
  assert.match(inPart, /Without an ACLED file, only the fires inside the war's region could stand in for fighting, and none of them looked like fighting, so safe access is not measured in any square;/);
  assert.doesNotMatch(inPart, /is measured to the unusual fires/);
  assert.match(conflictLine({ ...lebanonWar, partOfCountry: true }, "fires-none", { inPart: { warSquares: 12, squares: 36, of: "area", otherWar: 4 } }), /within 300 km inside the war's region and its squares in another listed war, and there is no ACLED file/);

  // The weights as used: nothing set aside, and why (never "no war recorded").
  const settings = { weights: { soil: 30, damage: 40, access: 30 }, gatePercentile: 30, r: 0.5 };
  const scored = { places: [{ nearTerm: { tier: "high" } }] };
  const weights = settingsLine(settings, { conflict: lebanonWar, accessSource: "fires-none" }, scored, "postwar");
  assert.match(weights, /Near term ranks by soil value 43% and damage 57%; nothing is set aside \(safe access is not measured here: no fires that look like fighting were found within 300 km, and there is no ACLED file\)\./);
  assert.match(weights, /Postwar blends soil value 30%, damage 40% and safe access 30% \(weighted power mean, r = 0\.5\); safe access is not measured here \(it reads 100 everywhere, which does not mean safe\), so it changes no order/);
  assert.doesNotMatch(weights, /no war recorded|least safe|Long term/);

  // The whole context and the tools (the run carries the provider's warning).
  const base = fakeStore(gridCells().map((c) => ({ ...c, distance: 1 })), { conflict: lebanonWar, conflictSource: "list", accessSource: "fires-none" });
  const checks = { passed: 6, total: 6, warnings: [NO_FIGHTING_WARNING] };
  const ctx = await buildAtlasContext({ store: { ...base, getRun: async (id) => ({ ...(await base.getRun(id)), checks }) } });
  assert.ok(ctx.text.includes(NOT_MEASURED_LINE));
  assert.ok(ctx.text.includes(`Data warnings: ${NO_FIGHTING_WARNING.replace(/\.$/, "")}.`));
  assert.match(ctx.text, /soil \d+ \/ damage \d+ \/ access not measured$/m);
  assert.doesNotMatch(ctx.text, /\/ access \d+/);
  assert.doesNotMatch(ctx.text, /distance to unusual fires|safe to reach/);
  const ranking = await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 3 });
  assert.equal(ranking.weightsUsed.safeAccess, "not used: safe access is not measured here: no fires that look like fighting were found within 300 km, and there is no ACLED file; it reads 100 everywhere, which does not mean safe, and nothing is set aside");
  assert.equal(ranking.safeAccess, "not measured here (no fires that look like fighting were found within 300 km, and there is no ACLED file): every place's access of 100 only means nothing was found, not that it is safe");
  assert.equal(ranking.setAsideCells, 0);
  const postwar = await ctx.runTool("get_ranking", { timeframe: "postwar", limit: 3 });
  assert.equal(postwar.safeAccess, ranking.safeAccess);
  const place = await ctx.runTool("get_place", { cellId: "r0c0" });
  assert.equal(place.safeAccess, ranking.safeAccess);
  assert.match(place.place.recoveryCostUsd.note, /before demining/, "still a war");

  // The place picked on the map ("Ask AI"): its access reads "not
  // measured", as on the Map page, with the tools' note; never a bare 100.
  const picked = await buildAtlasContext({ store: { ...base, getRun: async (id) => ({ ...(await base.getRun(id)), checks }) }, context: { selectedCellId: "r0c0" } });
  const selectedLine = picked.text.split("\n").find((line) => line.startsWith("The user has this cell selected on the map: "));
  const selected = JSON.parse(selectedLine.replace("The user has this cell selected on the map: ", ""));
  assert.equal(selected.cellId, "r0c0");
  assert.equal(selected.scores.access, "not measured");
  assert.equal(selected.safeAccess, ranking.safeAccess);
  assert.doesNotMatch(picked.text, /"access":\d/);
});

test("with an ACLED file connected but no battles near the area, the AI is never told there is no ACLED file", async () => {
  const warnings = ["The ACLED file has no battles within 300 km of this area in the last 12 months.", NO_FIGHTING_WARNING];
  const base = fakeStore(gridCells().map((c) => ({ ...c, distance: 1 })), { conflict: lebanonWar, conflictSource: "list", accessSource: "fires-none" });
  const ctx = await buildAtlasContext({ store: { ...base, getRun: async (id) => ({ ...(await base.getRun(id)), checks: { passed: 6, total: 6, warnings } }) }, context: { selectedCellId: "r0c0" } });
  assert.ok(
    ctx.text.includes(
      "Safe access: not measured here (no fires that look like fighting were found within 300 km, and the ACLED file has no battles within 300 km of this area); every square reads as far from fighting, which does not mean safe. Never call land safe; point to local authorities and ACLED data that covers this area (only battles count, not strikes).",
    ),
    ctx.text,
  );
  assert.match(ctx.text, /nothing is set aside \(safe access is not measured here: no fires that look like fighting were found within 300 km, and the ACLED file has no battles within 300 km of this area\)/);
  const ranking = await ctx.runTool("get_ranking", { timeframe: "nearTerm", limit: 2 });
  assert.match(ranking.safeAccess, /^not measured here \(no fires that look like fighting were found within 300 km, and the ACLED file has no battles within 300 km of this area\)/);
  for (const text of [ctx.text.replace(/Data warnings: .*$/m, ""), ranking.safeAccess, ranking.weightsUsed.safeAccess]) {
    assert.doesNotMatch(text, /there is no ACLED file/, text);
  }
  // A war in part of the area, with an ACLED file that could not be used.
  const inPart = conflictLine({ ...lebanonWar, partOfCountry: true }, "fires-none", { inPart: { warSquares: 12, squares: 36, of: "country", otherWar: 0 }, acled: "unusable" });
  assert.match(inPart, /and the ACLED file could not be used\); .* point to local authorities and fixing the ACLED file \(see the data warnings\)\./);
  assert.match(inPart, / Without a usable ACLED file, only the fires inside the war's region could stand in for fighting/);
  assert.doesNotMatch(inPart, /there is no ACLED file|Without an ACLED file/);
});

test("with fires that look like fighting, an ACLED file or at peace, the AI's words on safe access are as before", async () => {
  const fires = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: lebanonWar, conflictSource: "list", accessSource: "fires" }), context: { selectedCellId: "r0c0" } });
  assert.match(fires.text, /Safe access: the distance to unusual fires \(an estimate of where fighting is; there is no ACLED file of recorded fighting\), full at 100 km\. Treat it as rough\./);
  assert.match(fires.text, /\/ access \d+$/m);
  assert.doesNotMatch(fires.text, /not measured/);
  // The selected place keeps its number, with no note.
  assert.match(fires.text, /^The user has this cell selected on the map: \{"cellId":"r0c0",.*"access":\d+\}/m);
  assert.doesNotMatch(fires.text, /"safeAccess"/);
  const firesRanking = await fires.runTool("get_ranking", { timeframe: "nearTerm", limit: 3 });
  assert.equal(firesRanking.weightsUsed.safeAccess, "cutoff, not a weight");
  assert.equal("safeAccess" in firesRanking, false);
  assert.equal("safeAccess" in (await fires.runTool("get_place", { cellId: "r0c0" })), false);
  assert.match(conflictLine(lebanonWar, "acled"), /Safe access: the distance to battles in the ACLED file, full at 100 km\.$/);
  const peace = await buildAtlasContext({ store: fakeStore(gridCells(), { conflict: null, conflictSource: "list", accessSource: "none" }) });
  assert.match(peace.text, /Safe access: no war is recorded here, so it is full \(100\) everywhere and nothing is set aside for it\./);
  assert.equal("safeAccess" in (await peace.runTool("get_ranking", { timeframe: "nearTerm", limit: 1 })), false);
});
