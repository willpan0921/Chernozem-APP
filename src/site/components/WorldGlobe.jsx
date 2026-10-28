// WHAT THIS FILE DOES
// The 3D Earth on the About page's first screen: a flat-coloured globe
// (react-globe.gl over three.js) with the land as sage hexagons and one
// marker for every armed conflict and every live disaster alert. Pointing
// at a marker prints what it is in the one-line readout under the globe;
// clicking one flies the globe to it and opens a panel with the event, the
// countries that buy that land's food (drawn as arcs), and, for Ukraine,
// what Chernozem has measured. The markers are also a real list of buttons
// under the globe (the armed conflicts, then "All N events" for the
// disaster alerts), so everything works from the keyboard and for screen
// readers. A line under the list says where each kind of entry comes from.
//
// Where the data comes from (contracts in the website brief, §9):
//   GET /api/world/crises            the events (server/world/): the
//                                    disaster alerts live from GDACS, the
//                                    armed conflicts from a list reviewed
//                                    by hand (there is no free live feed)
//   GET /site/world/countries.json   every country's name and centre
//   GET /site/world/trade.json       who buys whose food (World Bank WITS)
// Any of them may be missing or answer an error: markers still show from
// the feed, there are just no arcs; without the feed the globe still
// turns and the readout says the list could not be loaded. Nothing here
// checks whether an event touches farmland: the counts are counts of
// alerts, and the wording says so.
//
// The 3D library is heavy, so it is loaded only when this component is on
// the page (React.lazy), and only after the page's load event and a quiet
// moment (requestIdleCallback, 2.5 s at most; 1.2 s where that does not
// exist): the headline, the sentence, the button and the still picture
// come first. Until it arrives, or on a browser without WebGL, or if the
// file fails to load, the same dark field shows the still picture
// public/site/world/globe-still.webp (if present) with the readout and
// the list, so nothing is ever hidden behind a script.
//
// Motion: the globe turns slowly by itself until the visitor touches it,
// is drawn at about 30 frames a second (every other frame: globe.gl would
// draw every one), stops drawing off-screen or in a hidden tab, and stands
// still for visitors who asked for reduced motion (the fly-to is then
// instant and the arcs do not run). On a coarse pointer or a narrow screen
// the land is built from fewer, larger hexagons and the turn is slower.
// Styles: components/globe.css.
//
// WHO EDITS IT
// Whoever works on the globe. The colours are the site's data colours
// (site.css); the land colour and the globe's own colour are repeated here
// as hex because three.js cannot read CSS variables.

import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMediaQuery } from "../hooks.js";
import "./globe.css";

const GLOBE_COLOUR = "#2f2821";
const LAND_COLOUR = "#8aa876"; // --data-land
const ARC_COLOUR = "#e3b04b"; // --data-arc
const STILL_SRC = "/site/world/globe-still.webp";
const WITS_URL = "https://wits.worldbank.org/";
const START_VIEW = { lat: 22, lng: 24, altitude: 1.85 };
const FLY_ALTITUDE = 1.45;
const FRAME_MS = 1000 / 30;

const KIND_WORD = {
  flood: "Flood",
  drought: "Drought",
  wildfire: "Wildfires",
  storm: "Storm",
  earthquake: "Earthquake",
  volcano: "Volcano",
};

const LEVEL_WORD = { red: "red alert", orange: "orange alert", green: "green alert" };

// The reviewed list holds wars, insurgencies and gang violence alike: the
// panel says "War" only when the event's own name does.
function kindWord(e) {
  if (e.kind === "war") return /\bwar\b/i.test(e.name || "") ? "War" : "Armed conflict";
  return KIND_WORD[e.kind] || e.kind;
}

// The 3D library, the Earth's outlines and the globe material, loaded as
// one separate file the first time the globe is drawn.
const GlobeScene = lazy(async () => {
  const [{ default: Globe }, THREE, topo, { feature }] = await Promise.all([import("react-globe.gl"), import("three"), import("world-atlas/countries-110m.json"), import("topojson-client")]);
  const topology = topo.default || topo;
  // One outline (North Korea, id 408) is rejected by the hexagon library at
  // this resolution and would throw; it is left out of the hex land.
  const land = feature(topology, topology.objects.countries).features.filter((f) => String(f.id) !== "408");
  const material = new THREE.MeshLambertMaterial({ color: GLOBE_COLOUR });
  return {
    default: function Scene(props) {
      return <GlobeView Globe={Globe} land={land} material={material} {...props} />;
    },
  };
});

// When the 3D file cannot be loaded or drawn, the page keeps the still
// field, the readout and the list instead of an error.
class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function monthYear(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayMonthYear(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// "War in Sudan · since April 2023", "Tropical cyclone Arnab, India · red alert"
function readoutFor(e) {
  const place = e.country && !e.name.includes(e.country) ? `${e.name}, ${e.country}` : e.name;
  const parts = [place];
  if (e.kind === "war") parts.push(`since ${monthYear(e.since)}`);
  else {
    if (e.count > 1) parts.push(`${e.count} fires`);
    parts.push(e.level && LEVEL_WORD[e.level] ? LEVEL_WORD[e.level] : `since ${monthYear(e.since)}`);
  }
  return parts.join(" · ");
}

function millions(n) {
  const m = n / 1e6;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(m >= 1.5 ? 2 : 1).replace(/\.?0+$/, "")} million`;
}

// "Moldova's", "the Philippines'"
function possessive(name) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// The 3D part. Props change rarely; the marker elements are created once
// per event and read the latest handlers through a ref.
function GlobeView({ Globe, land, material, size, events, arcs, reduced, lowPower, handlers, flyTo, paused, onReady }) {
  const globeRef = useRef();
  const readyTries = useRef(0);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Our own frame loop: globe.gl draws on every animation frame; this draws
  // every other one (about 30 a second), which is plenty for a slow turn
  // and halves the work on the main thread.
  const loop = useRef({ raf: 0, last: 0, running: false, set: false });

  const stopLoop = useCallback(() => {
    const l = loop.current;
    l.running = false;
    if (l.raf) cancelAnimationFrame(l.raf);
    l.raf = 0;
    try {
      globeRef.current?.pauseAnimation();
    } catch {
      /* not drawn yet */
    }
  }, []);

  const startLoop = useCallback(() => {
    const l = loop.current;
    const g = globeRef.current;
    if (!g || !l.set || l.running) return;
    l.running = true;
    g.pauseAnimation();
    // three-globe runs the arcs' dashes on a light ticker of its own, which
    // pauseAnimation() also stops; it is woken again after every draw.
    let inner = null;
    try {
      inner = g.scene().children.find((o) => typeof o.resumeAnimation === "function") || null;
    } catch {
      /* no scene */
    }
    const frame = (now) => {
      if (!l.running) return;
      l.raf = requestAnimationFrame(frame);
      if (now - l.last < FRAME_MS - 3) return;
      l.last = now;
      g.resumeAnimation(); // draws one frame now and books the next...
      g.pauseAnimation(); // ...which is cancelled: the next one is ours
      inner?.resumeAnimation();
    };
    l.raf = requestAnimationFrame(frame);
  }, []);

  const makeMarker = useMemo(
    () => (d) => {
      const el = document.createElement("button");
      el.type = "button";
      el.tabIndex = -1;
      el.className = `globe-marker is-${d.kind} is-${d.level || "none"}`;
      el.setAttribute("aria-label", d.name);
      el.setAttribute("aria-hidden", "true");
      const dot = document.createElement("i");
      el.appendChild(dot);
      el.addEventListener("pointerenter", () => handlersRef.current.hover(d));
      el.addEventListener("pointerleave", () => handlersRef.current.hover(null));
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        handlersRef.current.select(d, el);
      });
      return el;
    },
    []
  );

  // The globe can say it is ready before React has handed over its ref, so
  // the setup waits a frame at a time until the ref is there.
  const ready = useCallback(() => {
    const g = globeRef.current;
    if (!g) {
      if (readyTries.current++ < 120) requestAnimationFrame(ready);
      return;
    }
    const controls = g.controls();
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = !reduced;
    // OrbitControls counts 1 as 30 seconds per turn (12°/s); 0.35°/s is
    // slow, and a phone gets slower still.
    controls.autoRotateSpeed = (lowPower ? 0.22 : 0.35) / 6;
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
    });
    for (const light of g.lights()) {
      if (light.isAmbientLight) light.intensity = Math.PI * 1.1;
      else if (light.isDirectionalLight) light.intensity = Math.PI * 0.32;
    }
    // A finger moving sideways turns the globe; moving up or down still scrolls the page.
    try {
      g.renderer().domElement.style.touchAction = "pan-y";
    } catch {
      /* no renderer yet */
    }
    g.pointOfView(START_VIEW, 0);
    loop.current.set = true;
    g.pauseAnimation();
    if (!pausedRef.current) startLoop();
    onReady();
  }, [reduced, lowPower, onReady, startLoop]);

  // Whatever happens while the globe sets itself up, the canvas is shown
  // after a few seconds rather than staying faded out.
  useEffect(() => {
    const timer = setTimeout(onReady, 3500);
    return () => clearTimeout(timer);
  }, [onReady]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !flyTo) return;
    g.controls().autoRotate = false;
    g.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude: FLY_ALTITUDE }, reduced ? 0 : 1000);
  }, [flyTo, reduced]);

  useEffect(() => {
    if (paused) stopLoop();
    else startLoop();
  }, [paused, startLoop, stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  return (
    <Globe
      ref={globeRef}
      width={size.w}
      height={size.h}
      backgroundColor="rgba(0,0,0,0)"
      showAtmosphere={false}
      showGraticules={false}
      globeMaterial={material}
      animateIn={false}
      enablePointerInteraction={false}
      rendererConfig={{ antialias: true, alpha: true }}
      onGlobeReady={ready}
      hexPolygonsData={land}
      hexPolygonResolution={lowPower ? 2 : 3}
      hexPolygonMargin={0.55}
      hexPolygonColor={() => LAND_COLOUR}
      hexPolygonAltitude={0.004}
      hexPolygonsTransitionDuration={0}
      htmlElementsData={events}
      htmlLat={(d) => d.lat}
      htmlLng={(d) => d.lng}
      htmlAltitude={0.012}
      htmlElement={makeMarker}
      htmlElementVisibilityModifier={(el, visible) => el.classList.toggle("is-hidden", !visible)}
      htmlTransitionDuration={0}
      arcsData={arcs}
      arcStartLat={(a) => a.startLat}
      arcStartLng={(a) => a.startLng}
      arcEndLat={(a) => a.endLat}
      arcEndLng={(a) => a.endLng}
      arcColor={() => ARC_COLOUR}
      arcStroke={(a) => 0.22 + Math.min(a.share, 0.6) * 1.4}
      arcAltitudeAutoScale={0.4}
      arcDashLength={0.45}
      arcDashGap={0.18}
      arcDashInitialGap={(a) => a.i * 0.15}
      arcDashAnimateTime={reduced ? 0 : 1800}
      arcsTransitionDuration={reduced ? 0 : 320}
    />
  );
}

// The country file writes formal names ("Moldova, Republic of"); the panel
// says them the way people do. The few that need more than cutting at the
// comma are listed; the rest take the part before it.
const PLAIN_NAMES = {
  KOR: "South Korea", PRK: "North Korea", COD: "DR Congo", COG: "Congo", TZA: "Tanzania", IRN: "Iran", LAO: "Laos",
  VEN: "Venezuela", BOL: "Bolivia", MDA: "Moldova", RUS: "Russia", SYR: "Syria", VNM: "Vietnam", USA: "United States",
  GBR: "United Kingdom", CIV: "Côte d'Ivoire", TWN: "Taiwan", PSE: "Palestine", BRN: "Brunei", FSM: "Micronesia",
  VAT: "Vatican City", MKD: "North Macedonia", CZE: "Czechia", SWZ: "Eswatini", BHS: "The Bahamas", GMB: "The Gambia",
};
function plainName(iso3, name) {
  if (PLAIN_NAMES[iso3]) return PLAIN_NAMES[iso3];
  return String(name || "").split(", ")[0];
}

export default function WorldGlobe() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const lowPower = useMediaQuery("(pointer: coarse), (max-width: 699px)");
  const [feed, setFeed] = useState({ status: "loading", events: [], sources: [] });
  const [countries, setCountries] = useState({});
  const [trade, setTrade] = useState(null);
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [size, setSize] = useState({ w: 450, h: 450 });
  const [inView, setInView] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);
  const [canDraw, setCanDraw] = useState(false);
  const [wantScene, setWantScene] = useState(false);
  const [stillMissing, setStillMissing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // On the stacked layout (the globe above the headline) the folded list
  // keeps to three rows so the headline stays on the first screen: fit is
  // how many conflicts those rows hold, measured, never clipped.
  const stacked = useMediaQuery("(max-width: 860px)");
  const [cap, setCap] = useState(null); // { fit, w, n }: holds for one stage width and one count
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Only a browser that can draw WebGL downloads the 3D file.
  useEffect(() => {
    setCanDraw(hasWebGL());
  }, []);

  // ...and only after the page has loaded and the browser has a quiet
  // moment, so the words and the still picture are there first.
  useEffect(() => {
    if (!canDraw) return;
    let done = false;
    let idle = 0;
    let timer = 0;
    const go = () => {
      if (done) return;
      done = true;
      setWantScene(true);
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(go, { timeout: 2500 });
      else timer = window.setTimeout(go, 1200);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      done = true;
      window.removeEventListener("load", whenIdle);
      if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, [canDraw]);

  // The data. Each file on its own, so one missing file costs only its part.
  useEffect(() => {
    let alive = true;
    fetchJson("/api/world/crises")
      .then(
        (data) =>
          alive &&
          setFeed({
            status: "ok",
            events: Array.isArray(data.events) ? data.events : [],
            sources: Array.isArray(data.sources) ? data.sources : [],
            updated: data.updated,
          })
      )
      .catch(() => alive && setFeed({ status: "failed", events: [], sources: [] }));
    fetchJson("/site/world/countries.json")
      .then((data) => alive && setCountries(data || {}))
      .catch(() => {});
    fetchJson("/site/world/trade.json")
      .then((data) => alive && setTrade(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The globe's size follows its stage (450px on a desktop, 78vw on a phone).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const w = Math.round(stage.getBoundingClientRect().width);
      if (w > 0) setSize({ w, h: w });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Off-screen, or in a tab that is not showing, the globe stops drawing.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    io.observe(root);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setHidden(document.hidden === true);
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // Every event gets a position: its own, or its country's centre.
  // Armed conflicts come first in the list (and the keyboard order), then
  // the disaster alerts by level, red before green.
  const LEVEL_ORDER = { red: 0, orange: 1, green: 2 };
  const events = useMemo(
    () =>
      feed.events
        .map((e) => {
          const c = countries[e.iso3];
          const lat = Number.isFinite(e.lat) ? e.lat : c?.lat;
          const lng = Number.isFinite(e.lng) ? e.lng : c?.lng;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return { ...e, lat, lng, country: e.country || plainName(e.iso3, c?.name) };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if ((a.kind === "war") !== (b.kind === "war")) return a.kind === "war" ? -1 : 1;
          return (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3);
        }),
    [feed.events, countries]
  );

  const conflicts = useMemo(() => events.filter((e) => e.kind === "war"), [events]);
  const counts = { conflicts: conflicts.length, disasters: events.length - conflicts.length };

  // Where the entries come from, as the feed says it.
  const gdacs = feed.sources.find((s) => s.name === "GDACS") || null;
  const reviewedSource = feed.sources.find((s) => s.reviewed || /reviewed/i.test(s.name || "")) || null;
  const reviewedDate = reviewedSource?.reviewed ? dayMonthYear(reviewedSource.reviewed) : "";
  const gdacsDown = !!(gdacs && (gdacs.missing || gdacs.stale));

  // Who buys this event's country's food, from the trade file.
  const dependentsOf = useCallback(
    (e) => {
      const row = e && trade?.exporters?.[e.iso3];
      if (!row || !Array.isArray(row.to)) return [];
      return [...row.to]
        .filter((t) => countries[t.iso3])
        .sort((a, b) => b.share - a.share)
        .slice(0, 8)
        .map((t) => ({ ...t, name: plainName(t.iso3, countries[t.iso3].name), lat: countries[t.iso3].lat, lng: countries[t.iso3].lng }));
    },
    [trade, countries]
  );

  const focus = hover || selected;
  const arcs = useMemo(() => {
    if (!focus) return [];
    const from = countries[focus.iso3] || focus;
    return dependentsOf(focus).map((d, i) => ({ i, startLat: from.lat, startLng: from.lng, endLat: d.lat, endLng: d.lng, share: d.share }));
  }, [focus, countries, dependentsOf]);

  const select = useCallback((e, trigger) => {
    triggerRef.current = trigger || null;
    setSelected(e);
    setFlyTo({ lat: e.lat, lng: e.lng, at: Date.now() });
  }, []);

  const close = useCallback(() => {
    setSelected(null);
    const back = triggerRef.current;
    triggerRef.current = null;
    if (back && typeof back.focus === "function" && document.contains(back)) back.focus();
  }, []);

  // Focus moves into the panel when it opens; Esc closes it.
  useEffect(() => {
    if (!selected) return;
    panelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, close]);

  const handlers = useMemo(() => ({ hover: setHover, select }), [select]);
  const onReady = useCallback(() => setReady(true), []);

  let readout;
  if (hover) readout = readoutFor(hover);
  else if (selected) readout = readoutFor(selected);
  else if (feed.status === "ok" && events.length)
    readout = `Right now: ${plural(counts.conflicts, "armed conflict", "armed conflicts")} and ${plural(counts.disasters, "live disaster alert", "live disaster alerts")}. Click one to see whose food depends on that land.`;
  else if (feed.status === "ok") readout = "No armed conflicts or disaster alerts are listed right now.";
  else if (feed.status === "loading") readout = "Loading the armed conflicts and disaster alerts.";
  else readout = "The live list of armed conflicts and disaster alerts could not be loaded.";

  const dependents = selected ? dependentsOf(selected) : [];
  // A new width (a turned phone) or a new count starts again from every conflict.
  const fit = cap && cap.w === size.w && cap.n === conflicts.length ? cap.fit : Infinity;
  const shown = expanded ? events : stacked ? conflicts.slice(0, fit) : conflicts;
  const sourceLine = (e) => (e.source === "Reviewed list" ? `reviewed list${reviewedDate ? `, ${reviewedDate}` : ""}` : e.source);

  // Folded on the stacked layout: while the names and the button take more
  // than three rows, show one name fewer. This runs before the paint, so
  // the visitor never sees the longer list.
  useLayoutEffect(() => {
    if (expanded || !stacked) return;
    const ul = listRef.current;
    if (!ul) return;
    const tops = [];
    let inThreeRows = 0;
    for (const li of ul.children) {
      const top = Math.round(li.getBoundingClientRect().top);
      if (!tops.includes(top)) tops.push(top);
      if (tops.length <= 3) inThreeRows++;
    }
    if (tops.length > 3) setCap({ fit: Math.max(0, Math.min(inThreeRows, shown.length) - 1), w: size.w, n: conflicts.length });
  }, [expanded, stacked, fit, shown.length, size.w, conflicts.length]);

  return (
    <div ref={rootRef} className={`globe${selected ? " has-panel" : ""}${ready ? " is-ready" : ""}`} data-ui>
      <div className="globe-stage" ref={stageRef}>
        {!stillMissing && <img className="globe-still" src={STILL_SRC} alt="" width="450" height="450" onError={() => setStillMissing(true)} />}
        {canDraw && wantScene && (
          <div className="globe-canvas">
            <SceneBoundary>
              <Suspense fallback={null}>
                <GlobeScene size={size} events={events} arcs={arcs} reduced={reduced} lowPower={lowPower} handlers={handlers} flyTo={flyTo} paused={!inView || hidden} onReady={onReady} />
              </Suspense>
            </SceneBoundary>
          </div>
        )}
      </div>

      <p className="globe-readout" aria-live="polite">
        {readout}
      </p>

      {events.length > 0 && (
        <ul ref={listRef} className={`globe-list${expanded ? " is-expanded" : ""}`} aria-label="Armed conflicts and disaster alerts right now">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`globe-list-item is-${e.kind}${selected?.id === e.id ? " is-selected" : ""}`}
                onClick={(event) => select(e, event.currentTarget)}
                onFocus={() => setHover(e)}
                onBlur={() => setHover(null)}
                onPointerEnter={() => setHover(e)}
                onPointerLeave={() => setHover(null)}
              >
                {e.name}
              </button>
            </li>
          ))}
          {counts.disasters > 0 && (
            <li key="more">
              <button type="button" className="globe-list-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Fewer" : `All ${events.length} events`}
              </button>
            </li>
          )}
        </ul>
      )}

      {feed.status === "ok" && events.length > 0 && (
        <p className="globe-sources">
          Disasters: {gdacs?.url ? <a href={gdacs.url}>GDACS</a> : "GDACS"}, live. Armed conflicts: a list reviewed by hand{reviewedDate ? ` on ${reviewedDate}` : ""} (there is no free live feed). Who buys the food: World Bank{" "}
          <a href={WITS_URL}>WITS</a>
          {trade?.year ? `, ${trade.year}` : ""}.{gdacsDown ? " GDACS could not be reached just now." : ""}
        </p>
      )}

      {selected && (
        <div className="globe-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-labelledby="globe-panel-name">
          <button type="button" className="globe-close link" onClick={close}>
            Close
          </button>
          <h3 id="globe-panel-name" className="globe-panel-name">
            {selected.name}
          </h3>
          <p className="globe-panel-meta">
            {[kindWord(selected), selected.since ? `since ${dayMonthYear(selected.since)}` : null, selected.level ? LEVEL_WORD[selected.level] : null, sourceLine(selected)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {selected.note && <p className="globe-panel-note">{selected.note}</p>}
          {dependents.length > 0 && (
            <div className="globe-panel-block">
              <h4 className="globe-panel-sub">Who buys its food</h4>
              <ul className="globe-panel-list">
                {dependents.map((d) => (
                  <li key={d.iso3}>
                    {Math.round(d.share * 100)}% of {possessive(d.name)} food imports come from here
                  </li>
                ))}
              </ul>
              <p className="globe-panel-source">
                Share of each buyer's agricultural imports that come from this country. World Bank WITS{trade?.year ? `, ${trade.year}` : ""}, as reported by the buyer.
              </p>
            </div>
          )}
          {selected.measured && (
            <div className="globe-panel-block">
              <h4 className="globe-panel-sub">Measured by Chernozem</h4>
              <p>
                {millions(selected.measured.heavyDamageHa)}&nbsp;ha of black soil heavily damaged · {millions(selected.measured.peopleOnDamagedSoil)} people on it · {selected.measured.month}
              </p>
              <Link to="/demo" className="link link-under">
                See the demo
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
