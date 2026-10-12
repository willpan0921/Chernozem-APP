// WHAT THIS FILE DOES
// A row of pill-shaped tabs, like the filters on the Notes page ("All 5",
// "Pests 1") or the sections on the Settings page.
//
// WHAT IT RECEIVES
// tabs     - a list of { id, label, count? }
// active   - the id of the selected tab
// onChange - called with the new id when someone clicks a tab
// bar      - true draws the tabs on a grey track (Settings / Data pages)

export default function Tabs({ tabs, active, onChange, bar, ariaLabel }) {
  return (
    <div className={bar ? "tabs tabs-bar" : "tabs"} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={tab.id === active ? "tab is-active" : "tab"}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
