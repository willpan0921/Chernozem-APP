// WHAT THIS FILE DOES
// The arithmetic behind the About page's Earth (EarthGlobe.jsx), kept apart
// as plain functions so it can be checked without a browser
// (earthMath.test.js). Four groups:
//
// 1. Turning and zooming the Earth. The globe is drawn as seen from far
//    away (d3-geo's orthographic projection); "the centre" is the place in
//    the middle of the disc, as { lat, lng }, and "the zoom" how many times
//    larger than the disc the Earth is drawn: 1 shows the whole half of the
//    Earth that faces the visitor, up to 6 a stretch of it about 2,000 km
//    across. Zoomed in, the disc keeps its size and its round edge and
//    shows a smaller part of the Earth, larger: a round lens on the Earth,
//    never a square crop of it.
//      rotationFor(centre)        the turn d3-geo needs to put it there
//      discRadius(size)           the disc's radius (the lens's) on a box
//                                 `size` px wide
//      spin(centre, ms, speed)    the slow turn on its own: west to east,
//                                 like the real Earth, at a calm speed
//      dragTo(centre, dx, dy, r, follow)  the centre after the visitor
//                                 drags the Earth by (dx, dy) pixels; r is
//                                 the Earth's radius on the screen, so a
//                                 zoomed Earth moves as far as the finger
//                                 (a fling's glide moves it so too)
//      dragView(from, grab, ...)  the centre during a drag: the whole Earth
//                                 turns as a globe; zoomed in, the place
//                                 under the pointer stays exactly under it
//                                 (dragFollow: how much, at a zoom)
//      along(from, to, t)         part of the way from one centre to
//                                 another, along the great circle
//      facing(centre, place)      how far a place faces the visitor (1 in
//                                 the middle of the disc, 0 at the edge,
//                                 below 0 behind); lensFacing reads it the
//                                 same way inside the lens of a zoomed
//                                 Earth, and markerOpacity reads that
//      lensAngle(zoom)            how far the lens reaches from the centre,
//                                 in degrees on the Earth (90 at zoom 1):
//                                 the angle d3-geo clips every shape and
//                                 line at, exactly on the lens's edge
//      projectOn, placeAt         where a place lands on the disc, and the
//                                 place under a point of it
//      centreFor, zoomAround      the centre that puts a place at a point
//                                 of the disc (a zoom made with the pointer
//                                 or two fingers keeps what is under them)
//      clampZoom, wheelZoomFactor, wheelRoom, pinchZoom   the zoom's limits,
//                                 and how far a wheel, a trackpad pinch or
//                                 two fingers zoom it
//      fitView(event, buyers)     the centre and the zoom that frame an
//                                 event and the countries its lines go to
//      flyAt, flyMs               the way from one view to another, turning
//                                 and zooming at once (and out a little on
//                                 the way between two far places), and how
//                                 long it takes
//      networkLines, networkMarks every line the globe draws from the
//                                 start (one for each pair of countries),
//                                 and the countries they end at
//      lineFade, LINE_FADE        how strongly those lines are drawn
//                                 towards the lens's edge (they fade
//                                 there, so the rim never shows a comb);
//                                 fadeStops, the mask that fades them
//      arrowHead(...)             the small arrowhead at a line's end
//      lineGrowth, linesDone      how far each line of a picked event is
//                                 drawn while it grows
//      nearestMarker(...)         which marker a click was aimed at
//      tipPlace(...)              where a dot's name shows, on the screen
//      zoomBarPlace(...)          where the zoom buttons go so they never
//                                 touch the disc: its corner, beside it
//                                 or under it
//      revealBoth(...)            how far the page scrolls to show a card
//                                 under the globe together with the globe
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
//                                 that asked the browser to save data; a
//                                 sharper one as the visitor zooms in,
//                                 and the sharpest, 6144 px, only zoomed
//                                 in on a large globe on a sharp screen,
//                                 never on a phone or a tablet)
//      shaderView(centre, ...)    the numbers the program is given for a
//                                 turn and a zoom
//      shaderPlace(x, y, view)    the place under one pixel, worked out
//                                 step for step as the program does it, so
//                                 the tests can check the program's
//                                 arithmetic against d3-geo's own
//
// Positions are degrees: latitude north positive, longitude east positive.
//
// WHO EDITS IT
// Whoever changes how the Earth turns, zooms, or how its lines and its
// black soil are drawn.
// Run the checks with: node --test src/site/components/earthMath.test.js

import { wheelPixels } from "../../lib/wheelZoom.js";
import { alertWhen, buyerYearNote, clamp, easeInOutCubic, isMinorAlert, kindWord, measuredSentence, normLng, panelMeta, percent, possessive, sinceText } from "./globeMath.js";

const RAD = Math.PI / 180;

// ---------- 1. Turning and zooming the Earth ----------

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
// half, so its smooth edge stays inside the box. Zoomed in, it is the
// lens's radius and the Earth's is this times the zoom. The projection's
// scale (EarthGlobe.jsx) and the real Earth's program (shaderView) both
// use it.
export function discRadius(size) {
  return size / 2 - 1;
}

// The centre after `ms` milliseconds of the slow turn at `speed` degrees a
// second. The surface moves from west to east (left to right on the
// screen), as the real Earth turns, so the longitude in the middle falls.
export function spin(centre, ms, speed = SPIN_DEG_PER_S) {
  return { lat: centre.lat, lng: normLng(centre.lng - (speed * ms) / 1000) };
}

// The centre after the visitor drags the Earth `dx` pixels right and `dy`
// pixels down, with the Earth drawn `r` pixels in radius on the screen
// (the disc's radius times the zoom): the land under the pointer follows
// it, exactly so in the middle of the disc for a drag up or down. A drag
// across turns the whole Earth round its axis as a globe on a stand turns,
// at the same speed at every tilt (`follow` 0); zoomed in, where the
// visitor moves a map more than a globe, it is quickened by the tilt so
// the land in the middle keeps up with the finger (`follow` 1).
export function dragTo(centre, dx, dy, r, follow = 0) {
  const k = 1 / RAD / Math.max(r, 1);
  const f = clamp(follow || 0, 0, 1);
  const across = 1 / (1 - f * (1 - Math.max(Math.cos(centre.lat * RAD), 0.25)));
  return {
    lat: clamp(centre.lat + dy * k, -MAX_TILT, MAX_TILT),
    lng: normLng(centre.lng - dx * k * across),
  };
}

// How much a drag follows the finger rather than turning the globe at this
// zoom (dragTo, dragView): not at all on the whole Earth, fully from one
// and a half times.
export function dragFollow(zoom) {
  return clamp(((zoom || 1) - 1) / 0.5, 0, 1);
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

// The easing of a flight (slow start, slow end).
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
// visitor at least as much as 0.22 (about 77 degrees from the centre on the
// whole Earth), nothing at 0.06 (about 87 degrees) and behind. Zoomed in,
// it reads lensFacing, so the same holds at the lens's edge.
export function markerOpacity(f) {
  return clamp((f - 0.06) / 0.16, 0, 1);
}

// ---- Zooming: a round lens on the Earth ----

// The zoom: from the whole Earth (1) to six times; one press of + or -,
// or one click on the bare Earth, zooms one and a half times.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
export const ZOOM_STEP = 1.5;

// A zoom kept within its limits. Within a hair of the whole Earth it is
// the whole Earth, so the slow turn comes back.
export function clampZoom(zoom) {
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  return z < ZOOM_MIN * 1.004 ? ZOOM_MIN : z;
}

// How far the lens reaches from the centre, in degrees on the Earth: the
// whole half that faces the visitor at zoom 1 (90 degrees), closer in as
// the Earth grows (asin(1 / zoom): about 42 degrees at one and a half
// times, 14 at four). Given to d3-geo's clipAngle, it cuts every shape and
// line exactly at the lens's edge, so nothing is drawn outside the disc.
export function lensAngle(zoom = 1) {
  return Math.asin(1 / Math.max(1, zoom || 1)) / RAD;
}

// How far a place lies inside the lens, read as facing is read on the
// whole Earth: 1 in the middle of the disc, 0 at the lens's edge, below 0
// outside the lens or behind the Earth. At zoom 1 it is facing itself.
export function lensFacing(centre, place, zoom = 1) {
  const f = facing(centre, place);
  if (f <= 0) return f;
  const out = Math.max(1, zoom || 1) * Math.sqrt(Math.max(0, 1 - f * f)); // from the middle, in lens radii
  return out >= 1 ? 1 - out : Math.sqrt(1 - out * out);
}

// Where `place` lands on a disc `size` px across with `centre` in its
// middle at `zoom`, as d3-geo's orthographic projection draws it: { x, y }
// in px from the disc's top left, how far it faces the visitor (facing:
// below 0 it is behind the Earth and not drawn) and how far inside the
// lens it lies (lens: below 0 it is outside the disc and not drawn).
export function projectOn(centre, size, place, zoom = 1) {
  const r = discRadius(size) * Math.max(1, zoom || 1);
  const phi = place.lat * RAD;
  const phi0 = centre.lat * RAD;
  const dl = (place.lng - centre.lng) * RAD;
  return {
    x: size / 2 + r * Math.cos(phi) * Math.sin(dl),
    y: size / 2 - r * (Math.sin(phi) * Math.cos(phi0) - Math.cos(phi) * Math.cos(dl) * Math.sin(phi0)),
    facing: facing(centre, place),
    lens: lensFacing(centre, place, zoom),
  };
}

// The place under the point `at` ({ x, y } px from the disc's top left) of
// a disc `size` px across with `centre` in its middle at `zoom`, as
// d3-geo's projection.invert finds it; null outside the lens.
export function placeAt(centre, size, zoom, at) {
  const lens = discRadius(size);
  const ox = at.x - size / 2;
  const oy = at.y - size / 2;
  if (!(lens > 0) || Math.hypot(ox, oy) > lens) return null;
  const r = lens * Math.max(1, zoom || 1);
  const px = ox / r;
  const py = -oy / r;
  const toward = Math.sqrt(Math.max(0, 1 - px * px - py * py));
  const s = Math.sin(centre.lat * RAD);
  const c = Math.cos(centre.lat * RAD);
  const x = toward * c - py * s;
  const z = toward * s + py * c;
  return { lat: Math.asin(clamp(z, -1, 1)) / RAD, lng: normLng(centre.lng + Math.atan2(px, x) / RAD) };
}

// The centre that puts `place` at (dx, dy) Earth radii from the middle of
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

// The centre at `zoom` that keeps `place` under the point `at` ({ x, y } px
// from the disc's top left) of a disc `size` px across: a zoom made with
// the pointer, or with two fingers, keeps what is under them where it is.
export function zoomAround(place, at, zoom, size) {
  const r = discRadius(size) * Math.max(1, zoom || 1);
  if (!(r > 0)) return { lat: place.lat, lng: normLng(place.lng) };
  return centreFor(place, (at.x - size / 2) / r, (at.y - size / 2) / r);
}

// The centre during a drag of (dx, dy) pixels that began at `from`, with
// the pointer at `grab` ({ x, y } px in the disc, and `place`, the place
// that was under it), on a disc `size` px across at `zoom`. On the whole
// Earth the drag turns the globe (dragTo); from one and a half times the
// place under the pointer stays exactly under it, as on a map
// (zoomAround); between the two, a blend of both.
export function dragView(from, grab, dx, dy, size, zoom = 1) {
  const z = Math.max(1, zoom || 1);
  const follow = dragFollow(z);
  const turned = dragTo(from, dx, dy, (size / 2) * z, follow);
  if (!follow || !grab?.place) return turned;
  const held = zoomAround(grab.place, { x: grab.x + dx, y: grab.y + dy }, z, size);
  return follow >= 1 ? held : along(turned, held, follow);
}

// What one wheel event multiplies the zoom by (above 1 zooms in: the
// wheel rolled away from the visitor, the fingers pushed up the trackpad).
// A notch of a mouse wheel (100 px) zooms 1.25 times, and a trackpad's
// small steps add up to the same; a trackpad pinch (the browser sends it
// as a wheel event with ctrlKey) follows the fingers, twice as large for
// every 100 px. Lines and pages are counted in pixels as the maps count
// them (src/lib/wheelZoom.js wheelPixels).
export const WHEEL_STEP = 1.25;
export function wheelZoomFactor(deltaY, { ctrlKey = false, deltaMode = 0 } = {}) {
  const px = wheelPixels({ deltaY, deltaMode });
  if (!px) return 1;
  return (ctrlKey ? 2 : WHEEL_STEP) ** (-px / 100);
}

// Whether a wheel event with this factor can still zoom the Earth from
// `zoom`: "zoom" while there is room that way; "fully-out" when it would
// zoom out past the whole Earth, "fully-in" past six times; "none" for a
// scroll with no up or down in it. Only "zoom" keeps the wheel from the
// page, so a visitor scrolling down over the whole Earth always moves the
// page.
export function wheelRoom(zoom, factor, { min = ZOOM_MIN, max = ZOOM_MAX } = {}) {
  if (!Number.isFinite(zoom) || !Number.isFinite(factor) || factor <= 0 || factor === 1) return "none";
  if (factor < 1) return zoom > min * 1.001 ? "zoom" : "fully-out";
  return zoom < max * 0.999 ? "zoom" : "fully-in";
}

// The zoom while two fingers pinch: the zoom they started at, times how
// far apart they are now against then, within the limits.
export function pinchZoom(zoom0, d0, d) {
  if (!(d0 > 0) || !(d > 0)) return clampZoom(zoom0);
  return clampZoom(zoom0 * (d / d0));
}

// ---- A picked event: the view that frames it, and the way there ----

// The view that frames an event and the countries its lines go to: the
// middle of the smallest round patch of the Earth that holds them all,
// leaning a little towards the event (`lean` of the way), and the closest
// zoom that still keeps them all within `room` of the lens's radius (so
// the arrowheads stay clear of the edge), from `min` to `max` times. A
// tight group zooms in close (Ukraine and its neighbours), a wide one less
// (Colombia, with lines to Chile and the United States), and an event
// with no lines takes the closest zoom. When the countries lie too far
// apart to fit even at `min` (India's lines run to West Africa), the event
// is kept `alone` of the lens's radius out from the middle, towards them,
// so its lines run on across the lens. The centre stays within MAX_TILT of
// the equator. Gives { centre, zoom, all } (all: every country inside).
export const FIT_MIN = 1.4;
export const FIT_MAX = 4;
export const FIT_ROOM = 0.86;
export function fitView(event, buyers = [], { min = FIT_MIN, max = FIT_MAX, room = FIT_ROOM, lean = 0.25, alone = 0.5 } = {}) {
  const places = [event, ...(buyers || []).filter((b) => Number.isFinite(b?.lat) && Number.isFinite(b?.lng))];
  let centre = { lat: event.lat, lng: normLng(event.lng) };
  if (places.length > 1) {
    // The middle of the smallest ball round the places (Badoiu and
    // Clarkson's steps: each one moves towards the place farthest away,
    // a little less each time), which for places on the sphere is the
    // middle of the smallest round patch of it that holds them.
    const vecs = places.map(toVec);
    let c = vecs[0].slice();
    for (let i = 1; i <= 600; i++) {
      let far = vecs[0];
      let most = -1;
      for (const v of vecs) {
        const d = (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2 + (v[2] - c[2]) ** 2;
        if (d > most) {
          most = d;
          far = v;
        }
      }
      c = [c[0] + (far[0] - c[0]) / (i + 1), c[1] + (far[1] - c[1]) / (i + 1), c[2] + (far[2] - c[2]) / (i + 1)];
    }
    centre = along(fromVec(c), event, lean);
  }
  centre = { lat: clamp(centre.lat, -MAX_TILT, MAX_TILT), lng: normLng(centre.lng) };
  const spread = Math.max(...places.map((p) => arcDegrees(centre, p)));
  const zoom = clamp(spread > 1e-6 ? room / Math.sin(Math.min(spread, 90) * RAD) : max, min, max);
  const all = spread < 90 && zoom * Math.sin(spread * RAD) <= room + 1e-9;
  if (!all) {
    const off = Math.asin(clamp(alone / zoom, 0, 1)) / RAD;
    const d = arcDegrees(event, centre);
    if (d > off) {
      const moved = along(event, centre, off / d);
      centre = { lat: clamp(moved.lat, -MAX_TILT, MAX_TILT), lng: moved.lng };
    }
  }
  return { centre, zoom, all };
}

// The view `t` of the way (0 to 1, already eased) from one view
// ({ centre, zoom }) to another: the centre along the great circle, the
// zoom evenly in its own scale (each doubling as quick as the last), and
// out on the way when the two lie far apart, so that halfway the lens
// shows both ends with some of the Earth round them (from Ukraine, close
// up, to Colombia the Earth is seen turning between them rather than a
// blur of sea).
export function flyAt(from, to, t) {
  const e = clamp(t, 0, 1);
  const centre = along(from.centre, to.centre, e);
  const a = Math.log(Math.max(1, from.zoom || 1));
  const b = Math.log(Math.max(1, to.zoom || 1));
  const arc = arcDegrees(from.centre, to.centre);
  const both = Math.log(Math.max(1, FIT_ROOM / Math.sin(Math.min(90, arc / 2 + 10) * RAD)));
  const dip = Math.max(0, (a + b) / 2 - both);
  return { centre, zoom: Math.max(1, Math.exp((1 - e) * a + e * b - dip * 4 * e * (1 - e))) };
}

// How long a flight from one view to another takes: about 0.9 s for a
// pick, longer for half the world (at most 1.3 s), less for a zoom alone
// (closing a card: about 0.75 s).
export function flyMs(from, to) {
  const arc = arcDegrees(from.centre, to.centre);
  const doublings = Math.abs(Math.log2(Math.max(1, to.zoom || 1) / Math.max(1, from.zoom || 1)));
  return Math.round(clamp(600 + 3 * arc + 100 * doublings, 650, 1300));
}

// ---- The lines: whose food depends on each event's land ----

// Every line the globe draws from the start: from each event to each
// country whose farm and food imports depend on its land (`buyersFor(e)`
// gives them: globeMath.js buyersOf), as
//   { id, event, iso3, share, from, to, back, place }
// with from, to and back as [lng, lat] for d3-geo: `back` lies a little
// way back along the line from the country's end (1.5 degrees, or a fifth
// of a short line) and gives the arrowhead its direction; `place` is the
// country's centre as { lat, lng }.
// The share belongs to the event's country, not to the event, so each
// pair of countries is drawn once: from the first of that country's
// events (`events` in earthEvents order: conflicts, then red alerts, then
// orange), never again from its others (three alerts in India would
// otherwise draw the same eight lines three times, side by side). A
// picked event still draws all of its own lines (EarthGlobe.jsx).
export function networkLines(events, buyersFor, { back = 1.5 } = {}) {
  const out = [];
  const drawn = new Set();
  for (const e of events || []) {
    if (!e || !Number.isFinite(e.lat) || !Number.isFinite(e.lng)) continue;
    for (const b of buyersFor(e) || []) {
      if (!Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) continue;
      const pair = `${e.iso3 || e.id}>${b.iso3}`;
      if (drawn.has(pair)) continue;
      const arc = arcDegrees(e, b);
      if (arc < 0.05) continue;
      drawn.add(pair);
      const behind = along(b, e, Math.min(back, arc / 5) / arc);
      out.push({ id: `${e.id} ${b.iso3}`, event: e.id, iso3: b.iso3, share: b.share, from: [e.lng, e.lat], to: [b.lng, b.lat], back: [behind.lng, behind.lat], place: { lat: b.lat, lng: b.lng } });
    }
  }
  return out;
}

// How strongly every event's lines (with their arrowheads and marks) are
// drawn at `t` lens radii from the middle of the disc: whole out to 0.84,
// then fading to a sixth at the edge, so near the rim, where the whole
// Earth's lines crowd together seen side-on, they never comb into a
// bright fringe (the dots fade there too, markerOpacity). The stops are
// [t, strength]; fadeStops (below) makes the canvas's mask from them, and
// nothing is drawn outside the lens.
export const LINE_FADE = Object.freeze([
  [0, 1],
  [0.84, 1],
  [0.93, 0.55],
  [1, 0.16],
]);
export function lineFade(t) {
  if (!(t >= 0)) return 1;
  if (t > 1) return 0;
  for (let i = 1; i < LINE_FADE.length; i++) {
    const [t1, a1] = LINE_FADE[i];
    if (t <= t1) {
      const [t0, a0] = LINE_FADE[i - 1];
      return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
    }
  }
  return LINE_FADE[LINE_FADE.length - 1][1];
}

// The mask that does that fading (EarthGlobe.jsx makeFade): a radial
// gradient from the lens's middle to a pixel past its edge, laid over the
// lines' own canvas with "destination-out", which takes away as much of
// them as the mask is opaque. Its stops, as [offset, opacity] (offset 0
// to 1 along the gradient): clear where the lines are whole, as opaque as
// they fade (1 - lineFade), and wholly opaque a pixel past the edge, so
// nothing is left past the rim. radius in CSS px, dpr the canvas's pixels
// per CSS px.
export function fadeStops(radius, dpr = 1) {
  const r = Math.max(0, radius) * dpr;
  const outer = Math.max(r + dpr, 1e-3);
  return [...LINE_FADE.map(([t, a]) => [clamp((t * r) / outer, 0, 1), 1 - a]), [1, 1]];
}

// The countries the lines end at, each once: [{ iso3, place }].
export function networkMarks(lines) {
  const seen = new Map();
  for (const l of lines || []) if (!seen.has(l.iso3)) seen.set(l.iso3, { iso3: l.iso3, place: l.place });
  return [...seen.values()];
}

// The small arrowhead at the country's end of a line, on the screen. `end`
// is the country's point and `before` a point a little way back along the
// line (both [x, y] px); the tip stops `gap` px short of `end` (at the edge
// of the country's mark), and the arrowhead is `length` px long and
// `width` px across its base, pointing the way the line runs: from the
// crisis to the country whose food depends on it. Gives its three corners
// [tip, wing, wing], or null when the two points are one.
export function arrowHead(end, before, { length = 6, width = 5, gap = 3 } = {}) {
  const dx = end[0] - before[0];
  const dy = end[1] - before[1];
  const n = Math.hypot(dx, dy);
  if (!(n > 1e-6)) return null;
  const ux = dx / n;
  const uy = dy / n;
  const tip = [end[0] - ux * gap, end[1] - uy * gap];
  const bx = tip[0] - ux * length;
  const by = tip[1] - uy * length;
  const h = width / 2;
  return [tip, [bx - uy * h, by + ux * h], [bx + uy * h, by - ux * h]];
}

// How far each line of a picked event is drawn, `ms` after the lines began:
// line i starts i x 90 ms after the first and takes 700 ms, easing out.
// With reduced motion every line is whole at once.
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

// ---- Under the pointer ----

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

// ---- The description card and the list ----
// The globe's widths (CSS pixels across the disc) where they change:
//   OVER_GLOBE   from 480 px the list opens over the globe, in its place
//                (and over any globe with the page's words beside it);
//                under a smaller globe that has the page's width to itself
//                (a phone) it opens under the globe
//   WIDE_GLOBE   from 520 px a card under the globe has two columns: what
//                is going on, and whose food depends on it
// (On a page that keeps a place for it beside the globe, the card opens
// there instead, in the page's words' place: EarthGlobe.jsx.)
export const OVER_GLOBE = 480;
export const WIDE_GLOBE = 520;

// Where the zoom buttons go on a globe `size` px across, in a component
// `room` px wide (the globe centred in it), so they never touch the disc:
//   "corner"  in the bottom right corner of the globe's square, which the
//             round disc leaves free on a large globe: the column of
//             `count` buttons `button` px square, `gap` apart, keeps at
//             least `clear` px from the rim (from about 520 px)
//   "beside"  outside the square, just right of the disc's foot, where
//             the component has room for them there (a phone on its side,
//             a short laptop screen)
//   "under"   in a row under the disc, at its right (an upright phone, a
//             globe that fills its column)
// It is worked out for the zoomed-in column of three (the whole Earth, +
// and -), so the buttons stay where they are when the third one comes.
export function zoomBarPlace(size, room = size, { button = 36, gap = 4, count = 3, clear = 6, side = 8 } = {}) {
  if (!(size > 0)) return "corner";
  const half = size / 2;
  const tall = count * button + (count - 1) * gap;
  const reach = Math.hypot(Math.max(0, half - button), Math.max(0, half - tall));
  if (half - button > 0 && half - tall > 0 && reach >= discRadius(size) + clear) return "corner";
  if ((room - size) / 2 >= side + button) return "beside";
  return "under";
}

// How far to scroll the page (px, down when positive) so a card under the
// globe shows with the globe: `disc` and `card` are their boxes in the
// window ({ top, bottom } px) and `view` the window's height. When the two
// fit in the window together, it scrolls only as far as it must to show
// them both whole, `margin` px from its edges; when they do not, it shows
// the whole globe from its top and the card starts under it. (A pick
// should be seen happening: the globe turning and zooming, and its lines.)
export function revealBoth(disc, card, view, { margin = 12 } = {}) {
  const top = Math.min(disc.top, card.top);
  const bottom = Math.max(disc.bottom, card.bottom);
  const room = view - 2 * margin;
  if (bottom - top <= room) {
    if (top < margin) return Math.round(top - margin);
    if (bottom > view - margin) return Math.round(bottom - (view - margin));
    return 0;
  }
  return Math.round(disc.top - margin);
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
//            `countries` of them (the globe's card names every one: its
//            lines are all on the globe, and the card is never over it)
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
// at the North Pole), smallest first. All four are made the same way from
// the same picture (world.topo.bathy.200408, from NASA's page for it,
// https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/,
// resized with sharp's lanczos3 to WebP): the 1024, 2048 and 3072 copies
// from NASA's 5400 x 2700 file at quality 78, the 6144 one (854 KB) from
// its 21600 x 10800 file at quality 70, which at four times on a sharp
// screen looks as sharp as 78 and is a fifth smaller (its colours match:
// shrunk to 3072, its mean red, green and blue are within a quarter of a
// level of the 3072 copy's). An 8192 copy would be only a little sharper
// at four times for 1.8 MB and about 180 MB on the graphics card, so there
// is none.
export const PICTURE_WIDTHS = Object.freeze([1024, 2048, 3072, 6144]);

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
// one. Zoomed in, the Earth is drawn `zoom` times the globe's size, and
// that size decides (so a phone zoomed one and a half times asks for the
// 3072 copy, and the whole Earth never does).
// The 6144 copy, the sharpest (854 KB to fetch, about 100 MB on the
// graphics card with its smaller copies), only where the 3072 one would
// be stretched more than one and a half times: zoomed in, on a globe that
// is not a phone's (400 px or more), on a sharp screen (one and a half
// times the pixels or more; 558 px at twice the pixels from about 1.3
// times), and never on a phone or a tablet, nor on a device that says it
// has little memory (`handheld`), whose graphics memory it could fill.
// A visitor who asked the browser to save data gets the 1024 copy
// everywhere. `maxTexture` is the largest picture the graphics card takes.
export const SHARPEST = 6144;
export function earthPicture(size, dpr = 1, { maxTexture = Infinity, saveData = false, zoom = 1, handheld = false } = {}) {
  const fits = PICTURE_WIDTHS.filter((w) => w <= maxTexture);
  if (!fits.length) return null;
  if (saveData || !(size > 0)) return fits[0];
  const sharpness = clamp(dpr || 1, 1, 2);
  const z = Math.max(1, zoom || 1);
  const shown = size * z;
  const wanted = Math.PI * shown * sharpness; // picture pixels round the equator for one per screen pixel in the middle
  let width;
  if (shown < PHONE_GLOBE) width = sharpness >= 2 ? 2048 : 1024;
  else width = wanted > 3000 && shown >= 480 ? 3072 : 2048;
  if (!handheld && z > 1 && size >= PHONE_GLOBE && sharpness >= 1.5 && wanted > 1.5 * 3072) width = SHARPEST;
  return fits.filter((w) => w <= width).pop();
}

// The numbers the real Earth's program (earthGl.js) is given to draw the disc
// exactly where d3-geo draws it on a canvas `size` CSS pixels wide, `height`
// device pixels tall, at `dpr` device pixels to a CSS pixel, at `zoom`:
//   middle  the disc's middle in device pixels, counted from the canvas's
//           lower left corner (WebGL counts upwards, the page downwards)
//   radius  the Earth's radius in device pixels (the projection's scale:
//           the disc's radius times the zoom)
//   lens    the disc's own radius in device pixels: the lens the Earth is
//           seen through, where the picture stops with a smooth edge and
//           which the light, the shade and the air are laid over, so a
//           zoomed Earth keeps the whole Earth's look (at zoom 1 the two
//           radii are one)
//   tilt    the sine and cosine of the latitude in the middle of the disc
//   lng     the longitude in the middle of the disc, in radians
export function shaderView(centre, size, dpr, height, zoom = 1) {
  const k = dpr || 1;
  return {
    middle: [(size / 2) * k, height - (size / 2) * k],
    radius: discRadius(size) * k * Math.max(1, zoom || 1),
    lens: discRadius(size) * k,
    tilt: [Math.sin(centre.lat * RAD), Math.cos(centre.lat * RAD)],
    lng: centre.lng * RAD,
  };
}

// The place under the pixel whose middle is at (x, y) device pixels from the
// canvas's lower left, worked out with the same steps, in the same order, as
// the program in earthGl.js (any change there is made here too, and
// earthMath.test.js then checks it against d3-geo's projection):
//   q        the pixel from the disc's middle, in device pixels
//   p        the same in Earth radii (x right, y up)
//   toward   how far the sphere's surface there comes out towards the visitor
//   x, y, z  the point on the sphere turned back to the Earth's own axes: the
//            turn d3-geo makes for rotate([-lng, -lat, 0]), undone (x
//            through 0 degrees of longitude on the equator, y through 90 east,
//            z through the North Pole)
//   l        the pixel in lens radii, which the look is laid over
// Gives { inside, lat, lng } (degrees: inside is within the lens and on
// the Earth), { u, v }, where the program reads the picture: u from 0 at
// 180 degrees west to 1 at 180 east, v from 0 at the North Pole to 1 at
// the South Pole, and rim, how far towards the lens's edge the pixel lies
// for the shade and the air (0 in the middle, 1 at the edge).
export function shaderPlace(x, y, view) {
  const qx = x - view.middle[0];
  const qy = y - view.middle[1];
  const px = qx / view.radius;
  const py = qy / view.radius;
  const d2 = px * px + py * py;
  const toward = Math.sqrt(Math.max(1 - d2, 0));
  const vx = toward * view.tilt[1] - py * view.tilt[0];
  const vz = toward * view.tilt[0] + py * view.tilt[1];
  const vy = px;
  const lat = Math.asin(clamp(vz, -1, 1));
  const lng = Math.atan2(vy, vx) + view.lng;
  const turn = lng / (2 * Math.PI) + 0.5;
  const lens = view.lens ?? view.radius;
  const l2 = (qx * qx + qy * qy) / (lens * lens);
  return {
    inside: d2 <= 1 && l2 <= 1,
    lat: lat / RAD,
    lng: normLng(lng / RAD),
    u: turn - Math.floor(turn),
    v: 0.5 - lat / Math.PI,
    rim: 1 - Math.sqrt(Math.max(1 - l2, 0)),
  };
}
