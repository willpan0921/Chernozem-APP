// WHAT THIS FILE DOES
// The condition laboratory on the website's Methodology page, in the Field
// part: a small piece of Field's real arithmetic that the reader can play
// with, the twin of the Atlas part's gate laboratory (GateLab.jsx). One
// imagined field: the reader moves its NDVI and its NDWI against their
// normal (minus the same weeks of 2019 to 2021) and the share of it that
// is stressed, and watches its condition and its class.
//
// Left, as in the gate laboratory: the sliders, then the condition and its
// class in large numbers. Right: the bar of the condition's three parts end
// to end on the 0-to-1 scale (each part as long as its weight times its
// score, so the bar ends at the sum), the class boundaries under it, the
// four classes with the field's own filled in, and right under them the
// sum written out with the page's names for its parts: the health score
// and the water score (each held between 0 and 1) and the share not
// stressed, each weight times its score. A field with high stress is held
// under "Very good", as in the app: the bar's part past the hold fades and
// a line says so. The large numbers are sized to their column, and the
// class keeps room for two lines ("Very / good"); the line about the hold
// uses that second line, free whenever it shows (a held field is "Good" at
// most), so the panel never changes height under the reader's hand
// (conditionlab.css).
//
// The arithmetic is conditionLab.js: the app's own Field method
// (src/lib/field/method.js) written again with the numbers in site.js
// (FIELD_METHOD), and checked against method.js's functions by its tests,
// so the laboratory and the app agree. It is a data fragment (its root
// carries data-ui) and wears the gate laboratory's look (the ".gl-" rules
// in src/site/pages/pages.css); its own parts are in conditionlab.css. The
// bar, its scale and the classes are drawn for the eye only (aria-hidden):
// the sliders, the numbers and the written sum say the same in words.
// Nothing moves by itself (the bar follows the sliders at once), so there
// is nothing to switch off for reduced motion.
//
// WHO EDITS IT
// Whoever changes the laboratory. The rules live in method.js, their
// numbers for the website in site.js (FIELD_METHOD).

import { useState } from "react";
import { FIELD_METHOD } from "../content/site.js";
import { SLIDERS, labReading, shownScore, signed } from "./conditionLab.js";
import "./conditionlab.css";

const CLASSES = FIELD_METHOD.classes;
// The top class's name, kept on one line where the hold is explained
// ("held under Very good."; Safari has no text-wrap: pretty to keep it).
const TOP_CLASS = CLASSES[CLASSES.length - 1].label.replace(/ /g, "\u00a0");

// The three parts, in the formula's order: their names (the page's
// formula calls them the health score, the water score and 1 − stressed
// share) and colours (the site's tokens; the written sum beside each
// colour names it too).
const PARTS = {
  health: { name: "Health score", colour: "var(--accent, #1f4a2a)" },
  water: { name: "Water score", colour: "var(--data-flood, #4b7cc0)" },
  noStress: { name: "Not stressed", colour: "var(--data-arc, #e3b04b)" },
};

// The class boundaries under the bar (0.40, 0.65, 0.85), from site.js.
const BOUNDS = CLASSES.map((item) => item.upTo).filter(Number.isFinite);

// A share of the bar as a CSS length.
const at = (share) => `${(Math.min(1, Math.max(0, share)) * 100).toFixed(3)}%`;

// Two decimals, as the classes are written ("0.40"); a weight as it is
// written in the formula ("0.5").
const two = (n) => n.toFixed(2);
const weight = (n) => String(Math.round(n * 100) / 100);

export default function ConditionLab() {
  const [health, setHealth] = useState(SLIDERS.health.start);
  const [water, setWater] = useState(SLIDERS.water.start);
  const [stress, setStress] = useState(SLIDERS.stress.start);
  const reading = labReading({ healthDelta: health / 100, waterDelta: water / 100, stressShare: stress / 100 });

  // Where each part starts on the bar: after the ones before it.
  let start = 0;
  const blocks = reading.parts.map((part) => {
    const block = { ...part, start };
    start += part.value;
    return block;
  });

  return (
    <div className="gl cl" data-ui>
      <div className="gl-controls">
        <p className="gl-note">One imagined field. Move its NDVI and NDWI against their normal, and the share of it that is stressed, and watch its condition.</p>
        <div className="gl-control">
          <label htmlFor="cl-health">
            NDVI against normal <b>{signed(health / 100)}</b>
          </label>
          <input id="cl-health" type="range" min={SLIDERS.health.min} max={SLIDERS.health.max} value={health} aria-valuetext={`NDVI ${signed(health / 100)} against normal`} onChange={(e) => setHealth(Number(e.target.value))} />
        </div>
        <div className="gl-control">
          <label htmlFor="cl-water">
            NDWI against normal <b>{signed(water / 100)}</b>
          </label>
          <input id="cl-water" type="range" min={SLIDERS.water.min} max={SLIDERS.water.max} value={water} aria-valuetext={`NDWI ${signed(water / 100)} against normal`} onChange={(e) => setWater(Number(e.target.value))} />
        </div>
        <div className="gl-control">
          <label htmlFor="cl-stress">
            Stressed share <b>{stress}%</b>
          </label>
          <input id="cl-stress" type="range" min={SLIDERS.stress.min} max={SLIDERS.stress.max} value={stress} aria-valuetext={`${stress}% of the field stressed`} onChange={(e) => setStress(Number(e.target.value))} />
        </div>
        <div className="gl-readout" aria-live="polite">
          <div>
            <span>Condition</span>
            <b>{shownScore(reading.score)}</b>
          </div>
          <div>
            <span>Class</span>
            <b>{reading.label}</b>
          </div>
          {reading.held && <p className="cl-held">High stress: held under {TOP_CLASS}.</p>}
        </div>
      </div>
      <div className="cl-chart">
        <div aria-hidden="true">
          <div className="cl-track">
            {blocks.map((block) => (
              <i key={block.id} className="cl-block" style={{ left: at(block.start), width: at(block.value), background: PARTS[block.id].colour }} />
            ))}
            {reading.held && <i className="cl-past" style={{ left: at(reading.score), width: at(reading.sum - reading.score) }} />}
            <i className="cl-mark" style={{ left: at(reading.score) }} />
          </div>
          <div className="cl-scale">
            <span className="cl-start">0</span>
            {BOUNDS.map((bound) => (
              <span key={`n${bound}`} style={{ left: at(bound) }}>
                {two(bound)}
              </span>
            ))}
            {BOUNDS.map((bound) => (
              <i key={`t${bound}`} style={{ left: at(bound) }} />
            ))}
            <span className="cl-end" style={{ left: "100%" }}>
              1
            </span>
          </div>
          <ul className="cl-classes">
            {CLASSES.map((item) => (
              <li key={item.id} className={item.id === reading.classId ? "is-on" : undefined}>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <ul className="cl-parts">
          {reading.parts.map((part) => (
            <li key={part.id}>
              <span>
                <i style={{ background: PARTS[part.id].colour }} aria-hidden="true" />
                {PARTS[part.id].name}
              </span>
              <b>
                {weight(part.weight)} × {two(part.score)}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
