// WHAT THIS FILE DOES
// How far a mouse wheel, a trackpad scroll or a trackpad pinch zooms the
// two maps (src/components/field/FieldMap.jsx, src/components/atlas/
// AtlasMap.jsx) and the About page's globe (src/site/components/
// WorldGlobe.jsx), and the map handler that makes the zoom continuous.
//
// WHY THE MAPS NEEDED THIS. Leaflet's own wheel zoom animates every step
// for a quarter of a second and throws away every wheel tick that arrives
// while that animation runs (Map._tryAnimatedZoom). A trackpad sends many
// small ticks, so most of them were lost and the map crawled: one small
// step every 250 ms. createWheelZoom() below replaces that handler: the
// ticks add up into a goal, and the map follows the goal a little every
// frame, the way Leaflet's own two-finger pinch does (its TouchZoom
// handler moves the map directly, with the tiles scaled, and settles when
// the fingers lift). Nothing is thrown away, the picture never blinks, and
// the point under the pointer stays under the pointer.
//
// THE ARITHMETIC (plain functions, tested in wheelZoom.test.js):
//   wheelPixels(event)           the wheel's travel in pixels whatever unit
//                                the browser used (pixels, lines, pages)
//   wheelLevels(deltaY, opts)    how many zoom levels a wheel event moves a
//                                map: positive zooms in (the wheel rolled
//                                up, the fingers pushed away). A scroll
//                                uses Leaflet's own curve with pxPerLevel
//                                pixels per level (45 here; Leaflet's
//                                default is 60), so small trackpad ticks add
//                                up nearly in proportion and one notch of a
//                                mouse wheel is about 1.4 levels. A pinch
//                                (ctrlKey, which is what a trackpad pinch
//                                sends) is one level per 100 px, so the map
//                                scales with the fingers.
//   approach(current, goal, share, snap)  one frame of easing: a share of
//                                the remaining way, and the goal itself
//                                once within snap
//   globeZoomFactor(deltaY, opts)  what a wheel event multiplies the globe
//                                camera's altitude by (below 1 zooms in):
//                                a notch of the wheel takes a fifth off,
//                                a pinch follows the fingers (Chrome sends
//                                a pinch as ctrlKey wheel events whose
//                                deltaY sums to about 100 per doubling)
//   globeZoomLimits(far)         { near, far }: the camera's altitudes (in
//                                Earth radii) between which the globe zooms:
//                                near shows about one country, far is
//                                today's layout (the globe filling the
//                                first screen)
//   isZoomedIn(altitude, far)    true when the camera is nearer than the
//                                layout's rest altitude (the tour waits)
//   GLOBE_ZOOM_STEP              one step of the globe's double-click or
//                                +/- keys (the altitude is multiplied by it)
//
// THE MAP HANDLER (browser only, so not node-tested; the decisions it acts
// on are the plain functions above):
//   createWheelZoom(map, options) -> { enable(), disable(), enabled(), remove() }
//     map         a Leaflet map (its own scrollWheelZoom handler should be off)
//     options     pxPerLevel (45), share (0.35 of the way per frame),
//                 settleMs (120 ms after the last tick the gesture ends and
//                 the map fires zoomend/moveend)
//   It needs Leaflet's internal map._move (the same call its TouchZoom
//   handler makes). On a Leaflet without it, enable() does nothing and the
//   map should fall back to its own wheel handler (both maps do).
//
// CHECKS. With ?map-debug=1 in the address, registerMapForChecks(map) keeps
// every Leaflet map in window.__maps (a Set), so a test can read a map's
// zoom and what is under the pointer; otherwise it does nothing.
//
// WHO EDITS IT
// Whoever changes how zooming feels. The maps' other options (snap, the
// +/- buttons' step) are in the two map components.

const LN2 = Math.LN2;

// Leaflet's units for a wheel event that counts lines or pages.
const LINE_PX = 20;
const PAGE_PX = 60;

export function wheelPixels(event) {
  const deltaY = Number(event?.deltaY) || 0;
  const mode = event?.deltaMode || 0;
  if (mode === 1) return deltaY * LINE_PX;
  if (mode === 2) return deltaY * PAGE_PX;
  return deltaY;
}

// Leaflet's curve (ScrollWheelZoom._performZoom): nearly a straight line
// for small travel, and never more than 4 levels for one event however
// far it went.
function leafletCurve(px, pxPerLevel) {
  const d2 = Math.abs(px) / (pxPerLevel * 4);
  return (4 * Math.log(2 / (1 + Math.exp(-d2)))) / LN2;
}

export const MAP_PX_PER_LEVEL = 45;
export const PINCH_PX_PER_LEVEL = 100;

export function wheelLevels(deltaY, { ctrlKey = false, deltaMode = 0, pxPerLevel = MAP_PX_PER_LEVEL } = {}) {
  const px = wheelPixels({ deltaY, deltaMode });
  if (!px) return 0;
  const sign = px < 0 ? 1 : -1;
  if (ctrlKey) return (sign * Math.abs(px)) / PINCH_PX_PER_LEVEL;
  return sign * leafletCurve(px, pxPerLevel);
}

export function approach(current, goal, share = 0.35, snap = 0.002) {
  if (!Number.isFinite(current)) return goal;
  const left = goal - current;
  if (Math.abs(left) <= snap) return goal;
  return current + left * share;
}

// ---------- The globe ----------

// One notch of a mouse wheel (100 px) takes a fifth off the altitude.
const GLOBE_WHEEL_SHARE = 0.8;
export const GLOBE_ZOOM_STEP = 0.6;
export const GLOBE_NEAR_ALTITUDE = 0.2;

export function globeZoomFactor(deltaY, { ctrlKey = false, deltaMode = 0 } = {}) {
  const px = wheelPixels({ deltaY, deltaMode });
  if (!px) return 1;
  // A pinch: the fingers' own scale, exp(deltaY / 100) in Chrome's units.
  if (ctrlKey) return Math.exp(px / 100);
  return Math.pow(GLOBE_WHEEL_SHARE, -px / 100);
}

export function globeZoomLimits(far) {
  const farAlt = Number.isFinite(far) && far > 0 ? far : 1;
  return { near: Math.min(GLOBE_NEAR_ALTITUDE, farAlt / 2), far: farAlt };
}

export function isZoomedIn(altitude, far) {
  return Number.isFinite(altitude) && Number.isFinite(far) && altitude < far * 0.97;
}

// ---------- The map handler ----------

export function createWheelZoom(map, { pxPerLevel = MAP_PX_PER_LEVEL, share = 0.35, settleMs = 120 } = {}) {
  const container = map.getContainer();
  const canMove = typeof map._move === "function" && typeof map._moveStart === "function" && typeof map._moveEnd === "function";
  let on = false;
  let goal = null; // the zoom the map is heading for, or null between gestures
  let moved = false; // movestart/zoomstart fired for this gesture
  let anchor = null; // { point, latlng }: what is under the pointer, kept there
  let raf = 0;
  let settleTimer = 0;

  // The map is alive and on the page (not removed, not mid-way through a
  // button zoom's animation, which Leaflet must finish by itself).
  const ready = () => Boolean(map._loaded && map._mapPane && !map._animatingZoom);

  // The centre that keeps the anchored place under the pointer at this zoom.
  const centerFor = (zoom) => {
    const half = map.getSize().divideBy(2);
    const offset = anchor.point.subtract(half);
    return map.unproject(map.project(anchor.latlng, zoom).subtract(offset), zoom);
  };

  const step = (zoom) => {
    if (!moved) {
      moved = true;
      map._moveStart(true, false);
    }
    map._move(centerFor(zoom), zoom, { pinch: true, round: false });
  };

  const frame = () => {
    raf = 0;
    if (goal === null || !ready()) return;
    const next = approach(map.getZoom(), goal, share, 0.002);
    step(next);
    if (next !== goal) raf = requestAnimationFrame(frame);
  };

  // The gesture ends: the last bit of the way, then the same signals
  // Leaflet sends at the end of any zoom (a plain "zoom", so the tile layer
  // prunes the old levels, then zoomend and moveend).
  const finish = () => {
    clearTimeout(settleTimer);
    settleTimer = 0;
    if (goal === null) return;
    cancelAnimationFrame(raf);
    raf = 0;
    if (ready()) {
      if (Math.abs(map.getZoom() - goal) > 1e-9) step(goal);
      if (moved) {
        map.fire("zoom");
        map._moveEnd(true);
      }
    }
    goal = null;
    anchor = null;
    moved = false;
  };

  const onWheel = (event) => {
    if (!on) return;
    // The map takes every wheel over it, as Leaflet's own handler does, so
    // the page never scrolls away under a zoom.
    event.preventDefault();
    event.stopPropagation();
    if (!ready()) return;
    const levels = wheelLevels(event.deltaY, { ctrlKey: event.ctrlKey, deltaMode: event.deltaMode, pxPerLevel });
    if (!levels) return;
    if (goal === null) {
      if (typeof map._stop === "function") map._stop(); // a fly in progress gives way
      goal = map.getZoom();
    }
    // What is under the pointer stays under it. The anchor is kept for the
    // whole gesture (reading it again every tick would let Leaflet's pixel
    // rounding drift the map) unless the pointer itself has moved.
    const point = map.mouseEventToContainerPoint(event);
    if (!anchor || anchor.point.distanceTo(point) > 1) anchor = { point, latlng: map.containerPointToLatLng(point) };
    goal = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), goal + levels));
    clearTimeout(settleTimer);
    settleTimer = setTimeout(finish, settleMs);
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const enable = () => {
    if (on || !canMove) return;
    on = true;
    container.addEventListener("wheel", onWheel, { passive: false });
  };
  const disable = () => {
    if (!on) return;
    on = false;
    container.removeEventListener("wheel", onWheel);
    // A gesture still going ends cleanly (the map hears its zoomend).
    finish();
  };
  return {
    enable,
    disable,
    enabled: () => on,
    supported: canMove,
    remove: disable,
  };
}

export function registerMapForChecks(map) {
  if (typeof window === "undefined" || !/[?&]map-debug=1(&|$)/.test(window.location.search || "")) return () => {};
  const maps = (window.__maps ??= new Set());
  maps.add(map);
  return () => {
    maps.delete(map);
  };
}
