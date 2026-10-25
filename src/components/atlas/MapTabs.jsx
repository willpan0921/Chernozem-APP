// WHAT THIS FILE DOES
// Two of the three sections of the Atlas map page's left column (the first
// is the weights, WeightsPanel.jsx):
//
//   <DetailSwitch>  "Detail": Squares | States (or Districts): the map and
//                   the list on the right by square, as before, or by whole
//                   state, province or district (src/lib/atlas/units.js)
//   <MapTabs>       "Map": four tabs, Priority, Value, Damage and
//                   Feasibility, that colour the big map by that score
//                   (Priority = the time frame's combined score)
//
// WHAT THEY RECEIVE
//   DetailSwitch
//     value      "squares" | "units"
//     onChange   called with the new value
//     units      the units answer (GET /api/areas/:id/units) or null while
//                it loads: its label ("States", "Districts") and tooltip
//     status     "loading" | "ready" | "error" (of that answer)
//   MapTabs
//     value      "priority" | "value" | "damage" | "access"
//     onChange   called with the new value
//     measured   false where feasibility is not measured (at peace, before
//                the war, or in a war where no fire looked like fighting:
//                overview.js accessMeasured): the Feasibility tab says so
//                ("Not measured here") and cannot be picked, so the map is
//                never coloured flat
//     why        the line that says why (overview.js setAsideNote)
//
// WHO EDITS IT
// Whoever changes the left column of the Atlas map page. The colours of the
// tabs' small ramps are the map's (src/styles/tokens.css).

import { Segmented } from "../ui/index.js";
import "./atlas.css";

export const MAP_TABS = [
  { value: "priority", label: "Priority", hint: "All together" },
  { value: "value", label: "Value", hint: "Soil value" },
  { value: "damage", label: "Damage", hint: "Fire and radar" },
  { value: "access", label: "Feasibility", hint: "Safe access" },
];

export function DetailSwitch({ value, onChange, units, status }) {
  const label = units?.label || "States";
  const few = status === "ready" && (units?.units?.length ?? 0) < 2;
  const failed = status === "error";
  const disabled = few || failed || status !== "ready";
  const title = failed
    ? "The states could not be loaded"
    : status !== "ready"
      ? "Loading the states…"
      : few
        ? units?.note || units?.message || `This area has no ${label.toLowerCase()} to compare`
        : units?.tooltip;
  const note = status === "ready" ? (few ? units?.note || units?.message : units?.approximate ? units?.message : null) : failed ? "The states could not be loaded: the map shows squares." : null;
  return (
    <section className="map-section" aria-labelledby="map-detail-title">
      <h2 id="map-detail-title" className="map-section-title">
        Detail
      </h2>
      <Segmented
        options={[
          { value: "squares", label: "Squares", title: "Every map square, ranked one by one" },
          { value: "units", label, title, disabled },
        ]}
        value={value === "units" && !disabled ? "units" : "squares"}
        onChange={onChange}
        ariaLabel="Detail"
      />
      {note && <p className="map-section-note">{note}</p>}
    </section>
  );
}

export function MapTabs({ value, onChange, measured = true, why = null }) {
  const shown = value === "access" && !measured ? "priority" : value;
  return (
    <section className="map-section" aria-labelledby="map-tabs-title">
      <h2 id="map-tabs-title" className="map-section-title">
        Map
      </h2>
      <div className="map-tabs" role="group" aria-label="Colour the map by">
        {MAP_TABS.map((tab) => {
          const off = tab.value === "access" && !measured;
          const active = tab.value === shown;
          return (
            <button
              key={tab.value}
              type="button"
              className={["map-tab", `map-tab-${tab.value}`, active ? "is-active" : ""].filter(Boolean).join(" ")}
              aria-pressed={active}
              disabled={off || undefined}
              title={off ? why || "Feasibility not measured here" : undefined}
              onClick={() => onChange(tab.value)}
            >
              <span className="map-tab-ramp" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((step) => (
                  <span key={step} style={{ background: `var(--map-${tab.value}-${step})` }} />
                ))}
              </span>
              <span className="map-tab-label">{tab.label}</span>
              <span className="map-tab-hint">{off ? "Not measured here" : tab.hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
