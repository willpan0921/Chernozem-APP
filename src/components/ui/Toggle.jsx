// WHAT THIS FILE DOES
// An on/off switch. With "title" it draws a whole row: text on the left and
// the switch on the right, like the Settings pages.
//
// WHAT IT RECEIVES
// checked  - true or false
// onChange - called with the new value
// title    - text for the row (optional; without it only the switch is drawn)
// help     - smaller text under the title (optional)
// disabled - true: cannot be switched
// locked   - true: looks turned off but can still be pressed (the public
//            demo's Settings pages, where onChange then opens the "This is
//            the demo" dialog: src/state/useDemoGuard.js)

export default function Toggle({ checked, onChange, title, help, label, disabled = false, locked = false }) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || title}
      aria-disabled={locked || undefined}
      data-demo-locked={locked ? "" : undefined}
      className={checked ? "toggle is-on" : "toggle"}
      disabled={disabled}
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
