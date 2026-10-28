// WHAT THIS FILE DOES
// Writes the data file for the public site's interactive demo: Ukraine's
// oblasts ranked for both time frames ("Near term" with the Feasibility
// cutoff, "Post-crisis" as the weighted power mean), exactly as the app's
// Map page shows them in its "Macro" view with the research defaults
// (src/lib/atlas/method.js DEFAULT_SETTINGS: weights 30/40/30, cutoff 30%).
//
// It only READS the app's saved data:
//   server/.data/runs/*.json           the newest Ukraine month (country-804)
//   server/.data/units/country-804.json the oblasts (FAO GAUL level 1)
// and writes one file:
//   public/site/ukraine-demo.json
//
// The scores come from the app's own method (src/lib/atlas/scoring.js and
// src/lib/atlas/units.js) and the squares are put in their oblasts by the
// server's own rule (server/units.js assignCells), so the demo and the app
// can never disagree. The shaping and the border simplification are in
// src/lib/site/demoData.js (tested in demoData.test.js).
//
// One difference from the app, as in the research paper: Crimea (occupied
// since 2014 and outside Ukrainian agricultural reporting) is left out of
// the ranking, so 24 of the 25 oblasts are ranked. Its squares are not
// analyzed (scorePlaces "excluded"), so the cutoff and every rank are
// worked out over the other 24; it is still drawn, marked excluded.
//
// HOW TO USE IT
// In Terminal, in the project folder (on this Mac first run
// "export PATH=~/.local/node/bin:$PATH"):
//
//   node scripts/site-demo-data.js
//
// Options
//   --data <folder>       the data folder to read (default: server/.data)
//   --area <id>           the area (default: country-804, Ukraine)
//   --out <file>          where to write (default: public/site/ukraine-demo.json)
//   --tolerance <deg>     border simplification, degrees (default 0.025)
//   --cutoff <percent>    the Feasibility cutoff (default: the research default)
//   --weights s,d,a       the weights (default: the research defaults)
//   --exclude <ids>       units left out of the ranking, by id, comma
//                         separated (default: the paper's, Crimea, found
//                         in the units file by its name); "none" ranks all
//
// It prints the top of each ranking, what the cutoff left out, the biggest
// rank changes and the file's size.
//
// WHO EDITS IT
// Whoever changes what the site's demo shows. Run it again after a new
// month of Ukraine is analyzed, so the demo keeps up with the app.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assignCells } from "../server/units.js";
import { DEFAULT_SETTINGS } from "../src/lib/atlas/method.js";
import { DEFAULT_EXCLUSION_NOTE, DEFAULT_TOLERANCE_DEG, paperExclusions, shapeDemoData, summaryLines } from "../src/lib/site/demoData.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readOptions(argv) {
  const options = { data: join(root, "server", ".data"), area: "country-804", out: join(root, "public", "site", "ukraine-demo.json"), tolerance: DEFAULT_TOLERANCE_DEG, settings: { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights } }, exclude: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--data" && value) options.data = resolve(value), i++;
    else if (flag === "--area" && value) options.area = value, i++;
    else if (flag === "--out" && value) options.out = resolve(value), i++;
    else if (flag === "--tolerance" && value) options.tolerance = Number(value), i++;
    else if (flag === "--cutoff" && value) options.settings.gatePercentile = Number(value), i++;
    else if (flag === "--weights" && value) {
      const [soil, damage, access] = value.split(",").map(Number);
      options.settings.weights = { soil, damage, access };
      i++;
    } else if (flag === "--exclude" && value !== undefined) {
      options.exclude = value.trim().toLowerCase() === "none" ? [] : value.split(",").map((id) => id.trim()).filter(Boolean);
      i++;
    } else if (flag === "--help" || flag === "-h") {
      console.log("node scripts/site-demo-data.js [--data <folder>] [--area <id>] [--out <file>] [--tolerance <deg>] [--cutoff <percent>] [--weights s,d,a] [--exclude <id,...>|none]");
      process.exit(0);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

// The newest month saved for the area: the latest "month", and among
// several of the same month the one made last.
function newestRun(runsDir, areaId) {
  let best = null;
  for (const name of readdirSync(runsDir)) {
    if (!name.endsWith(".json")) continue;
    let run;
    try {
      run = JSON.parse(readFileSync(join(runsDir, name), "utf8"));
    } catch {
      continue;
    }
    if (run?.areaId !== areaId || !Array.isArray(run.cells)) continue;
    const newer = !best || String(run.month) > String(best.month) || (run.month === best.month && String(run.createdAt || "") > String(best.createdAt || ""));
    if (newer) best = run;
  }
  return best;
}

function main() {
  const options = readOptions(process.argv.slice(2));
  const run = newestRun(join(options.data, "runs"), options.area);
  if (!run) throw new Error(`No saved month for ${options.area} in ${join(options.data, "runs")}`);
  const unitsPath = join(options.data, "units", `${options.area}.json`);
  const file = JSON.parse(readFileSync(unitsPath, "utf8"));
  if (!Array.isArray(file.units) || !file.units.length) throw new Error(`No units in ${unitsPath}`);

  // Which units are left out of the ranking, with the note shown for each:
  // the paper's (Crimea, by name) unless --exclude says otherwise.
  const paper = paperExclusions(file.units);
  let exclude = paper;
  if (options.exclude) {
    const known = new Set(file.units.map((unit) => unit.id));
    const unknown = options.exclude.filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`--exclude: no unit ${unknown.join(", ")} in ${unitsPath}`);
    exclude = Object.fromEntries(options.exclude.map((id) => [id, paper[id] || DEFAULT_EXCLUSION_NOTE]));
  } else if (!Object.keys(paper).length) console.log(`No unit named Crimea in ${unitsPath}: every unit is ranked.`);

  const cellUnit = assignCells(run.cells, file.units, run.cellSizeDeg);
  const placed = Object.keys(cellUnit).length;
  const data = shapeDemoData({ run, units: file.units, cellUnit, settings: options.settings, exclude, tolerance: options.tolerance });

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, JSON.stringify(data));
  const bytes = statSync(options.out).size;

  console.log(`Read ${run.id} (${run.areaName || options.area}, ${run.month}, ${run.cells.length} squares) and ${file.units.length} ${file.sourceLabel || "units"}; ${placed} of ${run.cells.length} squares placed in a unit.`);
  for (const line of summaryLines(data)) console.log(line);
  const points = data.units.reduce((sum, unit) => sum + unit.rings.reduce((n, ring) => n + ring.length, 0), 0);
  console.log(`Wrote ${options.out}: ${(bytes / 1024).toFixed(1)} KB (${data.units.length} units, ${points} border points at ${options.tolerance} deg).`);
}

main();
