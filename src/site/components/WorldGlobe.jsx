// WHAT THIS FILE DOES
// The first screen of the About page: a large lit Earth filling the whole
// hero, whose black-soil belts glow ochre (OpenLandMap) and whose other
// cropland is sage (Copernicus), with today's armed conflicts and disaster
// alerts on it. The page's own words (the title, the sentence and the two
// actions, passed in as children by HomePage.jsx) sit over the Earth's
// left side, on a soft dark scrim that keeps them readable.
//
// What the visitor sees and can do:
//   - a tour: the camera visits Ukraine, then every other armed conflict
//     (each time the nearest), then up to three disaster alerts (red ones
//     still going on first), and comes back to rest over Ukraine. At each
//     stop a small tile names the event, says since when (or, for an alert
//     that is over, when it ran), and gives one fact; arcs run to the
//     countries whose food depends on it. "Pause tour" stops all of it.
//   - a row of toggles: the black-soil picture, the conflicts, the recent
//     orange and red alerts; under it one quiet line: how to turn the
//     Earth, and "Show minor alerts" (GDACS's green ones, hidden at first).
//   - pointing at a marker shows its tile and arcs; clicking one (or the
//     tile's link) flies there and opens a panel: what it is, whose food
//     depends on it (each figure with its year when it is not the table's
//     own), Ukraine's own measurement, previous and next.
//   - dragging turns the Earth (no text is selected while it turns, and no
//     arc is ever drawn over the words); the keyboard reaches every event
//     through one list (Tab to the globe, then the arrow keys and Enter).
//   - zooming, between a height that shows one country and today's layout
//     (src/lib/wheelZoom.js globeZoomLimits): a pinch on a trackpad (the
//     browser sends it as wheel events with ctrlKey) or on a phone zooms at
//     once, a double-click on the bare Earth zooms in one step, and so do
//     the + and - keys while the globe (its list) has the focus. A plain
//     two-finger scroll keeps scrolling the page, unless the visitor has
//     clicked, dragged or zoomed the Earth in the last 10 seconds
//     ("engaged"): then the wheel zooms it, and the quiet line says
//     "Scroll to zoom. Esc to let the page scroll." Leaving the hero,
//     scrolling it away or pressing Esc disengages. The tour waits while
//     the visitor is zoomed in, and goes on when they zoom back out or
//     press Play. The camera eases towards each zoom (no easing for
//     visitors who asked for reduced motion).
//
// Order of arrival: the words, the controls and a still picture of the
// Earth come first (index.html already asks for the still at high priority
// on the About page); at 600 ms Ukraine's marker and tile rise on the
// still; once the still is decoded and on screen, the 3D (globeScene.js,
// three.js, and the Earth's pictures) loads and fades in over it, then the
// markers ripple out from Ukraine and the tour starts. A visitor who leaves
// first starts none of that download (and the pictures already asked for
// are cancelled). Without WebGL, on a device with under 2 GB of memory,
// or with Save-Data or a 2G connection, the still stays and everything
// except the flights still works (Save-Data visitors can ask for the live
// globe).
//
// Motion: one animation loop draws only when something moves: 60 frames a
// second while the camera flies or is dragged, 30 while the rings pulse,
// one frame per change otherwise, and none at all when the tour is paused
// or at rest, the tab is hidden, under 15% of the first screen is visible,
// or the phone menu is open. Visitors who asked for reduced motion get the
// globe at rest, with "Play tour", cuts instead of flights, no rings and
// no travelling dashes.
//
// Where the data comes from: worldData.js (the live feed, the countries,
// the trade table). The arithmetic (sizes, aims, the tour's order, the
// words of the tile) is in globeMath.js and is tested there. Styles:
// components/globe.css. Checks: ?globe-debug=1 exposes
// window.__globe = { frames, log, layout }; &words=0 hides the words.
// ?globe-still=wide|tall draws the still picture alone and leaves it in
// window.__globeStill (a PNG, with its size and crop), for making
// public/site/world/globe-still-*.webp: cut to the crop (STILLS below) and
// saved as WebP at quality 66. After a new trade table, check that
// STILLS.wide.view is still Ukraine's tour stop (aimFor with its buyers);
// within 1.5 degrees the 3D simply starts there.
//
// WHO EDITS IT
// Whoever works on the globe.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMediaQuery } from "../hooks.js";
import { useWorldData } from "./worldData.js";
import {
  aimFor,
  aimInside,
  angularDistance,
  buyerYearNote,
  buyersOf,
  captionFor,
  clamp,
  countText,
  flightMs,
  globeLayout,
  isMinorAlert,
  measuredSentence,
  optionText,
  panelMeta,
  percent,
  placeCaption,
  projectOnView,
  ringPeriod,
  shiftToward,
  sphereRadiusPx,
  textureSize,
  tourStops,
  tradeSource,
  tradeYear,
  viewAlong,
} from "./globeMath.js";
import { GLOBE_ZOOM_STEP, approach, globeZoomFactor, globeZoomLimits, isZoomedIn } from "../../lib/wheelZoom.js";
import "./globe.css";

// The pictures of the Earth shown until the 3D is drawn, made from the real
// scene (?globe-still=wide|tall) at these views: Ukraine's tour stop on a
// 1440x900 screen and on a 390x844 phone. Each is drawn as a square 1.3
// times the sphere's width ("size" pixels a side, so the sphere is
// size / 1.3 across), then cut down to the part a first screen of that
// shape can ever show ("crop": left, top, right and bottom, in sphere
// widths from the sphere's centre), so no byte is spent on Earth that is
// off the screen.
const STILLS = {
  wide: { src: "/site/world/globe-still-wide.webp", size: 2000, crop: { left: -0.56, top: -0.4, right: 0.44, bottom: 0.32 }, view: { lat: 43.874, lng: 31.9503 }, altitude: 0.5424, light: "landscape", fine: true },
  tall: { src: "/site/world/globe-still-tall.webp", size: 1300, crop: { left: -0.47, top: -0.58, right: 0.47, bottom: 0.58 }, view: { lat: 35.8798, lng: 36.6 }, altitude: 2.043, light: "portrait", fine: false },
};
// A still's cut picture in pixels, across or down (for a crop span in sphere widths).
const stillPixels = (still, span) => Math.round((span / 1.3) * still.size);
const SKIN = (kind, px) => `/site/world/earth-${kind}-${px}.webp`;
const WATER = "/site/world/earth-water-1024.webp";
const UKRAINE = "war-ukraine";
const SELECT_ZOOM = 0.82; // the camera comes closer while the panel is open
const HOLD_MS = { first: 7000, other: 6000 };
const KEY_FLIGHT_MS = 700;
const SELECT_FLIGHT_MS = 1000;
const SETTLE_FLIGHT_MS = 900;
const HOVER_IN_MS = 120;
const HOVER_OUT_MS = 600;
const POINTER_GRACE_MS = 3000;
const LOW_FPS_GAP = 1000 / 30 - 4;
const MARKER_ALTITUDE = 0.006;
const LAT_LIMIT = { min: (25 * Math.PI) / 180, max: (155 * Math.PI) / 180 }; // 65° north to 65° south
const COLOURS = { war: "#e2603f", alert: "#f3f3f0", soil: "#b8733a" };
const SCRIM_FADE = 160; // px over which the scrim under the words fades out
const ARC_CLEARANCE = 16; // px an arc keeps from the words and the controls
const ENGAGED_MS = 10000; // after a click, drag or zoom, the wheel zooms the Earth this long
const ZOOM_SHARE = 0.3; // of the remaining way to the zoom goal, each frame (light damping)
const ZOOM_HINT = "Scroll to zoom. Esc to let the page scroll.";
const SHARP_PX = 3600; // the largest Earth picture, fetched for a close-up on a screen that started smaller
const SHARP_BELOW = 0.55; // of the layout's height: zoomed in past this, the sharp picture is wanted

// ---------- Small helpers ----------

function readParams() {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  return { debug: q.get("globe-debug") === "1", still: q.get("globe-still"), noWords: q.get("words") === "0" };
}

// A quiet moment for the next step of the work: after the next frame is drawn.
function afterFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

let webglChecked = null;
// Whether this browser can draw WebGL, asked once per visit; the test
// context is let go at once, so it never counts against the page.
function canDraw3D() {
  if (webglChecked !== null) return webglChecked;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    webglChecked = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglChecked = false;
  }
  return webglChecked;
}

// "off": no 3D at all; "ask": only if the visitor asks (Save-Data, 2G);
// "yes": load it.
function threeDPolicy() {
  if (typeof window === "undefined" || !canDraw3D()) return "off";
  const memory = navigator.deviceMemory;
  if (typeof memory === "number" && memory < 2) return "off";
  const connection = navigator.connection;
  if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ""))) return "ask";
  return "yes";
}

// The picture fetched and decoded away from the page's main work. signal:
// an AbortController's, so a visitor who leaves the page stops the download.
async function decodeImage(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const blob = await res.blob();
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const img = new Image();
  const src = URL.createObjectURL(blob);
  img.src = src;
  await img.decode();
  URL.revokeObjectURL(src);
  return img;
}

// Waits until the still picture is decoded and can be drawn (or has failed:
// the 3D then simply starts).
function stillReady(img) {
  if (!img) return Promise.resolve();
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  if (typeof img.decode === "function") return img.decode().catch(() => {});
  return new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  });
}

function relRect(el, root) {
  if (!el || !root) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 && r.height < 1) return null;
  const o = root.getBoundingClientRect();
  return { left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top };
}

function inside(p, rect, pad = 12) {
  return !!rect && p.x > rect.left - pad && p.x < rect.right + pad && p.y > rect.top - pad && p.y < rect.bottom + pad;
}

function kindOf(e) {
  return e.kind === "war" ? "war" : "alert";
}

// Whether an event's layer is switched on: the conflicts; the orange and
// red alerts; the minor (green) alerts only when asked for as well.
function isShown(e, show) {
  if (!e) return false;
  if (e.kind === "war") return !!show.war;
  return !!show.alert && (!isMinorAlert(e) || !!show.minor);
}

function markerClass(e) {
  return e.kind === "war" ? "globe-marker is-war" : `globe-marker is-alert is-${e.level || "green"}`;
}

function ringed(e) {
  return e.kind === "war" || e.level === "red";
}

// The first estimate of the hero's size, before it can be measured: the
// window minus the menu bar, at least 520 px.
function guessSize() {
  if (typeof window === "undefined") return { W: 1440, H: 828 };
  const nav = window.innerWidth <= 860 ? 60 : 72;
  return { W: window.innerWidth, H: Math.max(520, window.innerHeight - nav) };
}

// ---------- The still picture maker (?globe-still=wide|tall) ----------

function StillMaker({ kind }) {
  const hostRef = useRef(null);
  const world = useWorldData();
  useEffect(() => {
    const still = STILLS[kind];
    if (!still || world.status !== "ok" || !hostRef.current) return undefined;
    let api = null;
    let alive = true;
    (async () => {
      const mod = await import("./globeScene.js");
      if (!alive) return;
      const S = still.size;
      const D = S / 1.3;
      // A camera at the reference height, with the field of view widened so
      // the sphere is D pixels across in an S-pixel square.
      const half = Math.asin(1 / (1 + still.altitude));
      const focal = D / 2 / Math.tan(half);
      const fov = (2 * Math.atan(S / 2 / focal) * 180) / Math.PI;
      // Shaded the way the screen it stands in for draws the Earth (a phone:
      // plain shading, no glint on the water).
      api = mod.createGlobeScene(hostRef.current, { width: S, height: S, view: { ...still.view, altitude: still.altitude }, light: still.light, fine: still.fine, dpr: 1, still: true, fov });
      const [skin, water] = await Promise.all([decodeImage(SKIN("soil", 3600)), decodeImage(WATER)]);
      if (!alive) return;
      api.setSkin(api.textureFrom(skin));
      if (still.fine) api.setWater(api.textureFrom(water, { colour: false }));
      await api.compile();
      api.render();
      const ukraine = world.events.find((e) => e.id === UKRAINE);
      window.__globeStill = {
        dataURL: api.canvas.toDataURL("image/png"),
        size: S,
        crop: still.crop,
        view: still.view,
        ukraine: ukraine ? projectOnView(ukraine, { ...still.view, altitude: still.altitude }) : null,
      };
    })().catch((error) => {
      window.__globeStill = { error: String(error) };
    });
    return () => {
      alive = false;
      api?.dispose();
    };
  }, [kind, world]);
  return <div className="globe-still-maker" ref={hostRef} data-ui aria-hidden="true" />;
}

// ---------- The globe ----------

export default function WorldGlobe({ children }) {
  const params = useMemo(readParams, []);
  if (params.still && STILLS[params.still]) return <StillMaker kind={params.still} />;
  return <Globe params={params}>{children}</Globe>;
}

function Globe({ params, children }) {
  const world = useWorldData();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");

  const rootRef = useRef(null);
  const canvasHostRef = useRef(null);
  const markersRef = useRef(null);
  const wordsRef = useRef(null);
  const dockRef = useRef(null);
  const hintRef = useRef(null);
  const scrimRef = useRef(null);
  const stillRef = useRef(null);
  const floatRef = useRef(null);
  const panelRef = useRef(null);
  const panelHeadRef = useRef(null);
  const listRef = useRef(null);
  const openerRef = useRef(null);

  const [size, setSize] = useState(guessSize);
  const layout = useMemo(() => globeLayout(size.W, size.H), [size.W, size.H]);
  const landscape = layout.mode === "landscape";
  const still = landscape ? STILLS.wide : STILLS.tall;

  const [policy, setPolicy] = useState("wait"); // wait | yes | ask | off
  const [scene, setScene] = useState("still"); // still | live | failed
  const [show, setShow] = useState({ soil: true, war: true, alert: true, minor: false });
  const [turned, setTurned] = useState(false); // the visitor has dragged the Earth once
  const [tour, setTour] = useState(() => (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "rest" : "running"));
  const [activeId, setActiveId] = useState(UKRAINE);
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [captionGone, setCaptionGone] = useState(false);
  const [risen, setRisen] = useState(false); // 600 ms after the words
  const [dimKind, setDimKind] = useState(null);
  const [brightBuyer, setBrightBuyer] = useState(null);
  // The visitor has clicked, dragged or zoomed the Earth in the last 10 s:
  // the wheel zooms it instead of scrolling the page.
  const [engaged, setEngaged] = useState(false);
  const engageTimer = useRef(0);
  // The visitor has zoomed in close on a screen that started with the
  // smaller Earth picture: the sharp one is wanted (see the pictures below).
  const [sharp, setSharp] = useState(false);

  const live = scene === "live";
  const no3D = policy === "off" || scene === "failed" || (policy === "ask" && !live);
  const docked = !landscape || no3D;

  // ---------- The data ----------

  const events = world.events;
  // "Today" for the alerts' dates is the feed's own time (when GDACS was read).
  const now = world.updated || undefined;
  const commonYear = tradeYear(world.trade);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const counts = useMemo(
    () => ({
      war: events.filter((e) => e.kind === "war").length,
      alert: events.filter((e) => e.kind !== "war" && !isMinorAlert(e)).length,
      minor: events.filter((e) => isMinorAlert(e)).length,
    }),
    [events]
  );
  const stops = useMemo(() => tourStops(events, { now }), [events, now]);
  // The keyboard's order: the tour, then the other alerts.
  const order = useMemo(() => {
    const seen = new Set(stops.map((e) => e.id));
    return [...stops, ...events.filter((e) => !seen.has(e.id))];
  }, [stops, events]);
  const shownOrder = useMemo(() => order.filter((e) => isShown(e, show)), [order, show]);
  const buyersCache = useMemo(() => new Map(), [world.trade, world.countries]);
  const buyersFor = useCallback(
    (e) => {
      if (!e) return [];
      if (!buyersCache.has(e.id)) buyersCache.set(e.id, buyersOf(e, world.trade, world.countries));
      return buyersCache.get(e.id);
    },
    [buyersCache, world.trade, world.countries]
  );

  const focusId = hoverId || activeId;
  const focusEvent = byId.get(focusId) || null;
  const selected = byId.get(selectedId) || null;
  const feedFailed = world.status === "failed";
  const empty = world.status === "ok" && events.length === 0;
  const nothingShown = world.status === "ok" && events.length > 0 && !show.war && !show.alert;

  // ---------- The engine: what the animation loop reads and keeps ----------

  const eng = useRef(null);
  if (!eng.current) {
    eng.current = {
      api: null,
      raf: 0,
      timer: 0,
      lastTick: 0,
      lastRender: 0,
      needsRender: true,
      needsPlace: true,
      frames: 0,
      flight: null, // { from, to, start, ms, kind, onProgress, onDone, swapped }
      hold: { left: HOLD_MS.first, since: null },
      stopIndex: 0,
      endedAtEnd: false,
      pointerOn: false,
      pointerResumeAt: 0,
      dragging: false,
      easing: false, // the globe still turning after a drag
      entranceUntil: 0,
      ringClock: 0,
      dashClock: 0,
      visible: 1,
      hidden: false,
      menuOpen: false,
      markers: new Map(), // id -> button
      lastCam: "",
      tiles: {},
      captionSize: { w: 300, h: 120 },
      captionAt: null,
      skins: null,
      downloads: null, // the AbortController of the 3D's pictures
      // Zooming (see the top of this file).
      zoomGoal: null, // the altitude the camera is easing towards, or null
      userZoom: false, // the camera is where the visitor zoomed it (not a flight)
      zoomPaused: false, // the tour was paused by a zoom and resumes on zooming out
      engagedUntil: 0,
      altAtDragStart: null,
      sharpAsked: false, // the sharp Earth picture has been asked for (once per 3D)
      state: {},
    };
  }
  const debugRef = useRef(params.debug ? { frames: 0, log: [], layout } : null);

  const note = useCallback((type, data) => {
    if (!debugRef.current) return;
    debugRef.current.log.push({ t: Math.round(performance.now()), type, ...data });
    window.__globe = debugRef.current;
  }, []);

  // The loop reads React's state through this copy, refreshed after every render.
  useLayoutEffect(() => {
    eng.current.state = { tour, show, activeId, hoverId, selectedId, layout, reduced, fine, landscape, stops, byId, brightBuyer, live };
  });

  const motionOn = useCallback(() => {
    const s = eng.current.state;
    return !s.reduced && s.tour === "running" && s.live;
  }, []);

  const runnable = useCallback(() => {
    const e = eng.current;
    return !!e.api && !e.hidden && e.visible >= 0.15 && !e.menuOpen;
  }, []);

  // ---------- The tour clock: a stopwatch that only runs while it should ----------

  const syncHold = useCallback(
    (now) => {
      const e = eng.current;
      const s = e.state;
      if (e.hold.since !== null) {
        e.hold.left -= now - e.hold.since;
        e.hold.since = null;
      }
      const counting = s.tour === "running" && !e.flight && !s.selectedId && !e.pointerOn && now >= e.pointerResumeAt && runnable();
      if (counting) e.hold.since = now;
    },
    [runnable]
  );

  // ---------- Placing the markers and the tile ----------

  const placeMarkers = useCallback(() => {
    const e = eng.current;
    const api = e.api;
    if (!api) return;
    const s = e.state;
    const t = e.tiles;
    // Under the words or the controls every marker fades, the focused one
    // too (only a drag can put it there); under the tile or the panel all
    // but the focused one.
    const fixed = [t.words, t.dock, t.hint].filter(Boolean);
    const floating = [s.selectedId ? t.panel : null, e.captionAt].filter(Boolean);
    const rings = motionOn();
    const current = s.selectedId || s.hoverId || s.activeId;
    for (const [id, el] of e.markers) {
      const p = api.projectPoint(el._point);
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      const back = !p.visible;
      if (el._back !== back) {
        el._back = back;
        el.classList.toggle("is-back", back);
      }
      const under = !back && (fixed.some((r) => inside(p, r)) || (id !== current && floating.some((r) => inside(p, r))));
      if (el._under !== under) {
        el._under = under;
        el.classList.toggle("is-under", under);
      }
      if (el._ringed) api.showRing(id, rings && !back && !under && isShown(el._event, s.show));
    }
    // No arc is drawn over the words or the controls, whichever way the
    // Earth has been turned: a point of an arc shows unless the Earth hides
    // it (behind it, inside its disc).
    const L = s.layout;
    const sphere = sphereRadiusPx(L.H, api.getView().altitude);
    const clear = [t.words, t.dock, t.hint].filter(Boolean);
    api.fitArcs((points) => points.some((p) => (p.visible || Math.hypot(p.x - L.cx, p.y - L.cy) > sphere) && clear.some((r) => inside(p, r, ARC_CLEARANCE))));
  }, [motionOn]);

  // The tile beside the focused marker (on a wide screen).
  const placeFloat = useCallback(() => {
    const e = eng.current;
    const el = floatRef.current;
    const s = e.state;
    const ev = s.byId.get(s.hoverId || s.activeId);
    if (!el || !e.api || !s.landscape || !ev || s.selectedId) {
      e.captionAt = null;
      return;
    }
    const p = e.api.project(ev.lat, ev.lng, MARKER_ALTITUDE);
    const t = e.tiles;
    // A tile whose marker the visitor has turned behind the Earth or under
    // the words waits, hidden, until the marker is back in sight.
    const away = !p.visible || [t.words, t.dock, t.hint].some((r) => inside(p, r));
    if (away) el.dataset.away = "";
    else delete el.dataset.away;
    if (away) {
      e.captionAt = null;
      return;
    }
    const { w, h } = e.captionSize;
    const spot = placeCaption(p, { w, h }, { W: s.layout.W, H: s.layout.H, inset: 16 }, [t.words, t.dock, t.hint].filter(Boolean));
    el.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`;
    e.captionAt = { left: spot.x, top: spot.y, right: spot.x + w, bottom: spot.y + h };
  }, []);

  const draw = useCallback(
    (now) => {
      const e = eng.current;
      const api = e.api;
      if (!api) return;
      if (motionOn()) {
        api.moveRings(e.ringClock);
        api.moveDashes(e.dashClock);
      }
      api.syncCamera();
      const c = api.camera.position;
      const camKey = `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)}`;
      if (camKey !== e.lastCam || e.needsPlace) {
        e.lastCam = camKey;
        e.needsPlace = false;
        placeFloat();
        placeMarkers();
      }
      api.render();
      e.frames += 1;
      e.lastRender = now;
      e.needsRender = false;
      if (debugRef.current) {
        debugRef.current.frames = e.frames;
        debugRef.current.view = api.getView();
        window.__globe = debugRef.current;
      }
    },
    [motionOn, placeFloat, placeMarkers]
  );

  const frameRef = useRef(null);

  const kick = useCallback(() => {
    const e = eng.current;
    if (e.raf || !runnable()) return;
    e.lastTick = performance.now();
    e.raf = requestAnimationFrame((t) => frameRef.current(t));
  }, [runnable]);

  const invalidate = useCallback(
    (place = false) => {
      const e = eng.current;
      e.needsRender = true;
      if (place) e.needsPlace = true;
      kick();
    },
    [kick]
  );

  // Wakes the loop at the next timed event when nothing is moving (a tour
  // with reduced motion, the pointer's grace time).
  const scheduleWake = useCallback(
    (now) => {
      const e = eng.current;
      clearTimeout(e.timer);
      e.timer = 0;
      if (e.state.tour !== "running" || !runnable() || e.raf) return;
      let wait = Infinity;
      if (e.hold.since !== null) wait = Math.max(0, e.hold.left);
      else if (!e.pointerOn && now < e.pointerResumeAt) wait = e.pointerResumeAt - now;
      if (Number.isFinite(wait)) e.timer = setTimeout(() => kick(), wait + 5);
    },
    [kick, runnable]
  );

  // ---------- Flights ----------

  const flyTo = useCallback(
    (target, ms, kind, { onProgress, onDone } = {}) => {
      const e = eng.current;
      const api = e.api;
      if (!api) {
        onDone?.();
        return;
      }
      if (e.state.reduced || ms <= 0) {
        api.setView(target);
        e.flight = null;
        onProgress?.(1);
        onDone?.();
        invalidate(true);
        return;
      }
      // A drag's leftover drift is spent before the flight takes over.
      const c = api.controls;
      c.enableDamping = false;
      c.update();
      c.enableDamping = true;
      e.easing = false;
      // A flight owns the camera: any zoom still easing is let go, and
      // where the flight lands is not the visitor's own zoom any more.
      e.zoomGoal = null;
      e.userZoom = false;
      const now = performance.now();
      const from = api.getView();
      e.flight = { from, to: target, start: now, ms, kind, onProgress, onDone };
      note("fly", { kind, ms: Math.round(ms), deg: Math.round(angularDistance(from, target) * 10) / 10 });
      syncHold(now);
      invalidate(true);
    },
    [invalidate, note, syncHold]
  );

  // ---------- Arcs and rings ----------

  const setArcsFor = useCallback(
    (id) => {
      const e = eng.current;
      const api = e.api;
      if (!api) return;
      const ev = id ? e.state.byId.get(id) : null;
      if (!ev || !isShown(ev, e.state.show)) {
        api.setArcs([]);
        return;
      }
      const list = [];
      buyersFor(ev).forEach((b, i) => {
        const base = { iso3: b.iso3, startLat: ev.lat, startLng: ev.lng, endLat: b.lat, endLng: b.lng, stroke: 0.22 + b.share * 1.4, autoScale: 0.32 };
        list.push({ ...base, kind: "route", opacity: 0.35 });
        list.push({ ...base, kind: "ship", opacity: 0.95, dashSize: 0.22, gapSize: 1.2, dashOffset: i * 0.15 });
      });
      api.setArcs(list);
      e.dashClock = 0;
      // Which of them would cross the words is worked out with the markers.
      e.needsPlace = true;
    },
    [buyersFor]
  );

  // Running the tour: faint routes with bright shipments travelling along
  // them. At rest, paused or with the panel open: the routes alone, solid.
  const styleArcs = useCallback(() => {
    const e = eng.current;
    if (!e.api) return;
    const shipping = motionOn() && !e.state.selectedId;
    e.api.styleArcs({ routeOpacity: shipping ? 0.35 : 0.9, shipping, bright: e.state.brightBuyer });
  }, [motionOn]);

  const updateRings = useCallback(() => {
    const e = eng.current;
    const api = e.api;
    if (!api) return;
    if (!motionOn()) {
      api.setRings([]);
      return;
    }
    const s = e.state;
    const list = [];
    for (const ev of s.byId.values()) {
      if (!ringed(ev) || !isShown(ev, s.show)) continue;
      list.push({ id: ev.id, lat: ev.lat, lng: ev.lng, colour: ev.kind === "war" ? COLOURS.war : COLOURS.alert, alpha: ev.kind === "war" ? 0.9 : 0.7, period: ringPeriod(ev.id), phase: ringPeriod(`${ev.id}:phase`) });
    }
    api.setRings(list);
    e.needsPlace = true;
  }, [motionOn]);

  // ---------- Where each stop is seen from ----------

  // The part of the screen the event should sit in: on a phone between the
  // controls and the words (or the panel); on a wide screen right of the
  // words and the controls (and left of the panel when it is open).
  const freeRect = useCallback((withPanel) => {
    const e = eng.current;
    const s = e.state;
    const L = s.layout;
    const t = e.tiles;
    if (s.landscape) {
      const left = Math.max(t.words?.right ?? 0, t.dock?.right ?? 0, t.hint?.right ?? 0) + 24;
      const right = withPanel && t.panel ? t.panel.left - 24 : L.W;
      if (right - left < 120) return null;
      return { left, right, top: 0, bottom: L.H };
    }
    const top = (t.dock?.bottom ?? 0) + 8;
    const bottom = (withPanel && t.panel ? t.panel.top : Math.min(t.hint?.top ?? L.H, t.words?.top ?? L.H)) - 8;
    if (bottom - top < 80) return null;
    return { left: 0, right: L.W, top, bottom };
  }, []);

  // Wide screen, panel closed: between the event and its buyers, but never
  // under the words. Otherwise: the event in the middle of the free part.
  const viewFor = useCallback(
    (ev, { zoom = false } = {}) => {
      const s = eng.current.state;
      const altitude = s.layout.altitude * (zoom ? SELECT_ZOOM : 1);
      const free = freeRect(zoom);
      if (s.landscape && !zoom) return { ...aimInside(ev, buyersFor(ev), s.layout, free, altitude), altitude };
      const shift = free ? shiftToward(s.layout, free, altitude) : null;
      return { ...aimFor(ev, buyersFor(ev), { shift, altitude }), altitude };
    },
    [buyersFor, freeRect]
  );

  // ---------- The tour ----------

  const nextStop = useCallback((from) => {
    const s = eng.current.state;
    for (let i = from + 1; i < s.stops.length; i++) if (isShown(s.stops[i], s.show)) return i;
    return -1;
  }, []);

  const arrive = useCallback(
    (index, ev) => {
      const e = eng.current;
      e.stopIndex = index;
      if (!isShown(ev, e.state.show) && e.state.tour === "running") {
        // Its kind was switched off while the camera flew there: on at once.
        e.hold = { left: 0, since: null };
        setActiveId(ev.id);
        invalidate(true);
        return;
      }
      e.hold = { left: index === 0 ? HOLD_MS.first : HOLD_MS.other, since: null };
      e.state.activeId = ev.id;
      setActiveId(ev.id);
      setCaptionGone(false);
      note("arrive", { id: ev.id, index });
      const now = performance.now();
      syncHold(now);
      setArcsFor(ev.id);
      styleArcs();
      invalidate(true);
      scheduleWake(now);
    },
    [invalidate, note, scheduleWake, setArcsFor, styleArcs, syncHold]
  );

  const goToStop = useCallback(
    (index, { home = false } = {}) => {
      const e = eng.current;
      const s = e.state;
      const ev = s.stops[index];
      if (!ev || !e.api) return;
      const target = viewFor(ev);
      const ms = flightMs(angularDistance(e.api.getView(), target));
      note("depart", { from: s.activeId, to: ev.id, index, home });
      e.api.setArcs([]);
      if (s.landscape) setCaptionGone(true);
      flyTo(target, ms, "tour", {
        onProgress: (t) => {
          // On a phone the docked tile changes over at 60% of the flight.
          const f = eng.current.flight;
          if (!eng.current.state.landscape && t >= 0.6 && f && !f.swapped) {
            f.swapped = true;
            setActiveId(ev.id);
          }
        },
        onDone: () => {
          if (!home) {
            arrive(index, ev);
            return;
          }
          e.stopIndex = index;
          e.endedAtEnd = true;
          setActiveId(ev.id);
          setCaptionGone(false);
          setTour("rest");
          note("rest", { id: ev.id });
          setArcsFor(ev.id);
          invalidate(true);
        },
      });
    },
    [arrive, flyTo, invalidate, note, setArcsFor, viewFor]
  );

  const advance = useCallback(() => {
    const e = eng.current;
    const next = nextStop(e.stopIndex);
    if (next >= 0) {
      goToStop(next);
      return;
    }
    // The loop is done: back to Ukraine (the first stop shown) to rest.
    const home = e.state.stops.findIndex((ev) => isShown(ev, e.state.show));
    if (home >= 0) goToStop(home, { home: true });
    else setTour("rest");
  }, [goToStop, nextStop]);

  // The tour's first stop, once both the 3D and the events are here. The
  // 3D starts exactly where the still picture was drawn from; when the first
  // stop's own view is more than 1.5 degrees away (a screen of another shape,
  // or a newer trade table moving the aim a little), the camera settles
  // there before the clock starts. Closer than that it simply stays.
  const startTour = useCallback(() => {
    const e = eng.current;
    const s = e.state;
    if (e.started || !e.api) return;
    const first = s.byId.get(s.activeId);
    if (!first) return;
    e.started = true;
    const index = Math.max(0, s.stops.findIndex((ev) => ev.id === s.activeId));
    const target = viewFor(first);
    if (angularDistance(e.api.getView(), target) > 1.5) flyTo(target, SETTLE_FLIGHT_MS, "settle", { onDone: () => arrive(index, first) });
    else arrive(index, first);
  }, [arrive, flyTo, viewFor]);

  // A deliberate act (a drag, a click on a marker, the keyboard on the
  // globe) ends the tour for this visit; "Play tour" picks it up again.
  const endTour = useCallback(() => {
    const e = eng.current;
    if (e.state.tour !== "rest") {
      e.endedAtEnd = false;
      e.state.tour = "rest";
      setTour("rest");
      note("end", {});
    }
    if (e.flight?.kind === "tour") e.flight = null;
    e.zoomPaused = false;
    setCaptionGone(false);
  }, [note]);

  // ---------- Zooming ----------

  // The visitor has just clicked, dragged or zoomed the Earth: for the
  // next 10 s the wheel zooms it (and the quiet line says so).
  const engage = useCallback(() => {
    const e = eng.current;
    e.engagedUntil = performance.now() + ENGAGED_MS;
    clearTimeout(engageTimer.current);
    engageTimer.current = setTimeout(() => {
      eng.current.engagedUntil = 0;
      setEngaged(false);
    }, ENGAGED_MS);
    setEngaged(true);
  }, []);

  const disengage = useCallback(() => {
    eng.current.engagedUntil = 0;
    clearTimeout(engageTimer.current);
    engageTimer.current = 0;
    setEngaged(false);
  }, []);
  useEffect(() => () => clearTimeout(engageTimer.current), []);

  // Where the camera may be: from one country to today's layout.
  const zoomLimits = useCallback(() => globeZoomLimits(eng.current.state.layout.altitude), []);

  // Multiplies the camera's altitude (below 1 zooms in) and lets the loop
  // ease there. A tour flight under way is cut (the tour then waits).
  const zoomBy = useCallback(
    (factor) => {
      const e = eng.current;
      const api = e.api;
      if (!api || !Number.isFinite(factor) || factor <= 0) return;
      const { near, far } = zoomLimits();
      const from = e.zoomGoal ?? api.getAltitude();
      const goal = clamp(from * factor, near, far);
      if (e.flight) {
        if (e.flight.kind === "tour") e.hold = { left: 0, since: null }; // the cut flight is flown again on resuming
        e.flight = null;
      }
      e.zoomGoal = goal;
      e.userZoom = true;
      note("zoom", { goal: Math.round(goal * 1000) / 1000 });
      invalidate(true);
    },
    [invalidate, note, zoomLimits]
  );
  const togglePlayRef = useRef(null);

  // ---------- The loop ----------

  frameRef.current = (now) => {
    const e = eng.current;
    e.raf = 0;
    if (!runnable()) {
      syncHold(now);
      return;
    }
    const dt = Math.min(100, Math.max(0, now - e.lastTick));
    e.lastTick = now;
    const api = e.api;
    // The camera: a zoom easing towards its goal, a flight, or a drag and
    // its easing out.
    if (e.zoomGoal !== null && !e.flight) {
      const next = e.state.reduced ? e.zoomGoal : approach(api.getAltitude(), e.zoomGoal, ZOOM_SHARE, 0.0005);
      api.setAltitude(next);
      api.setDragSpeed();
      if (next === e.zoomGoal) e.zoomGoal = null;
      e.needsRender = true;
    }
    if (e.flight) {
      const f = e.flight;
      const t = clamp((now - f.start) / f.ms, 0, 1);
      api.setView(viewAlong(f.from, f.to, t));
      f.onProgress?.(t);
      if (t >= 1) {
        e.flight = null;
        note("landed", { kind: f.kind, ms: Math.round(now - f.start) });
        f.onDone?.();
        // Which arcs would cross the words depends on the view: once the
        // camera has arrived, they are worked out again (a tour stop does it
        // as it arrives).
        if (f.kind !== "tour" && f.kind !== "settle") {
          const s = e.state;
          setArcsFor(s.selectedId || s.hoverId || s.activeId);
          styleArcs();
        }
      }
      e.needsRender = true;
    } else if (e.dragging || e.easing) {
      const moved = api.controls.update();
      if (!e.dragging) e.easing = moved;
      if (moved) e.needsRender = true;
    }
    if (motionOn()) {
      e.ringClock += dt;
      e.dashClock += dt;
    }
    // The tour waits while the visitor is zoomed in, and goes on once they
    // are back out (or press Play).
    if (e.userZoom && !e.flight) {
      const zoomedIn = isZoomedIn(api.getAltitude(), e.state.layout.altitude);
      // Close up on a screen that started with the smaller picture: the
      // sharp one is fetched (once) and swapped in by the pictures' effect.
      if (!e.sharpAsked && e.skins && e.skins.px < SHARP_PX && api.getAltitude() < e.state.layout.altitude * SHARP_BELOW) {
        e.sharpAsked = true;
        note("sharp", { from: e.skins.px });
        setSharp(true);
      }
      if (zoomedIn && e.state.tour === "running") {
        e.zoomPaused = true;
        e.state.tour = "paused";
        setTour("paused");
        note("zoom-pause", {});
      } else if (!zoomedIn && e.zoomPaused && e.state.tour === "paused" && e.zoomGoal === null) {
        e.zoomPaused = false;
        e.userZoom = false;
        note("zoom-resume", {});
        togglePlayRef.current?.();
      }
    }
    // The tour moves on when the stop has been held long enough.
    syncHold(now);
    if (e.state.tour === "running" && !e.flight && e.hold.left <= 0 && !e.state.selectedId) {
      e.hold.since = null;
      e.hold.left = Infinity;
      advance();
    }
    const high = !!e.flight || e.dragging || e.easing || e.zoomGoal !== null || now < e.entranceUntil;
    const low = motionOn();
    if (e.needsRender || high || (low && now - e.lastRender >= LOW_FPS_GAP)) draw(now);
    // One loop only: something that happened during this frame (a stop
    // reached, a flight begun) may already have asked for the next one.
    if (high || low) {
      if (!e.raf) e.raf = requestAnimationFrame((t) => frameRef.current(t));
    } else scheduleWake(now);
  };

  // ---------- Measuring ----------

  const measureTiles = useCallback(() => {
    const e = eng.current;
    const root = rootRef.current;
    e.tiles = { words: relRect(wordsRef.current, root), dock: relRect(dockRef.current, root), hint: relRect(hintRef.current, root), panel: relRect(panelRef.current, root) };
    e.needsPlace = true;
    // The scrim under the words' column: on a wide screen a band from just
    // left of the words to just right of the controls, the full height; on
    // a phone the foot of the hero, from just above the words.
    const scrim = scrimRef.current;
    const t = e.tiles;
    const column = (e.state.landscape ? [t.words, t.dock, t.hint] : [t.words, t.hint]).filter(Boolean);
    if (scrim && column.length) {
      const left = Math.min(...column.map((r) => r.left));
      const right = Math.max(...column.map((r) => r.right));
      const top = Math.min(...column.map((r) => r.top));
      if (e.state.landscape) {
        scrim.style.left = `${Math.round(left - SCRIM_FADE)}px`;
        scrim.style.width = `${Math.round(right - left + 2 * SCRIM_FADE)}px`;
        scrim.style.top = "0px";
      } else {
        scrim.style.left = "0px";
        scrim.style.width = "100%";
        scrim.style.top = `${Math.round(top - SCRIM_FADE)}px`;
      }
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const measure = () => {
      const r = root.getBoundingClientRect();
      const W = Math.round(r.width);
      const H = Math.round(r.height);
      if (W > 0 && H > 0) setSize((old) => (old.W === W && old.H === H ? old : { W, H }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // The words and the controls: what the markers and the tile stay clear of.
  useEffect(() => {
    measureTiles();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      measureTiles();
      invalidate(true);
    });
    for (const el of [wordsRef.current, dockRef.current, hintRef.current]) if (el) ro.observe(el);
    document.fonts?.ready?.then(() => {
      measureTiles();
      invalidate(true);
    });
    return () => ro.disconnect();
  }, [measureTiles, invalidate, layout.mode]);

  // ---------- Seen or not: the tab, the first screen, the phone menu ----------

  useEffect(() => {
    const e = eng.current;
    const root = rootRef.current;
    const wake = () => {
      const now = performance.now();
      syncHold(now);
      if (runnable()) invalidate(true);
      scheduleWake(now);
    };
    const onVisibility = () => {
      e.hidden = document.hidden === true;
      wake();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    let io = null;
    if (root && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        ([entry]) => {
          e.visible = entry.isIntersecting ? entry.intersectionRatio : 0;
          // The hero scrolled away: the wheel is the page's again.
          if (e.visible < 0.15) disengage();
          wake();
        },
        { threshold: [0, 0.1, 0.15, 0.2, 0.5, 1] }
      );
      io.observe(root);
    }
    const html = document.documentElement;
    const onMenu = () => {
      e.menuOpen = html.getAttribute("data-menu") === "open";
      wake();
    };
    onMenu();
    const mo = new MutationObserver(onMenu);
    mo.observe(html, { attributes: true, attributeFilter: ["data-menu"] });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      mo.disconnect();
    };
  }, [disengage, invalidate, runnable, scheduleWake, syncHold]);

  // ---------- 600 ms: Ukraine's marker and tile rise on the still ----------
  // 600 ms after the words; when the page itself arrived late, a little
  // sooner (by about 0.85 s after the address was opened, but never less
  // than 250 ms after the words), so the tile does not keep a visitor waiting.

  useEffect(() => {
    if (reduced) {
      setRisen(true);
      return undefined;
    }
    const now = performance.now();
    const at = Math.max(now + 250, Math.min(now + 600, 850));
    const timer = setTimeout(() => setRisen(true), at - now);
    return () => clearTimeout(timer);
  }, [reduced]);

  // ---------- Loading the 3D once the still picture is on screen ----------

  useEffect(() => {
    setPolicy(threeDPolicy());
  }, []);

  useEffect(() => {
    if (policy !== "yes") return undefined;
    let alive = true;
    let api = null;
    let idle = 0;
    let timer = 0;
    let raf = 0;
    const e = eng.current;
    // Every picture the 3D fetches stops downloading when the visitor leaves.
    const downloads = new AbortController();
    e.downloads = downloads;
    const lost = () => {
      if (!alive) return;
      cancelAnimationFrame(e.raf);
      e.raf = 0;
      e.api = null;
      for (const el of e.markers.values()) el.remove();
      e.markers.clear();
      setScene("failed");
    };
    const start = async () => {
      try {
        const s = e.state;
        const px = textureSize(s.layout.D, window.devicePixelRatio || 1);
        const skinKind = s.show.soil ? "soil" : "plain";
        // The pictures are fetched and decoded while the code arrives.
        const skinP = decodeImage(SKIN(skinKind, px), downloads.signal);
        const waterP = s.fine ? decodeImage(WATER, downloads.signal).catch(() => null) : Promise.resolve(null);
        skinP.catch(() => {});
        const mod = await import("./globeScene.js");
        await afterFrame();
        if (!alive) return;
        const L = e.state.layout;
        const startStill = L.mode === "landscape" ? STILLS.wide : STILLS.tall;
        api = mod.createGlobeScene(canvasHostRef.current, {
          width: L.W,
          height: L.H,
          offset: L.offset,
          view: { ...startStill.view, altitude: L.altitude },
          light: L.mode,
          fine: e.state.fine,
          dpr: window.devicePixelRatio || 1,
          onContextLost: lost,
        });
        await afterFrame();
        if (!alive) return;
        const [skin, water] = await Promise.all([skinP, waterP]);
        if (!alive) return;
        const skinTexture = api.textureFrom(skin);
        api.setSkin(skinTexture);
        // The pictures by kind and size ("soil@2048"); px is the size this
        // screen was given at first (a sharper one may be fetched on zooming in).
        e.skins = { [`${skinKind}@${px}`]: skinTexture, px };
        if (water) api.setWater(api.textureFrom(water, { colour: false }));
        api.upload(skinTexture);
        await afterFrame();
        if (!alive) return;
        await api.compile();
        await afterFrame();
        if (!alive) return;
        e.api = api;
        setScene("live");
      } catch (error) {
        if (alive) {
          console.warn("[globe] The 3D globe could not be drawn; the still picture stays.", error);
          setScene("failed");
        }
        api?.dispose();
        api = null;
      }
    };
    const begin = () => {
      if (!alive) return;
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: e.state.fine ? 800 : 1500 });
      else timer = setTimeout(start, e.state.fine ? 300 : 800);
    };
    // Once the still picture is decoded and painted (two frames later), at
    // the first quiet moment: the still is the first screen's picture, so
    // nothing of the 3D competes with it for the connection.
    stillReady(stillRef.current).then(() => {
      if (alive) raf = requestAnimationFrame(() => (raf = requestAnimationFrame(begin)));
    });
    return () => {
      alive = false;
      downloads.abort();
      if (e.downloads === downloads) e.downloads = null;
      cancelAnimationFrame(raf);
      if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      clearTimeout(timer);
      cancelAnimationFrame(e.raf);
      clearTimeout(e.timer);
      e.raf = 0;
      e.timer = 0;
      e.flight = null;
      e.api = null;
      e.skins = null;
      e.sharpAsked = false;
      e.zoomGoal = null;
      e.userZoom = false;
      e.zoomPaused = false;
      e.started = false;
      for (const el of e.markers.values()) el.remove();
      e.markers.clear();
      api?.dispose();
    };
  }, [policy]);

  // ---------- Markers: real buttons, made once per list of events ----------

  const handlersRef = useRef({});
  const buildMarkers = useCallback(() => {
    const e = eng.current;
    const host = markersRef.current;
    const api = e.api;
    if (!host || !api) return;
    for (const el of e.markers.values()) el.remove();
    e.markers.clear();
    const s = e.state;
    const ukraine = s.byId.get(UKRAINE) || s.stops[0];
    const ripple = !s.reduced && ukraine;
    const current = s.selectedId || s.hoverId || s.activeId;
    const frag = document.createDocumentFragment();
    for (const ev of s.byId.values()) {
      const el = document.createElement("button");
      el.type = "button";
      el.tabIndex = -1;
      el.setAttribute("aria-hidden", "true");
      el.className = markerClass(ev);
      if (!isShown(ev, s.show)) el.classList.add("is-off");
      if (ev.id === current) el.classList.add("is-active");
      el.appendChild(document.createElement("i"));
      el._point = api.point(ev.lat, ev.lng, MARKER_ALTITUDE);
      el._event = ev;
      el._kind = kindOf(ev);
      el._ringed = ringed(ev);
      // Like the canvas under it: a pinch that starts on a marker zooms the
      // Earth, not the page.
      el.style.touchAction = "pan-y";
      if (ripple) el.style.transitionDelay = `${Math.round((angularDistance(ukraine, ev) / 180) * 600)}ms`;
      el.addEventListener("pointerdown", (event) => handlersRef.current.markerDown?.(event));
      el.addEventListener("click", () => handlersRef.current.markerClick?.(ev.id));
      el.addEventListener("pointerenter", (event) => handlersRef.current.markerEnter?.(ev.id, event));
      el.addEventListener("pointerleave", (event) => handlersRef.current.markerLeave?.(ev.id, event));
      e.markers.set(ev.id, el);
      frag.appendChild(el);
    }
    host.appendChild(frag);
    e.needsPlace = true;
    placeMarkers();
    // The ripple: each marker grows in, the nearest to Ukraine first; after
    // it, a marker fades at once when it goes under a tile.
    requestAnimationFrame(() => {
      for (const el of e.markers.values()) el.classList.add("is-in");
    });
    if (ripple) {
      setTimeout(() => {
        for (const el of e.markers.values()) el.style.transitionDelay = "";
      }, 1400);
    }
  }, [placeMarkers]);

  // ---------- Going live: the first frame, the ripple, the tour ----------

  useEffect(() => {
    if (!live) return undefined;
    const e = eng.current;
    const api = e.api;
    if (!api) return undefined;
    const controls = api.controls;
    // While the Earth is held, nothing on the page can be selected
    // (data-dragging, globe.css), so a drag never paints the words.
    const root = rootRef.current;
    const onStart = () => {
      e.dragging = true;
      // Only at the gesture's start: the controls send "start" again when
      // the first of two fingers lifts (the pinch goes on as a turn).
      if (e.altAtDragStart === null) e.altAtDragStart = api.getAltitude();
      if (root) root.dataset.dragging = "";
      // Any press on the Earth (a click, a drag, a drag begun on a marker)
      // engages the wheel for a while.
      engage();
      kick();
    };
    const onEnd = () => {
      e.dragging = false;
      e.easing = true;
      if (root) delete root.dataset.dragging;
      // A pinch on a touch screen went through the controls: it counts as
      // the visitor's own zoom, and the far limit is the layout's height.
      const alt = api.getAltitude();
      const { far } = zoomLimits();
      if (e.altAtDragStart !== null && Math.abs(alt - e.altAtDragStart) > e.altAtDragStart * 0.01) e.userZoom = true;
      if (alt > far * 1.005) e.zoomGoal = far;
      e.altAtDragStart = null;
      kick();
    };
    const onChange = () => invalidate();
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    controls.addEventListener("change", onChange);
    // A drag of more than 4 px ends the tour; a click on the bare globe
    // closes the panel. On a touch screen the tilt stays where it is.
    const canvas = api.canvas;
    let down = null;
    const onDown = (ev) => {
      down = { x: ev.clientX, y: ev.clientY, moved: false, type: ev.pointerType };
      if (ev.pointerType === "touch") {
        const polar = controls.getPolarAngle();
        controls.minPolarAngle = polar;
        controls.maxPolarAngle = polar;
      }
    };
    // The wheel over the Earth: a trackpad pinch (ctrlKey) always zooms;
    // a plain scroll zooms only while engaged, else the page scrolls.
    const stage = canvas.parentElement?.parentElement || canvas.parentElement;
    const onWheel = (ev) => {
      if (!eng.current.api) return;
      const pinch = ev.ctrlKey;
      if (!pinch && performance.now() > eng.current.engagedUntil) return;
      ev.preventDefault();
      zoomBy(globeZoomFactor(ev.deltaY, { ctrlKey: pinch, deltaMode: ev.deltaMode }));
      engage();
    };
    // A double-click on the bare Earth zooms in one step.
    const onDoubleClick = (ev) => {
      if (ev.target !== canvas) return;
      ev.preventDefault();
      zoomBy(GLOBE_ZOOM_STEP);
      engage();
    };
    stage?.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);
    api.setZoomLimits(zoomLimits());
    const onMove = (ev) => {
      if (!down || down.moved) return;
      if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) {
        down.moved = true;
        e.flight = null;
        endTour();
        setTurned(true);
      }
    };
    const onUp = () => {
      if (down && !down.moved && eng.current.state.selectedId) closePanelRef.current?.();
      if (down?.type === "touch") {
        controls.minPolarAngle = LAT_LIMIT.min;
        controls.maxPolarAngle = LAT_LIMIT.max;
      }
      down = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // The first frame; the markers ripple out from Ukraine; the tour clock starts.
    const now = performance.now();
    if (!e.state.reduced) e.entranceUntil = now + 600;
    note("live", { mode: e.state.layout.mode });
    buildMarkers();
    updateRings();
    startTour();
    draw(now);
    kick();
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.removeEventListener("change", onChange);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      stage?.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      if (root) delete root.dataset.dragging;
    };
    // Runs once, when the 3D goes live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // The first stop is Ukraine, or the tour's first if the list has no Ukraine.
  useEffect(() => {
    if (stops.length && !byId.has(activeId)) setActiveId(stops[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  // The list of events can arrive after the 3D.
  useEffect(() => {
    if (!live || !eng.current.api) return;
    buildMarkers();
    updateRings();
    if (!eng.current.flight) {
      setArcsFor(eng.current.state.activeId);
      styleArcs();
    }
    startTour();
    invalidate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // Markers follow the filters and the focus.
  useEffect(() => {
    const e = eng.current;
    const current = selectedId || hoverId || activeId;
    for (const [id, el] of e.markers) {
      el.classList.toggle("is-off", !isShown(el._event, show));
      el.classList.toggle("is-active", id === current);
    }
    invalidate(true);
  }, [show, activeId, hoverId, selectedId, invalidate, live]);

  // ---------- Tour state ----------

  useEffect(() => {
    if (!live) return;
    const now = performance.now();
    syncHold(now);
    updateRings();
    styleArcs();
    invalidate(true);
    scheduleWake(now);
    note("tour", { tour });
  }, [tour, live, reduced, syncHold, updateRings, styleArcs, invalidate, scheduleWake, note]);

  // A stop of a kind just hidden is skipped at once; filters never end the tour.
  useEffect(() => {
    const e = eng.current;
    if (!live || !e.api) return;
    updateRings();
    const current = byId.get(activeId);
    if (tour === "running" && current && !isShown(current, show) && !e.flight) {
      e.hold.since = null;
      advance();
    }
    if (hoverId && byId.get(hoverId) && !isShown(byId.get(hoverId), show)) setHoverId(null);
    if (!e.flight) setArcsFor(selectedId || hoverId || activeId);
    styleArcs();
    invalidate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.war, show.alert, show.minor]);

  // The arcs follow what the tile or the panel shows.
  useEffect(() => {
    if (!live || eng.current.flight?.kind === "tour") return;
    setArcsFor(selectedId || hoverId || activeId);
    styleArcs();
    invalidate(true);
  }, [selectedId, hoverId, activeId, live, setArcsFor, styleArcs, invalidate]);

  useEffect(() => {
    styleArcs();
    invalidate();
  }, [brightBuyer, styleArcs, invalidate]);

  // ---------- The black-soil picture ----------

  // A screen that started with the smaller picture (a phone) gets the sharp
  // one once the visitor has zoomed in to half the layout's height: the
  // loop asks for it (sharp), and it is fetched and swapped in here. The
  // plain picture loads the first time the black soil is switched off.
  useEffect(() => {
    const e = eng.current;
    if (!live || !e.api || !e.skins) return undefined;
    const kind = show.soil ? "soil" : "plain";
    const px = sharp ? SHARP_PX : e.skins.px;
    const key = `${kind}@${px}`;
    let alive = true;
    const swap = (texture) => {
      if (!alive || !texture || !e.api) return;
      e.api.setSkin(texture);
      invalidate();
    };
    if (!e.skins[key]) {
      const api = e.api;
      note("skin", { key });
      e.skins[key] = decodeImage(SKIN(kind, px), e.downloads?.signal)
        .then((img) => {
          if (e.api !== api) return null;
          const texture = api.textureFrom(img);
          api.upload(texture);
          if (e.skins) e.skins[key] = texture;
          return texture;
        })
        .catch(() => {
          if (e.skins) e.skins[key] = null;
          return null;
        });
    }
    Promise.resolve(e.skins[key]).then(swap);
    return () => {
      alive = false;
    };
  }, [show.soil, live, invalidate, sharp, note]);

  // ---------- Resizing ----------

  useEffect(() => {
    const e = eng.current;
    if (debugRef.current) {
      debugRef.current.layout = layout;
      window.__globe = debugRef.current;
    }
    if (!live || !e.api) return;
    e.api.resize(layout.W, layout.H, layout.offset);
    e.api.setLight(layout.mode);
    e.api.setZoomLimits(globeZoomLimits(layout.altitude));
    if (!e.flight) {
      const view = e.api.getView();
      e.api.setView({ lat: view.lat, lng: view.lng, altitude: layout.altitude * (e.state.selectedId ? SELECT_ZOOM : 1) });
      // A new layout has its own height: the visitor's zoom starts afresh.
      e.zoomGoal = null;
      e.userZoom = false;
    }
    measureTiles();
    invalidate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, live]);

  // ---------- The visitor ----------

  const select = useCallback(
    (id, opener) => {
      const e = eng.current;
      const ev = e.state.byId.get(id);
      if (!ev) return;
      openerRef.current = opener || listRef.current;
      endTour();
      setHoverId(null);
      setActiveId(id);
      setSelectedId(id);
      // The panel is in place before the camera aims around it.
      requestAnimationFrame(() => {
        measureTiles();
        if (e.api) flyTo(viewFor(ev, { zoom: true }), SELECT_FLIGHT_MS, "select");
      });
    },
    [endTour, flyTo, measureTiles, viewFor]
  );

  const closePanel = useCallback(() => {
    const e = eng.current;
    const id = e.state.selectedId;
    if (!id) return;
    e.state.selectedId = null;
    setSelectedId(null);
    setBrightBuyer(null);
    const ev = e.state.byId.get(id);
    requestAnimationFrame(() => {
      measureTiles();
      if (e.api && ev) flyTo(viewFor(ev), SELECT_FLIGHT_MS, "close");
    });
    const back = openerRef.current;
    openerRef.current = null;
    if (back && typeof back.focus === "function" && document.contains(back)) back.focus();
    else listRef.current?.focus();
  }, [flyTo, measureTiles, viewFor]);
  const closePanelRef = useRef(closePanel);
  closePanelRef.current = closePanel;

  // Moves to another event in the list (and the camera with it).
  const moveTo = useCallback(
    (ev) => {
      if (!ev) return;
      const e = eng.current;
      setActiveId(ev.id);
      setHoverId(null);
      if (e.state.selectedId) {
        setSelectedId(ev.id);
        if (e.api) flyTo(viewFor(ev, { zoom: true }), SELECT_FLIGHT_MS, "select");
      } else if (e.api) flyTo(viewFor(ev), KEY_FLIGHT_MS, "key");
    },
    [flyTo, viewFor]
  );

  const hoverTimer = useRef(0);
  handlersRef.current = {
    // A press on a marker is a click unless it moves more than 4 px: then it
    // becomes a drag of the globe, taken over by its controls from where it
    // began (so markers never get in the way of turning the Earth).
    markerDown: (down) => {
      const e = eng.current;
      const api = e.api;
      if (!api || down.button !== 0) return;
      const pointer = down.pointerId;
      const move = (ev) => {
        if (ev.pointerId !== pointer || Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) <= 4) return;
        stop();
        clearTimeout(hoverTimer.current);
        e.flight = null;
        endTour();
        setTurned(true);
        const controls = api.controls;
        if (down.pointerType === "touch") {
          const polar = controls.getPolarAngle();
          controls.minPolarAngle = polar;
          controls.maxPolarAngle = polar;
          const release = () => {
            controls.minPolarAngle = LAT_LIMIT.min;
            controls.maxPolarAngle = LAT_LIMIT.max;
            document.removeEventListener("pointerup", release);
            document.removeEventListener("pointercancel", release);
          };
          document.addEventListener("pointerup", release);
          document.addEventListener("pointercancel", release);
        }
        try {
          controls._onPointerDown(down);
        } catch {
          // The controls changed shape: the press simply stays a press.
        }
      };
      const stop = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.removeEventListener("pointercancel", stop);
      };
      document.addEventListener("pointermove", move, { passive: true });
      document.addEventListener("pointerup", stop);
      document.addEventListener("pointercancel", stop);
    },
    markerClick: (id) => {
      clearTimeout(hoverTimer.current);
      engage();
      select(id, listRef.current);
    },
    markerEnter: (id, event) => {
      if (event.pointerType !== "mouse") return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setHoverId(id), HOVER_IN_MS);
    },
    markerLeave: (id, event) => {
      if (event.pointerType !== "mouse") return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setHoverId((current) => (current === id ? null : current)), HOVER_OUT_MS);
    },
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // A pointer resting on the Earth holds the tour until 3 s after it leaves.
  // Leaving the hero altogether gives the wheel back to the page.
  const onRootPointer = useCallback(
    (event) => {
      const e = eng.current;
      if (event.pointerType !== "mouse" || !e.api) return;
      if (event.type === "pointerleave" && e.engagedUntil) disengage();
      const L = e.state.layout;
      let on = false;
      if (event.type !== "pointerleave") {
        const r = rootRef.current.getBoundingClientRect();
        const overGlobe = event.target === e.api.canvas || !!event.target?.closest?.(".globe-marker");
        on = overGlobe && Math.hypot(event.clientX - r.left - L.cx, event.clientY - r.top - L.cy) < L.D / 2;
      }
      if (on === e.pointerOn) return;
      const now = performance.now();
      syncHold(now);
      e.pointerOn = on;
      if (!on) e.pointerResumeAt = now + POINTER_GRACE_MS;
      syncHold(now);
      scheduleWake(now);
    },
    [disengage, scheduleWake, syncHold]
  );

  const onListKey = useCallback(
    (event) => {
      const list = shownOrder;
      if (!list.length) return;
      const i = Math.max(0, list.findIndex((ev) => ev.id === activeId));
      let next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = list[(i + 1) % list.length];
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = list[(i - 1 + list.length) % list.length];
      else if (event.key === "Home") next = list[0];
      else if (event.key === "End") next = list[list.length - 1];
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(list[i].id, listRef.current);
        return;
      } else if (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "_") {
        // The globe has the focus: + and - zoom it one step.
        event.preventDefault();
        zoomBy(event.key === "+" || event.key === "=" ? GLOBE_ZOOM_STEP : 1 / GLOBE_ZOOM_STEP);
        return;
      } else if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        // A letter jumps to the next event whose name starts with it.
        const letter = event.key.toLowerCase();
        for (let k = 1; k <= list.length; k++) {
          const candidate = list[(i + k) % list.length];
          if (candidate.name.toLowerCase().startsWith(letter)) {
            next = candidate;
            break;
          }
        }
        if (!next) return;
      } else return;
      event.preventDefault();
      moveTo(next);
    },
    [activeId, moveTo, select, shownOrder, zoomBy]
  );

  // The panel takes the focus when it opens; Esc closes it from anywhere.
  const panelOpen = selectedId !== null;
  useEffect(() => {
    if (!panelOpen) return undefined;
    panelHeadRef.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === "Escape") closePanelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  // While engaged, Esc gives the wheel back to the page.
  useEffect(() => {
    if (!engaged) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") disengage();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [engaged, disengage]);

  const togglePlay = useCallback(() => {
    const e = eng.current;
    if (tour === "running") {
      setTour("paused");
      return;
    }
    const wasRest = tour === "rest";
    // Play pressed while zoomed in: the tour goes on from here (its next
    // flight brings the camera back out).
    e.zoomPaused = false;
    e.userZoom = false;
    setHoverId(null);
    if (e.state.selectedId) {
      e.state.selectedId = null;
      setSelectedId(null);
    }
    const s = e.state;
    // On from where the tour was, or from the start after a full loop.
    let index = e.endedAtEnd ? 0 : Math.max(0, s.stops.findIndex((ev) => ev.id === s.activeId));
    if (s.stops[index] && !isShown(s.stops[index], s.show)) index = Math.max(0, nextStop(index));
    e.endedAtEnd = false;
    e.state.tour = "running";
    setTour("running");
    const ev = s.stops[index];
    if (!ev || !e.api) return;
    if (wasRest) {
      // Back to the stop (if the globe was turned away), then a full hold there.
      if (angularDistance(e.api.getView(), viewFor(ev)) > 1) goToStop(index);
      else arrive(index, ev);
    }
  }, [arrive, goToStop, nextStop, tour, viewFor]);
  togglePlayRef.current = togglePlay;

  // ---------- Words ----------

  const caption = focusEvent ? captionFor(focusEvent, { buyers: buyersFor(focusEvent), now, commonYear }) : null;
  // On a phone the docked tile keeps to the name and one line (its fact is
  // in the panel), so the controls cover little of the Earth.
  const compact = !landscape && size.W < 600;
  const wide = landscape ? size.W >= 1280 : size.W >= 600;
  const loaded = world.status === "ok";
  // The alerts are GDACS's orange and red ones of the last weeks: some still
  // going on, some over (each tile says which), hence "recent".
  const label = {
    war: loaded ? countText(counts.war, wide ? "armed conflict" : "conflict", wide ? "armed conflicts" : "conflicts") : "Armed conflicts",
    alert: loaded ? countText(counts.alert, wide ? "recent disaster alert" : "recent alert", wide ? "recent disaster alerts" : "recent alerts") : "Disaster alerts",
    pause: tour === "running" ? (wide ? "Pause tour" : "Pause") : wide ? "Play tour" : "Play",
  };
  const listParts = [
    show.war && counts.war ? countText(counts.war, "armed conflict", "armed conflicts") : null,
    show.alert && counts.alert ? countText(counts.alert, "recent disaster alert", "recent disaster alerts") : null,
    show.alert && show.minor && counts.minor ? countText(counts.minor, "minor alert", "minor alerts") : null,
  ].filter(Boolean);
  const listName = listParts.length > 1 ? `${listParts.slice(0, -1).join(", ")} and ${listParts[listParts.length - 1]}` : listParts.join("");

  let status = null;
  if (feedFailed) status = "The live list could not be loaded.";
  else if (empty) status = "No armed conflicts or disaster alerts are listed right now.";
  else if (nothingShown) status = "Nothing is shown.";

  const kindsShown = !feedFailed && !empty;
  const tourControls = kindsShown && !no3D;

  // Ukraine's marker on the still picture, until the 3D draws its own.
  const stillMark = useMemo(() => {
    const ukraine = byId.get(UKRAINE);
    if (!ukraine) return null;
    const p = projectOnView(ukraine, { ...still.view, altitude: still.altitude });
    if (!p.visible) return null;
    return { x: layout.cx + (p.x * layout.D) / 2, y: layout.cy + (p.y * layout.D) / 2 };
  }, [byId, still, layout]);

  // The floating tile's size, measured when its words change; before the
  // 3D it sits beside the still's Ukraine marker, after it the loop places it.
  useLayoutEffect(() => {
    const el = floatRef.current;
    const e = eng.current;
    if (!el) return;
    e.captionSize = { w: el.offsetWidth || 300, h: el.offsetHeight || 120 };
    if (live) {
      placeFloat();
      invalidate(true);
    } else if (stillMark) {
      const tiles = [relRect(wordsRef.current, rootRef.current), relRect(dockRef.current, rootRef.current)].filter(Boolean);
      const spot = placeCaption(stillMark, e.captionSize, { W: layout.W, H: layout.H, inset: 16 }, tiles);
      el.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`;
    }
  }, [focusId, live, risen, caption?.fact, layout, stillMark, placeFloat, invalidate]);

  const captionLink = caption ? (
    <button type="button" className="globe-caption-link" tabIndex={-1} onClick={() => focusEvent && select(focusEvent.id, listRef.current)}>
      {caption.link}
    </button>
  ) : null;
  const captionTile = (docked) =>
    caption ? (
      <div className={`globe-caption${docked && compact ? " is-compact" : ""}`} aria-hidden="true">
        <p className="globe-caption-name">{caption.name}</p>
        {docked && compact ? (
          <p className="globe-caption-meta">
            {caption.meta} {captionLink}
          </p>
        ) : (
          <>
            <p className="globe-caption-meta">{caption.meta}</p>
            {caption.fact && <p className="globe-caption-fact">{caption.fact}</p>}
            {captionLink}
          </>
        )}
      </div>
    ) : null;

  // One quiet line under the controls: how to turn the Earth (until the
  // visitor has), and the minor alerts on request.
  const minorButton =
    live && kindsShown && show.alert && counts.minor > 0 ? (
      <button type="button" className="globe-minor" aria-pressed={show.minor} onClick={() => setShow((old) => ({ ...old, minor: !old.minor }))}>
        {show.minor ? "Hide minor alerts" : "Show minor alerts"}
      </button>
    ) : null;
  // While the visitor is engaged with the Earth (a mouse or trackpad), the
  // line says the wheel zooms it; otherwise how to turn it.
  const dragHint =
    live && engaged && fine ? (
      <span className="globe-hint-text globe-hint-zoom" aria-hidden="true" data-testid="globe-zoom-hint">
        {ZOOM_HINT}
      </span>
    ) : live ? (
      <span className={`globe-hint-text${turned ? " is-done" : ""}`} aria-hidden="true">
        {fine ? "Drag to turn the Earth." : "Swipe to turn the Earth."}
      </span>
    ) : null;

  const pauseButton = tourControls ? (
    <button type="button" className="globe-pause" onClick={togglePlay}>
      {label.pause}
    </button>
  ) : null;

  const askButton =
    policy === "ask" && !live ? (
      <button type="button" className="globe-pause" onClick={() => setPolicy("yes")}>
        Show the live globe
      </button>
    ) : null;

  const toggle = (key, text, colour, dim) =>
    no3D ? (
      <span className="globe-toggle is-legend" key={key}>
        <i style={{ background: colour }} />
        {text}
      </span>
    ) : (
      <button
        type="button"
        key={key}
        className={`globe-toggle${show[key] ? "" : " is-off"}`}
        aria-pressed={show[key]}
        onClick={() => setShow((old) => ({ ...old, [key]: !old[key] }))}
        onPointerEnter={dim ? () => setDimKind(dim) : undefined}
        onPointerLeave={dim ? () => setDimKind(null) : undefined}
      >
        <i style={{ background: colour }} />
        {text}
      </button>
    );

  const panelBuyers = selected ? buyersFor(selected) : [];
  const panelIndex = selected ? shownOrder.findIndex((ev) => ev.id === selected.id) : -1;
  const step = (by) => shownOrder[(panelIndex + by + shownOrder.length) % shownOrder.length];

  const rootClass = ["globe", `is-${layout.mode}`, live ? "is-live" : "", no3D ? "is-no3d" : "", risen ? "is-risen" : "", selected ? "has-panel" : "", params.noWords ? "no-words" : ""].filter(Boolean).join(" ");

  return (
    <div ref={rootRef} className={rootClass} data-dim={dimKind || undefined} onPointerMove={onRootPointer} onPointerLeave={onRootPointer}>
      {/* The Earth: the still picture, the 3D canvas over it, the scrim under the words, the markers. */}
      <div className="globe-stage" data-ui aria-hidden="true">
        <img
          ref={stillRef}
          className="globe-still"
          src={still.src}
          alt=""
          width={stillPixels(still, still.crop.right - still.crop.left)}
          height={stillPixels(still, still.crop.bottom - still.crop.top)}
          fetchPriority="high"
          decoding="async"
          style={{
            left: layout.cx + still.crop.left * layout.D,
            top: layout.cy + still.crop.top * layout.D,
            width: (still.crop.right - still.crop.left) * layout.D,
            height: (still.crop.bottom - still.crop.top) * layout.D,
          }}
        />
        <div className="globe-canvas" ref={canvasHostRef} />
        <div className="globe-scrim" ref={scrimRef} />
        {stillMark && !live && show.war && focusId === UKRAINE && (
          <span className="globe-marker is-war is-active globe-still-mark" style={{ transform: `translate3d(${stillMark.x}px, ${stillMark.y}px, 0)` }}>
            <i />
          </span>
        )}
        <div className="globe-markers" ref={markersRef} />
      </div>

      {/* The words, then the controls with the docked tile: under the words on a wide screen, at the top on a phone. */}
      <div className="globe-ui">
        <div className="globe-words" ref={wordsRef}>
          {children}
        </div>
        <div className="globe-dock" ref={dockRef}>
          <div className="globe-row" data-load style={{ "--d": "540ms" }}>
            {toggle("soil", "Black soil", COLOURS.soil, null)}
            {kindsShown && toggle("war", label.war, COLOURS.war, "alert")}
            {kindsShown && toggle("alert", label.alert, COLOURS.alert, "war")}
            {pauseButton}
            {askButton}
          </div>
          {(status || docked) && (
            <div className="globe-docked">
              {status ? (
                <p className="globe-status" role="status">
                  {status}
                  {nothingShown && (
                    <>
                      {" "}
                      <button type="button" className="globe-show-all" onClick={() => setShow((old) => ({ ...old, war: true, alert: true }))}>
                        Show all
                      </button>
                    </>
                  )}
                </p>
              ) : (
                caption &&
                risen &&
                !selected && (
                  <div className="globe-docked-card" key={focusId}>
                    {captionTile(true)}
                  </div>
                )
              )}
            </div>
          )}
        </div>
        {/* The quiet line: under the controls on a wide screen, under the words on a phone. */}
        <div className="globe-hint" ref={hintRef}>
          {minorButton}
          {dragHint}
        </div>
      </div>

      {/* The tile beside the marker, on a wide screen. */}
      {!docked && !status && caption && (
        <div className={`globe-float${risen && !captionGone && !selected ? " is-shown" : ""}`} ref={floatRef}>
          {captionTile(false)}
        </div>
      )}

      {/* The keyboard's way in: one stop, with every event as an option. */}
      {shownOrder.length > 0 && (
        <div
          ref={listRef}
          className="globe-list"
          role="listbox"
          tabIndex={0}
          aria-label={`Live globe: ${listName}. Arrow keys move, Enter opens.`}
          aria-activedescendant={shownOrder.some((ev) => ev.id === activeId) ? `globe-opt-${activeId}` : undefined}
          onFocus={(event) => {
            if (event.target === listRef.current) endTour();
          }}
          onKeyDown={onListKey}
        >
          {shownOrder.map((ev) => (
            <div key={ev.id} id={`globe-opt-${ev.id}`} role="option" aria-selected={ev.id === activeId} className="globe-option" onClick={() => select(ev.id, listRef.current)}>
              {optionText(ev, now)}
            </div>
          ))}
        </div>
      )}

      {/* The panel: what the event is and whose food depends on it. */}
      {selected && (
        <div className="globe-panel" ref={panelRef} role="dialog" aria-modal="false" aria-labelledby="globe-panel-title">
          <button type="button" className="globe-panel-close" onClick={closePanel}>
            Close
          </button>
          <h2 id="globe-panel-title" className="globe-panel-name" tabIndex={-1} ref={panelHeadRef}>
            {selected.name}
          </h2>
          <p className="globe-panel-meta">{panelMeta(selected, { reviewed: world.reviewed, now })}</p>
          {selected.note && <p className="globe-panel-note">{selected.note}</p>}
          {panelBuyers.length > 0 && (
            <div className="globe-panel-block">
              <h3 className="globe-panel-sub">Whose food depends on it</h3>
              <ul className="globe-buyers">
                {panelBuyers.map((b) => (
                  <li key={b.iso3} onPointerEnter={() => setBrightBuyer(b.iso3)} onPointerLeave={() => setBrightBuyer(null)}>
                    <span className="globe-buyer-name">
                      {b.name}
                      {buyerYearNote(b, commonYear)}
                    </span>
                    <span className="globe-buyer-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(2, b.share * 100)}%` }} />
                    </span>
                    <span className="globe-buyer-share">{percent(b.share)}%</span>
                  </li>
                ))}
              </ul>
              <p className="globe-panel-source">
                The share of each country's farm and food imports that come from {selected.country || "here"}
                {commonYear ? `, in ${commonYear} unless a year is given` : ""}. {tradeSource(world.trade)}
              </p>
            </div>
          )}
          {selected.measured && (
            <div className="globe-panel-block">
              <h3 className="globe-panel-sub">Measured by Chernozem</h3>
              <p>{measuredSentence(selected.measured)}</p>
              <Link to="/demo" className="link link-under globe-panel-link">
                Try the demo
              </Link>
            </div>
          )}
          {selected.kind !== "war" && selected.url && (
            <p className="globe-panel-block">
              <a className="link link-under globe-panel-link" href={selected.url} target="_blank" rel="noreferrer">
                GDACS report
              </a>
            </p>
          )}
          <div className="globe-panel-nav">
            <button type="button" className="globe-panel-step" onClick={() => moveTo(step(-1))} disabled={shownOrder.length < 2}>
              Previous
            </button>
            <span className="globe-panel-count">{panelIndex >= 0 ? `${panelIndex + 1} of ${shownOrder.length}` : ""}</span>
            <button type="button" className="globe-panel-step" onClick={() => moveTo(step(1))} disabled={shownOrder.length < 2}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
