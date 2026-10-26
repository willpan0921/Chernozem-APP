// WHAT THIS FILE DOES
// `npm run disaster:check -- --event=<id> [--month=YYYY-MM] [--all-land]`
// runs the app's own Earth Engine analysis (server/providers/gee.js
// analyze, then server/runs.js buildRun) on one of the natural disasters
// the disaster rules were checked against (docs/METHODS.md, "Disasters"),
// or on its fake-date control, and prints what the run says: the hit and
// heavily damaged land on cropland (all soils and black soil), the
// grassland hit, the cropland under water now, where Feasibility came
// from, the squares the Feasibility cutoff leaves out, and the run's
// warnings. One JSON line per month, then a short summary. A month whose
// growing season fell back to the latitude (Earth Engine ran short) is
// marked "degraded": run it again alone before citing it.
//
// It is needed because the app reaches back only 24 months, and some of
// the events are older. It reads Earth Engine with the same service
// account the app uses (.env, or GEE_PROJECT_ID and
// GOOGLE_APPLICATION_CREDENTIALS in the environment), read-only, and
// saves nothing: no area, no run.
//
//   --event=<id>   one of EVENTS below (npm run disaster:check -- --list)
//   --month=       only this month (default: the event's months)
//   --all-land     also the hit land on ALL land in the box (not only
//                  cropland): a flood's or a wildfire's hit image summed
//                  over the box, for events whose official figure is for
//                  all land (a burned area)
//
// WHO EDITS IT
// Whoever changes the disaster rules (src/lib/atlas/method.js DISASTER_*,
// server/providers/gee.js floodImages, burnImages, cropLossImage,
// greenLossImage). Re-run every event and its control after a change.

import { planGrid } from "../server/geo.js";
import { buildRun } from "../server/runs.js";
import gee, { BANDS, DATASETS, burnImages, cellBoxes, boxesGeometry, cleanHazardCounts, connect, disasterCounts, evaluate, floodImages, monthWindows, onFloodGrid, onHazardGrid, reduceScale, isoDay } from "../server/providers/gee.js";
import { teamConflict } from "../src/config/conflicts.js";
import { scorePlaces } from "../src/lib/atlas/scoring.js";
import { DEFAULT_SETTINGS, WILDFIRE } from "../src/lib/atlas/method.js";

// The events of the disaster design's validation (official figures in
// docs/METHODS.md, "Disasters"), each with its fake-date control.
export const EVENTS = {
  thessaly: { name: "Thessaly, Storm Daniel", type: "flood", since: "2023-09-04", box: [22.05, 39.35, 22.35, 39.55], months: ["2023-09", "2023-10"] },
  "thessaly-control": { name: "Thessaly control (a year later)", type: "flood", since: "2024-09-04", box: [22.05, 39.35, 22.35, 39.55], months: ["2024-09"] },
  punjab: { name: "Punjab, Chenab plain", type: "flood", since: "2025-08-15", box: [73.6, 32.2, 74.0, 32.5], months: ["2025-08", "2025-09"] },
  "punjab-control": { name: "Punjab control (a year earlier)", type: "flood", since: "2024-08-15", box: [73.6, 32.2, 74.0, 32.5], months: ["2024-09"] },
  iowa: { name: "Lower Big Sioux, Iowa/SD", type: "flood", since: "2024-06-20", box: [-96.7, 42.55, -96.35, 42.95], months: ["2024-06", "2024-07"] },
  "iowa-control": { name: "Lower Big Sioux control (a year later)", type: "flood", since: "2025-06-20", box: [-96.7, 42.55, -96.35, 42.95], months: ["2025-07"] },
  "iowa-winter": { name: "Lower Big Sioux, winter (no flood: snow and frozen ground)", type: "flood", since: "2025-02-01", box: [-96.7, 42.55, -96.35, 42.95], months: ["2025-03"] },
  "iowa-spring": { name: "Lower Big Sioux, spring (no flood)", type: "flood", since: "2025-04-01", box: [-96.7, 42.55, -96.35, 42.95], months: ["2025-05"] },
  "kostanay-spring": { name: "Kostanay steppe, snowmelt season (no flood)", type: "flood", since: "2025-03-01", box: [63.4, 53.1, 63.75, 53.35], months: ["2025-04"] },
  "punjab-july24": { name: "Punjab paddy season, July 2024 (no major flood)", type: "flood", since: "2024-07-01", box: [73.6, 32.2, 74.0, 32.5], months: ["2024-07"] },
  "punjab-july22": { name: "Punjab paddy season, July 2022 (no major flood in the box)", type: "flood", since: "2022-07-01", box: [73.6, 32.2, 74.0, 32.5], months: ["2022-07"] },
  "punjab-later": { name: "Punjab flood, the next paddy season (land under water now)", type: "flood", since: "2025-08-15", box: [73.6, 32.2, 74.0, 32.5], months: ["2026-01", "2026-07"] },
  "iowa-wide": { name: "Big Sioux and Rock rivers, wider box", type: "flood", since: "2024-06-20", box: [-97.3, 42.0, -95.85, 43.55], months: ["2024-07"] },
  yambol: { name: "Yambol, Gorska Polyana", type: "wildfire", since: "2024-07-17", box: [26.8, 41.97, 27.03, 42.16], months: ["2024-07", "2024-10"] },
  "yambol-control": { name: "Yambol control (a year earlier)", type: "wildfire", since: "2023-07-17", box: [26.8, 41.97, 27.03, 42.16], months: ["2023-07"] },
  "punjab-residue": { name: "Punjab, crop-residue burning (no wildfire)", type: "wildfire", since: "2024-10-15", box: [73.6, 32.2, 74.0, 32.5], months: ["2024-11"] },
  "punjab-residue25": { name: "Punjab, crop-residue burning a year later (no wildfire)", type: "wildfire", since: "2025-10-15", box: [73.6, 32.2, 74.0, 32.5], months: ["2025-11"] },
  "rostov-stubble": { name: "Rostov farmland, stubble-burning season (no wildfire)", type: "wildfire", since: "2024-07-15", box: [40.2, 46.7, 40.5, 46.9], months: ["2024-08"] },
  smokehouse: { name: "Smokehouse Creek, Texas", type: "wildfire", since: "2024-02-26", box: [-100.95, 35.7, -100.45, 36.05], months: ["2024-02", "2024-03", "2024-05"] },
  nebraska: { name: "Nebraska Panhandle drought", type: "drought", since: "2026-02-10", box: [-103.38, 41.0, -102.62, 41.39], months: ["2026-06", "2026-07", "2026-09"] },
  "nebraska-control": { name: "Nebraska Panhandle control (a year earlier)", type: "drought", since: "2025-02-10", box: [-103.38, 41.0, -102.62, 41.39], months: ["2025-06"] },
  "story-control": { name: "Story County, Iowa (no drought)", type: "drought", since: "2023-02-10", box: [-93.7, 41.85, -93.25, 42.2], months: ["2023-08"] },
  romagna: { name: "Romagna landslides", type: "ground", since: "2023-05-16", box: [11.62, 44.08, 11.95, 44.28], months: ["2023-10", "2024-10"] },
  "bologna-control": { name: "Bologna hills (same date, outside the slides)", type: "ground", since: "2023-05-16", box: [10.95, 44.25, 11.25, 44.4], months: ["2023-10", "2024-10"] },
  "emilia-control": { name: "Emilia plain (a year later)", type: "ground", since: "2024-05-16", box: [11.8, 44.35, 12.1, 44.6], months: ["2024-10"] },
};

function boxArea(id, box) {
  const [w, s, e, n] = box;
  return { id: `check-${id}`, name: id, kind: "custom", source: "bbox", bbox: box, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
}

const ha = (value) => (Number.isFinite(value) ? Math.round(value) : null);
const pct = (part, whole) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : null);

// The hit land on all land of the box (--all-land): the run's own hit
// image (floodImages / burnImages, on the run's grid), summed over the box.
async function allLandHit(ee, { area, cells, cellSizeDeg, month, conflict }) {
  const lat = (area.bbox[1] + area.bbox[3]) / 2;
  const scale = reduceScale(cellSizeDeg, lat);
  const region = boxesGeometry(ee, cellBoxes(cells, cellSizeDeg));
  const nowRegion = boxesGeometry(ee, cellBoxes(cells, cellSizeDeg, WILDFIRE.fullKm));
  const windows = monthWindows(month, isoDay(new Date()), { lat, conflict });
  if (!windows.hazard) return null;
  const raw = await evaluate(ee.Dictionary(disasterCounts(ee, { region, nowRegion, windows })), { what: "Counting the images (all land)" });
  const have = { hazard: cleanHazardCounts(raw, windows) };
  const fineGrid = scale < 300 ? (image, gridM = 1000) => image.reproject({ crs: "EPSG:4326", scale: gridM }) : (image) => image;
  const images = conflict.type === "flood" ? floodImages(ee, { region, windows, have }) : burnImages(ee, { region, nowRegion, windows, have, onFireGrid: fineGrid });
  const water = ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).neq(80);
  const area_ = ee.Image.pixelArea().divide(10000);
  const sums = await evaluate(
    ee.Image.cat([area_.multiply((conflict.type === "flood" ? onFloodGrid : onHazardGrid)(images.hit, scale)).updateMask(water).rename("hitHa"), area_.updateMask(water).rename("landHa")]).reduceRegion({ reducer: ee.Reducer.sum(), geometry: ee.Geometry.Rectangle(area.bbox, null, false), scale, maxPixels: 1e10, tileScale: 8 }),
    { what: "Summing the hit land (all land)", timeoutMs: 10 * 60 * 1000 },
  );
  return { hitAllLandHa: ha(sums.hitHa), landHa: ha(sums.landHa), shareOfLand: pct(sums.hitHa, sums.landHa) };
}

async function runMonth(id, event, month, { allLand = false } = {}) {
  const area = boxArea(id, event.box);
  const grid = planGrid(area.geometry);
  const conflict = teamConflict({ mode: "disaster", since: event.since, type: event.type }, area.id);
  const started = Date.now();
  const result = await gee.analyze({ area, cells: grid.cells, month, cellSizeDeg: grid.cellSizeDeg, conflict, onProgress: () => {} });
  const run = buildRun({ area, month, provider: "gee", readings: result.readings, alerts: result.alerts, warnings: result.warnings, cellSizeDeg: grid.cellSizeDeg, cells: grid.cells, baseline: result.baseline, conflict: result.conflict, conflictSource: "area", imagery: result.imagery, accessSource: result.accessSource, disasterDamage: result.disasterDamage });
  const t = run.totals;
  const wetNowCropHa = run.cells.reduce((sum, cell) => sum + (cell.croplandHa || 0) * (cell.raw.wetNowShare || 0), 0);
  const scored = scorePlaces(run.cells, { settings: DEFAULT_SETTINGS, conflict: run.conflict, cellSizeDeg: run.cellSizeDeg });
  const out = {
    event: id,
    type: event.type,
    since: event.since,
    month,
    cells: run.cellCount,
    cellKm: run.cellSizeKm,
    seconds: Math.round((Date.now() - started) / 1000),
    croplandHa: t.croplandHa,
    blackSoilHa: t.blackSoilHa,
    hitCropHa: ha(t.hitCropHa),
    hitCropShare: pct(t.hitCropHa, t.croplandHa),
    heavyCropHa: ha(t.heavyCropHa),
    heavyCropShare: pct(t.heavyCropHa, t.croplandHa),
    hitBlackSoilHa: ha(t.hitHa),
    heavyBlackSoilHa: ha(t.heavyDamageHa),
    grassHitHa: ha(t.grassHitHa),
    wetNowCropHa: ha(wetNowCropHa),
    accessSource: run.accessSource,
    setAsideSquares: scored.places.filter((place) => place.nearTerm.tier === "setAside").length,
    rankedSquares: scored.places.filter((place) => place.analyzed).length,
    fireNearSquares: run.cells.filter((cell) => Number.isFinite(cell.raw.fireKm) && cell.raw.fireKm < WILDFIRE.fullKm).length,
    imagery: run.imagery,
    warnings: run.checks.warnings,
  };
  // A run whose growing season fell back to the latitude (Earth Engine ran
  // short, for example while other work ran alongside) is not the method's
  // own answer: never record it as a check.
  out.degraded = out.warnings.some((text) => text.includes("it was taken from the latitude"));
  if (allLand && (event.type === "flood" || event.type === "wildfire")) {
    const ee = await connect();
    Object.assign(out, await allLandHit(ee, { area, cells: grid.cells, cellSizeDeg: grid.cellSizeDeg, month, conflict: run.conflict }));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (args.includes("--list") || !get("event")) {
    console.log("npm run disaster:check -- --event=<id> [--month=YYYY-MM] [--all-land]\nEvents:");
    for (const [id, event] of Object.entries(EVENTS)) console.log(`  ${id.padEnd(18)} ${event.type.padEnd(9)} since ${event.since}  ${event.months.join(", ")}  ${event.name}`);
    process.exit(args.includes("--list") ? 0 : 1);
  }
  const id = get("event");
  const event = EVENTS[id];
  if (!event) {
    console.error(`No event "${id}". Use --list.`);
    process.exit(1);
  }
  const months = get("month") ? [get("month")] : event.months;
  for (const month of months) {
    const out = await runMonth(id, event, month, { allLand: args.includes("--all-land") });
    console.log(JSON.stringify(out));
    console.error(`${id} ${month}: cropland hit ${out.hitCropHa} ha (${out.hitCropShare}%), heavy ${out.heavyCropHa} ha, grass hit ${out.grassHitHa} ha, under water now ${out.wetNowCropHa} ha, ${out.accessSource}, ${out.setAsideSquares} of ${out.rankedSquares} ranked squares left out, ${out.seconds} s${out.hitAllLandHa != null ? `, all land hit ${out.hitAllLandHa} ha (${out.shareOfLand}% of the box)` : ""}${out.degraded ? " -- DEGRADED: the season was taken from the latitude, run it again alone" : ""}`);
  }
  process.exit(0);
}

// Only when run as a script (the test imports EVENTS).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAILED: ${error.message}`);
    process.exit(1);
  });
}

