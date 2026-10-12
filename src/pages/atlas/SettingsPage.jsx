// WHAT THIS FILE DOES
// The Atlas Settings page (/atlas/settings). The tabs along the top jump to
// a section. The left column holds the "Scoring rules" card (the Near term
// gate, the Postwar weights and blend strength, the normal years to compare
// with) and the "Region" card. The right column shows what the current
// settings produce, the run schedule and alerts, the team, and the farm
// data rules.
//
// Every word and number comes from src/data/atlas.js. The sliders, selects
// and toggles work on screen (they remember what you chose while the page
// is open) but nothing is sent anywhere yet: "Save for next run", "Invite"
// and "Upload districts" are not connected.
//
// WHO EDITS IT
// Whoever changes how the Atlas Settings page looks or behaves. To change
// the wording or the default values, edit src/data/atlas.js instead.

import { useRef, useState } from "react";
import {
  SlidersHorizontal,
  Globe,
  Info,
  Check,
  Upload,
  Plus,
  Lock,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Tabs,
  Toggle,
} from "../../components/ui/index.js";
import {
  atlas,
  timeframes,
  scoring,
  settingsPage,
  settingsTabs,
  withTheseSettings,
  region,
  runsAndAlerts,
  team,
  farmData,
} from "../../data/atlas.js";
import "./SettingsPage.css";

// The two timeframes give the panel headings "Near term" and "Postwar".
const [nearTerm, postwar] = timeframes;

// The three Postwar weights, in the order they are shown, with the colour
// of the small square before each name.
const WEIGHT_ROWS = scoring.questions.map((question) => ({
  key: question.id,
  label: question.label,
  tone: question.tone,
}));

// Turn the tab names from the data file into what the Tabs block expects.
// The id doubles as the section each tab scrolls to.
const TABS = settingsTabs.map((label) => ({ id: label, label }));

// Change one weight and scale the other two so the three still add up to
// 100. If the other two are both 0, the remainder is split evenly.
function rebalanceWeights(weights, changedKey, newValue) {
  const value = Math.max(0, Math.min(100, Math.round(newValue)));
  const otherKeys = Object.keys(weights).filter((key) => key !== changedKey);
  const otherTotal = otherKeys.reduce((sum, key) => sum + weights[key], 0);
  const remainder = 100 - value;

  const next = { [changedKey]: value };
  otherKeys.forEach((key) => {
    next[key] =
      otherTotal === 0
        ? Math.round(remainder / otherKeys.length)
        : Math.round((weights[key] / otherTotal) * remainder);
  });

  // Rounding can leave the total one off; put the difference on the larger
  // of the other two so the total is exactly 100.
  const total = Object.values(next).reduce((sum, n) => sum + n, 0);
  if (total !== 100) {
    const fixKey = otherKeys.sort((a, b) => next[b] - next[a])[0];
    next[fixKey] += 100 - total;
  }
  return next;
}

export default function SettingsPage() {
  const defaults = scoring.defaults;

  // Which tab is lit. Clicking a tab also scrolls to that section.
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const sectionRefs = useRef({});

  // The scoring settings, starting from the research defaults.
  const [gate, setGate] = useState(String(defaults.gatePercentile));
  const [ramp, setRamp] = useState(String(defaults.rampWidth));
  const [weights, setWeights] = useState({ ...defaults.weights });
  const [blend, setBlend] = useState(String(defaults.r));
  const [baseline, setBaseline] = useState(scoring.options.baselines[0].value);

  // The right-column controls.
  const [schedule, setSchedule] = useState(runsAndAlerts.scheduleOptions[0].value);
  const [alertRadar, setAlertRadar] = useState(runsAndAlerts.alertRadar.on);
  const [emailDonors, setEmailDonors] = useState(runsAndAlerts.emailDonors.on);
  const [acceptRequests, setAcceptRequests] = useState(farmData.acceptRequests.on);
  const [country, setCountry] = useState(region.countryOptions[0].value);

  const weightTotal = Object.values(weights).reduce((sum, n) => sum + n, 0);

  function handleTab(id) {
    setActiveTab(id);
    const section = sectionRefs.current[id];
    if (section && section.scrollIntoView) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function resetToDefaults() {
    setGate(String(defaults.gatePercentile));
    setRamp(String(defaults.rampWidth));
    setWeights({ ...defaults.weights });
    setBlend(String(defaults.r));
    setBaseline(scoring.options.baselines[0].value);
  }

  // Stores a section's element so a tab can scroll to it.
  const sectionRef = (id) => (element) => {
    sectionRefs.current[id] = element;
  };

  return (
    <div className="page as-page">
      <PageHeader eyebrow={atlas.eyebrow} title={settingsPage.title} subtitle={settingsPage.subtitle} />

      <div className="as-tabs">
        <Tabs tabs={TABS} active={activeTab} onChange={handleTab} bar ariaLabel="Settings sections" />
      </div>

      <div className="two-col">
        {/* ---------------- Left column ---------------- */}
        <div className="stack">
          {/* Scoring rules */}
          <Card
            ref={sectionRef("Scoring")}
            className="as-section"
            title={
              <span className="as-card-title">
                <SlidersHorizontal size={15} />
                {scoring.settings.title}
              </span>
            }
            subtitle={scoring.settings.subtitle}
          >
            {/* Near term: the safe-access gate */}
            <div className="panel panel-outline as-panel">
              <div className="spread">
                <h3>{nearTerm.label}</h3>
                <Badge>{scoring.settings.nearTerm.badge}</Badge>
              </div>
              <p className="as-panel-text">{scoring.settings.nearTerm.text}</p>

              <div className="as-grid-2">
                <label>
                  <span className="field-label">{scoring.settings.nearTerm.gateLabel}</span>
                  <select className="select" value={gate} onChange={(e) => setGate(e.target.value)}>
                    {scoring.options.percentiles.map((option) => (
                      <option key={option.value} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">{scoring.settings.nearTerm.rampLabel}</span>
                  <select className="select" value={ramp} onChange={(e) => setRamp(e.target.value)}>
                    {scoring.options.ramp.map((option) => (
                      <option key={option.value} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="as-info">
                <Info size={13} />
                {scoring.notes.gate}
              </p>
            </div>

            {/* Postwar: the three weights and the blend strength */}
            <div className="panel panel-outline as-panel">
              <div className="spread">
                <h3>{postwar.label}</h3>
                <Badge>{scoring.settings.postwar.badge}</Badge>
              </div>
              <p className="as-panel-text">{scoring.settings.postwar.text}</p>

              <div className="as-weights">
                {WEIGHT_ROWS.map((row) => (
                  <label key={row.key} className="as-weight">
                    <span className="as-weight-name">
                      <span className={`as-dot as-dot-${row.tone}`} />
                      {row.label}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      className="as-range"
                      style={{ "--pct": `${weights[row.key]}%` }}
                      value={weights[row.key]}
                      onChange={(e) => setWeights(rebalanceWeights(weights, row.key, Number(e.target.value)))}
                      aria-label={row.label}
                    />
                    <span className="as-weight-value mono">{weights[row.key]}%</span>
                  </label>
                ))}
                <p className={weightTotal === 100 ? "as-sum as-sum-ok" : "as-sum as-sum-bad"}>
                  <Check size={13} />
                  {weightTotal === 100 ? scoring.settings.postwar.sumLabel : `Adds up to ${weightTotal}%`}
                </p>
              </div>

              <label className="as-blend">
                <span className="field-label">{scoring.settings.postwar.rLabel}</span>
                <select className="select" value={blend} onChange={(e) => setBlend(e.target.value)}>
                  {scoring.options.r.map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="as-note">{scoring.notes.r}</p>

              <p className="as-info">
                <Info size={13} />
                {scoring.notes.postwar}
              </p>
            </div>

            {/* Baseline years + save / reset */}
            <div className="as-baseline-row">
              <label className="as-baseline">
                <span className="field-label">{scoring.settings.baselineLabel}</span>
                <select className="select" value={baseline} onChange={(e) => setBaseline(e.target.value)}>
                  {scoring.options.baselines.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="primary" title="Not connected yet">
                {scoring.settings.saveButton}
              </Button>
              <Button variant="secondary" onClick={resetToDefaults}>
                {scoring.settings.resetButton}
              </Button>
            </div>
          </Card>

          {/* Region */}
          <Card
            ref={sectionRef("Region")}
            className="as-section"
            title={
              <span className="as-card-title">
                <Globe size={15} />
                {region.title}
              </span>
            }
          >
            <div className="as-region-row">
              <label>
                <span className="field-label">{region.countryLabel}</span>
                <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {region.countryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="field-label">{region.boundariesLabel}</span>
                <div className="as-readonly">{region.boundaries}</div>
              </div>
              <Button variant="secondary" icon={<Upload size={14} />} title="Not connected yet">
                {region.uploadButton}
              </Button>
            </div>

            <p className="small muted">{region.crimeaNote}</p>

            <div className="panel panel-green as-expand">
              <p>
                <strong>{region.expandLead}</strong> {region.expandNote}
              </p>
              <button type="button" className="as-text-link" title="Not connected yet">
                {region.requestLink}
              </button>
            </div>
          </Card>
        </div>

        {/* ---------------- Right column ---------------- */}
        <div className="stack">
          {/* With these settings: the result the current settings produce */}
          <Card className="as-dark">
            <div className="spread">
              <h2>{withTheseSettings.title}</h2>
              <Badge className="as-badge-solid">
                <Check size={11} strokeWidth={3} />
                {withTheseSettings.badge}
              </Badge>
            </div>

            <div>
              <p className="as-dark-label">{withTheseSettings.nearTermLabel}</p>
              <ol className="as-ranked">
                {withTheseSettings.nearTermTopFive.map((name, index) => (
                  <li key={name}>
                    <span className="as-rank mono">{index + 1}</span>
                    {name}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <p className="as-dark-label">{withTheseSettings.postwarLabel}</p>
              <p className="as-dark-line">{withTheseSettings.postwarTopFour.join(", ")}</p>
            </div>

            <p className="as-dark-note">{withTheseSettings.note}</p>
          </Card>

          {/* Runs and alerts */}
          <Card ref={sectionRef("Runs and alerts")} className="as-section" title={runsAndAlerts.title}>
            <label>
              <span className="field-label">{runsAndAlerts.scheduleLabel}</span>
              <select className="select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                {runsAndAlerts.scheduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="as-rows">
              <div className="as-row">
                <Toggle title={runsAndAlerts.alertRadar.label} checked={alertRadar} onChange={setAlertRadar} />
              </div>
              <div className="as-row">
                <Toggle title={runsAndAlerts.emailDonors.label} checked={emailDonors} onChange={setEmailDonors} />
              </div>
            </div>
          </Card>

          {/* Team */}
          <Card
            ref={sectionRef("Team")}
            className="as-section"
            title={team.title}
            actions={
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} title="Not connected yet">
                {team.inviteButton}
              </Button>
            }
          >
            <ul className="as-rows">
              {team.members.map((member) => (
                <li key={member.id} className="as-row as-member">
                  <span className={`avatar as-avatar as-avatar-${member.tone}`}>{member.initials}</span>
                  <span className="as-member-name">{member.name}</span>
                  <span className="small muted">{member.role}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Farm data */}
          <Card ref={sectionRef("Farm data")} className="as-section" title={farmData.title}>
            <div className="as-rows">
              <div className="as-row">
                <Toggle
                  title={farmData.acceptRequests.label}
                  help={farmData.acceptRequests.help}
                  checked={acceptRequests}
                  onChange={setAcceptRequests}
                />
              </div>
              <div className="as-row toggle-row">
                <div className="toggle-row-text">
                  <span className="toggle-row-title">{farmData.consent.label}</span>
                  <span className="toggle-row-help">{farmData.consent.note}</span>
                </div>
                <Badge>
                  <Lock size={11} />
                  {farmData.consent.badge}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
