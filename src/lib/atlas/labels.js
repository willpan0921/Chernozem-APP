// WHAT THIS FILE DOES
// Decides which names of states and regions the Atlas map shows at the
// current zoom, and where (src/components/atlas/AtlasMap.jsx), so names
// never overlap, never sit under the map's buttons and a name never sprawls
// far outside its small unit:
//
//   placeLabels(items, { fit, gap, view, blocked })
//     items    [{ id, rect, unitRect, anchors?, always? }] in order of
//              importance (AtlasMap: the picked unit, then by rank in the
//              time frame shown, then the biggest): rect is the name's box
//              on screen at its label point, unitRect the unit's box on
//              screen ({ left, top, right, bottom } in pixels); anchors the
//              other spots to try, as shifts from the label point
//              ([{ dx, dy }], each already checked to lie inside the unit;
//              the label point itself is always tried first); always: shown
//              even when nothing fits (the picked unit)
//     fit      how much wider than its unit a name may be (default 1.25)
//     gap      the room kept round each name, in pixels (default 4)
//     view     { width, height } of the map: names off screen do not block
//              others (optional)
//     blocked  boxes no name may cover (the zoom buttons, the side panels'
//              tabs, the key), in the same pixels (optional)
//   -> a Map of the ids shown to where: { dx, dy, scale }
//
//   chooseLabels(items, options) -> a Set of the ids shown (same rules)
//
//   pointInGeometry(lon, lat, geometry)  true when the point is inside a
//     GeoJSON Polygon or MultiPolygon (holes count as outside)
//
// A name is shown at the first spot where it fits its unit (at most fit
// times the unit's width, and not much taller than it) and overlaps neither
// a name shown before it nor a blocked box: first full size at the label
// point, then at the other spots, then a little smaller (LABEL_SCALES).
// Zooming in makes units bigger, so more names come back. Names are never
// shortened or made up.
//
// Plain arithmetic, no DOM. Tested in labels.test.js.
//
// WHO EDITS IT
// Whoever changes how the map's names are placed.

export const LABEL_FIT = 1.25;
export const LABEL_GAP = 4;
// The sizes a name may take, largest first (12.5 px names down to about 10.5).
export const LABEL_SCALES = [1, 0.92, 0.84];

const width = (r) => r.right - r.left;
const height = (r) => r.bottom - r.top;

function overlaps(a, b, gap) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

// The name's box moved by (dx, dy) and scaled round its centre.
function moved(rect, dx, dy, scale) {
  const cx = (rect.left + rect.right) / 2 + dx;
  const cy = (rect.top + rect.bottom) / 2 + dy;
  const hw = (width(rect) * scale) / 2;
  const hh = (height(rect) * scale) / 2;
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
}

export function placeLabels(items, { fit = LABEL_FIT, gap = LABEL_GAP, view = null, blocked = [] } = {}) {
  const shown = new Map();
  const placed = [];
  const walls = (blocked || []).filter(Boolean);
  const onScreen = (rect) => !view || (rect.right > 0 && rect.bottom > 0 && rect.left < view.width && rect.top < view.height);
  for (const item of items || []) {
    const { rect, unitRect } = item;
    if (!rect) continue;
    const anchors = [{ dx: 0, dy: 0 }, ...(item.anchors || []).filter((a) => a && !(a.dx === 0 && a.dy === 0))];
    let spot = null;
    for (const scale of LABEL_SCALES) {
      for (const { dx, dy } of anchors) {
        const box = moved(rect, dx, dy, scale);
        const fits = item.always || !unitRect || (width(box) <= width(unitRect) * fit && height(box) <= height(unitRect) * 1.6);
        if (!fits) continue;
        if (placed.some((other) => overlaps(box, other, gap))) continue;
        if (walls.some((wall) => overlaps(box, wall, 0))) continue;
        spot = { dx, dy, scale, box };
        break;
      }
      if (spot) break;
    }
    // The picked unit keeps its name even when nothing fits.
    if (!spot && item.always) spot = { dx: 0, dy: 0, scale: 1, box: rect };
    if (!spot) continue;
    shown.set(item.id, { dx: spot.dx, dy: spot.dy, scale: spot.scale });
    if (onScreen(spot.box)) placed.push(spot.box);
  }
  return shown;
}

export function chooseLabels(items, options) {
  return new Set(placeLabels(items, options).keys());
}

// Ray casting over one ring of [lon, lat] points.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon, lat, rings) {
  if (!rings?.length || !inRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(lon, lat, rings[i])) return false;
  return true;
}

export function pointInGeometry(lon, lat, geometry) {
  if (!geometry || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (geometry.type === "Polygon") return inPolygon(lon, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).some((rings) => inPolygon(lon, lat, rings));
  return false;
}
