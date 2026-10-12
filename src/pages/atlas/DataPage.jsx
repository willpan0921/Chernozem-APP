// WHAT THIS FILE DOES
// The Atlas "Data archive" page (/atlas/data). It shows every saved run of
// the country-wide scoring: a small bar chart of new heavy damage found in
// each run, the table of saved runs with their checks, the list of data
// sources, the "How we know it works" validation numbers, and the files
// you can download for the current run, with the citation to copy.
//
// Everything written on the page comes from src/data/atlas.js. To change a
// number, a name or a sentence, edit that file, not this one.
//
// WHO EDITS IT
// Whoever changes how the Data archive page looks or behaves. The styling
// is in DataPage.css next to this file.

import { useState } from "react";
import {
  Archive,
  Check,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  FileText,
  Info,
  Layers,
  Map,
  Table,
  TriangleAlert,
} from "lucide-react";
import { PageHeader, Card, Badge, Button, ChipSelect } from "../../components/ui/index.js";
import {
  atlas,
  regions,
  dataArchive,
  runs,
  runsChart,
  runsChartMeta,
  validation,
  sources,
  atlasDownloads,
  citation,
} from "../../data/atlas.js";
import "./DataPage.css";

// The data file names download icons by their Lucide name ("Map", "Table"...).
// This maps those names to the real icon components.
const fileIcons = { Map, Table, Layers, FileText, Archive };

// The region dropdown: "All regions" first, then every region by name.
const regionOptions = [
  { value: "all", label: dataArchive.regionFilterDefault },
  ...regions.map((region) => ({ value: region.code, label: region.name })),
];

// Badge colours for the pills under a run's name. "Current" is black,
// "Used in the paper" is soft green.
const runBadgeTones = { Current: "ink", "Used in the paper": "green" };

export default function DataPage() {
  // Which region the archive is filtered to. The filter only changes the
  // chip for now; the data file has country-wide numbers only.
  const [region, setRegion] = useState("all");

  return (
    <div className="page ad-page">
      <PageHeader
        eyebrow={atlas.eyebrow}
        title={dataArchive.title}
        subtitle={dataArchive.subtitle}
        actions={
          <>
            <ChipSelect
              prefix={dataArchive.regionFilterPrefix}
              options={regionOptions}
              value={region}
              onChange={setRegion}
            />
            <Button variant="primary" icon={<Columns2 size={15} />} title="Not connected yet">
              {dataArchive.compareButton}
            </Button>
          </>
        }
      />

      {/* Two columns, two rows: the cards in each row share the same height. */}
      <div className="two-col ad-grid">
        <RunsCard />
        <ValidationCard />
        <SourcesCard />
        <DownloadsCard />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Runs": the bar chart and the table of saved runs
// ---------------------------------------------------------------------------

function RunsCard() {
  return (
    <Card title={dataArchive.runsTitle} subtitle={dataArchive.runsSubtitle}>
      <div className="panel panel-outline ad-chart-panel">
        <div className="spread">
          <span className="ad-chart-title">{runsChartMeta.title}</span>
          <span className="ad-chart-subtitle">{runsChartMeta.subtitle}</span>
        </div>
        <RunsBarChart />
      </div>

      <div className="table-wrap">
        <table className="table ad-runs-table">
          <thead>
            <tr>
              {dataArchive.columns.map((column, index) => (
                <th
                  key={column}
                  className={index === 2 || index === 4 ? "ad-th-right" : undefined}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Each cell carries its column name so that, on a phone, the
                row can be stacked and the CSS writes the name above the value. */}
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="ad-td-run">
                  <div className="ad-run-name">
                    <strong>{run.name}</strong>
                    {run.badges.length > 0 && (
                      <span className="cluster ad-run-badges">
                        {run.badges.map((badge) => (
                          <Badge key={badge} tone={runBadgeTones[badge]}>
                            {badge}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </div>
                </td>
                <td className="ad-td-detail" data-label={dataArchive.columns[1]}>
                  {run.imagesUsed}
                </td>
                <td className="num ad-td-detail" data-label={dataArchive.columns[2]}>
                  {run.heavyDamage}
                </td>
                <td className="ad-td-detail" data-label={dataArchive.columns[3]}>
                  <RunChecks checks={run.checks} />
                </td>
                <td className="ad-td-right ad-td-files">
                  <Button icon={<Download size={14} />} title="Not connected yet" aria-label={`Download ${run.name}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// The "Checks" cell: a green tick when everything passed, an amber warning
// triangle and the reason when something did not.
function RunChecks({ checks }) {
  const allPassed = checks.passed === checks.total;
  return (
    <span className="ad-checks">
      {allPassed ? (
        <Check size={14} className="ad-checks-ok" />
      ) : (
        <TriangleAlert size={14} className="ad-checks-warn" />
      )}
      <span>
        {checks.passed} of {checks.total}
      </span>
      {checks.warning && <span className="ad-checks-reason">{checks.warning}</span>}
    </span>
  );
}

// The bar chart, drawn by hand as an SVG from runsChart. One bar per run; the
// current run is drawn in the strong red and gets its value written above.
function RunsBarChart() {
  const width = 560;
  const height = 150;
  const top = 26; // room for the "22,000 ha" label above the tallest bar
  const bottom = 26; // room for the month names
  const left = 46; // room for the tick labels
  const right = 16;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const maxValue = runsChartMeta.ticks[runsChartMeta.ticks.length - 1];
  const barWidth = 30;
  const slot = plotWidth / runsChart.length;

  // Turns a hectare value into a y position on the drawing.
  const y = (value) => top + plotHeight - (value / maxValue) * plotHeight;

  return (
    <svg
      className="ad-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={runsChartMeta.title}
    >
      {/* Tick labels and faint lines: 0, 10k, 20k. */}
      {runsChartMeta.ticks.map((tick, index) => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="ad-chart-grid" />
          <text x={left - 8} y={y(tick) + 3} textAnchor="end" className="ad-chart-tick">
            {runsChartMeta.tickLabels[index]}
          </text>
        </g>
      ))}

      {/* One bar per run. */}
      {runsChart.map((bar, index) => {
        const x = left + slot * index + (slot - barWidth) / 2;
        const barTop = y(bar.newDamageHa);
        return (
          <g key={bar.month}>
            <rect
              x={x}
              y={barTop}
              width={barWidth}
              height={y(0) - barTop}
              rx={2}
              className={bar.current ? "ad-bar ad-bar-current" : "ad-bar"}
            />
            {bar.label && (
              <text x={x + barWidth / 2} y={barTop - 8} textAnchor="middle" className="ad-chart-value">
                {bar.label}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={height - 8}
              textAnchor="middle"
              className={bar.current ? "ad-chart-month ad-chart-month-current" : "ad-chart-month"}
            >
              {bar.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// "Data sources": the table of the nine inputs
// ---------------------------------------------------------------------------

function SourcesCard() {
  return (
    <Card title={sources.title} subtitle={sources.intro}>
      <div className="table-wrap">
        <table className="table ad-sources-table">
          <thead>
            <tr>
              {sources.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.rows.map((row) => (
              <tr key={row.source}>
                <td className="ad-src-name">
                  <strong>{row.source}</strong>
                </td>
                <td className="ad-src-tells">{row.tells}</td>
                <td className="mono ad-detail ad-src-detail">{row.detail}</td>
                <td className="ad-src-updated">{row.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// "How we know it works": the validation numbers
// ---------------------------------------------------------------------------

function ValidationCard() {
  return (
    <Card title={validation.title} subtitle={validation.subtitle}>
      <ul className="ad-checks-list">
        {validation.checks.map((check) => (
          <li key={check.text} className="ad-check-row">
            <span className="mono ad-check-value">{check.value}</span>
            <span className="ad-check-text">{check.text}</span>
          </li>
        ))}
      </ul>

      <div className="panel panel-amber ad-open-note">
        <Info size={14} className="ad-open-note-icon" />
        <p>
          <strong>{validation.openNote.lead}</strong> {validation.openNote.text}
        </p>
      </div>

      <button type="button" className="link-arrow ad-method-link" title="Not connected yet">
        {validation.link}
        <ChevronRight size={14} />
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// "Download this run": the five files and the citation box
// ---------------------------------------------------------------------------

function DownloadsCard() {
  // "Copy" turns into "Copied" for a moment after the DOI is copied.
  const [copied, setCopied] = useState(false);

  function copyDoi() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(citation.doi).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card title={atlasDownloads.title} subtitle={atlasDownloads.subtitle}>
      <ul className="stack stack-sm">
        {atlasDownloads.files.map((file) => {
          const Icon = fileIcons[file.icon] || FileText;
          return (
            <li key={file.id}>
              <button type="button" className="ad-file" title="Not connected yet">
                <span className="row-icon">
                  <Icon size={14} />
                </span>
                <span className="ad-file-name">{file.label}</span>
                <span className="mono ad-file-format">{file.format}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="panel panel-dark ad-cite">
        <span className="ad-cite-title">{citation.title}</span>
        <p className="ad-cite-text">{citation.text}</p>
        <div className="spread">
          <span className="mono ad-cite-doi">{citation.doi}</span>
          <Button size="sm" className="ad-copy" icon={<Copy size={13} />} onClick={copyDoi}>
            {copied ? "Copied" : citation.copyButton}
          </Button>
        </div>
      </div>
    </Card>
  );
}
