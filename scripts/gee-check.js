// WHAT THIS FILE DOES
// `npm run gee:check` — checks the Google Earth Engine connection from
// start to finish and says, in plain words, what is still wrong:
//   1. which settings in .env are set or missing
//   2. signs in to Earth Engine with the service-account key
//   3. reads the soil maps at one test point
//   4. analyzes ONE map cell near Balakliia, Kharkiv oblast (49.74° N,
//      37.54° E) for the last complete month, timing each step
//   5. analyzes three small cells there and prints every reading, or,
//      with --area, your own square area cut into cells like the app does
// When it ends with "Earth Engine is ready", restart `npm run dev` and the
// Atlas uses real satellite data. Step-by-step setup: docs/CONNECT-DATA.md.
//
// A quick test of your own place anywhere on Earth (latitude, longitude,
// size of the square in km), for example a 5 km square around Poltava, or
// 40 km in Iowa:
//   npm run gee:check -- --area=49.59,34.55,5
//   npm run gee:check -- --area=42.03,-93.62,40
// The growing season follows the place's latitude, and the war (if one in
// src/config/conflicts.js covers it) decides where damage is counted from.
//
// WHO EDITS IT
// Whoever changes the Earth Engine provider (server/providers/gee.js).

import { config } from "../server/env.js";
import { cellAreaKm2, planGrid } from "../server/geo.js";
import { latestCompleteMonth, monthLabel } from "../server/runs.js";
import { acledStatus } from "../server/providers/acled.js";
import gee, { connect, probePoint, setupProblems, socToChernozem, monthWindows, reduceScale, chunkSizeFor, SOC, BLACK_SOIL_SOURCE } from "../server/providers/gee.js";
import { conflictForArea } from "../server/conflicts.js";
import { climateBand } from "../src/lib/season.js";

const TEST = { lat: 49.74, lon: 37.54, sizeDeg: 0.01 };
const DOCS = "docs/CONNECT-DATA.md";
const AREA_HELP = "Use --area=<latitude>,<longitude>,<km>, for example --area=49.59,34.55,5 (a 5 km square around Poltava).";

// "--area=49.59,34.55,5" -> { lat, lon, km }; null when it is not valid.
function parseArea(text) {
  const parts = String(text).split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lon, km] = parts;
  if (lat < -85 || lat > 85 || lon < -180 || lon > 180 || km < 0.05 || km > 2000) return null;
  return { lat, lon, km };
}

// A square of `km` on each side centred on the point, as an Area.
function squareArea({ lat, lon, km }, name) {
  const dLat = km / 2 / 111.32;
  const dLon = km / 2 / (111.32 * Math.cos((lat * Math.PI) / 180));
  const r = (n) => Number(n.toFixed(6));
  const bbox = [r(lon - dLon), r(lat - dLat), r(lon + dLon), r(lat + dLat)];
  return {
    id: "gee-check",
    name,
    kind: "custom",
    source: "coordinates",
    bbox,
    geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]] },
  };
}

// The command line: only --area (and --help) are understood.
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`npm run gee:check [-- --area=<lat>,<lon>,<km>]\n${AREA_HELP}`);
  process.exit(0);
}
const areaArg = args.find((arg) => arg.startsWith("--area="));
const unknown = args.filter((arg) => arg !== areaArg);
const CUSTOM = areaArg ? parseArea(areaArg.slice("--area=".length)) : null;
if (unknown.length || (areaArg && !CUSTOM)) {
  console.log(`Not understood: ${[...unknown, ...(areaArg && !CUSTOM ? [areaArg] : [])].join(" ")}`);
  console.log(AREA_HELP);
  process.exit(1);
}

const line = (text = "") => console.log(text);
const item = (state, name, detail = "") => line(`  ${state.padEnd(8)} ${name}${detail ? `  ${detail}` : ""}`);

function finish(ok, message) {
  line();
  line(ok ? message : `NOT READY: ${message}`);
  if (!ok) line(`Step-by-step help: ${DOCS}`);
  process.exit(ok ? 0 : 1);
}

async function main() {
  line("Chernozem Atlas - Earth Engine check");
  line();

  // ---------- 1. Settings ----------
  let cfg = config();
  const env = process.env;
  line("1. Settings in .env");
  if (cfg.geeProjectId) {
    item("OK", "GEE_PROJECT_ID", env.GEE_PROJECT_ID ? cfg.geeProjectId : `${cfg.geeProjectId} (taken from the key file)`);
  } else {
    item("MISSING", "GEE_PROJECT_ID", "your Google Cloud project id, e.g. my-atlas-project");
  }
  const inline = Boolean((env.GEE_SERVICE_ACCOUNT_JSON || "").trim());
  const keyFile = (env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (cfg.geeCredentials) {
    item("OK", inline ? "GEE_SERVICE_ACCOUNT_JSON" : "GOOGLE_APPLICATION_CREDENTIALS", `${inline ? "key pasted in .env" : keyFile} -> ${cfg.geeCredentials.client_email}`);
  } else if (cfg.geeCredentialsError) {
    item("PROBLEM", inline ? "GEE_SERVICE_ACCOUNT_JSON" : "GOOGLE_APPLICATION_CREDENTIALS", cfg.geeCredentialsError);
  } else {
    item("MISSING", "GOOGLE_APPLICATION_CREDENTIALS", "path to the service-account key, e.g. ./service-account.json");
    item("", "(or GEE_SERVICE_ACCOUNT_JSON", "with the whole key pasted on one line)");
  }
  item("OPTIONAL", "GEE_CHERNOZEM_ASSET", !cfg.chernozemAsset || /^(none|off|no)$/i.test(cfg.chernozemAsset) ? `(none: ${BLACK_SOIL_SOURCE.charAt(0).toLowerCase()}${BLACK_SOIL_SOURCE.slice(1)} is used)` : cfg.chernozemAsset);
  const acled = acledStatus(cfg.acledCsvPath);
  item(cfg.acledCsvPath ? (acled.ok ? "OK" : "PROBLEM") : "OPTIONAL", "ACLED_CSV_PATH", cfg.acledCsvPath ? `${cfg.acledCsvPath}: ${acled.detail}` : acled.detail);
  item(cfg.anthropicKey ? "OK" : "OPTIONAL", "ANTHROPIC_API_KEY", cfg.anthropicKey ? "set (the AI pages are on)" : "not set (needed only for the AI pages)");
  if (cfg.geeDisabled) {
    item("NOTE", "GEE_DISABLED=1", "the app uses sample data while this is set; checking Earth Engine anyway");
    process.env.GEE_DISABLED = "0"; // a real environment value wins over .env
    cfg = config();
  }

  const problems = setupProblems(cfg);
  if (problems.length) {
    line();
    line("What to do:");
    if (!cfg.geeProjectId) line("  - Add GEE_PROJECT_ID=<your project id> to .env");
    if (!cfg.geeCredentials && !cfg.geeCredentialsError) {
      line("  - Save the service-account key as service-account.json in the project folder");
      line("    and add GOOGLE_APPLICATION_CREDENTIALS=./service-account.json to .env");
    }
    if (cfg.geeCredentialsError) line(`  - ${cfg.geeCredentialsError}`);
    finish(false, problems.join(" "));
  }

  // ---------- 2. Sign in ----------
  line();
  line(`2. Signing in to Earth Engine (project ${cfg.geeProjectId})`);
  try {
    await connect(cfg);
    item("OK", "Signed in", `as ${cfg.geeCredentials.client_email}`);
  } catch (error) {
    item("FAILED", "Sign-in", "");
    finish(false, error.message);
  }

  // ---------- 3. Soil maps at the test point ----------
  line();
  line(`3. Soil maps at ${TEST.lat}° N, ${TEST.lon}° E`);
  try {
    const soil = await probePoint(TEST);
    if (soil.assetId) {
      const value = Number(soil.assetRaw);
      item("OK", "Chernozem map", Number.isFinite(value) ? `${soil.assetId} b1 = ${value} -> ${(Math.min(1, value / 89)).toFixed(2)} (expected high here)` : `${soil.assetId} has no value at this point`);
    } else if (soil.assetWarning) {
      item("WARNING", "Chernozem map", soil.assetWarning);
    }
    const group = Number(soil.greatGroup);
    const black = Number(soil.blackSoil);
    item(
      Number.isFinite(group) ? "OK" : "WARNING",
      "Black-soil map",
      Number.isFinite(group)
        ? `${BLACK_SOIL_SOURCE.replace(/^Black-soil map: /, "")}: great group ${group} -> ${black === 1 ? "black soil (expected here)" : "not black soil (unexpected here)"}${soil.assetId ? " (used where the chernozem map has no data)" : ""}`
        : "no value at this point",
    );
    const soc = Number(soil.socRaw);
    item(
      Number.isFinite(soc) ? "OK" : "WARNING",
      "Soil organic carbon",
      Number.isFinite(soc)
        ? `SoilGrids 0-5 cm = ${soc} dg/kg -> ${Math.round(soc * SOC.unitGkg)} g/kg -> ${socToChernozem(soc).toFixed(2)} (used only where the black-soil map has no data; chernozem topsoil, 0-5 cm, is usually 30 to 80 g/kg here)`
        : "no value at this point",
    );
    item("OK", "WorldCover class", `${soil.worldCover} (40 = cropland)`);
  } catch (error) {
    item("FAILED", "Soil maps", "");
    finish(false, error.message);
  }

  await analysisSteps();
  finish(true, `Earth Engine is ready. Restart "npm run dev"; the Atlas now uses real satellite data (Settings shows "Earth Engine").`);
}

// ---------- Analyzing, with timings ----------

// Runs one analysis and prints each step as it happens, with the time
// since the start. Stops the check with Earth Engine's advice on failure.
async function timedAnalyze({ area, cells, cellSizeDeg, month }) {
  const started = Date.now();
  let result;
  try {
    result = await gee.analyze({
      area,
      cells,
      month,
      cellSizeDeg,
      onProgress: (share, message) => {
        if (message) line(`   ${seconds(Date.now() - started).padStart(7)}  ${message}`);
      },
    });
  } catch (error) {
    line(`   ${seconds(Date.now() - started).padStart(7)}  failed`);
    item("FAILED", "Analysis", "");
    finish(false, error?.message || String(error));
  }
  return { result, totalSeconds: (Date.now() - started) / 1000 };
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

// Cells next to each other along one row, all inside the area's box.
function rowOfCells({ lat, lon, sizeDeg }, count) {
  const first = -(count - 1) / 2;
  const cells = Array.from({ length: count }, (_, col) => {
    const cellLon = Number((lon + (first + col) * sizeDeg).toFixed(5));
    return { id: `r0c${col}`, row: 0, col, lat, lon: cellLon, areaHa: cellAreaKm2(sizeDeg, lat) * 100 };
  });
  const half = sizeDeg / 2;
  const bbox = [cells[0].lon - half, lat - half, cells[cells.length - 1].lon + half, lat + half];
  const area = {
    id: "gee-check",
    name: "gee:check test area",
    kind: "custom",
    source: "bbox",
    bbox,
    geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]] },
  };
  return { area, cells };
}

const COLUMNS = [
  ["cell", (r) => r.id],
  ["chernozem", (r) => r.chernozem],
  ["cropland", (r) => r.croplandShare],
  ["CHI drop", (r) => r.chiDrop ?? "n/a"],
  ["radar dB", (r) => r.radarDb ?? "n/a"],
  ["heavy", (r) => r.heavyShare],
  ["fires/100km2", (r) => r.firesPer100Km2],
  ["fighting km", (r) => r.conflictKm],
  ["people", (r) => r.population],
  ["people/km2", (r) => r.popPerKm2],
  ["lights", (r) => r.lights],
  ["place", (r) => [r.admin2, r.admin1].filter(Boolean).join(", ") || "-"],
];

function printTable(readings) {
  const rows = readings.map((reading) => COLUMNS.map(([, get]) => String(get(reading))));
  const widths = COLUMNS.map(([name], i) => Math.max(name.length, ...rows.map((row) => row[i].length)));
  line(`   ${COLUMNS.map(([name], i) => name.padEnd(widths[i])).join("  ")}`);
  for (const row of rows) line(`   ${row.map((cell, i) => cell.padEnd(widths[i])).join("  ")}`);
}

// Many cells: the lowest, middle and highest value of each reading.
function printRanges(readings) {
  const fields = [
    ["chernozem", "chernozem"],
    ["croplandShare", "cropland"],
    ["chiDrop", "CHI drop"],
    ["radarDb", "radar dB"],
    ["heavyShare", "heavy"],
    ["firesPer100Km2", "extra fires/100km2"],
    ["conflictKm", "fighting km"],
    ["popPerKm2", "people/km2"],
    ["lights", "lights"],
  ];
  line(`   ${"reading".padEnd(14)}${"lowest".padStart(10)}${"middle".padStart(10)}${"highest".padStart(10)}`);
  for (const [key, label] of fields) {
    const values = readings.map((r) => r[key]).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const missing = readings.length - values.length;
    const cell = (v) => (v === undefined ? "n/a" : String(v)).padStart(10);
    line(`   ${label.padEnd(14)}${cell(values[0])}${cell(values[Math.floor(values.length / 2)])}${cell(values.at(-1))}${missing ? `   (${missing} cells without data)` : ""}`);
  }
  const people = readings.reduce((sum, r) => sum + (r.population || 0), 0);
  line(`   ${"people".padEnd(14)}${String(people).padStart(30)} in total`);
}

function printAlertsAndNotes(result) {
  line(`   Alerts: ${result.alerts.length ? "" : "none this month"}`);
  for (const alert of result.alerts) line(`     ${alert.kind.padEnd(5)} ${alert.date}  ${alert.magnitude} ${alert.unit}  ${alert.place}`);
  if (result.warnings.length) {
    line("   Notes:");
    for (const warning of result.warnings) line(`     - ${warning}`);
  }
}

const sane = (result, cells) => result.readings.length === cells.length && result.readings.every((r) => r.croplandShare >= 0 && r.population >= 0);

// ---------- 4. One cell, timed ----------

// The season and the war for a place, in one line.
function windowsLine(lat, lon, month) {
  const conflict = conflictForArea({ bbox: [lon, lat, lon, lat] });
  const windows = monthWindows(month, undefined, { lat, conflict });
  const war = conflict
    ? `${conflict.name}: damage counted since ${conflict.since}`
    : `no war in the app's list: damage counted from ${windows.damage?.start} (fires above the 2019-2021 rate, radar change), distance to fighting not measured`;
  return `   ${climateBand(lat)} band, last complete season ${windows.season.start} to ${windows.season.end} (the analysis reads each place's own season from MODIS) vs the same window in ${windows.baselines.map((b) => b.start.slice(0, 4)).join(", ")}; ${war}`;
}

async function analysisSteps() {
  const month = latestCompleteMonth();
  line();
  line(`4. Analyzing 1 cell (${TEST.sizeDeg}°, about 0.7 x 1.1 km) at ${TEST.lat}° N, ${TEST.lon}° E for ${monthLabel(month)}`);
  line(`${windowsLine(TEST.lat, TEST.lon, month)}; pixel size ${reduceScale(TEST.sizeDeg, TEST.lat)} m`);
  const one = rowOfCells(TEST, 1);
  const single = await timedAnalyze({ ...one, cellSizeDeg: TEST.sizeDeg, month });
  line();
  printTable(single.result.readings);
  line(`   Took ${single.totalSeconds.toFixed(1)} s in all.`);
  if (!sane(single.result, one.cells)) finish(false, "Earth Engine answered, but the cell came back without readings.");

  // ---------- 5. Three cells, or your own area ----------
  line();
  if (!CUSTOM) {
    line(`5. Analyzing 3 cells side by side at the same place for ${monthLabel(month)}`);
    const three = rowOfCells(TEST, 3);
    const run = await timedAnalyze({ ...three, cellSizeDeg: TEST.sizeDeg, month });
    line();
    printTable(run.result.readings);
    line();
    printAlertsAndNotes(run.result);
    line(`   Took ${run.totalSeconds.toFixed(1)} s.`);
    if (!sane(run.result, three.cells)) finish(false, "Earth Engine answered, but some cells came back without readings.");
    return;
  }
  const area = squareArea(CUSTOM, `${CUSTOM.km} km square at ${CUSTOM.lat}, ${CUSTOM.lon}`);
  const grid = planGrid(area.geometry);
  const midLat = (area.bbox[1] + area.bbox[3]) / 2;
  const perRequest = chunkSizeFor(grid.cellSizeDeg, midLat);
  line(`5. Analyzing your area: a ${CUSTOM.km} km square around ${CUSTOM.lat}, ${CUSTOM.lon} for ${monthLabel(month)}`);
  line(
    `   ${grid.cells.length} cells of ${grid.cellSizeDeg}° (about ${grid.cellSizeKm} km), ${Math.ceil(grid.cells.length / perRequest)} Earth Engine request(s) of up to ${perRequest} cells; pixel size ${reduceScale(grid.cellSizeDeg, midLat)} m`,
  );
  line(windowsLine(CUSTOM.lat, CUSTOM.lon, month));
  const run = await timedAnalyze({ area, cells: grid.cells, cellSizeDeg: grid.cellSizeDeg, month });
  line();
  if (run.result.readings.length <= 12) printTable(run.result.readings);
  else printRanges(run.result.readings);
  line();
  printAlertsAndNotes(run.result);
  line(`   Took ${run.totalSeconds.toFixed(1)} s.`);
  if (!sane(run.result, grid.cells)) finish(false, "Earth Engine answered, but some cells came back without readings.");
}

main().catch((error) => finish(false, error?.message || String(error)));
