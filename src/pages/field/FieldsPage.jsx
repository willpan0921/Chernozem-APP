// WHAT THIS FILE DOES
// The Fields page (/field/fields): the farm map on the left and a detail
// panel for the selected field on the right.
//
//   LEFT  - a real satellite map (Leaflet with Esri World Imagery) with
//           the seven real field outlines on top. In Zones view the fields
//           are filled with their status colour; in Satellite view only the
//           outlines show. Floating on top: the Zones/Satellite switch, the
//           layer picker, the date chip, zoom buttons, the legend and the
//           "Field 7 needs recovery" call-out.
//   RIGHT - everything about the selected field: four metric tiles, the
//           "Plant health this season" chart, the "What if" card, the next
//           steps checklist and the two buttons at the bottom.
//
// Clicking a field on the map selects it and the right panel switches to
// that field. The outlines come from Firestore (src/api/fieldsApi.js); all
// the words and numbers still come from src/data/farm.js, matched by id.
//
// WHO EDITS IT
// Whoever changes how the Fields page looks. To change a number, a date or
// a sentence, edit src/data/farm.js instead.

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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
import { listenToFieldOutlines } from "../../api/fieldsApi.js";
import "./FieldsPage.css";

/* =========================================================================
   MAP SETTINGS
   The satellite picture under the fields and where the map starts.
   ========================================================================= */

// Esri World Imagery: free satellite photos with no key. The photo's date is
// not known and differs from place to place. The credit line is required.
const BASEMAP = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    'Powered by <a href="https://www.esri.com">Esri</a> | Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxZoom: 18,
};

// Where the map looks before the outlines arrive: the farm near Kupiansk.
// Once they arrive, the map zooms to fit all the fields.
const FARM_CENTRE = [49.7225, 37.5365];
const FARM_ZOOM = 14;

// Turns a GeoJSON Polygon (corners as [longitude, latitude]) into the
// [latitude, longitude] lists Leaflet draws.
function toLatLngs(outline) {
  return outline.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
}

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
  // Zones or Satellite view and the chosen layer.
  const [viewMode, setViewMode] = useState(fieldsMap.viewMode);
  const [layer, setLayer] = useState(fieldsMap.layer);
  // The real field outlines from Firestore, keyed by field id, and whether
  // they are still loading ("loading", "ready" or "error").
  const [outlines, setOutlines] = useState({});
  const [outlineStatus, setOutlineStatus] = useState("loading");

  // Listen to the outlines while the page is open; stop when it closes.
  useEffect(
    () =>
      listenToFieldOutlines(
        (latest) => {
          setOutlines(latest);
          setOutlineStatus("ready");
        },
        (error) => {
          console.error("[fields] Could not load field outlines:", error);
          setOutlineStatus("error");
        }
      ),
    []
  );

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
        outlines={outlines}
        outlineStatus={outlineStatus}
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

function FarmMap({ selectedId, onSelect, viewMode, onViewMode, layer, onLayer, outlines, outlineStatus }) {
  const { legend, callout } = fieldsMap;
  const satellite = viewMode === "Satellite";
  // The Leaflet map itself, for the zoom buttons and zoom-to-fit.
  const [map, setMap] = useState(null);
  const fitted = useRef(false);

  // The first time the outlines arrive, zoom the map to fit all the fields.
  useEffect(() => {
    const corners = Object.values(outlines).flatMap((outline) => toLatLngs(outline).flat());
    if (!map || fitted.current || corners.length === 0) return;
    map.fitBounds(corners, { padding: [70, 70] });
    fitted.current = true;
  }, [map, outlines]);

  const viewOptions = [
    { value: fieldsMap.viewModes[0], label: fieldsMap.viewModes[0], icon: <LayoutGrid size={13} /> },
    { value: fieldsMap.viewModes[1], label: fieldsMap.viewModes[1], icon: <Layers size={13} /> },
  ];
  const layerOptions = dataLayers.map((name) => ({ value: name, label: name }));

  return (
    <div className={satellite ? "ff-map ff-map-satellite" : "ff-map"}>
      {/* The satellite map with the field outlines. */}
      <MapContainer
        ref={setMap}
        className="ff-leaflet"
        center={FARM_CENTRE}
        zoom={FARM_ZOOM}
        maxZoom={BASEMAP.maxZoom}
        zoomControl={false}
      >
        <TileLayer url={BASEMAP.url} attribution={BASEMAP.attribution} maxZoom={BASEMAP.maxZoom} />
        {fields.map((field) =>
          outlines[field.id] ? (
            <FieldOutline
              // The key includes "selected" so the outline is redrawn with
              // its new look when the selection changes.
              key={`${field.id}-${field.id === selectedId}`}
              field={field}
              outline={outlines[field.id]}
              selected={field.id === selectedId}
              onSelect={() => onSelect(field.id)}
            />
          ) : null
        )}
      </MapContainer>

      {outlineStatus !== "ready" && (
        <p className="ff-map-status">
          {outlineStatus === "loading" ? "Loading field outlines…" : "Could not load the field outlines. Refresh to try again."}
        </p>
      )}

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
          <button type="button" className="ff-round-btn" onClick={() => map?.zoomIn()} aria-label="Zoom in">
            <Plus size={15} />
          </button>
          <button type="button" className="ff-round-btn" onClick={() => map?.zoomOut()} aria-label="Zoom out">
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
              <rect width="44" height="36" rx="5" fill="#4d5733" />
              <rect x="3" y="3" width="18" height="14" rx="2" fill="var(--c-field-harvested)" />
              <rect x="23" y="3" width="18" height="14" rx="2" fill="var(--c-field-healthy)" />
              <rect x="3" y="19" width="18" height="14" rx="2" fill="var(--c-field-watch)" />
              <rect x="23" y="19" width="18" height="14" rx="2" fill="#5f6b3d" />
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

// One field on the map: its real outline and a name label in the middle.
// Click it to select it. The colours come from FieldsPage.css: the fill is
// the field's colour token, white edge when selected, red on a field that
// needs recovery.
function FieldOutline({ field, outline, selected, onSelect }) {
  const damaged = field.status === "recovery";
  const shapeClass = [
    "ff-shape",
    `ff-shape-${field.colorToken}`,
    damaged ? "is-damaged" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const labelClass = ["ff-label", damaged ? "is-damaged" : "", selected ? "is-selected" : ""].filter(Boolean).join(" ");

  return (
    <Polygon positions={toLatLngs(outline)} pathOptions={{ className: shapeClass }} eventHandlers={{ click: onSelect }}>
      <Tooltip permanent direction="center" className={labelClass}>
        {damaged ? `${field.name} · ${field.statusLabel}` : field.name}
      </Tooltip>
    </Polygon>
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
