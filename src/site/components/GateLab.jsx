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
// ".gl-" block of src/site/pages/pages.css. Every word a reader sees goes
// through t() (useT("labs"), src/site/i18n/).
//
// The chart is drawn at the width it really has on the page (measured,
// and again whenever that width changes), one unit to one pixel, so its
// numbers are real 14 px text on a phone as on a wide screen, instead of
// a drawing that shrinks with the screen. Under the plot come the numbers
// (0, 50, 100), then the axis's name on a line of its own.
//
// WHO EDITS IT
// Whoever changes the method. Keep the two formulas in step with the app.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "./motion.jsx";
import { NUMBERS, formatInt } from "../content/site.js";
import { useT } from "../i18n/i18n.js";

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Near term: the gate. A place below the cutoff gets zero; across the ramp
// (width w) the gate opens; above it, value and damage set the priority.
// With both weights at 0 (the sliders allow it), value and damage count
// half each, as in the app (src/lib/atlas/scoring.js), so the chart never
// breaks.
export function nearTermScore(v, d, f, tau, w, wv, wd) {
  const gate = clamp01((f - tau) / w);
  const total = wv + wd;
  const sv = total > 0 ? wv / total : 0.5;
  const sd = total > 0 ? wd / total : 0.5;
  return gate * (sv * Math.sqrt(v) + sd * Math.sqrt(d)) ** 2;
}

// Post-crisis: the blend. All three scores in a weighted power mean. With
// every weight at 0 the three count equally (a chart needs a number).
export function postCrisisScore(v, d, f, wv, wd, wf, r = 0.5) {
  const total = wv + wd + wf;
  const [sv, sd, sf] = total > 0 ? [wv / total, wd / total, wf / total] : [1 / 3, 1 / 3, 1 / 3];
  return (sv * v ** r + sd * d ** r + sf * f ** r) ** (1 / r);
}

const VALUE = 0.72;
const DAMAGE = 0.81;

// The chart, in screen pixels: its height, and the room around the plot
// for the numbers at the left and, at the bottom, the numbers and the
// axis's name. The width is the chart box's own (FIRST_WIDTH only until it
// is measured, before the first paint).
const H = 220;
const PAD = { l: 44, r: 20, t: 14, b: 56 };
const FIRST_WIDTH = 480;

// The width of a box in pixels, followed when the page is resized or the
// layout changes (clientWidth: transforms such as an entrance do not
// count).
function useBoxWidth(ref, fallback) {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const measure = () => {
      if (box.clientWidth > 0) setWidth(box.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function GateLab() {
  const t = useT("labs");
  const reduced = useReducedMotion();
  const chartRef = useRef(null);
  const W = useBoxWidth(chartRef, FIRST_WIDTH);
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
  const gateWord = gate === 0 ? t("Left out") : gate === 1 ? t("Open") : t("{n}% open", { n: Math.round(gate * 100) });

  return (
    <div className="gl" data-ui>
      <div className="gl-controls">
        <div className="gl-modes" role="group" aria-label={t("Time frame")}>
          <button type="button" aria-pressed={near} onClick={() => setMode("near")}>
            {t("Near term")}
          </button>
          <button type="button" aria-pressed={!near} onClick={() => setMode("post")}>
            {t("Post-crisis")}
          </button>
        </div>
        <p className="gl-note">
          {t("One imagined place with value {value} and damage {damage}. Move its feasibility and watch what the two time frames do with it.", { value: Math.round(VALUE * 100), damage: Math.round(DAMAGE * 100) })}
        </p>
        <div className="gl-control">
          <label htmlFor="gl-feas">
            {t("Feasibility of this place")} <b>{Math.round(feas * 100)}</b>
          </label>
          <input id="gl-feas" type="range" min="0" max="100" value={Math.round(feas * 100)} onChange={(e) => setFeas(Number(e.target.value) / 100)} />
        </div>
        {near ? (
          <div className="gl-control">
            <label htmlFor="gl-cutoff">
              {t("Feasibility cutoff")} <b>{Math.round(cutoff * 100)}</b>
            </label>
            <input id="gl-cutoff" type="range" min="0" max="60" value={Math.round(cutoff * 100)} onChange={(e) => setCutoff(Number(e.target.value) / 100)} />
          </div>
        ) : (
          <div className="gl-control">
            <label htmlFor="gl-wf">
              {t("Feasibility weight")} <b>{wf}</b>
            </label>
            <input id="gl-wf" type="range" min="0" max="80" value={wf} onChange={(e) => setWf(Number(e.target.value))} />
          </div>
        )}
        <div className="gl-control">
          <label htmlFor="gl-wv">
            {t("Value weight")} <b>{wv}</b>
          </label>
          <input id="gl-wv" type="range" min="0" max="80" value={wv} onChange={(e) => setWv(Number(e.target.value))} />
        </div>
        <div className="gl-control">
          <label htmlFor="gl-wd">
            {t("Damage weight")} <b>{wd}</b>
          </label>
          <input id="gl-wd" type="range" min="0" max="80" value={wd} onChange={(e) => setWd(Number(e.target.value))} />
        </div>
        <div className="gl-readout" aria-live="polite">
          <div>
            <span>{t("Priority")}</span>
            <b>{Math.round(score * 100)}</b>
          </div>
          <div>
            <span>{t("The gate")}</span>
            <b>{near ? gateWord : t("Not used")}</b>
          </div>
        </div>
      </div>
      <div className="gl-chart" ref={chartRef}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Priority against feasibility for the current settings")}>
          {near && (
            <>
              <rect x={x(0)} y={PAD.t} width={x(cutoff) - x(0)} height={H - PAD.t - PAD.b} fill="var(--data-war, #c45a3a)" opacity="0.18" />
              <rect x={x(cutoff)} y={PAD.t} width={x(Math.min(1, cutoff + NUMBERS.rampWidth)) - x(cutoff)} height={H - PAD.t - PAD.b} fill="var(--data-arc, #e3b04b)" opacity="0.25" />
            </>
          )}
          <line className="gl-axis" x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} />
          <line className="gl-axis" x1={PAD.l} y1={y(0)} x2={PAD.l} y2={PAD.t} />
          {[0, 0.5, 1].map((t) => (
            <text key={`x${t}`} x={x(t)} y={y(0) + 20} textAnchor="middle">
              {Math.round(t * 100)}
            </text>
          ))}
          {[0, 0.5, 1].map((t) => (
            <text key={`y${t}`} x={PAD.l - 10} y={y(t) + 5} textAnchor="end">
              {Math.round(t * 100)}
            </text>
          ))}
          {/* The axis's name on its own line under the numbers, centred under the plot. */}
          <text x={(x(0) + x(1)) / 2} y={H - 10} textAnchor="middle">
            {t("Feasibility")}
          </text>
          {/* Drawn again (key) when the width changes, so a resize moves the curve and the dot at once instead of animating them. */}
          <motion.path key={`curve-${W}`} d={path} fill="none" stroke="var(--accent, #1f4a2a)" strokeWidth="3" strokeLinejoin="round" initial={false} animate={{ d: path }} transition={reduced ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }} />
          <motion.circle key={`dot-${W}`} r="7" fill="var(--ink, #1b1713)" initial={false} animate={{ cx: x(feas), cy: y(score) }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }} />
        </svg>
        <div className="gl-legend">
          <span>
            <i style={{ background: "var(--accent, #1f4a2a)" }} />
            {t("priority of this place, at every feasibility")}
          </span>
          {near && (
            <>
              <span>
                <i style={{ background: "var(--data-war, #c45a3a)", opacity: 0.6 }} />
                {t("below the cutoff: left out")}
              </span>
              <span>
                <i style={{ background: "var(--data-arc, #e3b04b)", opacity: 0.7 }} />
                {t("the ramp, width {width}", { width: formatInt(NUMBERS.rampWidth, t.locale) })}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
