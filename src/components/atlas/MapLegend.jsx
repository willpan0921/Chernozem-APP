// WHAT THIS FILE DOES
// The small key for the Atlas map: an optional Priority | Damage | Access
// switch (no Access at peace without an ACLED file: access is 100
// everywhere there), then the five colour steps from light to dark with a word at
// each end. In Near term priority it adds the grey "Set aside" square.
//
// WHAT IT RECEIVES
//   colorBy          "priority" | "damage" | "access"
//   timeframe        "nearTerm" | "postwar"
//   run              the run shown (optional): at peace (and in a month
//                    before its war began) the access key says distance to
//                    fighting is not measured, and nothing is set aside
//   onColorByChange  give it to show the switch (optional)
//   howMeasured      show the "How it's measured" link under the key (outside
//                    its foldable body, so it shows on a phone too): the
//                    panel names the three scores and their data
//                    (src/config/research.js atlasMethods; at peace it says
//                    access is not measured, which does not make the land
//                    safe, and that the team decided so when it marked the
//                    area as not at war). Default: on the
//                    full map, i.e. when onColorByChange is given.
//   className        extra class names (optional)
//
// WHO EDITS IT
// Whoever changes the map key. The words are LEGENDS in
// src/lib/atlas/mapColors.js; the colours are in src/styles/tokens.css.

import { Segmented } from "../ui/index.js";
import HowMeasured from "../field/HowMeasured.jsx";
import { LEGENDS, legendFor } from "../../lib/atlas/mapColors.js";
import { atlasMethods } from "../../config/research.js";
import { accessMeasured, atPeace, beforeWar, warInPart, warPartOf, warSetByTeam } from "../../lib/atlas/overview.js";
import "./atlas.css";

// The panel's words for this run (src/config/research.js atlasMethods):
//   at peace           the damage score is the heavily damaged share, and
//                      safe access is not measured unless an ACLED file is
//                      (whatTeamPeace when the team marked the area as not
//                      at war, Atlas Settings)
//   before its war     the month ends before its war began: no war damage
//                      is counted and distance is not measured
//   a war in part      a war that covers the area (a whole country, or a
//                      region, box or drawn area) only in part: the note
//                      says its rules apply in the squares that touch its
//                      region (and those in another listed war, when there
//                      are any: run.otherWarSquares), and the two peace
//                      rules used elsewhere
function methodsFor(run) {
  const peace = atPeace(run);
  const before = beforeWar(run);
  const measured = !run || accessMeasured(run);
  // A war in part of the area: the war's words, and where they apply.
  if (warInPart(run)) {
    const part = warPartOf(run.conflict) === "area" ? atlasMethods.notePartOfArea : atlasMethods.notePartOfCountry;
    const other = run.otherWarSquares > 0 ? atlasMethods.notePartOtherWar : "";
    return { ...atlasMethods, note: [atlasMethods.note, part, other, atlasMethods.notePartElsewhere].filter(Boolean).join(" ") };
  }
  if (!peace && !before && measured) return atlasMethods;
  const team = warSetByTeam(run);
  const words = (item) => {
    if (item.id === "access") {
      if (measured) return {};
      return { what: (before && item.whatBeforeWar) || (team && item.whatTeamPeace) || item.whatPeace || item.what };
    }
    if (before && item.whatBeforeWar) return { what: item.whatBeforeWar, ...(item.formulaBeforeWar ? { formula: item.formulaBeforeWar } : {}) };
    if (peace && item.whatPeace) return { what: item.whatPeace, ...(item.formulaPeace ? { formula: item.formulaPeace } : {}) };
    return {};
  };
  return {
    ...atlasMethods,
    items: atlasMethods.items.map((item) => ({ ...item, ...words(item) })),
    note: measured ? atlasMethods.note : atlasMethods.notePeace || atlasMethods.note,
  };
}

const MODES = [
  { value: "priority", label: "Priority" },
  { value: "damage", label: "Damage" },
  { value: "access", label: "Access" },
];

export default function MapLegend({ colorBy = "priority", timeframe = "nearTerm", run = null, onColorByChange, howMeasured, className = "" }) {
  // Distance to fighting not measured (at peace, or in a month before its
  // war began, with no ACLED file: overview.js accessMeasured).
  const peace = Boolean(run) && !accessMeasured(run);
  // At peace with no ACLED file access is 100 everywhere: no Access layer.
  const modes = peace ? MODES.filter((item) => item.value !== "access") : MODES;
  const mode = LEGENDS[colorBy] && modes.some((item) => item.value === colorBy) ? colorBy : "priority";
  const legend = legendFor(mode, run);
  const showAside = mode === "priority" && timeframe === "nearTerm" && !peace;
  return (
    <div className={["map-legend", className].filter(Boolean).join(" ")}>
      {onColorByChange && <Segmented light options={modes} value={mode} onChange={onColorByChange} ariaLabel="Colour the map by" />}
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
      {/* Outside the key's body, so it stays in sight when a phone folds the key. */}
      {(howMeasured ?? Boolean(onColorByChange)) && <HowMeasured methods={methodsFor(run)} className="map-legend-how" />}
    </div>
  );
}
