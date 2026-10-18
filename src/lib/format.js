// WHAT THIS FILE DOES
// Turns raw numbers and dates into the short text the pages show:
// 15070000 -> "15.07M ha", 84000 -> "≈84,000", "2026-09-24" -> "Sep 24".
// Every page uses these, so numbers look the same everywhere.
//
// WHO EDITS IT
// Whoever changes how numbers or dates are written across the app.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// 15070000 -> "15.07M ha", 702000 -> "702,000 ha", 4800 -> "4,800 ha".
export function formatHa(hectares, { short = true } = {}) {
  if (!Number.isFinite(hectares)) return "–";
  if (short && hectares >= 1e6) return `${(hectares / 1e6).toFixed(2)}M ha`;
  return `${Math.round(hectares).toLocaleString("en-US")} ha`;
}

// 35010000 -> "35.01M ha" (always the millions form, for footnotes).
export function formatMillionHa(hectares) {
  return `${(hectares / 1e6).toFixed(2)}M ha`;
}

// 0.837 -> "83.7%".
export function formatPercent(share, digits = 1) {
  if (!Number.isFinite(share)) return "–";
  return `${(share * 100).toFixed(digits)}%`;
}

// A count of people, rounded to the nearest thousand with "≈" in front,
// because the population layer is an estimate: 83950 -> "≈84,000".
export function formatPeople(count) {
  if (!Number.isFinite(count)) return "–";
  if (count < 1000) return `≈${Math.round(count).toLocaleString("en-US")}`;
  return `≈${(Math.round(count / 1000) * 1000).toLocaleString("en-US")}`;
}

// Dollars: 10000000 -> "$10,000,000".
export function formatUsd(amount) {
  if (!Number.isFinite(amount)) return "–";
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

// A number rounded to the nearest thousand: 34483 -> "34,000".
export function roundThousands(value) {
  return (Math.round(value / 1000) * 1000).toLocaleString("en-US");
}

// 30 -> "30th", 21 -> "21st", 2 -> "2nd".
export function ordinal(number) {
  const teen = number % 100 >= 11 && number % 100 <= 13;
  const suffix = teen ? "th" : { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
  return `${number}${suffix}`;
}

// "Odesa", "Odesa and Poltava", "Odesa, Poltava, and Cherkasy".
export function listNames(names) {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

// ---------- Dates ----------
// Dates travel through the app as "YYYY-MM-DD" text. These helpers read
// them without time zones getting in the way (a date is a day, not a moment).

export function parseDay(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day || 1));
}

export function toDay(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const date = parseDay(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}

export function addMonths(iso, months) {
  const date = parseDay(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toDay(date);
}

// Whole days from "from" to "to" (negative if "to" is earlier).
export function daysBetween(from, to) {
  return Math.round((parseDay(to) - parseDay(from)) / 86400000);
}

// "2026-09-24" -> "Sep 24".
export function formatShortDate(iso) {
  const date = parseDay(iso);
  return `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}`;
}

// "2026-10-01" -> "October".
export function monthName(iso) {
  return MONTHS[parseDay(iso).getUTCMonth()];
}

// "2026-04" -> "April 2026" (also accepts a full date).
export function formatMonthYear(iso) {
  const date = parseDay(iso.length === 7 ? `${iso}-01` : iso);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// When a task is due, in the words the office uses: "Today", "This week",
// "Overdue", or the month name ("October") for anything further away.
export function dueLabel(dueIso, todayIso) {
  const days = daysBetween(todayIso, dueIso);
  if (days < 0) return { text: "Overdue", urgent: true };
  if (days === 0) return { text: "Today", urgent: false };
  if (days <= 7) return { text: "This week", urgent: true };
  return { text: monthName(dueIso), urgent: false };
}

// ---------- Added for the Atlas v2 (any area, any size) ----------

// A plain whole number with commas: 52865 -> "52,865".
export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "–";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Hectares in the shortest clear form, for big numbers on a tile:
// 31200000 -> "31.2M ha", 51597 -> "51.6k ha", 8.4 -> "8.4 ha", 0 -> "0 ha".
export function formatHaShort(hectares) {
  if (!Number.isFinite(hectares)) return "–";
  const abs = Math.abs(hectares);
  if (abs >= 1e6) return `${trim(hectares / 1e6)}M ha`;
  if (abs >= 1e4) return `${trim(hectares / 1e3)}k ha`;
  if (abs >= 100) return `${formatNumber(Math.round(hectares))} ha`;
  if (abs >= 10) return `${Math.round(hectares)} ha`;
  return `${trim(hectares)} ha`;
}

// People in the shortest clear form: 3560000 -> "3.56M", 52865 -> "52.9k",
// 812 -> "812".
export function formatCount(count) {
  if (!Number.isFinite(count)) return "–";
  const abs = Math.abs(count);
  if (abs >= 1e6) return `${trim(count / 1e6, 2)}M`;
  if (abs >= 1e4) return `${trim(count / 1e3)}k`;
  return formatNumber(Math.round(count));
}

// 1.86 -> "1.9" and 31.0 -> "31": one decimal (or "digits"), no trailing zero.
function trim(value, digits = 1) {
  const fixed = value.toFixed(value >= 100 || value <= -100 ? 0 : digits);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

// A change with its sign: 49887 -> "+49,887", -12 -> "−12". "unit" is added
// after the number when given: formatSigned(49887, " ha") -> "+49,887 ha".
export function formatSigned(value, unit = "") {
  if (!Number.isFinite(value)) return "–";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(rounded))}${unit}`;
}

// Square kilometres: 598457.3 -> "598,457 km²", 0.42 -> "0.42 km²".
export function formatKm2(km2) {
  if (!Number.isFinite(km2)) return "–";
  if (km2 < 10) return `${trim(km2, 2)} km²`;
  return `${formatNumber(Math.round(km2))} km²`;
}

// The size of an area in the unit that reads best: hectares for farms and
// districts, km² for anything over 100,000 ha (1,000 km²).
export function formatAreaSize(hectares) {
  if (!Number.isFinite(hectares)) return "–";
  if (hectares >= 100000) return formatKm2(hectares / 100);
  return hectares >= 100 ? `${formatNumber(Math.round(hectares))} ha` : `${trim(hectares)} ha`;
}

// 49.62, 37.74 -> "49.62° N, 37.74° E" (the same wording the server uses).
export function formatCoord(lat, lon, digits = 2) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "–";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}
