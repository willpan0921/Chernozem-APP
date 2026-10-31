// WHAT THIS FILE DOES
// "How it works" on the About page, as one slider that drives two fields:
// the left field holds the current stage as a clause ("First, the
// satellites pass"), the right field holds a true-size piece of the real
// app in the matching state, and a range input with four stops along the
// bottom moves both. Dragging, clicking a stage name, the arrow keys or a
// tap on the picture (which moves on to the next stage, and from the last
// back to the first) swap the clause and the picture; nothing depends on
// scrolling. Styles: src/site/pages/home.css (.stages).
//
// Only the current stage's picture is on the page. Its pictures are small
// crops made for this window (public/site/shots/crops/, 440 x 560, with an
// 880 x 1120 copy for sharp screens; crops/manifest.json says where each
// was cut from). Pointing at the slider, a stage's name or the picture, or
// reaching them with the Tab key, fetches the next stage's picture (and
// the pointed one's) ahead, so a change shows at once.
//
// WHO EDITS IT
// Whoever changes the four stages. A new picture is cut from a screenshot
// in public/site/shots/ at 440 x 560 (and twice that), named
// "<screenshot>-440.webp" and "-880.webp" in crops/.

import { useCallback, useId, useRef, useState } from "react";
import { NUMBERS } from "../content/site.js";

const STAGES = [
  {
    name: "Satellites",
    lines: ["First, the", "satellites pass"],
    text: "Sentinel-1 radar and Sentinel-2 optical, every few days, free.",
    shot: "field-data",
    alt: "The Field data page: the last pass on 26 October, 100% clear, and the season's plant-health line.",
  },
  {
    name: "Earth Engine",
    lines: ["Then every", "pixel is read"],
    text: `Google Earth Engine runs the maths over the whole area at once; a month of Ukraine takes ${NUMBERS.ukraineMonthMinutes} minutes.`,
    shot: "atlas-map-damage-micro",
    alt: "The Atlas damage map of eastern Ukraine, square by square, the heaviest damage along the front.",
  },
  {
    name: "Scores",
    lines: ["Then three", "scores are made"],
    text: "Value of the soil, damage since the crisis began, and whether anyone can reach it.",
    shot: "atlas-map-picked",
    alt: "One square in Kharkiv picked in Atlas: its value, damage and feasibility scores and the soil types under it.",
  },
  {
    name: "Answer",
    lines: ["Then one", "answer is given"],
    text: "A ranked list: where to act first, and where to wait.",
    shot: "atlas-map-near-macro",
    alt: "The Atlas ranking of Ukraine's states for the near term: Mykolaiv, Kirovohrad and Poltava first.",
  },
];

const FRAME = { w: 440, h: 560 };
const src = (shot) => `/site/shots/crops/${shot}-440.webp`;
const srcSet = (shot) => `/site/shots/crops/${shot}-440.webp 1x, /site/shots/crops/${shot}-880.webp 2x`;

export default function StageSlider() {
  const [stage, setStage] = useState(0);
  const id = useId();
  const current = STAGES[stage];
  const passed = stage / (STAGES.length - 1);

  // Fetches a stage's picture ahead (the browser keeps it for the swap).
  const fetched = useRef(new Set([0]));
  const fetchAhead = useCallback((i) => {
    if (fetched.current.has(i) || typeof Image === "undefined") return;
    fetched.current.add(i);
    const img = new Image();
    img.decoding = "async";
    img.srcset = srcSet(STAGES[i].shot);
    img.src = src(STAGES[i].shot);
  }, []);
  const ahead = () => fetchAhead((stage + 1) % STAGES.length);
  const choose = (i) => {
    setStage(i);
    fetchAhead((i + 1) % STAGES.length);
  };

  return (
    <div className="stages" onPointerEnter={ahead} onFocus={ahead}>
      <div className="stages-fields">
        <div className="stages-clause">
          <h2 className="display stages-head" aria-live="polite">
            {current.lines.map((line, i) => (
              <span className="stages-line" key={`${stage}-${line}`}>
                {i > 0 ? " " : ""}
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
            <figure className="stages-shot" key={current.shot}>
              <img src={src(current.shot)} srcSet={srcSet(current.shot)} alt={current.alt} width={FRAME.w} height={FRAME.h} loading="lazy" decoding="async" />
            </figure>
            {/* Tapping the picture moves on to the next stage (the slider and the names do the same from the keyboard). */}
            <button type="button" className="stages-next" tabIndex={-1} aria-hidden="true" onClick={() => choose((stage + 1) % STAGES.length)} />
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
          onChange={(event) => choose(Number(event.target.value))}
          aria-label="Stage"
          aria-valuetext={`${current.name}: ${current.lines.join(" ")}`}
        />
        <ol className="stages-names">
          {STAGES.map((s, i) => (
            <li key={s.name}>
              <button type="button" className={`stages-name${i === stage ? " is-on" : ""}`} onClick={() => choose(i)} onPointerEnter={() => fetchAhead(i)} onFocus={() => fetchAhead(i)} aria-current={i === stage ? "step" : undefined}>
                {s.name}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
