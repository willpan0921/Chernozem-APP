// WHAT THIS FILE DOES
// The month picker: a small dropdown chip ("September 2026 v") over the
// current area's monthly runs. Picking a month shows that month on every
// Atlas page.
//
// WHAT IT RECEIVES
//   nothing needed; it reads and changes the selected run through
//   useAtlasData(). Shows nothing until the area has a run.
//
// WHO EDITS IT
// Whoever changes how a month is picked.

import { CalendarDays } from "lucide-react";
import { ChipSelect } from "../ui/index.js";
import { useAtlasData } from "../../state/AtlasData.jsx";

export default function RunPicker() {
  const { runs, runSummary, actions } = useAtlasData();
  if (!runs.length || !runSummary) return null;
  const options = runs.map((item) => ({ value: item.id, label: item.label }));
  return (
    <ChipSelect
      icon={<CalendarDays size={13} />}
      options={options}
      value={runSummary.id}
      onChange={actions.selectRun}
      ariaLabel="Month"
    />
  );
}
