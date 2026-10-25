// WHAT THIS FILE DOES
// The real data source: Google Earth Engine. For every grid cell of an
// area it measures, for one month, the satellite readings the Atlas
// scores are built from. It follows the owner's research backend (the
// server.js in the Harvard Dataverse deposit) step by step, but for any
// area instead of only Ukraine, and for the month being analyzed instead
// of "the latest season".
//
//   status()               is Earth Engine set up, and does signing in work?
//   analyze({ area, cells, month, cellSizeDeg, conflict, onProgress, signal })
//                          -> { readings, alerts, warnings, baseline, conflict,
//                               imagery, accessSource } (one reading per cell;
//                               signal: a person's Stop, server/jobs.js)
//   searchAdmin1(q)        regions (provinces, oblasts, states) by name
//   admin1Boundary(id)     one of those regions: { id, name, country, geometry }
//   adminUnits({ geometry, level, adm1Code, clip, toleranceM })
//                          the FAO GAUL 2015 states or districts of an area,
//                          with their borders (server/units.js)
//   soilHistogram({ geometry })
//                          the USDA great groups in a square or a state:
//                          pixel counts per class, over its cropland and over
//                          all of it (server/soil.js)
//
// What each reading comes from (dataset ids are Earth Engine catalog ids):
//   chernozem      GEE_CHERNOZEM_ASSET band b1 / 89 (SoilGrids WRB Chernozem
//                  probability, the deposit's asset) when it is set and
//                  readable; else (and where it has no data) the share of
//                  black soil on OpenLandMap's USDA great-group map
//                  (OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01, Mollisols
//                  except the cold and bleached ones, see BLACK_SOIL); where
//                  that has no data either, SoilGrids soil organic carbon
//                  (projects/soilgrids-isric/soc_mean, 0-5 cm), see SOC
//   croplandShare  ESA/WorldCover/v200, share of pixels with class 40 (cropland)
//   chiDrop        drop of the Chernozem Health Index (COPERNICUS/S2_SR_HARMONIZED,
//                  formula below) from the same season of 2019-2021 (one
//                  composite) to the last complete growing season. A
//                  DIAGNOSTIC only: crop rotation moves it, so it is not
//                  part of the damage score or of heavy damage
//   radarDb        mean radar change of Sentinel-1 VV (COPERNICUS/S1_GRD,
//                  one orbit direction) over the cell's cropland: per pixel
//                  |each complete war season's median - the same season's
//                  median in 2019-2021|, and of those the change that
//                  persists (reached in at least two seasons; with one
//                  season, that one: seasonRadarImages, src/lib/atlas/
//                  method.js radarPersistence and FIRE_YEARS)
//   heavyShare     share of cropland pixels heavily damaged (method.js
//                  HEAVY_DAMAGE), on the lasting radar change (reached in
//                  at least two war seasons; with one season, that one):
//                  3 dB or more, or 2 dB or more within 1 km of an unusual
//                  fire; away from any known war (and in the squares of an
//                  area outside the squares of a war that covers it only
//                  in part) 3 dB or more AND within 1 km of an unusual fire
//   firesPer100Km2 FIRMS (band T21) detections above the normal (2019-2021
//                  count / 3) in the WORST war year of the damage window
//                  (years from the war's start, not overlapping), the
//                  cell's mean, never below 0, per 100 km² (fireImages). The
//                  damage window starts the day a known war began
//                  (src/config/conflicts.js), else two years back, so farm
//                  burning that comes every year does not count
//   conflictKm     distance to recent battles (ACLED file, acled.js); without
//                  a file, inside a known war, to unusual fire detections of
//                  the last 12 months (FIGHTING_FIRES; for a war that covers
//                  the area only in part, those inside its boxes); outside any known war
//                  (or in a month before its war began) without a file, not
//                  measured: 300 km everywhere, so nothing is set aside for
//                  it (which does not make the land safe). Inside a war
//                  where no fire within 300 km of any square looks like
//                  fighting, 300 km everywhere too, and the result says
//                  safe access is not measured (accessSource "fires-none")
//   population     WorldPop/GP/100m/pop (2020), people living in the cell
//   lights         NASA/VIIRS/002/VNP46A2 night lights, median of the month
//   admin1/admin2  FAO/GAUL/2015/level2 names (best effort)
// Alerts: Sentinel-1 radar change (COPERNICUS/S1_GRD, VV, one orbit
// direction) in the month against the same month of 2019-2021 (only in
// squares with enough black-soil cropland to be ranked), and FIRMS fires in
// the month above the same month's 2019-2021 count.
//
// Safety rules that keep a first real run from failing (each one is a
// problem Earth Engine really has):
//   - never a JavaScript null inside ee.Dictionary or ee.Algorithms.If:
//     "nothing found" is sent as -1 and turned back into null here
//   - cells are measured in chunks; big cells mean fewer cells per chunk
//     (see chunkSizeFor), at most 2 chunks at once, each with a time limit
//   - a chunk that finds Earth Engine's servers full ("memory capacity
//     exceeded") is tried again as it is after 5 s, then lighter after 20
//     s; one that is too big ("User memory limit exceeded", "Computation
//     timed out", our own time limit) goes lighter at once: split in
//     halves with the same pixels (SPLIT_MIN_CELLS), and only a small piece
//     that still fails with coarser pixels (coarserScale), before giving
//     up; the image checks likewise, the lighter try one count per request
//     (retryTooMuchWork, MEMORY_RETRY_MS)
//   - the Earth Engine library's own deadline comes a minute after our
//     longest time limit (EE_DEADLINE_MS), so a request that runs too long
//     ends with our limit (too big: lighter) and not with the library's
//     "HTTP code: -1" (a dropped connection: the same request again); the
//     season finder, which has no lighter form, sends such a group once
//     more before the latitude decides (seasonPeaks)
//   - once one chunk (or one count of a lighter image check) has failed,
//     no further one is started (mapLimit); once the month has failed (or
//     a person stopped the analysis: signal), no request of it that is not
//     out yet is sent (analyze, evaluate: context.failed, stopWhenFailed);
//     once the season finder has given up, nothing more of it is sent
//     (seasonPeaks)
//   - Earth Engine too busy ("Too many concurrent aggregations.") is not a
//     quota: after its retries the month fails and the job goes on with
//     the others (explainGeeError "busy"); a real quota stops the job
//   - the analysis runs in the background: while a Field request or a
//     region search is out (a Field request that waits to be tried again
//     included) it holds back its new requests, asset reads too, each for
//     10 minutes at the most (evaluate, waitForInteractive, YIELD). What
//     the Earth Engine library does by itself (429 answers sent again, one
//     send every 350 ms) is outside this (YIELD)
//   - population is never re-projected over a whole country (see
//     populationPlan)
//   - date windows stop at today, so nothing asks for future images
//
// Works anywhere on Earth: each cell's growing season comes from its own
// greenest month in 2019-2021 (MODIS NDVI, MODIS/061/MOD13A2; see
// src/lib/season.js), or from its latitude where that is not clear; cells
// are measured in groups of the same season. The war, if any, comes from
// the job (the team's choice for the area, else the app's list:
// server/conflicts.js). An area that holds its war only in part (a whole
// country, or a region, box or drawn area across the edge of the war's
// boxes: conflict.partOfCountry, server/conflicts.js listWarFor) gets the
// war's rules square by square: in the squares that touch the war's boxes
// or lie in another listed war (server/conflicts.js warCellsFor), with
// unusual fires inside the boxes and those squares standing in for
// fighting; elsewhere the peace rule for heavy damage (each reading says
// which: atWar). Every square keeps the war's dates (the damage window,
// the fire years, the war seasons). The result
// says which war it used (`conflict`, or null at peace), which season it
// compared (`imagery`) and where distance to fighting came from
// (`accessSource`: "acled", "fires", "fires-none" when no fire looked like
// fighting, or "none").
//
// Nothing here runs until Earth Engine credentials are in .env (see
// docs/CONNECT-DATA.md). `npm run gee:check` tries it on real data.
// Tests (gee.test.js) run the whole analysis against a stand-in for Earth
// Engine (fake-ee.js), and check the plain helpers at the bottom.
//
// WHO EDITS IT
// Whoever changes how the satellite data is measured. Keep it in step with
// the research method (src/lib/atlas/method.js) and the deposit.

import { config, missingGeeSettings } from "../env.js";
import { cellAreaKm2, formatCoord } from "../geo.js";
import { NO_WAR_WARNING, addMonths, beforeWarWarning, cleanConflict } from "../runs.js";
import { FIRE_YEARS, HEAVY_DAMAGE, fireYears } from "../../src/lib/atlas/method.js";
import { blackSoilFloor } from "../../src/lib/atlas/scoring.js";
import { areaDamageSeasons, baselineWindows, climateBand, damageSeasons, lastCompleteSeason, peakMonthFrom, sameWindowIn, windowLabel } from "../../src/lib/season.js";
import { damageWindow, warBoxes, warSquares } from "../../src/config/conflicts.js";
import { conflictForArea, warCellsFor } from "../conflicts.js";
import { acledBattlesFor, expandBbox } from "./acled.js";

// ---------- Fixed choices ----------

export const DATASETS = {
  sentinel2: "COPERNICUS/S2_SR_HARMONIZED",
  sentinel1: "COPERNICUS/S1_GRD",
  worldCover: "ESA/WorldCover/v200",
  blackSoil: "OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01",
  soc: "projects/soilgrids-isric/soc_mean",
  firms: "FIRMS",
  modisNdvi: "MODIS/061/MOD13A2",
  viirs: "NASA/VIIRS/002/VNP46A2",
  worldPop: "WorldPop/GP/100m/pop",
  gaul1: "FAO/GAUL/2015/level1",
  gaul2: "FAO/GAUL/2015/level2",
};

export const BANDS = {
  chernozemAsset: "b1", // 0..89 in the deposit's asset, divided by 89 like the Colab notebook
  blackSoil: "grtgroup", // USDA great group, the most likely class, 250 m
  soc: "soc_0-5cm_mean", // soil organic carbon 0-5 cm, dg/kg
  worldCover: "Map",
  firms: "T21",
  viirs: "Gap_Filled_DNB_BRDF_Corrected_NTL",
  worldPop: "population",
  sentinel1: "VV",
  modisNdvi: "NDVI", // x 0.0001
};

// The "before" picture: the same months of 2019, 2020 and 2021, in one
// composite (the research compares several pre-war years with the war
// years). One year alone mixed weather and crop rotation into "damage":
// real run, Ukraine, September 2026, 2021 alone (a record harvest year):
// 8.8M ha of black-soil cropland "heavily damaged", most of it in the
// drought-hit centre and south; 2019-2021: 2.6M ha (probe, same month),
// in line with the research's ~2M ha.
export const BASELINE_FROM = 2019;
export const BASELINE_YEAR = 2021; // the last baseline year
export const BASELINE_YEARS = Array.from({ length: BASELINE_YEAR - BASELINE_FROM + 1 }, (_, i) => BASELINE_FROM + i);
export const GEE_BASELINE = { from: BASELINE_FROM, to: BASELINE_YEAR, label: `${BASELINE_FROM} to ${BASELINE_YEAR} (same months)` };
// The start of the full-scale invasion of Ukraine. Kept for the Field
// provider; the Atlas takes the war's start from src/config/conflicts.js.
export const WAR_START = "2022-02-24";
// The normal fire rate of a place: all its FIRMS detections in 2019, 2020
// and 2021 (whole years), per day. Fires in the damage window count only
// above that rate times the window's length.
export const FIRE_NORMAL = { start: `${BASELINE_FROM}-01-01`, end: `${BASELINE_YEAR + 1}-01-01` };
// What a run says when there is no war and no ACLED file (runs.js).
export { NO_WAR_WARNING };
// Sentinel-2 scenes cloudier than this are skipped (deposit: 55%).
export const MAX_CLOUD_PERCENT = 55;
// Distance to fighting is measured up to 300 km; farther counts as 300 km.
export const MAX_CONFLICT_M = 300000;
// Without an ACLED file, "fighting" is fire that is NOT normal for the
// place: a fire detection of the last 12 months where the fire density
// within radiusM is at least timesPrewar times the same 12 months' mean of
// 2019-2021 AND at least minPerKm2 detections per km² (per 1 km pixel).
// Farm burning comes back every year at the same places, so it cancels out;
// the front does not. Real data, October 2026 (probe): plain fires put Lviv
// 7 km and Odesa 5 km from "fighting" (Ukraine median 18 km); with this
// rule Kupiansk 1 km, Pokrovsk 2, Kherson 10, Kharkiv 28, Dnipro 75, Odesa
// 100, Poltava 140, Lviv and Uzhhorod 300+. A 90-day window failed in
// winter (too few fires anywhere: Kherson 295 km), so 12 months are used.
// The floor is set at a front line, so a war of scattered strikes can stay
// under it everywhere. Real data, 2026-10-21: south Lebanon (the
// Israel–Hezbollah war, September 2026) had 463 fire-pixel days in a
// 1,200 km² box and 2,095 within 100 km over the last 12 months, but its
// densest 10 km neighbourhood reached 0.74 per km² against the floor of
// 1: no fire counted as fighting, every square read 300 km, and the run
// still said distance was "estimated from unusual fires". Such a run now
// says safe access is not measured there (accessSource "fires-none",
// farFromAnyFighting, noFightingFiresWarning); the rule itself is kept
// (changing it would change every war's numbers and METHOD_VERSION). An
// ACLED file, or the team's own knowledge, is needed in such a war.
export const FIGHTING_FIRES = { radiusM: 10000, timesPrewar: 3, minPerKm2: 1 };
// What a run inside a war says when no fire within 300 km of any square
// looks like fighting (FIGHTING_FIRES found none, or there was no fire
// data to look in), so safe access is not measured (accessSource
// "fires-none": the readings keep their 300 km, nothing is set aside for
// it, and the pages and the AI say it is not measured, never that the
// land is safe):
//   since     the day the war began, in its first year (monthWindows
//             fightingSince): only the fires since then were looked at
//   region    "war" for a war that covers the area only in part (only the
//             fires inside its region count), "war+other" when its squares
//             in another listed war count too; null otherwise
//   fireData  false when NASA FIRMS had no fire data for the window at all
//             (the preflight's firmsYear counts its daily images, so none
//             is a gap in the data, never a land without fires): nothing
//             could be looked for
//   acled     what the ACLED file did (acled.js acledBattlesFor status):
//             "no-battles" (connected, but no battles within 300 km) and
//             "unusable" (named in ACLED_CSV_PATH but not usable) say so
//             in the last sentence instead of "An ACLED file ... would
//             measure it", which would read as "there is no file"
//             (src/lib/atlas/overview.js acledFileState)
export function noFightingFiresWarning({ since = null, region = null, fireData = true, acled = null } = {}) {
  const km = MAX_CONFLICT_M / 1000;
  const where = region ? ` inside the war's region${region === "war+other" ? " and its squares in another listed war" : ""}` : "";
  const when = since ? `since the war began on ${since}` : "in the last 12 months";
  const per = FIGHTING_FIRES.minPerKm2;
  // In a war's first year the floor is scaled to its days (fightingFires).
  // Both conditions are named: dense fire that is usual for the place
  // (seasonal farm burning) is not fighting either.
  const floor = `about ${per} detection${per === 1 ? "" : "s"} per km²${since ? " a year" : ""} within ${FIGHTING_FIRES.radiusM / 1000} km and ${FIGHTING_FIRES.timesPrewar} times the normal years' rate`;
  const found = fireData
    ? `No fires that look like fighting were found within ${km} km${where} ${when} (the rule needs fire as dense as at a front line, ${floor}; scattered strikes do not reach it).`
    : `No fire data (NASA FIRMS) was available ${since ? `since the war began on ${since}` : "for the last 12 months"}, so fires that look like fighting could not be looked for.`;
  const measure =
    acled === "no-battles"
      ? "The ACLED file has no battles within 300 km of this area in the last 12 months either (only battles count, not strikes or shelling), so it cannot measure it: check that the export covers this country and its neighbours, or rely on your team's knowledge of where the fighting is."
      : acled === "unusable"
        ? "The ACLED file could not be used (see its warning), so it cannot measure it either: fix the file that ACLED_CSV_PATH names."
        : "An ACLED file of recorded fighting would measure it.";
  return `${found} Safe access is not measured here: every square counts as far from fighting, which does NOT make the land safe. ${measure}`;
}
// True when every reading is MAX_CONFLICT_M or more from fighting: no
// fighting fire within 300 km of any square (there is at least one).
export function farFromAnyFighting(readings) {
  return readings.length > 0 && readings.every((reading) => reading.conflictKm >= MAX_CONFLICT_M / 1000);
}
// A radar pixel "changed" when its VV backscatter moved by more than 2 dB
// (radar alerts: the month against the same month of 2019-2021).
export const RADAR_CHANGE_DB = 2;
// A season's median VV below this (dB) is open water, not farmland.
export const WATER_VV_DB = -18;
// Radar alerts: the median change within this many km of the cells (at
// this pixel size, m) is the neighbourhood's own shift.
export const RADAR_SHIFT = { aroundKm: 20, scale: 500, maxPixels: 1e7 };
// Radar alerts in a large area: a cell must have changed this many times as
// much as the area's median cell (with at least minCells cells to judge).
// An alert joins touching cells up to `reach` cells from its strongest one
// (a 5 x 5 block at most), so one alert is one event, not a whole front.
export const RADAR_ALERT = { timesTypical: 2, minCells: 20, reach: 2 };
// Sentinel-1 orbit directions; one is used per comparison (pickPass).
export const ORBIT_PASSES = ["ASCENDING", "DESCENDING"];
// Unusual fire for heavy damage: the fire density over this radius (m)
// above the normal years' (the paper smooths fire over 5 km).
export const FIRE_SMOOTH_M = 5000;
// Small areas: the fire images (the 5 km smoothing) and the distance to
// fighting are worked out on a 1 km grid (FIRE_GRID_M: EPSG:4326 at 1 km,
// the grid the other fire counts here use) when the cells are measured
// with pixels finer than FINE_SCALE_M, and the 1 km "unusual fire nearby"
// ring is drawn around those 1 km fire pixels on a RING_GRID_M grid, so it
// keeps its size (on the 1 km grid itself a 1 km circle is only the pixel
// and its four neighbours). Without this Earth Engine does the smoothing
// at the cells' own pixel size: at 46 m (1 km cells, a box of about 1,200
// km²) each pixel's 5 km circle holds about 37,000 pixels, for every war
// year. Real data, 2026-10-20: a 0.4° x 0.3° box in south Lebanon (1,200
// cells of 1 km) ran over 30 minutes on one month, at war and at peace,
// and failed; Lebanon (5 km cells, 231 m pixels) took 12 minutes; Kharkiv
// oblast (11 km cells, 362 m pixels) took about 30 s. FIRMS detections are
// 1 km footprints, so the fire maths loses no detail on the 1 km grid
// (a fire pixel can land one grid step off). Cells of about 6 km or more
// (measured at FINE_SCALE_M or coarser: Ukraine, Kenya, Kharkiv oblast and
// the other saved areas) are computed exactly as before; small countries
// such as Lebanon or Israel now take the 1 km grid too.
export const FINE_SCALE_M = 300;
export const FIRE_GRID_M = 1000;
export const RING_GRID_M = 250;
// Finding each place's growing season (src/lib/season.js): the mean MODIS
// NDVI of each calendar month in 2019-2021 over the cell's cropland,
// reduced at a pixel size between minScale and maxScale (m). At most
// maxGroups different seasons per area (smaller groups join the nearest
// season), each kept only when it has at least minShare of the cells.
export const SEASON_FINDER = { start: "2019-01-01", end: "2022-01-01", ndviScale: 0.0001, minScale: 250, maxScale: 1000, maxGroups: 3, minShare: 0.05 };
// The most cells in one Earth Engine request (small cells), the fewest
// (huge cells), and roughly how much ground one request covers (km²).
// The deposit measured all of Ukraine (~600,000 km²) in one request at
// 1 km pixels; 50,000 km² per request leaves a wide safety margin.
export const CHUNK_SIZE = 250;
export const MIN_CHUNK_SIZE = 10;
export const CHUNK_AREA_KM2 = 50000;
// At most this many groups of cells of one month are measured at the same
// time (and as many groups of the season finder). It is not a limit for the
// whole server: the month's image checks, a farm's analysis (field-gee.js
// PARALLEL_REQUESTS) and searches each have their own.
export const MAX_PARALLEL_CHUNKS = 2;
// A chunk that runs out of memory or time is split in two (same pixels)
// until its pieces have this many cells or fewer; only such a piece that
// still fails is measured with coarser pixels.
export const SPLIT_MIN_CELLS = 4;
// How long one request may take before it is given up (or tried lighter):
// the default, for a group of cells and most Field requests. It is the
// longest time limit of any request (the others are shorter), and the
// library's own deadline comes a minute later (EE_DEADLINE_MS), so a
// request that runs this long ends with our GeeError "timeout", which
// counts as too much work (isTooMuchWorkError).
export const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;
// The deadline the Earth Engine library gives each request itself
// (ee.data.setDeadline, connectWith). It must come after every time limit
// of ours: at its deadline the library answers "Server returned HTTP code:
// -1", which reads as a dropped connection (isTransientError), so the same
// request is sent again unchanged and the lighter one never goes. Real
// data, 2026-10-19: with both at 5 minutes the library's came first, and a
// farm's "Measuring 8 fields" failed twice on "HTTP code: -1" without the
// coarser pixels (field-gee.js PLANS) being tried. The margin is a choice
// (2026-10-19), kept as it is: a few seconds would do (the library starts
// its timer when it sends the request, at most a moment before ours, later
// when its queue holds it), and the cost of a minute is that a request we
// give up on stays open in the library, Earth Engine perhaps still working
// on it, for up to a minute more (docs/METHODS.md).
export const EE_DEADLINE_MS = CHUNK_TIMEOUT_MS + 60 * 1000;
// How long one try of a check of which images exist may take: the Atlas's
// image checks (all counts in one request, and the lighter try, one count
// per request) and the Field's "Checking satellite images". Alone the
// Atlas's checks take 1 to 8 s (Ukraine, real data); the Field's was not
// timed. Real data, 2026-10-19: while a farm was analyzed in a second
// process on the same project, Ukraine's counts ran past the 2-minute
// limit they had then, and August and September 2026 failed. 4 minutes is
// a guess from that one incident, not measured under that load.
export const COUNT_TIMEOUT_MS = 4 * 60 * 1000;
// The Atlas gives way to the Field (evaluate, waitForInteractive): while a
// Field request or another interactive one (a region search, a region
// outline, a map's description read for a farm, a GeoTIFF link being made)
// is out, the Atlas's analysis sends no new request (no asset read either:
// getAsset); those already out finish. A request is out until it answers,
// fails or reaches our time limit (the library may keep its connection
// open until EE_DEADLINE_MS), and a Field request that waits to be tried
// again (retryTransient: 8 s after a dropped connection, 40 s and then 80 s
// when Earth Engine is busy) still counts (holdInteractive). Once a farm's
// analysis has failed, nothing of it counts any more (countInteractive):
// nobody waits for that work. The Atlas goes on once none has been out for
// settleMs (a Field analysis has short gaps between its requests), or after
// waiting maxWaitMs, so a busy farm slows the Atlas down but never stops
// it. This counts the requests of this server process only: a second
// server or a script using the same project is not seen. Nor is what the
// Earth Engine library does on its own once a request is handed to it: it
// sends a request answered 429 ("too many requests") again, up to 10 times
// over about 10 minutes, and sends all requests through one queue, one
// every 350 ms (@google/earthengine 1.7.48, apiclient.js MAX_ASYNC_RETRIES_
// and REQUEST_THROTTLE_INTERVAL_MS_). Nor is a GeoTIFF download itself:
// Earth Engine makes the file when the browser fetches the link.
export const YIELD = { settleMs: 3000, maxWaitMs: 10 * 60 * 1000 };
// What an Atlas analysis says (onProgress) while its requests wait; the
// Atlas page shows it under the progress bar (server/jobs.js job.waiting).
export const WAITING_MESSAGE = "Waiting for farm analyses and searches to finish";
// Earth Engine splits work into smaller tiles when tileScale is higher:
// slower, but uses less memory. Cells this wide (km) or wider get 16.
export const BIG_CELL_KM = 10;
// The most pixels Earth Engine may read for one cell.
export const MAX_PIXELS_PER_CELL = 1e9;
// The WorldCover class for cropland.
export const CROPLAND_CLASS = 40;
// WorldPop 100 m pixels are 3 arc-seconds square. One pixel's area at the
// equator (m²); away from it, multiply by cos(latitude).
export const WORLDPOP_PIXEL_DEG = 3 / 3600;
export const WORLDPOP_PIXEL_M2_AT_EQUATOR = (WORLDPOP_PIXEL_DEG * 111319.49) ** 2;
// "Nothing found" inside Earth Engine (it does not accept null there).
export const NONE = -1;

// The black-soil map used when there is no chernozem asset (the owner's
// choice, 2026-10-18): OpenLandMap's USDA great groups. Black soil = the
// Mollisol great groups (names ending in "olls") except the cold ones
// (Cryolls, Cryaquolls, Cryoborolls) and the bleached ones (Albolls). The
// share of a cell or field in those groups is the "chernozem" value, so it
// works worldwide (Ukraine, the US prairie, north-east China). It is broader
// than the research's WRB Chernozem >= 0.5 (it also counts Phaeozems and
// Kastanozems), so national black-soil totals come out higher than the
// paper's 15.07 million ha.
export const BLACK_SOIL_SOURCE = "Black-soil map: OpenLandMap USDA soil classes (Mollisols), 250 m";
export const BLACK_SOIL = {
  keep: /olls$/i,
  drop: /cryolls$|albolls$|cryoborolls$|^cryaquolls$/i,
  // The class values when the map's own class list cannot be read
  // (grtgroup_class_values / grtgroup_class_names, read 2026-10-18).
  classes: [269, 271, 272, 273, 274, 276, 277, 278, 280, 283, 284, 285, 286, 289, 290, 291, 292, 294, 296, 297, 298, 300, 301, 302, 303, 306, 307, 308, 310, 311, 312],
};

// The black-soil class values from the map's properties, or null.
export function blackSoilClassesFrom(properties) {
  const values = properties?.grtgroup_class_values;
  const names = properties?.grtgroup_class_names;
  if (!Array.isArray(values) || !Array.isArray(names) || values.length !== names.length) return null;
  const picked = values.filter((value, i) => Number.isFinite(value) && typeof names[i] === "string" && BLACK_SOIL.keep.test(names[i]) && !BLACK_SOIL.drop.test(names[i]));
  return picked.length ? picked : null;
}

// The class list, read once per Earth Engine connection (checkChernozemAsset
// does it before any image is built; `context` as for getAsset).
const blackSoilClassesByEe = new WeakMap();
async function loadBlackSoilClasses(ee, context) {
  if (blackSoilClassesByEe.has(ee)) return blackSoilClassesByEe.get(ee);
  let classes = BLACK_SOIL.classes;
  try {
    classes = blackSoilClassesFrom((await getAsset(ee, DATASETS.blackSoil, context))?.properties) || BLACK_SOIL.classes;
  } catch (error) {
    // The built-in list is the same classes. Not read because the month had
    // already failed: not remembered, so the next month reads it.
    if (error?.code === "stopped") return classes;
  }
  blackSoilClassesByEe.set(ee, classes);
  return classes;
}

// 1 where the great group is black soil, 0 elsewhere; masked where the map
// has no data. Its mean over a cell or field is the black-soil share.
export function blackSoilImage(ee) {
  const classes = blackSoilClassesByEe.get(ee) || BLACK_SOIL.classes;
  return ee
    .Image(DATASETS.blackSoil)
    .select(BANDS.blackSoil)
    .remap(classes, classes.map(() => 1), 0)
    .rename("blackSoil");
}

// Soil organic carbon -> a 0..1 stand-in for chernozem, used only where
// the black-soil map has no data. SoilGrids stores SOC in dg/kg, so
// g/kg = value × 0.1. The 0..1 scale is the one the research notebook uses
// for its soil score: (SOC g/kg − 10) / 50, so 10 g/kg or less (poor soil)
// -> 0, 60 g/kg or more -> 1, a typical chernozem topsoil (30–40 g/kg) ->
// about 0.4–0.6.
export const SOC = { unitGkg: 0.1, offsetGkg: 10, spanGkg: 50 };

// The same formula as plain arithmetic, for tests and the gee:check script.
export function socToChernozem(rawValue) {
  if (!Number.isFinite(rawValue)) return null;
  const gkg = rawValue * SOC.unitGkg;
  return Math.min(1, Math.max(0, (gkg - SOC.offsetGkg) / SOC.spanGkg));
}

// ---------- The provider ----------

// The pause before the one retry of a request whose connection dropped
// (isTransientError).
export const TRANSIENT_RETRY_MS = 8000;
// The pauses before the two retries after Earth Engine ran short of memory
// or time (retryTooMuchWork): 5 s, then 20 s.
export const MEMORY_RETRY_MS = [5000, 20000];

// Makes a provider. The app uses the ready-made one below; tests pass
//   ee         a stand-in Earth Engine library (fake-ee.js)
//   getConfig  settings to use instead of .env
//   now        the clock, () => Date (so "today" can be fixed in tests)
//   retryDelayMs  the pause before retrying a dropped request (default
//              TRANSIENT_RETRY_MS; tests use 0)
//   memoryRetryMs the pauses before the two retries after Earth Engine ran
//              short of memory or time (default MEMORY_RETRY_MS; with
//              retryDelayMs set and this not, that pause)
// Anything else in `options` is ignored (providers/index.js passes the
// .env settings here).
export function createGeeProvider(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const injectedEe = opts.ee && typeof opts.ee === "object" && opts.ee.data ? opts.ee : null;
  const getConfig = typeof opts.getConfig === "function" ? opts.getConfig : config;
  const now = typeof opts.now === "function" ? opts.now : () => new Date();
  // The real library signs in once for the whole server; a stand-in gets its own state.
  const state = injectedEe ? newState(injectedEe) : sharedState();
  const retryDelayMs = Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : TRANSIENT_RETRY_MS;
  // The pauses before the retries after "out of memory" or "timed out"
  // (retryTooMuchWork); a test that sets retryDelayMs gets that pause.
  const memoryRetryMs = Array.isArray(opts.memoryRetryMs) ? opts.memoryRetryMs : Number.isFinite(opts.retryDelayMs) ? MEMORY_RETRY_MS.map(() => opts.retryDelayMs) : [...MEMORY_RETRY_MS];
  const deps = { getConfig, now, state, retryDelayMs, memoryRetryMs, connect: (cfg = getConfig()) => connectWith(state, cfg) };
  return {
    id: "gee",
    label: "Earth Engine",
    status: () => status(deps),
    analyze: (input) => analyze(deps, input),
    searchAdmin1: (q) => searchAdmin1(deps, q),
    admin1Boundary: (id) => admin1Details(deps, id),
    admin1Details: (id) => admin1Details(deps, id),
    adminUnits: (input) => adminUnits(deps, input),
    soilHistogram: (input) => soilHistogram(deps, input),
    probePoint: (point) => readPoint(deps, point),
    connect: deps.connect,
  };
}

export const geeProvider = createGeeProvider();
export default geeProvider;

// Signs in (see connectWith) and gives back the `ee` library.
export function connect(cfg = config()) {
  return geeProvider.connect(cfg);
}

// For the gee:check script: the raw soil values at one point.
export function probePoint(point) {
  return geeProvider.probePoint(point);
}

// True when .env has what Earth Engine needs (and it is not turned off).
export function isGeeConfigured(cfg = config()) {
  return !cfg.geeDisabled && !cfg.geeCredentialsError && missingGeeSettings(cfg).length === 0;
}

// What is missing, in words a person can act on. Empty when nothing is.
export function setupProblems(cfg = config()) {
  const problems = [];
  if (cfg.geeDisabled) problems.push("Earth Engine is turned off (GEE_DISABLED=1 in .env).");
  if (cfg.geeCredentialsError) problems.push(cfg.geeCredentialsError);
  const missing = missingGeeSettings(cfg).filter((name) => !(cfg.geeCredentialsError && name.includes("CREDENTIALS")));
  if (missing.length) problems.push(`Missing in .env: ${missing.join(", ")}.`);
  return problems;
}

async function status(deps) {
  const cfg = deps.getConfig();
  const problems = setupProblems(cfg);
  if (problems.length) return { ok: false, detail: problems.join(" ") };
  try {
    await deps.connect(cfg);
    return { ok: true, detail: `Connected to project ${cfg.geeProjectId} as ${cfg.geeCredentials.client_email}.` };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

// ---------- Signing in ----------

export class GeeError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "GeeError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

// Kept on globalThis so the dev server, which reloads this file after
// edits, does not sign in again for every request.
function newState(ee = null) {
  return { ee, key: null, promise: null, error: null, failedAt: 0, noMaxPixelsArg: false };
}
function sharedState() {
  const state = (globalThis.__chernozemGee ??= newState());
  state.noMaxPixelsArg ??= false;
  return state;
}
const RETRY_AFTER_MS = 60 * 1000;

async function loadEe(state) {
  if (!state.ee) {
    // The library is CommonJS; under ESM its exports are on .default.
    const mod = await import("@google/earthengine");
    state.ee = mod.default ?? mod;
  }
  return state.ee;
}

// Signs in with the service-account key and starts Earth Engine for the
// project, exactly like the deposit. Gives back the `ee` library.
// Remembers success; a failure is remembered for a minute so a broken key
// does not hammer Google.
async function connectWith(state, cfg) {
  const problems = setupProblems(cfg);
  if (problems.length) throw new GeeError("not_configured", problems.join(" "));
  const context = contextOf(cfg);
  const key = `${cfg.geeProjectId}|${cfg.geeCredentials.client_email}`;
  if (state.key === key && state.promise) return state.promise;
  if (state.key === key && state.error && Date.now() - state.failedAt < RETRY_AFTER_MS) throw state.error;

  const previousKey = state.key;
  state.key = key;
  state.error = null;
  state.promise = (async () => {
    const ee = await loadEe(state);
    if (previousKey && previousKey !== key && typeof ee.reset === "function") ee.reset();
    await withTimeout(
      new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
          cfg.geeCredentials,
          () => ee.initialize(null, null, () => resolve(), (error) => reject(asError(error)), null, cfg.geeProjectId),
          (error) => reject(asError(error)),
        );
      }),
      90 * 1000,
      "Signing in to Earth Engine",
    );
    // After our own time limits (EE_DEADLINE_MS), so ours ends a request
    // that runs too long.
    if (ee.data && typeof ee.data.setDeadline === "function") ee.data.setDeadline(EE_DEADLINE_MS);
    keepTokenFresh(ee);
    return ee;
  })().catch((error) => {
    const friendly = explainGeeError(error, context);
    state.promise = null;
    state.error = friendly;
    state.failedAt = Date.now();
    throw friendly;
  });
  return state.promise;
}

// The sign-in token lasts an hour. When it has run out, @google/earthengine
// refreshes it and then sends the request again WITHOUT its body, and Earth
// Engine answers "Unknown reference to value named ''" (real data, Kenya 12
// months, 2026-10-19: three months failed this way). So the token is
// refreshed BEFORE a request is sent, and the library never takes that path.
export function keepTokenFresh(ee) {
  const data = ee?.data;
  if (!data || data.__freshToken || typeof data.getAuthToken !== "function" || typeof data.refreshAuthToken !== "function") return;
  data.__freshToken = true;
  for (const name of ["computeValue", "getDownloadId"]) {
    const original = data[name];
    if (typeof original !== "function") continue;
    data[name] = function (...args) {
      const callback = args[1];
      // No callback: a synchronous request, which never takes the refresh path.
      if (typeof callback !== "function" || data.getAuthToken() !== null) return original.apply(this, args);
      data.refreshAuthToken(() => original.apply(this, args), (error) => callback(undefined, error instanceof Error ? error.message : String(error)));
      return undefined;
    };
  }
}

export function contextOf(cfg) {
  return {
    projectId: cfg.geeProjectId,
    clientEmail: cfg.geeCredentials?.client_email,
    asset: cfg.chernozemAsset,
  };
}

function asError(error) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : error?.message || JSON.stringify(error));
}

// Runs one Earth Engine computation and waits for the answer, at most
// `timeoutMs` from when it is sent.
//   context.background  true for the Atlas's analysis (analyze): before it
//                       is sent, the request waits while interactive ones
//                       are out (waitForInteractive); context.onWait(true)
//                       and onWait(false, { capped }) hear when such a wait
//                       starts and ends
//   context.failed      newFailure() of the whole analysis the request is
//                       part of (the Atlas's month: analyze; a farm's
//                       analysis and a field's history: field-gee.js): once
//                       it has failed, a request that is not out yet is not
//                       sent (GeeError "stopped"): nobody would use the answer
// Every other request (the Field, region search and outline) is
// interactive: it is sent at once, and counted while it is out, until it
// answers, fails or reaches its time limit, or its analysis fails
// (countInteractive).
export function evaluate(eeObject, options = {}) {
  const context = options?.context || {};
  const what = options?.what || "Earth Engine request";
  if (context.failed?.error) return Promise.reject(notSent(what, context.failed));
  if (!context.background || isQuiet(yieldState())) return send(eeObject, options);
  return waitForInteractive(context).then(() => (context.failed?.error ? Promise.reject(notSent(what, context.failed)) : send(eeObject, options)));
}

const notSent = (what, failed) => new GeeError("stopped", `${what} was not sent: ${failed?.of || "its analysis"} had already failed.`);

function send(eeObject, { timeoutMs = CHUNK_TIMEOUT_MS, what = "Earth Engine request", context = {} } = {}) {
  const end = context?.background ? null : countInteractive(context);
  const request = new Promise((resolve, reject) => {
    eeObject.evaluate((value, error) => (error ? reject(asError(error)) : resolve(value)));
  });
  const answer = withTimeout(request, timeoutMs, what).catch((error) => {
    throw error instanceof GeeError ? error : explainGeeError(error, { ...context, what });
  });
  // `answer` always settles (withTimeout), so the count always comes down.
  return end ? answer.finally(end) : answer;
}

// One whole analysis, as its requests see it (context.failed): the Atlas's
// month (analyze), a farm's analysis or a field's history (field-gee.js).
// Once it has failed (markFailed), nothing more of it is sent (evaluate,
// getAsset, retryTransient), and its interactive requests out and its
// waits to be tried again stop holding the Atlas back (countInteractive).
//   of  what has failed, for the message ("the month", "the farm's analysis")
export function newFailure(of) {
  return { error: null, of, holds: new Set() };
}

// The analysis has failed with `error` (the first error is kept).
export function markFailed(failed, error) {
  if (!failed || failed.error) return;
  failed.error = error || new Error(`${failed.of || "The analysis"} failed.`);
  for (const end of [...(failed.holds || [])]) end();
}

// Runs one whole analysis, `work(failed)` (failed: newFailure(of)), and
// marks it failed when it throws.
export async function stopWhenFailed(of, work) {
  const failed = newFailure(of);
  try {
    return await work(failed);
  } catch (error) {
    markFailed(failed, error);
    throw error;
  }
}

// Who is using Earth Engine now. Kept on globalThis, like the sign-in
// (sharedState), so every copy of this file the dev server loads after an
// edit, and so the Atlas and Field providers made from different copies,
// count the same requests.
//   interactive  interactive requests out
//   lastEndedAt  when the last of them ended (Date.now())
//   waiting      background requests waiting to be sent
//   wake         what wakes those waiting when no interactive one is out
const newYieldState = () => ({ interactive: 0, lastEndedAt: 0, waiting: 0, wake: new Set() });
function yieldState() {
  return (globalThis.__chernozemEeYield ??= newYieldState());
}

// For tests: how many interactive requests are out, and how many background
// requests wait for them.
export function yieldStatus() {
  const { interactive, waiting } = yieldState();
  return { interactive, waiting };
}

// For tests: starts the count again from nothing, so a test that failed
// with a request still counted cannot make the next one fail. A request
// counted before still ends against the count it was in (countInteractive),
// so it changes nothing here.
export function resetYieldState() {
  globalThis.__chernozemEeYield = newYieldState();
}

// No interactive request out, and none ended in the last YIELD.settleMs. A
// clock set back since counts as quiet.
function isQuiet(state, now = Date.now()) {
  const since = now - state.lastEndedAt;
  return state.interactive === 0 && (since >= YIELD.settleMs || since < 0);
}

// Counts one interactive request, or an interactive caller's work
// (holdInteractive), as out, and gives back what ends it: once, like a
// request that ended (interactiveEnded). When the analysis it is part of
// fails (context.failed, markFailed), it ends then: nobody waits for that
// work any more, so the Atlas need not hold back for it. A request of an
// analysis that has already failed is not counted.
function countInteractive(context) {
  const failed = context?.failed;
  if (failed?.error) return () => {};
  const state = yieldState();
  state.interactive += 1;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    failed?.holds?.delete(end);
    interactiveEnded(state);
  };
  failed?.holds?.add(end);
  return end;
}

function interactiveEnded(state) {
  state.interactive = Math.max(0, state.interactive - 1);
  state.lastEndedAt = Date.now();
  if (state.interactive === 0) for (const wake of [...state.wake]) wake();
}

// Counts an interactive caller as out while `work` (a function giving a
// promise) runs, and ends like a request (countInteractive), so the Atlas
// does not go in the gaps of that work. retryTransient uses it for a Field
// request that waits to be tried again (8 s after a dropped connection,
// 40 s and 80 s when Earth Engine is busy: far longer than YIELD.settleMs);
// field-gee.js for the GeoTIFF link. Every such work ends: its requests
// have time limits, its pauses timers. `context` as for evaluate (its
// `failed` ends the hold early).
export async function holdInteractive(work, context = null) {
  const end = countInteractive(context);
  try {
    return await work();
  } finally {
    end();
  }
}

// A background request waits here until isQuiet, or YIELD.maxWaitMs at the
// most (then it goes anyway: onWait(false, { capped: true })). Its own time
// limit starts after this, when it is sent.
async function waitForInteractive(context) {
  const state = yieldState();
  const started = Date.now();
  let capped = false;
  state.waiting += 1;
  try {
    context.onWait?.(true);
    for (;;) {
      const now = Date.now();
      const left = started + YIELD.maxWaitMs - now;
      if (isQuiet(state, now)) return;
      if (left <= 0) {
        capped = true;
        return;
      }
      // Interactive requests out: until the last one ends; none: the rest of
      // the settle time.
      await (state.interactive > 0 ? untilIdle(state, left) : sleep(Math.min(left, YIELD.settleMs - (now - state.lastEndedAt))));
    }
  } finally {
    state.waiting = Math.max(0, state.waiting - 1);
    context.onWait?.(false, { capped });
  }
}

// Resolves when no interactive request is out any more, or after `ms`.
function untilIdle(state, ms) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      state.wake.delete(done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    state.wake.add(done);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads an asset's description (used to check the chernozem map), with a
// context like evaluate's: for the Atlas's analysis (context.background) it
// waits like its other requests while interactive ones are out; for anyone
// else (a farm's analysis, the gee:check script) it is interactive, counted
// while it is out. It is not sent once its analysis has failed (GeeError
// "stopped").
async function getAsset(ee, id, context = {}) {
  const what = `Reading asset ${id}`;
  if (context?.failed?.error) throw notSent(what, context.failed);
  if (context?.background) {
    if (!isQuiet(yieldState())) await waitForInteractive(context);
    if (context.failed?.error) throw notSent(what, context.failed);
  }
  const end = context?.background ? null : countInteractive(context);
  const read = withTimeout(
    new Promise((resolve, reject) => {
      ee.data.getAsset(id, (value, error) => (error ? reject(asError(error)) : resolve(value)));
    }),
    60 * 1000,
    what,
  );
  return end ? read.finally(end) : read;
}

// ---------- Images ----------

// Each helper builds an Earth Engine image or collection for a region and
// a date window ({ start, end }, end not included).

function rect(ee, bbox) {
  return ee.Geometry.Rectangle(bbox, null, false);
}

export function sentinel2(ee, region, window) {
  return ee
    .ImageCollection(DATASETS.sentinel2)
    .filterBounds(region)
    .filterDate(window.start, window.end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_CLOUD_PERCENT));
}

// Deposit's maskSentinel2Clouds: drop cloud shadow (3), clouds (8, 9),
// cirrus (10) and snow (11) using the scene classification band.
function maskSentinel2Clouds(image) {
  const scl = image.select("SCL");
  const clear = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(clear);
}

// Deposit's chiHealthImage, unchanged: Chernozem Health Index 0..1
// (higher = healthier) from a cloud-masked median composite:
//   CHI = 0.30 NDVI + 0.25 NDMI + 0.20 NBR + 0.15 (1 − BSI) + 0.10 RVI
// each index first stretched to 0..1 over a fixed range.
// `window` may be a list of windows: one composite over all their images
// (the multi-year "before" picture).
export function chiHealthImage(ee, region, window) {
  const windows = Array.isArray(window) ? window : [window];
  const collection = windows.map((w) => sentinel2(ee, region, w)).reduce((all, next) => all.merge(next));
  const img = collection.map(maskSentinel2Clouds).median();
  const b2 = img.select("B2");
  const b4 = img.select("B4");
  const b8 = img.select("B8");
  const b11 = img.select("B11");

  const ndvi = img.normalizedDifference(["B8", "B4"]);
  const ndmi = img.normalizedDifference(["B8", "B11"]);
  const nbr = img.normalizedDifference(["B8", "B12"]);
  const bsi = b11.add(b4).subtract(b8.add(b2)).divide(b11.add(b4).add(b8).add(b2));
  const rvi = b8.divide(b4);

  const norm = (band, min, max) => band.subtract(min).divide(max - min).clamp(0, 1);
  return norm(ndvi, 0, 0.9)
    .multiply(0.3)
    .add(norm(ndmi, -0.5, 0.5).multiply(0.25))
    .add(norm(nbr, -0.5, 0.8).multiply(0.2))
    .add(ee.Image(1).subtract(norm(bsi, -0.5, 0.5)).multiply(0.15))
    .add(norm(rvi, 0, 1.5).multiply(0.1))
    .rename("chi");
}

// pass: "ASCENDING" or "DESCENDING" to keep one orbit direction only
// (radar compared across windows must look from the same side).
export function sentinel1(ee, region, window, pass = null) {
  let collection = ee
    .ImageCollection(DATASETS.sentinel1)
    .filterBounds(region)
    .filterDate(window.start, window.end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"));
  if (pass) collection = collection.filter(ee.Filter.eq("orbitProperties_pass", pass));
  return collection.select(BANDS.sentinel1);
}

export function firms(ee, region, window) {
  return ee.ImageCollection(DATASETS.firms).filterBounds(region).filterDate(window.start, window.end).select(BANDS.firms);
}

function viirs(ee, region, window) {
  return ee.ImageCollection(DATASETS.viirs).filterBounds(region).filterDate(window.start, window.end).select(BANDS.viirs);
}

// The deposit's worldPopImage(): WorldPop 2020, band "population" (people
// per ~100 m pixel). The deposit filtered to Ukraine ("UKR"); here every
// country that touches the area is used.
function worldPop(ee, region) {
  return ee.ImageCollection(DATASETS.worldPop).filterBounds(region).filter(ee.Filter.eq("year", 2020)).select(BANDS.worldPop);
}

function croplandImage(ee) {
  return ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).eq(CROPLAND_CLASS).unmask(0).rename("cropland");
}

// A band with no data anywhere (its mean comes back empty).
function emptyBand(ee, name) {
  return ee.Image.constant(0).updateMask(ee.Image.constant(0)).rename(name);
}

// Chernozem 0..1: the chernozem asset where it has data, else the
// black-soil map (BLACK_SOIL), else soil organic carbon. Left masked over
// water so the mean is over land.
export function chernozemImage(ee, assetId) {
  const soc = ee
    .Image(DATASETS.soc)
    .select(BANDS.soc)
    .multiply(SOC.unitGkg)
    .subtract(SOC.offsetGkg)
    .divide(SOC.spanGkg)
    .clamp(0, 1);
  // false: also fill where the map has no pixels at all
  const blackSoil = blackSoilImage(ee).unmask(soc, false);
  if (!assetId) return blackSoil.rename("chernozem");
  return ee
    .Image(assetId)
    .select(BANDS.chernozemAsset)
    .divide(89)
    .clamp(0, 1)
    .unmask(blackSoil, false)
    .rename("chernozem");
}

// People in each cell. Two ways, picked by populationPlan():
//   native  small cells: add up WorldPop's own pixel values on WorldPop's
//           own grid (exact, and cheap because the cells are small)
//   density big cells: people per m² (pixel value ÷ that pixel's area,
//           worked out from the latitude, no re-projecting) times the
//           area of each coarser pixel, added up at a coarser scale
function populationImages(ee, region) {
  const pop = worldPop(ee, region);
  const perPixel = pop.mosaic().unmask(0).rename("people");
  // A WorldPop pixel's area (m²) at each latitude: no reproject needed.
  const nativeArea = ee.Image.pixelLonLat()
    .select("latitude")
    .multiply(Math.PI / 180)
    .cos()
    .multiply(WORLDPOP_PIXEL_M2_AT_EQUATOR);
  const density = perPixel.divide(nativeArea).multiply(ee.Image.pixelArea()).rename("people");
  // A mosaic forgets its grid; give it WorldPop's back (no pixels change).
  const nativeProjection = pop.first().projection();
  return { perPixel: perPixel.setDefaultProjection(nativeProjection), density, nativeProjection };
}

// ---------- One month for one area ----------

// Counts what imagery exists, so empty collections never reach a formula
// (an empty collection has no bands and would make the whole request fail).
// Never null inside the dictionary: "no image" is NONE (-1).
async function preflight(ee, { region, bufferRegion, windows, context }) {
  const latest = (collection) => ee.Algorithms.If(collection.size().gt(0), collection.aggregate_max("system:time_start"), ee.Number(NONE));
  const viirsSearch = viirs(ee, region, windows.viirsSearch);
  const s1 = (list, pass) => list.map((w) => sentinel1(ee, region, w, pass)).reduce((all, next) => all.merge(next)).size();
  const counts = {
    ...Object.fromEntries(ORBIT_PASSES.flatMap((pass) => [
      [`s1Month_${pass}`, s1([windows.month], pass)],
      [`s1MonthBase_${pass}`, s1(windows.radarBefore, pass)],
    ])),
    viirsMonth: viirs(ee, region, windows.month).size(),
    viirsLatest: latest(viirsSearch),
    firmsDamage: windows.damage ? firms(ee, region, windows.damage).size() : ee.Number(0),
    firmsNormal: firms(ee, region, windows.fireNormal).size(),
    firmsMonth: firms(ee, region, windows.month).size(),
    firmsMonthBase: windows.monthBaselines.map((w) => firms(ee, region, w)).reduce((all, next) => all.merge(next)).size(),
    // Within 300 km, like the distance; only needed inside a known war
    // (not in a month before it began: nothing is estimated then).
    firmsYear: windows.conflict && !windows.beforeWar ? firms(ee, bufferRegion, windows.lastYear).size() : ee.Number(0),
    worldPop: worldPop(ee, region).size(),
  };
  const raw = await countImages(ee, counts, { what: "Checking which satellite images exist", context });
  return cleanCounts(raw);
}

// Evaluates a set of image counts ({ key: ee.Number }) in one request.
// When Earth Engine runs short of memory or time (retryTooMuchWork), it
// is asked again: the same request once more when its servers were full,
// and lighter, one count per request (a few at once), when that fails too
// or the request was too big. (Real data, Ukraine May 2026: "Earth Engine memory capacity
// exceeded" in the season's image check failed the whole month.)
async function countImages(ee, counts, { what, context }) {
  const timeoutMs = COUNT_TIMEOUT_MS;
  const once = (object, label = what) => retryTransient(() => evaluate(object, { timeoutMs, what: label, context }), context.retryDelayMs, context);
  return retryTooMuchWork(() => once(ee.Dictionary(counts)), {
    delays: context.memoryRetryMs,
    onRetry: (error, tries, how) => context.retried?.(what, how),
    // A few counts at a time, each its own request.
    lighter: async () => {
      const entries = Object.entries(counts);
      const values = await mapLimit(entries, COUNT_PARALLEL, ([key, value]) => once(value, `${what} (${key})`));
      return Object.fromEntries(entries.map(([key], i) => [key, values[i]]));
    },
  });
}

// How many single image counts the lighter image check sends at once.
const COUNT_PARALLEL = 4;

// Can the service account read the chernozem asset, and does it have b1?
// Also reads the black-soil map's class list (once). Gives back
// { assetId|null, warning|null, source } (source: which soil map is used).
// Both the Atlas's analysis and a farm's analysis pass their context
// (getAsset): the Atlas's reads wait like its other requests, a farm's
// count as interactive while they are out.
export async function checkChernozemAsset(ee, assetId, context = {}) {
  await loadBlackSoilClasses(ee, context);
  const instead = { assetId: null, source: BLACK_SOIL_SOURCE };
  if (!assetId || /^(none|off|no)$/i.test(assetId)) return { ...instead, warning: null };
  try {
    const info = await getAsset(ee, assetId, context);
    const bands = (info?.bands || []).map((band) => band.id);
    if (bands.length && !bands.includes(BANDS.chernozemAsset)) {
      return { ...instead, warning: `The chernozem map ${assetId} has no band ${BANDS.chernozemAsset}; the ${lowerFirst(BLACK_SOIL_SOURCE)} was used instead.` };
    }
    return { assetId, warning: null, source: `Chernozem map: ${assetId} (band ${BANDS.chernozemAsset})` };
  } catch (error) {
    const reason = explainGeeError(error, { asset: assetId });
    return { ...instead, warning: `${reason.message} The ${lowerFirst(BLACK_SOIL_SOURCE)} was used instead.` };
  }
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// One month of an area (analyzeMonth). Once it has failed, the requests of
// it that are not out yet are not sent (evaluate: context.failed,
// stopWhenFailed): the month is reported as missing, so nobody would use
// their answers. (Before, a failed month's group that was waiting for a
// farm still went out after it, together with the next month's requests,
// and a group being split went on with its other half.)
//   input.signal  an AbortSignal (server/jobs.js): when a person stops the
//                 analysis, the month fails at once in the same way
//                 (GeeError "stopped"), so nothing more of it is sent; the
//                 job does not wait for the requests already out
function analyze(deps, input) {
  return stopWhenFailed("the month", async (failed) => {
    const signal = typeof input?.signal?.addEventListener === "function" ? input.signal : null;
    const stop = () => markFailed(failed, new GeeError("stopped", "The analysis was stopped."));
    if (signal?.aborted) stop();
    signal?.addEventListener("abort", stop, { once: true });
    try {
      return await analyzeMonth(deps, input, failed);
    } finally {
      signal?.removeEventListener("abort", stop);
    }
  });
}

// conflict: the known war covering the area ({ id, name, since }) or null;
// when it is not given it is looked up as the job does: the team's own
// choice for the area (area.war) first, else the app's list by the area's
// country or cells (server/conflicts.js conflictForArea).
// onProgress(share, message, info): the share done (0..1) and the step;
// info { waiting: true } while its requests wait for farm analyses and
// searches (WAITING_MESSAGE), { waiting: false } when they go on.
async function analyzeMonth(deps, { area, cells, month, cellSizeDeg, onProgress, conflict: givenConflict } = {}, failed = newFailure("the month")) {
  if (!area?.bbox || !Array.isArray(cells) || !cells.length) throw new GeeError("bad_request", "Nothing to analyze: the area has no cells.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new GeeError("bad_request", `Not a month: ${month}`);
  if (!(Number(cellSizeDeg) > 0)) throw new GeeError("bad_request", `Not a cell size: ${cellSizeDeg}`);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  // retryDelayMs: every request below is tried again after a dropped
  // connection or a busy Earth Engine (retryTransient).
  // Retries after "out of memory or time" are counted per step, and the run
  // says so (they never change a reading: the same request, or lighter
  // with the same pixels; coarser pixels have their own warning).
  const retriedSteps = new Map();
  // The last step's share and message (step below), so a wait can be
  // reported without moving the progress bar.
  let progressShare = 0;
  let progressMessage = "";
  let waitingRequests = 0;
  let waitStartedAt = 0;
  let waitCapped = false;
  const context = {
    ...contextOf(cfg),
    retryDelayMs: deps.retryDelayMs,
    memoryRetryMs: deps.memoryRetryMs,
    // The Atlas works in the background: its requests wait while Field and
    // search requests are out (evaluate). onProgress hears it:
    // (share, WAITING_MESSAGE, { waiting: true }) when the first starts
    // waiting, (share, the step's message, { waiting: false }) when the
    // last is sent. The server log says how long, and whether a request
    // went at the time limit (YIELD.maxWaitMs) while they were still out.
    background: true,
    failed,
    onWait: (waiting, { capped = false } = {}) => {
      waitingRequests = Math.max(0, waitingRequests + (waiting ? 1 : -1));
      if (waiting && waitingRequests === 1) {
        waitStartedAt = Date.now();
        waitCapped = false;
        onProgress?.(progressShare, WAITING_MESSAGE, { waiting: true });
      } else if (!waiting) {
        waitCapped ||= capped;
        // A month that has failed sends nothing more (evaluate) and says
        // nothing more.
        if (waitingRequests > 0 || failed.error) return;
        const seconds = Math.round((Date.now() - waitStartedAt) / 1000);
        const how = waitCapped ? `, then went ahead after the ${Math.round(YIELD.maxWaitMs / 60000)}-minute limit while they were still out` : "";
        console.warn(`[chernozem] ${area.name || area.id} ${month}: waited ${seconds} s for farm analyses and searches with Earth Engine${how}`);
        onProgress?.(progressShare, progressMessage, { waiting: false });
      }
    },
    retried: (what, how = "same") => {
      retriedSteps.set(what, (retriedSteps.get(what) || 0) + 1);
      console.warn(`[chernozem] ${area.name || area.id} ${month}: Earth Engine asked again (${how}): ${what}`);
    },
  };
  const warnings = [];
  const bbox = area.bbox;
  // The Earth Engine region is built from the cells themselves (one box per
  // run of cells, split at the 180° line), not from the area's box: Russia's
  // or the USA's box spans the whole globe.
  const boxes = cellBoxes(cells, cellSizeDeg);
  const region = boxesGeometry(ee, boxes);
  const midLat = cellsMidLat(cells, bbox);
  const scale = reduceScale(cellSizeDeg, midLat);
  const tileScale = tileScaleFor(cellSizeDeg, midLat);
  const today = isoDay(deps.now());
  const conflict = cleanConflict(givenConflict !== undefined ? givenConflict : conflictForArea({ countryId: area.countryId, bbox, cells, war: area.war, areaId: area.id }));
  const shared = monthWindows(month, today, { lat: midLat, conflict });
  // An area that holds its war only in part (a whole country such as
  // Thailand, Russia or Ethiopia, or a region, box or drawn area across the
  // edge of the war's boxes: conflict.partOfCountry, server/conflicts.js
  // listWarFor): the war's rules apply in the squares that touch its boxes,
  // and in those another listed war covers (warCells: server/conflicts.js
  // warCellsFor; the Sumy side of a box over the Kursk front). The others
  // keep the war's windows (monthWindows: the damage window, the fire
  // years, the war seasons); only their heavy damage follows the peace
  // rule (strong radar change AND an unusual fire; scoring.js gives them
  // the peace damage score), and the fires that stand in for fighting are
  // taken from inside the boxes and the war's squares of another listed
  // war only, so a wildfire far from the front is not read as fighting.
  // Null: every square has the area's rules.
  const warCells = warCellsFor(conflict, cells, cellSizeDeg);
  // Those of them that lie in another listed war without touching the
  // boxes.
  const touching = warCells ? warSquares(conflict, cells, cellSizeDeg) : null;
  const otherWarCells = warCells ? cells.filter((cell) => warCells.has(cell.id) && !touching.has(cell.id)) : [];
  const chunkSize = chunkSizeFor(cellSizeDeg, midLat);
  let total = Math.ceil(cells.length / chunkSize) * 2 + 3;
  let done = 0;
  // onProgress gets the share done (0..1) and a short message.
  const step = (message) => {
    progressShare = Math.min(1, done++ / total);
    progressMessage = message;
    onProgress?.(progressShare, message);
  };
  if (shared.month.end < monthBounds(month).end) warnings.push(`${month} is not over yet; images up to ${shiftDays(today, -1)} were used.`);

  // 1. Each place's growing season, from its greenest month in 2019-2021
  // (MODIS NDVI over its cropland); cells with the same season are measured
  // together. Where the season is not clear, the latitude decides.
  step("Finding each place's growing season");
  const peaks = await seasonPeaks(ee, { cells, cellSizeDeg, scale, tileScale, chunkSize, state: deps.state, context }).catch((error) => {
    warnings.push(`The growing season could not be read from the satellite record (${error.message}); it was taken from the latitude.`);
    return new Map();
  });
  // The damage radar's war seasons are chosen for the whole area at once
  // (season.js areaDamageSeasons): a new season joins in the month the
  // last group's season of that year is complete, so the area's total
  // changes once a year, not once per group.
  const grouped = seasonGroups(cells, peaks);
  const warSeasons = shared.damage ? areaDamageSeasons(grouped.map((group) => ({ lat: group.seasonLat, peakMonth: group.peakMonth })), shared.asOf, shared.damage.start) : grouped.map(() => []);
  const groups = grouped.map((group, i) => {
    const groupBoxes = cellBoxes(group.cells, cellSizeDeg);
    return { ...group, region: boxesGeometry(ee, groupBoxes), windows: monthWindows(month, today, { lat: group.seasonLat, conflict, peakMonth: group.peakMonth, radarSeasons: warSeasons[i] }) };
  });
  total = groups.reduce((sum, group) => sum + Math.ceil(group.cells.length / chunkSize), 0) + Math.ceil(cells.length / chunkSize) + 3;

  // 2. What imagery is there, and can we read the chernozem map?
  step("Checking satellite images");
  const bufferRegion = boxesGeometry(ee, cellBoxes(cells, cellSizeDeg, MAX_CONFLICT_M / 1000));
  // Where unusual fires stand in for fighting: within 300 km of the cells,
  // or for a war that covers the area only in part, inside its boxes and
  // its squares that another listed war covers.
  const fightRegion = warCells ? boxesGeometry(ee, [...warBoxes(conflict), ...squareRuns(otherWarCells, cellSizeDeg)]) : bufferRegion;
  const [have, asset, ...groupHave] = await Promise.all([
    preflight(ee, { region, bufferRegion: fightRegion, windows: shared, context }),
    checkChernozemAsset(ee, cfg.chernozemAsset, context),
    ...groups.map((group) => seasonPreflight(ee, { region: group.region, windows: group.windows, context })),
  ]);
  if (asset.warning) warnings.push(asset.warning);

  // 3. Build the images (nothing is computed until a request below).
  const cropland = croplandImage(ee);
  const chernozem = chernozemImage(ee, asset.assetId);
  // Small areas: fire and distance on the 1 km grid (FINE_SCALE_M);
  // otherwise every image as it is.
  const onFireGrid = scale < FINE_SCALE_M ? (image, gridM = FIRE_GRID_M) => image.reproject({ crs: "EPSG:4326", scale: gridM }) : (image) => image;
  const fire = fireImages(ee, { region, windows: shared, have, onFireGrid });

  // Distance to fighting: ACLED battles; else, inside a known war, unusual
  // fire detections; at peace, and in a month before its war began, not
  // measured (every cell reads 300 km and nothing is set aside for it, which
  // does not make the land safe). Inside a war, when no fire within 300 km
  // of any square looks like fighting, it is not measured either: that is
  // known once the cells are read (step 6, "fires-none").
  const acled = acledBattlesFor({ csvPath: cfg.acledCsvPath, bbox: boxesBbox(boxes), month });
  if (acled.warning) warnings.push(acled.warning);
  // A month before its war began: no war damage (no damage window), and
  // its fires are not fighting (monthWindows beforeWar).
  if (shared.beforeWar) warnings.push(beforeWarWarning(conflict.since, { accessMeasured: acled.points.length > 0 }));
  let conflictM = null;
  let accessSource = "none";
  // Where the fires that stand in for fighting come from, for the words
  // (noFightingFiresWarning), and where the run's warning about them sits
  // (worded again in step 6 when none looks like fighting).
  const fightWhere = warCells ? (otherWarCells.length ? "war+other" : "war") : null;
  let accessWarning = -1;
  if (acled.points.length) {
    const battles = ee.FeatureCollection(acled.points.map((point) => ee.Feature(ee.Geometry.Point(point))));
    conflictM = onFireGrid(battles.distance(MAX_CONFLICT_M)).unmask(MAX_CONFLICT_M).rename("conflictM");
    accessSource = "acled";
  } else if (!conflict) {
    // Fires in peaceful farm country (harvest burning, wildfires) are not
    // fighting, so nothing is estimated from them.
    warnings.push(NO_WAR_WARNING);
  } else if (shared.beforeWar) {
    // Nothing to estimate fighting from before the war (said above).
  } else if (have.firmsYear > 0) {
    // In a war's first year only the fires since the day it began count
    // (monthWindows fightingSince).
    const which = shared.fightingSince
      ? `unusual fires since the war began on ${shared.fightingSince} (far more than on the same days of the normal years; no ACLED file)`
      : `unusual fires of the last 12 months (far more than in ${BASELINE_FROM}-${BASELINE_YEAR}; no ACLED file)`;
    accessWarning = warnings.push(`Distance to fighting is estimated from ${which}${warCells ? ` inside the war's region${otherWarCells.length ? " and its squares in another listed war" : ""}` : ""}, so treat safe access as rough.`) - 1;
    // An empty sample (no fire looks like fighting) gives an empty distance
    // image, and every cell 300 km (unmask): step 6 says so.
    const fireBand = fightingFires(ee, fightRegion, shared).rename("fire");
    const fires = fireBand.stratifiedSample({
      numPoints: 3000,
      classBand: "fire",
      region: fightRegion,
      scale: 1000,
      // A fixed seed: the same fires give the same sample points every run.
      seed: 0,
      geometries: true,
      tileScale,
    });
    conflictM = onFireGrid(fires.distance(MAX_CONFLICT_M)).unmask(MAX_CONFLICT_M).rename("conflictM");
    accessSource = "fires";
  } else {
    // No FIRMS fire data at all in the window (a gap in the data): no fire
    // can be looked at, every cell reads 300 km, and safe access is not
    // measured (step 6 makes it "fires-none").
    accessWarning = warnings.push(noFightingFiresWarning({ since: shared.fightingSince, region: fightWhere, fireData: false, acled: acled.status })) - 1;
    conflictM = ee.Image.constant(MAX_CONFLICT_M).rename("conflictM");
    accessSource = "fires";
  }

  let lights;
  if (have.viirsMonth > 0) {
    lights = viirs(ee, region, shared.month).median().rename("lights");
  } else if (have.viirsLatest !== null) {
    const latestWindow = daysBefore(have.viirsLatest, 30);
    lights = viirs(ee, region, latestWindow).median().rename("lights");
    warnings.push(`Night lights for ${month} are not published yet; the 30 days up to ${latestWindow.last} were used.`);
  } else {
    lights = emptyBand(ee, "lights");
    warnings.push("No night-light images were found for this area.");
  }

  // Radar alerts: this month against the same month of 2019-2021, one orbit
  // direction only (ascending and descending passes see the ground at
  // different angles, so mixing them reads as change).
  // The change common to the whole neighbourhood (an early or late harvest,
  // a wet or dry month: RADAR_SHIFT) is taken off first, so only patches
  // that changed more than their surroundings count.
  const monthPass = pickPass(have.s1Month, have.s1MonthBase);
  let radarShare;
  if (monthPass) {
    const change = sentinel1(ee, region, shared.month, monthPass)
      .median()
      .subtract(mergedSentinel1(ee, region, shared.radarBefore, monthPass).median())
      .rename("change");
    const aroundBoxes = cellBoxes(cells, cellSizeDeg, RADAR_SHIFT.aroundKm);
    const around = boxesGeometry(ee, aroundBoxes);
    // A pixel size fixed from the area (no "bestEffort", which picks its
    // own): the same area always gives the same shift.
    const shift = ee.Number(
      change.reduceRegion({ reducer: ee.Reducer.median(), geometry: around, scale: fixedScaleFor(aroundBoxes, RADAR_SHIFT.scale, RADAR_SHIFT.maxPixels), maxPixels: RADAR_SHIFT.maxPixels * 2, tileScale }).get("change", 0),
    );
    radarShare = change.subtract(shift).abs().gt(RADAR_CHANGE_DB).rename("radarShare");
  } else {
    radarShare = emptyBand(ee, "radarShare");
    warnings.push(`No Sentinel-1 radar images from one orbit direction for both ${month} and the same month of ${BASELINE_FROM}-${BASELINE_YEAR}; radar alerts are off.`);
  }

  const people = have.worldPop > 0 ? populationImages(ee, region) : null;
  if (!people) warnings.push("WorldPop has no population data for this area.");

  // The images that depend on the season: the health index (a diagnostic),
  // the season's radar change, and heavy damage from them and the fires.
  const seasonUsed = [];
  for (const [i, group] of groups.entries()) {
    const g = groupHave[i];
    const label = windowLabel(group.windows.season);
    const radarLabel = seasonsLabel(group.windows.radarSeasons, group.windows.season);
    seasonUsed.push({ ...seasonsSpan(group.windows.radarSeasons, group.windows.season), label: radarLabel, seasons: group.windows.radarSeasons.length, cells: group.cells.length });
    let chiDrop;
    if (g.s2Current > 0 && g.s2Baseline > 0) {
      chiDrop = chiHealthImage(ee, group.region, group.windows.baselines).subtract(chiHealthImage(ee, group.region, group.windows.season)).rename("chiDrop");
    } else {
      chiDrop = emptyBand(ee, "chiDrop");
      warnings.push(`No usable Sentinel-2 images for ${g.s2Current > 0 ? `the same season of ${GEE_BASELINE.from}-${GEE_BASELINE.to}` : label}; the soil health index could not be measured there.`);
    }
    // The damage radar: each complete war season on its own against the
    // same season of 2019-2021, and per pixel the change that persists over
    // them (seasonRadarImages; method.js FIRE_YEARS), so it changes only
    // when a new season is complete, and then it grows, except at a pixel's
    // step from one measured season to two, and when the new season's
    // passes change the direction pickPass picks below (the passes of all
    // war seasons together count): every season is then measured again
    // from the other side.
    const radarSeasons = group.windows.radarSeasons;
    const seasonPass = radarSeasons.length ? pickPass(g.s1Season, g.s1SeasonBase) : null;
    // Only the seasons with passes from that direction (a season without
    // any has nothing to compare).
    const measuredSeasons = seasonPass ? radarSeasons.filter((_, j) => (g.s1SeasonEach?.[j]?.[seasonPass] ?? 1) > 0) : [];
    let radarDb;
    let heavy;
    // The peace rule's heavy damage, for the squares outside the war's
    // squares of an area that holds it only in part (warCells).
    let heavyOutside;
    if (seasonPass && measuredSeasons.length) {
      const before = mergedSentinel1(ee, group.region, group.windows.radarSeasonBaselines, seasonPass).median();
      const radar = seasonRadarImages(ee, { region: group.region, seasons: measuredSeasons, before, pass: seasonPass });
      radarDb = radar.level.updateMask(cropland).rename("radarDb");
      // The paper's rule (method.js HEAVY_DAMAGE, heavyDamagePixel) on the
      // LASTING change (in at least two war seasons): strong change, or
      // clear change next to an unusual fire. No health index.
      // Where no known war covers the area, each piece of evidence alone
      // has an everyday cause: strong radar change is land-use change (a
      // new crop, ploughing, a meadow turned into a field, greenhouses),
      // and a 2 dB change next to a harvest fire is ordinary rotation. There
      // a pixel counts only with BOTH strong radar change and an unusual
      // fire within 1 km, like a field's damage (src/lib/field/method.js
      // damageDetected).
      const strong = radar.level.gte(HEAVY_DAMAGE.radarDb);
      const peaceHeavy = () => strong.and(fire.near).updateMask(cropland).rename("heavy");
      heavy = conflict ? strong.or(radar.level.gte(HEAVY_DAMAGE.radarWithFireDb).and(fire.near)).updateMask(cropland).rename("heavy") : peaceHeavy();
      if (warCells) heavyOutside = peaceHeavy();
    } else {
      radarDb = emptyBand(ee, "radarDb");
      heavy = emptyBand(ee, "heavy");
      // A month before its war began has said why once (beforeWarWarning).
      if (!shared.beforeWar) {
        warnings.push(
          radarSeasons.length
            ? `No Sentinel-1 radar images from one orbit direction for both ${radarLabel} and the same season of ${BASELINE_FROM}-${BASELINE_YEAR}; heavy damage could not be measured there.`
            : `No growing season since ${shared.damage ? shared.damage.start : month} is complete yet; heavy damage could not be measured there.`,
        );
      }
    }
    const meanImage = (heavyBand) =>
      ee.Image.cat([
        chernozem.updateMask(cropland).rename("chernozemCrop"),
        chernozem.rename("chernozemAll"),
        cropland,
        chiDrop,
        radarDb,
        heavyBand,
        fire.years,
        // Left out at peace: a missing distance reads as 300 km (toReading).
        ...(conflictM ? [conflictM] : []),
        lights,
        radarShare,
        fire.month,
      ]);
    group.meanImage = meanImage(heavy);
    // The same images with the peace rule's heavy damage, for the group's
    // squares outside the war's squares (warCells).
    if (warCells) group.meanImageOutside = heavyOutside ? meanImage(heavyOutside) : group.meanImage;
  }

  // 4. Reduce over the cells, group by group and chunk by chunk, two
  // requests at once. A chunk that runs out of memory or time is SPLIT in
  // two and each half measured again with the same pixels: a cell's reading
  // does not depend on which cells share its request, so the totals stay
  // the same. (Real data, Ukraine September 2026: the old coarser retry of
  // one group of 97 cells moved heavy damage by 61,517 ha, 4.7 %, between
  // two runs of the same code, and cropland by 113,000 ha.) Only a piece of
  // SPLIT_MIN_CELLS cells or fewer that still fails is measured with
  // coarser pixels, and the run says so.
  const means = new Map();
  const sums = new Map();
  let coarserCells = 0;
  let chunkCount = 0;
  const measure = (part, meanImage, plan) => {
    const squares = cellCollection(ee, part, cellSizeDeg);
    const regionArgs = (extra) => ({ collection: squares, tileScale: plan.tileScale, ...(deps.state.noMaxPixelsArg ? {} : { maxPixelsPerRegion: MAX_PIXELS_PER_CELL }), ...extra });
    // Sent as LISTS of features: real Earth Engine answers a FeatureCollection
    // nested inside a Dictionary with its description only, no features,
    // which made every cell read 0 (fake-ee.js does the same by default).
    const answer = {
      means: meanImage.reduceRegions(regionArgs({ reducer: ee.Reducer.mean(), scale: plan.scale, crs: "EPSG:4326" })).select([".*"], null, false).toList(part.length),
    };
    if (people) {
      const pop = populationPlan(cellSizeDeg, midLat, plan.scale);
      const sumReducer = ee.Reducer.sum().setOutputs(["people"]);
      answer.sums = (
        pop.native
          ? people.perPixel.reduceRegions(regionArgs({ reducer: sumReducer, crs: people.nativeProjection }))
          : people.density.reduceRegions(regionArgs({ reducer: sumReducer, scale: pop.scale, crs: "EPSG:4326" }))
      ).select([".*"], null, false).toList(part.length);
    }
    return ee.Dictionary(answer);
  };
  const featuresOf = (value) => (Array.isArray(value) ? value : value?.features || []);
  const keep = (result) => {
    for (const feature of featuresOf(result?.means)) if (feature?.properties) means.set(feature.properties.id, feature.properties);
    for (const feature of featuresOf(result?.sums)) if (feature?.properties) sums.set(feature.properties.id, feature.properties);
  };
  // One request for `part` with `plan`; a dropped connection is tried once
  // more as it is (retryTransient), and so is an Earth Engine "internal
  // error" (isInternalError), after the same pause.
  const attempt = async (part, meanImage, plan) => {
    const label = `Measuring ${part.length} cells (${part[0].id} to ${part[part.length - 1].id}) of ${cells.length}`;
    let internalRetried = false;
    for (;;) {
      try {
        return await retryTransient(() => evaluate(measure(part, meanImage, plan), { what: label, context }), deps.retryDelayMs, context);
      } catch (error) {
        // An older Earth Engine without maxPixelsPerRegion: drop it, try again.
        if (!deps.state.noMaxPixelsArg && isUnknownArgumentError(error, "maxPixelsPerRegion")) {
          deps.state.noMaxPixelsArg = true;
          continue;
        }
        if (!internalRetried && isInternalError(error)) {
          internalRetried = true;
          context.retried?.("Measuring cells (internal error)");
          if (deps.retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, deps.retryDelayMs));
          continue;
        }
        throw error;
      }
    }
  };
  // Lighter work for a piece that ran short: two halves with the same
  // pixels, or, for a piece of SPLIT_MIN_CELLS cells or fewer, coarser
  // pixels (a failure then stops the analysis).
  const lighter = async (part, meanImage, plan) => {
    if (part.length > SPLIT_MIN_CELLS) {
      const half = Math.ceil(part.length / 2);
      const split = { scale: plan.scale, tileScale: 16 };
      await measureSplitting(part.slice(0, half), meanImage, split);
      await measureSplitting(part.slice(half), meanImage, split);
      return;
    }
    keep(await attempt(part, meanImage, { scale: coarserScale(plan.scale), tileScale: 16 }));
    coarserCells += part.length;
  };
  const measureSplitting = async (part, meanImage, plan) => {
    try {
      keep(await attempt(part, meanImage, plan));
    } catch (error) {
      if (!isTooMuchWorkError(error)) throw error;
      await lighter(part, meanImage, plan);
    }
  };
  // A whole chunk that finds Earth Engine's servers full ("memory capacity
  // exceeded") is tried again as it is after a pause, then lighter; one
  // that is too big ("User memory limit exceeded", "Computation timed
  // out", our own 5-minute limit, CHUNK_TIMEOUT_MS, which ends it before
  // the library's deadline does) goes lighter at once (retryTooMuchWork).
  const measureChunk = (part, meanImage, plan) =>
    retryTooMuchWork(async () => keep(await attempt(part, meanImage, plan)), { delays: deps.memoryRetryMs, lighter: () => lighter(part, meanImage, plan), onRetry: (error, tries, how) => context.retried?.("Measuring cells", how) });
  // A group of an area that holds its war only in part is sent as its
  // war's squares (the war's rules: warCells) and the others (the peace
  // rules): a cell's reading does not depend on which cells share its
  // request.
  const work = groups.flatMap((group) => {
    if (!warCells) return chunk(group.cells, chunkSize).map((part) => ({ part, meanImage: group.meanImage }));
    const inside = group.cells.filter((cell) => warCells.has(cell.id));
    const outside = group.cells.filter((cell) => !warCells.has(cell.id));
    return [...chunk(inside, chunkSize).map((part) => ({ part, meanImage: group.meanImage })), ...chunk(outside, chunkSize).map((part) => ({ part, meanImage: group.meanImageOutside }))];
  });
  chunkCount = work.length;
  // The progress bar counts the requests really sent.
  total += work.length - groups.reduce((sum, group) => sum + Math.ceil(group.cells.length / chunkSize), 0);
  let measured = 0;
  await mapLimit(work, MAX_PARALLEL_CHUNKS, async ({ part, meanImage }) => {
    await measureChunk(part, meanImage, { scale, tileScale });
    measured += part.length;
    step(`Measured ${measured} of ${cells.length} cells`);
  });
  if (coarserCells) {
    warnings.push(`${coarserCells} of ${cells.length} cells were measured with coarser pixels (${coarserScale(scale)} m) because Earth Engine ran short of memory or time; totals can differ slightly from a run without this.`);
  }

  // 5. Place names (best effort: a failure only costs the names).
  step("Looking up place names");
  const names = await placeNames(ee, { region, cells, context }).catch((error) => {
    warnings.push(`Place names unavailable (${error.message}).`);
    return new Map();
  });

  // 6. Readings.
  const readings = [];
  let noHealth = 0;
  let noRadar = 0;
  for (const cell of cells) {
    const props = means.get(cell.id);
    // At peace without ACLED there is no distance band: 300 km everywhere.
    const reading = toReading(cell, props && !conflictM ? { ...props, conflictM: MAX_CONFLICT_M } : props, people ? sums.get(cell.id) : { people: 0 }, { cellSizeDeg, names: names.get(cell.id) });
    // Which rules the square was read with, where the war covers the area
    // only in part (runs.js keeps it; scoring.js scores by it).
    if (warCells) reading.atWar = warCells.has(cell.id);
    if (reading.chiDrop === null) noHealth += 1;
    if (reading.radarDb === null) noRadar += 1;
    readings.push(reading);
  }
  // Inside a war, no fire within 300 km of any square looked like fighting
  // (the sample of fighting fires was empty, or there were no fires at
  // all): every square reads 300 km, which in a war zone is not "safe to
  // reach". Safe access is then not measured ("fires-none"), and the run
  // says so instead of "estimated from unusual fires" (real data,
  // 2026-10-21: south Lebanon, FIGHTING_FIRES). Known from the readings,
  // so no other request is sent; the readings keep their 300 km.
  if (accessSource === "fires" && farFromAnyFighting(readings)) {
    accessSource = "fires-none";
    const said = noFightingFiresWarning({ since: shared.fightingSince, region: fightWhere, fireData: have.firmsYear > 0, acled: acled.status });
    if (accessWarning >= 0) warnings[accessWarning] = said;
    else warnings.push(said);
  }
  if (noRadar > 0 && noRadar < cells.length) {
    warnings.push(`${noRadar} of ${cells.length} cells had no radar reading on cropland; their damage uses fires only.`);
  }
  if (noHealth > 0 && noHealth < cells.length && groupHave.some((g) => g.s2Current > 0)) {
    warnings.push(`${noHealth} of ${cells.length} cells had no cloud-free Sentinel-2 view; the soil health index is missing there.`);
  }

  // 7. Alerts, with the day each one was last seen.
  step("Finding alerts");
  const readingById = new Map(readings.map((reading) => [reading.id, reading]));
  const candidates = cells.map((cell) => {
    const props = means.get(cell.id) || {};
    const areaKm2 = cellAreaKm2(cellSizeDeg, cell.lat);
    const n = names.get(cell.id) || {};
    const reading = readingById.get(cell.id) || {};
    return {
      id: cell.id,
      lat: cell.lat,
      lon: cell.lon,
      // Black-soil cropland, worked out as server/runs.js does, so radar
      // alerts skip the squares the ranking leaves out (pickAlerts).
      blackSoilHa: (Number.isFinite(cell.areaHa) ? cell.areaHa : areaKm2 * 100) * numberOr(reading.croplandShare, 0) * numberOr(reading.chernozem, 0),
      radarShare: numberOr(props.radarShare, 0),
      radarKm2: numberOr(props.radarShare, 0) * areaKm2,
      // Fires in the month above the same month's normal, for the whole cell
      // (FIRMS pixels are ~1 km², so mean × km² = detections), never below 0.
      fires: Math.max(0, numberOr(props.firesMonth, 0) * areaKm2),
      admin1: n.admin1,
      admin2: n.admin2,
    };
  });
  let alerts = pickAlerts(candidates, { cellSizeDeg, month });
  if (alerts.length) {
    alerts = await alertDates(ee, { alerts, cells, cellSizeDeg, region, windows: shared, month, scale, tileScale, context, hasFires: have.firmsMonth > 0, radarPass: monthPass }).catch((error) => {
      warnings.push(`Alert dates unavailable (${error.message}); the last day of the month is shown.`);
      return alerts;
    });
  }
  // A month that is not over yet: no alert dated after the last day with images.
  const lastImageDay = shared.month.end > shared.month.start ? shiftDays(shared.month.end, -1) : shared.month.start;
  alerts = alerts.map((alert) => (alert.date > lastImageDay ? { ...alert, date: lastImageDay } : alert));
  if (retriedSteps.size) {
    const list = [...retriedSteps].map(([what, n]) => `${what.replace(/^Checking/, "checking")} (${n} ${n === 1 ? "retry" : "retries"})`).join("; ");
    warnings.push(`Earth Engine ran short of memory or time and was asked again: ${list}. The readings are the same as without it.`);
  }
  onProgress?.(1, "Done");
  // Damage is measured against the same season of 2019-2021 (see monthWindows).
  return { readings, alerts, warnings, baseline: GEE_BASELINE, conflict, imagery: imageryOf(seasonUsed, cells.length), accessSource };
}

// The imagery a run says it compared: the season used for most cells, with
// the others named in the label. -> { from, to, label }
export function imageryOf(seasons, cellCount) {
  if (!seasons.length) return null;
  const sorted = [...seasons].sort((a, b) => b.cells - a.cells);
  const main = sorted[0];
  const share = (s) => `${Math.round((100 * s.cells) / Math.max(1, cellCount))}%`;
  const label = sorted.length === 1 ? main.label : sorted.map((s) => `${s.label} (${share(s)} of the area)`).join("; ");
  const out = { from: main.from, to: main.to, label };
  if (Number.isFinite(main.seasons)) out.seasons = main.seasons;
  return out;
}

// The months the damage radar covers: from the first war season's start
// to the last one's end ({ from, to }, "YYYY-MM"); without war seasons,
// the last complete season.
export function seasonsSpan(seasons, fallback) {
  if (!seasons?.length) return { from: fallback.from, to: fallback.to };
  return { from: seasons[0].start.slice(0, 7), to: shiftDays(seasons[seasons.length - 1].end, -1).slice(0, 7) };
}

// "April to September 2025" for one season, "April to September of 2022
// to 2025" for several (the damage radar's composite).
export function seasonsLabel(seasons, fallback) {
  if (!seasons?.length) return windowLabel(fallback);
  const spans = seasons.map((s) => ({ from: s.start.slice(0, 7), to: shiftDays(s.end, -1).slice(0, 7) }));
  if (spans.length === 1) return windowLabel(spans[0]);
  const months = windowLabel(spans[0]).replace(/ \d{4}$/, "").replace(/ \d{4} to /, " to ");
  return `${months} of ${spans[0].to.slice(0, 4)} to ${spans[spans.length - 1].to.slice(0, 4)}`;
}

// The fire images of a month (FIRMS, 1 km), shared by every season group,
// for the WORST war year (src/lib/atlas/method.js FIRE_YEARS):
//   years   one band per war year of the damage window (windows.fireYears),
//           fx0, fx1, ...: the year's detections minus the pixel's normal
//           (its 2019-2021 count / 3, a whole average year, also for the
//           year not over yet), smoothed over FIRE_SMOOTH_M (the paper's 5
//           km) and NOT floored per pixel. A cell's mean of a band is that
//           year's excess for the cell, and its worst year (the largest,
//           never below 0; toReading) x 100 is the firms indicator: a pixel
//           that burns now but not in 2019-2021 and one nearby that burned
//           then but not now cancel out, like rotating stubble burning
//           does. (Real data, Ukraine September 2026: floored pixel by
//           pixel before the cell's mean, Lviv oblast's fire indicator was
//           0.58, against 0.001 over the whole window.)
//   near    1 within HEAVY_DAMAGE.fireNearM of an unusual fire, per pixel
//           (heavy damage): a pixel with a detection in some war year whose
//           (smoothed) excess that year is above 0
// At war the years are fixed from the war's start and the one not over yet
// only gains fires, so neither falls from one month to the next.
//   month   detections in the month minus the same month's mean in
//           2019-2021 (not clamped; alerts use the cell's total)
// onFireGrid(image, gridM): for small areas, the image worked out on the
// 1 km grid, or on gridM (FINE_SCALE_M); otherwise the image as it is.
function fireImages(ee, { region, windows, have, onFireGrid = (image) => image }) {
  const grid = (image) => image.setDefaultProjection("EPSG:4326", null, 1000);
  const count = (window) => grid(firms(ee, region, window).count().unmask(0));
  const zero = (name) => ee.Image.constant(0).rename(name);
  let years = zero("fx0");
  let near = zero("fireNear");
  const yearList = Array.isArray(windows.fireYears) ? windows.fireYears : [];
  if (windows.damage && have.firmsDamage > 0 && yearList.length) {
    const smooth = (image) => image.focal_mean(FIRE_SMOOTH_M, "circle", "meters");
    // An average normal year (smoothing is linear, so the smoothed normal
    // is the smoothed count / 3).
    const normal = have.firmsNormal > 0 ? smooth(count(windows.fireNormal)).multiply(1 / FIRE_YEARS.baselineYears) : ee.Image.constant(0);
    const bands = [];
    let unusualAny = null;
    for (const [i, year] of yearList.entries()) {
      const inYear = count(year);
      const yearExcess = smooth(inYear).subtract(normal);
      // A pixel that burned that year, in a neighbourhood above its normal.
      const unusual = inYear.gt(0).and(yearExcess.gt(0));
      bands.push(onFireGrid(yearExcess).rename(`fx${i}`));
      unusualAny = unusualAny ? unusualAny.or(unusual) : unusual;
    }
    years = ee.Image.cat(bands);
    // Small areas: the unusual fire pixels on the 1 km grid, the ring drawn
    // around them on the RING_GRID_M grid (FINE_SCALE_M).
    near = onFireGrid(onFireGrid(unusualAny).focal_max(HEAVY_DAMAGE.fireNearM, "circle", "meters"), RING_GRID_M).unmask(0).rename("fireNear");
  }
  let month = zero("firesMonth");
  if (have.firmsMonth > 0) {
    const now = count(windows.month);
    const before =
      have.firmsMonthBase > 0
        ? grid(windows.monthBaselines.map((w) => firms(ee, region, w)).reduce((all, next) => all.merge(next)).count().unmask(0)).divide(windows.monthBaselines.length)
        : ee.Image.constant(0);
    month = now.subtract(before).rename("firesMonth");
  }
  return { years, near, month };
}

// Sentinel-1 over several windows, one collection.
function mergedSentinel1(ee, region, windows, pass) {
  return windows.map((window) => sentinel1(ee, region, window, pass)).reduce((all, next) => all.merge(next));
}

// "Not measured" in seasonRadarImages (a change is never below 0).
const NO_RADAR = -1;

// The damage radar of one season group, per pixel (method.js
// radarPersistence, heavyDamagePixel):
//   seasons  the complete war seasons with radar passes, oldest first
//   before   the median VV of the same season in 2019-2021
// Each season's change = |its median VV - before| (open water in either,
// a flooded field or a lake that rose, is left out: water is radar-dark,
// so it reads as a huge change that is not damage to the soil; real data:
// Lake Nakuru's shore, Kenya, 16 dB). Gives back
//   level       the change reached in at least HEAVY_DAMAGE.persistSeasons
//               seasons (the second largest, worked out as the largest of
//               the smaller of each pair); with one season measured, that
//               one. Heavy damage and the radar indicator use it
//   persistent  the same, -1 with one season measured
//   peak        the largest change of any season
// all masked where no season was measured. With two seasons or more
// measured, a later season that looks ordinary never lowers them: they
// only grow, as long as `pass` stays the same (analyze's pickPass counts
// the passes of all war seasons, so a new season can change it; every
// season is then measured from the other direction).
export function seasonRadarImages(ee, { region, seasons, before, pass }) {
  const changes = seasons.map((season) => {
    const now = sentinel1(ee, region, season, pass).median();
    const land = now.gt(WATER_VV_DB).and(before.gt(WATER_VV_DB));
    return now.subtract(before).abs().updateMask(land).unmask(NO_RADAR);
  });
  let peak = changes[0];
  for (const change of changes.slice(1)) peak = peak.max(change);
  let persistent = ee.Image.constant(NO_RADAR);
  for (let i = 0; i < changes.length; i += 1) {
    for (let j = i + 1; j < changes.length; j += 1) persistent = persistent.max(changes[i].min(changes[j]));
  }
  const measured = peak.gte(0);
  const level = persistent.where(persistent.lt(0), peak);
  return { persistent: persistent.updateMask(measured), peak: peak.updateMask(measured), level: level.updateMask(measured) };
}

// The orbit direction to compare radar with: the one with the most passes
// in BOTH windows ({ ASCENDING, DESCENDING } counts each): the larger of
// the two directions' smaller counts, then the more passes in all; or null
// when neither direction has passes in both.
export function pickPass(now = {}, before = {}) {
  let best = null;
  for (const pass of ORBIT_PASSES) {
    const a = Number(now?.[pass]) || 0;
    const b = Number(before?.[pass]) || 0;
    if (a <= 0 || b <= 0) continue;
    const score = Math.min(a, b) * 1e6 + a + b;
    if (!best || score > best.score) best = { pass, score };
  }
  return best ? best.pass : null;
}

// The images of one season group: Sentinel-2 and Sentinel-1 (each orbit
// direction) in the season and the same season of 2019-2021, and Sentinel-1
// in each of the damage radar's war seasons (s1SeasonEach, same order as
// windows.radarSeasons; s1Season is their total per direction).
async function seasonPreflight(ee, { region, windows, context }) {
  const s1 = (list, pass) => list.map((w) => sentinel1(ee, region, w, pass)).reduce((all, next) => all.merge(next)).size();
  const seasons = windows.radarSeasons || [];
  const counts = {
    s2Current: sentinel2(ee, region, windows.season).size(),
    s2Baseline: windows.baselines.map((w) => sentinel2(ee, region, w)).reduce((all, next) => all.merge(next)).size(),
    ...Object.fromEntries(ORBIT_PASSES.flatMap((pass) => [
      // The damage radar's seasons (every complete war season), or the last
      // season when there is none yet (nothing is compared then).
      ...(seasons.length ? seasons.map((season, j) => [`s1Season${j}_${pass}`, s1([season], pass)]) : [[`s1Season0_${pass}`, s1([windows.season], pass)]]),
      [`s1SeasonBase_${pass}`, s1(windows.radarSeasonBaselines.length ? windows.radarSeasonBaselines : windows.baselines, pass)],
    ])),
  };
  const raw = (await countImages(ee, counts, { what: "Checking which satellite images exist for the season", context })) || {};
  const count = (key) => Math.max(0, numberOr(raw[key], 0));
  const each = (seasons.length ? seasons : [windows.season]).map((_, j) => Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`s1Season${j}_${pass}`)])));
  return {
    s2Current: count("s2Current"),
    s2Baseline: count("s2Baseline"),
    s1Season: Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, each.reduce((sum, e) => sum + e[pass], 0)])),
    s1SeasonEach: seasons.length ? each : [],
    s1SeasonBase: Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`s1SeasonBase_${pass}`)])),
  };
}

// The monthly NDVI climatology the season finder reads: 12 bands
// ndvi01..ndvi12, the mean MODIS NDVI of each calendar month in 2019-2021,
// over cropland only.
export function ndviClimatology(ee) {
  const ndvi = ee.ImageCollection(DATASETS.modisNdvi).filterDate(SEASON_FINDER.start, SEASON_FINDER.end).select(BANDS.modisNdvi);
  return ee.Image.cat(
    Array.from({ length: 12 }, (_, i) =>
      ndvi
        .filter(ee.Filter.calendarRange(i + 1, i + 1, "month"))
        .mean()
        .multiply(SEASON_FINDER.ndviScale)
        .rename(`ndvi${pad(i + 1)}`),
    ),
  ).updateMask(croplandImage(ee));
}

// The peak month (1-12) of the cropland greenness in a region (a farm, a
// search circle), or null when it is not clear or cannot be read. Used by
// the Field provider for its season windows (src/lib/season.js).
export async function peakMonthAt(ee, region, { context = {} } = {}) {
  try {
    const values = await evaluate(
      ndviClimatology(ee).reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 500, maxPixels: MAX_PIXELS_PER_CELL }),
      { timeoutMs: 60 * 1000, what: "Finding the growing season", context },
    );
    return peakMonthFrom(Array.from({ length: 12 }, (_, i) => numberOr(values?.[`ndvi${pad(i + 1)}`], null)));
  } catch {
    return null;
  }
}

// The peak month (1-12) of each cell's cropland greenness in 2019-2021, from
// MODIS NDVI (MOD13A2, 1 km, 16 days): the mean of each calendar month,
// then src/lib/season.js peakMonthFrom. -> Map(cell id -> month | null)
// A group that runs past our time limit (CHUNK_TIMEOUT_MS: GeeError
// "timeout") is sent once more, unchanged, after the pause of a dropped
// connection (context.retryDelayMs), before the whole area takes its
// seasons from the latitude (analyze): the season finder has no lighter
// form. While the library's own deadline was 5 minutes too, its "HTTP
// code: -1" came first and gave that second try (isTransientError); with
// our limit first (EE_DEADLINE_MS) and no second try, a slow group sent the
// whole month to latitude seasons at once (found in review, fake Earth
// Engine, 2026-10-19), which under load can make a month differ from its
// neighbours.
// Once one group has failed for good, the whole area takes its seasons from
// the latitude, so nothing more of the finder is sent: not a group still to
// start (mapLimit), not another group's second try, nor its re-sends after a
// dropped connection or a busy Earth Engine (retryTransient), nor one still
// waiting for farm analyses (evaluate). The finder has its own failure for
// that (newFailure, `finder.failed`), which the month's own failure (a Stop:
// server/jobs.js) ends too. A second try that passed is reported
// (context.retried: "asked again ... the readings are the same") only once
// the whole finder has passed: when the latitude decided, they are not the
// same. (Found in review, fake Earth Engine, 2026-10-19: with two groups
// past the limit, one second try passing and one failing, the run said both
// "taken from the latitude" and "asked again ... the same"; and a group's
// second try still went out 8 s after another group had failed, after its
// month had ended.)
async function seasonPeaks(ee, { cells, cellSizeDeg, scale, tileScale, chunkSize, state, context }) {
  const monthly = ndviClimatology(ee);
  const peaks = new Map();
  const pixel = Math.max(SEASON_FINDER.minScale, Math.min(SEASON_FINDER.maxScale, scale));
  const gaveUp = newFailure("the season finder");
  const month = context.failed;
  const finder = { ...context, failed: { of: gaveUp.of, holds: gaveUp.holds, get error() { return gaveUp.error || month?.error || null; } } };
  let passedAgain = 0;
  try {
    await mapLimit(chunk(cells, chunkSize), MAX_PARALLEL_CHUNKS, async (part) => {
      const squares = cellCollection(ee, part, cellSizeDeg);
      const args = { collection: squares, reducer: ee.Reducer.mean(), scale: pixel, crs: "EPSG:4326", tileScale, ...(state.noMaxPixelsArg ? {} : { maxPixelsPerRegion: MAX_PIXELS_PER_CELL }) };
      const once = () => retryTransient(() => evaluate(monthly.reduceRegions(args).select([".*"], null, false).toList(part.length), { what: "Finding the growing season", context: finder }), context.retryDelayMs, finder);
      const result = await once().catch(async (error) => {
        if (error?.code !== "timeout" || finder.failed.error) throw error;
        await sleep(Number.isFinite(context.retryDelayMs) ? Math.max(0, context.retryDelayMs) : TRANSIENT_RETRY_MS);
        // Not sent ("stopped": evaluate) when the finder failed meanwhile.
        const again = await once();
        passedAgain += 1;
        return again;
      });
      for (const feature of Array.isArray(result) ? result : result?.features || []) {
        const p = feature?.properties || {};
        const values = Array.from({ length: 12 }, (_, i) => numberOr(p[`ndvi${pad(i + 1)}`], null));
        peaks.set(p.id, peakMonthFrom(values));
      }
    });
  } catch (error) {
    markFailed(gaveUp, error);
    throw error;
  }
  // Said only when the finder passed (the readings are then the same as
  // without the retries); when it failed, the latitude's warning says why.
  for (let i = 0; i < passedAgain; i += 1) context.retried?.("Finding the growing season");
  return peaks;
}

// Cells as Earth Engine squares, each carrying its id.
function cellCollection(ee, cells, cellSizeDeg) {
  return ee.FeatureCollection(cells.map((cell) => ee.Feature(rect(ee, cellSquare(cell.lat, cell.lon, cellSizeDeg)), { id: cell.id })));
}

// admin1 / admin2 names for each cell centre, from FAO GAUL level 2.
async function placeNames(ee, { region, cells, context }) {
  const gaul2 = ee.FeatureCollection(DATASETS.gaul2).filterBounds(region);
  const join = ee.Join.saveFirst({ matchKey: "adm" });
  const touches = ee.Filter.intersects({ leftField: ".geo", rightField: ".geo", maxError: 100 });
  const names = new Map();
  for (const part of chunk(cells, 500)) {
    const points = ee.FeatureCollection(part.map((cell) => ee.Feature(ee.Geometry.Point([cell.lon, cell.lat]), { id: cell.id })));
    const joined = join.apply(points, gaul2, touches).map((feature) => {
      const adm = ee.Feature(feature.get("adm"));
      return ee.Feature(null, { id: feature.get("id"), admin1: adm.get("ADM1_NAME"), admin2: adm.get("ADM2_NAME") });
    });
    const result = await retryTransient(() => evaluate(joined, { timeoutMs: 2 * 60 * 1000, what: "Looking up place names", context }), context.retryDelayMs, context);
    for (const feature of result?.features || []) {
      const p = feature.properties || {};
      names.set(p.id, { admin1: cleanName(p.admin1), admin2: cleanName(p.admin2) });
    }
  }
  return names;
}

// For each alert: the last radar pass over it and the last fire day in it.
async function alertDates(ee, { alerts, cells, cellSizeDeg, region, windows, month, scale, tileScale, context, hasFires, radarPass = null }) {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const s1Month = sentinel1(ee, region, windows.month, radarPass);
  const seeds = ee.FeatureCollection(
    alerts.map((alert) => {
      const cell = byId.get(alert.cellIds[0]);
      return ee.Feature(rect(ee, cellSquare(cell.lat, cell.lon, cellSizeDeg)), { aid: alert.id });
    }),
  );
  // No radar pass: NONE (-1), never null.
  const withRadar = seeds.map((feature) => {
    const passes = s1Month.filterBounds(feature.geometry());
    return feature.set("radarLast", ee.Algorithms.If(passes.size().gt(0), passes.aggregate_max("system:time_start"), ee.Number(NONE)));
  });
  // Day of the month of the last fire detection in each pixel.
  const fireDay = hasFires
    ? firms(ee, region, windows.month)
        .map((image) => ee.Image.constant(image.date().get("day")).toInt().updateMask(image.select(BANDS.firms).mask()).rename("day"))
        .max()
    : emptyBand(ee, "day");
  const dated = fireDay
    .reduceRegions({ collection: withRadar, reducer: ee.Reducer.max().setOutputs(["fireDay"]), scale: Math.max(scale, 100), crs: "EPSG:4326", tileScale })
    .select([".*"], null, false);
  const result = await retryTransient(() => evaluate(dated, { timeoutMs: 2 * 60 * 1000, what: "Dating the alerts", context }), context.retryDelayMs, context);
  const found = new Map(
    (result?.features || []).map((feature) => {
      const p = feature.properties || {};
      return [p.aid, { radarLast: fromSentinel(p.radarLast), fireDay: fromSentinel(p.fireDay) }];
    }),
  );
  return alerts.map((alert) => ({ ...alert, date: alertDate(alert, found.get(alert.id), month) }));
}

// ---------- Regions (admin level 1) ----------

// Regions whose name contains the text. -> [{ id: "gaul1-1234", name, country }]
async function searchAdmin1(deps, q) {
  const text = String(q || "").trim();
  if (text.length < 2) return [];
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const variants = searchVariants(text);
  const filters = variants.map((variant) => ee.Filter.stringContains("ADM1_NAME", variant));
  const matches = ee
    .FeatureCollection(DATASETS.gaul1)
    .filter(filters.length === 1 ? filters[0] : ee.Filter.or(...filters))
    .limit(20)
    .select(["ADM0_NAME", "ADM1_NAME", "ADM1_CODE"], null, false);
  const result = await evaluate(matches, { timeoutMs: 60 * 1000, what: "Searching regions", context: contextOf(cfg) });
  return (result?.features || []).map((feature) => ({
    id: `gaul1-${feature.properties.ADM1_CODE}`,
    name: cleanName(feature.properties.ADM1_NAME),
    country: cleanName(feature.properties.ADM0_NAME),
  }));
}

// One region: { id, name, country, geometry } with the outline simplified
// to about 1 km (plenty for a planning map, and small to send). Names come
// back as lists (empty when there is no such region), so no null is needed.
async function admin1Details(deps, id) {
  const code = parseAdmin1Id(id);
  if (code === null) throw new GeeError("bad_request", `Not a region id: ${id}`);
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const regions = ee.FeatureCollection(DATASETS.gaul1).filter(ee.Filter.eq("ADM1_CODE", code));
  const answer = ee.Dictionary({
    count: regions.size(),
    names: regions.aggregate_array("ADM1_NAME"),
    countries: regions.aggregate_array("ADM0_NAME"),
    geometry: regions.geometry().simplify(1000),
  });
  const result = await evaluate(answer, { timeoutMs: 2 * 60 * 1000, what: "Loading the region outline", context: contextOf(cfg) });
  const geometry = toPolygonal(result?.geometry);
  if (!result?.count || !geometry) throw new GeeError("not_found", `No region with id ${id}.`);
  return { id: `gaul1-${code}`, name: cleanName(result.names?.[0]), country: cleanName(result.countries?.[0]), geometry };
}

// ---------- States and regions, soil classes (the Atlas map) ----------

// The FAO GAUL 2015 units of one level that lie in an area, with their
// borders simplified for drawing, in one request (server/units.js picks
// the level and keeps the units that belong to the area).
//   geometry    the area's outline (GeoJSON Polygon or MultiPolygon)
//   level       1 (states, provinces, oblasts) or 2 (districts, counties)
//   adm1Code    only the level-2 units of this level-1 unit (a region area:
//               nothing is cut or measured, they are all inside it)
//   clip        cut each unit to the outline (a box or a drawn area)
//   toleranceM  how far a simplified border may stray, in metres
// Gives back [{ code, name, adm1Code, adm1Name, adm0Name, areaKm2,
// insideKm2, geometry }]: insideKm2 is the part inside the outline (the
// whole unit for adm1Code). Names as GAUL writes them; a unit GAUL has no
// name for has none (cleanName). Every value is from GAUL: no null is sent.
async function adminUnits(deps, { geometry, level = 1, adm1Code = null, clip = false, toleranceM = 1000 } = {}) {
  if (!geometry) throw new GeeError("bad_request", "The area has no outline.");
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const two = level === 2;
  const region = ee.Geometry(geometry);
  const maxError = Math.max(10, Math.round(toleranceM));
  let units = ee.FeatureCollection(two ? DATASETS.gaul2 : DATASETS.gaul1).filterBounds(region);
  if (adm1Code !== null && adm1Code !== undefined) units = units.filter(ee.Filter.eq("ADM1_CODE", Number(adm1Code)));
  const measure = adm1Code === null || adm1Code === undefined;
  const rows = units.map((feature) => {
    const shape = feature.geometry().simplify(maxError);
    const inside = measure ? shape.intersection(region, maxError) : shape;
    return ee.Feature(clip ? inside : shape, {
      code: feature.get(two ? "ADM2_CODE" : "ADM1_CODE"),
      name: feature.get(two ? "ADM2_NAME" : "ADM1_NAME"),
      adm1Code: feature.get("ADM1_CODE"),
      adm1Name: feature.get("ADM1_NAME"),
      adm0Name: feature.get("ADM0_NAME"),
      areaKm2: shape.area(maxError).divide(1e6),
      insideKm2: inside.area(maxError).divide(1e6),
    });
  });
  const result = await retryTransient(
    () => evaluate(rows, { timeoutMs: 3 * 60 * 1000, what: `Loading the borders of the ${two ? "districts" : "states"}`, context: contextOf(cfg) }),
    deps.retryDelayMs,
    contextOf(cfg),
  );
  return (result?.features || [])
    .map((feature) => {
      const p = feature.properties || {};
      return {
        code: numberOr(p.code, null),
        name: cleanName(p.name) ?? null,
        adm1Code: numberOr(p.adm1Code, null),
        adm1Name: cleanName(p.adm1Name) ?? null,
        adm0Name: cleanName(p.adm0Name) ?? null,
        areaKm2: numberOr(p.areaKm2, 0),
        insideKm2: numberOr(p.insideKm2, 0),
        geometry: toPolygonal(feature.geometry),
      };
    })
    .filter((unit) => unit.code !== null && unit.geometry);
}

// The soil classes of a square or a state: how many 250 m pixels of each
// USDA great group (DATASETS.blackSoil, band grtgroup) lie in its cropland
// (ESA WorldCover class 40) and in all of it, in one request. Counts are
// Earth Engine's (a pixel cut by the edge counts in part).
//   geometry  GeoJSON Polygon or MultiPolygon
// Gives back { cropland: { "<class value>": count }, all: { ... },
// classes: [{ value, name }] } (the map's own class list, or [] when it
// could not be read: the names are then looked up by value in
// server/soil-names.js).
export const SOIL_SCALE_M = 250;
async function soilHistogram(deps, { geometry } = {}) {
  if (!geometry) throw new GeeError("bad_request", "Nothing to measure: no outline.");
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const context = contextOf(cfg);
  const region = ee.Geometry(geometry);
  const soil = ee.Image(DATASETS.blackSoil).select(BANDS.blackSoil);
  const cropland = ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).eq(CROPLAND_CLASS);
  const histogram = (image) =>
    image.reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry: region, scale: SOIL_SCALE_M, maxPixels: MAX_PIXELS_PER_CELL, tileScale: 2 });
  const answer = ee.Dictionary({ cropland: histogram(soil.updateMask(cropland)), all: histogram(soil) });
  const [result, classes] = await Promise.all([
    retryTransient(() => evaluate(answer, { timeoutMs: 2 * 60 * 1000, what: "Reading the soil classes", context }), deps.retryDelayMs, context),
    soilClassList(ee, context),
  ]);
  const counts = (part) => {
    const raw = part?.[BANDS.blackSoil];
    return raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw).filter(([, n]) => Number.isFinite(n) && n > 0)) : {};
  };
  return { cropland: counts(result?.cropland), all: counts(result?.all), classes, scaleM: SOIL_SCALE_M };
}

// The soil map's class list [{ value, name }], read once per Earth Engine
// connection; [] when it cannot be read (not remembered: tried again next
// time).
const soilClassesByEe = new WeakMap();
async function soilClassList(ee, context) {
  if (soilClassesByEe.has(ee)) return soilClassesByEe.get(ee);
  try {
    const properties = (await getAsset(ee, DATASETS.blackSoil, context))?.properties;
    const values = properties?.grtgroup_class_values;
    const names = properties?.grtgroup_class_names;
    if (!Array.isArray(values) || !Array.isArray(names) || values.length !== names.length) return [];
    const classes = values.map((value, i) => ({ value, name: String(names[i]) }));
    soilClassesByEe.set(ee, classes);
    return classes;
  } catch {
    return [];
  }
}

// For the gee:check script: the raw soil values at one point, to confirm
// the units (SoilGrids SOC 0-5 cm is expected around 300–500 dg/kg on
// Ukrainian chernozem) and the black-soil class there.
async function readPoint(deps, { lat, lon }) {
  const cfg = deps.getConfig();
  const ee = await deps.connect(cfg);
  const point = ee.Geometry.Point([lon, lat]);
  const { assetId, warning, source } = await checkChernozemAsset(ee, cfg.chernozemAsset);
  const bands = [
    ee.Image(DATASETS.soc).select(BANDS.soc).rename("socRaw"),
    ee.Image(DATASETS.blackSoil).select(BANDS.blackSoil).rename("greatGroup"),
    blackSoilImage(ee).rename("blackSoil"),
    ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).rename("worldCover"),
  ];
  if (assetId) bands.push(ee.Image(assetId).select(BANDS.chernozemAsset).rename("assetRaw"));
  const values = await evaluate(
    ee.Image.cat(bands).reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 250, maxPixels: MAX_PIXELS_PER_CELL }),
    { timeoutMs: 60 * 1000, what: "Reading soil values at the test point", context: contextOf(cfg) },
  );
  return { ...values, assetId, assetWarning: warning, soilSource: source };
}

// =====================================================================
// Plain helpers (no Earth Engine), tested in gee.test.js
// =====================================================================

const pad = (n) => String(n).padStart(2, "0");

// "2026-09" -> { start: "2026-09-01", end: "2026-10-01" } (end not included).
export function monthBounds(month) {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

// Every date window one month's analysis needs ({ start, end }, end not
// included, as Earth Engine's filterDate expects).
//   season     the last growing season that was COMPLETE by the end of the
//              month (src/lib/season.js lastCompleteSeason), with from / to
//              ("YYYY-MM") and its label: every month of one season compares
//              the same season, so an early or late spring is not damage.
//              By the place's peak month when known, else by latitude: north
//              April to September, south October to March (across the new
//              year), tropics the 12 whole months before the month
//   baselines  the same season in each normal year, 2019 to 2021 (a season
//              across the new year ENDS in each normal year); `baseline` is
//              the last of them
//   month      the month itself (alerts, night lights)
//   monthBaselines  the same month in 2019, 2020 and 2021 (fire alerts
//              compare the month with them), cut short like the month
//   radarBefore what radar alerts compare the month with: at peace (and in
//              a month before its war began) the same month of 2019-2021 (so
//              harvest and tillage, which come every year, cancel out);
//              inside a known war the 3 months before (so an alert is NEW
//              change: against 2019-2021 a whole front reads as changed
//              every month)
//   damage     where damage is counted: from the day the known war began
//              (null for a month before it), else the two years up to the
//              end of the month (src/config/conflicts.js damageWindow)
//   beforeWar  true for a month that ends before its war began (damage
//              null): no war damage is counted, and analyze measures no
//              distance to fighting (src/config/conflicts.js endsBeforeWar;
//              found in review, fake Earth Engine, 2026-10-19: such a month
//              estimated "fighting" from pre-war fires, and read 0 heavy
//              damage next to "War since ...")
//   asOf       the day seasons must be complete by (the month's last day,
//              or yesterday for a month not over yet)
//   radarSeasons  every complete growing season inside the damage window
//              (src/lib/season.js damageSeasons; for an area the analysis
//              passes areaDamageSeasons' instead), oldest first; heavy
//              damage compares each one's median VV with
//              radarSeasonBaselines, the same season of 2019-2021 (empty:
//              no war season is over yet)
//   fireNormal 2019-2021 (whole years), and fireYears the damage window's
//              war years (src/lib/atlas/method.js fireYears: from the war's
//              start, at peace back from the end): fire evidence is the
//              worst year's excess over fireNormal's count / 3
//   lastYear   the 12 months up to the end of the month, and fireBaselines
//              the same 12 months of each baseline year (distance to
//              fighting, inside a known war only). In a war's first year
//              lastYear starts on the day the war began (fightingSince),
//              and fireBaselines on the same days of each normal year, so
//              fires from before the war never stand in for fighting
//              (found in review, 2026-10-20, from these windows: a war
//              since 1 June 2026 read September's fighting from fires since
//              1 October 2025, 8 of its 12 months before the war)
//   fightingSince  the war's first day when lastYear starts on it, else null
//   viirsSearch the 6 months up to the end of the month (night lights are
//              published with a delay)
//   conflict   the war used ({ id, name, since }) or null
// No window reaches past `today` ("YYYY-MM-DD", not included), so a month
// that is not over yet only asks for images that exist.
//   lat        the place's latitude (no latitude: the north's season)
//   peakMonth  the place's greenest month (1-12), when known
//   radarSeasons  the war seasons to use (areaDamageSeasons), when given
export function monthWindows(month, today = isoDay(new Date()), { lat, conflict = null, peakMonth = null, radarSeasons: givenSeasons = null } = {}) {
  const stop = (window) => clampWindow(window, today);
  const own = stop(monthBounds(month));
  // The season must be over by the end of the month AND by today.
  const asOf = lastDay(month) < today ? lastDay(month) : shiftDays(today, -1);
  const last = lastCompleteSeason(Number.isFinite(lat) ? lat : 50, asOf, peakMonth);
  const fullSeason = { start: last.start, end: last.end };
  const season = { ...stop(fullSeason), from: last.start.slice(0, 7), to: shiftDays(last.end, -1).slice(0, 7), label: last.label, peakMonth: last.peakMonth };
  const baselines = baselineWindows(fullSeason, BASELINE_YEARS);
  const war = cleanConflict(conflict);
  const counted = damageWindow(war, lastDay(month));
  const damage = counted.start < own.end ? stop({ start: counted.start, end: own.end }) : null;
  // A month before its war began: read as at peace, with no war damage.
  const beforeWar = Boolean(war) && !damage;
  const fighting = Boolean(war) && !beforeWar;
  // The damage radar: every complete growing season inside the damage
  // window, against the same season of 2019-2021 (method.js FIRE_YEARS).
  const radarSeasons = !damage ? [] : Array.isArray(givenSeasons) ? givenSeasons.map((w) => ({ start: w.start, end: w.end })) : damageSeasons(Number.isFinite(lat) ? lat : 50, asOf, damage.start, peakMonth);
  // The fires that stand in for fighting: the 12 months up to the end of
  // the month, never from before the war began.
  const yearStart = yearBefore(own.end);
  const fightingSince = fighting && war.since > yearStart ? war.since : null;
  return {
    month: own,
    monthBaselines: BASELINE_YEARS.map((year) => sameWindowIn(own, year)),
    radarBefore: fighting ? [stop({ start: `${addMonths(month, -3)}-01`, end: monthBounds(month).start })] : BASELINE_YEARS.map((year) => sameWindowIn(own, year)),
    season,
    baseline: baselines[baselines.length - 1],
    baselines,
    damage,
    asOf,
    radarSeasons,
    radarSeasonBaselines: radarSeasons.length ? baselineWindows(radarSeasons[radarSeasons.length - 1], BASELINE_YEARS) : [],
    fireNormal: { ...FIRE_NORMAL },
    fireYears: fireYears(damage, { anchor: war ? "start" : "end" }),
    conflict: war,
    beforeWar,
    lastYear: stop({ start: fightingSince || yearStart, end: own.end }),
    fireBaselines: BASELINE_YEARS.map((year) => {
      const end = sameDayIn(year, own.end);
      if (!fightingSince) return { start: yearBefore(end), end };
      // The same days in each normal year: the war's first day moves back
      // by as many years as the end does.
      const back = Number(own.end.slice(0, 4)) - year;
      return { start: sameDayIn(Number(fightingSince.slice(0, 4)) - back, fightingSince), end };
    }),
    fightingSince,
    viirsSearch: stop({ start: `${addMonths(month, -5)}-01`, end: own.end }),
  };
}

// ---------- Where the cells are ----------

// The boxes that cover some cells: one per run of neighbouring columns
// (a gap of more than two cells starts a new box), so an area across the
// 180° line (Russia, the USA, Fiji) becomes boxes on each side instead of a
// band around the globe. At most MAX_BOXES (the closest runs are joined).
//   padKm  grows each box by this much (for "within 300 km")
// -> [[west, south, east, north], ...]
export const MAX_BOXES = 8;
export function cellBoxes(cells, cellSizeDeg, padKm = 0) {
  const half = cellSizeDeg / 2;
  const sorted = [...cells].filter((cell) => Number.isFinite(cell.lat) && Number.isFinite(cell.lon)).sort((a, b) => a.lon - b.lon);
  if (!sorted.length) return [];
  let runs = [[sorted[0]]];
  for (const cell of sorted.slice(1)) {
    const run = runs[runs.length - 1];
    if (cell.lon - run[run.length - 1].lon > 2 * cellSizeDeg + 1e-9) runs.push([cell]);
    else run.push(cell);
  }
  const boxOf = (run) => [run[0].lon - half, Math.min(...run.map((c) => c.lat)) - half, run[run.length - 1].lon + half, Math.max(...run.map((c) => c.lat)) + half];
  let boxes = runs.map(boxOf);
  // Too many boxes (islands): join the two closest neighbours until few
  // enough (never across the gap that holds the 180° line: the largest).
  while (boxes.length > MAX_BOXES) {
    let best = 1;
    for (let i = 1; i < boxes.length; i += 1) if (boxes[i][0] - boxes[i - 1][2] < boxes[best][0] - boxes[best - 1][2]) best = i;
    const [a, b] = [boxes[best - 1], boxes[best]];
    boxes.splice(best - 1, 2, [a[0], Math.min(a[1], b[1]), b[2], Math.max(a[3], b[3])]);
  }
  const clampLon = (lon) => Math.min(180, Math.max(-180, lon));
  const clampLat = (lat) => Math.min(90, Math.max(-90, lat));
  return boxes.map((box) => {
    const [west, south, east, north] = padKm > 0 ? expandBbox(box, padKm) : box;
    return [clampLon(west), clampLat(south), clampLon(east), clampLat(north)].map((v) => Number(v.toFixed(7)));
  });
}

// The squares of some cells exactly, as one box per run of neighbouring
// squares in a row (cellBoxes instead spans every row of a run of columns,
// so it would take in the squares between them): the war's squares in
// another listed war, whose unusual fires stand in for fighting
// (analyzeMonth fightRegion), without the peace squares around them.
// -> [[west, south, east, north], ...], north to south, west to east
export function squareRuns(cells, cellSizeDeg) {
  const half = cellSizeDeg / 2;
  const rows = new Map();
  for (const cell of cells || []) {
    if (!Number.isFinite(cell?.lat) || !Number.isFinite(cell?.lon)) continue;
    const key = cell.lat.toFixed(6);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(cell);
  }
  const boxOf = (first, last) => [first.lon - half, first.lat - half, last.lon + half, first.lat + half].map((v) => Number(v.toFixed(7)));
  const boxes = [];
  for (const row of [...rows.values()].sort((a, b) => b[0].lat - a[0].lat)) {
    row.sort((a, b) => a.lon - b.lon);
    let first = row[0];
    let last = row[0];
    for (const cell of row.slice(1)) {
      // A gap of a square or more starts a new run.
      if (cell.lon - last.lon > cellSizeDeg * 1.5) {
        boxes.push(boxOf(first, last));
        first = cell;
      }
      last = cell;
    }
    boxes.push(boxOf(first, last));
  }
  return boxes;
}

// A pixel size (m) for one reduction over some boxes: `minScale`, or
// coarser in steps of 100 m when the boxes hold more than `maxPixels`
// pixels at that size. Worked out here, not by Earth Engine's "bestEffort",
// so the same area always uses the same pixels.
export function fixedScaleFor(boxes, minScale, maxPixels) {
  const m2 = (boxes || []).reduce((sum, [w, south, e, n]) => sum + (e - w) * 111320 * Math.cos((((south + n) / 2) * Math.PI) / 180) * (n - south) * 110574, 0);
  if (!(m2 > 0) || !(maxPixels > 0)) return minScale;
  return Math.max(minScale, Math.ceil(Math.sqrt(m2 / maxPixels) / 100) * 100);
}

// Boxes as one Earth Engine geometry (planar, like the cells).
export function boxesGeometry(ee, boxes) {
  if (boxes.length === 1) return rect(ee, boxes[0]);
  const ring = ([w, s, e, n]) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  return ee.Geometry.MultiPolygon(boxes.map(ring), null, false);
}

// The box around some boxes ([west, south, east, north]).
export function boxesBbox(boxes) {
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

// The middle latitude of the cells (pixel sizes are worked out for it).
function cellsMidLat(cells, bbox) {
  const lats = cells.map((cell) => cell.lat).filter(Number.isFinite);
  if (!lats.length) return (bbox[1] + bbox[3]) / 2;
  return (Math.min(...lats) + Math.max(...lats)) / 2;
}

// Cells sorted into growing seasons. Each cell's season is its peak month
// (peaks: Map id -> 1..12 or null); without one, its latitude band's
// season (north = a July peak, south = a January peak, tropics = all year).
// The biggest seasons are kept (at most maxGroups, each with at least
// minShare of the cells); the cells of the others join the kept season
// whose peak is nearest in the year.
// -> [{ peakMonth (null: all year), seasonLat, cells }], biggest first
export function seasonGroups(cells, peaks = new Map(), { maxGroups = SEASON_FINDER.maxGroups, minShare = SEASON_FINDER.minShare } = {}) {
  const BAND_PEAK = { north: 7, south: 1, tropics: 0 }; // 0: all year
  const byKey = new Map();
  for (const cell of cells) {
    const peak = peaks.get(cell.id);
    const key = Number.isInteger(peak) && peak >= 1 && peak <= 12 ? peak : BAND_PEAK[climateBand(cell.lat)];
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(cell);
  }
  const sorted = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  const kept = sorted.filter(([, list], i) => i === 0 || (i < maxGroups && list.length >= minShare * cells.length)).map(([key, list]) => ({ key, cells: [...list] }));
  const distance = (a, b) => (a === 0 || b === 0 ? (a === b ? 0 : 3) : Math.min(Math.abs(a - b), 12 - Math.abs(a - b)));
  for (const [key, list] of sorted) {
    if (kept.some((group) => group.key === key)) continue;
    let target = kept[0];
    for (const group of kept) if (distance(key, group.key) < distance(key, target.key)) target = group;
    target.cells.push(...list);
  }
  return kept.map(({ key, cells: list }) => ({
    peakMonth: key || null,
    // "All year" needs a tropical latitude for season.js; a peak month does
    // not depend on the latitude.
    seasonLat: key ? list.reduce((sum, cell) => sum + cell.lat, 0) / list.length : 0,
    cells: list,
  }));
}

// Whole days from one "YYYY-MM-DD" to another.
export function daysBetween(start, end) {
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000));
}

// "2026-10-18" in another year ("2019-10-18"); 29 February becomes 1 March.
function sameDayIn(year, day) {
  const text = `${year}${day.slice(4)}`;
  return text.endsWith("-02-29") && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? `${year}-03-01` : text;
}

// The same day one year earlier.
function yearBefore(day) {
  return sameDayIn(Number(day.slice(0, 4)) - 1, day);
}

// Fire detections that are not normal for the place (FIGHTING_FIRES): 1 on
// 1 km pixels with an unusual fire in the last 12 months (in a war's first
// year, since the day it began: monthWindows lastYear), masked elsewhere.
export function fightingFires(ee, region, windows) {
  const f = FIGHTING_FIRES;
  const count = (window) => firms(ee, region, window).count().unmask(0);
  const recent = count(windows.lastYear);
  const before = ee.ImageCollection(windows.fireBaselines.map(count)).mean();
  // On FIRMS's own 1 km grid (no resampling), so "per pixel" is per km².
  const density = (image) => image.setDefaultProjection("EPSG:4326", null, 1000).focal_mean(f.radiusM, "circle", "meters");
  // The floor is for 12 months; a war's first year has a shorter window
  // (monthWindows fightingSince), so it gets the floor for its days.
  const days = daysBetween(windows.lastYear.start, windows.lastYear.end);
  const floor = f.minPerKm2 * Math.min(1, days / 365);
  const unusual = density(recent).gte(density(before).multiply(f.timesPrewar)).and(density(recent).gte(floor));
  return recent.gt(0).and(unusual).selfMask();
}

// A date window cut off at `today` (start and end never later than it).
export function clampWindow(window, today) {
  if (!today) return { ...window };
  const start = window.start > today ? today : window.start;
  const end = window.end > today ? today : window.end;
  return { ...window, start, end: end < start ? start : end };
}

// A Date -> "YYYY-MM-DD" (UTC, like Earth Engine's dates).
export function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// "2026-10-01" + -90 days -> "2026-07-03".
export function shiftDays(isoDay, days) {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The `days` days up to and including a timestamp's day.
export function daysBefore(timestampMs, days) {
  const last = new Date(timestampMs).toISOString().slice(0, 10);
  return { start: shiftDays(last, 1 - days), end: shiftDays(last, 1), last };
}

// The last day of a month: "2026-09" -> "2026-09-30".
export function lastDay(month) {
  return shiftDays(monthBounds(month).end, -1);
}

// Pixel size (m) for reducing over cells: about 20 pixels across a cell,
// never finer than 10 m (Sentinel-2) or coarser than 1 km.
export function reduceScale(cellSizeDeg, lat) {
  const cellMeters = cellSizeDeg * 111.32 * Math.cos((lat * Math.PI) / 180) * 1000;
  return Math.round(Math.min(1000, Math.max(10, cellMeters / 20)));
}

// Cell width in km at a latitude.
function cellWidthKm(cellSizeDeg, lat) {
  return cellSizeDeg * 111.32 * Math.cos((lat * Math.PI) / 180);
}

// How many cells go in one Earth Engine request: about CHUNK_AREA_KM2 of
// ground, never more than CHUNK_SIZE (250) cells or fewer than 10.
// Farm or town cells -> 250; Ukraine-size cells (0.25°) -> about 98.
export function chunkSizeFor(cellSizeDeg, lat) {
  const areaKm2 = cellAreaKm2(cellSizeDeg, lat);
  if (!(areaKm2 > 0)) return CHUNK_SIZE;
  return Math.max(MIN_CHUNK_SIZE, Math.min(CHUNK_SIZE, Math.floor(CHUNK_AREA_KM2 / areaKm2)));
}

// tileScale for a cell size: 4 normally (as in the deposit), 16 for cells
// BIG_CELL_KM wide or more (country-size areas), to stay inside memory.
export function tileScaleFor(cellSizeDeg, lat) {
  return cellWidthKm(cellSizeDeg, lat) >= BIG_CELL_KM ? 16 : 4;
}

// The pixel size for a retry after "out of memory" or "timed out": twice
// as coarse, at most 2 km.
export function coarserScale(scale) {
  return Math.min(2000, Math.round(scale * 2));
}

// How population is added up for cells of this size (see populationImages):
//   { native: true }            small cells (pixels of 100 m or finer):
//                               WorldPop's own pixels on its own grid
//   { native: false, scale }    bigger cells: density × pixel area, summed
//                               at max(100 m, the cells' pixel size)
// `scale` is the pixel size used for the other readings (it is coarser on
// a retry, which also makes population coarser).
export function populationPlan(cellSizeDeg, lat, scale = reduceScale(cellSizeDeg, lat)) {
  if (scale <= 100) return { native: true };
  return { native: false, scale: Math.max(100, scale) };
}

// Did Earth Engine stop because the work was too big (worth one more try
// with coarser pixels)? Looks at the raw message too, not just ours.
export function isTooMuchWorkError(error) {
  const texts = [error?.message, error?.cause?.message, typeof error === "string" ? error : ""].filter(Boolean).join(" ").toLowerCase();
  // "memory capacity exceeded": Earth Engine's own servers were full (real
  // data, Nakuru, Kenya, 2026-10-19, reading a field's history while other
  // requests ran); the retry with coarser pixels went through.
  if (/computation timed out|user memory limit exceeded|memory limit exceeded|memory capacity exceeded/.test(texts)) return true;
  return error instanceof GeeError && error.code === "timeout";
}

// Did the request fail on the way (a dropped connection, a busy server)
// rather than in the computation? Worth one more try of the same request
// after a pause. Real data, 2026-10-19: a Brazil box run failed after
// 321 s on "Server returned HTTP code: -1 for POST .../value:compute"
// while other runs were going; the same request passed on a retry. The
// library also answers "HTTP code: -1" at its own deadline, which was then
// as long as our time limit and came first (that Brazil failure, 321 s
// into the run, was probably that 5-minute deadline). It now comes after
// every time limit of ours (EE_DEADLINE_MS, a minute after the longest),
// so an "HTTP code: -1" we see now most likely means the connection
// dropped before our limit.
// Earth Engine busy (isBusyError) counts too. So does "Unknown reference
// to value named ''": real data, Kenya 12 months, 2026-10-19, a request
// sent when the 1-hour sign-in token had already run out was sent again by
// the library without its body (see keepTokenFresh); the next one worked.
export function isTransientError(error) {
  const texts = [error?.message, error?.cause?.message, typeof error === "string" ? error : ""].filter(Boolean).join(" ");
  return /HTTP code: -1\b|HTTP code: (429|5\d\d)\b|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|socket hang up|network error|fetch failed|unknown reference to value named ''/i.test(texts) || isBusyError(error);
}

// Was Earth Engine as a whole too busy for the request ("Earth Engine
// capacity exceeded.", "Too many concurrent aggregations.")? Real data,
// Kenya 12 months, 2026-10-19: a month failed on "Earth Engine capacity
// exceeded." after 637 s and the job stopped. Nothing is wrong with the
// request, so it is tried again as it is after a longer pause
// (BUSY_RETRY_FACTOR); if it still fails, the error is "busy"
// (explainGeeError) and an Atlas job skips that month and goes on.
// "memory capacity exceeded" is not this: it means the request is too big
// (isTooMuchWorkError, coarser pixels).
export function isBusyError(error) {
  const texts = [error?.message, error?.cause?.message, typeof error === "string" ? error : ""].filter(Boolean).join(" ");
  return /(?<!memory )capacity exceeded|too many concurrent/i.test(texts);
}

// A busy Earth Engine gets BUSY_RETRIES more tries, the pause growing by
// BUSY_RETRY_FACTOR × the normal pause each time (8 s -> 40 s, then 80 s).
export const BUSY_RETRIES = 2;
export const BUSY_RETRY_FACTOR = 5;

// Runs `request` (a function giving a promise); on a transient failure
// waits `delayMs` and runs it once more (a busy Earth Engine: up to
// BUSY_RETRIES more times, with longer pauses).
//   context  the request's context. An interactive one (the Field: not
//            context.background) stays counted as out for the whole call,
//            pauses included (holdInteractive), so the Atlas does not send
//            its requests while a Field request waits to be tried again.
//            Before, the Atlas went 3 s into the pause (YIELD.settleMs),
//            and the Field's retry met its groups of cells. Once its
//            analysis has failed (context.failed), nothing is tried again:
//            no pause, and a retry after a pause is not sent (evaluate);
//            a Field one stops holding the Atlas back then.
export async function retryTransient(request, delayMs = TRANSIENT_RETRY_MS, context = null) {
  if (context && !context.background) return holdInteractive(() => sendAgainWhenTransient(request, delayMs, context), context);
  return sendAgainWhenTransient(request, delayMs, context);
}

async function sendAgainWhenTransient(request, delayMs, context) {
  const pause = Math.max(0, Number.isFinite(delayMs) ? delayMs : TRANSIENT_RETRY_MS);
  for (let tries = 0; ; tries++) {
    try {
      return await request();
    } catch (error) {
      if (!isTransientError(error)) throw error;
      const busy = isBusyError(error);
      if (tries >= (busy ? BUSY_RETRIES : 1)) throw error;
      // Its analysis has failed: nobody would use the answer.
      if (context?.failed?.error) throw error;
      await sleep(busy ? pause * BUSY_RETRY_FACTOR * (tries + 1) : pause);
    }
  }
}

// Earth Engine ran short of memory or time (isTooMuchWorkError). Two
// kinds, two answers:
//   "full"     Earth Engine's own servers were full ("Earth Engine memory
//              capacity exceeded"; real data, Ukraine May 2026, the season's
//              image check): the same request may pass a little later
//   "too big"  the request itself is too much ("User memory limit
//              exceeded", "Computation timed out", our own time limit): the
//              same request would fail again, after as long
export function tooMuchWorkKind(error) {
  if (!isTooMuchWorkError(error)) return null;
  const texts = [error?.message, error?.cause?.message, typeof error === "string" ? error : ""].filter(Boolean).join(" ");
  return /memory capacity exceeded/i.test(texts) ? "full" : "too big";
}

// Up to MEMORY_RETRY_MS.length more tries after Earth Engine ran short of
// memory or time (tooMuchWorkKind):
//   full     the same request after the first pause (5 s), then the
//            `lighter` one after the second (20 s)
//   too big  the `lighter` one at once (never the same request again)
// A lighter request that finds the servers full is tried again after the
// next pause; one that is too big too fails. Anything else fails at once.
//   request  () => promise; lighter  () => promise (optional: without it
//            "full" tries the same request again, "too big" fails)
//   delays   the pauses (ms), default MEMORY_RETRY_MS
//   onRetry  (error, tries, how) => void before each retry (how: "same" or
//            "lighter"; optional)
export async function retryTooMuchWork(request, { delays = MEMORY_RETRY_MS, lighter = null, onRetry = null } = {}) {
  const pauses = Array.isArray(delays) ? delays : MEMORY_RETRY_MS;
  let light = false;
  for (let tries = 0; ; tries += 1) {
    try {
      return await (light ? lighter() : request());
    } catch (error) {
      const kind = tooMuchWorkKind(error);
      if (!kind || tries >= pauses.length) throw error;
      let pause = Math.max(0, Number(pauses[tries]) || 0);
      if (kind === "full") {
        if (tries > 0 && lighter) light = true;
      } else {
        if (!lighter || light) throw error;
        light = true;
        pause = 0;
      }
      onRetry?.(error, tries + 1, light ? "lighter" : "same");
      if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }
}

// Did Earth Engine fail with "An internal error has occurred"? Nothing is
// wrong with the request: the same request passed when sent again (real
// data, Iowa, 2026-10-19, a field; Ukraine August 2026, a group of 97
// cells, which failed the whole month).
export function isInternalError(error) {
  const text = [error?.message, error?.cause?.message].filter(Boolean).join(" ");
  return /an internal error has occurred/i.test(text);
}

// Did Earth Engine refuse an argument it does not know (older API)?
export function isUnknownArgumentError(error, name) {
  const texts = [error?.message, error?.cause?.message].filter(Boolean).join(" ");
  return /unrecognized argument|unknown argument|unexpected argument/i.test(texts) && texts.includes(name);
}

// A value that used NONE (-1) for "nothing found" -> the number, or null.
export function fromSentinel(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n !== NONE && n >= 0 ? n : null;
}

// The image counts from preflight() as plain numbers; viirsLatest is a
// timestamp or null.
export function cleanCounts(raw = {}) {
  const r = raw || {};
  const count = (key) => Math.max(0, numberOr(r[key], 0));
  const passes = (key) => Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`${key}_${pass}`)]));
  return {
    s1Month: passes("s1Month"),
    s1MonthBase: passes("s1MonthBase"),
    viirsMonth: count("viirsMonth"),
    viirsLatest: fromSentinel(r.viirsLatest),
    firmsDamage: count("firmsDamage"),
    firmsNormal: count("firmsNormal"),
    firmsMonth: count("firmsMonth"),
    firmsMonthBase: count("firmsMonthBase"),
    firmsYear: count("firmsYear"),
    worldPop: count("worldPop"),
  };
}

// The square of a cell: [west, south, east, north].
export function cellSquare(lat, lon, sizeDeg) {
  const half = sizeDeg / 2;
  const r = (value) => Number(value.toFixed(7));
  return [r(lon - half), r(lat - half), r(lon + half), r(lat + half)];
}

// The bounding box grown by `km` on every side (shared with acled.js).
export const expandBboxKm = expandBbox;

// [1..600] in pieces of 250 -> [[1..250], [251..500], [501..600]].
export function chunk(items, size) {
  const parts = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

// Runs `work` over items, at most `limit` at a time, in order of start.
// Once one item has failed, no further item is started (those already
// running finish) and the first error is the one thrown. mapLimit rejects
// with it anyway, so the other items' results are never used and the
// requests they would send are not needed. Its users: here the Atlas's
// groups of cells (the month fails), the season finder's groups (the
// latitude decides) and the single counts of a lighter image check (the
// check fails); in field-gee.js the parts of a field's history
// (fieldHistory, fieldHistories: the history fails, as it always did).
// (Before, a month that failed on one group of cells still sent all its
// other groups to Earth Engine, one after the other.)
export async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await work(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

// Gives up waiting after `ms` with a clear message.
export function withTimeout(promise, ms, what = "Earth Engine request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new GeeError("timeout", `${what} took longer than ${Math.round(ms / 1000)} seconds. Try a smaller area, or try again later.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function numberOr(value, fallback) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : fallback;
}
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)));

function cleanName(value) {
  const text = value == null ? "" : String(value).trim();
  // FAO GAUL uses "Administrative unit not available" for a missing name.
  if (!text || text === "null" || /^administrative unit not available$/i.test(text)) return undefined;
  return text;
}

// One cell's Earth Engine results -> the raw reading the runs expect.
//   means  { chernozemCrop, chernozemAll, cropland, chiDrop, radarDb, heavy,
//            fx0, fx1, ..., conflictM, lights, ... } (means over the cell;
//            missing = no data; fx<i> is the cell's fire excess in year i of
//            the damage window, and the largest, never below 0, is the
//            cell's worst war year; firesExcess / firesWar are older names
//            of one whole-window excess)
//   sums   { people } (people in the cell)
export function toReading(cell, means = {}, sums = {}, { cellSizeDeg, names } = {}) {
  const m = means || {};
  const areaKm2 = cellAreaKm2(cellSizeDeg, cell.lat);
  const population = Math.max(0, numberOr(sums?.people ?? sums?.sum, 0));
  const chiDrop = numberOr(m.chiDrop, null);
  const radarDb = numberOr(m.radarDb, null);
  // Chernozem on the cell's cropland; on its land when it has no cropland.
  const chernozem = numberOr(m.chernozemCrop, numberOr(m.chernozemAll, 0));
  const reading = {
    id: cell.id,
    chernozem: round(clamp01(chernozem), 4),
    croplandShare: round(clamp01(numberOr(m.cropland, 0)), 4),
    // FIRMS pixels are ~1 km², so the mean count per pixel is detections per km².
    firesPer100Km2: round(worstYearExcess(m) * 100, 2),
    chiDrop: chiDrop === null ? null : round(chiDrop, 4),
    // Mean radar change (dB) over the cell's cropland, every complete war
    // season against the same season of 2019-2021 (null: no radar there).
    radarDb: radarDb === null ? null : round(Math.max(0, radarDb), 2),
    conflictKm: round(Math.max(0, numberOr(m.conflictM, MAX_CONFLICT_M)) / 1000, 2),
    popPerKm2: round(areaKm2 > 0 ? population / areaKm2 : 0, 2),
    lights: round(Math.max(0, numberOr(m.lights, 0)), 3),
    heavyShare: round(clamp01(numberOr(m.heavy, 0)), 4),
    population: Math.round(population),
  };
  if (names?.admin1) reading.admin1 = names.admin1;
  if (names?.admin2) reading.admin2 = names.admin2;
  return reading;
}

// The cell's fire excess in its worst war year (the largest fx<i> mean,
// never below 0); older answers: firesExcess or firesWar.
export function worstYearExcess(means = {}) {
  const years = Object.entries(means || {}).filter(([key, value]) => /^fx\d+$/.test(key) && Number.isFinite(numberOr(value, NaN))).map(([, value]) => numberOr(value, 0));
  if (years.length) return Math.max(0, ...years);
  return Math.max(0, numberOr(means?.firesExcess, numberOr(means?.firesWar, 0)));
}

// "Kharkivs'ka" + "Chuhuivs'kyi" -> "Chuhuivs'kyi, Kharkivs'ka"; no names -> coordinates.
export function placeLabel({ admin1, admin2, lat, lon }) {
  const parts = [admin2, admin1].filter(Boolean);
  return parts.length ? parts.join(", ") : formatCoord(lat, lon);
}

// Picks at most `max` alerts from the cells' radar change and fires.
//   candidates [{ id, lat, lon, radarShare, radarKm2, fires, blackSoilHa?, admin1?, admin2? }]
// A cell counts when at least 5% of it changed on radar (radar), or it had
// at least one fire detection (fire). Touching cells of the same kind join
// the strongest one, so one event is one alert. Radar and fire alerts take
// turns, strongest first, so both kinds are seen.
// In a large area (RADAR_ALERT.minCells cells or more with a radar reading)
// a cell must also have changed at least RADAR_ALERT.timesTypical times as
// much as the area's typical cell: a month's change that is everywhere (a
// harvest early or late across a whole region, a wet month) is not an
// event, and joining every touching cell of it gave alerts of 35,000 to
// 68,000 km² across Ukraine and of 320 km² in peaceful Iowa (real data,
// 2026-09). A group also stops RADAR_ALERT.reach cells from its strongest
// cell (with both rules, Ukraine 2026-09: 19,915 km² at most before the
// reach limit, 92,625 km² before either).
// Radar alerts only in squares the ranking keeps: a candidate with a
// `blackSoilHa` under the ranking's floor (scoring.js blackSoilFloor, from
// method.js BLACK_SOIL_MIN) is never part of a radar alert, so an alert
// never points at a square shown as "No black soil" (a town, a lake, arid
// land). Fire alerts stay everywhere: a fire is a fire. Candidates without
// `blackSoilHa` count as kept.
export function pickAlerts(candidates, { cellSizeDeg, month, max = 6, minRadarShare = 0.05, minFires = 1 } = {}) {
  const shares = candidates.map((c) => c.radarShare).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const typical = shares.length >= RADAR_ALERT.minCells ? shares[Math.floor(shares.length / 2)] : 0;
  const radarMin = Math.max(minRadarShare, RADAR_ALERT.timesTypical * typical);
  const ranked = (c) => !Number.isFinite(c.blackSoilHa) || c.blackSoilHa >= blackSoilFloor(c, cellSizeDeg);
  const near = (a, b) => Math.abs(a.lat - b.lat) <= cellSizeDeg * 1.01 && Math.abs(a.lon - b.lon) <= cellSizeDeg * 1.01;
  const groups = (kind, strength, keep) => {
    const pool = candidates.filter(keep).sort((a, b) => strength(b) - strength(a));
    const used = new Set();
    const out = [];
    for (const seed of pool) {
      if (used.has(seed.id)) continue;
      used.add(seed.id);
      const members = [seed];
      // Grow the group through touching cells, up to RADAR_ALERT.reach
      // cells from the seed.
      const inReach = (other) => Math.max(Math.abs(other.lat - seed.lat), Math.abs(other.lon - seed.lon)) <= cellSizeDeg * (RADAR_ALERT.reach + 0.01);
      for (let i = 0; i < members.length; i += 1) {
        for (const other of pool) {
          if (!used.has(other.id) && near(members[i], other) && inReach(other)) {
            used.add(other.id);
            members.push(other);
          }
        }
      }
      const magnitude = members.reduce((sum, member) => sum + strength(member), 0);
      out.push({
        id: `${kind}-${seed.id}`,
        kind,
        date: lastDay(month),
        lat: seed.lat,
        lon: seed.lon,
        place: placeLabel(seed),
        cellIds: members.map((member) => member.id),
        magnitude: kind === "radar" ? round(magnitude, 2) : Math.round(magnitude),
        unit: kind === "radar" ? "km² changed" : "detections",
      });
    }
    return out;
  };
  const radar = groups("radar", (c) => c.radarKm2, (c) => c.radarShare >= radarMin && c.radarKm2 > 0 && ranked(c));
  const fire = groups("fire", (c) => c.fires, (c) => Math.round(c.fires) >= minFires);
  const alerts = [];
  for (let i = 0; alerts.length < max && (i < radar.length || i < fire.length); i += 1) {
    if (i < radar.length) alerts.push(radar[i]);
    if (i < fire.length && alerts.length < max) alerts.push(fire[i]);
  }
  return alerts;
}

// The day to show for an alert: the last radar pass or last fire day found
// in the month, else the month's last day.
export function alertDate(alert, found, month) {
  if (alert.kind === "radar" && Number.isFinite(found?.radarLast)) {
    const day = new Date(found.radarLast).toISOString().slice(0, 10);
    if (day.startsWith(month)) return day;
  }
  if (alert.kind === "fire" && Number.isFinite(found?.fireDay) && found.fireDay >= 1 && found.fireDay <= 31) {
    const day = `${month}-${pad(Math.round(found.fireDay))}`;
    if (day <= lastDay(month)) return day;
  }
  return lastDay(month);
}

// "gaul1-1234" or "1234" or 1234 -> 1234; anything else -> null.
export function parseAdmin1Id(id) {
  const match = String(id ?? "").match(/^(?:gaul1-)?(\d{1,9})$/);
  return match ? Number(match[1]) : null;
}

// Earth Engine's string match is case-sensitive, so a few spellings are
// tried: "kharkiv" -> ["kharkiv", "Kharkiv", "KHARKIV"].
export function searchVariants(text) {
  const lower = text.toLowerCase();
  const title = lower.replace(/(^|[\s'-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());
  return [...new Set([text, title, lower, text.toUpperCase()])];
}

// An outline from Earth Engine as a Polygon or MultiPolygon (a dissolved
// outline can come back as a GeometryCollection). Null when there is none.
export function toPolygonal(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry.coordinates?.length ? geometry : null;
  if (geometry.type === "GeometryCollection") {
    const coordinates = [];
    for (const part of geometry.geometries || []) {
      if (part.type === "Polygon") coordinates.push(part.coordinates);
      else if (part.type === "MultiPolygon") coordinates.push(...part.coordinates);
    }
    if (!coordinates.length) return null;
    return coordinates.length === 1 ? { type: "Polygon", coordinates: coordinates[0] } : { type: "MultiPolygon", coordinates };
  }
  return null;
}

// Turns an Earth Engine or Google sign-in error into one clear sentence
// that says what to do. Gives back a GeeError with a short `code`.
export function explainGeeError(error, { projectId, clientEmail, asset, what } = {}) {
  if (error instanceof GeeError) return error;
  const raw = (error && (error.message || String(error))) || "unknown error";
  const text = raw.toLowerCase();
  const project = projectId ? `"${projectId}"` : "your project";
  const account = clientEmail || "the service account";
  const prefix = what ? `${what}: ` : "";
  const make = (code, message) => new GeeError(code, message, error);

  if (/has not been used in project|service_disabled|api has not been used|it is disabled|is not enabled|enable it by visiting/.test(text)) {
    return make("api_disabled", `The Earth Engine API is not enabled in project ${project}. Enable it at https://console.cloud.google.com/apis/library/earthengine.googleapis.com${projectId ? `?project=${projectId}` : ""} and try again in a few minutes.`);
  }
  if (/not registered|not been registered|not signed up|register.*earth engine|earth engine.*register|unregistered|no project found|project.*not found.*earth engine/.test(text)) {
    return make("not_registered", `Project ${project} is not registered for Earth Engine. Register it at https://code.earthengine.google.com/register (pick the project, then choose noncommercial or commercial use).`);
  }
  if (/asset.*(not found|does not exist|cannot be found)|(not found|does not exist).*asset|image\.load|cannot find asset/.test(text) || (asset && text.includes(asset.toLowerCase()) && /not found|permission|denied|access/.test(text))) {
    return make("asset_not_found", `Asset not found: ${asset || "the chernozem map"} cannot be read by ${account}. Set GEE_CHERNOZEM_ASSET to an asset it can read (or share the asset with it).`);
  }
  if (/invalid_grant|invalid jwt|invalid_client|unauthorized_client|private key|pem|decoder routines|account not found|key.*(disabled|deleted|revoked)/.test(text)) {
    return make("bad_key", `Google rejected the service-account key for ${account}. Create a new JSON key (Google Cloud > IAM > Service accounts > Keys) and put it in .env.`);
  }
  if (/permission|forbidden|access denied|not authorized|unauthorized|\b403\b|does not have/.test(text)) {
    return make("no_permission", `The service account ${account} lacks permission in project ${project}. In Google Cloud > IAM, give it the roles "Earth Engine Resource Viewer" and "Service Usage Consumer", then wait a few minutes.`);
  }
  // Earth Engine too busy right now ("Too many concurrent aggregations.",
  // "Earth Engine capacity exceeded.": isBusyError), which two workloads on
  // one project at once can bring: nothing is wrong with the request, the
  // key or the project's quota. Such a request is tried again after longer
  // pauses (retryTransient); one that still fails is "busy", which an Atlas
  // job does not stop for: it skips the month and goes on (server/jobs.js
  // STOPPING_CODES), as for any other month that fails. "Too many
  // concurrent" used to read as a quota, which stopped a 12-month job at
  // that month (fake Earth Engine, review of 2026-10-19). A real quota (or a
  // 429 "too many requests" the library has already sent again up to 10
  // times) still stops it, below.
  if (isBusyError(error)) {
    return make("busy", `${prefix}Earth Engine was too busy ("${raw.trim()}"). Wait a few minutes and try again.`);
  }
  if (/quota|rate limit|too many requests|\b429\b/.test(text)) {
    return make("quota", `${prefix}Earth Engine is limiting requests for project ${project}. Wait a few minutes and run the analysis again.`);
  }
  if (/user memory limit|memory limit exceeded|too many pixels|computation timed out|computed value is too large|too many elements|aggregation/.test(text)) {
    return make("too_big", `${prefix}Earth Engine could not finish this much work in one go. Try a smaller area, then run it again.`);
  }
  if (/timed out|timeout|deadline/.test(text)) {
    return make("timeout", `${prefix}Earth Engine did not answer in time. Try again, or use a smaller area.`);
  }
  if (/enotfound|econnrefused|econnreset|etimedout|eai_again|network|fetch failed|socket hang up|getaddrinfo/.test(text)) {
    return make("network", `${prefix}Could not reach Google Earth Engine. Check the internet connection and try again.`);
  }
  return make("gee_error", `${prefix}Earth Engine error: ${raw}`);
}
