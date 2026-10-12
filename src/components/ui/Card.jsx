// WHAT THIS FILE DOES
// A white box with rounded corners, the basic building block of every page.
// It can have a title row at the top with a subtitle and buttons.
//
// WHAT IT RECEIVES
// title     - heading text (optional)
// subtitle  - helper text under the heading (optional)
// actions   - buttons or links for the right side of the heading (optional)
// flush     - true removes the inner padding, for tables and maps
// className - extra class names
// children  - the contents

export default function Card({ title, subtitle, actions, flush, className = "", children, ...rest }) {
  const classes = ["card", flush ? "card-flush" : "", className].filter(Boolean).join(" ");
  return (
    <section className={classes} {...rest}>
      {(title || actions) && (
        <div className="card-header">
          <div className="card-header-text">
            {title && <h2>{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
