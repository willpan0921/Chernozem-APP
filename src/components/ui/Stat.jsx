// WHAT THIS FILE DOES
// One of the big-number tiles along the top of an Overview page: a label, a
// large value and a note under it.
//
// WHAT IT RECEIVES
// label - the small text above the number, e.g. "Healthy"
// value - the big number or text, e.g. "4 fields"
// note  - text under the number (optional)
// icon  - a Lucide icon element to show before the label (optional)
// tone  - "green", "red", "amber" or "dark" to colour the tile (optional)
// mono  - false to show the value in the normal font instead of the number font

export default function Stat({ label, value, note, icon, tone, mono = true }) {
  const classes = ["stat", tone ? `stat-${tone}` : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <span className={mono ? "stat-value mono" : "stat-value"}>{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
