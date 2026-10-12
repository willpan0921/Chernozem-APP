// WHAT THIS FILE DOES
// A small dropdown that looks like a chip: "Field  Field 7 v" or
// "All regions v". It is a real <select>, so the keyboard and screen readers
// work, drawn to look like the mockup.
//
// WHAT IT RECEIVES
// prefix   - grey text before the value, e.g. "Field" (optional)
// options  - a list of { value, label }
// value    - the selected value
// onChange - called with the new value
// icon     - a Lucide icon element before the text (optional)

import { ChevronDown } from "lucide-react";

export default function ChipSelect({ prefix, options, value, onChange, icon, ariaLabel }) {
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <label className="chip-select" style={{ position: "relative" }}>
      {icon}
      {prefix && <span className="chip-select-prefix">{prefix}</span>}
      <span>{current?.label}</span>
      <ChevronDown size={13} />
      <select
        aria-label={ariaLabel || prefix}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", cursor: "pointer" }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
