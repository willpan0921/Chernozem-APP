// WHAT THIS FILE DOES
// An on/off switch. With "title" it draws a whole row: text on the left and
// the switch on the right, like the Settings pages.
//
// WHAT IT RECEIVES
// checked  - true or false
// onChange - called with the new value
// title    - text for the row (optional; without it only the switch is drawn)
// help     - smaller text under the title (optional)

export default function Toggle({ checked, onChange, title, help, label }) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || title}
      className={checked ? "toggle is-on" : "toggle"}
      onClick={() => onChange(!checked)}
    />
  );
  if (!title) return control;
  return (
    <div className="toggle-row">
      <div className="toggle-row-text">
        <span className="toggle-row-title">{title}</span>
        {help && <span className="toggle-row-help">{help}</span>}
      </div>
      {control}
    </div>
  );
}
