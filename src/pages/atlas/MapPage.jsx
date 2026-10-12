// WHAT THIS FILE DOES
// The Atlas map page (/atlas/map): a hand-drawn map of the Kupiansk cluster
// with its 1 km cells, the river, the lake, roads, towns, the dashed outline,
// the amber help-request pins and a dark tooltip, plus the floating controls
// over the map (breadcrumb, Near term / Postwar switch, "Color the map by",
// zoom buttons, legend, mini-map). On the right is the "Selected area" panel
// with the scores, satellite findings, recovery costs and help requests.
//
// Every number and sentence comes from src/data/atlas.js (the "cluster"
// export). The map is an inline SVG drawn from fractions (0 to 1) of the map
// width and height, so it fills whatever space it is given.
//
// On a phone-sized screen (520 px or narrower) the "Color the map by" card
// moves ABOVE the map and the legend and mini-map move BELOW it, so nothing
// floats over the drawing and hides the labels.
//
// WHO EDITS IT
// Whoever changes how the Atlas map page looks or behaves. To change the
// words, numbers or positions, edit src/data/atlas.js instead.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Plus,
  Minus,
  Lasso,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
} from "lucide-react";
import { Segmented, ScoreBar, Button } from "../../components/ui/index.js";
import { cluster, cellTiers, makeClusterCells, timeframes, scoring } from "../../data/atlas.js";
import "./MapPage.css";

// How the cells are generated for each "Color the map by" choice. These are
// the same seeds and centres as clusterCells in src/data/atlas.js, repeated
// here because this page draws a finer grid (about 12 px squares) than the
// ready-made 40 x 30 one.
// TODO move to src/data/atlas.js (for example as clusterCellSettings).
const CELL_SETTINGS = {
  priority: { seed: 7, centre: { x: 0.6, y: 0.44 }, strength: 1.2 },
  blackSoil: { seed: 11, centre: { x: 0.5, y: 0.5 }, strength: 0.8 },
  damage: { seed: 19, centre: { x: 0.64, y: 0.42 }, strength: 1.2 },
  safeAccess: { seed: 23, centre: { x: 0.15, y: 0.8 }, strength: 0.6 },
};

// Damage and Safe access are drawn as one colour at different strengths
// (0 = no cropland). Priority and Black soil use the green scale tokens.
// TODO move to src/data/atlas.js
const TINT_BY_MODE = {
  damage: { colour: "var(--c-red)", opacity: [0, 0.14, 0.28, 0.45, 0.65, 0.88] },
  safeAccess: { colour: "var(--c-blue)", opacity: [0, 0.14, 0.28, 0.45, 0.65, 0.88] },
};

// Where the small red marks go when "Recorded fighting" is switched on
// (fractions of the map). Placeholder positions.
// TODO move to src/data/atlas.js
const FIGHTING_MARKS = [
  { x: 0.5, y: 0.36 }, { x: 0.68, y: 0.34 }, { x: 0.76, y: 0.5 },
  { x: 0.58, y: 0.55 }, { x: 0.46, y: 0.5 }, { x: 0.8, y: 0.42 },
  { x: 0.64, y: 0.64 }, { x: 0.42, y: 0.44 },
];

// The pale blue lake south of the cluster, as [x, y] fractions of the map.
// TODO move to src/data/atlas.js (for example as cluster.lakes).
const LAKES = [
  [
    [0.53, 0.8], [0.57, 0.79], [0.6, 0.82], [0.595, 0.86], [0.575, 0.895],
    [0.545, 0.905], [0.52, 0.88], [0.51, 0.845], [0.515, 0.815],
  ],
];

// Built-up areas are drawn as slightly irregular blobs rather than boxes.
// Each shape is a list of [x, y] pixel offsets from the place's centre.
// TODO move to src/data/atlas.js (for example as cluster.placeShapes).
const PLACE_SHAPES = {
  city: [
    [-30, -34], [8, -36], [30, -26], [38, -4], [34, 22], [16, 36],
    [-14, 34], [-34, 20], [-40, -8],
  ],
  town: [
    [-12, -13], [6, -14], [15, -7], [16, 4], [10, 13], [-6, 14], [-15, 8], [-16, -4],
  ],
};

// About how wide one map cell should be on screen, in pixels.
const CELL_PX = 12.5;

// Zoom steps for the + and - buttons.
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.4;
const ZOOM_STEP = 0.25;

// Below this screen width the controls, legend and mini-map stop floating
// over the map (must match the 520px media query in MapPage.css).
const NARROW_SCREEN = "(max-width: 520px)";

// Turns a token name like "scale-4" into the CSS colour var(--c-scale-4).
function tokenColour(name) {
  return `var(--c-${name})`;
}

// Measures an element and re-measures whenever its size changes, so the map
// can be drawn at exactly the size it is given (1 SVG unit = 1 pixel).
function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// True while the screen matches a CSS media query such as "(max-width: 520px)".
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

// Is this point (fractions) inside the dashed outline ellipse?
function insideOutline(x, y) {
  const { cx, cy, rx, ry } = cluster.outline;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

// Away from the cluster the mockup shows cream gaps between the cells, so
// some of the lightest cells are left out. Fixed arithmetic, so the map
// looks the same every time.
function thinnedOut(tier, r, c) {
  return tier === 1 && (r * 31 + c * 17) % 5 < 2;
}

// Fill colour for one cell. Returns null for "no cropland" (draw nothing).
function cellFill(tier, mode) {
  if (tier === 0) return null;
  const tint = TINT_BY_MODE[mode];
  if (tint) return { fill: tint.colour, opacity: tint.opacity[tier] };
  return { fill: tokenColour(cellTiers[tier].colour), opacity: 1 };
}

// The amber teardrop pin with a number in it. The tip sits at (0, 0).
function Pin({ n }) {
  return (
    <g>
      <path
        d="M0 0 C-3 -7 -14 -13 -14 -24 A14 14 0 1 1 14 -24 C14 -13 3 -7 0 0 Z"
        fill="var(--c-amber)"
        stroke="var(--c-ink)"
        strokeWidth="1.5"
      />
      <text x="0" y="-20" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--c-ink)">
        {n}
      </text>
    </g>
  );
}

export default function MapPage() {
  // Near term / Postwar (the segmented switch at the top of the map).
  const [timeframe, setTimeframe] = useState("postwar");
  // Which "Color the map by" button is pressed.
  const [mode, setMode] = useState(cluster.colourBy[0].value);
  // The two checkbox layers.
  const [showHelp, setShowHelp] = useState(cluster.layers.farmHelp.on);
  const [showFighting, setShowFighting] = useState(cluster.layers.fighting.on);
  // Zoom level and whether the right panel is open.
  const [zoom, setZoom] = useState(1);
  const [panelOpen, setPanelOpen] = useState(true);

  // Phone-sized screen: the cards stop floating over the map.
  const narrow = useMediaQuery(NARROW_SCREEN);

  // The map area's size on screen.
  const mapRef = useRef(null);
  const { width, height } = useElementSize(mapRef);

  // The cells, regenerated when the size or the colour choice changes.
  const cols = Math.max(20, Math.round(width / CELL_PX));
  const rows = Math.max(20, Math.round(height / CELL_PX));
  const cells = useMemo(
    () => makeClusterCells({ cols, rows, ...CELL_SETTINGS[mode] }),
    [cols, rows, mode],
  );
  const cellW = width / cols;
  const cellH = height / rows;

  // Helpers to turn fractions into pixels.
  const px = (x) => x * width;
  const py = (y) => y * height;
  const toPoints = (line) => line.map(([x, y]) => `${px(x)},${py(y)}`).join(" ");

  const activeTimeframe = timeframes.find((item) => item.id === timeframe);
  const modeLabel = cluster.colourBy.find((item) => item.value === mode).label;
  const legendTitle = `${modeLabel} · ${activeTimeframe.label}`;

  // In Near term the cluster is set aside, so its cells are drawn striped.
  const clusterSetAside = timeframe === "nearTerm" && mode === "priority";

  // The status box for each time frame, with the "showing" tag on the active one.
  const statusBoxes = [
    { id: "nearTerm", ...cluster.nearTerm },
    { id: "postwar", ...cluster.postwar },
  ];

  // The three score rows ("Soil value", "Damage", "Safe access") share their
  // names and colours with the scoring card on the Overview page.
  const scoreRows = scoring.questions;

  // What the tooltip says about the cell: striped "Set aside" in Near term,
  // otherwise the tier with a swatch in the colour the map is using.
  const tooltipTier = clusterSetAside
    ? { label: cluster.nearTerm.status, striped: true }
    : { label: cluster.tooltip.tier, colour: TINT_BY_MODE[mode]?.colour ?? tokenColour("scale-5") };

  // Legend swatches follow the colour choice.
  const legendSwatches = TINT_BY_MODE[mode]
    ? [1, 2, 4, 5].map((tier) => ({ fill: TINT_BY_MODE[mode].colour, opacity: TINT_BY_MODE[mode].opacity[tier] }))
    : cluster.legend.scale.map((name) => ({ fill: tokenColour(name), opacity: 1 }));

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));

  // Where the tooltip card sits. On a wide screen it hangs to the right of
  // the marked cell; on a narrow one it hugs the map's right edge so it is
  // never cut off, and the pointer line is drawn to its top edge.
  const marker = { x: px(cluster.tooltip.x), y: py(cluster.tooltip.y) };
  const tooltipStyle = narrow
    ? { right: "var(--s-3)", top: `${marker.y + 76}px` }
    : { left: `${marker.x + 30}px`, top: `${marker.y + 46}px` };
  const pointerEnd = narrow ? { x: marker.x + 30, y: marker.y + 76 } : { x: marker.x + 30, y: marker.y + 46 };

  // ---------- The "Color the map by" card (floats on wide screens, sits
  // above the map on narrow ones) ----------
  const controlsCard = (
    <div className="am-float am-controls">
      <h3 className="am-controls-title">{cluster.colourByTitle}</h3>
      <div className="am-mode-grid" role="group" aria-label={cluster.colourByTitle}>
        {cluster.colourBy.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === mode ? "am-mode is-active" : "am-mode"}
            aria-pressed={option.value === mode}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="am-layers">
        <button type="button" className="am-layer" onClick={() => setShowHelp((on) => !on)} aria-pressed={showHelp}>
          <span className={showHelp ? "check-box is-checked" : "check-box"}>
            {showHelp && <Check size={11} strokeWidth={3} />}
          </span>
          <span className="am-layer-label">{cluster.layers.farmHelp.label}</span>
          <span className="am-layer-meta">{cluster.layers.farmHelp.count}</span>
        </button>
        <button type="button" className="am-layer" onClick={() => setShowFighting((on) => !on)} aria-pressed={showFighting}>
          <span className={showFighting ? "check-box is-checked" : "check-box"}>
            {showFighting && <Check size={11} strokeWidth={3} />}
          </span>
          <span className="am-layer-label">{cluster.layers.fighting.label}</span>
          <span className="am-layer-meta">{cluster.layers.fighting.source}</span>
        </button>
      </div>

      <div className="panel am-weights">
        <div className="am-weights-text">
          <span className="am-weights-title">{cluster.weightsTitle}</span>
          <span className="am-weights-summary">{cluster.weightsSummary}</span>
        </div>
        <Link to="/atlas/settings" className="am-weights-link">{cluster.weightsLink}</Link>
      </div>
    </div>
  );

  // ---------- Legend and mini-map (float bottom-left on wide screens, sit
  // below the map on narrow ones) ----------
  const legendRow = (
    <div className={narrow ? "am-bottom-left am-bottom-static" : "am-bottom-left"}>
      <div className="am-float am-legend">
        <span className="am-legend-title">{legendTitle}</span>
        <div className="am-legend-scale">
          <span>{cluster.legend.scaleLow}</span>
          {legendSwatches.map((swatch, index) => (
            <span key={index} className="am-legend-swatch" style={{ background: swatch.fill, opacity: swatch.opacity }} />
          ))}
          <span>{cluster.legend.scaleHigh}</span>
        </div>
        <div className="am-legend-row">
          <span className="am-legend-dash" />
          <span>{cluster.legend.dashed}</span>
        </div>
        <div className="am-legend-row">
          <svg width="16" height="18" viewBox="-9 -27 18 28" aria-hidden="true" className="am-legend-pin">
            <g transform="scale(0.6)">
              <path
                d="M0 0 C-3 -7 -14 -13 -14 -24 A14 14 0 1 1 14 -24 C14 -13 3 -7 0 0 Z"
                fill="var(--c-amber)"
                stroke="var(--c-ink)"
                strokeWidth="2"
              />
            </g>
          </svg>
          <span>{cluster.legend.pin}</span>
        </div>
        <div className="am-legend-row am-legend-scalebar">
          <span className="am-scalebar" />
          <span>{cluster.legend.scaleBar}</span>
        </div>
        <span className="am-legend-footer">{cluster.legend.footer}</span>
      </div>

      <div className="am-float am-minimap">
        <span className="am-legend-title">{cluster.miniMap.title}</span>
        <div className="am-minimap-grid" aria-hidden="true">
          {cluster.miniMap.cells.map((row, r) =>
            row.map((cell, c) => (
              <span key={`${r}-${c}`} className={`am-minicell am-minicell-${cell}`} />
            )),
          )}
        </div>
        <Link to="/atlas" className="am-minimap-link">
          <ChevronLeft size={14} />
          {cluster.miniMap.link}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="page-full am-page">
      {/* The map column: the map itself, plus (on narrow screens only) the
          controls above it and the legend below it. */}
      <div className="am-map-col">
        {narrow && controlsCard}

        {/* ================= THE MAP ================= */}
        <div className="am-map" ref={mapRef}>
          {/* Everything inside this layer zooms together. */}
          <div className="am-map-layer" style={{ transform: `scale(${zoom})` }}>
            {width > 0 && (
              <svg
                className="am-svg"
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={`Map of the ${cluster.name}`}
              >
                <defs>
                  {/* Diagonal stripes for "set aside" cells. */}
                  <pattern id="am-stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="var(--c-scale-0)" />
                    <rect width="2" height="6" fill="var(--c-border-strong)" />
                  </pattern>
                </defs>

                {/* The 1 km cells. */}
                <g>
                  {cells.map((row, r) =>
                    row.map((tier, c) => {
                      const x = (c + 0.5) / cols;
                      const y = (r + 0.5) / rows;
                      const inside = insideOutline(x, y);
                      if (!inside && thinnedOut(tier, r, c)) return null;
                      const setAside = clusterSetAside && inside;
                      const paint = setAside ? { fill: "url(#am-stripes)", opacity: 1 } : cellFill(tier, mode);
                      if (!paint) return null;
                      return (
                        <rect
                          key={`${r}-${c}`}
                          x={c * cellW + 1}
                          y={r * cellH + 1}
                          width={cellW - 2}
                          height={cellH - 2}
                          rx="1.5"
                          fill={paint.fill}
                          opacity={paint.opacity}
                        />
                      );
                    }),
                  )}
                </g>

                {/* The lake (pale blue, drawn under the river). */}
                {LAKES.map((lake, index) => (
                  <polygon
                    key={index}
                    points={toPoints(lake)}
                    fill="var(--c-blue)"
                    fillOpacity="0.22"
                    stroke="var(--c-blue)"
                    strokeOpacity="0.25"
                    strokeWidth="1"
                    strokeLinejoin="round"
                  />
                ))}

                {/* The river. */}
                <polyline
                  points={toPoints(cluster.river)}
                  fill="none"
                  stroke="var(--c-blue)"
                  strokeOpacity="0.32"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Roads: a grey edge with a white centre. */}
                {cluster.roads.map((road, index) => (
                  <g key={index}>
                    <polyline points={toPoints(road)} fill="none" stroke="var(--c-border-strong)" strokeWidth="5" strokeLinejoin="round" />
                    <polyline points={toPoints(road)} fill="none" stroke="var(--c-surface)" strokeWidth="3" strokeLinejoin="round" />
                  </g>
                ))}

                {/* Towns, the city and the river label. */}
                {cluster.places.map((place) => {
                  const x = px(place.x);
                  const y = py(place.y);
                  if (place.kind === "river") {
                    return (
                      <text key={place.id} x={x} y={y} className="am-river-label" fill="var(--c-blue-text)">
                        {place.name}
                      </text>
                    );
                  }
                  const isCity = place.kind === "city";
                  const shape = PLACE_SHAPES[place.kind] ?? PLACE_SHAPES.town;
                  const points = shape.map(([dx, dy]) => `${x + dx},${y + dy}`).join(" ");
                  const rightEdge = Math.max(...shape.map(([dx]) => dx));
                  const bottomEdge = Math.max(...shape.map(([, dy]) => dy));
                  // The name goes to the right of the blob, unless it would
                  // run off the map (small screens): then it goes under it.
                  const labelX = x + rightEdge + (isCity ? -4 : 8);
                  const flip = labelX + place.name.length * 7 > width;
                  return (
                    <g key={place.id}>
                      <polygon
                        points={points}
                        fill="var(--c-border)"
                        stroke="var(--c-border-strong)"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                      <text
                        x={flip ? x + rightEdge : labelX}
                        y={flip ? y + bottomEdge + 13 : y + 4}
                        textAnchor={flip ? "end" : "start"}
                        className={isCity ? "am-place-label am-place-label-city" : "am-place-label"}
                        fill="var(--c-text)"
                      >
                        {place.name}
                      </text>
                    </g>
                  );
                })}

                {/* The dashed outline around the selected cluster. Clicking it
                    re-opens the side panel. */}
                <ellipse
                  cx={px(cluster.outline.cx)}
                  cy={py(cluster.outline.cy)}
                  rx={px(cluster.outline.rx)}
                  ry={py(cluster.outline.ry)}
                  fill="none"
                  stroke="var(--c-ink)"
                  strokeWidth="2.5"
                  strokeDasharray="9 7"
                  className="am-outline"
                  onClick={() => setPanelOpen(true)}
                />

                {/* Recorded fighting marks (only when the layer is on). */}
                {showFighting &&
                  FIGHTING_MARKS.map((mark, index) => (
                    <g key={index} transform={`translate(${px(mark.x)} ${py(mark.y)})`} stroke="var(--c-red)" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="-5" y1="-5" x2="5" y2="5" />
                      <line x1="5" y1="-5" x2="-5" y2="5" />
                    </g>
                  ))}

                {/* Farm help request pins (only when the layer is on). */}
                {showHelp &&
                  cluster.pins.map((pin) => (
                    <g key={pin.n} transform={`translate(${px(pin.x)} ${py(pin.y)})`}>
                      <Pin n={pin.n} />
                    </g>
                  ))}

                {/* The small square marker the tooltip points at, and the line
                    from it to the tooltip card. */}
                <line
                  x1={marker.x + 6}
                  y1={marker.y + 6}
                  x2={pointerEnd.x}
                  y2={pointerEnd.y}
                  stroke="var(--c-ink)"
                  strokeWidth="2"
                />
                <rect
                  x={marker.x - 8}
                  y={marker.y - 8}
                  width="16"
                  height="16"
                  rx="2"
                  fill="var(--c-surface)"
                  stroke="var(--c-ink)"
                  strokeWidth="2"
                />
                <rect x={marker.x - 3} y={marker.y - 3} width="6" height="6" fill="var(--c-ink)" />
              </svg>
            )}

            {/* The ink label under the cluster. */}
            <button
              type="button"
              className="am-cluster-pill"
              style={{
                left: `${(cluster.outline.cx - 0.06) * 100}%`,
                top: `${(cluster.outline.cy + cluster.outline.ry + 0.02) * 100}%`,
              }}
              onClick={() => setPanelOpen(true)}
            >
              {cluster.mapLabel}
            </button>

            {/* The dark tooltip card for one cell. */}
            <div className="am-tooltip" style={tooltipStyle}>
              <span className="am-tooltip-coords">{cluster.tooltip.coords}</span>
              <span className="am-tooltip-tier">
                <span
                  className={tooltipTier.striped ? "am-square am-square-striped" : "am-square"}
                  style={tooltipTier.striped ? undefined : { background: tooltipTier.colour }}
                />
                {tooltipTier.label}
              </span>
              {scoreRows.map((row) => (
                <span key={row.id} className="am-tooltip-row">
                  <span>{row.label}</span>
                  <span className="mono">{cluster.tooltip[row.id].toFixed(2)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ---------- Floating controls, top left ---------- */}
          <div className="am-top-left">
            <div className="am-top-row">
              {/* Breadcrumb: Ukraine > Kharkiv > Kupiansk cluster */}
              <nav className="am-float am-breadcrumb" aria-label="Breadcrumb">
                {cluster.breadcrumb.map((crumb, index) => {
                  const last = index === cluster.breadcrumb.length - 1;
                  return (
                    <span key={crumb} className="am-crumb-group">
                      {index === 0 ? (
                        <Link to="/atlas" className="am-crumb">{crumb}</Link>
                      ) : (
                        <span className={last ? "am-crumb am-crumb-current" : "am-crumb"}>{crumb}</span>
                      )}
                      {!last && <ChevronRight size={14} className="am-crumb-sep" />}
                    </span>
                  );
                })}
              </nav>

              {/* Near term | Postwar */}
              <div className="am-float am-timeframe">
                <Segmented
                  options={timeframes.map((item) => ({ value: item.id, label: item.label }))}
                  value={timeframe}
                  onChange={setTimeframe}
                  ariaLabel="Time frame"
                />
              </div>
            </div>

            {/* "Color the map by" card (wide screens only; see above the map
                for narrow ones) */}
            {!narrow && controlsCard}
          </div>

          {/* ---------- Round buttons, top right ---------- */}
          <div className="am-top-right">
            <button type="button" className="am-round" title="Not connected yet" aria-label="Search">
              <Search size={16} />
            </button>
            <button type="button" className="am-round" onClick={zoomIn} aria-label="Zoom in">
              <Plus size={16} />
            </button>
            <button type="button" className="am-round" onClick={zoomOut} aria-label="Zoom out">
              <Minus size={16} />
            </button>
            <button type="button" className="am-round" title="Not connected yet" aria-label="Draw an area">
              <Lasso size={16} />
            </button>
          </div>

          {/* ---------- Legend and mini-map, bottom left (wide screens) ---------- */}
          {!narrow && legendRow}
        </div>

        {narrow && legendRow}
      </div>

      {/* ================= SELECTED AREA PANEL ================= */}
      {panelOpen && (
        <aside className="am-panel" aria-label={cluster.eyebrow}>
          <div className="am-panel-scroll">
            <div className="am-panel-head">
              <div className="am-panel-head-text">
                <span className="eyebrow">{cluster.eyebrow}</span>
                <h1 className="am-panel-title">{cluster.name}</h1>
                <p className="am-panel-subtitle">{cluster.subtitle}</p>
              </div>
              <button type="button" className="am-close" onClick={() => setPanelOpen(false)} aria-label="Close the panel">
                <X size={16} />
              </button>
            </div>

            {/* Near term / Postwar status boxes. Near term has no tag word
                of its own in the data, so it borrows Postwar's "showing". */}
            <div className="am-status-grid">
              {statusBoxes.map((box) => {
                const active = box.id === timeframe;
                return (
                  <button
                    key={box.id}
                    type="button"
                    className={active ? "panel panel-outline panel-selected am-status" : "panel panel-outline am-status"}
                    onClick={() => setTimeframe(box.id)}
                    aria-pressed={active}
                  >
                    <span className="am-status-label">
                      {box.label}
                      {active && ` · ${box.tag || cluster.postwar.tag}`}
                    </span>
                    <span className="am-status-value">
                      <span className={box.tier === "setAside" ? "am-square am-square-striped" : "am-square"} style={box.tier === "setAside" ? undefined : { background: tokenColour("scale-5") }} />
                      {box.status}
                    </span>
                    <span className="am-status-why">{box.why}</span>
                  </button>
                );
              })}
            </div>

            {/* Why it scores this way */}
            <div className="am-section">
              <div className="spread">
                <h3>{cluster.scoresTitle}</h3>
                <span className="small muted">{cluster.cellCountLabel}</span>
              </div>
              <div className="am-scores">
                {scoreRows.map((row) => (
                  <ScoreBar key={row.id} label={row.label} value={cluster.scores[row.id]} tone={row.tone} />
                ))}
              </div>
              <p className="small muted">{cluster.note}</p>
            </div>

            {/* What the satellites found */}
            <div className="am-section">
              <h3>{cluster.satellitesTitle}</h3>
              <div className="am-sat-grid">
                {cluster.satellites.map((item) => (
                  <div key={item.id} className="panel am-sat">
                    <span className="mono am-sat-value">{item.value}</span>
                    <span className="am-sat-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recovery cost */}
            <div className="am-section">
              <h3>{cluster.costsTitle}</h3>
              <div className="am-cost-grid">
                {[cluster.costs.fast, cluster.costs.full].map((cost) => (
                  <div key={cost.label} className="panel panel-outline am-cost">
                    <span className="am-cost-label">{cost.label}</span>
                    <span className="mono am-cost-amount">{cost.amount}</span>
                    <span className="am-cost-text">{cost.text}</span>
                  </div>
                ))}
              </div>
              <p className="small muted">{cluster.costs.footnote}</p>
            </div>

            {/* Help requests from farms */}
            <div className="am-section">
              <div className="spread">
                <h3>{cluster.helpRequestsTitle}</h3>
                <span className="am-new">{cluster.helpRequestsBadge}</span>
              </div>
              <p className="small muted am-help-sub">{cluster.helpRequestsSubtitle}</p>
              <div className="row-list">
                {cluster.helpRequests.map((request) => (
                  <button key={request.number} type="button" className="row-item am-request" title="Not connected yet">
                    <span className="am-request-number">{request.number}</span>
                    <span className="row-text">
                      <span className="row-title">{request.title}</span>
                      <span className="row-help">{request.detail}</span>
                    </span>
                    <ChevronRight size={16} className="am-request-chevron" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sticky buttons at the bottom */}
          <div className="am-panel-actions">
            <Button variant="primary" icon={<Plus size={15} />} title="Not connected yet">
              {cluster.actions.primary}
            </Button>
            <Button variant="secondary" icon={<MessageSquare size={15} />} to="/atlas/ai">
              {cluster.actions.secondary}
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}
