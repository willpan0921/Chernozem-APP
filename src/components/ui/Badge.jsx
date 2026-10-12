// WHAT THIS FILE DOES
// A small coloured pill with a word or two in it: "Healthy", "Watch",
// "Current", "3 new".
//
// WHAT IT RECEIVES
// tone     - "green", "red", "amber", "blue", "ink" or "outline"
//            (leave out for the plain grey pill)
// dot      - true adds a small dot before the text
// children - the text

export default function Badge({ tone, dot, className = "", children }) {
  const classes = ["badge", tone ? `badge-${tone}` : "", dot ? "badge-dot" : "", className]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{children}</span>;
}
