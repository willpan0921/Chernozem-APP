// WHAT THIS FILE DOES
// The arithmetic behind the About page's globe (WorldGlobe.jsx), kept apart
// as plain functions so it can be checked without a browser
// (globeMath.test.js):
//   globeLayout(W, H)       how large the Earth is drawn in the first screen,
//                           where its centre sits, and the camera height that
//                           gives that size
//   aimFor(event, buyers)   where the camera looks when the tour stops at an
//                           event: between the event and the countries that
//                           buy its food
//   tourStops(events)       the order the tour visits the events in
//   flightMs(degrees)       how long the camera takes to fly that far
//   captionFor(event, ...)  the words on the small tile beside the marker
// and the small helpers they share: distances and directions on the sphere,
// where a place appears on the screen, dates read in UTC (so a visitor in
// California still reads "since February 2022"), and country names said the
// way people say them.
//
// Positions are degrees of latitude and longitude. The camera's "altitude"
// is its distance above the surface in Earth radii (three-globe's unit), and
// the screen projection uses the same axes as the 3D scene
// (globeScene.js): y towards the north pole, longitude 0 towards the viewer.
//
// WHO EDITS IT
// Whoever changes how the globe is framed, toured or worded. Run the checks
// with: node --test src/site/components/globeMath.test.js

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

// Landscape (wider than 1.1 : 1): the Earth sits right of the words and runs
// off the top, the right and the bottom. Portrait: centred, a little wider
// than the screen, in the upper part, with the words at the foot.
export function globeLayout(W, H) {
  const landscape = W / H >= 1.1;
  let D;
  let cx;
  let cy;
  if (landscape) {
    D = Math.min(Math.max(1.25 * H, 0.78 * W), 1.6 * H);
    cx = W - 0.42 * D;
    cy = 0.56 * H;
  } else {
    const t = clamp((W - 480) / (768 - 480), 0, 1);
    D = W * (1.25 + (1.1 - 1.25) * t);
    cx = W / 2;
    cy = 0.4 * H;
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

// The countries that buy most of this event's country's farm and food
// exports, largest share first, at most eight, each with a name, a share
// (0..1) and the centre of the country.
export function buyersOf(event, trade, countries) {
  const row = event && trade?.exporters?.[event.iso3];
  if (!row || !Array.isArray(row.to) || !countries) return [];
  return row.to
    .filter((t) => countries[t.iso3] && finite(countries[t.iso3].lat) && finite(countries[t.iso3].lng) && t.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 8)
    .map((t) => ({ iso3: t.iso3, share: t.share, name: plainName(t.iso3, countries[t.iso3].name), lat: countries[t.iso3].lat, lng: countries[t.iso3].lng }));
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
// not yet visited, then up to three red disaster alerts the same way.
export function tourStops(events, { maxRed = 3, first = "war-ukraine" } = {}) {
  const placed = (events || []).filter((e) => e && finite(e.lat) && finite(e.lng));
  const conflicts = placed.filter((e) => e.kind === "war");
  let reds = placed.filter((e) => e.kind !== "war" && e.level === "red");
  const start = conflicts.find((e) => e.id === first) || conflicts[0] || reds[0];
  if (!start) return [];
  const order = [start];
  let cur = start;
  let rest = conflicts.filter((e) => e !== start);
  while (rest.length) {
    cur = nearestTo(cur, rest);
    order.push(cur);
    rest = rest.filter((e) => e !== cur);
  }
  reds = reds.filter((e) => e !== start);
  for (let i = 0; i < maxRed && reds.length; i++) {
    cur = nearestTo(cur, reds);
    order.push(cur);
    reds = reds.filter((e) => e !== cur);
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

// "February 2022"; "2015" when the list only knows the year (stored as 1 January).
export function sinceText(iso) {
  const p = parts(iso);
  if (!p) return "";
  if (p.month === 1 && p.day === 1) return String(p.year);
  return `${MONTHS[p.month - 1]} ${p.year}`;
}

// "22 October 2026"
export function dayMonthYear(iso) {
  const p = parts(iso);
  return p ? `${p.day} ${MONTHS[p.month - 1]} ${p.year}` : "";
}

const KIND_WORD = { flood: "Flood", drought: "Drought", wildfire: "Wildfires", storm: "Storm", earthquake: "Earthquake", volcano: "Volcano" };

// The reviewed list holds wars, insurgencies and gang violence alike: it
// says "War" only when the event's own name does.
export function kindWord(e) {
  if (e.kind === "war") return /\bwar\b/i.test(e.name || "") ? "War" : "Armed conflict";
  return KIND_WORD[e.kind] || "Alert";
}

function levelWord(level) {
  return level ? `${level[0].toUpperCase()}${level.slice(1)} alert` : "Alert";
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

// 1780400 -> "1.78 million", 1204041 -> "1.2 million"
export function millions(n) {
  const m = n / 1e6;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(m >= 1.5 ? 2 : 1).replace(/\.?0+$/, "")} million`;
}

export function percent(share) {
  return Math.round(share * 100);
}

// The tile beside the marker: the event's name, one line on when it began,
// one fact, and the link that opens the panel.
export function captionFor(e, { buyers = [] } = {}) {
  let meta;
  let fact = null;
  if (e.kind === "war") {
    const since = sinceText(e.since);
    meta = since ? `Since ${since}.` : "Armed conflict.";
    if (e.measured && finite(e.measured.heavyDamageHa)) {
      fact = `Chernozem measured ${millions(e.measured.heavyDamageHa)} ha of black soil heavily damaged here${e.measured.month ? `, ${e.measured.month}` : ""}.`;
    } else if (buyers.length) {
      fact = `${percent(buyers[0].share)}% of ${possessive(buyers[0].name)} farm and food imports come from ${e.country || plainName(e.iso3)}.`;
    } else if (e.note) {
      fact = e.note;
    }
  } else {
    const day = dayMonthYear(e.since);
    meta = `${levelWord(e.level)}${day ? ` since ${day}` : ""}, GDACS.`;
  }
  return { name: e.name, meta, fact, link: buyers.length ? "Whose food depends on it" : "Details" };
}

// What a screen reader reads for each event in the globe's list.
export function optionText(e) {
  if (e.kind === "war") {
    const since = sinceText(e.since);
    return since ? `${e.name}, since ${since}` : e.name;
  }
  const day = dayMonthYear(e.since);
  return `${e.name}, ${e.level ? `${e.level} alert` : "alert"}${day ? ` since ${day}` : ""}`;
}

// The line under the panel's heading.
export function panelMeta(e, { reviewed } = {}) {
  if (e.kind === "war") {
    const since = sinceText(e.since);
    const review = dayMonthYear(reviewed);
    return [kindWord(e), since ? `since ${since}` : null, `Reviewed list${review ? `, ${review}` : ""}`].filter(Boolean).join(" · ");
  }
  const day = dayMonthYear(e.since);
  return [kindWord(e), e.level ? `${e.level} alert` : null, day ? `since ${day}` : null, "GDACS"].filter(Boolean).join(" · ");
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
