// WHAT THIS FILE DOES
// Checks the About page Earth's arithmetic (earthMath.js) without a
// browser: the slow turn goes west to east at a calm speed, a drag moves
// the land under the pointer, a turn to an event follows the great circle
// and never breaks between opposite sides of the Earth, markers fade
// before the edge of the disc, a click goes to the nearest dot, a dot's
// name stays inside the globe and on the screen, the lines grow one after
// another (all at once with reduced motion), a place lands on the disc
// where d3-geo draws it, the description card goes over a large globe and
// under a small one, lies on the side of the globe where it hides none of
// the lines (worked out with the turn the globe really makes; a shorter
// card, or the place under the globe, when both sides would hide some)
// and the event lands exactly where the free part needs it, the globe
// keeps the conflicts and the orange and red alerts in that order, and the
// card's words (a small globe's card names four countries and says how
// many more). Then the black-soil shapes: the outlines close, holes sit inside
// their shapes and every shape is wound the way d3-geo reads a small shape
// (wound the other way, d3-geo would paint the whole Earth black), and the
// shipped file (public/site/world/black-soil.json) stays small and covers
// the real belts (Ukraine, the steppe, the prairies, the Pampas,
// northeast China) and not the Sahara or the sea. Last, the real Earth's
// picture: only a phone with an ordinary screen (or a visitor saving data)
// gets the smallest copy, a sharp phone the middle one and only a large
// sharp globe the largest, the three copies are there and small, and the WebGL program's
// arithmetic (followed step for step by shaderPlace) finds, under every
// pixel, exactly the place d3-geo draws there, at several turns, sizes and
// screen sharpnesses, so the grid, the soil, the lines and the dots drawn
// over the picture sit on the right places.
//
// WHO EDITS IT
// Whoever changes earthMath.js.
// Run: node --test src/site/components/earthMath.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea, geoContains, geoOrthographic } from "d3-geo";
import {
  along,
  arcDegrees,
  blockShares,
  CARD_COUNTRIES,
  CARD_SHARE,
  cardPlace,
  cardWords,
  centreFor,
  contourRings,
  countWords,
  discRadius,
  dragTo,
  earthEvents,
  earthPicture,
  hiddenUnder,
  linePoints,
  OVER_GLOBE,
  PHONE_GLOBE,
  PICTURE_WIDTHS,
  projectOn,
  shaderPlace,
  shaderView,
  eventLine,
  eventSpot,
  facing,
  insideRing,
  lineGrowth,
  linesDone,
  markerOpacity,
  MAX_TILT,
  nearestMarker,
  ringArea,
  ringsToPolygons,
  rotationFor,
  roundRing,
  sheetHides,
  sheetSide,
  simplifyRing,
  softBlur,
  soilShapes,
  spin,
  SPIN_DEG_PER_S,
  START,
  statusLine,
  tipPlace,
  topBuyerLine,
  turnMs,
  WIDE_GLOBE,
  LINE_MS,
  LINE_STAGGER_MS,
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

test("a turn to an event follows the great circle, and its length sets its time", () => {
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
  assert.equal(turnMs(from, from), 500);
  assert.equal(turnMs({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }), 1400);
  assert.ok(turnMs(from, to) < turnMs(from, { lat: -34, lng: -60 }), "a longer turn takes longer");
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

test("the card lies across the side of the globe away from the lines, and the event sits in the free part", () => {
  const ukraine = { lat: 48.4, lng: 36.6 };
  // Ukraine's buyers lie south of it (Egypt, Türkiye, Tunisia...): the lines run down, the card goes on top.
  const south = [{ lat: 47, share: 0.24 }, { lat: 26.5, share: 0.12 }, { lat: 39, share: 0.13 }];
  assert.equal(sheetSide(ukraine, south), "top");
  assert.equal(sheetSide({ lat: 14.5 }, [{ lat: 26, share: 0.3 }, { lat: 24, share: 0.2 }]), "bottom", "Sudan's buyers lie north");
  assert.equal(sheetSide(ukraine, []), "bottom", "no lines: at the bottom");
  // A 558 px disc with a 240 px card on top: the event a little more than a quarter of the way down the free part.
  const top = eventSpot("top", 558, 240, true);
  const y = 279 + top.dy * 278;
  near(y, 252 + 0.28 * 306, 0.01, "just below the card");
  assert.equal(top.dx, 0);
  const bottom = eventSpot("bottom", 558, 240, true);
  near(279 + bottom.dy * 278, 306 - 0.28 * 306, 0.01, "just above a card at the bottom");
  near(279 + eventSpot("bottom", 558, 160, false).dy * 278, 386 / 2, 0.01, "no lines: the middle of the free part");
  // centreFor puts the place exactly there, as d3-geo projects it.
  for (const [place, dx, dy] of [[ukraine, 0, top.dy], [{ lat: 14.5, lng: 29.5 }, 0, bottom.dy], [{ lat: -12.5, lng: 39.5 }, 0.2, -0.3], [{ lat: 7.5, lng: -72.9 }, -0.25, 0.4], [{ lat: 31.4, lng: 34.4 }, 0, 0]]) {
    const c = centreFor(place, dx, dy);
    const projection = geoOrthographic().scale(278).translate([279, 279]).rotate(rotationFor(c)).clipAngle(90);
    const [x, yy] = projection([place.lng, place.lat]);
    near(x, 279 + dx * 278, 1e-6, `x of ${place.lat},${place.lng}`);
    near(yy, 279 + dy * 278, 1e-6, `y of ${place.lat},${place.lng}`);
    assert.ok(facing(c, place) > 0, "on the visible side");
  }
  // Ukraine below a card on top: the centre lies north of it, never tipped past the limit.
  const c = centreFor(ukraine, 0, top.dy);
  assert.ok(c.lat > ukraine.lat && c.lat <= MAX_TILT);
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

test("the card goes over a globe 480 px or wider, floats under a smaller one beside the page's words, and sits on the page under a phone's", () => {
  assert.equal(OVER_GLOBE, 480);
  assert.equal(WIDE_GLOBE, 520);
  assert.equal(CARD_SHARE, 0.75);
  assert.equal(CARD_COUNTRIES, 4);
  assert.equal(cardPlace(558, true), "over", "1440 x 900");
  assert.equal(cardPlace(490, true), "over", "1440 x 790");
  assert.equal(cardPlace(560, false), "over", "a tablet, the globe under the words");
  assert.equal(cardPlace(476, true), "float", "1024 x 768: under the globe, over what is below, so the words beside it never move");
  assert.equal(cardPlace(407, true), "float", "1366 x 657");
  assert.equal(cardPlace(446, true), "float", "1280 x 720");
  assert.equal(cardPlace(358, false), "under", "a phone: on the page under the globe");
  assert.equal(cardPlace(242, false), "under", "a phone on its side");
  assert.equal(cardPlace(310, false), "under", "a short window that puts the globe under the words");
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

test("the card lies on the side where it hides none of the lines, worked out with the turn the globe really makes", () => {
  // The points: the event's own dot, then 24 along each line to a buyer.
  const points = linePoints({ lat: 48.4, lng: 36.6 }, UKRAINE_BUYERS);
  assert.equal(points.length, 1 + 3 * 24);
  assert.deepEqual(points[0], { lat: 48.4, lng: 36.6 });
  near(arcDegrees(points[24], UKRAINE_BUYERS[0]), 0, 1e-9, "a line ends at its buyer");
  // A point under the card counts, one beside it or behind the Earth does not.
  const centre = { lat: 0, lng: 0 };
  assert.equal(hiddenUnder("top", centre, 500, 200, [{ lat: 30, lng: 0 }]), 1, "30 N lies under a card across the top");
  assert.equal(hiddenUnder("bottom", centre, 500, 200, [{ lat: 30, lng: 0 }]), 0);
  assert.equal(hiddenUnder("top", centre, 500, 200, [{ lat: 60, lng: 120 }]), 0, "behind the Earth, so not drawn");
  // Ukraine: its buyers lie south, so a card on top hides none of the lines.
  const ukraine = sheetHides({ lat: 48.4, lng: 36.6 }, UKRAINE_BUYERS, { size: 558, sheetHeight: 270 });
  assert.equal(ukraine.top, 0);
  assert.ok(ukraine.bottom > 0, "a card at the bottom would cover the lines south");
  assert.equal(sheetSide({ lat: 48.4, lng: 36.6 }, UKRAINE_BUYERS, { size: 558, sheetHeight: 270 }), "top");
  // Colombia: lines to the United States in the north and to Chile and
  // Bolivia in the south. Whichever side the card takes, it hides some: it
  // goes under the globe (what the checker saw: the line to the United
  // States ran under the card).
  const colombia = sheetHides(COLOMBIA, COLOMBIA_BUYERS, { size: 558, sheetHeight: 262 });
  assert.ok(colombia.top > 0 && colombia.bottom > 0, `Colombia hides ${colombia.top} points on top, ${colombia.bottom} at the bottom`);
  // The China earthquake: its full card (304 px, eight countries) hides
  // lines on both sides; the shorter card (four countries, about 48 px
  // less) hides none on top, so it can stay over the globe.
  const full = sheetHides(QUAKE, CHINA_BUYERS, { size: 558, sheetHeight: 304 });
  assert.ok(full.top > 0 && full.bottom > 0, `the full card hides ${full.top} on top, ${full.bottom} at the bottom`);
  const shorter = sheetHides(QUAKE, CHINA_BUYERS, { size: 558, sheetHeight: 256 });
  assert.equal(shorter.top, 0);
  assert.equal(sheetSide(QUAKE, CHINA_BUYERS, { size: 558, sheetHeight: 256 }), "top", "the side that hides none");
  // The side that hides fewer wins even against the lines' general direction.
  const choice = sheetSide(QUAKE, CHINA_BUYERS, { size: 558, sheetHeight: 304 });
  assert.equal(choice, full.top <= full.bottom ? "top" : "bottom");
  // And the side it gives really hides nothing when it says so: checked
  // against d3-geo, every point of every line outside the card.
  const side = sheetSide({ lat: 48.4, lng: 36.6 }, UKRAINE_BUYERS, { size: 558, sheetHeight: 270 });
  const spot = eventSpot(side, 558, 270, true);
  const turned = centreFor({ lat: 48.4, lng: 36.6 }, spot.dx, spot.dy);
  const projection = geoOrthographic().scale(discRadius(558)).translate([279, 279]).rotate(rotationFor(turned)).clipAngle(90);
  for (const p of linePoints({ lat: 48.4, lng: 36.6 }, UKRAINE_BUYERS, 48)) {
    const xy = projection([p.lng, p.lat]);
    if (!xy) continue;
    assert.ok(xy[1] > 12 + 270 + 2, `a point of a line at ${xy.map(Math.round)} is below the card`);
  }
  // Without its measurements the card keeps the old rule.
  assert.equal(sheetSide({ lat: 48.4, lng: 36.6 }, UKRAINE_BUYERS), "top");
  assert.equal(sheetSide(COLOMBIA, []), "bottom");
  // An event with no lines far south (Mount Erebus in Antarctica): the
  // globe never tips past 70 degrees, so a tall card at the bottom would
  // cover the dot itself; the top leaves it clear.
  const erebus = { lat: -77.5, lng: 167.2 };
  const polar = sheetHides(erebus, [], { size: 558, sheetHeight: 300 });
  assert.ok(polar.bottom > 0 && polar.top === 0, `the dot hidden at the bottom (${polar.bottom}), clear at the top (${polar.top})`);
  assert.equal(sheetSide(erebus, [], { size: 558, sheetHeight: 300 }), "top");
  assert.equal(sheetSide(erebus, [], { size: 558, sheetHeight: 120 }), "bottom", "a short card leaves it clear at the bottom: the usual side");
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
  assert.deepEqual(PICTURE_WIDTHS, [1024, 2048, 3072]);
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
  assert.equal(earthPicture(560, 3), 3072, "never more than the largest");
  assert.equal(earthPicture(558, 2, { maxTexture: 2048 }), 2048, "never more than the graphics card takes");
  assert.equal(earthPicture(558, 2, { saveData: true }), 1024, "the visitor asked the browser to save data");
  assert.equal(earthPicture(0, 2), 1024, "before the box is measured");
  assert.equal(earthPicture(558, 2, { maxTexture: 512 }), null, "no copy fits");
});

test("the Earth's three copies are in public/site/world, small, and twice as wide as tall", () => {
  const limits = { 1024: 60e3, 2048: 200e3, 3072: 360e3 };
  for (const width of PICTURE_WIDTHS) {
    const file = worldFile(`earth-true-${width}.webp`);
    assert.ok(statSync(file).size < limits[width], `earth-true-${width}.webp under ${limits[width] / 1e3} KB`);
    assert.deepEqual(webpSize(file), { width, height: width / 2 }, `earth-true-${width}.webp is ${width} x ${width / 2}`);
  }
});

test("the real Earth's program finds, under every pixel, the place d3-geo draws there", () => {
  const turns = [
    [START, 558, 1],
    [START, 558, 2],
    [{ lat: -38.5, lng: 147.2 }, 560, 2], // Australia, from the south
    [{ lat: 70, lng: -101.3 }, 358, 3], // the Arctic, on a phone
    [{ lat: 0, lng: 180 }, 446, 1], // the picture's two edges meet in the middle
    [{ lat: -70, lng: -0.5 }, 500, 1.5],
  ];
  for (const [centre, size, dpr] of turns) {
    const width = Math.round(size * dpr);
    const height = width; // the canvas is square, sized as EarthGlobe.jsx sizes it
    const view = shaderView(centre, size, dpr, height);
    const projection = geoOrthographic().scale(discRadius(size)).translate([size / 2, size / 2]).rotate(rotationFor(centre)).clipAngle(90);
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
        const label = `${centre.lat},${centre.lng} at ${size} px x ${dpr}: pixel ${i},${j}`;
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
});
