// WHAT THIS FILE DOES
// Works out everything the Atlas Overview (and the printable report) says
// from the scored run, so none of it is typed in by hand:
//
//   summarize(places)            totals over the map squares
//   kpis(summary)                the four big numbers
//   nextSteps({ run, hotspots, alerts, settings })   the "Next steps" list
//   describeAlert(alert)         the wording, colour and icon of one alert
//   springPlan(budget, hotspots, costs)   how much land a budget covers
//   recoveryCost(ha, costs)      what recovering some hectares costs
//   imageryText(run)             "Imagery from April to September 2026, ..."
//   weightsText(settings)        "Soil 30 · Damage 40 · Access 30"
//   atPeace(run)                 true when no war in the app's list covers the run
//   shownNewDamage(run, runs)    new heavy damage, or null when the month before is not comparable
//   sourceBadge(runs)            the Data page's "Earth Engine · 11 earlier months are sample data"
//   timeframeLabel(tf, run)      "Near term", and "Postwar" (a war) or "Long term"
//   timeframeOptions(run)        the two time frames for a Near term | ... switch
//   ruleText(tf, settings, run)  the one-line rule of a time frame
//
// Plain functions with no React, like scoring.js, so they can be tested and
// reused by the report and the server.
//
// WHO EDITS IT
// Whoever changes the rules behind the overview. For example, to add a new
// kind of next step, add a block to nextSteps() below.

import { COSTS, runsComparable } from "./method.js";
import { addDays, addMonths, formatHaShort, formatCount, formatMonthYear, formatShortDate, listNames, monthName, roundThousands, toDay } from "../format.js";

// ---------- Totals and the four big numbers ----------

// Adds up the run's numbers across the scored squares.
export function summarize(places) {
  const list = places || [];
  const sum = (key) => list.reduce((total, place) => total + (Number.isFinite(place[key]) ? place[key] : 0), 0);
  const blackSoilHa = sum("blackSoilHa");
  const heavyDamageHa = sum("heavyDamageHa");
  return {
    cellCount: list.length,
    analyzedCount: list.filter((place) => place.analyzed !== false).length,
    croplandHa: sum("croplandHa"),
    blackSoilHa,
    heavyDamageHa,
    damagedShare: blackSoilHa > 0 ? heavyDamageHa / blackSoilHa : null,
    people: sum("people"),
    peopleOnDamagedSoil: sum("peopleOnDamagedSoil"),
  };
}

// The four big numbers along the top of the overview. The damage number is
// red only inside a war (`run` with a conflict, or an older run); at peace
// it is radar change, not an alarm.
export function kpis(summary, run = null) {
  return [
    { id: "cropland", label: "Cropland analyzed", value: formatHaShort(summary.croplandHa) },
    { id: "black-soil", label: "Black-soil cropland", value: formatHaShort(summary.blackSoilHa) },
    { id: "heavy-damage", label: "Heavily damaged", value: formatHaShort(summary.heavyDamageHa), tone: atPeace(run) ? undefined : "red" },
    { id: "people", label: "People on damaged land", value: formatCount(summary.peopleOnDamagedSoil) },
  ];
}

// "From 31.2M ha of cropland in 1,176 squares."
export function kpiFootnote(summary) {
  return `From ${formatHaShort(summary.croplandHa)} of cropland in ${summary.cellCount.toLocaleString("en-US")} squares.`;
}

// ---------- Month to month ----------

// The run of the month before `run` among `runs` (summaries), or null.
export function previousMonthRun(run, runs) {
  if (!run?.month) return null;
  const before = addMonths(`${run.month}-01`, -1).slice(0, 7);
  return (runs || []).find((item) => item?.month === before && item.areaId === run.areaId) || null;
}

// The run's new heavy damage as the pages may show it: null when the
// month before is from another data source, method or grid (method.js
// runsComparable), because the difference then says nothing about the
// land. Runs saved before that check kept their old number; it is hidden
// here too.
export function shownNewDamage(run, runs) {
  if (!Number.isFinite(run?.newHeavyDamageHa)) return null;
  const before = previousMonthRun(run, runs);
  if (before && !runsComparable(before, run).comparable) return null;
  return run.newHeavyDamageHa;
}

// The Data page's source badge: the latest month's source, and how many
// earlier months came from the other one.
//   -> { text: "Earth Engine · 11 earlier months are sample data", tone: "amber" | null }
export function sourceBadge(runs) {
  const list = runs || [];
  if (!list.length) return null;
  const latest = list.reduce((best, item) => (String(item.month) > String(best.month) ? item : best));
  const real = latest.provider === "gee";
  const others = list.filter((item) => item !== latest && (item.provider === "gee") !== real).length;
  const name = real ? "Earth Engine" : "Sample data";
  if (!others) return { text: name, tone: real ? null : "amber" };
  const otherName = real ? "sample data" : "Earth Engine";
  return { text: `${name} · ${others} earlier ${others === 1 ? "month is" : "months are"} ${otherName}`, tone: "amber" };
}

// ---------- Run description ----------

// The day a run is treated as published: the 1st of the month after it.
export function publishedOn(run) {
  if (run?.month) return addMonths(`${run.month}-01`, 1);
  return toDay(new Date());
}

// Kept for older pages: the date the office is working on.
export function todayFor() {
  return toDay(new Date());
}

// "Imagery from April to September 2026, compared with 2019 to 2021".
// Where parts of the area have different growing seasons (Earth Engine
// says so in run.imagery.label): "Imagery from April to September 2025 (80%
// of the area); May to October 2025 (20% of the area), compared with ...".
export function imageryText(run) {
  const { from, to, label } = run?.imagery || {};
  if (!from || !to) return "";
  const baseline = run.baseline?.label ? `, compared with ${run.baseline.label}` : "";
  if (label && label.includes(";")) return `Imagery from ${label}${baseline}`;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = sameYear ? monthName(`${from}-01`) : formatMonthYear(from);
  return `Imagery from ${start} to ${formatMonthYear(to)}${baseline}`;
}

// "Soil 30 · Damage 40 · Access 30".
export function weightsText(settings) {
  const w = settings?.weights || {};
  return `Soil ${w.soil ?? "–"} · Damage ${w.damage ?? "–"} · Access ${w.access ?? "–"}`;
}

// True when the run says no war in src/config/conflicts.js covers its area
// (conflict null). Older runs without the field were all made inside the
// war in Ukraine, so they are not at peace.
export function atPeace(run) {
  return Boolean(run) && run.conflict === null;
}

// The name of a time frame. Without a war "postwar" means nothing, so the
// blended ranking is called "Long term" there.
export function timeframeLabel(timeframe, run) {
  if (timeframe === "postwar") return atPeace(run) ? "Long term" : "Postwar";
  return "Near term";
}

// The options for a Near term | Postwar (or Long term) switch.
export function timeframeOptions(run) {
  return ["nearTerm", "postwar"].map((value) => ({ value, label: timeframeLabel(value, run) }));
}

// The one-line rule for each time frame (for the report).
export function ruleText(timeframe, settings, run) {
  const peace = atPeace(run);
  if (timeframe === "postwar") {
    return peace
      ? "All three scores are blended into one long-term ranking."
      : "All three scores are blended, so heavy damage can outweigh lower access once fighting ends.";
  }
  if (peace && run?.accessSource !== "acled") {
    return "No war in the app's list covers this area, so nothing is set aside for distance to fighting. Places are ranked by soil value and damage.";
  }
  return `The least safe ${settings?.gatePercentile ?? 30}% of black soil (nearest the fighting) is set aside. The rest is ranked by soil value and damage.`;
}

// ---------- Alerts ----------

// The wording, colour and icon of one alert.
//   radar -> { title: "Radar change", place, detail: "Sep 24 · 3.2 km² changed", tone: "amber", icon: "radar" }
//   fire  -> { title: "Fires detected", place, detail: "Sep 21 · 14 detections", tone: "red", icon: "fire" }
export function describeAlert(alert) {
  const when = alert?.date ? formatShortDate(alert.date) : "";
  const size = Number.isFinite(alert?.magnitude)
    ? `${alert.magnitude.toLocaleString("en-US", { maximumFractionDigits: alert.magnitude < 10 ? 1 : 0 })} ${alert.unit || ""}`.trim()
    : "";
  const detail = [when, size].filter(Boolean).join(" · ");
  if (alert?.kind === "fire") return { title: "Fires detected", place: alert.place || "", detail, tone: "red", icon: "fire" };
  return { title: "Radar change", place: alert?.place || "", detail, tone: "amber", icon: "radar" };
}

// ---------- Next steps ----------

// "Next steps", built from this run's top areas and alerts. Each step has
//   id     stable, so ticking it off is remembered (workspace.doneSteps)
//   title  what to do
//   due    "YYYY-MM-DD"
//   icon   "shield" | "alert" | "soil" | "report"
//   tone   "green" | "red" | "amber" | null
//   to     the page that clicking the step opens
// "hotspots" are the Near-term top areas (groupHotspots(..., "nearTerm")).
export function nextSteps({ run, hotspots = [], alerts = [] }) {
  if (!run) return [];
  const steps = [];
  const published = publishedOn(run);
  // No war in the app's list: no demining, no "cleared land", and radar
  // change is just change (harvest, tillage, flooding) until someone looks.
  const peace = atPeace(run);

  // 1. Demining surveys (in a war) or soil surveys (at peace) come first in
  // the two best Near-term areas.
  if (hotspots.length >= 1) {
    const names = hotspots.slice(0, 2).map((hotspot) => hotspot.label);
    steps.push({
      id: `${run.id}-demining`,
      title: peace ? `Plan soil surveys in ${listNames(names)}` : `Fund demining surveys in ${listNames(names)}`,
      due: addMonths(published, 1),
      icon: peace ? "soil" : "shield",
      tone: "green",
      to: `/atlas/map?focus=${hotspots[0].id}`,
    });
  }

  // 2. Each radar change (at most two) gets a review.
  for (const alert of alerts.filter((item) => item.kind === "radar").slice(0, 2)) {
    const focus = alert.cellIds?.[0];
    steps.push({
      id: `${run.id}-${alert.id}-review`,
      title: peace ? `Check the radar change near ${alert.place}` : `Review new damage near ${alert.place}`,
      due: alert.date ? addDays(alert.date, 7) : published,
      icon: "alert",
      tone: peace ? "amber" : "red",
      to: focus ? `/atlas/map?focus=${focus}&view=postwar&color=damage` : "/atlas/map?color=damage",
    });
  }

  // 3. Soil testing (on cleared land, in a war) in the third area.
  if (hotspots.length >= 3) {
    steps.push({
      id: `${run.id}-soil-test`,
      title: peace ? `Test soil in ${hotspots[2].label}` : `Test soil on cleared land in ${hotspots[2].label}`,
      due: addMonths(published, 2),
      icon: "soil",
      tone: "amber",
      to: `/atlas/map?focus=${hotspots[2].id}`,
    });
  }

  // 4. The monthly report.
  steps.push({
    id: `${run.id}-report`,
    title: `Send the ${monthName(`${run.month}-01`)} report`,
    due: published,
    icon: "report",
    tone: null,
    to: "/atlas/report",
  });

  return steps;
}

// ---------- Money ----------

// What recovering "ha" hectares costs, before demining:
//   { fast: [low, high], full: [low, high] } in US dollars.
export function recoveryCost(ha, costs = COSTS) {
  const area = Number.isFinite(ha) ? Math.max(0, ha) : 0;
  const fast = costs?.fastPathPerHa || COSTS.fastPathPerHa;
  const full = costs?.fullRecoveryPerHa || COSTS.fullRecoveryPerHa;
  return { fast: [area * fast[0], area * fast[1]], full: [area * full[0], area * full[1]] };
}

// How much land a budget covers on the fast path, and where to start.
// The cheapest cost per hectare gives the most land, so it sets the top of
// the range.
export function springPlan(budgetUsd, hotspots = [], costs = COSTS) {
  const [low, high] = costs?.fastPathPerHa || COSTS.fastPathPerHa;
  const start = hotspots.slice(0, 3).map((hotspot) => hotspot.label);
  const budget = Number.isFinite(budgetUsd) ? Math.max(0, budgetUsd) : 0;
  const fewestHa = budget / high;
  const mostHa = budget / low;
  const range = (value) => (value >= 1000 ? roundThousands(value) : Math.round(value).toLocaleString("en-US"));
  let text = "Set a budget to see how much land it covers.";
  if (budget > 0) {
    text = `About ${range(fewestHa)} to ${range(mostHa)} ha`;
    if (start.length) text += `, starting with ${listNames(start)}`;
  }
  return { fewestHa, mostHa, start, text };
}
