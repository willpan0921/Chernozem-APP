// WHAT THIS FILE DOES
// The website's "Method" page (chernozem.app/method): how the Atlas
// ranking works, from the research paper to the app. The three scores,
// the gate (Near term) and the blend (Post-crisis) with their formulas, a
// small laboratory where the reader moves the cutoff and the weights and
// watches one place's priority change, why ten operators were compared,
// how it was checked, and the limits.
//
// WHO EDITS IT
// The founder, for the words. The formulas and parameters match
// src/lib/atlas/scoring.js and the paper; keep them in step.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import PageHero from "../components/PageHero.jsx";
import DemoRanking from "../components/DemoRanking.jsx";
import { Arrow, CountUp, Reveal, Spotlight, Stagger, StaggerItem, useReducedMotion } from "../components/motion.jsx";
import { BookOpen, ShieldAlert, CheckCircle2 } from "../components/Icons.jsx";
import { LINKS, NUMBERS, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

// The paper's ten operators, by the share of sampled cropland each gives an
// exact zero (the veto) and how much one input "owns" the result.
// Only the figures the paper states (Section 5.3): the share of sampled
// cropland each operator gives an exact zero, and "ownership", the larger
// correlation of its priority with value × damage or with feasibility alone.
const OPERATORS = [
  { name: "Gated ramp", zeros: 29.6, ownership: 0.48, best: true },
  { name: "Product family (product, geometric and hard power means)", zeros: 10.8, ownership: 0.85 },
  { name: "Logistic gate", zeros: 1.8, ownership: 0.86 },
  { name: "Percentile rank", zeros: 0, ownership: null },
];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// The app's two formulas (src/lib/atlas/scoring.js) on one place.
function nearTermScore(v, d, f, tau, w, wv, wd) {
  const gate = clamp01((f - tau) / w);
  const sv = wv / (wv + wd);
  const sd = wd / (wv + wd);
  return gate * (sv * Math.sqrt(v) + sd * Math.sqrt(d)) ** 2;
}

function postCrisisScore(v, d, f, wv, wd, wf, r = 0.5) {
  const total = wv + wd + wf;
  return ((wv / total) * v ** r + (wd / total) * d ** r + (wf / total) * f ** r) ** (1 / r);
}

function GateLab() {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState("near");
  const [feas, setFeas] = useState(0.35);
  const [cutoff, setCutoff] = useState(0.3);
  const [wv, setWv] = useState(30);
  const [wd, setWd] = useState(40);
  const [wf, setWf] = useState(30);
  const value = 0.72;
  const damage = 0.81;

  const score = mode === "near" ? nearTermScore(value, damage, feas, cutoff, NUMBERS.rampWidth, wv, wd) : postCrisisScore(value, damage, feas, wv, wd, wf);
  const gate = clamp01((feas - cutoff) / NUMBERS.rampWidth);

  // The curve: priority against feasibility, for the current settings.
  const curve = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 60; i += 1) {
      const f = i / 60;
      const s = mode === "near" ? nearTermScore(value, damage, f, cutoff, NUMBERS.rampWidth, wv, wd) : postCrisisScore(value, damage, f, wv, wd, wf);
      points.push([f, s]);
    }
    return points;
  }, [mode, cutoff, wv, wd, wf]);

  const W = 520;
  const H = 240;
  const pad = { l: 36, r: 12, t: 12, b: 30 };
  const x = (f) => pad.l + f * (W - pad.l - pad.r);
  const y = (s) => H - pad.b - s * (H - pad.t - pad.b);
  const path = curve.map(([f, s], i) => `${i ? "L" : "M"}${x(f).toFixed(1)},${y(s).toFixed(1)}`).join("");

  return (
    <div className="gate-lab">
      <div className="gate-lab-controls">
        <div className="gate-lab-mode" role="tablist" aria-label="Time frame">
          {[
            ["near", "Near term"],
            ["post", "Post-crisis"],
          ].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? "is-on" : ""} onClick={() => setMode(key)}>
              {mode === key && <motion.span layoutId="gate-lab-pill" className="gate-lab-pill" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          One imagined place with high value ({Math.round(value * 100)}) and heavy damage ({Math.round(damage * 100)}). Move its feasibility and watch what the two time frames do with it. In the app, τ is the feasibility below which the least feasible {NUMBERS.gatePercentile}% of black soil sits.
        </p>
        <div className="gate-lab-control">
          <label>
            Feasibility of this place <b>{Math.round(feas * 100)}</b>
          </label>
          <input type="range" min="0" max="100" value={Math.round(feas * 100)} onChange={(e) => setFeas(Number(e.target.value) / 100)} aria-label="Feasibility" />
        </div>
        {mode === "near" ? (
          <div className="gate-lab-control">
            <label>
              Feasibility cutoff τ, as a feasibility value <b>{Math.round(cutoff * 100)}</b>
            </label>
            <input type="range" min="0" max="60" value={Math.round(cutoff * 100)} onChange={(e) => setCutoff(Number(e.target.value) / 100)} aria-label="Cutoff" />
          </div>
        ) : (
          <div className="gate-lab-control">
            <label>
              Feasibility weight <b>{wf}</b>
            </label>
            <input type="range" min="0" max="80" value={wf} onChange={(e) => setWf(Number(e.target.value))} aria-label="Feasibility weight" />
          </div>
        )}
        <div className="gate-lab-control">
          <label>
            Value weight <b>{wv}</b>
          </label>
          <input type="range" min="0" max="80" value={wv} onChange={(e) => setWv(Number(e.target.value))} aria-label="Value weight" />
        </div>
        <div className="gate-lab-control">
          <label>
            Damage weight <b>{wd}</b>
          </label>
          <input type="range" min="0" max="80" value={wd} onChange={(e) => setWd(Number(e.target.value))} aria-label="Damage weight" />
        </div>
        <div className="gate-lab-readout" aria-live="polite">
          <div>
            <span>Priority</span>
            <b>{Math.round(score * 100)}</b>
          </div>
          <div>
            <span>{mode === "near" ? "Gate (ramp)" : "No gate"}</span>
            <b>{mode === "near" ? (gate === 0 ? "Left out" : gate === 1 ? "Open" : `${Math.round(gate * 100)}%`) : "Blended"}</b>
          </div>
        </div>
      </div>
      <div className="gate-lab-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Priority against feasibility for the current settings">
          <line className="axis" x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} />
          <line className="axis" x1={pad.l} y1={y(0)} x2={pad.l} y2={pad.t} />
          {[0, 0.5, 1].map((t) => (
            <text key={t} x={x(t)} y={H - 10} textAnchor="middle">
              {Math.round(t * 100)}
            </text>
          ))}
          {[0, 0.5, 1].map((t) => (
            <text key={`y${t}`} x={pad.l - 8} y={y(t) + 4} textAnchor="end">
              {Math.round(t * 100)}
            </text>
          ))}
          <text x={W - pad.r} y={H - 10} textAnchor="end">
            feasibility →
          </text>
          {mode === "near" && (
            <>
              <rect x={x(0)} y={pad.t} width={x(cutoff) - x(0)} height={H - pad.t - pad.b} fill="rgba(196, 90, 58, 0.12)" />
              <rect x={x(cutoff)} y={pad.t} width={x(Math.min(1, cutoff + NUMBERS.rampWidth)) - x(cutoff)} height={H - pad.t - pad.b} fill="rgba(227, 176, 75, 0.12)" />
            </>
          )}
          <motion.path d={path} fill="none" stroke="#b8cb9f" strokeWidth="3" strokeLinejoin="round" initial={false} animate={{ d: path }} transition={reduced ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }} />
          <motion.circle r="7" fill="#e3b04b" stroke="#0f0d0a" strokeWidth="2" initial={false} animate={{ cx: x(feas), cy: y(score) }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }} />
        </svg>
        <div className="gate-lab-legend">
          <span>
            <i style={{ background: "#b8cb9f" }} />
            priority of this place, at every feasibility
          </span>
          {mode === "near" && (
            <>
              <span>
                <i style={{ background: "rgba(196, 90, 58, 0.6)" }} />
                below the cutoff: left out (zero)
              </span>
              <span>
                <i style={{ background: "rgba(227, 176, 75, 0.7)" }} />
                the ramp, width {NUMBERS.rampWidth}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MethodPage() {
  usePageTitle("Method");
  const w = NUMBERS.postWeights;
  return (
    <>
      <PageHero eyebrow="Methodology" title="Gate first. *Then* rank." lead="Chernozem's Atlas ranks land with gated aggregation, the algorithm from William Pan's research on Ukraine's black soil. This page explains it in plain words, with the formulas the app really uses.">
        <nav className="toc" aria-label="On this page">
          <a href="#scores">Three scores</a>
          <a href="#gate">The gate</a>
          <a href="#lab">Try it</a>
          <a href="#demo">On Ukraine</a>
          <a href="#operators">Ten operators</a>
          <a href="#checks">Checks</a>
          <a href="#limits">Limits</a>
        </nav>
      </PageHero>

      <section className="section anchor" id="scores">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">Three questions about every square</Reveal>
            <Reveal>
              <h2 className="h-1">Priority exists only where all three hold at once.</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="lead">Is the soil worth restoring? Has it been harmed? Can people reach it? A hectare of chernozem and a hectare of marginal soil stop being interchangeable targets, and unreachable land stops being a low-ranked candidate and becomes no candidate at all.</p>
            </Reveal>
          </div>
          <Stagger className="dims">
            <StaggerItem className="dim dim-value">
              <span className="dim-letter">V</span>
              <h3>Value</h3>
              <p>How much black soil and cropland the square holds: the share of the square on black soil (Mollisols on the OpenLandMap soil map; the paper used the SoilGrids chernozem probability) and the cropland share from 10 m land cover. Value is never amplified: it screens candidates and says nothing about urgency.</p>
            </StaggerItem>
            <StaggerItem className="dim dim-damage">
              <span className="dim-letter">D</span>
              <h3>Damage</h3>
              <p>Fires above the square&apos;s own normal years, in the worst year of the war, and lasting change in the ground seen by radar across two or more complete seasons. Heavy damage: a radar change of 3 dB or more, or 2 dB with a fire within a kilometre.</p>
            </StaggerItem>
            <StaggerItem className="dim dim-access">
              <span className="dim-letter">F</span>
              <h3>Feasibility</h3>
              <p>How safely the square can be reached and worked now: the distance to recorded fighting (ACLED battles when a file is provided, otherwise fires that look like fighting), full at 100 km. It certifies nothing about mines; it ranks scenarios.</p>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <section className="section section-dark anchor" id="gate">
        <div className="wrap">
          <div className="split" style={{ alignItems: "start" }}>
            <div>
              <Reveal className="eyebrow">Two regimes, two operator forms</Reveal>
              <Reveal>
                <h2 className="h-1">During a crisis, feasibility is a precondition. After it, a pace factor.</h2>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="prose" style={{ marginTop: 22 }}>
                  <p>
                    Land behind a front line cannot be entered at any price, so in the <strong>near term</strong> feasibility is a gate: the least feasible share of land (the {NUMBERS.gatePercentile}th percentile by default) is left out entirely, a ramp of width {NUMBERS.rampWidth} opens the gate gradually above it, and once open, extra distance from danger earns no further credit. Value and damage then set the order.
                  </p>
                  <p>
                    Once fighting stops, ordnance and ruined roads make work slower and dearer but not impossible, so <strong>post-crisis</strong> feasibility becomes a weight. The gate is dropped for a weighted power mean of all three scores: idempotent (equal inputs return their common value instead of deflating), with damage leading and feasibility still shaping the order.
                  </p>
                  <p>The two regimes differ in operator form, not in parameter values. That is the paper&apos;s central result, and it is why one slider cannot turn Near term into Post-crisis.</p>
                </div>
              </Reveal>
            </div>
            <div style={{ display: "grid", gap: 18 }}>
              <Reveal delay={0.1}>
                <div className="eyebrow">Near term · gated</div>
                <div className="formula">
                  g(F) <span className="op">=</span> clamp((F − τ) / w, 0, 1)
                  <br />
                  P <span className="op">=</span> g(F) · (w<sub>V</sub>·√V + w<sub>D</sub>·√D)<sup>2</sup>
                </div>
                <p className="muted" style={{ marginTop: 10, fontSize: "0.9rem" }}>
                  τ = the {NUMBERS.gatePercentile}th percentile of feasibility over the area&apos;s black soil; w = {NUMBERS.rampWidth}; the weights of value and damage are the sliders, re-scaled to sum to one. The squared sum of square roots is a power mean with r = {NUMBERS.postExponent}.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <div className="eyebrow">Post-crisis · blended</div>
                <div className="formula">
                  P <span className="op">=</span> [ {w.value}·V<sup>r</sup> + {w.damage}·D<sup>r</sup> + {w.feasibility}·F<sup>r</sup> ]<sup>1/r</sup>
                  <br />
                  <span style={{ whiteSpace: "nowrap" }}>r = {NUMBERS.postExponent}</span>
                </div>
                <p className="muted" style={{ marginTop: 10, fontSize: "0.9rem" }}>
                  Default weights {w.value * 100} / {w.damage * 100} / {w.feasibility * 100}; all three are sliders in the app. A smooth logistic gate was tested and rejected: it never reaches zero, so a devastated, unreachable place could still outrank a workable one.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-dark-2 anchor" id="lab">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">Try it</Reveal>
            <Reveal>
              <h2 className="h-1">Move the gate yourself.</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="lead">The same arithmetic as the app, on one imagined place. In the near term its priority is exactly zero below the cutoff, climbs through the ramp and then stops caring about feasibility. Post-crisis, feasibility only tilts the result.</p>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <GateLab />
          </Reveal>
        </div>
      </section>

      <section className="section anchor" id="demo">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">On real data</Reveal>
            <Reveal>
              <h2 className="h-1">Ukraine, {NUMBERS.ukraineMonth}: {formatInt(NUMBERS.ukraineSquares)} squares, rolled up to oblasts.</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="lead">The app scores every square, then each oblast as the black-soil-weighted mean of its squares, and ranks the oblasts with the same two formulas. This is the app&apos;s own method on the September 2026 run with the default settings, with Crimea left out of the ranking as in the paper (the app itself ranks it).</p>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <DemoRanking />
          </Reveal>
        </div>
      </section>

      <section className="section section-cream-2 anchor" id="operators">
        <div className="wrap">
          <div className="split" style={{ alignItems: "start" }}>
            <div>
              <Reveal className="eyebrow">Why a gate, and not a multiplication</Reveal>
              <Reveal>
                <h2 className="h-1">Ten operators on identical inputs.</h2>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="prose" style={{ marginTop: 22 }}>
                  <p>Damage and access oppose one another in a war: the land is damaged because fighting happened there, and fighting is why nobody can enter. Under that condition one multiplication cannot both exclude the unreachable and rank the reachable, and which failure appears depends only on how spread out the feasibility layer happens to be.</p>
                  <p>
                    With a nearly flat feasibility layer, the wartime ranking correlated at 0.993 with one that ignored feasibility altogether; once the layer was spread across the unit interval it dominated everything and the correlation inverted to −0.64. Of the {NUMBERS.paperOperators} operators compared, only the gated ramp keeps an exact veto (29.6% exact zeros) without being captured by either input (ownership 0.48).
                  </p>
                </div>
              </Reveal>
            </div>
            <Reveal delay={0.15}>
              <Spotlight className="card-flat" style={{ padding: 24 }}>
                <div className="card-num">Share of sampled cropland given an exact zero (the veto)</div>
                <div className="operators">
                  {OPERATORS.map((op) => (
                    <div key={op.name} className={`operator${op.best ? " is-best" : ""}`}>
                      <span>{op.name}</span>
                      <span className="operator-bar">
                        <motion.i initial={{ width: 0 }} whileInView={{ width: `${Math.max(1.5, op.zeros * 3)}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
                      </span>
                      <span className="mono" style={{ textAlign: "right", fontSize: "0.86rem" }}>
                        {op.zeros}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="card-num" style={{ marginTop: 22 }}>Ownership: how far one input captures the result (lower is better)</div>
                <div className="operators">
                  {OPERATORS.filter((op) => op.ownership != null).map((op) => (
                    <div key={`${op.name}-own`} className={`operator${op.best ? " is-best" : ""}`}>
                      <span>{op.name}</span>
                      <span className="operator-bar">
                        <motion.i initial={{ width: 0 }} whileInView={{ width: `${op.ownership * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
                      </span>
                      <span className="mono" style={{ textAlign: "right", fontSize: "0.86rem" }}>
                        {op.ownership.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="muted" style={{ marginTop: 16, fontSize: "0.84rem" }}>
                  From the paper (Section 5.3), which compared ten operators. The logistic gate&apos;s 1.8% confirms that a smooth gate does not gate; the percentile-rank operator keeps no veto at all. The product is captured by feasibility during the war and by value and damage after it.
                </p>
              </Spotlight>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section anchor" id="checks">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">Checked against records the model never saw</Reveal>
            <Reveal>
              <h2 className="h-1">Three independent referents.</h2>
            </Reveal>
          </div>
          <Stagger className="grid grid-3">
            <StaggerItem>
              <Spotlight>
                <span className="card-num">ACLED · conflict record</span>
                <div className="stat-value">
                  ρ <CountUp to={NUMBERS.acledCorrelation} decimals={2} />
                </div>
                <p className="card-text" style={{ marginTop: 10 }}>
                  Radar disturbance against the density of {formatInt(NUMBERS.acledEvents)} human-coded explosion and remote-violence events (2022 to 2024), sharing no event with the battles that define feasibility. Fire anomalies: ρ 0.73. Both p &lt; 0.001.
                </p>
              </Spotlight>
            </StaggerItem>
            <StaggerItem>
              <Spotlight>
                <span className="card-num">UkrStat · harvest outcomes</span>
                <div className="stat-value">
                  r <CountUp to={NUMBERS.harvestCorrelation} decimals={2} />
                </div>
                <p className="card-text" style={{ marginTop: 10 }}>
                  Oblast damage against the change in crop production from 2019 to 2020 to 2022 to 2023, across 21 oblasts: more damage, bigger harvest losses. No causal claim; production statistics exclude occupied territory.
                </p>
              </Spotlight>
            </StaggerItem>
            <StaggerItem>
              <Spotlight>
                <span className="card-num">Sentinel-2 · a third sensing physics</span>
                <div className="stat-value">−0.135</div>
                <p className="card-text" style={{ marginTop: 10 }}>
                  Summer greenness change, 2021 to 2024: four conflict oblasts against two low-damage controls, with 54 to 74% of conflict-oblast pixels browning by more than 0.10 against 17 to 23% in the controls.
                </p>
              </Spotlight>
            </StaggerItem>
          </Stagger>
          <Reveal className="prose" style={{ marginTop: 40 }}>
            <p>
              Parameter sensitivity: across 27 near-term settings (cutoffs at the 20th, 30th and 40th percentiles, ramp widths of 0.1 to 0.3, damage exponents of 1.3 to 1.7) the top-five set is unchanged on 63% of settings, with Kendall τ against the baseline averaging +0.87; Odesa, Poltava, Cherkasy, Mykolaiv and Kirovohrad hold the top five across the whole threshold range. Post-crisis, across 28 settings, the eastern result depends on keeping partial conjunction (r below 1), not on any particular weighting. In the app, the checks continue: every month&apos;s run is compared with the last, and the disaster methods are checked against Copernicus maps (see <Link to="/technology#reliability">Technology</Link>).
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section section-dark anchor" id="limits">
        <div className="wrap">
          <div className="split" style={{ alignItems: "start" }}>
            <div>
              <Reveal className="eyebrow">Limits, stated plainly</Reveal>
              <Reveal>
                <h2 className="h-1">A screen, not a survey.</h2>
              </Reveal>
            </div>
            <Reveal delay={0.1}>
              <ul className="feature-list">
                <li>
                  <ShieldAlert size={20} />
                  <div>
                    <strong>It never declares land safe.</strong>
                    <span>Feasibility is distance to fighting. Mines, chemical residue and subsurface compaction leave no satellite signature; clearance is for certified deminers and local authorities.</span>
                  </div>
                </li>
                <li>
                  <ShieldAlert size={20} />
                  <div>
                    <strong>Feasibility can be rough.</strong>
                    <span>Without an ACLED file, fighting is inferred from unusual fires. Where none are found the app says so (&ldquo;not measured&rdquo;) rather than guessing, and nothing is set aside.</span>
                  </div>
                </li>
                <li>
                  <ShieldAlert size={20} />
                  <div>
                    <strong>No ground validation inside the war zone.</strong>
                    <span>That limitation is structural to every study of this kind and is why the checks use independent records. Field partnership is the first item on the roadmap.</span>
                  </div>
                </li>
                <li>
                  <ShieldAlert size={20} />
                  <div>
                    <strong>Post-crisis rests on face validity and internal coherence.</strong>
                    <span>Its ordering agrees with what is known of the war, but no outside record yet shows that it would improve recovery. The paper says so, and so does the app.</span>
                  </div>
                </li>
                <li>
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>Every composite is published with its components.</strong>
                    <span>Click any square or state and the three scores, the raw readings and the exact rule are there. An algorithm that directs reconstruction money owes its readers that auditability.</span>
                  </div>
                </li>
              </ul>
            </Reveal>
          </div>
          <Reveal delay={0.1} style={{ marginTop: 56 }}>
            <a href={LINKS.paper} target="_blank" rel="noreferrer" className="paper-card card card-dark card-flat">
              <span className="paper-cover" aria-hidden="true">
                <b>Restoring Ukraine&apos;s Agricultural Lifeline</b>
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>
                <span className="card-num">The research, its data and code</span>
                <strong style={{ display: "block", fontFamily: "var(--s-display)", fontSize: "1.4rem", fontWeight: 500, lineHeight: 1.2 }}>{LINKS.paperTitle}</strong>
                <span className="card-text" style={{ display: "block", marginTop: 10 }}>
                  William Pan, 2026. The data and code are archived on Harvard Dataverse, doi:10.7910/DVN/IYXPVS. <BookOpen size={14} style={{ verticalAlign: -2 }} /> Open access.
                </span>
                <span className="text-link" style={{ marginTop: 14 }}>
                  Open the archive <Arrow />
                </span>
              </span>
            </a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
