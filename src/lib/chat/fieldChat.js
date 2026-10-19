// WHAT THIS FILE DOES
// The small pieces of wording the Field AI page (/field/ai) makes from the
// real farm, so the page itself stays short:
//
//   starterFields(farm, analyses)  -> { urgent, harvest }  field names for the "Try asking" questions
//   latestPass(analyses)           -> "2026-10-16" (the newest clear Sentinel-2 pass of any field) or null
//   sourceRow(provider, analyses)  -> { label: "Sentinel-2" | "Sample data", value: "Oct 16" }
//   weatherLine(weather)           -> "13° · Cloudy"
//   reportRow(report, farm)        -> { label: "Shelling", value: "Field 7 · 2 photos" }
//   reportFirstQuestion(report, farm) -> "I reported shelling on Field 7. What should I do now?"
//   reportLine(report, farm)       -> "Shelling · Field 7 · 2 photos" (one line, for narrow screens)
//
// The rules for what counts as urgent come from the field status
// (src/lib/field/method.js), not from here. The kinds of report come from
// REPORT_KINDS in src/data/chats.js. Tested in fieldChat.test.js.
//
// WHO EDITS IT
// Whoever changes what the Field AI page says.

import { formatDay } from "../field/format.js";
import { reportKind, reportQuestion } from "../../data/chats.js";

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

// The field that most needs work (needs recovery, else to watch) and the
// one closest to harvest (ready, else harvest soon, fewest days first).
export function starterFields(farm, analyses = {}) {
  const fields = farm?.fields || [];
  const withStatus = (ids) => fields.filter((field) => ids.includes(analyses[field.id]?.status?.id));
  const urgent = withStatus(["recovery"])[0] || withStatus(["watch"])[0] || null;
  const soon = withStatus(["harvestSoon"]).sort(
    (a, b) => (analyses[a.id]?.harvest?.daysToReady ?? Infinity) - (analyses[b.id]?.harvest?.daysToReady ?? Infinity)
  );
  const harvest = withStatus(["ready"])[0] || soon[0] || null;
  return { urgent: urgent?.name || null, harvest: harvest?.name || null };
}

export function latestPass(analyses = {}) {
  let newest = null;
  for (const analysis of Object.values(analyses)) {
    const date = analysis?.latestPass?.date;
    if (typeof date === "string" && (!newest || date > newest)) newest = date;
  }
  return newest;
}

export function sourceRow(provider, analyses = {}) {
  const date = latestPass(analyses);
  return { label: provider?.id === "gee" ? "Sentinel-2" : "Sample data", value: date ? formatDay(date) : "–" };
}

export function weatherLine(weather) {
  const now = weather?.current;
  if (!now || !Number.isFinite(now.tempC)) return null;
  return now.label ? `${Math.round(now.tempC)}° · ${now.label}` : `${Math.round(now.tempC)}°`;
}

function fieldName(report, farm) {
  if (!report?.fieldId) return null;
  return farm?.fields?.find((field) => field.id === report.fieldId)?.name || report.removedFieldName || null;
}

export function reportRow(report, farm) {
  if (!report) return null;
  const photos = report.photos?.length || 0;
  const value = [fieldName(report, farm) || "Whole farm", photos ? `${photos} ${photos === 1 ? "photo" : "photos"}` : null]
    .filter(Boolean)
    .join(" · ");
  return { label: reportKind(report.kind).label, value };
}

export function reportLine(report, farm) {
  const row = reportRow(report, farm);
  return row ? `${row.label} · ${row.value}` : null;
}

export function reportFirstQuestion(report, farm) {
  return fill(reportQuestion, {
    what: reportKind(report?.kind).phrase,
    where: fieldName(report, farm) || "my farm",
  });
}
