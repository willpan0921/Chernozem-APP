// WHAT THIS FILE DOES
// Small helpers shared by the Atlas Overview (/atlas) and the printable
// report (/atlas/report):
//
//   useMonthInUrl()          keeps the chosen month in the web address
//                            (?month=2026-09), so a shared link or a reload
//                            opens the same month
//   nameAreas(hotspots)      gives each top area the name every page
//                            uses (its "label" from hotspots.js: the place
//                            name, else "North-west", "East"…), split in
//                            two for lists: the name, then the coordinates
//   planSteps({ run, hotspots, alerts, isLatest })   the "Next steps",
//                            worded with those short names
//   weightItems(settings, timeframe)   the weights in one line, as the
//                            ranking uses them: Postwar "Soil 30 · Damage 40
//                            · Access 30"; Near term "Soil 43 · Damage 57 ·
//                            Cutoff 30%" (safe access is a cutoff there, so
//                            soil and damage are shown as shares of 100)
//   haFixed(ha)              hectares for tables: "4.0 ha", "4.7 ha", "52 ha"
//   priorityIndex(hotspot)   the score as 0–100, where 100 is the best square
//
// WHO EDITS IT
// Whoever changes the Atlas overview or report. The rules behind the steps
// themselves are in src/lib/atlas/overview.js.

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAtlasData } from "../../state/AtlasData.jsx";
import { nextSteps } from "../../lib/atlas/overview.js";
import { labelParts } from "../../lib/atlas/hotspots.js";
import { nearTermShares } from "../../lib/atlas/scoring.js";
import { addDays, formatHaShort, formatKm2, toDay } from "../../lib/format.js";

// ---------- The month in the web address ----------

// Call it in the page's outer part (outside <AtlasGate>). It gives back
// true while a month from the address is still being switched to, so the
// page can wait instead of flashing the wrong month.
export function useMonthInUrl() {
  const { runs, runSummary, actions } = useAtlasData();
  const [params, setParams] = useSearchParams();
  const urlMonth = params.get("month");
  // The month the address and the selection last agreed on.
  const agreed = useRef(null);
  const match = urlMonth ? runs.find((item) => item.month === urlMonth) : null;
  // The address names another month we have not switched to yet.
  const followAddress = Boolean(runSummary && match && urlMonth !== agreed.current && urlMonth !== runSummary.month);

  useEffect(() => {
    if (!runSummary) return;
    if (followAddress) {
      agreed.current = urlMonth;
      actions.selectRun(match.id);
      return;
    }
    // Otherwise the picker changed the month (or the address had none):
    // write it into the address.
    agreed.current = runSummary.month;
    if (urlMonth !== runSummary.month) {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          updated.set("month", runSummary.month);
          return updated;
        },
        { replace: true }
      );
    }
  }, [followAddress, urlMonth, match, runSummary, actions, setParams]);

  return followAddress;
}

// Adds ?month= (and ?view=postwar when chosen) to a link inside the Atlas.
export function atlasLink(path, { month, timeframe } = {}) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (month && !params.has("month")) params.set("month", month);
  if (timeframe === "postwar" && !params.has("view")) params.set("view", "postwar");
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

// ---------- Short names for the top areas ----------

// Each hotspot gets
//   name    its one-line label, for sentences: "Bakhmut, Donetsk", "East",
//           or "West · 47.98° N, 24.76° E" when two areas share a name
//   title   the name for a two-line list: "West"
//   coords  "47.98° N, 24.76° E", the list's second line
export function nameAreas(hotspots = []) {
  return hotspots.map((hotspot) => ({ ...hotspot, name: hotspot.label, ...labelParts(hotspot) }));
}

// The top area an alert falls in, or null.
export function areaOfAlert(alert, namedHotspots = []) {
  const ids = new Set(alert?.cellIds || []);
  return namedHotspots.find((hotspot) => hotspot.cellIds.some((id) => ids.has(id))) || null;
}

// ---------- Next steps ----------

// Days given for a step once the month has been analyzed.
const DAYS_TO_ACT = 7;

// The steps from overview.js, with three changes for the page:
//   - places get the same names as the top-areas list
//   - a step's id includes the areas it names, so a step ticked off for
//     one set of places is not ticked for another after a weight change
//   - for the newest month, nothing is due sooner than a week after the
//     analysis ran, so a fresh plan never opens with "Overdue"
export function planSteps({ run, hotspots = [], alerts = [], isLatest = false }) {
  const named = hotspots.map((hotspot) => ({ ...hotspot, label: hotspot.name || hotspot.label }));
  const steps = nextSteps({ run, hotspots: named, alerts });
  const analyzed = run?.createdAt ? toDay(new Date(run.createdAt)) : toDay(new Date());
  const earliest = isLatest ? addDays(analyzed, DAYS_TO_ACT) : null;

  return steps.map((step) => {
    const next = { ...step };
    if (step.id === `${run.id}-demining`) next.id = `${step.id}-${named.slice(0, 2).map((hotspot) => hotspot.id).join("-")}`;
    if (step.id === `${run.id}-soil-test` && named[2]) next.id = `${step.id}-${named[2].id}`;
    const alert = alerts.find((item) => step.id === `${run.id}-${item.id}-review`);
    if (alert) {
      const area = areaOfAlert(alert, named);
      next.title = area
        ? `Review new damage in ${area.name}`
        : Number.isFinite(alert.magnitude)
          ? `Review ${formatKm2(alert.magnitude)} of new damage`
          : "Review new damage";
    }
    if (earliest && next.due < earliest) next.due = earliest;
    return next;
  });
}

// ---------- The weights in one line ----------

// Gives back [{ key: "soil" | "damage" | "access", text }], in that order.
// "key" picks the colour dot; for Near term the "access" item is the cutoff.
export function weightItems(settings, timeframe) {
  const weights = settings?.weights || {};
  if (timeframe === "nearTerm") {
    const shares = nearTermShares(weights);
    return [
      { key: "soil", text: `Soil ${shares.soil}` },
      { key: "damage", text: `Damage ${shares.damage}` },
      { key: "access", text: `Cutoff ${settings?.gatePercentile ?? 0}%` },
    ];
  }
  return [
    { key: "soil", text: `Soil ${weights.soil}` },
    { key: "damage", text: `Damage ${weights.damage}` },
    { key: "access", text: `Access ${weights.access}` },
  ];
}

// ---------- Numbers for tables ----------

// One decimal under 10 ha, so a column lines up: "4.0 ha", "4.7 ha", "52 ha".
export function haFixed(hectares) {
  if (!Number.isFinite(hectares)) return "–";
  if (Math.abs(hectares) < 10) return `${hectares.toFixed(1)} ha`;
  return formatHaShort(hectares);
}

// 0–100: the area's score as a share of the best square's in that time frame.
export function priorityIndex(hotspot) {
  return Number.isFinite(hotspot?.share) ? Math.round(hotspot.share * 100) : null;
}
