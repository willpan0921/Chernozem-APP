// WHAT THIS FILE DOES
// Small map sums for the Field pages, on GeoJSON outlines (lon, lat), so
// the pages themselves are only screens:
//
//   pointInGeometry(lon, lat, geometry)    inside a Polygon/MultiPolygon (holes count as outside)
//   outerRing(geometry)                    the largest outline as [[lat, lon], ...] (not closed)
//   centroid(geometry)                     [lat, lon] in the middle of the largest outline
//   metresBetween([lat, lon], [lat, lon])  straight-line distance in metres
//   areaHa(geometry)                       area in hectares
//   overlap(a, b)                          { sharedHa, iou } how much two outlines share
//   overlappingFields(geometry, fields)    the fields a drawn outline covers part of
//   matchFields(candidates, fields)        each found field -> the current field it mostly is (IoU ≥ 0.5)
//   planFieldsToSave(chosen, fields)       the fields to send when saving found fields:
//                                          names and crops kept for a good match, the rest
//                                          numbered north-west to south-east, sorted by name
//   compareNames("Field 2", "Field 10")    a sort that puts Field 2 before Field 10
//   redetectBody(farm)                     what "Find fields again" asks the server for
//
// "Mostly the same field" means IoU (shared area ÷ combined area) of at
// least SAME_FIELD_IOU. Overlap is measured by sampling a fine grid over
// the place both outlines cover, which is accurate to about 1% and works
// for any shape. Tested in geometry.test.js.
//
// WHO EDITS IT
// Whoever changes how the Field pages compare or name fields.

export const SAME_FIELD_IOU = 0.5;
// A drawn field may touch its neighbours along an edge, but not cover them.
export const OVERLAP_LIMIT = { ha: 0.2, share: 0.03 };
// "Find fields again" around a place: the server's radius limits.
export const REDETECT_RADIUS = { min: 300, max: 3000, margin: 150 };

const M_PER_DEG_LAT = 110570;
const M_PER_DEG_LON = 111320;

// ---------- Basics ----------

export function polygonsOf(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(lon, lat, geometry) {
  return polygonsOf(geometry).some(([outer, ...holes]) => outer && pointInRing(lon, lat, outer) && !holes.some((hole) => pointInRing(lon, lat, hole)));
}

// [west, south, east, north], or null.
export function bboxOf(geometry) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const [lon, lat] of polygon[0] || []) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

// Shoelace area of a ring of [lon, lat], in m², on a flat map at its latitude.
function ringAreaM2(ring) {
  if (!ring || ring.length < 3) return 0;
  const lat0 = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const kx = M_PER_DEG_LON * Math.cos((lat0 * Math.PI) / 180);
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += ring[j][0] * kx * ring[i][1] * M_PER_DEG_LAT - ring[i][0] * kx * ring[j][1] * M_PER_DEG_LAT;
  }
  return Math.abs(twice) / 2;
}

export function areaHa(geometry) {
  let m2 = 0;
  for (const [outer, ...holes] of polygonsOf(geometry)) {
    m2 += ringAreaM2(outer) - holes.reduce((sum, hole) => sum + ringAreaM2(hole), 0);
  }
  return m2 / 1e4;
}

function largestRing(geometry) {
  let best = null;
  let bestArea = -1;
  for (const polygon of polygonsOf(geometry)) {
    const ring = polygon?.[0];
    if (!ring || ring.length < 4) continue;
    const area = ringAreaM2(ring);
    if (area > bestArea) {
      best = ring;
      bestArea = area;
    }
  }
  return best;
}

// The largest outline as [[lat, lon], ...], without the closing point.
export function outerRing(geometry) {
  const ring = largestRing(geometry);
  return ring ? ring.slice(0, -1).map(([lon, lat]) => [lat, lon]) : null;
}

// [lat, lon]: the average corner of the largest outline (the same middle
// the server uses to number fields).
export function centroid(geometry) {
  const ring = largestRing(geometry);
  if (!ring) return null;
  const points = ring.slice(0, -1);
  return [points.reduce((s, p) => s + p[1], 0) / points.length, points.reduce((s, p) => s + p[0], 0) / points.length];
}

export function metresBetween([lat1, lon1], [lat2, lon2]) {
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  const dx = (lon2 - lon1) * M_PER_DEG_LON * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

// ---------- Overlap ----------

// How much two outlines share: { sharedHa, iou }. A grid of samples x
// samples points over the box both cover; each point inside both counts.
export function overlap(a, b, { samples = 64, areaA, areaB } = {}) {
  const boxA = bboxOf(a);
  const boxB = bboxOf(b);
  const haA = areaA ?? areaHa(a);
  const haB = areaB ?? areaHa(b);
  if (!boxA || !boxB) return { sharedHa: 0, iou: 0 };
  const w = Math.max(boxA[0], boxB[0]);
  const s = Math.max(boxA[1], boxB[1]);
  const e = Math.min(boxA[2], boxB[2]);
  const n = Math.min(boxA[3], boxB[3]);
  if (w >= e || s >= n) return { sharedHa: 0, iou: 0 };
  const dx = (e - w) / samples;
  const dy = (n - s) / samples;
  let hits = 0;
  for (let row = 0; row < samples; row += 1) {
    const lat = s + (row + 0.5) * dy;
    for (let col = 0; col < samples; col += 1) {
      const lon = w + (col + 0.5) * dx;
      if (pointInGeometry(lon, lat, a) && pointInGeometry(lon, lat, b)) hits += 1;
    }
  }
  const boxHa = areaHa({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const sharedHa = (hits / (samples * samples)) * boxHa;
  const union = haA + haB - sharedHa;
  return { sharedHa, iou: union > 0 ? Math.min(1, sharedHa / union) : 0 };
}

// The fields a new outline covers more than an edge of:
//   -> [{ field, sharedHa }], biggest overlap first.
export function overlappingFields(geometry, fields = [], limit = OVERLAP_LIMIT) {
  const ha = areaHa(geometry);
  const out = [];
  for (const field of fields) {
    if (!field?.geometry) continue;
    const fieldHa = Number.isFinite(field.areaHa) ? field.areaHa : areaHa(field.geometry);
    const { sharedHa } = overlap(geometry, field.geometry, { areaA: ha, areaB: fieldHa });
    if (sharedHa >= limit.ha || sharedHa >= limit.share * Math.min(ha, fieldHa)) out.push({ field, sharedHa });
  }
  return out.sort((x, y) => y.sharedHa - x.sharedHa);
}

// Each found field -> the current field it mostly is, one to one, best
// matches first:  Map(candidateId -> { field, iou }).
export function matchFields(candidates = [], fields = [], minIou = SAME_FIELD_IOU) {
  const pairs = [];
  for (const candidate of candidates) {
    for (const field of fields) {
      if (!candidate?.geometry || !field?.geometry) continue;
      const { iou } = overlap(candidate.geometry, field.geometry, { areaA: candidate.areaHa, areaB: field.areaHa });
      if (iou >= minIou) pairs.push({ candidate, field, iou });
    }
  }
  pairs.sort((x, y) => y.iou - x.iou);
  const matches = new Map();
  const used = new Set();
  for (const { candidate, field, iou } of pairs) {
    if (matches.has(candidate.id) || used.has(field.id)) continue;
    matches.set(candidate.id, { field, iou });
    used.add(field.id);
  }
  return matches;
}

// ---------- Names ----------

export const compareNames = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });

// North-west first, then towards the south-east (the server's order).
export function orderNorthWestFirst(items, middleOf) {
  const points = items.map((item) => ({ item, c: middleOf(item) || [0, 0] }));
  const lat0 = points.reduce((s, p) => s + p.c[0], 0) / (points.length || 1);
  const kx = Math.cos((lat0 * Math.PI) / 180);
  return points.sort((a, b) => b.c[0] - a.c[0] - kx * (b.c[1] - a.c[1]) || b.c[0] - a.c[0]).map((p) => p.item);
}

// The fields to send when saving found fields over the current ones:
// a found field that is mostly a current field keeps its name and crop;
// the others get the lowest free "Field N", north-west first; the list is
// sorted by name.  -> { fields: [{ geometry, source, name, crop? }], kept }
export function planFieldsToSave(chosen = [], fields = []) {
  const matches = matchFields(chosen, fields);
  const planned = chosen.map((candidate) => {
    const old = matches.get(candidate.id)?.field;
    const item = { geometry: candidate.geometry, source: "detected", name: old?.name || null };
    if (old?.crop) item.crop = old.crop;
    return item;
  });
  const taken = new Set(planned.filter((item) => item.name).map((item) => item.name.toLowerCase()));
  let n = 1;
  for (const item of orderNorthWestFirst(planned.filter((p) => !p.name), (p) => centroid(p.geometry))) {
    while (taken.has(`field ${n}`)) n += 1;
    item.name = `Field ${n}`;
    taken.add(`field ${n}`);
  }
  planned.sort((a, b) => compareNames(a.name, b.name));
  return { fields: planned, kept: matches.size };
}

// ---------- "Find fields again" ----------

// The farm's land when it has one; else a circle round its place (or the
// middle of its fields) that covers every field.
export function redetectBody(farm, radius = REDETECT_RADIUS) {
  const ring = outerRing(farm?.boundary);
  if (ring && ring.length >= 3) return { source: "boundary", points: ring };
  const corners = (farm?.fields || []).flatMap((field) => polygonsOf(field.geometry).flatMap((p) => (p[0] || []).map(([lon, lat]) => [lat, lon])));
  if (!corners.length) return null;
  const centre =
    farm.location && Number.isFinite(farm.location.lat) && Number.isFinite(farm.location.lon)
      ? [farm.location.lat, farm.location.lon]
      : [corners.reduce((s, p) => s + p[0], 0) / corners.length, corners.reduce((s, p) => s + p[1], 0) / corners.length];
  const far = Math.max(...corners.map((p) => metresBetween(centre, p)));
  const radiusM = Math.round(Math.min(radius.max, Math.max(radius.min, far + radius.margin)));
  return { source: "point", lat: centre[0], lon: centre[1], radiusM };
}
