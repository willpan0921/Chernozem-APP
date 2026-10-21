// WHAT THIS FILE DOES
// The SAMPLE data source: made-up but realistic-looking readings for any
// area on Earth, so the whole Atlas works before Earth Engine is connected.
// Every page labels these numbers as "Sample data".
//
// How the numbers are made (all repeatable: the same area and month always
// give the same numbers, no randomness):
//   - smooth "noise" maps (like gentle hills) for soil, cropland and people,
//     sized to the area, so a farm has as much variety as a country
//   - a black-soil belt running across the area
//   - a few towns (or, on a farm, farmsteads) with many people
//   - a "front line" ONLY where a known war covers the area
//     (src/config/conflicts.js, found by server/conflicts.js): in Ukraine it
//     follows the real eastern front (Kharkiv region, Kupiansk, Bakhmut,
//     Pokrovsk, south of Zaporizhzhia, the Dnipro to Kherson); in another
//     war it is a made-up curved line about three quarters of the way east.
//     It creeps a little each month.
//   - inside a war, damage BUILDS UP: land near anywhere the front has been
//     stays damaged, a few new damage spots appear along the front each
//     month, and only a very small share is repaired. So the damaged total
//     almost never falls, and "new damage" is simply how much it grew.
//     Fires count the detections since the war began above the normal rate,
//     so they only grow.
//   - radar change (radarDb, the damage score's second indicator) follows
//     the same made-up damage; at peace it stays at the small year-to-year
//     change of ordinary farmland (under 0.6 dB)
//   - at peace (most of the world): no front, distance to fighting not
//     measured (every place reads 300 km, nothing set aside), no war
//     damage, only the small month-to-month wobble of the health index and
//     radar and a few stray fires
//   - a month that ends before its war began (a war set from a later day):
//     no front either, and no fire or radar damage counted at all, as on
//     Earth Engine (src/config/conflicts.js endsBeforeWar)
//   - an area that holds its war only in part (a whole country such as
//     Thailand or Russia, or a region, box or drawn area across the edge
//     of the war's boxes: conflict.partOfCountry): the made-up front runs
//     through the war's squares (those that touch its boxes or lie in
//     another listed war: server/conflicts.js warCellsFor), which get the
//     war's readings; the other squares get the readings of peace, with
//     their distance to that front (as Earth Engine: each reading says
//     which, atWar)
//   - alerts: the cells where damage or fires grew most since last month
//
// It returns the same shape as the Earth Engine source (gee.js), so the
// rest of the app cannot tell them apart except by the "sample" label.
//
// WHO EDITS IT
// Nobody, normally. It is only a stand-in for the real data.

import { HEAVY_DAMAGE_CHI_DROP } from "../../src/lib/atlas/method.js";
import { formatCoord } from "../geo.js";
import { conflictForArea, warCellsFor } from "../conflicts.js";
import { NO_WAR_WARNING, beforeWarWarning, cleanConflict } from "../runs.js";
import { endsBeforeWar } from "../../src/config/conflicts.js";

// The distance to fighting at peace: the most that is measured (as gee.js).
const PEACE_KM = 300;

// ---------- Repeatable "random" numbers ----------

// A number for a piece of text (FNV-1a hash).
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A repeatable value from 0 to 1 for a grid corner (x, y) and a seed.
function hash3(x, y, seed) {
  let h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// A list of repeatable values from 0 to 1 (mulberry32).
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Smooth noise from 0 to 1: values on a grid of whole numbers, blended
// smoothly in between.
export function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash3(xi, yi, seed);
  const b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed);
  const d = hash3(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// Several layers of noise (big shapes plus finer detail), from 0 to 1.
export function fbm(x, y, seed, octaves = 3) {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let weight = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += amplitude * valueNoise(x * frequency, y * frequency, seed + i * 1013);
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total / weight;
}

// Stretches noise (which sits mostly around 0.5) to use the full 0..1.
const stretch = (value) => clamp((value - 0.28) / 0.44, 0, 1);

// ---------- The area's frame ----------

// Months since a war began (its month = 0); by default the full-scale
// invasion of Ukraine (February 2022 = 0).
export function warMonth(month, since = "2022-02-24") {
  const [year, mon] = month.split("-").map(Number);
  const [startYear, startMon] = since.split("-").map(Number);
  return Math.max(0, (year - startYear) * 12 + (mon - startMon));
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const index = clamp(Math.round(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[index];
}

// Ukraine's outline box [west, south, east, north]. An area whose middle is
// inside it uses the real front line below.
export const UKRAINE_BBOX = [22.1, 44.3, 40.25, 52.4];

// The real eastern front, roughly, north to south, as [lat, lon]. The Field
// sample (providers/field-sample.js) uses the same line.
export const UKRAINE_FRONT = [
  [50.45, 36.7], // Russian border north of Vovchansk
  [50.29, 36.94], // Vovchansk
  [50.0, 37.45],
  [49.85, 37.68], // Dvorichna
  [49.7, 37.6], // Kupiansk
  [49.35, 37.85],
  [49.0, 37.95], // near Lyman
  [48.86, 38.1], // Siversk
  [48.6, 38.0], // Bakhmut
  [48.4, 37.85], // Toretsk
  [48.28, 37.25], // Pokrovsk
  [47.95, 36.95],
  [47.82, 36.75], // Velyka Novosilka
  [47.66, 36.26], // Huliaipole
  [47.4, 35.9], // south of Zaporizhzhia
  [47.5, 35.4], // Kakhovka reservoir
  [47.45, 34.75], // Enerhodar, across the water
  [46.95, 33.85],
  [46.75, 33.37], // Nova Kakhovka
  [46.64, 32.62], // Kherson
  [46.5, 31.95], // mouth of the Dnipro
];

// The same line with a point about every 10 km, so it bends smoothly.
const UKRAINE_FRONT_FINE = (() => {
  const out = [];
  for (let i = 1; i < UKRAINE_FRONT.length; i += 1) {
    const [aLat, aLon] = UKRAINE_FRONT[i - 1];
    const [bLat, bLon] = UKRAINE_FRONT[i];
    const km = Math.hypot((bLat - aLat) * 110.57, (bLon - aLon) * 74);
    const steps = Math.max(1, Math.round(km / 10));
    for (let s = i === 1 ? 0 : 1; s <= steps; s += 1) out.push([lerp(aLat, bLat, s / steps), lerp(aLon, bLon, s / steps)]);
  }
  return out;
})();

export function insideUkraineBox(lat, lon) {
  const [west, south, east, north] = UKRAINE_BBOX;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

// Local km coordinates around the area, plus the "context box" the front
// line and towns are placed in. The box is the area itself (at least 1 km
// across), so a farm gets farm-sized patterns, not a country's. Built from
// where the cells actually are, so far-off islands do not pull it away.
//   frontCells  for a war that covers the area only in part: the squares
//               it covers, whose box the made-up front is drawn in
function makeFrame(area, cells, conflict, frontCells = null) {
  const lats = cells.map((cell) => cell.lat).sort((a, b) => a - b);
  const lons = cells.map((cell) => cell.lon).sort((a, b) => a - b);
  const south = quantile(lats, 0.03);
  const north = quantile(lats, 0.97);
  const west = quantile(lons, 0.03);
  const east = quantile(lons, 0.97);
  const lat0 = (south + north) / 2;
  const lon0 = (west + east) / 2;
  const kx = 111.32 * Math.max(0.05, Math.cos((lat0 * Math.PI) / 180));
  const ky = 110.57;
  const widthKm = Math.max((east - west) * kx, 0.05);
  const heightKm = Math.max((north - south) * ky, 0.05);
  const boxW = Math.max(widthKm, 1);
  const boxH = Math.max(heightKm, 1);
  const diagKm = Math.hypot(boxW, boxH);
  // The real front only for an area in the war in Ukraine; Moldova, inside
  // Ukraine's box, is at peace.
  const ukraine = conflict?.id === "ukraine-2022";
  const toKm = (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
  // The box (km) of the squares a war covers in part of the area.
  let front = null;
  if (frontCells?.length) {
    const [fx0, fy0] = toKm(Math.min(...frontCells.map((cell) => cell.lat)), Math.min(...frontCells.map((cell) => cell.lon)));
    const [fx1, fy1] = toKm(Math.max(...frontCells.map((cell) => cell.lat)), Math.max(...frontCells.map((cell) => cell.lon)));
    front = { cx: (fx0 + fx1) / 2, cy: (fy0 + fy1) / 2, w: Math.max(fx1 - fx0, 1), h: Math.max(fy1 - fy0, 1) };
  }
  return {
    lat0,
    lon0,
    // The war covering the area, or null (then there is no front at all).
    conflict,
    kx,
    ky,
    boxW,
    boxH,
    diagKm,
    ukraine,
    // The real front in this area's km, before it moves.
    ukraineFront: ukraine ? UKRAINE_FRONT_FINE.map(([lat, lon]) => toKm(lat, lon)) : null,
    // Where a made-up front goes when the war covers part of the area only.
    front,
    // How far (km) damage and fires reach from the front: about 22 km on a
    // real front, shorter on a made-up front through a small area.
    reachKm: ukraine ? 22 : clamp(diagKm * 0.12, 0.15, 22),
    // Size of the soil and cropland patterns: a quarter of the area itself.
    featureKm: clamp(Math.hypot(widthKm, heightKm) / 4, 0.05, 400),
    toKm,
  };
}

// Where the made-up front line crosses height v (0 = south edge, 1 = north
// edge) in month t, as a share of the box width from the west. It sways a
// little and slowly creeps west.
function frontU(v, t, seed) {
  const phase = hash3(1, 2, seed) * Math.PI * 2;
  const drift = 0.006 * Math.sin(t / 4 + phase) + 0.004 * (hash3(t, 7, seed) - 0.5) - 0.0006 * Math.min(t, 120);
  return 0.77 + 0.05 * Math.sin(Math.PI * 2 * (0.8 * v) + phase) + 0.05 * (valueNoise(v * 2.5, 0.5, seed + 77) - 0.5) + drift;
}

// The front line in month t as a list of km points.
function frontLine(frame, t, seed) {
  if (frame.ukraine) {
    // The real front: the same for every area (fixed seed), bending a few
    // km and creeping west about 0.3 km a month.
    const creep = -0.3 * (Math.min(t, 120) - 50);
    return frame.ukraineFront.map(([x, y], i) => [x + creep + 2.5 * (valueNoise(i / 6, t / 12, 804) - 0.5), y]);
  }
  const points = [];
  const steps = 64;
  // Across the area, or across the squares of a war in part of it.
  const box = frame.front || { cx: 0, cy: 0, w: frame.boxW, h: frame.boxH };
  for (let i = 0; i <= steps; i += 1) {
    const v = -0.25 + (1.5 * i) / steps;
    const u = frontU(v, t, seed);
    points.push([box.cx + (u - 0.5) * box.w, box.cy + (v - 0.5) * box.h]);
  }
  return points;
}

// Shortest distance (km) from a point to a line made of segments.
function distanceToLine(x, y, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1) : 0;
    const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
    if (d < best) best = d;
  }
  return best;
}

// The pieces of a line that lie inside the box (plus a margin), with their
// lengths, so new damage spots only appear where they can be seen.
function segmentsInBox(frame, line, marginKm) {
  const halfW = frame.boxW / 2 + marginKm;
  const halfH = frame.boxH / 2 + marginKm;
  const out = [];
  for (let i = 1; i < line.length; i += 1) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (Math.abs(mx) <= halfW && Math.abs(my) <= halfH) out.push({ ax, ay, bx, by, len: Math.hypot(bx - ax, by - ay) });
  }
  return out;
}

// ---------- The parts that do not change month to month ----------

function staticFields(area, cells, frame, seed) {
  const random = seededRandom(seed ^ 0x9e3779b9);
  // The black-soil belt: a band across the area at a gentle angle.
  const angle = (random() - 0.5) * 0.9;
  const beltOffset = (random() - 0.5) * 0.3;
  const beltWidth = 0.32 + random() * 0.12;
  // Towns: a few places with many people. In a small area (a farm) they
  // shrink to one to three farmsteads a hundred metres or so across.
  const small = frame.diagKm < 24;
  const townCount = small ? 1 + Math.floor(random() * 3) : 3 + Math.floor(random() * 6);
  const townRadius = small ? frame.diagKm / 25 : clamp(frame.diagKm / 60, 2, 20);
  const towns = Array.from({ length: townCount }, () => ({
    x: (0.05 + random() * 0.9 - 0.5) * frame.boxW,
    y: (0.05 + random() * 0.9 - 0.5) * frame.boxH,
    r: townRadius * (0.5 + random()),
    peak: small ? 2000 + random() * 3000 : 600 + random() * 2400,
  }));
  const f = frame.featureKm;

  const out = new Map();
  for (const cell of cells) {
    const [x, y] = frame.toKm(cell.lat, cell.lon);
    // Distance across the belt, as a share of the box height.
    const across = (y * Math.cos(angle) - x * Math.sin(angle)) / frame.boxH - beltOffset;
    const belt = Math.exp(-((across / beltWidth) ** 2));
    const soilNoise = fbm(x / f, y / f, seed + 11);
    const chernozem = clamp(0.06 + 0.86 * belt * (0.65 + 0.55 * soilNoise) + 0.18 * (fbm(x / (f * 0.4), y / (f * 0.4), seed + 12) - 0.5), 0, 1);
    const croplandShare = 0.2 + 0.7 * stretch(fbm(x / (f * 0.8), y / (f * 0.8), seed + 21));
    let popPerKm2 = 6 + 110 * stretch(fbm(x / f, y / f, seed + 31)) ** 2;
    for (const town of towns) popPerKm2 += town.peak * Math.exp(-((Math.hypot(x - town.x, y - town.y) / town.r) ** 2));
    // How strongly this spot is hit when the front is near (0.6 to 1.4).
    const texture = 0.6 + 0.8 * fbm(x / (f * 0.6), y / (f * 0.6), seed + 51);
    const fireTexture = 0.5 + fbm(x / (f * 0.5), y / (f * 0.5), seed + 41);
    const fireBackground = 0.6 * fbm(x / f, y / f, seed + 42);
    out.set(cell.id, { x, y, chernozem, croplandShare, popPerKm2, texture, fireTexture, fireBackground });
  }
  return out;
}

// ---------- The parts that change each month ----------

// How hard the war has hit by month t: rises quickly at first, then slowly.
// It never goes down.
const growth = (t) => 0.6 + 0.4 * (1 - Math.exp(-t / 36));

// The share of damaged land repaired by month t: very small and slow.
const repaired = (t) => 0.08 * (1 - Math.exp(-t / 240));

// New damage spots for month m, along that month's front where it crosses
// the area.
function eventsFor(frame, m, seed) {
  const random = seededRandom(seed ^ Math.imul(m + 1, 0x51ed27));
  const radius = clamp(frame.diagKm / 40, 0.03, 15);
  const pieces = segmentsInBox(frame, frontLine(frame, m, frame.ukraine ? 804 : seed), radius * 3);
  const length = pieces.reduce((sum, piece) => sum + piece.len, 0);
  const rate = 2 + random() * 2;
  if (length <= 0) return [];
  // About 2 to 4 a month along a long front; fewer along a short piece.
  const count = Math.floor(rate * clamp(length / 600, 0.2, 1) + random());
  const jitter = Math.min(60, frame.boxW * 0.4);
  return Array.from({ length: count }, () => {
    // A point picked evenly along the pieces of front inside the area.
    let along = random() * length;
    let piece = pieces[pieces.length - 1];
    for (const candidate of pieces) {
      if (along <= candidate.len) {
        piece = candidate;
        break;
      }
      along -= candidate.len;
    }
    const share = piece.len > 0 ? clamp(along / piece.len, 0, 1) : 0;
    return {
      x: lerp(piece.ax, piece.bx, share) + (random() - 0.5) * jitter,
      y: lerp(piece.ay, piece.by, share),
      r: radius * (0.6 + 0.8 * random()),
      magnitude: 0.03 + 0.07 * random(),
    };
  });
}

// Share of a cell's cropland that is heavily damaged, from its mean
// health-index drop (an S-curve centred on the heavy-damage threshold).
function heavyShareFrom(chiDrop) {
  const s = (z) => 1 / (1 + Math.exp(-z));
  const floor = s(-HEAVY_DAMAGE_CHI_DROP / 0.025);
  return clamp((s((chiDrop - HEAVY_DAMAGE_CHI_DROP) / 0.025) - floor) / (1 - floor), 0, 1);
}

// Everything that changes, for every cell, in month t.
// damage: the built-up health-index drop (never falls month to month).
// cellKm widens the damage bands for very big cells (a 1° cell is ~100 km
// wide), so big countries do not flicker from month to month.
function monthFields(statics, frame, month, seed, cellKm) {
  if (!frame.conflict) return peaceFields(statics, frame, month, seed);
  // A month that ends before the war began (a war set from a later day):
  // no front yet and no war damage counted, as on Earth Engine (no damage
  // window: no war year of fires, no war season of radar). Before, warMonth
  // stopped at 0, so such a month drew the war's first front.
  if (endsBeforeWar(month, frame.conflict)) return peaceFields(statics, frame, month, seed, { counted: false });
  const t = warMonth(month, frame.conflict.since);
  const lineSeed = frame.ukraine ? 804 : seed;
  const line = frontLine(frame, t, lineSeed);
  // Everywhere the front has ever been: damage stays behind.
  const pastLines = [];
  for (let m = 0; m < t; m += 1) pastLines.push(frontLine(frame, m, lineSeed));
  const monthSeed = seed ^ hashString(month);
  const band = Math.max(0, cellKm * 0.6);
  const events = [];
  for (let m = 0; m <= t; m += 1) {
    for (const event of eventsFor(frame, m, seed)) events.push({ ...event, r: Math.max(event.r, cellKm * 0.7) });
  }
  const reach = frame.reachKm;
  const f = frame.featureKm;
  const g = growth(t);
  const out = new Map();
  for (const [id, cell] of statics) {
    const { x, y } = cell;
    const conflictKm = distanceToLine(x, y, line);
    let footprintKm = conflictKm;
    for (const past of pastLines) footprintKm = Math.min(footprintKm, distanceToLine(x, y, past));
    // Damage from new spots adds up, but no single place passes ~0.12.
    let spots = 0;
    let spotFires = 0;
    for (const event of events) {
      const d = Math.hypot(x - event.x, y - event.y);
      if (d < event.r * 3) {
        const hit = event.magnitude * Math.exp(-((d / event.r) ** 2));
        spots += hit;
        spotFires += 60 * hit;
      }
    }
    // Shelling: each month some patches near the front (sized to the area,
    // so a farm gets field-sized ones) take a little more damage.
    const nearChi = Math.exp(-footprintKm / (reach * 1.27 + band));
    let shelling = 0;
    for (let m = 0; m <= t; m += 1) {
      const patch = clamp((fbm(x / (f * 0.35), y / (f * 0.35), seed + 9001 + m * 131, 2) - 0.6) / 0.15, 0, 1);
      shelling += 0.015 * patch * nearChi;
    }
    // Right by the front (the first few km) the land is hit hardest.
    const closeChi = Math.exp(-footprintKm / (reach * 0.18 + band * 0.3));
    const damage =
      0.075 * nearChi * cell.texture * g +
      0.1 * closeChi * cell.texture +
      0.12 * (1 - Math.exp(-spots / 0.12)) +
      0.04 * (1 - Math.exp(-shelling / 0.04));
    // Fire detections since the war began: they only add up.
    const near = Math.exp(-footprintKm / (reach + band));
    const fires = 45 * near * cell.fireTexture * g + cell.fireBackground * Math.min(1, t / 24) * 1.5 + spotFires;
    // The reading itself wobbles a little month to month (weather, cloud).
    const chiDrop = clamp(damage + 0.012 * (fbm(x / (f * 0.5), y / (f * 0.5), monthSeed + 52) - 0.5), -0.05, 0.6);
    const heavyShare = heavyShareFrom(damage) * (1 - repaired(t));
    // Radar change of the season: about 0.3 dB on ordinary land, several dB
    // where the land was hit.
    const radarDb = clamp(0.3 + 22 * damage + 0.1 * (fbm(x / f, y / f, seed + 77) - 0.5), 0, 8);
    const flicker = 0.9 + 0.2 * hash3(Math.round(x * 10), Math.round(y * 10), monthSeed);
    const lights = clamp((0.3 + cell.popPerKm2 / 25) * (0.35 + 0.65 * Math.min(1, conflictKm / 60)) * flicker, 0, 80);
    out.set(id, { conflictKm, fires, chiDrop, radarDb, heavyShare, lights });
  }
  return out;
}

// At peace: no front and no war damage. The health index only wobbles a
// little month to month (weather, cloud), well under the heavy-damage
// line, and a few stray fires (above the normal rate) show here and there.
//   counted  false for a month before its war began: no fire or radar
//            reading counts as damage then (no damage window)
function peaceFields(statics, frame, month, seed, { counted = true } = {}) {
  const monthSeed = seed ^ hashString(month);
  const f = frame.featureKm;
  const out = new Map();
  for (const [id, cell] of statics) {
    const { x, y } = cell;
    const chiDrop = clamp(0.012 * (fbm(x / (f * 0.5), y / (f * 0.5), monthSeed + 52) - 0.5), -0.05, 0.6);
    const fires = counted ? 0.4 * cell.fireBackground : 0;
    const radarDb = counted ? clamp(0.3 + 0.4 * (fbm(x / f, y / f, seed + 77) - 0.5), 0, 0.6) : null;
    const flicker = 0.9 + 0.2 * hash3(Math.round(x * 10), Math.round(y * 10), monthSeed);
    const lights = clamp((0.3 + cell.popPerKm2 / 25) * flicker, 0, 80);
    out.set(id, { conflictKm: PEACE_KM, fires, chiDrop, radarDb, heavyShare: 0, lights });
  }
  return out;
}

// ---------- Alerts ----------

// Picks the strongest cells for one kind of alert, keeping them apart so
// one hot patch does not take every slot.
function pickAlerts(candidates, kind, unit, count, cellSizeDeg, month, seed) {
  const sorted = candidates.filter((item) => item.magnitude > 0).sort((a, b) => b.magnitude - a.magnitude);
  const picked = [];
  const minGap = cellSizeDeg * 2.5;
  for (const item of sorted) {
    if (picked.length >= count) break;
    if (picked.some((other) => Math.abs(other.lat - item.lat) < minGap && Math.abs(other.lon - item.lon) < minGap)) continue;
    picked.push(item);
  }
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return picked.map((item, i) => {
    // Neighbouring cells that changed at least half as much join the alert.
    const near = sorted.filter(
      (other) => Math.abs(other.lat - item.lat) <= cellSizeDeg * 1.01 && Math.abs(other.lon - item.lon) <= cellSizeDeg * 1.01 && other.magnitude >= item.magnitude * 0.5
    );
    const magnitude = near.reduce((sum, other) => sum + other.magnitude, 0);
    const day = 1 + Math.floor(hash3(i, kind.length, seed ^ hashString(month)) * daysInMonth);
    return {
      id: `${kind}-${i + 1}`,
      kind,
      date: `${month}-${String(Math.min(day, daysInMonth)).padStart(2, "0")}`,
      lat: item.lat,
      lon: item.lon,
      place: formatCoord(item.lat, item.lon),
      cellIds: near.map((other) => other.id),
      magnitude: kind === "fire" ? Math.round(magnitude) : Math.round(magnitude * 100) / 100,
      unit,
    };
  });
}

// ---------- The provider ----------

function previousMonth(month) {
  const [year, mon] = month.split("-").map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
}

// The box around some cells, [west, south, east, north].
function cellsBox(cells) {
  const lats = cells.map((cell) => cell.lat);
  const lons = cells.map((cell) => cell.lon);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

// Readings for every cell of an area in one month (also used by tests).
//   conflict  the known war covering the area ({ id, name, since }) or null;
//             looked up from the area when not given (the team's choice for
//             it, area.war, first; else the app's list)
export function sampleReadings({ area, cells, month, cellSizeDeg, conflict: givenConflict }) {
  const conflict = cleanConflict(
    givenConflict !== undefined ? givenConflict : cells.length ? conflictForArea({ countryId: area.countryId, bbox: area.bbox || cellsBox(cells), cells, war: area.war, areaId: area.id }) : null
  );
  const sampleWarning = "Sample data: made-up values for trying the app, not satellite measurements.";
  if (!cells.length) return { readings: [], alerts: [], warnings: [sampleWarning], conflict };
  const seed = hashString(String(area.id));
  // A war that covers the area only in part: its squares (null: all),
  // those that touch its boxes or lie in another listed war, as on Earth
  // Engine.
  const warCells = warCellsFor(conflict, cells, cellSizeDeg);
  const frame = makeFrame(area, cells, conflict, warCells ? cells.filter((cell) => warCells.has(cell.id)) : null);
  const statics = staticFields(area, cells, frame, seed);
  const cellKm = (cellSizeDeg || 0) * frame.kx;
  // Outside the war's squares: the readings of peace, with the distance to
  // the front in the war's squares (300 km when there are none). A
  // month before the war began has no war readings anywhere already.
  const fieldsFor = (m) => {
    const fields = monthFields(statics, frame, m, seed, cellKm);
    if (!warCells || endsBeforeWar(m, conflict)) return fields;
    for (const [id, calm] of peaceFields(statics, frame, m, seed)) {
      if (!warCells.has(id)) fields.set(id, { ...calm, conflictKm: warCells.size ? fields.get(id).conflictKm : PEACE_KM });
    }
    return fields;
  };
  const now = fieldsFor(month);
  const before = fieldsFor(previousMonth(month));
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));

  const readings = [];
  const radar = [];
  const fire = [];
  for (const [id, base] of statics) {
    const cell = cellById.get(id);
    const m = now.get(id);
    const p = before.get(id);
    const cellKm2 = (cell.areaHa || 0) / 100;
    readings.push({
      id,
      chernozem: base.chernozem,
      croplandShare: base.croplandShare,
      firesPer100Km2: m.fires,
      chiDrop: m.chiDrop,
      radarDb: m.radarDb === null ? null : Math.round(m.radarDb * 100) / 100,
      conflictKm: m.conflictKm,
      popPerKm2: base.popPerKm2,
      lights: m.lights,
      heavyShare: m.heavyShare,
      population: base.popPerKm2 * cellKm2,
      ...(warCells ? { atWar: warCells.has(id) } : {}),
    });
    // Radar: cropland newly heavily damaged since last month (km²).
    // Fire: new detections.
    const changed = Math.max(0, m.heavyShare - p.heavyShare) * cellKm2 * base.croplandShare;
    radar.push({ id, lat: cell.lat, lon: cell.lon, magnitude: changed });
    fire.push({ id, lat: cell.lat, lon: cell.lon, magnitude: Math.max(0, m.fires - p.fires) * (cellKm2 / 100) });
  }

  const radarAlerts = pickAlerts(radar.filter((item) => item.magnitude >= 0.01), "radar", "km² changed", 3, cellSizeDeg, month, seed);
  const fireAlerts = pickAlerts(fire.filter((item) => item.magnitude >= 0.5), "fire", "detections", 3, cellSizeDeg, month, seed);
  // Strongest first: compare each alert with the strongest of its kind.
  const top = (list) => Math.max(1e-9, ...list.map((alert) => alert.magnitude));
  const radarTop = top(radarAlerts);
  const fireTop = top(fireAlerts);
  const alerts = [...radarAlerts, ...fireAlerts]
    .filter((alert) => alert.magnitude > 0)
    .sort((a, b) => b.magnitude / (b.kind === "fire" ? fireTop : radarTop) - a.magnitude / (a.kind === "fire" ? fireTop : radarTop) || a.id.localeCompare(b.id))
    .slice(0, 6);

  // A month before its war began says so, and measures no distance to
  // fighting (as gee.js).
  const beforeWar = endsBeforeWar(month, conflict);
  return {
    readings,
    alerts,
    warnings: !conflict ? [sampleWarning, NO_WAR_WARNING] : beforeWar ? [sampleWarning, beforeWarWarning(conflict.since)] : [sampleWarning],
    conflict,
    accessSource: conflict && !beforeWar ? "fires" : "none",
  };
}

export function createSampleProvider() {
  return {
    id: "sample",
    label: "Sample data",
    async status() {
      return { ok: true, detail: "Sample data: made-up values for trying the app." };
    },
    async analyze({ area, cells, month, cellSizeDeg, onProgress, conflict }) {
      const result = sampleReadings({ area, cells, month, cellSizeDeg, conflict });
      onProgress?.(1);
      return result;
    },
  };
}

export const sampleProvider = createSampleProvider();
export default sampleProvider;
