// WHAT THIS FILE DOES
// The Field product's Settings page (/field/settings). The left column is
// the settings form: which field, its location, its area, its soil, and
// what is shared. The right side is a full-height satellite view of that
// field with its traced edges, the "first check" square and the pin.
//
// Everything written on the page comes from src/data/farm.js
// (settingsTabs, fieldSettings, fieldOptions, fieldById) and the soil list
// in src/data/soilTypes.js. Change the words or numbers there, not here.
//
// WHO EDITS IT
// Whoever changes how the Settings page looks or behaves. The map is drawn
// by hand as an SVG at the bottom of this file (see FieldMap).
//
// WHAT WORKS TODAY (foundation level)
// - Tabs, the field picker, the area mode switch, the unit switch, the soil
//   and years dropdowns, Rename and the two sharing toggles all respond.
// - "Save changes" shows a small "Saved" note; Cancel puts everything back.
// - "Use my location", "Edit edges on map", "Start over", "Delete field",
//   the map +/- buttons and corner handles are drawn but not yet connected.

import { useState } from "react";
import {
  MapPin,
  Spline,
  WavesHorizontal,
  Lock,
  LocateFixed,
  Plus,
  Minus,
  Layers,
} from "lucide-react";
import { Card, Button, Segmented, Tabs, Toggle, ChipSelect, Badge } from "../../components/ui/index.js";
import { settingsTabs, fieldSettings, fieldOptions, fieldById } from "../../data/farm.js";
import { soilTypes } from "../../data/soilTypes.js";
import "./SettingsPage.css";

// TODO move to src/data/farm.js
// The other three tabs are not designed yet. Each shows a "Coming soon"
// card with a couple of switches so the tab is not empty.
const comingSoonTabs = {
  Alerts: {
    title: "Alerts",
    note: "Coming soon. Choose when Chernozem should tell you about a field.",
    rows: [
      { id: "attention", title: "Email me when a field needs attention", help: "Damage, stress or a missed reading.", on: true },
      { id: "weekly", title: "Weekly summary on Mondays", help: "One short email for the whole farm.", on: false },
    ],
  },
  "Language and units": {
    title: "Language and units",
    note: "Coming soon. The language and units used across the app.",
    rows: [
      { id: "metric", title: "Use metric units", help: "Hectares, kilometres and degrees Celsius.", on: true },
      { id: "ukDates", title: "Show dates the Ukrainian way", help: "Day before month, for example 28.09.2026.", on: false },
    ],
  },
  Account: {
    title: "Account",
    note: "Coming soon. Sign-in and privacy choices for your account.",
    rows: [
      { id: "twoStep", title: "Two-step sign-in", help: "Ask for a code from your phone when signing in.", on: false },
    ],
  },
};

// A handful of earth tones for the satellite picture. The design tokens do
// not cover soil and crop colours, so they live here in one place.
const EARTH = {
  ground: "#4d5435", // dark olive ground between fields
  cropDark: "#46562f", // sown rows, darker stripe
  cropLight: "#5a6b40", // sown rows, lighter stripe
  trees: "#2e3a22", // tree line between fields
  path: "#b7ac84", // sandy farm track
  bare: "#7a7352", // the bare field we are editing
  bareStripe: "#8b8362", // its lighter stripe
  bareDark: "#67624a", // shaded strip at its left edge
  stubble: "#848459", // harvested field below
  stubbleStripe: "#94946a",
  crater: "#2a2a1f",
  craterRim: "#d8d1b3",
};

// The size, as a fraction of the map, of the crater sizes 1 to 3.
const CRATER_RADIUS = { 1: 4.5, 2: 6, 3: 8.5 };

// TODO move to src/data/farm.js
// The words before the other-unit line when Acres or 亩 is chosen. The
// Hectares line already comes whole from the data (area.sameAs).
const SAME_AS = "Same as";

// How much the land in the satellite picture leans, in degrees. The real
// photo is not perfectly square to the screen: the field and the tree
// lines run slightly downhill from left to right.
const LAND_TILT = 1.5;

export default function SettingsPage() {
  const { location, area, soil, sharing, buttons, map } = fieldSettings;

  // ---- Page state ----
  const [tab, setTab] = useState(settingsTabs[0]);
  const [fieldId, setFieldId] = useState(fieldSettings.fieldId);
  const [fieldName, setFieldName] = useState(fieldSettings.fieldName);
  const [renaming, setRenaming] = useState(false);
  const [address, setAddress] = useState(location.address);
  const [lat, setLat] = useState(location.latDisplay);
  const [lon, setLon] = useState(location.lonDisplay);
  const [areaMode, setAreaMode] = useState(area.areaMode);
  const [unit, setUnit] = useState(area.unit);
  const [soilType, setSoilType] = useState(soil.soilType);
  const [normalYears, setNormalYears] = useState(soil.normalYearsDisplay);
  const [shareOffice, setShareOffice] = useState(sharing.regionalOffice.on);
  const [shareAtlas, setShareAtlas] = useState(sharing.atlasTotals.on);
  const [saved, setSaved] = useState(false);
  const [comingSoon, setComingSoon] = useState(() => {
    // One on/off value per switch on the "coming soon" tabs.
    const start = {};
    Object.values(comingSoonTabs).forEach((item) => item.rows.forEach((row) => (start[row.id] = row.on)));
    return start;
  });

  // The crop line under the field picker follows the chosen field.
  const field = fieldById(fieldId);
  const cropLine = field ? field.crop : fieldSettings.cropLine;

  // The soil list from Shirley's file, plus the detected name if missing.
  const soilNames = soilTypes.map((item) => item.name);
  if (!soilNames.includes(soil.soilType)) soilNames.unshift(soil.soilType);

  // The area in the unit the person picked, plus the "Same as" line.
  // The Hectares line comes ready-made from the data (area.sameAs); the
  // other two are put together from the same numbers.
  const areaByUnit = {
    Hectares: { value: area.areaHaDisplay, sameAs: area.sameAs },
    Acres: { value: `${area.areaAcres} acres`, sameAs: `${SAME_AS} ${area.areaHaDisplay} or ${area.areaMu} 亩` },
    "亩": { value: `${area.areaMu} 亩`, sameAs: `${SAME_AS} ${area.areaHaDisplay} or ${area.areaAcres} acres` },
  };
  const shownArea = areaByUnit[unit] || areaByUnit.Hectares;

  // Picking a field in the chip changes the name shown and the crop line.
  function chooseField(id) {
    setFieldId(id);
    const next = fieldById(id);
    if (next) setFieldName(next.name);
  }

  // "Save changes": nothing is sent yet, we only show "Saved" for a moment.
  function save(event) {
    event.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // "Cancel": put every control back to what the data says.
  function cancel() {
    setFieldId(fieldSettings.fieldId);
    setFieldName(fieldSettings.fieldName);
    setRenaming(false);
    setAddress(location.address);
    setLat(location.latDisplay);
    setLon(location.lonDisplay);
    setAreaMode(area.areaMode);
    setUnit(area.unit);
    setSoilType(soil.soilType);
    setNormalYears(soil.normalYearsDisplay);
    setShareOffice(sharing.regionalOffice.on);
    setShareAtlas(sharing.atlasTotals.on);
  }

  const tabList = settingsTabs.map((label) => ({ id: label, label }));

  return (
    <div className="page-full fs-page">
      {/* ================= LEFT: the settings form ================= */}
      <div className="fs-left">
        <h1>Settings</h1>
        <Tabs tabs={tabList} active={tab} onChange={setTab} bar ariaLabel="Settings sections" />

        {tab === settingsTabs[0] ? (
          <form className="fs-form" onSubmit={save}>
            {/* Which field, and its crop. */}
            <div className="fs-field-row">
              <ChipSelect options={fieldOptions} value={fieldId} onChange={chooseField} ariaLabel="Field" />
              {renaming ? (
                <input
                  className="input fs-rename-input"
                  value={fieldName}
                  autoFocus
                  aria-label="Field name"
                  onChange={(event) => setFieldName(event.target.value)}
                  onBlur={() => setRenaming(false)}
                  onKeyDown={(event) => event.key === "Enter" && setRenaming(false)}
                />
              ) : (
                <span className="small muted">
                  {cropLine} ·{" "}
                  <button type="button" className="fs-link" onClick={() => setRenaming(true)}>
                    {fieldSettings.renameLabel}
                  </button>
                </span>
              )}
            </div>

            {/* ---- Location ---- */}
            <Card title={<CardTitle icon={<MapPin size={14} />} text={location.title} />} subtitle={location.help}>
              <div>
                <label className="field-label" htmlFor="fs-address">{location.addressLabel}</label>
                <input id="fs-address" className="input" value={address} onChange={(event) => setAddress(event.target.value)} />
              </div>
              <div className="fs-two">
                <div>
                  <label className="field-label" htmlFor="fs-lat">{location.latLabel}</label>
                  <input id="fs-lat" className="input mono" value={lat} onChange={(event) => setLat(event.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="fs-lon">{location.lonLabel}</label>
                  <input id="fs-lon" className="input mono" value={lon} onChange={(event) => setLon(event.target.value)} />
                </div>
              </div>
              <div>
                <Button icon={<LocateFixed size={14} />} title="Not connected yet">{location.useMyLocation}</Button>
              </div>
            </Card>

            {/* ---- Field area ---- */}
            <Card title={<CardTitle icon={<Spline size={14} />} text={area.title} />}>
              <div className="fs-area-modes">
                <Segmented
                  light
                  ariaLabel="How the area is drawn"
                  options={area.areaModes.map((mode) => ({ value: mode, label: mode }))}
                  value={areaMode}
                  onChange={setAreaMode}
                />
              </div>

              <div className="panel fs-area-panel">
                <div className="fs-area-main">
                  <span className="field-label">{area.currentAreaLabel}</span>
                  <span className="fs-area-value mono">{shownArea.value}</span>
                  <span className="small muted">{shownArea.sameAs}</span>
                </div>
                <dl className="fs-area-facts">
                  <dt>{area.cornersLabel}</dt>
                  <dd className="mono">{area.corners}</dd>
                  <dt>{area.edgeLabel}</dt>
                  <dd className="mono">{area.edgeDisplay}</dd>
                </dl>
              </div>

              <div className="cluster">
                <Button className="fs-btn-green" icon={<Spline size={14} />} title="Not connected yet">
                  {area.editEdges}
                </Button>
                <Button className="fs-btn-soft" title="Not connected yet">{area.startOver}</Button>
              </div>

              <p className="small muted">{area.areaHint}</p>

              <div className="divider" />

              <div className="spread">
                <span className="fs-label">{area.showAreaIn}</span>
                <Segmented
                  ariaLabel="Area unit"
                  options={area.units.map((name) => ({ value: name, label: name }))}
                  value={unit}
                  onChange={setUnit}
                />
              </div>
            </Card>

            {/* ---- Soil and comparison ---- */}
            <Card title={<CardTitle icon={<WavesHorizontal size={14} />} text={soil.title} />}>
              <div className="fs-two fs-two-wide">
                <div className="stack-sm fs-stack">
                  <div>
                    <label className="field-label" htmlFor="fs-soil">{soil.soilTypeLabel}</label>
                    <select id="fs-soil" className="select" value={soilType} onChange={(event) => setSoilType(event.target.value)}>
                      {soilNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="small muted">
                    {soil.soilHint}
                    <br />
                    <button type="button" className="fs-link" onClick={() => setSoilType(soil.soilType)}>
                      {soil.resetLabel}
                    </button>
                  </p>
                </div>
                <div className="stack-sm fs-stack">
                  <div>
                    <label className="field-label" htmlFor="fs-years">{soil.normalYearsLabel}</label>
                    <select id="fs-years" className="select" value={normalYears} onChange={(event) => setNormalYears(event.target.value)}>
                      {soil.normalYearsOptions.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="small muted">{soil.normalYearsHelp}</p>
                </div>
              </div>
            </Card>

            {/* ---- Sharing ---- */}
            <Card title={<CardTitle icon={<Lock size={14} />} text={sharing.title} />}>
              <Toggle checked={shareOffice} onChange={setShareOffice} title={sharing.regionalOffice.title} help={sharing.regionalOffice.help} />
              <Toggle checked={shareAtlas} onChange={setShareAtlas} title={sharing.atlasTotals.title} help={sharing.atlasTotals.help} />
            </Card>

            {/* ---- Save / Cancel / Delete ---- */}
            <div className="fs-actions">
              <Button variant="primary" type="submit">{buttons.save}</Button>
              <Button onClick={cancel}>{buttons.cancel}</Button>
              {saved && <Badge tone="green" dot>{buttons.saved}</Badge>}
              <Button variant="danger" className="fs-delete" title="Not connected yet">{buttons.delete}</Button>
            </div>
          </form>
        ) : (
          <ComingSoon
            section={comingSoonTabs[tab]}
            values={comingSoon}
            onChange={(id, value) => setComingSoon({ ...comingSoon, [id]: value })}
          />
        )}
      </div>

      {/* ================= RIGHT: the satellite map ================= */}
      <FieldMap map={map} />
    </div>
  );
}

// A card heading with a small icon before the words.
function CardTitle({ icon, text }) {
  return (
    <span className="fs-card-title">
      {icon}
      {text}
    </span>
  );
}

// The "Coming soon" card for the tabs that are not designed yet.
function ComingSoon({ section, values, onChange }) {
  if (!section) return null;
  return (
    <Card title={section.title} subtitle={section.note} className="fs-form">
      {section.rows.map((row) => (
        <Toggle key={row.id} checked={values[row.id]} onChange={(value) => onChange(row.id, value)} title={row.title} help={row.help} />
      ))}
    </Card>
  );
}

// The satellite picture with the traced field drawn over it. All positions
// come from fieldSettings.map as fractions (0 to 1) of the map box, and are
// written as percentages so the picture fills whatever space it gets.
function FieldMap({ map }) {
  const pct = (value) => `${(value * 100).toFixed(2)}%`;
  const corners = map.polygon;

  return (
    <div className="fs-map" aria-label="Satellite view of the field">
      <svg className="fs-map-svg" width="100%" height="100%" role="img" aria-hidden="true">
        <defs>
          {/* Crop rows on the sown fields: diagonal stripes. */}
          <pattern id="fs-rows" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(70)">
            <rect width="10" height="10" fill={EARTH.cropDark} />
            <rect width="4" height="10" fill={EARTH.cropLight} />
          </pattern>
          {/* Tractor lines across the bare field: faint horizontal stripes. */}
          <pattern id="fs-bare" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill={EARTH.bare} />
            <rect width="14" height="5" fill={EARTH.bareStripe} />
          </pattern>
          {/* Stubble on the harvested field below: thin vertical stripes. */}
          <pattern id="fs-stubble" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill={EARTH.stubble} />
            <rect width="3" height="12" fill={EARTH.stubbleStripe} />
          </pattern>
          {/* Tree lines: a row of dark round dots. */}
          <pattern id="fs-trees" width="9" height="9" patternUnits="userSpaceOnUse">
            <rect width="9" height="9" fill={EARTH.ground} />
            <circle cx="4.5" cy="4.5" r="3.6" fill={EARTH.trees} />
          </pattern>
        </defs>

        {/* ---- The land ---- */}
        <rect width="100%" height="100%" fill={EARTH.ground} />
        {/* Everything inside this group leans a little (skewY), so the
            field edges and tree lines run slightly downhill to the right
            like the real photo. The top field starts above the picture so
            no gap shows once it is tilted. */}
        <g transform={`skewY(${LAND_TILT})`}>
          {/* Sown field along the top. */}
          <rect x="0" y="-4%" width="100%" height="26%" fill="url(#fs-rows)" />
          <rect x="0" y="22%" width="100%" height="1.6%" fill="url(#fs-trees)" />
          <rect x="0" y="23.6%" width="100%" height="1%" fill={EARTH.path} />
          {/* Sown strips down the right side. */}
          <rect x="90%" y="24.6%" width="10%" height="54%" fill="url(#fs-rows)" />
          <rect x="88%" y="24.6%" width="2%" height="54%" fill={EARTH.path} />
          <rect x="86.5%" y="24.6%" width="1.5%" height="54%" fill="url(#fs-trees)" />
          <ellipse cx="100%" cy="42%" rx="4%" ry="6%" fill={EARTH.trees} />
          {/* The bare field being edited. */}
          <rect x="7%" y="24.6%" width="79.5%" height="54%" fill="url(#fs-bare)" />
          <rect x="7%" y="24.6%" width="2.5%" height="54%" fill={EARTH.bareDark} />
          <rect x="3%" y="24.6%" width="4%" height="54%" fill="url(#fs-rows)" />
          {/* Tree line and track under the field, then the harvested field. */}
          <rect x="0" y="78.6%" width="100%" height="1.6%" fill="url(#fs-trees)" />
          <rect x="0" y="80.2%" width="100%" height="1%" fill={EARTH.path} />
          <rect x="5%" y="81.2%" width="80%" height="19%" fill="url(#fs-stubble)" />
          <rect x="85%" y="81.2%" width="1.2%" height="19%" fill={EARTH.path} />
          <rect x="86.2%" y="81.2%" width="14%" height="19%" fill="url(#fs-rows)" />
        </g>

        {/* ---- Craters seen on the image ---- */}
        {map.craters.map((crater, i) => (
          <circle
            key={i}
            cx={pct(crater.x)}
            cy={pct(crater.y)}
            r={CRATER_RADIUS[crater.r] || 4}
            fill={EARTH.crater}
            stroke={EARTH.craterRim}
            strokeWidth="1.5"
            strokeOpacity="0.7"
          />
        ))}

        {/* ---- The "first check" square around the pin ---- */}
        <rect
          x={pct(map.pinSquare.x)}
          y={pct(map.pinSquare.y)}
          width={pct(map.pinSquare.w)}
          height={pct(map.pinSquare.h)}
          fill="var(--c-surface)"
          fillOpacity="0.18"
          stroke="var(--c-surface)"
          strokeWidth="2.5"
          strokeDasharray="9 6"
        />

        {/* ---- The traced edges: a dark shadow line, then a white line ---- */}
        {corners.map((corner, i) => {
          const next = corners[(i + 1) % corners.length];
          const line = { x1: pct(corner.x), y1: pct(corner.y), x2: pct(next.x), y2: pct(next.y) };
          return (
            <g key={i}>
              <line {...line} stroke="var(--c-ink)" strokeOpacity="0.45" strokeWidth="7" strokeLinecap="round" />
              <line {...line} stroke="var(--c-surface)" strokeWidth="3.5" strokeLinecap="round" />
            </g>
          );
        })}

        {/* Small dots half way along each edge (click to add a corner). */}
        {map.edgeDots.map((dot, i) => (
          <circle key={i} cx={pct(dot.x)} cy={pct(dot.y)} r="6" fill="var(--c-surface)" stroke="var(--c-ink)" strokeWidth="1.5" className="fs-handle-small" />
        ))}

        {/* Big corner handles. */}
        {corners.map((corner, i) => (
          <circle key={i} cx={pct(corner.x)} cy={pct(corner.y)} r="10" fill="var(--c-surface)" stroke="var(--c-ink)" strokeWidth="2.5" className="fs-handle" />
        ))}

        {/* ---- The pin. Its round head sits on the pin position; the tip
             points down into the "first check" square. ---- */}
        <svg x={pct(map.pin.x)} y={pct(map.pin.y)} overflow="visible">
          <path
            d="M0,44 C-10,30 -24,18 -24,0 a24,24 0 1,1 48,0 C24,18 10,30 0,44 Z"
            fill="var(--c-amber)"
            stroke="var(--c-ink)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle r="7.5" fill="var(--c-ink)" />
        </svg>
      </svg>

      {/* ---- Things written on top of the picture ---- */}
      <div className="fs-map-top">
        <span className="fs-map-chip">{map.label}</span>
        <div className="fs-map-tip">
          <Spline size={14} />
          <span>{map.tip}</span>
        </div>
      </div>

      <div className="fs-map-zoom">
        <button type="button" className="fs-map-round" title="Not connected yet" aria-label="Zoom in"><Plus size={16} /></button>
        <button type="button" className="fs-map-round" title="Not connected yet" aria-label="Zoom out"><Minus size={16} /></button>
        <button type="button" className="fs-map-round" title="Not connected yet" aria-label="Layers"><Layers size={15} /></button>
      </div>

      <span className="fs-map-area mono" style={{ left: pct(map.pin.x), top: "65%" }}>
        {map.areaLabel}
      </span>

      <div className="fs-map-legend">
        <div className="fs-legend-row">
          <MapPin size={13} className="fs-legend-pin" />
          <span>{map.legend.pin.label}</span>
          <span className="mono muted">{map.legend.pin.value}</span>
        </div>
        <div className="fs-legend-row">
          <span className="fs-legend-swatch fs-legend-dashed" />
          <span>{map.legend.firstCheck.label}</span>
          <span className="mono muted">{map.legend.firstCheck.value}</span>
        </div>
        <div className="fs-legend-row">
          <svg className="fs-legend-swatch fs-legend-traced" viewBox="0 0 12 12" aria-hidden="true">
            <rect width="12" height="12" rx="2" fill={EARTH.bare} />
          </svg>
          <span>{map.legend.traced.label}</span>
          <span className="mono muted">{map.legend.traced.value}</span>
        </div>
      </div>
    </div>
  );
}
