// WHAT THIS FILE DOES
// The Field "Data" page: a long chart of plant health (NDVI) for one field
// against the farm average, 2019 to today, a table of the newest satellite
// readings, and a list of files the farmer can download.
//
// Everything shown comes from src/data/farm.js (dataPage, dataLayers,
// ndviHistory, readings, downloads...). The chart is drawn by hand as an
// SVG from ndviHistory, so there is no chart library to learn.
//
// WHO EDITS IT
// Whoever changes how the Data page looks. To change the words or numbers,
// edit src/data/farm.js instead. The CSS for this page is in DataPage.css.

import { useState } from "react";
import { Calendar, Download } from "lucide-react";
import { PageHeader, Card, Badge, Button, Tabs, ChipSelect } from "../../components/ui/index.js";
import {
  dataPage,
  dataLayers,
  ndviHistory,
  readings,
  downloads,
  downloadsCard,
  dataFootnote,
  fieldOptions,
  fieldById,
} from "../../data/farm.js";
import "./DataPage.css";

// The first layer, "Plant health (NDVI)", is the only one with real data.
const NDVI_LAYER = dataLayers[0];

// TODO move to src/data/farm.js (e.g. give each dataLayers entry {id, label, code})
// The radar layer has no index code like "NDVI", so its subtitle reads
// "Monthly radar backscatter, ..." instead.
const RADAR_LAYER_NAME = "radar backscatter";

// TODO move to src/data/farm.js
// Shown under the chart on a phone, where the chart scrolls sideways.
const SCROLL_HINT = "Scroll sideways to see the rest of the chart.";

// TODO move to src/data/farm.js
// Replaces the caption when the chosen years leave out the 2022 damage.
const RANGE_NOTE = "Pick \"2019 to 2026\" to see how Field 7 changed in 2022.";

export default function DataPage() {
  // Which field, which years and which satellite layer are showing.
  const [fieldId, setFieldId] = useState(dataPage.defaultFieldId);
  const [range, setRange] = useState(dataPage.rangeLabel);
  const [layer, setLayer] = useState(NDVI_LAYER);

  // The mockup is written for Field 7. When another field is picked we swap
  // the name in the headings and say the numbers are still Field 7's.
  const defaultName = fieldById(dataPage.defaultFieldId).name;
  const fieldName = fieldById(fieldId)?.name || defaultName;
  const forField = (text) => text.replaceAll(defaultName, fieldName);
  const isNdvi = layer === NDVI_LAYER;

  // The months inside the chosen year range. The chart draws these, and the
  // heading describes the same span, so the two always agree.
  const points = ndviHistory.points.filter((point) => point.month >= rangeStart(range, ndviHistory));
  const span = points.length ? `${monthLabel(points[0].month)} to ${monthLabel(points[points.length - 1].month)}` : "";

  // The caption talks about the 2022 damage, so it only makes sense when
  // the "Damage found" month is on the chart.
  const showsDamage = points.some((point) => point.month === ndviHistory.markers.damageFound.month);

  // Chart heading: "Plant health, Field 7 ..." or "Water, Field 7 ..." for
  // the other layers, whose code ("NDWI") replaces "NDVI" in the subtitle.
  // The subtitle's dates ("January 2019 to October 2026") follow the range.
  const layerName = layer.replace(/\s*\(.*\)/, "");
  const rawCode = (layer.match(/\((.*)\)/) || [])[1] || "NDVI";
  const layerCode = /sentinel/i.test(rawCode) ? RADAR_LAYER_NAME : rawCode;
  const chartTitle = forField(isNdvi ? dataPage.chartTitle : dataPage.chartTitle.replace("Plant health", layerName));
  const chartSubtitle = dataPage.chartSubtitle.replace("NDVI", layerCode).replace(/,.*$/, `, ${span}`);

  // Notes shown under the chart when the data on screen is a stand-in.
  const notes = [];
  if (!isNdvi) notes.push("Placeholder: same data until the real layer is connected.");
  if (fieldId !== dataPage.defaultFieldId) notes.push(`Placeholder: showing ${defaultName}'s readings until this field's data is connected.`);

  const legend = (
    <div className="legend fd-legend">
      <span className="legend-item">
        <span className="fd-line-swatch" style={{ "--swatch": "var(--c-blue)" }} />
        {ndviHistory.seriesLabels.farmAverage}
      </span>
      <span className="legend-item">
        <span className="fd-line-swatch" style={{ "--swatch": "var(--c-red)" }} />
        {forField(ndviHistory.seriesLabels.field7)}
      </span>
    </div>
  );

  return (
    <div className="page fd-page">
      <PageHeader
        title={dataPage.title}
        subtitle={dataPage.subtitle}
        actions={
          <>
            <ChipSelect prefix={dataPage.fieldLabel} options={fieldOptions} value={fieldId} onChange={setFieldId} />
            <ChipSelect
              icon={<Calendar size={13} />}
              options={dataPage.rangeOptions.map((option) => ({ value: option, label: option }))}
              value={range}
              onChange={setRange}
              ariaLabel="Years"
            />
            <Button variant="primary" icon={<Download size={14} />} title="Not connected yet">
              {dataPage.downloadButton}
            </Button>
          </>
        }
      />

      {/* The satellite layer switch. */}
      <div className="fd-tabs">
        <Tabs
          bar
          tabs={dataLayers.map((name) => ({ id: name, label: name }))}
          active={layer}
          onChange={setLayer}
          ariaLabel="Satellite layer"
        />
      </div>

      {/* The long chart. */}
      <Card title={chartTitle} subtitle={chartSubtitle} actions={legend}>
        <NdviChart history={ndviHistory} points={points} fieldName={fieldName} />
        <p className="fd-scroll-hint small muted">{SCROLL_HINT}</p>
        <p className="fd-caption">{forField(showsDamage ? ndviHistory.caption : RANGE_NOTE)}</p>
        {notes.map((note) => (
          <p key={note} className="small muted">
            {note}
          </p>
        ))}
      </Card>

      <div className="two-col">
        {/* The newest readings. */}
        <Card
          title={forField(dataPage.archiveTitle)}
          actions={
            <button type="button" className="fd-link" title="Not connected yet">
              {dataPage.seeAll}
            </button>
          }
        >
          <div className="table-wrap">
            <table className="table fd-table">
              <thead>
                <tr>
                  {dataPage.columns.map((column, i) => (
                    <th key={column} className={i === 3 ? "num" : undefined}>
                      {column}
                    </th>
                  ))}
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => (
                  <tr key={reading.id}>
                    <td className="mono fd-date">{reading.dateDisplay}</td>
                    <td>{reading.source}</td>
                    <td className={reading.isNew ? "muted" : undefined}>{reading.clouds}</td>
                    <td className={/^\d/.test(reading.ndvi) ? "num" : "num muted"}>{reading.ndvi}</td>
                    <td className={reading.isNew ? "fd-change" : "fd-change muted"}>
                      {reading.isNew && <Badge tone="red">New</Badge>}
                      {reading.change}
                    </td>
                    <td className="fd-open">
                      <button type="button" className="fd-link" title="Not connected yet">
                        {dataPage.viewLink}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* The download list. */}
        <Card title={downloadsCard.title} subtitle={downloadsCard.subtitle}>
          <div className="stack-sm fd-downloads">
            {downloads.map((file) => (
              <button key={file.id} type="button" className="fd-download-row" title="Not connected yet">
                <Download size={14} />
                <span className="fd-download-name">{file.name}</span>
                <span className="mono small muted">{file.format}</span>
              </button>
            ))}
          </div>
          <p className="small muted">{dataFootnote}</p>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   The chart. Two smooth lines (farm average in blue, the field in red), a
   y axis from 0 to 1, a year label per year, two dashed event lines and a
   highlighted month with a dark tooltip. All drawn from ndviHistory.
   ------------------------------------------------------------------------- */

// The drawing area, in SVG units. The SVG scales to the card width.
const W = 860;
const H = 215;
const PAD = { top: 36, right: 36, bottom: 26, left: 44 };

function NdviChart({ history, points, fieldName }) {
  // "points" is the slice of history.points inside the chosen year range.
  const last = points.length - 1;

  // Month index -> x position, value -> y position.
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xAt = (i) => PAD.left + (last > 0 ? (i / last) * plotW : 0);
  const yAt = (value) => PAD.top + plotH - value * plotH;
  const xOfMonth = (month) => {
    const i = points.findIndex((point) => point.month === month);
    return i === -1 ? null : xAt(i);
  };

  const farmPath = smoothPath(points.map((point, i) => ({ x: xAt(i), y: yAt(point.farmAverage) })));
  const fieldPath = smoothPath(points.map((point, i) => ({ x: xAt(i), y: yAt(point.field7) })));

  // One label per year, placed under July of that year.
  const years = [...new Set(points.map((point) => point.year))];

  // The two dashed event lines and the highlighted month, if in range.
  const markers = Object.values(history.markers)
    .map((marker) => ({ ...marker, x: xOfMonth(marker.month) }))
    .filter((marker) => marker.x !== null);
  const highlightX = xOfMonth(history.highlight.month);
  const { highlight } = history;

  // Where the "Farm average" / "Field 7" line labels sit: above the farm
  // line and the field line, a little before the highlighted month.
  const labelMonth = points[Math.max(0, Math.round(last * 0.72))]?.month;
  const labelX = xOfMonth(labelMonth);

  return (
    <div className="fd-chart-wrap">
      {/* The inner box scrolls sideways on a phone; the outer one holds the
          fade at the right edge that hints there is more to see. */}
      <div className="fd-chart-scroll">
      <svg
        className="fd-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Monthly NDVI for ${fieldName} and the farm average`}
      >
        {/* Y axis ticks and the two axis lines. */}
        {history.yTicks.map((tick, i) => (
          <text key={tick} className="fd-tick" x={PAD.left - 10} y={yAt(tick) + 3} textAnchor="end">
            {history.yTickLabels[i]}
          </text>
        ))}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={yAt(0)} stroke="var(--c-border)" />
        <line x1={PAD.left} y1={yAt(0)} x2={W - PAD.right} y2={yAt(0)} stroke="var(--c-border)" />

        {/* Year labels along the bottom. */}
        {years.map((year) => {
          const x = xOfMonth(`${year}-07`) ?? xOfMonth(`${year}-01`);
          return (
            <text key={year} className="fd-year" x={x} y={H - 6} textAnchor="middle">
              {year}
            </text>
          );
        })}

        {/* Dashed event lines with their labels. A label normally sits to the
            right of its line; when the next line is close, it goes to the
            left so the two labels do not overlap. */}
        {markers.map((marker, i) => {
          const next = markers[i + 1];
          const crowded = next && next.x - marker.x < 80;
          return (
            <g key={marker.month} className={`fd-marker fd-marker-${marker.tone}`}>
              <line x1={marker.x} y1={PAD.top - 8} x2={marker.x} y2={yAt(0)} strokeDasharray="3 3" />
              <text x={crowded ? marker.x - 5 : marker.x + 5} y={PAD.top - 12} textAnchor={crowded ? "end" : "start"}>
                {marker.label}
              </text>
            </g>
          );
        })}

        {/* The two lines. */}
        <path d={farmPath} fill="none" stroke="var(--c-blue)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d={fieldPath} fill="none" stroke="var(--c-red)" strokeWidth="1.8" strokeLinejoin="round" />

        {/* Line labels. */}
        {labelX !== null && (
          <>
            <text className="fd-line-label" x={labelX} y={yAt(0.9)} textAnchor="middle">
              {history.seriesLabels.farmAverage}
            </text>
            <text className="fd-line-label" x={labelX} y={yAt(0.52)} textAnchor="middle">
              {fieldName}
            </text>
          </>
        )}

        {/* The highlighted month: a solid line, a dot per series, a tooltip. */}
        {highlightX !== null && (
          <g>
            <line x1={highlightX} y1={PAD.top - 8} x2={highlightX} y2={yAt(0)} stroke="var(--c-ink)" strokeWidth="1.2" />
            <circle cx={highlightX} cy={yAt(highlight.farm)} r="3.5" fill="var(--c-blue)" stroke="var(--c-surface)" strokeWidth="1.5" />
            <circle cx={highlightX} cy={yAt(highlight.field7)} r="3.5" fill="var(--c-red)" stroke="var(--c-surface)" strokeWidth="1.5" />
            <g transform={`translate(${highlightX + 7} ${PAD.top - 10})`}>
              <rect width="128" height="32" rx="5" fill="var(--c-ink)" />
              <text className="fd-tip-title" x="8" y="13">
                {highlight.display}
              </text>
              <text className="fd-tip-text" x="8" y="25">
                {highlight.tooltip.replaceAll("Field 7", fieldName)}
              </text>
            </g>
          </g>
        )}
      </svg>
      </div>
    </div>
  );
}

// Turns a range label like "2024 to 2026" into the first month to show.
// "This season" means from January of the last year in the data.
function rangeStart(range, history) {
  const year = range.match(/^\d{4}/);
  if (year) return `${year[0]}-01`;
  return `${history.to.slice(0, 4)}-01`;
}

// Turns a month like "2025-07" into "July 2025" for the chart subtitle.
function monthLabel(month) {
  const [year, m] = month.split("-");
  const name = new Date(Number(year), Number(m) - 1, 1).toLocaleString("en-GB", { month: "long" });
  return `${name} ${year}`;
}

// Joins points with a gentle curve instead of straight segments
// (a Catmull-Rom spline written as cubic Béziers).
function smoothPath(points) {
  if (points.length < 2) return "";
  const f = (n) => n.toFixed(1);
  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}
