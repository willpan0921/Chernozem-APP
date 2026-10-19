// WHAT THIS FILE DOES
// Tests for server/field/detect-sample.js: land is split into realistic
// fields (20-80 ha, roads between them, nothing outside the land), and a
// place gets 6-14 parcels around it. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes detect-sample.js.

import test from "node:test";
import assert from "node:assert/strict";
import { clipHalfPlane, clipHalfPlaneParts, parcelsAround, signedArea, splitBoundary } from "./detect-sample.js";
import { areaHa, pointInGeometry } from "../geo.js";

// [[lat, lon], ...] -> a GeoJSON Polygon.
const polygon = (points) => ({ type: "Polygon", coordinates: [[...points.map(([lat, lon]) => [lon, lat]), [points[0][1], points[0][0]]]] });
const box300 = polygon([[49.705, 37.585], [49.705, 37.6115], [49.6915, 37.6115], [49.6915, 37.585]]);

test("clipping a square with a half-plane keeps the right half", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const left = clipHalfPlane(square, 1, 0, 4);
  assert.equal(Math.abs(signedArea(left)), 40);
  const right = clipHalfPlane(square, -1, 0, -4);
  assert.equal(Math.abs(signedArea(right)), 60);
});

// Land drawn in kilometres east and north of 49.7 N, 37.5 E.
const KX = 111.32 * Math.cos((49.7 * Math.PI) / 180);
const lonLat = ([x, y]) => [37.5 + x / KX, 49.7 + y / 110.574];
const ringKm = (points) => [...points.map(lonLat), lonLat(points[0])];

// True when no two edges of a closed ring cross or touch, except
// neighbours at their shared corner (a zero-width bridge would touch).
function isSimple(ring) {
  const pts = ring.slice(0, -1);
  const n = pts.length;
  const orient = (p, q, r) => {
    const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return Math.abs(v) < 1e-14 ? 0 : Math.sign(v);
  };
  const onSeg = (p, q, r) => Math.min(p[0], q[0]) - 1e-12 <= r[0] && r[0] <= Math.max(p[0], q[0]) + 1e-12 && Math.min(p[1], q[1]) - 1e-12 <= r[1] && r[1] <= Math.max(p[1], q[1]) + 1e-12;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const [a, b, c, d] = [pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]];
      const [o1, o2, o3, o4] = [orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)];
      if (o1 !== o2 && o3 !== o4) return false;
      if ((o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b))) return false;
    }
  }
  return true;
}

test("a cut through a U shape gives two separate parts, not one joined by a bridge", () => {
  const u = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]];
  const parts = clipHalfPlaneParts(u, 0, -1, -20); // keep y >= 20
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => Math.abs(signedArea(p))).sort(), [100, 100]);
  assert.equal(clipHalfPlaneParts(u, 0, 1, 5).length, 1); // y <= 5: one strip
});

test("an E-shaped boundary gives only whole, connected fields, whatever the seed", () => {
  const e = { type: "Polygon", coordinates: [ringKm([[0, 0], [1.5, 0], [1.5, 0.4], [0.4, 0.4], [0.4, 0.8], [1.5, 0.8], [1.5, 1.2], [0.4, 1.2], [0.4, 1.6], [1.5, 1.6], [1.5, 2.0], [0, 2.0]])] };
  const land = areaHa(e);
  for (let seed = 0; seed <= 20; seed += 1) {
    const fields = splitBoundary(e, { seed });
    assert.ok(fields.length >= 3, `seed ${seed}: ${fields.length} fields`);
    for (const field of fields) {
      assert.equal(field.geometry.coordinates.length, 1);
      assert.ok(isSimple(field.geometry.coordinates[0]), `seed ${seed}: a field of ${field.areaHa} ha is made of separate parts`);
    }
    const sum = fields.reduce((t, f) => t + f.areaHa, 0);
    assert.ok(sum <= land + 0.01 && sum > land * 0.85, `seed ${seed}: ${sum} of ${land} ha`);
  }
});

test("a hole in the land (a pond, a village) is left out of the fields", () => {
  const holeKm = [[1.2, 1.0], [2.2, 1.0], [2.2, 2.0], [1.2, 2.0]];
  const land = { type: "Polygon", coordinates: [ringKm([[0, 0], [3, 0], [3, 3], [0, 3]]), ringKm([...holeKm].reverse())] };
  const hole = { type: "Polygon", coordinates: [ringKm(holeKm)] };
  const landHa = areaHa(land);
  assert.ok(Math.abs(landHa - 800) < 10, `land ${landHa} ha`);
  for (let seed = 0; seed <= 10; seed += 1) {
    const fields = splitBoundary(land, { seed });
    const sum = fields.reduce((t, f) => t + f.areaHa, 0);
    assert.ok(sum <= landHa + 0.01, `seed ${seed}: ${sum} ha of fields on ${landHa} ha of land`);
    assert.ok(sum > landHa * 0.85, `seed ${seed}: only ${sum} ha`);
    for (const field of fields) {
      // Sample points across the field: (almost) none fall in the hole.
      const [w, s2, e2, n] = field.geometry.coordinates[0].reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
      let inField = 0;
      let inHole = 0;
      for (let i = 0; i < 30; i += 1) {
        for (let j = 0; j < 30; j += 1) {
          const lon = w + ((i + 0.5) / 30) * (e2 - w);
          const lat = s2 + ((j + 0.5) / 30) * (n - s2);
          if (!pointInGeometry(lon, lat, field.geometry)) continue;
          inField += 1;
          if (pointInGeometry(lon, lat, hole)) inHole += 1;
        }
      }
      assert.ok(inHole <= inField * 0.01, `seed ${seed}: ${field.areaHa} ha field is ${Math.round((100 * inHole) / inField)}% in the hole`);
      assert.equal(pointInGeometry(field.centroid[1], field.centroid[0], hole), false);
    }
  }
  // A small pond well inside one field stays a hole in that field.
  const pondKm = [[1.45, 1.45], [1.55, 1.45], [1.55, 1.55], [1.45, 1.55]];
  const withPond = { type: "Polygon", coordinates: [ringKm([[1, 1], [2, 1], [2, 2], [1, 2]]), ringKm([...pondKm].reverse())] };
  const one = splitBoundary(withPond);
  const holed = one.filter((f) => f.geometry.coordinates.length === 2);
  assert.ok(holed.length <= 1);
  const sum = one.reduce((t, f) => t + f.areaHa, 0);
  assert.ok(sum <= areaHa(withPond) + 0.01, `${sum} of ${areaHa(withPond)} ha`);
});

test("a ~300 ha boundary becomes 4-15 fields of a sensible size inside it", () => {
  const total = areaHa(box300);
  assert.ok(total > 250 && total < 330, `box is ${total} ha`);
  const fields = splitBoundary(box300);
  assert.ok(fields.length >= 4 && fields.length <= 15, `${fields.length} fields`);
  for (const field of fields) {
    assert.ok(field.areaHa >= 1, "no slivers");
    assert.ok(field.areaHa <= 90, `field of ${field.areaHa} ha is too big`);
    for (const [lon, lat] of field.geometry.coordinates[0]) {
      // Every corner is inside (or on the edge of) the boundary.
      assert.ok(pointInGeometry(lon, lat, box300) || Math.abs(lat - 49.705) < 1e-6 || Math.abs(lat - 49.6915) < 1e-6 || Math.abs(lon - 37.585) < 1e-6 || Math.abs(lon - 37.6115) < 1e-6);
    }
    const ring = field.geometry.coordinates[0];
    assert.deepEqual(ring[0], ring[ring.length - 1], "rings are closed");
  }
  const sum = fields.reduce((s, f) => s + f.areaHa, 0);
  // Roads take a little, slivers are dropped: most of the land is fields.
  assert.ok(sum < total && sum > total * 0.9, `fields cover ${sum} of ${total} ha`);
  assert.deepEqual(splitBoundary(box300), fields, "the same land gives the same fields");
});

test("fields are separated by road strips", () => {
  const fields = splitBoundary(box300);
  // No point of one field lies strictly inside another field.
  for (const a of fields) {
    for (const b of fields) {
      if (a === b) continue;
      const [lat, lon] = a.centroid;
      assert.equal(pointInGeometry(lon, lat, b.geometry), false);
    }
  }
});

test("a huge boundary still gives at most 60 fields", () => {
  const big = polygon([[50.0, 30.0], [50.0, 30.6], [49.6, 30.6], [49.6, 30.0]]);
  const fields = splitBoundary(big);
  assert.ok(fields.length > 10 && fields.length <= 60, `${fields.length}`);
});

test("a place gets 6 to 14 parcels around it, anywhere on Earth", () => {
  for (const [lat, lon] of [[49.7, 37.6], [-33.1, 147.2], [41.9, -93.6], [0.3, 32.5]]) {
    for (const radius of [300, 1200, 3000]) {
      const parcels = parcelsAround(lat, lon, radius);
      assert.ok(parcels.length >= 6 && parcels.length <= 14, `${parcels.length} at ${lat},${lon} r=${radius}`);
      for (const parcel of parcels) {
        assert.ok(Number.isFinite(parcel.areaHa) && parcel.areaHa >= 1);
        assert.ok(parcel.centroid.every(Number.isFinite));
      }
    }
  }
});
