// WHAT THIS FILE DOES
// The first screen of the About page: one dark field filled by a large
// Earth whose black-soil belts glow ochre (OpenLandMap) and whose other
// cropland is sage (Copernicus), with today's armed conflicts and disaster
// alerts on it. The page's own words (the title, the sentence and the two
// actions, passed in as children by HomePage.jsx) sit over the Earth's
// shaded side.
//
// What the visitor sees and can do:
//   - a tour: the camera visits Ukraine, then every other armed conflict
//     (each time the nearest), then up to three red alerts, and comes back
//     to rest over Ukraine. At each stop a small tile names the event, says
//     since when, and gives one fact; arcs run to the countries that buy
//     its food. "Pause tour" stops all of it.
//   - a row of toggles: the black-soil picture, the conflicts, the alerts.
//   - pointing at a marker shows its tile and arcs; clicking one (or the
//     tile's link) flies there and opens a panel: what it is, who buys its
//     food, Ukraine's own measurement, previous and next.
//   - dragging turns the Earth; the keyboard reaches every event through
//     one list (Tab to the globe, then the arrow keys and Enter).
//
// Order of arrival: the words, the controls and a still picture of the
// Earth come first; at 600 ms Ukraine's marker and tile rise on the still;
// the 3D (globeScene.js, three.js) loads at the first quiet moment and
// fades in over the still, then the markers ripple out from Ukraine and
// the tour starts. Without WebGL, on a device with under 2 GB of memory,
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
// ?globe-still=wide|tall draws the still picture alone, for making
// public/site/world/globe-still-*.webp.
//
// WHO EDITS IT
// Whoever works on the globe.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMediaQuery } from "../hooks.js";
import { useWorldData } from "./worldData.js";
import {
  aimFor,
  angularDistance,
  buyersOf,
  captionFor,
  clamp,
  countText,
  flightMs,
  globeLayout,
  millions,
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
  viewAlong,
} from "./globeMath.js";
import "./globe.css";

// The pictures of the Earth shown until the 3D is drawn, made from the real
// scene (?globe-still=wide|tall) at these views: Ukraine's tour stop on a
// 1440x900 screen and on a 390x844 phone. Each is a square 1.3 times the
// sphere's width, centred on it.
const STILLS = {
  wide: { src: "/site/world/globe-still-wide.webp", size: 1600, view: { lat: 44.7756, lng: 31.9923 }, altitude: 0.8706, light: "landscape" },
  tall: { src: "/site/world/globe-still-tall.webp", size: 1000, view: { lat: 48.3699, lng: 36.6 }, altitude: 2.5909, light: "portrait" },
};
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

// The picture fetched and decoded away from the page's main work.
async function decodeImage(url) {
  const res = await fetch(url);
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
      api = mod.createGlobeScene(hostRef.current, { width: S, height: S, view: { ...still.view, altitude: still.altitude }, light: still.light, fine: true, dpr: 1, still: true, fov });
      const [skin, water] = await Promise.all([decodeImage(SKIN("soil", 3600)), decodeImage(WATER)]);
      if (!alive) return;
      api.setSkin(api.textureFrom(skin));
      api.setWater(api.textureFrom(water, { colour: false }));
      await api.compile();
      api.render();
      const ukraine = world.events.find((e) => e.id === UKRAINE);
      window.__globeStill = {
        dataURL: api.canvas.toDataURL("image/png"),
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
  const [show, setShow] = useState({ soil: true, war: true, alert: true });
  const [tour, setTour] = useState(() => (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "rest" : "running"));
  const [activeId, setActiveId] = useState(UKRAINE);
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [captionGone, setCaptionGone] = useState(false);
  const [risen, setRisen] = useState(false); // 600 ms after the words
  const [dimKind, setDimKind] = useState(null);
  const [brightBuyer, setBrightBuyer] = useState(null);

  const live = scene === "live";
  const no3D = policy === "off" || scene === "failed" || (policy === "ask" && !live);
  const docked = !landscape || no3D;

  // ---------- The data ----------

  const events = world.events;
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const counts = useMemo(() => ({ war: events.filter((e) => e.kind === "war").length, alert: events.filter((e) => e.kind !== "war").length }), [events]);
  const stops = useMemo(() => tourStops(events), [events]);
  // The keyboard's order: the tour, then the other alerts.
  const order = useMemo(() => {
    const seen = new Set(stops.map((e) => e.id));
    return [...stops, ...events.filter((e) => !seen.has(e.id))];
  }, [stops, events]);
  const shownOrder = useMemo(() => order.filter((e) => show[kindOf(e)]), [order, show]);
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
    const tiles = [t.words, t.dock, s.selectedId ? t.panel : null, e.captionAt].filter(Boolean);
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
      const under = !back && id !== current && tiles.some((r) => inside(p, r));
      if (el._under !== under) {
        el._under = under;
        el.classList.toggle("is-under", under);
      }
      if (el._ringed) api.showRing(id, rings && !back && !under && s.show[el._kind]);
    }
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
    const { w, h } = e.captionSize;
    const spot = placeCaption(p, { w, h }, { W: s.layout.W, H: s.layout.H, inset: 16 }, [e.tiles.words, e.tiles.dock].filter(Boolean));
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
      if (!ev || !e.state.show[kindOf(ev)]) {
        api.setArcs([]);
        return;
      }
      api.syncCamera();
      const L = e.state.layout;
      const view = api.getView();
      const sphere = sphereRadiusPx(L.H, view.altitude);
      // A point of an arc shows unless the Earth hides it (behind it, inside its disc).
      const shows = (p) => p.visible || Math.hypot(p.x - L.cx, p.y - L.cy) > sphere;
      const list = [];
      buyersFor(ev).forEach((b, i) => {
        const base = { iso3: b.iso3, startLat: ev.lat, startLng: ev.lng, endLat: b.lat, endLng: b.lng, stroke: 0.22 + b.share * 1.4, autoScale: 0.32 };
        // An arc that would end under the words, or pass behind them, is left out.
        const end = api.project(b.lat, b.lng, 0);
        if (end.visible && inside(end, e.tiles.words, 12)) return;
        if (api.arcPoints(base).some((pt) => { const p = api.projectPoint(pt); return shows(p) && inside(p, e.tiles.words, 12); })) return;
        list.push({ ...base, kind: "route", opacity: 0.35 });
        list.push({ ...base, kind: "ship", opacity: 0.95, dashSize: 0.22, gapSize: 1.2, dashOffset: i * 0.15 });
      });
      api.setArcs(list);
      e.dashClock = 0;
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
      if (!ringed(ev) || !s.show[kindOf(ev)]) continue;
      list.push({ id: ev.id, lat: ev.lat, lng: ev.lng, colour: ev.kind === "war" ? COLOURS.war : COLOURS.alert, alpha: ev.kind === "war" ? 0.9 : 0.7, period: ringPeriod(ev.id), phase: ringPeriod(`${ev.id}:phase`) });
    }
    api.setRings(list);
    e.needsPlace = true;
  }, [motionOn]);

  // ---------- Where each stop is seen from ----------

  // The part of the screen the event should sit in the middle of: on a
  // phone between the controls and the words (or the panel); on a wide
  // screen with the panel open, between the words and the panel.
  const freeRect = useCallback((withPanel) => {
    const e = eng.current;
    const s = e.state;
    const L = s.layout;
    const t = e.tiles;
    if (s.landscape) {
      if (!withPanel || !t.panel) return null;
      return { left: (t.words?.right ?? 0) + 24, right: t.panel.left - 24, top: 0, bottom: L.H };
    }
    const top = (t.dock?.bottom ?? 0) + 8;
    const bottom = (withPanel && t.panel ? t.panel.top : t.words?.top ?? L.H) - 8;
    if (bottom - top < 80) return null;
    return { left: 0, right: L.W, top, bottom };
  }, []);

  const viewFor = useCallback(
    (ev, { zoom = false } = {}) => {
      const s = eng.current.state;
      const altitude = s.layout.altitude * (zoom ? SELECT_ZOOM : 1);
      const free = freeRect(zoom);
      const shift = free ? shiftToward(s.layout, free, altitude) : null;
      return { ...aimFor(ev, buyersFor(ev), { shift, altitude }), altitude };
    },
    [buyersFor, freeRect]
  );

  // ---------- The tour ----------

  const nextStop = useCallback((from) => {
    const s = eng.current.state;
    for (let i = from + 1; i < s.stops.length; i++) if (s.show[kindOf(s.stops[i])]) return i;
    return -1;
  }, []);

  const arrive = useCallback(
    (index, ev) => {
      const e = eng.current;
      e.stopIndex = index;
      if (!e.state.show[kindOf(ev)] && e.state.tour === "running") {
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
    const home = e.state.stops.findIndex((ev) => e.state.show[kindOf(ev)]);
    if (home >= 0) goToStop(home, { home: true });
    else setTour("rest");
  }, [goToStop, nextStop]);

  // The tour's first stop, once both the 3D and the events are here. On a
  // phone the first stop's view may differ a little from the still's: the
  // camera settles there before the clock starts.
  const startTour = useCallback(() => {
    const e = eng.current;
    const s = e.state;
    if (e.started || !e.api) return;
    const first = s.byId.get(s.activeId);
    if (!first) return;
    e.started = true;
    const index = Math.max(0, s.stops.findIndex((ev) => ev.id === s.activeId));
    const target = viewFor(first);
    if (angularDistance(e.api.getView(), target) > 0.5) flyTo(target, SETTLE_FLIGHT_MS, "settle", { onDone: () => arrive(index, first) });
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
    setCaptionGone(false);
  }, [note]);

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
    // The camera: a flight, or a drag and its easing out.
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
    // The tour moves on when the stop has been held long enough.
    syncHold(now);
    if (e.state.tour === "running" && !e.flight && e.hold.left <= 0 && !e.state.selectedId) {
      e.hold.since = null;
      e.hold.left = Infinity;
      advance();
    }
    const high = !!e.flight || e.dragging || e.easing || now < e.entranceUntil;
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
    e.tiles = { words: relRect(wordsRef.current, root), dock: relRect(dockRef.current, root), panel: relRect(panelRef.current, root) };
    e.needsPlace = true;
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
    for (const el of [wordsRef.current, dockRef.current]) if (el) ro.observe(el);
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
  }, [invalidate, runnable, scheduleWake, syncHold]);

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

  // ---------- Loading the 3D at the first quiet moment ----------

  useEffect(() => {
    setPolicy(threeDPolicy());
  }, []);

  useEffect(() => {
    if (policy !== "yes") return undefined;
    let alive = true;
    let api = null;
    let idle = 0;
    let timer = 0;
    const e = eng.current;
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
        const skinP = decodeImage(SKIN(skinKind, px));
        const waterP = s.fine ? decodeImage(WATER).catch(() => null) : Promise.resolve(null);
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
        e.skins = { [skinKind]: skinTexture, px };
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
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: e.state.fine ? 800 : 1500 });
      else timer = setTimeout(start, e.state.fine ? 300 : 800);
    };
    // After the first paint (two frames), at the first quiet moment.
    const raf = requestAnimationFrame(() => requestAnimationFrame(begin));
    return () => {
      alive = false;
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
      if (!s.show[kindOf(ev)]) el.classList.add("is-off");
      if (ev.id === current) el.classList.add("is-active");
      el.appendChild(document.createElement("i"));
      el._point = api.point(ev.lat, ev.lng, MARKER_ALTITUDE);
      el._kind = kindOf(ev);
      el._ringed = ringed(ev);
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
    const onStart = () => {
      e.dragging = true;
      kick();
    };
    const onEnd = () => {
      e.dragging = false;
      e.easing = true;
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
    const onMove = (ev) => {
      if (!down || down.moved) return;
      if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) {
        down.moved = true;
        e.flight = null;
        endTour();
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
      el.classList.toggle("is-off", !show[el._kind]);
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
    if (tour === "running" && current && !show[kindOf(current)] && !e.flight) {
      e.hold.since = null;
      advance();
    }
    if (hoverId && byId.get(hoverId) && !show[kindOf(byId.get(hoverId))]) setHoverId(null);
    if (!e.flight) setArcsFor(selectedId || hoverId || activeId);
    styleArcs();
    invalidate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.war, show.alert]);

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

  useEffect(() => {
    const e = eng.current;
    if (!live || !e.api || !e.skins) return undefined;
    const kind = show.soil ? "soil" : "plain";
    let alive = true;
    const swap = (texture) => {
      if (!alive || !texture || !e.api) return;
      e.api.setSkin(texture);
      invalidate();
    };
    if (!e.skins[kind]) {
      // The plain picture loads the first time the black soil is switched off.
      const api = e.api;
      e.skins[kind] = decodeImage(SKIN(kind, e.skins.px))
        .then((img) => {
          if (e.api !== api) return null;
          const texture = api.textureFrom(img);
          api.upload(texture);
          if (e.skins) e.skins[kind] = texture;
          return texture;
        })
        .catch(() => {
          if (e.skins) e.skins[kind] = null;
          return null;
        });
    }
    Promise.resolve(e.skins[kind]).then(swap);
    return () => {
      alive = false;
    };
  }, [show.soil, live, invalidate]);

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
    if (!e.flight) {
      const view = e.api.getView();
      e.api.setView({ lat: view.lat, lng: view.lng, altitude: layout.altitude * (e.state.selectedId ? SELECT_ZOOM : 1) });
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
  const onRootPointer = useCallback(
    (event) => {
      const e = eng.current;
      if (event.pointerType !== "mouse" || !e.api) return;
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
    [scheduleWake, syncHold]
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
    [activeId, moveTo, select, shownOrder]
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

  const togglePlay = useCallback(() => {
    const e = eng.current;
    if (tour === "running") {
      setTour("paused");
      return;
    }
    const wasRest = tour === "rest";
    setHoverId(null);
    if (e.state.selectedId) {
      e.state.selectedId = null;
      setSelectedId(null);
    }
    const s = e.state;
    // On from where the tour was, or from the start after a full loop.
    let index = e.endedAtEnd ? 0 : Math.max(0, s.stops.findIndex((ev) => ev.id === s.activeId));
    if (s.stops[index] && !s.show[kindOf(s.stops[index])]) index = Math.max(0, nextStop(index));
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

  // ---------- Words ----------

  const caption = focusEvent ? captionFor(focusEvent, { buyers: buyersFor(focusEvent) }) : null;
  const wide = landscape ? size.W >= 1280 : size.W >= 600;
  const loaded = world.status === "ok";
  const label = {
    war: loaded ? countText(counts.war, wide ? "armed conflict" : "conflict", wide ? "armed conflicts" : "conflicts") : "Armed conflicts",
    alert: loaded ? countText(counts.alert, wide ? "disaster alert" : "alert", wide ? "disaster alerts" : "alerts") : "Disaster alerts",
    pause: tour === "running" ? (wide ? "Pause tour" : "Pause") : wide ? "Play tour" : "Play",
  };
  const listName = [show.war && counts.war ? countText(counts.war, "armed conflict", "armed conflicts") : null, show.alert && counts.alert ? countText(counts.alert, "disaster alert", "disaster alerts") : null]
    .filter(Boolean)
    .join(" and ");

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

  const captionBody = caption ? (
    <div className="globe-caption" aria-hidden="true">
      <p className="globe-caption-name">{caption.name}</p>
      <p className="globe-caption-meta">{caption.meta}</p>
      {caption.fact && <p className="globe-caption-fact">{caption.fact}</p>}
      <button type="button" className="globe-caption-link" tabIndex={-1} onClick={() => focusEvent && select(focusEvent.id, listRef.current)}>
        {caption.link}
      </button>
    </div>
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
  const stillSize = layout.D * 1.3;

  return (
    <div ref={rootRef} className={rootClass} data-dim={dimKind || undefined} onPointerMove={onRootPointer} onPointerLeave={onRootPointer}>
      {/* The Earth: the still picture, the 3D canvas over it, the markers. */}
      <div className="globe-stage" data-ui aria-hidden="true">
        <img
          className="globe-still"
          src={still.src}
          alt=""
          width={still.size}
          height={still.size}
          fetchPriority="high"
          decoding="async"
          style={{ left: layout.cx - stillSize / 2, top: layout.cy - stillSize / 2, width: stillSize, height: stillSize }}
        />
        <div className="globe-canvas" ref={canvasHostRef} />
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
            {landscape && pauseButton}
            {askButton}
          </div>
          {(status || docked) && (
            <div className="globe-docked">
              {!landscape && !status && pauseButton}
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
                    {captionBody}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* The tile beside the marker, on a wide screen. */}
      {!docked && !status && caption && (
        <div className={`globe-float${risen && !captionGone && !selected ? " is-shown" : ""}`} ref={floatRef}>
          {captionBody}
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
              {optionText(ev)}
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
          <p className="globe-panel-meta">{panelMeta(selected, { reviewed: world.reviewed })}</p>
          {selected.note && <p className="globe-panel-note">{selected.note}</p>}
          {panelBuyers.length > 0 && (
            <div className="globe-panel-block">
              <h3 className="globe-panel-sub">Who buys its food</h3>
              <ul className="globe-buyers">
                {panelBuyers.map((b) => (
                  <li key={b.iso3} onPointerEnter={() => setBrightBuyer(b.iso3)} onPointerLeave={() => setBrightBuyer(null)}>
                    <span className="globe-buyer-name">{b.name}</span>
                    <span className="globe-buyer-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(2, b.share * 100)}%` }} />
                    </span>
                    <span className="globe-buyer-share">{percent(b.share)}%</span>
                  </li>
                ))}
              </ul>
              <p className="globe-panel-source">
                Share of each buyer's farm and food imports that come from this country. World Bank WITS{world.trade?.year ? `, ${world.trade.year}` : ""}, as reported by the buyer.
              </p>
            </div>
          )}
          {selected.measured && (
            <div className="globe-panel-block">
              <h3 className="globe-panel-sub">Measured by Chernozem</h3>
              <p>
                {millions(selected.measured.heavyDamageHa)}&nbsp;ha of black soil heavily damaged · {millions(selected.measured.peopleOnDamagedSoil)} people on it · {selected.measured.month}
              </p>
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
