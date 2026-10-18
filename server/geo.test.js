// WHAT THIS FILE DOES
// Tests for server/geo.js: areas, point-in-polygon, grid sizing and the
// 180° line. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes geo.js.

import test from "node:test";
import assert from "node:assert/strict";
import { areaHa, bboxOf, chooseCellSize, planGrid, pointInGeometry, simplifyGeometry, splitAntimeridian, formatCoord } from "./geo.js";
import { getCountry } from "./countries.js";

const square = (west, south, size) => ({
  type: "Polygon",
  coordinates: [[[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]]],
});

test("area of a 0.01° square at the equator is about 123.9 ha", () => {
  const ha = areaHa(square(0, 0, 0.01));
  assert.ok(Math.abs(ha - 123.9) < 1, `got ${ha}`);
});

test("area of a 1° square at 60° N is about half of one at the equator", () => {
  const ratio = areaHa(square(10, 59.5, 1)) / areaHa(square(10, -0.5, 1));
  assert.ok(Math.abs(ratio - 0.5) < 0.01, `got ${ratio}`);
});

test("holes are subtracted from the area", () => {
  const withHole = {
    type: "Polygon",
    coordinates: [square(0, 0, 1).coordinates[0], square(0.25, 0.25, 0.5).coordinates[0]],
  };
  const expected = areaHa(square(0, 0, 1)) - areaHa(square(0.25, 0.25, 0.5));
  assert.ok(Math.abs(areaHa(withHole) - expected) < 1);
});

test("point in polygon, holes and multipolygons", () => {
  const ring = square(0, 0, 1).coordinates[0];
  const hole = square(0.4, 0.4, 0.2).coordinates[0];
  const polygon = { type: "Polygon", coordinates: [ring, hole] };
  assert.equal(pointInGeometry(0.1, 0.1, polygon), true);
  assert.equal(pointInGeometry(0.5, 0.5, polygon), false, "inside the hole");
  assert.equal(pointInGeometry(1.5, 0.5, polygon), false);
  const multi = { type: "MultiPolygon", coordinates: [[ring], square(5, 5, 1).coordinates] };
  assert.equal(pointInGeometry(5.5, 5.5, multi), true);
  assert.equal(pointInGeometry(3, 3, multi), false);
});

test("bbox of a geometry", () => {
  assert.deepEqual(bboxOf(square(10, 20, 2)), [10, 20, 12, 22]);
});

test("Ukraine gets 0.25° cells, between 150 and 1500 of them", () => {
  const ukraine = getCountry("804");
  assert.equal(ukraine.name, "Ukraine");
  const grid = planGrid(ukraine.geometry);
  assert.equal(grid.cellSizeDeg, 0.25);
  assert.ok(grid.cells.length >= 150 && grid.cells.length <= 1500, `got ${grid.cells.length}`);
  // Includes Crimea (internationally recognised border): about 603,000 km².
  assert.ok(grid.areaHa / 100 > 590000 && grid.areaHa / 100 < 615000, `area ${grid.areaHa / 100}`);
  assert.ok(pointInGeometry(34.1, 44.95, ukraine.geometry), "Simferopol is inside Ukraine");
  assert.ok(!pointInGeometry(34.1, 44.95, getCountry("643").geometry), "Simferopol is not inside Russia");
});

test("a 50 ha square near Kharkiv gets tiny cells and a few hundred of them", () => {
  // 50 ha ≈ 0.707 km per side.
  const side = 0.707 / 111.32;
  const lonSide = side / Math.cos((49.74 * Math.PI) / 180);
  const farm = {
    type: "Polygon",
    coordinates: [[[37.54, 49.74], [37.54 + lonSide, 49.74], [37.54 + lonSide, 49.74 + side], [37.54, 49.74 + side], [37.54, 49.74]]],
  };
  assert.ok(Math.abs(areaHa(farm) - 50) < 1.5, `area ${areaHa(farm)}`);
  const grid = planGrid(farm);
  assert.ok([0.0005, 0.001].includes(grid.cellSizeDeg), `size ${grid.cellSizeDeg}`);
  assert.ok(grid.cells.length >= 50 && grid.cells.length <= 1500, `got ${grid.cells.length}`);
  const total = grid.cells.reduce((sum, cell) => sum + cell.areaHa, 0);
  assert.ok(Math.abs(total - 50) < 1, "cell areas add up to the area");
});

test("a tiny area still gets one cell", () => {
  const grid = planGrid(square(30, 50, 0.0002));
  assert.ok(grid.cells.length >= 1);
});

test("cell size grows with the area", () => {
  assert.ok(chooseCellSize(1, 50) < chooseCellSize(1000, 50));
  assert.ok(chooseCellSize(1000, 50) < chooseCellSize(1000000, 50));
});

test("outlines crossing the 180° line are split", () => {
  const ring = [[179, -17], [-179, -17], [-179, -16], [179, -16], [179, -17]];
  const split = splitAntimeridian({ type: "Polygon", coordinates: [ring] });
  assert.equal(split.type, "MultiPolygon");
  assert.equal(split.coordinates.length, 2);
  for (const polygon of split.coordinates) for (const [lon] of polygon[0]) assert.ok(lon >= -180 && lon <= 180);
  const fiji = getCountry("242");
  const km2 = areaHa(fiji.geometry) / 100;
  assert.ok(km2 > 15000 && km2 < 22000, `Fiji ${km2} km²`);
});

test("simplify keeps a valid outline with fewer points", () => {
  const ukraine = getCountry("804").geometry;
  const simple = simplifyGeometry(ukraine, 0.01);
  const count = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates).reduce((n, p) => n + p[0].length, 0);
  assert.ok(count(simple) < count(ukraine));
  assert.ok(count(simple) > 50);
});

test("formatCoord", () => {
  assert.equal(formatCoord(49.621, 37.744), "49.62° N, 37.74° E");
  assert.equal(formatCoord(-1.29, -36.8), "1.29° S, 36.80° W");
});
