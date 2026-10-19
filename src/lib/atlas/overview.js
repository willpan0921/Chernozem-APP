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
//   damageMeaning(run)           what the damage score is for this run
//   accessMeaning(run)           what safe access is for this run
//   accessMeasured(run)          false at peace without an ACLED file
//   accessSourceOf(run)          where safe access came from, also for older runs
//   conflictOf(run)              the run's war, also for older runs
//
// Plain functions with no React, like scoring.js, so they can be tested and
// reused by the report and the server.
//
// WHO EDITS IT
// Whoever changes the rules behind the overview. For example, to add a new
// kind of next step, add a block to nextSteps() below.

import { COSTS, HEAVY_DAMAGE, PEACE_DAMAGE, SCALES, runsComparable } from "./method.js";
import { conflictForCountry } from "../../config/conflicts.js";
import { addDays, addMonths, formatCoord, formatHaShort, formatCount, formatMonthYear, formatShortDate, listNames, monthName, roundThousands, toDay } from "../format.js";

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

// "Imagery from April to September 2026, compared with 2019 to 2021"; for
// a composite of several war seasons "Imagery from April to September of
// 2022 to 2025, compared with ...".
// Where parts of the area have different growing seasons (Earth Engine
// says so in run.imagery.label): "Imagery from April to September 2025 (80%
// of the area); May to October 2025 (20% of the area), compared with ...".
export function imageryText(run) {
  const { from, to, label } = run?.imagery || {};
  if (!from || !to) return "";
  const baseline = run.baseline?.label ? `, compared with ${run.baseline.label}` : "";
  // Several areas' seasons, or the damage radar's war seasons ("April to
  // September of 2022 to 2025").
  if (label && (label.includes(";") || run.imagery.seasons > 1)) return `Imagery from ${label}${baseline}`;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = sameYear ? monthName(`${from}-01`) : formatMonthYear(from);
  return `Imagery from ${start} to ${formatMonthYear(to)}${baseline}`;
}

// "Soil 30 · Damage 40 · Access 30".
export function weightsText(settings) {
  const w = settings?.weights || {};
  return `Soil ${w.soil ?? "–"} · Damage ${w.damage ?? "–"} · Access ${w.access ?? "–"}`;
}

// Where safe access came from: "acled", "fires", "none" or null. Runs
// saved before run.accessSource existed still carry the provider's warning
// (server/providers/gee.js), so "fires" is read from that.
const FIRES_WARNING = /estimated from unusual fires/i;
export function accessSourceOf(run) {
  if (!run) return null;
  if (run.accessSource) return run.accessSource;
  const warnings = run.checks?.warnings || run.warnings || [];
  return warnings.some((w) => FIRES_WARNING.test(String(w))) ? "fires" : null;
}

// The war covering the run: { id, name, since }, null at peace, or
// undefined for an older run that does not say. A country area saved
// before run.conflict existed gets that country's war from
// src/config/conflicts.js (the Ukraine runs, country-804).
export function conflictOf(run) {
  if (!run) return undefined;
  if (run.conflict !== undefined) return run.conflict;
  const code = /^country-(\d+)$/.exec(String(run.areaId || ""))?.[1];
  const war = code ? conflictForCountry(code) : null;
  return war ? { id: war.id, name: war.name, since: war.since } : undefined;
}

// True when the run says no war in src/config/conflicts.js covers its area
// (conflict null). Older runs without the field were all made inside the
// war in Ukraine, so they are not at peace.
export function atPeace(run) {
  return Boolean(run) && conflictOf(run) === null;
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

// Whether safe access was measured for this run: in a war (or an older
// run), or at peace with an ACLED file. At peace without one, every square
// gets full access (nothing to measure it from).
export function accessMeasured(run) {
  return !atPeace(run) || accessSourceOf(run) === "acled";
}

// What the damage score is, as scoring.js uses it for this run:
//   in a war   "unusual fire and radar change against the normal years 2019–2021"
//   at peace   "the heavily damaged share of the black soil (radar change
//              backed by unusual fire), full at 20%"
export function damageMeaning(run) {
  if (atPeace(run)) {
    return `the heavily damaged share of the black soil (radar change backed by unusual fire), full at ${Math.round(PEACE_DAMAGE.fullShare * 100)}%`;
  }
  return "unusual fire and radar change against the normal years 2019–2021";
}

// What safe access is for this run. At peace without an ACLED file it is
// never called "distance to fighting": nothing was measured. In a war with
// no ACLED file it is the distance to unusual fires (run.accessSource
// "fires", server/providers/gee.js), an estimate, never "recorded fighting".
export function accessMeaning(run) {
  const km = SCALES.distance.full;
  if (!accessMeasured(run)) return "full everywhere: with no war recorded, every square counts as safe to reach (this does not prove the land is safe)";
  if (accessSourceOf(run) === "acled") return `the distance to battles in the ACLED file, full at ${km} km`;
  if (accessSourceOf(run) === "fires") return `the distance to unusual fires (an estimate of where fighting is; no ACLED file), full at ${km} km`;
  return `the distance to recorded fighting, full at ${km} km`;
}

// What the distance is measured to, in a few words: "recorded fighting",
// "an ACLED battle" or "an unusual fire".
function accessTarget(run) {
  if (accessSourceOf(run) === "acled") return "an ACLED battle";
  if (accessSourceOf(run) === "fires") return "an unusual fire";
  return "recorded fighting";
}

// The Near term set-aside in one sentence, for the report's method:
//   at peace, no ACLED   "Near term sets nothing aside and ranks by soil value and damage."
//   cutoff 0%            "Near term sets nothing aside (cutoff 0%) and ranks ..."
//   else                 "Near term sets aside the least safe 30% of black soil
//                        (squares 100 km or more from an unusual fire are never
//                        set aside) and ranks the rest by soil value and damage."
export function nearTermSetAside(run, settings) {
  const gate = settings?.gatePercentile ?? 0;
  if (!accessMeasured(run)) return "Near term sets nothing aside and ranks by soil value and damage.";
  if (!(gate > 0)) return "Near term sets nothing aside (cutoff 0%) and ranks by soil value and damage.";
  return `Near term sets aside the least safe ${gate}% of black soil (squares ${SCALES.distance.full} km or more from ${accessTarget(run)} are never set aside) and ranks the rest by soil value and damage.`;
}

// Heavy damage in one line, for the method notes:
//   at peace "radar change of 3 dB or more AND an unusual fire within 1 km"
export function heavyDamageRule(run) {
  const km = HEAVY_DAMAGE.fireNearM / 1000;
  if (atPeace(run)) return `radar change of ${HEAVY_DAMAGE.radarDb} dB or more and an unusual fire within ${km} km`;
  return `radar change of ${HEAVY_DAMAGE.radarDb} dB or more, or of ${HEAVY_DAMAGE.radarWithFireDb} dB or more with an unusual fire within ${km} km`;
}

// The one-line rule for each time frame (for the report).
export function ruleText(timeframe, settings, run) {
  const peace = atPeace(run);
  if (timeframe === "postwar") {
    return peace
      ? "All three scores are blended into one long-term ranking."
      : "All three scores are blended, so heavy damage can outweigh lower access once fighting ends.";
  }
  if (peace && accessSourceOf(run) !== "acled") {
    return "No war is recorded here, so nothing is set aside. Places are ranked by soil value and damage.";
  }
  const gate = settings?.gatePercentile ?? 30;
  if (!(gate > 0)) return "Nothing is set aside (cutoff 0%). Places are ranked by soil value and damage.";
  const nearest = accessSourceOf(run) === "fires" ? "nearest the unusual fires that stand in for fighting" : accessSourceOf(run) === "acled" ? "nearest the ACLED battles" : "nearest the fighting";
  return `The least safe ${gate}% of black soil (${nearest}) is set aside. The rest is ranked by soil value and damage.`;
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

// Each alert's place in words, the same on the Overview, the Report and
// in the AI's context: alert.place, with its coordinates when another
// alert of the same kind has the same place ("Radar change · Nakuru, Rift
// Valley · 0.21° S, 35.80° E"), so two alerts never read the same. Gives
// back a Map alert.id -> label.
export function alertPlaces(alerts = []) {
  const key = (alert) => `${alert.kind || ""}|${alert.place || ""}`;
  const count = new Map();
  for (const alert of alerts) count.set(key(alert), (count.get(key(alert)) || 0) + 1);
  const out = new Map();
  for (const alert of alerts) {
    const place = alert.place || "";
    const coords = Number.isFinite(alert.lat) && Number.isFinite(alert.lon) ? formatCoord(alert.lat, alert.lon) : null;
    const twin = count.get(key(alert)) > 1 || !place;
    out.set(alert.id, twin && coords ? (place && place !== coords ? `${place} · ${coords}` : coords) : place);
  }
  return out;
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

  // 2. Each radar change (at most two) gets a review, named the way the
  // alert list names it (alertPlaces).
  const places = alertPlaces(alerts);
  for (const alert of alerts.filter((item) => item.kind === "radar").slice(0, 2)) {
    const focus = alert.cellIds?.[0];
    const where = places.get(alert.id) || alert.place;
    steps.push({
      id: `${run.id}-${alert.id}-review`,
      title: peace ? `Check the radar change near ${where}` : `Review new damage near ${where}`,
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
