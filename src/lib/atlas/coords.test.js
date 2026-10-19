// WHAT THIS FILE DOES
// Checks that typed GPS coordinates are read and checked correctly
// (coords.js). Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes which coordinate formats the Area picker accepts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBox, checkPolygon, fromDecimalCommas, labelledCoordinates, parseCoordinates, pointsToGeometry, polygonAreaHa } from "./coords.js";

test("reads the common ways of writing a coordinate", () => {
  const { points, errors } = parseCoordinates(
    ["49.7, 37.5", "49.7 37.5", "49.7°N 37.5°E", "49.7N,37.5E", "  -1.29;36.82 ", "", "1.29°S\t36.82°W", "37.5E 49.7N", "(49.7, 37.5)"].join("\n")
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(points, [
    [49.7, 37.5],
    [49.7, 37.5],
    [49.7, 37.5],
    [49.7, 37.5],
    [-1.29, 36.82],
    [-1.29, -36.82],
    [49.7, 37.5],
    [49.7, 37.5],
  ]);
});

test("says which line is wrong", () => {
  const { points, errors } = parseCoordinates("49.7, 37.5\nhello\n91, 10\n10, 200\n1 2 3");
  assert.equal(points.length, 1);
  assert.deepEqual(errors.map((e) => e.line), [2, 3, 4, 5]);
  assert.match(errors[1].message, /latitude/);
  assert.match(errors[2].message, /longitude/);
});

// A square of about 50 ha near 49.74, 37.54: 0.0064° of latitude is about
// 711 m and 0.0099° of longitude is about 711 m at this latitude.
const farm = [
  [49.74, 37.54],
  [49.74, 37.5499],
  [49.7464, 37.5499],
  [49.7464, 37.54],
];

test("works out the area in hectares", () => {
  const ha = polygonAreaHa(farm);
  assert.ok(ha > 45 && ha < 55, `${ha}`);
  // A repeated closing point changes nothing.
  assert.ok(Math.abs(polygonAreaHa([...farm, farm[0]]) - ha) < 1e-9);
});

test("checks polygons against the server's limits", () => {
  assert.equal(checkPolygon(farm).ok, true);
  assert.equal(checkPolygon(farm.slice(0, 2)).message, "Add 1 more point.");
  assert.equal(checkPolygon([]).message, "Add at least 3 corner points.");
  const tiny = [[49.74, 37.54], [49.74, 37.5401], [49.7401, 37.5401]];
  assert.match(checkPolygon(tiny).message, /Too small/);
  const huge = [[-60, -170], [-60, 0], [70, 0], [70, -170]];
  assert.equal(checkPolygon(huge).ok, false);
});

test("checks a box", () => {
  assert.equal(checkBox({ north: "49.7464", south: "49.74", east: "37.5499", west: "37.54" }).ok, true);
  assert.equal(checkBox({ north: "49", south: "50", east: "1", west: "0" }).message, "North must be greater than south.");
  assert.equal(checkBox({ north: "", south: "50", east: "1", west: "0" }).message, "Fill in north, south, east and west.");
  assert.equal(checkBox({ north: "x", south: "50", east: "1", west: "0" }).message, "North is not a number.");
});

test("points become a closed GeoJSON polygon of lon, lat", () => {
  const { geometry, bbox } = pointsToGeometry(farm);
  assert.equal(geometry.type, "Polygon");
  assert.deepEqual(geometry.coordinates[0][0], [37.54, 49.74]);
  assert.deepEqual(geometry.coordinates[0].at(-1), [37.54, 49.74]);
  assert.deepEqual(bbox, [37.54, 49.74, 37.5499, 49.7464]);
  assert.equal(pointsToGeometry([[1, 2]]), null);
});

test("named coordinates and decimal commas (the farm setup's Coordinates tab and the area picker)", () => {
  // Real case (2026-10-19): the place search read these, the Coordinates tab refused them.
  assert.deepEqual(parseCoordinates("-34,90; -60,95"), { points: [[-34.9, -60.95]], errors: [] });
  assert.deepEqual(parseCoordinates("-34,6 -60,0").points, [[-34.6, -60]]);
  assert.deepEqual(parseCoordinates("49,74, 37,54").points, [[49.74, 37.54]]);
  assert.deepEqual(parseCoordinates("lat -33.9 lon 18.4"), { points: [[-33.9, 18.4]], errors: [] });
  assert.deepEqual(parseCoordinates("lat: -34.6, lng: -58.4").points, [[-34.6, -58.4]]);
  assert.deepEqual(parseCoordinates("lon 18.4 lat -33.9").points, [[-33.9, 18.4]]);
  assert.deepEqual(parseCoordinates("latitude=48,2 longitude=1,6").points, [[48.2, 1.6]]);
  // A polygon mixing the forms, one point per line.
  const ring = parseCoordinates("-34,90; -60,95\nlat -34.91 lon -60.95\n-34.91, -60.94");
  assert.equal(ring.points.length, 3);
  assert.equal(ring.errors.length, 0);
  // Still refused: a lone decimal comma (the comma separates lat and lon),
  // the same axis twice, and out of range.
  assert.deepEqual(parseCoordinates("49,7").points, [[49, 7]]);
  assert.equal(parseCoordinates("lat 10 lat 20").errors.length, 1);
  assert.match(parseCoordinates("lat 95 lon 10").errors[0].message, /latitude must be from -90 to 90/);
  assert.match(parseCoordinates("lat 45 lon 190").errors[0].message, /longitude must be from -180 to 180/);
  assert.deepEqual(labelledCoordinates("lng: 30, lat: 50"), { lat: 50, lon: 30 });
  assert.equal(fromDecimalCommas("49.7, 37.5"), "49.7, 37.5");
});
