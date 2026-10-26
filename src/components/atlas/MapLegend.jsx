// WHAT THIS FILE DOES
// The small key for the Atlas map: its title (Priority, Value (soil),
// Damage or Feasibility: distance to fighting), the five colour steps from
// light to dark with a word at each end, and "How it's measured". The
// Map page picks the colouring with its four tabs on the left
// (src/components/atlas/MapTabs.jsx); the key itself has no switch.
//
// Places with no score on the map shown (not ranked, or no reading) are
// hatched, and a line with a hatched swatch says so when there are any.
//
// No grey: in Near term priority the places the Feasibility cutoff leaves
// out for now (the least feasible) share the lightest green with the
// lowest priority, and the key says so under the ramp ("Lowest priority, or
// left out for now (least feasible)"). In a war where no fire looked like
// fighting it says instead that feasibility is not measured here
// ("Feasibility not measured here: no fires that look like fighting were
// found within 300 km"), so the missing Feasibility colouring is never read
// as "far from fighting".
//
// WHAT IT RECEIVES
//   colorBy          "priority" | "value" | "damage" | "access"
//   timeframe        "nearTerm" | "postwar"
//   run              the run shown (optional): at peace (and in a month
//                    before its war began) feasibility is not measured and
//                    nothing is left out; in a war where no fire looked
//                    like fighting the key says feasibility is not measured
//                    here
//   howMeasured      show the "How it's measured" link under the key
//                    (outside its foldable body, so it shows on a phone
//                    too): the panel names the three scores and their data
//                    (src/config/research.js atlasMethods, through
//                    mapColors.js methodsFor). Default off.
//   unitView         true in the States view: the panel also says how a
//                    state's scores are made (atlasMethods.noteUnits)
//   unitWords        { one, many }: what the units are called ("district",
//                    "districts"), for that note (default states)
//   unranked         the line for the hatched places, or null when there
//                    are none on the map (mapColors.js unrankedNote: "Not
//                    ranked: no black-soil cropland", "No reading")
//   className        extra class names (optional)
//
// WHO EDITS IT
// Whoever changes the map key. The words are in src/lib/atlas/mapColors.js
// (LEGENDS, legendFor, accessKeyNote, LOWEST_SHADE_NOTE, methodsFor); the
// colours are in src/styles/tokens.css.

import HowMeasured from "../field/HowMeasured.jsx";
import { LEGENDS, LOWEST_SHADE_NOTE, accessKeyNote, legendFor, methodsFor, unitsNote } from "../../lib/atlas/mapColors.js";
import { accessMeasured } from "../../lib/atlas/overview.js";
import "./atlas.css";

export default function MapLegend({ colorBy = "priority", timeframe = "nearTerm", run = null, howMeasured = false, unitView = false, unitWords = null, unranked = null, className = "" }) {
  // Feasibility not measured (at peace, or in a month before its war began,
  // with no ACLED file, or in a war where no fire looked like fighting:
  // overview.js accessMeasured): there is no Feasibility colouring then.
  const measured = !run || accessMeasured(run);
  const mode = LEGENDS[colorBy] && (colorBy !== "access" || measured) ? colorBy : "priority";
  const legend = legendFor(mode, run);
  const showLowest = mode === "priority" && timeframe === "nearTerm" && measured;
  // In a war where no fire looked like fighting: why there is no
  // Feasibility colouring and nothing is left out (mapColors.js accessKeyNote).
  const accessNote = accessKeyNote(run);
  const methods = methodsFor(run);
  const shownMethods = unitView && methods?.noteUnits ? { ...methods, note: [methods.note, unitsNote(methods.noteUnits, unitWords)].filter(Boolean).join(" ") } : methods;
  return (
    <div className={["map-legend", className].filter(Boolean).join(" ")}>
      {/* has-note: a phone that folds the key keeps the note in sight
          (src/pages/atlas/MapPage.css). */}
      <div className={["map-legend-body", accessNote ? "has-note" : "", unranked ? "has-unranked" : ""].filter(Boolean).join(" ")}>
        <span className="map-legend-title">{legend.title}</span>
        <div className="map-legend-ramp" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((step) => (
            <span key={step} className="map-legend-step" style={{ background: `var(--map-${mode}-${step})` }} />
          ))}
        </div>
        <div className="map-legend-ends">
          <span>{legend.low}</span>
          <span>{legend.high}</span>
        </div>
        {showLowest && (
          <div className="map-legend-aside">
            <span className="map-legend-swatch" style={{ background: "var(--map-priority-1)" }} aria-hidden="true" />
            {LOWEST_SHADE_NOTE}
          </div>
        )}
        {unranked && (
          <div className="map-legend-aside is-unranked">
            <span className="map-legend-swatch is-hatched" aria-hidden="true" />
            {unranked}
          </div>
        )}
        {accessNote && <p className="map-legend-note">{accessNote}</p>}
      </div>
      {/* Outside the key's body, so it stays in sight when a phone folds the key. */}
      {howMeasured && <HowMeasured methods={shownMethods} className="map-legend-how" />}
    </div>
  );
}
