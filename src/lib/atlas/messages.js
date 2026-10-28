// WHAT THIS FILE DOES
// Small helpers for the "Messages from the website" card on Atlas
// Settings (src/pages/atlas/SettingsPage.jsx): when a message arrived, in
// words, and how many there are. Pure functions, so they are easy to test.
//
// WHO EDITS IT
// Whoever changes that card.

// "2026-10-27T09:05:00.000Z" -> "27 Oct 2026, 09:05", in the reader's own
// time zone (timeZone names another one, as the tests do). Text that is
// not a moment is given back as it is, so a broken file still shows.
export function formatReceived(iso, { timeZone } = {}) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return String(iso || "");
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
}

// 0 -> "No messages yet.", 1 -> "1 message", 3 -> "3 messages".
export function messageCountText(count) {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (n === 0) return "No messages yet.";
  return n === 1 ? "1 message" : `${n.toLocaleString("en-US")} messages`;
}
