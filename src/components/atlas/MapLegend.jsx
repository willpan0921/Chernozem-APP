// WHAT THIS FILE DOES
// The small key for the Atlas map: an optional Priority | Damage | Access
// switch (no Access where safe access is not measured: at peace without an
// ACLED file access is 100 everywhere, and so it is in a war where no fire
// looked like fighting), then the five colour steps from light to dark
// with a word at each end. In Near term priority it adds the grey "Set
// aside" square. In a war where no fire looked like fighting it says so
// instead ("Safe access not measured here: no fires that look like
// fighting were found within 300 km"), so the missing Access colouring is
// never read as "far from fighting".
//
// WHAT IT RECEIVES
//   colorBy          "priority" | "damage" | "access"
//   timeframe        "nearTerm" | "postwar"
//   run              the run shown (optional): at peace (and in a month
//                    before its war began) the access key says distance to
//                    fighting is not measured, and nothing is set aside;
//                    in a war where no fire looked like fighting the key
//                    says safe access is not measured here
//   onColorByChange  give it to show the switch (optional)
//   howMeasured      show the "How it's measured" link under the key (outside
//                    its foldable body, so it shows on a phone too): the
//                    panel names the three scores and their data
//                    (src/config/research.js atlasMethods; at peace it says
//                    access is not measured, which does not make the land
//                    safe, and that the team decided so when it marked the
//                    area as not at war; in a war where no fire looked like
//                    fighting, that it is not measured there). Default: on the
//                    full map, i.e. when onColorByChange is given.
//   className        extra class names (optional)
//
// WHO EDITS IT
// Whoever changes the map key. The words are in src/lib/atlas/mapColors.js
// (LEGENDS, legendFor, accessKeyNote, methodsFor); the colours are in
// src/styles/tokens.css.

import { Segmented } from "../ui/index.js";
import HowMeasured from "../field/HowMeasured.jsx";
import { LEGENDS, accessKeyNote, legendFor, methodsFor } from "../../lib/atlas/mapColors.js";
import { accessMeasured } from "../../lib/atlas/overview.js";
import "./atlas.css";

const MODES = [
  { value: "priority", label: "Priority" },
  { value: "damage", label: "Damage" },
  { value: "access", label: "Access" },
];

export default function MapLegend({ colorBy = "priority", timeframe = "nearTerm", run = null, onColorByChange, howMeasured, className = "" }) {
  // Distance to fighting not measured (at peace, or in a month before its
  // war began, with no ACLED file, or in a war where no fire looked like
  // fighting: overview.js accessMeasured).
  const peace = Boolean(run) && !accessMeasured(run);
  // Access is 100 everywhere then: no Access layer.
  const modes = peace ? MODES.filter((item) => item.value !== "access") : MODES;
  const mode = LEGENDS[colorBy] && modes.some((item) => item.value === colorBy) ? colorBy : "priority";
  const legend = legendFor(mode, run);
  const showAside = mode === "priority" && timeframe === "nearTerm" && !peace;
  // In a war where no fire looked like fighting: why there is no Access
  // layer and nothing is set aside (mapColors.js accessKeyNote).
  const accessNote = accessKeyNote(run);
  return (
    <div className={["map-legend", className].filter(Boolean).join(" ")}>
      {onColorByChange && <Segmented light options={modes} value={mode} onChange={onColorByChange} ariaLabel="Colour the map by" />}
      {/* has-note: a phone that folds the key keeps the note in sight
          (src/pages/atlas/MapPage.css). */}
      <div className={accessNote ? "map-legend-body has-note" : "map-legend-body"}>
        {!onColorByChange && <span className="map-legend-title">{legend.title}</span>}
        <div className="map-legend-ramp" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((step) => (
            <span key={step} className="map-legend-step" style={{ background: `var(--map-${mode}-${step})` }} />
          ))}
        </div>
        <div className="map-legend-ends">
          <span>{legend.low}</span>
          <span>{legend.high}</span>
        </div>
        {showAside && (
          <div className="map-legend-aside">
            <span className="map-legend-swatch" style={{ background: "var(--map-setaside)" }} aria-hidden="true" />
            Set aside · little safe access
          </div>
        )}
        {accessNote && <p className="map-legend-note">{accessNote}</p>}
      </div>
      {/* Outside the key's body, so it stays in sight when a phone folds the key. */}
      {(howMeasured ?? Boolean(onColorByChange)) && <HowMeasured methods={methodsFor(run)} className="map-legend-how" />}
    </div>
  );
}
