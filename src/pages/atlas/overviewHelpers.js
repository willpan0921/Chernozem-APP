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
//   warNote(run)             the war the run counted damage from, or the
//                            "no war in the app's list" note; null for
//                            older runs that do not say
//   haFixed(ha)              hectares for tables: "4.0 ha", "4.7 ha", "52 ha", "0 ha"
//   priorityIndex(hotspot)   the score as 0–100, where 100 is the best square
//
// WHO EDITS IT
// Whoever changes the Atlas overview or report. The rules behind the steps
// themselves are in src/lib/atlas/overview.js.

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAtlasData } from "../../state/AtlasData.jsx";
import { atPeace, nextSteps } from "../../lib/atlas/overview.js";
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
  const peace = atPeace(run);

  return steps.map((step) => {
    const next = { ...step };
    if (step.id === `${run.id}-demining`) next.id = `${step.id}-${named.slice(0, 2).map((hotspot) => hotspot.id).join("-")}`;
    if (step.id === `${run.id}-soil-test` && named[2]) next.id = `${step.id}-${named[2].id}`;
    const alert = alerts.find((item) => step.id === `${run.id}-${item.id}-review`);
    if (alert) {
      // Away from any known war a radar change is not "damage" (overview.js
      // words it the same way).
      const area = areaOfAlert(alert, named);
      if (peace) {
        next.title = area
          ? `Check the radar change in ${area.name}`
          : Number.isFinite(alert.magnitude)
            ? `Check ${formatKm2(alert.magnitude)} of radar change`
            : "Check the radar change";
      } else {
        next.title = area
          ? `Review new damage in ${area.name}`
          : Number.isFinite(alert.magnitude)
            ? `Review ${formatKm2(alert.magnitude)} of new damage`
            : "Review new damage";
      }
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
  if (hectares === 0) return "0 ha";
  if (Math.abs(hectares) < 10) return `${hectares.toFixed(1)} ha`;
  return formatHaShort(hectares);
}

// 0–100: the area's score as a share of the best square's in that time frame.
export function priorityIndex(hotspot) {
  return Number.isFinite(hotspot?.share) ? Math.round(hotspot.share * 100) : null;
}

// The war a run counted damage from (run.conflict, set by the server from
// src/config/conflicts.js), in words for the pages:
//   { war: true, badge: "War since 24 Feb 2022", line: "Full-scale invasion
//     of Ukraine, since 24 February 2022: damage is counted from that day." }
//   { war: false, badge: null, line: "No war recorded here: ..." }
// Runs saved before the field existed give null (nothing is shown).
export function warNote(run) {
  const conflict = run?.conflict;
  if (conflict === undefined) return null;
  if (!conflict?.since) {
    const damage = "Damage is unusual fire and radar change against the normal years 2019–2021, from any cause.";
    // With an ACLED file, distance to fighting is measured from its battles
    // even at peace, so places can still be set aside.
    if (run.accessSource === "acled") {
      return { war: false, badge: null, line: `No war in the app's list covers this area; safe access is the distance to battles in the ACLED file. ${damage}` };
    }
    return {
      war: false,
      badge: null,
      line: `No war in the app's list covers this area, so distance to fighting is not measured and nothing is set aside for it. ${damage} This does not mean the land is safe.`,
    };
  }
  const day = new Date(`${conflict.since}T00:00:00Z`);
  const short = day.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const long = day.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return { war: true, name: conflict.name, badge: `War since ${short}`, line: `${conflict.name}, since ${long}: damage is counted from that day.` };
}
