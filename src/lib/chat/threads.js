// WHAT THIS FILE DOES
// Small helpers for the chat screens (Field AI and Atlas AI):
//   threadDate(iso, now)        "Today", "Yesterday", "Oct 11" or "Oct 11, 2025" for the chat list
//   toolLabel(name)             "Looking up the ranking…" while the AI checks the data
//   upsertThread(list, thread)  puts a chat at the top of the list (new or updated)
//   titleFrom(text)             the first question, shortened, as a chat title
//
// WHO EDITS IT
// Danny (with the chat components in src/components/chat). Tests are in
// threads.test.js next to this file.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// The date under a chat in the list, in the person's own time zone.
export function threadDate(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (dayKey(date) === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  const short = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? short : `${short}, ${date.getFullYear()}`;
}

// What the chat says while the AI uses one of its look-ups (server/ai/context.js).
const TOOL_LABELS = {
  get_ranking: "Looking up the ranking…",
  get_place: "Looking up the place…",
  compare_months: "Comparing months…",
  budget_coverage: "Working out the budget…",
  get_history: "Reading the monthly history…",
};

export function toolLabel(name) {
  return TOOL_LABELS[name] || "Checking the data…";
}

// Puts a thread at the top of the list, replacing an older copy with the
// same id. Keeps the fields the list already had (preview...).
export function upsertThread(list, thread) {
  const old = list.find((item) => item.id === thread.id);
  return [{ ...old, ...thread }, ...list.filter((item) => item.id !== thread.id)];
}

// Same rule as the server (server/ai/chat.js): the first question, trimmed.
export function titleFrom(text) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length <= 60 ? flat : `${flat.slice(0, 59).trimEnd()}…`;
}
