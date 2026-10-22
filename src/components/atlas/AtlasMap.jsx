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
import { colorStep, colorVar, rankedCount, valueText } from "../../lib/atlas/mapColors.js";
import { placeLabel } from "../../lib/atlas/hotspots.js";
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
  satelliteOnly = false,
  onSatelliteOnlyChange,
  steady = false,
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
  const layers = useRef({ outline: null, cells: null, cellIndex: new Map(), cellKey: "", marks: null, draw: null });
  const tiles = useRef({ base: null, satellite: null });
  const fitAreaNow = useRef(null);
  const [zoom, setZoom] = useState(null);
  const [hover, setHover] = useState(null);

  // The latest props, for the map's own event handlers.
  const latest = useRef({});
  latest.current = { onSelect, onDrawPoint, drawMode, places, colorBy, timeframe, area, satelliteOnly, steady, selectedId, size: run?.cellSizeDeg || 0 };
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
    tiles.current.base = L.tileLayer(BASEMAP.url, { attribution: BASEMAP.attribution, maxNativeZoom: BASEMAP.maxNativeZoom, maxZoom: 20 });
    if (!latest.current.satelliteOnly) tiles.current.base.addTo(map);
    map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom);
    mapRef.current = map;
    colorsRef.current = readColors(wrapRef.current);
    rendererRef.current = renderer;

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
      for (const name of ["cells", "marks", "draw", "outline"]) layers.current[name]?.remove();
      tiles.current.base?.remove();
      tiles.current.satellite?.remove();
      tiles.current = { base: null, satellite: null };
      // A zoom animation still running would finish on a map that is gone.
      map.stop();
      map._animatingZoom = false;
      map.off();
      map.remove();
      mapRef.current = null;
      layers.current = { outline: null, cells: null, cellIndex: new Map(), cellKey: "", marks: null, draw: null };
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
            fillColor: colorsRef.current["--map-nodata"],
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

  const hoverPlace = hover && !satelliteOnly ? placesById.current.get(hover.id) : null;
  const total = hoverPlace ? rankedCount(places || [], timeframe) : 0;
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
          <span className="atlas-map-tip-value">{valueText(hoverPlace, colorBy, timeframe, total)}</span>
        </div>
      )}

      {!satelliteOnly && children}
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
