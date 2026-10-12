// WHAT THIS FILE DOES
// The heading at the top of a page: an optional small label above (like
// "ATLAS · UKRAINE"), the title, a line of helper text, and buttons on the
// right.
//
// WHAT IT RECEIVES
// eyebrow  - small all-caps text above the title (optional)
// title    - the page title
// subtitle - helper text under the title (optional)
// actions  - buttons for the right side (optional)

export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
