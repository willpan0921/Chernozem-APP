// WHAT THIS FILE DOES
// The Fields page (/field/fields): the farm map on the left and a detail
// panel for the selected field on the right.
//
//   LEFT  - the farm drawn as a simple map (hand-drawn SVG): seven fields
//           coloured by plant health, roads, a village and the damaged
//           Field 7 with red stripes. Floating on top: the Zones/Satellite
//           switch, the layer picker, the date chip, zoom buttons, the
//           legend and the "Field 7 needs recovery" call-out.
//   RIGHT - everything about the selected field: four metric tiles, the
//           "Plant health this season" chart, the "What if" card, the next
//           steps checklist and the two buttons at the bottom.
//
// Clicking a field on the map selects it and the right panel switches to
// that field. All the words and numbers come from src/data/farm.js; the
// only thing kept here is the drawing geometry of the map.
//
// WHO EDITS IT
// Whoever changes how the Fields page looks. To change a number, a date or
// a sentence, edit src/data/farm.js instead.

import { useState } from "react";
import {
  Bug,
  Calendar,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Droplet,
  Eye,
  FileText,
  LayoutGrid,
  Layers,
  MessageSquare,
  Minus,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sprout,
  Wheat,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { Badge, Button, Segmented, ChipSelect } from "../../components/ui/index.js";
import { fields, fieldDetails, fieldsMap, dataLayers } from "../../data/farm.js";
import "./FieldsPage.css";

/* =========================================================================
   MAP GEOMETRY
   Where each field sits on the drawing and which coloured "health" blobs
   it shows. These are drawing instructions, not farm data, so they live
   here. Positions are in the map's own units: the drawing is 800 wide and
   1000 tall. Blob positions are fractions of the field's own box (0,0 is
   the top left corner, 1,1 the bottom right).
   ========================================================================= */

// TODO move to src/data/farm.js once the real field shapes come from the
// farmer's traced boundaries (see fieldSettings.map.polygon).
const MAP_SIZE = { width: 800, height: 900 };

// The three columns and three rows of the farm grid: [start, end].
const COLS = { a: [-20, 250], b: [266, 536], c: [552, 820] };
// Row 3 stops well above the bottom edge so the whole of Field 7 stays
// visible above the legend and the call-out card.
const ROWS = { r1: [80, 322], r2: [336, 578], r3: [622, 790] };

// One entry per field: its box and the health blobs drawn inside it.
// "base" is the field's overall colour, "blobs" the lighter and darker
// patches on top (design-token names, used as var(--c-<token>)).
const MAP_LAYOUT = {
  "field-1": {
    col: "a",
    row: "r1",
    base: "field-harvested",
    blobs: [
      { cx: 0.22, cy: 0.72, rx: 0.4, ry: 0.5, token: "field-harvest", opacity: 0.75 },
      { cx: 0.85, cy: 0.15, rx: 0.35, ry: 0.3, token: "field-harvested", opacity: 1 },
    ],
  },
  "field-2": {
    col: "b",
    row: "r1",
    base: "field-watch",
    blobs: [
      { cx: 0.28, cy: 0.5, rx: 0.3, ry: 0.55, token: "field-harvest", opacity: 0.8 },
      { cx: 0.12, cy: 0.12, rx: 0.25, ry: 0.22, token: "field-harvested", opacity: 1 },
    ],
  },
  "field-3": {
    col: "c",
    row: "r1",
    base: "field-healthy",
    blobs: [
      { cx: 0.78, cy: 0.22, rx: 0.5, ry: 0.4, token: "scale-3", opacity: 1 },
      { cx: 0.3, cy: 0.92, rx: 0.35, ry: 0.28, token: "field-watch", opacity: 0.7 },
    ],
  },
  "field-6": {
    col: "a",
    row: "r2",
    base: "field-harvested",
    stubble: true,
    blobs: [{ cx: 0.3, cy: 0.5, rx: 0.3, ry: 0.4, token: "field-harvest", opacity: 0.3 }],
  },
  "field-4": {
    col: "b",
    row: "r2",
    base: "field-watch",
    blobs: [
      { cx: 0.25, cy: 0.72, rx: 0.42, ry: 0.4, token: "field-healthy", opacity: 1 },
      { cx: 0.1, cy: 0.1, rx: 0.4, ry: 0.3, token: "field-watch", opacity: 1 },
    ],
  },
  "field-5": {
    col: "c",
    row: "r2",
    base: "field-harvest",
    blobs: [{ cx: 0.4, cy: 0.9, rx: 0.65, ry: 0.42, token: "field-watch", opacity: 1 }],
  },
  "field-7": {
    col: "b",
    row: "r3",
    base: "field-harvested",
    damaged: true,
    blobs: [],
    // The two burnt, cratered patches and the crater dots on them.
    patches: [
      { cx: 0.6, cy: 0.28, rx: 0.24, ry: 0.27 },
      { cx: 0.32, cy: 0.74, rx: 0.14, ry: 0.16 },
    ],
    craters: [
      { x: 0.62, y: 0.12 },
      { x: 0.52, y: 0.28 },
      { x: 0.72, y: 0.34 },
      { x: 0.58, y: 0.42 },
      { x: 0.68, y: 0.22 },
      { x: 0.9, y: 0.05 },
      { x: 0.33, y: 0.73 },
    ],
  },
};

// Colours used only inside the map drawing (land, roads, craters). These are
// not design tokens because nothing else in the app is this colour.
const LAND = {
  dark: "#3f4729", // the band behind the top controls
  olive: "#4d5733", // land between fields
  road: "#cfc8a4", // tracks between fields
  hedge: "#36452a", // the tree line between columns
  hedgeDots: "#9fb36a",
  village: "#d6d0ad",
  rightField: "#5f6b3d", // the unsown field at the bottom right
  rightLines: "#4f5a33",
  burnt: "#5b5243", // dark patches on Field 7 and the bottom right
  crater: "#2b2721",
  craterCentre: "#e9e2c8",
};

// Scattered houses of the village at the bottom left (map units).
const VILLAGE = [
  [20, 650], [60, 632], [100, 644], [140, 632], [40, 680], [90, 672], [120, 690],
  [20, 720], [60, 710], [150, 700], [110, 738], [40, 765], [70, 790], [130, 780],
  [20, 830], [60, 855], [100, 835], [150, 850], [170, 665], [190, 620], [30, 610], [120, 602],
];
// Houses drawn in red (damaged buildings).
const VILLAGE_RED = [[60, 632], [20, 720], [110, 738], [150, 850], [170, 665]];

// Crater dots on the bottom-right land (map units).
const RIGHT_CRATERS = [[640, 640], [730, 685], [795, 720], [655, 790], [700, 835], [605, 870]];

/* =========================================================================
   ICONS
   The data module names icons as words ("droplet"); this maps the words to
   Lucide icon components.
   ========================================================================= */

// Two short labels and the field open by default, which the data module
// does not carry yet.
// TODO move to src/data/farm.js (e.g. fieldDetails[id].nextStepsTitle and
// fieldsMap.selectedFieldId).
const NEXT_STEPS_TITLE = "Next steps";
const NO_DETAIL_TEXT = "No details for this field yet.";
const DEFAULT_FIELD_ID = "field-4";

const ICONS = {
  droplet: Droplet,
  bug: Bug,
  sprout: Sprout,
  wheat: Wheat,
  shield: ShieldAlert,
  calendar: Calendar,
};

/* =========================================================================
   THE PAGE
   ========================================================================= */

export default function FieldsPage() {
  // Which field is open in the right panel (Field 4 to start, like the mockup).
  const [selectedId, setSelectedId] = useState(DEFAULT_FIELD_ID);
  // Zones or Satellite view, the chosen layer and the zoom level.
  const [viewMode, setViewMode] = useState(fieldsMap.viewMode);
  const [layer, setLayer] = useState(fieldsMap.layer);
  const [zoom, setZoom] = useState(1);

  const selectedField = fields.find((field) => field.id === selectedId) || fields[0];

  // "Next field" button in the panel header: cycles through the fields.
  function selectNextField() {
    const index = fields.findIndex((field) => field.id === selectedId);
    setSelectedId(fields[(index + 1) % fields.length].id);
  }

  return (
    <div className="page-full ff-page">
      <FarmMap
        selectedId={selectedId}
        onSelect={setSelectedId}
        viewMode={viewMode}
        onViewMode={setViewMode}
        layer={layer}
        onLayer={setLayer}
        zoom={zoom}
        onZoom={setZoom}
      />
      {/* "key" resets the panel's own state (checked steps, chosen what-if)
          when a different field is selected. */}
      <DetailPanel key={selectedId} field={selectedField} onNext={selectNextField} />
    </div>
  );
}

/* =========================================================================
   THE MAP (left side)
   ========================================================================= */

function FarmMap({ selectedId, onSelect, viewMode, onViewMode, layer, onLayer, zoom, onZoom }) {
  const { legend, callout } = fieldsMap;
  const satellite = viewMode === "Satellite";

  const viewOptions = [
    { value: fieldsMap.viewModes[0], label: fieldsMap.viewModes[0], icon: <LayoutGrid size={13} /> },
    { value: fieldsMap.viewModes[1], label: fieldsMap.viewModes[1], icon: <Layers size={13} /> },
  ];
  const layerOptions = dataLayers.map((name) => ({ value: name, label: name }));

  return (
    <div className={satellite ? "ff-map ff-map-satellite" : "ff-map"}>
      {/* The drawing itself. "slice" keeps the map's proportions and crops
          the edges when the window is a different shape. */}
      <svg
        className="ff-map-svg"
        viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ transform: `scale(${zoom})` }}
        role="img"
        aria-label="Map of the farm's fields"
      >
        <MapDefs />
        <Land />
        {fields.map((field) => (
          <FieldShape
            key={field.id}
            field={field}
            selected={field.id === selectedId}
            onSelect={() => onSelect(field.id)}
          />
        ))}
      </svg>

      {/* Top-left controls. */}
      <div className="ff-controls">
        <Segmented options={viewOptions} value={viewMode} onChange={onViewMode} ariaLabel="Map view" />
        <ChipSelect prefix={fieldsMap.layerLabel} options={layerOptions} value={layer} onChange={onLayer} />
        <span className="ff-date-chip">{fieldsMap.dateLabel}</span>
      </div>

      {/* Top-right round buttons. */}
      <div className="ff-map-buttons">
        <button type="button" className="ff-round-btn" title="Not connected yet" aria-label="Search">
          <Search size={15} />
        </button>
        <div className="ff-round-group">
          <button type="button" className="ff-round-btn" onClick={() => onZoom(Math.min(2, zoom + 0.25))} aria-label="Zoom in">
            <Plus size={15} />
          </button>
          <button type="button" className="ff-round-btn" onClick={() => onZoom(Math.max(1, zoom - 0.25))} aria-label="Zoom out">
            <Minus size={15} />
          </button>
          <button type="button" className="ff-round-btn" title="Not connected yet" aria-label="Layers">
            <Layers size={15} />
          </button>
        </div>
      </div>

      {/* Bottom-left legend and the little Satellite thumbnail. */}
      <div className="ff-map-bottom">
        <div className="ff-legend-row">
          <div className="ff-legend-card">
            <strong>{layer}</strong>
            <div className="ff-legend-scale">
              <span>{legend.low}</span>
              {legend.scale.map((token) => (
                <span key={token} className="swatch" style={{ "--swatch": `var(--c-${token})` }} />
              ))}
              <span>{legend.high}</span>
            </div>
            <div className="legend-item">
              <span className="swatch swatch-striped" />
              {legend.needsRecovery}
            </div>
            <div className="legend-item">
              <span className="swatch swatch-round swatch-dashed" />
              {legend.unusualStress}
            </div>
          </div>
          <button
            type="button"
            className={satellite ? "ff-sat-thumb is-active" : "ff-sat-thumb"}
            onClick={() => onViewMode(satellite ? fieldsMap.viewModes[0] : fieldsMap.viewModes[1])}
            aria-pressed={satellite}
          >
            <svg viewBox="0 0 44 36" width="44" height="36" aria-hidden="true">
              <rect width="44" height="36" rx="5" fill={LAND.olive} />
              <rect x="3" y="3" width="18" height="14" rx="2" fill="var(--c-field-harvested)" />
              <rect x="23" y="3" width="18" height="14" rx="2" fill="var(--c-field-healthy)" />
              <rect x="3" y="19" width="18" height="14" rx="2" fill="var(--c-field-watch)" />
              <rect x="23" y="19" width="18" height="14" rx="2" fill={LAND.rightField} />
            </svg>
            <span>{fieldsMap.satelliteThumbLabel}</span>
          </button>
        </div>

        {/* Bottom-right call-out about Field 7. */}
        <div className="ff-callout">
          <button type="button" className="ff-callout-title" onClick={() => onSelect(callout.fieldId)}>
            <ShieldAlert size={14} />
            {callout.title}
          </button>
          <p className="ff-callout-text">{callout.text}</p>
          <Button variant="ghost" size="sm" to="/field" className="ff-callout-link">
            {callout.link}
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Patterns the map reuses: the faint grid over every field, the stubble
// lines on harvested fields, the red stripes on Field 7 and the furrows on
// the unsown land at the bottom right.
function MapDefs() {
  return (
    <defs>
      <pattern id="ff-grid" width="14" height="14" patternUnits="userSpaceOnUse">
        <path d="M14 0H0V14" fill="none" stroke="rgba(30,30,10,0.14)" strokeWidth="1" />
      </pattern>
      <pattern id="ff-stubble" width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 3H6" stroke="rgba(30,30,10,0.1)" strokeWidth="1.2" />
      </pattern>
      {/* Thin diagonal lines: 2.5 units of red every 10, so the tan field
          shows through underneath. */}
      <pattern id="ff-stripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="2.5" height="10" fill="var(--c-red)" opacity="0.9" />
      </pattern>
      <pattern id="ff-furrows" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M0 5H10" stroke={LAND.rightLines} strokeWidth="2" />
      </pattern>
    </defs>
  );
}

// Everything that is not a field: land, roads, hedges, the village and the
// bare land at the bottom right.
function Land() {
  const { width, height } = MAP_SIZE;
  return (
    <g>
      <rect width={width} height={height} fill={LAND.olive} />
      {/* The darker band behind the top controls. */}
      <rect width={width} height={ROWS.r1[0] - 20} fill={LAND.dark} />
      {/* Tracks: one across, one down the left side of the middle column. */}
      <rect x="0" y={ROWS.r1[0] - 20} width={width} height="12" fill={LAND.road} opacity="0.8" />
      <rect x="0" y={ROWS.r1[1]} width={width} height={ROWS.r2[0] - ROWS.r1[1]} fill={LAND.road} />
      <rect x={COLS.a[1]} y={ROWS.r1[0] - 20} width={COLS.b[0] - COLS.a[1]} height={ROWS.r2[1] - ROWS.r1[0] + 20} fill={LAND.road} />
      {/* The tree line between the middle and right columns. */}
      <rect x={COLS.b[1]} y={ROWS.r1[0] - 20} width={COLS.c[0] - COLS.b[1]} height={ROWS.r2[1] - ROWS.r1[0] + 20} fill={LAND.hedge} />
      <line x1={(COLS.b[1] + COLS.c[0]) / 2} y1={ROWS.r1[0] - 10} x2={(COLS.b[1] + COLS.c[0]) / 2} y2={ROWS.r2[1]} stroke={LAND.hedgeDots} strokeWidth="4" strokeDasharray="1 6" strokeLinecap="round" />
      {/* The hedge along the bottom of the second row and down the left of Field 7. */}
      <line x1={COLS.b[0] - 8} y1={ROWS.r2[1] + 24} x2={width} y2={ROWS.r2[1] + 24} stroke={LAND.hedgeDots} strokeWidth="4" strokeDasharray="1 6" strokeLinecap="round" />
      <line x1={COLS.b[0] - 8} y1={ROWS.r2[1] + 24} x2={COLS.b[0] - 8} y2={height} stroke={LAND.hedgeDots} strokeWidth="4" strokeDasharray="1 6" strokeLinecap="round" />
      <line x1={COLS.b[1] + 8} y1={ROWS.r3[0] - 14} x2={COLS.b[1] + 8} y2={height} stroke={LAND.hedgeDots} strokeWidth="4" strokeDasharray="1 6" strokeLinecap="round" />
      {/* The village: a winding track and small houses. */}
      <path d={`M-20 720 C 60 720, 130 760, ${COLS.a[1]} 750`} fill="none" stroke={LAND.road} strokeWidth="6" strokeLinecap="round" />
      {VILLAGE.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="12" height="9" rx="1" fill={VILLAGE_RED.some(([rx, ry]) => rx === x && ry === y) ? "var(--c-red)" : LAND.village} />
      ))}
      {/* The unsown land at the bottom right with a burnt patch and craters. */}
      <rect x={COLS.c[0]} y={ROWS.r3[0] - 24} width={width - COLS.c[0]} height={height - ROWS.r3[0] + 24} fill={LAND.rightField} />
      <rect x={COLS.c[0]} y={ROWS.r3[0] - 24} width={width - COLS.c[0]} height={height - ROWS.r3[0] + 24} fill="url(#ff-furrows)" opacity="0.6" />
      <ellipse cx="712" cy="730" rx="98" ry="80" fill={LAND.burnt} />
      {RIGHT_CRATERS.map(([x, y]) => (
        <Crater key={`${x}-${y}`} x={x} y={y} />
      ))}
    </g>
  );
}

// A crater: a dark ring with a light centre.
function Crater({ x, y }) {
  return (
    <g>
      <circle cx={x} cy={y} r="6" fill={LAND.crater} />
      <circle cx={x} cy={y} r="2" fill={LAND.craterCentre} />
    </g>
  );
}

// One field: its box, the health blobs, the grid, the label and (for
// Field 4) the dashed "unusual stress" circle. Click it to select it.
function FieldShape({ field, selected, onSelect }) {
  const layout = MAP_LAYOUT[field.id];
  if (!layout) return null;
  const [x0, x1] = COLS[layout.col];
  const [y0, y1] = ROWS[layout.row];
  const w = x1 - x0;
  const h = y1 - y0;
  const clipId = `ff-clip-${field.id}`;
  const stress = fieldsMap.stressPatch.fieldId === field.id ? fieldsMap.stressPatch : null;
  const labelText = layout.damaged ? `${field.name} · ${field.statusLabel}` : field.name;

  return (
    <g className="ff-field" onClick={onSelect} role="button" tabIndex={0} aria-label={`${field.name}, ${field.statusLabel}`} aria-pressed={selected} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(); }}>
      <clipPath id={clipId}>
        <rect x={x0} y={y0} width={w} height={h} />
      </clipPath>
      <rect x={x0} y={y0} width={w} height={h} fill={`var(--c-${layout.base})`} />
      <g clipPath={`url(#${clipId})`}>
        {layout.blobs.map((blob, i) => (
          <ellipse key={i} cx={x0 + blob.cx * w} cy={y0 + blob.cy * h} rx={blob.rx * w} ry={blob.ry * h} fill={`var(--c-${blob.token})`} opacity={blob.opacity} />
        ))}
        {layout.damaged && (
          <>
            {layout.patches.map((patch, i) => (
              <ellipse key={i} cx={x0 + patch.cx * w} cy={y0 + patch.cy * h} rx={patch.rx * w} ry={patch.ry * h} fill={LAND.burnt} opacity="0.9" />
            ))}
            <rect x={x0} y={y0} width={w} height={h} fill="url(#ff-stripes)" />
            {layout.craters.map((crater, i) => (
              <Crater key={i} x={x0 + crater.x * w} y={y0 + crater.y * h} />
            ))}
          </>
        )}
      </g>
      {layout.stubble && <rect x={x0} y={y0} width={w} height={h} fill="url(#ff-stubble)" />}
      <rect x={x0} y={y0} width={w} height={h} fill="url(#ff-grid)" />
      {/* The dashed "unusual stress" patch. */}
      {stress && (
        <circle cx={x0 + stress.x * w} cy={y0 + stress.y * h} r={stress.r * w} fill="var(--c-field-harvested)" stroke="var(--c-ink)" strokeWidth="3" strokeDasharray="9 6" />
      )}
      {/* Outline: thick white when selected, red on the damaged field. */}
      {selected ? (
        <rect x={x0 + 3} y={y0 + 3} width={w - 6} height={h - 6} fill="none" stroke="var(--c-on-dark)" strokeWidth="6" />
      ) : layout.damaged ? (
        <rect x={x0 + 1.5} y={y0 + 1.5} width={w - 3} height={h - 3} fill="none" stroke="var(--c-red)" strokeWidth="3" />
      ) : null}
      <FieldLabel x={Math.max(x0 + 16, 12)} y={y0 + 16} text={labelText} tone={layout.damaged ? "red" : selected ? "ink" : "light"} />
    </g>
  );
}

// The name pill on a field. White with black text, black when selected,
// dark red on the damaged field.
function FieldLabel({ x, y, text, tone }) {
  const padding = 12;
  const width = text.length * 8.6 + padding * 2;
  const fill = tone === "red" ? "var(--c-red-text)" : tone === "ink" ? "var(--c-ink)" : "var(--c-surface)";
  const colour = tone === "light" ? "var(--c-text)" : "var(--c-on-dark)";
  return (
    <g>
      <rect x={x} y={y} width={width} height="30" rx="7" fill={fill} />
      <text x={x + padding} y={y + 20} fontSize="15" fontWeight="650" fill={colour} fontFamily="var(--font-sans)">
        {text}
      </text>
    </g>
  );
}

/* =========================================================================
   THE DETAIL PANEL (right side)
   ========================================================================= */

function DetailPanel({ field, onNext }) {
  const detail = fieldDetails[field.id];

  // Fallback for a field with no detail entry in the data module.
  if (!detail) {
    return (
      <aside className="ff-panel">
        <div className="ff-panel-head">
          <div className="ff-panel-title">
            <h2>{field.name}</h2>
            {field.badgeTone !== undefined && <Badge tone={field.badgeTone}>{field.statusLabel}</Badge>}
          </div>
          <p className="ff-panel-sub">{`${field.crop} · ${field.areaHa.toFixed(1)} ha · ${field.sownDisplay} · ${field.soil}`}</p>
        </div>
        <p className="muted small">{NO_DETAIL_TEXT}</p>
      </aside>
    );
  }

  return (
    <aside className="ff-panel">
      {/* Title, "things to watch" badge and the next-field button. */}
      <div className="ff-panel-head">
        <div className="ff-panel-title">
          <h2>{field.name}</h2>
          <Badge tone={detail.thingsToWatch > 0 ? (field.status === "recovery" ? "red" : "amber") : "green"}>
            {field.status === "recovery" ? <ShieldAlert size={11} /> : <Eye size={11} />}
            {detail.thingsToWatchLabel}
          </Badge>
          <button type="button" className="ff-switch-btn" onClick={onNext} aria-label="Next field">
            <ChevronsUpDown size={14} />
          </button>
        </div>
        <p className="ff-panel-sub">{detail.subline}</p>
      </div>

      {/* The four metric tiles. */}
      <div className="ff-metrics">
        {detail.metrics.map((metric) => (
          <MetricTile key={metric.key} metric={metric} />
        ))}
      </div>

      <SeasonChart series={detail.seasonSeries} />
      <WhatIf whatIf={detail.whatIf} />
      <NextSteps steps={detail.nextSteps} />

      <div className="ff-actions">
        <Button variant="primary" to="/field/ai" icon={<MessageSquare size={14} />}>
          {detail.actions.askAi}
        </Button>
        <Button variant="secondary" to="/field/notes" icon={<FileText size={14} />}>
          {detail.actions.addNote}
        </Button>
      </div>
    </aside>
  );
}

// One metric tile: icon + label, badge, big value, optional bar, sentence.
function MetricTile({ metric }) {
  const Icon = ICONS[metric.icon] || Sprout;
  return (
    <div className="ff-metric">
      <div className="ff-metric-top">
        <span className="ff-metric-label">
          <Icon size={12} />
          {metric.label}
        </span>
        <Badge tone={metric.badgeTone || undefined}>{metric.badge}</Badge>
      </div>
      <span className="ff-metric-value mono">{metric.value}</span>
      {metric.bar?.type === "marker" && (
        <div className="ff-bar ff-bar-marker">
          <span className="ff-bar-tick" style={{ left: `${metric.bar.position * 100}%` }} />
        </div>
      )}
      {metric.bar?.type === "fill" && (
        <div className="ff-bar">
          <span className={`ff-bar-fill ff-bar-fill-${metric.bar.tone || "green"}`} style={{ width: `${metric.bar.value * 100}%` }} />
        </div>
      )}
      <p className="ff-metric-text">{metric.text}</p>
    </div>
  );
}

/* ---------- "Plant health this season" chart ---------- */

// Chart box in drawing units.
const CHART = { width: 260, height: 112, left: 30, right: 252, top: 8, bottom: 88 };

function chartX(fraction) {
  return CHART.left + fraction * (CHART.right - CHART.left);
}
function chartY(value) {
  return CHART.bottom - value * (CHART.bottom - CHART.top);
}

// Turns a list of {x, y} points into a smooth curve ("M x y C ..."). The
// curve passes through every point.
function smoothPath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function SeasonChart({ series }) {
  const { points, marker, yTicks, axisLabels, legend } = series;
  const count = points.length - 1;
  const toXY = (value, i) => ({ x: chartX(i / count), y: chartY(value) });

  const line = points.map((p, i) => toXY(p.value, i));
  const high = points.map((p, i) => toXY(p.normalHigh, i));
  const low = points.map((p, i) => toXY(p.normalLow, i)).reverse();

  // The last month is a forecast, drawn dotted: split the line there.
  const firstProjected = points.findIndex((p) => p.projected);
  const solid = firstProjected > 0 ? line.slice(0, firstProjected) : line;
  const dotted = firstProjected > 0 ? line.slice(firstProjected - 1) : [];

  const markerX = chartX(marker.position);
  const markerY = chartY(marker.value);
  const tipWidth = 80;
  const tipX = markerX - tipWidth - 6;
  const tipY = Math.min(markerY + 6, CHART.bottom - 30);

  return (
    <div className="ff-chart-card">
      <div className="spread">
        <strong className="ff-chart-title">{series.title}</strong>
        <span className="ff-chart-sub">{series.subtitle}</span>
      </div>
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="ff-chart" role="img" aria-label={`${series.title}, ${marker.display}`}>
        {/* Y axis ticks. */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={CHART.left} x2={CHART.right} y1={chartY(tick)} y2={chartY(tick)} stroke="var(--c-border)" strokeWidth="0.6" />
            <text x={CHART.left - 6} y={chartY(tick) + 2.5} fontSize="7" textAnchor="end" fill="var(--c-muted)" fontFamily="var(--font-mono)">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        {/* The normal band: top edge forward, bottom edge back. */}
        <path d={`${smoothPath(high)} L ${low[0].x} ${low[0].y} ${smoothPath(low).slice(1)} Z`} fill="var(--c-surface-3)" />
        {/* This season. */}
        <path d={smoothPath(solid)} fill="none" stroke="var(--c-green)" strokeWidth="2" strokeLinecap="round" />
        {dotted.length > 1 && <path d={smoothPath(dotted)} fill="none" stroke="var(--c-green)" strokeWidth="2" strokeDasharray="2 3" strokeLinecap="round" />}
        {/* Today's marker, dot and tooltip. */}
        <line x1={markerX} x2={markerX} y1={CHART.top - 4} y2={CHART.bottom + 4} stroke="var(--c-muted)" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={markerX} cy={markerY} r="3.5" fill="var(--c-green)" stroke="var(--c-surface)" strokeWidth="1.5" />
        <g>
          <rect x={tipX} y={tipY} width={tipWidth} height="24" rx="5" fill="var(--c-ink)" />
          <text x={tipX + 8} y={tipY + 10} fontSize="7" fontWeight="700" fill="var(--c-on-dark)" fontFamily="var(--font-sans)">
            {marker.display}
          </text>
          <text x={tipX + 8} y={tipY + 19} fontSize="6" fill="var(--c-on-dark)" opacity="0.8" fontFamily="var(--font-sans)">
            {marker.normalDisplay}
          </text>
        </g>
        {/* X axis labels. */}
        {axisLabels.map((label, i) => (
          <text key={label} x={chartX(i / (axisLabels.length - 1))} y={CHART.height - 4} fontSize="7.5" textAnchor="middle" fill="var(--c-muted)" fontFamily="var(--font-sans)">
            {label}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span className="legend-item">
          <span className="ff-legend-line" />
          {legend[0]}
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ "--swatch": "var(--c-surface-3)" }} />
          {legend[1]}
        </span>
      </div>
    </div>
  );
}

/* ---------- "What if" card ---------- */

function WhatIf({ whatIf }) {
  const [choice, setChoice] = useState(whatIf.selected);
  const option = whatIf.options.find((item) => item.id === choice) || whatIf.options[0];
  const YieldArrow = option.yieldDirection === "up" ? ArrowUp : ArrowDown;

  return (
    <div className="ff-whatif">
      <div className="ff-whatif-head">
        <SlidersHorizontal size={14} />
        <strong>{whatIf.title}</strong>
      </div>
      <p className="ff-whatif-sub">{whatIf.subtitle}</p>
      <div className="ff-chips" role="group" aria-label={whatIf.title}>
        {whatIf.options.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === choice ? "ff-chip is-active" : "ff-chip"}
            onClick={() => setChoice(item.id)}
            aria-pressed={item.id === choice}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ff-whatif-rows">
        <div className="ff-whatif-row">
          <span className="ff-whatif-label">{whatIf.rowLabels.yield}</span>
          <span className="ff-whatif-value">
            <YieldArrow size={13} />
            {option.yield}
          </span>
        </div>
        <div className="ff-whatif-row">
          <span className="ff-whatif-label">{whatIf.rowLabels.why}</span>
          <span className="ff-whatif-value ff-whatif-why">{option.why}</span>
        </div>
        <div className="ff-whatif-row">
          <span className="ff-whatif-label">{whatIf.rowLabels.diseaseRisk}</span>
          <span className="ff-whatif-value">{option.diseaseRisk}</span>
        </div>
      </div>
      <p className="ff-whatif-foot">{whatIf.footnote}</p>
    </div>
  );
}

/* ---------- "Next steps" checklist ---------- */

function NextSteps({ steps }) {
  // The ids of the steps ticked off so far.
  const [done, setDone] = useState(() => steps.filter((step) => step.done).map((step) => step.id));

  function toggle(id) {
    setDone((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="ff-steps">
      <h3 className="ff-steps-title">{NEXT_STEPS_TITLE}</h3>
      <div className="divider" />
      {steps.map((step) => {
        const checked = done.includes(step.id);
        return (
          <button key={step.id} type="button" className={checked ? "check-item ff-step is-done" : "check-item ff-step"} onClick={() => toggle(step.id)} aria-pressed={checked}>
            <span className={checked ? "check-box is-checked" : "check-box"}>{checked && <Check size={11} strokeWidth={3} />}</span>
            <span className="row-text">
              <span className="row-title">{step.title}</span>
              <span className="row-help">{step.help}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
