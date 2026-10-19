// WHAT THIS FILE DOES
// The SAMPLE data source for the Field product: believable readings for
// any field on Earth, so the whole Field product works before Earth Engine
// is connected. Every page labels these numbers "Sample data". With Earth
// Engine connected, field-gee.js gives the real readings in the same shape.
//
// How the numbers are made (repeatable: the same field on the same day
// always gives the same numbers):
//   - each crop has a growing season (sowing, green-up, peak, drying down,
//     harvest; winter wheat is sown again in autumn), shifted a little per
//     field and per year
//   - a Sentinel-2 pass every 5 days with clouds by season; only passes
//     with at least half the field clear count (method.js MIN_CLEAR_SHARE)
//   - "normal" = the same weeks of 2019, 2020 and 2021
//   - inside the field, smooth patches of stronger and weaker plants and
//     0-2 stress patches; every 10 m-ish cell is scored with method.js
//   - war damage: shell-impact clusters scattered near the real eastern
//     front in Ukraine (the same line as the Atlas sample, providers/sample.js),
//     thicker the closer to the front. Fields hit are cratered (radar
//     change), burned (fire detections) and left unsown. Outside Ukraine
//     there is no front and no damage.
//
//   fieldSampleProvider.detectFields({ boundary, center, radiusM })
//   fieldSampleProvider.analyzeFields({ fields, today })
//   fieldSampleProvider.fieldHistory({ field, from, to })
//
// WHO EDITS IT
// Nobody, normally. It is only a stand-in for the real data.

import {
  BASELINE,
  MIN_CLEAR_SHARE,
  conditionScore,
  damagedArea,
  healthScore,
  isStressed,
  waterScore,
} from "../../src/lib/field/method.js";
import { areaHa as sphericalAreaHa, bboxOf, pointInGeometry, polygonsOf } from "../geo.js";
import { hashText, parcelsAround, seeded, splitBoundary } from "../field/detect-sample.js";
import { fbm, insideUkraineBox, UKRAINE_FRONT } from "./sample.js";

const DAY_MS = 86400000;
const WAR_START = "2022-02-24";

// ---------- Dates ----------

const dayNum = (iso) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const isoOf = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const yearOf = (iso) => Number(iso.slice(0, 4));
const doyOf = (iso) => dayNum(iso) - dayNum(`${iso.slice(0, 4)}-01-01`) + 1;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value, digits = 3) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);
const logistic = (x) => 1 / (1 + Math.exp(-x));
const median = (values) => {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};
const mean = (values) => {
  const list = values.filter(Number.isFinite);
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
};

// A repeatable value 0..1 for some text.
const unit = (text) => hashText(text) / 4294967296;

// ---------- Crops ----------
// Days are days of the year. base = NDVI before green-up, peak = full
// canopy, ripe = NDVI of the dried crop just before harvest, k = how quickly
// it greens up / dries down (days). Winter crops are already green on Mar 1
// and are sown again in autumn (sowAgain).
const CROPS = {
  "winter wheat": { base: 0.32, peak: 0.84, ripe: 0.28, greenUp: 98, k1: 9, senesce: 168, k2: 8, harvest: 198, sowAgain: 262 },
  rapeseed: { base: 0.34, peak: 0.8, ripe: 0.3, greenUp: 88, k1: 9, senesce: 152, k2: 8, harvest: 186, sowAgain: 238 },
  barley: { base: 0.2, peak: 0.78, ripe: 0.28, greenUp: 128, k1: 8, senesce: 176, k2: 7, harvest: 200 },
  "spring wheat": { base: 0.2, peak: 0.8, ripe: 0.28, greenUp: 135, k1: 8, senesce: 190, k2: 7, harvest: 216 },
  sunflower: { base: 0.2, peak: 0.78, ripe: 0.3, greenUp: 168, k1: 10, senesce: 262, k2: 11, harvest: 298 },
  corn: { base: 0.2, peak: 0.86, ripe: 0.32, greenUp: 176, k1: 10, senesce: 284, k2: 13, harvest: 318 },
  soybean: { base: 0.2, peak: 0.86, ripe: 0.3, greenUp: 172, k1: 8, senesce: 262, k2: 8, harvest: 300 },
  // A field left unsown: weeds green up a little and dry out.
  fallow: { base: 0.22, peak: 0.46, ripe: 0.3, greenUp: 130, k1: 12, senesce: 215, k2: 18, harvest: null },
};
const MAIN_CROPS = ["winter wheat", "sunflower", "corn", "barley", "soybean", "rapeseed"];

export function cropKey(name, seedText) {
  const text = String(name || "").toLowerCase();
  if (text.includes("winter wheat") || text === "wheat") return "winter wheat";
  if (text.includes("spring wheat")) return "spring wheat";
  if (text.includes("wheat")) return "winter wheat";
  if (text.includes("barley")) return "barley";
  if (text.includes("sunflower")) return "sunflower";
  if (text.includes("corn") || text.includes("maize")) return "corn";
  if (text.includes("soy")) return "soybean";
  if (text.includes("rape") || text.includes("canola")) return "rapeseed";
  return MAIN_CROPS[hashText(`crop:${seedText}`) % MAIN_CROPS.length];
}

// The crop's curve in one year for one field: dates shifted by a few days
// (later sowing near the front is common), peak a little higher or lower.
// Since the war, fields near the front get less fertiliser and care, so
// their crops are often thinner than before.
function seasonParams(crop, fieldSeed, year, frontKm = Infinity) {
  const c = CROPS[crop];
  const shift = Math.round((unit(`shift:${SALT.shift}:${fieldSeed}:${year}`) - 0.4) * 24); // about -10..+14 days
  const u = unit(`amp:${SALT.shift}:${fieldSeed}:${year}`);
  const war = year >= 2022 ? 0.06 * Math.exp(-frontKm / 40) : 0;
  const amp = year >= 2022 ? 1 + (u - 0.55) * 0.26 - war : 1 + (u - 0.5) * 0.1;
  const move = (day) => (day == null ? null : day + shift);
  return { ...c, peak: clamp(c.peak * amp, c.base + 0.1, 0.92), greenUp: move(c.greenUp), senesce: move(c.senesce), harvest: move(c.harvest), sowAgain: move(c.sowAgain) };
}

// NDVI of the crop on one day of the year (no clouds, no noise).
function cropNdvi(p, doy) {
  if (p.harvest != null && doy >= p.harvest) {
    // Stubble, then (winter crops) the new crop coming up in autumn.
    const stubble = 0.22 + 0.03 * clamp((doy - p.harvest) / 60, 0, 1);
    if (p.sowAgain != null && doy > p.sowAgain) return stubble + 0.04 * logistic((doy - p.sowAgain - 22) / 6);
    return stubble;
  }
  const up = logistic((doy - p.greenUp) / p.k1);
  const down = logistic((doy - p.senesce) / p.k2);
  return p.base + (p.peak - p.base) * up - (p.peak - p.ripe) * down;
}

// Water in the plants (NDWI) follows the canopy, with a dry spell in late
// summer that differs by year and place.
function cropNdwi(ndvi, doy, year, placeSeed) {
  const dry = (unit(`dry:${placeSeed}:${year}`) - 0.35) * 0.08;
  const summer = Math.exp(-(((doy - 215) / 35) ** 2));
  return 0.95 * ndvi - 0.42 - dry * summer;
}

// ---------- Satellite passes and clouds ----------

// Sentinel-2 passes over a place every 5 days, on days set by its orbit.
function passDays(fromDay, toDay, lon) {
  const offset = Math.floor((((lon + 180) / 360) * 37) % 5);
  const first = fromDay + ((((offset - fromDay) % 5) + 5) % 5);
  const days = [];
  for (let day = first; day <= toDay; day += 5) days.push(day);
  return days;
}

// The clear share of a pass (0..1): cloudier in winter, shared by fields
// within about 50 km (the same cloud covers the whole farm).
function clearShare(day, lat, lon, fieldSeed) {
  const iso = isoOf(day);
  const month = Number(iso.slice(5, 7));
  const cloudy = [0.75, 0.7, 0.62, 0.5, 0.42, 0.38, 0.3, 0.28, 0.35, 0.5, 0.68, 0.78][month - 1];
  const cell = `${Math.floor(lat * 2)}:${Math.floor(lon * 2)}`;
  const u = unit(`cloud:${SALT.cloud}:${iso}:${cell}`);
  const v = unit(`cloudpart:${SALT.cloud}:${iso}:${cell}`);
  const local = (unit(`cloudfield:${iso}:${fieldSeed}`) - 0.5) * 0.12;
  const share = u > cloudy ? 0.62 + 0.38 * v : 0.45 * v;
  return clamp(share + local, 0, 1);
}

// ---------- War damage ----------
// The eastern front: the Atlas sample's line (UKRAINE_FRONT in providers/sample.js).
const FRONT = UKRAINE_FRONT;

// Distance (km) from a point to the front line.
export function frontDistanceKm(lat, lon) {
  if (!insideUkraineBox(lat, lon)) return Infinity;
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  for (let i = 1; i < FRONT.length; i += 1) {
    const ax = (FRONT[i - 1][1] - lon) * kx;
    const ay = (FRONT[i - 1][0] - lat) * ky;
    const bx = (FRONT[i][1] - lon) * kx;
    const by = (FRONT[i][0] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(-(ax * dx + ay * dy) / (dx * dx + dy * dy || 1), 0, 1);
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const CLUSTER_CELL_KM = 1.5;
// Fixed seeds for the made-up patterns. Changing one reshuffles them; these
// were picked so the demo farm shows a mix of stages on one day (and its
// Field 7, nearest the shelling, is the damaged one), like a real farm there.
const SALT = { damage: "damage20", patch: "v2", cloud: "c1", shift: "shift9" };
const DAMAGE_SALT = SALT.damage;

// Shell-impact clusters near a box [west, south, east, north]: each 1.5 km
// square may hold one cluster, more likely the closer it is to the front.
export function impactClusters(bbox) {
  const [west, south, east, north] = bbox;
  const latMid = (south + north) / 2;
  const kx = 111.32 * Math.cos((latMid * Math.PI) / 180);
  const ky = 110.57;
  const clusters = [];
  const i0 = Math.floor((west * kx) / CLUSTER_CELL_KM) - 1;
  const i1 = Math.floor((east * kx) / CLUSTER_CELL_KM) + 1;
  const j0 = Math.floor((south * ky) / CLUSTER_CELL_KM) - 1;
  const j1 = Math.floor((north * ky) / CLUSTER_CELL_KM) + 1;
  for (let i = i0; i <= i1; i += 1) {
    for (let j = j0; j <= j1; j += 1) {
      const lon = ((i + unit(`${DAMAGE_SALT}:x:${i}:${j}`)) * CLUSTER_CELL_KM) / kx;
      const lat = ((j + unit(`${DAMAGE_SALT}:y:${i}:${j}`)) * CLUSTER_CELL_KM) / ky;
      const km = frontDistanceKm(lat, lon);
      if (!(km < 30)) continue;
      const chance = 0.55 * Math.exp(-km / 5);
      if (unit(`${DAMAGE_SALT}:has:${i}:${j}`) >= chance) continue;
      clusters.push({
        lat,
        lon,
        radiusM: 180 + 380 * unit(`${DAMAGE_SALT}:r:${i}:${j}`),
        fires: 1 + Math.floor(7 * unit(`${DAMAGE_SALT}:f:${i}:${j}`)),
        hitMonth: monthPlus("2022-03", Math.floor(18 * unit(`${DAMAGE_SALT}:m:${i}:${j}`))),
      });
    }
  }
  return clusters;
}

function monthPlus(month, count) {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + count;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// ---------- Soil ----------
// Chance the soil is chernozem (black soil), 0..1, from broad belts:
// Ukraine's forest-steppe and steppe, the Russian/Kazakh steppe, the North
// American prairies and the Pampas.
export function chernozemChance(lat, lon) {
  const wobble = (fbm(lon * 3, lat * 3, 4242, 2) - 0.5) * 0.16;
  let p = 0.08;
  if (insideUkraineBox(lat, lon)) {
    p = lat > 50.9 ? 0.15 : lon < 25.2 ? 0.35 : lat < 46.2 ? 0.45 : 0.86;
  } else if (lat >= 45 && lat <= 56 && lon >= 30 && lon <= 85) p = 0.7;
  else if (lat >= 38 && lat <= 52 && lon >= -105 && lon <= -94) p = 0.55;
  else if (lat >= -38 && lat <= -30 && lon >= -64 && lon <= -57) p = 0.55;
  return round(clamp(p + wobble, 0, 1), 2);
}

// ---------- One field ----------

function fieldFrame(field) {
  const bbox = bboxOf(field.geometry);
  const [west, south, east, north] = bbox;
  const lat = (south + north) / 2;
  const lon = (west + east) / 2;
  // Seeded by the outline itself, so the same land gives the same numbers
  // whatever its id.
  const seed = `${lat.toFixed(5)}:${lon.toFixed(5)}:${polygonsOf(field.geometry)[0]?.[0]?.length || 0}`;
  return { bbox, lat, lon, seed, frontKm: frontDistanceKm(lat, lon), areaHa: Number.isFinite(field.areaHa) ? field.areaHa : sphericalAreaHa(field.geometry) };
}

// The zones grid: at most 64 x 64 cells, each at least 10 m.
function gridFor(bbox) {
  const [west, south, east, north] = bbox;
  const latMid = (south + north) / 2;
  const widthM = (east - west) * 111320 * Math.cos((latMid * Math.PI) / 180);
  const heightM = (north - south) * 110574;
  const size = Math.max(10, Math.max(widthM, heightM) / 64);
  const cols = clamp(Math.ceil(widthM / size), 1, 64);
  const rows = clamp(Math.ceil(heightM / size), 1, 64);
  return { west, south, east, north, cols, rows, cellHa: ((widthM / cols) * (heightM / rows)) / 1e4 };
}

function cellCentre(grid, col, row) {
  const lon = grid.west + ((col + 0.5) / grid.cols) * (grid.east - grid.west);
  const lat = grid.north - ((row + 0.5) / grid.rows) * (grid.north - grid.south);
  return { lat, lon };
}

const metresBetween = (a, b) =>
  Math.hypot((a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 110574);

// Which cells of the field the war hit, and how hard.
function damageOf(field, frame, grid, inside) {
  const clusters = impactClusters(frame.bbox).filter((cluster) => {
    // Quick reject: far from the field box.
    const pad = cluster.radiusM / 80000;
    const [w, s, e, n] = frame.bbox;
    return cluster.lon > w - pad && cluster.lon < e + pad && cluster.lat > s - pad && cluster.lat < n + pad;
  });
  const hitCells = new Set();
  const hitBy = new Set();
  inside.forEach(({ index, lat, lon }) => {
    for (let k = 0; k < clusters.length; k += 1) {
      if (metresBetween({ lat, lon }, clusters[k]) <= clusters[k].radiusM) {
        hitCells.add(index);
        hitBy.add(k);
      }
    }
  });
  const share = inside.length ? hitCells.size / inside.length : 0;
  const hits = [...hitBy].map((k) => clusters[k]);
  const fires = hits.reduce((sum, cluster) => sum + cluster.fires, 0);
  const firstHit = hits.map((cluster) => cluster.hitMonth).sort()[0] || null;
  const km = frontDistanceKm(frame.lat, frame.lon);
  return {
    hitCells,
    share,
    fires,
    firstHit,
    chiDrop: Number.isFinite(km) ? round(clamp(0.02 + 0.6 * share + 0.03 * Math.exp(-km / 10) + (unit(`chi:${frame.seed}`) - 0.5) * 0.02, 0, 1), 3) : round(0.01 * unit(`chi:${frame.seed}`), 3),
    // Heavily hit fields are not sown again.
    abandoned: share >= 0.15,
  };
}

// The crop curve for a field in one year, taking war damage into account.
function paramsFor(crop, frame, damage, year) {
  const abandonedFrom = damage.abandoned && damage.firstHit ? yearOf(damage.firstHit) + 1 : Infinity;
  return seasonParams(year >= abandonedFrom ? "fallow" : crop, frame.seed, year, frame.frontKm);
}

// One pass's field-average reading, or null when it was too cloudy.
function passReading(day, crop, frame, damage) {
  const iso = isoOf(day);
  const year = yearOf(iso);
  const clear = clearShare(day, frame.lat, frame.lon, frame.seed);
  const p = paramsFor(crop, frame, damage, year);
  const doy = doyOf(iso);
  let ndvi = cropNdvi(p, doy) + (unit(`noise:${frame.seed}:${iso}`) - 0.5) * 0.03;
  // Cratered ground reads as bare soil once it was hit.
  if (damage.share > 0 && damage.firstHit && iso.slice(0, 7) >= damage.firstHit) ndvi = (1 - damage.share) * ndvi + damage.share * 0.18;
  const ndwi = cropNdwi(ndvi, doy, year, `${Math.floor(frame.lat)}:${Math.floor(frame.lon)}`) + (unit(`wnoise:${frame.seed}:${iso}`) - 0.5) * 0.03;
  return { date: iso, ndvi: round(ndvi), ndwi: round(ndwi), clear };
}

function clearPasses(fromDay, toDay, crop, frame, damage) {
  return passDays(fromDay, toDay, frame.lon)
    .map((day) => passReading(day, crop, frame, damage))
    .filter((pass) => pass.clear >= MIN_CLEAR_SHARE);
}

// Field means for a 31-day window centred on the same day of the year, in
// each baseline year.
function normalFor(centreDoy, crop, frame, damage, pick) {
  const yearly = [];
  for (let year = BASELINE.from; year <= BASELINE.to; year += 1) {
    const centre = dayNum(`${year}-01-01`) + centreDoy - 1;
    const passes = clearPasses(centre - 15, centre + 15, crop, frame, damage);
    const value = mean(passes.map(pick));
    if (Number.isFinite(value)) yearly.push(value);
  }
  if (!yearly.length) return { low: null, high: null, median: null };
  return { low: round(Math.min(...yearly)), high: round(Math.max(...yearly)), median: round(median(yearly)) };
}

// NDVI normal for the 1st and 16th of every month (the chart's grey band).
function normalCurveFor(crop, frame, damage) {
  const out = [];
  for (let month = 1; month <= 12; month += 1) {
    for (const day of [1, 16]) {
      const mmdd = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const values = [];
      for (let year = BASELINE.from; year <= BASELINE.to; year += 1) {
        values.push(cropNdvi(paramsFor(crop, frame, damage, year), doyOf(`${year}-${mmdd}`)));
      }
      out.push({ day: mmdd, low: round(Math.min(...values)), high: round(Math.max(...values)), median: round(median(values)) });
    }
  }
  return out;
}

// This season: from Mar 1 (when that is at least 45 days ago), else the last 8 months.
export function seasonStart(today) {
  const march = `${today.slice(0, 4)}-03-01`;
  if (dayNum(today) - dayNum(march) >= 45) return march;
  return isoOf(dayNum(today) - 243);
}

function analyzeOne(field, today) {
  const frame = fieldFrame(field);
  const crop = cropKey(field.crop, frame.seed);
  const grid = gridFor(frame.bbox);
  const inside = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const { lat, lon } = cellCentre(grid, col, row);
      if (pointInGeometry(lon, lat, field.geometry)) inside.push({ index: row * grid.cols + col, col, row, lat, lon });
    }
  }
  // A thin field may have no cell centre inside: use its middle.
  if (!inside.length) {
    const col = Math.floor(grid.cols / 2);
    const row = Math.floor(grid.rows / 2);
    inside.push({ index: row * grid.cols + col, col, row, ...cellCentre(grid, col, row) });
  }
  const damage = damageOf(field, frame, grid, inside);
  const warnings = [];

  // The latest condition: clear passes of the last 30 days (or the most
  // recent 30 days with a clear pass in the last 90).
  const todayDay = dayNum(today);
  const recent = clearPasses(todayDay - 90, todayDay, crop, frame, damage);
  const lastClear = recent[recent.length - 1] || null;
  const windowEnd = lastClear && dayNum(lastClear.date) < todayDay - 30 ? dayNum(lastClear.date) : todayDay;
  const window = recent.filter((pass) => dayNum(pass.date) > windowEnd - 30 && dayNum(pass.date) <= windowEnd);
  if (!lastClear) warnings.push("No clear satellite image in the last 90 days.");
  else if (windowEnd < todayDay) warnings.push(`No clear satellite image since ${lastClear.date}.`);
  const fieldNdvi = median(window.map((pass) => pass.ndvi));
  const fieldNdwi = median(window.map((pass) => pass.ndwi));
  const centreDoy = doyOf(isoOf(windowEnd - 15));
  const normalNdvi = normalFor(centreDoy, crop, frame, damage, (pass) => pass.ndvi);
  const normalNdwi = normalFor(centreDoy, crop, frame, damage, (pass) => pass.ndwi);

  // Stress patches (0-2), only in a field with plants on it.
  const patchCount = [0, 0, 1, 1, 1, 2][hashText(`patches:${SALT.patch}:${frame.seed}`) % 6];
  const random = seeded(hashText(`patchpos:${SALT.patch}:${frame.seed}`));
  const sown = Number.isFinite(fieldNdvi) && fieldNdvi > 0.3 && !damage.abandoned;
  const patches = sown
    ? Array.from({ length: patchCount }, () => {
        const cell = inside[Math.floor(random() * inside.length)];
        return { lat: cell.lat, lon: cell.lon, radiusM: 45 + random() * 80 };
      })
    : [];

  // Every cell: NDVI and NDWI with smooth variation, then the method's scores.
  const kmX = 111.32 * Math.cos((frame.lat * Math.PI) / 180);
  const cells = inside.map((cell) => {
    const x = (cell.lon * kmX) / 0.18; // patterns about 180 m across
    const y = (cell.lat * 110.57) / 0.18;
    const vary = (fbm(x, y, hashText(`soil:${frame.seed}`) % 100000, 3) - 0.5) * 0.14;
    let ndvi = Number.isFinite(fieldNdvi) ? fieldNdvi + vary * clamp((fieldNdvi - 0.15) / 0.5, 0.2, 1) : null;
    let ndwi = Number.isFinite(fieldNdwi) ? fieldNdwi + vary * 0.8 : null;
    for (const patch of patches) {
      const d = metresBetween(cell, patch) / patch.radiusM;
      if (d < 1.4 && ndvi != null) {
        const dip = Math.max(0.16, 0.45 * (fieldNdvi - 0.12)) * Math.exp(-(d * d) * 1.1);
        ndvi -= dip;
        ndwi -= dip * 0.8;
      }
    }
    if (damage.hitCells.has(cell.index) && ndvi != null) {
      ndvi = Math.min(ndvi, 0.17 + 0.04 * unit(`crater:${cell.index}:${frame.seed}`));
      ndwi = Math.min(ndwi, -0.2);
    }
    return { ...cell, ndvi, ndwi };
  });
  const medianNdvi = median(cells.map((cell) => cell.ndvi));
  const medianNdwi = median(cells.map((cell) => cell.ndwi));
  const scored = cells.map((cell) => {
    const health = healthScore(cell.ndvi, normalNdvi.median);
    const water = waterScore(cell.ndwi, normalNdwi.median);
    const stressed = isStressed(cell.ndvi, medianNdvi, normalNdvi.median);
    return { ...cell, health, water, stressed, condition: conditionScore({ health, water, stress: Number.isFinite(health) ? (stressed ? 1 : 0) : null }) };
  });
  const values = new Array(grid.cols * grid.rows).fill(null);
  scored.forEach((cell) => {
    values[cell.index] = round(cell.condition);
  });
  const stressedCells = scored.filter((cell) => cell.stressed);
  const share = Number.isFinite(medianNdvi) ? stressedCells.length / scored.length : null;
  const outPatches = patches
    .map((patch) => {
      const count = stressedCells.filter((cell) => metresBetween(cell, patch) <= patch.radiusM * 1.4).length;
      const ha = count * grid.cellHa;
      return { lat: round(patch.lat, 6), lon: round(patch.lon, 6), radiusM: Math.round(Math.sqrt((ha * 1e4) / Math.PI)), ha: round(ha, 2) };
    })
    .filter((patch) => patch.ha >= 0.3)
    .sort((a, b) => b.ha - a.ha)
    .slice(0, 3);

  const seasonFrom = dayNum(seasonStart(today));
  const season = clearPasses(seasonFrom, todayDay, crop, frame, damage).map((pass) => ({
    date: pass.date,
    ndvi: pass.ndvi,
    ndwi: pass.ndwi,
    clearPct: Math.round(pass.clear * 100),
  }));
  const radarChangedShare = round(damage.share, 3);
  return {
    fieldId: field.id,
    provider: "sample",
    updatedAt: new Date().toISOString(),
    latestPass: lastClear ? { date: lastClear.date, clearPct: Math.round(lastClear.clear * 100) } : null,
    water: { ndwi: round(medianNdwi), normal: normalNdwi, score: round(median(scored.map((cell) => cell.water))) },
    plantHealth: { ndvi: round(medianNdvi), normal: normalNdvi, score: round(median(scored.map((cell) => cell.health))) },
    stress: { share: round(share), stressedHa: Number.isFinite(share) ? round(share * frame.areaHa, 2) : null, patches: outPatches },
    condition: { score: round(median(scored.map((cell) => cell.condition))) },
    damage: {
      radarChangedShare,
      firesSinceWar: damage.fires,
      chiDrop: damage.chiDrop,
      damagedHa: damagedArea({ radarChangedShare, firesSinceWar: damage.fires, chiDrop: damage.chiDrop }, frame.areaHa),
    },
    soil: { chernozemProbability: chernozemChance(frame.lat, frame.lon) },
    season,
    normalCurve: normalCurveFor(crop, frame, damage),
    zones: { west: grid.west, south: grid.south, east: grid.east, north: grid.north, cols: grid.cols, rows: grid.rows, values },
    warnings,
    crop,
  };
}

// Monthly field means since `from` ("2019-01") up to `to` ("YYYY-MM").
function historyOf(field, from, to) {
  const frame = fieldFrame(field);
  const crop = cropKey(field.crop, frame.seed);
  const grid = gridFor(frame.bbox);
  const inside = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const { lat, lon } = cellCentre(grid, col, row);
      if (pointInGeometry(lon, lat, field.geometry)) inside.push({ index: row * grid.cols + col, lat, lon });
    }
  }
  const damage = damageOf(field, frame, grid, inside);
  const months = [];
  for (let month = from; month <= to; month = monthPlus(month, 1)) {
    const start = dayNum(`${month}-01`);
    const end = dayNum(`${monthPlus(month, 1)}-01`) - 1;
    const all = passDays(start, end, frame.lon).map((day) => passReading(day, crop, frame, damage));
    const clear = all.filter((pass) => pass.clear >= MIN_CLEAR_SHARE);
    months.push({
      month,
      ndvi: round(mean(clear.map((pass) => pass.ndvi))),
      ndwi: round(mean(clear.map((pass) => pass.ndwi))),
      clearPct: all.length ? Math.round(mean(all.map((pass) => pass.clear)) * 100) : null,
    });
  }
  return months;
}

// ---------- The provider ----------

const SAMPLE_WARNING = "Sample data: fields were split by a simple rule, not found from satellite images. Connect Earth Engine to find the real fields.";

export function createFieldSampleProvider({ now = () => new Date() } = {}) {
  return {
    id: "sample",
    label: "Sample data",
    async status() {
      return { ok: true, detail: "Sample data (made up, for trying the app)." };
    },
    async detectFields({ boundary = null, center = null, radiusM = 1200, onProgress } = {}) {
      onProgress?.(0.2);
      const candidates = boundary ? splitBoundary(boundary) : center ? parcelsAround(center.lat, center.lon, radiusM) : [];
      onProgress?.(1);
      const warnings = [SAMPLE_WARNING];
      if (!candidates.length) warnings.push("No fields found here — try a larger area or draw your fields.");
      return { candidates, warnings };
    },
    async analyzeFields({ fields = [], today, onProgress } = {}) {
      const day = today || now().toLocaleDateString("en-CA");
      const analyses = {};
      fields.forEach((field, i) => {
        analyses[field.id] = analyzeOne(field, day);
        onProgress?.((i + 1) / fields.length);
      });
      return { analyses, warnings: [] };
    },
    async fieldHistory({ field, from = "2019-01", to } = {}) {
      const last = to || now().toLocaleDateString("en-CA").slice(0, 7);
      return historyOf(field, from, last);
    },
  };
}

export const fieldSampleProvider = createFieldSampleProvider();
export default fieldSampleProvider;

// For tests.
export { analyzeOne as sampleFieldAnalysis, WAR_START };
