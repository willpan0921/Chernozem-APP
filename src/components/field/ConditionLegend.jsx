// WHAT THIS FILE DOES
// The legend of the Field map's one layer, "Field condition", and the
// small coloured square every field list shows (LookSwatch).
//
// The legend ALWAYS shows the full scale, Poor to Very good, captioned
// "Crop now · or how the season went after harvest" (a crop in the field
// is coloured by its condition now; a harvested field by how its season
// went, with stubble lines over it), and always these marks, as they look
// on the satellite map: the gold outline of a field ready to harvest, the
// stubble lines of a harvested field (over a two-tone chip: "colour =
// season"), the grey olive of fallow or grass, the tan
// of a crop dried down, and the dashed white circle round a stress patch.
// "Needs recovery" (red hatch) is listed only where a known war covers the
// farm or a field needs it; "Not sown" only when a field is not sown.
//
// WHAT IT RECEIVES
//   compact     true: one line, no title
//   recovery    true lists "Needs recovery" (a war covers the farm, or a
//               field needs recovery)
//   notSown     true lists "Not sown" (format.js mapMarks(...).notSown)
//   className
//
// LookSwatch({ look, className }): the square of one field, from
// format.js mapLook(analysis): the same colour and pattern as on the map
// (look.split: the legend's two-tone Harvested chip).
//
// The class names come from method.js (CONDITION_CLASSES), the colours
// from the --fmap-* tokens (the fk- classes in field.css).
//
// WHO EDITS IT
// Whoever changes the Field map legend or how a field's square looks.

import { CONDITION_CLASSES } from "../../lib/field/method.js";
import "./field.css";

// The CSS classes of a field's look (format.js mapLook).
export function lookClass(look) {
  if (!look) return "fk-look fk-none";
  return ["fk-look", `fk-${look.kind}`, look.cls ? `fk-${look.cls}` : "", look.split ? "fk-split" : "", look.ready ? "is-ready" : ""].filter(Boolean).join(" ");
}

export function LookSwatch({ look, className = "", title }) {
  return <span className={[lookClass(look), className].filter(Boolean).join(" ")} title={title} aria-hidden="true" />;
}

// The marks, in order. "stress" is drawn as on the map (a dashed circle).
const MARKS = [
  { id: "ready", label: "Ready to harvest", look: { kind: "crop", cls: "great", ready: true } },
  // Stubble lines over a two-tone chip: a harvested field takes the colour
  // of how its season went (the scale above), not one colour of its own.
  { id: "harvested", label: "Harvested · colour = season", look: { kind: "harvested", cls: null, split: true } },
  { id: "fallow", label: "Fallow or grass", look: { kind: "fallow", cls: null } },
  { id: "driedDown", label: "Dried down", look: { kind: "driedDown", cls: null } },
  { id: "notSown", label: "Not sown", look: { kind: "notSown", cls: null }, only: "notSown" },
  { id: "stress", label: "Stress patch" },
  { id: "recovery", label: "Needs recovery", look: { kind: "recovery", cls: null }, only: "recovery" },
];

export const SCALE_CAPTION = "Crop now · or how the season went after harvest";

export default function ConditionLegend({ compact = false, recovery = false, notSown = false, className = "" }) {
  const shown = MARKS.filter((mark) => !mark.only || (mark.only === "recovery" ? recovery : notSown));
  const first = CONDITION_CLASSES[0].label;
  const last = CONDITION_CLASSES[CONDITION_CLASSES.length - 1].label;
  return (
    <div className={["fl-legend", compact ? "is-compact" : "", className].filter(Boolean).join(" ")}>
      {!compact && <strong className="fl-title">Field condition</strong>}
      <div className="fl-scale-block">
        <div className="fl-scale" role="img" aria-label={`Field condition from ${first} to ${last}: ${SCALE_CAPTION}`}>
          <span className="fl-end">{first}</span>
          {CONDITION_CLASSES.map((item) => (
            <span key={item.id} className={`fl-swatch fl-${item.id}`} title={item.label} />
          ))}
          <span className="fl-end">{last}</span>
        </div>
        <span className="fl-caption">{SCALE_CAPTION}</span>
      </div>
      <div className="fl-marks">
        {shown.map((mark) => (
          <span key={mark.id} className="fl-mark">
            {mark.look ? <LookSwatch look={mark.look} className="fl-swatch fl-mark-swatch" /> : <span className={`fl-swatch fl-${mark.id}`} aria-hidden="true" />}
            {mark.label}
          </span>
        ))}
      </div>
    </div>
  );
}
