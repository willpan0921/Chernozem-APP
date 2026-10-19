// WHAT THIS FILE DOES
// Map arithmetic for areas and grid cells. Coordinates follow GeoJSON:
// [longitude, latitude], and an area is a Polygon or MultiPolygon.
//
//   bboxOf(geometry)              [west, south, east, north]
//   bboxAreaKm2(bbox)             the box's area in km²
//   areaHa(geometry)              the area in hectares (on the round Earth)
//   pointInGeometry(lon, lat, g)  is a point inside? (holes count as outside)
//   chooseCellSize(km², lat)      grid cell size so an area gets ~150-1500 cells
//   planGrid(geometry)            the grid cells (squares) whose centre is inside
//   simplifyGeometry(g, tol)      fewer points, for drawing the outline
//   formatCoord(lat, lon)         "49.62° N, 37.74° E"
//
// Plain arithmetic, tested in geo.test.js.
//
// WHO EDITS IT
// Nobody, normally.

const EARTH_RADIUS_M = 6378137;
const KM_PER_DEG = 111.32;
const rad = (deg) => (deg * Math.PI) / 180;

// Cell sizes (degrees) the grid may use, from a farm up to a continent.
export const CELL_LADDER = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2];
export const MAX_CELLS = 1500;
export const MIN_CELLS = 150;

// The largest box (km²) the Field searches for fields in one go. Earth
// Engine's field detection and the /api/farm/detect check both use it.
export const FIELD_SEARCH_MAX_KM2 = 400;

// The area of a [west, south, east, north] box in km² (flat-Earth, fine
// for a farm-sized box).
export function bboxAreaKm2([w, s, e, n]) {
  const lat = (s + n) / 2;
  return (e - w) * KM_PER_DEG * Math.cos(rad(lat)) * (n - s) * 110.57;
}

// Every polygon of a geometry as a list of rings: [[outer, hole, ...], ...].
export function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  if (geometry.type === "Feature") return polygonsOf(geometry.geometry);
  return [];
}

export function bboxOf(geometry) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const [lon, lat] of polygon[0] || []) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

// Area of one ring in square metres (the formula used by d3-geo and turf).
export function ringAreaM2(ring) {
  const count = ring.length;
  if (count < 3) return 0;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % count];
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function areaHa(geometry) {
  let m2 = 0;
  for (const polygon of polygonsOf(geometry)) {
    const [outer, ...holes] = polygon;
    m2 += ringAreaM2(outer || []);
    for (const hole of holes) m2 -= ringAreaM2(hole);
  }
  return Math.max(0, m2 / 10000);
}

// Ray casting: counts how often a line going east from the point crosses
// the ring's edges. An odd count means inside.
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lon, lat, polygon) {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(lon, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lon, lat, hole));
}

export function pointInGeometry(lon, lat, geometry) {
  return polygonsOf(geometry).some((polygon) => pointInPolygon(lon, lat, polygon));
}

// Area of one grid cell in km² at a latitude.
export function cellAreaKm2(sizeDeg, lat) {
  return (sizeDeg * KM_PER_DEG) ** 2 * Math.max(0.01, Math.cos(rad(lat)));
}

// Width of a cell in km at a latitude (east-west).
export function cellSizeKm(sizeDeg, lat) {
  return sizeDeg * KM_PER_DEG * Math.cos(rad(lat));
}

// The smallest cell size that keeps the area under MAX_CELLS cells.
export function chooseCellSize(areaKm2, lat) {
  for (const size of CELL_LADDER) {
    if (areaKm2 / cellAreaKm2(size, lat) <= MAX_CELLS) return size;
  }
  return CELL_LADDER[CELL_LADDER.length - 1];
}

const round = (value, digits) => Number(value.toFixed(digits));

// The cells of one grid whose centre falls inside the geometry. Rows count
// from the north edge of the bbox, columns from the west edge, so ids like
// "r12c40" tell neighbours apart.
export function gridCells(geometry, bbox, sizeDeg) {
  const [west, , , north] = bbox;
  const digits = sizeDeg < 0.001 ? 6 : 5;
  const cells = new Map();
  for (const polygon of polygonsOf(geometry)) {
    const part = bboxOf({ type: "Polygon", coordinates: polygon });
    if (!part) continue;
    const colFrom = Math.max(0, Math.floor((part[0] - west) / sizeDeg));
    const colTo = Math.floor((part[2] - west) / sizeDeg);
    const rowFrom = Math.max(0, Math.floor((north - part[3]) / sizeDeg));
    const rowTo = Math.floor((north - part[1]) / sizeDeg);
    for (let row = rowFrom; row <= rowTo; row += 1) {
      const lat = north - (row + 0.5) * sizeDeg;
      if (lat < part[1] || lat > part[3]) continue;
      for (let col = colFrom; col <= colTo; col += 1) {
        const lon = west + (col + 0.5) * sizeDeg;
        if (lon < part[0] || lon > part[2]) continue;
        const id = `r${row}c${col}`;
        if (cells.has(id) || !pointInPolygon(lon, lat, polygon)) continue;
        cells.set(id, { id, row, col, lat: round(lat, digits), lon: round(lon, digits), areaHa: cellAreaKm2(sizeDeg, lat) * 100 });
      }
    }
  }
  return [...cells.values()];
}

// The grid for an area: picks the cell size, finds the cells inside, and
// scales the cell areas so they add up to the area itself (edge cells are
// only partly inside). Very small areas still get at least one cell.
export function planGrid(geometry) {
  const bbox = bboxOf(geometry);
  if (!bbox) throw new Error("The area has no outline.");
  const totalHa = areaHa(geometry);
  const midLat = (bbox[1] + bbox[3]) / 2;
  let index = CELL_LADDER.indexOf(chooseCellSize(totalHa / 100, midLat));
  let size = CELL_LADDER[index];
  let cells = gridCells(geometry, bbox, size);
  // The estimate can miss for odd shapes: step to bigger cells if needed.
  while (cells.length > MAX_CELLS && index < CELL_LADDER.length - 1) {
    index += 1;
    size = CELL_LADDER[index];
    cells = gridCells(geometry, bbox, size);
  }
  // ...or to smaller cells if a thin shape left too few.
  while (cells.length < MIN_CELLS && index > 0) {
    const smaller = gridCells(geometry, bbox, CELL_LADDER[index - 1]);
    if (smaller.length > MAX_CELLS) break;
    index -= 1;
    size = CELL_LADDER[index];
    cells = smaller;
  }
  if (cells.length === 0) {
    // Tiny area: keep the cell under the middle of the bbox.
    const lon = (bbox[0] + bbox[2]) / 2;
    const lat = (bbox[1] + bbox[3]) / 2;
    const col = Math.floor((lon - bbox[0]) / size);
    const row = Math.floor((bbox[3] - lat) / size);
    const cLat = bbox[3] - (row + 0.5) * size;
    const cLon = bbox[0] + (col + 0.5) * size;
    cells = [{ id: `r${row}c${col}`, row, col, lat: round(cLat, 6), lon: round(cLon, 6), areaHa: cellAreaKm2(size, cLat) * 100 }];
  }
  const gridHa = cells.reduce((sum, cell) => sum + cell.areaHa, 0);
  const factor = gridHa > 0 ? Math.min(4, Math.max(0.25, totalHa / gridHa)) : 1;
  for (const cell of cells) cell.areaHa *= factor;
  return {
    bbox,
    areaHa: totalHa,
    cellSizeDeg: size,
    cellSizeKm: round(cellSizeKm(size, midLat), 3),
    cells,
  };
}

// ---------- The 180° line ----------
// A few outlines (eastern Russia, Fiji) cross the 180° line, so their
// longitudes jump from 180 to -180 halfway round. Those rings are cut into
// a western and an eastern piece that each stay on one side, so areas,
// grids and maps work normally.

const POLE_LAT = 89.99;

// Removes the jumps: each point is moved by 360° if needed to stay next to
// the one before it. Edges along a pole (Antarctica) are left alone.
function unwrapRing(ring) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lon, lat] = ring[i];
    if (i > 0) {
      const [prevLon, prevLat] = ring[i - 1];
      const polar = Math.abs(lat) >= POLE_LAT && Math.abs(prevLat) >= POLE_LAT;
      const d = lon - prevLon;
      if (!polar && d > 180) offset -= 360;
      else if (!polar && d < -180) offset += 360;
    }
    out.push([lon + offset, lat]);
  }
  return out;
}

// Keeps the part of a ring on one side of the line lon = m.
function clipRing(ring, m, keepWest) {
  const out = [];
  const inside = (point) => (keepWest ? point[0] <= m : point[0] >= m);
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (m - a[0]) / (b[0] - a[0]);
      out.push([m, a[1] + t * (b[1] - a[1])]);
    }
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([...out[0]]);
  return out.length >= 4 ? out : null;
}

const shiftRing = (ring, by) => ring.map(([lon, lat]) => [lon + by, lat]);

export function splitAntimeridian(geometry) {
  const polygons = polygonsOf(geometry);
  let changed = false;
  const result = [];
  for (const polygon of polygons) {
    const outer = unwrapRing(polygon[0] || []);
    const lons = outer.map(([lon]) => lon);
    const min = Math.min(...lons);
    const max = Math.max(...lons);
    if (min >= -180 && max <= 180) {
      result.push(polygon);
      continue;
    }
    changed = true;
    const m = max > 180 ? 180 : -180;
    const holes = polygon.slice(1).map(unwrapRing);
    for (const keepWest of [true, false]) {
      const piece = clipRing(outer, m, keepWest);
      if (!piece) continue;
      // Bring the piece that is past the line back to the -180..180 range.
      const shift = m === 180 ? (keepWest ? 0 : -360) : keepWest ? 360 : 0;
      const pieceHoles = holes.map((hole) => clipRing(hole, m, keepWest)).filter(Boolean);
      result.push([piece, ...pieceHoles].map((ring) => shiftRing(ring, shift)));
    }
  }
  if (!changed) return geometry;
  return result.length === 1 ? { type: "Polygon", coordinates: result[0] } : { type: "MultiPolygon", coordinates: result };
}

// ---------- Simplify (for drawing only) ----------

// Douglas-Peucker on one ring. tolerance is in degrees.
function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = ring[first];
    const [bx, by] = ring[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = tol2;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = ring[i];
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

// A lighter copy of the geometry for the map outline. Rings that shrink to
// nothing (tiny islands) are dropped; if everything would go, the original
// is kept.
export function simplifyGeometry(geometry, tolerance) {
  const polygons = [];
  for (const polygon of polygonsOf(geometry)) {
    const outer = simplifyRing(polygon[0] || [], tolerance);
    if (outer.length < 4) continue;
    const holes = polygon.slice(1).map((ring) => simplifyRing(ring, tolerance)).filter((ring) => ring.length >= 4);
    polygons.push([outer, ...holes]);
  }
  if (!polygons.length) return geometry;
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

// A sensible outline tolerance for an area: about 1/2000 of its size.
export function displayTolerance(bbox) {
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  return span / 2000;
}

// 49.62, 37.74 -> "49.62° N, 37.74° E"
export function formatCoord(lat, lon, digits = 2) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}
