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
//
// Plain functions with no React, like scoring.js, so they can be tested and
// reused by the report and the server.
//
// WHO EDITS IT
// Whoever changes the rules behind the overview. For example, to add a new
// kind of next step, add a block to nextSteps() below.

import { COSTS } from "./method.js";
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

// The four big numbers along the top of the overview.
export function kpis(summary) {
  return [
    { id: "cropland", label: "Cropland analyzed", value: formatHaShort(summary.croplandHa) },
    { id: "black-soil", label: "Black-soil cropland", value: formatHaShort(summary.blackSoilHa) },
    { id: "heavy-damage", label: "Heavily damaged", value: formatHaShort(summary.heavyDamageHa), tone: "red" },
    { id: "people", label: "People on damaged land", value: formatCount(summary.peopleOnDamagedSoil) },
  ];
}

// "From 31.2M ha of cropland in 1,176 squares."
export function kpiFootnote(summary) {
  return `From ${formatHaShort(summary.croplandHa)} of cropland in ${summary.cellCount.toLocaleString("en-US")} squares.`;
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
export function imageryText(run) {
  const { from, to } = run?.imagery || {};
  if (!from || !to) return "";
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = sameYear ? monthName(`${from}-01`) : formatMonthYear(from);
  const baseline = run.baseline?.label ? `, compared with ${run.baseline.label}` : "";
  return `Imagery from ${start} to ${formatMonthYear(to)}${baseline}`;
}

// "Soil 30 · Damage 40 · Access 30".
export function weightsText(settings) {
  const w = settings?.weights || {};
  return `Soil ${w.soil ?? "–"} · Damage ${w.damage ?? "–"} · Access ${w.access ?? "–"}`;
}

// The one-line rule for each time frame (for the report).
export function ruleText(timeframe, settings) {
  if (timeframe === "postwar") {
    return "All three scores are blended, so heavy damage can outweigh lower access once fighting ends.";
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

  // 1. Demining surveys come first in the two best Near-term areas.
  if (hotspots.length >= 1) {
    const names = hotspots.slice(0, 2).map((hotspot) => hotspot.label);
    steps.push({
      id: `${run.id}-demining`,
      title: `Fund demining surveys in ${listNames(names)}`,
      due: addMonths(published, 1),
      icon: "shield",
      tone: "green",
      to: `/atlas/map?focus=${hotspots[0].id}`,
    });
  }

  // 2. Each radar change (at most two) gets a review.
  for (const alert of alerts.filter((item) => item.kind === "radar").slice(0, 2)) {
    const focus = alert.cellIds?.[0];
    steps.push({
      id: `${run.id}-${alert.id}-review`,
      title: `Review new damage near ${alert.place}`,
      due: alert.date ? addDays(alert.date, 7) : published,
      icon: "alert",
      tone: "red",
      to: focus ? `/atlas/map?focus=${focus}&view=postwar&color=damage` : "/atlas/map?color=damage",
    });
  }

  // 3. Soil testing on cleared land in the third area.
  if (hotspots.length >= 3) {
    steps.push({
      id: `${run.id}-soil-test`,
      title: `Test soil on cleared land in ${hotspots[2].label}`,
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
