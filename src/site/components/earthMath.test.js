// WHAT THIS FILE DOES
// Checks the About page Earth's arithmetic (earthMath.js) without a
// browser: the slow turn goes west to east at a calm speed, a drag moves
// the land under the pointer (and, zoomed in, keeps up with it across the
// screen at any tilt), a flight to an event follows the great circle,
// never breaks between opposite sides of the Earth, zooms evenly and goes
// out on the way between two far places, markers fade before the edge of
// the disc (and of the lens, zoomed in), a click goes to the nearest dot,
// a dot's name stays inside the globe and on the screen, a place lands on
// the disc where d3-geo draws it at any zoom, the place under a point is
// the one d3-geo finds there, the lens's edge is exactly where d3-geo cuts
// the lines, a zoom keeps the place under the pointer where it is, the
// zoom stays within its limits, a wheel notch, a trackpad's small steps
// and a pinch zoom as far as they should, and a visitor scrolling down over
// the Earth always reaches the page in a few notches. The view that frames
// a picked event holds it and the countries its lines go to inside the
// lens (a tight group close up, a wide one less, an event alone closest,
// a spread too wide with the event half out towards its lines); every
// line is there from the start with its arrowhead pointing from the
// crisis to the country, each pair of countries drawn once (from the
// first of a country's events), and each country gets one mark; the lines
// fade towards the lens's edge and nothing is drawn past it (the mask the
// component lays over them leaves exactly that fade); a dot's name, hidden
// while the Earth moves under a still pointer and for the picked dot,
// stays hidden whatever the order of earth.css's rules; the picked
// lines grow one after another (all at once with reduced motion); the
// zoom buttons never touch the disc (its corner on a large globe, else
// beside it where there is room, else under it); a card under the globe
// is shown together with the globe; the globe keeps the conflicts and the
// orange and red alerts in that order, and the card's words. Then the
// black-soil shapes: the outlines close, holes sit
// inside their shapes and every shape is wound the way d3-geo reads a
// small shape (wound the other way, d3-geo would paint the whole Earth
// black), and the shipped file (public/site/world/black-soil.json) stays
// small and covers the real belts (Ukraine, the steppe, the prairies, the
// Pampas, northeast China) and not the Sahara or the sea. Last, the real
// Earth's picture: only a phone with an ordinary screen (or a visitor
// saving data) gets the smallest copy, a sharp phone the middle one, a
// large sharp globe (or one zoomed in) the 3072 one, and only a large
// globe zoomed in on a sharp screen the sharpest (6144: never on a phone
// or a tablet, never past what the graphics card takes, never for a
// visitor saving data); the four copies are there and small, and the
// WebGL program's arithmetic
// (followed step for step by shaderPlace) finds, under every pixel,
// exactly the place d3-geo draws there, at several turns, zooms, sizes and
// screen sharpnesses, so the grid, the soil, the lines and the dots drawn
// over the picture sit on the right places, and the picture stops at the
// lens's edge.
//
// WHO EDITS IT
// Whoever changes earthMath.js.
// Run: node --test src/site/components/earthMath.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea, geoContains, geoOrthographic, geoStream } from "d3-geo";
import {
  along,
  arcDegrees,
  arrowHead,
  blockShares,
  cardWords,
  centreFor,
  clampZoom,
  contourRings,
  countWords,
  discRadius,
  dragFollow,
  dragTo,
  dragView,
  earthEvents,
  earthPicture,
  eventLine,
  facing,
  FIT_MAX,
  FIT_MIN,
  FIT_ROOM,
  fitView,
  flyAt,
  flyMs,
  insideRing,
  lensAngle,
  lensFacing,
  fadeStops,
  LINE_FADE,
  lineFade,
  lineGrowth,
  linesDone,
  LINE_MS,
  LINE_STAGGER_MS,
  markerOpacity,
  MAX_TILT,
  nearestMarker,
  networkLines,
  networkMarks,
  OVER_GLOBE,
  PHONE_GLOBE,
  PICTURE_WIDTHS,
  pinchZoom,
  placeAt,
  projectOn,
  revealBoth,
  ringArea,
  ringsToPolygons,
  rotationFor,
  roundRing,
  shaderPlace,
  shaderView,
  SHARPEST,
  simplifyRing,
  softBlur,
  soilShapes,
  spin,
  SPIN_DEG_PER_S,
  START,
  statusLine,
  tipPlace,
  topBuyerLine,
  wheelRoom,
  wheelZoomFactor,
  WIDE_GLOBE,
  zoomBarPlace,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  zoomAround,
} from "./earthMath.js";
import { buyersOf, normLng } from "./globeMath.js";

process.env.TZ = "America/Los_Angeles";

const here = dirname(fileURLToPath(import.meta.url));
const worldFile = (name) => join(here, "..", "..", "..", "public", "site", "world", name);
const COUNTRIES = JSON.parse(readFileSync(worldFile("countries.json"), "utf8"));

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

// ---------- Turning ----------

test("the Earth turns on its own from west to east, one whole turn in 80 seconds", () => {
  assert.equal(SPIN_DEG_PER_S, 4.5);
  const after = spin({ lat: 30, lng: 31 }, 1000);
  assert.equal(after.lat, 30, "the slow turn keeps the tilt");
  near(after.lng, 26.5, 1e-9, "the middle's longitude falls: the land moves left to right");
  near(spin({ lat: 30, lng: 31 }, 80000).lng, 31, 1e-9, "a whole turn in 80 s");
  near(spin({ lat: 0, lng: -179 }, 1000).lng, 176.5, 1e-9, "wraps round at 180 degrees");
  // It starts over Ukraine's longitude, tilted so the northern belts face the visitor.
  near(START.lng, 31, 5, "starts at Ukraine's longitude");
  assert.ok(START.lat > 15 && START.lat < 45);
  assert.deepEqual(rotationFor({ lat: 30, lng: 31 }), [-31, -30, 0]);
});

test("a drag moves the land under the pointer, and never tips the Earth over", () => {
  const r = 270;
  const tenDegrees = ((10 * Math.PI) / 180) * r; // pixels for 10 degrees at the middle of the disc
  const right = dragTo({ lat: 30, lng: 31 }, tenDegrees, 0, r);
  near(right.lng, 21, 1e-9, "dragging right brings the land to the west into the middle");
  near(right.lat, 30, 1e-9, "a sideways drag keeps the tilt");
  const down = dragTo({ lat: 30, lng: 31 }, 0, tenDegrees, r);
  near(down.lat, 40, 1e-9, "dragging down brings the land to the north into the middle");
  assert.equal(dragTo({ lat: 60, lng: 0 }, 0, 10 * r, r).lat, MAX_TILT);
  assert.equal(dragTo({ lat: -60, lng: 0 }, 0, -10 * r, r).lat, -MAX_TILT);
  // The projection agrees: after the drag, the place that was 10 degrees west is in the middle.
  const projection = geoOrthographic().scale(r).translate([r, r]).rotate(rotationFor(right));
  const [x, y] = projection([21, 30]);
  near(x, r, 1e-6, "in the middle (x)");
  near(y, r, 1e-6, "in the middle (y)");
});

test("a flight to an event follows the great circle, zooms evenly, and goes out on the way between two far places", () => {
  const from = { lat: 30, lng: 31 };
  const to = { lat: 14.5, lng: 29.5 };
  assert.deepEqual(along(from, to, 0), from);
  assert.deepEqual(along(from, to, 1), to);
  const mid = along(from, to, 0.5);
  near(arcDegrees(from, mid), arcDegrees(from, to) / 2, 1e-9, "halfway is half the arc");
  near(arcDegrees(mid, to), arcDegrees(from, to) / 2, 1e-9, "and half to go");
  // Opposite sides of the Earth: still a path, never NaN.
  const opposite = along({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, 0.3);
  assert.ok(Number.isFinite(opposite.lat) && Number.isFinite(opposite.lng));
  near(arcDegrees({ lat: 0, lng: 0 }, opposite), 54, 1e-6, "30% of 180 degrees");
  // A flight's two ends are exactly the two views.
  const whole = { centre: START, zoom: 1 };
  const ukraine = { centre: { lat: 41.2, lng: 27.3 }, zoom: 3.2 };
  assert.deepEqual(flyAt(whole, ukraine, 0), { centre: { lat: START.lat, lng: START.lng }, zoom: 1 });
  const end = flyAt(whole, ukraine, 1);
  near(end.zoom, 3.2, 1e-9, "it arrives at its zoom");
  near(arcDegrees(end.centre, ukraine.centre), 0, 1e-9, "and its centre");
  // A short flight zooms evenly in the zoom's own scale (halfway: the
  // geometric middle) and only ever in.
  near(flyAt(whole, ukraine, 0.5).zoom, Math.sqrt(3.2), 1e-9, "halfway in the zoom's own scale");
  for (let i = 0; i < 20; i++) assert.ok(flyAt(whole, ukraine, (i + 1) / 20).zoom >= flyAt(whole, ukraine, i / 20).zoom - 1e-12, "a short flight only zooms in");
  // From Ukraine close up to Colombia, across half the world: out on the
  // way, so that halfway the lens shows both ends.
  const colombia = { centre: { lat: 3.4, lng: -81.7 }, zoom: 1.4 };
  const half = flyAt(ukraine, colombia, 0.5);
  assert.ok(half.zoom < colombia.zoom, `halfway it is out to ${half.zoom}`);
  const reach = lensAngle(half.zoom);
  assert.ok(arcDegrees(half.centre, ukraine.centre) <= reach && arcDegrees(half.centre, colombia.centre) <= reach, "both ends inside the lens halfway");
  for (let i = 0; i <= 20; i++) assert.ok(flyAt(ukraine, colombia, i / 20).zoom >= 1, "never smaller than the whole Earth");
  // How long: about 0.9 s for a pick, at most 1.3 s, less for a zoom alone.
  const pick = flyMs(whole, ukraine);
  assert.ok(pick >= 750 && pick <= 1000, `a pick takes ${pick} ms`);
  assert.ok(flyMs(ukraine, colombia) > pick && flyMs(ukraine, colombia) <= 1300, "half the world takes longer, at most 1.3 s");
  assert.ok(flyMs(ukraine, { centre: ukraine.centre, zoom: 1 }) < pick, "closing a card is quicker");
  assert.ok(flyMs(whole, whole) >= 650, "never a jump");
});

test("zoomed in, a drag keeps the place under the pointer exactly under it; on the whole Earth it turns the globe as before", () => {
  const size = 558;
  for (const [centre, zoom] of [[{ lat: 48, lng: 36 }, 3], [{ lat: 10, lng: -70 }, 2], [{ lat: 55, lng: 100 }, 6], [{ lat: -35, lng: -60 }, 1.5]]) {
    for (const grabAt of [{ x: 279, y: 279 }, { x: 180, y: 360 }, { x: 400, y: 150 }]) {
      const place = placeAt(centre, size, zoom, grabAt);
      for (const [dx, dy] of [[40, -25], [-160, 90], [220, 0]]) {
        const after = dragView(centre, { ...grabAt, place }, dx, dy, size, zoom);
        if (Math.abs(after.lat) >= MAX_TILT) continue; // held back at the tilt limit
        const p = projectOn(after, size, place, zoom);
        const label = `at ${centre.lat} degrees and ${zoom} times, grabbed at ${grabAt.x},${grabAt.y}, dragged ${dx},${dy}`;
        near(p.x, grabAt.x + dx, 1e-6, `${label} (x)`);
        near(p.y, grabAt.y + dy, 1e-6, `${label} (y)`);
      }
    }
  }
  // On the whole Earth a drag turns the globe as before: at one speed at
  // every tilt, up and down exactly in the middle.
  const whole = dragView({ lat: 60, lng: 0 }, { x: 100, y: 100, place: { lat: 70, lng: -20 } }, 100, 30, 540, 1);
  assert.deepEqual(whole, dragTo({ lat: 60, lng: 0 }, 100, 30, 270));
  near(whole.lng, (-100 / 270) * (180 / Math.PI), 1e-9, "across: the same speed as at the equator");
  assert.equal(dragFollow(1), 0, "the whole Earth turns as a globe on a stand");
  assert.equal(dragFollow(1.5), 1);
  assert.equal(dragFollow(6), 1);
  near(dragFollow(1.25), 0.5, 1e-12);
  // A fling glides on as the drag went: zoomed in, the land in the middle
  // keeps up with it across the screen at any tilt.
  for (const [centre, zoom] of [[{ lat: 48, lng: 36 }, 3], [{ lat: 60, lng: 100 }, 6]]) {
    const after = dragTo(centre, 12, -8, (size / 2) * zoom, dragFollow(zoom));
    const p = projectOn(after, size, centre, zoom);
    near(p.x - size / 2, 12, 0.3, `a glide's step across at ${centre.lat} degrees`);
    near(p.y - size / 2, -8, 0.3, "and up");
  }
});

test("markers face the visitor in the middle, fade before the edge and are gone behind", () => {
  const centre = { lat: 30, lng: 31 };
  near(facing(centre, centre), 1, 1e-12, "the middle");
  near(facing({ lat: 0, lng: 0 }, { lat: 0, lng: 90 }), 0, 1e-12, "the edge");
  assert.ok(facing({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }) < 0, "behind");
  const at = (deg) => markerOpacity(Math.cos((deg * Math.PI) / 180));
  assert.equal(at(0), 1);
  assert.equal(at(70), 1, "whole at 70 degrees");
  assert.ok(at(82) > 0 && at(82) < 1, "fading at 82 degrees");
  assert.equal(at(88), 0, "gone at 88 degrees");
  assert.equal(at(120), 0, "and behind");
});

test("a click goes to the nearest shown dot within reach, whichever button it landed on", () => {
  const markers = [
    { id: "war-gaza", x: 300, y: 200, shown: true },
    { id: "war-lebanon-south", x: 303, y: 190, shown: true },
    { id: "war-syria", x: 320, y: 180, shown: true },
    { id: "behind", x: 301, y: 191, shown: false },
  ];
  assert.equal(nearestMarker({ x: 302, y: 192 }, markers), "war-lebanon-south");
  assert.equal(nearestMarker({ x: 299, y: 203 }, markers), "war-gaza");
  assert.equal(nearestMarker({ x: 360, y: 260 }, markers), null, "nothing within reach");
  assert.equal(nearestMarker({ x: 301, y: 191 }, [markers[3]]), null, "a marker behind the Earth is never chosen");
});

test("a dot's name shows beside it on the side with room, else under or over it, and never leaves the globe or the screen", () => {
  // A 558 px globe, all of it on the screen: room on the right, then the left.
  assert.deepEqual(tipPlace(100, 200, 180, 20, { size: 558 }), { side: "right", shift: 0, lift: 0 });
  assert.deepEqual(tipPlace(450, 200, 180, 20, { size: 558 }), { side: "left", shift: 0, lift: 0 });
  // A name beside a dot near the globe's top or foot moves down or up into it.
  assert.deepEqual(tipPlace(100, 10, 180, 54, { size: 558 }), { side: "right", shift: 0, lift: 17 });
  assert.deepEqual(tipPlace(450, 550, 180, 54, { size: 558 }), { side: "left", shift: 0, lift: -19 });
  // The checker's case at 768 x 1024: a 560 px globe 104 px from the window's
  // left, the long name of a drought (240 px, wrapped) at a dot 365 px in.
  const at768 = tipPlace(365, 300, 240, 54, { size: 560, lo: 8 - 104, hi: 768 - 8 - 104 });
  assert.equal(at768.side, "left");
  const nameLeft = 104 + 365 - 10 - 240;
  assert.ok(nameLeft >= 8, `the name starts ${nameLeft} px into the window`);
  // A small globe: no room on either side, so the name goes under the dot,
  // moved sideways only as far as it must.
  assert.deepEqual(tipPlace(150, 100, 240, 54, { size: 300 }), { side: "below", shift: 0, lift: 0 });
  assert.deepEqual(tipPlace(140, 100, 240, 54, { size: 300, lo: 50 }), { side: "below", shift: 30, lift: 0 }, "the window cuts off the globe's left 50 px");
  assert.deepEqual(tipPlace(160, 100, 240, 54, { size: 300, hi: 250 }), { side: "below", shift: -30, lift: 0 }, "and its right 50 px");
  // Near the globe's foot it goes over the dot instead.
  assert.equal(tipPlace(150, 270, 240, 54, { size: 300 }).side, "above");
  // Wherever it goes, it stays inside the globe and the window (any part of
  // the window at least as wide as the name).
  for (let x = 4; x < 300; x += 7) {
    for (const y of [6, 120, 296]) {
      for (const [lo, hi] of [[0, 300], [60, 300], [0, 250], [30, 280]]) {
        const w = 240;
        const h = 54;
        const p = tipPlace(x, y, w, h, { size: 300, lo, hi });
        const left = p.side === "right" ? x + 10 : p.side === "left" ? x - 10 - w : x - w / 2 + p.shift;
        const top = p.side === "below" ? y + 14 : p.side === "above" ? y - 14 - h : y - h / 2 + p.lift;
        assert.ok(left >= lo - 0.5 && left + w <= hi + 0.5, `x ${x}, window ${lo}..${hi}: the name at ${left}..${left + w}`);
        assert.ok(top >= -0.5 && top + h <= 300.5, `x ${x}, y ${y}: the name from ${top} to ${top + h} stays within the globe's height`);
      }
    }
  }
});

test("the centre that puts a place at a point of the disc puts it exactly there, on the visible side, within the tilt", () => {
  for (const [place, dx, dy] of [[{ lat: 48.4, lng: 36.6 }, 0, 0.2], [{ lat: 14.5, lng: 29.5 }, 0, -0.4], [{ lat: -12.5, lng: 39.5 }, 0.2, -0.3], [{ lat: 7.5, lng: -72.9 }, -0.25, 0.4], [{ lat: 31.4, lng: 34.4 }, 0, 0]]) {
    const c = centreFor(place, dx, dy);
    const projection = geoOrthographic().scale(278).translate([279, 279]).rotate(rotationFor(c)).clipAngle(90);
    const [x, y] = projection([place.lng, place.lat]);
    near(x, 279 + dx * 278, 1e-6, `x of ${place.lat},${place.lng}`);
    near(y, 279 + dy * 278, 1e-6, `y of ${place.lat},${place.lng}`);
    assert.ok(facing(c, place) > 0, "on the visible side");
  }
  // Ukraine below the middle: the centre lies north of it, never tipped past the limit.
  const c = centreFor({ lat: 48.4, lng: 36.6 }, 0, 0.2);
  assert.ok(c.lat > 48.4 && c.lat <= MAX_TILT);
  assert.equal(centreFor({ lat: 80, lng: 0 }, 0, 0.5).lat, MAX_TILT, "kept within the tilt limit");
});

test("a place lands on the disc exactly where d3-geo draws it", () => {
  for (const [centre, size] of [[START, 558], [{ lat: -20, lng: 140 }, 446], [{ lat: 65, lng: -100 }, 358]]) {
    const projection = geoOrthographic().scale(discRadius(size)).translate([size / 2, size / 2]).rotate(rotationFor(centre)).clipAngle(90);
    for (const place of [{ lat: 48.4, lng: 36.6 }, { lat: -1.45, lng: -78.38 }, { lat: 36.01, lng: 136.71 }, { lat: 0, lng: 0 }, { lat: 70, lng: -40 }]) {
      const p = projectOn(centre, size, place);
      near(p.facing, facing(centre, place), 1e-12, "facing");
      // Behind the Earth (facing below 0) d3-geo clips it from every line
      // it draws; projectOn says so with facing, and its place is not used.
      if (p.facing <= 0) continue;
      const [x, y] = projection([place.lng, place.lat]);
      near(p.x, x, 1e-6, `x of ${place.lat},${place.lng} seen from ${centre.lat},${centre.lng}`);
      near(p.y, y, 1e-6, `y of ${place.lat},${place.lng} seen from ${centre.lat},${centre.lng}`);
    }
  }
});

// The checker's events (feed of 1 November 2026) and the countries their
// lines go to, at the places countries.json gives them.
const COLOMBIA = { id: "war-colombia", lat: 7.5, lng: -72.9 };
const COLOMBIA_BUYERS = [
  { iso3: "ECU", lat: -1.45, lng: -78.38, share: 0.2 },
  { iso3: "VEN", lat: 7.16, lng: -66.15, share: 0.15 },
  { iso3: "HTI", lat: 18.9, lng: -72.66, share: 0.08 },
  { iso3: "PAN", lat: 8.53, lng: -80.11, share: 0.07 },
  { iso3: "BOL", lat: -16.7, lng: -64.65, share: 0.04 },
  { iso3: "CHL", lat: -35.88, lng: -71.24, share: 0.03 },
  { iso3: "PER", lat: -9.15, lng: -74.43, share: 0.03 },
  { iso3: "USA", lat: 39.87, lng: -98.73, share: 0.02 },
];
const QUAKE = { id: "eq-1573141", lat: 32.38, lng: 93.78 };
const CHINA_BUYERS = [
  { iso3: "PRK", lat: 40.13, lng: 127.13, share: 0.5 },
  { iso3: "HKG", lat: 22.38, lng: 114.09, share: 0.3 },
  { iso3: "MAC", lat: 22.22, lng: 113.51, share: 0.3 },
  { iso3: "MNG", lat: 46.95, lng: 103.02, share: 0.2 },
  { iso3: "THA", lat: 14.98, lng: 101, share: 0.1 },
  { iso3: "JPN", lat: 36.01, lng: 136.71, share: 0.1 },
  { iso3: "IDN", lat: -0.25, lng: 114.02, share: 0.08 },
  { iso3: "KOR", lat: 36.42, lng: 127.82, share: 0.07 },
];
const UKRAINE_BUYERS = [
  { iso3: "MDA", lat: 47.2, lng: 28.42, share: 0.24 },
  { iso3: "TUR", lat: 39.06, lng: 35.37, share: 0.13 },
  { iso3: "EGY", lat: 26.47, lng: 29.86, share: 0.12 },
];

test("the list opens over a globe 480 px or wider, and a card under the globe has two columns from 520 px", () => {
  assert.equal(OVER_GLOBE, 480);
  assert.equal(WIDE_GLOBE, 520);
});

test("the zoom buttons never touch the disc: in its corner on a large globe, else beside it where there is room, else under it", () => {
  // How far the column of three buttons in the corner stays from the rim
  // (px; below 0 it covers the Earth).
  const clearance = (size, button = 36, gap = 4) => {
    const half = size / 2;
    return Math.hypot(half - button, half - (3 * button + 2 * gap)) - discRadius(size);
  };
  // The sizes measured on the About page (the globe, and the component's width).
  assert.equal(zoomBarPlace(558, 568), "corner", "1440 x 900");
  assert.equal(zoomBarPlace(560, 728), "corner", "768 x 1024");
  assert.equal(zoomBarPlace(496, 603), "beside", "1280 x 800: too small for the corner, room beside");
  assert.equal(zoomBarPlace(446, 603), "beside", "1280 x 720");
  assert.equal(zoomBarPlace(476, 643), "beside", "1366 x 768");
  assert.equal(zoomBarPlace(476, 482), "under", "1024 x 768: the globe fills its column");
  assert.equal(zoomBarPlace(448, 448), "under", "a window 480 px wide");
  assert.equal(zoomBarPlace(358, 358, { button: 32 }), "under", "an upright phone");
  assert.equal(zoomBarPlace(328, 328, { button: 32 }), "under", "a small phone");
  assert.equal(zoomBarPlace(242, 807, { button: 32 }), "beside", "a phone on its side");
  // The corner is chosen only where the column keeps 6 px from the rim.
  for (const size of [520, 540, 558, 560]) assert.ok(clearance(size) >= 6, `${size} px: ${clearance(size).toFixed(1)} px clear`);
  for (const size of [358, 446, 476, 496, 510]) {
    assert.ok(clearance(size, size < 400 ? 32 : 36) < 6, `${size} px is too small for the corner`);
    assert.notEqual(zoomBarPlace(size, size), "corner");
  }
  // Beside needs the button and its gap on the disc's right (the globe is centred).
  assert.equal(zoomBarPlace(446, 446 + 2 * 44), "beside");
  assert.equal(zoomBarPlace(446, 446 + 2 * 43), "under");
  assert.equal(zoomBarPlace(0, 0), "corner", "before the box is measured");
});

test("a card under the globe is shown with the globe: both whole when they fit, else the whole globe from its top", () => {
  // A phone, 844 px tall: the list under the globe was scrolled down, the
  // globe (358 px) is out of sight above, and the card (206 px) opens under it.
  near(revealBoth({ top: -600, bottom: -242 }, { top: -230, bottom: -24 }, 844), -612, 1e-9, "scrolls up to the globe's top, 12 px from the window's");
  // Picked on the globe: it is in sight and the card opens below the window.
  assert.equal(revealBoth({ top: 100, bottom: 458 }, { top: 470, bottom: 900 }, 844), 68, "only as far as it must: the card's foot 12 px from the window's");
  assert.equal(revealBoth({ top: 100, bottom: 458 }, { top: 470, bottom: 676 }, 844), 0, "both already in sight: no scroll");
  // Too tall for the window together (a card with many lines on a short
  // phone on its side): the whole globe, from its top, and the card under it.
  assert.equal(revealBoth({ top: 300, bottom: 542 }, { top: 554, bottom: 900 }, 390), 288);
  assert.equal(revealBoth({ top: -300, bottom: -58 }, { top: -46, bottom: 300 }, 390), -312);
  // Whatever it scrolls, the globe's top is in the window afterwards.
  for (const [disc, card, view] of [
    [{ top: -600, bottom: -242 }, { top: -230, bottom: -24 }, 844],
    [{ top: 900, bottom: 1258 }, { top: 1270, bottom: 1700 }, 844],
    [{ top: 300, bottom: 542 }, { top: 554, bottom: 1300 }, 390],
  ]) {
    const by = revealBoth(disc, card, view);
    assert.ok(disc.top - by >= 0 && disc.top - by < view, `the globe's top at ${disc.top - by}`);
  }
});

// ---------- Zooming: a round lens on the Earth ----------

// Every point d3-geo draws for a shape, through a projection.
function drawnPoints(projection, object) {
  const points = [];
  geoStream(object, projection.stream({ point: (x, y) => points.push([x, y]), lineStart() {}, lineEnd() {}, polygonStart() {}, polygonEnd() {}, sphere() {} }));
  return points;
}

test("zoomed in, the disc is a round lens on a larger Earth: d3-geo cuts every line exactly at its edge", () => {
  assert.equal(ZOOM_MIN, 1);
  assert.equal(ZOOM_MAX, 6);
  assert.equal(ZOOM_STEP, 1.5);
  assert.equal(lensAngle(1), 90, "the whole half facing the visitor");
  near(lensAngle(2), 30, 1e-9, "twice as large: 30 degrees round the centre");
  near(lensAngle(4), (Math.asin(0.25) * 180) / Math.PI, 1e-12, "four times: about 14.5 degrees");
  assert.equal(lensAngle(0.5), 90, "never wider than the whole Earth");
  // The line from Ukraine to Egypt, seen about Türkiye: at every zoom each
  // point d3-geo draws lies inside the disc, and where the line runs out
  // of the lens it is cut on the disc's edge.
  const size = 558;
  const r = discRadius(size);
  const centre = { lat: 39, lng: 35 };
  const line = { type: "LineString", coordinates: [[36.6, 48.4], [29.86, 26.47]] };
  for (const zoom of [1, 1.5, 2.5, 4, 6]) {
    const projection = geoOrthographic().scale(r * zoom).translate([size / 2, size / 2]).rotate(rotationFor(centre)).clipAngle(lensAngle(zoom)).precision(0.1);
    const points = drawnPoints(projection, line);
    assert.ok(points.length >= 2, `the line is drawn at ${zoom} times`);
    const far = Math.max(...points.map(([x, y]) => Math.hypot(x - size / 2, y - size / 2)));
    assert.ok(far <= r + 1e-6, `at ${zoom} times nothing is drawn outside the disc (${far} px from the middle)`);
    const out = [{ lat: 48.4, lng: 36.6 }, { lat: 26.47, lng: 29.86 }].some((p) => lensFacing(centre, p, zoom) < 0);
    if (out) near(far, r, 0.5, `at ${zoom} times the line is cut on the disc's edge`);
  }
});

test("a place inside the lens faces the visitor as on the whole Earth; one outside it, or behind, is hidden", () => {
  const centre = { lat: 30, lng: 31 };
  for (const p of [{ lat: 30, lng: 31 }, { lat: 48.4, lng: 36.6 }, { lat: 0, lng: 0 }, { lat: -20, lng: 140 }]) near(lensFacing(centre, p, 1), facing(centre, p), 1e-12, "zoom 1 is facing itself");
  near(lensFacing(centre, centre, 4), 1, 1e-12, "the middle");
  // At twice the size the lens reaches 30 degrees: south along the
  // meridian, 29 degrees out is inside, 31 outside.
  const south = (deg) => ({ lat: 30 - deg, lng: 31 });
  assert.ok(lensFacing(centre, south(29), 2) > 0);
  assert.ok(lensFacing(centre, south(31), 2) < 0);
  assert.equal(markerOpacity(lensFacing(centre, south(31), 2)), 0, "a dot outside the lens is hidden");
  assert.equal(markerOpacity(lensFacing(centre, south(20), 2)), 1, "one well inside shows whole");
  assert.ok(lensFacing(centre, { lat: -30, lng: -149 }, 2) < 0, "behind the Earth");
});

test("at any zoom a place lands on the disc where d3-geo draws it, and the place under a point is the one d3-geo finds there", () => {
  const places = [{ lat: 48.4, lng: 36.6 }, { lat: 39.06, lng: 35.37 }, { lat: -1.45, lng: -78.38 }, { lat: 36.01, lng: 136.71 }, { lat: 0, lng: 0 }, { lat: 70, lng: -40 }];
  for (const [centre, size, zoom] of [[START, 558, 1], [{ lat: 41.2, lng: 27.3 }, 558, 3.2], [{ lat: -20, lng: 140 }, 446, 2], [{ lat: 65, lng: -100 }, 358, 6]]) {
    const r = discRadius(size);
    const projection = geoOrthographic().scale(r * zoom).translate([size / 2, size / 2]).rotate(rotationFor(centre)).clipAngle(lensAngle(zoom));
    for (const place of places) {
      const p = projectOn(centre, size, place, zoom);
      if (p.facing <= 0) continue;
      const [x, y] = projection([place.lng, place.lat]);
      const label = `${place.lat},${place.lng} seen from ${centre.lat},${centre.lng} at ${zoom} times`;
      near(p.x, x, 1e-6, `x of ${label}`);
      near(p.y, y, 1e-6, `y of ${label}`);
      const fromMiddle = Math.hypot(x - size / 2, y - size / 2);
      if (Math.abs(fromMiddle - r) > 0.5) assert.equal(p.lens > 0, fromMiddle < r, `${label}: inside the lens exactly when inside the disc`);
    }
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.65], [0.5, 0.05], [0.95, 0.5], [0.97, 0.97], [0.02, 0.1]]) {
      const at = { x: fx * size, y: fy * size };
      const place = placeAt(centre, size, zoom, at);
      if (Math.hypot(at.x - size / 2, at.y - size / 2) > r) {
        assert.equal(place, null, "outside the disc there is no place");
        continue;
      }
      const [lng, lat] = projection.invert([at.x, at.y]);
      near(place.lat, lat, 1e-9, `the latitude under ${fx},${fy}`);
      near(normLng(place.lng - lng), 0, 1e-9, `the longitude under ${fx},${fy}`);
    }
  }
});

test("a zoom keeps the place under the pointer where it is, and the buttons' zoom keeps the middle", () => {
  const size = 558;
  const centre = { lat: 30, lng: 31 };
  for (const [from, to, at] of [[1, 1.5, { x: 400, y: 200 }], [1.5, 3, { x: 120, y: 380 }], [4, 2, { x: 300, y: 330 }], [2, 6, { x: 279, y: 279 }], [6, 1, { x: 200, y: 260 }]]) {
    const place = placeAt(centre, size, from, at);
    const next = zoomAround(place, at, to, size);
    const p = projectOn(next, size, place, to);
    near(p.x, at.x, 1e-6, `x, zooming from ${from} to ${to}`);
    near(p.y, at.y, 1e-6, `y, zooming from ${from} to ${to}`);
    const projection = geoOrthographic().scale(discRadius(size) * to).translate([size / 2, size / 2]).rotate(rotationFor(next)).clipAngle(lensAngle(to));
    const [x, y] = projection([place.lng, place.lat]);
    near(x, at.x, 1e-6, "d3-geo agrees (x)");
    near(y, at.y, 1e-6, "d3-geo agrees (y)");
  }
  const same = zoomAround(centre, { x: 279, y: 279 }, 3, size);
  near(same.lat, 30, 1e-9, "about the middle the centre stays (latitude)");
  near(same.lng, 31, 1e-9, "and longitude");
});

test("a wheel notch zooms 1.25 times, a trackpad's small steps as much, a pinch with the fingers; the zoom keeps to its limits, and scrolling down always reaches the page", () => {
  near(wheelZoomFactor(-100), 1.25, 1e-12, "a notch rolled away zooms in");
  near(wheelZoomFactor(100), 0.8, 1e-12, "and towards zooms out");
  let k = 1;
  for (let i = 0; i < 25; i++) k *= wheelZoomFactor(-4);
  near(k, 1.25, 1e-9, "25 small trackpad steps of 4 px are one notch");
  near(wheelZoomFactor(-100, { ctrlKey: true }), 2, 1e-12, "a trackpad pinch of 100 px doubles it");
  near(wheelZoomFactor(-3, { deltaMode: 1 }), 1.25 ** 0.6, 1e-12, "lines count 20 px each (as the maps count them)");
  assert.equal(wheelZoomFactor(0), 1, "a scroll with no up or down in it");
  assert.equal(wheelRoom(1, 1.25), "zoom");
  assert.equal(wheelRoom(3, 0.8), "zoom");
  assert.equal(wheelRoom(1, 0.8), "fully-out", "scrolling down on the whole Earth is the page's");
  assert.equal(wheelRoom(6, 1.25), "fully-in");
  assert.equal(wheelRoom(3, 1), "none");
  assert.equal(wheelRoom(NaN, 1.25), "none");
  // From any zoom, a visitor scrolling down reaches the page in at most
  // nine notches: the Earth zooms out to the whole Earth, then the page moves.
  for (const start of [1, 1.3, 2, 4, 6]) {
    let z = start;
    let notches = 0;
    while (wheelRoom(z, wheelZoomFactor(100)) === "zoom") {
      z = clampZoom(z * wheelZoomFactor(100));
      notches += 1;
      assert.ok(notches < 20, "never held");
    }
    assert.equal(z, 1, `from ${start} times it ends on the whole Earth`);
    assert.ok(notches <= 9, `from ${start} times: ${notches} notches`);
  }
  assert.equal(clampZoom(0.5), 1);
  assert.equal(clampZoom(9), 6);
  assert.equal(clampZoom(1.003), 1, "a hair from the whole Earth is the whole Earth");
  assert.equal(clampZoom(NaN), 1);
  assert.equal(clampZoom(2.5), 2.5);
  near(pinchZoom(1.5, 100, 200), 3, 1e-12, "fingers twice as far apart: twice the zoom");
  assert.equal(pinchZoom(4, 100, 10), 1, "never out past the whole Earth");
  assert.equal(pinchZoom(2, 100, 1000), 6, "never in past six times");
  assert.equal(pinchZoom(2, 0, 50), 2, "no distance to start from: no change");
});

// ---------- A picked event: its frame, and every event's lines ----------

const at = (iso3, share) => ({ iso3, share, lat: COUNTRIES[iso3].lat, lng: COUNTRIES[iso3].lng });

test("a picked event is framed with the countries its lines go to: a tight group close up, a wide one less, an event alone closest", () => {
  assert.equal(FIT_MIN, 1.4);
  assert.equal(FIT_MAX, 4);
  assert.equal(FIT_ROOM, 0.86);
  const size = 558;
  const r = discRadius(size);
  // How far out from the middle a place lands, in the lens's radii (as
  // d3-geo draws it), or Infinity behind the Earth.
  const out = (view, place) => {
    const projection = geoOrthographic().scale(r * view.zoom).translate([size / 2, size / 2]).rotate(rotationFor(view.centre)).clipAngle(lensAngle(view.zoom));
    if (facing(view.centre, place) <= 0) return Infinity;
    const [x, y] = projection([place.lng, place.lat]);
    return Math.hypot(x - size / 2, y - size / 2) / r;
  };
  // Ukraine and its seven neighbours: close up, every one inside.
  const ukraine = { lat: 48.4, lng: 36.6 };
  const neighbours = ["MDA", "TUR", "EGY", "TUN", "LBN", "BGR", "HUN"].map((c, i) => at(c, 0.24 - i * 0.03));
  const close = fitView(ukraine, neighbours);
  assert.equal(close.all, true);
  assert.ok(close.zoom >= 2.5 && close.zoom <= FIT_MAX, `Ukraine at ${close.zoom} times`);
  for (const p of [ukraine, ...neighbours]) assert.ok(out(close, p) <= FIT_ROOM + 1e-6, `${p.iso3 || "Ukraine"} at ${out(close, p)} of the lens`);
  // Colombia, with lines to the United States and Chile: less close, and
  // still every country inside the disc.
  const wide = fitView(COLOMBIA, COLOMBIA_BUYERS);
  assert.ok(wide.zoom < close.zoom && wide.zoom >= FIT_MIN, `Colombia at ${wide.zoom} times`);
  for (const p of [COLOMBIA, ...COLOMBIA_BUYERS]) assert.ok(out(wide, p) < 1, `${p.iso3 || "Colombia"} inside the disc (${out(wide, p)})`);
  // An event with no lines (Gaza): the closest zoom, on it.
  const gaza = { lat: 31.42, lng: 34.38 };
  const alone = fitView(gaza, []);
  assert.equal(alone.zoom, FIT_MAX);
  near(alone.centre.lat, gaza.lat, 1e-9, "on Gaza (latitude)");
  near(alone.centre.lng, gaza.lng, 1e-9, "on Gaza (longitude)");
  // India's lines run to Bhutan and to West Africa: no zoom from FIT_MIN
  // holds them all, so the event sits half the lens's radius out from the
  // middle, towards them, and its lines run on across the lens.
  const india = { lat: 16.4, lng: 81.8 };
  const spread = ["BTN", "NPL", "LBR", "NER", "BEN", "LKA", "SDN", "SLE"].map((c, i) => at(c, 0.9 - i * 0.08));
  const far = fitView(india, spread);
  assert.equal(far.all, false);
  assert.equal(far.zoom, FIT_MIN);
  near(out(far, india), 0.5, 1e-6, "India half the lens's radius out");
  assert.ok(far.centre.lng < india.lng, "the middle lies west of India, the way its lines run");
  assert.ok(out(far, at("NPL", 0)) < 1 && out(far, at("SDN", 0)) < 1, "its nearer countries inside");
  // Mount Erebus, in Antarctica: the centre stays within the tilt, and the
  // event inside the lens.
  const erebus = { lat: -77.5, lng: 167.2 };
  const polar = fitView(erebus, []);
  assert.equal(polar.centre.lat, -MAX_TILT);
  assert.ok(out(polar, erebus) < FIT_ROOM);
  for (const view of [close, wide, alone, far, polar, fitView(QUAKE, CHINA_BUYERS)]) {
    assert.ok(view.zoom >= FIT_MIN && view.zoom <= FIT_MAX && Math.abs(view.centre.lat) <= MAX_TILT, "within the limits");
  }
});

test("every event's lines are there from the start, each knowing which way its arrowhead points, and each country they reach gets one mark", () => {
  const events = [{ id: "war-ukraine", lat: 48.4, lng: 36.6 }, COLOMBIA, { id: "war-gaza", lat: 31.42, lng: 34.38 }, { id: "nowhere", lat: Number.NaN, lng: 0 }];
  const buyersFor = (e) => (e.id === "war-ukraine" ? UKRAINE_BUYERS : e.id === "war-colombia" ? COLOMBIA_BUYERS : []);
  const lines = networkLines(events, buyersFor);
  assert.equal(lines.length, UKRAINE_BUYERS.length + COLOMBIA_BUYERS.length, "one line for each event and each of its countries");
  assert.deepEqual(lines[0].from, [36.6, 48.4]);
  assert.deepEqual(lines[0].to, [28.42, 47.2]);
  assert.equal(lines[0].iso3, "MDA");
  assert.equal(lines[0].event, "war-ukraine");
  // The arrowhead's guide lies on the line, 1.5 degrees back from the
  // country (a fifth of the way for a short line, such as Ukraine's to
  // Moldova, 6 degrees long).
  for (const l of lines) {
    const from = { lng: l.from[0], lat: l.from[1] };
    const back = { lng: l.back[0], lat: l.back[1] };
    const arc = arcDegrees(from, l.place);
    near(arcDegrees(back, l.place), Math.min(1.5, arc / 5), 1e-6, `${l.id}: how far back`);
    near(arcDegrees(from, back) + arcDegrees(back, l.place), arc, 1e-6, `${l.id}: on the line`);
  }
  assert.ok(arcDegrees({ lng: lines[0].back[0], lat: lines[0].back[1] }, lines[0].place) < 1.5, "Moldova's line is short");
  const marks = networkMarks([...lines, ...lines]);
  assert.equal(marks.length, UKRAINE_BUYERS.length + COLOMBIA_BUYERS.length, "each country once");
  assert.deepEqual(marks[0], { iso3: "MDA", place: { lat: 47.2, lng: 28.42 } });
  assert.deepEqual(networkLines([{ id: "u", lat: 48.4, lng: 36.6 }], () => [{ iso3: "X", lat: 48.4, lng: 36.6, share: 1 }]), [], "no line from a place to itself");
});

test("each pair of countries is drawn once, from the first of that country's events, and other countries' lines to the same buyer stay", () => {
  // The feed of 3 November 2026: three alerts in India (two cyclones and a
  // flood) and two in China (the earthquake and a flood), each with the
  // same buyers: drawn once each, not side by side three times and twice.
  const INDIA_BUYERS = ["BTN", "NPL", "LBR", "NER", "BEN", "LKA", "SDN", "SLE"].map((c, i) => at(c, 0.9 - i * 0.08));
  const events = [
    { id: "war-sudan", iso3: "SDN", lat: 14.5, lng: 29.5 },
    { id: "tc-arnab", iso3: "IND", lat: 16.4, lng: 81.8 },
    { id: "tc-murasu", iso3: "IND", lat: 13.1, lng: 80.3 },
    { id: "eq-china", iso3: "CHN", lat: QUAKE.lat, lng: QUAKE.lng },
    { id: "fl-india", iso3: "IND", lat: 26.2, lng: 91.7 },
    { id: "fl-china", iso3: "CHN", lat: 30.6, lng: 114.3 },
  ];
  const buyersFor = (e) => (e.iso3 === "IND" ? INDIA_BUYERS : e.iso3 === "CHN" ? CHINA_BUYERS : [at("EGY", 0.3), at("SAU", 0.2), at("NER", 0.1)]);
  const lines = networkLines(events, buyersFor);
  assert.equal(lines.length, 3 + INDIA_BUYERS.length + CHINA_BUYERS.length, "one line for each pair of countries");
  assert.equal(new Set(lines.map((l) => `${events.find((e) => e.id === l.event).iso3}>${l.iso3}`)).size, lines.length, "no pair twice");
  assert.ok(lines.filter((l) => l.event.startsWith("tc-") || l.event.startsWith("fl-india")).every((l) => l.event === "tc-arnab"), "India's lines come from its first event (the order is earthEvents': conflicts, then red alerts, then orange)");
  assert.ok(lines.filter((l) => CHINA_BUYERS.some((b) => b.iso3 === l.iso3)).every((l) => l.event === "eq-china"), "China's from its first");
  assert.ok(!lines.some((l) => l.event === "tc-murasu" || l.event === "fl-india" || l.event === "fl-china"), "the later events of the same country draw nothing more");
  // Niger buys from Sudan and from India: two countries, two lines.
  assert.deepEqual(lines.filter((l) => l.iso3 === "NER").map((l) => l.event), ["war-sudan", "tc-arnab"]);
  assert.equal(networkMarks(lines).length, new Set(lines.map((l) => l.iso3)).size, "each country still gets one mark");
  // An event with no country code is its own: its lines are drawn.
  assert.equal(networkLines([{ id: "a", lat: 10, lng: 10 }, { id: "b", lat: 12, lng: 12 }], () => [at("NER", 0.5)]).length, 2);
});

test("every event's lines fade towards the lens's edge, whole in most of the disc, and nothing is drawn past it", () => {
  assert.equal(lineFade(0), 1);
  assert.equal(lineFade(0.5), 1);
  assert.equal(lineFade(0.84), 1, "whole out to 0.84 of the radius");
  assert.ok(lineFade(0.9) < 1 && lineFade(0.9) > lineFade(0.97), "then fading");
  near(lineFade(1), 0.16, 1e-12, "a sixth at the edge");
  assert.equal(lineFade(1.01), 0, "nothing past it");
  for (let t = 0; t < 1; t += 0.01) assert.ok(lineFade(t + 0.01) <= lineFade(t) + 1e-12, `never stronger further out (${t.toFixed(2)})`);
  // The stops are what the canvas gradient is given: in order, from the middle to the edge.
  assert.deepEqual(LINE_FADE[0], [0, 1]);
  assert.deepEqual(LINE_FADE[LINE_FADE.length - 1], [1, 0.16]);
  for (let i = 1; i < LINE_FADE.length; i++) assert.ok(LINE_FADE[i][0] > LINE_FADE[i - 1][0]);
  // On the whole Earth (558 px), the band where the reviewer counted the
  // comb (the outer 12 px) gets at most about half strength.
  const band = 1 - 12 / discRadius(558);
  assert.ok(lineFade(band) < 0.6, `at ${band.toFixed(3)} of the radius: ${lineFade(band).toFixed(2)}`);
});

test("the mask the component lays over the lines leaves exactly lineFade of them, and none a pixel past the rim", () => {
  // destination-out takes away as much of the lines as the mask is opaque; the canvas runs the mask
  // straight between its stops, as lineFade runs between the stops of LINE_FADE.
  const maskAt = (stops, x) => {
    if (x <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      const [x1, a1] = stops[i];
      const [x0, a0] = stops[i - 1];
      if (x <= x1) return x1 > x0 ? a0 + ((a1 - a0) * (x - x0)) / (x1 - x0) : a1;
    }
    return stops[stops.length - 1][1];
  };
  for (const [radius, dpr] of [[279, 1], [279, 2], [150, 3], [96, 1.5]]) {
    const stops = fadeStops(radius, dpr);
    const r = radius * dpr;
    const outer = r + dpr; // the gradient's own radius, a pixel past the rim
    for (let i = 1; i < stops.length; i++) assert.ok(stops[i][0] >= stops[i - 1][0], "in order from the middle out");
    for (const [offset, opacity] of stops) assert.ok(offset >= 0 && offset <= 1 && opacity >= 0 && opacity <= 1);
    assert.deepEqual(stops[stops.length - 1], [1, 1], "wholly opaque at the gradient's end: nothing left past the rim");
    for (let px = 0; px <= r; px += r / 97) near(1 - maskAt(stops, px / outer), lineFade(px / r), 1e-9, `left of the lines ${px.toFixed(1)} px out (${radius} px, x${dpr})`);
    assert.ok(1 - maskAt(stops, (r + 0.5 * dpr) / outer) < lineFade(1), "fainter still past the rim");
  }
  assert.deepEqual(fadeStops(0, 1).at(-1), [1, 1], "a globe with no size: a mask that takes everything");
  // The component draws its mask from these stops, and lays it on with destination-out (EarthGlobe.jsx
  // makeFade and paintNetwork).
  const globe = readFileSync(join(here, "EarthGlobe.jsx"), "utf8");
  assert.match(globe, /const fade = ctx\.createRadialGradient\(mid, mid, 0, mid, mid, Math\.max\(radius \* dpr \+ dpr, 1e-3\)\);\s*for \(const \[offset, opacity\] of fadeStops\(radius, dpr\)\) fade\.addColorStop\(offset, `rgba\(0, 0, 0, \$\{opacity\}\)`\);/);
  assert.match(globe, /ctx\.globalCompositeOperation = "destination-out";\s*ctx\.drawImage\(g\.fade, 0, 0\);/);
});

test("a dot's name stays hidden while the Earth is dragged, after a pick or a close, and for the picked dot, whatever the order of earth.css", () => {
  // The rules that hide a name must outrank the ones that show it (the pointer on the dot, the pin near
  // it), not win only by coming later in the file: then a reordering would bring back the name that
  // covered the picked event's lines.
  const css = readFileSync(join(here, "earth.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = (re) => [...css.matchAll(re)].flatMap((m) => m[1].split(",").map((s) => s.trim())).filter((s) => /\.earth-tip$/.test(s));
  const show = selectors(/([^{};]+)\{\s*visibility: visible;/g);
  const hide = selectors(/([^{};]+)\{\s*visibility: hidden;\s*opacity: 0;\s*\}/g);
  const weight = (s) => (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length; // classes, attributes, pseudo-classes
  assert.deepEqual(show.sort(), [".site .earth-marker:hover .earth-tip", ".site .earth-marker[data-near] .earth-tip"]);
  for (const mark of ["[data-dragging]", "[data-names-off]", "[data-selected]"]) assert.ok(hide.some((s) => s.includes(mark)), `a rule hides the names for ${mark}`);
  for (const h of hide) for (const s of show) assert.ok(weight(h) > weight(s), `${h} outranks ${s}`);
});

test("an arrowhead points the way its line runs, from the crisis to the country, and stops short of the country's mark", () => {
  const head = arrowHead([100, 50], [90, 50], { length: 6, width: 5, gap: 3 });
  assert.deepEqual(head[0], [97, 50], "the tip 3 px short of the country");
  assert.deepEqual(head[1], [91, 52.5]);
  assert.deepEqual(head[2], [91, 47.5]);
  for (const angle of [0, 30, 90, 135, 200, 300]) {
    const a = (angle * Math.PI) / 180;
    const end = [200, 200];
    const before = [200 - 10 * Math.cos(a), 200 - 10 * Math.sin(a)];
    const [tip, w1, w2] = arrowHead(end, before, { length: 8, width: 6, gap: 4 });
    const base = [(w1[0] + w2[0]) / 2, (w1[1] + w2[1]) / 2];
    near(Math.hypot(tip[0] - end[0], tip[1] - end[1]), 4, 1e-9, `${angle} degrees: the gap`);
    near(Math.hypot(tip[0] - base[0], tip[1] - base[1]), 8, 1e-9, `${angle} degrees: the length`);
    near(Math.hypot(w1[0] - w2[0], w1[1] - w2[1]), 6, 1e-9, `${angle} degrees: the width`);
    near((tip[0] - base[0]) * Math.cos(a) + (tip[1] - base[1]) * Math.sin(a), 8, 1e-9, `${angle} degrees: it points along the line, forwards`);
    near((w1[0] - w2[0]) * Math.cos(a) + (w1[1] - w2[1]) * Math.sin(a), 0, 1e-9, `${angle} degrees: its base square to the line`);
  }
  assert.equal(arrowHead([5, 5], [5, 5]), null, "no direction, no arrowhead");
  // On the globe as it starts: the line from Ukraine to Egypt points down
  // the screen, at Egypt.
  const [line] = networkLines([{ id: "u", lat: 48.4, lng: 36.6 }], () => [UKRAINE_BUYERS[2]]);
  const project = (p) => {
    const q = projectOn(START, 558, { lng: p[0], lat: p[1] });
    return [q.x, q.y];
  };
  const [tip, w1] = arrowHead(project(line.to), project(line.back));
  assert.ok(tip[1] > w1[1] && tip[1] > project(line.from)[1], "Egypt lies below Ukraine, and the arrow points down at it");
});

test("the lines to the buyers grow one after another, and all at once with reduced motion", () => {
  assert.equal(lineGrowth(0, 0), 0);
  assert.equal(lineGrowth(LINE_MS, 0), 1);
  assert.equal(lineGrowth(LINE_STAGGER_MS, 1), 0, "the second starts 90 ms later");
  assert.ok(lineGrowth(LINE_MS / 2, 0) > 0.5, "eases out: more than half drawn at half time");
  assert.equal(lineGrowth(0, 5, true), 1);
  assert.equal(linesDone(LINE_MS, 1), true);
  assert.equal(linesDone(LINE_MS, 3), false);
  assert.equal(linesDone(2 * LINE_STAGGER_MS + LINE_MS, 3), true);
  assert.equal(linesDone(0, 3, true), true);
  assert.equal(linesDone(0, 0), true);
});

// ---------- The events ----------

const WAR = { id: "war-ukraine", kind: "war", level: null, name: "War in Ukraine", country: "Ukraine", iso3: "UKR", lat: 48.4, lng: 36.6, since: "2022-02-24", note: "Fighting along a front." };
const SUDAN = { id: "war-sudan", kind: "war", level: null, name: "War in Sudan", country: "Sudan", iso3: "SDN", lat: 14.5, lng: 29.5, since: "2023-04-15" };
const RED = { id: "tc-1", kind: "storm", level: "red", name: "Tropical cyclone Arnab", country: "India", iso3: "IND", lat: 16.4, lng: 81.8, since: "2026-10-26", until: "2026-10-28", note: "Wind speed 185 km/h.", url: "https://www.gdacs.org/report.aspx?eventid=1" };
const ORANGE = { id: "fl-1", kind: "flood", level: "orange", name: "Flood in Chad", country: "Chad", iso3: "TCD", lat: 12, lng: 18, since: "2026-10-22" };
const GREEN = { id: "fl-2", kind: "flood", level: "green", name: "A green flood", country: "Chad", iso3: "TCD", lat: 10, lng: 17, since: "2026-10-30" };

test("the globe keeps the conflicts and the orange and red alerts, conflicts first; the minor alerts stay off", () => {
  const shown = earthEvents([ORANGE, GREEN, RED, WAR, SUDAN, { id: "x", kind: "war", name: "No place" }]);
  assert.deepEqual(shown.map((e) => e.id), ["war-ukraine", "war-sudan", "tc-1", "fl-1"]);
  assert.deepEqual(earthEvents(null), []);
  assert.equal(countWords(17, "armed conflict", "armed conflicts"), "17 armed conflicts");
  assert.equal(countWords(1, "disaster alert", "disaster alerts"), "1 disaster alert");
});

test("the card says what is going on, whose food depends on it, and where the figures come from", () => {
  const trade = {
    year: 2023,
    exporters: {
      UKR: {
        to: [
          { iso3: "MDA", share: 0.243, year: 2023, by: "buyer" },
          { iso3: "EGY", share: 0.121, year: 2023, by: "buyer" },
          { iso3: "BLR", share: 0.119, year: 2021, by: "buyer" },
          { iso3: "LBN", share: 0.093, year: 2022, by: "buyer" },
        ],
      },
    },
  };
  const measured = { heavyDamageHa: 1780400, peopleOnDamagedSoil: 1204041, month: "September 2026" };
  const buyers = buyersOf({ ...WAR, measured }, trade, COUNTRIES);
  const words = cardWords({ ...WAR, measured }, { buyers, commonYear: 2023 });
  assert.equal(words.title, "War in Ukraine");
  assert.equal(words.meta, "War since February 2022.");
  assert.equal(words.note, "Fighting along a front.");
  assert.equal(words.measured, "Chernozem measured 1.78 million ha of black soil heavily damaged, with 1.2 million people on it (September 2026).");
  assert.deepEqual(
    words.buyers.map((b) => `${b.name}${b.year} ${b.share}`),
    ["Moldova 24%", "Egypt 12%", "Lebanon (2022) 9%"],
    "only real rows, largest first; Belarus's 2021 figure is from before the war"
  );
  assert.equal(words.buyersAbout, "The share of each country's farm and food imports that come from Ukraine, in 2023 unless a year is given.");
  assert.equal(words.link, null, "a war has no GDACS report");
  assert.equal(words.more, "", "every country is named");
  assert.equal(topBuyerLine(buyers), "24% of Moldova's farm and food imports");
  // A small globe's card names the first ones and says how many more.
  const many = ["MDA", "EGY", "TUR", "TUN", "LBN", "BGR", "HUN"].map((iso3, i) => ({ iso3, name: COUNTRIES[iso3].name, share: 0.3 - i * 0.03, year: 2023 }));
  const short = cardWords(WAR, { buyers: many, commonYear: 2023, countries: 4 });
  assert.deepEqual(short.buyers.map((b) => b.iso3), ["MDA", "EGY", "TUR", "TUN"]);
  assert.equal(short.more, "and 3 more");
  assert.match(short.buyersAbout, /^The share of each country's farm and food imports/, "the line about the shares stays");
  assert.equal(cardWords(WAR, { buyers: many.slice(0, 4), countries: 4 }).more, "", "four countries: all named");
  assert.equal(cardWords(WAR, { buyers: many.slice(0, 5), countries: 4 }).more, "and 1 more");

  const alert = cardWords(RED, { now: "2026-10-31T20:00:00Z" });
  assert.equal(alert.meta, "Storm, red alert since 26 October 2026, GDACS.");
  assert.equal(alert.link, "https://www.gdacs.org/report.aspx?eventid=1");
  assert.deepEqual(alert.buyers, []);
  assert.equal(alert.buyersAbout, "");
  assert.equal(cardWords({ ...RED, url: "javascript:alert(1)" }).link, null, "only a real https address becomes a link");
  assert.equal(eventLine(SUDAN), "War in Sudan: War since April 2023.");
  // The short line under each name in the list, for every kind.
  assert.equal(statusLine(WAR), "War since February 2022");
  assert.equal(statusLine({ ...SUDAN, name: "Insurgency in the central Sahel", since: "2015-01-01" }), "Armed conflict since 2015");
  assert.equal(statusLine(RED, "2026-10-31T20:00:00Z"), "Storm, red alert since 26 October 2026");
  assert.equal(statusLine({ ...ORANGE, until: "2026-10-25" }, "2026-10-31T20:00:00Z"), "Flood, orange alert from 22 to 25 October 2026");
});

// ---------- Black soil ----------

// A small grid: 1 = black soil.
function gridOf(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const grid = new Float32Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => (grid[y * width + x] = c === "#" ? 1 : 0)));
  return { grid, width, height };
}

test("marching squares closes an outline round a patch, and a second one round its hole", () => {
  const solid = gridOf(["......", ".####.", ".####.", ".####.", "......"]);
  const one = contourRings(solid.grid, solid.width, solid.height, 0.5);
  assert.equal(one.length, 1);
  const ring = one[0];
  assert.deepEqual(ring[0], ring[ring.length - 1], "closed");
  // The outline runs halfway between the patch's cells and the empty ones round it.
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  near(Math.min(...xs), 1, 1e-9, "west edge");
  near(Math.max(...xs), 5, 1e-9, "east edge");
  near(Math.min(...ys), 1, 1e-9, "north edge");
  near(Math.max(...ys), 4, 1e-9, "south edge");

  const ringed = gridOf([".......", ".#####.", ".#...#.", ".#...#.", ".#####.", "......."]);
  assert.equal(contourRings(ringed.grid, ringed.width, ringed.height, 0.5).length, 2, "the patch and its hole");

  // A patch touching the grid's edge still closes.
  const edge = gridOf(["##..", "##..", "...."]);
  const closed = contourRings(edge.grid, edge.width, edge.height, 0.5);
  assert.equal(closed.length, 1);
  assert.deepEqual(closed[0][0], closed[0][closed[0].length - 1]);

  // A saddle: two cells touching at a corner (the average where they meet
  // is 0.5) stay two patches when the level is above that, and join into
  // one when it is below.
  const saddle = gridOf(["....", ".#..", "..#.", "...."]);
  assert.equal(contourRings(saddle.grid, saddle.width, saddle.height, 0.6).length, 2);
  assert.equal(contourRings(saddle.grid, saddle.width, saddle.height, 0.4).length, 1);
  const other = gridOf(["....", "..#.", ".#..", "...."]);
  assert.equal(contourRings(other.grid, other.width, other.height, 0.6).length, 2, "the other diagonal");
  assert.equal(contourRings(other.grid, other.width, other.height, 0.4).length, 1);
});

test("simplifying keeps a shape's corners and drops points along its straight sides", () => {
  const square = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0]];
  const simple = simplifyRing(square, 0.1);
  assert.deepEqual(simple[0], simple[simple.length - 1], "still closed");
  assert.equal(simple.length, 5, "four corners and the closing point");
  for (const corner of [[0, 0], [2, 0], [2, 2], [0, 2]]) assert.ok(simple.some((p) => p[0] === corner[0] && p[1] === corner[1]), `keeps ${corner}`);
  assert.deepEqual(roundRing([[0.123, 0.456], [0.124, 0.4561], [1, 0], [1, 1], [0.123, 0.456]], 2), [[0.12, 0.46], [1, 0], [1, 1], [0.12, 0.46]]);
  assert.equal(roundRing([[0, 0], [0.001, 0], [0, 0]], 2), null, "too small to keep");
});

test("outer rings are wound clockwise and holes anticlockwise, which d3-geo reads as small shapes", () => {
  // A 10 x 10 degree square with a 4 x 4 hole, both given the GeoJSON standard's way round.
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]];
  assert.ok(ringArea(outer) > 0 && ringArea(hole) < 0);
  const polygons = ringsToPolygons([hole, outer]);
  assert.equal(polygons.length, 1, "one shape with its hole");
  const [o, h] = polygons[0];
  assert.ok(ringArea(o) < 0, "outer: clockwise");
  assert.ok(ringArea(h) > 0, "hole: anticlockwise");
  const area = geoArea({ type: "Polygon", coordinates: polygons[0] });
  assert.ok(area > 0 && area < 0.05, `d3-geo reads it as a small shape (${area} sr), not the rest of the Earth`);
  assert.equal(geoContains({ type: "Polygon", coordinates: polygons[0] }, [1, 1]), true);
  assert.equal(geoContains({ type: "Polygon", coordinates: polygons[0] }, [5, 5]), false, "the hole is a hole");
  // A shape under the smallest size is left out; a hole under it is filled.
  assert.equal(ringsToPolygons([outer], { minArea: 200 }).length, 0);
  assert.equal(ringsToPolygons([outer, hole], { minHoleArea: 20 })[0].length, 1);
  assert.ok(insideRing([5, 5], outer) && !insideRing([11, 5], outer));
});

test("the recipe runs end to end on a small world", () => {
  // A 360 x 180 world (1 degree pixels) with one block of black soil.
  const width = 360;
  const height = 180;
  const mask = new Uint8Array(width * height);
  for (let y = 30; y < 45; y++) for (let x = 200; x < 230; x++) mask[y * width + x] = 255; // 20 to 50 E, 45 to 60 N
  const blocks = blockShares(mask, width, height, 2);
  assert.equal(blocks.width, 180);
  assert.equal(blocks.grid[20 * 180 + 105], 1, "a block wholly inside is all black soil");
  const blurred = softBlur(blocks.grid, blocks.width, blocks.height, 1);
  assert.ok(blurred[20 * 180 + 105] > 0.9 && blurred[20 * 180 + 99] > 0 && blurred[20 * 180 + 99] < 0.5, "the edge softens");
  const shape = soilShapes(mask, width, height, { factor: 2, blur: 1, level: 0.5, tolerance: 0.1, minArea: 1, minHoleArea: 1, decimals: 2 });
  assert.equal(shape.type, "MultiPolygon");
  assert.equal(shape.coordinates.length, 1);
  assert.equal(geoContains(shape, [35, 52]), true);
  assert.equal(geoContains(shape, [0, 0]), false);
  near(geoArea(shape), geoArea({ type: "Polygon", coordinates: [[[20, 45], [20, 60], [50, 60], [50, 45], [20, 45]]] }), 0.01, "about the block's own area");
});

test("the shipped black soil is small, wound for d3-geo, and lies on the real belts", () => {
  const file = worldFile("black-soil.json");
  assert.ok(statSync(file).size < 150e3, "under 150 KB");
  const soil = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(soil.type, "Feature");
  assert.equal(soil.geometry.type, "MultiPolygon");
  assert.match(soil.properties.source, /OpenLandMap/);
  assert.match(soil.properties.licence, /CC BY-SA 4\.0/);
  for (const polygon of soil.geometry.coordinates) {
    const area = geoArea({ type: "Polygon", coordinates: polygon });
    assert.ok(area > 0 && area < 0.5, `every shape is a small one (${area} sr)`);
  }
  const total = geoArea(soil);
  assert.ok(total > 0.3 && total < 0.6, `the belts cover about 3 to 5% of the Earth (${total} sr)`);
  const on = { "central Ukraine (Poltava)": [34.55, 49.59], Kharkiv: [36.25, 49.99], "the Russian steppe (Voronezh)": [39.2, 51.67], "northern Kazakhstan (Kostanay)": [63.6, 53.2], Iowa: [-93.5, 42.0], Kansas: [-98.5, 38.5], Saskatchewan: [-106.6, 51.5], "the Pampas": [-61.0, -34.5], "northeast China (Heilongjiang)": [126.5, 46.5] };
  for (const [name, at] of Object.entries(on)) assert.equal(geoContains(soil, at), true, `${name} is black soil`);
  const off = { "the Sahara": [10, 23], "the Amazon": [-62, -5], "the Atlantic": [-30, 20], Paris: [2.35, 48.85] };
  for (const [name, at] of Object.entries(off)) assert.equal(geoContains(soil, at), false, `${name} is not`);
});

test("the land and the countries come from Natural Earth, small", () => {
  const file = worldFile("countries-110m.json");
  assert.ok(statSync(file).size < 120e3);
  const world = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(world.type, "Topology");
  assert.ok(world.objects.land && world.objects.countries);
  const ids = new Set(world.objects.countries.geometries.map((g) => g.id));
  // The countries the Ukraine card names are drawn (by their ISO number, as in countries.json).
  for (const iso3 of ["UKR", "MDA", "TUR", "EGY", "TUN", "LBN", "BGR", "HUN"]) assert.ok(ids.has(COUNTRIES[iso3].num), `${iso3} has a shape`);
});

// ---------- The real Earth's picture ----------

// A WebP picture's width and height, read from its header (lossy, lossless
// or extended).
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString("ascii", 0, 4), "RIFF");
  assert.equal(b.toString("ascii", 8, 12), "WEBP");
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  assert.equal(kind, "VP8X");
  return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
}

test("a phone with a sharp screen gets the middle copy of the Earth's picture, an ordinary one the smallest, and only a large globe on a sharp screen the largest", () => {
  assert.deepEqual(PICTURE_WIDTHS, [1024, 2048, 3072, 6144]);
  assert.equal(SHARPEST, 6144);
  assert.equal(PHONE_GLOBE, 400);
  assert.equal(earthPicture(358, 3), 2048, "a phone (390 px wide) at 3x: the 2048 copy (151 KB), as sharp as its screen");
  assert.equal(earthPicture(358, 2), 2048, "at 2x too");
  assert.equal(earthPicture(358, 3, { saveData: true }), 1024, "a phone saving data: 41 KB");
  assert.equal(earthPicture(358, 1.5), 1024, "a phone with an ordinary screen");
  assert.equal(earthPicture(358, 1), 1024);
  assert.equal(earthPicture(242, 3), 2048, "a phone on its side");
  assert.equal(earthPicture(358, 3, { maxTexture: 1024 }), 1024, "never more than the graphics card takes");
  assert.equal(earthPicture(558, 1), 2048, "1440 x 900 at one device pixel to a CSS pixel");
  assert.equal(earthPicture(558, 1.5), 2048);
  assert.equal(earthPicture(446, 2), 2048, "1280 x 720 at 2x: not large enough for the largest");
  assert.equal(earthPicture(558, 2), 3072, "1440 x 900 at 2x");
  assert.equal(earthPicture(560, 2), 3072, "a tablet (768 px wide) at 2x");
  assert.equal(earthPicture(560, 3), 3072, "the whole Earth never asks for the sharpest");
  assert.equal(earthPicture(558, 2, { maxTexture: 2048 }), 2048, "never more than the graphics card takes");
  assert.equal(earthPicture(558, 2, { saveData: true }), 1024, "the visitor asked the browser to save data");
  assert.equal(earthPicture(0, 2), 1024, "before the box is measured");
  assert.equal(earthPicture(558, 2, { maxTexture: 512 }), null, "no copy fits");
  // Zoomed in, the Earth is drawn larger than the globe, and its size decides.
  assert.equal(earthPicture(358, 3, { zoom: 1.5 }), 3072, "a sharp phone zoomed in: the 3072 copy");
  assert.equal(earthPicture(558, 1, { zoom: 2 }), 3072, "an ordinary screen zoomed in twice: the 3072 copy");
  assert.equal(earthPicture(358, 1.5, { zoom: 1 }), 1024, "the whole Earth: as before");
  assert.equal(earthPicture(358, 3, { zoom: 6, saveData: true }), 1024, "saving data, never more");
  // The sharpest copy: only zoomed in on a large globe on a sharp screen,
  // where the 3072 one would be stretched more than one and a half times.
  assert.equal(earthPicture(558, 2, { zoom: 1.4 }), 6144, "1440 x 900 at 2x, a pick zoomed in 1.4 times");
  assert.equal(earthPicture(558, 2, { zoom: 4 }), 6144, "and at 4 times");
  assert.equal(earthPicture(558, 2, { zoom: 1.2 }), 3072, "1.2 times: the 3072 copy is stretched less than one and a half times");
  assert.equal(earthPicture(558, 1.5, { zoom: 2 }), 6144, "a screen with one and a half times the pixels");
  assert.equal(earthPicture(446, 2, { zoom: 4 }), 6144, "1280 x 720 at 2x");
  assert.equal(earthPicture(558, 1, { zoom: 6 }), 3072, "an ordinary screen: never");
  assert.equal(earthPicture(358, 3, { zoom: 6 }), 3072, "a phone's globe: never");
  assert.equal(earthPicture(560, 2, { zoom: 4, handheld: true }), 3072, "a tablet (its pointer a finger): never");
  assert.equal(earthPicture(558, 2, { zoom: 4, maxTexture: 4096 }), 3072, "never past what the graphics card takes");
  assert.equal(earthPicture(558, 2, { zoom: 4, maxTexture: 6144 }), 6144);
  assert.equal(earthPicture(558, 2, { zoom: 4, saveData: true }), 1024, "never for a visitor saving data");
});

test("the Earth's four copies are in public/site/world, small, and twice as wide as tall", () => {
  const limits = { 1024: 60e3, 2048: 200e3, 3072: 360e3, 6144: 900e3 };
  for (const width of PICTURE_WIDTHS) {
    const file = worldFile(`earth-true-${width}.webp`);
    assert.ok(statSync(file).size < limits[width], `earth-true-${width}.webp under ${limits[width] / 1e3} KB`);
    assert.deepEqual(webpSize(file), { width, height: width / 2 }, `earth-true-${width}.webp is ${width} x ${width / 2}`);
  }
});

test("the real Earth's program finds, under every pixel, the place d3-geo draws there, at any zoom, and stops at the lens's edge", () => {
  const turns = [
    [START, 558, 1, 1],
    [START, 558, 2, 1],
    [{ lat: -38.5, lng: 147.2 }, 560, 2, 1], // Australia, from the south
    [{ lat: 70, lng: -101.3 }, 358, 3, 1], // the Arctic, on a phone
    [{ lat: 0, lng: 180 }, 446, 1, 1], // the picture's two edges meet in the middle
    [{ lat: -70, lng: -0.5 }, 500, 1.5, 1],
    [{ lat: 41.2, lng: 27.3 }, 558, 1, 3.2], // Ukraine picked, zoomed in
    [{ lat: 3.4, lng: -81.7 }, 446, 2, 1.4], // Colombia picked, on a smaller globe
    [{ lat: 65, lng: 179.5 }, 358, 3, 6], // as close as it goes, across the picture's edges, on a phone
  ];
  for (const [centre, size, dpr, zoom] of turns) {
    const width = Math.round(size * dpr);
    const height = width; // the canvas is square, sized as EarthGlobe.jsx sizes it
    const view = shaderView(centre, size, dpr, height, zoom);
    const projection = geoOrthographic().scale(discRadius(size) * zoom).translate([size / 2, size / 2]).rotate(rotationFor(centre)).clipAngle(lensAngle(zoom));
    let checked = 0;
    for (let j = 0; j < height; j += 5) {
      for (let i = 0; i < width; i += 5) {
        // The middle of a pixel, counted from the lower left as WebGL counts,
        // and the same point on the page (CSS pixels from the top left).
        const x = i + 0.5;
        const y = j + 0.5;
        const page = [x / dpr, (height - y) / dpr];
        const fromMiddle = Math.hypot(page[0] - size / 2, page[1] - size / 2);
        if (Math.abs(fromMiddle - discRadius(size)) < 1e-6) continue;
        const spot = shaderPlace(x, y, view);
        assert.equal(spot.inside, fromMiddle < discRadius(size), `inside the disc at ${page}`);
        if (!spot.inside) continue;
        const [lng, lat] = projection.invert(page);
        const label = `${centre.lat},${centre.lng} at ${size} px x ${dpr}, zoom ${zoom}: pixel ${i},${j}`;
        near(spot.lat, lat, 1e-9, `${label} latitude`);
        near(normLng(spot.lng - lng), 0, 1e-9, `${label} longitude`);
        // And back: d3-geo draws that place on that very point.
        const [bx, by] = projection([spot.lng, spot.lat]);
        near(bx, page[0], 1e-6, `${label} x`);
        near(by, page[1], 1e-6, `${label} y`);
        // Where the picture is read: u from 180 degrees west, v from the North Pole.
        const u = (lng + 180) / 360;
        near(Math.abs(((spot.u - u) % 1) + 1.5) % 1 - 0.5, 0, 1e-9, `${label} u`);
        near(spot.v, (90 - lat) / 180, 1e-9, `${label} v`);
        // The look is laid over the lens: its rim as the whole Earth's would be.
        near(spot.rim, 1 - Math.sqrt(Math.max(0, 1 - (fromMiddle / discRadius(size)) ** 2)), 1e-9, `${label} rim`);
        checked += 1;
      }
    }
    assert.ok(checked > 1000, `${checked} pixels checked for ${centre.lat},${centre.lng}`);
  }
  // WebGL counts pixels from the bottom: a place north of the middle is higher up.
  const view = shaderView({ lat: 30, lng: 31 }, 558, 2, 1116);
  assert.deepEqual(view.middle, [558, 558]);
  assert.equal(view.radius, 556);
  near(view.tilt[0], 0.5, 1e-12, "sine of 30 degrees");
  assert.ok(shaderPlace(558, 700, view).lat > 30, "up is north");
  assert.ok(shaderPlace(700, 558, view).lng > 31, "right is east");
  near(shaderPlace(558.0, 558.0, view).lat, 30, 1e-9, "the middle");
  assert.equal(shaderPlace(558 + 557, 558, view).inside, false, "outside the disc");
  // Zoomed in, the Earth is larger than the disc, which stays the lens: at
  // zoom 1 the two are one.
  assert.equal(view.lens, view.radius);
  const zoomed = shaderView({ lat: 30, lng: 31 }, 558, 2, 1116, 3);
  assert.equal(zoomed.radius, 556 * 3);
  assert.equal(zoomed.lens, 556);
  assert.equal(shaderPlace(558 + 557, 558, zoomed).inside, false, "the picture stops at the lens's edge, on the Earth");
  assert.equal(shaderPlace(558 + 555, 558, zoomed).inside, true);
  near(arcDegrees(shaderPlace(558 + 556, 558, zoomed), { lat: 30, lng: 31 }), lensAngle(3), 0.1, "the lens's edge is lensAngle from the middle");
});
