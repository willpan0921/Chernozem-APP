// WHAT THIS FILE DOES
// The Atlas map: a real, zoomable map (Leaflet, on a light grey base map) with the area's border and one coloured square per analyzed cell.
// Every Atlas page that shows a map uses this one component.
//
// WHAT IT RECEIVES
//   area         the area ({ id, geometry, bbox }); its border is drawn
//                dashed and the map fits to it whenever it changes
//   run          the run ({ id, cellSizeDeg }), for the size of the squares
//   places       the scored squares (useAtlasData().scored.places)
//   colorBy      "priority" | "damage" | "access"
//   timeframe    "nearTerm" | "postwar" (for priority colours)
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
//   children     anything to float over the map (legend, panels)
//   ref          gives { zoomIn, zoomOut, fitArea, flyToBounds(bounds), getMap }
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
import { Maximize, Minus, Plus } from "lucide-react";
import { colorStep, colorVar, rankedCount, valueText } from "../../lib/atlas/mapColors.js";
import { placeLabel } from "../../lib/atlas/hotspots.js";
import "./atlas.css";

// The base map under the squares: Esri's light grey canvas, free and with
// no key. (CARTO's light map now shows "API KEY REQUIRED" on every tile
// unless you have a CARTO key.) To use another base map, change these three.
export const BASEMAP = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
  maxNativeZoom: 16,
};
const WORLD_VIEW = { center: [25, 15], zoom: 2 };
const CELL_OPACITY = 0.82;

// Reads the map colours from tokens.css once.
function readColors(element) {
  const style = getComputedStyle(element);
  const names = ["--map-setaside", "--map-nodata", "--map-outline", "--map-selected", "--map-highlight", "--map-draw"];
  for (const mode of ["priority", "damage", "access"]) for (let step = 1; step <= 5; step++) names.push(`--map-${mode}-${step}`);
  const colors = {};
  for (const name of names) colors[name] = style.getPropertyValue(name).trim() || "#999999";
  return colors;
}

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
  ariaLabel = "Map",
  children,
  ref,
}) {
  const wrapRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const colorsRef = useRef(null);
  const rendererRef = useRef(null);
  const layers = useRef({ outline: null, cells: null, cellIndex: new Map(), cellKey: "", marks: null, draw: null });
  const [zoom, setZoom] = useState(null);
  const [hover, setHover] = useState(null);

  // The latest props, for the map's own event handlers.
  const latest = useRef({});
  latest.current = { onSelect, onDrawPoint, drawMode, places, colorBy, timeframe, area };
  const placesById = useRef(new Map());

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
    L.tileLayer(BASEMAP.url, { attribution: BASEMAP.attribution, maxNativeZoom: BASEMAP.maxNativeZoom, maxZoom: 20 }).addTo(map);
    map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom);
    mapRef.current = map;
    colorsRef.current = readColors(wrapRef.current);
    rendererRef.current = renderer;

    const syncZoom = () => setZoom(Math.round(map.getZoom() * 100) / 100);
    syncZoom();
    map.on("zoomend", syncZoom);
    map.on("click", (event) => {
      const now = latest.current;
      if (now.drawMode) now.onDrawPoint?.([round6(event.latlng.lat), round6(wrapLon(event.latlng.lng))]);
      else now.onSelect?.(null);
    });
    map.on("movestart zoomstart", () => setHover(null));

    // Keep the map the right size when its box changes (panels opening,
    // the window resizing, the page laying itself out).
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(wrapRef.current);

    return () => {
      observer.disconnect();
      // Take our shapes off first, while their canvas still exists: removing
      // the map first leaves a redraw queued on a canvas that is gone.
      for (const name of ["cells", "marks", "draw", "outline"]) layers.current[name]?.remove();
      // A zoom animation still running would finish on a map that is gone.
      map.stop();
      map._animatingZoom = false;
      map.off();
      map.remove();
      mapRef.current = null;
      layers.current = { outline: null, cells: null, cellIndex: new Map(), cellKey: "", marks: null, draw: null };
    };
  }, []);

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

  const fitArea = (animate = true) => {
    const map = mapRef.current;
    const bounds = boxOf(latest.current.area?.bbox);
    if (!map || !bounds) return;
    map.fitBounds(bounds, { padding: [24, 24], animate });
  };

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
            fillColor: colorsRef.current["--map-nodata"],
            bubblingMouseEvents: false,
          });
          square.atlasId = place.id;
          group.addLayer(square);
          layers.current.cellIndex.set(place.id, square);
        }
        group.on("click", (event) => {
          const now = latest.current;
          if (now.drawMode) {
            now.onDrawPoint?.([round6(event.latlng.lat), round6(wrapLon(event.latlng.lng))]);
            return;
          }
          now.onSelect?.(placesById.current.get(event.layer.atlasId) || null);
        });
        group.on("mousemove", (event) => {
          if (latest.current.drawMode) return;
          const { x, y } = event.containerPoint;
          setHover({ id: event.layer.atlasId, x, y });
        });
        group.on("mouseout", () => setHover(null));
        group.addTo(map);
        layers.current.cells = group;
      }
    }

    // Colour every square.
    const colors = colorsRef.current;
    const total = rankedCount(list, timeframe);
    for (const place of list) {
      const square = layers.current.cellIndex.get(place.id);
      if (!square) continue;
      const fillColor = colors[colorVar(colorBy, colorStep(place, colorBy, timeframe, total))];
      if (square.options.fillColor !== fillColor) square.setStyle({ fillColor });
    }
  }, [run, places, colorBy, timeframe]);

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
      if (place) group.addLayer(L.rectangle(squareBounds(place, size), { interactive: false, color: colors["--map-highlight"], weight: 1.5, fill: false }));
    }
    const selected = selectedId ? placesById.current.get(selectedId) : null;
    if (selected) {
      group.addLayer(L.rectangle(squareBounds(selected, size), { interactive: false, color: colors["--map-selected"], weight: 2.5, fill: false }));
    }
    group.addTo(map);
    layers.current.marks = group;
    // highlightKey stands for highlightIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, highlightKey, run, places]);

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

  const hoverPlace = hover ? placesById.current.get(hover.id) : null;
  const total = hoverPlace ? rankedCount(places || [], timeframe) : 0;
  const wrapWidth = wrapRef.current?.clientWidth || 0;
  const tipLeft = hover ? Math.min(hover.x + 14, Math.max(8, wrapWidth - 220)) : 0;

  const classes = ["atlas-map", drawMode ? "is-drawing" : "", interactive ? "" : "is-static", className].filter(Boolean).join(" ");
  return (
    <div
      ref={wrapRef}
      className={classes}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
      data-zoom={zoom ?? ""}
    >
      <div ref={mapDivRef} className="atlas-map-canvas" role="region" aria-label={ariaLabel} />

      {interactive && (
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
      )}

      {hoverPlace && (
        <div className="atlas-map-tip" style={{ left: tipLeft, top: hover.y + 14 }} role="tooltip">
          <span className="atlas-map-tip-title">{placeLabel(hoverPlace, run?.cellSizeDeg)}</span>
          <span className="atlas-map-tip-value">{valueText(hoverPlace, colorBy, timeframe, total)}</span>
        </div>
      )}

      {children}
    </div>
  );
}

// Six decimals is about 10 cm: plenty for a farm corner.
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

// Leaflet can give longitudes past ±180 after panning round the world.
function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
