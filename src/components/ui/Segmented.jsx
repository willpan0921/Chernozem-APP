// WHAT THIS FILE DOES
// A switch between two or more options where exactly one is selected, like
// "Near term | Postwar" or "Zones | Satellite". The selected one is black.
//
// WHAT IT RECEIVES
// options  - a list of { value, label, icon? }
// value    - the selected value
// onChange - called with the new value when someone clicks an option
// light    - true gives the selected option a white background instead of black

export default function Segmented({ options, value, onChange, light, ariaLabel }) {
  return (
    <div className={light ? "segmented segmented-light" : "segmented"} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "segmented-option is-active" : "segmented-option"}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
