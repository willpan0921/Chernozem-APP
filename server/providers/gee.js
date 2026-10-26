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
// A natural disaster the team set (src/lib/atlas/method.js isDisaster:
// a flood, wildfire, drought, storm/earthquake/landslide or other) has its
// own damage and Feasibility, in the same request structure: its images
// are counted with the month's others (preflight disasterCounts,
// seasonPreflight), built by floodImages, burnImages, cropLossImage and
// greenLossImage, and read as the bands hit, grassland, grassHit and wetNow
// (toReading); a wildfire's fires burning now give the distance (conflictM,
// "fire-now"), a flood's water now its wetNow ("flood-now"); no ACLED file
// and no fighting fires are read for it. `npm run disaster:check` runs it
// on the events it was checked against (docs/METHODS.md, "Natural
// disasters").
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
import { NO_WAR_WARNING, addMonths, beforeDisasterWarning, beforeWarWarning, cleanConflict, monthLabel } from "../runs.js";
import { DISASTER_NOUNS, DROUGHT, FIRE_YEARS, FLOOD, GROUND, HAZARD_GRID_M, HEAVY_DAMAGE, WILDFIRE, fireYears, isDisaster } from "../../src/lib/atlas/method.js";
import { blackSoilFloor } from "../../src/lib/atlas/scoring.js";
import { areaDamageSeasons, baselineWindows, climateBand, cropLossSeason, damageSeasons, lastCompleteSeason, noLossSeasonWarning, peakMonthFrom, sameWindowIn, windowLabel } from "../../src/lib/season.js";
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
  // Natural disasters only (a team's crisis setting: src/lib/atlas/method.js
  // isDisaster; floodImages, burnImages, cropLossImage below).
  jrcWater: "JRC/GSW1_4/GlobalSurfaceWater",
  jrcMonthly: "JRC/GSW1_4/MonthlyHistory",
  hand: "MERIT/Hydro/v1_0_1",
  burnedModis: "MODIS/061/MCD64A1",
  burnedViirs: "NASA/VIIRS/002/VNP64A1",
  ndvi250: "MODIS/061/MOD13Q1",
  ndviViirs: "NASA/VIIRS/002/VNP13A1",
  // Daily snow cover and topsoil temperature (a flood's radar looks on
  // snowy or frozen days are left out: floodImages).
  era5Daily: "ECMWF/ERA5_LAND/DAILY_AGGR",
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
  jrcSeasonality: "seasonality", // months of the year with water, 1984-2021
  hand: "hnd", // height above the nearest drainage, m
  burnModis: "BurnDate", // day of the year it burned (0 = not burned)
  burnViirs: "Burn_Date",
  ndvi: "NDVI", // MOD13Q1 / VNP13A1, x 0.0001
  snowCover: "snow_cover", // ERA5-Land daily mean, %
  soilTemp: "soil_temperature_level_1_min", // ERA5-Land daily minimum, K (0-7 cm)
};
// Grassland in ESA WorldCover (a disaster's grassland and pasture hit).
export const GRASSLAND_CLASS = 30;

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

// Grassland (ESA WorldCover class 30): a disaster's grassland and pasture hit.
function grasslandImage(ee) {
  return ee.ImageCollection(DATASETS.worldCover).first().select(BANDS.worldCover).eq(GRASSLAND_CLASS).unmask(0).rename("grassland");
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
//   nowRegion  a wildfire: the cells padded by WILDFIRE.fullKm (fires
//              burning now are looked for there)
async function preflight(ee, { region, bufferRegion, nowRegion = region, windows, context }) {
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
    // Not for a natural disaster (it has no fighting).
    firmsYear: windows.conflict && !isDisaster(windows.conflict) && !windows.beforeWar ? firms(ee, bufferRegion, windows.lastYear).size() : ee.Number(0),
    worldPop: worldPop(ee, region).size(),
    // A natural disaster's images, in the same request (disasterCounts).
    ...disasterCounts(ee, { region, nowRegion, windows }),
  };
  const raw = await countImages(ee, counts, { what: "Checking which satellite images exist", context });
  const clean = cleanCounts(raw);
  if (windows.disaster) clean.hazard = cleanHazardCounts(raw, windows);
  return clean;
}

// The images a natural disaster's month needs, counted with the others
// (preflight), so an empty collection never reaches a formula ({} for a
// war, and for a month before the disaster began):
//   flood     s1Hazard, s2Hazard (looks in the hazard window), s1Now, s2Now
//             (looks in its last 12 days), jrcMonthly (the water guard)
//   wildfire  firmsHazard, firmsHazardBase (FIRMS days in the window and its
//             normal-year days), firmsNow (in the last 7 days, the area
//             padded by 10 km), burnedModis<i>, burnedViirs<i> (the
//             burned-area map of each month of windows.burnMonths), s2Pre,
//             s2Post (dNBR)
// Drought and storm/earthquake/landslide count per season group
// (seasonPreflight).
export function disasterCounts(ee, { region, nowRegion, windows }) {
  const type = windows.disaster?.type;
  if (!windows.hazard || !(windows.hazard.end > windows.hazard.start)) return {};
  const merged = (list, make) => list.map(make).reduce((all, next) => all.merge(next)).size();
  if (type === "flood") {
    const nowNormals = windows.hazardNowNormals || [];
    return {
      s1Hazard: sentinel1(ee, region, windows.hazard).size(),
      s2Hazard: sentinel2(ee, region, windows.hazard).size(),
      s1Now: sentinel1(ee, region, windows.hazardNow).size(),
      s2Now: sentinel2(ee, region, windows.hazardNow).size(),
      jrcMonthly: ee.ImageCollection(DATASETS.jrcMonthly).filterBounds(region).filter(ee.Filter.calendarRange(BASELINE_FROM, BASELINE_YEAR, "year")).size(),
      // The normal years' radar (floodImages: darker than normal, recurring water).
      s1HazardBase: merged(windows.floodNormals || [], (w) => sentinel1(ee, region, w)),
      s2HazardBase: merged(windows.floodNormals || [], (w) => sentinel2(ee, region, w)),
      s1NowBase: nowNormals.length ? merged(nowNormals, (w) => sentinel1(ee, region, w)) : ee.Number(0),
      s2NowBase: nowNormals.length ? merged(nowNormals, (w) => sentinel2(ee, region, w)) : ee.Number(0),
      // Days of the hazard window with snow or frozen topsoil on a tenth
      // or more of the area (ERA5-Land), and the days ERA5-Land has yet.
      coldDays: coldDays(ee, region, windows.hazard),
      coldNowDays: windows.hazardNow && windows.hazardNow.end > windows.hazardNow.start ? coldDays(ee, region, windows.hazardNow) : ee.Number(0),
      coldNormalDays: [...(windows.floodNormals || []), ...nowNormals]
        .map((w) => coldDays(ee, region, { start: shiftDays(w.start, -FLOOD.normalPadDays), end: shiftDays(w.end, FLOOD.normalPadDays) }))
        .reduce((all, next) => ee.Number(all).add(next)),
    };
  }
  if (type === "wildfire") {
    return {
      firmsHazard: firms(ee, region, windows.hazard).size(),
      firmsHazardBase: merged(windows.hazardNormals, (w) => firms(ee, region, w)),
      firmsNow: firms(ee, nowRegion, windows.hazardNow).size(),
      ...Object.fromEntries(
        windows.burnMonths.flatMap((m, i) => [
          [`burnedModis${i}`, burnedArea(ee, DATASETS.burnedModis, BANDS.burnModis, region, m).size()],
          [`burnedViirs${i}`, burnedArea(ee, DATASETS.burnedViirs, BANDS.burnViirs, region, m).size()],
        ]),
      ),
      s2Pre: sentinel2(ee, region, windows.burnPre).size(),
      s2Post: sentinel2(ee, region, windows.burnPost).size(),
    };
  }
  return {};
}

// The disaster counts as plain numbers ({ key: count }, never below 0):
// those disasterCounts asked for, with burnedModis / burnedViirs as lists
// (one count per month of windows.burnMonths).
export function cleanHazardCounts(raw = {}, windows = {}) {
  const r = raw || {};
  const count = (key) => Math.max(0, numberOr(r[key], 0));
  const keys = ["s1Hazard", "s2Hazard", "s1Now", "s2Now", "jrcMonthly", "s1HazardBase", "s2HazardBase", "s1NowBase", "s2NowBase", "coldDays", "coldNowDays", "coldNormalDays", "firmsHazard", "firmsHazardBase", "firmsNow", "s2Pre", "s2Post"];
  const months = windows.burnMonths || [];
  return {
    ...Object.fromEntries(keys.map((key) => [key, count(key)])),
    burnedModis: months.map((_, i) => count(`burnedModis${i}`)),
    burnedViirs: months.map((_, i) => count(`burnedViirs${i}`)),
  };
}

// One month's burned-area map (MCD64A1 or VNP64A1) over a region.
function burnedArea(ee, dataset, band, region, month) {
  const { start, end } = monthBounds(month);
  return ee.ImageCollection(dataset).filterBounds(region).filterDate(start, end).select(band);
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
  // A natural disaster the team set (src/lib/atlas/method.js isDisaster):
  // its own damage and Feasibility rules, never fighting or ACLED.
  const disaster = isDisaster(conflict) ? conflict : null;
  const noun = disaster ? DISASTER_NOUNS[disaster.type] : null;
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
  const warSeasons = shared.damage ? areaDamageSeasons(grouped.map((group) => ({ lat: group.seasonLat, peakMonth: group.peakMonth })), shared.asOf, shared.damage.start, { containing: Boolean(disaster) }) : grouped.map(() => []);
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
  // A wildfire's fires burning now are looked for within 10 km of the cells.
  const nowRegion = disaster?.type === "wildfire" ? boxesGeometry(ee, cellBoxes(cells, cellSizeDeg, WILDFIRE.fullKm)) : region;
  const [have, asset, ...groupHave] = await Promise.all([
    preflight(ee, { region, bufferRegion: fightRegion, nowRegion, windows: shared, context }),
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
  // A natural disaster has no fighting: no ACLED file is read for it.
  const acled = disaster ? { points: [], status: null, warning: null } : acledBattlesFor({ csvPath: cfg.acledCsvPath, bbox: boxesBbox(boxes), month });
  if (acled.warning) warnings.push(acled.warning);
  // A month before its war began: no war damage (no damage window), and
  // its fires are not fighting (monthWindows beforeWar). The same before a
  // disaster's day: no disaster damage, and Feasibility is not measured.
  if (shared.beforeWar) warnings.push(disaster ? beforeDisasterWarning(conflict.since, disaster.type) : beforeWarWarning(conflict.since, { accessMeasured: acled.points.length > 0 }));
  let conflictM = null;
  let accessSource = "none";
  // Where the fires that stand in for fighting come from, for the words
  // (noFightingFiresWarning), and where the run's warning about them sits
  // (worded again in step 6 when none looks like fighting).
  const fightWhere = warCells ? (otherWarCells.length ? "war+other" : "war") : null;
  let accessWarning = -1;
  // The images of a flood or a wildfire do not depend on the season, so
  // they are built once for every group (step 3 below).
  const onHazard = disaster?.type === "flood" ? (image) => onFloodGrid(image, scale) : (image) => onHazardGrid(image, scale);
  let hazardImages = null;
  // What a disaster run could not measure, for the pages (runs.js
  // cleanDisasterDamage): the cells whose damage was not measured (id ->
  // "season-incomplete" | "no-images"), and why the damage may read low.
  const unmeasured = new Map();
  const mayBeLow = new Set();
  if (disaster) {
    const h = have.hazard || {};
    const monthName = monthLabel(month);
    if (shared.beforeWar) {
      // Said above (beforeDisasterWarning): nothing is measured.
    } else if (disaster.type === "flood") {
      hazardImages = floodImages(ee, { region, windows: shared, have });
      if (shared.hazard) {
        warnings.push(`Flood looks: ${h.s1Hazard} radar ${h.s1Hazard === 1 ? "pass" : "passes"} and ${h.s2Hazard} optical ${h.s2Hazard === 1 ? "image" : "images"} between ${shared.hazard.start} and ${shiftDays(shared.hazard.end, -1)}.`);
        if (h.coldDays > 0) {
          warnings.push(floodColdWarning(h.coldDays));
          mayBeLow.add("snow");
        }
        if (!(h.s1Hazard + h.s2Hazard > 0)) for (const cell of cells) unmeasured.set(cell.id, "no-images");
        if (!(h.s1HazardBase > 0 || h.s2HazardBase > 0)) warnings.push(`No radar or optical images of the same days in ${BASELINE_FROM}-${BASELINE_YEAR}, so land under water in most years (such as rice paddies) could not be left out: the flood may read high.`);
      }
      if (h.s1Now + h.s2Now > 0) accessSource = "flood-now";
      else {
        accessSource = "disaster-none";
        warnings.push(`No radar or satellite image in the last ${FLOOD.nowDays} days of ${monthName}, so Feasibility (land under water now) is not measured.`);
      }
    } else if (disaster.type === "wildfire") {
      hazardImages = burnImages(ee, { region, nowRegion, windows: shared, have, onFireGrid, tileScale });
      const covered = shared.burnMonths.filter((_, i) => h.burnedModis?.[i] > 0 || h.burnedViirs?.[i] > 0);
      if (covered.length < shared.burnMonths.length) {
        const names = (list) => list.map(monthLabel).join(", ");
        const cover = covered.length ? `Burned-area maps cover ${names(covered)}` : `No burned-area map covers ${names(shared.burnMonths)} yet`;
        warnings.push(`${cover}; the rest is counted from fire detections and Sentinel-2 alone and may be low, mainly on dormant or grazed land.`);
        mayBeLow.add("burn-map-pending");
      }
      if (!(h.s2Pre > 0 && h.s2Post > 0)) mayBeLow.add("no-dnbr");
      if (!(h.s2Pre > 0 && h.s2Post > 0)) warnings.push("No Sentinel-2 images just before and after the day the wildfire began, so severe burning (dNBR) is not measured: heavy damage is not counted, and only the burned-area maps count as hit.");
      if (hazardImages.nowPoints) {
        // With fire data but no fire within 300 km, every square reads 300
        // km (feasible 1): a real measurement, "no fire burning within 10
        // km", not a gap.
        conflictM = onFireGrid(hazardImages.nowPoints.distance(MAX_CONFLICT_M)).unmask(MAX_CONFLICT_M).rename("conflictM");
        accessSource = "fire-now";
      } else {
        accessSource = "disaster-none";
        warnings.push(`No fire data for the last ${WILDFIRE.nowDays} days of ${monthName}, so Feasibility (distance to a fire burning now) is not measured.`);
      }
    } else {
      accessSource = "none";
      warnings.push(`Feasibility is not measured for a ${noun}: satellites do not show what stops fieldwork after it. Nothing is set aside; this does not prove the land can be worked.`);
    }
  } else if (acled.points.length) {
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
    // A natural disaster's own bands (hit, grassland, grassHit, wetNow).
    const disasterBands = [];
    if (disaster) {
      // Its damage follows its type (method.js DISASTER_*): hit and heavy
      // on cropland. The war's radar is read only for a storm, earthquake,
      // landslide or other disaster, whose rule needs it.
      radarDb = emptyBand(ee, "radarDb");
      heavy = emptyBand(ee, "heavy");
      let hit = emptyBand(ee, "hit");
      const say = (text) => {
        if (!warnings.includes(text)) warnings.push(text);
      };
      if (shared.beforeWar) {
        // Said once (beforeDisasterWarning): nothing is counted.
      } else if (hazardImages) {
        // A flood or a wildfire: its images need no growing season.
        hit = onHazard(hazardImages.hit).updateMask(cropland).rename("hit");
        heavy = onHazard(hazardImages.heavy).updateMask(cropland).rename("heavy");
        const grassland = grasslandImage(ee);
        disasterBands.push(grassland, onHazard(hazardImages.hit).updateMask(grassland).rename("grassHit"));
        // The land under water now stays on the hazard grid (onFloodGrid).
        if (disaster.type === "flood") disasterBands.push(onHazardGrid(hazardImages.wetNow, scale).updateMask(cropland).rename("wetNow"));
        // Seen hit, but routine in those weeks (a paddy's water, a field
        // burned every year): not counted, and the run says how much.
        if (hazardImages.routine) disasterBands.push(onHazard(hazardImages.routine).updateMask(cropland).rename("routine"));
      } else if (disaster.type === "drought") {
        const lossWindow = group.windows.lossWindow;
        const loss = lossWindow ? cropLossImage(ee, { region: group.region, window: lossWindow, baselines: group.windows.lossBaselines, have: g, cropland }) : null;
        const lossLabel = lossWindow ? windowLabel({ from: lossWindow.start.slice(0, 7), to: shiftDays(lossWindow.end, -1).slice(0, 7) }) : null;
        if (loss) {
          hit = loss.hit.updateMask(cropland).rename("hit");
          heavy = loss.heavy.updateMask(cropland).rename("heavy");
          if (loss.viirs) say(`MODIS greenness (MOD13Q1) has no image for ${lossLabel}; VIIRS greenness (VNP13A1, 500 m, not yet checked against a real drought) was used instead.`);
        } else {
          say(lossWindow ? `No MODIS or VIIRS greenness images for ${lossLabel} and the same weeks of ${BASELINE_FROM}-${BASELINE_YEAR}; the drought's crop loss could not be measured there.` : noLossSeasonWarning(disaster.since));
          for (const cell of group.cells) unmeasured.set(cell.id, lossWindow ? "no-images" : "season-incomplete");
        }
      } else {
        // A storm, earthquake, landslide or other disaster: greenness loss
        // AND radar change in the growing season that contains its day
        // (radarSeasons[0], once complete), two sensors that must agree.
        const first = radarSeasons[0];
        const optical = g.disaster?.s2First > 0 && g.disaster?.s2FirstBase > 0;
        say(GROUND_PROVISIONAL(noun));
        if (first && seasonPass && measuredSeasons[0] === first && optical) {
          const before = mergedSentinel1(ee, group.region, group.windows.radarSeasonBaselines, seasonPass).median();
          const radar = seasonRadarImages(ee, { region: group.region, seasons: measuredSeasons, before, pass: seasonPass });
          radarDb = radar.level.updateMask(cropland).rename("radarDb");
          const green = greenLossImage(ee, { region: group.region, window: first, baselines: baselineWindows(first, BASELINE_YEARS) });
          hit = green.and(radar.first.gte(GROUND.hitRadarDb)).updateMask(cropland).rename("hit");
          heavy = green.and(radar.first.gte(GROUND.heavyRadarDb)).updateMask(cropland).rename("heavy");
        } else if (!first) {
          say(`No growing season since the ${noun} began on ${disaster.since} is complete yet; its damage could not be measured yet.`);
          for (const cell of group.cells) unmeasured.set(cell.id, "season-incomplete");
        } else {
          const seasonText = windowLabel({ from: first.start.slice(0, 7), to: shiftDays(first.end, -1).slice(0, 7) });
          say(`No ${optical ? "Sentinel-1 radar images from one orbit direction" : "usable Sentinel-2 images"} for both ${seasonText} and the same season of ${BASELINE_FROM}-${BASELINE_YEAR}; the ${noun}'s damage could not be measured there.`);
          for (const cell of group.cells) unmeasured.set(cell.id, "no-images");
        }
      }
      disasterBands.unshift(hit);
    } else if (seasonPass && measuredSeasons.length) {
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
        ...disasterBands,
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
  // Squares whose disaster damage was not measured: no hit and no heavy
  // share (runs.js keeps them null, so they read "not measured", never 0).
  for (const reading of readings) {
    if (!unmeasured.has(reading.id)) continue;
    reading.hitShare = null;
    reading.heavyShare = null;
  }
  // A flood's or a wildfire's cropland that is routinely under water or
  // burned in those weeks: not counted, and said when it is 1% or more of
  // the cropland.
  if (hazardImages?.routine) {
    const latOf = new Map(cells.map((cell) => [cell.id, cell.lat]));
    const cropHaOf = (reading) => cellAreaKm2(cellSizeDeg, latOf.get(reading.id) ?? midLat) * 100 * numberOr(reading.croplandShare, 0);
    const routineHa = readings.reduce((sum, reading) => sum + cropHaOf(reading) * numberOr(reading.routineShare, 0), 0);
    const cropHa = readings.reduce((sum, reading) => sum + cropHaOf(reading), 0);
    if (cropHa > 0 && routineHa >= 0.01 * cropHa) warnings.push(routineWarning(disaster.type, routineHa, routineHa / cropHa));
    for (const reading of readings) delete reading.routineShare;
  }
  // (A disaster's damage does not use the war's fire and radar.)
  if (!disaster && noRadar > 0 && noRadar < cells.length) {
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
  // A flood's or a wildfire's images are those of its hazard window, and a
  // drought's those of its crop season (disasterImagery).
  const imagery = disaster ? disasterImagery(disaster, shared, groups, { cellCount: cells.length, unmeasured }) || imageryOf(seasonUsed, cells.length) : imageryOf(seasonUsed, cells.length);
  if (!disaster) return { readings, alerts, warnings, baseline: GEE_BASELINE, conflict, imagery, accessSource };
  const reasons = [...new Set(unmeasured.values())];
  const disasterDamage = {
    notMeasured: reasons.includes("season-incomplete") ? "season-incomplete" : reasons[0] || null,
    unmeasuredShare: cells.length ? Math.round((1000 * unmeasured.size) / cells.length) / 1000 : 0,
    mayBeLow: [...mayBeLow],
  };
  return { readings, alerts, warnings, baseline: GEE_BASELINE, conflict, imagery, accessSource, disasterDamage };
}

// "4 September 2023".
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayLabel = (day) => `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

// The imagery a natural disaster's run says it used ({ from, to, label }),
// or null to keep the seasons' (a month before the day):
//   flood, wildfire  "from 4 September 2023 to 30 September 2023 (within
//                    60 days of the day the flood began)"
//   drought          "of the crop season from 1 March 2026 to 30 June 2026
//                    (this season's crop loss)"; each season group's own
//                    window with its share of the area when they differ,
//                    and the share not measured yet
//   storm, earthquake, landslide, other  "of the growing season from 1
//                    April 2023 to 30 September 2023 (the season the ...
//                    hit)", the same way
//   nothing measured "none yet: <why>" (from = to = the month), never the
//                    war's radar seasons
// unmeasured: the cells whose damage was not measured (id -> reason).
export function disasterImagery(disaster, shared, groups = [], { cellCount = 0, unmeasured = new Map() } = {}) {
  if (shared.beforeWar) return null;
  const noun = DISASTER_NOUNS[disaster.type];
  const span = (window) => ({ from: window.start.slice(0, 7), to: shiftDays(window.end, -1).slice(0, 7) });
  if (shared.hazard && shared.hazard.end > shared.hazard.start) {
    const days = disaster.type === "flood" ? FLOOD.windowDays : WILDFIRE.windowDays;
    return { ...span(shared.hazard), label: `from ${dayLabel(shared.hazard.start)} to ${dayLabel(shiftDays(shared.hazard.end, -1))} (within ${days} days of the day the ${noun} began)` };
  }
  if (disaster.type === "flood" || disaster.type === "wildfire") return null;
  const drought = disaster.type === "drought";
  const total = cellCount || groups.reduce((sum, group) => sum + group.cells.length, 0);
  // The measured groups' windows, the same window once with its cells.
  const byWindow = new Map();
  for (const group of groups) {
    const window = drought ? group.windows?.lossWindow : group.windows?.radarSeasons?.[0];
    const cellsMeasured = group.cells.filter((cell) => !unmeasured.has(cell.id)).length;
    if (!window || !cellsMeasured) continue;
    const key = `${window.start}/${window.end}`;
    byWindow.set(key, { window, cells: (byWindow.get(key)?.cells || 0) + cellsMeasured });
  }
  const month = shared.month.start.slice(0, 7);
  const why = drought ? `no crop season since ${dayLabel(disaster.since)} has run long enough to measure` : `the growing season that contains ${dayLabel(disaster.since)} is not complete yet`;
  if (!byWindow.size) return { from: month, to: month, label: `none yet: ${unmeasured.size && [...unmeasured.values()].every((reason) => reason === "no-images") ? "no usable images" : why}` };
  const pct = (cells) => `${Math.round((100 * cells) / Math.max(1, total))}% of the area`;
  const list = [...byWindow.values()].sort((a, b) => b.cells - a.cells);
  const part = ({ window, cells }) => `from ${dayLabel(window.start)} to ${dayLabel(shiftDays(window.end, -1))}${list.length > 1 || unmeasured.size ? ` (${pct(cells)})` : ""}`;
  const what = drought ? "crop season" : "growing season";
  const tail = drought ? "this season's crop loss" : `the season the ${noun} hit`;
  const notYet = unmeasured.size ? `; not measured yet on ${pct(unmeasured.size)}` : "";
  const from = list.map((entry) => entry.window.start).sort()[0];
  const to = list.map((entry) => shiftDays(entry.window.end, -1)).sort().at(-1);
  return { from: from.slice(0, 7), to: to.slice(0, 7), label: `of the ${what}${list.length > 1 ? "s" : ""} ${list.map(part).join(" and ")} (${tail})${notYet}` };
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
  // first: the change in the oldest season alone (a storm, earthquake or
  // landslide: the season it hit), masked where it was not measured.
  const first = changes[0].updateMask(changes[0].gte(0));
  return { persistent: persistent.updateMask(measured), peak: peak.updateMask(measured), level: level.updateMask(measured), first };
}

// ---------- Natural disasters (src/lib/atlas/method.js isDisaster) ----------

// What every storm, earthquake, landslide or other disaster run says: the
// rule is provisional. (Real data, 2026-10-25, scripts/disaster-check.js:
// the Romagna landslides of May 2023 read 5.9% of the cropland hit against
// 4.7% in the Bologna hills outside them, and an irrigated Emilia plain
// without a disaster 15.6%, from crop rotation.)
export const GROUND_PROVISIONAL = (noun) =>
  `Damage for a ${noun} is provisional: greenness loss with radar change also follows crop rotation (an irrigated plain with no disaster read 15.6% of its cropland as hit in a check), so treat it as a pointer to where to look, not a measurement.`;
// What a flood run says when snow or frozen ground hid part of its window.
export const floodColdWarning = (days) =>
  `Snow or frozen ground (ERA5-Land) on ${days} ${days === 1 ? "day" : "days"} of the flood window: radar looks on those days are not counted, because wet snow and frozen soil look like water to radar. Water under snow is seen only by clear Sentinel-2 images, so the flood may read low.`;
// What a flood or wildfire run says about the hit cropland it left out
// because it is under water, or burned, in those weeks of most normal years.
export function routineWarning(type, ha, share) {
  const amount = `${Math.round(ha).toLocaleString("en-US")} ha (${Math.round(share * 1000) / 10}% of the cropland)`;
  return type === "wildfire"
    ? `${amount} burned where fields burn in the same weeks of most years 2019-2021 (such as crop-residue burning) and is not counted: only burning clearly above those years counts.`
    : `${amount} seen under water is under water in the same weeks of most years 2019-2021 (such as rice paddies), and the radar saw it no deeper than its normal water, so it is not counted: flood damage there cannot be told apart from its normal water.`;
}
// Pure image builders: nothing is computed until a request. Every image
// they use was counted first (preflight disasterCounts, seasonPreflight),
// so an empty collection never reaches a formula (real data, 2026-10-25:
// "Image.lt: If one image has no bands" on a 3-day Sentinel-2 window).

const DAY_MS = 86400000;
const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);

// The per-pixel hazard tests on the HAZARD_GRID_M grid, unmasked to 0
// first, whatever the pixels the cells are reduced with (scale, m; kept as
// an argument for the callers). (Real data, Thessaly 2023, probe d4: -20%
// of the flood without the grid at a 200 m reduce, -9% with it, the same
// at 1 km. And on finer reduces the flood's normal-year water, on the same
// grid, must sample the same points as its hit: real data, 2026-10-25,
// the Punjab July control read 8% at a 50 m reduce against 5% on the grid.)
export function onHazardGrid(image, scale) {
  return image.unmask(0).reproject({ crs: "EPSG:4326", scale: HAZARD_GRID_M });
}
// A flood's hit and heavy: on the hazard grid when the cells are reduced
// with coarser pixels, otherwise on the reduce's own pixels (its
// normal-year masks are on the grid, grown by FLOOD.normalGrowM so a
// field's edge cannot slip out of them). (Real data, 2026-10-25: the
// Punjab flood of August 2025 and the Iowa flood of June 2024 read 7 to
// 8% less on the grid, at 47 and 41 m reduces.) Its land under water now stays on
// the grid (onHazardGrid): on finer pixels, ponds after rain in an Iowa
// spring without a flood read 693 ha under water against 279 ha.
export function onFloodGrid(image, scale) {
  return scale > HAZARD_GRID_M ? onHazardGrid(image, scale) : image.unmask(0);
}

// Snow or frozen topsoil (ERA5-Land daily: snow cover above
// FLOOD.snowCoverPct, or the top 7 cm of soil at or below FLOOD.frozenC)
// as 0/1, on one ERA5-Land image.
function coldOf(weather) {
  return weather.select(BANDS.snowCover).gt(FLOOD.snowCoverPct).or(weather.select(BANDS.soilTemp).lte(273.15 + FLOOD.frozenC)).unmask(0);
}
// The snow or frost of a radar look's day, from ERA5-Land over some
// windows (a few months: the lookup stays small); a day ERA5-Land does not
// have yet (it is about two weeks behind) takes `fallback`, the mean of
// the same days in 2019-2021. Wet snow and frozen soil darken the radar
// like water. (Real data, 2026-10-25: a flood setting in Iowa from 1
// February 2025, with no flood, read 26% of the cropland under water in
// March.)
function coldLookup(ee, windows, fallback) {
  const era = windows.map((w) => ee.ImageCollection(DATASETS.era5Daily).filterDate(w.start, w.end).select([BANDS.snowCover, BANDS.soilTemp])).reduce((all, next) => all.merge(next));
  return (date) => {
    const day = ee.Date(ee.Date(date).format("YYYY-MM-dd"));
    return coldOf(ee.Image(era.filterDate(day, day.advance(1, "day")).merge(ee.ImageCollection([fallback])).first()));
  };
}
// How many days of a window had snow or frozen topsoil on a tenth or more
// of the region (ERA5-Land), for the run's words.
function coldDays(ee, region, window) {
  return ee
    .ImageCollection(DATASETS.era5Daily)
    .filterDate(window.start, window.end)
    .select([BANDS.snowCover, BANDS.soilTemp])
    .map((image) => {
      const cold = coldOf(image).rename("cold");
      return image.set("cold", cold.reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 11132, bestEffort: true }).get("cold"));
    })
    .filter(ee.Filter.gte("cold", 0.1))
    .size();
}

// A flood (method.js FLOOD), all 0/1 images on any land, unmasked:
//   hit          normally dry land seen under water at any look in the
//                hazard window: Sentinel-1 VV (any orbit) smoothed over 50
//                m below -18 dB AND 3 dB or more below its median in the
//                same days of 2019-2021, on a day without snow or frozen
//                topsoil (ERA5-Land); or clear Sentinel-2 with MNDWI (B3,
//                B11) > 0 and NDWI (B3, B8) > -0.1
//   heavy        hit, with its first and last wet look 4 days or more apart
//   wetNow       normally dry land under water at its latest look in the
//                last 12 days of the month (Sentinel-1 and -2 together,
//                newest on top), radar against the same 12 days' normal;
//                where the radar had a look there in those days, optical
//                water counts only if the radar saw water too
//   normallyDry  JRC water seasonality under 10 months, not water in the
//                same calendar months of 2 or more of 2019-2021 (JRC
//                monthly history), less than 15 m above the nearest
//                drainage (MERIT HAND), and not "normally wet": under water
//                at some look of the same days (+-30) in 2 or more of the 3
//                normal years, grown by 150 m: lakes, rivers, high ground
//                and land under water in most years in those weeks (rice
//                paddies, wetlands) are left out. The hit land's guard
//                uses the whole 60-day window (the same in every month),
//                the land under water now that of the month's days.
//                Normally wet land still counts as hit where a radar look
//                of the window is 8 dB or more darker than the median of
//                the same orbit within 15 days of that day of the year in
//                2019-2021 (deeper than its normal water: a flood over a
//                paddy)
//   routine      (hit's guard) land seen under water in the window that is
//                left out only because it is normally wet: what the run
//                says it could not count
// The Sentinel-1 or -2 arm is left out when it has no image (have.hazard),
// and the normal-year radar tests when 2019-2021 have no radar there.
// Every image is unmasked and on no grid of its own: the caller puts the
// hit and heavy on the reduce's pixels or the hazard grid (onFloodGrid),
// the water now on the grid; the normal-year masks are on the 100 m
// hazard grid.
export function floodImages(ee, { region, windows, have }) {
  const h = have.hazard || {};
  const zero = ee.Image.constant(0);
  const masked = ee.Image.constant(0).updateMask(ee.Image.constant(0)).toFloat();
  const ORBIT = "relativeOrbitNumber_start";
  const sinceMs = dayMs(windows.disaster.since);
  const seasonal = ee.Image(DATASETS.jrcWater).select(BANDS.jrcSeasonality).unmask(0).lt(FLOOD.permanentMonths);
  // JRC water in the same calendar months of at least FLOOD.normalJrcYears
  // of the normal years (one year's flood, such as 2019's, does not make
  // land normally wet).
  const jrcWater = ([m1, m2]) =>
    h.jrcMonthly > 0
      ? BASELINE_YEARS.map((year) =>
          ee
            .ImageCollection(DATASETS.jrcMonthly)
            .filter(ee.Filter.calendarRange(year, year, "year"))
            .filter(ee.Filter.calendarRange(m1, m2, "month"))
            .map((image) => image.eq(2))
            .merge(ee.ImageCollection([zero.rename("water")]))
            .max()
            .unmask(0),
        )
          .reduce((all, next) => all.add(next))
          .gte(FLOOD.normalJrcYears)
      : zero;
  const low = ee.Image(DATASETS.hand).select(BANDS.hand).unmask(0).lt(FLOOD.handM);
  const vv = (image) => image.focal_mean(FLOOD.smoothM, "circle", "meters");
  // The normal years' masks on the hazard grid (they are smooth; at the
  // reduce's finer pixels they cost too much: real data, 2026-10-25, the
  // Thessaly box at 43 m failed with "too much work").
  const onGrid = (image) => image.reproject({ crs: "EPSG:4326", scale: HAZARD_GRID_M });
  const widen = (w, days) => ({ start: shiftDays(w.start, -days), end: shiftDays(w.end, days) });
  const pad = (w) => widen(w, FLOOD.normalPadDays);
  // Radar looks on a snowy or frozen day are dropped, only when some day
  // of the windows or their normal years was cold (preflight coldDays,
  // coldNowDays, coldNormalDays): a summer flood skips the lookup.
  const anyCold = h.coldDays + h.coldNowDays + h.coldNormalDays > 0;
  const warmer = (list) => {
    if (!anyCold || !list.length) return (image) => image;
    const era = ee.ImageCollection(DATASETS.era5Daily).select([BANDS.snowCover, BANDS.soilTemp]);
    const fallbackWindows = list.map((w) => baselineWindows(w, BASELINE_YEARS)).flat();
    const fallback = fallbackWindows.map((w) => era.filterDate(w.start, w.end)).reduce((all, next) => all.merge(next)).mean();
    const cold = coldLookup(ee, list, fallback);
    // image: what is masked; look: the radar image it comes from (its day).
    return (image, look) => image.updateMask(cold(look.get("system:time_start")).not());
  };
  const opticalWet = (image) => {
    const clear = maskSentinel2Clouds(image);
    return clear.normalizedDifference(["B3", "B11"]).gt(FLOOD.mndwi).and(clear.normalizedDifference(["B3", "B8"]).gt(FLOOD.ndwi));
  };
  const dayOfYear = (image) => ee.Date(image.get("system:time_start")).getRelative("day", "year");
  // The normal years over some days (one window per year):
  //   median       the radar's median for a look: the normal years' looks
  //                from the SAME relative orbit (one track sees a field at
  //                another angle than the next, a few dB darker or
  //                brighter: real data, 2026-10-25, Iowa March 2025, the
  //                00:22 UTC track read 6% of the cropland below -18 dB on
  //                a dry, thawed day, the 00:14 one 0%); masked when that
  //                orbit has no such look. Null without radar then
  //   nearMedian   the same, only the looks within FLOOD.deepNearDays of the
  //                look's day of the year: the field's normal state at
  //                that time (a paddy's water, or its grown crop)
  //   recurring    the land under water at some look (radar or optical,
  //                the same tests) in FLOOD.normalWetYears or more of the
  //                years, grown by FLOOD.normalGrowM. Null without any image
  //                then. (Real data, 2026-10-25: a flood setting from 1
  //                July 2024 in the Punjab box, with no major flood, read
  //                28% of the cropland flooded, almost all of it paddies
  //                seen wet by Sentinel-2; 6% with the mask not grown.)
  const normalWater = (bases, s1Count, s2Count) => {
    if (!bases?.length || !(s1Count > 0 || s2Count > 0)) return null;
    const blank = ee.Image.constant(0).toByte().rename("wet");
    // Wider by FLOOD.normalPadDays on each side for the recurring water:
    // paddies are planted a few weeks earlier or later from year to year.
    const warm = warmer(bases.map(pad));
    const level = (window) => sentinel1(ee, region, window).map((image) => ee.Image(warm(vv(image).updateMask(image.mask()), image).copyProperties(image, [ORBIT])).set("doy", dayOfYear(image)));
    const none = masked.rename(BANDS.sentinel1);
    const medianOf = (collection) => onGrid(collection.merge(ee.ImageCollection([none])).median());
    let median = null;
    let nearMedian = null;
    if (s1Count > 0) {
      const all = bases.map(level).reduce((every, next) => every.merge(next));
      median = (look) => medianOf(all.filter(ee.Filter.eq(ORBIT, look.get(ORBIT))));
      const k = FLOOD.deepNearDays;
      const near = bases.map((w) => level(widen(w, k))).reduce((every, next) => every.merge(next));
      nearMedian = (look) => {
        const d = ee.Number(dayOfYear(look));
        // Within k days of the look's day of the year, across the new year too.
        const around = (shift) => ee.Filter.and(ee.Filter.gte("doy", d.subtract(k).add(shift)), ee.Filter.lte("doy", d.add(k).add(shift)));
        return medianOf(near.filter(ee.Filter.eq(ORBIT, look.get(ORBIT))).filter(ee.Filter.or(around(0), around(365), around(-365))));
      };
    }
    const wetYears = bases
      .map((w) => {
        const parts = [
          ...(s1Count > 0 ? [sentinel1(ee, region, pad(w)).map((image) => warm(vv(image).lt(FLOOD.waterVvDb).updateMask(image.mask()), image).toByte().rename("wet"))] : []),
          ...(s2Count > 0 ? [sentinel2(ee, region, pad(w)).map((image) => opticalWet(image).toByte().rename("wet"))] : []),
        ];
        return parts.reduce((all, next) => all.merge(next)).merge(ee.ImageCollection([blank])).max().unmask(0);
      })
      .reduce((all, next) => all.add(next));
    const recurring = onGrid(onGrid(wetYears.gte(FLOOD.normalWetYears)).focal_max(FLOOD.normalGrowM, "circle", "meters"));
    return { median, nearMedian, recurring };
  };
  const guard = (months, normal) => {
    const base = seasonal.and(jrcWater(months).not()).and(low);
    return { base, dry: normal ? base.and(normal.recurring.not()) : base };
  };
  // One look: a 0/1 "wet" band (masked where the image has no data, or on
  // a snowy or frozen day for radar), the days since the disaster's day,
  // "deep" (radar: how much darker than the field's normal at that time
  // of the year, dB, where wet; masked for optical) and "radar" (1 where
  // a radar look has data, masked for optical).
  const look = (wet, image, { deep = masked, radar = masked } = {}) =>
    ee.Image(
      wet
        .rename("wet")
        .addBands(ee.Image.constant(ee.Number(image.get("system:time_start")).subtract(sinceMs).divide(DAY_MS)).float().rename("day"))
        .addBands(deep.toFloat().rename("deep"))
        .addBands(radar.toByte().rename("radar"))
        .copyProperties(image, ["system:time_start"]),
    );
  const radar = (window, normal) => {
    const warm = warmer([window]);
    return sentinel1(ee, region, window).map((image) => {
      const level = vv(image);
      // Where the normal years have no look without snow or frost (most of
      // a winter), there is nothing to compare with: the look is not
      // counted there (the median is masked, so is the test).
      const dark = normal?.median ? level.lt(FLOOD.waterVvDb).and(level.lt(normal.median(image).subtract(FLOOD.darkerDb))) : level.lt(FLOOD.waterVvDb);
      const wet = warm(dark.updateMask(image.mask()), image);
      const deep = normal?.nearMedian ? normal.nearMedian(image).subtract(level).updateMask(wet) : masked;
      return look(wet, image, { deep, radar: ee.Image.constant(1).updateMask(wet.mask()) });
    });
  };
  const optical = (window) => sentinel2(ee, region, window).map((image) => look(opticalWet(image), image));
  const looks = (window, s1Count, s2Count, normal) => {
    const parts = [...(s1Count > 0 ? [radar(window, normal)] : []), ...(s2Count > 0 ? [optical(window)] : [])];
    return parts.length ? parts.reduce((all, next) => all.merge(next)) : null;
  };
  const hitNormal = normalWater(windows.floodNormals, h.s1HazardBase, h.s2HazardBase);
  const hitGuard = guard(windows.hazardMonths || [1, 12], hitNormal);
  let hit = zero;
  let heavy = zero;
  let routine = zero;
  const during = looks(windows.hazard, h.s1Hazard, h.s2Hazard, hitNormal);
  if (during) {
    const wetDays = during.map((image) => image.select("day").updateMask(image.select("wet")));
    const first = wetDays.min();
    const last = wetDays.max();
    const seen = first.mask().unmask(0).gt(0);
    // Normally wet, but under water deeper than its normal at some radar
    // look: a flood over a paddy (FLOOD.deepDb).
    const deeper = hitNormal?.nearMedian ? during.select("deep").max().gte(FLOOD.deepDb).unmask(0) : zero;
    const wetNormally = hitNormal ? hitNormal.recurring.and(deeper.not()) : zero;
    const dry = hitGuard.base.and(wetNormally.not());
    hit = seen.and(dry);
    heavy = hit.and(last.subtract(first).unmask(0).gte(FLOOD.heavyDays));
    if (hitNormal) routine = seen.and(hitGuard.base).and(wetNormally);
  }
  let wetNow = zero;
  const nowMonth = windows.hazardNow ? Number(windows.hazardNow.start.slice(5, 7)) : null;
  const nowNormal = normalWater(windows.hazardNowNormals, h.s1NowBase, h.s2NowBase);
  const nowGuard = nowMonth ? guard([nowMonth, nowMonth], nowNormal) : hitGuard;
  const recent = looks(windows.hazardNow, h.s1Now, h.s2Now, nowNormal);
  if (recent) {
    wetNow = recent.sort("system:time_start").select("wet").mosaic().unmask(0).and(nowGuard.dry);
    // Where the radar looked in those days, optical water counts only if
    // the radar saw water too (darker than normal, as for the hit).
    if (h.s1Now > 0) {
      const radarLooked = recent.select("radar").max().unmask(0);
      const radarWet = recent.map((image) => image.select("wet").updateMask(image.select("radar"))).max().unmask(0);
      wetNow = wetNow.and(radarLooked.not().or(radarWet));
    }
  }
  return { hit: hit.rename("hit"), heavy: heavy.rename("heavy"), wetNow: wetNow.rename("wetNow"), routine: routine.rename("routine"), normallyDry: hitGuard.dry };
}

// A wildfire (method.js WILDFIRE), 0/1 images on any land, unmasked:
//   hit        burned in the hazard window: a day of the month's MODIS or
//              VIIRS burned-area map (MCD64A1, VNP64A1; either is enough,
//              so the rule survives the end of MODIS) inside the window, OR
//              an unusual fire within 1 km (a FIRMS detection in the window
//              whose 5 km smoothed count is above the same days' in
//              2019-2021) with a Sentinel-2 dNBR of 0.27 or more (the median
//              NBR of the 30 days before the day minus that of the 30 days
//              from it). Plain dNBR is not enough: a Kansas wheat harvest
//              passes it on 21.9% of the cropland without any fire.
//              "Unusual" is a clear excess (method.js WILDFIRE): at least
//              twice the normal and 0.1 detections per km2 above it. On
//              cropland, a burned-area pixel counts only where the burned
//              share of the cropland within 5 km is at least twice that of
//              the same days in 2019-2021 and 5 points above it, so fields
//              burned every year (crop residue, stubble) are left out
//   heavy      hit with dNBR 0.27 or more (a severe loss of vegetation)
//   routine    cropland seen burned (or burned by dNBR next to a fire) that
//              is left out as routine burning: what the run says it left out
//   nowPoints  FIRMS detections of the last 7 days of the month (the area
//              padded by 10 km) as sample points (a fixed seed, as for
//              fighting), or null without fire data: Feasibility is the
//              distance to them
// Only the burned-area maps the preflight found are used, and the
// unusual-fire arm only with Sentinel-2 before and after the day.
// onFireGrid: the FIRMS images on the 1 km grid for small areas (fireImages).
export function burnImages(ee, { region, nowRegion = region, windows, have, onFireGrid = (image) => image, tileScale = 4 }) {
  const h = have.hazard || {};
  const zero = ee.Image.constant(0);
  const cropland = croplandImage(ee);
  const windowDays = daysBetween(windows.hazard.start, windows.hazard.end);
  const smooth = (image) => image.focal_mean(FIRE_SMOOTH_M, "circle", "meters");
  // A clear excess over the normal: excessTimes the normal and `margin` above it.
  const clearly = (now, normal, margin) => now.gte(normal.multiply(WILDFIRE.excessTimes)).and(now.subtract(normal).gte(margin));
  // The burned-area maps over a window: BurnDate is the day of the year
  // (1-366) of the map's year; d = that day counted from the window's
  // first day. counts: the maps the preflight found (per month of the
  // window), or null for a normal year (a map that is not there reads as
  // not burned).
  const burnedIn = (window, counts) => {
    const startMs = dayMs(window.start);
    const days = daysBetween(window.start, window.end);
    let out = zero;
    const months = [];
    for (let m = window.start.slice(0, 7), guard = 0; m <= shiftDays(window.end, -1).slice(0, 7) && guard < 6; m = addMonths(m, 1), guard += 1) months.push(m);
    months.forEach((month, i) => {
      const offset = Math.round((dayMs(`${month.slice(0, 4)}-01-01`) - startMs) / DAY_MS) - 1;
      for (const [dataset, band, count] of [
        [DATASETS.burnedModis, BANDS.burnModis, counts ? counts.modis?.[i] : 1],
        [DATASETS.burnedViirs, BANDS.burnViirs, counts ? counts.viirs?.[i] : 1],
      ]) {
        if (!(count > 0)) continue;
        const maps = burnedArea(ee, dataset, band, region, month);
        const day = (counts ? maps : maps.merge(ee.ImageCollection([ee.Image.constant(0).toInt16().rename(band)]))).max();
        const d = day.add(offset);
        out = out.or(day.gt(0).and(d.gte(0)).and(d.lt(days)).unmask(0));
      }
    });
    return out;
  };
  const burned = burnedIn({ start: windows.disaster.since, end: windows.hazard.end }, { modis: h.burnedModis, viirs: h.burnedViirs });
  // On cropland, only burning clearly above the same days of 2019-2021.
  // (On a 500 m grid, the burned-area maps' own size, so the 5 km window
  // stays small.)
  const grid500 = (image) => image.reproject({ crs: "EPSG:4326", scale: 500 });
  const cropShare = (image) => smooth(grid500(image.updateMask(cropland).unmask(0))).divide(smooth(grid500(cropland.toFloat())).max(1e-6));
  const normals = windows.hazardNormals || [];
  const normalBurned = normals.length ? normals.map((w) => burnedIn(w, null).toFloat()).reduce((all, next) => all.add(next)).divide(normals.length) : zero;
  const burnedUnusual = clearly(cropShare(burned.toFloat()), cropShare(normalBurned), WILDFIRE.excessBurnShare);
  const burnedKept = burned.and(cropland.not().or(burnedUnusual));
  let hit = burnedKept;
  let heavy = zero;
  // Seen burned, but left out as routine burning (the run says how much).
  let routine = burned.and(burnedKept.not());
  if (h.s2Pre > 0 && h.s2Post > 0) {
    const nbr = (window) => sentinel2(ee, region, window).map((image) => maskSentinel2Clouds(image).normalizedDifference(["B8", "B12"]).rename("nbr")).median();
    const severe = nbr(windows.burnPre).subtract(nbr(windows.burnPost)).gte(WILDFIRE.severeDnbr).unmask(0);
    let ring = zero;
    let anyRing = zero;
    if (h.firmsHazard > 0) {
      const grid = (image) => image.setDefaultProjection("EPSG:4326", null, 1000);
      const count = (window) => grid(firms(ee, region, window).count().unmask(0));
      const now = count(windows.hazard);
      const normal =
        h.firmsHazardBase > 0
          ? grid(windows.hazardNormals.map((w) => firms(ee, region, w)).reduce((all, next) => all.merge(next)).count().unmask(0)).divide(windows.hazardNormals.length)
          : zero;
      const near = (image) => onFireGrid(onFireGrid(image).focal_max(WILDFIRE.nearM, "circle", "meters"), RING_GRID_M).unmask(0);
      const unusual = now.gt(0).and(onFireGrid(clearly(smooth(now), smooth(normal), WILDFIRE.excessPerKm2)));
      ring = near(unusual);
      anyRing = near(now.gt(0));
    }
    hit = burnedKept.or(ring.and(severe));
    heavy = hit.and(severe);
    routine = burned.or(anyRing.and(severe)).and(hit.not());
  }
  routine = routine.and(cropland);
  let nowPoints = null;
  if (h.firmsNow > 0) {
    const fire = firms(ee, nowRegion, windows.hazardNow).count().unmask(0).gt(0).selfMask().setDefaultProjection("EPSG:4326", null, 1000).rename("fire");
    nowPoints = fire.stratifiedSample({ numPoints: 3000, classBand: "fire", region: nowRegion, scale: 1000, seed: 0, geometries: true, tileScale });
  }
  return { hit: hit.rename("hit"), heavy: heavy.rename("heavy"), routine: routine.rename("routine"), nowPoints };
}

// A drought (method.js DROUGHT): crop greenness in the loss window
// (windows.lossWindow) against the same span of 2019-2021, from MODIS
// MOD13Q1 NDVI (250 m, 16-day composites). Each composite is masked to
// cropland and smoothed over 1.5 km, so field-by-field rotation (wheat and
// fallow) cancels out, and is paired with the same composite (the same day
// of the year) of each normal year. A composite counts only where its
// normal NDVI is 0.3 or more (and it exists in both): dormant weeks, when
// bare fields read alike every year, would otherwise dilute the loss. (Real
// data, 2026-10-25: the Nebraska Panhandle drought, March to June 2026,
// 24% of the cropland hit with the 0.3 floor on the window's mean, 70% with
// it per composite, against 74% over 15 April to 15 June; the 2025 control
// 3% and 8%.) loss = 1 - the kept composites' NDVI / their normal, read at
// each month's end of the season so far (lossCuts) and kept at its worst. VIIRS
// VNP13A1 (500 m) is used only when MOD13Q1 has no image there ({ viirs:
// true }), on the window's means. Gives back { hit, heavy, viirs } (loss
// 20% / 35% or more), masked where it was not measured, or null when
// neither dataset has images.
export const MODIS_COMPOSITE_DAYS = 16;
export function compositeDays(window) {
  const out = [];
  const firstYear = Number(window.start.slice(0, 4));
  const lastYear = Number(shiftDays(window.end, -1).slice(0, 4));
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (let doy = 1; doy <= 366; doy += MODIS_COMPOSITE_DAYS) {
      const day = shiftDays(`${year}-01-01`, doy - 1);
      if (day >= window.start && day < window.end) out.push({ year, doy, day });
    }
  }
  return out;
}
// The ends (not included) at which a drought season is read: each month's
// end from DROUGHT.worstFromDays (90) after the season's start, and the
// window's own end. The loss kept is the worst of those readings, so a
// crop lost in May still reads lost in September: the later, normal
// weeks of the same season (summer crops after a failed wheat) would
// otherwise dilute it. (Real data, 2026-10-25: the Nebraska Panhandle
// drought read 70% of the cropland hit in June 2026 and 11% in September
// over the whole season to date.) It changes only when a new season starts.
// Not from 60 days: the short early readings are noisy (real data,
// 2026-10-25: from 60 days the Nebraska 2025 control, no drought, read 26%
// of its cropland hit).
export function lossCuts(window) {
  const first = shiftDays(window.start, DROUGHT.worstFromDays);
  const out = [];
  for (let m = addMonths(first.slice(0, 7), first.endsWith("-01") ? 0 : 1), guard = 0; `${m}-01` < window.end && guard < 24; m = addMonths(m, 1), guard += 1) out.push(`${m}-01`);
  out.push(window.end);
  return out;
}
export function cropLossImage(ee, { region, window, baselines, have, cropland }) {
  const g = have.disaster || {};
  const modis = g.ndviLoss > 0 && g.ndviLossBase > 0;
  const viirs = !modis && g.ndviViirsLoss > 0 && g.ndviViirsLossBase > 0;
  if (!modis && !viirs) return null;
  const dataset = modis ? DATASETS.ndvi250 : DATASETS.ndviViirs;
  const gridM = modis ? 250 : 500;
  // As float, so a day's images and its masked placeholder merge.
  const scaled = (collection) => collection.select(BANDS.ndvi).map((image) => image.multiply(0.0001).updateMask(image.gt(-2000)).toFloat());
  const ndvi = (w) => scaled(ee.ImageCollection(dataset).filterBounds(region).filterDate(w.start, w.end));
  const grid = (image) => image.reproject({ crs: "EPSG:4326", scale: gridM });
  const smooth = (image) => grid(grid(image).updateMask(cropland).focal_mean(DROUGHT.smoothM, "circle", "meters"));
  const lossFrom = (now, normal) => ee.Image(1).subtract(now.divide(normal));
  let loss;
  if (modis) {
    // One composite (or none: then masked, never an empty collection in a
    // formula) of a day, as a masked placeholder plus the day's images.
    const blank = ee.Image.constant(0).updateMask(ee.Image.constant(0)).rename(BANDS.ndvi).toFloat();
    const composite = (day) => scaled(ee.ImageCollection(dataset).filterBounds(region).filterDate(day, shiftDays(day, 1))).merge(ee.ImageCollection([blank])).mean();
    const shifts = baselines.map((b) => Number(b.start.slice(0, 4)) - Number(window.start.slice(0, 4)));
    let nowSum = null;
    let normalSum = null;
    // The season's reading at each month's end (lossCuts), and its worst.
    const readings = [];
    const cuts = lossCuts(window);
    const days = compositeDays(window);
    days.forEach(({ year, doy, day }, i) => {
      const now = smooth(composite(shiftDays(`${year}-01-01`, doy - 1)));
      const normal = smooth(ee.ImageCollection(shifts.map((shift) => composite(shiftDays(`${year + shift}-01-01`, doy - 1)))).mean());
      const keep = normal.gte(DROUGHT.minBaseNdvi).and(now.gte(-1)).unmask(0);
      const nowKept = now.updateMask(keep).unmask(0);
      const normalKept = normal.updateMask(keep).unmask(0);
      nowSum = nowSum ? nowSum.add(nowKept) : nowKept;
      normalSum = normalSum ? normalSum.add(normalKept) : normalKept;
      // The last composite before a cut: the reading as of that month's end.
      const next = days[i + 1]?.day;
      if (cuts.some((cut) => day < cut && !(next < cut))) readings.push(lossFrom(nowSum, normalSum).updateMask(normalSum.gt(0)).rename("loss"));
    });
    if (!nowSum) return null;
    if (!readings.length) readings.push(lossFrom(nowSum, normalSum).updateMask(normalSum.gt(0)).rename("loss"));
    loss = readings.length === 1 ? readings[0] : ee.ImageCollection(readings).max();
  } else {
    const now = smooth(ndvi(window).mean());
    const normal = smooth(baselines.map(ndvi).reduce((all, next) => all.merge(next)).mean());
    loss = lossFrom(now, normal).updateMask(normal.gte(DROUGHT.minBaseNdvi));
  }
  return { hit: loss.gte(DROUGHT.hitLoss).rename("hit"), heavy: loss.gte(DROUGHT.heavyLoss).rename("heavy"), viirs };
}

// Greenness loss in one season (a storm, earthquake, landslide or other
// disaster: method.js GROUND): the cloud-masked median Sentinel-2 NDVI of
// the season against that of the same season in 2019-2021; 1 where it is
// 20% or more below a normal of 0.3 or more, 0 elsewhere, masked where the
// normal is below 0.3.
export function greenLossImage(ee, { region, window, baselines }) {
  const ndvi = (w) => sentinel2(ee, region, w).map((image) => maskSentinel2Clouds(image).normalizedDifference(["B8", "B4"]).rename("ndvi"));
  const now = ndvi(window).median();
  const normal = baselines.map(ndvi).reduce((all, next) => all.merge(next)).median();
  return ee.Image(1).subtract(now.divide(normal)).updateMask(normal.gte(GROUND.minBaseNdvi)).gte(GROUND.greenLoss);
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
  // A natural disaster's own images, per group: a drought's greenness in
  // its loss window and the same span of 2019-2021 (MOD13Q1; VNP13A1 too,
  // used only when MOD13Q1 has none), and for a storm, earthquake,
  // landslide or other disaster Sentinel-2 in the season it hit
  // (radarSeasons[0], which contains its day) and that season of 2019-2021.
  const type = windows.disaster?.type;
  if (type === "drought" && windows.lossWindow) {
    const ndvi = (dataset, list) => list.map((w) => ee.ImageCollection(dataset).filterBounds(region).filterDate(w.start, w.end)).reduce((all, next) => all.merge(next)).size();
    counts.ndviLoss = ndvi(DATASETS.ndvi250, [windows.lossWindow]);
    counts.ndviLossBase = ndvi(DATASETS.ndvi250, windows.lossBaselines);
    counts.ndviViirsLoss = ndvi(DATASETS.ndviViirs, [windows.lossWindow]);
    counts.ndviViirsLossBase = ndvi(DATASETS.ndviViirs, windows.lossBaselines);
  }
  if ((type === "ground" || type === "other") && seasons.length) {
    counts.s2First = sentinel2(ee, region, seasons[0]).size();
    counts.s2FirstBase = baselineWindows(seasons[0], BASELINE_YEARS).map((w) => sentinel2(ee, region, w)).reduce((all, next) => all.merge(next)).size();
  }
  const raw = (await countImages(ee, counts, { what: "Checking which satellite images exist for the season", context })) || {};
  const count = (key) => Math.max(0, numberOr(raw[key], 0));
  const disaster = type ? Object.fromEntries(["ndviLoss", "ndviLossBase", "ndviViirsLoss", "ndviViirsLossBase", "s2First", "s2FirstBase"].map((key) => [key, count(key)])) : null;
  const each = (seasons.length ? seasons : [windows.season]).map((_, j) => Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`s1Season${j}_${pass}`)])));
  return {
    s2Current: count("s2Current"),
    s2Baseline: count("s2Baseline"),
    s1Season: Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, each.reduce((sum, e) => sum + e[pass], 0)])),
    s1SeasonEach: seasons.length ? each : [],
    s1SeasonBase: Object.fromEntries(ORBIT_PASSES.map((pass) => [pass, count(`s1SeasonBase_${pass}`)])),
    ...(disaster ? { disaster } : {}),
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
  // A natural disaster counts the whole season that contains its day too
  // (season.js damageSeasons containing).
  const disaster = isDisaster(war) ? war : null;
  const radarSeasons = !damage ? [] : Array.isArray(givenSeasons) ? givenSeasons.map((w) => ({ start: w.start, end: w.end })) : damageSeasons(Number.isFinite(lat) ? lat : 50, asOf, damage.start, peakMonth, { containing: Boolean(disaster) });
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
    ...(disaster ? disasterWindows(disaster, { own, damage, asOf, lat, peakMonth, stop }) : {}),
  };
}

// The windows of a natural disaster's month (monthWindows, a disaster
// only: a war's windows get none of these keys). All null or empty for a
// month that ends before the disaster began (no damage window).
//   hazard        flood and wildfire: from the day to 60 days after it, cut
//                 at the month's end (method.js FLOOD.windowDays, WILDFIRE);
//                 every month after the 60 days reads the same window
//   hazardNow     the last 12 (flood) or 7 (wildfire) days of the month,
//                 never before the day: what is under water, or burning, now
//   hazardNormals the hazard's days in each normal year 2019-2021 (unusual
//                 fire; baselineWindows, so they never reach into 2022)
//   floodNormals  the WHOLE hazard window (60 days from the day, not cut at
//                 the month's end) in each normal year, and
//   hazardNowNormals  the hazardNow days in each normal year: a flood's
//                 normal radar and its recurring water (floodImages), the
//                 same in every month for the hit land
//   hazardMonths  the first and last calendar month (1-12) of the WHOLE
//                 hazard window (60 days from the day, not cut at the
//                 month's end), for the JRC monthly water guard: the guard is
//                 the same in every month, so the hit land cannot shrink
//                 when the window grows (real data, 2026-10-25: Iowa's flood
//                 read 5,408 ha in June and 5,240 ha in July 2024 when the
//                 guard followed the cut window)
//   burnMonths    the months ("YYYY-MM") the hazard spans: the monthly
//                 burned-area maps (MCD64A1, VNP64A1) of each
//   burnPre       the 30 days before the day; burnPost the 30 days from it,
//                 cut at the month's end (Sentinel-2 dNBR)
//   lossWindow    drought: the crop season running now (or just ended:
//                 season.js cropLossSeason), and lossBaselines the same span
//                 in 2019-2021; null when no season can be measured yet
//   disaster      the disaster ({ since, type, ... })
function disasterWindows(disaster, { own, damage, asOf, lat, peakMonth, stop }) {
  const out = { disaster, hazard: null, hazardNow: null, hazardNormals: [], floodNormals: [], hazardNowNormals: [], hazardMonths: null, burnMonths: [], burnPre: null, burnPost: null, lossWindow: null, lossBaselines: [] };
  if (!damage) return out;
  const since = disaster.since;
  const rules = disaster.type === "wildfire" ? WILDFIRE : disaster.type === "flood" ? FLOOD : null;
  if (rules) {
    const capped = (day) => (day < own.end ? day : own.end);
    out.hazard = stop({ start: since, end: capped(shiftDays(since, rules.windowDays)) });
    const nowStart = shiftDays(own.end, -rules.nowDays);
    out.hazardNow = stop({ start: nowStart > since ? nowStart : since, end: own.end });
    if (out.hazard.end > out.hazard.start) {
      out.hazardNormals = baselineWindows(out.hazard, BASELINE_YEARS);
      out.floodNormals = baselineWindows({ start: since, end: shiftDays(since, rules.windowDays) }, BASELINE_YEARS);
      if (out.hazardNow.end > out.hazardNow.start) out.hazardNowNormals = baselineWindows(out.hazardNow, BASELINE_YEARS);
      const lastDayOf = shiftDays(out.hazard.end, -1);
      out.hazardMonths = [Number(since.slice(5, 7)), Number(shiftDays(since, rules.windowDays - 1).slice(5, 7))];
      for (let m = since.slice(0, 7), guard = 0; m <= lastDayOf.slice(0, 7) && guard < 6; m = addMonths(m, 1), guard += 1) out.burnMonths.push(m);
    }
    out.burnPre = stop({ start: shiftDays(since, -WILDFIRE.preDays), end: since });
    out.burnPost = stop({ start: since, end: capped(shiftDays(since, WILDFIRE.postDays)) });
  }
  if (disaster.type === "drought") {
    const loss = cropLossSeason(Number.isFinite(lat) ? lat : 50, asOf, since, peakMonth, { minDays: DROUGHT.minSeasonDays });
    if (loss) {
      out.lossWindow = stop({ start: loss.start, end: loss.end });
      out.lossBaselines = baselineWindows({ start: loss.start, end: loss.end }, BASELINE_YEARS);
    }
  }
  return out;
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
  // A natural disaster's bands (analyzeMonth), only when they were read:
  // the share of the cell's cropland hit, its grassland share and the
  // share of that hit, and (a flood) the cropland share under water now.
  if (m.hit !== undefined) reading.hitShare = round(clamp01(numberOr(m.hit, 0)), 4);
  if (m.grassland !== undefined) reading.grassShare = round(clamp01(numberOr(m.grassland, 0)), 4);
  if (m.grassHit !== undefined) reading.grassHitShare = round(clamp01(numberOr(m.grassHit, 0)), 4);
  if (m.wetNow !== undefined) reading.wetNowShare = round(clamp01(numberOr(m.wetNow, 0)), 4);
  if (m.routine !== undefined) reading.routineShare = round(clamp01(numberOr(m.routine, 0)), 4);
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
