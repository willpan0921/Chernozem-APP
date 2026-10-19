// WHAT THIS FILE DOES
// The words of the Field overview page (/field), worked out from the farm,
// its analyses, the weather and the latest update job. No React here, so
// it is tested in overview.test.js:
//
//   statusSentence(farm, analyses, job)  -> { text: "1 field needs recovery · 1 to watch", tone: "red" }
//   showRecoveryTile(counts, conflict)   -> false on a peaceful farm with nothing to recover
//   needsDoing({ farm, analyses, weather, job })  -> the "What needs doing" items, most urgent first
//   latestPass(farm, analyses)      -> "2026-10-16" (the newest clear Sentinel-2 pass) or null
//   likelyRain(weather)             -> { from, to, mm } or null
//   shortUsd(1948) -> "$1.9k" ;  usdRange([1948, 5900]) -> "$1.9k–5.9k"
//   fieldNames([...])               -> "Field 7", "Fields 6 and 7", "Fields 1, 2 and 5"
//
// The rules (what counts as damaged, ready, stressed...) are in method.js;
// this file only turns them into short lines.
//
// WHO EDITS IT
// Whoever changes what the Field overview says.

import { COST_NOTE, recoveryCost } from "./method.js";
import { analysingIds, causeText, formatArea, formatDay, formatDayRange, riskNote, statusCounts } from "./format.js";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "1 field needs recovery · 1 to watch · 2 ready to harvest", "All 7
// fields healthy", or "4 healthy · 5 harvested · 1 ready to harvest" (a
// harvested or not-sown field has no crop, so it is never "healthy").
// tone: "green" | "amber" | "red". With the running update (job), new
// fields read "1 being analysed".
export function statusSentence(farm, analyses = {}, job = null) {
  const counts = statusCounts(farm, analyses);
  const ready = (farm?.fields || []).filter((field) => analyses[field.id]?.status?.id === "ready").length;
  const analysed = counts.healthy + counts.noCrop + counts.watch + counts.recovery;
  const analysing = analysingIds(farm, analyses, job).size;
  const waiting = counts.total - analysed - analysing;
  const noCrop = [];
  if (counts.harvested) noCrop.push(`${counts.harvested} harvested`);
  if (counts.notSown) noCrop.push(`${counts.notSown} not sown`);

  const parts = [];
  let tone = "green";
  if (!counts.recovery && !counts.watch) {
    if (analysed === 0 && analysing) parts.push(counts.total === 1 ? "Your field is being analysed" : `${counts.total} fields being analysed`);
    else if (analysed === 0) parts.push(counts.total === 1 ? "Your field is waiting for analysis" : `${counts.total} fields waiting for analysis`);
    else if (!counts.noCrop) parts.push(analysed === 1 && counts.total === 1 ? "Your field is healthy" : `All ${plural(analysed, "field", "fields")} healthy`);
    else if (!counts.healthy && noCrop.length === 1) parts.push(analysed === 1 && counts.total === 1 ? `Your field is ${noCrop[0].replace(/^\d+ /, "")}` : `All ${plural(analysed, "field", "fields")} ${noCrop[0].replace(/^\d+ /, "")}`);
    else {
      if (counts.healthy) parts.push(`${counts.healthy} healthy`);
      parts.push(...noCrop);
    }
  } else {
    if (counts.recovery) parts.push(plural(counts.recovery, "field needs recovery", "fields need recovery"));
    if (counts.watch) parts.push(parts.length ? `${counts.watch} to watch` : plural(counts.watch, "field to watch", "fields to watch"));
    parts.push(...noCrop);
    tone = counts.recovery ? "red" : "amber";
  }
  if (ready) parts.push(`${ready} ready to harvest`);
  if (analysing && analysed) parts.push(`${analysing} being analysed`);
  if (waiting > 0 && analysed) parts.push(`${waiting} waiting for analysis`);
  return { text: parts.join(" · "), tone };
}

// The "Needs recovery" tile shows when a field needs recovery or a known
// war covers the farm (conflict: format.js farmConflict). On a peaceful
// farm a "0" there only worries people.
export function showRecoveryTile(counts, conflict) {
  return Boolean(counts?.recovery) || Boolean(conflict);
}

// $1,948 -> "$1.9k", $12,710 -> "$12.7k", $640 -> "$640", $1.2M.
export function shortUsd(amount) {
  if (!Number.isFinite(amount)) return "–";
  if (amount >= 1e6) return `$${Number((amount / 1e6).toFixed(1))}M`;
  if (amount >= 1e3) return `$${Number((amount / 1e3).toFixed(amount >= 1e5 ? 0 : 1))}k`;
  return `$${Math.round(amount)}`;
}

// [1948, 5900] -> "$1.9k–5.9k".
export function usdRange([low, high]) {
  return `${shortUsd(low)}–${shortUsd(high).replace("$", "")}`;
}

// "Field 7", "Fields 6 and 7", "Fields 1, 2 and 5" (or "North and South").
export function fieldNames(list) {
  const names = list.map((field) => field.name);
  if (names.length === 1) return names[0];
  const joined = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return names.every((name) => /^Field \d+$/.test(name)) ? `Fields ${joined.replace(/Field /g, "")}` : joined;
}

// The rain spell, if one is likely: { from, to, mm } or null.
export function likelyRain(weather) {
  return weather?.rain?.likely && weather.rain.from ? weather.rain : null;
}

// The latest clear Sentinel-2 pass over any field ("2026-10-16"), or null.
export function latestPass(farm, analyses = {}) {
  let latest = null;
  for (const field of farm?.fields || []) {
    const date = analyses[field.id]?.latestPass?.date;
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

const mapLink = (field) => `/field/fields?field=${encodeURIComponent(field.id)}`;
const aiLink = (field) => `/field/ai?about=${encodeURIComponent(field.id)}`;

// What needs doing, most urgent first. Each item:
//   { id, tone, icon, fieldId?, title, amount?, costs?, line?, action }
//   tone   "red" | "amber" | "blue" | "ink" | null
//   icon   "shield" | "wheat" | "stress" | "health" | "water" | "cloud" | "alert"
//   costs  [{ id, label, value }] (the recovery item only)
//   action { label, to } (a link) or { label, run: "analyze" } (a button)
// Only things worked out from the analyses: nothing is typed in by hand.
export function needsDoing({ farm, analyses = {}, weather = null, job = null }) {
  const units = farm.units;
  const rain = likelyRain(weather);
  const rainOn = rain ? formatDay(rain.from) : null;
  const items = [];
  const fields = (farm.fields || []).filter((field) => analyses[field.id]);
  const on = (id) => fields.filter((field) => analyses[field.id].status?.id === id);

  if (job?.status === "error") {
    items.push({
      id: "update-failed",
      tone: "red",
      icon: "alert",
      title: "The last update failed",
      line: job.error || null,
      action: { label: "Try again", run: "analyze" },
    });
  }

  // Damage: one item for all damaged fields, with the recovery cost. The
  // advice about explosives is given only where a known war covers the
  // farm (analysis.conflict, src/config/conflicts.js); elsewhere damage is
  // unusual fire or ground disturbance from any cause.
  const damaged = on("recovery");
  if (damaged.length) {
    let damagedHa = 0;
    let known = true;
    for (const field of damaged) {
      const ha = analyses[field.id].damage?.damagedHa;
      if (Number.isFinite(ha)) damagedHa += ha;
      else {
        known = false;
        damagedHa += field.areaHa || 0;
      }
    }
    const cost = recoveryCost(damagedHa);
    items.push({
      id: "recovery",
      tone: "red",
      icon: "shield",
      fieldId: damaged[0].id,
      title: `${fieldNames(damaged)} ${damaged.length === 1 ? "needs" : "need"} recovery`,
      amount: `${formatArea(damagedHa, units)} ${known ? "damaged" : "to check"}`,
      costs: [
        { id: "fast", label: "Quick fix", value: usdRange(cost.fast.total) },
        { id: "full", label: "Full restore", value: usdRange(cost.full.total) },
      ],
      // The per-hectare costs are planning assumptions, not measurements.
      costNote: COST_NOTE,
      line: damaged.some((field) => analyses[field.id]?.conflict) ? "Have it checked for explosives first" : "Check it on the ground first",
      action: { label: "Plan recovery", to: aiLink(damaged[0]) },
    });
  }

  // Ready to harvest: the ones with rain coming first.
  const ready = on("ready").sort((a, b) => Number(Boolean(analyses[b.id].harvest?.rainBefore)) - Number(Boolean(analyses[a.id].harvest?.rainBefore)));
  for (const field of ready) {
    const harvest = analyses[field.id].harvest || {};
    let line = null;
    if (harvest.rainBefore && rainOn) line = `Before the rain on ${rainOn}`;
    else if (harvest.window?.to) line = `Best by ${formatDay(harvest.window.to)}`;
    items.push({ id: `ready-${field.id}`, tone: "ink", icon: "wheat", fieldId: field.id, title: `${field.name} is ready to harvest`, line, action: { label: "View", to: mapLink(field) } });
  }

  for (const field of on("harvestSoon")) {
    const harvest = analyses[field.id].harvest || {};
    const days = harvest.daysToReady;
    const when = Number.isFinite(days) ? `in ${days} ${days === 1 ? "day" : "days"}` : "soon";
    let line = harvest.window?.from ? `About ${formatDayRange(harvest.window.from, harvest.window.to)}` : null;
    if (harvest.rainBefore && rainOn) line = `Harvest before the rain on ${rainOn}`;
    items.push({ id: `soon-${field.id}`, tone: "blue", icon: "wheat", fieldId: field.id, title: `${field.name} ready to harvest ${when}`, line, action: { label: "View", to: mapLink(field) } });
  }

  // Stress (any field not already listed for recovery), then the other
  // reasons a field is on watch.
  const listed = new Set(items.map((item) => item.fieldId).filter(Boolean));
  for (const field of fields) {
    if (damaged.includes(field)) continue;
    const a = analyses[field.id];
    if (a.stress?.level !== "medium" && a.stress?.level !== "high") continue;
    items.push({
      id: `stress-${field.id}`,
      tone: a.stress.level === "high" ? "red" : "amber",
      icon: "stress",
      fieldId: field.id,
      title: Number.isFinite(a.stress.stressedHa) && a.stress.stressedHa > 0 ? `Stress on ${formatArea(a.stress.stressedHa, units)} in ${field.name}` : `Stress in ${field.name}`,
      line: causeText(a.stress.cause),
      action: { label: "View", to: mapLink(field) },
    });
    listed.add(field.id);
  }
  // Pest and disease risk from the weather (high only: a forecast for the
  // whole farm, one item naming the fields with a crop growing).
  const atRisk = fields.filter((field) => riskNote(analyses[field.id].pestRisk)?.tone === "red");
  if (atRisk.length) {
    items.push({
      id: "pest-risk",
      tone: "amber",
      icon: "stress",
      fieldId: atRisk.length === 1 ? atRisk[0].id : undefined,
      title: riskNote(analyses[atRisk[0].id].pestRisk).text,
      line: `${fieldNames(atRisk)} · from the weather, check on the ground`,
      action: { label: "View", to: mapLink(atRisk[0]) },
    });
  }
  for (const field of on("watch").concat(on("unknown"))) {
    if (listed.has(field.id)) continue;
    const a = analyses[field.id];
    let title;
    let icon = "health";
    if (a.status?.id === "unknown") {
      title = `No clear image of ${field.name} yet`;
      icon = "cloud";
    } else if (a.plantHealth?.versus === "below") title = `Plant health below normal in ${field.name}`;
    else if (a.water?.versus === "below") {
      title = `${field.name} is drier than normal`;
      icon = "water";
    } else title = `${field.name} is in ${a.condition?.class === "poor" ? "poor" : "fair"} condition`;
    items.push({ id: `watch-${field.id}`, tone: a.status?.id === "unknown" ? null : "amber", icon, fieldId: field.id, title, action: { label: "View", to: mapLink(field) } });
  }
  return items;
}
