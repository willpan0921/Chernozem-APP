// WHAT THIS FILE DOES
// The Atlas map: a real, zoomable map (Leaflet, on a light grey base map) with the area's border and one coloured square per analyzed cell.
// Every Atlas page that shows a map uses this one component.
//
// WHAT IT RECEIVES
//   area         the area ({ id, geometry, bbox }); its border is drawn
//                dashed and the map fits to it whenever it changes
//   run          the run ({ id, cellSizeDeg }), for the size of the squares
//   places       the scored squares (useAtlasData().scored.places)
//   colorBy      "priority" | "value" | "damage" | "access" (Feasibility)
//   timeframe    "nearTerm" | "postwar" (for priority colours)
//   units        the area's states or districts (GET /api/areas/:id/units,
//                scored by src/lib/atlas/units.js when unitView is on):
//                their borders are drawn over the squares, dark, with their
//                names in bold: the picked unit's always, then by rank in
//                the time frame, then the biggest; a name that does not fit
//                tries other spots inside its unit and a smaller size, and
//                is hidden until zoomed in only when none fits (never under
//                the buttons, the key or the panels' tabs)
//   unitView     true: the States view: the squares are hidden and each
//                unit is filled by its own score (same colour scales),
//                with bold outlines; hover highlights it, a click calls
//                onSelectUnit(unit)
//   selectedUnitId     the picked unit (bold dark outline)
//   highlightUnitId    a unit to outline (a row of the list hovered)
//   onSelectUnit       called with the clicked unit (States view)
//   selectedId   the id of the selected square (drawn with a dark border)
//   onSelect     called with the clicked place, or null for empty map
//   highlightIds square ids to outline (e.g. a top area's squares)
//   focusBounds  [[south, west], [north, east]]: the map flies there
//                whenever this changes
//   fitKey       change it to fit the map to the area again
//   interactive  false turns off dragging, zooming and the buttons
//   height       a number (px) or any CSS height ("100%"); default 380
//   drawMode     true: clicks add points (onDrawPoint([lat, lon])) instead
//                of selecting; drawPoints are drawn as a shape
//   satelliteOnly          true: "Satellite only" (below)
//   onSatelliteOnlyChange  give it to show the "Satellite only" button under
//                          the zoom buttons; called with true or false
//   steady       true (the Atlas map page): when the map's box changes size
//                (a side panel dragged or hidden, the menu folded) what is on
//                screen stays put, and a map still showing the whole area
//                fits it again to the new size (src/lib/mapResize.js)
//   children     anything to float over the map (legend, panels); hidden
//                while satelliteOnly
//   ref          gives { zoomIn, zoomOut, fitArea, flyToBounds(bounds), getMap }
//
// "Satellite only": the base map becomes satellite imagery (Esri World
// Imagery, as on the Field map) and the squares, the area's border, the
// marks and the key are hidden, so only the picture shows. The zoom
// buttons, the button itself and the credit of the tiles shown stay, and a
// small "Satellite only · Show layers" chip in the top-left corner says why
// the map is bare and turns it off. Clicks on the map then select nothing
// (and do not clear the picked place). Turning it off brings back the grey
// map, the squares and the key as they were.
//
// Layers, bottom to top: the base map, the squares (or, in the States
// view, the units' fills), the units' borders, the marks (picked and
// highlighted squares or units), the units' names. Only the squares and the
// fills take clicks; the panes above them let clicks through, and the
// fills' pane only while the States view is on (its canvas stays on the
// map after the fills are taken off, and would otherwise sit over the
// squares and swallow their taps and hovers).
//
// The container carries data-zoom="<zoom level>" so tests can check that
// zooming worked. The colours come from CSS variables in tokens.css.
//
// WHO EDITS IT
// Whoever changes how the Atlas map looks or behaves. The colour rules are
// in src/lib/atlas/mapColors.js; the colours in src/styles/tokens.css.

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Layers, Maximize, Minus, Plus, Satellite } from "lucide-react";
import { COLOR_MODES, colorStep, colorVar, rankedCount, valueText } from "../../lib/atlas/mapColors.js";
import { placeLabel } from "../../lib/atlas/hotspots.js";
import { placeLabels, pointInGeometry } from "../../lib/atlas/labels.js";
import { settleView, showsFit, watchMapSize } from "../../lib/mapResize.js";
import { LIGHT_GREY, SATELLITE } from "../../config/maps.js";
import "./atlas.css";

// The base map under the squares: Esri's light grey canvas, free and with
// no key; "Satellite only" swaps it for Esri World Imagery. Both are set in
// src/config/maps.js.
export const BASEMAP = LIGHT_GREY;
const WORLD_VIEW = { center: [25, 15], zoom: 2 };
// Room kept round the area when the map fits it.
const AREA_PADDING = [24, 24];
const CELL_OPACITY = 0.82;
const UNIT_OPACITY = 0.86;
// The panes over the squares (Leaflet's overlay pane is 400): the States
// view's fills take clicks (only while that view is on: the States view
// effect below); the borders, marks and names let them through.
const PANES = [
  ["atlasUnitFill", 405, true],
  ["atlasUnitLines", 420, false],
  ["atlasMarks", 430, false],
  ["atlasUnitLabels", 440, false],
];


// Reads the map colours from tokens.css once.
function readColors(element) {
  const style = getComputedStyle(element);
  const names = ["--map-nodata", "--map-outline", "--map-selected", "--map-highlight", "--map-draw", "--map-unit-line"];
  for (const mode of COLOR_MODES) for (let step = 1; step <= 5; step++) names.push(`--map-${mode}-${step}`);
  names.push("--map-nodata-hatch");
  const colors = {};
  for (const name of names) colors[name] = style.getPropertyValue(name).trim() || "#999999";
  colors.hatch = hatchPattern(colors["--map-nodata"], colors["--map-nodata-hatch"]);
  return colors;
}

// Places with no score (not ranked: no black-soil cropland, no map square;
// or no reading on the Value, Damage or Feasibility map) are hatched, so
// they never pass for the lightest shade of a score. A canvas pattern of
// thin diagonal lines over the no-data colour; the plain colour where a
// canvas is not available.
function hatchPattern(background, line) {
  try {
    const tile = document.createElement("canvas");
    tile.width = 8;
    tile.height = 8;
    const ctx = tile.getContext("2d");
    if (!ctx) return background;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 8, 8);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (const shift of [-8, 0, 8]) {
      ctx.moveTo(shift - 1, 9);
      ctx.lineTo(shift + 9, -1);
    }
    ctx.stroke();
    return ctx.createPattern(tile, "repeat") || background;
  } catch {
    return background;
  }
}

// The fill for a colour step's variable: the hatch for no score.
const fillOf = (colors, name) => (name === "--map-nodata" ? colors.hatch : colors[name]);

// Leaflet's canvas can run one last queued redraw after the map is gone
// (when a map is removed right after it drew), which throws. This canvas
// skips a redraw once it has been taken off the map.
const SafeCanvas = L.Canvas.extend({
  _redraw() {
    if (!this._ctx || !this._map) return;
    L.Canvas.prototype._redraw.call(this);
  },
});

const boxOf = (bbox) => (bbox && bbox.length === 4 ? [[bbox[1], bbox[0]], [bbox[3], bbox[2]]] : null);

function squareBounds(place, size) {
  const half = size / 2;
  return [[place.lat - half, place.lon - half], [place.lat + half, place.lon + half]];
}

// A unit as a GeoJSON feature (its id in the properties).
const unitFeature = (unit) => ({ type: "Feature", properties: { id: unit.id }, geometry: unit.geometry });

// The name shown for a unit, or null (GAUL has none: no label, never an
// invented one).
const unitName = (unit) => unit?.displayName ?? null;

// The spots tried for a name besides its label point, as shares of its
// unit's width and height on screen (each kept only if it lies inside the
// unit).
const LABEL_SHIFTS = [
  [0, -0.12], [0, 0.12], [-0.12, 0], [0.12, 0],
  [0, -0.22], [0, 0.22], [-0.22, 0], [0.22, 0],
  [-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18],
  [-0.3, 0], [0.3, 0], [0, -0.34], [0, 0.34],
  [-0.3, -0.12], [0.3, -0.12], [-0.3, 0.12], [0.3, 0.12],
];
// The best-ranked units are named first; after them, the biggest.
const LABEL_TOP_RANKS = 10;

// What names may not cover: the map's own buttons, the floating key and
// panels, and the side columns' tabs on the map's edges.
const LABEL_WALLS = ".atlas-map-controls, .atlas-map-float, .map-sat-chip, .panel-tab";

// Shows the units' names that fit (src/lib/atlas/labels.js placeLabels), in
// order of importance: the picked unit first (always named), then the ten
// best-ranked in the time frame shown, then the biggest. A name that does not fit at
// its label point tries other spots inside its unit, then a smaller size,
// before it is hidden; none covers the map's buttons or the panels' tabs.
//   now  { units: Map id -> scored unit, timeframe, selectedUnitId }
function layoutLabels(map, labels, now = {}) {
  if (!map || !labels.length) return;
  const container = map.getContainer();
  const origin = container.getBoundingClientRect();
  const local = (box) => ({ left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top });
  const scoredUnits = now.units || new Map();
  const timeframe = now.timeframe || "nearTerm";
  const rankOf = (unit) => {
    const rank = (scoredUnits.get(unit.id) || unit)?.[timeframe]?.rank;
    return Number.isFinite(rank) && rank <= LABEL_TOP_RANKS ? rank : Infinity;
  };
  const ordered = [...labels].sort(
    (a, b) =>
      Number(b.unit.id === now.selectedUnitId) - Number(a.unit.id === now.selectedUnitId) ||
      rankOf(a.unit) - rankOf(b.unit) ||
      (b.unit.areaKm2 || 0) - (a.unit.areaKm2 || 0)
  );
  const items = [];
  for (const { marker, unit } of ordered) {
    const el = marker.getElement()?.firstChild;
    if (!el) continue;
    // Measured where it would sit at its label point, full size.
    el.style.transform = "";
    const rect = local(el.getBoundingClientRect());
    let unitRect = null;
    const anchors = [];
    if (Array.isArray(unit.bbox) && unit.bbox.length === 4) {
      const [w, s, e, n] = unit.bbox;
      const a = map.latLngToContainerPoint([s, w]);
      const b = map.latLngToContainerPoint([n, e]);
      unitRect = { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
      const cx = (rect.left + rect.right) / 2;
      const cy = (rect.top + rect.bottom) / 2;
      const uw = unitRect.right - unitRect.left;
      const uh = unitRect.bottom - unitRect.top;
      for (const [fx, fy] of LABEL_SHIFTS) {
        const dx = Math.round(fx * uw);
        const dy = Math.round(fy * uh);
        if (!dx && !dy) continue;
        const at = map.containerPointToLatLng([cx + dx, cy + dy]);
        if (pointInGeometry(at.lng, at.lat, unit.geometry)) anchors.push({ dx, dy });
      }
    }
    items.push({ id: unit.id, el, rect, unitRect, anchors, always: unit.id === now.selectedUnitId });
  }
  const blocked = [];
  const scope = container.closest(".atlas-map")?.parentElement || container;
  for (const wall of scope.querySelectorAll(LABEL_WALLS)) {
    const box = wall.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) blocked.push(local(box));
  }
  const size = map.getSize();
  const shown = placeLabels(items, { view: { width: size.x, height: size.y }, blocked });
  for (const item of items) {
    const spot = shown.get(item.id);
    item.el.classList.toggle("is-hidden", !spot);
    if (spot && (spot.dx || spot.dy || spot.scale !== 1)) item.el.style.transform = `translate(calc(-50% + ${spot.dx}px), calc(-50% + ${spot.dy}px)) scale(${spot.scale})`;
  }
}

export default function AtlasMap({
  area,
  run,
  places,
  colorBy = "priority",
  timeframe = "nearTerm",
  selectedId = null,
  onSelect,
  highlightIds,
  focusBounds,
  fitKey,
  interactive = true,
  height = 380,
  className = "",
  drawMode = false,
  drawPoints,
  onDrawPoint,
  satelliteOnly = false,
  onSatelliteOnlyChange,
  steady = false,
  units = null,
  unitView = false,
  selectedUnitId = null,
  highlightUnitId = null,
  onSelectUnit,
  ariaLabel = "Map",
  children,
  ref,
}) {
  const wrapRef = useRef(null);
  const satButtonRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const colorsRef = useRef(null);
  const rendererRef = useRef(null);
  const layers = useRef({ outline: null, cells: null, cellIndex: new Map(), cellKey: "", marks: null, draw: null, unitLines: null, unitFill: null, unitFillIndex: new Map(), unitLabels: null, labelList: [], unitKey: "" });
  const renderers = useRef({ fill: null, lines: null, marks: null });
  const tiles = useRef({ base: null, satellite: null });
  const fitAreaNow = useRef(null);
  const [zoom, setZoom] = useState(null);
  const [hover, setHover] = useState(null);

  // The latest props, for the map's own event handlers.
  const latest = useRef({});
  latest.current = { onSelect, onSelectUnit, onDrawPoint, drawMode, places, colorBy, timeframe, area, satelliteOnly, steady, selectedId, selectedUnitId, unitView, size: run?.cellSizeDeg || 0 };
  const placesById = useRef(new Map());
  const unitsById = useRef(new Map());

  // ---------- Create the map once ----------
  useEffect(() => {
    const renderer = new SafeCanvas({ padding: 0.4 });
    const map = L.map(mapDivRef.current, {
      zoomControl: false,
      preferCanvas: true,
      renderer,
      zoomSnap: 0.25,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 110,
      wheelDebounceTime: 30,
      minZoom: 1,
      maxZoom: 19,
      worldCopyJump: true,
    });
    map.attributionControl.setPrefix(false);
    tiles.current.base = L.tileLayer(BASEMAP.url, { attribution: BASEMAP.attribution, maxNativeZoom: BASEMAP.maxNativeZoom, maxZoom: 20 });
    if (!latest.current.satelliteOnly) tiles.current.base.addTo(map);
    map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom);
    mapRef.current = map;
    colorsRef.current = readColors(wrapRef.current);
    rendererRef.current = renderer;
    for (const [name, zIndex, takesClicks] of PANES) {
      const pane = map.createPane(name);
      pane.style.zIndex = String(zIndex);
      if (!takesClicks) pane.style.pointerEvents = "none";
    }
    renderers.current = {
      fill: new SafeCanvas({ padding: 0.4, pane: "atlasUnitFill" }),
      lines: new SafeCanvas({ padding: 0.4, pane: "atlasUnitLines" }),
      marks: new SafeCanvas({ padding: 0.4, pane: "atlasMarks" }),
    };

    const syncZoom = () => setZoom(Math.round(map.getZoom() * 100) / 100);
    syncZoom();
    map.on("zoomend", syncZoom);
    map.on("click", (event) => {
      const now = latest.current;
      // Satellite only: nothing on the map to pick (the picked place stays).
      if (now.satelliteOnly) return;
      if (now.drawMode) now.onDrawPoint?.([round6(event.latlng.lat), round6(wrapLon(event.latlng.lng))]);
      else now.onSelect?.(null);
    });
    map.on("movestart zoomstart", () => setHover(null));
    // The units' names: which fit is worked out again after every move.
    let labelFrame = 0;
    const relayout = () => {
      cancelAnimationFrame(labelFrame);
      labelFrame = requestAnimationFrame(() => layoutLabels(map, layers.current.labelList, { units: unitsById.current, timeframe: latest.current.timeframe, selectedUnitId: latest.current.selectedUnitId }));
    };
    map.on("zoomend moveend resize", relayout);
    layers.current.relayout = relayout;

    // Keep the map the right size when its box changes (panels opening,
    // the window resizing, the page laying itself out). A steady map (the
    // Atlas map page) keeps what is on screen in place, and fits the whole
    // area again once a panel is resized or hidden if it was showing it
    // all; else, when the change covered the picked square (the right
    // column reopened by the click that picked it), brings it back on
    // screen (src/lib/mapResize.js).
    const areaBounds = () => {
      const box = boxOf(latest.current.area?.bbox);
      return box ? L.latLngBounds(box) : null;
    };
    const pickedBounds = () => {
      const place = placesById.current.get(latest.current.selectedId);
      return place && latest.current.size ? L.latLngBounds(squareBounds(place, latest.current.size)) : null;
    };
    const stopWatching = watchMapSize(map, wrapRef.current, {
      steady: () => latest.current.steady,
      snapshot: () => ({ fitted: showsFit(map, areaBounds(), { padding: AREA_PADDING }) }),
      // The picked square as it is now: the click that picked it may be
      // drawn after the column it reopened.
      settle: (before) => settleView(map, before, { fit: () => fitAreaNow.current?.(true), pick: pickedBounds(), padding: [56, 56] }),
    });

    return () => {
      stopWatching();
      // Take our shapes off first, while their canvas still exists: removing
      // the map first leaves a redraw queued on a canvas that is gone.
      for (const name of ["cells", "marks", "draw", "outline", "unitFill", "unitLines", "unitLabels"]) layers.current[name]?.remove();
      tiles.current.base?.remove();
      tiles.current.satellite?.remove();
      tiles.current = { base: null, satellite: null };
      // A zoom animation still running would finish on a map that is gone.
      map.stop();
      map._animatingZoom = false;
      map.off();
      map.remove();
      mapRef.current = null;
      layers.current = { outline: null, cells: null, cellIndex: new Map(), cellKey: "", marks: null, draw: null, unitLines: null, unitFill: null, unitFillIndex: new Map(), unitLabels: null, labelList: [], unitKey: "" };
    };
  }, []);

  // ---------- Satellite only: the base map ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { base } = tiles.current;
    if (satelliteOnly) {
      tiles.current.satellite ??= L.tileLayer(SATELLITE.url, { attribution: SATELLITE.attribution, maxNativeZoom: SATELLITE.maxNativeZoom, maxZoom: 20 });
      base?.remove();
      tiles.current.satellite.addTo(map);
    } else {
      tiles.current.satellite?.remove();
      if (base && !map.hasLayer(base)) base.addTo(map);
    }
    setHover(null);
  }, [satelliteOnly]);

  // ---------- Turn interaction on or off ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const handler of ["dragging", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "touchZoom", "keyboard"]) {
      if (interactive) map[handler]?.enable();
      else map[handler]?.disable();
    }
  }, [interactive]);

  // ---------- The area's border, and fitting to it ----------
  const bboxKey = area?.bbox ? area.bbox.join(",") : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layers.current.outline) layers.current.outline.remove();
    layers.current.outline = null;
    if (area?.geometry) {
      layers.current.outline = L.geoJSON(area.geometry, {
        interactive: false,
        style: { color: colorsRef.current["--map-outline"], weight: 1.5, opacity: 0.85, dashArray: "5 5", fill: false },
      }).addTo(map);
    }
  }, [area?.id, area?.geometry]);

  // In the States view the area's border is bold and solid, like the
  // units' outlines.
  useEffect(() => {
    layers.current.outline?.setStyle(unitView ? { weight: 2.6, opacity: 1, dashArray: null } : { weight: 1.5, opacity: 0.85, dashArray: "5 5" });
  }, [unitView, area?.id, area?.geometry]);

  const fitArea = (animate = true) => {
    const map = mapRef.current;
    const bounds = boxOf(latest.current.area?.bbox);
    if (!map || !bounds) return;
    map.fitBounds(bounds, { padding: AREA_PADDING, animate });
  };
  fitAreaNow.current = fitArea;

  useEffect(() => {
    fitArea(false);
    // fitArea reads the latest area itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area?.id, bboxKey, fitKey]);

  // ---------- The squares ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const list = places || run?.cells || [];
    const size = run?.cellSizeDeg || 0;
    placesById.current = new Map(list.map((place) => [place.id, place]));
    const key = `${run?.id || ""}|${size}|${list.length}|${list[0]?.id || ""}|${list[list.length - 1]?.id || ""}`;

    // Build the squares only when the run changes; colour changes reuse them.
    if (key !== layers.current.cellKey) {
      if (layers.current.cells) layers.current.cells.remove();
      layers.current.cellIndex = new Map();
      layers.current.cells = null;
      layers.current.cellKey = key;
      if (list.length && size > 0) {
        const group = L.featureGroup();
        for (const place of list) {
          const square = L.rectangle(squareBounds(place, size), {
            renderer: rendererRef.current,
            stroke: false,
            fillOpacity: CELL_OPACITY,
            fillColor: colorsRef.current.hatch,
            bubblingMouseEvents: false,
          });
          square.atlasId = place.id;
          group.addLayer(square);
          layers.current.cellIndex.set(place.id, square);
        }
        group.on("click", (event) => {
          const now = latest.current;
          if (now.satelliteOnly) return;
          if (now.drawMode) {
            now.onDrawPoint?.([round6(event.latlng.lat), round6(wrapLon(event.latlng.lng))]);
            return;
          }
          now.onSelect?.(placesById.current.get(event.layer.atlasId) || null);
        });
        group.on("mousemove", (event) => {
          if (latest.current.drawMode || latest.current.satelliteOnly) return;
          const { x, y } = event.containerPoint;
          setHover({ id: event.layer.atlasId, x, y });
        });
        group.on("mouseout", () => setHover(null));
        if (!latest.current.unitView) group.addTo(map);
        layers.current.cells = group;
      }
    }

    // Colour every square.
    const colors = colorsRef.current;
    const total = rankedCount(list, timeframe);
    for (const place of list) {
      const square = layers.current.cellIndex.get(place.id);
      if (!square) continue;
      const fillColor = fillOf(colors, colorVar(colorBy, colorStep(place, colorBy, timeframe, total)));
      if (square.options.fillColor !== fillColor) square.setStyle({ fillColor });
    }
  }, [run, places, colorBy, timeframe]);

  // ---------- The states and regions: borders, names, fills ----------
  const unitKey = units?.length ? `${area?.id || ""}|${units.length}|${units[0].id}|${units[units.length - 1].id}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const name of ["unitLines", "unitFill", "unitLabels"]) layers.current[name]?.remove();
    layers.current.unitLines = null;
    layers.current.unitFill = null;
    layers.current.unitLabels = null;
    layers.current.unitFillIndex = new Map();
    layers.current.labelList = [];
    layers.current.unitKey = unitKey;
    if (!unitKey) return;
    const list = units.filter((unit) => unit.geometry);
    const colors = colorsRef.current;

    // The borders, over the squares.
    layers.current.unitLines = L.geoJSON(
      { type: "FeatureCollection", features: list.map(unitFeature) },
      { renderer: renderers.current.lines, interactive: false, style: { color: colors["--map-unit-line"], weight: 1.5, opacity: 0.85, fill: false, lineJoin: "round" } }
    ).addTo(map);

    // The fills of the States view (added to the map only in that view).
    const fill = L.geoJSON(
      { type: "FeatureCollection", features: list.map(unitFeature) },
      {
        renderer: renderers.current.fill,
        style: { stroke: false, fillOpacity: UNIT_OPACITY, fillColor: colors.hatch },
        bubblingMouseEvents: false,
        onEachFeature: (feature, layer) => {
          layer.options.bubblingMouseEvents = false;
          const id = feature.properties.id;
          const index = layers.current.unitFillIndex;
          if (!index.has(id)) index.set(id, []);
          index.get(id).push(layer);
        },
      }
    );
    fill.on("click", (event) => {
      const now = latest.current;
      if (now.satelliteOnly || now.drawMode) return;
      now.onSelectUnit?.(unitsById.current.get(event.layer?.feature?.properties?.id) || null);
    });
    fill.on("mousemove", (event) => {
      if (latest.current.drawMode || latest.current.satelliteOnly) return;
      const { x, y } = event.containerPoint;
      setHover({ unitId: event.layer?.feature?.properties?.id, x, y });
    });
    fill.on("mouseout", () => setHover(null));
    layers.current.unitFill = fill;

    // The names: bold, dark on a light halo (placed by layoutLabels).
    const labels = L.layerGroup();
    const labelList = [];
    for (const unit of [...list].sort((a, b) => (b.areaKm2 || 0) - (a.areaKm2 || 0))) {
      const name = unitName(unit);
      if (!name || !unit.labelPoint) continue;
      const text = document.createElement("span");
      text.className = "atlas-unit-name";
      text.textContent = name;
      const marker = L.marker([unit.labelPoint.lat, unit.labelPoint.lon], {
        pane: "atlasUnitLabels",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "atlas-unit-label", html: text, iconSize: null }),
      });
      labels.addLayer(marker);
      labelList.push({ marker, unit });
    }
    labels.addTo(map);
    layers.current.unitLabels = labels;
    layers.current.labelList = labelList;
    layers.current.relayout?.();
    // unitKey stands for the units' borders; their scores are coloured below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitKey]);

  // The States view: the squares give way to the units, each filled by its
  // own score; the borders get bolder.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    unitsById.current = new Map((units || []).map((unit) => [unit.id, unit]));
    const cells = layers.current.cells;
    const fill = layers.current.unitFill;
    const showUnits = Boolean(unitView && fill);
    if (cells) {
      if (showUnits && map.hasLayer(cells)) cells.remove();
      if (!showUnits && !map.hasLayer(cells)) cells.addTo(map);
    }
    if (fill) {
      if (showUnits && !map.hasLayer(fill)) fill.addTo(map);
      if (!showUnits && map.hasLayer(fill)) fill.remove();
    }
    // Taking the fills off leaves their canvas in its pane (Leaflet never
    // removes a renderer with its shapes), above the squares' canvas: it
    // would take every tap and hover meant for a square. So the pane takes
    // clicks only while the fills are shown.
    const fillPane = map.getPane("atlasUnitFill");
    if (fillPane) fillPane.style.pointerEvents = showUnits ? "" : "none";
    layers.current.unitLines?.setStyle(showUnits ? { weight: 2, opacity: 1 } : { weight: 1.5, opacity: 0.85 });
    wrapRef.current?.classList.toggle("is-unit-view", showUnits);
    layers.current.relayout?.();
    setHover(null);
    if (!showUnits) return;
    const colors = colorsRef.current;
    const total = rankedCount(units, timeframe);
    for (const unit of units || []) {
      const fillColor = fillOf(colors, colorVar(colorBy, colorStep(unit, colorBy, timeframe, total)));
      for (const layer of layers.current.unitFillIndex.get(unit.id) || []) if (layer.options.fillColor !== fillColor) layer.setStyle({ fillColor });
    }
  }, [unitView, units, unitKey, colorBy, timeframe]);

  // The names are placed again when their order changes: another picked
  // unit, another time frame, or new scores (the weights).
  useEffect(() => {
    layers.current.relayout?.();
  }, [selectedUnitId, timeframe, units]);

  // ---------- Selected square and highlighted squares ----------
  const highlightKey = (highlightIds || []).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layers.current.marks) layers.current.marks.remove();
    layers.current.marks = null;
    const size = run?.cellSizeDeg;
    if (!size) return;
    const group = L.layerGroup();
    const colors = colorsRef.current;
    for (const id of highlightIds || []) {
      const place = placesById.current.get(id);
      if (place) group.addLayer(L.rectangle(squareBounds(place, size), { renderer: renderers.current.marks, interactive: false, color: colors["--map-highlight"], weight: 1.5, fill: false }));
    }
    const selected = selectedId ? placesById.current.get(selectedId) : null;
    if (selected) {
      group.addLayer(L.rectangle(squareBounds(selected, size), { renderer: renderers.current.marks, interactive: false, color: colors["--map-selected"], weight: 2.5, fill: false }));
    }
    // A unit hovered in the list (or on the map), and the picked unit.
    const outline = (id, style) => {
      const unit = units?.find((item) => item.id === id);
      if (unit?.geometry) group.addLayer(L.geoJSON(unit.geometry, { renderer: renderers.current.marks, interactive: false, style: { fill: false, lineJoin: "round", ...style } }));
    };
    const hoverUnitId = unitView ? hover?.unitId : null;
    for (const id of new Set([highlightUnitId, hoverUnitId].filter(Boolean))) if (id !== selectedUnitId) outline(id, { color: colors["--map-highlight"], weight: 3 });
    if (selectedUnitId) outline(selectedUnitId, { color: colors["--map-selected"], weight: 3.5 });
    group.addTo(map);
    layers.current.marks = group;
    // highlightKey stands for highlightIds; hover only matters by its unit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, highlightKey, run, places, unitKey, unitView, selectedUnitId, highlightUnitId, hover?.unitId]);

  // ---------- Flying to a place ----------
  const focusKey = focusBounds ? JSON.stringify(focusBounds) : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusBounds) return;
    map.flyToBounds(focusBounds, { padding: [48, 48], maxZoom: 14, duration: 0.6 });
    // focusKey stands for focusBounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // ---------- Drawing an area ----------
  const drawKey = drawMode ? JSON.stringify(drawPoints || []) : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layers.current.draw) layers.current.draw.remove();
    layers.current.draw = null;
    if (!drawMode || !drawPoints?.length) return;
    const color = colorsRef.current["--map-draw"];
    const group = L.layerGroup();
    if (drawPoints.length >= 3) group.addLayer(L.polygon(drawPoints, { interactive: false, color, weight: 2, fillColor: color, fillOpacity: 0.12 }));
    else if (drawPoints.length === 2) group.addLayer(L.polyline(drawPoints, { interactive: false, color, weight: 2 }));
    drawPoints.forEach((point, index) => {
      group.addLayer(
        L.circleMarker(point, {
          interactive: false,
          radius: index === 0 ? 6 : 5,
          color,
          weight: 2,
          fillColor: "#ffffff",
          fillOpacity: 1,
        })
      );
    });
    group.addTo(map);
    layers.current.draw = group;
    // drawKey stands for drawPoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, drawKey]);

  // ---------- What other components can call ----------
  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    fitArea: () => fitArea(true),
    flyToBounds: (bounds) => bounds && mapRef.current?.flyToBounds(bounds, { padding: [48, 48], maxZoom: 14, duration: 0.6 }),
    getMap: () => mapRef.current,
  }));

  const hoverPlace = hover && !satelliteOnly && hover.id ? placesById.current.get(hover.id) : null;
  const hoverUnit = hover && !satelliteOnly && unitView && hover.unitId ? unitsById.current.get(hover.unitId) : null;
  const total = hoverPlace ? rankedCount(places || [], timeframe) : hoverUnit ? rankedCount(units || [], timeframe) : 0;
  const wrapWidth = wrapRef.current?.clientWidth || 0;
  const tipLeft = hover ? Math.min(hover.x + 14, Math.max(8, wrapWidth - 220)) : 0;

  // The "Satellite only · Show layers" chip turns it off. It goes away as it
  // does, so keyboard focus moves to the Satellite only button (which now
  // reads "off") instead of being lost.
  const showLayers = (event) => {
    if (event.currentTarget.contains(document.activeElement)) satButtonRef.current?.focus();
    onSatelliteOnlyChange?.(false);
  };

  const classes = ["atlas-map", drawMode ? "is-drawing" : "", interactive ? "" : "is-static", satelliteOnly ? "is-satellite-only" : "", className].filter(Boolean).join(" ");
  return (
    <div
      ref={wrapRef}
      className={classes}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
      data-zoom={zoom ?? ""}
    >
      <div ref={mapDivRef} className="atlas-map-canvas" role="region" aria-label={ariaLabel} />

      {interactive && (
        <div className="atlas-map-controls">
          <div className="atlas-map-zoom">
            <button type="button" className="atlas-map-btn" aria-label="Zoom in" title="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
              <Plus size={16} />
            </button>
            <button type="button" className="atlas-map-btn" aria-label="Zoom out" title="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
              <Minus size={16} />
            </button>
            {area?.bbox && (
              <button type="button" className="atlas-map-btn" aria-label="Fit the area" title="Fit the area" onClick={() => fitArea(true)}>
                <Maximize size={14} />
              </button>
            )}
          </div>
          {onSatelliteOnlyChange && (
            <button
              ref={satButtonRef}
              type="button"
              className={satelliteOnly ? "atlas-map-btn atlas-map-sat is-on" : "atlas-map-btn atlas-map-sat"}
              aria-label="Satellite only"
              aria-pressed={satelliteOnly}
              title={satelliteOnly ? "Show map layers" : "Satellite only"}
              onClick={() => onSatelliteOnlyChange(!satelliteOnly)}
            >
              <Satellite size={16} />
            </button>
          )}
        </div>
      )}

      {/* Satellite only: says why the map is bare, and turns it off. */}
      {interactive && satelliteOnly && onSatelliteOnlyChange && (
        <button type="button" className="map-sat-chip" title="Show the squares, the area's border and the key again" onClick={showLayers}>
          <Satellite size={14} aria-hidden="true" />
          <span className="map-sat-chip-label">Satellite only</span>{" "}
          <span className="map-sat-chip-action">
            <Layers size={13} aria-hidden="true" />
            Show layers
          </span>
        </button>
      )}

      {hoverPlace && (
        <div className="atlas-map-tip" style={{ left: tipLeft, top: hover.y + 14 }} role="tooltip">
          <span className="atlas-map-tip-title">{placeLabel(hoverPlace, run?.cellSizeDeg)}</span>
          <span className="atlas-map-tip-value">{valueText(hoverPlace, colorBy, timeframe, total, run)}</span>
        </div>
      )}
      {hoverUnit && (
        <div className="atlas-map-tip" style={{ left: tipLeft, top: hover.y + 14 }} role="tooltip">
          <span className="atlas-map-tip-title">{unitName(hoverUnit) || "No name in FAO GAUL"}</span>
          <span className="atlas-map-tip-value">{unitTip(hoverUnit, colorBy, timeframe, total, run)}</span>
        </div>
      )}

      {!satelliteOnly && children}
    </div>
  );
}

// A state's hover text: the value the map colours it by. On the Priority map
// a state that is not ranked says why ("No black-soil cropland"); on the
// Value, Damage and Feasibility maps it gives its score whenever it has one.
const SCORE_OF = { value: "soil", damage: "damage", access: "access" };
// run: the run shown (a natural disaster words Feasibility by its type).
function unitTip(unit, colorBy, timeframe, total, run = null) {
  const scored = unit.analyzed || unit.nearTerm?.tier === "setAside" || (SCORE_OF[colorBy] && Number.isFinite(unit[SCORE_OF[colorBy]]));
  return scored ? valueText(unit, colorBy, timeframe, total, run) : unit.reason || "Not ranked";
}

// Six decimals is about 10 cm: plenty for a farm corner.
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

// Leaflet can give longitudes past ±180 after panning round the world.
function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
