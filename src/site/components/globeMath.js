// WHAT THIS FILE DOES
// The arithmetic behind the About page's globe, kept apart as plain
// functions so it can be checked without a browser (globeMath.test.js).
// The new Earth (EarthGlobe.jsx, with its own earthMath.js) uses buyersOf
// and tradeYear, and the words and small helpers (sinceText, alertWhen,
// kindWord, panelMeta, measuredSentence, buyerYearNote, isMinorAlert,
// dayMonthYear, possessive, percent, plainName, clamp, normLng,
// easeInOutCubic; worldData.js uses plainName too). The camera, tour, zoom
// and caption-placing parts belonged to the old WebGL globe (removed on 1
// November 2026), and aimFor to the new Earth before it could zoom (since
// 3 November 2026 earthMath fitView frames a picked event and the
// countries its lines go to); they are kept, tested, and left out of the
// built page by the bundler since nothing imports them. In full:
//   globeLayout(W, H)       how large the Earth is drawn in the first screen,
//                           where its centre sits, and the camera height that
//                           gives that size
//   aimFor(event, buyers)   where the camera looks when the tour stops at an
//                           event: between the event and the countries that
//                           buy its food (aimInside: the same, kept clear of
//                           the page's words on a wide screen)
//   buyersOf(event, trade)  whose food depends on the event's country, each
//                           figure with its year (none from before a war)
//   tourStops(events)       the order the tour visits the events in
//   flightMs(degrees)       how long the camera takes to fly that far
//   zoomRoom(from, factor, limits)  whether a scroll over the Earth can
//                           still zoom it, or the camera is already fully
//                           out (or in) that way, so the page scrolls
//   captionFor(event, ...)  the words on the small tile beside the marker
//   alertWhen(event, now)   when a disaster alert ran: "since 26 October
//                           2026", or once it is over "from 14 to 25
//                           October 2026"
// and the small helpers they share: distances and directions on the sphere,
// where a place appears on the screen, dates read in UTC (so a visitor in
// California still reads "since February 2022"), and country names said the
// way people say them.
//
// The words the globe shows (statusWords, cardText and the dates, kinds and
// levels they are made of) take `t` from the website's languages
// (src/site/i18n/, namespace "globe"): every English sentence is a t("...")
// key with {holes} for what varies; without a t (the tests, the old globe's
// words) they are plain English. Country names come from the browser in the
// language of t.locale (i18n/regions.js regionName); the English stays the
// data's own.
//
// Positions are degrees of latitude and longitude. The camera's "altitude"
// is its distance above the surface in Earth radii (three-globe's unit), and
// the screen projection uses the same axes as the 3D scene
// (globeScene.js): y towards the north pole, longitude 0 towards the viewer.
//
// WHO EDITS IT
// Whoever changes how the globe is framed, toured or worded. Run the checks
// with: node --test src/site/components/globeMath.test.js

// i18n namespace: globe

import { regionName } from "../i18n/regions.js";

// English with its holes filled: what the words below use when no t() from
// the website's languages is handed to them.
const plain = (key, vars) => (vars ? String(key).replace(/\{(\w+)\}/g, (hole, name) => (vars[name] === undefined || vars[name] === null ? hole : String(vars[name]))) : String(key));

export const FOV = 50; // the camera's vertical field of view, degrees
const RAD = Math.PI / 180;
const TAN_HALF_FOV = Math.tan((FOV / 2) * RAD);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ---------- The first screen ----------

// The camera height (in Earth radii above the surface) at which a sphere
// fills D pixels of a view H pixels tall.
export function altitudeFor(D, H) {
  const focal = H / 2 / TAN_HALF_FOV;
  const half = Math.atan(D / 2 / focal);
  return 1 / Math.sin(half) - 1;
}

// Landscape (wider than 1.1 : 1): the Earth fills the hero. It is a little
// wider than the screen (1.05 times, at least 1.5 times the height, at most
// 2.7 times it, so a very wide screen still gets a whole Earth's curve), its
// left edge runs behind the words 4% of the width in from the left (24 to
// 120 px), and it runs off the top, the right and the bottom. Only a
// screen far wider than 21:9 is left with a band of space on the left.
// Portrait: centred, 1.5 times the width on a phone (1.1 times on a
// tablet). On a phone its centre is at half the hero's height, so the
// controls at the top lie over its edge rather than its middle and the
// Earth fills the space down to the words at the foot (on a tablet, 40%).
export function globeLayout(W, H) {
  const landscape = W / H >= 1.1;
  let D;
  let cx;
  let cy;
  if (landscape) {
    D = Math.min(Math.max(1.05 * W, 1.5 * H), 2.7 * H);
    const edge = clamp(0.04 * W, 24, 120);
    cx = Math.max(edge + D / 2, W - 0.45 * D);
    cy = 0.56 * H;
  } else {
    const t = clamp((W - 480) / (768 - 480), 0, 1);
    D = W * (1.5 + (1.1 - 1.5) * t);
    cx = W / 2;
    cy = H * (0.5 + (0.4 - 0.5) * t);
  }
  return {
    mode: landscape ? "landscape" : "portrait",
    W,
    H,
    D,
    cx,
    cy,
    altitude: altitudeFor(D, H),
    offset: [cx - W / 2, cy - H / 2],
  };
}

// The Earth's picture: the 3600-pixel one when the sphere is drawn large on
// a sharp screen, else the 2048-pixel one.
export function textureSize(D, dpr) {
  return D * Math.min(dpr || 1, 1.5) > 1400 ? 3600 : 2048;
}

// ---------- On the sphere ----------

function finite(n) {
  return typeof n === "number" && Number.isFinite(n);
}

export function normLng(lng) {
  let v = ((lng + 180) % 360 + 360) % 360 - 180;
  if (v === -180 && lng > 0) v = 180;
  return v;
}

// A longitude moved by whole turns so it lies within 180° of another one.
function lngNear(lng, ref) {
  return ref + normLng(lng - ref);
}

// The angle between two places, in degrees (haversine).
export function angularDistance(a, b) {
  const p1 = a.lat * RAD;
  const p2 = b.lat * RAD;
  const dp = p2 - p1;
  const dl = (b.lng - a.lng) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / RAD;
}

// The direction from a to b at a, degrees clockwise from north.
export function bearing(a, b) {
  const p1 = a.lat * RAD;
  const p2 = b.lat * RAD;
  const dl = (b.lng - a.lng) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

// The place reached by going `distance` degrees from `from` in `heading`.
export function destination(from, heading, distance) {
  const p1 = from.lat * RAD;
  const l1 = from.lng * RAD;
  const th = heading * RAD;
  const d = distance * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / RAD, lng: normLng(l2 / RAD) };
}

// A place as a point on the unit sphere, on the scene's axes (three-globe's
// polar2Cartesian): y to the north pole, longitude 0 along +z.
export function toVector(lat, lng) {
  const phi = (90 - lat) * RAD;
  const theta = (90 - lng) * RAD;
  return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
}

export function fromVector([x, y, z]) {
  const r = Math.hypot(x, y, z) || 1;
  const phi = Math.acos(clamp(y / r, -1, 1));
  const theta = Math.atan2(z, x);
  return { lat: 90 - phi / RAD, lng: normLng(90 - theta / RAD) };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

// Where a place appears for a camera looking at `view` (its lat, lng and
// altitude): x to the right and y downwards, in units of the sphere's
// radius on the screen, so (0, 0) is the sphere's centre and the limb is at
// distance 1. `visible` is false on the far side.
export function projectOnView(place, view) {
  const a = toVector(view.lat, view.lng);
  const d = 1 + view.altitude; // the camera's distance from the centre, in radii
  const p = toVector(place.lat, place.lng);
  // The camera's axes, as three.js's lookAt builds them with "up" = +y.
  let right = cross([0, 1, 0], a);
  if (Math.hypot(...right) < 1e-9) right = [1, 0, 0];
  right = unit(right);
  const up = cross(a, right);
  const rel = [p[0] - a[0] * d, p[1] - a[1] * d, p[2] - a[2] * d];
  const depth = -dot(rel, a); // distance in front of the camera
  const tanHalf = Math.tan(Math.asin(1 / d));
  return {
    x: dot(rel, right) / depth / tanHalf,
    y: -dot(rel, up) / depth / tanHalf,
    visible: dot(p, a) > 1 / d,
  };
}

// ---------- Where the camera looks ----------

// The countries whose farm and food imports depend most on this event's
// country, largest share first, at most eight, each with a name, a share
// (0..1), the centre of the country, the year of the figure and who reported
// it ("buyer" or "seller"; null in a trade file older than these fields).
// Each country reports its own latest year (2021 to 2023), so for a war a
// figure from before the war began says nothing about it and is left out
// (Belarus's 2021 imports from Ukraine, for a war since 2022). A row with no
// year (an older trade file) is kept.
export function buyersOf(event, trade, countries) {
  const row = event && trade?.exporters?.[event.iso3];
  if (!row || !Array.isArray(row.to) || !countries) return [];
  const warFrom = event.kind === "war" ? parts(event.since)?.year : null;
  return row.to
    .filter((t) => countries[t.iso3] && finite(countries[t.iso3].lat) && finite(countries[t.iso3].lng) && t.share > 0)
    .filter((t) => !(warFrom && finite(t.year) && t.year < warFrom))
    .sort((a, b) => b.share - a.share)
    .slice(0, 8)
    .map((t) => ({
      iso3: t.iso3,
      share: t.share,
      name: plainName(t.iso3, countries[t.iso3].name),
      lat: countries[t.iso3].lat,
      lng: countries[t.iso3].lng,
      year: finite(t.year) ? t.year : null,
      by: t.by === "buyer" || t.by === "seller" ? t.by : null,
    }));
}

// The trade table's own year: the one most countries reported ("year" in
// the file; else the most common year of its rows; null when it has none).
export function tradeYear(trade) {
  if (finite(trade?.year)) return trade.year;
  const seen = new Map();
  for (const row of Object.values(trade?.exporters || {})) {
    for (const t of row?.to || []) if (finite(t.year)) seen.set(t.year, (seen.get(t.year) || 0) + 1);
  }
  let best = null;
  for (const [year, n] of seen) if (best === null || n > seen.get(best) || (n === seen.get(best) && year > best)) best = year;
  return best;
}

// The years the table's figures come from, as "2021–2023" ("years" in the
// file, else the rows' own years; the crawl's span when neither says).
export function tradeYears(trade) {
  let first = null;
  let last = null;
  if (Array.isArray(trade?.years) && finite(trade.years[0]) && finite(trade.years[1])) [first, last] = trade.years;
  else {
    for (const row of Object.values(trade?.exporters || {})) {
      for (const t of row?.to || []) {
        if (!finite(t.year)) continue;
        first = first === null ? t.year : Math.min(first, t.year);
        last = last === null ? t.year : Math.max(last, t.year);
      }
    }
  }
  if (first === null) return "2021–2023";
  return first === last ? String(first) : `${first}–${last}`;
}

// The line under the panel's list of buyers: what the share is and where
// the figures come from.
export function tradeSource(trade) {
  return `World Bank WITS, the latest year each country reported (${tradeYears(trade)}); the seller's figures where a buyer reported nothing.`;
}

// " (2021)" after a buyer whose figure is from another year than the table's own.
export function buyerYearNote(buyer, commonYear) {
  return buyer && finite(buyer.year) && finite(commonYear) && buyer.year !== commonYear ? ` (${buyer.year})` : "";
}

// The camera that puts `event` at (dx, dy) sphere radii from the sphere's
// centre on the screen, found in a few small corrections.
function aimPlacing(event, shift, altitude) {
  let aim = { lat: event.lat, lng: event.lng };
  const step = altitude * Math.tan(Math.asin(1 / (1 + altitude))); // radians of arc per sphere radius, near the centre
  for (let i = 0; i < 8; i++) {
    const p = projectOnView(event, { ...aim, altitude });
    const ex = shift.dx - p.x;
    const ey = shift.dy - p.y;
    const err = Math.hypot(ex, ey);
    if (err < 1e-4) break;
    // Moving the camera east moves the event left on the screen; north moves it down.
    aim = destination(aim, (Math.atan2(-ex, ey) / RAD + 360) % 360, (err * step) / RAD);
    aim.lat = clamp(aim.lat, -80, 80);
  }
  return aim;
}

// Where the camera looks at a tour stop: halfway between the event and the
// share-weighted centre of its buyers, at most 15° from the event. With
// `shift` (portrait, or with the panel open) the view is turned, by at most
// 30°, so the event lands at that point of the screen instead: shift is in
// sphere radii from the sphere's centre, y downwards, and `altitude` is the
// camera's height.
export function aimFor(event, buyers = [], { shift = null, altitude = 1 } = {}) {
  let aim = { lat: event.lat, lng: normLng(event.lng) };
  const list = (buyers || []).filter((b) => finite(b.lat) && finite(b.lng) && b.share > 0);
  if (list.length) {
    let weight = 0;
    let lat = 0;
    let lng = 0;
    for (const b of list) {
      weight += b.share;
      lat += b.lat * b.share;
      lng += lngNear(b.lng, event.lng) * b.share;
    }
    const half = { lat: (event.lat + lat / weight) / 2, lng: (event.lng + lng / weight) / 2 };
    aim = angularDistance(event, half) > 15 ? destination(event, bearing(event, half), 15) : { lat: half.lat, lng: normLng(half.lng) };
  }
  if (shift && (Math.abs(shift.dx) > 1e-6 || Math.abs(shift.dy) > 1e-6)) {
    const placed = aimPlacing(event, shift, altitude);
    const apart = angularDistance(aim, placed);
    aim = apart > 30 ? destination(aim, bearing(aim, placed), 30) : placed;
  }
  return aim;
}

// The sphere's radius on the screen, in pixels, for a camera at this
// height in a view H pixels tall.
export function sphereRadiusPx(H, altitude) {
  return (H / 2 / TAN_HALF_FOV) * Math.tan(Math.asin(1 / (1 + altitude)));
}

// The shift that centres an event in the free part of the screen (the rect
// between the words, the controls and the panel), for aimFor. With a
// camera height other than the layout's (closer while the panel is open)
// the sphere is larger on the screen, and the shift is measured in its
// larger radius.
export function shiftToward(layout, free, altitude = layout?.altitude) {
  if (!free || !layout) return null;
  const r = sphereRadiusPx(layout.H, altitude);
  const dx = clamp(((free.left + free.right) / 2 - layout.cx) / r, -0.8, 0.8);
  const dy = clamp(((free.top + free.bottom) / 2 - layout.cy) / r, -0.8, 0.8);
  return { dx, dy };
}

// Where the camera looks on a wide screen: between the event and its buyers
// (aimFor) as long as the event then lands inside `free` (the screen right
// of the words, in pixels) by at least `margin`; otherwise turned just
// enough to bring it there. So an event never sits under the page's words,
// and the buyers' arcs stay in view whenever they can.
export function aimInside(event, buyers, layout, free, altitude = layout?.altitude, margin = 64) {
  const base = aimFor(event, buyers, { altitude });
  if (!free || !layout) return base;
  const r = sphereRadiusPx(layout.H, altitude);
  const p = projectOnView(event, { ...base, altitude });
  const x = layout.cx + p.x * r;
  const y = layout.cy + p.y * r;
  const left = free.left + margin;
  const right = Math.max(left, free.right - margin);
  const top = free.top + margin;
  const bottom = Math.max(top, free.bottom - margin);
  const tx = clamp(x, left, right);
  const ty = clamp(y, top, bottom);
  if (p.visible && Math.abs(tx - x) < 1 && Math.abs(ty - y) < 1) return base;
  const shift = { dx: clamp((tx - layout.cx) / r, -0.8, 0.8), dy: clamp((ty - layout.cy) / r, -0.8, 0.8) };
  return aimFor(event, buyers, { shift, altitude });
}

// ---------- The tour ----------

function nearestTo(from, list) {
  let best = null;
  let bestD = Infinity;
  for (const e of list) {
    const d = angularDistance(from, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

// Ukraine first, then every other armed conflict, each time the nearest one
// not yet visited, then up to three disaster alerts the same way: red alerts
// still going on first, then orange ones still going on, and only then red
// alerts that have ended (minor, green alerts never). `now` is the feed's
// own time (see alertEnded).
export function tourStops(events, { maxRed = 3, first = "war-ukraine", now = Date.now() } = {}) {
  const placed = (events || []).filter((e) => e && finite(e.lat) && finite(e.lng));
  const conflicts = placed.filter((e) => e.kind === "war");
  const rank = (e) => {
    if (e.kind === "war" || (e.level !== "red" && e.level !== "orange")) return -1;
    const ended = alertEnded(e, now);
    if (e.level === "red") return ended ? 2 : 0;
    return ended ? -1 : 1;
  };
  const ranked = placed.map((e) => ({ e, r: rank(e) })).filter((x) => x.r >= 0);
  const start = conflicts.find((e) => e.id === first) || conflicts[0] || [...ranked].sort((a, b) => a.r - b.r)[0]?.e;
  if (!start) return [];
  const order = [start];
  let cur = start;
  let rest = conflicts.filter((e) => e !== start);
  while (rest.length) {
    cur = nearestTo(cur, rest);
    order.push(cur);
    rest = rest.filter((e) => e !== cur);
  }
  // Each time the nearest of the best kind still left.
  let left = ranked.filter((x) => x.e !== start);
  for (let i = 0; i < maxRed && left.length; i++) {
    const best = Math.min(...left.map((x) => x.r));
    cur = nearestTo(cur, left.filter((x) => x.r === best).map((x) => x.e));
    order.push(cur);
    left = left.filter((x) => x.e !== cur);
  }
  return order;
}

// How long a flight of this many degrees takes, in milliseconds.
export function flightMs(degrees) {
  return clamp(700 + 12 * degrees, 900, 2200);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// The camera part of the way along a flight: along the great circle, with
// the eased time, rising to 1.15 times its height at the middle.
export function viewAlong(from, to, t) {
  const e = easeInOutCubic(clamp(t, 0, 1));
  const a = toVector(from.lat, from.lng);
  const b = toVector(to.lat, to.lng);
  const omega = Math.acos(clamp(dot(a, b), -1, 1));
  let v;
  if (omega < 1e-6) v = b;
  else {
    const s = Math.sin(omega);
    const wa = Math.sin((1 - e) * omega) / s;
    const wb = Math.sin(e * omega) / s;
    v = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  }
  const place = fromVector(v);
  const altitude = (from.altitude + (to.altitude - from.altitude) * e) * (1 + 0.15 * Math.sin(Math.PI * e));
  return { lat: place.lat, lng: place.lng, altitude };
}

// Each ring pulses on its own beat, between 2.6 and 3 seconds, so no two
// pulse in step.
export function ringPeriod(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 2600 + (h % 401);
}

// ---------- The wheel ----------

// Whether one scroll of the wheel (or of two fingers on a trackpad) over
// the Earth has room to zoom the camera:
//   from    the camera's altitude, or the one it is already easing towards
//   factor  what the scroll multiplies it by (src/lib/wheelZoom.js
//           globeZoomFactor): below 1 zooms in, above 1 zooms out, and
//           exactly 1 for a scroll with no up or down in it
//   limits  { near, far } (wheelZoom.js globeZoomLimits); far is the
//           layout's own height, the Earth filling the first screen
// The answer is "zoom" when the camera can still go that way; "fully-out"
// when the visitor scrolls down (zooms out) with the camera already as far
// out as it goes; "fully-in" when they scroll up (zoom in) with it already
// as close as it goes; and "none" for a sideways swipe. Fully out or fully
// in, the scroll would change nothing on the screen, so WorldGlobe lets the
// page have it: a visitor scrolling down past a fully zoomed-out Earth
// reaches the rest of the page, however long they have been scrolling.
// A camera within a thousandth of a limit counts as there: the 3D works its
// height out from the camera's position, which can come back a hair off
// the number it was given.
export const ZOOM_LIMIT_SLACK = 0.001;

export function zoomRoom(from, factor, { near, far }) {
  if (!finite(from) || !finite(factor) || factor <= 0 || factor === 1) return "none";
  if (factor > 1) return from < far * (1 - ZOOM_LIMIT_SLACK) ? "zoom" : "fully-out";
  return from > near * (1 + ZOOM_LIMIT_SLACK) ? "zoom" : "fully-in";
}

// ---------- Words ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2022-02-24" read as a calendar date, never through the visitor's clock.
function parts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month, day: Number(m[3]) };
}

// The month's name in the language: the dictionaries hold the twelve names
// (used only after a day or after "since", so Ukrainian gives the genitive).
const monthName = (month, t) => t(MONTHS[month - 1]);

// "February 2022"; "2015" when the list only knows the year (stored as 1 January).
export function sinceText(iso, t = plain) {
  const p = parts(iso);
  if (!p) return "";
  if (p.month === 1 && p.day === 1) return String(p.year);
  return t("{month} {year}", { month: monthName(p.month, t), year: p.year });
}

// "22 October 2026"
export function dayMonthYear(iso, t = plain) {
  const p = parts(iso);
  return p ? t("{day} {month} {year}", { day: p.day, month: monthName(p.month, t), year: p.year }) : "";
}

// Two days as one span: "14 to 25 October 2026", "31 July to 27 September
// 2026", "21 December 2025 to 29 October 2026"; one day alone when both are
// the same.
export function spanText(fromIso, toIso, t = plain) {
  const a = parts(fromIso);
  const b = parts(toIso);
  if (!a || !b) return dayMonthYear(a ? fromIso : toIso, t);
  if (a.year === b.year && a.month === b.month && a.day === b.day) return dayMonthYear(toIso, t);
  if (a.year === b.year && a.month === b.month) return t("{day} to {day2} {month} {year}", { day: a.day, day2: b.day, month: monthName(b.month, t), year: b.year });
  if (a.year === b.year) return t("{day} {month} to {day2} {month2} {year}", { day: a.day, month: monthName(a.month, t), day2: b.day, month2: monthName(b.month, t), year: b.year });
  return t("{from} to {to}", { from: dayMonthYear(fromIso, t), to: dayMonthYear(toIso, t) });
}

const DAY_MS = 24 * 60 * 60 * 1000;

// How many days an alert's last reported day may lag behind today while it
// still counts as going on. GDACS moves an event's last day ("until") on
// only when it next updates the event, so one still going on often shows a
// last day two or three days old (checked against GDACS's own "is current"
// flag on 31 October 2026: every event it called current had a last day
// within three days).
export const ALERT_GRACE_DAYS = 3;

// The day number (days since 1970, UTC) of "2026-10-25", or null.
function dayNumber(iso) {
  const p = parts(iso);
  return p ? Date.UTC(p.year, p.month - 1, p.day) / DAY_MS : null;
}

// Whether a disaster alert is over. GDACS's own flag when the feed carries
// one ("current"); otherwise its last day is more than three days before
// `now` (the feed's own time, as milliseconds or an ISO date; the visitor's
// clock when there is none). Armed conflicts are never "over" here: the
// reviewed list keeps only those still going on.
export function alertEnded(e, now = Date.now()) {
  if (!e || e.kind === "war") return false;
  if (e.current === true) return false;
  if (e.current === false) return true;
  const until = dayNumber(e.until);
  if (until === null) return false;
  let ms = typeof now === "string" ? Date.parse(now) : now;
  if (!finite(ms)) ms = Date.now();
  return until < Math.floor(ms / DAY_MS) - ALERT_GRACE_DAYS;
}

// When an alert happened, as a shape the sentences are built from:
//   { form: "since", date }       still going on, from that day
//   { form: "span", from, to }    over: it ran from one day to another
//   { form: "on", date }          over: a one-day event
//   { form: "overSince", date }   over, GDACS gave no last day
//   { form: "over" }              over, no dates at all
//   { form: "none" }              no dates, still going on
// The dates are ISO days from the feed.
export function alertTiming(e, now = Date.now()) {
  const since = parts(e?.since) ? e.since : null;
  if (!alertEnded(e, now)) return since ? { form: "since", date: since } : { form: "none" };
  if (!parts(e.until)) return since ? { form: "overSince", date: since } : { form: "over" };
  if (!since || dayNumber(e.since) >= dayNumber(e.until)) return { form: "on", date: e.until };
  return { form: "span", from: e.since, to: e.until };
}

// When an alert happened, in the words of its tile and panel: "since 26
// October 2026" while it goes on; "from 14 to 25 October 2026", or "on 22
// October 2026" for a one-day event, once it is over.
export function alertWhen(e, now = Date.now()) {
  const when = alertTiming(e, now);
  if (when.form === "since") return `since ${dayMonthYear(when.date)}`;
  if (when.form === "overSince") return `from ${dayMonthYear(when.date)}, now over`;
  if (when.form === "over") return "now over";
  if (when.form === "on") return `on ${dayMonthYear(when.date)}`;
  if (when.form === "span") return `from ${spanText(when.from, when.to)}`;
  return "";
}

// Green GDACS alerts: the lowest level, hidden until the visitor asks for
// them. Orange and red alerts are the ones counted and toured.
export function isMinorAlert(e) {
  return !!e && e.kind !== "war" && e.level !== "red" && e.level !== "orange";
}

// The kinds of event, as the globe names them (English here, translated
// where they are shown: t(KIND_WORD[kind])).
const KIND_WORD = { flood: "Flood", drought: "Drought", wildfire: "Wildfires", storm: "Storm", earthquake: "Earthquake", volcano: "Volcano" };
// GDACS's alert colours, before the word "alert" ("red alert").
const LEVEL_WORD = { red: "red", orange: "orange", green: "green" };

// The reviewed list holds wars, insurgencies and gang violence alike: it
// says "War" only when the event's own name does.
export function kindWord(e, t = plain) {
  if (e.kind === "war") return /\bwar\b/i.test(e.name || "") ? t("War") : t("Armed conflict");
  return KIND_WORD[e.kind] ? t(KIND_WORD[e.kind]) : t("Alert");
}

// "red", in the language, for "{level} alert"; a colour the globe does not
// know is said as the feed wrote it.
export function levelName(level, t = plain) {
  if (!level) return "";
  return LEVEL_WORD[level] ? t(LEVEL_WORD[level]) : String(level);
}

function levelWord(level) {
  return level ? `${level[0].toUpperCase()}${level.slice(1)} alert` : "Alert";
}

// Since when, in a few words, under each event's name in the globe's list:
// "War since February 2022", "Armed conflict since 2015", "Storm, red alert
// since 26 October 2026", "Flood, orange alert from 22 to 25 October 2026",
// "Earthquake, red alert on 22 October 2026". `now` is the feed's own time
// (an alert that is over is said to be over); `t` the website's language.
// With `card` the line ends as the card's does: a full stop after a war's
// (also one the list has no date for: "Armed conflict."), and GDACS named
// after an alert's ("..., GDACS.").
// On the globe every alert has a colour (earthEvents keeps the orange and
// red ones); one without is said like a war, by its kind alone.
export function statusWords(e, now = Date.now(), t = plain, { card = false } = {}) {
  const kind = kindWord(e, t);
  const level = e.kind === "war" ? "" : levelName(e.level, t);
  if (!level) {
    const date = e.kind === "war" ? sinceText(e.since, t) : parts(e.since) ? dayMonthYear(e.since, t) : "";
    if (!date) return card ? t("{kind}.", { kind }) : kind;
    return card ? t("{kind} since {date}.", { kind, date }) : t("{kind} since {date}", { kind, date });
  }
  const when = alertTiming(e, now);
  const vars = { kind, level };
  if (when.form === "since") {
    vars.date = dayMonthYear(when.date, t);
    return card ? t("{kind}, {level} alert since {date}, GDACS.", vars) : t("{kind}, {level} alert since {date}", vars);
  }
  if (when.form === "span") {
    vars.span = spanText(when.from, when.to, t);
    return card ? t("{kind}, {level} alert from {span}, GDACS.", vars) : t("{kind}, {level} alert from {span}", vars);
  }
  if (when.form === "on") {
    vars.date = dayMonthYear(when.date, t);
    return card ? t("{kind}, {level} alert on {date}, GDACS.", vars) : t("{kind}, {level} alert on {date}", vars);
  }
  if (when.form === "overSince") {
    vars.date = dayMonthYear(when.date, t);
    return card ? t("{kind}, {level} alert from {date}, now over, GDACS.", vars) : t("{kind}, {level} alert from {date}, now over", vars);
  }
  if (when.form === "over") return card ? t("{kind}, {level} alert, now over, GDACS.", vars) : t("{kind}, {level} alert, now over", vars);
  return card ? t("{kind}, {level} alert, GDACS.", vars) : t("{kind}, {level} alert", vars);
}

// The country file writes formal names ("Moldova, Republic of"); the globe
// says them the way people do. The few that need more than cutting at the
// comma are listed; the rest take the part before it.
const PLAIN_NAMES = {
  KOR: "South Korea", PRK: "North Korea", COD: "DR Congo", COG: "Congo", TZA: "Tanzania", IRN: "Iran", LAO: "Laos",
  VEN: "Venezuela", BOL: "Bolivia", MDA: "Moldova", RUS: "Russia", SYR: "Syria", VNM: "Vietnam", USA: "United States",
  GBR: "United Kingdom", CIV: "Côte d'Ivoire", TWN: "Taiwan", PSE: "Palestine", BRN: "Brunei", FSM: "Micronesia",
  VAT: "Vatican City", MKD: "North Macedonia", CZE: "Czechia", SWZ: "Eswatini", BHS: "The Bahamas", GMB: "The Gambia",
  HKG: "Hong Kong", MAC: "Macao", TUR: "Türkiye", NLD: "the Netherlands", PHL: "the Philippines", ARE: "the United Arab Emirates",
};
export function plainName(iso3, name) {
  if (PLAIN_NAMES[iso3]) return PLAIN_NAMES[iso3];
  return String(name || iso3 || "").split(", ")[0];
}

// "Moldova's", "Comoros'"
export function possessive(name) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

// 1780400 -> "1.78 million", 1204041 -> "1.2 million"; in another language
// (a locale such as "uk-UA") the browser's own long form: 1,78 мільйона,
// 178万.
export function millions(n, locale) {
  if (locale && !/^en(-|$)/i.test(locale) && typeof Intl !== "undefined") {
    try {
      return new Intl.NumberFormat(locale, { notation: "compact", compactDisplay: "long", maximumSignificantDigits: 3 }).format(n);
    } catch {
      // the English below
    }
  }
  const m = n / 1e6;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(m >= 1.5 ? 2 : 1).replace(/\.?0+$/, "")} million`;
}

export function percent(share) {
  return Math.round(share * 100);
}

// "24%", written the way the language writes a percentage ("24 %" in
// Ukrainian) when a locale is given.
export function percentText(share, locale) {
  if (locale && !/^en(-|$)/i.test(locale) && typeof Intl !== "undefined") {
    try {
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
    } catch {
      // the English below
    }
  }
  return `${percent(share)}%`;
}

// The share of a buyer's farm and food imports that come from the event's
// country, as one sentence: "24% of Moldova's farm and food imports come
// from Ukraine." A figure from another year than the table's own says so:
// "In 2021, 35% of Comoros' farm and food imports came from Pakistan."
export function shareSentence(buyer, from, commonYear) {
  const share = `${percent(buyer.share)}% of ${possessive(buyer.name)} farm and food imports`;
  if (buyerYearNote(buyer, commonYear)) return `In ${buyer.year}, ${share} came from ${from}.`;
  return `${share[0].toUpperCase()}${share.slice(1)} come from ${from}.`;
}

// Ukraine's own measurement, as one sentence. The month ("September 2026")
// is the site's own (content/site.js NUMBERS.ukraineMonth), sent with the
// feed, and translated like any sentence.
export function measuredSentence(m, t = plain) {
  if (!m || !finite(m.heavyDamageHa)) return "";
  const ha = millions(m.heavyDamageHa, t.locale);
  const people = finite(m.peopleOnDamagedSoil) ? millions(m.peopleOnDamagedSoil, t.locale) : null;
  const month = m.month ? t(m.month) : null;
  if (people && month) return t("Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it ({month}).", { ha, people, month });
  if (people) return t("Chernozem measured {ha} ha of black soil heavily damaged, with {people} people on it.", { ha, people });
  if (month) return t("Chernozem measured {ha} ha of black soil heavily damaged ({month}).", { ha, month });
  return t("Chernozem measured {ha} ha of black soil heavily damaged.", { ha });
}

// What the globe's card says about an event, in the website's language:
//   title    the event's name as the feed wrote it (EarthGlobe.jsx shows a
//            reviewed war's name translated: worldData.js eventName)
//   meta     since when (an alert: its colour, its dates and GDACS)
//   note     one line about the land, from the feed (its own words)
//   measured Chernozem's own measurement (Ukraine), or ""
//   buyers   [{ iso3, name, share }]: whose food depends on this land,
//            largest share first, the name in the language (a figure from
//            another year than the table's own has it in brackets:
//            "Lebanon (2022)"), the share as the language writes it
//   buyersAbout  the line under them: what the share is, from which country
//   link     GDACS's report for an alert, or null
// `buyers` comes from buyersOf; `commonYear` is the trade table's own year
// (tradeYear); `now` the feed's time.
export function cardText(e, { buyers = [], now = Date.now(), commonYear = null } = {}, t = plain) {
  const all = buyers || [];
  const from = regionName(e.iso3, e.country || plainName(e.iso3), t.locale) || t("this country");
  let buyersAbout = "";
  if (all.length) {
    buyersAbout = finite(commonYear)
      ? t("The share of each country's farm and food imports that come from {from}, in {year} unless a year is given.", { from, year: commonYear })
      : t("The share of each country's farm and food imports that come from {from}.", { from });
  }
  return {
    title: e.name,
    meta: statusWords(e, now, t, { card: true }),
    note: e.note || "",
    measured: e.measured ? measuredSentence(e.measured, t) : "",
    buyers: all.map((b) => {
      const name = regionName(b.iso3, b.name, t.locale);
      const year = finite(b.year) && finite(commonYear) && b.year !== commonYear ? b.year : null;
      return { iso3: b.iso3, name: year ? t("{name} ({year})", { name, year }) : name, share: percentText(b.share, t.locale) };
    }),
    buyersAbout,
    link: e.kind !== "war" && typeof e.url === "string" && /^https:\/\//.test(e.url) ? e.url : null,
  };
}

// The tile beside the marker: the event's name, one line on when it began
// (or, for an alert that is over, when it ran), one fact, and the link that
// opens the panel. now: the feed's own time; commonYear: the trade table's.
export function captionFor(e, { buyers = [], now = Date.now(), commonYear = null } = {}) {
  let meta;
  let fact = null;
  if (e.kind === "war") {
    const since = sinceText(e.since);
    meta = since ? `Since ${since}.` : "Armed conflict.";
    if (e.measured && finite(e.measured.heavyDamageHa)) {
      fact = `Chernozem measured ${millions(e.measured.heavyDamageHa)} ha of black soil heavily damaged here${e.measured.month ? `, ${e.measured.month}` : ""}.`;
    } else if (buyers.length) {
      fact = shareSentence(buyers[0], e.country || plainName(e.iso3), commonYear);
    } else if (e.note) {
      fact = e.note;
    }
  } else {
    const when = alertWhen(e, now);
    meta = `${levelWord(e.level)}${when ? ` ${when}` : ""}, GDACS.`;
  }
  return { name: e.name, meta, fact, link: buyers.length ? "Whose food depends on it" : "Details" };
}

// What a screen reader reads for each event in the globe's list.
export function optionText(e, now = Date.now()) {
  if (e.kind === "war") {
    const since = sinceText(e.since);
    return since ? `${e.name}, since ${since}` : e.name;
  }
  const when = alertWhen(e, now);
  return `${e.name}, ${e.level ? `${e.level} alert` : "alert"}${when ? ` ${when}` : ""}`;
}

// The line under the panel's heading, in plain sentences: "War since
// February 2022. From the list reviewed on 28 October 2026."; "Flood,
// orange alert from 31 July to 27 September 2026, GDACS."
export function panelMeta(e, { reviewed, now = Date.now() } = {}) {
  if (e.kind === "war") {
    const since = sinceText(e.since);
    const review = dayMonthYear(reviewed);
    return `${kindWord(e)}${since ? ` since ${since}` : ""}. ${review ? `From the list reviewed on ${review}.` : "From a list reviewed by hand."}`;
  }
  const when = alertWhen(e, now);
  return `${kindWord(e)}${e.level ? `, ${e.level} alert` : ""}${when ? ` ${when}` : ""}, GDACS.`;
}

// "17 armed conflicts", "1 disaster alert"
export function countText(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- The caption's place ----------

function overlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

// The tile 24 px right of the marker, or left of it near the right edge,
// or under or over it: the first spot inside the screen that covers no
// other tile (the words, the controls, the panel; each padded by 12 px).
export function placeCaption(marker, size, bounds, tiles = [], gap = 24) {
  const pad = 12;
  const inset = bounds.inset ?? 16;
  const padded = tiles.filter(Boolean).map((t) => ({ left: t.left - pad, top: t.top - pad, right: t.right + pad, bottom: t.bottom + pad }));
  const lift = Math.min(34, size.h / 2);
  const spots = [
    { x: marker.x + gap, y: marker.y - lift },
    { x: marker.x - gap - size.w, y: marker.y - lift },
    { x: marker.x - size.w / 2, y: marker.y + gap },
    { x: marker.x - size.w / 2, y: marker.y - gap - size.h },
  ];
  let best = null;
  for (const s of spots) {
    const x = clamp(s.x, inset, Math.max(inset, bounds.W - inset - size.w));
    const y = clamp(s.y, inset, Math.max(inset, bounds.H - inset - size.h));
    const rect = { left: x, top: y, right: x + size.w, bottom: y + size.h };
    // A spot that had to be pushed back inside the screen far from where it
    // wanted to be would leave the tile away from its marker.
    const drift = Math.hypot(x - s.x, y - s.y);
    const covered = padded.reduce((sum, t) => sum + overlap(rect, t), 0);
    const markerInside = marker.x > rect.left - 4 && marker.x < rect.right + 4 && marker.y > rect.top - 4 && marker.y < rect.bottom + 4;
    const score = covered * 10 + drift + (markerInside ? 1e6 : 0);
    if (!best || score < best.score) best = { x, y, score };
    if (score === 0) break;
  }
  return { x: Math.round(best.x), y: Math.round(best.y) };
}
