// WHAT THIS FILE DOES
// Checks the side-panel sums in panels.js: the width each panel is drawn at,
// how far it may be dragged (never squeezing the map below its smallest
// width), the arrow keys on its edge, what a saved panel may contain, and
// what a map does with the picked place once a panel has changed.
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the panels are sized.

import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_BIG_STEP, KEY_STEP, afterResize, clamp, cleanPanel, dragWidth, fitPanels, keyWidth } from "./panels.js";

// The Atlas map page: area and weights on the left, top areas on the right.
const LEFT = { id: "left", width: null, defaultWidth: 300, min: 260, maxPx: 560, share: 0.45, hidden: false };
const RIGHT = { id: "right", width: null, defaultWidth: 320, min: 260, maxPx: 640, share: 0.45, hidden: false };
// The Field page: the field's details on the right.
const DETAILS = { id: "details", width: null, defaultWidth: 400, min: 340, maxPx: 640, share: 0.5, hidden: false };

test("clamp keeps a value between min and max, and min wins when max is below it", () => {
  assert.equal(clamp(5, 1, 10), 5);
  assert.equal(clamp(-3, 1, 10), 1);
  assert.equal(clamp(30, 1, 10), 10);
  assert.equal(clamp(30, 12, 10), 12);
});

test("a panel nobody dragged keeps the page's own width, even on a small screen", () => {
  const roomy = fitPanels({ room: 1096, mapMin: 360, panels: [LEFT, RIGHT] });
  assert.equal(roomy.left.width, 300);
  assert.equal(roomy.right.width, 320);
  // 861 px wide window: as before, the map gets what is left (here 127 px).
  const tight = fitPanels({ room: 677, mapMin: 360, panels: [{ ...LEFT, defaultWidth: 270 }, { ...RIGHT, defaultWidth: 280 }] });
  assert.equal(tight.left.width, 270);
  assert.equal(tight.right.width, 280);
  assert.ok(tight.left.max >= tight.left.width && tight.right.max >= tight.right.width);
});

test("a dragged width stays between the smallest and the largest width", () => {
  const room = 1200;
  assert.equal(fitPanels({ room, panels: [{ ...DETAILS, width: 100 }] }).details.width, 340);
  assert.equal(fitPanels({ room, panels: [{ ...DETAILS, width: 451.6 }] }).details.width, 452);
  // 50 % of the room (600) is below the 640 px limit.
  assert.equal(fitPanels({ room, panels: [{ ...DETAILS, width: 900 }] }).details.width, 600);
  // On a very wide screen the 640 px limit applies.
  assert.equal(fitPanels({ room: 2400, panels: [{ ...DETAILS, width: 900 }] }).details.width, 640);
});

test("the largest width always leaves the map its smallest width", () => {
  const room = 1096;
  const out = fitPanels({ room, mapMin: 360, panels: [{ ...LEFT, width: 420 }, RIGHT] });
  // left: 45 % of 1096 = 493, but 1096 - 320 - 360 = 416 leaves the map 360.
  assert.equal(out.left.width, 416);
  assert.equal(out.left.max, 416);
  assert.equal(out.right.max, 1096 - 416 - 360);
  assert.ok(room - out.left.width - out.right.width >= 360);
});

test("when the window shrinks, only the panels that were dragged give way, never below their smallest", () => {
  const out = fitPanels({ room: 1000, mapMin: 360, panels: [{ ...LEFT, width: 450 }, RIGHT] });
  assert.equal(out.right.width, 320, "the untouched panel keeps its own width");
  assert.equal(out.left.width, 320, "the dragged one gives way: 1000 - 320 - 360");
  const both = fitPanels({ room: 900, mapMin: 360, panels: [{ ...LEFT, width: 400 }, { ...RIGHT, width: 400 }] });
  assert.ok(both.left.width >= 260 && both.right.width >= 260);
  assert.ok(900 - both.left.width - both.right.width >= 360);
  assert.equal(both.left.width, both.right.width, "both give way alike");
  const tiny = fitPanels({ room: 700, mapMin: 360, panels: [{ ...LEFT, width: 400 }, { ...RIGHT, width: 400 }] });
  assert.equal(tiny.left.width, 260);
  assert.equal(tiny.right.width, 260);
});

test("a hidden panel takes no room, so the other may grow", () => {
  const out = fitPanels({ room: 1096, mapMin: 360, panels: [{ ...LEFT, hidden: true, width: 500 }, { ...RIGHT, width: 640 }] });
  assert.equal(out.left.width, 0);
  // 45 % of 1096 = 493 (the map keeps 1096 - 493 = 603).
  assert.equal(out.right.width, 493);
  assert.equal(out.right.max, 493);
});

test("before the room is measured, a dragged width is only held to its own limits", () => {
  const out = fitPanels({ room: null, mapMin: 360, panels: [{ ...DETAILS, width: 2000 }] });
  assert.equal(out.details.width, 640);
  assert.equal(out.details.max, 640);
  assert.equal(fitPanels({ panels: [DETAILS] }).details.width, 400);
});

test("min is never above max", () => {
  for (const room of [200, 500, 677, 861, 1096, 1800]) {
    const out = fitPanels({ room, mapMin: 360, panels: [{ ...LEFT, width: 999 }, { ...RIGHT, width: 999 }] });
    for (const panel of Object.values(out)) assert.ok(panel.min <= panel.max && panel.width <= panel.max && panel.width >= panel.min, `room ${room}`);
  }
});

test("dragging the edge: right for a left panel, left for a right panel widens it", () => {
  const limits = { min: 260, max: 600 };
  assert.equal(dragWidth({ side: "left", startWidth: 300, startX: 500, x: 540, ...limits }), 340);
  assert.equal(dragWidth({ side: "left", startWidth: 300, startX: 500, x: 470, ...limits }), 270);
  assert.equal(dragWidth({ side: "right", startWidth: 320, startX: 900, x: 860, ...limits }), 360);
  assert.equal(dragWidth({ side: "right", startWidth: 320, startX: 900, x: 940, ...limits }), 280);
  // Past the limits it stops at them.
  assert.equal(dragWidth({ side: "right", startWidth: 320, startX: 900, x: 100, ...limits }), 600);
  assert.equal(dragWidth({ side: "left", startWidth: 300, startX: 500, x: 0, ...limits }), 260);
  assert.equal(dragWidth({ side: "left", startWidth: 300, startX: 500, x: 512.4, ...limits }), 312);
});

test("keys on the edge: arrows move it, Shift moves it further, Home and End go to the limits", () => {
  const at = { width: 400, min: 340, max: 548 };
  assert.equal(keyWidth("ArrowLeft", { side: "right", ...at }), 400 + KEY_STEP);
  assert.equal(keyWidth("ArrowRight", { side: "right", ...at }), 400 - KEY_STEP);
  assert.equal(keyWidth("ArrowRight", { side: "left", ...at }), 400 + KEY_STEP);
  assert.equal(keyWidth("ArrowLeft", { side: "left", ...at }), 400 - KEY_STEP);
  assert.equal(keyWidth("ArrowLeft", { side: "right", ...at, shift: true }), 400 + KEY_BIG_STEP);
  assert.equal(keyWidth("ArrowRight", { side: "right", ...at, shift: true }), 340, "stops at the smallest width");
  assert.equal(keyWidth("ArrowLeft", { side: "right", ...at, width: 540 }), 548, "stops at the largest width");
  assert.equal(keyWidth("Home", { side: "right", ...at }), 340);
  assert.equal(keyWidth("End", { side: "left", ...at }), 548);
  for (const key of ["Enter", " ", "ArrowUp", "ArrowDown", "a", "Tab"]) assert.equal(keyWidth(key, { side: "right", ...at }), null, key);
});

test("a saved panel is checked before it is used", () => {
  assert.deepEqual(cleanPanel({ width: 420, hidden: true }), { width: 420, hidden: true });
  assert.deepEqual(cleanPanel({ width: 420.7, hidden: false }), { width: 421, hidden: false });
  assert.deepEqual(cleanPanel({ width: null, hidden: false }), { width: null, hidden: false });
  assert.deepEqual(cleanPanel({ width: "420", hidden: "yes" }), { width: null, hidden: false });
  assert.deepEqual(cleanPanel({ width: 5, hidden: true }), { width: null, hidden: true });
  assert.deepEqual(cleanPanel({ width: 1e9 }), { width: null, hidden: false });
  assert.deepEqual(cleanPanel({ width: Number.NaN }), { width: null, hidden: false });
  for (const bad of [null, undefined, 3, "wide", true, [420, true]]) assert.equal(cleanPanel(bad), undefined);
});

// ---------- afterResize: keeping the picked place on screen ----------

// The Atlas map at zoom 7 over Ukraine, then with the right column reopened
// (the map loses its east side) or the left column / menu shown (it loses
// its west side). Boxes are [[south, west], [north, east]].
const VIEW = [[46, 26], [51, 36]];
const RIGHT_COVERED = [[46, 26], [51, 33]];
const LEFT_COVERED = [[46, 29], [51, 36]];
const square = (lat, lon, half = 0.05) => [[lat - half, lon - half], [lat + half, lon + half]];

test("after a resize: a map still showing its whole farm or area fits it again", () => {
  assert.deepEqual(afterResize({ fitted: true, before: VIEW, after: RIGHT_COVERED, pick: null }), { action: "fit" });
  assert.deepEqual(afterResize({ fitted: true, before: VIEW, after: RIGHT_COVERED, pick: square(48, 35) }), { action: "fit" });
});

test("after a resize: a pick the reopened panel now covers is brought back", () => {
  // Clicked near the right edge; the click also reopened the right column,
  // and the pick is read once the change has settled (it may be drawn after
  // the panel), so only the view before and the pick now count.
  assert.deepEqual(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: square(48, 35) }), { action: "show", at: [48, 35] });
  // Under the left column or the menu rail just the same.
  assert.deepEqual(afterResize({ before: VIEW, after: LEFT_COVERED, pick: square(49, 27) }), { action: "show", at: [49, 27] });
  // Half covered counts too: it was wholly on screen and should stay so.
  assert.equal(afterResize({ before: VIEW, after: [[46, 26], [51, 35]], pick: square(48, 35) })?.action, "show");
});

test("after a resize: a pick still on screen, or never on screen, is left alone", () => {
  assert.equal(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: square(48, 30) }), null, "still in view");
  assert.equal(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: square(48, 40) }), null, "was off screen before");
  assert.equal(afterResize({ before: VIEW, after: VIEW, pick: square(48, 35) }), null, "nothing covered it");
});

test("after a resize: no pick, or boxes that are not boxes, leave the map alone", () => {
  assert.equal(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: null }), null);
  assert.equal(afterResize({ before: VIEW, after: RIGHT_COVERED }), null);
  assert.equal(afterResize({ before: null, after: RIGHT_COVERED, pick: square(48, 35) }), null);
  assert.equal(afterResize({ before: VIEW, after: [[46, 26], [51, Number.NaN]], pick: square(48, 35) }), null);
  assert.equal(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: [48, 35] }), null);
  assert.equal(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: [[49, 35], [48, 36]] }), null, "south above north");
});

test("after a resize: a pick bigger than the map keeps the part that was on screen", () => {
  // A field at zoom 17 is bigger than the map: only part of it shows.
  const field = [[45, 30], [52, 40]];
  // The seen part (lon 30 to 36) still partly shows: nothing to do.
  assert.equal(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: field }), null);
  // A pick only partly on screen at the right edge, now wholly under the panel:
  // bring back the part that was seen (its middle).
  assert.deepEqual(afterResize({ before: VIEW, after: RIGHT_COVERED, pick: [[47, 35], [48, 37]] }), { action: "reach", at: [47.5, 35.5] });
  // Most of the seen part now under the panel (a sixth still shows): a thin
  // sliver does not count as in view, so it is brought back.
  assert.deepEqual(afterResize({ before: VIEW, after: [[46, 26], [51, 31]], pick: field }), { action: "reach", at: [48.5, 33] });
  // At least half of it still shows: left alone.
  assert.equal(afterResize({ before: VIEW, after: [[46, 26], [51, 34]], pick: field }), null);
});
