// WHAT THIS FILE DOES
// The Fields page (/field/fields): the farm map on the left and the
// selected field on the right.
//
//   MAP    the shared Field map (src/components/field/FieldMap.jsx): real
//          satellite imagery with each field tinted by its condition.
//          ONE layer only: Field condition (water, plant health, stress
//          and harvest readiness together, from method.js). On top: the
//          date of the latest satellite pass, the legend and the zoom
//          buttons.
//   PANEL  the selected field: its name, status and crop · area, a
//          damage line when damage was found (called war damage only
//          where a known war covers the farm: analysis.conflict), the four
//          big tiles (Water, Plant health, Stress, Harvest readiness: one
//          big value, at most one status word, at most one short line), a
//          small "Plant health this season" chart against the normal, and
//          one button: "Ask AI about <field>".
//
// "?field=<field id>" in the address picks the field (an unknown id is
// replaced by the first field's); clicking a field on the map (or the
// arrows by its name) puts it in the address, so a link opens the same
// field. Picking a field with the arrows or a link brings it into view on
// the map if it is off screen. On screens 860 px or narrower the map sits
// on top and the field below; clicking a field there scrolls to it.
//
// All numbers come from the real analyses in src/state/FieldData.jsx; the
// rules (what is normal, stressed, ready) from src/lib/field/method.js, as
// the server applied them; the wording helpers from src/lib/field/format.js.
//
// WHO EDITS IT
// Whoever changes how the Fields page looks. The map itself is
// src/components/field/FieldMap.jsx; the rules are in src/lib/field/method.js.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, MessageSquare, ShieldAlert } from "lucide-react";
import { Badge, Button } from "../../components/ui/index.js";
import { FarmGate, FieldProgress, useFieldData } from "../../state/FieldData.jsx";
import FieldMap, { fieldsBounds } from "../../components/field/FieldMap.jsx";
import ConditionLegend from "../../components/field/ConditionLegend.jsx";
import MetricTile from "../../components/field/MetricTile.jsx";
import { formatArea, formatDay, formatIndex, stageWord, stressWord } from "../../lib/field/format.js";
import { BASELINE } from "../../lib/field/method.js";
import "./FieldsPage.css";

// The width at which the page stacks (keep in step with FieldsPage.css).
const NARROW = "(max-width: 860px)";
// Room kept round the fields when the map fits them: little at the sides,
// more at the top and bottom for the date chip and the legend.
const FIT_PADDING = [18, 60];

function useNarrow() {
  const query = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(NARROW) : null);
  const [narrow, setNarrow] = useState(() => !!query()?.matches);
  useEffect(() => {
    const media = query();
    if (!media) return undefined;
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

// ---------- The four tiles ----------

const isNum = (value) => typeof value === "number" && Number.isFinite(value);
const round2 = (value) => Math.round(value * 100) / 100;

const VERSUS_TONES = { below: "amber", normal: "green", above: "blue" };
const STRESS_TONES = { low: "green", medium: "amber", high: "red" };
const WATER_WORDS = { below: "Drier than usual", normal: "Normal", above: "Wetter than usual" };
const HEALTH_WORDS = { below: "Below normal", normal: "Normal", above: "Above normal" };

// "Usual 0.26 to 0.29" (one number when both ends print the same).
function usualRange(normal) {
  if (!isNum(normal?.low) || !isNum(normal?.high)) return null;
  const low = formatIndex(normal.low);
  const high = formatIndex(normal.high);
  return low === high ? `Usual ${low}` : `Usual ${low} to ${high}`;
}

// The status word of a reading. The server decides below / normal / above
// (method.js versusNormal, which allows a small margin); "Normal" is said
// only when the printed value is inside the printed range, and "Near
// normal" when it is just outside it.
function readingStatus(reading, value, words) {
  if (!isNum(value) || !reading?.versus) return { word: null, tone: null };
  if (reading.versus === "normal" && isNum(reading.normal?.low) && isNum(reading.normal?.high)) {
    const v = round2(value);
    const inside = v >= round2(reading.normal.low) && v <= round2(reading.normal.high);
    return { word: inside ? "Normal" : "Near normal", tone: "green" };
  }
  return { word: words[reading.versus] || null, tone: VERSUS_TONES[reading.versus] || null };
}

// The highest normal plant health of the year (2019 to 2021), or null.
function usualPeak(normalCurve) {
  const values = (normalCurve || []).map((point) => point?.median).filter(isNum);
  return values.length ? Math.max(...values) : null;
}

// The four tiles of the selected field: { id, label, value, word, tone, line }.
// One big value, at most one status word, at most one line, nothing said twice.
function panelTiles(analysis, { units = "ha", weather = null } = {}) {
  const a = analysis || {};
  const water = a.water || {};
  const health = a.plantHealth || {};
  const stress = a.stress || {};
  const harvest = a.harvest || {};

  const waterStatus = readingStatus(water, water.ndwi, WATER_WORDS);
  const waterTile = { id: "water", label: "Water", value: formatIndex(water.ndwi), ...waterStatus, line: usualRange(water.normal) };

  // A field that never greened up this season is not "Normal", whatever
  // its bare-soil reading today.
  let healthTile;
  if (harvest.stage === "notSown") {
    const peak = usualPeak(a.normalCurve);
    healthTile = {
      id: "plantHealth",
      label: "Plant health",
      value: formatIndex(health.ndvi),
      word: "No crop",
      tone: "amber",
      line: isNum(harvest.peak) && isNum(peak) ? `Peak ${formatIndex(harvest.peak)}, usual ${formatIndex(peak)}` : "Did not green up this season",
    };
  } else {
    healthTile = { id: "plantHealth", label: "Plant health", value: formatIndex(health.ndvi), ...readingStatus(health, health.ndvi, HEALTH_WORDS), line: usualRange(health.normal) };
  }

  const share = isNum(stress.share) ? stress.share : null;
  const stressedHa = isNum(stress.stressedHa) && stress.stressedHa > 0 ? stress.stressedHa : null;
  const patches = Array.isArray(stress.patches) ? stress.patches.length : 0;
  let stressTile;
  if (share == null) {
    stressTile = { id: "stress", label: "Stress", value: "–", word: null, tone: null, line: null };
  } else if (share > 0 || stressedHa) {
    const pct = share * 100 < 1 ? "Under 1%" : `${Math.round(share * 100)}%`;
    stressTile = {
      id: "stress",
      label: "Stress",
      value: stressedHa ? formatArea(stressedHa, units) : pct,
      word: stress.level ? stressWord(stress.level) : null,
      tone: STRESS_TONES[stress.level] || null,
      line: [stressedHa ? `${pct} of the field` : null, patches ? `${patches} ${patches === 1 ? "patch" : "patches"}` : null].filter(Boolean).join(" · ") || null,
    };
  } else {
    stressTile = { id: "stress", label: "Stress", value: "None", word: null, tone: null, line: "No weak patches" };
  }

  const rain = weather?.rain?.likely ? weather.rain : null;
  const rainNote = harvest.rainBefore && rain?.from ? `Rain ${formatDay(rain.from)} · harvest first` : harvest.rainBefore ? "Rain due · harvest first" : null;
  let word = null;
  let tone = null;
  let line = null;
  switch (harvest.stage) {
    case "ready":
      line = rainNote || (harvest.window?.to ? `Best by ${formatDay(harvest.window.to)}` : null);
      break;
    case "ripening":
      word = "Ripening";
      tone = "blue";
      line = rainNote || (harvest.window?.from ? `Ready about ${formatDay(harvest.window.from)}` : null);
      break;
    case "harvested":
      line = harvest.harvestedOn ? `Cut about ${formatDay(harvest.harvestedOn)}` : harvest.lastDate ? `By ${formatDay(harvest.lastDate)}` : null;
      break;
    case "growing":
      line = isNum(harvest.peak) ? `Greenest so far ${formatIndex(harvest.peak)}` : null;
      break;
    case "notSown":
      break;
    default:
      line = "Waiting for a clear pass";
  }
  const harvestTile = { id: "harvest", label: "Harvest readiness", value: stageWord(harvest), word, tone, line };

  return [waterTile, healthTile, stressTile, harvestTile];
}

// ---------- The page ----------

function FieldsView() {
  const { farm, analyses, provider, job, weather, actions } = useFieldData();
  const [params, setParams] = useSearchParams();
  const narrow = useNarrow();
  const mapApi = useRef(null);
  const panelRef = useRef(null);
  const pickedOnMap = useRef(false);

  const fields = farm.fields;
  const wanted = params.get("field");
  const selected = fields.find((field) => field.id === wanted) || fields[0];
  const index = fields.indexOf(selected);
  const analysis = analyses[selected?.id] || null;

  const select = (id) => {
    if (!id || id === params.get("field")) return;
    const next = new URLSearchParams(params);
    next.set("field", id);
    setParams(next, { replace: true });
  };
  const step = (by) => select(fields[(index + by + fields.length) % fields.length]?.id);

  // A field picked on the map is already in view; on a phone, show its
  // details (they are below the map).
  const selectOnMap = (id) => {
    pickedOnMap.current = id !== selected?.id;
    select(id);
    if (narrow) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  // An unknown ?field= id becomes the first field's, so the address
  // always names the field shown.
  const unknown = Boolean(wanted) && fields.length > 0 && !fields.some((field) => field.id === wanted);
  useEffect(() => {
    if (!unknown || !fields[0]) return;
    const next = new URLSearchParams(params);
    next.set("field", fields[0].id);
    setParams(next, { replace: true });
  }, [unknown, fields, params, setParams]);

  // A field picked with the arrows or a link: bring it into view if it is
  // off screen, without zooming in (zooming out if it does not fit).
  // Only a change of field does this (not a refresh of the same field).
  const selectedId = selected?.id;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    if (pickedOnMap.current) {
      pickedOnMap.current = false;
      return;
    }
    const map = mapApi.current?.getMap?.();
    const bounds = selectedRef.current && fieldsBounds([selectedRef.current]);
    if (!map || !bounds?.isValid()) return;
    if (map.getBounds().contains(bounds)) return;
    map.flyToBounds(bounds, { padding: [56, 56], maxZoom: map.getZoom(), duration: 0.6 });
  }, [selectedId]);

  // The newest clear satellite pass over any of the fields.
  const latestPass = useMemo(
    () =>
      Object.values(analyses)
        .map((item) => item?.latestPass?.date)
        .filter(Boolean)
        .sort()
        .pop() || null,
    [analyses],
  );
  // "Sample" follows the readings shown, not the current data source.
  const shown = Object.values(analyses).filter(Boolean);
  const sample = shown.length ? shown.some((item) => item.provider !== "gee") : provider?.id === "sample";
  const fitKey = `${farm.id}:${fields.map((field) => field.id).join(",")}`;

  return (
    <div className="page-full fp">
      <section className="fp-map" aria-label="Farm map">
        <FieldMap
          ref={mapApi}
          fields={fields}
          analyses={analyses}
          selectedId={selectedId}
          onSelect={selectOnMap}
          fitKey={fitKey}
          fitPadding={FIT_PADDING}
          height="100%"
          ariaLabel={`Map of ${farm.name}`}
        >
          <div className="fp-map-top">
            {latestPass && (
              <span className="fm-chip fp-pass" title={`Latest clear satellite pass: ${formatDay(latestPass)}${sample ? " (sample data)" : " (Sentinel-2)"}`}>
                <span>
                  {formatDay(latestPass)}
                  <span className="fp-pass-long">{sample ? " · Sample data" : " · Sentinel-2"}</span>
                  {sample && <span className="fp-pass-short"> · Sample</span>}
                </span>
              </span>
            )}
          </div>
          <div className="fp-map-legend">
            <ConditionLegend compact={narrow} />
          </div>
        </FieldMap>
      </section>

      <aside ref={panelRef} className="fp-panel" aria-label={selected ? `${selected.name} details` : "Field details"}>
        {selected && (
          <FieldPanel
            key={selected.id}
            field={selected}
            analysis={analysis}
            units={farm.units}
            weather={weather}
            job={job}
            count={fields.length}
            onStep={step}
            onAnalyze={() => actions.analyze([selected.id])}
          />
        )}
      </aside>
    </div>
  );
}

// ---------- The selected field ----------

// "War damage on 12 ha" inside a known war (src/config/conflicts.js),
// "Damage on 12 ha" anywhere else (unusual fire or ground disturbance
// against the normal years, from any cause).
function damageLine(damage, conflict, units) {
  const what = conflict ? "War damage" : "Damage";
  return Number.isFinite(damage?.damagedHa) && damage.damagedHa > 0 ? `${what} on ${formatArea(damage.damagedHa, units)}` : `${what} found`;
}

function FieldPanel({ field, analysis, units, weather, job, count, onStep, onAnalyze }) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const tiles = panelTiles(analysis, { units, weather });
  const status = analysis?.status;
  const damage = analysis?.damage;
  const analysing = job?.kind !== "field-detect";
  const running = job?.status === "running" && analysing;
  const failed = job?.status === "error" && analysing ? job.error : null;
  const meta = [field.crop, formatArea(field.areaHa, units)].filter(Boolean).join(" · ");

  const analyse = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await onAnalyze();
    } catch (err) {
      setStartError(err);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="fp-field">
      <header className="fp-head">
        <div className="fp-title-row">
          <h1 className="fp-name">{field.name}</h1>
          {count > 1 && (
            <div className="fp-steps">
              <button type="button" className="fp-step" aria-label="Previous field" title="Previous field" onClick={() => onStep(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button type="button" className="fp-step" aria-label="Next field" title="Next field" onClick={() => onStep(1)}>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
        <div className="fp-meta">
          {status && <Badge tone={status.tone || "outline"}>{status.label}</Badge>}
          <span>{meta}</span>
        </div>
        {damage?.detected && (
          <p className="fp-damage">
            <ShieldAlert size={15} aria-hidden="true" />
            {damageLine(damage, analysis?.conflict, units)}
          </p>
        )}
      </header>

      {analysis ? (
        <>
          <div className="fp-tiles">
            {tiles.map((tile) => (
              <MetricTile key={tile.id} {...tile} size="lg" />
            ))}
          </div>
          <SeasonChart season={analysis.season} normalCurve={analysis.normalCurve} />
        </>
      ) : running ? (
        <div className="fp-empty">
          <FieldProgress job={job} compact />
        </div>
      ) : (
        <div className="fp-empty">
          <p className="fp-empty-title">Not analysed yet</p>
          {(startError || failed) && <p className="fp-error">{startError?.message || failed}</p>}
          <Button variant="secondary" onClick={analyse} disabled={starting}>
            {starting ? "Starting…" : "Analyse now"}
          </Button>
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        block
        className="fp-ask"
        icon={<MessageSquare size={17} />}
        to={`/field/ai?about=${encodeURIComponent(field.id)}`}
      >
        {`Ask AI about ${field.name}`}
      </Button>
    </div>
  );
}

// ---------- Plant health this season vs normal ----------

const DAY_MS = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_H = 150;
const PAD = { top: 12, right: 14, bottom: 22, left: 30 };

const toTime = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);

// "Normal 0.26–0.29", or "Normal 0.22" when both ends print the same.
function normalText(low, high) {
  const a = formatIndex(low);
  const b = formatIndex(high);
  return a === b ? `Normal ${a}` : `Normal ${a}–${b}`;
}

// The baseline normal (given as "MM-DD" days) laid out on the real dates
// the chart covers, so it can be drawn and read at any date.
function normalOnDates(normalCurve, from, to) {
  if (!normalCurve?.length) return [];
  const out = [];
  const first = new Date(from).getUTCFullYear() - 1;
  const last = new Date(to).getUTCFullYear() + 1;
  for (let year = first; year <= last; year += 1) {
    for (const point of normalCurve) {
      if (![point.low, point.high, point.median].every(Number.isFinite)) continue;
      const time = toTime(`${year}-${point.day}`);
      if (Number.isFinite(time)) out.push({ time, low: point.low, high: point.high, median: point.median });
    }
  }
  out.sort((a, b) => a.time - b.time);
  // Keep one point either side of the chart so the band reaches its edges.
  const start = Math.max(0, out.findIndex((p) => p.time >= from) - 1);
  let end = out.findIndex((p) => p.time > to);
  end = end === -1 ? out.length : end + 1;
  return out.slice(start, end);
}

function normalAt(normal, time) {
  if (!normal.length) return null;
  const after = normal.findIndex((p) => p.time >= time);
  if (after <= 0) return normal[Math.max(0, after)] || normal[normal.length - 1];
  const a = normal[after - 1];
  const b = normal[after];
  const t = (time - a.time) / (b.time - a.time || 1);
  const mix = (key) => a[key] + (b[key] - a[key]) * t;
  return { time, low: mix("low"), high: mix("high"), median: mix("median") };
}

function SeasonChart({ season, normalCurve }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(340);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, Math.round(entry.contentRect.width))));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(
    () => (season || []).filter((p) => p?.date && Number.isFinite(p.ndvi)).map((p) => ({ ...p, time: toTime(p.date) })).sort((a, b) => a.time - b.time),
    [season],
  );

  const chart = useMemo(() => {
    if (!points.length) return null;
    const from = points[0].time;
    const to = Math.max(points[points.length - 1].time, from + 30 * DAY_MS);
    const normal = normalOnDates(normalCurve, from, to);
    const values = [...points.map((p) => p.ndvi), ...normal.filter((p) => p.time >= from && p.time <= to).flatMap((p) => [p.low, p.high])];
    let low = Math.floor((Math.min(...values) - 0.04) * 10) / 10;
    let high = Math.ceil((Math.max(...values) + 0.04) * 10) / 10;
    low = Math.max(-0.2, low);
    high = Math.min(1, Math.max(high, low + 0.2));
    const innerW = width - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top - PAD.bottom;
    const x = (time) => PAD.left + ((time - from) / (to - from)) * innerW;
    const y = (value) => PAD.top + (1 - (value - low) / (high - low)) * innerH;
    const clampX = (time) => Math.min(to, Math.max(from, time));

    // The band: the normal range, clipped to the chart's dates.
    const inside = normal.length > 1 ? [normalAt(normal, from), ...normal.filter((p) => p.time > from && p.time < to), normalAt(normal, to)] : [];
    const band = inside.length
      ? `M${inside.map((p) => `${x(clampX(p.time)).toFixed(1)},${y(p.high).toFixed(1)}`).join("L")}L${[...inside]
          .reverse()
          .map((p) => `${x(clampX(p.time)).toFixed(1)},${y(p.low).toFixed(1)}`)
          .join("L")}Z`
      : null;
    const median = inside.length ? `M${inside.map((p) => `${x(clampX(p.time)).toFixed(1)},${y(p.median).toFixed(1)}`).join("L")}` : null;
    const line = `M${points.map((p) => `${x(p.time).toFixed(1)},${y(p.ndvi).toFixed(1)}`).join("L")}`;

    // A grid line every 0.2 (or 0.1 on a narrow range).
    const stepY = high - low > 0.5 ? 0.2 : 0.1;
    const ticksY = [];
    for (let v = Math.ceil(low / stepY) * stepY; v <= high + 1e-9; v += stepY) ticksY.push(Math.round(v * 100) / 100);

    // A month name at the start of each month (every other one when tight).
    const months = [];
    const d = new Date(from);
    let cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0), 1);
    while (cursor <= to) {
      months.push(cursor);
      const c = new Date(cursor);
      cursor = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
    }
    const every = months.length * 34 > innerW ? 2 : 1;
    const ticksX = months.filter((_, i) => i % every === 0);

    return { from, to, normal, x, y, band, median, line, ticksY, ticksX, innerW };
  }, [points, normalCurve, width]);

  const last = points[points.length - 1];
  const lastNormal = chart && last ? normalAt(chart.normal, last.time) : null;
  const label = last
    ? `Plant health this season. Latest ${formatIndex(last.ndvi)} on ${formatDay(last.date)}${lastNormal ? `, ${normalText(lastNormal.low, lastNormal.high).toLowerCase()}` : ""}.`
    : "No clear satellite passes yet this season.";

  const onMove = (event) => {
    if (!chart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    let best = points[0];
    for (const p of points) if (Math.abs(chart.x(p.time) - px) < Math.abs(chart.x(best.time) - px)) best = p;
    setHover(best);
  };

  const hoverNormal = chart && hover ? normalAt(chart.normal, hover.time) : null;

  return (
    <section className="fp-chart" aria-label="Plant health this season vs normal">
      <div className="fp-chart-head">
        <h2>Plant health this season</h2>
        <div className="fp-chart-key" aria-hidden="true">
          <span className="fp-key">
            <span className="fp-key-line" />
            This season
          </span>
          <span className="fp-key">
            <span className="fp-key-band" />
            {`Normal ${BASELINE.from}–${String(BASELINE.to).slice(2)}`}
          </span>
        </div>
      </div>
      <div ref={boxRef} className="fp-chart-box">
        {chart ? (
          <>
            <svg
              width={width}
              height={CHART_H}
              viewBox={`0 0 ${width} ${CHART_H}`}
              role="img"
              aria-label={label}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              {chart.ticksY.map((v) => (
                <g key={v}>
                  <line className="fp-grid" x1={PAD.left} x2={width - PAD.right} y1={chart.y(v)} y2={chart.y(v)} />
                  <text className="fp-axis" x={PAD.left - 6} y={chart.y(v) + 3.5} textAnchor="end">
                    {formatIndex(v, 1)}
                  </text>
                </g>
              ))}
              {chart.ticksX.map((t) => (
                <text key={t} className="fp-axis" x={chart.x(t)} y={CHART_H - 6} textAnchor="middle">
                  {MONTHS[new Date(t).getUTCMonth()]}
                </text>
              ))}
              {chart.band && <path className="fp-band" d={chart.band} />}
              {chart.median && <path className="fp-median" d={chart.median} />}
              <path className="fp-line" d={chart.line} />
              {hover && (
                <>
                  <line className="fp-cross" x1={chart.x(hover.time)} x2={chart.x(hover.time)} y1={PAD.top} y2={CHART_H - PAD.bottom} />
                  <circle className="fp-dot" cx={chart.x(hover.time)} cy={chart.y(hover.ndvi)} r={4.5} />
                </>
              )}
              {!hover && last && <circle className="fp-dot" cx={chart.x(last.time)} cy={chart.y(last.ndvi)} r={4.5} />}
              <rect x={PAD.left} y={0} width={chart.innerW} height={CHART_H} fill="transparent" />
            </svg>
            {hover && (
              <div className="fp-tip" style={{ left: `${Math.min(Math.max(chart.x(hover.time), 70), width - 70)}px` }} aria-hidden="true">
                <strong>{formatIndex(hover.ndvi)}</strong>
                <span>{formatDay(hover.date)}</span>
                {hoverNormal && <span className="fp-tip-normal">{normalText(hoverNormal.low, hoverNormal.high)}</span>}
              </div>
            )}
          </>
        ) : (
          <p className="fp-chart-empty">No clear satellite passes yet this season.</p>
        )}
      </div>
    </section>
  );
}

export default function FieldsPage() {
  return (
    <FarmGate>
      <FieldsView />
    </FarmGate>
  );
}
