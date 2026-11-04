// WHAT THIS FILE DOES
// The About page's Earth, in the right half of the first screen (under
// the words on a phone): a medium-sized globe of the real Earth (NASA's
// picture of it from space, softly lit) that turns slowly on its own. On
// it: the world's black-soil belts (the soil Chernozem is named after),
// outlined over the Earth's own colours; today's armed conflicts
// (terracotta dots) and disaster alerts (amber dots); and, from the first
// frame, the lines from those events to the countries whose farm and
// food imports depend most on their land (World Bank WITS: only real
// rows, each with its share; for a war, none from before it began), one
// for each pair of countries: the share is the country's, so a country
// with several events (three alerts in India) draws its lines once, from
// the first of them (earthMath networkLines). The lines are thin and
// see-through, so the many of them read as one network rather than a
// tangle, and fade towards the edge of the disc, where seen side-on they
// would crowd into a bright comb; each ends in a small arrowhead pointing
// at the country that depends on the land (from the crisis to it), and
// each country they reach has a small mark. The legend names them.
//
// What the visitor can do:
//   - watch it turn: a whole turn in 80 seconds, west to east like the
//     real Earth, starting over Ukraine. It rests while the pointer is on
//     it, while a card is open, while it is zoomed in, while it is off the
//     screen or the tab is hidden, and for visitors who asked for reduced
//     motion (they get it standing still, a jump instead of a flight, a
//     zoom at once and the lines drawn at once);
//   - drag it to turn it, with a mouse or a finger (on a phone a sideways
//     drag turns it and an up-and-down one scrolls the page as usual).
//     Zoomed in, a drag moves the Earth as a map moves: the place under
//     the pointer stays under it (earthMath dragView; a fling glides on,
//     dragTo); on a phone two fingers move and zoom it any way, while one
//     finger up or down still scrolls the page (when a finger tries that
//     on a zoomed Earth, a short note says two fingers move it);
//   - click or tap a dot, or choose an event from the list: the globe
//     turns and zooms in, over about 0.9 s and eased (earthMath flyAt,
//     flyMs), to frame the event and the countries its lines go to
//     (earthMath fitView: from 1.4 to 4 times, less for a wide spread;
//     when they lie too far apart, the event and the way its lines run).
//     The event's lines then grow bold from it, one after another, thicker
//     for a larger share; the countries they reach are tinted; the other
//     events' lines step back. A card says what is going on there now: the
//     event's name, since when (an alert: its level and dates, and the
//     link to GDACS's report), the feed's line about the land, for Ukraine
//     Chernozem's own measurement, and the countries with their shares
//     (each with its year when it is not the table's own). The card never
//     lies over the globe or its lines:
//       where the page keeps a place for it beside the globe (the `side`
//       ref: the About page's hero from 901 px wide, while that place is
//       shown), it opens there, in the place of the page's words, which
//       step aside while it is open (the place is marked data-card while
//       it holds the card, and home.css hides the words by that mark) and
//       come back when it closes;
//       anywhere else (a phone, a tablet standing up) it opens under the
//       globe on the page, which grows; in two columns under a globe 520
//       px or wider (earthMath WIDE_GLOBE).
//     The card is brought into the window only as far as it must: beside
//     the globe, whole; under it, together with the globe (earthMath
//     revealBoth: both whole when they fit, else the whole globe and the
//     card's start), so the visitor sees the pick happen, the turn, the
//     zoom and the lines, even when it was chosen far down the list under
//     a phone's globe. A card that moves between its two places (the
//     window crossed 900 px) keeps the focus it had, and is brought into
//     the window again only if the globe or the card was in it (a visitor
//     who has read on down the page and turns a tablet stays where they
//     are). When it closes the page scrolls back up to the globe if it
//     went down for it, and a card chosen in the list under the globe and
//     closed with its button or Esc takes the visitor back to that event
//     in the list, if the card was still in the window. Esc (from anywhere
//     on the page, unless the phone menu is open: then it closes the
//     menu), the card's close button or a click on the bare globe closes
//     it: the globe zooms back out to the whole Earth and turns on, and a
//     card chosen from the list gives the focus back to the list (an Esc
//     pressed with the card out of the window moves the page nowhere, and
//     the focus only if it was in the card);
//   - zoom, from the whole Earth to six times (earthMath ZOOM_MAX): with
//     the + and - buttons (and, while zoomed in, one before them that
//     shows the whole Earth again), which never touch the disc: in the
//     corner of a large globe's square, beside a smaller one's foot where
//     there is room, else in a row under it (earthMath zoomBarPlace, the
//     stage's data-bar); a pinch with two
//     fingers, a pinch on a trackpad (the browser sends it as the wheel
//     with ctrlKey, or in Safari as its own gesture events), or a click on
//     the bare globe, which zooms one step in at that point (with a card
//     open it closes the card instead). The plain mouse wheel zooms only
//     while the globe is engaged: in the 10 seconds after the visitor
//     clicked, dragged or zoomed it, when a quiet line on the globe says
//     "Scroll to zoom. Esc to let the page scroll." Scrolling down on the
//     whole Earth gives the wheel back to the page at once, and so do Esc,
//     a press anywhere else, the pointer leaving the globe and the globe
//     leaving the screen, so the page is never held (earthMath wheelRoom).
//     A zoom keeps the place under the pointer, or between the fingers,
//     where it is (earthMath zoomAround). Zoomed in, the globe stays
//     round: the disc is a lens on a larger Earth, and nothing is drawn
//     outside it (earthMath lensAngle, lensFacing);
//   - "See them all as a list", under the globe, lists every event as a
//     button (the armed conflicts, then the disaster alerts, each group
//     under a line that counts it), for the keyboard, screen readers and
//     small screens: choosing one does what a click on its dot does and
//     puts the focus in the card (Esc gives it back). Over a globe 480 px
//     or wider, or one with the page's words beside it, the list opens
//     over the globe, in its place, with the focus on its first event (its
//     close button stays in the corner while the list scrolls; Esc closes
//     it); under a small globe that has the page's width to itself (a
//     phone) it opens under the globe and stays open;
//   - "Black soil" in the legend is a switch: it takes the black-soil
//     outlines off the Earth and puts them back (they show at first).
// Each dot is a real button 32 px across, so the site's pin cursor, with
// any part of it, can click it (src/site/cursorAssist.js); the buttons are
// hidden from screen readers because the list says the same. A click
// between two close dots goes to the nearer one (earthMath nearestMarker),
// and a click on the bare globe that the pin's other parts would give to
// a dot or a button nearby (the assist shows that as [data-near]) is left
// to the assist rather than zooming. A dot's name shows beside it (at most
// 240 px wide, its words wrapping), on whichever side keeps it inside the
// globe and on the screen, or under it (earthMath tipPlace); never the
// picked dot's (its card says it, and the name would lie over the start
// of its lines), and none from the start of a pick's or a close's flight
// until the pointer moves again (the dots move under a pointer that
// stays still, and the browser goes on naming the dot that was under it:
// the globe is marked data-names-off meanwhile). A tap or a click on a
// dot leaves no focus on it (a key pressed later, Esc, would ring it);
// the keyboard's way to the events is the list, and keeps its focus.
// Until the first click, Ukraine's dot pulses gently.
//
// How it is drawn: d3-geo's orthographic projection on two canvases, one
// over the other, its scale the disc's radius times the zoom and its clip
// angle the lens's (earthMath lensAngle: every shape and line is cut at
// the disc's edge). Underneath, the real Earth (earthGl.js): NASA's Blue
// Marble picture of August 2004 painted on the sphere by a small WebGL
// program that turns and zooms it exactly as d3-geo turns and zooms
// everything else, a little lighter and less saturated than NASA's own
// colours, softly lit from the upper left and shaded towards the edge of
// the lens. On top (an ordinary canvas), only what goes over the Earth, so
// its own colours still show: a faint grid of latitude and longitude, the
// black soil (public/site/world/black-soil.json, made by earthMath.js
// soilShapes) as a fine dark outline with a light wash, the countries a
// picked event's lines go to (a warm see-through tint with an outline),
// every event's lines (earthMath networkLines, all in one path, so the
// many of them cost little), their arrowheads (earthMath arrowHead) and
// the countries' marks, drawn first on a canvas of their own and faded
// towards the lens's edge by a mask made once for each size (earthMath
// lineFade, its mask fadeStops), then laid on the overlay; and a picked
// event's own lines, bold (light, with a thin dark edge, so they read on
// the sea and on the land). Nothing is drawn past the lens's edge: d3-geo
// cuts the shapes and lines there, and the mask and a clip take off what
// a line's width and round end would put over the rim. The picture is asked
// for once the page has first shown something (it never holds up the page's
// words), in the size the globe needs at the closest zoom the visitor has
// reached (earthMath earthPicture: the 1024 copy on a phone with an
// ordinary screen or for a visitor saving data, the 2048 one on a sharp
// phone and mostly, the 3072 one for a large globe on a sharp screen and
// for one zoomed in, and the 6144 one, the sharpest, only zoomed in on a
// globe 400 px or wider on a sharp screen, never on a phone or a tablet or
// a device that says it has little memory, and never past what the graphics
// card takes). A copy is decoded off the page's own thread (an ImageBitmap)
// and asked for as soon as a flight or a zoom sets off; a larger one goes
// on the card in a still moment (nothing moving and a picked event's lines
// grown: the 6144 copy holds the page up for about 0.1 s), and the old one
// stays on the card until the new one is whole there (earthGl.js), so the
// Earth never blinks; one the card cannot take leaves the old one, and none
// that large is asked for again. The first copy fades in over a drawn Earth
// in natural colours (a blue sea, muted green-brown land, the ice of
// Antarctica and Greenland, from Natural Earth's 1:110m shapes,
// public/site/world/countries-110m.json). That drawn Earth is all the
// visitor sees where WebGL is missing, and while the browser has taken it
// away (the real Earth comes back with it; meanwhile its canvas is hidden,
// so the browser's grey "lost" sign never shows), so the globe is never
// empty; it zooms like the real one. Both canvases match the globe's box in
// the screen's own pixels, measured again when the box changes size and
// when the window moves to a screen with other pixels (a sharper screen
// then also gets a sharper picture); a box too small to draw in (a
// screenshot tool shrinks the window for a moment) is left alone.
// The dots are buttons laid over the canvases and moved each frame (only
// their style changes, so nothing on the page has to notice). One
// requestAnimationFrame loop draws while something moves (the turn, a
// drag and its glide, a flight, a zoom, a pinch, the lines growing, the
// land, the lines and the picture fading in, the other lines stepping
// back; the slow turn on its own 30 times a second) and stops when
// nothing does, when the globe is off the screen or when the tab is
// hidden; the WebGL program paints only when the turn, the zoom or the
// size has changed.
//
// Data: worldData.js (the live feed /api/world/crises, the country
// centres and the trade table, one load shared with the rest of the page)
// and the shape files and the picture above, fetched here: the component
// needs nothing from the page but its box, and the place beside it for
// the card (`side`, a ref to an element; without one, or while that
// element is not shown, the card goes under the globe). Words and
// arithmetic: earthMath.js and globeMath.js (both tested). Look: earth.css
// (the canvas reads its colours from there) and LOOK in earthGl.js.
// Checks: with ?earth-debug=1 in the address, window.__earth gives the
// browser tests its state (state(): the turn, the zoom, the lines and the
// arrowheads drawn, where the card and the zoom buttons are, whether the
// names are off and the wheel is engaged, the time a frame takes
// (paintMs), the picture on the card, the one waiting and the time the
// last one took to go on (earth.picture, pending, uploadMs) and more),
// select(id), close(), zoom(k)
// to set the zoom at once, recolour() to read the colours again,
// look({...}) to try other numbers for the real Earth's look, hold(true)
// to rest the slow turn, centre({ lat, lng }) to turn it, coasts(true) to
// draw Natural Earth's coasts over the picture, testPicture() to paint a
// grid of 10 degree lines instead of the Earth (the page's alignment
// checks use these four), and pixels() to do what a move to a screen with
// other pixels does.
//
// WHO EDITS IT
// Whoever works on the About page's globe.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { useMediaQuery } from "../hooks.js";
import { useWorldData } from "./worldData.js";
import { buyersOf, clamp, dayMonthYear, normLng, tradeYear } from "./globeMath.js";
import { createEarthPainter } from "./earthGl.js";
import {
  arcDegrees,
  arrowHead,
  cardWords,
  clampZoom,
  countWords,
  discRadius,
  dragFollow,
  dragTo,
  dragView,
  earthEvents,
  earthPicture,
  ease,
  eventLine,
  fadeStops,
  fitView,
  flyAt,
  flyMs,
  lensAngle,
  lensFacing,
  lineGrowth,
  linesDone,
  markerOpacity,
  nearestMarker,
  networkLines,
  networkMarks,
  OVER_GLOBE,
  pinchZoom,
  placeAt,
  revealBoth,
  rotationFor,
  spin,
  SPIN_DEG_PER_S,
  START,
  statusLine,
  tipPlace,
  wheelRoom,
  wheelZoomFactor,
  WIDE_GLOBE,
  zoomBarPlace,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  zoomAround,
} from "./earthMath.js";
import "./earth.css";

const GRATICULE = geoGraticule10();
const MAX_DPR = 2; // sharper than this costs drawing time and shows nothing more
const MIN_BOX = 16; // px: a box narrower than this is not drawn in (a screenshot tool shrinks the window for a moment)
// The globe has something beside it (the page's words) when it takes less
// than 70% of the window's width; then the list opens over it.
const SHARED_BELOW = 0.7;
const TIP_MARGIN = 8; // px a dot's name keeps from the window's edges
const LAND_FADE_MS = 500;
const EARTH_FADE_MS = 600; // the real Earth fading in over the drawn one
const LINES_FADE_MS = 600; // the lines fading in when the feed arrives
const DIM_MS = 220; // how quickly the other events' lines step back when one is picked (and forward again)
const DIM_TO = 0.32; // how much of them still shows while one is picked
const GLIDE_MS = 250; // how quickly a flung globe slows down
const SPIN_FRAME_MS = 30; // the slow turn on its own is drawn about 30 times a second
const ZOOM_EASE_MS = 85; // a zoom from the wheel, the buttons or a click eases to where it goes about this quickly
const ENGAGED_MS = 10000; // after a click, a drag or a zoom, the wheel zooms the Earth this long
const TOUCH_NOTE_MS = 2600; // how long the note about two fingers stays
const SLOP = { mouse: 4, pen: 6, touch: 8 }; // pixels a press may move and still be a click
const UKRAINE = "war-ukraine";
const ICE = ["010", "304"]; // Antarctica and Greenland (Natural Earth's ids), white on the drawn Earth
const DEBUG = typeof window !== "undefined" && /[?&]earth-debug=1(&|$)/.test(window.location.search);
// The lines' arrowheads and the countries' marks, in px.
const HEAD = { length: 6, width: 5.2, gap: 3.6 };
const MARK_R = 2.4;
const SHORT_LINE = 18; // px: a line shorter than this on the screen carries no arrowhead
const LONG_TITLE = 34; // characters: a longer event name is set a step smaller beside the globe (earth.css)

// The colours, read from earth.css (--earth-*); these stand in only if the
// stylesheet has not arrived.
const COLOURS = {
  sea: "#3f6489",
  "sea-deep": "#2a4868",
  land: "#74714f",
  ice: "#eceff0",
  lit: "rgba(255, 255, 255, 0.14)",
  shade: "rgba(10, 18, 30, 0.3)",
  rim: "rgba(205, 220, 238, 0.45)",
  grid: "rgba(255, 255, 255, 0.13)",
  "soil-wash": "rgba(30, 20, 12, 0.26)",
  "soil-line": "rgba(24, 16, 10, 0.8)",
  tint: "rgba(255, 210, 166, 0.3)",
  "tint-line": "rgba(255, 233, 210, 0.95)",
  "tint-halo": "rgba(36, 22, 12, 0.75)",
  line: "#ffe3c2",
  "line-halo": "rgba(30, 19, 11, 0.75)",
  "net-line": "rgba(255, 227, 194, 0.6)",
  "net-halo": "rgba(30, 19, 11, 0.3)",
  "net-head": "rgba(255, 233, 210, 0.92)",
  "net-mark": "#fff2e2",
  "net-mark-edge": "rgba(30, 19, 11, 0.62)",
  coast: "#ff00ff", // the alignment check's coasts only
  ring: "#fbfbf9",
};

// Each colour is passed through the canvas's own reader, which always
// gives it back as "#rrggbb" or "rgba(r, g, b, a)" (the stylesheet may
// arrive with any spelling: the production build writes rgba() as
// #rrggbbaa).
function readColours(el, ctx) {
  const style = getComputedStyle(el);
  const out = {};
  for (const [name, fallback] of Object.entries(COLOURS)) {
    ctx.fillStyle = fallback;
    ctx.fillStyle = style.getPropertyValue(`--earth-${name}`).trim() || fallback;
    out[name] = String(ctx.fillStyle);
  }
  return out;
}

// A colour as the canvas writes it ("#rrggbb" or "rgba(r, g, b, a)") with
// another opacity, for the canvas's soft edges (fading to a clear copy of
// the same colour, never to clear black, which would leave a grey rim).
function withAlpha(colour, alpha) {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(colour);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return colour;
}

// The land, the countries and the black soil: two small files, fetched once
// per visit (a failed fetch is tried again the next time the globe mounts).
let shapesPending = null;
let shapesHeld = null;
function loadShapes() {
  if (shapesHeld) return Promise.resolve(shapesHeld);
  if (!shapesPending) {
    const get = (url) =>
      fetch(url, { headers: { accept: "application/json" } }).then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.json();
      });
    shapesPending = Promise.all([get("/site/world/countries-110m.json"), get("/site/world/black-soil.json")])
      .then(([world, soil]) => {
        const countries = new Map();
        for (const f of feature(world, world.objects.countries).features) if (f.id) countries.set(String(f.id), f);
        const ice = ICE.map((id) => countries.get(id)).filter(Boolean);
        shapesHeld = { land: feature(world, world.objects.land), countries, ice, soil };
        return shapesHeld;
      })
      .catch((error) => {
        shapesPending = null;
        throw error;
      });
  }
  return shapesPending;
}

function useShapes() {
  const [shapes, setShapes] = useState(shapesHeld);
  useEffect(() => {
    if (shapes) return undefined;
    let alive = true;
    loadShapes()
      .then((value) => alive && setShapes(value))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shapes]);
  return shapes;
}

// NASA's picture of the Earth (public/site/world/earth-true-<width>.webp),
// each copy fetched and decoded once per visit, quietly (it waits behind
// the page's words and fonts); a copy that fails is tried again the next
// time the globe asks for it.
const pictures = new Map();
function loadPicture(width) {
  if (!pictures.has(width)) {
    const img = new Image();
    img.decoding = "async";
    if ("fetchPriority" in img) img.fetchPriority = "low";
    img.src = `/site/world/earth-true-${width}.webp`;
    pictures.set(
      width,
      img.decode().then(
        () => img,
        (error) => {
          pictures.delete(width);
          throw error;
        }
      )
    );
  }
  return pictures.get(width);
}

// What the graphics card is given: a bitmap the browser makes off the
// page's own thread where it can, which the card then takes in a few
// milliseconds (an <img> holds the page up to a tenth of a second for the
// 6144 copy); null where it cannot, and the <img> itself is given.
function toBitmap(img) {
  if (typeof createImageBitmap !== "function") return Promise.resolve(null);
  return createImageBitmap(img).catch(() => null);
}

// A phone or a tablet (its pointer is a finger), or a device that says it
// has little memory: never given the 6144 copy (earthMath earthPicture).
function handheld() {
  if (typeof window === "undefined") return true;
  const finger = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const memory = Number(navigator.deviceMemory);
  return finger || (memory > 0 && memory < 4);
}

// Everything the drawing needs, kept outside React so a frame never waits
// for a render.
function makeEngine() {
  return {
    centre: { ...START },
    zoom: 1, // how many times larger than the disc the Earth is drawn (earthMath ZOOM_MIN to ZOOM_MAX)
    zoomGoal: 1, // where a zoom from the wheel, the buttons or a click is going
    zoomAnchor: null, // { place, x, y }: the place kept under that point of the disc while a zoom moves (null: the middle)
    zoomAsked: 1, // the closest zoom a picture has been asked for (a sharper copy as the visitor zooms in)
    speed: 0, // degrees a second, easing towards the slow turn's speed or towards 0
    last: 0,
    drawnAt: 0, // when the last frame was drawn
    raf: 0,
    ctx: null,
    layer: null, // a canvas the overlay's size: every event's lines are drawn there, faded towards the lens's edge, then laid on the overlay
    layerCtx: null,
    layerPath: null,
    fade: null, // the fade's mask for the layer (makeFade), and the sizes it was made for
    fadeFor: "",
    root: null,
    size: 0,
    dpr: 1,
    projection: geoOrthographic().clipAngle(90).precision(0.6),
    path: null,
    colours: COLOURS,
    reduced: false,
    hovering: false,
    listOver: false, // the list lies over the globe
    onScreen: true,
    hidden: false,
    fly: null, // { from: { centre, zoom }, to: { centre, zoom }, start, ms }: a pick or a close on its way
    drag: null, // { id, kind, x, y, from, moved, samples }
    glide: null, // { vx, vy } in pixels a millisecond
    touches: new Map(), // the fingers on the globe: pointerId -> { x, y }
    pinch: null, // { d0, zoom0, place }: two fingers zooming and moving it
    gesture: null, // { zoom0, at }: Safari's own pinch on a trackpad
    listening: false, // the window's pointer listeners are on (a drag or a finger is down)
    swallowClick: false,
    shapes: null,
    shapesAt: 0,
    soil: true, // the black soil is drawn (the legend's switch)
    lines: [], // every event's lines, from the start (earthMath networkLines)
    marks: [], // the countries they reach
    linesAt: 0, // a picked event's lines began to grow
    networkAt: 0, // the lines arrived (they fade in)
    dim: 0, // how far the other events' lines have stepped back (0 to 1)
    headsDrawn: 0, // arrowheads on the screen in the last frame (for the browser checks)
    earth: null, // the real Earth's painter (earthGl.js), or null without WebGL
    earthAllowed: false, // the page has first shown something: the picture may be asked for
    earthWanted: 0, // the width of the copy asked for last
    earthWidth: 0, // the width of the copy on the graphics card
    earthRefused: 0, // the width of a copy the card could not take (none that large is asked for again)
    pending: null, // { width, img, bitmap }: a sharper copy, ready, waiting for the Earth to be still to go on the card
    earthAt: 0, // when the picture first showed (it fades in)
    glAt: null, // the turn, zoom and size the real Earth was last painted for
    glFrames: 0,
    glMs: 0,
    events: [],
    markerEls: new Map(),
    tipSizes: new Map(), // each dot's name: { w, h }, measured once (and when the font arrives)
    tipAt: new Map(), // each dot's name: where it was put last ("right 0"), so only a change is written
    discLeft: 0, // the disc's left edge in the window, and the window's width (for the names)
    viewWidth: 0,
    room: 0, // the component's own width (earth.css --earth-room)
    spots: [],
    selected: null,
    buyers: [],
    highlight: [],
    dirty: true,
    frames: 0,
    paintMs: 0,
    engagedUntil: 0, // the wheel zooms the Earth until then (performance.now())
    namesOff: false, // the dots' names are hidden until the pointer moves (a pick or a close moved the dots under it)
    namesOffAt: null, // where the pointer was then ({ x, y } in the window), or null
    pointer: null, // where the mouse last moved over the globe
    zoomUi: "", // the zoom buttons' last state, so React hears only a change
    onZoomUi: null, // tells React (the buttons) the zoom's state: "11" zoomed in, at the closest
    held: false, // the browser checks' hold on the slow turn
    coasts: false, // the browser checks' coasts over the picture
    onPixels: null, // fits the canvases again for a screen with other pixels (for the browser checks)
    api: null, // the zoom's actions, for the buttons and the browser checks (set up with the loop)
  };
}

// How far the land and the black soil have faded in (0 to 1).
function landShown(g, now) {
  return g.reduced ? 1 : clamp((now - g.shapesAt) / LAND_FADE_MS, 0, 1);
}

// How much of the real Earth shows (0 to 1): nothing until its picture is
// on the graphics card (or ever, without WebGL), then it fades in.
function realShown(g, now) {
  if (!g.earth?.ready) return 0;
  return g.reduced ? 1 : clamp((now - g.earthAt) / EARTH_FADE_MS, 0, 1);
}

// How far the lines have faded in since the feed brought them (0 to 1).
function networkShown(g, now) {
  return g.reduced ? 1 : clamp((now - g.networkAt) / LINES_FADE_MS, 0, 1);
}

// The zoom on the projection: the Earth's radius on the screen, and the
// lens's reach (every shape and line is cut at the disc's edge).
function applyZoom(g) {
  if (!g.size) return;
  g.projection.scale(discRadius(g.size) * g.zoom).clipAngle(lensAngle(g.zoom));
}

// The real Earth (earthGl.js), painted again only when the turn, the zoom
// or the size has changed since it last was.
function paintEarth(g) {
  const earth = g.earth;
  if (!earth?.ready || !g.size) return;
  const at = g.glAt;
  if (at && at.lat === g.centre.lat && at.lng === g.centre.lng && at.zoom === g.zoom && at.size === g.size && at.dpr === g.dpr) return;
  const started = performance.now();
  if (earth.draw(g.centre, g.size, g.dpr, g.zoom)) {
    g.glAt = { lat: g.centre.lat, lng: g.centre.lng, zoom: g.zoom, size: g.size, dpr: g.dpr };
    g.glFrames += 1;
    g.glMs = g.glMs * 0.9 + (performance.now() - started) * 0.1;
  }
}

// The drawn Earth, in natural colours: the sea lit from the upper left,
// the land, the ice of Antarctica and Greenland, light and shade over the
// whole disc and a soft rim. It shows while the picture loads and wherever
// WebGL is missing; `alpha` fades it out as the real Earth fades in. The
// sea, the light and the shade fill the lens; the land and the ice are
// drawn through the zoomed projection, cut at the lens's edge.
function paintDrawnEarth(g, now, alpha) {
  const { ctx, size, path, colours: c } = g;
  const r = Math.max(0, discRadius(size)); // never below 0: the canvas refuses a negative radius
  const cx = size / 2;
  const cy = size / 2;
  // The light comes from the upper left.
  const lx = cx - 0.36 * r;
  const ly = cy - 0.4 * r;
  ctx.globalAlpha = alpha;
  const sea = ctx.createRadialGradient(lx, ly, r * 0.04, cx, cy, r);
  sea.addColorStop(0, c.sea);
  sea.addColorStop(1, c["sea-deep"]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = sea;
  ctx.fill();
  const shapes = g.shapes;
  if (shapes) {
    ctx.globalAlpha = alpha * landShown(g, now);
    ctx.beginPath();
    path(shapes.land);
    ctx.fillStyle = c.land;
    ctx.fill();
    if (shapes.ice.length) {
      ctx.beginPath();
      for (const f of shapes.ice) path(f);
      ctx.fillStyle = c.ice;
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
  }
  // Brighter towards the light, darker towards the far edge.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  const lit = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.95);
  lit.addColorStop(0, c.lit);
  lit.addColorStop(1, withAlpha(c.lit, 0));
  ctx.fillStyle = lit;
  ctx.fill();
  const shade = ctx.createRadialGradient(cx - 0.16 * r, cy - 0.18 * r, r * 0.5, cx - 0.16 * r, cy - 0.18 * r, r * 1.2);
  shade.addColorStop(0, withAlpha(c.shade, 0));
  shade.addColorStop(1, c.shade);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, r - 0.4), 0, 2 * Math.PI);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = c.rim;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// The fade towards the lens's edge for every event's lines (earthMath
// lineFade), as a mask the layer's size, laid over their layer with
// "destination-out": clear in the middle, then as much of them taken away
// as fades towards the edge, and all of it a pixel past the rim (earthMath
// fadeStops). Made again only when the size changes: laying it on costs
// one copy of the canvas, where a gradient drawn every frame would cost
// several times that on a computer that draws without its graphics card.
function makeFade(g) {
  const { size, dpr } = g;
  const mask = g.fade || document.createElement("canvas");
  mask.width = g.layer.width;
  mask.height = g.layer.height;
  const ctx = mask.getContext("2d");
  if (!ctx) {
    g.fade = null;
    return;
  }
  const mid = (size / 2) * dpr;
  const radius = Math.max(0, discRadius(size));
  const fade = ctx.createRadialGradient(mid, mid, 0, mid, mid, Math.max(radius * dpr + dpr, 1e-3));
  for (const [offset, opacity] of fadeStops(radius, dpr)) fade.addColorStop(offset, `rgba(0, 0, 0, ${opacity})`);
  ctx.clearRect(0, 0, mask.width, mask.height);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, mask.width, mask.height);
  g.fade = mask;
  g.fadeFor = `${mask.width} ${size} ${dpr}`;
}

// A filled triangle (an arrowhead from earthMath arrowHead) added to the
// path being built.
function addHead(ctx, head) {
  ctx.moveTo(head[0][0], head[0][1]);
  ctx.lineTo(head[1][0], head[1][1]);
  ctx.lineTo(head[2][0], head[2][1]);
  ctx.closePath();
}

// Every event's lines, from the start: thin and see-through, all in one
// path (so the many of them cost about what one does, and where they cross
// they never darken into knots), each with a small arrowhead at the
// country's end and a small mark on every country they reach. While an
// event is picked they step back (its own lines are drawn again, bold,
// over them). A line or a mark outside the lens is not drawn: d3-geo cuts
// the lines at its edge, and an arrowhead or a mark needs its country
// inside it. They are drawn on a canvas of their own (the layer), then
// faded towards the lens's edge (earthMath lineFade: near the rim, where
// the whole Earth's lines crowd together seen side-on, they would comb
// into a bright fringe), with nothing past the edge (a line's width and
// its round ends would reach over it), and laid on the overlay as
// strongly as they show now.
function paintNetwork(g, now) {
  const { layerCtx: ctx, layerPath: path, projection, colours: c, size, dpr } = g;
  g.headsDrawn = 0;
  if (!g.lines.length || !ctx || !g.layer.width) return;
  const alpha = networkShown(g, now) * (1 - (1 - DIM_TO) * g.dim);
  if (alpha <= 0.01) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, g.layer.width, g.layer.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const l of g.lines) path(l.geo);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = c["net-halo"];
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = c["net-line"];
  ctx.stroke();
  ctx.beginPath();
  for (const l of g.lines) {
    if (lensFacing(g.centre, l.place, g.zoom) < 0.05) continue;
    const end = projection(l.to);
    const start = projection(l.from);
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) < SHORT_LINE) continue;
    const head = arrowHead(end, projection(l.back), HEAD);
    if (!head) continue;
    addHead(ctx, head);
    g.headsDrawn += 1;
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = c["net-halo"];
  ctx.stroke();
  ctx.fillStyle = c["net-head"];
  ctx.fill();
  ctx.beginPath();
  for (const m of g.marks) {
    if (lensFacing(g.centre, m.place, g.zoom) < 0.03) continue;
    const [x, y] = projection([m.place.lng, m.place.lat]);
    ctx.moveTo(x + MARK_R, y);
    ctx.arc(x, y, MARK_R, 0, 2 * Math.PI);
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = c["net-mark-edge"];
  ctx.stroke();
  ctx.fillStyle = c["net-mark"];
  ctx.fill();
  // Whole out to 0.84 of the lens's radius, fainter towards its edge,
  // nothing past it: the fade's mask, laid over them.
  if (g.fadeFor !== `${g.layer.width} ${size} ${dpr}`) makeFade(g);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (g.fade) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(g.fade, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  const main = g.ctx;
  main.save();
  main.setTransform(1, 0, 0, 1, 0, 0);
  main.globalAlpha = alpha;
  main.drawImage(g.layer, 0, 0);
  main.restore();
}

// A picked event's own lines, bold: each grows from the event in turn,
// thicker for a larger share, its arrowhead at the growing end, and the
// country's dot once it is there; light with a thin dark edge, so they
// read over the sea and over the land. Drawn once the flight has arrived,
// and never past the lens's edge (d3-geo cuts a line there, but its width,
// its dark edge and its round end would reach over the rim).
function paintPicked(g, now) {
  if (!g.selected || g.fly || !g.buyers.length) return;
  const { ctx, path, projection, colours: c, size } = g;
  const from = [g.selected.lng, g.selected.lat];
  const since = now - g.linesAt;
  const top = g.buyers[0].share || 1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, Math.max(0, discRadius(size)), 0, 2 * Math.PI);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  g.buyers.forEach((b, i) => {
    const k = lineGrowth(since, i, g.reduced);
    if (k <= 0) return;
    const to = [b.lng, b.lat];
    const way = geoInterpolate(from, to);
    const tip = k >= 1 ? to : way(k);
    const width = 1.2 + 2.6 * clamp(b.share / top, 0, 1);
    ctx.beginPath();
    path({ type: "LineString", coordinates: [from, tip] });
    ctx.lineWidth = width + 3;
    ctx.strokeStyle = c["line-halo"];
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = c.line;
    ctx.stroke();
    if (lensFacing(g.centre, { lng: tip[0], lat: tip[1] }, g.zoom) > 0.04) {
      const head = arrowHead(projection(tip), projection(way(Math.max(0, k - 0.05))), { length: 7 + 1.4 * width, width: 6 + 1.5 * width, gap: k >= 1 ? 5.5 : 0 });
      if (head) {
        ctx.beginPath();
        addHead(ctx, head);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = c["line-halo"];
        ctx.stroke();
        ctx.fillStyle = c.line;
        ctx.fill();
      }
    }
    if (k >= 1 && lensFacing(g.centre, b, g.zoom) > 0.03) {
      const [x, y] = projection(to);
      ctx.beginPath();
      ctx.arc(x, y, 4.8, 0, 2 * Math.PI);
      ctx.fillStyle = c["line-halo"];
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, 2 * Math.PI);
      ctx.fillStyle = c.line;
      ctx.fill();
    }
  });
  ctx.restore();
}

// Everything over the Earth, on the ordinary canvas (with the drawn Earth
// under it until the real one has faded in).
function paint(g, now) {
  const { ctx, size, dpr, projection, path, colours: c } = g;
  projection.rotate(rotationFor(g.centre));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const real = realShown(g, now);
  if (real < 1) paintDrawnEarth(g, now, 1 - real);

  // The grid of latitude and longitude, every 10 degrees.
  ctx.beginPath();
  path(GRATICULE);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = c.grid;
  ctx.stroke();

  const shapes = g.shapes;
  if (shapes) {
    ctx.globalAlpha = landShown(g, now);
    // A shape that runs over the edge of the disc is closed along the edge
    // (d3-geo cuts it at the lens's edge); kept a little inside the edge,
    // its outline never draws a dark line along the rim.
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, Math.max(0, discRadius(size) - 1.5), 0, 2 * Math.PI);
    ctx.clip();
    // The black soil: a light wash with a fine dark outline, so the Earth's
    // own colours still show through.
    if (g.soil) {
      ctx.beginPath();
      path(shapes.soil);
      ctx.fillStyle = c["soil-wash"];
      ctx.fill("evenodd");
      ctx.lineWidth = 0.8;
      ctx.lineJoin = "round";
      ctx.strokeStyle = c["soil-line"];
      ctx.stroke();
    }
    // The countries a picked event's lines go to: a warm see-through tint,
    // outlined in a light line over a thin dark one (it reads on the sea
    // and the land).
    if (g.highlight.length) {
      ctx.beginPath();
      for (const f of g.highlight) path(f);
      ctx.fillStyle = c.tint;
      ctx.fill();
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = c["tint-halo"];
      ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = c["tint-line"];
      ctx.stroke();
    }
    // The browser checks' coasts, to see that they sit on the picture's.
    if (g.coasts) {
      ctx.beginPath();
      path(shapes.land);
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.coast;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // The lines: every event's, quiet, then a picked event's own, bold.
  paintNetwork(g, now);
  paintPicked(g, now);
}

// Moves each dot to its place for the current turn and zoom, fading it
// near the edge of the lens; notes where each one is for clicks between
// two dots.
function placeMarkers(g) {
  const spots = [];
  const ready = g.size > 0;
  // The part of the disc's width that is on the screen, a little in from
  // the window's edges: a dot's name stays inside it.
  const lo = TIP_MARGIN - g.discLeft;
  const hi = (g.viewWidth || Infinity) - TIP_MARGIN - g.discLeft;
  for (const e of g.events) {
    const el = g.markerEls.get(e.id);
    if (!el) continue;
    const alpha = ready ? markerOpacity(lensFacing(g.centre, e, g.zoom)) : 0;
    const shown = alpha > 0.04;
    const [x, y] = ready ? g.projection([e.lng, e.lat]) : [0, 0];
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.style.opacity = shown ? alpha.toFixed(2) : "0";
    el.style.visibility = shown ? "visible" : "hidden";
    // Its name: to the right of it, else to the left, else under it (over
    // it near the foot), inside the globe and the window (earthMath tipPlace).
    const tip = g.tipSizes.get(e.id);
    if (shown && tip && tip.w) {
      const at = tipPlace(x, y, tip.w, tip.h, { size: g.size, lo, hi });
      const key = `${at.side} ${at.shift} ${at.lift}`;
      if (g.tipAt.get(e.id) !== key) {
        g.tipAt.set(e.id, key);
        el.dataset.tip = at.side;
        el.style.setProperty("--tip-shift", `${at.shift}px`);
        el.style.setProperty("--tip-lift", `${at.lift}px`);
      }
    }
    spots.push({ id: e.id, x, y, shown });
  }
  g.spots = spots;
}

// The zoom buttons follow where the zoom is going ("11": zoomed in, and at
// the closest); React hears only a change.
function syncZoomUi(g) {
  const target = g.fly ? g.fly.to.zoom : g.zoomGoal;
  const ui = `${target > ZOOM_MIN ? 1 : 0}${target >= ZOOM_MAX - 1e-6 ? 1 : 0}`;
  if (ui === g.zoomUi) return;
  g.zoomUi = ui;
  g.onZoomUi?.(ui);
}

// Calls `callback` once the page has first shown something (the browser's
// first contentful paint), so NASA's picture never holds up the page's
// words; where the browser does not report that paint, after its first
// two frames. Gives back a function that cancels it.
function afterFirstPaint(callback) {
  let done = false;
  let observer = null;
  let frame = 0;
  let timer = 0;
  const go = () => {
    if (done) return;
    done = true;
    observer?.disconnect();
    timer = window.setTimeout(callback, 0);
  };
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes("paint")) {
      observer = new PerformanceObserver((list) => {
        if (list.getEntriesByName("first-contentful-paint").length) go();
      });
      observer.observe({ type: "paint", buffered: true });
    }
  } catch {
    observer = null;
  }
  if (!observer) frame = requestAnimationFrame(() => (frame = requestAnimationFrame(go)));
  return () => {
    done = true;
    observer?.disconnect();
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}

// One frame: the real Earth (when the view changed), what goes over it,
// and the dots.
function drawFrame(g, now) {
  const started = performance.now();
  g.projection.rotate(rotationFor(g.centre));
  paintEarth(g);
  paint(g, now);
  placeMarkers(g);
  syncZoomUi(g);
  g.dirty = false;
  g.frames += 1;
  g.paintMs = g.paintMs * 0.9 + (performance.now() - started) * 0.1;
}

// Whether the place beside the globe that the page keeps for the card is
// on the screen now (the About page hides it at 900 px and under).
function sideShown(ref) {
  const el = ref?.current;
  if (!el || !el.isConnected) return null;
  return getComputedStyle(el).display !== "none" ? el : null;
}

// Whether an element is in the window now, in part at least (one the page
// does not show has no box, so it is not).
function inWindow(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  const view = window.innerHeight || document.documentElement.clientHeight || 0;
  return r.height > 0 && r.bottom > 0 && r.top < view;
}

export default function EarthGlobe({ className = "", side = null }) {
  const world = useWorldData();
  const shapes = useShapes();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");
  const engine = useRef(null);
  if (!engine.current) engine.current = makeEngine();
  const g = engine.current;

  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const discRef = useRef(null);
  const glRef = useRef(null);
  const canvasRef = useRef(null);
  const zoomBarRef = useRef(null);
  const cardRef = useRef(null);
  const cardTitleRef = useRef(null);
  const toggleRef = useRef(null);
  const listRef = useRef(null);
  const openerRef = useRef(null); // the list button that opened the card, for Esc
  const focusCard = useRef(false);
  const focusList = useRef(false);
  const shownFor = useRef(null); // the event whose card was last put in the window and given the focus
  const shownAt = useRef(null); // where that card was: "side" or "under"
  const cardFocused = useRef(false); // the focus is in the card (it keeps it when the card moves between its two places)
  const openedVia = useRef("pointer"); // how the open card was chosen: "pointer" (on the globe) or "list"
  const scrolledDown = useRef(false); // the page scrolled down to show a card chosen on the globe
  const scrolledFromList = useRef(false); // the page scrolled up from the list under the globe to show a card chosen there
  const seenCard = useRef(true); // the globe or the open card was in the window when the page last scrolled
  const kickRef = useRef(() => {});
  const sideRef = useRef(side);
  sideRef.current = side;
  const placeRef = useRef(null); // where the open card is, for the browser checks

  const [width, setWidth] = useState(0);
  const [bar, setBar] = useState("corner"); // where the zoom buttons are: the globe's corner, beside it or under it (earthMath zoomBarPlace)
  const barRef = useRef(bar); // the same, for the browser checks
  barRef.current = bar;
  const [shared, setShared] = useState(true); // the page has something beside the globe (measured in fit)
  const [sideHost, setSideHost] = useState(null); // the place beside the globe for the card, while it is shown
  const [selectedId, setSelectedId] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [hint, setHint] = useState(true);
  const [soilOn, setSoilOn] = useState(true);
  const [zoomUi, setZoomUi] = useState("00"); // zoomed in, at the closest (syncZoomUi)
  const [engaged, setEngaged] = useState(false); // the wheel zooms the Earth (the quiet line shows)
  const [touchNote, setTouchNote] = useState(false); // the note about two fingers shows
  g.onZoomUi = setZoomUi;

  const ids = useId();
  const titleId = `${ids}-title`;
  const listId = `${ids}-list`;
  const cardTitleId = `${ids}-card`;

  const events = useMemo(() => earthEvents(world.events), [world.events]);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const now = world.updated || Date.now();
  const commonYear = tradeYear(world.trade);
  const selected = selectedId ? byId.get(selectedId) || null : null;
  const buyers = useMemo(() => (selected ? buyersOf(selected, world.trade, world.countries) : []), [selected, world.trade, world.countries]);
  const words = selected ? cardWords(selected, { buyers, now, commonYear }) : null;
  // The card: beside the globe in the place the page keeps for it while
  // that place is shown, else under the globe. Under a globe 520 px or
  // wider it has two columns.
  const place = selected ? (sideHost ? "side" : "under") : null;
  placeRef.current = place;
  const wide = width >= WIDE_GLOBE;
  // The list lies over the globe on a globe 480 px or wider, and on any
  // globe with the page's words beside it (so they never move); under a
  // small globe with the page's width to itself it sits under it.
  const overlay = width >= OVER_GLOBE || shared;
  const zoomed = zoomUi[0] === "1";
  const atClosest = zoomUi[1] === "1";

  // The lines, from the feed: every event's, to every country whose food
  // depends on its land (they fade in when they arrive).
  useEffect(() => {
    const lines = networkLines(events, (e) => buyersOf(e, world.trade, world.countries));
    for (const l of lines) l.geo = { type: "LineString", coordinates: [l.from, l.to] };
    g.lines = lines;
    g.marks = networkMarks(lines);
    g.networkAt = performance.now();
    g.dirty = true;
    kickRef.current();
  }, [events, world.trade, world.countries]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- The loop -----
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const glCanvas = glRef.current;
    const disc = discRef.current;
    const box = boxRef.current;
    const root = rootRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !disc || !box || !root || !ctx) return undefined;
    g.ctx = ctx;
    g.path = geoPath(g.projection, ctx);
    g.colours = readColours(root, ctx);
    g.root = root;
    // Every event's lines are drawn here first (paintNetwork), at the
    // overlay's size (kept with the engine, so the loop set up again on
    // the same canvases keeps it).
    if (!g.layer) {
      g.layer = document.createElement("canvas");
      g.layer.width = 0;
      g.layer.height = 0;
      g.layerCtx = g.layer.getContext("2d");
      g.layerPath = g.layerCtx ? geoPath(g.projection, g.layerCtx) : null;
    }
    const layer = g.layer;

    const frame = (t) => {
      g.raf = 0;
      if (!g.ctx || !g.size) return;
      // A new pixel ratio that no event reported (a browser's own emulation
      // can change it silently) is noticed here: fitted again, which draws
      // and asks for the next frame (a box too small to draw in waits for
      // its next resize instead).
      if (Math.min(window.devicePixelRatio || 1, MAX_DPR) !== g.dpr) {
        fit();
        return;
      }
      const dt = g.last ? Math.min(64, Math.max(0, t - g.last)) : 16;
      g.last = t;
      let moving = false;
      // The slow turn's speed eases up and down over about a third of a
      // second. It rests while anything else moves the Earth, and while it
      // is zoomed in.
      const zoomedIn = g.zoom > ZOOM_MIN || g.zoomGoal > ZOOM_MIN;
      const resting = g.reduced || g.hovering || g.selected || g.listOver || g.drag || g.fly || g.glide || g.pinch || zoomedIn || g.held;
      const goal = resting ? 0 : SPIN_DEG_PER_S;
      if (g.speed !== goal) {
        g.speed += (goal - g.speed) * (1 - Math.exp(-dt / 320));
        if (Math.abs(goal - g.speed) < 0.02) g.speed = goal;
        moving = true;
      }
      if (g.fly) {
        // A pick or a close on its way: the turn and the zoom together.
        const p = clamp((t - g.fly.start) / g.fly.ms, 0, 1);
        const at = flyAt(g.fly.from, g.fly.to, ease(p));
        g.centre = p >= 1 ? { ...g.fly.to.centre } : at.centre;
        g.zoom = p >= 1 ? g.fly.to.zoom : at.zoom;
        g.zoomGoal = g.fly.to.zoom;
        applyZoom(g);
        if (p >= 1) {
          // Arrived: it rests exactly there (no drift left over from the
          // slow turn), and a picked event's lines begin to grow.
          g.fly = null;
          g.speed = 0;
          g.linesAt = t;
        }
        moving = true;
      } else {
        if (g.zoom !== g.zoomGoal && !g.pinch) {
          // A zoom from the wheel, the buttons or a click: evenly in the
          // zoom's own scale, keeping its place under its point.
          const a = Math.log(g.zoom);
          const b = Math.log(g.zoomGoal);
          let next = g.reduced ? g.zoomGoal : Math.exp(a + (b - a) * (1 - Math.exp(-dt / ZOOM_EASE_MS)));
          if (Math.abs(next - g.zoomGoal) < 0.002 * g.zoomGoal) next = g.zoomGoal;
          g.zoom = next;
          if (g.zoomAnchor) g.centre = zoomAround(g.zoomAnchor.place, g.zoomAnchor, g.zoom, g.size);
          if (g.zoom === g.zoomGoal) g.zoomAnchor = null;
          applyZoom(g);
          moving = true;
        }
        if (g.glide && !g.drag) {
          g.centre = dragTo(g.centre, g.glide.vx * dt, g.glide.vy * dt, (g.size / 2) * g.zoom, dragFollow(g.zoom));
          const k = Math.exp(-dt / GLIDE_MS);
          g.glide.vx *= k;
          g.glide.vy *= k;
          if (Math.hypot(g.glide.vx, g.glide.vy) < 0.01) g.glide = null;
          moving = true;
        } else if (!g.drag && !g.pinch && g.speed > 0) {
          g.centre = spin(g.centre, dt, g.speed);
          moving = true;
        }
      }
      // A picked event's other lines step back, and come forward again.
      const dimGoal = g.selected ? 1 : 0;
      if (g.dim !== dimGoal) {
        g.dim = g.reduced ? dimGoal : clamp(g.dim + (dimGoal > g.dim ? 1 : -1) * (dt / DIM_MS), 0, 1);
        moving = true;
      }
      // A sharper picture as the visitor zooms in (asked for as soon as a
      // flight or a zoom sets off, so it can arrive on the way), put on
      // the card in a still moment: nothing the visitor moves is moving
      // and a picked event's lines have grown (a larger copy holds the
      // page up for up to about 0.1 s, which would show as a stutter in a
      // flight, a drag or the growing lines). The first copy goes on at
      // once.
      const reach = Math.max(g.zoom, g.fly ? g.fly.to.zoom : g.zoomGoal);
      if (reach > g.zoomAsked * 1.15) {
        g.zoomAsked = reach;
        askForPicture();
      }
      const growing = !!g.selected && !g.fly && !linesDone(t - g.linesAt, g.buyers.length, g.reduced);
      const still = !g.fly && !g.drag?.moved && !g.pinch && !g.glide && g.zoom === g.zoomGoal && !growing;
      if (g.pending && (still || !g.earthWidth)) putPicture();
      const fading =
        !g.reduced &&
        ((!!g.shapes && t - g.shapesAt < LAND_FADE_MS + 32) || (!!g.earth?.ready && t - g.earthAt < EARTH_FADE_MS + 32) || (g.lines.length > 0 && t - g.networkAt < LINES_FADE_MS + 32));
      // The slow turn alone moves less than a pixel a frame: it is drawn
      // 30 times a second (the turn still runs on the clock), everything
      // else at the screen's own rate.
      const spinOnly = moving && !g.fly && !g.glide && !g.drag && !g.pinch && g.zoom === g.zoomGoal && !growing && !fading && !g.dirty && g.speed === goal && g.dim === dimGoal;
      if (spinOnly && t - g.drawnAt < SPIN_FRAME_MS) {
        if (g.onScreen && !g.hidden) g.raf = requestAnimationFrame(frame);
        return;
      }
      if (moving || growing || fading || g.dirty) {
        g.drawnAt = t;
        drawFrame(g, t);
      }
      if ((moving || growing || fading) && g.onScreen && !g.hidden) g.raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (g.raf || !g.onScreen || g.hidden || !g.ctx) return;
      g.last = 0;
      g.raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;
    const drawNow = () => {
      if (!g.size) return;
      drawFrame(g, performance.now());
    };
    const redraw = () => {
      g.dirty = true;
      kick();
    };

    // The real Earth: a WebGL painter on the canvas underneath, or none
    // (no WebGL 2): then the drawn Earth stays. While the browser has taken
    // WebGL away, its canvas is hidden (earth.css), so the browser's grey
    // "lost" sign never shows over the drawn Earth.
    g.earth = glCanvas
      ? createEarthPainter(glCanvas, {
          onLost: () => {
            root.toggleAttribute("data-gl-lost", true);
            g.glAt = null;
            redraw();
          },
          onRestored: () => {
            root.toggleAttribute("data-gl-lost", false);
            g.glAt = null;
            g.earthAt = performance.now();
            redraw();
          },
        })
      : null;

    // NASA's picture, in the copy this globe needs at the closest zoom the
    // visitor has reached (earthMath earthPicture: the 6144 copy only
    // zoomed in on a large globe on a sharp screen, never on a phone or a
    // tablet, never past what the card takes, never for a visitor saving
    // data); never a smaller one than it already has (a globe made larger
    // asks again), nor one as large as a copy the card could not take.
    const askForPicture = () => {
      const earth = g.earth;
      if (!earth || !g.earthAllowed || !g.size) return;
      const saveData = typeof navigator !== "undefined" && navigator.connection?.saveData === true;
      const maxTexture = g.earthRefused ? Math.min(earth.maxTexture, g.earthRefused - 1) : earth.maxTexture;
      const wanted = earthPicture(g.size, g.dpr, { maxTexture, saveData, zoom: g.zoomAsked, handheld: handheld() });
      if (!wanted || wanted <= g.earthWanted) return;
      g.earthWanted = wanted;
      loadPicture(wanted)
        .then((img) => toBitmap(img).then((bitmap) => ({ img, bitmap })))
        .then(
          ({ img, bitmap }) => {
            if (g.earth !== earth || wanted < g.earthWidth || (g.pending && g.pending.width > wanted)) {
              bitmap?.close?.();
              return;
            }
            g.pending?.bitmap?.close?.();
            g.pending = { width: wanted, img, bitmap };
            redraw(); // the next frame puts it on the card (in a still moment)
          },
          () => {
            if (g.earthWanted === wanted) g.earthWanted = g.earthWidth;
          }
        );
    };
    // A copy that is ready goes on the card. The first one fades in over
    // the drawn Earth; a larger one simply takes its place, as the old one
    // stays on the card until the new one is whole there (earthGl.js), so
    // the Earth never blinks. One the card cannot take (too little memory)
    // leaves the old one, and none that large is asked for again.
    const putPicture = () => {
      const p = g.pending;
      const earth = g.earth;
      g.pending = null;
      if (!p || !earth || p.width < g.earthWidth) {
        p?.bitmap?.close?.();
        return;
      }
      const shown = earth.setPicture(p.bitmap || p.img, { restore: p.img });
      p.bitmap?.close?.(); // the card has its own copy now (and the <img> stays for a lost context)
      if (shown || earth.lost) {
        if (shown && !g.earthWidth) g.earthAt = performance.now();
        g.earthWidth = p.width;
        g.glAt = null;
        g.dirty = true;
        return;
      }
      g.earthRefused = p.width;
      g.earthWanted = g.earthWidth;
    };

    // The box: both canvases match it (sharp on high-density screens). A
    // box too small to draw in is left alone: a screenshot tool shrinks the
    // window to a pixel or two for a moment, and the globe keeps its size.
    // Whether the page has something beside the globe is measured here too,
    // whether the place it keeps for the card is shown, and where the disc
    // sits in the window (for the dots' names).
    const fit = () => {
      const rect = disc.getBoundingClientRect();
      const w = Math.round(rect.width);
      if (!w || w < MIN_BOX) return;
      const view = document.documentElement.clientWidth || window.innerWidth || 0;
      g.discLeft = rect.left;
      g.viewWidth = view;
      const room = Math.round(root.getBoundingClientRect().width);
      setShared(view > 0 && room < SHARED_BELOW * view);
      setSideHost(sideShown(sideRef.current));
      // The component's own width: a card or list on the page under a
      // small globe may use it (up to 560 px, earth.css), so a phone on its
      // side reads them in long lines rather than a narrow column.
      if (room !== g.room) {
        g.room = room;
        root.style.setProperty("--earth-room", `${room}px`);
      }
      // The zoom buttons: in the globe's corner, or beside or under a
      // globe too small for them there, never on the disc.
      const button = zoomBarRef.current?.querySelector(".earth-zoom-btn")?.offsetWidth || 36;
      setBar(zoomBarPlace(w, room, { button }));
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (layer.width !== canvas.width || layer.height !== canvas.height) {
        layer.width = canvas.width;
        layer.height = canvas.height;
      }
      if (w === g.size && dpr === g.dpr) return;
      g.size = w;
      g.dpr = dpr;
      for (const c of [canvas, glCanvas, layer]) {
        if (!c) continue;
        c.width = Math.round(w * dpr);
        c.height = Math.round(w * dpr);
      }
      g.projection.translate([w / 2, w / 2]);
      applyZoom(g);
      g.glAt = null;
      setWidth(w);
      drawNow(); // a resized canvas is blank until it is drawn again
      kick();
      askForPicture();
    };
    fit();
    // The box's size is watched in the screen's own pixels where the
    // browser can (so a new pixel ratio is noticed too, however it comes),
    // else in CSS pixels.
    const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    try {
      sizes?.observe(disc, { box: "device-pixel-content-box" });
    } catch {
      sizes?.observe(disc);
    }
    window.addEventListener("resize", fit);
    // A window dragged to a screen with other pixels (a Retina screen) keeps
    // its size in CSS pixels, so the resize event does not notice: a query
    // for this screen's pixels says when they change (and, where the browser
    // can, the watch above in the screen's own pixels), then the canvases
    // are fitted again (and a sharper picture asked for) and the query set
    // for the new screen.
    let pixels = null;
    const onPixels = () => {
      fit();
      watchPixels();
    };
    const watchPixels = () => {
      pixels?.removeEventListener?.("change", onPixels);
      pixels = typeof window.matchMedia === "function" ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
      pixels?.addEventListener?.("change", onPixels);
    };
    watchPixels();
    g.onPixels = onPixels; // for the browser checks (?earth-debug=1)

    // ---- Engaged: the wheel zooms the Earth for a while ----
    // After a click, a drag or a zoom on the globe the plain wheel zooms it
    // for the next 10 s (and the quiet line says so); Esc, a press
    // anywhere else, the pointer leaving the globe, the globe leaving the
    // screen and a scroll down on the whole Earth give it back to the page.
    let engageTimer = 0;
    const disengage = () => {
      window.clearTimeout(engageTimer);
      engageTimer = 0;
      if (!g.engagedUntil) return;
      g.engagedUntil = 0;
      setEngaged(false);
    };
    const engage = () => {
      g.engagedUntil = performance.now() + ENGAGED_MS;
      window.clearTimeout(engageTimer);
      engageTimer = window.setTimeout(disengage, ENGAGED_MS);
      setEngaged(true);
    };

    // ---- Zooming ----
    // A zoom to `goal` (kept within the limits), easing there; with `at`
    // ({ x, y } px in the disc) the place under that point stays under it,
    // else the middle stays. A flight on its way stops where it is.
    const zoomTo = (goal, at = null) => {
      if (!g.size) return;
      if (g.fly) {
        g.fly = null;
        g.linesAt = performance.now();
      }
      g.glide = null;
      const target = clampZoom(goal);
      const place = at ? placeAt(g.centre, g.size, g.zoom, at) : null;
      g.zoomAnchor = place ? { place, x: at.x, y: at.y } : null;
      g.zoomGoal = target;
      if (g.reduced) {
        g.zoom = target;
        if (g.zoomAnchor) g.centre = zoomAround(place, at, target, g.size);
        g.zoomAnchor = null;
        applyZoom(g);
      }
      syncZoomUi(g);
      g.dirty = true;
      kick();
    };
    // The dots' names: a pick or a close moves the dots under a pointer
    // that stays still, and the browser goes on naming the dot that was
    // under it (its :hover is only looked at again when the pointer
    // moves), so its name would hang where the picked event's lines
    // begin. The names are hidden from the flight's start until the
    // pointer moves again (earth.css [data-names-off]).
    const namesOff = (on) => {
      if (g.namesOff === on) return;
      g.namesOff = on;
      g.namesOffAt = on ? g.pointer : null;
      root.toggleAttribute("data-names-off", on);
    };
    // The way to a view ({ centre, zoom }): a flight of about 0.9 s (at
    // once with reduced motion).
    const flyTo = (centre, zoom) => {
      const to = { centre: { lat: centre.lat, lng: normLng(centre.lng) }, zoom: clampZoom(zoom) };
      const from = { centre: { ...g.centre }, zoom: g.zoom };
      g.glide = null;
      g.zoomAnchor = null;
      g.zoomGoal = to.zoom;
      namesOff(true);
      if (g.reduced || (arcDegrees(from.centre, to.centre) < 0.05 && Math.abs(from.zoom - to.zoom) < 0.01)) {
        g.fly = null;
        g.centre = to.centre;
        g.zoom = to.zoom;
        g.speed = 0;
        g.linesAt = performance.now();
        applyZoom(g);
      } else {
        g.fly = { from, to, start: performance.now(), ms: flyMs(from, to) };
      }
      syncZoomUi(g);
      g.dirty = true;
      kick();
    };
    g.api = { zoomTo, flyTo, engage, disengage };

    // The wheel over the globe (or its buttons). A pinch on a trackpad
    // (ctrlKey) always zooms, and is never the page's, even at a limit (the
    // browser would zoom the whole page). A plain scroll zooms only while
    // the globe is engaged and there is room to zoom that way (earthMath
    // wheelRoom); otherwise the page scrolls, and a scroll down on the
    // whole Earth gives the wheel back to the page at once. Only a scroll
    // that zooms keeps the wheel the Earth's for another 10 s.
    const pointIn = (event) => {
      const rect = disc.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      return Math.hypot(at.x - rect.width / 2, at.y - rect.height / 2) <= discRadius(g.size) ? at : null;
    };
    const onWheel = (event) => {
      if (!g.size || g.listOver) return;
      if (!disc.contains(event.target) && !zoomBarRef.current?.contains(event.target)) return;
      const pinch = event.ctrlKey;
      if (!pinch && performance.now() > g.engagedUntil) return;
      if (pinch) event.preventDefault();
      const from = g.fly ? g.zoom : g.zoomGoal;
      const factor = wheelZoomFactor(event.deltaY, { ctrlKey: pinch, deltaMode: event.deltaMode });
      const room = wheelRoom(from, factor);
      if (room === "zoom") {
        event.preventDefault();
        zoomTo(from * factor, pointIn(event));
        engage();
        return;
      }
      if (pinch) return;
      if (room === "fully-out") disengage();
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    // Safari's own pinch on a trackpad (it sends no wheel for it). On a
    // phone or a tablet the fingers' own pointers zoom the Earth, so these
    // only keep the browser from zooming the page.
    const onGesture = (event) => {
      event.preventDefault();
      if (g.touches.size || g.listOver) return;
      if (event.type === "gesturestart") {
        g.gesture = { zoom0: g.zoomGoal, at: Number.isFinite(event.clientX) ? pointIn(event) : null };
        return;
      }
      if (event.type === "gestureend") {
        g.gesture = null;
        engage();
        return;
      }
      if (g.gesture && Number.isFinite(event.scale)) zoomTo(g.gesture.zoom0 * event.scale, g.gesture.at);
    };
    const gestures = typeof window !== "undefined" && "ongesturestart" in window ? ["gesturestart", "gesturechange", "gestureend"] : [];
    for (const type of gestures) box.addEventListener(type, onGesture, { passive: false });
    // A press anywhere else on the page gives the wheel back to it.
    const onPagePress = (event) => {
      if (g.engagedUntil && !box.contains(event.target)) disengage();
    };
    document.addEventListener("pointerdown", onPagePress, true);
    // And so does the pointer leaving the globe (not in the middle of a drag).
    const onBoxLeave = (event) => {
      if (event.pointerType === "mouse" && !g.drag) disengage();
    };
    box.addEventListener("pointerleave", onBoxLeave);

    // Off the screen or in a hidden tab, nothing is drawn (and the wheel is
    // the page's again).
    const seen =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[entries.length - 1];
              g.onScreen = entry.isIntersecting;
              root.toggleAttribute("data-offscreen", !g.onScreen);
              if (g.onScreen) kick();
              else disengage();
            },
            { rootMargin: "64px" }
          )
        : null;
    seen?.observe(root);
    const onVisibility = () => {
      g.hidden = document.hidden;
      if (!g.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // The pointer: resting on the globe pauses the turn; a press that moves
    // a few pixels becomes a drag (and the click after it is swallowed);
    // two fingers zoom and move it.
    const inside = (e) => {
      const rect = disc.getBoundingClientRect();
      g.discLeft = rect.left; // kept fresh for the dots' names
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      return Math.hypot(x, y) <= rect.width / 2 + 4;
    };
    const onHover = (e) => {
      if (e.pointerType !== "mouse" || g.drag) return;
      const was = g.namesOffAt;
      g.pointer = { x: e.clientX, y: e.clientY };
      if (g.namesOff && (!was || Math.hypot(e.clientX - was.x, e.clientY - was.y) >= 1)) namesOff(false);
      const over = inside(e);
      if (over !== g.hovering) {
        g.hovering = over;
        kick();
      }
    };
    const onLeave = (e) => {
      if (e.pointerType !== "mouse" || g.drag) return;
      g.hovering = false;
      kick();
    };
    const listen = () => {
      if (g.listening) return;
      g.listening = true;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };
    const stopListening = () => {
      g.listening = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const swallowNextClick = () => {
      g.swallowClick = true;
      window.setTimeout(() => {
        g.swallowClick = false;
      }, 0);
    };
    // Where the two fingers are: their middle in the disc, and how far apart.
    const fingers = () => {
      const [a, b] = [...g.touches.values()];
      const rect = disc.getBoundingClientRect();
      return { mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    const startPinch = () => {
      if (g.drag) g.drag = null;
      if (g.fly) {
        g.fly = null;
        g.linesAt = performance.now();
      }
      g.glide = null;
      g.zoomAnchor = null;
      g.zoomGoal = g.zoom;
      const { mid, d } = fingers();
      g.pinch = { d0: Math.max(1, d), zoom0: g.zoom, place: placeAt(g.centre, g.size, g.zoom, mid) };
      root.toggleAttribute("data-dragging", true);
      kick();
    };
    const movePinch = () => {
      const { mid, d } = fingers();
      const zoom = pinchZoom(g.pinch.zoom0, g.pinch.d0, d);
      g.zoom = zoom;
      g.zoomGoal = zoom;
      applyZoom(g);
      if (g.pinch.place) g.centre = zoomAround(g.pinch.place, mid, zoom, g.size);
      g.dirty = true;
      kick();
    };
    const endPinch = () => {
      g.pinch = null;
      root.toggleAttribute("data-dragging", false);
      g.hovering = false;
      swallowNextClick();
      engage();
      kick();
    };
    const onDown = (e) => {
      if (e.pointerType === "touch") {
        g.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        listen();
        if (g.touches.size === 2 && !g.listOver) {
          startPinch();
          return;
        }
        if (g.touches.size > 1 || g.pinch) return;
      }
      if (e.button !== 0 || !e.isPrimary || g.drag) return;
      // A mouse press never starts a text selection or moves the focus here.
      if (e.pointerType === "mouse") e.preventDefault();
      g.swallowClick = false;
      g.glide = null;
      // Where the press is on the disc, and the place under it: zoomed in,
      // that place stays under the pointer while it drags (earthMath dragView).
      const rect = disc.getBoundingClientRect();
      const grab = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      grab.place = placeAt(g.centre, g.size, g.zoom, grab);
      g.drag = { id: e.pointerId, kind: e.pointerType || "mouse", x: e.clientX, y: e.clientY, from: g.centre, grab, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
      listen();
    };
    const onMove = (e) => {
      if (e.pointerType === "touch" && g.touches.has(e.pointerId)) {
        g.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (g.pinch) {
          if (g.touches.size >= 2) movePinch();
          return;
        }
      }
      const d = g.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved) {
        // A finger's drag begins only across: up and down is the page's
        // (the browser scrolls it and cancels this press).
        if ((d.kind === "touch" ? Math.abs(dx) : Math.hypot(dx, dy)) < (SLOP[d.kind] ?? 4)) return;
        d.moved = true;
        if (g.fly) {
          // A drag takes over from a flight on its way (a picked event's
          // lines grow from here).
          g.fly = null;
          g.linesAt = performance.now();
        }
        g.zoomAnchor = null;
        g.zoomGoal = g.zoom;
        root.toggleAttribute("data-dragging", true);
        engage();
      }
      // A finger turns it sideways only: up and down belongs to the page.
      // Zoomed in, the place under the pointer stays under it.
      g.centre = dragView(d.from, d.grab, dx, d.kind === "touch" ? 0 : dy, g.size, g.zoom);
      d.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (d.samples.length > 8) d.samples.shift();
      g.dirty = true;
      kick();
    };
    const lifted = (e) => {
      // A finger lifted: two fingers that were zooming stop (the other
      // finger moves nothing until it lifts too).
      g.touches.delete(e.pointerId);
      if (g.pinch && g.touches.size < 2) endPinch();
    };
    const onUp = (e) => {
      if (e.pointerType === "touch") lifted(e);
      const d = g.drag;
      if (d && e.pointerId === d.id) {
        g.drag = null;
        root.toggleAttribute("data-dragging", false);
        if (d.moved) {
          swallowNextClick();
          // Let it glide on for a moment, as fast as it was moving.
          const recent = d.samples.filter((s) => e.timeStamp - s.t <= 90);
          if (!g.reduced && recent.length >= 2) {
            const a = recent[0];
            const b = recent[recent.length - 1];
            const span = Math.max(16, b.t - a.t);
            const vx = (b.x - a.x) / span;
            const vy = d.kind === "touch" ? 0 : (b.y - a.y) / span;
            if (Math.hypot(vx, vy) > 0.08) g.glide = { vx: clamp(vx, -3, 3), vy: clamp(vy, -3, 3) };
          }
          if (d.kind === "mouse") g.hovering = inside(e);
        }
        if (d.kind !== "mouse") g.hovering = false;
        kick();
      }
      if (!g.drag && !g.touches.size) stopListening();
    };
    const onCancel = (e) => {
      if (e.pointerType === "touch") lifted(e);
      const d = g.drag;
      if (d && e.pointerId === d.id) {
        g.drag = null;
        g.hovering = false;
        root.toggleAttribute("data-dragging", false);
        // The browser took a finger's drag up or down for the page's own
        // scroll: on a zoomed Earth a short note says two fingers move it.
        if (d.kind === "touch" && !d.moved && g.zoom > ZOOM_MIN) g.onTouchNote?.();
        kick();
      }
      if (!g.drag && !g.touches.size) stopListening();
    };
    const onClickCapture = (e) => {
      if (!g.swallowClick) return;
      g.swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    disc.addEventListener("pointerdown", onDown);
    disc.addEventListener("pointermove", onHover);
    disc.addEventListener("pointerleave", onLeave);
    disc.addEventListener("click", onClickCapture, true);

    drawNow();
    kick();
    // Once the page has first shown something, the picture is asked for.
    const stopWaiting = afterFirstPaint(() => {
      g.earthAllowed = true;
      askForPicture();
    });
    return () => {
      if (g.raf) cancelAnimationFrame(g.raf);
      stopWaiting();
      g.raf = 0;
      g.ctx = null;
      g.api = null;
      g.earth?.dispose();
      g.earth = null;
      g.earthAllowed = false;
      g.earthWanted = 0;
      g.earthWidth = 0;
      g.earthRefused = 0;
      g.pending?.bitmap?.close?.();
      g.pending = null;
      g.zoomAsked = 1;
      g.glAt = null;
      g.root = null;
      g.namesOff = false;
      root.toggleAttribute("data-names-off", false);
      g.engagedUntil = 0;
      window.clearTimeout(engageTimer);
      g.touches.clear();
      g.pinch = null;
      g.gesture = null;
      stopListening();
      sizes?.disconnect();
      seen?.disconnect();
      window.removeEventListener("resize", fit);
      pixels?.removeEventListener?.("change", onPixels);
      pixels = null;
      g.onPixels = null;
      root.toggleAttribute("data-gl-lost", false);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onPagePress, true);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("pointerleave", onBoxLeave);
      for (const type of gestures) box.removeEventListener(type, onGesture);
      disc.removeEventListener("pointerdown", onDown);
      disc.removeEventListener("pointermove", onHover);
      disc.removeEventListener("pointerleave", onLeave);
      disc.removeEventListener("click", onClickCapture, true);
    };
  }, [g]);

  const invalidate = () => {
    g.dirty = true;
    kickRef.current();
  };

  // The note about two fingers: shown for a moment, once a finger has
  // tried to move a zoomed Earth up or down.
  useEffect(() => {
    let timer = 0;
    g.onTouchNote = () => {
      setTouchNote(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTouchNote(false), TOUCH_NOTE_MS);
    };
    return () => {
      g.onTouchNote = null;
      window.clearTimeout(timer);
    };
  }, [g]);

  // Reduced motion: no slow turn, no glide, no fades; a jump instead of a
  // flight, and a zoom at once.
  useEffect(() => {
    g.reduced = reduced;
    if (reduced) {
      g.glide = null;
      if (g.fly) {
        g.centre = { ...g.fly.to.centre };
        g.zoom = g.fly.to.zoom;
        g.fly = null;
        g.linesAt = performance.now();
      }
      if (g.zoom !== g.zoomGoal) {
        g.zoom = g.zoomGoal;
        if (g.zoomAnchor && g.size) g.centre = zoomAround(g.zoomAnchor.place, g.zoomAnchor, g.zoom, g.size);
        g.zoomAnchor = null;
      }
      applyZoom(g);
    }
    invalidate();
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // The land and the black soil fade in when they arrive.
  useEffect(() => {
    if (!shapes || g.shapes === shapes) return;
    g.shapes = shapes;
    g.shapesAt = performance.now();
    invalidate();
  }, [shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  // The legend's switch for the black soil.
  useEffect(() => {
    g.soil = soilOn;
    invalidate();
  }, [soilOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // The dots: placed before the browser paints, so none flashes in a corner.
  // Their names are measured here, once (and again when the page's font
  // has arrived), never in the drawing loop.
  useLayoutEffect(() => {
    g.events = events;
    const measure = () => {
      for (const [id, el] of g.markerEls) {
        const tip = el.querySelector(".earth-tip");
        g.tipSizes.set(id, { w: tip?.offsetWidth || 0, h: tip?.offsetHeight || 0 });
      }
      g.tipAt.clear(); // placed again with the new sizes
    };
    measure();
    placeMarkers(g);
    invalidate();
    let alive = true;
    document.fonts?.ready?.then(() => {
      if (!alive) return;
      measure();
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Choosing an event, and letting it go -----
  // A pick: the globe turns and zooms to frame the event and the countries
  // its lines go to (earthMath fitView), its lines grow once it is there,
  // and its card opens beside the globe or under it.
  const select = (id, { via = "pointer", opener = null } = {}) => {
    const e = byId.get(id);
    if (!e) return;
    const list = buyersOf(e, world.trade, world.countries);
    g.selected = e;
    g.buyers = list;
    const shapesNow = g.shapes;
    g.highlight = shapesNow ? list.map((b) => shapesNow.countries.get(String(world.countries?.[b.iso3]?.num || ""))).filter(Boolean) : [];
    openerRef.current = opener;
    focusCard.current = via === "list";
    openedVia.current = via;
    shownFor.current = null;
    const view = fitView(e, list);
    g.api?.flyTo(view.centre, view.zoom);
    setSideHost(sideShown(sideRef.current));
    setSelectedId(id);
    setHint(false);
    invalidate();
  };

  // Closing: the globe zooms back out to the whole Earth (and turns on
  // once it is there), and the page's words come back.
  const close = ({ restore = false } = {}) => {
    if (!g.selected) return;
    const hadFocus = !!cardRef.current?.contains(document.activeElement);
    // Esc closes the card from anywhere on the page. A visitor who has read
    // on, the card out of the window, stays where they are: the page does
    // not go back to the list, and the focus goes back to it only if it was
    // in the card (with preventScroll; it has to go somewhere).
    const there = inWindow(cardRef.current);
    g.selected = null;
    g.buyers = [];
    g.highlight = [];
    shownFor.current = null;
    cardFocused.current = false;
    g.api?.flyTo({ ...g.centre }, ZOOM_MIN);
    setSelectedId(null);
    invalidate();
    const behavior = g.reduced ? "auto" : "smooth";
    if ((restore && there) || hadFocus) {
      const back = openerRef.current?.isConnected ? openerRef.current : hadFocus ? toggleRef.current : null;
      back?.focus({ preventScroll: true });
      // Closed with its button or Esc, a card chosen from the list under a
      // small globe (the page scrolled up from the list to show the globe
      // and the card) takes the visitor back to the event in the list, if
      // the card was still in the window.
      if (back && restore && there && scrolledFromList.current) {
        const r = back.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) back.scrollIntoView({ block: "nearest", behavior });
      }
    }
    openerRef.current = null;
    // A card opened from the globe that scrolled the page down to show it
    // gives the globe back: the page scrolls up just enough to show the
    // whole globe again (unless the visitor has since scrolled away from it).
    const disc = discRef.current;
    if (scrolledDown.current && disc) {
      const r = disc.getBoundingClientRect();
      if (r.top < 0 && r.bottom > 0) disc.scrollIntoView({ block: "nearest", behavior });
    }
    scrolledDown.current = false;
    scrolledFromList.current = false;
  };

  // The list. Over the globe it takes the card's place (an open card
  // closes) and the focus; choosing an event there closes it and opens the
  // event's card. Under a small globe with the page's width to itself (a
  // phone) it stays open while the visitor picks one event after another.
  const listOver = listOpen && overlay;
  const toggleList = () => {
    if (listOpen) {
      closeList();
      return;
    }
    if (overlay && g.selected) close();
    focusList.current = overlay;
    setListOpen(true);
  };
  const closeList = ({ restore = false } = {}) => {
    const hadFocus = !!listRef.current?.contains(document.activeElement);
    setListOpen(false);
    if (restore || hadFocus) toggleRef.current?.focus({ preventScroll: true });
  };
  const pick = (event, id) => {
    if (overlay) {
      setListOpen(false);
      select(id, { via: "list", opener: toggleRef.current });
    } else select(id, { via: "list", opener: event.currentTarget });
  };
  useEffect(() => {
    g.listOver = listOver;
    invalidate();
  }, [listOver]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!listOver || !focusList.current) return;
    focusList.current = false;
    listRef.current?.querySelector(".earth-pick")?.focus({ preventScroll: true });
  }, [listOver]);

  // The latest actions, for the handlers set up once.
  const actions = useRef({ select, close, closeList });
  actions.current = { select, close, closeList };

  // Esc closes the list over the globe, or the card, from anywhere on the
  // page, and gives the focus back; it also gives the wheel back to the
  // page. While the phone menu is open over the page, Esc is the menu's
  // (Nav.jsx closes it), and the card stays.
  useEffect(() => {
    if (!selectedId && !listOver && !engaged) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.documentElement.hasAttribute("data-menu")) return;
      g.api?.disengage();
      if (listOver) actions.current.closeList({ restore: true });
      else if (selectedId) actions.current.close({ restore: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, listOver, engaged]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new card: chosen from the list it takes the focus, and it is brought
  // into the window, only as far as it must. Under the globe it comes with
  // the globe (earthMath revealBoth: both whole when they fit, else the
  // whole globe and the card's start), so the visitor sees the pick
  // happen, the turn, the zoom and the lines, and not the card alone (on a
  // phone the list runs on under the globe, far below it). Beside the
  // globe it shows whole. A card that moves between its two places (the
  // window crossed 900 px) keeps the focus it had (the browser drops the
  // focus of what leaves the page), and is brought into the window again
  // only if the visitor had the globe or the card in it (seenCard, below): a
  // visitor who has read on down the page and turns a tablet stays where
  // they are. Scrolled down for a card chosen on the globe, the page
  // scrolls back up when it closes; scrolled up from the list, closing it
  // with its button or Esc goes back to the event in the list.
  useLayoutEffect(() => {
    if (!selectedId) {
      shownAt.current = null;
      return;
    }
    const card = cardRef.current;
    if (!card) return;
    const moved = shownFor.current === selectedId && shownAt.current !== place;
    if (shownFor.current === selectedId && !moved) return;
    shownFor.current = selectedId;
    shownAt.current = place;
    if (focusCard.current || (moved && cardFocused.current)) {
      focusCard.current = false;
      cardTitleRef.current?.focus({ preventScroll: true });
    }
    if (moved && !seenCard.current) return;
    const view = window.innerHeight || document.documentElement.clientHeight || 0;
    const behavior = g.reduced ? "auto" : "smooth";
    const rect = card.getBoundingClientRect();
    const disc = discRef.current?.getBoundingClientRect();
    if (place === "under" && disc) {
      const by = revealBoth(disc, rect, view);
      if (by) window.scrollBy({ top: by, behavior });
      if (!moved) {
        scrolledDown.current = by > 0 && openedVia.current === "pointer";
        scrolledFromList.current = by < 0 && openedVia.current === "list";
      }
      return;
    }
    if (rect.top < 0 || rect.bottom > view) {
      card.scrollIntoView({ block: "nearest", behavior });
      if (!moved) scrolledDown.current = rect.bottom > view && openedVia.current === "pointer";
    }
  }, [selectedId, place]); // eslint-disable-line react-hooks/exhaustive-deps

  // While a card is open: whether the visitor has the globe or the card in
  // the window, noted as the page scrolls (and when the card opens). Never
  // on a change of the window's size itself: the card that moves then is
  // put in its new place in the same moment (the layout effect above runs
  // straight from the resize), before the page's scroll events, so it reads
  // where the visitor was before the change.
  useEffect(() => {
    if (!selectedId) return undefined;
    const note = () => {
      seenCard.current = inWindow(discRef.current) || inWindow(cardRef.current);
    };
    note();
    window.addEventListener("scroll", note, { passive: true });
    return () => window.removeEventListener("scroll", note);
  }, [selectedId]);

  // While the card is in the place beside the globe, that place says so
  // (data-card), and the page's words step aside by it (home.css, the
  // globe's block). An attribute, not the place's :empty: Safari does not
  // look at :has(:empty) again when the card comes and goes, and would
  // leave the words over the card, or gone after it closes.
  useLayoutEffect(() => {
    if (!sideHost) return undefined;
    sideHost.toggleAttribute("data-card", place === "side");
    return () => sideHost.removeAttribute("data-card");
  }, [sideHost, place]);

  // A click on a dot. The pin's click lands on the button it covers; with
  // two dots close together, the one nearer the click point wins. A click
  // made by the cursor assist (no position) is the button's own.
  // The dots are the pointer's way to an event (the list is the
  // keyboard's): a tap leaves the focus on the dot it pressed, where a key
  // pressed later (Esc) would draw the focus ring, so the dot lets it go.
  const onMarkerClick = (event, id) => {
    if (document.activeElement === event.currentTarget) event.currentTarget.blur();
    let chosen = id;
    const disc = discRef.current;
    if (disc && event.detail > 0 && (event.clientX || event.clientY)) {
      const rect = disc.getBoundingClientRect();
      chosen = nearestMarker({ x: event.clientX - rect.left, y: event.clientY - rect.top }, g.spots, 24) || id;
    }
    g.api?.engage();
    if (chosen !== selectedId) actions.current.select(chosen, { via: "pointer" });
  };

  // A click on the bare globe closes the card, or with no card open zooms
  // one step in at that point. When the pin's other parts cover a dot or a
  // button nearby, the site's cursor assist shows that as its goal
  // ([data-near]) and clicks it a moment later: the click is left to it.
  // Otherwise the click is marked as handled, so the assist leaves it be.
  const onDiscClick = (event) => {
    if (event.target.closest?.(".earth-marker")) return;
    if (event.detail > 0 && document.querySelector(".site [data-near]")) return;
    event.preventDefault();
    g.api?.engage();
    if (g.selected) {
      actions.current.close();
      return;
    }
    const disc = discRef.current;
    if (!disc || !g.size) return;
    const rect = disc.getBoundingClientRect();
    const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (Math.hypot(at.x - rect.width / 2, at.y - rect.height / 2) > discRadius(g.size)) return;
    g.api?.zoomTo(g.zoomGoal * ZOOM_STEP, at);
  };

  // The zoom buttons zoom about the globe's middle.
  const zoomStep = (dir) => {
    if (dir > 0 && atClosest) return;
    if (dir < 0 && !zoomed) return;
    g.api?.zoomTo((g.fly ? g.zoom : g.zoomGoal) * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
    g.api?.engage();
  };
  // The whole Earth again. Its button goes once the Earth is whole, so the
  // focus it had moves to + rather than being lost.
  const zoomWhole = (event) => {
    const hadFocus = document.activeElement === event.currentTarget;
    g.api?.zoomTo(ZOOM_MIN);
    g.api?.engage();
    if (hadFocus) zoomBarRef.current?.querySelector('[aria-label="Zoom in"]')?.focus({ preventScroll: true });
  };

  // ----- For the browser checks (?earth-debug=1) -----
  useEffect(() => {
    if (!DEBUG) return undefined;
    const again = () => {
      g.glAt = null;
      g.dirty = true;
      kickRef.current();
    };
    window.__earth = {
      state: () => ({
        centre: { ...g.centre },
        zoom: g.zoom,
        zoomGoal: g.zoomGoal,
        speed: g.speed,
        flying: !!g.fly,
        turning: !!g.fly,
        dragging: !!g.drag?.moved,
        pinching: !!g.pinch,
        gliding: !!g.glide,
        hovering: g.hovering,
        engaged: performance.now() < g.engagedUntil,
        selected: g.selected?.id || null,
        card: placeRef.current,
        bar: barRef.current,
        namesOff: g.namesOff,
        buyers: g.buyers.map((b) => b.iso3),
        lines: g.lines.length,
        marks: g.marks.length,
        heads: g.headsDrawn,
        dim: g.dim,
        frames: g.frames,
        paintMs: g.paintMs,
        size: g.size,
        dpr: g.dpr,
        running: !!g.raf,
        onScreen: g.onScreen,
        shapes: !!g.shapes,
        soil: g.soil,
        spots: g.spots.map((s) => ({ ...s })),
        earth: {
          webgl: !!g.earth,
          ready: !!g.earth?.ready,
          lost: !!g.earth?.lost,
          picture: g.earthWidth || null,
          wanted: g.earthWanted || null,
          pending: g.pending?.width || null,
          refused: g.earthRefused || null,
          zoomAsked: g.zoomAsked,
          handheld: handheld(),
          uploadMs: g.earth?.uploadMs || 0,
          shown: realShown(g, performance.now()),
          maxTexture: g.earth?.maxTexture || null,
          frames: g.glFrames,
          ms: g.glMs,
          error: g.earth?.error || null,
        },
      }),
      select: (id) => actions.current.select(id, { via: "pointer" }),
      close: () => actions.current.close(),
      // The zoom, set at once (about the middle).
      zoom: (k = 1) => {
        g.fly = null;
        g.zoomAnchor = null;
        g.zoom = clampZoom(k);
        g.zoomGoal = g.zoom;
        applyZoom(g);
        syncZoomUi(g);
        again();
        return g.zoom;
      },
      // Reads the --earth-* colours again (for trying colours in the browser).
      recolour: () => {
        if (!g.ctx || !rootRef.current) return;
        g.colours = readColours(rootRef.current, g.ctx);
        again();
      },
      // Other numbers for the real Earth's look (earthGl.js LOOK).
      look: (values = {}) => {
        if (!g.earth) return null;
        Object.assign(g.earth.look, values);
        again();
        return JSON.parse(JSON.stringify(g.earth.look));
      },
      // What the globe does when the window moves to a screen with other
      // pixels (the browser checks change the pixels with the DevTools
      // protocol, which does not always tell the page's query).
      pixels: () => {
        g.onPixels?.();
        return { size: g.size, dpr: g.dpr };
      },
      hold: (on = true) => {
        g.held = !!on;
        if (g.held) g.speed = 0; // at once, not easing down
        kickRef.current();
      },
      centre: (place) => {
        g.fly = null;
        g.glide = null;
        g.zoomAnchor = null;
        g.centre = { lat: clamp(place.lat, -90, 90), lng: normLng(place.lng) };
        again();
      },
      coasts: (on = true) => {
        g.coasts = !!on;
        again();
      },
      // A grid of lines every 10 degrees (2 pixels wide, centred on the
      // lines, on a picture 3600 wide) in place of the Earth.
      testPicture: () => {
        if (!g.earth) return false;
        const grid = document.createElement("canvas");
        grid.width = 3600;
        grid.height = 1800;
        const x = grid.getContext("2d");
        x.fillStyle = "#000";
        x.fillRect(0, 0, 3600, 1800);
        x.fillStyle = "#fff";
        for (let k = 0; k <= 36; k++) x.fillRect(k * 100 - 1, 0, 2, 1800);
        for (let k = 1; k < 18; k++) x.fillRect(0, k * 100 - 1, 3600, 2);
        const ok = g.earth.setPicture(grid);
        g.earthWidth = 0;
        again();
        return ok;
      },
    };
    return () => {
      delete window.__earth;
    };
  }, [g]);

  const reviewed = world.status === "ok" && world.reviewed ? dayMonthYear(world.reviewed) : "";
  const years = Array.isArray(world.trade?.years) && world.trade.years.length === 2 ? world.trade.years : null;
  const span = years ? (years[0] === years[1] ? ` (${years[0]})` : ` (${years[0]}–${years[1]})`) : "";
  // While the feed is on its way, the words it brings to the sources line
  // (the day the list was reviewed, the trade table's years) are held by
  // hidden stand-ins of their usual length, so the line does not grow by a
  // row when they arrive and nothing beside the globe moves.
  const loading = world.status === "loading";
  const standIn = (text) => (
    <span className="earth-stand-in" aria-hidden="true">
      {text}
    </span>
  );
  const out = { className: "link link-under", target: "_blank", rel: "noreferrer" };
  const kindOf = (e) => (e.kind === "war" ? "war" : "alert");
  const wars = events.filter((e) => e.kind === "war");
  const alerts = events.filter((e) => e.kind !== "war");
  const groups = [
    { kind: "war", label: countWords(wars.length, "armed conflict", "armed conflicts"), events: wars },
    { kind: "alert", label: countWords(alerts.length, "disaster alert", "disaster alerts"), events: alerts },
  ].filter((group) => group.events.length);
  const picture = `The real Earth seen from space, turning slowly.${
    soilOn ? " The world's black-soil belts are outlined in dark brown." : ""
  } Today's armed conflicts are terracotta dots and disaster alerts amber ones; thin lines run from each one to the countries whose food depends on its land. The list under the globe names each one.`;
  const closeIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
  // The list's groups, over the globe or under it.
  const listBody = groups.map((group) => (
    <div className="earth-list-group" key={group.kind}>
      <p id={`${listId}-${group.kind}`} className="earth-list-head">
        {group.label}
      </p>
      <ul aria-labelledby={`${listId}-${group.kind}`}>
        {group.events.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="earth-pick"
              data-kind={kindOf(e)}
              aria-current={e.id === selectedId ? "true" : undefined}
              aria-label={eventLine(e, now)}
              onClick={(event) => pick(event, e.id)}
            >
              <span className="earth-pick-name">{e.name}</span>
              <span className="earth-pick-when">{statusLine(e, now)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  ));

  // The card: what is going on at the picked event. Beside the globe (in
  // the page's place for it) or under it, never over it.
  const card =
    selected && words ? (
      <div
        ref={cardRef}
        className="earth-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby={cardTitleId}
        data-kind={kindOf(selected)}
        data-place={place}
        data-columns={place === "under" && wide && words.buyers.length ? "2" : "1"}
        onFocus={() => {
          cardFocused.current = true;
        }}
        onBlur={(event) => {
          const left = event.currentTarget;
          if (left.contains(event.relatedTarget)) return;
          // A card hidden (the window narrowed to 900 px and the page hid
          // the place beside the globe) or taken off the page (it moves to
          // its other place) loses the focus without the visitor moving
          // it, and keeps it when it shows again. Whether the focus really
          // left is seen once the page has settled.
          queueMicrotask(() => {
            if (cardRef.current?.contains(document.activeElement)) return;
            if (!left.isConnected || !left.getClientRects().length) return;
            cardFocused.current = false;
          });
        }}
      >
        <div className="earth-card-about">
          <h2 id={cardTitleId} ref={cardTitleRef} className="earth-card-title" tabIndex={-1} data-long={words.title.length > LONG_TITLE ? "" : undefined}>
            {words.title}
          </h2>
          <p className="earth-card-meta">
            <span className="earth-card-dot" aria-hidden="true" />
            {words.meta}
          </p>
          {words.note && <p className="earth-card-note">{words.note}</p>}
          {words.measured && (
            <p className="earth-card-measured">
              {words.measured}{" "}
              <Link className="link link-under" to="/demo">
                See it in the demo
              </Link>
            </p>
          )}
          {words.link && (
            <p className="earth-card-link">
              <a {...out} href={words.link}>
                GDACS report
              </a>
            </p>
          )}
        </div>
        {words.buyers.length > 0 && (
          <div className="earth-card-buyers">
            <h3 className="earth-card-sub">Whose food depends on it</h3>
            <ul className="earth-buyers">
              {words.buyers.map((b) => (
                <li key={b.iso3}>
                  <span>
                    {b.name}
                    {b.year}
                  </span>
                  <span className="earth-buyer-share">{b.share}</span>
                </li>
              ))}
            </ul>
            {words.more && <p className="earth-card-more">{words.more}</p>}
            <p className="earth-card-source">{words.buyersAbout}</p>
          </div>
        )}
        {/* Last in the card, so Tab reaches it after the card's words and
            links; it shows in the top right corner. */}
        <button type="button" className="earth-close" aria-label="Close" onClick={() => close({ restore: true })}>
          {closeIcon}
        </button>
      </div>
    ) : null;

  return (
    <figure ref={rootRef} className={`earth ${className}`.trim()} aria-labelledby={titleId} data-picked={selectedId ? "" : undefined}>
      <p id={titleId} className="sr-only">
        The Earth today: where the black soil lies, today's armed conflicts and disaster alerts, and whose food depends on their land
      </p>
      <div className="earth-stage" data-card={place === "under" ? "under" : undefined} data-bar={bar}>
        <div ref={boxRef} className="earth-box">
          <div ref={discRef} className="earth-disc" onClick={onDiscClick}>
            <canvas ref={glRef} className="earth-gl" aria-hidden="true" />
            <canvas ref={canvasRef} className="earth-canvas" role="img" aria-label={picture} />
            <div className="earth-markers" aria-hidden="true">
              {events.map((e) => (
                <button
                  key={e.id}
                  ref={(el) => {
                    if (el) g.markerEls.set(e.id, el);
                    else g.markerEls.delete(e.id);
                  }}
                  type="button"
                  tabIndex={-1}
                  className="earth-marker"
                  data-kind={kindOf(e)}
                  data-selected={e.id === selectedId ? "" : undefined}
                  data-hint={hint && e.id === UKRAINE && !reduced ? "" : undefined}
                  onClick={(event) => onMarkerClick(event, e.id)}
                >
                  <span className="earth-dot" />
                  <span className="earth-tip">{e.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* The zoom: + and -, and while zoomed in one that shows the
              whole Earth again; in the globe's corner, or beside it or
              under it (the stage's data-bar, earth.css), never on it. */}
          <div ref={zoomBarRef} className="earth-zoom" hidden={listOver}>
            {zoomed && (
              <button type="button" className="earth-zoom-btn" aria-label="Show the whole Earth" title="Whole Earth" onClick={zoomWhole}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                  <circle cx="9" cy="9" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <ellipse cx="9" cy="9" rx="2.9" ry="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M2.6 9h12.8" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </button>
            )}
            <button type="button" className="earth-zoom-btn" aria-label="Zoom in" title="Zoom in" aria-disabled={atClosest || undefined} onClick={() => zoomStep(1)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <button type="button" className="earth-zoom-btn" aria-label="Zoom out" title="Zoom out" aria-disabled={!zoomed || undefined} onClick={() => zoomStep(-1)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* What the wheel does now, and how the zoomed Earth moves on a
              phone: a quiet line on the globe for a moment. */}
          {(engaged && fine && !listOver) || touchNote ? (
            <p className="earth-hint" aria-hidden="true">
              {touchNote ? "Two fingers move the zoomed Earth." : "Scroll to zoom. Esc to let the page scroll."}
            </p>
          ) : null}

          {overlay && (
            <div ref={listRef} id={listId} className="earth-panel" role="dialog" aria-modal="false" aria-label="Today's armed conflicts and disaster alerts" hidden={!listOpen}>
              {listBody}
              {/* Last for the keyboard, first on the screen: it stays in the
                  panel's top right corner while the list scrolls (earth.css). */}
              <button type="button" className="earth-close" aria-label="Close the list" onClick={() => closeList({ restore: true })}>
                {closeIcon}
              </button>
            </div>
          )}
        </div>

        {place === "under" && card}
      </div>
      {place === "side" && sideHost && card ? createPortal(card, sideHost) : null}

      <div className="earth-foot">
        <div className="earth-key-row">
          {/* Two rows: the dots, then what is drawn on the Earth. */}
          <ul className="earth-legend" aria-label="What the colours show">
            <li>
              <span className="earth-key earth-key-war" aria-hidden="true" />
              Armed conflicts
            </li>
            <li>
              <span className="earth-key earth-key-alert" aria-hidden="true" />
              Disaster alerts
            </li>
            <li>
              {/* The black soil can be taken off the Earth and put back. */}
              <button type="button" className="earth-switch" aria-pressed={soilOn} onClick={() => setSoilOn((on) => !on)}>
                <span className="earth-key earth-key-soil" aria-hidden="true" />
                Black soil
              </button>
            </li>
            <li>
              <svg className="earth-key-line" width="24" height="12" viewBox="0 0 24 12" aria-hidden="true" focusable="false">
                <path d="M1.5 6h14.5" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M15 2.2L21.5 6 15 9.8z" />
              </svg>
              Whose food depends on it
            </li>
          </ul>
          <button
            ref={toggleRef}
            type="button"
            className="link earth-list-toggle"
            aria-expanded={listOpen}
            aria-controls={listId}
            disabled={!events.length}
            onClick={toggleList}
          >
            {listOpen ? "Hide the list" : "See them all as a list"}
          </button>
        </div>
        {world.status === "failed" && <p className="earth-note">Today's conflicts and alerts could not be loaded.</p>}
        {!overlay && (
          <div ref={listRef} id={listId} className="earth-list" hidden={!listOpen}>
            {listBody}
          </div>
        )}
        <p className="earth-sources">
          Earth:{" "}
          {/* NASA's page for the Blue Marble pictures (Visible Earth's old
              record for this one, images/73776, now opens the Earth
              Observatory's front page; where the files are now:
              earthMath.js PICTURE_WIDTHS). */}
          <a {...out} href="https://svs.gsfc.nasa.gov/3539">
            NASA Blue Marble
          </a>
          , public domain. Land and borders:{" "}
          <a {...out} href="https://www.naturalearthdata.com/">
            Natural Earth
          </a>
          . Black soil:{" "}
          <a {...out} href="https://doi.org/10.5281/zenodo.1476844">
            OpenLandMap USDA great groups
          </a>{" "}
          (Hengl and Nauman, 2018),{" "}
          <a {...out} href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          , modified. Disaster alerts:{" "}
          <a {...out} href="https://www.gdacs.org/">
            GDACS
          </a>
          , live. Armed conflicts: a list reviewed by hand{reviewed ? ` on ${reviewed}` : loading ? standIn(" on 28 September 2026") : ""}. Who buys whose food: World Bank{" "}
          <a {...out} href="https://wits.worldbank.org/">
            WITS
          </a>
          , the latest year each country reported{span || (loading ? standIn(" (2021–2023)") : "")}.
        </p>
      </div>
    </figure>
  );
}
