// WHAT THIS FILE DOES
// The Field "Overview" page (web address /field): the first thing a farmer
// sees. From top to bottom it shows
//   - the farm name, today's date and the "Open map" / "Add a field" buttons
//   - five tiles: healthy / to watch / needs recovery / farm area / weather
//   - the big Recovery card for Field 7, with the two recovery paths
//   - the "Tell us what happened" form for reporting an event
//   - on the right: "Next steps this week" and the "Your fields" list
//
// Every number and sentence comes from src/data/farm.js. To change a word or
// a figure, edit that file, not this one.
//
// WHO EDITS IT
// Whoever changes how the Overview is laid out. The look of each block is in
// OverviewPage.css next to this file; the shared blocks (Card, Stat, Badge,
// Button...) live in src/components/ui.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CircleCheck,
  Eye,
  Shield,
  LayoutGrid,
  Sun,
  Map,
  Plus,
  ChevronRight,
  Check,
  Calendar,
  Landmark,
  MessageSquare,
  Download,
  Camera,
  Send,
  Wheat,
  Droplet,
} from "lucide-react";
import { PageHeader, Card, Stat, Badge, Button, Tabs, ChipSelect, RowItem } from "../../components/ui/index.js";
import {
  farm,
  fields,
  fieldOptions,
  recoveryPlan,
  nextSteps,
  nextStepsCard,
  yourFieldsCard,
  eventTypes,
  eventForm,
} from "../../data/farm.js";
import "./OverviewPage.css";

// The data file names icons with short keys ("shield", "wheat"...). This
// table turns each key into the Lucide icon that draws it.
const ICONS = {
  "check-circle": CircleCheck,
  eye: Eye,
  shield: Shield,
  "layout-grid": LayoutGrid,
  wheat: Wheat,
  droplet: Droplet,
};

// Draws the icon for a key, at the size the caller wants. Falls back to the
// shield if the key is unknown, so a typo in the data never breaks the page.
function DataIcon({ name, size = 14 }) {
  const Icon = ICONS[name] || Shield;
  return <Icon size={size} />;
}

export default function OverviewPage() {
  // Which recovery path is highlighted. Starts on the one the data marks as
  // selected ("fast") and changes when someone clicks "Choose this path".
  const [selectedPath, setSelectedPath] = useState(recoveryPlan.selectedPath);

  // The event form: which field it is about, what kind of event, the text,
  // and whether it has been "sent" (shows a confirmation line).
  const [eventFieldId, setEventFieldId] = useState(eventForm.defaultFieldId);
  const [eventType, setEventType] = useState(null);
  const [eventText, setEventText] = useState("");
  const [eventSent, setEventSent] = useState(false);

  function handleEventSubmit(event) {
    event.preventDefault();
    setEventSent(true);
  }

  const paths = Object.values(recoveryPlan.paths);
  // The word on the black pill of whichever path is chosen ("Selected").
  const SELECTED_LABEL = recoveryPlan.paths[recoveryPlan.selectedPath].badge;

  return (
    <div className="page fo-page">
      {/* ---- Header: date line above the title, buttons on the right ---- */}
      <PageHeader
        eyebrow={
          <span className="fo-dateline">
            {farm.todayDisplay} · {farm.district}
          </span>
        }
        title={farm.name}
        actions={
          <>
            <Button variant="secondary" icon={<Map size={15} />} to="/field/fields">
              {farm.headerActions.openMap}
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} title="Not connected yet">
              {farm.headerActions.addField}
            </Button>
          </>
        }
      />

      {/* ---- Stat tiles: four counts plus the dark weather tile ---- */}
      <div className="stat-row fo-stats">
        {farm.stats.map((stat) => (
          <Stat
            key={stat.key}
            label={stat.label}
            value={stat.value}
            tone={stat.tone || undefined}
            icon={<DataIcon name={stat.icon} size={13} />}
            mono={stat.key === "totalHa"}
          />
        ))}
        <div className="stat stat-dark fo-weather">
          <span className="fo-weather-icon">
            <Sun size={26} strokeWidth={2.2} />
          </span>
          <span className="fo-weather-text">
            <span className="fo-weather-summary">{farm.weather.display}</span>
            <span className="stat-note">{farm.weather.note}</span>
          </span>
        </div>
      </div>

      <div className="two-col">
        {/* ================= LEFT COLUMN ================= */}
        <div className="stack">
          {/* ---- Recovery card for Field 7 ---- */}
          <Card className="fo-recovery">
            <div className="fo-recovery-head">
              <div className="fo-recovery-title">
                <span className="eyebrow eyebrow-red">{recoveryPlan.eyebrow}</span>
                <h2 className="fo-recovery-headline">{recoveryPlan.headline}</h2>
                <p className="small muted">{recoveryPlan.subline}</p>
              </div>
              <Link to="/field/fields" className="link-arrow fo-recovery-maplink">
                {recoveryPlan.seeOnMap}
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* The red "get it checked first" warning. */}
            <div className="panel panel-red fo-warning">
              <span className="fo-warning-icon">
                <Shield size={15} strokeWidth={2.2} />
              </span>
              <div className="fo-warning-text">
                <strong>{recoveryPlan.warning.title}</strong>
                <p>{recoveryPlan.warning.text}</p>
              </div>
            </div>

            {/* The two recovery paths side by side. */}
            <div className="fo-paths">
              {paths.map((path) => {
                const isSelected = path.id === selectedPath;
                return (
                  <div
                    key={path.id}
                    className={isSelected ? "panel panel-outline panel-selected fo-path is-selected" : "panel panel-outline fo-path"}
                  >
                    <div className="fo-path-head">
                      <h3>{path.name}</h3>
                      {/* The selected path always shows the black "Selected"
                          pill; the other shows its own badge. */}
                      {isSelected ? (
                        <Badge tone="ink">{SELECTED_LABEL}</Badge>
                      ) : (
                        path.badge !== SELECTED_LABEL && <Badge tone={path.badgeTone || undefined}>{path.badge}</Badge>
                      )}
                    </div>
                    <p className="small fo-path-tagline">{path.tagline}</p>
                    <ul className="fo-steps">
                      {path.steps.map((step) => (
                        <li key={step}>
                          <Check size={13} strokeWidth={2.5} />
                          {step}
                        </li>
                      ))}
                    </ul>
                    <div className="divider" />
                    <div className="fo-cost">
                      <span className="mono fo-cost-amount">{path.costPerHa}</span>
                      <span className="mono small muted">{path.costUnit}</span>
                    </div>
                    <p className="small muted fo-cost-total">{path.total}</p>
                    <div className="fo-path-foot">
                      <span className="fo-replant">
                        <Calendar size={13} />
                        {path.replant}
                      </span>
                      {!isSelected && (
                        <Button variant="secondary" size="sm" onClick={() => setSelectedPath(path.id)}>
                          {path.chooseLabel}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom row: progress bar, programs link and the two buttons. */}
            <div className="fo-recovery-foot">
              <div className="fo-progress">
                <div className="spread">
                  <span className="fo-progress-label">{recoveryPlan.progress.label}</span>
                  <span className="small">{recoveryPlan.progress.display}</span>
                </div>
                <div className="fo-progress-track">
                  <div className="fo-progress-fill" style={{ width: `${recoveryPlan.progress.pct}%` }} />
                </div>
              </div>
              <div className="fo-recovery-actions">
                <Link to="/field/ai" className="link-arrow fo-programs">
                  <Landmark size={14} />
                  {recoveryPlan.programsLabel}
                </Link>
                <Button variant="secondary" icon={<MessageSquare size={14} />} to="/field/ai">
                  {recoveryPlan.actions.askAi}
                </Button>
                <Button variant="primary" icon={<Download size={14} />} title="Not connected yet">
                  {recoveryPlan.actions.download}
                </Button>
              </div>
            </div>
          </Card>

          {/* ---- "Tell us what happened" event form ---- */}
          <Card className="fo-event">
            <form className="stack" onSubmit={handleEventSubmit}>
              <div className="fo-event-head">
                <span className="fo-event-icon">
                  <MessageSquare size={15} />
                </span>
                <div className="card-header-text">
                  <h2>{eventForm.title}</h2>
                  <p className="card-subtitle">{eventForm.subtitle}</p>
                </div>
              </div>

              <div className="fo-event-controls">
                <span className="small muted">{eventForm.fieldLabel}</span>
                <ChipSelect options={fieldOptions} value={eventFieldId} onChange={setEventFieldId} ariaLabel="Field" />
                <span className="fo-vdivider" />
                <Tabs
                  tabs={eventTypes.map((type) => ({ id: type, label: type }))}
                  active={eventType}
                  onChange={(id) => setEventType(id === eventType ? null : id)}
                  ariaLabel="Kind of event"
                />
              </div>

              <textarea
                className="textarea fo-event-textarea"
                placeholder={eventForm.placeholder}
                value={eventText}
                onChange={(event) => setEventText(event.target.value)}
                rows={3}
              />

              <div className="spread fo-event-foot">
                <Button variant="secondary" icon={<Camera size={14} />} title="Not connected yet">
                  {eventForm.addPhotos}
                </Button>
                <div className="cluster">
                  {eventSent && <span className="small muted">{eventForm.sentConfirmation}</span>}
                  <Button variant="primary" type="submit" title="Not connected yet" className="fo-send">
                    {eventForm.send}
                    <Send size={14} />
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="stack">
          {/* ---- Next steps this week ---- */}
          <Card title={nextStepsCard.title} subtitle={nextStepsCard.subtitle} className="fo-next">
            <div className="row-list">
              {nextSteps.map((step) => (
                <RowItem
                  key={step.id}
                  icon={<DataIcon name={step.icon} size={13} />}
                  tone={step.tone}
                  title={step.title}
                  help={`${step.field} · ${step.help}`}
                  when={step.when}
                  urgent={step.urgent}
                />
              ))}
            </div>
            <Link to="/field/ai" className="link-arrow fo-next-link">
              {nextStepsCard.footerLink}
              <ChevronRight size={14} />
            </Link>
          </Card>

          {/* ---- Your fields ---- */}
          <Card
            title={yourFieldsCard.title}
            actions={
              <Link to="/field/fields" className="link-arrow">
                {yourFieldsCard.link}
              </Link>
            }
            className="fo-fields"
          >
            <ul className="fo-field-list">
              {fields.map((field) => (
                <li key={field.id} className="fo-field-row">
                  <span
                    className={field.striped ? "fo-field-swatch is-striped" : "fo-field-swatch"}
                    style={{ "--swatch": `var(--c-${field.colorToken})` }}
                  />
                  <span className="fo-field-text">
                    <span className="fo-field-name">{field.name}</span>
                    <span className="small muted">
                      {field.crop} · {field.areaHa.toFixed(1)} ha
                    </span>
                  </span>
                  <Badge tone={field.badgeTone || undefined}>{field.statusLabel}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
