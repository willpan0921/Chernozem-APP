// WHAT THIS FILE DOES
// The arithmetic behind the About page's Earth (EarthGlobe.jsx), kept apart
// as plain functions so it can be checked without a browser
// (earthMath.test.js). Three groups:
//
// 1. Turning the Earth. The globe is drawn as seen from far away
//    (d3-geo's orthographic projection); "the centre" is the place in the
//    middle of the disc, as { lat, lng }.
//      rotationFor(centre)        the turn d3-geo needs to put it there
//      discRadius(size)           the disc's radius on a box `size` px wide
//      spin(centre, ms, speed)    the slow turn on its own: west to east,
//                                 like the real Earth, at a calm speed
//      dragTo(centre, dx, dy, r)  the centre after the visitor drags the
//                                 disc by (dx, dy) pixels
//      along(from, to, t)         part of the way from one centre to
//                                 another, along the great circle
//      turnMs(from, to)           how long a turn to an event takes
//      facing(centre, place)      how far a place faces the visitor (1 in
//                                 the middle of the disc, 0 at the edge,
//                                 below 0 behind); markerOpacity reads it
//      projectOn(centre, size, p) where a place lands on the disc
//      cardPlace, sheetSide,      where the description card goes: over a
//      sheetHides, eventSpot,     globe 480 px or wider, across its top or
//      centreFor                  bottom, on the side that hides none of
//                                 the lines, with the turn that puts the
//                                 event in the part it leaves free; under
//                                 a smaller globe (or when it would hide
//                                 a line or need scrolling inside)
//      nearestMarker(...)         which marker a click was aimed at
//      tipPlace(...)              where a dot's name shows, on the screen
//      lineGrowth(...)            how far each line to a buyer is drawn
//
// 2. The events. earthEvents(events) keeps the armed conflicts and the
//    orange and red disaster alerts (GDACS's green ones are the minor
//    alerts and stay off the globe), conflicts first. statusLine says
//    since when, cardWords what the description card says, using the
//    words of globeMath.js.
//
// 3. Black soil, from a picture to shapes. The black-soil map
//    (OpenLandMap's USDA great groups: the soils the app counts as black
//    soil, server/providers/gee.js BLACK_SOIL) arrives as a grid of
//    pixels, one byte each. blockShares + softBlur turn it into a coarse
//    grid of shares, contourRings draws the outlines where the share
//    crosses a level (marching squares), simplifyRing removes points that
//    add nothing at the globe's size, and ringsToPolygons nests the holes
//    in their shapes and winds them the way d3-geo reads a small shape.
//    soilShapes runs all of it. This made public/site/world/black-soil.json
//    once (1 November 2026, from the 0.1 degree grid sampled from Earth
//    Engine for the old globe's pictures); the page only reads that file.
//    To make it again: read the grid (3600 x 1800 bytes, rows from north
//    to south, 255 = black soil), call
//      soilShapes(grid, 3600, 1800, SOIL_RECIPE)
//    and write { type: "Feature", properties: {...}, geometry } as JSON.
//
// 4. The real Earth's picture (NASA's Blue Marble, August 2004, in
//    public/site/world/earth-true-<width>.webp), painted on the sphere by
//    the WebGL program in earthGl.js.
//      earthPicture(size, dpr)    which copy of the picture a globe that
//                                 size needs (the smallest only for a
//                                 phone with an ordinary screen, or one
//                                 that asked the browser to save data)
//      shaderView(centre, ...)    the numbers the program is given for a turn
//      shaderPlace(x, y, view)    the place under one pixel, worked out
//                                 step for step as the program does it, so
//                                 the tests can check the program's
//                                 arithmetic against d3-geo's own
//
// Positions are degrees: latitude north positive, longitude east positive.
//
// WHO EDITS IT
// Whoever changes how the Earth turns or how its black soil is drawn.
// Run the checks with: node --test src/site/components/earthMath.test.js

import { alertWhen, buyerYearNote, clamp, easeInOutCubic, isMinorAlert, kindWord, measuredSentence, normLng, panelMeta, percent, possessive, sinceText } from "./globeMath.js";

const RAD = Math.PI / 180;

// ---------- 1. Turning the Earth ----------

// The slow turn: one whole turn in 80 seconds.
export const SPIN_DEG_PER_S = 360 / 80;

// Where the Earth starts and the latitude it turns at: Ukraine's longitude
// (where Chernozem started) with the disc's middle at 30 degrees north, so
// the black-soil belts of the north (the steppe from Ukraine to Kazakhstan,
// the prairies, northeast China) face the visitor and the Pampas still show
// near the bottom.
export const START = Object.freeze({ lat: 30, lng: 31 });

// A drag never tips the Earth further than this, so the north pole cannot
// flip over.
export const MAX_TILT = 70;

// The turn d3-geo's projection.rotate() takes to put `centre` in the middle.
export function rotationFor(centre) {
  return [-centre.lng, -centre.lat, 0];
}

// The disc's radius in a square box `size` pixels wide: a pixel short of
// half, so its smooth edge stays inside the box. The projection's scale
// (EarthGlobe.jsx) and the real Earth's program (shaderView) both use it.
export function discRadius(size) {
  return size / 2 - 1;
}

// The centre after `ms` milliseconds of the slow turn at `speed` degrees a
// second. The surface moves from west to east (left to right on the
// screen), as the real Earth turns, so the longitude in the middle falls.
export function spin(centre, ms, speed = SPIN_DEG_PER_S) {
  return { lat: centre.lat, lng: normLng(centre.lng - (speed * ms) / 1000) };
}

// The centre after the visitor drags the disc `dx` pixels right and `dy`
// pixels down, on a disc of radius `r` pixels: the land under the pointer
// follows it (exactly so in the middle of the disc).
export function dragTo(centre, dx, dy, r) {
  const k = 1 / RAD / Math.max(r, 1);
  return {
    lat: clamp(centre.lat + dy * k, -MAX_TILT, MAX_TILT),
    lng: normLng(centre.lng - dx * k),
  };
}

function toVec(p) {
  const phi = p.lat * RAD;
  const lam = p.lng * RAD;
  return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
}

function fromVec([x, y, z]) {
  const r = Math.hypot(x, y, z) || 1;
  return { lat: Math.asin(clamp(z / r, -1, 1)) / RAD, lng: normLng(Math.atan2(y, x) / RAD) };
}

// The angle between two places, in degrees.
export function arcDegrees(a, b) {
  const u = toVec(a);
  const v = toVec(b);
  return Math.acos(clamp(u[0] * v[0] + u[1] * v[1] + u[2] * v[2], -1, 1)) / RAD;
}

// The centre `t` of the way (0 to 1) from `from` to `to`, along the great
// circle between them. Two places on opposite sides of the Earth have no
// one great circle: the turn then goes by way of the place 90 degrees east
// of `from` on its own parallel's great circle.
export function along(from, to, t) {
  const s = clamp(t, 0, 1);
  if (s === 0) return { lat: from.lat, lng: normLng(from.lng) };
  if (s === 1) return { lat: to.lat, lng: normLng(to.lng) };
  const a = toVec(from);
  let b = toVec(to);
  let omega = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  if (omega < 1e-9) return { lat: to.lat, lng: normLng(to.lng) };
  if (Math.PI - omega < 1e-6) {
    const mid = { lat: 0, lng: normLng(from.lng + 90) };
    return s < 0.5 ? along(from, mid, s * 2) : along(mid, to, (s - 0.5) * 2);
  }
  const sin = Math.sin(omega);
  const wa = Math.sin((1 - s) * omega) / sin;
  const wb = Math.sin(s * omega) / sin;
  return fromVec([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
}

// How long a turn from one centre to another takes: 0.5 s for a short one,
// up to 1.4 s for half the world.
export function turnMs(from, to) {
  return Math.round(clamp(450 + 5.5 * arcDegrees(from, to), 500, 1400));
}

// The easing of a turn (slow start, slow end).
export const ease = easeInOutCubic;

// How far a place faces the visitor: the cosine of its angle from the
// centre. 1 in the middle of the disc, 0 on the edge, below 0 behind.
export function facing(centre, place) {
  const p1 = centre.lat * RAD;
  const p2 = place.lat * RAD;
  return Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos((place.lng - centre.lng) * RAD);
}

// A marker fades out as it nears the edge of the disc (instead of sliding
// along it) and is gone before it reaches it: whole while it faces the
// visitor at least as much as 0.22 (about 77 degrees from the centre),
// nothing at 0.06 (about 87 degrees) and behind.
export function markerOpacity(f) {
  return clamp((f - 0.06) / 0.16, 0, 1);
}

// The marker a click at `point` ({ x, y } pixels) was aimed at: the nearest
// shown marker whose dot lies within `reach` pixels, or null. `markers`:
// [{ id, x, y, shown }]. Two markers can lie close together (Gaza and
// southern Lebanon are about 10 px apart on the disc), so the one whose dot
// is nearer wins, whichever button the click landed on.
export function nearestMarker(point, markers, reach = 20) {
  let best = null;
  let bestD = Infinity;
  for (const m of markers || []) {
    if (!m || !m.shown) continue;
    const d = Math.hypot(m.x - point.x, m.y - point.y);
    if (d <= reach && d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best ? best.id : null;
}

// Where a dot's name shows (earth.css: a dark label at most 240 px wide,
// its words wrapping): to the right of the dot, else to the left, else
// centred under it (over it near the globe's foot) and moved sideways as
// far as it must, so it always stays inside the globe and on the screen.
//   x, y     the dot, px from the disc's top left
//   w, h     the name's box
//   size     the disc's width
//   lo, hi   the part of the disc's width that is on the screen (0 and
//            size when all of it is)
//   gap      px from the dot's middle to a name beside it (earth.css: the
//            name starts 26 px into the 32 px button, 10 px past the middle)
//   drop     px from the dot's middle to a name under or over it
// Gives { side: "right" | "left" | "below" | "above", shift, lift }: shift
// is how far a name under or over the dot moves sideways (negative: left),
// lift how far a name beside it moves up or down (negative: up) to stay
// within the globe's height near its top or its foot.
export function tipPlace(x, y, w, h, { size, lo = 0, hi = size, gap = 10, drop = 14 } = {}) {
  const left = Math.max(0, lo);
  const right = Math.min(size, hi);
  const top = y - h / 2;
  const lift = Math.round(clamp(top, 0, Math.max(0, size - h)) - top);
  if (x + gap >= left && x + gap + w <= right) return { side: "right", shift: 0, lift };
  if (x - gap - w >= left && x - gap <= right) return { side: "left", shift: 0, lift };
  const side = y + drop + h <= size ? "below" : "above";
  const from = x - w / 2;
  const shift = clamp(from, left, Math.max(left, right - w)) - from;
  return { side, shift: Math.round(shift), lift: 0 };
}

// Where `place` lands on a disc `size` px across with `centre` in its
// middle, as d3-geo's orthographic projection draws it: { x, y } in px from
// the disc's top left, and how far it faces the visitor (facing: below 0
// it is behind the Earth and not drawn).
export function projectOn(centre, size, place) {
  const r = discRadius(size);
  const phi = place.lat * RAD;
  const phi0 = centre.lat * RAD;
  const dl = (place.lng - centre.lng) * RAD;
  return {
    x: size / 2 + r * Math.cos(phi) * Math.sin(dl),
    y: size / 2 - r * (Math.sin(phi) * Math.cos(phi0) - Math.cos(phi) * Math.cos(dl) * Math.sin(phi0)),
    facing: facing(centre, place),
  };
}

// ---- The description card ----
// The globe's widths (CSS pixels across the disc) where the card changes:
//   OVER_GLOBE      from 480 px the card and the list lie over the globe;
//                   on a smaller one they go under it
//   WIDE_GLOBE      from 520 px the card has two columns and names every
//                   country its lines go to; on a smaller globe one column
//                   and the first CARD_COUNTRIES of them, then "and N more"
//   CARD_SHARE      over the globe the card is at most 75% of the disc's
//                   height; a card whose words need more goes under it
export const OVER_GLOBE = 480;
export const WIDE_GLOBE = 520;
export const CARD_SHARE = 0.75;
export const CARD_COUNTRIES = 4;

// Where the card goes on a globe `size` px across, before it is measured:
//   "over"   across the top or the bottom of the globe (480 px and wider)
//   "float"  just under the globe, lying over what is below it, when the
//            page has something beside the globe (its words): the globe's
//            box never changes height, so nothing beside it moves
//   "under"  under the globe on the page, which grows to hold it, when the
//            globe has the page's width to itself (a phone, or a narrow
//            window that puts the globe under the words)
// `shared`: the page lays something beside the globe.
export function cardPlace(size, shared) {
  if (size >= OVER_GLOBE) return "over";
  return shared ? "float" : "under";
}

// The points the lines to the buyers are drawn through: the event itself
// (its dot must stay clear too), then `steps` points along each great
// circle to a buyer, the last one the buyer's own end dot. As { lat, lng }.
export function linePoints(event, buyers, steps = 24) {
  const out = [{ lat: event.lat, lng: event.lng }];
  for (const b of buyers || []) {
    if (!Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) continue;
    for (let k = 1; k <= steps; k++) out.push(along(event, b, k / steps));
  }
  return out;
}

// How many of `points` a card `sheetHeight` px tall lying across the
// `side` ("top" or "bottom") of a disc `size` px across hides, with the
// disc turned to `centre`. The card sits `inset` px in from the box's
// edges (earth.css); a point closer than `margin` px to it counts as
// hidden, as the lines and their end dots are drawn a few pixels wide. A
// point behind the Earth is not drawn, so it is never hidden.
export function hiddenUnder(side, centre, size, sheetHeight, points, { inset = 12, margin = 4 } = {}) {
  const top = side === "top" ? inset : size - inset - sheetHeight;
  const bottom = top + sheetHeight;
  let hidden = 0;
  for (const p of points) {
    const q = projectOn(centre, size, p);
    if (q.facing <= 0) continue;
    if (q.x > inset - margin && q.x < size - inset + margin && q.y > top - margin && q.y < bottom + margin) hidden += 1;
  }
  return hidden;
}

// For a card `sheetHeight` px tall over a disc `size` px across: how many
// points of the event and its lines it would hide at the top and at the
// bottom ({ top, bottom }), each with the globe turned so the event lands
// in the part that side leaves free (eventSpot, then centreFor: the turn
// the globe really makes).
export function sheetHides(event, buyers, { size, sheetHeight, inset = 12, steps = 24 } = {}) {
  const points = linePoints(event, buyers, steps);
  const hasLines = points.length > 1;
  const out = { top: 0, bottom: 0 };
  for (const side of ["top", "bottom"]) {
    const spot = eventSpot(side, size, sheetHeight, hasLines, inset);
    out[side] = hiddenUnder(side, centreFor(event, spot.dx, spot.dy), size, sheetHeight, points, { inset });
  }
  return out;
}

// The side of the globe the card lies across. Without its measurements
// (`geometry`): away from where the lines go, at the top when the
// countries whose food depends on the event lie, on the whole, south of it
// (the lines run down), else at the bottom (and at the bottom when there
// are no lines). With them ({ size, sheetHeight }): the side whose card
// hides fewer points of the event and its lines (sheetHides), the rule
// above when both hide as many. When even the better side hides some, the
// card goes under the globe instead (the component checks sheetHides for
// that side). `buyers` as globeMath.js buyersOf gives them (largest share
// first).
export function sheetSide(event, buyers, geometry = null) {
  if (!event) return "bottom";
  const list = (buyers || []).filter((b) => Number.isFinite(b?.lat) && b.share > 0);
  let away = "bottom";
  if (list.length) {
    const weight = list.reduce((sum, b) => sum + b.share, 0);
    const lat = list.reduce((sum, b) => sum + b.lat * b.share, 0) / weight;
    away = lat < event.lat - 3 ? "top" : "bottom";
  }
  if (!geometry || !(geometry.size > 0) || !(geometry.sheetHeight > 0)) return away;
  const hidden = sheetHides(event, list, geometry);
  if (hidden.top === hidden.bottom) return away;
  return hidden.top < hidden.bottom ? "top" : "bottom";
}

// Where the event goes on a disc `size` pixels across while a sheet
// `sheetHeight` pixels tall covers its `side` (`inset` pixels in from the
// edge): in the free part, centred across, and a little more than a
// quarter of the way from the sheet (so its lines run away from the sheet
// across the free part), or in the middle of the free part when it has no
// lines. As { dx, dy }: the offset from the disc's middle, in disc radii,
// y downwards.
export function eventSpot(side, size, sheetHeight, hasLines, inset = 12) {
  const r = size / 2 - 1;
  const top = side === "top" ? inset + sheetHeight : 0;
  const bottom = side === "top" ? size : size - inset - sheetHeight;
  const free = Math.max(1, bottom - top);
  const y = !hasLines ? top + free / 2 : side === "top" ? top + 0.28 * free : bottom - 0.28 * free;
  return { dx: 0, dy: clamp((y - size / 2) / r, -0.8, 0.8) };
}

// The centre that puts `place` at (dx, dy) disc radii from the middle of
// the disc (x to the right, y downwards), worked out from the
// orthographic projection's own formulas:
//   x = cos(lat) sin(lng - lng0)
//   y = -(sin(lat) cos(lat0) - cos(lat) cos(lng - lng0) sin(lat0))
// Of the two answers it takes the one with the place on the visible side.
// The centre stays within MAX_TILT of the equator (the place then lands a
// little off the point asked for).
export function centreFor(place, dx = 0, dy = 0) {
  const phi = place.lat * RAD;
  const dl = Math.asin(clamp(dx / Math.max(Math.cos(phi), 1e-9), -1, 1));
  const a = Math.sin(phi);
  const b = Math.cos(phi) * Math.cos(dl);
  const n = Math.hypot(a, b) || 1;
  const delta = Math.atan2(b, a);
  const turn = Math.acos(clamp(-dy / n, -1, 1));
  let best = null;
  for (const phi0 of [turn - delta, -turn - delta]) {
    const near = b * Math.cos(phi0) + a * Math.sin(phi0); // > 0 on the visible side
    if (Math.abs(phi0) > Math.PI / 2 + 1e-9) continue;
    if (!best || near > best.near) best = { phi0, near };
  }
  const lat0 = best ? best.phi0 / RAD : place.lat;
  return { lat: clamp(lat0, -MAX_TILT, MAX_TILT), lng: normLng(place.lng - dl / RAD) };
}

// How far each line to a buyer is drawn, `ms` after the lines began: line
// i starts i x 90 ms after the first and takes 700 ms, easing out. With
// reduced motion every line is whole at once.
export const LINE_MS = 700;
export const LINE_STAGGER_MS = 90;
export function lineGrowth(ms, i, reduced = false) {
  if (reduced) return 1;
  const t = clamp((ms - i * LINE_STAGGER_MS) / LINE_MS, 0, 1);
  return 1 - (1 - t) ** 3;
}

// Whether the lines are all drawn `ms` after they began (so the drawing
// can stop).
export function linesDone(ms, count, reduced = false) {
  return reduced || count === 0 || ms >= (count - 1) * LINE_STAGGER_MS + LINE_MS;
}

// ---------- 2. The events ----------

// The events the globe shows: armed conflicts and the orange and red
// disaster alerts (green ones are GDACS's minor alerts), conflicts first,
// then red alerts, then orange, each kind in the feed's order.
const ORDER = { war: 0, red: 1, orange: 2 };
export function earthEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.id && e.name && !isMinorAlert(e))
    .map((e, i) => ({ e, i, rank: e.kind === "war" ? ORDER.war : ORDER[e.level] ?? 3 }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.e);
}

// "17 armed conflicts", "1 disaster alert"
export function countWords(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// Since when, in a few words: "War since February 2022", "Armed conflict
// since 2015", "Storm, red alert since 26 October 2026", "Flood, orange
// alert from 31 July to 27 September 2026". `now` is the feed's own time
// (an alert that is over is said to be over).
export function statusLine(e, now = Date.now()) {
  if (e.kind === "war") {
    const since = sinceText(e.since);
    return `${kindWord(e)}${since ? ` since ${since}` : ""}`;
  }
  const when = alertWhen(e, now);
  return `${kindWord(e)}${e.level ? `, ${e.level} alert` : ""}${when ? ` ${when}` : ""}`;
}

// What the description card says about an event:
//   title    the event's name
//   meta     since when (an alert: its level and its dates, from GDACS)
//   note     one sentence about the land, from the feed
//   measured Chernozem's own measurement (Ukraine), or ""
//   buyers   [{ iso3, name, share: "24%", year: " (2021)" or "" }]: whose
//            food depends on this land, largest share first; at most
//            `countries` of them (a small globe's card names the first
//            four, CARD_COUNTRIES)
//   more     the line after them when some are left out ("and 4 more"),
//            or ""
//   buyersAbout  the line under them: what the share is
//   link     GDACS's report for an alert, or null
// `buyers` comes from globeMath.js buyersOf; `commonYear` is the trade
// table's own year (tradeYear). The day the list of wars was reviewed is
// in the sources line under the globe.
export function cardWords(e, { buyers = [], now = Date.now(), commonYear = null, countries = Infinity } = {}) {
  const from = e.country || "this country";
  const all = buyers || [];
  const named = all.slice(0, Math.max(1, countries));
  const left = all.length - named.length;
  return {
    title: e.name,
    meta: e.kind === "war" ? `${statusLine(e, now)}.` : panelMeta(e, { now }),
    note: e.note || "",
    measured: e.measured ? measuredSentence(e.measured) : "",
    buyers: named.map((b) => ({ iso3: b.iso3, name: b.name, share: `${percent(b.share)}%`, year: buyerYearNote(b, commonYear) })),
    more: left > 0 ? `and ${left} more` : "",
    buyersAbout: all.length ? `The share of each country's farm and food imports that come from ${from}${commonYear ? `, in ${commonYear} unless a year is given` : ""}.` : "",
    link: e.kind !== "war" && typeof e.url === "string" && /^https:\/\//.test(e.url) ? e.url : null,
  };
}

// The event in one sentence, for screen readers: "War in Ukraine: War
// since February 2022."
export function eventLine(e, now = Date.now()) {
  return `${e.name}: ${statusLine(e, now)}.`;
}

// The largest buyer, as the short line a marker's tooltip can carry:
// "24% of Moldova's farm and food imports".
export function topBuyerLine(buyers) {
  const b = buyers && buyers[0];
  return b ? `${percent(b.share)}% of ${possessive(b.name)} farm and food imports` : "";
}

// ---------- 3. Black soil, from a picture to shapes ----------

// The settings black-soil.json was made with: 0.3 degree blocks (3 x 3
// pixels of the 0.1 degree grid), blurred over about one block, outlined
// where 30% of the land is black soil, simplified to 0.08 degrees (under
// half a pixel on the About page's Earth), shapes under 0.6 square degrees
// and holes under 0.4 left out, two decimals. Coarser settings (0.4
// degree blocks at 40%) melt the belts into blobs; finer ones add specks
// that do not read at the globe's size and make the file half as big again.
export const SOIL_RECIPE = Object.freeze({ factor: 3, blur: 1, level: 0.3, tolerance: 0.08, minArea: 0.6, minHoleArea: 0.4, decimals: 2 });

// The share of black-soil pixels (bytes above 127) in each block of
// `factor` x `factor` pixels: a coarser grid of numbers from 0 to 1.
export function blockShares(mask, width, height, factor) {
  const W = Math.floor(width / factor);
  const H = Math.floor(height / factor);
  const grid = new Float32Array(W * H);
  for (let y = 0; y < H * factor; y++) {
    const row = y * width;
    const out = Math.floor(y / factor) * W;
    for (let x = 0; x < W * factor; x++) if (mask[row + x] > 127) grid[out + Math.floor(x / factor)] += 1;
  }
  const n = factor * factor;
  for (let i = 0; i < grid.length; i++) grid[i] /= n;
  return { grid, width: W, height: H };
}

// A soft blur: a box `radius` cells wide on each side, run twice in each
// direction. East and west wrap round the Earth; beyond the poles counts
// as no black soil. Gives a new grid.
export function softBlur(grid, width, height, radius) {
  if (!radius) return Float32Array.from(grid);
  let a = Float32Array.from(grid);
  let b = new Float32Array(grid.length);
  const span = 2 * radius + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += a[row + ((x + k + width) % width)];
        b[row + x] = sum / span;
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < height) sum += a[yy * width + x];
        }
        b[y * width + x] = sum / span;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

// The outlines where `grid` (width x height values, row by row from the
// top) crosses `level`, by marching squares. Each outline is a closed ring
// of [x, y] positions on the grid, x across and y down, where the value of
// cell (i, j) sits at (i + 0.5, j + 0.5); the first point is repeated at the
// end. Beyond the grid's edges counts as below the level, so every outline
// closes. Where four cells meet in a saddle (two above the level across
// one diagonal, two below across the other), their average decides
// whether the two above join.
export function contourRings(grid, width, height, level) {
  const PW = width + 2;
  const PH = height + 2;
  const at = (i, j) => (i < 1 || j < 1 || i > width || j > height ? -Infinity : grid[(j - 1) * width + (i - 1)]);
  // Where an outline crosses each edge between two samples, by edge key.
  const points = new Map();
  const ends = new Map(); // edge key -> the segments that end there
  const segments = [];
  const cross = (va, vb) => (vb === va ? 0.5 : clamp((level - va) / (vb - va), 0, 1));
  // Beyond the edges: no black soil (0), for placing the crossing points.
  const outside = level > 0 ? 0 : level - 1;
  const val = (v) => (v === -Infinity ? outside : v);
  // An edge along a row (from sample (i, j) to (i + 1, j)) or down a column (to (i, j + 1)).
  const rowEdge = (i, j) => {
    const key = (j * PW + i) * 2;
    if (!points.has(key)) points.set(key, [i + cross(val(at(i, j)), val(at(i + 1, j))) - 0.5, j - 0.5]);
    return key;
  };
  const colEdge = (i, j) => {
    const key = (j * PW + i) * 2 + 1;
    if (!points.has(key)) points.set(key, [i - 0.5, j + cross(val(at(i, j)), val(at(i, j + 1))) - 0.5]);
    return key;
  };
  const add = (k1, k2) => {
    const id = segments.length;
    segments.push([k1, k2]);
    for (const k of [k1, k2]) {
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(id);
    }
  };
  for (let j = 0; j < PH - 1; j++) {
    for (let i = 0; i < PW - 1; i++) {
      const tl = at(i, j) >= level;
      const tr = at(i + 1, j) >= level;
      const br = at(i + 1, j + 1) >= level;
      const bl = at(i, j + 1) >= level;
      const index = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const top = () => rowEdge(i, j);
      const bottom = () => rowEdge(i, j + 1);
      const left = () => colEdge(i, j);
      const right = () => colEdge(i + 1, j);
      switch (index) {
        case 1: case 14: add(left(), bottom()); break;
        case 2: case 13: add(bottom(), right()); break;
        case 3: case 12: add(left(), right()); break;
        case 4: case 11: add(top(), right()); break;
        case 6: case 9: add(top(), bottom()); break;
        case 7: case 8: add(top(), left()); break;
        case 5: case 10: {
          // 5: top right and bottom left above the level; 10: top left and
          // bottom right. When the middle is above the level too, the two
          // corners above join across it and the two below are each cut
          // off on their own; otherwise the two above are each cut off.
          const middle = (val(at(i, j)) + val(at(i + 1, j)) + val(at(i + 1, j + 1)) + val(at(i, j + 1))) / 4 >= level;
          const cutTopLeftAndBottomRight = index === 5 ? middle : !middle;
          if (cutTopLeftAndBottomRight) {
            add(top(), left());
            add(bottom(), right());
          } else {
            add(top(), right());
            add(left(), bottom());
          }
          break;
        }
        default:
          break;
      }
    }
  }
  // Walk from segment to segment through the edges they share.
  const used = new Uint8Array(segments.length);
  const rings = [];
  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const [start, next0] = segments[s];
    const ring = [points.get(start)];
    let key = next0;
    let prev = s;
    let guard = 0;
    while (key !== start && guard++ < segments.length + 2) {
      ring.push(points.get(key));
      const nextSeg = (ends.get(key) || []).find((id) => id !== prev && !used[id]);
      if (nextSeg === undefined) break;
      used[nextSeg] = 1;
      const [a, b] = segments[nextSeg];
      key = a === key ? b : a;
      prev = nextSeg;
    }
    if (key === start && ring.length >= 3) {
      ring.push(ring[0]);
      rings.push(ring);
    }
  }
  return rings;
}

// The signed area of a ring of [x, y] points (the shoelace formula):
// positive when the points run anticlockwise with y pointing up.
export function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

// Whether the point [x, y] lies inside the ring (ray casting).
export function insideRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function lineDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len, 0, 1);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplifyLine(points, tolerance) {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let far = -1;
    let farD = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = lineDistance(points[i], points[first], points[last]);
      if (d > farD) {
        far = i;
        farD = d;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([first, far], [far, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// A closed ring with the points that stray less than `tolerance` from the
// line between their neighbours removed (Douglas and Peucker), still
// closed. It is cut in two at the point farthest from its first point and
// each half simplified, so the ring keeps its shape on both sides.
export function simplifyRing(ring, tolerance) {
  if (ring.length <= 4 || !tolerance) return ring.slice();
  const open = ring.slice(0, -1);
  let far = 0;
  let farD = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > farD) {
      far = i;
      farD = d;
    }
  }
  const a = simplifyLine(open.slice(0, far + 1), tolerance);
  const b = simplifyLine([...open.slice(far), open[0]], tolerance);
  const out = [...a, ...b.slice(1)];
  return out.length >= 4 ? out : ring.slice();
}

// Rings (closed, of [lng, lat]) -> polygons for d3-geo: a ring inside an
// even number of other rings is an outer edge, one inside an odd number a
// hole, which goes with the smallest outer ring around it. Outer rings run
// clockwise on a map with north up and holes anticlockwise: d3-geo reads
// that as a shape smaller than half the Earth (the opposite of the GeoJSON
// standard's order, which d3-geo would read as everything else). Outer
// rings under `minArea` square degrees and holes under `minHoleArea` are
// left out (a hole left out is simply filled). Gives an array of polygons,
// each [outer, ...holes].
export function ringsToPolygons(rings, { minArea = 0, minHoleArea = 0 } = {}) {
  const items = rings
    .filter((r) => r.length >= 4)
    .map((ring) => {
      let w = Infinity;
      let s = Infinity;
      let e = -Infinity;
      let n = -Infinity;
      for (const [x, y] of ring) {
        w = Math.min(w, x);
        e = Math.max(e, x);
        s = Math.min(s, y);
        n = Math.max(n, y);
      }
      return { ring, area: Math.abs(ringArea(ring)), box: [w, s, e, n] };
    });
  const holds = (a, b) => a.box[0] <= b.box[0] && a.box[1] <= b.box[1] && a.box[2] >= b.box[2] && a.box[3] >= b.box[3] && a.area > b.area && insideRing(b.ring[0], a.ring);
  for (const item of items) {
    item.around = items.filter((other) => other !== item && holds(other, item));
    item.hole = item.around.length % 2 === 1;
  }
  const outers = items.filter((item) => !item.hole && item.area >= minArea);
  const polygons = new Map(outers.map((o) => [o, [orient(o.ring, false)]]));
  for (const item of items) {
    if (!item.hole || item.area < minHoleArea) continue;
    const parent = item.around.filter((o) => !o.hole).sort((a, b) => a.area - b.area)[0];
    if (parent && polygons.has(parent)) polygons.get(parent).push(orient(item.ring, true));
  }
  return [...polygons.values()];
}

// A ring wound clockwise (outer) or anticlockwise (hole) on a map with
// north up.
function orient(ring, anticlockwise) {
  const isAnti = ringArea(ring) > 0;
  return isAnti === anticlockwise ? ring.slice() : ring.slice().reverse();
}

// Rounds every position to `decimals` and drops a point that rounds onto
// the one before it; null when too few points are left for a ring.
export function roundRing(ring, decimals) {
  const f = 10 ** decimals;
  const out = [];
  for (const [x, y] of ring) {
    const p = [Math.round(x * f) / f, Math.round(y * f) / f];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 ? out : null;
}

// The whole recipe: a black-soil grid (width x height bytes, rows from the
// north pole down, columns from 180 degrees west eastwards, above 127 =
// black soil) -> a GeoJSON MultiPolygon geometry, wound for d3-geo.
export function soilShapes(mask, width, height, recipe = SOIL_RECIPE) {
  const { factor, blur, level, tolerance, minArea, minHoleArea, decimals } = { ...SOIL_RECIPE, ...recipe };
  const coarse = blockShares(mask, width, height, factor);
  const smooth = softBlur(coarse.grid, coarse.width, coarse.height, blur);
  const cell = 360 / coarse.width;
  const rings = contourRings(smooth, coarse.width, coarse.height, level).map((ring) =>
    simplifyRing(
      ring.map(([x, y]) => [-180 + x * cell, 90 - y * (180 / coarse.height)]),
      tolerance
    )
  );
  const polygons = ringsToPolygons(rings, { minArea, minHoleArea })
    .map((polygon) => polygon.map((ring) => roundRing(ring, decimals)))
    .filter((polygon) => polygon[0])
    .map((polygon) => polygon.filter(Boolean));
  return { type: "MultiPolygon", coordinates: polygons };
}

// ---------- 4. The real Earth's picture ----------

// The copies of NASA's picture in public/site/world/ (earth-true-<width>.webp,
// each twice as wide as tall, the left edge at 180 degrees west and the top
// at the North Pole), smallest first.
export const PICTURE_WIDTHS = Object.freeze([1024, 2048, 3072]);

// A globe narrower than this is a phone's (about 360 px across, under the
// page's words).
export const PHONE_GLOBE = 400;

// Which copy a globe `size` CSS pixels across needs on a screen with `dpr`
// device pixels to a CSS pixel. One pixel of the picture for each pixel of
// the screen in the middle of the disc takes a picture about 3.14 times the
// disc's width in device pixels (its 360 degrees round the equator against
// the disc's 2 radians across). So: on a phone the 2048 copy when its
// screen is sharp (twice the pixels or more: a 358 px globe wants 2249) and
// the 1024 one when it is not; the 3072 one only for a large globe on a
// sharp screen (558 px at twice the pixels: 3506 wanted); else the 2048
// one. A visitor who asked the browser to save data gets the 1024 copy
// everywhere. `maxTexture` is the largest picture the graphics card takes.
export function earthPicture(size, dpr = 1, { maxTexture = Infinity, saveData = false } = {}) {
  const fits = PICTURE_WIDTHS.filter((w) => w <= maxTexture);
  if (!fits.length) return null;
  if (saveData || !(size > 0)) return fits[0];
  const sharpness = clamp(dpr || 1, 1, 2);
  let width;
  if (size < PHONE_GLOBE) width = sharpness >= 2 ? 2048 : 1024;
  else width = Math.PI * size * sharpness > 3000 && size >= 480 ? 3072 : 2048;
  return fits.filter((w) => w <= width).pop();
}

// The numbers the real Earth's program (earthGl.js) is given to draw the disc
// exactly where d3-geo draws it on a canvas `size` CSS pixels wide, `height`
// device pixels tall, at `dpr` device pixels to a CSS pixel:
//   middle  the disc's middle in device pixels, counted from the canvas's
//           lower left corner (WebGL counts upwards, the page downwards)
//   radius  the disc's radius in device pixels (the projection's scale)
//   tilt    the sine and cosine of the latitude in the middle of the disc
//   lng     the longitude in the middle of the disc, in radians
export function shaderView(centre, size, dpr, height) {
  const k = dpr || 1;
  return {
    middle: [(size / 2) * k, height - (size / 2) * k],
    radius: discRadius(size) * k,
    tilt: [Math.sin(centre.lat * RAD), Math.cos(centre.lat * RAD)],
    lng: centre.lng * RAD,
  };
}

// The place under the pixel whose middle is at (x, y) device pixels from the
// canvas's lower left, worked out with the same steps, in the same order, as
// the program in earthGl.js (any change there is made here too, and
// earthMath.test.js then checks it against d3-geo's projection):
//   p        the pixel from the disc's middle, in disc radii (x right, y up)
//   toward   how far the sphere's surface there comes out towards the visitor
//   x, y, z  the point on the sphere turned back to the Earth's own axes: the
//            turn d3-geo makes for rotate([-lng, -lat, 0]), undone (x
//            through 0 degrees of longitude on the equator, y through 90 east,
//            z through the North Pole)
// Gives { inside, lat, lng } (degrees) and { u, v }, where the program reads
// the picture: u from 0 at 180 degrees west to 1 at 180 east, v from 0 at
// the North Pole to 1 at the South Pole.
export function shaderPlace(x, y, view) {
  const px = (x - view.middle[0]) / view.radius;
  const py = (y - view.middle[1]) / view.radius;
  const d2 = px * px + py * py;
  const toward = Math.sqrt(Math.max(1 - d2, 0));
  const vx = toward * view.tilt[1] - py * view.tilt[0];
  const vz = toward * view.tilt[0] + py * view.tilt[1];
  const vy = px;
  const lat = Math.asin(clamp(vz, -1, 1));
  const lng = Math.atan2(vy, vx) + view.lng;
  const turn = lng / (2 * Math.PI) + 0.5;
  return {
    inside: d2 <= 1,
    lat: lat / RAD,
    lng: normLng(lng / RAD),
    u: turn - Math.floor(turn),
    v: 0.5 - lat / Math.PI,
  };
}
