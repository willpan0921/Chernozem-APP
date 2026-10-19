// WHAT THIS FILE DOES
// The Atlas "Data" page (/atlas/data): the history of the current area,
// month by month.
//   1. Trends   the latest value and its change since the month before, a
//               bar chart of one measure per month (hover a bar, or tap it
//               on a phone, for the numbers) and the table of every
//               analyzed month. Clicking a bar (tapping twice on a phone)
//               or a row opens that month on the Overview.
//   2. Compare  pick two months: what changed, and the squares that changed
//               most (click one to see it on the map). The two months are
//               kept in the address (?from=&to=) so a link can be shared.
//   3. How we know it works   the research checks (src/config/research.js):
//                             results of the published research in Ukraine,
//                             labelled as research, not as this area.
//
// Everything comes from the server through useAtlasData() and
// compareRuns() in src/api/atlasApi.js, so it works the same on sample data
// and on Google Earth Engine.
//
// WHO EDITS IT
// Whoever changes how the Data page looks or behaves. The styling is in
// DataPage.css next to this file (every class starts with "dp-").

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, ArrowDownRight, ArrowUpRight, ChevronRight, ExternalLink, Info, TriangleAlert } from "lucide-react";
import { PageHeader, Card, Badge, Button, Segmented } from "../../components/ui/index.js";
import { AtlasGate, AnalysisProgress, useAtlasData } from "../../state/AtlasData.jsx";
import { compareRuns } from "../../api/atlasApi.js";
import { placeLabel } from "../../lib/atlas/hotspots.js";
import { validation, citation } from "../../config/research.js";
import { formatCount, formatHaShort, formatSigned } from "../../lib/format.js";
import { runsComparable } from "../../lib/atlas/method.js";
import { shownNewDamage, sourceBadge } from "../../lib/atlas/overview.js";
import "./DataPage.css";

// The measures the chart can show. "get" reads the number from a month.
const MEASURES = [
  { value: "heavy", label: "Heavily damaged", unit: "ha", get: (run) => run.totals?.heavyDamageHa, text: haText, change: signedShortHa, none: "No heavy damage in these months" },
  { value: "new", label: "New damage", unit: "ha", get: (run) => run.newHeavyDamageHa, text: haText, change: signedShortHa, none: "No new damage in these months" },
  { value: "people", label: "People", unit: "people", get: (run) => run.totals?.peopleOnDamagedSoil, text: formatCount, change: signedCount, none: "No people on damaged land in these months" },
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09" -> { month: "Sep", year: "2026" }
function splitMonth(month) {
  const [year, m] = String(month).split("-");
  return { month: SHORT_MONTHS[Number(m) - 1] || month, year };
}

// "Sep 2026" from "2026-09".
function shortLabel(run) {
  const { month, year } = splitMonth(run.month);
  return `${month} ${year}`;
}

// Hectares with three significant digits, so close months still differ:
// 1030026 -> "1.03M ha", 940576 -> "941k ha", 27287 -> "27.3k ha".
function haText(hectares) {
  if (!Number.isFinite(hectares)) return "–";
  const abs = Math.abs(hectares);
  const sig = (value) => String(Number(value.toPrecision(3)));
  if (abs >= 1e6) return `${sig(hectares / 1e6)}M ha`;
  if (abs >= 1e4) return `${sig(hectares / 1e3)}k ha`;
  if (abs >= 10 || hectares === 0) return formatHaShort(hectares);
  // Farms: small numbers keep their decimals ("2.4 ha", "0.06 ha").
  return `${sig(hectares)} ha`;
}

// A change in hectares with its sign: "+11,025 ha", "+2.4 ha", "−0.04 ha".
function signedHa(hectares) {
  if (!Number.isFinite(hectares)) return "–";
  const abs = Math.abs(hectares);
  if (abs >= 10) return formatSigned(hectares, " ha");
  const sign = hectares > 0 ? "+" : hectares < 0 ? "−" : "";
  return `${sign}${Number(abs.toFixed(abs >= 1 ? 1 : 2))} ha`;
}

// A short change with its sign, for the line above the chart:
// "−20.5k ha", "+1.2M ha", "+2.4 ha".
function signedShortHa(hectares) {
  if (!Number.isFinite(hectares)) return "–";
  const sign = hectares > 0 ? "+" : hectares < 0 ? "−" : "";
  return `${sign}${haText(Math.abs(hectares))}`;
}

// A change in people with its sign: "+1,204", "−35".
function signedCount(value) {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${formatCount(Math.abs(value))}`;
}

// An axis label: "1.5M", "500k", "20", or "0.5" for small numbers.
function tickText(value, step) {
  if (step >= 1) return formatCount(value);
  const digits = Math.min(3, Math.max(0, -Math.floor(Math.log10(step))));
  return String(Number(value.toFixed(digits)));
}

function sourceName(provider) {
  return provider === "gee" ? "Earth Engine" : "Sample";
}

function DataArchive() {
  const { area, runs, job } = useAtlasData();
  const running = job?.status === "running" && job.areaId === area.id;
  const months = runs.length;
  // The latest month's source, and how many earlier months came from the other.
  const badge = sourceBadge(runs);

  return (
    <div className="page dp">
      <PageHeader
        title={area.name}
        subtitle={
          <span className="dp-meta">
            Data · {months} {months === 1 ? "month" : "months"}
            {badge && <Badge tone={badge.tone || undefined}>{badge.text}</Badge>}
          </span>
        }
      />

      {running && (
        <div className="card dp-progress">
          <AnalysisProgress job={job} compact />
        </div>
      )}

      <TrendsCard />

      <div className="dp-row">
        <CompareCard />
        <ValidationCard />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Trends: the chart and the month table
// ---------------------------------------------------------------------------

function TrendsCard() {
  const navigate = useNavigate();
  const { area, runs, job, actions } = useAtlasData();
  const [measure, setMeasure] = useState("heavy");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  // Opens a month on the Overview.
  const openMonth = (runId) => {
    actions.selectRun(runId);
    navigate("/atlas");
  };

  const running = job?.status === "running" && job.areaId === area.id;
  const analyze = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await actions.analyzeArea(area.id, { months: 12 });
    } catch (error) {
      setStartError(error);
    } finally {
      setStarting(false);
    }
  };

  // New damage is hidden for a month whose month before is not comparable
  // (another data source, method or grid: method.js runsComparable).
  const shown = useMemo(() => runs.map((run) => (shownNewDamage(run, runs) === run.newHeavyDamageHa ? run : { ...run, newHeavyDamageHa: null })), [runs]);
  const enough = shown.length >= 2;
  // Oldest month on the left.
  const chronological = useMemo(() => [...shown].reverse(), [shown]);
  const active = MEASURES.find((item) => item.value === measure);

  return (
    <Card
      title="Trends"
      className="dp-trends"
      actions={enough && <Segmented options={MEASURES} value={measure} onChange={setMeasure} ariaLabel="Measure" />}
    >
      {enough ? (
        <TrendChart runs={chronological} measure={active} onOpen={openMonth} />
      ) : (
        <div className="dp-empty">
          <p>Trends appear once two or more months are analyzed.</p>
          {!running && (
            <Button variant="primary" onClick={analyze} disabled={starting}>
              {starting ? "Starting…" : "Analyze 12 months"}
            </Button>
          )}
          {startError && <p className="dp-error">{startError.message}</p>}
        </div>
      )}

      <MonthTable runs={shown} onOpen={openMonth} />
    </Card>
  );
}

// One month's value and how much it moved since the month before:
// "Sep 2026  1.03M ha  ↓ −20.5k ha vs Aug 2026". A rise is red, a fall green.
// Shows the latest month, or the month tapped on a phone (with an
// "Open month" button).
// Months from another data source, method or grid are not compared:
// "Not comparable with Aug 2026: different data source".
function MonthChange({ run, previous, measure, onOpen }) {
  const now = measure.get(run);
  const check = previous ? runsComparable(previous, run) : { comparable: true };
  const before = previous && check.comparable ? measure.get(previous) : undefined;
  const change = Number.isFinite(now) && Number.isFinite(before) ? now - before : null;
  const tone = change == null || Math.abs(change) < 0.005 ? "flat" : change > 0 ? "worse" : "better";
  return (
    <div className="dp-latest">
      <span className="dp-latest-month">{shortLabel(run)}</span>
      <span className="dp-latest-value">{Number.isFinite(now) ? measure.text(now) : "–"}</span>
      {!check.comparable && (
        <span className="dp-latest-change is-flat">
          Not comparable with {shortLabel(previous)}: {check.why}
        </span>
      )}
      {change != null && (
        <span className={`dp-latest-change is-${tone}`}>
          {tone === "worse" ? <ArrowUpRight size={14} aria-hidden="true" /> : tone === "better" ? <ArrowDownRight size={14} aria-hidden="true" /> : null}
          {tone === "flat" ? "No change" : measure.change(change)} vs {shortLabel(previous)}
        </span>
      )}
      {onOpen && (
        <button type="button" className="dp-latest-open" onClick={() => onOpen(run.id)}>
          Open month <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Nice round steps for the axis: 1, 2, 2.5 or 5 times a power of ten.
function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  const factor = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return factor * power;
}

// Keeps track of an element's width so the chart can draw in real pixels
// (sharp text at every screen size).
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

// A bar shape with rounded top corners, sitting on the baseline.
function barPath(x, y, w, h, radius = 4) {
  const r = Math.max(0, Math.min(radius, w / 2, h));
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function TrendChart({ runs, measure, onOpen }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null); // index of the month under the mouse (or keyboard focus)
  // On a touch screen there is no hover: the first tap on a month picks it
  // and shows its numbers, a second tap (or "Open month") opens it.
  const [picked, setPicked] = useState(null);
  const pointerType = useRef("mouse");

  // A tap anywhere outside the chart closes the picked month.
  useEffect(() => {
    if (picked == null) return undefined;
    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setPicked(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [picked, wrapRef]);

  // A new month list or measure starts with nothing picked.
  useEffect(() => setPicked(null), [runs, measure]);

  const tapMonth = (index) => {
    if (pointerType.current === "mouse") {
      onOpen(runs[index].id);
    } else if (picked === index) {
      onOpen(runs[index].id);
    } else {
      setPicked(index);
    }
  };

  const height = 220;
  const pad = { top: 22, right: 4, bottom: 38, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  const values = runs.map((run) => measure.get(run));
  const max = Math.max(0, ...values.filter(Number.isFinite));
  const empty = max === 0;
  const step = empty ? 1 : niceStep(max / 3);
  const top = max > 0 ? Math.ceil(max / step) * step : 1;
  const ticks = [];
  // Only the baseline when every month is zero.
  for (let i = 0; i * step <= top + step / 2 && !empty; i += 1) ticks.push(i * step);
  if (empty) ticks.push(0);

  const slot = runs.length ? plotW / runs.length : 0;
  const barW = Math.max(4, Math.min(44, slot * 0.62));
  const y = (value) => pad.top + plotH - (value / top) * plotH;
  // On narrow screens only every other month gets a name under it.
  const labelEvery = slot < 34 ? 2 : 1;
  const last = runs.length - 1;
  // The first month and every January also show the year.
  const forced = (index) => index >= 0 && index <= last && (index === 0 || splitMonth(runs[index].month).month === "Jan");

  // On a phone a floating box would cover the bars, so the line above the
  // chart follows the month instead. With a mouse, a box beside the column
  // shows all three numbers.
  const narrow = width < 520;
  // The month that is highlighted: the tapped one, else the hovered one.
  const shownIndex = picked ?? hover;
  // The month in the line above the chart.
  const summaryIndex = picked ?? (narrow ? hover : null) ?? last;
  const tipIndex = !narrow && picked == null ? hover : null;
  const hovered = tipIndex != null ? runs[tipIndex] : null;
  const tipX = tipIndex != null ? pad.left + slot * tipIndex + slot / 2 : 0;
  // The tooltip sits beside the column, on the side with more room.
  const tipLeft = tipIndex != null && tipX > width / 2;

  return (
    <div
      className="dp-trend"
      ref={wrapRef}
      onPointerLeave={(event) => event.pointerType === "mouse" && setHover(null)}
    >
      <MonthChange
        run={runs[summaryIndex]}
        previous={runs[summaryIndex - 1]}
        measure={measure}
        onOpen={picked != null ? onOpen : null}
      />
      <div className="dp-chart">
        {width > 0 && (
          // role="group" (not "img") so screen readers still reach the month buttons inside.
          <svg width={width} height={height} role="group" aria-label={`${measure.label} by month`}>
            {/* The unit, above the axis numbers. */}
            <text x={pad.left - 8} y={10} textAnchor="end" className="dp-unit">
              {measure.unit}
            </text>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "dp-axis" : "dp-grid"} />
                <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="dp-tick">
                  {tickText(tick, step)}
                </text>
              </g>
            ))}

            {runs.map((run, index) => {
              const value = values[index];
              const cx = pad.left + slot * index + slot / 2;
              const { month, year } = splitMonth(run.month);
              const showYear = forced(index);
              // Every month (or every other one when narrow), never squeezed
              // next to a month that carries its year.
              const crowded = labelEvery > 1 && (forced(index - 1) || forced(index + 1));
              const showMonth = showYear || ((last - index) % labelEvery === 0 && !crowded);
              const has = Number.isFinite(value);
              const barTop = has ? y(value) : y(0);
              const dim = shownIndex != null && shownIndex !== index;
              return (
                <g key={run.id}>
                  {shownIndex === index && <rect x={pad.left + slot * index} y={pad.top} width={slot} height={plotH} rx={4} className="dp-col" />}
                  {has && value > 0 && (
                    <path
                      d={barPath(cx - barW / 2, barTop, barW, y(0) - barTop)}
                      className={`dp-bar dp-bar-${measure.value}${dim ? " is-dim" : ""}`}
                    />
                  )}
                  {showMonth && (
                    <text x={cx} y={height - pad.bottom + 16} textAnchor="middle" className={shownIndex === index ? "dp-month is-on" : "dp-month"}>
                      {month}
                    </text>
                  )}
                  {showYear && (
                    <text x={cx} y={height - pad.bottom + 30} textAnchor="middle" className="dp-year">
                      {year}
                    </text>
                  )}
                  {/* The invisible hover and click target: the whole column. */}
                  <rect
                    x={pad.left + slot * index}
                    y={pad.top}
                    width={slot}
                    height={plotH}
                    className="dp-hit"
                    tabIndex={0}
                    role="button"
                    aria-label={`${run.label}: ${measure.label} ${has ? measure.text(value) : "no data"}. Open on Overview`}
                    onPointerDown={(event) => {
                      pointerType.current = event.pointerType || "mouse";
                    }}
                    onPointerEnter={(event) => event.pointerType === "mouse" && setHover(index)}
                    onFocus={() => setHover(index)}
                    onBlur={() => setHover(null)}
                    onClick={() => tapMonth(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(run.id);
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {width > 0 && empty && <p className="dp-chart-empty">{measure.none}</p>}

        {hovered && (
          <div
            className={tipLeft ? "dp-tip is-left" : "dp-tip"}
            style={{ left: tipLeft ? tipX - slot / 2 - 6 : tipX + slot / 2 + 6, top: pad.top }}
            role="tooltip"
          >
            <span className="dp-tip-title">{hovered.label}</span>
            {MEASURES.map((item) => (
              <span key={item.value} className={item.value === measure.value ? "dp-tip-row is-on" : "dp-tip-row"}>
                <span>{item.label}</span>
                <span className="dp-tip-num">{Number.isFinite(item.get(hovered)) ? item.text(item.get(hovered)) : "–"}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// How many months the table shows before "Show all".
const TABLE_ROWS = 6;

// Text that is shortened on a phone.
function Fit({ full, short }) {
  return (
    <>
      <span className="dp-full">{full}</span>
      <span className="dp-short">
        {short}
      </span>
    </>
  );
}

function MonthTable({ runs, onOpen }) {
  const { runSummary } = useAtlasData();
  const [all, setAll] = useState(false);
  const rows = all ? runs : runs.slice(0, TABLE_ROWS);
  return (
    <div className="dp-table-block">
      <div className="table-wrap dp-table-wrap">
        <table className="table dp-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="dp-r">
                <Fit full="Heavily damaged" short="Heavy" />
              </th>
              <th className="dp-r">
                <Fit full="New damage" short="New" />
              </th>
              <th className="dp-r dp-wide">Black-soil cropland</th>
              <th className="dp-r">People</th>
              <th className="dp-wide">Source</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => {
              const warnings = run.checks && run.checks.passed < run.checks.total;
              return (
                <tr
                  key={run.id}
                  className={run.id === runSummary?.id ? "dp-tr is-shown" : "dp-tr"}
                  aria-current={run.id === runSummary?.id || undefined}
                  tabIndex={0}
                  aria-label={`Open ${run.label} on Overview`}
                  onClick={() => onOpen(run.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(run.id);
                    }
                  }}
                >
                  <td className="dp-td-month">
                    <Fit full={run.label} short={shortLabel(run)} />
                  </td>
                  <td className="num">{haText(run.totals?.heavyDamageHa)}</td>
                  <td className="num">{run.newHeavyDamageHa == null ? "–" : haText(run.newHeavyDamageHa)}</td>
                  <td className="num dp-wide">{haText(run.totals?.blackSoilHa)}</td>
                  <td className="num">{formatCount(run.totals?.peopleOnDamagedSoil)}</td>
                  <td className="dp-wide">
                    <span className="dp-source">
                      {sourceName(run.provider)}
                      {warnings && (
                        <span className="dp-warn" title={run.checks.warnings.join(" ")} aria-label={`${run.checks.total - run.checks.passed} checks failed`}>
                          <TriangleAlert size={13} />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="dp-go">
                    <ChevronRight size={14} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {runs.length > TABLE_ROWS && (
        <button type="button" className="link-arrow dp-more" onClick={() => setAll((prev) => !prev)}>
          {all ? "Show fewer" : `Show all ${runs.length} months`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Compare two months
// ---------------------------------------------------------------------------

// What the four change tiles show. "worseUp" = a rise is bad news (red).
const DELTAS = [
  { key: "heavyDamageHa", label: "Heavily damaged", text: signedHa, short: haText, worseUp: true },
  { key: "peopleOnDamagedSoil", label: "People on damaged land", text: (v) => formatSigned(v), short: formatCount, worseUp: true },
  { key: "blackSoilHa", label: "Black-soil cropland", text: signedHa, short: haText, worseUp: false },
  { key: "croplandHa", label: "Cropland", text: signedHa, short: haText, worseUp: false },
];

// Why two months cannot be compared, after "Sep 2026 and Aug 2026 ...".
const NOT_COMPARABLE_NOTES = {
  source: "come from different data sources (Earth Engine and sample data), so their difference says nothing about the land. Analyze both months with the same source.",
  method: "were analyzed with different versions of the method, so their difference says nothing about the land. Analyze the older month again to compare.",
  grid: "were analyzed on different squares, so they cannot be compared square by square.",
};

const CHANGE_LIMIT = 8;
// Squares that moved by less than this are left out of "Biggest changes",
// so the list never shows changes the totals above round away.
const MIN_CHANGE_HA = 0.05;

function CompareCard() {
  const navigate = useNavigate();
  const { runs, actions } = useAtlasData();
  // The two months are kept in the address (?from=&to=), so a comparison
  // survives a reload and can be shared as a link.
  const [params, setParams] = useSearchParams();
  const picked = { from: params.get("from"), to: params.get("to") };
  const setPicked = (next) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        for (const name of ["from", "to"]) {
          if (next[name]) updated.set(name, next[name]);
          else updated.delete(name);
        }
        return updated;
      },
      { replace: true }
    );
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const [showAll, setShowAll] = useState(false);

  const enough = runs.length >= 2;
  // Defaults: the month before the latest, against the latest.
  const from = runs.find((item) => item.id === picked.from) || runs[1] || null;
  const to = runs.find((item) => item.id === picked.to) || runs[0] || null;
  const same = from && to && from.id === to.id;
  // Months from another data source, method or grid: no differences.
  const check = from && to && !same ? runsComparable(from, to) : { comparable: true };
  const key = enough && !same && check.comparable ? `${from.id}@${from.createdAt}|${to.id}@${to.createdAt}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    compareRuns(from.id, to.id).then(
      (data) => !cancelled && setResult({ key, data, error: null }),
      (error) => !cancelled && setResult({ key, data: null, error })
    );
    return () => {
      cancelled = true;
    };
    // from.id and to.id are part of key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => setShowAll(false), [key]);

  const loading = key && result.key !== key;
  const data = result.data;
  const error = !loading && result.key === key ? result.error : null;

  const options = runs.map((item) => (
    <option key={item.id} value={item.id}>
      {shortLabel(item)}
    </option>
  ));

  const openOnMap = (cellId) => {
    actions.selectRun(to.id);
    navigate(`/atlas/map?focus=${encodeURIComponent(cellId)}`);
  };

  const changes = (data?.changedCells || []).filter((item) => Math.abs(item.delta) >= MIN_CHANGE_HA);
  const maxChange = Math.max(1e-9, ...changes.map((item) => Math.abs(item.delta)));
  const shown = showAll ? changes : changes.slice(0, CHANGE_LIMIT);
  const cellSize = to?.cellSizeDeg;

  return (
    <Card title="Compare" className="dp-compare">
      <div className="dp-pickers">
        <label className="dp-picker">
          <span>From</span>
          <select
            className="select"
            value={from?.id || ""}
            disabled={!enough}
            onChange={(event) => setPicked({ from: event.target.value, to: to?.id || null })}
          >
            {options}
          </select>
        </label>
        <Button
          className="dp-swap"
          icon={<ArrowLeftRight size={14} />}
          aria-label="Swap months"
          title="Swap months"
          disabled={!enough}
          onClick={() => setPicked({ from: to?.id || null, to: from?.id || null })}
        />
        <label className="dp-picker">
          <span>To</span>
          <select
            className="select"
            value={to?.id || ""}
            disabled={!enough}
            onChange={(event) => setPicked({ to: event.target.value, from: from?.id || null })}
          >
            {options}
          </select>
        </label>
      </div>

      {!enough && <p className="dp-note">Compare needs at least two analyzed months.</p>}
      {enough && same && <p className="dp-note">Pick two different months.</p>}
      {enough && !same && !check.comparable && (
        <p className="dp-note dp-not-comparable" role="status">
          <strong>{check.text}.</strong> {shortLabel(from)} and {shortLabel(to)} {NOT_COMPARABLE_NOTES[check.reason]}
        </p>
      )}
      {error && (
        <p className="dp-error" role="alert">
          {error.message}
        </p>
      )}

      {key && data && (
        <div className={loading ? "dp-compare-body is-loading" : "dp-compare-body"} aria-busy={loading || undefined}>
          <div className="dp-deltas">
            {DELTAS.map((item) => {
              // A missing comparison (a total one of the months lacks) is
              // shown as "–", never as "No change".
              const raw = data.deltas?.[item.key];
              const missing = !Number.isFinite(raw);
              const delta = missing ? null : raw;
              const tone = missing || delta === 0 ? "flat" : delta > 0 === item.worseUp ? "worse" : "better";
              // Totals come rounded to whole hectares; on a small farm a real
              // change can round to 0 while single squares still moved.
              const tiny = delta === 0 && item.key === "heavyDamageHa" && changes.length > 0;
              return (
                <div key={item.key} className={`dp-delta is-${tone}`}>
                  <span className="dp-delta-label">{item.label}</span>
                  <span className="dp-delta-value">{missing ? "–" : tiny ? "Under 1 ha" : delta === 0 ? "No change" : item.text(delta)}</span>
                  <span className="dp-delta-range">
                    {missing || delta === 0
                      ? item.short(data.b?.totals?.[item.key])
                      : `${item.short(data.a?.totals?.[item.key])} → ${item.short(data.b?.totals?.[item.key])}`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="dp-changes">
            <h3>Biggest changes</h3>
            {changes.length === 0 ? (
              <p className="dp-note">No square changed between these months.</p>
            ) : (
              <ol className="dp-change-list">
                {shown.map((cell) => {
                  const up = cell.delta > 0;
                  return (
                    <li key={cell.id}>
                      <button type="button" className="dp-change" onClick={() => openOnMap(cell.id)}>
                        <span className={up ? "dp-change-icon is-up" : "dp-change-icon is-down"} aria-hidden="true">
                          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        </span>
                        <span className="dp-change-text">
                          <span className="dp-change-name">{placeLabel(cell, cellSize)}</span>
                          <span className="dp-change-bar">
                            <span className={up ? "is-up" : "is-down"} style={{ width: `${Math.max(3, (Math.abs(cell.delta) / maxChange) * 100)}%` }} />
                          </span>
                        </span>
                        <span className={up ? "dp-change-num is-up" : "dp-change-num is-down"}>{signedHa(cell.delta)}</span>
                        <ChevronRight size={14} className="dp-change-go" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {changes.length > CHANGE_LIMIT && (
              <button type="button" className="link-arrow dp-more" onClick={() => setShowAll((prev) => !prev)}>
                {showAll ? `Show top ${CHANGE_LIMIT}` : `Show top ${changes.length}`}
              </button>
            )}
          </div>
        </div>
      )}

      {key && !data && loading && <div className="dp-compare-skeleton" aria-busy="true" aria-label="Loading" />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. How we know it works (fixed research results)
// ---------------------------------------------------------------------------

function ValidationCard() {
  return (
    <Card
      title={validation.title}
      className="dp-validation"
      actions={<Badge tone="outline">{validation.scope}</Badge>}
    >
      {validation.intro && <p className="dp-validation-intro">{validation.intro}</p>}
      <ul className="dp-checks">
        {validation.checks.map((check) => (
          <li key={check.text}>
            <span className="dp-check-value">{check.value}</span>
            <span className="dp-check-text">{check.text}</span>
          </li>
        ))}
      </ul>

      <div className="panel panel-amber dp-open">
        <Info size={14} aria-hidden="true" />
        <p>
          <strong>{validation.openNote.lead}</strong> {validation.openNote.text}
        </p>
      </div>

      <a className="dp-cite" href={citation.url} target="_blank" rel="noreferrer">
        {citation.text}
        <ExternalLink size={12} aria-hidden="true" />
      </a>
    </Card>
  );
}

export default function DataPage() {
  return (
    <AtlasGate>
      <DataArchive />
    </AtlasGate>
  );
}
