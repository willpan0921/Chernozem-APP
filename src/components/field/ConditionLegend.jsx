// WHAT THIS FILE DOES
// The legend of the Field map's one layer, "Field condition": four colours
// from Poor to Very good, and the marks the Zones view uses (stripes for a
// field that needs recovery, the dashed circle round a stress patch, lines
// on a harvested field) and the gold outline of a field ready to harvest.
// Together they cover all four parts of the assessment: plant health and
// water (the colours), stress (the circles) and harvest readiness (gold).
//
// WHAT IT RECEIVES
//   view        "zones" (default) | "satellite" (the satellite view shows
//               recovery as a red outline and harvested fields as a plain
//               straw tint)
//   compact     true: one line, no title
//   marks       which marks to list: any of "ready", "recovery", "stress", "harvested"
//               (default: all that the view uses)
//   className
//
// The class names come from method.js (CONDITION_CLASSES), the colours
// from the --zone-* tokens.
//
// WHO EDITS IT
// Whoever changes the Field map legend.

import { CONDITION_CLASSES } from "../../lib/field/method.js";
import "./field.css";

export default function ConditionLegend({ view = "zones", compact = false, marks, className = "" }) {
  const shown = marks || ["ready", "recovery", "stress", "harvested"];
  return (
    <div className={["fl-legend", compact ? "is-compact" : "", `is-${view}`, className].filter(Boolean).join(" ")}>
      {!compact && <strong className="fl-title">Field condition</strong>}
      <div className="fl-scale" role="img" aria-label={`Field condition from ${CONDITION_CLASSES[0].label} to ${CONDITION_CLASSES[CONDITION_CLASSES.length - 1].label}`}>
        <span className="fl-end">{CONDITION_CLASSES[0].label}</span>
        {CONDITION_CLASSES.map((item) => (
          <span key={item.id} className={`fl-swatch fl-${item.id}`} title={item.label} />
        ))}
        <span className="fl-end">{CONDITION_CLASSES[CONDITION_CLASSES.length - 1].label}</span>
      </div>
      {shown.length > 0 && (
        <div className="fl-marks">
          {shown.includes("ready") && (
            <span className="fl-mark">
              <span className="fl-swatch fl-ready" aria-hidden="true" />
              Ready to harvest
            </span>
          )}
          {shown.includes("recovery") && (
            <span className="fl-mark">
              <span className="fl-swatch fl-recovery" aria-hidden="true" />
              Needs recovery
            </span>
          )}
          {shown.includes("stress") && (
            <span className="fl-mark">
              <span className="fl-swatch fl-stress" aria-hidden="true" />
              Stress patch
            </span>
          )}
          {shown.includes("harvested") && (
            <span className="fl-mark">
              <span className="fl-swatch fl-harvested" aria-hidden="true" />
              Harvested
            </span>
          )}
        </div>
      )}
    </div>
  );
}
