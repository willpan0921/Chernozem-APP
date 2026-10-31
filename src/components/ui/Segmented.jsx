// WHAT THIS FILE DOES
// A switch between two or more options where exactly one is selected, like
// "Near term | Postwar" or "Squares | States". The selected one is black.
//
// WHAT IT RECEIVES
// options  - a list of { value, label, icon?, disabled?, title? } (title: the
//            option's tooltip; a disabled option cannot be picked)
// value    - the selected value
// onChange - called with the new value when someone clicks an option
// light    - true gives the selected option a white background instead of black
// locked   - true: the choice stays readable but the other options look
//            turned off; a click still calls onChange (the public demo's
//            Settings pages, where that opens the "This is the demo" dialog:
//            src/state/useDemoGuard.js)

export default function Segmented({ options, value, onChange, light, ariaLabel, locked = false }) {
  const classes = ["segmented", light ? "segmented-light" : "", locked ? "is-locked" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "segmented-option is-active" : "segmented-option"}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          aria-disabled={locked || undefined}
          disabled={option.disabled || undefined}
          title={option.title}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
