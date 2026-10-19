// WHAT THIS FILE DOES
// Checks the "Top areas" grouping in hotspots.js. Run with:
//   node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how top areas are grouped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlaces } from "./scoring.js";
import { cellBounds, compassName, findFocus, groupHotspots, labelHasCoords, labelParts, parseCellId, placeLabel, placesExtent, squaresText } from "./hotspots.js";
import { makePlaces } from "./testPlaces.js";

const { places } = scorePlaces(makePlaces(12, 12));

test("cell ids give their row and column", () => {
  assert.deepEqual(parseCellId("r12c40"), { row: 12, col: 40 });
  assert.equal(parseCellId("Odesa"), null);
});

test("labels use place names when there are any, else coordinates", () => {
  assert.equal(placeLabel({ lat: 49.621, lon: 37.744 }), "49.62° N, 37.74° E");
  assert.equal(placeLabel({ lat: -1.2, lon: -36.8 }), "1.20° S, 36.80° W");
  assert.equal(placeLabel({ lat: 48, lon: 38, admin1: "Donetsk", admin2: "Bakhmut" }), "Bakhmut, Donetsk");
  assert.equal(placeLabel({ lat: 48, lon: 38, admin1: "Donetsk" }), "Donetsk");
  // Farm-sized squares get enough decimals to tell neighbours apart.
  assert.equal(placeLabel({ lat: 49.74025, lon: 37.54075 }, 0.0005), "49.7403° N, 37.5408° E");
  assert.equal(placeLabel({ lat: 49.74025, lon: 37.54075 }, 0.01), "49.740° N, 37.541° E");
});

test("compass names cut the area into thirds", () => {
  const extent = [30, 45, 33, 48]; // west, south, east, north
  assert.equal(compassName(47.9, 30.1, extent), "North-west");
  assert.equal(compassName(46.5, 32.9, extent), "East");
  assert.equal(compassName(45.1, 31.5, extent), "South");
  assert.equal(compassName(46.5, 31.5, extent), "Centre");
  assert.deepEqual(placesExtent([{ lat: 1, lon: 2 }, { lat: 3, lon: -4 }]), [-4, 1, 2, 3]);
});

test("top areas are named by place, else by compass, with coordinates only when names repeat", () => {
  const hotspots = groupHotspots(places, "nearTerm", { count: 10, cellSizeDeg: 0.25 });
  const compass = /^(North|South|East|West|Centre|North-east|North-west|South-east|South-west)( · .+)?$/;
  for (const h of hotspots) {
    assert.match(h.label, compass);
    assert.ok(!/^Area \d/.test(h.label));
    assert.match(h.coords, /° [NS], .+° [EW]$/);
  }
  // Every name in the list is different.
  assert.equal(new Set(hotspots.map((h) => h.label)).size, hotspots.length);
  // A repeated compass name carries its coordinates; a unique one does not.
  const bases = hotspots.map((h) => h.label.split(" · ")[0]);
  hotspots.forEach((h, i) => {
    const repeated = bases.filter((b) => b === bases[i]).length > 1;
    assert.equal(labelHasCoords(h), repeated, h.label);
    if (repeated) assert.equal(h.label, `${bases[i]} · ${h.coords}`);
    // Split for two-line lists: the compass part, then the coordinates and
    // the group's size.
    assert.deepEqual(labelParts(h), { title: bases[i], coords: `${h.coords} · ${squaresText(h.squares)}`, point: h.coords, size: squaresText(h.squares) });
    assert.equal(h.squares, h.cellIds.length);
  });
  // Place names win when the run has them.
  const named = scorePlaces(makePlaces(12, 12).map((p) => ({ ...p, admin1: "Kharkiv", admin2: `D${p.id.split("c")[1]}` }))).places;
  const [first] = groupHotspots(named, "nearTerm", { count: 1, cellSizeDeg: 0.25 });
  assert.match(first.label, /^D\d+, Kharkiv$/);
});

test("gives back the asked-for number of groups, ranked 1..n, no square twice", () => {
  for (const timeframe of ["nearTerm", "postwar"]) {
    const hotspots = groupHotspots(places, timeframe, { count: 5, cellSizeDeg: 0.25 });
    assert.equal(hotspots.length, 5);
    assert.deepEqual(hotspots.map((h) => h.rank), [1, 2, 3, 4, 5]);
    const ids = hotspots.flatMap((h) => h.cellIds);
    assert.equal(new Set(ids).size, ids.length);
    // Scores go down the list.
    for (let i = 1; i < hotspots.length; i++) assert.ok(hotspots[i - 1].score >= hotspots[i].score);
  }
});

test("the first group starts at the best square and only takes touching, strong squares", () => {
  const [first] = groupHotspots(places, "nearTerm", { count: 1, cellSizeDeg: 0.25 });
  const best = places.find((p) => p.nearTerm.rank === 1);
  assert.equal(first.id, `h-${best.id}`);
  assert.equal(first.cellIds[0], best.id);
  assert.ok(first.cellIds.length > 1, "neighbours of similar strength join");
  const start = parseCellId(best.id);
  for (const id of first.cellIds) {
    const at = parseCellId(id);
    assert.ok(Math.max(Math.abs(at.row - start.row), Math.abs(at.col - start.col)) <= 3);
    const place = places.find((p) => p.id === id);
    assert.ok(place.nearTerm.score >= 0.7 * best.nearTerm.score);
  }
});

test("set-aside squares never join a Near-term group", () => {
  const hotspots = groupHotspots(places, "nearTerm", { count: 10, cellSizeDeg: 0.25 });
  const setAside = new Set(places.filter((p) => p.nearTerm.tier === "setAside").map((p) => p.id));
  assert.ok(hotspots.flatMap((h) => h.cellIds).every((id) => !setAside.has(id)));
});

test("totals and bounds cover every member", () => {
  const [first] = groupHotspots(places, "postwar", { count: 1, cellSizeDeg: 0.25 });
  const members = places.filter((p) => first.cellIds.includes(p.id));
  const sum = members.reduce((total, p) => total + p.blackSoilHa, 0);
  assert.ok(Math.abs(first.blackSoilHa - sum) < 1e-6);
  const [[south, west], [north, east]] = first.bounds;
  for (const p of members) assert.ok(p.lat > south && p.lat < north && p.lon > west && p.lon < east);
  assert.deepEqual(cellBounds({ lat: 10, lon: 20 }, 0.5), [[9.75, 19.75], [10.25, 20.25]]);
});

test("findFocus finds a hotspot id or a square id", () => {
  const hotspots = groupHotspots(places, "nearTerm", { count: 3, cellSizeDeg: 0.25 });
  assert.equal(findFocus(hotspots[1].id, { places, hotspots }).kind, "hotspot");
  assert.equal(findFocus("r5c5", { places, hotspots }).place.id, "r5c5");
  // A hotspot id from another time frame still finds its starting square.
  assert.equal(findFocus("h-r5c5", { places, hotspots: [] }).place.id, "r5c5");
  assert.equal(findFocus("nope", { places, hotspots }), null);
});

test("an empty run gives no groups", () => {
  assert.deepEqual(groupHotspots([], "nearTerm"), []);
});

test("the size tells apart groups that share a name and a start (10.7)", () => {
  assert.equal(squaresText(1), "1 square");
  assert.equal(squaresText(12), "12 squares");
  assert.equal(squaresText(1200), "1,200 squares");
  // Two groups from the same starting square, one per time frame, with a
  // different number of squares: their second lines differ.
  const near = { label: "North-west", coords: "47.98° N, 24.76° E", squares: 12, cellIds: [] };
  const long = { ...near, squares: 3 };
  assert.equal(labelParts(near).title, labelParts(long).title);
  assert.notEqual(labelParts(near).coords, labelParts(long).coords);
  assert.equal(labelParts(near).coords, "47.98° N, 24.76° E · 12 squares");
  // Older hotspots without "squares" count their cell ids.
  assert.equal(labelParts({ label: "East", coords: "1.00° N, 2.00° E", cellIds: ["a", "b"] }).size, "2 squares");
  assert.deepEqual(labelParts(null), { title: "", coords: null, point: null, size: null });
  // On the made-up grid: whenever the two time frames give a top area the
  // same name and start, the full two-line text still differs unless it
  // is the very same group.
  const byTf = ["nearTerm", "postwar"].map((tf) => groupHotspots(places, tf, { count: 10, cellSizeDeg: 0.25 }));
  for (const a of byTf[0]) {
    for (const b of byTf[1]) {
      const same = a.cellIds.length === b.cellIds.length && a.cellIds.every((id) => b.cellIds.includes(id));
      const pa = labelParts(a);
      const pb = labelParts(b);
      if (pa.title === pb.title && pa.coords === pb.coords) assert.ok(same, `${pa.title} ${pa.coords}`);
    }
  }
});
