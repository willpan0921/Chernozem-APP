// WHAT THIS FILE DOES
// The Atlas "Recovery overview" page (/atlas): the first screen the regional
// office sees. From top to bottom it shows
//   - the heading with the "Near term | Postwar" switch and the report button,
//   - four big-number tiles and a footnote,
//   - "Where to start": a tile map of the 24 regions plus Crimea, its legend,
//     the top-five list and a note,
//   - "How priority is scored": the three questions, the result box and the
//     two time-frame rules,
//   - on the right: "Next steps for your office", "Alerts" and the dark
//     "Spring plan" box.
//
// The "Near term | Postwar" switch is the only state on the page. Changing
// it recolours the tile map, swaps the top-five list and moves the
// "showing now" mark between the two rule boxes.
//
// Every number and sentence comes from src/data/atlas.js. Nothing is typed
// in here, so the team changes the data file, not this one.
//
// WHO EDITS IT
// Whoever changes how the Atlas overview looks or is laid out. To change a
// number or a sentence, edit src/data/atlas.js instead.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  TriangleAlert,
  Waves,
  FileText,
  Cloud,
  Flame,
  MapPin,
} from "lucide-react";
import { PageHeader, Card, Stat, Button, Segmented, RowItem } from "../../components/ui/index.js";
import {
  atlas,
  kpis,
  kpisFootnote,
  timeframes,
  regions,
  topFive,
  mapLegend,
  nextStepsSubtitle,
  nextSteps,
  nextStepsLink,
  alerts,
  springPlan,
  scoring,
} from "../../data/atlas.js";
import "./OverviewPage.css";

// The data file names icons by their Lucide name ("ShieldCheck"). This
// table turns the name into the real icon. Add a line here when the data
// file starts using a new icon.
const ICONS = {
  ShieldCheck,
  TriangleAlert,
  Waves,
  FileText,
  Cloud,
  Flame,
  MapPin,
};

// How many columns and rows the region tile map has.
const MAP_COLS = 8;
const MAP_ROWS = 6;

export default function OverviewPage() {
  // Which time frame is showing: "nearTerm" or "postwar".
  const [timeframeId, setTimeframeId] = useState(timeframes[0].id);
  const timeframe = timeframes.find((item) => item.id === timeframeId) || timeframes[0];

  // The small "showing now" words next to the selected rule box. In the
  // data file only the "Near term" entry has a tag (Postwar's is empty), so
  // we take the first non-empty tag we find and reuse it for whichever rule
  // box is selected. That way choosing "Postwar" moves the words over to it.
  const showingTag = timeframes.find((item) => item.tag)?.tag || "";

  return (
    <div className="page">
      <PageHeader
        eyebrow={atlas.eyebrow}
        title={atlas.overviewTitle}
        subtitle={`${atlas.run} run · ${atlas.imagery}`}
        actions={
          <>
            <Segmented
              light
              ariaLabel="Time frame"
              options={timeframes.map((item) => ({ value: item.id, label: item.label }))}
              value={timeframeId}
              onChange={setTimeframeId}
            />
            <Button variant="primary" icon={<Download size={14} />} title="Not connected yet">
              {atlas.reportButton}
            </Button>
          </>
        }
      />

      {/* The four big numbers. The second one (heavy damage) is red. */}
      <div className="stat-row ao-stats">
        {kpis.map((kpi) => (
          <Stat
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            note={kpi.note || undefined}
            tone={kpi.tone || undefined}
          />
        ))}
      </div>
      <p className="ao-footnote">
        {kpisFootnote.text} <Link to="/atlas/data">{kpisFootnote.link}</Link>
      </p>

      {/* Two columns: the big cards on the left, the office list on the
          right. The four cards sit directly in the grid so each row's two
          cards are the same height, like the mockup. */}
      <div className="two-col ao-grid">
        <Card
          title="Where to start"
          subtitle={timeframe.whereToStart}
          actions={
            <Link to="/atlas/map" className="link-arrow">
              Open the Atlas <ChevronRight size={14} />
            </Link>
          }
        >
          <div className="ao-start">
            <div className="ao-map-block">
              <RegionMap timeframeId={timeframeId} />
              <MapLegend />
            </div>
            <TopFive timeframe={timeframe} />
          </div>
        </Card>

        <Card title="Next steps for your office" subtitle={nextStepsSubtitle}>
          <div className="row-list">
            {nextSteps.map((step) => {
              const Icon = ICONS[step.icon] || FileText;
              return (
                <RowItem
                  key={step.id}
                  icon={<Icon size={14} />}
                  tone={step.tone || undefined}
                  title={step.title}
                  help={step.help}
                  when={step.when}
                  urgent={step.urgent}
                />
              );
            })}
          </div>
          <Link to="/atlas/ai" className="link-arrow">
            {nextStepsLink} <ChevronRight size={14} />
          </Link>
        </Card>

        <Card title={scoring.title} subtitle={scoring.subtitle}>
          <Scoring timeframeId={timeframeId} onChange={setTimeframeId} showingTag={showingTag} />
        </Card>

        <Card title="Alerts">
          <div className="stack stack-sm">
            {alerts.map((alert) => {
              const Icon = ICONS[alert.icon] || Cloud;
              return (
                <div key={alert.id} className={`panel panel-${alert.tone} ao-alert ao-alert-${alert.tone}`}>
                  <span className="ao-alert-icon">
                    <Icon size={14} />
                  </span>
                  <span className="ao-alert-text">
                    <span className="ao-alert-title">{alert.title}</span>
                    <span className="ao-alert-detail">{alert.detail}</span>
                  </span>
                </div>
              );
            })}
            <div className="panel panel-dark ao-plan">
              <span className="ao-plan-label">{springPlan.label}</span>
              <span className="ao-plan-amount mono">{springPlan.amount}</span>
              <span className="ao-plan-text">{springPlan.text}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// The tile map: one rounded square per region, placed on an 8 by 6 grid
// and coloured by its tier in the chosen time frame. Top-five regions also
// show their rank under the code.
function RegionMap({ timeframeId }) {
  return (
    <div
      className="ao-map"
      role="img"
      aria-label="Regions of Ukraine coloured by priority"
      style={{ "--ao-cols": MAP_COLS, "--ao-rows": MAP_ROWS }}
    >
      {regions.map((region) => {
        const { tier, rank } = region[timeframeId] || region.nearTerm;
        const classes = ["ao-tile", `ao-tile-${tier}`, region.dashed ? "ao-tile-dashed" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={region.code}
            className={classes}
            style={{ gridColumn: region.col + 1, gridRow: region.row + 1 }}
            title={region.name}
          >
            <span className="ao-tile-code">{region.code}</span>
            {rank && <span className="ao-tile-rank">{rank}</span>}
          </div>
        );
      })}
    </div>
  );
}

// The legend under the map: a small swatch per tier.
function MapLegend() {
  return (
    <div className="legend ao-legend">
      {mapLegend.map((item) => {
        const swatchClass =
          item.pattern === "striped"
            ? "swatch ao-swatch-striped"
            : item.pattern === "dashed"
              ? "swatch swatch-dashed"
              : "swatch";
        return (
          <span key={item.tier} className="legend-item">
            <span className={swatchClass} style={{ "--swatch": `var(--c-${item.colour})` }} />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

// The "Top five" list: rank, region name and a green bar, then the note.
function TopFive({ timeframe }) {
  const list = topFive[timeframe.id] || topFive.nearTerm;
  return (
    <div className="ao-top">
      <h3>{timeframe.topTitle}</h3>
      <ol className="ao-top-list">
        {list.map((item) => (
          <li key={item.code} className="ao-top-row">
            <span className="ao-top-rank">{item.rank}</span>
            <span className="ao-top-name">{item.name}</span>
            <span className="score-bar-track ao-top-track">
              <span className="score-bar-fill ao-top-fill" style={{ width: `${item.value * 100}%` }} />
            </span>
          </li>
        ))}
      </ol>
      <p className="ao-top-note">{topFive.note}</p>
    </div>
  );
}

// "How priority is scored": three question tiles, an arrow, the Priority
// box, and under them one rule box per time frame. Clicking a rule box
// switches the whole page to that time frame.
function Scoring({ timeframeId, onChange, showingTag }) {
  return (
    <div className="stack">
      <div className="ao-questions">
        {scoring.questions.map((question) => (
          <div key={question.id} className={`panel panel-${question.tone} ao-question ao-question-${question.tone}`}>
            <span className="ao-question-label">{question.label}</span>
            <span className="ao-question-text">{question.question}</span>
          </div>
        ))}
        <span className="ao-arrow" aria-hidden="true">
          <ArrowRight size={18} />
        </span>
        <div className="panel panel-dark ao-result">
          <span className="ao-question-label">{scoring.result.label}</span>
          <span className="ao-question-text">{scoring.result.help}</span>
        </div>
      </div>

      <div className="ao-modes">
        {timeframes.map((item) => {
          const active = item.id === timeframeId;
          return (
            <button
              key={item.id}
              type="button"
              className={active ? "panel panel-outline panel-selected ao-mode is-active" : "panel panel-outline ao-mode"}
              onClick={() => onChange(item.id)}
              aria-pressed={active}
            >
              <span className="ao-mode-title">
                {item.label}
                {active && showingTag && <span className="ao-mode-tag"> · {showingTag}</span>}
              </span>
              <span className="ao-mode-text">{item.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
