// WHAT THIS FILE DOES
// The Field "Data" page (/field/data): the satellite record of one field.
//   1. Three big numbers   the last clear pass, clear passes this season, plant health
//                          against normal; under them, when there are any,
//                          the analysis's own notes on how the field was
//                          measured (analysis.warnings: no clear view lately,
//                          no normal to compare with, coarser pixels when
//                          Earth Engine ran short), kept off the Fields
//                          page's four tiles
//   2. Since 2019          monthly plant health (NDVI) or water (NDWI) of the
//                          field against the farm average, with the normal
//                          years (2019 to 2021) shaded. Where a known war
//                          covers the farm (analysis.conflict, from
//                          src/config/conflicts.js) the day it started is
//                          marked with its name and date; elsewhere there is
//                          no marker. Hover, tap or use the arrow keys for
//                          a month's numbers (Page Up / Page Down jump a year).
//   3. Satellite passes    this season's clear Sentinel-2 passes of the field
//   4. Downloads           field outlines (GeoJSON), passes and monthly
//                          history (CSV), the latest image (GeoTIFF, Earth
//                          Engine only) and the printable season report
// The field is picked at the top and kept in the address (?field=<id>), so
// a link opens the same field.
//
// Everything is real: the farm and its analyses come from useFieldData()
// (src/state/FieldData.jsx); each field's monthly history comes from
// GET /api/farm/fields/:id/analysis; the downloads are the server's export
// routes (server/field/routes.js). On sample data the page says so.
//
// WHO EDITS IT
// Whoever changes how the Field Data page looks or behaves. The styling is
// in DataPage.css next to this file (every class starts with "fdata-").

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, FileImage, FileSpreadsheet, FileText, Loader2, Map as MapIcon, Printer, RefreshCw } from "lucide-react";
import { PageHeader, Card, Badge, Button, Segmented, ChipSelect } from "../../components/ui/index.js";
import { FarmGate, FieldProgress, useFieldData } from "../../state/FieldData.jsx";
import { exportUrl, getGeotiffUrl } from "../../api/fieldApi.js";
import { BASELINE } from "../../lib/field/method.js";
import { ANALYSING_LABEL, cropInfo, farmLine, formatArea, formatDay, formatIndex, stageWord, statusOf, stressWord, versusWord, waterWord } from "../../lib/field/format.js";
import "./DataPage.css";

// The two readings the chart can show. One at a time: they have different
// scales, so they never share an axis.
const MEASURES = [
  { value: "ndvi", label: "Plant health", color: "var(--fdata-health)" },
  { value: "ndwi", label: "Water", color: "var(--fdata-water)" },
];

// Where the chart marks the start of a war ({ name, since: "YYYY-MM-DD" }),
// in months from the first month: each monthly point is drawn at the
// middle of its month, so a war that started on day d of month i sits at
// i - 1/2 + (d - 1) / (days in that month). null when it is off the chart.
function warPosition(months, conflict) {
  const since = conflict?.since;
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  const i = months.indexOf(since.slice(0, 7));
  if (i < 0) return null;
  const [y, m, d] = since.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return i - 0.5 + (d - 1) / days;
}

// The war marker's label: "Full-scale invasion of Ukraine · Feb 24, 2022"
// on one line when it fits the plot width, else the name on as many lines
// as it needs (a long one, like "Israel–Hezbollah war (south Lebanon,
// northern Israel and the Golan Heights)" on a phone, is cut between
// words) and the date on its own line, or after the name's last line
// when that fits. About 6 px a letter at the label's 11 px.
const labelWidth = (text) => text.length * 6;
function warLines(conflict, room) {
  const date = dayText(conflict.since);
  const full = `${conflict.name} · ${date}`;
  if (labelWidth(full) <= room) return [full];
  const lines = [];
  let line = "";
  for (const word of String(conflict.name).split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word;
    if (line && labelWidth(longer) > room) {
      lines.push(line);
      line = word;
    } else {
      line = longer;
    }
  }
  if (line) lines.push(line);
  const withDate = `${lines[lines.length - 1]} · ${date}`;
  if (lines.length > 1 && labelWidth(withDate) <= room) lines[lines.length - 1] = withDate;
  else lines.push(date);
  return lines;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isNum = (value) => typeof value === "number" && Number.isFinite(value);

// "2024-03" -> "Mar 2024"
function monthText(month) {
  const [year, m] = String(month).split("-");
  return `${SHORT_MONTHS[Number(m) - 1] || m} ${year}`;
}

// "2026-10-16" -> "Oct 16", or "Oct 16, 2025" when not this year.
function dayText(iso) {
  if (!iso) return "–";
  const thisYear = String(new Date().getFullYear());
  return iso.slice(0, 4) === thisYear ? formatDay(iso) : `${formatDay(iso)}, ${iso.slice(0, 4)}`;
}

// Every month from the first to the last, so gaps in the record stay gaps.
function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The monthly history of every field (one request per field, in parallel)
// ---------------------------------------------------------------------------

function useHistories(farm, analyses, job, fieldDetail) {
  const [state, setState] = useState({ key: null, byId: {}, error: null, loading: true });
  const [retry, setRetry] = useState(0);
  const fieldsRef = useRef(farm?.fields || []);
  fieldsRef.current = farm?.fields || [];

  // Reloads when the fields change, when an analysis is redone, and when a job ends.
  const key = useMemo(() => {
    const parts = (farm?.fields || []).map((field) => `${field.id}@${analyses[field.id]?.updatedAt || ""}`);
    return `${parts.join(",")}|${job?.status === "running" ? "" : job?.id || ""}|${retry}`;
  }, [farm, analyses, job, retry]);

  useEffect(() => {
    let stopped = false;
    const fields = fieldsRef.current;
    setState((prev) => ({ ...prev, loading: true }));
    Promise.allSettled(fields.map((field) => fieldDetail(field.id))).then((answers) => {
      if (stopped) return;
      const byId = {};
      let error = null;
      answers.forEach((answer, i) => {
        if (answer.status === "fulfilled") byId[fields[i].id] = answer.value?.history || null;
        else error = answer.reason;
      });
      setState({ key, byId, error, loading: false });
    });
    return () => {
      stopped = true;
    };
  }, [key, fieldDetail]);

  const reload = useCallback(() => setRetry((n) => n + 1), []);
  return { ...state, reload };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export default function DataPage() {
  return (
    <FarmGate>
      <FieldDataPage />
    </FarmGate>
  );
}

function FieldDataPage() {
  const { farm, analyses, provider, job, analysing, conflict: farmWar, actions } = useFieldData();
  const [params, setParams] = useSearchParams();
  const [measureId, setMeasureId] = useState("ndvi");
  const measure = MEASURES.find((item) => item.value === measureId);

  const fields = farm.fields;
  const asked = params.get("field");
  const field = fields.find((item) => item.id === asked) || fields[0];
  const analysis = analyses[field.id] || null;
  // The war covering the farm, if any (every field of a farm shares it).
  const conflict = analysis?.conflict || farmWar || null;
  const chooseField = (id) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("field", id);
        return next;
      },
      { replace: true }
    );

  const histories = useHistories(farm, analyses, job, actions.fieldDetail);
  const running = job?.status === "running";
  // "Sample data" follows the selected field's readings, not the current
  // data source; the GeoTIFF needs Earth Engine connected now.
  const sample = analysis ? analysis.provider !== "gee" : provider?.id !== "gee";
  const canGeotiff = provider?.id === "gee" && analysis?.provider === "gee";

  // The chart's months, the field's values and the farm average (weighted by area).
  const chart = useMemo(() => {
    const all = Object.values(histories.byId).flatMap((history) => history?.months || []);
    const known = all.map((item) => item.month).filter(Boolean).sort();
    if (!known.length) return null;
    const months = monthRange(known[0], known[known.length - 1]);
    const index = new Map(months.map((month, i) => [month, i]));
    const read = (key) => {
      const own = new Array(months.length).fill(null);
      const sum = new Array(months.length).fill(0);
      const weight = new Array(months.length).fill(0);
      for (const item of fields) {
        const area = isNum(item.areaHa) && item.areaHa > 0 ? item.areaHa : 1;
        for (const row of histories.byId[item.id]?.months || []) {
          const i = index.get(row.month);
          if (i == null || !isNum(row[key])) continue;
          if (item.id === field.id) own[i] = row[key];
          sum[i] += row[key] * area;
          weight[i] += area;
        }
      }
      return { field: own, farm: sum.map((value, i) => (weight[i] ? value / weight[i] : null)) };
    };
    return { months, ndvi: read("ndvi"), ndwi: read("ndwi") };
  }, [histories.byId, fields, field.id]);

  const season = useMemo(() => [...(analysis?.season || [])].sort((a, b) => b.date.localeCompare(a.date)), [analysis]);
  // How this field was measured, in the analysis's own words (for example
  // "Measured with 20 m pixels: Earth Engine ran short of memory or time.").
  const notes = (Array.isArray(analysis?.warnings) ? analysis.warnings : []).filter((note) => typeof note === "string" && note.trim());

  return (
    <div className="page fdata">
      <div className="fdata-screen">
        <PageHeader
          title="Data"
          subtitle={
            <span className="fdata-meta">
              {farmLine(farm)}
              {sample ? <Badge tone="amber">Sample data</Badge> : <Badge tone="green">Sentinel-2</Badge>}
            </span>
          }
          actions={
            <ChipSelect
              prefix="Field"
              ariaLabel="Field"
              options={fields.map((item) => ({ value: item.id, label: item.name }))}
              value={field.id}
              onChange={chooseField}
            />
          }
        />

        {running && (
          <div className="card fdata-progress">
            <FieldProgress job={job} compact />
          </div>
        )}

        {!analysis && analysing.has(field.id) && (
          <p className="fdata-analysing" role="status">
            <Loader2 size={15} className="fd-spin" aria-hidden="true" />
            {`Analysing ${field.name}… This season and its history since 2019 appear here when done.`}
          </p>
        )}

        <div className="fdata-stats">
          <BigStat label="Last pass" value={dayText(analysis?.latestPass?.date)} line={isNum(analysis?.latestPass?.clearPct) ? `${analysis.latestPass.clearPct}% clear` : null} />
          <BigStat label="Passes" value={String(season.length)} line={season.length ? `since ${dayText(season[season.length - 1].date)}` : "this season"} />
          <BigStat
            label="Plant health"
            value={formatIndex(analysis?.plantHealth?.ndvi)}
            line={analysis?.plantHealth?.versus ? versusWord(analysis.plantHealth.versus) : null}
          />
        </div>

        {notes.length > 0 && (
          <ul className="fdata-notes" aria-label={`Notes on how ${field.name} was measured`}>
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        <Card
          title="Since 2019"
          className="fdata-history"
          actions={<Segmented options={MEASURES} value={measureId} onChange={setMeasureId} ariaLabel="Reading" />}
        >
          <HistoryBody
            chart={chart}
            conflict={conflict}
            histories={histories}
            field={field}
            measure={measure}
            showFarm={fields.length > 1}
            running={running}
            onAnalyze={() => actions.analyze([field.id])}
          />
        </Card>

        <div className="fdata-row">
          <PassesCard season={season} latest={analysis?.latestPass?.date} fieldName={field.name} />
          <DownloadsCard field={field} gee={canGeotiff} passDate={analysis?.latestPass?.date} />
        </div>
      </div>

      <PrintReport farm={farm} analyses={analyses} analysing={analysing} provider={provider} field={field} chart={chart} measure={measure} conflict={conflict} />
    </div>
  );
}

function BigStat({ label, value, line }) {
  return (
    <div className="fdata-stat">
      <span className="fdata-stat-label">{label}</span>
      <span className="fdata-stat-value">{value}</span>
      {line && <span className="fdata-stat-line">{line}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The history chart card
// ---------------------------------------------------------------------------

function HistoryBody({ chart, conflict, histories, field, measure, showFarm, running, onAnalyze }) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const series = chart?.[measure.value];
  const hasField = series?.field.some(isNum);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await onAnalyze();
    } catch (error) {
      setStartError(error);
    } finally {
      setStarting(false);
    }
  };

  if (histories.loading && !chart) {
    return (
      <div className="fdata-empty" aria-busy="true">
        <Loader2 size={18} className="fd-spin" aria-hidden="true" />
      </div>
    );
  }
  if (!hasField) {
    return (
      <div className="fdata-empty">
        <p className="fdata-empty-title">{histories.error ? "The history could not load" : `No history for ${field.name} yet`}</p>
        {histories.error && <p className="fdata-error">{histories.error.message}</p>}
        {startError && <p className="fdata-error">{startError.message}</p>}
        <div className="cluster">
          {histories.error ? (
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={histories.reload}>
              Try again
            </Button>
          ) : (
            !running && (
              <Button variant="primary" icon={<RefreshCw size={14} />} onClick={start} disabled={starting}>
                {starting ? "Starting…" : "Get history"}
              </Button>
            )
          )}
        </div>
      </div>
    );
  }
  return <HistoryChart months={chart.months} series={series} field={field} measure={measure} showFarm={showFarm} conflict={conflict} />;
}

// Keeps track of an element's width so the chart draws in real pixels.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// The y range: the data rounded out to 0.1, at least 0.4 tall.
function yDomain(values) {
  const known = values.filter(isNum);
  if (!known.length) return { min: 0, max: 1, step: 0.2 };
  let min = Math.floor(Math.min(...known) * 10) / 10;
  let max = Math.ceil(Math.max(...known) * 10) / 10;
  if (max - min < 0.4) {
    const grow = (0.4 - (max - min)) / 2;
    min = Math.round((min - grow) * 10) / 10;
    max = Math.round((max + grow) * 10) / 10;
  }
  const step = max - min > 0.8 ? 0.2 : 0.1;
  min = Math.floor(min / step + 1e-9) * step;
  max = Math.ceil(max / step - 1e-9) * step;
  return { min, max, step };
}

// A line through the months, broken where a month has no reading.
function linePath(values, x, y) {
  let d = "";
  let open = false;
  values.forEach((value, i) => {
    if (!isNum(value)) {
      open = false;
      return;
    }
    d += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`;
    open = true;
  });
  return d;
}

// Lone months between gaps would be invisible as a line, so they get a dot.
function loneMonths(values) {
  return values.map((value, i) => (isNum(value) && !isNum(values[i - 1]) && !isNum(values[i + 1]) ? i : -1)).filter((i) => i >= 0);
}

// The field's value in the same calendar month of the normal years.
function normalFor(months, values, index) {
  const mm = months[index]?.slice(5);
  const same = months
    .map((month, i) => ({ month, value: values[i] }))
    .filter((item) => item.month.slice(5) === mm && Number(item.month.slice(0, 4)) >= BASELINE.from && Number(item.month.slice(0, 4)) <= BASELINE.to && isNum(item.value));
  if (!same.length) return null;
  return same.reduce((sum, item) => sum + item.value, 0) / same.length;
}

function HistoryChart({ months, series, field, measure, showFarm, conflict = null, fixedWidth, interactive = true }) {
  const [wrapRef, measured] = useWidth();
  const width = fixedWidth || measured;
  const [hover, setHover] = useState(null);

  // The last month with a reading is shown when nothing is hovered.
  const lastIndex = useMemo(() => {
    for (let i = series.field.length - 1; i >= 0; i -= 1) if (isNum(series.field[i])) return i;
    return months.length - 1;
  }, [series, months]);
  useEffect(() => setHover(null), [field.id, measure.value]);
  const shown = hover ?? lastIndex;

  const narrow = width < 520;
  const warAt = warPosition(months, conflict);
  const side = { right: narrow ? 10 : 16, left: narrow ? 34 : 42 };
  const plotW = Math.max(1, width - side.left - side.right);
  const warText = warAt != null ? warLines(conflict, plotW) : [];
  // A war marker's label gets its own rows above the "Normal years" label.
  const warRow = warText.length * 14;
  const height = (narrow ? 230 : 280) + warRow;
  const pad = { top: 26 + warRow, bottom: 30, ...side };
  const plotH = height - pad.top - pad.bottom;
  const domain = yDomain([...series.field, ...(showFarm ? series.farm : [])]);
  const last = Math.max(1, months.length - 1);
  const x = (i) => pad.left + (i / last) * plotW;
  const y = (value) => pad.top + plotH - ((value - domain.min) / (domain.max - domain.min)) * plotH;
  const ticks = [];
  for (let v = domain.min; v <= domain.max + 1e-9; v += domain.step) ticks.push(Math.round(v * 100) / 100);

  // Years: a faint line at each January, the year in the middle of it.
  const years = [];
  months.forEach((month, i) => {
    if (i === 0 || month.endsWith("-01")) years.push({ year: month.slice(0, 4), start: i });
  });
  years.forEach((item, k) => {
    item.end = k + 1 < years.length ? years[k + 1].start : months.length - 1;
  });

  // The normal years, shaded.
  const baseStart = months.findIndex((month) => Number(month.slice(0, 4)) >= BASELINE.from);
  let baseEnd = -1;
  months.forEach((month, i) => {
    if (Number(month.slice(0, 4)) <= BASELINE.to) baseEnd = i;
  });
  // The war marker: each label line starts just right of the line, moved
  // left as far as needed to stay inside the plot.
  let war = null;
  if (warAt != null) {
    const warX = x(warAt);
    const lines = warText.map((text, k) => ({
      text,
      x: Math.max(pad.left, Math.min(warX + 5, width - pad.right - labelWidth(text))),
      y: 12 + k * 14,
    }));
    war = { x: warX, lines, top: 12 + (lines.length - 1) * 14 + 4 };
  }

  const pickAt = (clientX) => {
    const box = wrapRef.current?.querySelector("svg")?.getBoundingClientRect();
    if (!box) return;
    const i = Math.round(((clientX - box.left - pad.left) / plotW) * last);
    setHover(Math.max(0, Math.min(months.length - 1, i)));
  };
  const onKey = (event) => {
    const moves = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -12, PageUp: 12 };
    if (event.key in moves) {
      event.preventDefault();
      setHover((prev) => Math.max(0, Math.min(months.length - 1, (prev ?? lastIndex) + moves[event.key])));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setHover(event.key === "Home" ? 0 : months.length - 1);
    } else if (event.key === "Escape") setHover(null);
  };

  const fieldValue = series.field[shown];
  const farmValue = series.farm[shown];
  const normal = normalFor(months, series.field, shown);
  const lone = loneMonths(series.field);
  const loneFarm = showFarm ? loneMonths(series.farm) : [];

  return (
    <div className="fdata-chart-block" style={{ "--fdata-series": measure.color }}>
      <div className="fdata-readout" aria-live="polite">
        <span className="fdata-readout-month">{monthText(months[shown])}</span>
        <span className="fdata-readout-value">{formatIndex(fieldValue)}</span>
        <span className="fdata-readout-side">
          {showFarm && (
            <span>
              Farm <b>{formatIndex(farmValue)}</b>
            </span>
          )}
          <span>
            Normal <b>{formatIndex(normal)}</b>
          </span>
        </span>
      </div>

      <div className="fdata-legend">
        <span className="fdata-key">
          <span className="fdata-key-line" />
          {field.name}
        </span>
        {showFarm && (
          <span className="fdata-key">
            <span className="fdata-key-line is-farm" />
            Farm average
          </span>
        )}
      </div>

      <div
        className={interactive ? "fdata-chart is-live" : "fdata-chart"}
        ref={wrapRef}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? "slider" : undefined}
        aria-label={interactive ? `${measure.label} by month for ${field.name}. Use the arrow keys to move between months, Page Up and Page Down to move a year.` : undefined}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? months.length - 1 : undefined}
        aria-valuenow={interactive ? shown : undefined}
        aria-valuetext={interactive ? `${monthText(months[shown])}: ${formatIndex(fieldValue)}` : undefined}
        onKeyDown={interactive ? onKey : undefined}
        onPointerMove={interactive ? (event) => pickAt(event.clientX) : undefined}
        onPointerDown={interactive ? (event) => pickAt(event.clientX) : undefined}
        onPointerLeave={interactive ? (event) => event.pointerType === "mouse" && setHover(null) : undefined}
      >
        {width > 0 && (
          <svg
            width={fixedWidth ? "100%" : width}
            height={fixedWidth ? undefined : height}
            viewBox={fixedWidth ? `0 0 ${width} ${height}` : undefined}
            aria-hidden="true"
          >
            {baseStart >= 0 && baseEnd >= baseStart && (
              <g>
                <rect x={x(baseStart)} y={pad.top} width={Math.max(0, x(baseEnd) - x(baseStart))} height={plotH} className="fdata-base" />
                <text x={x(baseStart)} y={pad.top - 12} className="fdata-base-label">
                  Normal years
                </text>
              </g>
            )}
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="fdata-grid" />
                <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fdata-tick">
                  {formatIndex(tick, 1)}
                </text>
              </g>
            ))}
            {years.map((item) => (
              <g key={item.year}>
                {item.start > 0 && <line x1={x(item.start)} x2={x(item.start)} y1={pad.top} y2={pad.top + plotH} className="fdata-year-line" />}
                {x(item.end) - x(item.start) > 22 && (
                  <text x={(x(item.start) + x(item.end)) / 2} y={height - 10} textAnchor="middle" className="fdata-year">
                    {narrow ? `’${item.year.slice(2)}` : item.year}
                  </text>
                )}
              </g>
            ))}
            {war && (
              <g className="fdata-war">
                <line x1={war.x} x2={war.x} y1={war.top} y2={pad.top + plotH} />
                {war.lines.map((item) => (
                  <text key={item.text} x={item.x} y={item.y}>
                    {item.text}
                  </text>
                ))}
              </g>
            )}
            {showFarm && <path d={linePath(series.farm, x, y)} className="fdata-line-farm" />}
            {loneFarm.map((i) => (
              <circle key={`f${i}`} cx={x(i)} cy={y(series.farm[i])} r="2" className="fdata-dot-farm" />
            ))}
            <path d={linePath(series.field, x, y)} className="fdata-line" />
            {lone.map((i) => (
              <circle key={`l${i}`} cx={x(i)} cy={y(series.field[i])} r="2.5" className="fdata-dot-lone" />
            ))}
            {interactive && (
              <g className="fdata-cross">
                <line x1={x(shown)} x2={x(shown)} y1={pad.top} y2={pad.top + plotH} />
                {showFarm && isNum(farmValue) && <circle cx={x(shown)} cy={y(farmValue)} r="4" className="fdata-dot-farm-on" />}
                {isNum(fieldValue) && <circle cx={x(shown)} cy={y(fieldValue)} r="5" className="fdata-dot" />}
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// This season's passes
// ---------------------------------------------------------------------------

const PASS_ROWS = 8;

function PassesCard({ season, latest, fieldName }) {
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [fieldName]);
  const rows = all ? season : season.slice(0, PASS_ROWS);
  return (
    <Card title="Satellite passes" className="fdata-passes">
      {season.length === 0 ? (
        <p className="fdata-none">No clear pass of {fieldName} this season yet.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table fdata-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Clear</th>
                  <th className="num">Plant health</th>
                  <th className="num">Water</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pass) => (
                  <tr key={pass.date} className={pass.date === latest ? "is-latest" : undefined}>
                    <td className="fdata-date">
                      {dayText(pass.date)}
                      {pass.date === latest && <Badge tone="green">Latest</Badge>}
                    </td>
                    <td className="num">{isNum(pass.clearPct) ? `${pass.clearPct}%` : "–"}</td>
                    <td className="num">{formatIndex(pass.ndvi)}</td>
                    <td className="num">{formatIndex(pass.ndwi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {season.length > PASS_ROWS && (
            <button type="button" className="fdata-more" onClick={() => setAll((value) => !value)} aria-expanded={all}>
              {all ? "Show fewer" : `Show all ${season.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

// Saves a download. Earth Engine gives either a web address (it answers
// with the file) or, when the account cannot make download links, the
// GeoTIFF itself as a data: address, which browsers will not open as a
// page, so it is turned into a file here.
function saveFile(url, name) {
  let href = url;
  let revoke = null;
  const inline = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
  if (inline) {
    const text = inline[2] ? atob(inline[3]) : decodeURIComponent(inline[3]);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
    href = URL.createObjectURL(new Blob([bytes], { type: inline[1] || "image/tiff" }));
    revoke = href;
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(revoke), 30000);
}

function DownloadsCard({ field, gee, passDate }) {
  const [tiff, setTiff] = useState({ busy: false, error: null });
  useEffect(() => setTiff({ busy: false, error: null }), [field.id]);

  const downloadTiff = async () => {
    setTiff({ busy: true, error: null });
    try {
      const answer = await getGeotiffUrl(field.id);
      const url = answer?.url;
      if (!url) throw new Error("Earth Engine gave no download link.");
      const date = answer.date || passDate;
      const name = answer.name || `${field.name.replace(/[^\w.-]+/g, "-")}${date ? `-${date}` : ""}.tif`;
      saveFile(url, name);
      setTiff({ busy: false, error: null });
    } catch (error) {
      setTiff({ busy: false, error });
    }
  };

  const files = [
    { id: "geojson", name: "Field outlines", format: "GeoJSON", icon: MapIcon, href: exportUrl("fields.geojson"), file: "chernozem-fields.geojson" },
    { id: "readings", name: "Satellite passes", format: "CSV", icon: FileSpreadsheet, href: exportUrl("readings.csv"), file: "chernozem-readings.csv" },
    { id: "history", name: "Monthly history", format: "CSV", icon: FileSpreadsheet, href: exportUrl("history.csv"), file: "chernozem-history.csv" },
  ];

  return (
    <Card title="Downloads" className="fdata-downloads">
      <div className="fdata-files">
        {files.map(({ id, name, format, icon: Icon, href, file }) => (
          <a key={id} className="fdata-file" href={href} download={file} data-download={id}>
            <Icon size={18} aria-hidden="true" />
            <span className="fdata-file-name">{name}</span>
            <span className="fdata-file-format">{format}</span>
            <Download size={15} className="fdata-file-go" aria-hidden="true" />
          </a>
        ))}
        {gee && (
          <button type="button" className="fdata-file" onClick={downloadTiff} disabled={tiff.busy} data-download="geotiff">
            {tiff.busy ? <Loader2 size={18} className="fd-spin" aria-hidden="true" /> : <FileImage size={18} aria-hidden="true" />}
            <span className="fdata-file-name">{field.name} image</span>
            <span className="fdata-file-format">GeoTIFF</span>
            <Download size={15} className="fdata-file-go" aria-hidden="true" />
          </button>
        )}
        <button type="button" className="fdata-file" onClick={() => window.print()} data-download="report">
          <FileText size={18} aria-hidden="true" />
          <span className="fdata-file-name">Season report</span>
          <span className="fdata-file-format">Print</span>
          <Printer size={15} className="fdata-file-go" aria-hidden="true" />
        </button>
      </div>
      {tiff.error && <p className="fdata-error">{tiff.error.message}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The printable season report (only shown on paper)
// ---------------------------------------------------------------------------

function PrintReport({ farm, analyses, analysing, provider, field, chart, measure, conflict }) {
  const today = new Date();
  const todayText = `${SHORT_MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
  const series = chart?.[measure.value];
  return (
    <div className="fdata-print" aria-hidden="true">
      <header className="fdata-print-head">
        <h1>{farm.name}</h1>
        <p>
          Season report · {todayText} · {farmLine(farm)} · {(analyses?.[field?.id]?.provider ?? provider?.id) === "gee" ? "Sentinel-2 via Earth Engine" : "Sample data"}
        </p>
      </header>
      <table className="table fdata-print-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Crop</th>
            <th className="num">Area</th>
            <th>Status</th>
            <th>Plant health</th>
            <th>Water</th>
            <th>Stress</th>
            <th>Harvest</th>
            <th>Last pass</th>
          </tr>
        </thead>
        <tbody>
          {farm.fields.map((item) => {
            const a = analyses[item.id];
            return (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{cropInfo(item, a).text || "–"}</td>
                <td className="num">{formatArea(item.areaHa, farm.units)}</td>
                <td>{statusOf(a)?.label || (analysing.has(item.id) ? ANALYSING_LABEL : "–")}</td>
                <td>
                  <span className="fdata-print-num">{formatIndex(a?.plantHealth?.ndvi)}</span> <span className="fdata-print-soft">{a?.plantHealth?.versus ? versusWord(a.plantHealth.versus) : ""}</span>
                </td>
                <td>
                  <span className="fdata-print-num">{formatIndex(a?.water?.ndwi)}</span> <span className="fdata-print-soft">{a?.water?.versus ? waterWord(a.water.versus) : ""}</span>
                </td>
                <td>{a?.stress?.applies === false ? (a.stress.reason === "driedDown" ? "Dried down" : "No crop") : a?.stress?.level ? stressWord(a.stress.level) : "–"}</td>
                <td>{a ? stageWord(a.harvest) : "–"}</td>
                <td>{a?.latestPass?.date ? dayText(a.latestPass.date) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {series?.field.some(isNum) && (
        <section className="fdata-print-chart">
          <h2>
            {field.name} · {measure.label} since 2019
          </h2>
          <HistoryChart months={chart.months} series={series} field={field} measure={measure} showFarm={farm.fields.length > 1} fixedWidth={680} interactive={false} conflict={conflict} />
        </section>
      )}
      <p className="fdata-print-foot">Normal = the same time of year in {BASELINE.label}.</p>
    </div>
  );
}
