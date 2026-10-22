// WHAT THIS FILE DOES
// Keeps a Leaflet map the right size when its box changes: the window
// resizing, a side panel dragged, hidden or shown, the menu folded to icons.
// Used by both maps (src/components/field/FieldMap.jsx and
// src/components/atlas/AtlasMap.jsx). Browser only (it watches the page), so
// it has no node test; the decisions it acts on are plain functions in
// panels.js (fitPanels, afterResize), tested there.
//
// Every map is told its new size (Leaflet's invalidateSize). A "steady" map
// (the two full map pages) also:
//   - keeps what is on screen where it is when its left edge moves (the
//     Atlas's left panel dragged or hidden, the menu folded), instead of
//     letting the picture slide along with the edge
//   - once the box has settled (a quarter of a second after the last change,
//     and only after a drag of a panel's edge has ended), does what
//     panels.js afterResize decides from what it showed before the change,
//     what it shows now and the picked field or square now:
//       if it was showing its whole farm or area (nobody had moved or zoomed
//       it), shows the whole farm or area again, fitted to the new size, so
//       hiding a panel shows the farm bigger rather than off to one side;
//       else, if the picked field or square was on screen and the change
//       covered it (a panel reopened by the very click that picked it),
//       brings it back on screen, without zooming in or out
//     A map that was already moving when the change began (flying to a
//     picked place, zooming, being dragged), or that anything moves while
//     the change settles, is left alone: a fly the page started is never
//     undone.
//
//   watchMapSize(map, element, { steady, snapshot, settle, onResize })
//     steady()          true while the map should behave as above
//     snapshot()        what the map shows as a change starts: { fitted }
//                       (true / false); "view" (what was on screen, a box)
//                       is added here
//     settle(before)    called with that snapshot once the box has settled
//     onResize()        called after every change
//     gives back a function that stops watching
//   settleView(map, before, { fit, pick, padding })
//     the usual settle: afterResize, then fit() (shows the whole farm or
//     area again) or brings pick (Leaflet bounds, the picked field or square
//     now, or null) back on screen with "padding" px round it
//   showsFit(map, bounds, { padding | paddingTopLeft + paddingBottomRight, maxZoom })
//     true when the map shows what fitBounds(bounds, ...) with the same
//     options would (within 3 px)
//   boxOf(bounds)     Leaflet bounds as [[south, west], [north, east]] (or null)
//
// While the edge of a side panel is being dragged the page carries the class
// RESIZING_CLASS (panels.js; src/components/ui/PanelEdge.jsx sets it).
//
// WHO EDITS IT
// Nobody, normally.

import L from "leaflet";
import { RESIZING_CLASS, afterResize } from "./panels.js";

const SETTLE_MS = 250;

export function showsFit(map, bounds, { padding = [0, 0], paddingTopLeft, paddingBottomRight, maxZoom = Infinity } = {}) {
  try {
    if (!map || !bounds?.isValid?.()) return false;
    const topLeft = L.point(paddingTopLeft || padding);
    const bottomRight = L.point(paddingBottomRight || padding);
    // As Leaflet's own fitBounds works it out (at the map's current size):
    // the zoom that fits the bounds in the room the padding leaves, and the
    // bounds' middle moved by half the difference of the padding.
    const zoom = Math.min(maxZoom, map.getBoundsZoom(bounds, false, topLeft.add(bottomRight)));
    if (!Number.isFinite(zoom) || Math.abs(map.getZoom() - zoom) > 0.01) return false;
    const middle = map
      .project(bounds.getSouthWest(), zoom)
      .add(map.project(bounds.getNorthEast(), zoom))
      .divideBy(2)
      .add(bottomRight.subtract(topLeft).divideBy(2));
    return map.project(map.getCenter(), zoom).distanceTo(middle) <= 3;
  } catch {
    return false;
  }
}

export function boxOf(bounds) {
  try {
    return bounds?.isValid?.() ? [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]] : null;
  } catch {
    return null;
  }
}

export function settleView(map, before, { fit = () => {}, pick = null, padding = [56, 56] } = {}) {
  const step = afterResize({ fitted: before?.fitted, before: before?.view, after: boxOf(map.getBounds()), pick: boxOf(pick) });
  if (!step) return;
  if (step.action === "fit") {
    fit();
    return;
  }
  // The whole pick fits at this zoom: show it all, at this zoom.
  const zoom = map.getZoom();
  if (step.action === "show" && map.getBoundsZoom(pick, false, L.point(padding).multiplyBy(2)) >= zoom) {
    map.flyToBounds(pick, { padding, maxZoom: zoom, duration: 0.6 });
    return;
  }
  // Too big for the map at this zoom: bring the part that was on screen
  // back, panning the least (never zooming out).
  map.panInside(L.latLng(step.at[0], step.at[1]), { padding, animate: true, duration: 0.6 });
}

export function watchMapSize(map, element, { steady = () => false, snapshot = () => null, settle = () => {}, onResize = () => {} } = {}) {
  let last = element.getBoundingClientRect();
  let carry = 0; // part of a pixel not yet moved
  let timer = 0;
  let before = null;
  // Whether the map is moving on its own (a fly to a place, a zoom, a
  // drag), and whether anything moved it while a change was settling: then
  // the map is left alone, so a fly the page started is never undone.
  let moving = false;
  let movedMeanwhile = false;
  const onMoveStart = () => {
    moving = true;
    if (timer) movedMeanwhile = true;
  };
  const onMoveEnd = () => {
    moving = false;
  };
  map.on("movestart zoomstart", onMoveStart);
  map.on("moveend zoomend", onMoveEnd);

  const settled = () => {
    // Still dragging a panel's edge: wait until it is let go.
    if (document.documentElement.classList.contains(RESIZING_CLASS)) {
      timer = setTimeout(settled, SETTLE_MS);
      return;
    }
    timer = 0;
    const was = before;
    before = null;
    if (was && !movedMeanwhile) settle(was);
    movedMeanwhile = false;
  };

  const observer = new ResizeObserver(() => {
    const box = element.getBoundingClientRect();
    // The first report (and any other that finds nothing changed) only says
    // how big the box already is: the map is told, but nothing moves.
    const changed = box.width !== last.width || box.height !== last.height || box.left !== last.left;
    const moved = box.left - last.left;
    last = box;
    if (!changed || !steady()) {
      map.invalidateSize({ pan: false });
      onResize();
      return;
    }
    // The first change of a burst: what was the map showing? (Read before
    // the map learns its new size; a map already moving is left alone.)
    if (!timer) {
      before = moving ? null : { ...snapshot(), view: boxOf(map.getBounds()) };
      movedMeanwhile = false;
    }
    map.invalidateSize({ pan: false });
    // The left edge moved by "moved" px: move the picture back by as much,
    // so what is on screen stays put.
    carry += moved;
    const step = Math.round(carry);
    if (step) {
      carry -= step;
      map.panBy([step, 0], { animate: false, noMoveStart: true });
    }
    onResize();
    clearTimeout(timer);
    timer = setTimeout(settled, SETTLE_MS);
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    clearTimeout(timer);
    map.off("movestart zoomstart", onMoveStart);
    map.off("moveend zoomend", onMoveEnd);
  };
}
