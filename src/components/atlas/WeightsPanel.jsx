// WHAT THIS FILE DOES
// The weights control on the left of the Atlas map: how much soil value,
// damage and safe access count, plus the Near term | Postwar switch.
// Every change recolours the map at once and is saved for the team.
//
//   Postwar    three sliders, Soil value / Damage / Safe access, that
//              always add up to 100: moving one shares the rest between
//              the other two.
//   Near term  safe access works as a cutoff instead of a weight (the least
//              safe land is set aside), so the panel shows Soil value and
//              Damage as shares of 100 that trade with each other (30 / 40
//              shows as 43% / 57%), and the cutoff "Set aside least safe
//              30%". The Postwar safe-access weight is kept as it is.
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
import { timeframeOptions } from "../../lib/atlas/overview.js";
import "./atlas.css";

const LABELS = {
  soil: { label: "Soil value", tone: "green" },
  damage: { label: "Damage", tone: "red" },
  access: { label: "Safe access", tone: "blue" },
};

// The Near term | Postwar switch ("Long term" where no war is listed): timeframeOptions(run).

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// One slider row: name, big percentage (also typeable) and the slider.
//   onBegin(fresh)  a drag or typing starts (fresh: a new mouse/touch drag)
//   onEnd()         the control lost focus
function WeightRow({ id, label, tone, value, onChange, max = 100, onBegin, onEnd, disabled = false }) {
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

  // The share of black soil the cutoff really sets aside. In a small area
  // with few squares it can differ a little from the slider; then it shows.
  const asidePercent = Math.round((scored?.setAsideShare ?? 0) * 100);
  const showAside = nearTerm && scored?.settings.gatePercentile > 0 && asidePercent !== scored.settings.gatePercentile;

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
          />
        ))}

        {nearTerm && (
          <WeightRow
            id="weight-gate"
            label="Set aside least safe"
            tone="blue"
            value={settings.gatePercentile}
            max={60}
            onChange={(value) => actions.updateSettings({ gatePercentile: value })}
          />
        )}
        {showAside && <p className="weights-note">{asidePercent}% set aside in practice</p>}
      </div>
    </section>
  );
}
