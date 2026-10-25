// WHAT THIS FILE DOES
// Checks which state names the map shows (labels.js chooseLabels).
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the map's names are placed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLabels, placeLabels, pointInGeometry } from "./labels.js";

const box = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });

test("names that overlap: the bigger unit's (listed first) wins", () => {
  const shown = chooseLabels([
    { id: "big", rect: box(100, 100, 60, 14), unitRect: box(60, 60, 200, 120) },
    { id: "small", rect: box(130, 105, 50, 14), unitRect: box(120, 90, 80, 60) },
    { id: "far", rect: box(400, 300, 50, 14), unitRect: box(380, 280, 100, 80) },
  ]);
  assert.deepEqual([...shown].sort(), ["big", "far"]);
});

test("a name much wider than its unit is hidden until the map is zoomed in", () => {
  const name = box(100, 100, 80, 14);
  assert.equal(chooseLabels([{ id: "polk", rect: name, unitRect: box(110, 90, 40, 40) }]).size, 0);
  // Zoomed in: the unit is twice as wide on screen.
  assert.equal(chooseLabels([{ id: "polk", rect: name, unitRect: box(90, 80, 80, 80) }]).size, 1);
  // A little wider than the unit is fine (names may run over the border).
  assert.equal(chooseLabels([{ id: "polk", rect: name, unitRect: box(100, 80, 70, 60) }]).size, 1);
});

test("names off screen never hide names on screen; the gap keeps names apart", () => {
  const view = { width: 300, height: 300 };
  const off = { id: "off", rect: box(-80, 100, 70, 14), unitRect: box(-200, 0, 400, 300) };
  const on = { id: "on", rect: box(-30, 100, 60, 14), unitRect: box(-60, 50, 200, 200) };
  // Without the view both are on the map and the first wins.
  assert.ok(!chooseLabels([off, on]).has("on"));
  assert.ok(chooseLabels([off, on], { view }).has("on"));
  // Two names 2 px apart: the second is hidden (4 px gap), even a size
  // smaller (it would still come within 4 px).
  const a = { id: "a", rect: box(0, 0, 50, 14), unitRect: box(0, 0, 100, 100) };
  const b = { id: "b", rect: box(52, 0, 20, 14), unitRect: box(40, 0, 100, 100) };
  assert.deepEqual([...chooseLabels([a, b])], ["a"]);
  assert.deepEqual([...chooseLabels([a, b], { gap: 0 })], ["a", "b"]);
});

test("no names, or names without a box, show nothing", () => {
  assert.equal(chooseLabels([]).size, 0);
  assert.equal(chooseLabels(null).size, 0);
  assert.equal(chooseLabels([{ id: "x", rect: null }]).size, 0);
});

// Two neighbours whose label points are about 36 px apart at the 1280 view
// (Mykolaiv and Odesa in Ukraine): the higher-ranked one comes first and
// keeps its spot; the other moves to another spot inside its own unit
// instead of disappearing.
test("a high-ranked small unit next to a bigger one: both names are shown, the second moved inside its unit", () => {
  const mykolaiv = { id: "mykolaiv", rect: box(500, 300, 62, 15), unitRect: box(470, 270, 110, 110) };
  const odesa = { id: "odesa", rect: box(476, 308, 44, 15), unitRect: box(380, 290, 130, 200), anchors: [{ dx: 0, dy: -8 }, { dx: 0, dy: 44 }, { dx: -28, dy: 0 }] };
  // Without other spots the second name is hidden...
  assert.deepEqual([...chooseLabels([mykolaiv, { ...odesa, anchors: [] }])], ["mykolaiv"]);
  // ...with them both show, the second at the first spot that is free.
  const placed = placeLabels([mykolaiv, odesa]);
  assert.deepEqual([...placed.keys()], ["mykolaiv", "odesa"]);
  assert.deepEqual(placed.get("mykolaiv"), { dx: 0, dy: 0, scale: 1 });
  assert.deepEqual(placed.get("odesa"), { dx: 0, dy: 44, scale: 1 });
});

test("a name that only fits a little smaller is shown smaller, never shortened", () => {
  // 70 px name, unit 50 px wide: 70 > 1.25 x 50 = 62.5, but 0.84 x 70 = 59 fits.
  const placed = placeLabels([{ id: "u", rect: box(0, 0, 70, 14), unitRect: box(0, -20, 50, 60) }]);
  assert.equal(placed.get("u").scale, 0.84);
});

test("names stay clear of the map's buttons and tabs, and the picked unit always keeps its name", () => {
  const tab = box(0, 380, 24, 60);
  const edge = { id: "edge", rect: box(4, 400, 70, 14), unitRect: box(0, 360, 120, 100), anchors: [{ dx: 30, dy: 0 }] };
  assert.deepEqual(placeLabels([edge], { blocked: [tab] }).get("edge"), { dx: 30, dy: 0, scale: 1 });
  assert.equal(placeLabels([{ ...edge, anchors: [] }], { blocked: [tab] }).size, 0);
  // The picked unit: shown even where its name is too wide for it.
  const picked = { id: "picked", rect: box(100, 100, 90, 14), unitRect: box(120, 90, 30, 30), always: true };
  assert.ok(chooseLabels([picked]).has("picked"));
  assert.ok(!chooseLabels([{ ...picked, always: false }]).has("picked"));
});

test("pointInGeometry: polygons, holes and multipolygons", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.equal(pointInGeometry(2, 2, { type: "Polygon", coordinates: [square] }), true);
  assert.equal(pointInGeometry(12, 2, { type: "Polygon", coordinates: [square] }), false);
  assert.equal(pointInGeometry(5, 5, { type: "Polygon", coordinates: [square, hole] }), false);
  const far = [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]];
  assert.equal(pointInGeometry(25, 25, { type: "MultiPolygon", coordinates: [[square], [far]] }), true);
  assert.equal(pointInGeometry(15, 15, { type: "MultiPolygon", coordinates: [[square], [far]] }), false);
  assert.equal(pointInGeometry(1, 1, null), false);
});
