// WHAT THIS FILE DOES
// The small key for the Atlas map: an optional Priority | Damage | Access
// switch, then the five colour steps from light to dark with a word at
// each end. In Near term priority it adds the grey "Set aside" square.
//
// WHAT IT RECEIVES
//   colorBy          "priority" | "damage" | "access"
//   timeframe        "nearTerm" | "postwar"
//   run              the run shown (optional): at peace the access key says
//                    distance to fighting is not measured, and nothing is
//                    set aside
//   onColorByChange  give it to show the switch (optional)
//   className        extra class names (optional)
//
// WHO EDITS IT
// Whoever changes the map key. The words are LEGENDS in
// src/lib/atlas/mapColors.js; the colours are in src/styles/tokens.css.

import { Segmented } from "../ui/index.js";
import { LEGENDS, legendFor } from "../../lib/atlas/mapColors.js";
import "./atlas.css";

const MODES = [
  { value: "priority", label: "Priority" },
  { value: "damage", label: "Damage" },
  { value: "access", label: "Access" },
];

export default function MapLegend({ colorBy = "priority", timeframe = "nearTerm", run = null, onColorByChange, className = "" }) {
  const mode = LEGENDS[colorBy] ? colorBy : "priority";
  const legend = legendFor(mode, run);
  const peace = Boolean(run) && run.conflict === null && run.accessSource !== "acled";
  const showAside = mode === "priority" && timeframe === "nearTerm" && !peace;
  return (
    <div className={["map-legend", className].filter(Boolean).join(" ")}>
      {onColorByChange && <Segmented light options={MODES} value={mode} onChange={onColorByChange} ariaLabel="Colour the map by" />}
      <div className="map-legend-body">
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
      </div>
    </div>
  );
}
