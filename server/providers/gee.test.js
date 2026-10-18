// WHAT THIS FILE DOES
// Tests the Earth Engine provider (gee.js) and the ACLED reader
// (acled.js): date windows, cell sizes, chunking, turning Earth Engine
// results into readings, alerts, error messages and CSV parsing. The whole
// analysis is also run end to end against a stand-in for Earth Engine
// (fake-ee.js), which checks what gee.js asks Earth Engine for (no null
// values, pixel sizes, chunks, dates) and gives back believable numbers.
// Real Earth Engine needs credentials; `npm run gee:check` does that.
//
// WHO EDITS IT
// Whoever changes gee.js or acled.js. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  monthBounds,
  monthWindows,
  shiftDays,
  daysBefore,
  lastDay,
  reduceScale,
  cellSquare,
  expandBboxKm,
  chunk,
  mapLimit,
  withTimeout,
  toReading,
  placeLabel,
  pickAlerts,
  alertDate,
  parseAdmin1Id,
  searchVariants,
  toPolygonal,
  explainGeeError,
  socToChernozem,
  setupProblems,
  isGeeConfigured,
  GeeError,
  geeProvider,
  createGeeProvider,
  clampWindow,
  chunkSizeFor,
  tileScaleFor,
  coarserScale,
  populationPlan,
  isTooMuchWorkError,
  isUnknownArgumentError,
  fromSentinel,
  cleanCounts,
  DATASETS,
} from "./gee.js";
import { createFakeEe } from "./fake-ee.js";
import { parseCsvRecords, parseCsv, parseAcledDate, toEvent, battlePoints, acledWindow, acledBattlesFor, acledStatus } from "./acled.js";

// ---------- Date windows ----------

test("monthBounds gives the month with an exclusive end", () => {
  assert.deepEqual(monthBounds("2026-09"), { start: "2026-09-01", end: "2026-10-01" });
  assert.deepEqual(monthBounds("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
});

test("growing-season months compare with the same months of 2021", () => {
  const w = monthWindows("2026-09");
  assert.deepEqual(w.season, { start: "2026-04-01", end: "2026-10-01", from: "2026-04", to: "2026-09" });
  assert.deepEqual(w.baseline, { start: "2021-04-01", end: "2021-10-01" });
  assert.deepEqual(monthWindows("2026-04").baseline, { start: "2021-04-01", end: "2021-05-01" });
});

test("winter months use the last full April-October season", () => {
  const feb = monthWindows("2026-02");
  assert.deepEqual(feb.season, { start: "2025-04-01", end: "2025-11-01", from: "2025-04", to: "2025-10" });
  assert.deepEqual(feb.baseline, { start: "2021-04-01", end: "2021-11-01" });
  const dec = monthWindows("2025-12");
  assert.equal(dec.season.start, "2025-04-01");
  assert.equal(dec.season.end, "2025-11-01");
});

test("radar, fire and night-light windows", () => {
  const w = monthWindows("2026-01");
  assert.deepEqual(w.month, { start: "2026-01-01", end: "2026-02-01" });
  assert.deepEqual(w.s1Prior, { start: "2025-10-01", end: "2026-01-01" });
  assert.deepEqual(w.firmsWar, { start: "2022-02-24", end: "2026-02-01" });
  assert.deepEqual(w.last90, { start: "2025-11-03", end: "2026-02-01" });
  assert.deepEqual(w.viirsSearch, { start: "2025-08-01", end: "2026-02-01" });
  assert.equal(monthWindows("2021-06").firmsWar, null);
  assert.deepEqual(monthWindows("2022-02").firmsWar, { start: "2022-02-24", end: "2022-03-01" });
});

test("day arithmetic", () => {
  assert.equal(shiftDays("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDays("2024-03-01", -1), "2024-02-29");
  assert.equal(lastDay("2026-09"), "2026-09-30");
  assert.equal(lastDay("2026-02"), "2026-02-28");
  const w = daysBefore(Date.UTC(2026, 8, 20, 13), 30);
  assert.deepEqual(w, { start: "2026-08-22", end: "2026-09-21", last: "2026-09-20" });
});

// ---------- Sizes ----------

test("reduceScale is about 20 pixels per cell, between 10 m and 1 km", () => {
  // Ukraine-sized cells (0.25° ≈ 18 km wide at 49° N) -> ~913 m.
  assert.equal(reduceScale(0.25, 49), 913);
  // Bigger cells hit the 1 km cap.
  assert.equal(reduceScale(0.5, 49), 1000);
  // 0.05° at 49° N is ~3.65 km wide -> ~183 m.
  assert.equal(reduceScale(0.05, 49), 183);
  // A farm cell (0.0005°) is ~36 m wide -> floor of 10 m.
  assert.equal(reduceScale(0.0005, 49), 10);
});

test("cellSquare is centred on the cell", () => {
  assert.deepEqual(cellSquare(49.74, 37.54, 0.01), [37.535, 49.735, 37.545, 49.745]);
});

test("expandBboxKm grows the box and stays on the globe", () => {
  const [w, s, e, n] = expandBboxKm([30, 48, 31, 49], 300);
  assert.ok(Math.abs(s - (48 - 300 / 111.32)) < 1e-9);
  assert.ok(Math.abs(n - (49 + 300 / 111.32)) < 1e-9);
  assert.ok(w < 30 - 2.7 && e > 31 + 2.7);
  assert.deepEqual(expandBboxKm([-179.9, -89, 179.9, 89], 300), [-180, -90, 180, 90]);
});

test("chunk splits into pieces of at most 250", () => {
  const cells = Array.from({ length: 600 }, (_, i) => i);
  const parts = chunk(cells, 250);
  assert.deepEqual(parts.map((p) => p.length), [250, 250, 100]);
  assert.equal(parts[2][0], 500);
  assert.deepEqual(chunk([], 250), []);
});

test("mapLimit keeps order and the limit", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([30, 10, 20, 5], 2, async (ms, i) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, ms));
    running -= 1;
    return i * 10;
  });
  assert.deepEqual(out, [0, 10, 20, 30]);
  assert.equal(peak, 2);
});

test("withTimeout rejects with a clear GeeError", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, "Measuring cells"), (error) => {
    assert.ok(error instanceof GeeError);
    assert.equal(error.code, "timeout");
    assert.match(error.message, /Measuring cells took longer than 0 seconds/);
    return true;
  });
  assert.equal(await withTimeout(Promise.resolve(7), 1000), 7);
});

// ---------- Readings ----------

test("toReading maps Earth Engine means and sums to the raw reading", () => {
  const cell = { id: "r1c2", lat: 49.74, lon: 37.54 };
  const reading = toReading(
    cell,
    { id: "r1c2", chernozemCrop: 0.81234, chernozemAll: 0.5, cropland: 0.7, chiDrop: 0.123456, heavy: 0.3, firesWar: 0.12, conflictM: 15500, lights: 2.5 },
    { id: "r1c2", people: 1234.6 },
    { cellSizeDeg: 0.01, names: { admin1: "Kharkivs'ka", admin2: "Chuhuivs'kyi" } },
  );
  assert.deepEqual(reading, {
    id: "r1c2",
    chernozem: 0.8123,
    croplandShare: 0.7,
    firesPer100Km2: 12,
    chiDrop: 0.1235,
    conflictKm: 15.5,
    popPerKm2: Math.round((1234.6 / ((0.01 * 111.32) ** 2 * Math.cos((49.74 * Math.PI) / 180))) * 100) / 100,
    lights: 2.5,
    heavyShare: 0.3,
    population: 1235,
    admin1: "Kharkivs'ka",
    admin2: "Chuhuivs'kyi",
  });
});

test("toReading fills gaps safely", () => {
  const reading = toReading({ id: "a", lat: 0, lon: 0 }, undefined, undefined, { cellSizeDeg: 0.1 });
  assert.equal(reading.chernozem, 0);
  assert.equal(reading.croplandShare, 0);
  assert.equal(reading.chiDrop, null); // no imagery: unknown, not "no damage"
  assert.equal(reading.conflictKm, 300);
  assert.equal(reading.population, 0);
  assert.equal(reading.heavyShare, 0);
  assert.equal("admin1" in reading, false);
  // No cropland: chernozem from the land; values kept in range.
  const r2 = toReading({ id: "b", lat: 0, lon: 0 }, { chernozemAll: 1.4, cropland: -0.1, heavy: 2, sum: 10 }, { sum: 10 }, { cellSizeDeg: 0.1 });
  assert.equal(r2.chernozem, 1);
  assert.equal(r2.croplandShare, 0);
  assert.equal(r2.heavyShare, 1);
  assert.equal(r2.population, 10);
});

test("socToChernozem uses 5 g/kg units and the notebook's (SOC-10)/50 scale", () => {
  assert.equal(socToChernozem(2), 0); // 10 g/kg
  assert.equal(socToChernozem(8), 0.6); // 40 g/kg
  assert.equal(socToChernozem(20), 1); // 100 g/kg, capped
  assert.equal(socToChernozem(NaN), null);
});

// ---------- Alerts ----------

const cand = (id, lat, lon, extra) => ({ id, lat, lon, radarShare: 0, radarKm2: 0, fires: 0, ...extra });

test("pickAlerts groups touching cells, alternates kinds, keeps 6", () => {
  const size = 0.1;
  const candidates = [
    cand("r0c0", 50, 30, { radarShare: 0.4, radarKm2: 30 }),
    cand("r0c1", 50, 30.1, { radarShare: 0.2, radarKm2: 15 }), // touches r0c0 -> same alert
    cand("r5c5", 49.5, 30.5, { radarShare: 0.1, radarKm2: 8, admin1: "Kyivs'ka", admin2: "Bucha" }),
    cand("r9c9", 49.1, 30.9, { radarShare: 0.01, radarKm2: 1 }), // under 5%: no alert
    ...Array.from({ length: 6 }, (_, i) => cand(`f${i}`, 40 + i, 20, { fires: 10 - i })),
  ];
  const alerts = pickAlerts(candidates, { cellSizeDeg: size, month: "2026-09" });
  assert.equal(alerts.length, 6);
  assert.deepEqual(alerts.map((a) => a.kind), ["radar", "fire", "radar", "fire", "fire", "fire"]);
  assert.deepEqual(alerts[0].cellIds, ["r0c0", "r0c1"]);
  assert.equal(alerts[0].magnitude, 45);
  assert.equal(alerts[0].unit, "km² changed");
  assert.equal(alerts[0].date, "2026-09-30");
  assert.equal(alerts[0].place, "50.00° N, 30.00° E");
  assert.equal(alerts[2].place, "Bucha, Kyivs'ka");
  assert.equal(alerts[1].unit, "detections");
  assert.equal(alerts[1].magnitude, 10);
  assert.ok(alerts.every((a) => a.id && Array.isArray(a.cellIds)));
});

test("pickAlerts with nothing notable gives no alerts", () => {
  assert.deepEqual(pickAlerts([cand("a", 1, 1, { fires: 0.3 })], { cellSizeDeg: 0.1, month: "2026-09" }), []);
});

test("alertDate uses what Earth Engine found, else the month's last day", () => {
  const radar = { kind: "radar" };
  const fire = { kind: "fire" };
  assert.equal(alertDate(radar, { radarLast: Date.UTC(2026, 8, 14, 4) }, "2026-09"), "2026-09-14");
  assert.equal(alertDate(radar, { radarLast: Date.UTC(2026, 7, 31) }, "2026-09"), "2026-09-30");
  assert.equal(alertDate(fire, { fireDay: 7 }, "2026-09"), "2026-09-07");
  assert.equal(alertDate(fire, { fireDay: 31 }, "2026-09"), "2026-09-30");
  assert.equal(alertDate(fire, null, "2026-02"), "2026-02-28");
});

test("placeLabel", () => {
  assert.equal(placeLabel({ admin1: "A", admin2: "B", lat: 1, lon: 2 }), "B, A");
  assert.equal(placeLabel({ admin1: "A", lat: 1, lon: 2 }), "A");
  assert.equal(placeLabel({ lat: -1.5, lon: -60.25 }), "1.50° S, 60.25° W");
});

// ---------- Regions ----------

test("parseAdmin1Id and searchVariants", () => {
  assert.equal(parseAdmin1Id("gaul1-1234"), 1234);
  assert.equal(parseAdmin1Id(55), 55);
  assert.equal(parseAdmin1Id("ukraine"), null);
  assert.equal(parseAdmin1Id("gaul1-12; drop"), null);
  assert.deepEqual(searchVariants("kharkiv"), ["kharkiv", "Kharkiv", "KHARKIV"]);
  assert.deepEqual(searchVariants("ivano-frankivs'ka"), ["ivano-frankivs'ka", "Ivano-Frankivs'Ka", "IVANO-FRANKIVS'KA"]);
});

test("toPolygonal flattens a GeometryCollection", () => {
  const square = [[[0, 0], [1, 0], [1, 1], [0, 0]]];
  assert.deepEqual(toPolygonal({ type: "Polygon", coordinates: square }), { type: "Polygon", coordinates: square });
  assert.deepEqual(toPolygonal({ type: "GeometryCollection", geometries: [{ type: "Polygon", coordinates: square }, { type: "LineString", coordinates: [] }] }), {
    type: "Polygon",
    coordinates: square,
  });
  assert.deepEqual(
    toPolygonal({ type: "GeometryCollection", geometries: [{ type: "Polygon", coordinates: square }, { type: "MultiPolygon", coordinates: [square, square] }] }).coordinates.length,
    3,
  );
  assert.equal(toPolygonal({ type: "GeometryCollection", geometries: [] }), null);
  assert.equal(toPolygonal(null), null);
});

// ---------- Errors ----------

test("explainGeeError turns Google errors into clear advice", () => {
  const ctx = { projectId: "my-proj", clientEmail: "atlas@my-proj.iam.gserviceaccount.com", asset: "projects/zhaobo/assets/chernozem_wrb_ukraine" };
  const code = (message) => explainGeeError(new Error(message), ctx).code;
  assert.equal(code("Earth Engine API has not been used in project 123 before or it is disabled. Enable it by visiting https://..."), "api_disabled");
  assert.equal(code("Not signed up for Earth Engine or project is not registered. Visit https://developers.google.com/earth-engine/guides/access"), "not_registered");
  assert.equal(code("Project 'projects/my-proj' has not been registered for use with Earth Engine."), "not_registered");
  assert.equal(code("Image.load: Image asset 'projects/zhaobo/assets/chernozem_wrb_ukraine' not found (does not exist or caller does not have access)."), "asset_not_found");
  assert.equal(code("Asset 'projects/zhaobo/assets/chernozem_wrb_ukraine' does not exist or doesn't allow this operation."), "asset_not_found");
  assert.equal(code("invalid_grant: Invalid JWT Signature."), "bad_key");
  assert.equal(code("error:1E08010C:DECODER routines::unsupported"), "bad_key");
  assert.equal(code("Caller does not have required permission to use project my-proj. Grant the caller the roles/serviceusage.serviceUsageConsumer role"), "no_permission");
  assert.equal(code("Too many concurrent aggregations."), "quota");
  assert.equal(code("User memory limit exceeded."), "too_big");
  assert.equal(code("Computation timed out."), "too_big");
  assert.equal(code("getaddrinfo ENOTFOUND earthengine.googleapis.com"), "network");
  assert.equal(code("Something odd"), "gee_error");
  const message = explainGeeError(new Error("Not signed up for Earth Engine"), ctx).message;
  assert.match(message, /my-proj/);
  assert.match(message, /code\.earthengine\.google\.com\/register/);
  assert.match(explainGeeError("caller does not have permission", ctx).message, /atlas@my-proj/);
  const already = new GeeError("timeout", "x");
  assert.equal(explainGeeError(already), already);
});

// ---------- Setup checks ----------

test("setupProblems names exactly what is missing", () => {
  const base = { geeProjectId: null, geeCredentials: null, geeCredentialsError: null, geeDisabled: false };
  assert.deepEqual(setupProblems(base), ["Missing in .env: GEE_PROJECT_ID, GEE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS."]);
  assert.equal(isGeeConfigured(base), false);
  const ready = { ...base, geeProjectId: "p", geeCredentials: { client_email: "a@b", private_key: "k" } };
  assert.deepEqual(setupProblems(ready), []);
  assert.equal(isGeeConfigured(ready), true);
  assert.equal(isGeeConfigured({ ...ready, geeDisabled: true }), false);
  const badFile = { ...base, geeProjectId: "p", geeCredentialsError: "GOOGLE_APPLICATION_CREDENTIALS points to x.json, but that file cannot be read." };
  assert.deepEqual(setupProblems(badFile), [badFile.geeCredentialsError]);
});

test("the provider has the shared interface", () => {
  assert.equal(geeProvider.id, "gee");
  for (const name of ["status", "analyze", "searchAdmin1", "admin1Boundary"]) assert.equal(typeof geeProvider[name], "function");
});

// ---------- ACLED ----------

test("parseCsvRecords handles quotes, commas and line breaks", () => {
  const text = '﻿a,b,c\r\n1,"x, y","say ""hi""\nthere"\n2,,3\n\n';
  assert.deepEqual(parseCsvRecords(text), [
    ["a", "b", "c"],
    ["1", "x, y", 'say "hi"\nthere'],
    ["2", "", "3"],
  ]);
  assert.deepEqual(parseCsv("EVENT_TYPE,Latitude\nBattles,48.1"), [{ event_type: "Battles", latitude: "48.1" }]);
  assert.deepEqual(parseCsv(""), []);
});

test("parseAcledDate reads ACLED's date styles", () => {
  assert.equal(parseAcledDate("2024-03-15"), "2024-03-15");
  assert.equal(parseAcledDate("15 March 2024"), "2024-03-15");
  assert.equal(parseAcledDate("5-Sep-2025"), "2025-09-05");
  assert.equal(parseAcledDate("3/15/2024"), "2024-03-15");
  assert.equal(parseAcledDate("soon"), null);
  assert.equal(parseAcledDate(""), null);
});

test("toEvent skips rows without a position", () => {
  assert.equal(toEvent({ latitude: "", longitude: "30" }), null);
  assert.equal(toEvent({ latitude: "95", longitude: "30" }), null);
  assert.deepEqual(toEvent({ event_date: "2025-01-02", year: "2025", event_type: "Battles", latitude: "48.5", longitude: "37.9", fatalities: "3", country: "Ukraine" }), {
    date: "2025-01-02",
    year: 2025,
    type: "Battles",
    lat: 48.5,
    lon: 37.9,
    fatalities: 3,
    country: "Ukraine",
  });
});

test("acledWindow is the 12 months ending with the month", () => {
  assert.deepEqual(acledWindow("2026-09"), { from: "2025-10-01", to: "2026-09-30" });
  assert.deepEqual(acledWindow("2026-01"), { from: "2025-02-01", to: "2026-01-31" });
});

test("battlePoints keeps recent battles near the area, in sustained squares", () => {
  const battle = (lat, lon, date, type = "Battles") => ({ date, year: Number(date.slice(0, 4)), type, lat, lon, fatalities: 0 });
  const events = [
    // 6 battles in one ~5 km square near the area, inside the window.
    ...Array.from({ length: 6 }, (_, i) => battle(48.01 + i * 0.001, 37.01, "2026-05-0" + (i + 1))),
    // 2 battles elsewhere: too few to count as the front.
    battle(48.5, 36.5, "2026-06-01"),
    battle(48.5, 36.5, "2026-06-02"),
    // Strikes, too old, too far: ignored.
    battle(48.01, 37.01, "2026-05-01", "Explosions/Remote violence"),
    battle(48.01, 37.01, "2024-01-01"),
    battle(10, 10, "2026-05-01"),
  ];
  const result = battlePoints(events, { bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.equal(result.battles, 8);
  assert.equal(result.squares, 1);
  assert.equal(result.relaxed, false);
  assert.deepEqual(result.points, [[37, 48]]);
  // With only quiet squares, all battle squares are used.
  const quiet = battlePoints(events.slice(6, 8), { bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.equal(quiet.relaxed, true);
  assert.deepEqual(quiet.points, [[36.5, 48.5]]);
});

test("acledBattlesFor reads a file and never throws", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acled-"));
  const file = path.join(dir, "acled.csv");
  const rows = Array.from({ length: 5 }, (_, i) => `2026-08-0${i + 1},2026,Battles,"Notes, with comma",48.00,37.00,1,Ukraine`);
  fs.writeFileSync(file, ["event_date,year,event_type,notes,latitude,longitude,fatalities,country", ...rows].join("\n"));
  const found = acledBattlesFor({ csvPath: file, bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.equal(found.source, "acled");
  assert.deepEqual(found.points, [[37, 48]]);
  assert.equal(found.warning, null);
  assert.equal(acledStatus(file).ok, true);

  const none = acledBattlesFor({ csvPath: file, bbox: [-60, -10, -50, 0], month: "2026-09" });
  assert.deepEqual(none.points, []);
  assert.match(none.warning, /no battles within 300 km/);

  const missing = acledBattlesFor({ csvPath: path.join(dir, "nope.csv"), bbox: [36, 47.5, 38, 49], month: "2026-09" });
  assert.match(missing.warning, /ACLED file not found/);
  assert.deepEqual(acledBattlesFor({ csvPath: null, bbox: [0, 0, 1, 1], month: "2026-09" }), { points: [], warning: null, source: null });

  const wrong = path.join(dir, "wrong.csv");
  fs.writeFileSync(wrong, "name,value\na,1\n");
  assert.match(acledBattlesFor({ csvPath: wrong, bbox: [0, 0, 1, 1], month: "2026-09" }).warning, /does not look like an ACLED export/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- Safety helpers ----------

test("date windows never reach past today", () => {
  assert.deepEqual(clampWindow({ start: "2026-10-01", end: "2026-11-01" }, "2026-10-18"), { start: "2026-10-01", end: "2026-10-18" });
  assert.deepEqual(clampWindow({ start: "2026-11-01", end: "2026-12-01" }, "2026-10-18"), { start: "2026-10-18", end: "2026-10-18" });
  const w = monthWindows("2026-10", "2026-10-18");
  for (const window of [w.month, w.season, w.s1Prior, w.firmsWar, w.last90, w.viirsSearch]) assert.ok(window.end <= "2026-10-18", JSON.stringify(window));
  assert.deepEqual(w.month, { start: "2026-10-01", end: "2026-10-18" });
  assert.equal(w.season.end, "2026-10-18");
  // The baseline stops on the same day of 2021, so like is compared with like.
  assert.deepEqual(w.baseline, { start: "2021-04-01", end: "2021-10-18" });
  assert.deepEqual(w.last90, { start: "2026-07-20", end: "2026-10-18" });
  // A finished month is not changed.
  assert.deepEqual(monthWindows("2026-09", "2026-10-18"), monthWindows("2026-09", "2030-01-01"));
});

test("chunk size shrinks for big cells; tileScale grows", () => {
  assert.equal(chunkSizeFor(0.01, 49), 250); // town or farm cells
  assert.equal(chunkSizeFor(0.25, 49), 98); // Ukraine-size cells
  assert.equal(chunkSizeFor(0.5, 49), 24);
  assert.equal(chunkSizeFor(2, 49), 10); // never fewer than 10
  assert.equal(tileScaleFor(0.01, 49), 4);
  assert.equal(tileScaleFor(0.25, 49), 16);
  assert.equal(coarserScale(913), 1826);
  assert.equal(coarserScale(1500), 2000);
});

test("population: WorldPop's own pixels for small cells, density x area for big ones", () => {
  assert.deepEqual(populationPlan(0.001, 49), { native: true });
  assert.deepEqual(populationPlan(0.01, 49), { native: true });
  assert.deepEqual(populationPlan(0.25, 49), { native: false, scale: 913 });
  assert.deepEqual(populationPlan(0.05, 49), { native: false, scale: 183 });
  // A coarser retry makes population coarser too.
  assert.deepEqual(populationPlan(0.05, 49, 366), { native: false, scale: 366 });
});

test("which errors are worth one coarser retry", () => {
  assert.equal(isTooMuchWorkError(new Error("User memory limit exceeded.")), true);
  assert.equal(isTooMuchWorkError(explainGeeError(new Error("Computation timed out."))), true);
  assert.equal(isTooMuchWorkError(new GeeError("timeout", "took too long")), true);
  assert.equal(isTooMuchWorkError(new Error("Caller does not have required permission")), false);
  assert.equal(isUnknownArgumentError(new Error("Image.reduceRegions: Unrecognized argument type for 'maxPixelsPerRegion'"), "maxPixelsPerRegion"), true);
  assert.equal(isUnknownArgumentError(new Error("User memory limit exceeded."), "maxPixelsPerRegion"), false);
});

test("-1 means nothing found", () => {
  assert.equal(fromSentinel(-1), null);
  assert.equal(fromSentinel(null), null);
  assert.equal(fromSentinel(1700000000000), 1700000000000);
  assert.equal(fromSentinel("12"), 12);
  const counts = cleanCounts({ s2Current: 4, viirsLatest: -1, firmsWar: "3" });
  assert.equal(counts.viirsLatest, null);
  assert.equal(counts.s2Current, 4);
  assert.equal(counts.firmsWar, 3);
  assert.equal(counts.worldPop, 0);
});

// ---------- The whole analysis, against the stand-in Earth Engine ----------

const TEST_CFG = {
  geeProjectId: "test-proj",
  geeCredentials: { client_email: "atlas@test-proj.iam.gserviceaccount.com", private_key: "test-key" },
  geeCredentialsError: null,
  geeDisabled: false,
  chernozemAsset: "projects/zhaobo/assets/chernozem_wrb_ukraine",
  acledCsvPath: null,
};
const TODAY = "2026-10-18";

function fakeProvider(fakeOptions = {}, cfg = TEST_CFG) {
  const ee = createFakeEe(fakeOptions);
  const provider = createGeeProvider({ ee, getConfig: () => cfg, now: () => new Date(`${TODAY}T12:00:00Z`) });
  return { ee, provider };
}

// A rows x cols grid of square cells, north-west corner at (north, west).
function gridArea(rows, cols, sizeDeg, north = 49.8, west = 37.4) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push({ id: `r${r}c${c}`, row: r, col: c, lat: Number((north - (r + 0.5) * sizeDeg).toFixed(6)), lon: Number((west + (c + 0.5) * sizeDeg).toFixed(6)) });
    }
  }
  const bbox = [west, north - rows * sizeDeg, west + cols * sizeDeg, north];
  const area = { id: "test-area", name: "Test", kind: "custom", source: "bbox", bbox, geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]] } };
  return { area, cells };
}

// Every raw-reading field of spec 2.2, in range.
function assertReading(reading, cellIds) {
  assert.ok(cellIds.has(reading.id), `unknown id ${reading.id}`);
  const inRange = (name, min, max) => {
    const v = reading[name];
    assert.equal(typeof v, "number", `${reading.id}.${name} is ${v}`);
    assert.ok(Number.isFinite(v) && v >= min && v <= max, `${reading.id}.${name} = ${v} not in ${min}..${max}`);
  };
  inRange("chernozem", 0, 1);
  inRange("croplandShare", 0, 1);
  inRange("firesPer100Km2", 0, 1e6);
  inRange("chiDrop", -1, 1);
  inRange("conflictKm", 0, 300);
  inRange("popPerKm2", 0, 1e6);
  inRange("lights", 0, 1e4);
  inRange("heavyShare", 0, 1);
  inRange("population", 0, 1e9);
  assert.ok(Number.isInteger(reading.population));
  for (const name of ["admin1", "admin2"]) if (name in reading) assert.equal(typeof reading[name], "string");
}

const filterDates = (ee) => ee.callsNamed("ImageCollection.filterDate").map((c) => c.args);
const meanRequests = (ee) => ee.requests.filter((r) => r.find("reduceRegions").some((n) => n.args[0]?.reducer && n.parent.bands?.some((b) => b.name === "chiDrop")));

test("analyze() on a 9-cell area gives every reading for every cell", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(3, 3, 0.01);
  const progress = [];
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01, onProgress: (share, message) => progress.push([share, message]) });

  assert.deepEqual(Object.keys(result).sort(), ["alerts", "baseline", "readings", "warnings"]);
  assert.equal(result.readings.length, 9);
  const ids = new Set(cells.map((c) => c.id));
  assert.deepEqual(new Set(result.readings.map((r) => r.id)), ids);
  for (const reading of result.readings) {
    assertReading(reading, ids);
    assert.equal(reading.admin1, "Kharkivs'ka");
  }
  assert.ok(Array.isArray(result.warnings) && result.warnings.every((w) => typeof w === "string"));
  // Every step worked: no "... unavailable" fallbacks were needed.
  assert.deepEqual(result.warnings.filter((w) => /unavailable/.test(w)), []);
  assert.ok(result.alerts.length > 0 && result.alerts.length <= 6);
  for (const alert of result.alerts) {
    assert.ok(["radar", "fire"].includes(alert.kind));
    assert.match(alert.date, /^2026-08-\d\d$/);
    assert.ok(alert.cellIds.length && alert.cellIds.every((id) => ids.has(id)));
    assert.ok(alert.magnitude > 0);
  }
  assert.deepEqual(progress.at(-1), [1, "Done"]);
  assert.ok(progress.every(([share], i) => i === 0 || share >= progress[i - 1][0]), "progress only goes up");

  // Signed in like the deposit, once.
  assert.equal(ee.callsNamed("data.authenticateViaPrivateKey").length, 1);
  assert.deepEqual(ee.callsNamed("initialize")[0].args, ["test-proj"]);
  // Nothing is re-projected; every per-cell reduction has a tileScale.
  assert.equal(ee.calls.filter((c) => c.name.endsWith(".reproject")).length, 0);
  for (const call of ee.callsNamed("Image.reduceRegions")) assert.ok(call.args[0].tileScale >= 4);
  // Small cells: population summed on WorldPop's own grid.
  const popCalls = ee.callsNamed("Image.reduceRegions").filter((c) => c.args[0].crs && typeof c.args[0].crs !== "string");
  assert.equal(popCalls.length, 1);
  // One request measured all 9 cells.
  assert.equal(meanRequests(ee).length, 1);
  assert.ok(ee.stats.peakActive <= 2);
});

test("600 small cells are measured in chunks of 250, two at a time", async () => {
  const { ee, provider } = fakeProvider({ delayMs: 5 });
  const { area, cells } = gridArea(20, 30, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(result.readings.length, 600);
  const ids = new Set(cells.map((c) => c.id));
  for (const reading of result.readings) assertReading(reading, ids);
  const chunks = meanRequests(ee);
  assert.equal(chunks.length, 3);
  const sizes = ee.callsNamed("Image.reduceRegions").filter((c) => c.args[0].reducer && c.args[0].crs === "EPSG:4326" && c.args[0].scale < 100);
  assert.ok(sizes.length >= 3);
  assert.ok(ee.stats.peakActive <= 2, `peak ${ee.stats.peakActive}`);
});

test("600 big (country-size) cells: smaller chunks, tileScale 16, population from density x pixel area", async () => {
  const { ee, provider } = fakeProvider({ delayMs: 2 });
  const { area, cells } = gridArea(20, 30, 0.25, 52, 24);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.25 });
  assert.equal(result.readings.length, 600);
  const ids = new Set(cells.map((c) => c.id));
  for (const reading of result.readings) assertReading(reading, ids);
  const perChunk = chunkSizeFor(0.25, (52 + 47) / 2);
  assert.ok(perChunk < 250);
  assert.equal(meanRequests(ee).length, Math.ceil(600 / perChunk));
  const reduceCalls = ee.callsNamed("Image.reduceRegions");
  assert.ok(reduceCalls.every((c) => c.args[0].tileScale === 16));
  // Population: summed in EPSG:4326 at 100 m or coarser, using pixelArea, never reprojected.
  const pop = reduceCalls.filter((c) => c.args[0].crs === "EPSG:4326" && c.args[0].scale >= 100);
  assert.ok(pop.length > 0);
  assert.ok(ee.callsNamed("Image.pixelArea").length >= 1);
  assert.equal(ee.calls.filter((c) => c.name.endsWith(".reproject")).length, 0);
  assert.ok(ee.stats.peakActive <= 2);
});

test("a chunk that runs out of memory is tried once more with coarser pixels", async () => {
  let failed = 0;
  const { ee, provider } = fakeProvider({
    fail: (request) => {
      const isChunk = request.find("reduceRegions").length > 0 && request.has("Dictionary");
      if (isChunk && failed === 0) {
        failed += 1;
        return "User memory limit exceeded.";
      }
      return null;
    },
  });
  const { area, cells } = gridArea(3, 3, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(failed, 1);
  assert.equal(result.readings.length, 9);
  const scales = ee.callsNamed("Image.reduceRegions").filter((c) => c.args[0].crs === "EPSG:4326" && c.args[0].reducer).map((c) => [c.args[0].scale, c.args[0].tileScale]);
  const base = reduceScale(0.05, (area.bbox[1] + area.bbox[3]) / 2);
  assert.ok(scales.some(([scale, tile]) => scale === coarserScale(base) && tile === 16), JSON.stringify(scales));
  assert.ok(result.warnings.some((w) => /coarser pixels/.test(w)));
});

test("a chunk that fails twice stops the analysis with a clear error", async () => {
  const { provider } = fakeProvider({ fail: (request) => (request.has("Dictionary") && request.find("reduceRegions").length ? "Computation timed out." : null) });
  const { area, cells } = gridArea(2, 2, 0.05);
  await assert.rejects(provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 }), (error) => {
    assert.ok(error instanceof GeeError);
    assert.equal(error.code, "too_big");
    return true;
  });
});

test("an Earth Engine without maxPixelsPerRegion still works", async () => {
  const { ee, provider } = fakeProvider({
    fail: (request) =>
      request.find("reduceRegions").some((n) => n.args[0]?.maxPixelsPerRegion) ? "Image.reduceRegions: Unrecognized argument type for 'maxPixelsPerRegion'." : null,
  });
  const { area, cells } = gridArea(2, 2, 0.05);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.05 });
  assert.equal(result.readings.length, 4);
  assert.ok(ee.callsNamed("Image.reduceRegions").some((c) => !("maxPixelsPerRegion" in c.args[0])));
});

test("the current month never asks for future images", async () => {
  const { ee, provider } = fakeProvider();
  const { area, cells } = gridArea(2, 2, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-10", cellSizeDeg: 0.01 });
  const dates = filterDates(ee);
  assert.ok(dates.length > 5);
  for (const [start, end] of dates) {
    assert.ok(start <= TODAY && end <= TODAY, `${start}..${end}`);
  }
  // FIRMS since the invasion stops at today too.
  assert.ok(dates.some(([start, end]) => start === "2022-02-24" && end === TODAY));
  assert.ok(result.warnings.some((w) => /not over yet/.test(w)));
  for (const alert of result.alerts) assert.ok(alert.date < TODAY);
});

test("no Sentinel-2 or radar images: damage unknown, warnings say so", async () => {
  const { provider } = fakeProvider({ sizes: { [DATASETS.sentinel2]: 0, [DATASETS.sentinel1]: 0 } });
  const { area, cells } = gridArea(3, 3, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.ok(result.readings.every((r) => r.chiDrop === null && r.heavyShare === 0));
  assert.ok(result.warnings.some((w) => /Sentinel-2/.test(w)));
  assert.ok(result.warnings.some((w) => /radar alerts are off/.test(w)));
  assert.ok(result.alerts.every((a) => a.kind === "fire"));
});

test("an unreadable chernozem map falls back to soil organic carbon", async () => {
  const { ee, provider } = fakeProvider({ assets: { [TEST_CFG.chernozemAsset]: "missing" } });
  const { area, cells } = gridArea(1, 1, 0.01);
  const result = await provider.analyze({ area, cells, month: "2026-08", cellSizeDeg: 0.01 });
  assert.equal(result.readings.length, 1);
  assertReading(result.readings[0], new Set(["r0c0"]));
  assert.ok(result.warnings.some((w) => /Soil organic carbon was used instead/.test(w)));
  assert.ok(!ee.callsNamed("Image").some((c) => c.args[0] === TEST_CFG.chernozemAsset));
});

test("a rejected key gives clear advice, and regions are searchable", async () => {
  const bad = fakeProvider({ authError: "invalid_grant: Invalid JWT Signature." });
  const status = await bad.provider.status();
  assert.equal(status.ok, false);
  assert.match(status.detail, /rejected the service-account key/);

  const { provider } = fakeProvider();
  assert.deepEqual(await provider.searchAdmin1("kharkiv"), [{ id: "gaul1-3180", name: "Kharkivs'ka", country: "Ukraine" }]);
  const region = await provider.admin1Boundary("gaul1-3180");
  assert.equal(region.name, "Kharkivs'ka");
  assert.equal(region.country, "Ukraine");
  assert.equal(region.geometry.type, "Polygon");
  await assert.rejects(provider.admin1Boundary("gaul1-1"), (error) => error.code === "not_found");
  const soil = await provider.probePoint({ lat: 49.74, lon: 37.54 });
  assert.ok(Number.isFinite(soil.socRaw) && soil.worldCover === 40 && soil.assetId === TEST_CFG.chernozemAsset);
});

test("the stand-in refuses a null inside ee.Dictionary and ee.Algorithms.If", () => {
  const ee = createFakeEe();
  assert.throws(() => ee.Dictionary({ a: null }), /null/);
  assert.throws(() => ee.Algorithms.If(true, 1, null), /null/);
  assert.doesNotThrow(() => ee.Algorithms.If(true, 1, ee.Number(-1)));
});
