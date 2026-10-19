// WHAT THIS FILE DOES
// Tests for geometry.js (overlap, matching, naming and "Find fields again"
// on GeoJSON outlines). Run with: npm test
//
// WHO EDITS IT
// Whoever changes geometry.js.

import test from "node:test";
import assert from "node:assert/strict";
import {
  areaHa,
  centroid,
  compareNames,
  matchFields,
  outerRing,
  overlap,
  overlappingFields,
  planFieldsToSave,
  pointInGeometry,
  redetectBody,
} from "./geometry.js";

// A square outline [lon, lat] of side `deg` degrees with its south-west corner at (lon, lat).
const square = (lon, lat, deg = 0.01) => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + deg, lat], [lon + deg, lat + deg], [lon, lat + deg], [lon, lat]]],
});
const field = (id, name, geometry, extra = {}) => ({ id, name, geometry, areaHa: areaHa(geometry), ...extra });

test("area of a 0.01° square near Kupiansk is about 80 ha", () => {
  const ha = areaHa(square(37.5, 49.7));
  assert.ok(ha > 78 && ha < 82, `got ${ha}`);
});

test("points in holes are outside", () => {
  const withHole = {
    type: "Polygon",
    coordinates: [square(0, 0, 1).coordinates[0], square(0.4, 0.4, 0.2).coordinates[0]],
  };
  assert.equal(pointInGeometry(0.1, 0.1, withHole), true);
  assert.equal(pointInGeometry(0.5, 0.5, withHole), false);
});

test("overlap: the same outline is IoU 1, half-shifted is about 1/3, apart is 0", () => {
  const a = square(37.5, 49.7);
  assert.ok(overlap(a, a).iou > 0.98);
  const half = overlap(a, square(37.505, 49.7));
  assert.ok(Math.abs(half.iou - 1 / 3) < 0.03, `got ${half.iou}`);
  assert.ok(Math.abs(half.sharedHa - areaHa(a) / 2) < 1.5);
  assert.equal(overlap(a, square(37.6, 49.7)).iou, 0);
});

test("overlappingFields: a field drawn over two others names both; one just touching an edge is fine", () => {
  const f4 = field("f4", "Field 4", square(37.5, 49.7));
  const f7 = field("f7", "Field 7", square(37.51, 49.7));
  const big = square(37.502, 49.701, 0.014);
  assert.deepEqual(overlappingFields(big, [f4, f7]).map((o) => o.field.name).sort(), ["Field 4", "Field 7"]);
  const touching = square(37.52, 49.7);
  assert.deepEqual(overlappingFields(touching, [f4, f7]), []);
});

test("matchFields keeps only good matches, one to one", () => {
  const f1 = field("f1", "Field 1", square(37.5, 49.7));
  const f2 = field("f2", "Field 2", square(37.52, 49.7));
  const same = { id: "c1", geometry: square(37.5005, 49.7) };
  const shifted = { id: "c2", geometry: square(37.525, 49.7) }; // IoU 1/3 with Field 2
  const twin = { id: "c3", geometry: square(37.5, 49.7) };
  const matches = matchFields([same, shifted, twin], [f1, f2]);
  assert.equal(matches.size, 1);
  assert.equal(matches.get("c3").field.id, "f1", "the best match wins");
  assert.equal(matches.has("c2"), false);
});

test("planFieldsToSave keeps the name and crop of a good match, numbers the rest and sorts by name", () => {
  const f7 = field("f7", "Field 7", square(37.5, 49.7), { crop: "Corn" });
  const chosen = [
    { id: "a", geometry: square(37.52, 49.68) }, // south-east
    { id: "b", geometry: square(37.5, 49.7) }, // Field 7's land
    { id: "c", geometry: square(37.48, 49.72) }, // north-west
  ];
  const { fields, kept } = planFieldsToSave(chosen, [f7]);
  assert.equal(kept, 1);
  assert.deepEqual(fields.map((f) => f.name), ["Field 1", "Field 2", "Field 7"]);
  assert.equal(fields[2].crop, "Corn");
  assert.equal(fields[0].geometry, chosen[2].geometry, "Field 1 is the north-west one");
  assert.ok(fields.every((f) => f.source === "detected"));
});

test("planFieldsToSave does not hand an old name to a block that only covers part of it", () => {
  const f7 = field("f7", "Field 7", square(37.5, 49.7));
  const { fields, kept } = planFieldsToSave([{ id: "a", geometry: square(37.505, 49.7) }], [f7]);
  assert.equal(kept, 0);
  assert.equal(fields[0].name, "Field 1");
});

test("compareNames sorts numbers naturally", () => {
  assert.deepEqual(["Field 10", "Field 2", "Field 1"].sort(compareNames), ["Field 1", "Field 2", "Field 10"]);
});

test("outerRing and centroid use the largest outline", () => {
  const multi = { type: "MultiPolygon", coordinates: [square(0, 0, 0.1).coordinates, square(1, 1, 1).coordinates] };
  assert.equal(outerRing(multi).length, 4);
  assert.deepEqual(outerRing(multi)[0], [1, 1]);
  const [lat, lon] = centroid(multi);
  assert.ok(Math.abs(lat - 1.5) < 1e-9 && Math.abs(lon - 1.5) < 1e-9);
});

test("redetectBody: the farm's land when it has one, else a circle that covers every field", () => {
  const boundary = square(37.5, 49.7, 0.02);
  assert.equal(redetectBody({ boundary, fields: [] }).source, "boundary");
  const body = redetectBody({ boundary: null, location: { lat: 49.705, lon: 37.505 }, fields: [field("f", "F", square(37.5, 49.7))] });
  assert.equal(body.source, "point");
  assert.ok(body.radiusM >= 300 && body.radiusM <= 3000);
  assert.ok(body.radiusM > 500, "covers the corners");
  assert.equal(redetectBody({ boundary: null, fields: [] }), null);
});
