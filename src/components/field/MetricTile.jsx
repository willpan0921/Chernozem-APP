// WHAT THIS FILE DOES
// One of the four big tiles about a field: Water, Plant health, Stress,
// Harvest readiness. A label with its icon, ONE big value, one status
// word, and at most one short line. Nothing else.
//
// WHAT IT RECEIVES (the tiles from src/lib/field/format.js fieldTiles() fit as they are)
//   id      "water" | "plantHealth" | "stress" | "harvest" (picks the icon)
//   label   "Water"
//   value   the big text: "0.28", "0.8 ha", "Ready"
//   word    one status word: "Normal", "Medium", "Now" (optional)
//   tone    the word's colour: "green" | "amber" | "red" | "blue" | "ink" (optional)
//   line    one short line: "Normal 0.26 to 0.29" (optional)
//   icon    a Lucide icon component to use instead of the default
//   size    "lg" for the biggest tiles (optional)
//
//   <MetricTile {...tile} />
//
// WHO EDITS IT
// Whoever changes how the tiles look. The words come from format.js.

import { Bug, Droplet, Sprout, Wheat } from "lucide-react";
import Badge from "../ui/Badge.jsx";
import "./field.css";

export const TILE_ICONS = { water: Droplet, plantHealth: Sprout, stress: Bug, harvest: Wheat };

export default function MetricTile({ id, label, value, word, tone, line, icon, size, className = "" }) {
  const Icon = icon || TILE_ICONS[id] || Sprout;
  return (
    <div className={["mt-tile", size === "lg" ? "is-lg" : "", id ? `mt-${id}` : "", className].filter(Boolean).join(" ")} data-tile={id}>
      <div className="mt-top">
        <span className="mt-label">
          <Icon size={14} aria-hidden="true" />
          {label}
        </span>
        {word && <Badge tone={tone || undefined}>{word}</Badge>}
      </div>
      <span className="mt-value">{value}</span>
      {line && <span className="mt-line">{line}</span>}
    </div>
  );
}
