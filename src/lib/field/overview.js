// WHAT THIS FILE DOES
// The words of the Field overview page (/field), worked out from the farm,
// its analyses, the weather and the latest update job. No React here, so
// it is tested in overview.test.js:
//
//   statusSentence(farm, analyses, job)  -> { text: "1 field needs recovery · 1 to watch · 2 harvested", tone: "red" }
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
import { SPREAD_LABEL, analysingIds, causeText, formatArea, formatDay, formatDayRange, riskNote, spreadOut, statusCounts, statusOf } from "./format.js";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The overview groups in words, in the order of the stat tiles:
// "1 field needs recovery · 1 to watch · 2 ready to harvest · 1 harvest
// soon · 1 growing well · 2 harvested", "All 7 fields growing well" or
// "All 7 fields harvested". The "In crop" tile counts ready, harvest soon
// and growing well together; here each is named, so "growing well" is
// only said of a field whose status is "Growing well". A field with no
// crop (harvested, not sown, fallow or grass, dried down) is never
// "growing well". tone: "green" | "amber" | "red".
// With the running update (job), new fields read "1 being analysed".
const NO_CROP_WORDS = [
  ["harvested", "harvested"],
  ["notSown", "not sown"],
  ["fallow", "fallow or grass"],
  ["driedDown", "dried down"],
];

export function statusSentence(farm, analyses = {}, job = null) {
  const counts = statusCounts(farm, analyses);
  const analysed = counts.growing + counts.noCrop + counts.watch + counts.recovery;
  const analysing = analysingIds(farm, analyses, job).size;
  const waiting = counts.total - analysed - analysing;
  const soon = counts.harvestSoon || 0;
  const growingWell = counts.growing - counts.ready - soon;
  const noCrop = NO_CROP_WORDS.filter(([id]) => counts[id]).map(([id, word]) => ({ n: counts[id], word }));
  // Older analyses may count a no-crop field under a status this list
  // does not know: they still show up, as "no crop".
  const named = noCrop.reduce((sum, item) => sum + item.n, 0);
  if (counts.noCrop > named) noCrop.push({ n: counts.noCrop - named, word: "no crop" });

  // Every analysed field in one group, one kind: "All 7 fields harvested".
  const one = (word) => (analysed === 1 && counts.total === 1 ? `Your field is ${word}` : `All ${plural(analysed, "field", "fields")} ${word}`);
  const parts = [];
  if (analysed === 0) {
    if (analysing) parts.push(counts.total === 1 ? "Your field is being analysed" : `${counts.total} fields being analysed`);
    else parts.push(counts.total === 1 ? "Your field is waiting for analysis" : `${counts.total} fields waiting for analysis`);
  } else if (growingWell === analysed) parts.push(one("growing well"));
  else if (noCrop.length === 1 && noCrop[0].n === analysed) parts.push(one(noCrop[0].word));
  else {
    if (counts.recovery) parts.push(plural(counts.recovery, "field needs recovery", "fields need recovery"));
    if (counts.watch) parts.push(parts.length ? `${counts.watch} to watch` : plural(counts.watch, "field to watch", "fields to watch"));
    if (counts.ready) parts.push(`${counts.ready} ready to harvest`);
    if (soon) parts.push(`${soon} harvest soon`);
    if (growingWell) parts.push(`${growingWell} growing well`);
    parts.push(...noCrop.map((item) => `${item.n} ${item.word}`));
  }
  if (analysing && analysed) parts.push(`${analysing} being analysed`);
  if (waiting > 0 && analysed) parts.push(`${waiting} waiting for analysis`);
  const tone = counts.recovery ? "red" : counts.watch ? "amber" : "green";
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

// Same unit as the Stress tile (format.js): hectares only when a patch is
// mapped, else the share of the field.
function stressTitle(stress, name, unitsIn) {
  const mapped = Array.isArray(stress.patches) && stress.patches.length > 0;
  if (mapped && Number.isFinite(stress.stressedHa) && stress.stressedHa > 0) return `Stress on ${formatArea(stress.stressedHa, unitsIn)} in ${name}`;
  if (Number.isFinite(stress.share) && stress.share > 0) return `Stress on ${stress.share * 100 < 1 ? "under 1%" : `${Math.round(stress.share * 100)}%`} of ${name}`;
  return `Stress in ${name}`;
}

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
  const on = (id) => fields.filter((field) => statusOf(analyses[field.id])?.id === id);

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
      title: stressTitle(a.stress, field.name, units),
      line: spreadOut(a.stress) ? SPREAD_LABEL : causeText(a.stress.cause),
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
  for (const field of on("watch").concat(on("unknown"), on("unclear"))) {
    if (listed.has(field.id)) continue;
    const a = analyses[field.id];
    let title;
    let icon = "health";
    let line;
    let action = { label: "View", to: mapLink(field) };
    if (statusOf(a)?.id === "unknown") {
      title = `No clear image of ${field.name} yet`;
      icon = "cloud";
    } else if (statusOf(a)?.id === "unclear") {
      title = `${field.name}: crop unclear`;
      line = "Possibly grass · set the crop for a harvest estimate";
      icon = "wheat";
      action = { label: "Set crop", to: "/field/settings" };
    } else if (a.plantHealth?.versus === "below") title = `Plant health below normal in ${field.name}`;
    else if (a.water?.versus === "below") {
      title = `${field.name} is drier than normal`;
      icon = "water";
    } else title = `${field.name} is in ${a.condition?.class === "poor" ? "poor" : "fair"} condition`;
    const quiet = statusOf(a)?.id === "unknown" || statusOf(a)?.id === "unclear";
    items.push({ id: `watch-${field.id}`, tone: quiet ? null : "amber", icon, fieldId: field.id, title, ...(line ? { line } : {}), action });
  }
  return items;
}
