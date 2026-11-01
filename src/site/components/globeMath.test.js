// WHAT THIS FILE DOES
// Checks the globe's arithmetic (globeMath.js) against the numbers the
// About page's design was measured with: how large the Earth is drawn at
// the common screen sizes (it fills the first screen), where the camera
// looks over Ukraine and how it keeps an event clear of the words, the
// tour's order (current alerts first) and timing, where a place lands on
// the screen, when a scroll over the Earth zooms it and when it is the
// page's (a visitor scrolling down past a fully zoomed-out Earth always
// reaches the rest of the page), which trade figures count for a war (none
// from before it began) and the words of the tile and the panel: dates
// read in UTC (so a visitor in California gets the same month), an alert
// that is over said to be over, no strings of words joined by dots. No
// browser is needed.
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
  aimInside,
  alertEnded,
  alertWhen,
  angularDistance,
  buyerYearNote,
  buyersOf,
  captionFor,
  dayMonthYear,
  destination,
  flightMs,
  globeLayout,
  isMinorAlert,
  measuredSentence,
  optionText,
  panelMeta,
  placeCaption,
  plainName,
  projectOnView,
  ringPeriod,
  shareSentence,
  shiftToward,
  sinceText,
  spanText,
  sphereRadiusPx,
  textureSize,
  tourStops,
  tradeSource,
  tradeYear,
  tradeYears,
  viewAlong,
  zoomRoom,
  ZOOM_LIMIT_SLACK,
} from "./globeMath.js";
import { globeZoomFactor, globeZoomLimits } from "../../lib/wheelZoom.js";
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
const UKRAINE = WARS.find((e) => e.id === "war-ukraine");

// Ukraine's row of the trade table as the World Bank crawl gives it, each
// figure with its year and who reported it: Belarus's is its 2021 report,
// from before the invasion (QA finding C8).
const UKRAINE_TRADE = {
  year: 2023,
  years: [2021, 2023],
  exporters: {
    UKR: {
      to: [
        { iso3: "MDA", share: 0.243, year: 2023, by: "buyer" },
        { iso3: "TUR", share: 0.127, year: 2023, by: "buyer" },
        { iso3: "EGY", share: 0.121, year: 2023, by: "buyer" },
        { iso3: "BLR", share: 0.119, year: 2021, by: "buyer" },
        { iso3: "TUN", share: 0.1, year: 2023, by: "buyer" },
        { iso3: "LBN", share: 0.093, year: 2022, by: "buyer" },
        { iso3: "BGR", share: 0.071, year: 2023, by: "buyer" },
        { iso3: "HUN", share: 0.06, year: 2023, by: "seller" },
      ],
    },
  },
};

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

// The hero is the screen minus the menu bar (72 px, or 60 px up to 860 px wide).
const hero = (w, h) => globeLayout(w, h - (w <= 860 ? 60 : 72));

test("the first screen's Earth has the size and place the design was measured with", () => {
  const a = hero(1440, 900);
  assert.equal(a.mode, "landscape");
  near(a.D, 1512, 1, "1440x900 diameter");
  near(a.cx, 813.6, 1, "1440x900 centre x");
  near(a.cy, 464, 1, "1440x900 centre y");
  near(a.altitude, 0.5424, 0.001, "1440x900 camera height");
  near(a.cx - a.D / 2, 57.6, 1, "1440x900 left limb");
  assert.deepEqual(a.offset.map(Math.round), [94, 50]);

  const b = hero(1280, 800);
  near(b.D, 1344, 1, "1280x800 diameter");
  near(b.cx - b.D / 2, 51.2, 1, "1280x800 left limb");

  // A 21:9 screen: the Earth still fills it (up to 2.7 times the hero's height).
  const u = hero(2560, 1080);
  near(u.D, 2688, 1, "2560x1080 diameter");
  near(u.cx - u.D / 2, 102.4, 1, "2560x1080 left limb");

  const c = hero(768, 1024);
  assert.equal(c.mode, "portrait");
  near(c.D, 844.8, 1, "768x1024 diameter");
  near(c.cy, 0.4 * 964, 1, "768x1024 centre y");

  const d = hero(390, 844);
  assert.equal(d.mode, "portrait");
  near(d.D, 585, 1, "390x844 diameter");
  near(d.cy, 392, 1, "390x844 centre y (half the hero)");
  near(d.altitude, 2.043, 0.01, "390x844 camera height");
});

test("the Earth fills the first screen at every size the page is checked at", () => {
  for (const [w, h] of [[1440, 900], [1280, 800], [1280, 720], [1920, 1080], [2560, 1440], [2560, 1080], [1024, 768]]) {
    const l = hero(w, h);
    assert.equal(l.mode, "landscape", `${w}x${h} is a wide screen`);
    assert.ok(l.D >= 1.5 * l.H - 0.01, `${w}x${h}: the sphere is at least 1.5 times the hero's height`);
    assert.ok(l.cx - l.D / 2 <= 0.05 * w + 0.01, `${w}x${h}: the left edge of the Earth is in the left 5%`);
    assert.ok(l.cx + l.D / 2 >= w, `${w}x${h}: the Earth runs off the right edge`);
    assert.ok(l.cy - l.D / 2 < 0 && l.cy + l.D / 2 > l.H, `${w}x${h}: and off the top and the bottom`);
    // At least 85% of the hero's width is Earth (the QA acceptance for C9).
    assert.ok((Math.min(w, l.cx + l.D / 2) - Math.max(0, l.cx - l.D / 2)) / w >= 0.85, `${w}x${h}: the Earth covers 85% of the width`);
  }
  for (const [w, h] of [[390, 844], [430, 932]]) {
    const l = hero(w, h);
    assert.ok(l.D >= 1.5 * w - 0.01, `${w}x${h}: on a phone the sphere is 1.5 times the width`);
    assert.ok(l.cy + l.D / 2 >= (2 / 3) * l.H, `${w}x${h}: it reaches the bottom of the hero's top two thirds`);
  }
  const tablet = hero(768, 1024);
  assert.ok(tablet.D >= 1.1 * 768 - 0.01, "on a tablet the sphere is 1.1 times the width");
});

test("the 3600-pixel Earth is used only where the sphere is drawn large and sharp", () => {
  assert.equal(textureSize(1123, 1), 2048);
  assert.equal(textureSize(1123, 2), 3600);
  assert.equal(textureSize(488, 3), 2048);
  assert.equal(textureSize(1498, 1), 3600);
});

test("over Ukraine the camera looks between the war and the countries whose food depends on it", () => {
  const buyers = buyersOf(UKRAINE, UKRAINE_TRADE, COUNTRIES);
  assert.equal(buyers[0].name, "Moldova");
  assert.equal(buyers.length, 7, "Belarus's figure is from 2021, before the war: left out");
  const aim = aimFor(UKRAINE, buyers);
  near(aim.lat, 43.87, 0.1, "Ukraine aim latitude");
  near(aim.lng, 31.95, 0.1, "Ukraine aim longitude");
  // The published table, whichever version is in the repo: the largest
  // buyer first, at most eight, and none from before the war.
  const live = buyersOf(UKRAINE, TRADE, COUNTRIES);
  assert.ok(live.length > 0 && live.length <= 8);
  assert.ok(live.every((b, i) => i === 0 || b.share <= live[i - 1].share));
  assert.ok(live.every((b) => b.year === null || b.year >= 2022), "no figure from before February 2022");
});

test("a war's buyers leave out figures from before it began; an alert's and a yearless table's keep them all", () => {
  const buyers = buyersOf(UKRAINE, UKRAINE_TRADE, COUNTRIES);
  assert.ok(!buyers.some((b) => b.iso3 === "BLR"));
  const lebanon = buyers.find((b) => b.iso3 === "LBN");
  assert.equal(lebanon.year, 2022);
  assert.equal(lebanon.by, "buyer");
  assert.equal(buyers.find((b) => b.iso3 === "HUN").by, "seller");
  // A disaster in Ukraine is not a war: its buyers are every year's.
  assert.equal(buyersOf({ ...UKRAINE, kind: "flood" }, UKRAINE_TRADE, COUNTRIES).length, 8);
  // A table from before rows carried their year: every row stays, with no year.
  const old = { year: 2023, exporters: { UKR: { to: UKRAINE_TRADE.exporters.UKR.to.map(({ iso3, share }) => ({ iso3, share })) } } };
  const kept = buyersOf(UKRAINE, old, COUNTRIES);
  assert.equal(kept.length, 8);
  assert.ok(kept.every((b) => b.year === null && b.by === null));
});

test("the trade table's year, its span and the source line", () => {
  assert.equal(tradeYear(UKRAINE_TRADE), 2023);
  assert.equal(tradeYear({ exporters: { A: { to: [{ year: 2021 }, { year: 2022 }, { year: 2022 }] } } }), 2022);
  assert.equal(tradeYear(null), null);
  assert.equal(tradeYears(UKRAINE_TRADE), "2021–2023");
  assert.equal(tradeYears({ exporters: { A: { to: [{ year: 2022 }, { year: 2023 }] } } }), "2022–2023");
  assert.equal(tradeYears({ year: 2023, exporters: {} }), "2021–2023", "an older table: the crawl's span");
  assert.equal(tradeSource(UKRAINE_TRADE), "World Bank WITS, the latest year each country reported (2021–2023); the seller's figures where a buyer reported nothing.");
  assert.equal(buyerYearNote({ year: 2021 }, 2023), " (2021)");
  assert.equal(buyerYearNote({ year: 2023 }, 2023), "");
  assert.equal(buyerYearNote({ year: null }, 2023), "");
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

test("on a wide screen an event never lands under the words, and keeps its buyers' framing when it is clear of them", () => {
  const layout = hero(1440, 900);
  const free = { left: 680, right: 1440, top: 0, bottom: layout.H };
  const screenX = (event, aim) => layout.cx + projectOnView(event, { ...aim, altitude: layout.altitude }).x * sphereRadiusPx(layout.H, layout.altitude);
  // Ukraine already lands right of the words: the aim is the plain one.
  const buyers = buyersOf(UKRAINE, UKRAINE_TRADE, COUNTRIES);
  assert.deepEqual(aimInside(UKRAINE, buyers, layout, free), aimFor(UKRAINE, buyers, { altitude: layout.altitude }));
  // An event whose buyers lie far to the east would land under the words: turned until it is clear.
  const event = { lat: 10, lng: 0 };
  const east = [{ lat: 10, lng: 60, share: 1 }];
  assert.ok(screenX(event, aimFor(event, east)) < free.left + 64, "the plain aim puts it under the words");
  near(screenX(event, aimInside(event, east, layout, free)), free.left + 64, 2, "turned just clear of them");
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
  near(shift.dy, (330 - layout.cy) / (layout.D / 2), 1e-9, "up to the free area's middle");
});

const NOW = "2026-10-31T20:00:00Z";

test("the tour starts in Ukraine, visits every armed conflict nearest-first, then three alerts, current red ones first", () => {
  const reds = [
    { id: "eq-1", kind: "earthquake", level: "red", lat: 32.4, lng: 93.8, name: "Earthquake in China" },
    { id: "tc-1", kind: "storm", level: "red", lat: 16.4, lng: 81.8, name: "Tropical cyclone Arnab" },
    { id: "tc-2", kind: "storm", level: "red", lat: 31.2, lng: 127.4, name: "Tropical cyclone Champi" },
    { id: "tc-3", kind: "storm", level: "red", lat: -20, lng: 160, name: "A fourth red alert" },
    { id: "fl-1", kind: "flood", level: "orange", lat: 10, lng: 10, name: "An orange flood" },
  ];
  const stops = tourStops([...WARS, ...reds], { now: NOW });
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

  // The feed of 31 October 2026: Champi (until 25 October) and the China
  // earthquake (22 October) are over, Arnab (28 October) still counts as
  // going on, so the tour takes Arnab, then the orange alerts still going
  // on, and never a green one or an orange one that is over.
  const feed = [
    { id: "eq-cn", kind: "earthquake", level: "red", lat: 32.4, lng: 93.8, since: "2026-10-22", until: "2026-10-22", name: "Earthquake in China" },
    { id: "tc-champi", kind: "storm", level: "red", lat: 31.2, lng: 127.4, since: "2026-10-14", until: "2026-10-25", name: "Tropical cyclone Champi" },
    { id: "tc-arnab", kind: "storm", level: "red", lat: 16.4, lng: 81.8, since: "2026-10-26", until: "2026-10-28", name: "Tropical cyclone Arnab" },
    { id: "dr-eu", kind: "drought", level: "orange", lat: 47, lng: 8, since: "2025-12-21", until: "2026-10-29", name: "Drought in Andorra and 28 other countries" },
    { id: "fl-cn", kind: "flood", level: "orange", lat: 30, lng: 110, since: "2026-07-31", until: "2026-09-27", name: "Flood in China" },
    { id: "fl-green", kind: "flood", level: "green", lat: 5, lng: 20, since: "2026-10-30", until: "2026-10-31", name: "A green flood" },
  ];
  const tour = tourStops([...WARS, ...feed], { now: NOW }).slice(17).map((e) => e.id);
  assert.deepEqual(tour.slice(0, 2).sort(), ["dr-eu", "tc-arnab"].sort());
  assert.equal(tour.length, 3);
  assert.ok(["eq-cn", "tc-champi"].includes(tour[2]), "a red alert that is over only after those still going on");
  assert.ok(!tour.includes("fl-cn") && !tour.includes("fl-green"));
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

test("a scroll over the Earth zooms while there is room, and is the page's once the camera is fully out (or in) that way", () => {
  // The first screen at 1440x900: the camera's far limit is the layout's own height.
  const limits = globeZoomLimits(hero(1440, 900).altitude);
  near(limits.far, 0.5424, 0.001, "the far limit is the layout's height");
  const down = globeZoomFactor(100); // one notch of a mouse wheel towards the page's foot: zooms out
  const up = globeZoomFactor(-100);
  assert.ok(down > 1 && up < 1);
  // As the page loads, and after a click or a drag, the camera is fully out:
  // scrolling down cannot zoom out any further, so the page scrolls.
  assert.equal(zoomRoom(limits.far, down, limits), "fully-out");
  // So does a small trackpad tick, a pinch the same way, a camera a hair off
  // the limit (the 3D reads its height back from the camera's position), and
  // a camera above it (a tour flight rises 15% on its way).
  assert.equal(zoomRoom(limits.far, globeZoomFactor(3), limits), "fully-out");
  assert.equal(zoomRoom(limits.far, globeZoomFactor(8, { ctrlKey: true }), limits), "fully-out");
  assert.equal(zoomRoom(limits.far * (1 - 1e-9), down, limits), "fully-out");
  assert.equal(zoomRoom(limits.far * (1 - ZOOM_LIMIT_SLACK / 2), down, limits), "fully-out");
  assert.equal(zoomRoom(limits.far * 1.15, down, limits), "fully-out");
  // From there, scrolling up (or pinching apart) zooms in.
  assert.equal(zoomRoom(limits.far, up, limits), "zoom");
  assert.equal(zoomRoom(limits.far, globeZoomFactor(-8, { ctrlKey: true }), limits), "zoom");
  // Closer in (the panel brings the camera to 0.82 of the height), scrolling
  // down zooms out; the smallest trackpad tick still counts in the middle.
  assert.equal(zoomRoom(limits.far * 0.82, down, limits), "zoom");
  assert.equal(zoomRoom(0.35, globeZoomFactor(0.5), limits), "zoom");
  assert.equal(zoomRoom(0.35, globeZoomFactor(-0.5), limits), "zoom");
  // Fully in: scrolling up cannot zoom any closer; scrolling down zooms out.
  assert.equal(zoomRoom(limits.near, up, limits), "fully-in");
  assert.equal(zoomRoom(limits.near * (1 + 1e-9), up, limits), "fully-in");
  assert.equal(zoomRoom(limits.near, down, limits), "zoom");
  // A sideways swipe (no up or down) and nonsense are never a zoom.
  assert.equal(zoomRoom(0.35, globeZoomFactor(0), limits), "none");
  assert.equal(zoomRoom(0.35, Number.NaN, limits), "none");
  assert.equal(zoomRoom(Number.NaN, down, limits), "none");
  assert.equal(zoomRoom(0.35, 0, limits), "none");
});

test("a visitor who keeps scrolling down over the Earth always reaches the page, from any zoom", () => {
  // The camera's goal as WorldGlobe moves it (zoomBy: multiplied, then kept
  // between the limits), one scroll after another, until a scroll has no
  // room left: from fully in, with mouse notches (about 11 at most, on a
  // phone-shaped window) and with small trackpad ticks.
  for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]]) {
    const limits = globeZoomLimits(hero(w, h).altitude);
    for (const [deltaY, most] of [[100, 12], [4, 300]]) {
      const factor = globeZoomFactor(deltaY);
      let goal = limits.near;
      let zooms = 0;
      while (zoomRoom(goal, factor, limits) === "zoom") {
        goal = Math.min(limits.far, Math.max(limits.near, goal * factor));
        zooms += 1;
        assert.ok(zooms <= most, `${w}x${h}, deltaY ${deltaY}: still zooming after ${zooms} scrolls`);
      }
      assert.equal(zoomRoom(goal, factor, limits), "fully-out", `${w}x${h}, deltaY ${deltaY}: the next scroll is the page's`);
      near(goal, limits.far, limits.far * ZOOM_LIMIT_SLACK, `${w}x${h}, deltaY ${deltaY}: the camera is back at the layout's height`);
    }
  }
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
  assert.equal(spanText("2026-10-14", "2026-10-25"), "14 to 25 October 2026");
  assert.equal(spanText("2026-07-31", "2026-09-27"), "31 July to 27 September 2026");
  assert.equal(spanText("2025-12-21", "2026-10-29"), "21 December 2025 to 29 October 2026");
  assert.equal(spanText("2026-10-22", "2026-10-22"), "22 October 2026");
});

test("an alert is over when its last day is more than three days old, or when GDACS says so", () => {
  const alert = (until, extra = {}) => ({ kind: "storm", level: "red", since: "2026-10-14", until, ...extra });
  assert.equal(alertEnded(alert("2026-10-25"), NOW), true, "Champi, 6 days");
  assert.equal(alertEnded(alert("2026-10-28"), NOW), false, "Arnab, 3 days: GDACS still calls it current");
  assert.equal(alertEnded(alert("2026-10-31"), NOW), false);
  assert.equal(alertEnded(alert(undefined), NOW), false, "no last day: going on");
  assert.equal(alertEnded(alert("2026-10-31", { current: false }), NOW), true, "GDACS's own flag wins");
  assert.equal(alertEnded(alert("2026-10-01", { current: true }), NOW), false);
  assert.equal(alertEnded({ ...UKRAINE, until: "2020-01-01" }, NOW), false, "a war is never over here");
  assert.equal(alertEnded(alert("2026-10-25"), Date.parse(NOW)), true, "now as milliseconds");
  assert.equal(alertWhen(alert("2026-10-25"), NOW), "from 14 to 25 October 2026");
  assert.equal(alertWhen(alert("2026-10-30"), NOW), "since 14 October 2026");
  assert.equal(alertWhen({ kind: "earthquake", level: "red", since: "2026-10-22", until: "2026-10-22" }, NOW), "on 22 October 2026");
  assert.equal(isMinorAlert({ kind: "flood", level: "green" }), true);
  assert.equal(isMinorAlert({ kind: "flood", level: "orange" }), false);
  assert.equal(isMinorAlert(UKRAINE), false);
});

test("the caption says what the event is, when it began (or ran) and one fact", () => {
  const measured = { heavyDamageHa: 1780400, peopleOnDamagedSoil: 1204041, month: "September 2026" };
  const buyers = buyersOf(UKRAINE, UKRAINE_TRADE, COUNTRIES);
  assert.deepEqual(captionFor({ ...UKRAINE, measured }, { buyers, now: NOW, commonYear: 2023 }), {
    name: "War in Ukraine",
    meta: "Since February 2022.",
    fact: "Chernozem measured 1.78 million ha of black soil heavily damaged here, September 2026.",
    link: "Whose food depends on it",
  });
  // Another conflict with buyers: the largest buyer's share.
  assert.equal(captionFor(UKRAINE, { buyers, commonYear: 2023 }).fact, "24% of Moldova's farm and food imports come from Ukraine.");
  // A figure from another year than the table's says so.
  assert.equal(shareSentence({ share: 0.35, name: "Comoros", year: 2021 }, "Pakistan", 2023), "In 2021, 35% of Comoros' farm and food imports came from Pakistan.");
  // A year-only start, and a conflict without buyers: its note, and "Details".
  const sahel = WARS.find((e) => e.id === "war-sahel");
  assert.equal(captionFor(sahel).meta, "Since 2015.");
  const haiti = WARS.find((e) => e.id === "war-haiti");
  const haitiCaption = captionFor(haiti, { buyers: [] });
  assert.equal(haitiCaption.fact, haiti.note);
  assert.equal(haitiCaption.link, "Details");
  // An alert: its level and day, no fact; once it is over, when it ran.
  const alert = { id: "eq-1", kind: "earthquake", level: "red", name: "Earthquake in China", since: "2026-10-22" };
  assert.deepEqual(captionFor(alert, { now: NOW }), { name: "Earthquake in China", meta: "Red alert since 22 October 2026, GDACS.", fact: null, link: "Details" });
  assert.equal(captionFor({ ...alert, until: "2026-10-22" }, { now: NOW }).meta, "Red alert on 22 October 2026, GDACS.");
  const champi = { kind: "storm", level: "red", name: "Tropical cyclone Champi", since: "2026-10-14", until: "2026-10-25" };
  assert.equal(captionFor(champi, { now: NOW }).meta, "Red alert from 14 to 25 October 2026, GDACS.");
  assert.equal(captionFor({ ...champi, until: "2026-10-30" }, { now: NOW }).meta, "Red alert since 14 October 2026, GDACS.");
});

test("the list and the panel word each event in plain sentences, never in strings joined by dots", () => {
  assert.equal(optionText(UKRAINE), "War in Ukraine, since February 2022");
  assert.equal(panelMeta(UKRAINE, { reviewed: "2026-10-28" }), "War since February 2022. From the list reviewed on 28 October 2026.");
  assert.equal(panelMeta(UKRAINE), "War since February 2022. From a list reviewed by hand.");
  const flood = { kind: "flood", level: "orange", since: "2026-07-31", until: "2026-09-27", name: "Flood in China" };
  assert.equal(panelMeta(flood, { now: NOW }), "Flood, orange alert from 31 July to 27 September 2026, GDACS.");
  assert.equal(optionText(flood, NOW), "Flood in China, orange alert from 31 July to 27 September 2026");
  assert.equal(panelMeta({ kind: "flood", level: "orange", since: "2026-10-22", name: "Flood in Chad" }, { now: NOW }), "Flood, orange alert since 22 October 2026, GDACS.");
  const gangs = WARS.find((e) => e.id === "war-haiti");
  assert.match(panelMeta(gangs), /^Armed conflict( since [^.]+)?\. /);
  assert.equal(measuredSentence({ heavyDamageHa: 1780400, peopleOnDamagedSoil: 1204041, month: "September 2026" }), "Chernozem measured 1.78 million ha of black soil heavily damaged, with 1.2 million people on it (September 2026).");
  for (const text of [panelMeta(UKRAINE, { reviewed: "2026-10-28" }), panelMeta(flood, { now: NOW }), optionText(flood, NOW), measuredSentence({ heavyDamageHa: 1, peopleOnDamagedSoil: 1, month: "May" })]) {
    assert.ok(!text.includes("·"), `"${text}" has no middle dot`);
  }
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
