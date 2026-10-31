// WHAT THIS FILE DOES
// Checks the globe's arithmetic (globeMath.js) against the numbers the
// About page's design was measured with: how large the Earth is drawn at
// the common screen sizes, where the camera looks over Ukraine, the tour's
// order and timing, where a place lands on the screen, and the words of the
// caption (dates read in UTC, so a visitor in California gets the same
// month). No browser is needed.
//
// WHO EDITS IT
// Whoever changes globeMath.js.
// Run: node --test src/site/components/globeMath.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aimFor,
  angularDistance,
  buyersOf,
  captionFor,
  dayMonthYear,
  destination,
  flightMs,
  globeLayout,
  optionText,
  panelMeta,
  placeCaption,
  plainName,
  projectOnView,
  ringPeriod,
  shiftToward,
  sinceText,
  textureSize,
  tourStops,
  viewAlong,
} from "./globeMath.js";
import { WORLD_CONFLICTS } from "../../../server/world/conflicts.js";

// The dates must not depend on the visitor's clock (the checks also pass in
// any time zone this runs in).
process.env.TZ = "America/Los_Angeles";

const here = dirname(fileURLToPath(import.meta.url));
const world = (name) => JSON.parse(readFileSync(join(here, "..", "..", "..", "public", "site", "world", name), "utf8"));
const TRADE = world("trade.json");
const COUNTRIES = world("countries.json");

// The reviewed wars as the feed sends them (server/world/index.js warEvents).
const WARS = WORLD_CONFLICTS.map((w) => ({
  ...w,
  id: `war-${w.id}`,
  kind: "war",
  level: null,
  country: plainName(w.iso3, COUNTRIES[w.iso3]?.name),
  lat: Number.isFinite(w.lat) ? w.lat : COUNTRIES[w.iso3].lat,
  lng: Number.isFinite(w.lng) ? w.lng : COUNTRIES[w.iso3].lng,
  source: "Reviewed list",
}));

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

// The hero is the screen minus the menu bar (72 px, or 60 px up to 860 px wide).
const hero = (w, h) => globeLayout(w, h - (w <= 860 ? 60 : 72));

test("the first screen's Earth has the size and place the design was measured with", () => {
  const a = hero(1440, 900);
  assert.equal(a.mode, "landscape");
  near(a.D, 1123, 1, "1440x900 diameter");
  near(a.cx, 968, 1, "1440x900 centre x");
  near(a.cy, 464, 1, "1440x900 centre y");
  near(a.altitude, 0.87, 0.005, "1440x900 camera height");
  near(a.cx - a.D / 2, 406, 1, "1440x900 left limb");
  assert.deepEqual(a.offset.map(Math.round), [248, 50]);

  const b = hero(1280, 800);
  near(b.D, 998, 1, "1280x800 diameter");
  near(b.cx - b.D / 2, 362, 1, "1280x800 left limb");

  const c = hero(768, 1024);
  assert.equal(c.mode, "portrait");
  near(c.D, 845, 1, "768x1024 diameter");

  const d = hero(390, 844);
  assert.equal(d.mode, "portrait");
  near(d.D, 488, 1, "390x844 diameter");
  near(d.altitude, 2.59, 0.01, "390x844 camera height");
});

test("the Earth fills the first screen at every size the page is checked at", () => {
  for (const [w, h] of [[1440, 900], [1280, 800], [1920, 1080]]) {
    const l = hero(w, h);
    assert.ok(l.D >= 1.3 * l.H, `${w}x${h}: the sphere is at least 1.3 times the hero's height`);
    assert.ok(l.cx - l.D / 2 <= 0.3 * w, `${w}x${h}: the left limb is in the left 30%`);
  }
  for (const [w, h] of [[768, 1024], [390, 844]]) {
    const l = hero(w, h);
    assert.ok(l.D >= 1.1 * w - 0.01, `${w}x${h}: the sphere is at least 1.1 times the width`);
  }
});

test("the 3600-pixel Earth is used only where the sphere is drawn large and sharp", () => {
  assert.equal(textureSize(1123, 1), 2048);
  assert.equal(textureSize(1123, 2), 3600);
  assert.equal(textureSize(488, 3), 2048);
  assert.equal(textureSize(1498, 1), 3600);
});

test("over Ukraine the camera looks between the war and the countries that buy its food", () => {
  const ukraine = WARS.find((e) => e.id === "war-ukraine");
  const buyers = buyersOf(ukraine, TRADE, COUNTRIES);
  assert.equal(buyers[0].name, "Moldova");
  assert.equal(buyers.length, 8);
  const aim = aimFor(ukraine, buyers);
  near(aim.lat, 44.8, 0.1, "Ukraine aim latitude");
  near(aim.lng, 32.0, 0.1, "Ukraine aim longitude");
});

test("the aim stays within 15 degrees of the event, and a shift moves the event to that point of the screen", () => {
  const event = { lat: 0, lng: 0 };
  const far = aimFor(event, [{ lat: 0, lng: 120, share: 1 }]);
  near(angularDistance(event, far), 15, 0.01, "clamped distance");
  near(far.lng, 15, 0.01, "clamped towards the buyer");

  const altitude = 2.59;
  const shifted = aimFor(event, [], { shift: { dx: 0.1, dy: 0.35 }, altitude });
  const seen = projectOnView(event, { ...shifted, altitude });
  near(seen.x, 0.1, 0.01, "shifted x");
  near(seen.y, 0.35, 0.01, "shifted y");

  // Never more than 30 degrees from where the camera would look anyway.
  const big = aimFor(event, [], { shift: { dx: 0, dy: 0.8 }, altitude: 0.5 });
  assert.ok(angularDistance(event, big) <= 30.001);
});

test("a place is projected where the camera sees it", () => {
  const view = { lat: 44.8, lng: 32, altitude: 0.87 };
  const centre = projectOnView({ lat: 44.8, lng: 32 }, view);
  near(centre.x, 0, 1e-9, "centre x");
  near(centre.y, 0, 1e-9, "centre y");
  assert.ok(centre.visible);
  // North of the centre is up the screen, east is to the right.
  assert.ok(projectOnView({ lat: 50, lng: 32 }, view).y < 0);
  assert.ok(projectOnView({ lat: 44.8, lng: 40 }, view).x > 0);
  // The far side is hidden; a point just inside the horizon sits near the limb.
  assert.equal(projectOnView({ lat: -44.8, lng: -148 }, view).visible, false);
  const horizon = (Math.acos(1 / 1.87) * 180) / Math.PI;
  const edge = projectOnView(destination({ lat: 44.8, lng: 32 }, 90, horizon - 0.01), view);
  near(Math.hypot(edge.x, edge.y), 1, 0.01, "the horizon is the limb");
});

test("a portrait shift that centres the event in the free area comes from the free rectangle", () => {
  const layout = hero(390, 844);
  const shift = shiftToward(layout, { left: 0, right: 390, top: 200, bottom: 460 });
  near(shift.dx, 0, 1e-9, "no sideways shift");
  near(shift.dy, (330 - layout.cy) / (layout.D / 2), 1e-9, "down to the free area's middle");
});

test("the tour starts in Ukraine, visits every armed conflict nearest-first, then three red alerts", () => {
  const reds = [
    { id: "eq-1", kind: "earthquake", level: "red", lat: 32.4, lng: 93.8, name: "Earthquake in China" },
    { id: "tc-1", kind: "storm", level: "red", lat: 16.4, lng: 81.8, name: "Tropical cyclone Arnab" },
    { id: "tc-2", kind: "storm", level: "red", lat: 31.2, lng: 127.4, name: "Tropical cyclone Champi" },
    { id: "tc-3", kind: "storm", level: "red", lat: -20, lng: 160, name: "A fourth red alert" },
    { id: "fl-1", kind: "flood", level: "orange", lat: 10, lng: 10, name: "An orange flood" },
  ];
  const stops = tourStops([...WARS, ...reds]);
  assert.equal(stops.length, WARS.length + 3);
  assert.equal(stops.length, 20);
  assert.equal(stops[0].id, "war-ukraine");
  // The second stop is the conflict nearest to Ukraine.
  const others = WARS.filter((e) => e.id !== "war-ukraine");
  const nearest = others.reduce((a, b) => (angularDistance(stops[0], a) <= angularDistance(stops[0], b) ? a : b));
  assert.equal(stops[1].id, nearest.id);
  assert.ok(stops.slice(0, 17).every((e) => e.kind === "war"));
  assert.ok(stops.slice(17).every((e) => e.level === "red"));
  assert.ok(!stops.some((e) => e.level === "orange"));
  assert.deepEqual(tourStops([]), []);
});

test("flights take 900 to 2200 ms, longer for longer distances", () => {
  assert.equal(flightMs(0), 900);
  assert.equal(flightMs(10), 900);
  assert.equal(flightMs(50), 1300);
  assert.equal(flightMs(90), 1780);
  assert.equal(flightMs(180), 2200);
});

test("a flight follows the great circle and rises a little in the middle", () => {
  const from = { lat: 44.8, lng: 32, altitude: 0.87 };
  const to = { lat: 14.5, lng: 29.5, altitude: 0.87 };
  const start = viewAlong(from, to, 0);
  near(start.lat, from.lat, 1e-6, "starts at the start");
  const end = viewAlong(from, to, 1);
  near(end.lat, to.lat, 1e-6, "ends at the end");
  near(end.lng, to.lng, 1e-6, "ends at the end (longitude)");
  near(viewAlong(from, to, 0.5).altitude, 0.87 * 1.15, 1e-6, "1.15 times higher at the middle");
});

test("rings pulse on their own beat between 2.6 and 3 seconds", () => {
  const periods = WARS.map((e) => ringPeriod(e.id));
  assert.ok(periods.every((p) => p >= 2600 && p <= 3000));
  assert.ok(new Set(periods).size > 10, "not all in step");
});

test("dates are read as calendar dates, never through the visitor's clock", () => {
  assert.equal(sinceText("2022-02-24"), "February 2022");
  assert.equal(sinceText("2021-02-01"), "February 2021");
  assert.equal(sinceText("2015-01-01"), "2015");
  assert.equal(dayMonthYear("2026-10-22"), "22 October 2026");
  assert.equal(sinceText(""), "");
});

test("the caption says what the event is, when it began and one fact", () => {
  const ukraine = WARS.find((e) => e.id === "war-ukraine");
  const measured = { heavyDamageHa: 1780400, peopleOnDamagedSoil: 1204041, month: "September 2026" };
  const buyers = buyersOf(ukraine, TRADE, COUNTRIES);
  assert.deepEqual(captionFor({ ...ukraine, measured }, { buyers }), {
    name: "War in Ukraine",
    meta: "Since February 2022.",
    fact: "Chernozem measured 1.78 million ha of black soil heavily damaged here, September 2026.",
    link: "Whose food depends on it",
  });
  // Another conflict with buyers: the largest buyer's share.
  assert.equal(captionFor(ukraine, { buyers }).fact, "24% of Moldova's farm and food imports come from Ukraine.");
  // A year-only start, and a conflict without buyers: its note, and "Details".
  const sahel = WARS.find((e) => e.id === "war-sahel");
  assert.equal(captionFor(sahel).meta, "Since 2015.");
  const haiti = WARS.find((e) => e.id === "war-haiti");
  const haitiCaption = captionFor(haiti, { buyers: [] });
  assert.equal(haitiCaption.fact, haiti.note);
  assert.equal(haitiCaption.link, "Details");
  // An alert: its level and day, no fact.
  const alert = { id: "eq-1", kind: "earthquake", level: "red", name: "Earthquake in China", since: "2026-10-22" };
  assert.deepEqual(captionFor(alert), { name: "Earthquake in China", meta: "Red alert since 22 October 2026, GDACS.", fact: null, link: "Details" });
});

test("the list and the panel word each event the way the page does", () => {
  const ukraine = WARS.find((e) => e.id === "war-ukraine");
  assert.equal(optionText(ukraine), "War in Ukraine, since February 2022");
  assert.equal(panelMeta(ukraine, { reviewed: "2026-10-28" }), "War · since February 2022 · Reviewed list, 28 October 2026");
  assert.equal(panelMeta({ kind: "flood", level: "orange", since: "2026-10-22", name: "Flood in Chad" }), "Flood · orange alert · since 22 October 2026 · GDACS");
  const gangs = WARS.find((e) => e.id === "war-haiti");
  assert.match(panelMeta(gangs), /^Armed conflict · /);
});

test("the caption sits right of its marker, flips left near the edge and never covers another tile", () => {
  const size = { w: 300, h: 120 };
  const bounds = { W: 1440, H: 828 };
  assert.deepEqual(placeCaption({ x: 900, y: 400 }, size, bounds), { x: 924, y: 366 });
  const flipped = placeCaption({ x: 1300, y: 400 }, size, bounds);
  assert.equal(flipped.x, 1300 - 24 - 300);
  const words = { left: 32, top: 90, right: 632, bottom: 450 };
  const spot = placeCaption({ x: 300, y: 500 }, size, bounds, [words]);
  const rect = { left: spot.x, top: spot.y, right: spot.x + size.w, bottom: spot.y + size.h };
  assert.ok(rect.top >= words.bottom + 12 || rect.left >= words.right + 12, "clear of the words");
});
