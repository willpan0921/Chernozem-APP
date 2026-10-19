// WHAT THIS FILE DOES
// The legend of the Field map's one layer, "Field condition": four colours
// from Poor to Very good, and the marks drawn on the satellite map: the
// gold outline of a field ready to harvest, the red tint of a field that
// needs recovery, the dashed white circle round a stress patch and the
// plain straw tint of a harvested field. Together they cover all four
// parts of the assessment: plant health and water (the colours), stress
// (the circles) and harvest readiness (gold).
//
// WHAT IT RECEIVES
//   compact     true: one line, no title
//   marks       which marks to list: any of "ready", "recovery", "stress", "harvested"
//               (default: all four)
//   className
//
// The class names come from method.js (CONDITION_CLASSES), the colours
// from the --fmap-* tokens.
//
// WHO EDITS IT
// Whoever changes the Field map legend.

import { CONDITION_CLASSES } from "../../lib/field/method.js";
import "./field.css";

const MARKS = [
  { id: "ready", label: "Ready to harvest" },
  { id: "recovery", label: "Needs recovery" },
  { id: "stress", label: "Stress patch" },
  { id: "harvested", label: "Harvested" },
];

export default function ConditionLegend({ compact = false, marks, className = "" }) {
  const shown = MARKS.filter((mark) => (marks || MARKS.map((m) => m.id)).includes(mark.id));
  const first = CONDITION_CLASSES[0].label;
  const last = CONDITION_CLASSES[CONDITION_CLASSES.length - 1].label;
  return (
    <div className={["fl-legend", compact ? "is-compact" : "", className].filter(Boolean).join(" ")}>
      {!compact && <strong className="fl-title">Field condition</strong>}
      <div className="fl-scale" role="img" aria-label={`Field condition from ${first} to ${last}`}>
        <span className="fl-end">{first}</span>
        {CONDITION_CLASSES.map((item) => (
          <span key={item.id} className={`fl-swatch fl-${item.id}`} title={item.label} />
        ))}
        <span className="fl-end">{last}</span>
      </div>
      {shown.length > 0 && (
        <div className="fl-marks">
          {shown.map((mark) => (
            <span key={mark.id} className="fl-mark">
              <span className={`fl-swatch fl-${mark.id}`} aria-hidden="true" />
              {mark.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
