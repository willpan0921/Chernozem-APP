// WHAT THIS FILE DOES
// The Atlas Overview (/atlas): the first screen an official sees for the
// current area. From top to bottom:
//   - the area name, the month and where the data came from, with the
//     month picker, the Near term | Postwar switch and the Report button,
//   - four big numbers (cropland, black soil, heavy damage, people),
//   - "Where to start": the map coloured by priority with its key under
//     it, the weights in one line (click "Adjust" to change them on the
//     map page) and the five top areas (place names, else "North-west",
//     "East"…, the same names as on the map page),
//   - on the right: "Next steps" (tick them off, saved for the team),
//     "Alerts" from this month, and the "Budget" (click the amount to change
//     it; the hectares it covers recalculate).
//
// Everything is worked out from the analyzed month (useAtlasData) and the
// team's weights, so nothing here is typed in by hand. The wording rules
// live in src/lib/atlas/overview.js; the short area names, the month in
// the address (?month=2026-09) and the step dates in ./overviewHelpers.js.
//
// WHO EDITS IT
// Whoever changes how the Atlas overview looks or is laid out.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronRight, FileText, Flame, Pencil, Radar, ShieldCheck, SlidersHorizontal, Sprout, TriangleAlert } from "lucide-react";
import { PageHeader, Card, Stat, Button, Segmented, Badge } from "../../components/ui/index.js";
import { AnalysisProgress, AtlasGate, useAtlasData, useTimeframe } from "../../state/AtlasData.jsx";
import AtlasMap from "../../components/atlas/AtlasMap.jsx";
import MapLegend from "../../components/atlas/MapLegend.jsx";
import RunPicker from "../../components/atlas/RunPicker.jsx";
import { describeAlert, kpis, springPlan, summarize } from "../../lib/atlas/overview.js";
import { dueLabel, formatHaShort, formatUsd, listNames, toDay } from "../../lib/format.js";
import { areaOfAlert, atlasLink, haFixed, nameAreas, planSteps, useMonthInUrl, weightItems } from "./overviewHelpers.js";
import "./OverviewPage.css";

const TIMEFRAMES = [
  { value: "nearTerm", label: "Near term" },
  { value: "postwar", label: "Postwar" },
];

// How many top areas and alerts show before "Show all".
const TOP_COUNT = 5;
const ALERTS_SHOWN = 3;

const STEP_ICONS = { shield: ShieldCheck, alert: TriangleAlert, soil: Sprout, report: FileText };

export default function OverviewPage() {
  // Wait while a month from the address (?month=) is switched to.
  const switchingMonth = useMonthInUrl();
  return <AtlasGate>{switchingMonth ? null : <Overview />}</AtlasGate>;
}

function Overview() {
  const navigate = useNavigate();
  const { area, run, runs, scored, hotspots, settings, job, saveError } = useAtlasData();
  const [timeframe, setTimeframe] = useTimeframe();
  const [hovered, setHovered] = useState(null);
  const mapRef = useRef(null);

  // Links keep the chosen month and time frame.
  const withView = (path) => atlasLink(path, { month: run.month, timeframe });
  const openOnMap = (focusId, extra = "") => navigate(withView(`/atlas/map?focus=${encodeURIComponent(focusId)}${extra}`));

  const summary = useMemo(() => summarize(scored.places), [scored]);
  // The top areas with the names every page uses.
  const named = useMemo(() => nameAreas(hotspots[timeframe]), [hotspots, timeframe]);
  const weightLine = weightItems(settings, timeframe);
  const top = named.slice(0, TOP_COUNT);
  const isLatest = runs[0]?.id === run.id;
  const reanalyzing = job?.status === "running" && job.areaId === area.id;
  const fromEarthEngine = run.provider === "gee";

  // Hovering or focusing a top area outlines it on the map; if the map has
  // been moved so the area is not fully in view, glide over to it.
  const showArea = (hotspot) => {
    setHovered(hotspot);
    const map = mapRef.current?.getMap();
    if (!map || !hotspot?.bounds) return;
    if (!map.getBounds().contains(hotspot.bounds)) {
      const [[south, west], [north, east]] = hotspot.bounds;
      map.panTo([(south + north) / 2, (west + east) / 2], { animate: true, duration: 0.4 });
    }
  };

  return (
    <div className="page ao">
      <PageHeader
        title={area.name}
        subtitle={
          <span className="ao-meta">
            <span>{run.label}</span>
            {fromEarthEngine ? (
              <Badge tone="green" dot>
                Earth Engine
              </Badge>
            ) : (
              <Badge tone="amber">Sample data</Badge>
            )}
          </span>
        }
        actions={
          <>
            <RunPicker />
            <Segmented options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} ariaLabel="Time frame" />
            <Button variant="primary" icon={<FileText size={14} />} to={withView("/atlas/report")}>
              Report
            </Button>
          </>
        }
      />

      {reanalyzing && (
        <div className="card ao-progress">
          <AnalysisProgress job={job} compact />
        </div>
      )}
      {saveError && (
        <p className="ao-save-error" role="alert">
          <TriangleAlert size={14} /> Weights not saved: {saveError.message}
        </p>
      )}

      <div className="ao-stats">
        {kpis(summary).map((item) => (
          <Stat
            key={item.id}
            label={item.label}
            value={item.value}
            // Red only when there is damage to show: a red "0 ha" reads like an alarm.
            tone={item.id === "heavy-damage" && item.value === "0 ha" ? undefined : item.tone}
            note={item.id === "heavy-damage" && run.newHeavyDamageHa > 0 ? `+${formatHaShort(run.newHeavyDamageHa)} this month` : undefined}
          />
        ))}
      </div>

      <div className="ao-grid">
        <Card
          className="ao-start"
          title="Where to start"
          actions={
            <Link to={withView("/atlas/map")} className="ao-weights-link" aria-label={`Weights: ${weightLine.map((item) => item.text).join(", ")}. Adjust`}>
              <SlidersHorizontal size={13} aria-hidden="true" />
              <span className="ao-w-list" aria-hidden="true">
                {weightLine.map((item) => (
                  <span key={item.key} className={`ao-w ao-w-${item.key}`}>
                    {item.text}
                  </span>
                ))}
              </span>
              <span className="ao-weights-adjust" aria-hidden="true">
                Adjust <ChevronRight size={13} />
              </span>
            </Link>
          }
        >
          <div className="ao-map">
            <AtlasMap
              ref={mapRef}
              area={area}
              run={run}
              places={scored.places}
              colorBy="priority"
              timeframe={timeframe}
              height="clamp(280px, 62vw, 380px)"
              highlightIds={hovered?.cellIds}
              onSelect={(place) => place && openOnMap(place.id)}
              ariaLabel={`Map of ${area.name} coloured by priority`}
            />
          </div>
          {/* The key sits under the map so it never covers squares. */}
          <MapLegend colorBy="priority" timeframe={timeframe} className="ao-legend" />

          <div className="ao-top">
            <div className="ao-top-head">
              <h3>Top areas</h3>
              <span className="ao-top-unit">Black soil</span>
            </div>
            {top.length === 0 ? (
              <p className="ao-empty">No area qualifies with these weights.</p>
            ) : (
              <ol className="ao-top-list">
                {top.map((hotspot) => (
                  <li key={hotspot.id}>
                    <button
                      type="button"
                      className="ao-top-row"
                      onClick={() => openOnMap(hotspot.id)}
                      onMouseEnter={() => showArea(hotspot)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => showArea(hotspot)}
                      onBlur={() => setHovered(null)}
                    >
                      <span className="ao-top-rank">{hotspot.rank}</span>
                      <span className="ao-top-text">
                        <span className="ao-top-name">{hotspot.title}</span>
                        {hotspot.coords && <span className="ao-top-coords">{hotspot.coords}</span>}
                      </span>
                      <span className="ao-top-ha">{haFixed(hotspot.blackSoilHa)}</span>
                      <ChevronRight size={14} className="ao-top-go" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>

        <div className="ao-side">
          <NextSteps run={run} hotspots={named} isLatest={isLatest} linkTo={withView} />
          <Alerts
            alerts={run.alerts || []}
            areas={named}
            onOpen={(alert) => (alert.cellIds?.[0] ? openOnMap(alert.cellIds[0], "&color=damage") : navigate(withView("/atlas/map?color=damage")))}
          />
          <Budget hotspots={named} blackSoilHa={summary.blackSoilHa} />
        </div>
      </div>
    </div>
  );
}

// ---------- Next steps ----------

// "hotspots" are the top areas shown on the page, with their short names,
// so the steps name the same places as the list.
function NextSteps({ run, hotspots, isLatest, linkTo }) {
  const navigate = useNavigate();
  const { workspace, actions } = useAtlasData();
  const [error, setError] = useState(null);
  const steps = planSteps({ run, hotspots, alerts: run.alerts || [], isLatest });
  const done = new Set(workspace?.doneSteps || []);
  const doneCount = steps.filter((step) => done.has(step.id)).length;
  const today = toDay(new Date());

  const toggle = async (stepId) => {
    setError(null);
    try {
      await actions.toggleStep(stepId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Card title="Next steps" actions={<span className="ao-count">{doneCount} of {steps.length} done</span>}>
      <ul className="ao-steps">
        {steps.map((step) => {
          const isDone = done.has(step.id);
          const Icon = STEP_ICONS[step.icon] || FileText;
          const due = dueLabel(step.due, today);
          return (
            <li key={step.id} className={isDone ? "ao-step is-done" : "ao-step"}>
              <button
                type="button"
                className={`ao-step-check ao-tone-${step.tone || "ink"}`}
                aria-pressed={isDone}
                aria-label={isDone ? `Mark not done: ${step.title}` : `Mark done: ${step.title}`}
                onClick={() => toggle(step.id)}
              >
                {isDone ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
              </button>
              <button type="button" className="ao-step-title" onClick={() => navigate(linkTo(step.to))}>
                {step.title}
              </button>
              {!isDone && <span className={due.urgent ? "ao-due is-urgent" : "ao-due"}>{due.text}</span>}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="ao-inline-error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

// ---------- Alerts ----------

// An alert inside a top area is named after it ("North-west"); others keep
// their coordinates.
function Alerts({ alerts, areas, onOpen }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? alerts : alerts.slice(0, ALERTS_SHOWN);
  return (
    <Card title="Alerts" actions={alerts.length > 0 && <span className="ao-count">{alerts.length}</span>}>
      {alerts.length === 0 ? (
        <p className="ao-empty">No alerts this month.</p>
      ) : (
        <ul className="ao-alerts">
          {shown.map((alert) => {
            const view = describeAlert(alert);
            const area = areaOfAlert(alert, areas);
            const Icon = alert.kind === "fire" ? Flame : Radar;
            return (
              <li key={alert.id}>
                <button type="button" className="ao-alert" onClick={() => onOpen(alert)}>
                  <span className={`ao-alert-icon ao-tone-${view.tone}`}>
                    <Icon size={14} />
                  </span>
                  <span className="ao-alert-text">
                    <span className="ao-alert-title">{view.title}</span>
                    <span className="ao-alert-place">{area ? area.name : view.place}</span>
                  </span>
                  <span className="ao-alert-detail">{view.detail}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {alerts.length > ALERTS_SHOWN && (
        <button type="button" className="ao-more" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
          {showAll ? "Show fewer" : `Show all ${alerts.length}`}
        </button>
      )}
    </Card>
  );
}

// ---------- Budget ----------

// Reads what a person typed as a dollar amount: "10,000,000", "$2.5M",
// "750k", "1.2 billion". Gives back null when it is not an amount.
function parseBudget(text) {
  const clean = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[$,\s]|usd/g, "");
  const match = /^(\d+(?:\.\d+)?)(k|thousand|m|mn|million|b|bn|billion)?$/.exec(clean);
  if (!match) return null;
  const times = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 }[match[2]] || 1;
  const value = Math.round(Number(match[1]) * times);
  return value <= 1e12 ? value : null;
}

// "8.6k–26.3k ha": both ends in the same short form.
function haRange(low, high) {
  const short = (ha) => (ha >= 1000 && ha < 1e6 ? `${Number((ha / 1000).toFixed(ha < 1e4 ? 1 : 0))}k` : formatHaShort(ha).replace(" ha", ""));
  return `${short(low)}–${short(high)} ha`;
}

function Budget({ hotspots, blackSoilHa }) {
  const { workspace, actions } = useAtlasData();
  const budget = workspace?.budgetUsd ?? 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  // Set while Enter or Escape closes the box, so leaving it does not save twice.
  const closing = useRef(false);
  // springPlan names places by "label": use the short names.
  const plan = springPlan(
    budget,
    hotspots.map((hotspot) => ({ ...hotspot, label: hotspot.name }))
  );

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    setDraft(budget.toLocaleString("en-US"));
    setError(null);
    closing.current = false;
    setEditing(true);
  };

  const save = async () => {
    if (closing.current) return;
    const value = parseBudget(draft);
    if (value === null) {
      setError("Enter an amount in dollars, like 10,000,000 or 2.5M.");
      return;
    }
    closing.current = true;
    setEditing(false);
    if (value === budget) return;
    setSaving(true);
    try {
      await actions.updateWorkspace({ budgetUsd: value });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ao-budget" aria-label="Budget">
      <span className="ao-budget-label">Budget</span>
      {editing ? (
        <form
          className="ao-budget-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <span className="ao-budget-dollar" aria-hidden="true">
            $
          </span>
          <input
            ref={inputRef}
            id="ao-budget-input"
            className="ao-budget-input"
            inputMode="decimal"
            aria-label="Budget in US dollars"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closing.current = true;
                setEditing(false);
                setError(null);
              }
            }}
          />
        </form>
      ) : (
        <button type="button" className="ao-budget-amount" onClick={startEditing} aria-label={`Budget ${formatUsd(budget)}. Change`}>
          <span>{formatUsd(budget)}</span>
          <Pencil size={14} aria-hidden="true" />
        </button>
      )}
      {error && (
        <p className="ao-budget-error" role="alert">
          {error}
        </p>
      )}
      {budget > 0 ? (
        <>
          <span className="ao-budget-ha" aria-busy={saving}>
            {/* A budget bigger than the land (a farm) covers all of it. */}
            {plan.fewestHa >= blackSoilHa
              ? `Covers all ${formatHaShort(blackSoilHa)}`
              : `Covers ${haRange(plan.fewestHa, Math.min(plan.mostHa, blackSoilHa))}`}
          </span>
          {plan.start.length > 0 && <span className="ao-budget-start">Start with {listNames(plan.start)}</span>}
        </>
      ) : (
        <span className="ao-budget-start">Set a budget to see the land it covers.</span>
      )}
    </section>
  );
}
