// WHAT THIS FILE DOES
// The Field map: the farm's fields on real satellite imagery (Esri World
// Imagery) on a zoomable map (Leaflet). Every Field page that shows fields
// uses this one component (the Fields page, the Overview, the farm setup,
// Settings).
//
// Each field is tinted by its condition class and outlined in white
// (thick, with a soft halo, for the selected field). A field ready to
// harvest, or due within two weeks, has a gold outline; a field that needs
// recovery is red; a harvested or not-sown field is a plain straw tint
// with a dashed edge (bare ground has no condition class: method.js
// fieldCondition). Stress patches get a dashed white circle (none in a
// field with no crop). How each field is drawn is format.js mapLook(), so
// the legend can list only the marks on the map (mapMarks). Name pills sit in each field's top-left corner
// when they fit, shrink or hide when they do not, never overlap, and the
// stress circles are drawn above them.
//
// "+" zooms in on the selected field when it is in view. Enter or Space
// on a focused pill selects its field.
//
// The one map layer is "Field condition" (method.js conditionScore); the
// colours are the --fmap-* tokens in src/styles/tokens.css.
//
// WHAT IT RECEIVES
//   fields       the farm's fields [{ id, name, geometry (GeoJSON Polygon, lon/lat) }]
//   analyses     { [fieldId]: analysis } (useFieldData().analyses)
//   selectedId   the selected field's id (thick outline, dark pill)
//   onSelect     called with a field id when a field or its pill is clicked
//   fitKey       change it to fit the map to the fields again
//   height       a number (px) or any CSS height ("100%"); default 420
//   candidates   fields found by the farm setup [{ id, geometry, areaHa }] (drawn on top, clickable)
//   selectedCandidateIds  the ids of the chosen candidates
//   onToggleCandidate     called with a candidate id when it is clicked
//   boundary     the land searched: GeoJSON Polygon/MultiPolygon or [[lat, lon], ...] (dashed line)
//   pin          [lat, lon] of a searched place, with pinRadiusM (a dashed circle) if given
//   drawMode     true: clicks add corners (onDrawPoint([lat, lon])); drawPoints are drawn as a shape
//   onMapClick   called with [lat, lon] for a click on the map outside drawing (e.g. to move the pin)
//   focusBounds  [[south, west], [north, east]]: the map flies there whenever this changes
//   analysing    a Set of field ids being analysed for the first time
//                (useFieldData().analysing): their pill says "Analysing…"
//                and their outline is dashed
//   showLabels   false hides the name pills
//   interactive  false turns off dragging, zooming and the buttons, and takes
//                the map out of the Tab order (nothing to do there by keyboard)
//   fitPadding   [x, y] px kept round the fields when the map fits them; default [36, 36]
//   children     anything to float over the map (legend, date chip)
//   ref          gives { zoomIn, zoomOut, fit, flyToBounds(bounds), getMap }
//
// With nothing to show yet the map opens on the whole world (Chernozem
// works anywhere), and flies to the place once there is one.
//
// The wrapper carries data-zoom="<zoom level>" so tests can check that
// zooming worked.
//
// Also exported: PassChip (the "Oct 16 · Sentinel-2" chip) and
// fieldsBounds(fields).
//
// WHO EDITS IT
// Whoever changes how the Field map looks or behaves. The class limits
// are in method.js.

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize, Minus, Plus } from "lucide-react";
import { conditionClass } from "../../lib/field/method.js";
import { ANALYSING_LABEL, formatDay, mapLook } from "../../lib/field/format.js";
import "./field.css";

// Satellite pictures: Esri World Imagery, free with no key. The short
// credit line in the corner is required by its terms.
export const SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  maxNativeZoom: 18,
};
const MAX_ZOOM = 19;
// The whole world, until there are fields or a place to show.
const START_VIEW = { center: [25, 10], zoom: 3 };
const FIT_PADDING = [36, 36];
const MIN_STRESS_PX = 11; // the smallest stress circle on screen (radius)

// ---------- Colours (read once from tokens.css) ----------

const TOKEN_NAMES = [
  "--fmap-poor",
  "--fmap-fair",
  "--fmap-good",
  "--fmap-great",
  "--fmap-nodata",
  "--fmap-harvested",
  "--fmap-ready",
  "--fmap-candidate",
  "--fmap-chosen",
  "--c-red",
];

function readTokens(element) {
  const style = getComputedStyle(element);
  const out = {};
  for (const name of TOKEN_NAMES) out[name] = style.getPropertyValue(name).trim() || "#999999";
  return out;
}

const CLASS_TOKEN = { poor: "--fmap-poor", fair: "--fmap-fair", good: "--fmap-good", great: "--fmap-great" };

// ---------- Shapes ----------

// GeoJSON (lon, lat) -> Leaflet rings (lat, lon). Polygon -> [ring, hole...];
// MultiPolygon -> [[ring, hole...], ...].
function toLatLngs(geometry) {
  if (!geometry) return [];
  const flip = (ring) => ring.map(([lon, lat]) => [lat, lon]);
  if (geometry.type === "Polygon") return geometry.coordinates.map(flip);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((rings) => rings.map(flip));
  return [];
}

function boundaryLatLngs(boundary) {
  if (!boundary) return null;
  if (Array.isArray(boundary)) return boundary.length >= 3 ? [boundary] : null;
  return toLatLngs(boundary);
}

function bboxOfGeometry(geometry) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === "number") {
      west = Math.min(west, coords[0]);
      east = Math.max(east, coords[0]);
      south = Math.min(south, coords[1]);
      north = Math.max(north, coords[1]);
    } else coords.forEach(visit);
  };
  if (geometry?.coordinates) visit(geometry.coordinates);
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

// The box round some fields (or anything with a geometry), as Leaflet bounds.
export function fieldsBounds(items) {
  let bounds = null;
  for (const item of items || []) {
    const box = bboxOfGeometry(item.geometry);
    if (!box) continue;
    const b = L.latLngBounds([box.south, box.west], [box.north, box.east]);
    bounds = bounds ? bounds.extend(b) : b;
  }
  return bounds;
}

function insideRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function edgeDistance(lon, lat, ring, kx) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * kx;
    const ay = ring[j][1];
    const bx = ring[i][0] * kx;
    const by = ring[i][1];
    const px = lon * kx;
    const dx = bx - ax;
    const dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), lat - (ay + t * dy)));
  }
  return best;
}

function insideField(lon, lat, rings) {
  return insideRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => insideRing(lon, lat, hole));
}

// Where the name pill can go. Gives the candidate points inside the field,
// north-west first (the pill sits in the field's top-left corner when it
// fits, like a map label), and the "pole": the point farthest from the
// edges, used when nothing fits at the current zoom.
function labelSpots(geometry) {
  const rings = geometry?.type === "Polygon" ? geometry.coordinates : geometry?.coordinates?.[0] || [];
  const outer = rings[0];
  const box = bboxOfGeometry(geometry);
  if (!outer || !box) return null;
  const kx = Math.cos((((box.south + box.north) / 2) * Math.PI) / 180);
  const spots = [];
  let pole = null;
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lon = box.west + ((box.east - box.west) * (i + 0.5)) / (steps + 1);
      const lat = box.south + ((box.north - box.south) * (j + 0.5)) / (steps + 1);
      if (!insideField(lon, lat, rings)) continue;
      const d = Math.min(...rings.map((ring) => edgeDistance(lon, lat, ring, kx)));
      spots.push({ lat, lon, nw: (lon - box.west) * kx + (box.north - lat) });
      if (!pole || d > pole.d) pole = { d, lat, lon };
    }
  }
  spots.sort((a, b) => a.nw - b.nw);
  return { rings, kx, box, spots, pole: pole ? { lat: pole.lat, lon: pole.lon } : { lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2 } };
}

// The on-screen size of a name pill (the selected size, the largest, so a
// pill does not jump when its field is selected). Small pills are used when
// the normal one does not fit inside the field.
const PILL = { normal: { font: 14, padX: 14, height: 31, margin: 10 }, small: { font: 11.5, padX: 8, height: 22, margin: 5 } };
let measureCtx = null;

function pillSize(text, kind, fontFamily) {
  const spec = PILL[kind];
  measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
  measureCtx.font = `650 ${spec.font}px ${fontFamily || "sans-serif"}`;
  return { w: Math.ceil(measureCtx.measureText(text).width) + spec.padX * 2, h: spec.height, margin: spec.margin };
}

// True when a pill of this size (plus its margin) centred on spot lies
// fully inside the field. mpp = metres per screen pixel.
function pillFits(info, spot, size, mpp) {
  const halfLat = ((size.h / 2 + size.margin) * mpp) / 111320;
  const halfLon = ((size.w / 2 + size.margin) * mpp) / 111320 / info.kx;
  for (const sx of [-1, 0, 1]) {
    for (const sy of [-1, 0, 1]) {
      if ((sx || sy) && !insideField(spot.lon + sx * halfLon, spot.lat + sy * halfLat, info.rings)) return false;
    }
  }
  return true;
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- The component ----------

export default function FieldMap({
  fields = [],
  analyses = {},
  selectedId = null,
  onSelect,
  fitKey,
  height = 420,
  candidates,
  selectedCandidateIds,
  onToggleCandidate,
  boundary,
  pin,
  pinRadiusM,
  drawMode = false,
  drawPoints,
  onDrawPoint,
  onMapClick,
  focusBounds,
  analysing = null,
  showLabels = true,
  interactive = true,
  fitPadding = FIT_PADDING,
  className = "",
  ariaLabel = "Map of the fields",
  children,
  ref,
}) {
  const wrapRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const tokensRef = useRef(null);
  const renderers = useRef({ shapes: null, stress: null });
  const layers = useRef({ tiles: null, fields: null, fieldIndex: new Map(), candidates: null, extras: null });
  const [zoom, setZoom] = useState(null);
  const lastFitAt = useRef(0);

  const latest = useRef({});
  latest.current = { onSelect, onToggleCandidate, onDrawPoint, onMapClick, drawMode, fields, candidates, boundary, drawPoints, pin, pinRadiusM, selectedId };

  // ---------- Create the map once ----------
  useEffect(() => {
    const map = L.map(mapDivRef.current, {
      zoomControl: false,
      zoomSnap: 0.25,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 110,
      wheelDebounceTime: 30,
      minZoom: 3,
      maxZoom: MAX_ZOOM,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);
    map.setView(START_VIEW.center, START_VIEW.zoom);
    map.createPane("fmLabels").style.zIndex = 620;
    // Stress circles sit above the name pills so a pill never hides one;
    // they take no clicks, so the pills under them still work.
    const stressPane = map.createPane("fmStress");
    stressPane.style.zIndex = 640;
    stressPane.style.pointerEvents = "none";
    tokensRef.current = readTokens(wrapRef.current);

    // The satellite pictures.
    layers.current.tiles = L.tileLayer(SATELLITE.url, { attribution: SATELLITE.attribution, maxNativeZoom: SATELLITE.maxNativeZoom, maxZoom: MAX_ZOOM }).addTo(map);

    const shapes = L.svg({ padding: 0.5 });
    const stress = L.svg({ pane: "fmStress", padding: 0.5 });
    map.addLayer(shapes);
    map.addLayer(stress);
    renderers.current = { shapes, stress };
    mapRef.current = map;

    const syncZoom = () => setZoom(Math.round(map.getZoom() * 100) / 100);
    syncZoom();
    map.on("zoomend", syncZoom);
    map.on("click", (event) => {
      const now = latest.current;
      const point = [round6(event.latlng.lat), round6(wrapLon(event.latlng.lng))];
      if (now.drawMode) now.onDrawPoint?.(point);
      else now.onMapClick?.(point);
    });

    // Keep the map the right size when its box changes. A box that settles
    // just after the map fitted itself (the page laying itself out) fits
    // again, so the fields are not left small in one corner.
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      if (Date.now() - lastFitAt.current < 1500) fitNow.current?.(false);
    });
    observer.observe(wrapRef.current);

    return () => {
      observer.disconnect();
      for (const name of ["fields", "candidates", "extras", "tiles"]) layers.current[name]?.remove();
      map.stop();
      map._animatingZoom = false;
      map.off();
      map.remove();
      mapRef.current = null;
      layers.current = { tiles: null, fields: null, fieldIndex: new Map(), candidates: null, extras: null };
    };
  }, []);

  // ---------- Interaction on or off ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const handler of ["dragging", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "touchZoom", "keyboard"]) {
      if (interactive) map[handler]?.enable();
      else map[handler]?.disable();
    }
    // Leaflet's keyboard handler makes the map a Tab stop and leaves it one
    // when disabled; a static map should not be.
    map.getContainer().tabIndex = interactive ? 0 : -1;
  }, [interactive]);

  // ---------- The fields ----------
  const fieldsKey = fields.map((f) => `${f.id}:${f.name}:${f.geometry?.coordinates?.[0]?.length}`).join("|");
  const analysesKey = fields.map((f) => `${analyses[f.id]?.updatedAt || ""}:${analyses[f.id]?.status?.id || ""}:${analysing?.has?.(f.id) ? "a" : ""}`).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const focusedId = document.activeElement?.closest?.(".fm-label")?.dataset?.fieldId || null;
    layers.current.fields?.remove();
    layers.current.fieldIndex = new Map();
    const t = tokensRef.current;
    const group = L.layerGroup();

    for (const field of fields) {
      if (!field?.geometry) continue;
      const analysis = analyses[field.id];
      const rings = toLatLngs(field.geometry);
      // Harvest readiness is part of the one layer: a field that is ready,
      // or due within two weeks, gets a gold outline and says so on its pill.
      const look = mapLook(analysis);
      const { recovery, ready } = look;
      const harvested = look.bare;
      const waiting = !analysis && Boolean(analysing?.has?.(field.id));
      const cls = harvested ? null : conditionClass(analysis?.condition?.score)?.id;
      const entry = { field, recovery, harvested, ready, waiting, cls, parts: {} };

      entry.parts.halo = L.polygon(rings, {
        renderer: renderers.current.shapes,
        interactive: false,
        fill: false,
        color: "#ffffff",
        opacity: 0,
        weight: 12,
        lineJoin: "round",
      });
      group.addLayer(entry.parts.halo);

      const shape = L.polygon(rings, {
        renderer: renderers.current.shapes,
        bubblingMouseEvents: false,
        lineJoin: "round",
        className: "fm-shape",
        ...shapeStyle({ recovery, harvested, ready, waiting, cls, selected: false, t }),
      });
      shape.on("click", (event) => {
        const now = latest.current;
        if (now.drawMode) {
          now.onDrawPoint?.([round6(event.latlng.lat), round6(wrapLon(event.latlng.lng))]);
          return;
        }
        now.onSelect?.(field.id);
      });
      entry.parts.shape = shape;
      group.addLayer(shape);

      // Dashed circles round the stress patches (never smaller than a
      // fingertip on screen, so they stay visible when zoomed out).
      entry.parts.stress = [];
      for (const patch of look.patches) {
        const radiusM = Math.max(25, (Number(patch.radiusM) || 30) * 1.35);
        const circle = L.circle([patch.lat, patch.lon], {
          renderer: renderers.current.stress,
          radius: Math.max(radiusM, MIN_STRESS_PX * metresPerPixel(map)),
          interactive: false,
          color: "#ffffff",
          weight: 2.5,
          dashArray: "5 6",
          fill: true,
          fillColor: "#ffffff",
          fillOpacity: 0.08,
        });
        entry.parts.stress.push({ circle, radiusM });
        group.addLayer(circle);
      }

      if (showLabels) {
        const info = labelSpots(field.geometry);
        if (info) {
          const days = analysis?.harvest?.daysToReady;
          const text = waiting
            ? `${field.name} · ${ANALYSING_LABEL}`
            : recovery
            ? `${field.name} · Recovery`
            : analysis?.status?.id === "ready"
              ? `${field.name} · Ready`
              : ready && Number.isFinite(days)
                ? `${field.name} · ${days} ${days === 1 ? "day" : "days"}`
                : field.name;
          entry.labelInfo = info;
          entry.labelText = text;
          const marker = L.marker([info.pole.lat, info.pole.lon], {
            pane: "fmLabels",
            keyboard: interactive,
            interactive: true,
            title: text,
            alt: text,
            riseOnHover: true,
            icon: L.divIcon({ className: "fm-label", html: `<span class="fm-pill">${escapeHtml(text)}</span>`, iconSize: null }),
          });
          marker.on("click", () => {
            if (!latest.current.drawMode) latest.current.onSelect?.(field.id);
          });
          marker.on("add", () => {
            const el = marker.getElement();
            if (!el) return;
            el.dataset.fieldId = field.id;
            el.setAttribute("role", "button");
            el.setAttribute("aria-label", `Select ${text}`);
            el.classList.toggle("is-recovery", Boolean(recovery));
            el.classList.toggle("is-ready", Boolean(ready));
            // Enter or Space on a focused pill selects its field (Leaflet
            // only handles clicks on markers).
            el.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (!latest.current.drawMode) latest.current.onSelect?.(field.id);
            });
          });
          entry.parts.label = marker;
          group.addLayer(marker);
        }
      }
      layers.current.fieldIndex.set(field.id, entry);
    }
    group.addTo(map);
    layers.current.fields = group;
    applySelection();
    applyLabelSizes();
    if (focusedId) layers.current.fieldIndex.get(focusedId)?.parts.label?.getElement()?.focus();
    // fieldsKey / analysesKey stand for fields / analyses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, analysesKey, showLabels, interactive]);

  // The selected field: thick white outline, soft halo, dark pill.
  function applySelection() {
    const t = tokensRef.current;
    for (const [id, entry] of layers.current.fieldIndex) {
      const selected = id === latest.current.selectedId;
      entry.parts.shape?.setStyle(shapeStyle({ recovery: entry.recovery, harvested: entry.harvested, ready: entry.ready, waiting: entry.waiting, cls: entry.cls, selected, t }));
      entry.parts.halo?.setStyle({ opacity: selected ? 0.38 : 0 });
      if (selected) entry.parts.shape?.bringToFront();
      const el = entry.parts.label?.getElement();
      if (el) {
        el.classList.toggle("is-selected", selected);
        el.setAttribute("aria-pressed", selected ? "true" : "false");
      }
    }
  }

  useEffect(() => {
    applySelection();
    applyLabelSizes();
    // applySelection reads the latest selection itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Stress circles keep a visible size.
  // Name pills are placed for the current zoom: in the field's top-left
  // corner when a full-size pill fits inside the field (clear of its stress
  // circles), else a small pill, else the small pill at the field's middle.
  // Pills never overlap: the selected field's pill goes first, then the
  // larger fields'; a pill with no free spot is hidden (the selected one
  // always shows).
  function applyLabelSizes() {
    const map = mapRef.current;
    if (!map) return;
    const mpp = metresPerPixel(map);
    const zoom = map.getZoom();
    const fontFamily = mapDivRef.current ? getComputedStyle(mapDivRef.current).fontFamily : "";
    const selectedId = latest.current.selectedId;
    const work = [];
    for (const [id, entry] of layers.current.fieldIndex) {
      for (const { circle, radiusM } of entry.parts.stress || []) circle.setRadius(Math.max(radiusM, MIN_STRESS_PX * mpp));
      const marker = entry.parts.label;
      const el = marker?.getElement();
      if (!el || !entry.labelInfo) continue;
      const { box } = entry.labelInfo;
      const a = map.latLngToLayerPoint([box.south, box.west]);
      const b = map.latLngToLayerPoint([box.north, box.east]);
      const widthPx = Math.abs(b.x - a.x);
      const heightPx = Math.abs(a.y - b.y);
      if (entry.spotZoom !== zoom) {
        entry.spotZoom = zoom;
        entry.choices = labelChoices(entry, mpp, widthPx, heightPx, fontFamily);
      }
      work.push({ id, entry, el, marker, area: widthPx * heightPx, tiny: widthPx < 46 && heightPx < 46 });
    }

    // Selected first, then the larger fields.
    work.sort((x, y) => (x.id === selectedId ? -1 : y.id === selectedId ? 1 : y.area - x.area));
    const placed = [];
    const overlaps = (rect) => placed.some((r) => rect.x1 > r.x0 - 4 && rect.x0 < r.x1 + 4 && rect.y1 > r.y0 - 4 && rect.y0 < r.y1 + 4);
    const rectAt = (spot, size) => {
      const p = map.latLngToLayerPoint([spot.lat, spot.lon]);
      return { x0: p.x - size.w / 2, x1: p.x + size.w / 2, y0: p.y - size.h / 2, y1: p.y + size.h / 2 };
    };
    for (const item of work) {
      const selected = item.id === selectedId;
      let pick = null;
      if (!item.tiny || selected) {
        for (const choice of item.entry.choices) {
          const rect = rectAt(choice.spot, choice.size);
          if (!overlaps(rect)) {
            pick = { ...choice, rect };
            break;
          }
        }
        if (!pick && selected) {
          const last = item.entry.choices[item.entry.choices.length - 1];
          if (last) pick = { ...last, rect: rectAt(last.spot, last.size) };
        }
      }
      item.el.classList.toggle("is-tiny", !pick);
      if (!pick) continue;
      placed.push(pick.rect);
      item.el.classList.toggle("is-small", pick.kind === "small");
      const now = item.marker.getLatLng();
      if (now.lat !== pick.spot.lat || now.lng !== pick.spot.lon) item.marker.setLatLng([pick.spot.lat, pick.spot.lon]);
    }
  }

  // The places a field's pill may go at this zoom, best first: full-size
  // pill spots clear of stress circles, full-size spots, small pill spots
  // clear of stress circles, small spots, then the small pill at the pole.
  function labelChoices(entry, mpp, widthPx, heightPx, fontFamily) {
    const info = entry.labelInfo;
    const patches = (entry.parts.stress || []).map(({ circle }) => ({ at: circle.getLatLng(), r: circle.getRadius() }));
    const clear = (spot, size) =>
      patches.every(({ at, r }) => {
        const dx = Math.max(0, Math.abs(at.lng - spot.lon) * info.kx * 111320 - (size.w / 2) * mpp);
        const dy = Math.max(0, Math.abs(at.lat - spot.lat) * 111320 - (size.h / 2) * mpp);
        return Math.hypot(dx, dy) > r + 3 * mpp;
      });
    const out = [];
    for (const kind of ["normal", "small"]) {
      const size = pillSize(entry.labelText, kind, fontFamily);
      if (widthPx < size.w + size.margin * 2 || heightPx < size.h + size.margin * 2) continue;
      const fitting = info.spots.filter((spot) => pillFits(info, spot, size, mpp));
      const free = fitting.filter((spot) => clear(spot, size));
      for (const spot of [...free, ...fitting.filter((spot) => !free.includes(spot))]) out.push({ kind, size, spot });
    }
    // Nothing fits: a small pill near the field's middle but off its stress
    // circles, else at the middle.
    const small = pillSize(entry.labelText, "small", fontFamily);
    const fromPole = (spot) => Math.hypot((spot.lon - info.pole.lon) * info.kx, spot.lat - info.pole.lat);
    const nearPole = patches.length ? info.spots.filter((spot) => clear(spot, small)).sort((a, b) => fromPole(a) - fromPole(b)).slice(0, 12) : [];
    for (const spot of nearPole) out.push({ kind: "small", size: small, spot });
    out.push({ kind: "small", size: small, spot: info.pole });
    return out;
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onZoom = () => applyLabelSizes();
    map.on("zoomend", onZoom);
    return () => map.off("zoomend", onZoom);
    // applyLabelSizes reads the latest layers itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Candidate fields (farm setup) ----------
  const candidatesKey = (candidates || []).map((c) => c.id).join(",");
  const chosenKey = (selectedCandidateIds || []).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layers.current.candidates?.remove();
    layers.current.candidates = null;
    if (!candidates?.length) return;
    const t = tokensRef.current;
    const chosen = new Set(selectedCandidateIds || []);
    const group = L.layerGroup();
    for (const candidate of candidates) {
      const isChosen = chosen.has(candidate.id);
      const shape = L.polygon(toLatLngs(candidate.geometry), {
        renderer: renderers.current.shapes,
        bubblingMouseEvents: false,
        className: isChosen ? "fm-candidate is-chosen" : "fm-candidate",
        color: isChosen ? "#ffffff" : t["--fmap-candidate"],
        weight: isChosen ? 2.5 : 1.8,
        dashArray: isChosen ? null : "5 5",
        fillColor: isChosen ? t["--fmap-chosen"] : t["--fmap-candidate"],
        fillOpacity: isChosen ? 0.42 : 0.12,
        lineJoin: "round",
      });
      shape.on("click", () => latest.current.onToggleCandidate?.(candidate.id));
      shape.bindTooltip(`${Number(candidate.areaHa || 0).toFixed(1)} ha${isChosen ? " · chosen" : ""}`, { sticky: true, className: "fm-tip", direction: "top", offset: [0, -6] });
      group.addLayer(shape);
    }
    group.addTo(map);
    layers.current.candidates = group;
    // candidatesKey / chosenKey stand for the lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey, chosenKey]);

  // ---------- Boundary, pin and drawing ----------
  const boundaryKey = boundary ? JSON.stringify(boundary).slice(0, 2000) : "";
  const drawKey = drawMode ? JSON.stringify(drawPoints || []) : "";
  const pinKey = pin ? `${pin[0]},${pin[1]},${pinRadiusM || 0}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layers.current.extras?.remove();
    const t = tokensRef.current;
    const group = L.layerGroup();
    const lineColor = t["--fmap-candidate"];
    const rings = boundaryLatLngs(boundary);
    if (rings?.length) {
      group.addLayer(L.polygon(rings, { renderer: renderers.current.shapes, interactive: false, fill: false, color: lineColor, weight: 2, dashArray: "8 6", opacity: 0.95 }));
    }
    if (pin && pin.every(Number.isFinite)) {
      if (pinRadiusM) {
        group.addLayer(L.circle(pin, { renderer: renderers.current.shapes, radius: pinRadiusM, interactive: false, color: lineColor, weight: 2, dashArray: "6 6", fillColor: lineColor, fillOpacity: 0.06 }));
      }
      group.addLayer(L.circleMarker(pin, { renderer: renderers.current.shapes, interactive: false, radius: 7, color: "#1c1c1a", weight: 3, fillColor: "#ffffff", fillOpacity: 1 }));
    }
    if (drawMode && drawPoints?.length) {
      const color = t["--fmap-candidate"];
      if (drawPoints.length >= 3) group.addLayer(L.polygon(drawPoints, { renderer: renderers.current.shapes, interactive: false, color, weight: 2.5, fillColor: color, fillOpacity: 0.15 }));
      else if (drawPoints.length === 2) group.addLayer(L.polyline(drawPoints, { renderer: renderers.current.shapes, interactive: false, color, weight: 2.5 }));
      drawPoints.forEach((point, index) => {
        group.addLayer(L.circleMarker(point, { renderer: renderers.current.shapes, interactive: false, radius: index === 0 ? 6.5 : 5, color, weight: 2.5, fillColor: "#ffffff", fillOpacity: 1 }));
      });
    }
    group.addTo(map);
    layers.current.extras = group;
    // The keys stand for boundary, pin and drawPoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryKey, pinKey, drawKey, drawMode]);

  // ---------- Fitting ----------
  function targetBounds() {
    const now = latest.current;
    let bounds = null;
    const extend = (b) => {
      if (!b || !b.isValid()) return;
      bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    };
    if (now.candidates?.length) extend(fieldsBounds(now.candidates));
    const rings = boundaryLatLngs(now.boundary);
    if (rings?.length) extend(L.polygon(rings).getBounds());
    if (!bounds && now.fields?.length) extend(fieldsBounds(now.fields));
    if (!bounds && now.drawPoints?.length >= 2) extend(L.latLngBounds(now.drawPoints));
    if (!bounds && now.pin) extend(L.latLng(now.pin).toBounds(Math.max(400, (now.pinRadiusM || 600) * 2.4)));
    return bounds;
  }

  const fit = (animate = true) => {
    const map = mapRef.current;
    const bounds = targetBounds();
    if (!map || !bounds) return;
    map.invalidateSize({ pan: false });
    map.fitBounds(bounds, { padding: fitPadding, animate, maxZoom: 17 });
    lastFitAt.current = Date.now();
  };
  const fitNow = useRef(null);
  fitNow.current = fit;

  const shapeKey = `${fields.map((f) => f.id).join(",")}|${candidatesKey}|${boundaryKey ? 1 : 0}`;
  const fittedFor = useRef(null);
  useEffect(() => {
    const key = `${fitKey ?? ""}|${shapeKey}`;
    if (fittedFor.current === key) return;
    const first = fittedFor.current === null;
    fittedFor.current = key;
    fit(!first);
    // fit reads the latest shapes itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, shapeKey]);

  // ---------- Flying to a place ----------
  const focusKey = focusBounds ? JSON.stringify(focusBounds) : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusBounds) return;
    map.flyToBounds(focusBounds, { padding: [48, 48], maxZoom: 15, duration: 0.7 });
    // focusKey stands for focusBounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Zoom in: on the selected field when it is in view (so "+" never lands
  // on empty ground), else round the middle of the map.
  const zoomIn = () => {
    const map = mapRef.current;
    if (!map) return;
    const entry = layers.current.fieldIndex.get(latest.current.selectedId);
    const box = entry && bboxOfGeometry(entry.field.geometry);
    const centre = box && L.latLng((box.south + box.north) / 2, (box.west + box.east) / 2);
    if (centre && map.getBounds().contains(centre)) map.setView(centre, Math.min(map.getMaxZoom(), map.getZoom() + 1));
    else map.zoomIn();
  };

  useImperativeHandle(ref, () => ({
    zoomIn,
    zoomOut: () => mapRef.current?.zoomOut(),
    fit: () => fit(true),
    flyToBounds: (bounds) => bounds && mapRef.current?.flyToBounds(bounds, { padding: [48, 48], maxZoom: 15, duration: 0.7 }),
    getMap: () => mapRef.current,
  }));

  const canFit = fields.length > 0 || (candidates?.length || 0) > 0 || Boolean(boundary) || Boolean(pin);
  const classes = ["fm-map", drawMode ? "is-drawing" : "", interactive ? "" : "is-static", className].filter(Boolean).join(" ");
  return (
    <div ref={wrapRef} className={classes} style={{ height: typeof height === "number" ? `${height}px` : height }} data-zoom={zoom ?? ""}>
      <div ref={mapDivRef} className="fm-canvas" role="region" aria-label={ariaLabel} />
      {interactive && (
        <div className="fm-zoom">
          <button type="button" className="fm-btn" aria-label="Zoom in" title="Zoom in" onClick={zoomIn}>
            <Plus size={17} />
          </button>
          <button type="button" className="fm-btn" aria-label="Zoom out" title="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
            <Minus size={17} />
          </button>
          {canFit && (
            <button type="button" className="fm-btn" aria-label="Fit the fields" title="Fit the fields" onClick={() => fit(true)}>
              <Maximize size={15} />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// How a field's outline and tint are drawn in each state.
function shapeStyle({ recovery, harvested, ready, waiting = false, cls, selected, t }) {
  if (recovery) return { fillColor: t["--c-red"], fillOpacity: 0.38, color: selected ? "#ffffff" : t["--c-red"], weight: selected ? 5 : 3, opacity: 1, dashArray: null };
  // Harvested: a neutral straw tint, not a condition colour.
  if (harvested) return { fillColor: t["--fmap-harvested"], fillOpacity: selected ? 0.4 : 0.3, color: "#ffffff", weight: selected ? 5 : 2, opacity: selected ? 1 : 0.92, dashArray: selected ? null : "6 5" };
  // Ready to harvest (or due soon): the same tint, a gold outline.
  const readyEdge = ready ? { color: t["--fmap-ready"], weight: selected ? 6 : 4, opacity: 1, dashArray: null } : null;
  const fill = cls ? t[CLASS_TOKEN[cls]] : t["--fmap-nodata"];
  // Being analysed: no colour yet, a dashed white edge.
  const dash = waiting && !selected ? "4 6" : null;
  return { fillColor: fill, fillOpacity: selected ? 0.5 : 0.42, color: "#ffffff", weight: selected ? 5 : 2, opacity: selected ? 1 : 0.92, dashArray: dash, ...readyEdge };
}

function metresPerPixel(map) {
  const centre = map.getCenter();
  return (40075016.686 * Math.cos((centre.lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

// ---------- Small parts the pages put on the map ----------

// "Oct 16 · Sentinel-2": the date of the latest clear satellite pass.
export function PassChip({ date, label = "Sentinel-2" }) {
  if (!date) return null;
  return <span className="fm-chip">{`${formatDay(date)} · ${label}`}</span>;
}
