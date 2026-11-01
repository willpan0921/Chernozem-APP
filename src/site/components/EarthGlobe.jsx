// WHAT THIS FILE DOES
// The About page's Earth, in the right half of the first screen (under
// the words on a phone): a medium-sized globe of the real Earth (NASA's
// picture of it from space, softly lit) that turns slowly on its own. On
// it: the world's black-soil belts (the soil Chernozem is named after),
// outlined over the Earth's own colours, and today's armed conflicts
// (terracotta dots) and disaster alerts (amber dots).
//
// What the visitor can do:
//   - watch it turn: a whole turn in 80 seconds, west to east like the
//     real Earth, starting over Ukraine. It rests while the pointer is on
//     it, while a card is open, while it is off the screen or the tab is
//     hidden, and for visitors who asked for reduced motion (they get it
//     standing still, a jump instead of a turn and the lines drawn at once);
//   - drag it to turn it, with a mouse or a finger (on a phone a sideways
//     drag turns it and an up-and-down one scrolls the page as usual);
//   - click or tap a dot: the globe turns to it, lines grow from it to the
//     countries whose farm and food imports depend most on that land (World
//     Bank WITS: only real rows, each with its share, and its year when it
//     is not the table's own; for a war, none from before it began; the
//     thicker the line, the larger the share), those countries are tinted,
//     and a card says what is going on there now: the event's name, since
//     when (an alert: its level and dates), the feed's line about the land,
//     for Ukraine Chernozem's own measurement, and the countries with their
//     shares. The card always shows all its words at once, never a box to
//     scroll (earthMath cardPlace, sheetSide, sheetHides):
//       on a globe 480 px or wider it lies across the top or the bottom of
//       it, as tall as its words (at most three quarters of the globe), on
//       the side where it hides none of the lines, and the globe turns the
//       event into the part left free; when both sides would hide a line,
//       the card names only the first four countries ("and 3 more") and
//       tries again; when that still hides one, or its words do not fit,
//       it goes under the globe;
//       on a smaller globe it goes under it, in one column with the first
//       four countries, and the event turns to the middle;
//       under the globe it lies over what is below (the legend, the page)
//       when the page has its words beside the globe, so the globe's box
//       never changes height and nothing beside it moves; when the globe
//       has the page's width to itself (a phone, or a window that puts the
//       globe under the words) it sits on the page, which grows.
//     A card that does not show whole in the window is scrolled into view
//     (only as far as it must), and when it closes the page scrolls back
//     up to the globe. Esc, the card's close button or a click on the bare
//     globe closes it and the globe turns on;
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
// between two close dots goes to the nearer one (earthMath nearestMarker).
// A dot's name shows beside it (at most 240 px wide, its words wrapping),
// on whichever side keeps it inside the globe and on the screen, or under
// it (earthMath tipPlace). Until the first click, Ukraine's dot pulses
// gently.
//
// How it is drawn: d3-geo's orthographic projection on two canvases, one
// over the other. Underneath, the real Earth (earthGl.js): NASA's Blue
// Marble picture of August 2004 painted on the sphere by a small WebGL
// program that turns it exactly as d3-geo turns everything else, a little
// lighter and less saturated than NASA's own colours, softly lit from the
// upper left and shaded towards the edge. On top (an ordinary canvas),
// only what goes over the Earth, so its own colours still show: a faint
// grid of latitude and longitude, the black soil (public/site/world/
// black-soil.json, made by earthMath.js soilShapes) as a fine dark outline
// with a light wash, the countries the lines go to (a warm see-through
// tint with an outline) and the lines (light, with a thin dark edge, so
// they read on the sea and on the land). The picture is asked for once
// the page has first shown something (it never holds up the page's
// words), in the size the globe needs (earthMath earthPicture: the 1024
// copy on a phone with an ordinary screen or for a visitor saving data,
// the 2048 one on a sharp phone and mostly, the 3072 one for a large
// globe on a sharp screen), and fades in over a
// drawn Earth in natural colours (a blue sea, muted green-brown land, the
// ice of Antarctica and Greenland, from Natural Earth's 1:110m shapes,
// public/site/world/countries-110m.json). That drawn Earth is all the
// visitor sees where WebGL is missing, and while the browser has taken it
// away (the real Earth comes back with it; meanwhile its canvas is hidden,
// so the browser's grey "lost" sign never shows), so the globe is never
// empty. Both canvases match the globe's box in the screen's own pixels,
// measured again when the box changes size and when the window moves to a
// screen with other pixels (a sharper screen then also gets a sharper
// picture); a box too small to draw in (a screenshot tool shrinks the
// window for a moment) is left alone.
// The dots are buttons laid over the canvases and moved each frame (only
// their style changes, so nothing on the page has to notice). One
// requestAnimationFrame loop draws while something moves (the turn, a
// drag and its glide, the lines growing, the land and the picture fading
// in; the slow turn on its own 30 times a second) and stops when nothing
// does, when the globe is off the screen or when the tab is hidden; the
// WebGL program paints only when the turn or the size has changed.
//
// Data: worldData.js (the live feed /api/world/crises, the country
// centres and the trade table, one load shared with the rest of the page)
// and the shape files and the picture above, fetched here: the component
// needs nothing from the page but its box. Words and arithmetic:
// earthMath.js and globeMath.js (both tested). Look: earth.css (the canvas
// reads its colours from there) and LOOK in earthGl.js. Checks: with
// ?earth-debug=1 in the address, window.__earth gives the browser tests
// its state (state(), select(id), close(), recolour() to read the colours
// again, look({...}) to try other numbers for the real Earth's look,
// hold(true) to rest the slow turn, centre({ lat, lng }) to turn it,
// coasts(true) to draw Natural Earth's coasts over the picture,
// testPicture() to paint a grid of 10 degree lines instead of the Earth
// (the page's alignment checks use these four), and pixels() to do what a
// move to a screen with other pixels does).
//
// WHO EDITS IT
// Whoever works on the About page's globe.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { useMediaQuery } from "../hooks.js";
import { useWorldData } from "./worldData.js";
import { aimFor, buyersOf, clamp, dayMonthYear, normLng, tradeYear } from "./globeMath.js";
import { createEarthPainter } from "./earthGl.js";
import {
  along,
  arcDegrees,
  CARD_COUNTRIES,
  cardPlace,
  cardWords,
  centreFor,
  countWords,
  discRadius,
  dragTo,
  earthEvents,
  earthPicture,
  ease,
  eventLine,
  eventSpot,
  facing,
  lineGrowth,
  linesDone,
  markerOpacity,
  MAX_TILT,
  nearestMarker,
  OVER_GLOBE,
  rotationFor,
  sheetHides,
  sheetSide,
  spin,
  SPIN_DEG_PER_S,
  START,
  statusLine,
  tipPlace,
  turnMs,
  WIDE_GLOBE,
} from "./earthMath.js";
import "./earth.css";

const GRATICULE = geoGraticule10();
const MAX_DPR = 2; // sharper than this costs drawing time and shows nothing more
const MIN_BOX = 16; // px: a box narrower than this is not drawn in (a screenshot tool shrinks the window for a moment)
// The globe has something beside it (the page's words) when it takes less
// than 70% of the window's width; then nothing it opens may make it taller.
const SHARED_BELOW = 0.7;
const TIP_MARGIN = 8; // px a dot's name keeps from the window's edges
const LAND_FADE_MS = 500;
const EARTH_FADE_MS = 600; // the real Earth fading in over the drawn one
const GLIDE_MS = 250; // how quickly a flung globe slows down
const SPIN_FRAME_MS = 30; // the slow turn on its own is drawn about 30 times a second
const SLOP = { mouse: 4, pen: 6, touch: 8 }; // pixels a press may move and still be a click
const UKRAINE = "war-ukraine";
const ICE = ["010", "304"]; // Antarctica and Greenland (Natural Earth's ids), white on the drawn Earth
const DEBUG = typeof window !== "undefined" && /[?&]earth-debug=1(&|$)/.test(window.location.search);

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

// Everything the drawing needs, kept outside React so a frame never waits
// for a render.
function makeEngine() {
  return {
    centre: { ...START },
    speed: 0, // degrees a second, easing towards the slow turn's speed or towards 0
    last: 0,
    drawnAt: 0, // when the last frame was drawn
    raf: 0,
    ctx: null,
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
    turn: null, // { from, to, start, ms }
    drag: null, // { id, kind, x, y, from, moved, samples }
    glide: null, // { vx, vy } in pixels a millisecond
    swallowClick: false,
    shapes: null,
    shapesAt: 0,
    soil: true, // the black soil is drawn (the legend's switch)
    earth: null, // the real Earth's painter (earthGl.js), or null without WebGL
    earthAllowed: false, // the page has first shown something: the picture may be asked for
    earthWanted: 0, // the width of the copy asked for last
    earthWidth: 0, // the width of the copy on the graphics card
    earthAt: 0, // when the picture first showed (it fades in)
    glAt: null, // the turn and size the real Earth was last painted for
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
    aim: null,
    buyers: [],
    highlight: [],
    linesAt: 0,
    dirty: true,
    frames: 0,
    paintMs: 0,
    held: false, // the browser checks' hold on the slow turn
    coasts: false, // the browser checks' coasts over the picture
    onPixels: null, // fits the canvases again for a screen with other pixels (for the browser checks)
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

// The real Earth (earthGl.js), painted again only when the turn or the
// size has changed since it last was.
function paintEarth(g) {
  const earth = g.earth;
  if (!earth?.ready || !g.size) return;
  const at = g.glAt;
  if (at && at.lat === g.centre.lat && at.lng === g.centre.lng && at.size === g.size && at.dpr === g.dpr) return;
  const started = performance.now();
  if (earth.draw(g.centre, g.size, g.dpr)) {
    g.glAt = { lat: g.centre.lat, lng: g.centre.lng, size: g.size, dpr: g.dpr };
    g.glFrames += 1;
    g.glMs = g.glMs * 0.9 + (performance.now() - started) * 0.1;
  }
}

// The drawn Earth, in natural colours: the sea lit from the upper left,
// the land, the ice of Antarctica and Greenland, light and shade over the
// whole disc and a soft rim. It shows while the picture loads and wherever
// WebGL is missing; `alpha` fades it out as the real Earth fades in.
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
    // (d3-geo cuts it at the horizon); kept a little inside the edge, its
    // outline never draws a dark line along the rim.
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
    // The countries the lines go to: a warm see-through tint, outlined in
    // a light line over a thin dark one (it reads on the sea and the land).
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

  // The lines to the countries whose food depends on this land: each grows
  // from the event in turn, thicker for a larger share; light with a thin
  // dark edge, so they read over the sea and over the land.
  if (g.selected && !g.turn && g.buyers.length) {
    const from = [g.selected.lng, g.selected.lat];
    const since = now - g.linesAt;
    const top = g.buyers[0].share || 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    g.buyers.forEach((b, i) => {
      const k = lineGrowth(since, i, g.reduced);
      if (k <= 0) return;
      const to = [b.lng, b.lat];
      const line = { type: "LineString", coordinates: [from, k >= 1 ? to : geoInterpolate(from, to)(k)] };
      const width = 1.2 + 2.6 * clamp(b.share / top, 0, 1);
      ctx.beginPath();
      path(line);
      ctx.lineWidth = width + 3;
      ctx.strokeStyle = c["line-halo"];
      ctx.stroke();
      ctx.lineWidth = width;
      ctx.strokeStyle = c.line;
      ctx.stroke();
      if (k >= 1 && facing(g.centre, b) > 0.03) {
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
  }
}

// Moves each dot to its place for the current turn, fading it near the
// edge; notes where each one is for clicks between two dots.
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
    const alpha = ready ? markerOpacity(facing(g.centre, e)) : 0;
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
  g.dirty = false;
  g.frames += 1;
  g.paintMs = g.paintMs * 0.9 + (performance.now() - started) * 0.1;
}

export default function EarthGlobe({ className = "" }) {
  const world = useWorldData();
  const shapes = useShapes();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const engine = useRef(null);
  if (!engine.current) engine.current = makeEngine();
  const g = engine.current;

  const rootRef = useRef(null);
  const discRef = useRef(null);
  const glRef = useRef(null);
  const canvasRef = useRef(null);
  const cardRef = useRef(null);
  const cardTitleRef = useRef(null);
  const toggleRef = useRef(null);
  const listRef = useRef(null);
  const openerRef = useRef(null); // the list button that opened the card, for Esc
  const focusCard = useRef(false);
  const focusList = useRef(false);
  const plannedFor = useRef(null); // the event the last turn was planned for
  const openedVia = useRef("pointer"); // how the open card was chosen: "pointer" (on the globe) or "list"
  const scrolledDown = useRef(false); // the page scrolled down to show a card chosen on the globe
  const kickRef = useRef(() => {});

  const [width, setWidth] = useState(0);
  const [shared, setShared] = useState(true); // the page has something beside the globe (measured in fit)
  const [selectedId, setSelectedId] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [hint, setHint] = useState(true);
  const [soilOn, setSoilOn] = useState(true);
  // Where the open card went, once measured: { key, place, side, short, done }
  // (key: the event, the globe's width and whether it has the page's words
  // beside it; any of them changing measures the card again).
  const [fitted, setFitted] = useState({ key: "" });

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
  // The card: first drawn where the globe's width says (earthMath
  // cardPlace), then measured before the browser paints (below), which may
  // move it to the other side, name fewer countries or send it under the
  // globe. On a globe under 520 px it has one column and names four
  // countries; from 520 px two columns and every country.
  const wide = width >= WIDE_GLOBE;
  const fitKey = selected ? `${selected.id} ${width} ${shared ? 1 : 0}` : "";
  const fit = fitted.key === fitKey ? fitted : null;
  const place = fit ? fit.place : cardPlace(width, shared);
  const short = fit ? fit.short : !wide;
  const side = fit?.side || (selected ? sheetSide(selected, buyers) : "bottom");
  const words = selected ? cardWords(selected, { buyers, now, commonYear, countries: short ? CARD_COUNTRIES : Infinity }) : null;
  // The list lies over the globe on a globe 480 px or wider, and on any
  // globe with the page's words beside it (so they never move); under a
  // small globe with the page's width to itself it sits under it.
  const overlay = width >= OVER_GLOBE || shared;

  // ----- The loop -----
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const glCanvas = glRef.current;
    const disc = discRef.current;
    const root = rootRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !disc || !root || !ctx) return undefined;
    g.ctx = ctx;
    g.path = geoPath(g.projection, ctx);
    g.colours = readColours(root, ctx);

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
      // The slow turn's speed eases up and down over about a third of a second.
      const resting = g.reduced || g.hovering || g.selected || g.listOver || g.drag || g.turn || g.glide || g.held;
      const goal = resting ? 0 : SPIN_DEG_PER_S;
      if (g.speed !== goal) {
        g.speed += (goal - g.speed) * (1 - Math.exp(-dt / 320));
        if (Math.abs(goal - g.speed) < 0.02) g.speed = goal;
        moving = true;
      }
      if (g.turn) {
        const p = clamp((t - g.turn.start) / g.turn.ms, 0, 1);
        g.centre = along(g.turn.from, g.turn.to, ease(p));
        if (p >= 1) {
          // Arrived: it rests exactly there (no drift left over from the
          // slow turn), so the event stays where its card left room for it.
          g.turn = null;
          g.speed = 0;
          g.linesAt = t;
        }
        moving = true;
      } else if (g.glide && !g.drag) {
        g.centre = dragTo(g.centre, g.glide.vx * dt, g.glide.vy * dt, g.size / 2);
        const k = Math.exp(-dt / GLIDE_MS);
        g.glide.vx *= k;
        g.glide.vy *= k;
        if (Math.hypot(g.glide.vx, g.glide.vy) < 0.01) g.glide = null;
        moving = true;
      } else if (!g.drag && g.speed > 0) {
        g.centre = spin(g.centre, dt, g.speed);
        moving = true;
      }
      const growing = !!g.selected && !g.turn && !linesDone(t - g.linesAt, g.buyers.length, g.reduced);
      const fading =
        (!!g.shapes && !g.reduced && t - g.shapesAt < LAND_FADE_MS + 32) || (!!g.earth?.ready && !g.reduced && t - g.earthAt < EARTH_FADE_MS + 32);
      // The slow turn alone moves less than a pixel a frame: it is drawn
      // 30 times a second (the turn still runs on the clock), everything
      // else at the screen's own rate.
      const spinOnly = moving && !g.turn && !g.glide && !g.drag && !growing && !fading && !g.dirty && g.speed === goal;
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

    // NASA's picture, in the copy this globe needs; never a smaller one
    // than it already has (a globe made larger asks again).
    const askForPicture = () => {
      const earth = g.earth;
      if (!earth || !g.earthAllowed || !g.size) return;
      const saveData = typeof navigator !== "undefined" && navigator.connection?.saveData === true;
      const wanted = earthPicture(g.size, g.dpr, { maxTexture: earth.maxTexture, saveData });
      if (!wanted || wanted <= g.earthWanted) return;
      g.earthWanted = wanted;
      loadPicture(wanted).then(
        (img) => {
          if (g.earth !== earth || wanted < g.earthWidth) return;
          const shown = earth.setPicture(img);
          // The first copy fades in; a larger one simply takes its place.
          if (shown && !g.earthWidth) g.earthAt = performance.now();
          g.earthWidth = wanted;
          g.glAt = null;
          if (shown) redraw();
        },
        () => {
          if (g.earthWanted === wanted) g.earthWanted = g.earthWidth;
        }
      );
    };

    // The box: both canvases match it (sharp on high-density screens). A
    // box too small to draw in is left alone: a screenshot tool shrinks the
    // window to a pixel or two for a moment, and the globe keeps its size.
    // Whether the page has something beside the globe is measured here too,
    // and where the disc sits in the window (for the dots' names).
    const fit = () => {
      const box = disc.getBoundingClientRect();
      const w = Math.round(box.width);
      if (!w || w < MIN_BOX) return;
      const view = document.documentElement.clientWidth || window.innerWidth || 0;
      g.discLeft = box.left;
      g.viewWidth = view;
      const room = Math.round(root.getBoundingClientRect().width);
      setShared(view > 0 && room < SHARED_BELOW * view);
      // The component's own width: a card or list on the page under a
      // small globe may use it (up to 560 px, earth.css), so a phone on its
      // side reads them in long lines rather than a narrow column.
      if (room !== g.room) {
        g.room = room;
        root.style.setProperty("--earth-room", `${room}px`);
      }
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (w === g.size && dpr === g.dpr) return;
      g.size = w;
      g.dpr = dpr;
      for (const c of [canvas, glCanvas]) {
        if (!c) continue;
        c.width = Math.round(w * dpr);
        c.height = Math.round(w * dpr);
      }
      g.projection.scale(discRadius(w)).translate([w / 2, w / 2]);
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

    // Off the screen or in a hidden tab, nothing is drawn.
    const seen =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[entries.length - 1];
              g.onScreen = entry.isIntersecting;
              root.toggleAttribute("data-offscreen", !g.onScreen);
              if (g.onScreen) kick();
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
    // a few pixels becomes a drag (and the click after it is swallowed).
    const inside = (e) => {
      const rect = disc.getBoundingClientRect();
      g.discLeft = rect.left; // kept fresh for the dots' names
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      return Math.hypot(x, y) <= rect.width / 2 + 4;
    };
    const onHover = (e) => {
      if (e.pointerType !== "mouse" || g.drag) return;
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
    const stopListening = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onDown = (e) => {
      if (e.button !== 0 || !e.isPrimary || g.drag) return;
      // A mouse press never starts a text selection or moves the focus here.
      if (e.pointerType === "mouse") e.preventDefault();
      g.swallowClick = false;
      g.glide = null;
      g.drag = { id: e.pointerId, kind: e.pointerType || "mouse", x: e.clientX, y: e.clientY, from: g.centre, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };
    const onMove = (e) => {
      const d = g.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < (SLOP[d.kind] ?? 4)) return;
        d.moved = true;
        g.turn = null; // a drag takes over from a turn on its way
        root.toggleAttribute("data-dragging", true);
      }
      // A finger turns it sideways only: up and down belongs to the page.
      g.centre = dragTo(d.from, dx, d.kind === "touch" ? 0 : dy, g.size / 2);
      d.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (d.samples.length > 8) d.samples.shift();
      g.dirty = true;
      kick();
    };
    const onUp = (e) => {
      const d = g.drag;
      if (!d || e.pointerId !== d.id) return;
      stopListening();
      g.drag = null;
      root.toggleAttribute("data-dragging", false);
      if (d.moved) {
        g.swallowClick = true;
        window.setTimeout(() => {
          g.swallowClick = false;
        }, 0);
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
    };
    const onCancel = (e) => {
      const d = g.drag;
      if (!d || e.pointerId !== d.id) return;
      stopListening();
      g.drag = null;
      g.hovering = false;
      root.toggleAttribute("data-dragging", false);
      kick();
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
      g.earth?.dispose();
      g.earth = null;
      g.earthAllowed = false;
      g.earthWanted = 0;
      g.earthWidth = 0;
      g.glAt = null;
      stopListening();
      sizes?.disconnect();
      seen?.disconnect();
      window.removeEventListener("resize", fit);
      pixels?.removeEventListener?.("change", onPixels);
      pixels = null;
      g.onPixels = null;
      root.toggleAttribute("data-gl-lost", false);
      document.removeEventListener("visibilitychange", onVisibility);
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

  // Reduced motion: no slow turn, no glide, no fades; a jump instead of a turn.
  useEffect(() => {
    g.reduced = reduced;
    if (reduced) {
      g.glide = null;
      if (g.turn) {
        g.centre = g.turn.to;
        g.turn = null;
        g.linesAt = performance.now();
      }
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
  // The turn itself is planned once the card is drawn (below): on a wide
  // globe the card's height decides where the event can go.
  const select = (id, { via = "pointer", opener = null } = {}) => {
    const e = byId.get(id);
    if (!e) return;
    const list = buyersOf(e, world.trade, world.countries);
    g.selected = e;
    g.buyers = list;
    g.glide = null;
    g.turn = null;
    const shapesNow = g.shapes;
    g.highlight = shapesNow ? list.map((b) => shapesNow.countries.get(String(world.countries?.[b.iso3]?.num || ""))).filter(Boolean) : [];
    openerRef.current = opener;
    focusCard.current = via === "list";
    openedVia.current = via;
    plannedFor.current = null;
    setSelectedId(id);
    setHint(false);
    invalidate();
  };

  const close = ({ restore = false } = {}) => {
    if (!g.selected) return;
    const hadFocus = !!cardRef.current?.contains(document.activeElement);
    g.selected = null;
    g.buyers = [];
    g.highlight = [];
    g.turn = null;
    plannedFor.current = null;
    setSelectedId(null);
    invalidate();
    if (restore || hadFocus) {
      const back = openerRef.current?.isConnected ? openerRef.current : hadFocus ? toggleRef.current : null;
      back?.focus({ preventScroll: true });
    }
    openerRef.current = null;
    // A card opened from the globe that scrolled the page down to show it
    // gives the globe back: the page scrolls up just enough to show the
    // whole globe again (unless the visitor has since scrolled away from it).
    const disc = discRef.current;
    if (scrolledDown.current && disc) {
      const r = disc.getBoundingClientRect();
      if (r.top < 0 && r.bottom > 0) disc.scrollIntoView({ block: "nearest", behavior: g.reduced ? "auto" : "smooth" });
    }
    scrolledDown.current = false;
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
  // page, and gives the focus back.
  useEffect(() => {
    if (!selectedId && !listOver) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (listOver) actions.current.closeList({ restore: true });
      else actions.current.close({ restore: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, listOver]);

  // Before the browser paints a new card (or the same card on a globe of
  // another size): where it goes. Over the globe it must show all its words
  // at once (nothing to scroll inside) and hide none of the lines: of the
  // two sides it takes the one that hides fewer of them (earthMath
  // sheetSide, sheetHides, with the turn the globe will really make). When
  // even that side hides some, it is tried again naming only the first four
  // countries (a shorter card); when it still does not fit or still hides
  // a line, it goes under the globe. Each try is drawn and measured before
  // anything is painted, so the visitor sees only where it ends up.
  useLayoutEffect(() => {
    if (!selected || fit?.done) return;
    const card = cardRef.current;
    if (!card || !g.size || !g.selected) return;
    if (place !== "over") {
      setFitted({ key: fitKey, place, side, short, done: true });
      return;
    }
    let best = null;
    if (card.scrollHeight <= card.clientHeight + 1) {
      const geometry = { size: g.size, sheetHeight: card.offsetHeight };
      const choice = sheetSide(g.selected, g.buyers, geometry);
      if (sheetHides(g.selected, g.buyers, geometry)[choice] === 0) best = choice;
    }
    if (best) setFitted({ key: fitKey, place: "over", side: best, short, done: true });
    else if (!short && g.buyers.length > CARD_COUNTRIES) setFitted({ key: fitKey, place: "over", side, short: true, done: false });
    else setFitted({ key: fitKey, place: shared ? "float" : "under", side, short: !wide, done: true });
  }, [fitKey, place, short, fit?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  // The turn to the chosen event, planned once its card has found its
  // place. Over the globe the event goes in the part the card leaves free
  // (earthMath eventSpot, centreFor); with the card under the globe the
  // globe looks between the event and the countries its lines go to
  // (globeMath aimFor). A card opened from the list takes the focus; one
  // under the globe is scrolled into view.
  const settled = !!fit?.done;
  useLayoutEffect(() => {
    if (!selectedId || !g.selected || !settled) return;
    const card = cardRef.current;
    let to;
    if (place === "over" && card && g.size) {
      const spot = eventSpot(side, g.size, card.offsetHeight, g.buyers.length > 0);
      to = centreFor(g.selected, spot.dx, spot.dy);
    } else {
      const aim = aimFor(g.selected, g.buyers);
      to = { lat: clamp(aim.lat, -MAX_TILT, MAX_TILT), lng: aim.lng };
    }
    g.aim = to;
    g.glide = null;
    if (g.reduced || arcDegrees(g.centre, to) < 0.05) {
      g.centre = to;
      g.turn = null;
      g.speed = 0;
      g.linesAt = performance.now();
    } else {
      g.turn = { from: g.centre, to, start: performance.now(), ms: turnMs(g.centre, to) };
    }
    g.dirty = true;
    kickRef.current();
    const fresh = plannedFor.current !== selectedId;
    plannedFor.current = selectedId;
    if (!fresh || !card) return;
    if (focusCard.current) {
      focusCard.current = false;
      cardTitleRef.current?.focus({ preventScroll: true });
    }
    // The whole card in the window: the page scrolls only as far as it
    // must, and not at all when the card already shows whole. (Scrolled
    // down for a card chosen on the globe, it scrolls back when it closes.)
    const box = card.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      card.scrollIntoView({ block: "nearest", behavior: g.reduced ? "auto" : "smooth" });
      scrolledDown.current = box.bottom > window.innerHeight && openedVia.current === "pointer";
    }
  }, [selectedId, fitKey, settled, place, side]); // eslint-disable-line react-hooks/exhaustive-deps

  // A click on a dot. The pin's click lands on the button it covers; with
  // two dots close together, the one nearer the click point wins. A click
  // made by the cursor assist (no position) is the button's own.
  const onMarkerClick = (event, id) => {
    let pick = id;
    const disc = discRef.current;
    if (disc && event.detail > 0 && (event.clientX || event.clientY)) {
      const rect = disc.getBoundingClientRect();
      pick = nearestMarker({ x: event.clientX - rect.left, y: event.clientY - rect.top }, g.spots, 24) || id;
    }
    if (pick !== selectedId) actions.current.select(pick, { via: "pointer" });
  };

  // A click on the bare globe closes the card.
  const onDiscClick = (event) => {
    if (event.target.closest?.(".earth-marker")) return;
    actions.current.close();
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
        speed: g.speed,
        turning: !!g.turn,
        dragging: !!g.drag?.moved,
        gliding: !!g.glide,
        hovering: g.hovering,
        selected: g.selected?.id || null,
        buyers: g.buyers.map((b) => b.iso3),
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
          shown: realShown(g, performance.now()),
          maxTexture: g.earth?.maxTexture || null,
          frames: g.glFrames,
          ms: g.glMs,
          error: g.earth?.error || null,
        },
      }),
      select: (id) => actions.current.select(id, { via: "pointer" }),
      close: () => actions.current.close(),
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
        g.turn = null;
        g.glide = null;
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
  } Today's armed conflicts are terracotta dots and disaster alerts amber ones. The list under the globe names each one.`;
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

  return (
    <figure ref={rootRef} className={`earth ${className}`.trim()} aria-labelledby={titleId} data-picked={selectedId ? "" : undefined}>
      <p id={titleId} className="sr-only">
        The Earth today: where the black soil lies, and today's armed conflicts and disaster alerts
      </p>
      <div className="earth-stage" data-card={place}>
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

        {selected && words && (
          <div
            ref={cardRef}
            className="earth-card"
            role="dialog"
            aria-modal="false"
            aria-labelledby={cardTitleId}
            data-kind={kindOf(selected)}
            data-side={side}
            data-columns={wide && words.buyers.length ? "2" : "1"}
          >
            <div className="earth-card-about">
              <h2 id={cardTitleId} ref={cardTitleRef} className="earth-card-title" tabIndex={-1}>
                {words.title}
              </h2>
              <p className="earth-card-meta">{words.meta}</p>
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
        )}

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

      <div className="earth-foot">
        <div className="earth-key-row">
          <ul className="earth-legend" aria-label="What the colours show">
            <li>
              {/* The black soil can be taken off the Earth and put back. */}
              <button type="button" className="earth-switch" aria-pressed={soilOn} onClick={() => setSoilOn((on) => !on)}>
                <span className="earth-key earth-key-soil" aria-hidden="true" />
                Black soil
              </button>
            </li>
            <li>
              <span className="earth-key earth-key-war" aria-hidden="true" />
              Armed conflicts
            </li>
            <li>
              <span className="earth-key earth-key-alert" aria-hidden="true" />
              Disaster alerts
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
          <a {...out} href="https://visibleearth.nasa.gov/images/73776">
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
