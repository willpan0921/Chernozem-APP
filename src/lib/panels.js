// WHAT THIS FILE DOES
// The sums behind the side panels of the two map pages (the Field "Fields"
// page and the Atlas map): how wide a panel is drawn, how far it may be
// dragged, what the arrow keys do on its edge, and what a saved panel may
// look like. Plain functions, tested in panels.test.js; the edge you drag and
// the tab that hides a panel are src/components/ui/PanelEdge.jsx.
//
// A panel's width is the person's choice once they have dragged it, else
// the page's own width for that screen size (exactly as before any of this
// existed). A chosen width stays between the panel's smallest width and its
// largest, which is the smallest of:
//   maxPx                       a fixed limit (e.g. 640 px)
//   share × room                a share of the room the map and its panels
//                               share (e.g. 45 %)
//   room − other panels − map   what still leaves the map mapMin wide
// but never below the smallest width (on a small screen the map then gets
// less than mapMin, as it did before).
//
//   fitPanels({ room, mapMin, panels })  the width to draw each panel at, and
//                                        its smallest and largest width now
//   dragWidth({ side, startWidth, startX, x, min, max })
//                                        the width while dragging its edge
//   keyWidth(key, { side, width, min, max, shift })
//                                        the width after a key on its edge
//                                        (null: the key does nothing)
//   cleanPanel(value)                    a saved { width, hidden }, checked
//   afterResize({ fitted, before, after, pick })
//                                        what a map does once its box has
//                                        settled after a panel or the menu
//                                        changed (src/lib/mapResize.js)
//
// "side" is where the panel sits: "left" of the map (dragging its edge to
// the right widens it) or "right" of the map (dragging to the left widens it).
//
// WHO EDITS IT
// Whoever changes how far the panels may be dragged. The limits of each
// panel are set by its page (FieldsPage.jsx, MapPage.jsx).

// Arrow keys move a panel's edge by this much; with Shift by the bigger step.
export const KEY_STEP = 16;
export const KEY_BIG_STEP = 64;

// While a panel's edge is being dragged the page (the html element) carries
// this class: the cursor stays a resize arrow everywhere, text is not
// selected, and the maps wait for the drag to end before they re-fit
// (src/lib/mapResize.js).
export const RESIZING_CLASS = "is-resizing-panel";

// A saved width outside this range is not a width anyone dragged to.
const SANE_WIDTH = { min: 120, max: 4000 };

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

const sum = (widths) => Object.values(widths).reduce((total, width) => total + width, 0);

// panels: [{ id, width, defaultWidth, min, maxPx, share, hidden }]
//   width         the person's width in px, or null (defaultWidth is used)
//   defaultWidth  the page's own width for this screen size
//   min           the smallest width, in px
//   maxPx         the largest width, in px
//   share         the largest width as a share of the room (0.45 = 45 %)
//   hidden        true: the panel is hidden and takes no room
// room    the px the map and the shown panels share (null before it is measured)
// mapMin  the narrowest the map may be made by widening a panel
//
// Gives back { [id]: { width, min, max } }: the width to draw the panel at
// (0 when hidden), and how narrow and how wide it may be dragged now.
export function fitPanels({ room = null, mapMin = 0, panels = [] }) {
  const known = Number.isFinite(room) && room > 0;
  const own = (panel) => Math.max(panel.min, Math.floor(Math.min(panel.maxPx ?? Infinity, known ? room * (panel.share ?? 1) : Infinity)));
  const widths = {};
  for (const panel of panels) {
    if (panel.hidden) widths[panel.id] = 0;
    else if (Number.isFinite(panel.width)) widths[panel.id] = clamp(Math.round(panel.width), panel.min, own(panel));
    else widths[panel.id] = panel.defaultWidth;
  }

  // Too wide together for the map to keep mapMin (the window got smaller):
  // the panels the person widened give way, in proportion to what they have
  // above their smallest width, never below it. A panel nobody dragged keeps
  // the page's own width, so a page nobody changed looks exactly as before.
  if (known) {
    const chosen = panels.filter((panel) => !panel.hidden && Number.isFinite(panel.width));
    const over = sum(widths) + mapMin - room;
    const slack = chosen.reduce((total, panel) => total + (widths[panel.id] - panel.min), 0);
    if (over > 0 && slack > 0) {
      const take = Math.min(over, slack);
      for (const panel of chosen) widths[panel.id] -= Math.ceil((take * (widths[panel.id] - panel.min)) / slack);
    }
  }

  const total = sum(widths);
  const out = {};
  for (const panel of panels) {
    const width = widths[panel.id];
    let max = own(panel);
    if (known) max = Math.min(max, room - (total - width) - mapMin);
    out[panel.id] = { width, min: panel.min, max: Math.max(panel.min, width, Math.floor(max)) };
  }
  return out;
}

// The width while the edge is dragged: from the width and pointer position
// when the drag started, the pointer's position now, kept within min..max.
export function dragWidth({ side, startWidth, startX, x, min, max }) {
  const moved = x - startX;
  return clamp(Math.round(startWidth + (side === "left" ? moved : -moved)), min, max);
}

// A key pressed on the focused edge (a role="separator"): the arrows move
// the edge (KEY_STEP px, KEY_BIG_STEP with Shift), Home makes the panel its
// smallest, End its largest. Any other key: null.
export function keyWidth(key, { side, width, min, max, shift = false }) {
  const step = shift ? KEY_BIG_STEP : KEY_STEP;
  const wider = side === "left" ? "ArrowRight" : "ArrowLeft";
  const narrower = side === "left" ? "ArrowLeft" : "ArrowRight";
  if (key === wider) return clamp(width + step, min, max);
  if (key === narrower) return clamp(width - step, min, max);
  if (key === "Home") return min;
  if (key === "End") return Math.max(min, max);
  return null;
}

// A panel as saved in the browser, checked: { width: whole px or null (the
// page's own width), hidden: true / false }. Anything else: undefined.
export function cleanPanel(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const width = Number.isFinite(value.width) && value.width >= SANE_WIDTH.min && value.width <= SANE_WIDTH.max ? Math.round(value.width) : null;
  return { width, hidden: value.hidden === true };
}

// ---------- Keeping the picked place on screen ----------

// Map boxes here are [[south, west], [north, east]] in degrees.
const isBox = (box) =>
  Array.isArray(box) &&
  box.length === 2 &&
  box.every((corner) => Array.isArray(corner) && corner.length === 2 && corner.every(Number.isFinite)) &&
  box[0][0] <= box[1][0] &&
  box[0][1] <= box[1][1];
const holds = (outer, inner) => outer[0][0] <= inner[0][0] && outer[0][1] <= inner[0][1] && outer[1][0] >= inner[1][0] && outer[1][1] >= inner[1][1];
// The part two boxes share, or null when they only touch or do not meet.
function shared(a, b) {
  const south = Math.max(a[0][0], b[0][0]);
  const west = Math.max(a[0][1], b[0][1]);
  const north = Math.min(a[1][0], b[1][0]);
  const east = Math.min(a[1][1], b[1][1]);
  return south < north && west < east ? [[south, west], [north, east]] : null;
}

// What a map does once its box has settled after a side panel was dragged,
// hidden or shown, or the menu folded:
//   fitted   true when it was showing its whole farm or area
//   before   what it showed before the change (a box)
//   after    what it shows now (a box)
//   pick     the picked field or square now (a box), or null. Read when the
//            change has settled, not when it began: the click that picks a
//            square also reopens the panel, and either may be drawn first.
// Gives back:
//   { action: "fit" }               show the whole farm or area again,
//                                   fitted to the new size
//   { action: "show", at: [lat, lon] }
//                                   the pick was wholly on screen and no longer
//                                   is (the panel now covers it): bring it back
//   { action: "reach", at: [lat, lon] }
//                                   only part of the pick was on screen (it is
//                                   bigger than the map, or was at its edge)
//                                   and less than KEEP_SEEN of that part still
//                                   is: bring that part back
//   null                            leave the map alone (no pick, the pick was
//                                   not on screen before, or it still is)
// "at" is the middle of the part of the pick that was on screen.
// How much of the part of a pick that was on screen must stay on screen
// after a panel opens for the map to be left alone. Before, only "none of
// it" moved the map, so a thin sliver counted as in view (found in review,
// 2026-10-21: 7 of 10 fields ended 4-32% on screen, their names under the
// reopened panel).
export const KEEP_SEEN = 0.5;
const boxArea = (box) => (box ? Math.max(0, box[1][0] - box[0][0]) * Math.max(0, box[1][1] - box[0][1]) : 0);

export function afterResize({ fitted = false, before, after, pick }) {
  if (fitted) return { action: "fit" };
  if (!isBox(before) || !isBox(after) || !isBox(pick)) return null;
  const seen = shared(before, pick);
  if (!seen) return null;
  const at = [(seen[0][0] + seen[1][0]) / 2, (seen[0][1] + seen[1][1]) / 2];
  if (holds(before, pick)) return holds(after, pick) ? null : { action: "show", at };
  return boxArea(shared(after, seen)) >= KEEP_SEEN * boxArea(seen) ? null : { action: "reach", at };
}
