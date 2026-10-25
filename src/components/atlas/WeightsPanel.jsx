// WHAT THIS FILE DOES
// The weights control on the left of the Atlas map: how much value (soil
// value), damage and feasibility (safe access: the distance to fighting)
// count, plus the Near term | Postwar switch. Every change recolours the
// map at once and is saved for the team. The blue control is Feasibility
// in both time frames:
//
//   Postwar    three sliders, Value / Damage / Feasibility, that always
//              add up to 100: moving one shares the rest between the other
//              two.
//   Near term  feasibility works as a cutoff instead of a weight: the
//              "Feasibility cutoff" ("Leave out the least feasible 30% for
//              now"; the paper's gate, same maths), so the panel shows Value
//              and Damage as shares of 100 that trade with each other
//              (30 / 40 shows as 43% / 57%). The Postwar feasibility weight
//              is kept as it is. Where feasibility is not measured, the
//              Postwar Feasibility slider stays (the weights are one saved
//              set) with a line under it: "Feasibility is not measured
//              here: it is full everywhere, so the order follows value and
//              damage". At peace with no ACLED file (and in a
//              month before its war began) there is no cutoff: the panel
//              says why instead, "Feasibility not measured here (no war
//              recorded): nothing is left out" and so on; in a war where no
//              fire looked like fighting, "Feasibility not measured here, so
//              nothing can be left out for it" (overview.js setAsideNote).
//
// A drag (or a run of arrow-key presses) is always worked out from the
// weights it started from, so moving a slider and putting it back gives
// back exactly the weights you had.
//
// WHAT IT RECEIVES
//   showTimeframe  false hides the Near term | Postwar switch (default true)
//   className      extra class names (optional)
//
// WHO EDITS IT
// Whoever changes the weight controls. The 100 rule is in
// src/lib/atlas/weights.js; the defaults in src/lib/atlas/method.js.

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Segmented } from "../ui/index.js";
import { useAtlasData, useTimeframe } from "../../state/AtlasData.jsx";
import { isDefaultSettings } from "../../lib/atlas/method.js";
import { WEIGHT_KEYS, rebalanceWeights } from "../../lib/atlas/weights.js";
import { nearTermShares } from "../../lib/atlas/scoring.js";
import { accessMeasured, longTermAccessNote, setAsideNote, timeframeOptions } from "../../lib/atlas/overview.js";
import "./atlas.css";

const LABELS = {
  soil: { label: "Value", tone: "green" },
  damage: { label: "Damage", tone: "red" },
  access: { label: "Feasibility", tone: "blue" },
};

// The Near term | Postwar switch ("Long term" where no war is listed): timeframeOptions(run).

// longTermAccessNote(run) reads " (feasibility is not measured here: ...)";
// as a line of its own, without the brackets and with a capital.
function longTermNote(run) {
  const text = longTermAccessNote(run).trim().replace(/^\(/, "").replace(/\)$/, "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// One slider row: name, big percentage (also typeable) and the slider.
//   onBegin(fresh)  a drag or typing starts (fresh: a new mouse/touch drag)
//   onEnd()         the control lost focus
//   hint            a line under the slider (optional)
function WeightRow({ id, label, tone, value, onChange, max = 100, onBegin, onEnd, disabled = false, hint = null }) {
  // What is typed in the number box, while it is being typed. An empty box
  // is not applied as 0; it waits for a number.
  const [draft, setDraft] = useState(null);
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={["weights-row", `weights-${tone}`, disabled ? "is-muted" : ""].filter(Boolean).join(" ")}>
      <div className="weights-row-head">
        <label className="weights-label" htmlFor={`${id}-range`}>
          <span className="weights-dot" aria-hidden="true" />
          {label}
        </label>
        <span className="weights-value">
          <input
            className="weights-number"
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={draft ?? value}
            disabled={disabled}
            aria-label={`${label} (%)`}
            onFocus={() => onBegin?.(false)}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              const next = Number(text);
              if (text.trim() !== "" && Number.isFinite(next)) onChange(clamp(Math.round(next), 0, max));
            }}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            onBlur={() => {
              setDraft(null);
              onEnd?.();
            }}
          />
          <span className="weights-suffix">%</span>
        </span>
      </div>
      <input
        id={`${id}-range`}
        className="weights-range"
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        style={{ "--fill": `${percent}%` }}
        aria-valuetext={`${value} percent`}
        onPointerDown={() => onBegin?.(true)}
        onFocus={() => onBegin?.(false)}
        onBlur={() => onEnd?.()}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <span className="weights-hint">{hint}</span>}
    </div>
  );
}

export default function WeightsPanel({ showTimeframe = true, className = "" }) {
  const { settings, scored, actions, run } = useAtlasData();
  const [timeframe, setTimeframe] = useTimeframe();
  const weights = settings.weights;
  const nearTerm = timeframe === "nearTerm";

  // The weights when the current drag or key presses started.
  const anchor = useRef(null);
  const begin = (key, fresh) => {
    if (fresh || anchor.current?.key !== key) anchor.current = { key, weights: { ...weights } };
  };
  const end = () => {
    anchor.current = null;
  };

  // Near term: soil value and damage share what safe access leaves
  // ("room"), and are shown as shares of 100.
  const room = 100 - weights.access;
  const shares = nearTermShares(weights);

  const setWeight = (key, value) => {
    const from = anchor.current?.key === key ? anchor.current.weights : weights;
    if (nearTerm && key !== "access") {
      // "value" is a share of 100; turn it back into part of the room.
      const space = 100 - from.access;
      const share = clamp(Number(value) || 0, 0, 100);
      let mine = clamp(Math.round((share / 100) * space), 0, space);
      // When the room is small, one step of the share can round back to
      // the same weight; move by at least one so the slider never sticks.
      const shown = shares[key];
      if (share > shown && mine <= weights[key]) mine = Math.min(space, weights[key] + 1);
      if (share < shown && mine >= weights[key]) mine = Math.max(0, weights[key] - 1);
      const other = key === "soil" ? "damage" : "soil";
      actions.updateSettings({ weights: { access: from.access, [key]: mine, [other]: space - mine } });
      return;
    }
    actions.updateSettings({ weights: rebalanceWeights(from, key, value) });
  };

  const shownKeys = nearTerm ? ["soil", "damage"] : WEIGHT_KEYS;
  // Postwar (Long term) where feasibility is not measured: its weight stays
  // (one saved set for both time frames) but changes no order, and the
  // line under it says so, in the report's words (overview.js
  // longTermAccessNote): "Feasibility is not measured here: it is full
  // everywhere, so the order follows value and damage".
  const accessHint = !nearTerm && run && !accessMeasured(run) ? longTermNote(run) : null;

  // The share of black soil the cutoff really leaves out. In a small area
  // with few squares it can differ a little from the slider; then it shows.
  const asidePercent = Math.round((scored?.setAsideShare ?? 0) * 100);
  const showAside = nearTerm && (!run || accessMeasured(run)) && scored?.settings.gatePercentile > 0 && asidePercent !== scored.settings.gatePercentile;

  return (
    <section className={["weights", className].filter(Boolean).join(" ")} aria-label="Weights">
      <div className="weights-head">
        <h2>Weights</h2>
        {!isDefaultSettings(settings) && (
          <button type="button" className="weights-reset" onClick={actions.resetSettings}>
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      {showTimeframe && (
        <Segmented options={timeframeOptions(run)} value={timeframe} onChange={setTimeframe} ariaLabel="Time frame" />
      )}

      {/* The weights side by side as one bar. */}
      <div className="weights-stack" aria-hidden="true">
        {shownKeys.map((key) => (
          <span key={key} className={`weights-stack-part weights-${LABELS[key].tone}`} style={{ flexGrow: nearTerm ? shares[key] : weights[key], flexBasis: 0 }} />
        ))}
      </div>

      <div className="weights-rows">
        {shownKeys.map((key) => (
          <WeightRow
            key={key}
            id={`weight-${key}`}
            label={LABELS[key].label}
            tone={LABELS[key].tone}
            value={nearTerm ? shares[key] : weights[key]}
            disabled={nearTerm && room <= 0}
            onBegin={(fresh) => begin(key, fresh)}
            onEnd={end}
            onChange={(value) => setWeight(key, value)}
            hint={key === "access" ? accessHint : null}
          />
        ))}

        {/* At peace with no ACLED file (or in a month before its war began,
            or in a war where no fire looked like fighting) nothing can be
            left out: feasibility is 100 everywhere, so the cutoff slider
            would change nothing. The note says why: "Feasibility not
            measured here (no war recorded)" and so on (overview.js
            setAsideNote). */}
        {nearTerm && run && !accessMeasured(run) && <p className="weights-note">{setAsideNote(run)}</p>}
        {nearTerm && (!run || accessMeasured(run)) && (
          <WeightRow
            id="weight-gate"
            label="Feasibility cutoff"
            tone="blue"
            value={settings.gatePercentile}
            max={60}
            hint={`Leave out the least feasible ${settings.gatePercentile}% for now`}
            onChange={(value) => actions.updateSettings({ gatePercentile: value })}
          />
        )}
        {showAside && <p className="weights-note">{asidePercent}% left out in practice</p>}
      </div>
    </section>
  );
}
