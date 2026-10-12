// WHAT THIS FILE DOES
// One row in a list like "Next steps" or "Alerts": an icon in a small box,
// a title, helper text under it, and a date or label on the right.
//
// WHAT IT RECEIVES
// icon   - a Lucide icon element
// tone   - "green", "red", "amber" or "blue" for the icon box (optional)
// title  - the main text
// help   - smaller text under the title (optional)
// when   - text on the right, like "This week" (optional)
// urgent - true shows "when" in red
// onClick - makes the row clickable (optional)

export default function RowItem({ icon, tone, title, help, when, urgent, onClick, children }) {
  const iconClasses = ["row-icon", tone ? `row-icon-${tone}` : ""].filter(Boolean).join(" ");
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="row-item" onClick={onClick} type={onClick ? "button" : undefined} style={onClick ? { width: "100%", textAlign: "left" } : undefined}>
      {icon && <span className={iconClasses}>{icon}</span>}
      <div className="row-text">
        <span className="row-title">{title}</span>
        {help && <span className="row-help">{help}</span>}
        {children}
      </div>
      {when && <span className={urgent ? "row-when row-when-urgent" : "row-when"}>{when}</span>}
    </Tag>
  );
}
