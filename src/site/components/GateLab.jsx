// WHAT THIS FILE DOES
// The gate laboratory on the website's Methodology page: a small piece of
// the real arithmetic that the reader can play with. One imagined place
// has high value and heavy damage; the reader moves its feasibility, the
// cutoff and the weights, and watches its priority change under the two
// time frames (Near term: the gate; Post-crisis: the blend). The curve
// shows the priority at every feasibility for the current settings.
//
// It is a data fragment (its root carries data-ui), so it keeps its own
// small interface text and its chart's axis lines. The numbers are the
// app's own formulas (src/lib/atlas/scoring.js); the styles are the
// ".gl-" block of src/site/pages/pages.css.
//
// WHO EDITS IT
// Whoever changes the method. Keep the two formulas in step with the app.

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "./motion.jsx";
import { NUMBERS } from "../content/site.js";

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Near term: the gate. A place below the cutoff gets zero; across the ramp
// (width w) the gate opens; above it, value and damage set the priority.
export function nearTermScore(v, d, f, tau, w, wv, wd) {
  const gate = clamp01((f - tau) / w);
  const sv = wv / (wv + wd);
  const sd = wd / (wv + wd);
  return gate * (sv * Math.sqrt(v) + sd * Math.sqrt(d)) ** 2;
}

// Post-crisis: the blend. All three scores in a weighted power mean.
export function postCrisisScore(v, d, f, wv, wd, wf, r = 0.5) {
  const total = wv + wd + wf;
  return ((wv / total) * v ** r + (wd / total) * d ** r + (wf / total) * f ** r) ** (1 / r);
}

const VALUE = 0.72;
const DAMAGE = 0.81;

// The chart's drawing box, in its own units.
const W = 520;
const H = 240;
const PAD = { l: 36, r: 12, t: 12, b: 30 };

export default function GateLab() {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState("near");
  const [feas, setFeas] = useState(0.35);
  const [cutoff, setCutoff] = useState(0.3);
  const [wv, setWv] = useState(30);
  const [wd, setWd] = useState(40);
  const [wf, setWf] = useState(30);

  const near = mode === "near";
  const score = near ? nearTermScore(VALUE, DAMAGE, feas, cutoff, NUMBERS.rampWidth, wv, wd) : postCrisisScore(VALUE, DAMAGE, feas, wv, wd, wf);
  const gate = clamp01((feas - cutoff) / NUMBERS.rampWidth);

  // The curve: priority against feasibility, for the current settings.
  const curve = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 60; i += 1) {
      const f = i / 60;
      const s = near ? nearTermScore(VALUE, DAMAGE, f, cutoff, NUMBERS.rampWidth, wv, wd) : postCrisisScore(VALUE, DAMAGE, f, wv, wd, wf);
      points.push([f, s]);
    }
    return points;
  }, [near, cutoff, wv, wd, wf]);

  const x = (f) => PAD.l + f * (W - PAD.l - PAD.r);
  const y = (s) => H - PAD.b - s * (H - PAD.t - PAD.b);
  const path = curve.map(([f, s], i) => `${i ? "L" : "M"}${x(f).toFixed(1)},${y(s).toFixed(1)}`).join("");
  const gateWord = gate === 0 ? "Left out" : gate === 1 ? "Open" : `${Math.round(gate * 100)}% open`;

  return (
    <div className="gl" data-ui>
      <div className="gl-controls">
        <div className="gl-modes" role="group" aria-label="Time frame">
          <button type="button" aria-pressed={near} onClick={() => setMode("near")}>
            Near term
          </button>
          <button type="button" aria-pressed={!near} onClick={() => setMode("post")}>
            Post-crisis
          </button>
        </div>
        <p className="gl-note">
          One imagined place with value {Math.round(VALUE * 100)} and damage {Math.round(DAMAGE * 100)}. Move its feasibility and watch what the two time frames do with it.
        </p>
        <div className="gl-control">
          <label htmlFor="gl-feas">
            Feasibility of this place <b>{Math.round(feas * 100)}</b>
          </label>
          <input id="gl-feas" type="range" min="0" max="100" value={Math.round(feas * 100)} onChange={(e) => setFeas(Number(e.target.value) / 100)} />
        </div>
        {near ? (
          <div className="gl-control">
            <label htmlFor="gl-cutoff">
              Feasibility cutoff <b>{Math.round(cutoff * 100)}</b>
            </label>
            <input id="gl-cutoff" type="range" min="0" max="60" value={Math.round(cutoff * 100)} onChange={(e) => setCutoff(Number(e.target.value) / 100)} />
          </div>
        ) : (
          <div className="gl-control">
            <label htmlFor="gl-wf">
              Feasibility weight <b>{wf}</b>
            </label>
            <input id="gl-wf" type="range" min="0" max="80" value={wf} onChange={(e) => setWf(Number(e.target.value))} />
          </div>
        )}
        <div className="gl-control">
          <label htmlFor="gl-wv">
            Value weight <b>{wv}</b>
          </label>
          <input id="gl-wv" type="range" min="0" max="80" value={wv} onChange={(e) => setWv(Number(e.target.value))} />
        </div>
        <div className="gl-control">
          <label htmlFor="gl-wd">
            Damage weight <b>{wd}</b>
          </label>
          <input id="gl-wd" type="range" min="0" max="80" value={wd} onChange={(e) => setWd(Number(e.target.value))} />
        </div>
        <div className="gl-readout" aria-live="polite">
          <div>
            <span>Priority</span>
            <b>{Math.round(score * 100)}</b>
          </div>
          <div>
            <span>The gate</span>
            <b>{near ? gateWord : "Not used"}</b>
          </div>
        </div>
      </div>
      <div className="gl-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Priority against feasibility for the current settings">
          {near && (
            <>
              <rect x={x(0)} y={PAD.t} width={x(cutoff) - x(0)} height={H - PAD.t - PAD.b} fill="var(--data-war, #c45a3a)" opacity="0.18" />
              <rect x={x(cutoff)} y={PAD.t} width={x(Math.min(1, cutoff + NUMBERS.rampWidth)) - x(cutoff)} height={H - PAD.t - PAD.b} fill="var(--data-arc, #e3b04b)" opacity="0.25" />
            </>
          )}
          <line className="gl-axis" x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} />
          <line className="gl-axis" x1={PAD.l} y1={y(0)} x2={PAD.l} y2={PAD.t} />
          {[0, 0.5, 1].map((t) => (
            <text key={`x${t}`} x={x(t)} y={H - 10} textAnchor="middle">
              {Math.round(t * 100)}
            </text>
          ))}
          {[0, 0.5, 1].map((t) => (
            <text key={`y${t}`} x={PAD.l - 8} y={y(t) + 4} textAnchor="end">
              {Math.round(t * 100)}
            </text>
          ))}
          <text x={W - PAD.r} y={H - 10} textAnchor="end">
            feasibility
          </text>
          <motion.path d={path} fill="none" stroke="var(--accent, #1f4a2a)" strokeWidth="3" strokeLinejoin="round" initial={false} animate={{ d: path }} transition={reduced ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }} />
          <motion.circle r="7" fill="var(--ink, #1b1713)" initial={false} animate={{ cx: x(feas), cy: y(score) }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }} />
        </svg>
        <div className="gl-legend">
          <span>
            <i style={{ background: "var(--accent, #1f4a2a)" }} />
            priority of this place, at every feasibility
          </span>
          {near && (
            <>
              <span>
                <i style={{ background: "var(--data-war, #c45a3a)", opacity: 0.6 }} />
                below the cutoff: left out
              </span>
              <span>
                <i style={{ background: "var(--data-arc, #e3b04b)", opacity: 0.7 }} />
                the ramp, width {NUMBERS.rampWidth}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
