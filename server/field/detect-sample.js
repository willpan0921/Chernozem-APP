// WHAT THIS FILE DOES
// Splits land into separate fields WITHOUT satellite imagery. The sample
// data source (server/providers/field-sample.js) uses it until Earth Engine
// is connected; Earth Engine finds the real field edges from imagery
// instead (server/providers/field-gee.js).
//
//   splitBoundary(geometry, { seed })      the user's land -> fields inside it
//   parcelsAround(lat, lon, radiusM, { seed })   a place -> 6 to 14 parcels around it
//
// How a boundary is split: the land is cut in two across its longer side
// (in the direction of the boundary's longest edge, the way fields usually
// line up), at 35-65% of the way along, leaving an 8-12 m strip for a farm
// road; each half is cut again until every piece is about 20-80 ha. Pieces
// are cut with half-planes; when a cut splits a bent (concave) piece into
// separate parts, each part goes on as a field of its own. Holes in the
// land (a pond, a village) are left out: a hole inside a field stays a hole
// in it, and a field that runs into a hole is trimmed back to the hole's
// convex outline. Slivers under 1 ha are dropped. The same land always
// gives the same fields.
//
// Both give back [{ geometry: GeoJSON Polygon (lon, lat), areaHa, centroid: [lat, lon] }].
// Plain arithmetic, tested in detect-sample.test.js.
//
// WHO EDITS IT
// Nobody, normally.

import { areaHa as sphericalAreaHa, polygonsOf } from "../geo.js";

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320;
export const TARGET_HA = { min: 20, max: 80 };
export const MIN_PIECE_HA = 1;
export const MAX_PIECES = 60;
const ROAD_M = { min: 8, max: 12 };

// A list of repeatable values from 0 to 1 (mulberry32).
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A number for a piece of text (FNV-1a).
export function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Flat metre coordinates around a point ----------

export function makeProjection(lat0, lon0) {
  const kx = M_PER_DEG_LON * Math.max(0.01, Math.cos((lat0 * Math.PI) / 180));
  const ky = M_PER_DEG_LAT;
  return {
    toXY: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky],
    toLonLat: ([x, y]) => [Math.round((lon0 + x / kx) * 1e7) / 1e7, Math.round((lat0 + y / ky) * 1e7) / 1e7],
  };
}

// Signed area (m²) of a ring of [x, y] (no repeated last point); > 0 = anticlockwise.
export function signedArea(ring) {
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

export function centroidXY(ring) {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-9) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// Keeps the part of ring where nx*x + ny*y <= c (Sutherland-Hodgman, one edge).
export function clipHalfPlane(ring, nx, ny, c) {
  const out = [];
  const inside = (p) => nx * p[0] + ny * p[1] <= c + 1e-9;
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const previous = ring[(i + ring.length - 1) % ring.length];
    const curIn = inside(current);
    const prevIn = inside(previous);
    if (curIn !== prevIn) {
      const dp = nx * previous[0] + ny * previous[1] - c;
      const dc = nx * current[0] + ny * current[1] - c;
      const t = dp / (dp - dc);
      out.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t]);
    }
    if (curIn) out.push(current);
  }
  return out;
}

// Keeps the part of ring where nx*x + ny*y <= c, as separate rings: a cut
// through a bent (concave) shape can leave two or more parts, which plain
// Sutherland-Hodgman clipping would join with zero-width bridges along the
// cut. Walks the ring into "inside chains" (from where it enters the
// half-plane to where it leaves), then joins each chain's exit to the entry
// next to it along the cut line (the cut line is inside the shape between
// the 1st and 2nd crossing, the 3rd and 4th, ...).
const CUT_EPS = 1e-7;
export function clipHalfPlaneParts(ring, nx, ny, c) {
  const n = ring.length;
  if (n < 3) return [];
  const d = ring.map(([x, y]) => nx * x + ny * y - c);
  // A corner exactly on the cut counts as outside, so every crossing is a
  // real change of side.
  const inside = d.map((value) => value < -CUT_EPS);
  if (inside.every(Boolean)) return [ring.slice()];
  if (!inside.some(Boolean)) return [];
  const start = inside.indexOf(false);
  const ux = -ny;
  const uy = nx;
  const along = ([x, y]) => x * ux + y * uy;
  const chains = [];
  let chain = null;
  for (let k = 1; k <= n; k += 1) {
    const i = (start + k) % n;
    const prev = (start + k - 1) % n;
    if (inside[i] !== inside[prev]) {
      const t = d[prev] / (d[prev] - d[i]);
      const a = ring[prev];
      const b = ring[i];
      const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (inside[i]) chain = { points: [point], entry: along(point) };
      else {
        chain.points.push(point);
        chain.exit = along(point);
        chains.push(chain);
        chain = null;
      }
    }
    if (inside[i]) chain.points.push(ring[i]);
  }
  const ends = chains.flatMap((item) => [
    { at: item.entry, entry: true, chain: item },
    { at: item.exit, entry: false, chain: item },
  ]);
  ends.sort((a, b) => a.at - b.at || (a.entry === b.entry ? 0 : a.entry ? 1 : -1));
  const next = new Map();
  for (let i = 0; i + 1 < ends.length; i += 2) {
    const [a, b] = [ends[i], ends[i + 1]];
    if (a.entry === b.entry) return [clipHalfPlane(ring, nx, ny, c)]; // numerically odd: fall back
    const exit = a.entry ? b : a;
    const entry = a.entry ? a : b;
    next.set(exit.chain, entry.chain);
  }
  const parts = [];
  const used = new Set();
  for (const first of chains) {
    if (used.has(first)) continue;
    const part = [];
    let current = first;
    for (let guard = 0; guard <= chains.length; guard += 1) {
      used.add(current);
      part.push(...current.points);
      current = next.get(current);
      if (!current || current === first) break;
      if (used.has(current)) return [clipHalfPlane(ring, nx, ny, c)];
    }
    const clean = part.filter((p, i) => {
      const q = part[(i + part.length - 1) % part.length];
      return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
    });
    if (clean.length >= 3 && Math.abs(signedArea(clean)) > 1e-6) parts.push(clean);
  }
  return parts;
}

// The convex hull of points (anticlockwise), Andrew's monotone chain.
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function pointInRingXY([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// True when any edge of ring a crosses or touches an edge of ring b.
function ringsCross(a, b) {
  const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  for (let i = 0; i < a.length; i += 1) {
    const p1 = a[i];
    const p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j += 1) {
      const q1 = b[j];
      const q2 = b[(j + 1) % b.length];
      if (orient(p1, p2, q1) * orient(p1, p2, q2) <= 0 && orient(q1, q2, p1) * orient(q1, q2, p2) <= 0) {
        const [minA, maxA] = [Math.min(p1[0], p2[0]), Math.max(p1[0], p2[0])];
        const [minB, maxB] = [Math.min(q1[0], q2[0]), Math.max(q1[0], q2[0])];
        const [minAy, maxAy] = [Math.min(p1[1], p2[1]), Math.max(p1[1], p2[1])];
        const [minBy, maxBy] = [Math.min(q1[1], q2[1]), Math.max(q1[1], q2[1])];
        if (maxA >= minB && maxB >= minA && maxAy >= minBy && maxBy >= minAy) return true;
      }
    }
  }
  return false;
}

const ringBox = (ring) => [
  Math.min(...ring.map((p) => p[0])),
  Math.min(...ring.map((p) => p[1])),
  Math.max(...ring.map((p) => p[0])),
  Math.max(...ring.map((p) => p[1])),
];
const boxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// Takes a hole (ring, metres) out of pieces [{ ring, holes }]:
//   - a hole well inside a piece becomes a hole in it;
//   - a piece inside the hole is dropped;
//   - a piece that runs into the hole is cut back to the hole's convex
//     outline (it may fall into a few parts; each is a field of its own).
export function removeHole(pieces, hole) {
  const holeBox = ringBox(hole);
  const out = [];
  for (const piece of pieces) {
    if (!boxesMeet(ringBox(piece.ring), holeBox)) {
      out.push(piece);
      continue;
    }
    const crosses = ringsCross(piece.ring, hole);
    if (!crosses && hole.every((p) => pointInRingXY(p, piece.ring))) {
      out.push({ ring: piece.ring, holes: [...piece.holes, hole] });
      continue;
    }
    if (!crosses && piece.ring.every((p) => pointInRingXY(p, hole))) continue;
    if (!crosses) {
      out.push(piece);
      continue;
    }
    const hull = convexHull(hole);
    let rest = [piece.ring];
    const kept = [];
    for (let i = 0; i < hull.length; i += 1) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      // n.p <= c is the hull's side of this edge (the hull is anticlockwise).
      const nx = b[1] - a[1];
      const ny = -(b[0] - a[0]);
      const c = nx * a[0] + ny * a[1];
      kept.push(...rest.flatMap((ring) => clipHalfPlaneParts(ring, -nx, -ny, -c)));
      rest = rest.flatMap((ring) => clipHalfPlaneParts(ring, nx, ny, c));
    }
    for (const ring of kept) out.push({ ring, holes: piece.holes.filter((h) => pointInRingXY(h[0], ring)) });
  }
  return out;
}

// The direction (radians) of the longest edge of a ring.
function mainDirection(ring) {
  let best = 0;
  let angle = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length > best) {
      best = length;
      angle = Math.atan2(y2 - y1, x2 - x1);
    }
  }
  return angle;
}

// Cuts one ring (metres) into pieces. angle = the direction fields line up in.
function splitRing(ring, angle, random, { minHa = TARGET_HA.min, maxHa = TARGET_HA.max } = {}) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  const pieces = [];
  const visit = (piece, depth) => {
    const ha = Math.abs(signedArea(piece)) / 1e4;
    if (ha < MIN_PIECE_HA) return;
    // Each piece stops at its own size somewhere in the target range.
    const stopAt = minHa + random() * (maxHa - minHa);
    // A piece is only cut when both halves can still be at least minHa.
    if (ha <= stopAt || ha < 2.2 * minHa || depth > 14) {
      pieces.push(piece);
      return;
    }
    const us = piece.map(([x, y]) => x * ux + y * uy);
    const vs = piece.map(([x, y]) => x * vx + y * vy);
    const uMin = Math.min(...us);
    const uMax = Math.max(...us);
    const vMin = Math.min(...vs);
    const vMax = Math.max(...vs);
    // Cut across the longer side.
    const alongU = uMax - uMin >= vMax - vMin;
    const [nx, ny, low, high] = alongU ? [ux, uy, uMin, uMax] : [vx, vy, vMin, vMax];
    const cut = low + (high - low) * (0.35 + 0.3 * random());
    const half = (ROAD_M.min + random() * (ROAD_M.max - ROAD_M.min)) / 2;
    // Each side of the cut may be more than one part (a bent piece).
    for (const part of clipHalfPlaneParts(piece, nx, ny, cut - half)) visit(part, depth + 1);
    for (const part of clipHalfPlaneParts(piece, -nx, -ny, -(cut + half))) visit(part, depth + 1);
  };
  visit(ring, 0);
  return pieces;
}

// A ring (lon, lat) -> metres, without the repeated last point, turned
// anticlockwise.
function ringXY(lonLatRing, projection) {
  const ring = (lonLatRing || []).map(projection.toXY);
  if (ring.length > 1) {
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) ring.pop();
  }
  return signedArea(ring) < 0 ? ring.reverse() : ring;
}

const closedLonLat = (ring, projection) => {
  const coordinates = ring.map(projection.toLonLat);
  coordinates.push([...coordinates[0]]);
  return coordinates;
};

// Pieces (metres; a ring, or { ring, holes }) -> the candidate list,
// largest first, at most MAX_PIECES.
function toCandidates(pieces, projection) {
  return pieces
    .map((piece) => {
      const { ring: raw, holes = [] } = Array.isArray(piece) ? { ring: piece } : piece;
      const ring = signedArea(raw) < 0 ? [...raw].reverse() : raw;
      // Outer ring anticlockwise, holes clockwise (GeoJSON's right-hand rule).
      const inner = holes.map((hole) => (signedArea(hole) > 0 ? [...hole].reverse() : hole));
      const geometry = { type: "Polygon", coordinates: [closedLonLat(ring, projection), ...inner.map((hole) => closedLonLat(hole, projection))] };
      // The middle of the land that is left (holes taken away).
      const parts = [[ring, Math.abs(signedArea(ring))], ...inner.map((hole) => [hole, -Math.abs(signedArea(hole))])];
      const weight = parts.reduce((sum, [, a]) => sum + a, 0);
      const middle = weight > 0
        ? [0, 1].map((k) => parts.reduce((sum, [r, a]) => sum + centroidXY(r)[k] * a, 0) / weight)
        : centroidXY(ring);
      const [lon, lat] = projection.toLonLat(middle);
      return { geometry, areaHa: Math.round(sphericalAreaHa(geometry) * 100) / 100, centroid: [lat, lon] };
    })
    .filter((candidate) => candidate.areaHa >= MIN_PIECE_HA)
    .sort((a, b) => b.areaHa - a.areaHa)
    .slice(0, MAX_PIECES);
}

// The user's land (GeoJSON Polygon or MultiPolygon, lon/lat) -> fields inside it.
// Very large land gets larger pieces, so it still ends up as at most 60.
export function splitBoundary(geometry, { seed = 0 } = {}) {
  const polygons = polygonsOf(geometry);
  if (!polygons.length) return [];
  const all = polygons.flatMap((polygon) => polygon[0] || []);
  const lat0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const lon0 = all.reduce((s, p) => s + p[0], 0) / all.length;
  const projection = makeProjection(lat0, lon0);
  const totalHa = sphericalAreaHa(geometry);
  const scale = Math.max(1, totalHa / (MAX_PIECES * 50));
  const random = seeded(hashText(`${seed}:${lat0.toFixed(5)}:${lon0.toFixed(5)}`));
  const pieces = [];
  for (const polygon of polygons) {
    const ring = ringXY(polygon[0], projection);
    if (ring.length < 3) continue;
    let parts = splitRing(ring, mainDirection(ring), random, { minHa: TARGET_HA.min * scale, maxHa: TARGET_HA.max * scale }).map((piece) => ({ ring: piece, holes: [] }));
    for (const hole of polygon.slice(1).map((h) => ringXY(h, projection)).filter((h) => h.length >= 3)) parts = removeHole(parts, hole);
    pieces.push(...parts);
  }
  return toCandidates(pieces, projection);
}

// A place (lat, lon) -> a patchwork of 6 to 14 parcels around it.
export function parcelsAround(lat, lon, radiusM = 1200, { seed = 0 } = {}) {
  const projection = makeProjection(lat, lon);
  const random = seeded(hashText(`${seed}:${lat.toFixed(4)}:${lon.toFixed(4)}:${Math.round(radiusM)}`));
  const angle = random() * (Math.PI / 2);
  const wanted = 6 + Math.floor(random() * 9); // 6..14
  const circleHa = (Math.PI * radiusM * radiusM) / 1e4;
  // Parcels stay field-sized (at most ~120 ha) even for a wide circle.
  const pieceHa = Math.min(circleHa / wanted, 120);
  const r = Math.min(radiusM * 1.25, Math.sqrt(pieceHa * 1e4 * 18) / 2 + 200);
  const square = [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ].map(([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]);
  const pieces = splitRing(square, angle, random, { minHa: Math.max(MIN_PIECE_HA * 1.5, pieceHa * 0.6), maxHa: Math.max(MIN_PIECE_HA * 2, pieceHa * 1.4) });
  const byDistance = pieces
    .map((piece) => ({ piece, d: Math.hypot(...centroidXY(piece)) }))
    .sort((a, b) => a.d - b.d);
  let kept = byDistance.filter((item) => item.d <= radiusM);
  if (kept.length < 6) kept = byDistance.slice(0, 6);
  return toCandidates(kept.slice(0, 14).map((item) => item.piece), projection);
}
