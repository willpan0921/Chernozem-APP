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
//   labelPoint(g)                 [lon, lat] well inside a shape, for its name
//   squaresOutline(cells, size)   one outline around a group of map squares
//   distanceToGeometry(lon, lat, g)  how far a point is from a shape (0 inside)
//   roundGeometry(g, digits)      the same shape with shorter numbers
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

// ---------- States and regions (server/units.js) ----------

// Signed area of a ring in plain degrees (positive: anticlockwise, with
// longitude to the right and latitude up). Only its sign and size relative
// to other rings are used.
function signedArea(ring) {
  let total = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) total += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return total / 2;
}

// Distance from a point to a segment, squared.
function segmentDistance2(px, py, [ax, ay], [bx, by]) {
  let x = ax;
  let y = ay;
  let dx = bx - x;
  let dy = by - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

// Distance from a point to the nearest edge of a polygon (rings in plain
// x, y): positive inside, negative outside.
function polygonDistance(x, y, rings) {
  let inside = false;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      best = Math.min(best, segmentDistance2(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(best);
}

// The distance (in degrees, east-west shrunk by the latitude) from a point
// to a geometry's nearest edge: 0 inside it. For squares just outside every
// state (the area's outline and the borders do not quite meet).
export function distanceToGeometry(lon, lat, geometry) {
  const k = Math.cos(rad(lat));
  let best = Infinity;
  for (const polygon of polygonsOf(geometry)) {
    if (pointInPolygon(lon, lat, polygon)) return 0;
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        best = Math.min(best, segmentDistance2(lon * k, lat, [ring[i][0] * k, ring[i][1]], [ring[j][0] * k, ring[j][1]]));
      }
    }
  }
  return Math.sqrt(best);
}

// A point well inside a shape, for its name on the map: the point farthest
// from every edge (the "pole of inaccessibility", Mapbox's polylabel
// method), in its largest polygon. Unlike the centre of the box, it is
// always inside, also for a crescent or a shape with a lake.
//   precision  how close to the best point is close enough, in degrees
//              (default: 1/100 of the shape's size)
// Gives back [lon, lat], or null for an empty geometry.
export function labelPoint(geometry, precision) {
  const polygons = polygonsOf(geometry).filter((polygon) => polygon[0]?.length >= 3);
  if (!polygons.length) return null;
  const size = (polygon) => Math.abs(signedArea(polygon[0])) - polygon.slice(1).reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
  const polygon = polygons.reduce((best, next) => (size(next) > size(best) ? next : best));
  const [west, south, east, north] = bboxOf({ type: "Polygon", coordinates: polygon });
  // East-west degrees are shorter away from the equator: work in a frame
  // where both are the same length, then go back.
  const k = Math.max(0.05, Math.cos(rad((south + north) / 2)));
  const rings = polygon.map((ring) => ring.map(([lon, lat]) => [lon * k, lat]));
  const minX = west * k;
  const maxX = east * k;
  const width = maxX - minX;
  const height = north - south;
  const cellSize = Math.min(width, height);
  if (!(cellSize > 0)) return [west, south];
  const tolerance = Number.isFinite(precision) && precision > 0 ? precision : Math.max(width, height) / 100;
  const cell = (x, y, h) => {
    const d = polygonDistance(x, y, rings);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = south; y < north; y += cellSize) queue.push(cell(x + cellSize / 2, y + cellSize / 2, cellSize / 2));
  }
  // Start from the shape's centre of mass (a good guess for a plain shape).
  let best = (() => {
    const ring = rings[0];
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const f = ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
      cx += (ring[i][0] + ring[j][0]) * f;
      cy += (ring[i][1] + ring[j][1]) * f;
      area += f * 3;
    }
    return area === 0 ? cell(ring[0][0], ring[0][1], 0) : cell(cx / area, cy / area, 0);
  })();
  const box = cell(minX + width / 2, south + height / 2, 0);
  if (box.d > best.d) best = box;
  let steps = 0;
  while (queue.length && steps < 20000) {
    steps += 1;
    // The cell that could hold the best point (a short list: fine to scan).
    let pick = 0;
    for (let i = 1; i < queue.length; i += 1) if (queue[i].max > queue[pick].max) pick = i;
    const next = queue[pick];
    queue[pick] = queue[queue.length - 1];
    queue.pop();
    if (next.d > best.d) best = next;
    if (next.max - best.d <= tolerance) continue;
    const h = next.h / 2;
    queue.push(cell(next.x - h, next.y - h, h), cell(next.x + h, next.y - h, h), cell(next.x - h, next.y + h, h), cell(next.x + h, next.y + h, h));
  }
  return [best.x / k, best.y];
}

// The outline of a group of map squares (cells with ids like "r12c40" and
// their centres), as one Polygon or MultiPolygon: the squares' shared edges
// are dropped, so it is drawn as one shape with the group's outer border
// (and holes where squares are missing inside it). For the approximate
// states and regions made from the squares' own place names when Earth
// Engine cannot give the real borders (server/units.js).
// Gives back null when no cell has a usable id.
export function squaresOutline(cells, sizeDeg) {
  const grid = [];
  for (const cell of cells || []) {
    const match = /^r(-?\d+)c(-?\d+)$/.exec(cell?.id || "");
    if (match && Number.isFinite(cell.lat) && Number.isFinite(cell.lon)) grid.push({ row: Number(match[1]), col: Number(match[2]), lat: cell.lat, lon: cell.lon });
  }
  if (!grid.length || !(sizeDeg > 0)) return null;
  // The grid's corner, from one square (every square of a run shares it).
  const west = grid[0].lon - (grid[0].col + 0.5) * sizeDeg;
  const north = grid[0].lat + (grid[0].row + 0.5) * sizeDeg;
  const digits = sizeDeg < 0.001 ? 7 : 6;
  const point = (row, col) => [round(west + col * sizeDeg, digits), round(north - row * sizeDeg, digits)];
  // Each square's edges, anticlockwise; an edge two squares share comes
  // once each way and both go.
  const edges = new Map();
  const add = (r1, c1, r2, c2) => {
    const back = `${r2},${c2}>${r1},${c1}`;
    if (edges.has(back)) edges.delete(back);
    else edges.set(`${r1},${c1}>${r2},${c2}`, [r1, c1, r2, c2]);
  };
  const seen = new Set();
  for (const { row, col } of grid) {
    if (seen.has(`${row},${col}`)) continue;
    seen.add(`${row},${col}`);
    add(row + 1, col, row + 1, col + 1);
    add(row + 1, col + 1, row, col + 1);
    add(row, col + 1, row, col);
    add(row, col, row + 1, col);
  }
  const outgoing = new Map();
  for (const edge of edges.values()) {
    const key = `${edge[0]},${edge[1]}`;
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(edge);
  }
  // Walk the edges into rings. Where two squares meet only at a corner,
  // the walk turns left, so each keeps its own ring.
  const used = new Set();
  const rings = [];
  for (const start of edges.values()) {
    if (used.has(start)) continue;
    const ring = [];
    let edge = start;
    while (edge && !used.has(edge)) {
      used.add(edge);
      ring.push([edge[0], edge[1]]);
      const choices = (outgoing.get(`${edge[2]},${edge[3]}`) || []).filter((next) => !used.has(next));
      if (choices.length <= 1) {
        edge = choices[0];
        continue;
      }
      // Direction in (east, north) terms: rows count down.
      const dir = (e) => [e[3] - e[1], -(e[2] - e[0])];
      const [ix, iy] = dir(edge);
      edge = choices.reduce((best, next) => {
        const [x, y] = dir(next);
        const [bx, by] = dir(best);
        // Left turn: cross product > 0.
        return ix * y - iy * x > ix * by - iy * bx ? next : best;
      });
    }
    // Drop the corners along straight runs.
    const corners = ring.filter((p, i) => {
      const a = ring[(i - 1 + ring.length) % ring.length];
      const b = ring[(i + 1) % ring.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    });
    if (corners.length >= 3) rings.push(corners.map(([r, c]) => point(r, c)));
  }
  // Anticlockwise rings are outlines, clockwise ones holes; each hole goes
  // in the smallest outline around it.
  const outers = [];
  const holes = [];
  for (const ring of rings) (signedArea(ring) > 0 ? outers : holes).push(ring);
  const polygons = outers.sort((a, b) => signedArea(a) - signedArea(b)).map((ring) => [ring]);
  for (const hole of holes) {
    const [ax, ay] = hole[0];
    const [bx, by] = hole[1];
    // Just to the left of the hole's first edge: on the squares around it.
    const probeX = (ax + bx) / 2 - (by - ay) * 0.01;
    const probeY = (ay + by) / 2 + (bx - ax) * 0.01;
    const home = polygons.find((polygon) => pointInRing(probeX, probeY, polygon[0]));
    if (home) home.push(hole);
  }
  const closed = polygons.map((polygon) => polygon.map((ring) => [...ring, [...ring[0]]]));
  return closed.length === 1 ? { type: "Polygon", coordinates: closed[0] } : { type: "MultiPolygon", coordinates: closed };
}

// A geometry with its coordinates rounded (smaller to send).
export function roundGeometry(geometry, digits = 5) {
  const polygons = polygonsOf(geometry).map((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => [round(lon, digits), round(lat, digits)])));
  if (!polygons.length) return null;
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}
