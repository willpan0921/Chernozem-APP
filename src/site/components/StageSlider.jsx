// WHAT THIS FILE DOES
// "How it works" on the About page, as one slider that drives two fields:
// the left field holds the current stage as a clause ("First, the
// satellites pass"), the right field holds a true-size crop of the real
// app in the matching state, and a range input with four stops along the
// bottom moves both. Dragging, clicking a stage name or the arrow keys
// swap the clause and the picture with a short crossfade; nothing depends
// on scrolling. Styles: src/site/pages/home.css (.stages).
//
// WHO EDITS IT
// Whoever changes the four stages. A crop is a window over the 1920-px
// screenshot (see components/Shot.jsx); move x and y to show another part.

import { useId, useState } from "react";
import Shot from "./Shot.jsx";
import { NUMBERS } from "../content/site.js";

const STAGES = [
  {
    name: "Satellites",
    lines: ["First, the", "satellites pass"],
    text: "Sentinel-1 radar and Sentinel-2 optical, every few days, free.",
    shot: "field-data",
    alt: "The Field data page: the last pass on 26 October, 100% clear, and the season's plant-health line.",
    crop: { x: 276, y: 116 },
  },
  {
    name: "Earth Engine",
    lines: ["Then every", "pixel is read"],
    text: `Google Earth Engine runs the maths over the whole area at once; a month of Ukraine takes ${NUMBERS.ukraineMonthMinutes} minutes.`,
    shot: "atlas-map-damage-micro",
    alt: "The Atlas damage map of eastern Ukraine, square by square, the heaviest damage along the front.",
    crop: { x: 940, y: 330 },
  },
  {
    name: "Scores",
    lines: ["Then three", "scores are made"],
    text: "Value of the soil, damage since the crisis began, and whether anyone can reach it.",
    shot: "atlas-map-picked",
    alt: "One square in Kharkiv picked in Atlas: its value, damage and feasibility scores and the soil types under it.",
    crop: { x: 1500, y: 66 },
  },
  {
    name: "Answer",
    lines: ["Then one", "answer is given"],
    text: "A ranked list: where to act first, and where to wait.",
    shot: "atlas-map-near-macro",
    alt: "The Atlas ranking of Ukraine's states for the near term: Mykolaiv, Kirovohrad and Poltava first.",
    crop: { x: 1500, y: 24 },
  },
];

const FRAME = { w: 440, h: 560 };

export default function StageSlider() {
  const [stage, setStage] = useState(0);
  const id = useId();
  const current = STAGES[stage];
  const passed = stage / (STAGES.length - 1);

  return (
    <div className="stages">
      <div className="stages-fields">
        <div className="stages-clause">
          <h2 className="display stages-head" aria-live="polite">
            {current.lines.map((line) => (
              <span className="stages-line" key={`${stage}-${line}`}>
                {line}
              </span>
            ))}
          </h2>
          <p className="stages-text" key={`text-${stage}`}>
            {current.text}
          </p>
        </div>

        <div className="stages-picture">
          <div className="stages-frame" style={{ "--frame-w": `${FRAME.w}px`, "--frame-h": `${FRAME.h}px` }}>
            {STAGES.map((s, i) => (
              <div className={`stages-shot${i === stage ? " is-on" : ""}`} key={s.shot} aria-hidden={i !== stage}>
                <Shot name={s.shot} alt={s.alt} crop={{ ...s.crop, w: FRAME.w, h: FRAME.h }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stages-control" style={{ "--passed": passed }}>
        <div className="stages-track" aria-hidden="true">
          <span className="stages-fill" />
        </div>
        <input
          id={`${id}-range`}
          className="stages-range"
          type="range"
          min="0"
          max={STAGES.length - 1}
          step="1"
          value={stage}
          onChange={(event) => setStage(Number(event.target.value))}
          aria-label="Stage"
          aria-valuetext={`${current.name}: ${current.lines.join(" ")}`}
        />
        <ol className="stages-names">
          {STAGES.map((s, i) => (
            <li key={s.name}>
              <button type="button" className={`stages-name${i === stage ? " is-on" : ""}`} onClick={() => setStage(i)} aria-current={i === stage ? "step" : undefined}>
                {s.name}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
