// WHAT THIS FILE DOES
// Checks the helpers of the "Messages from the website" card on Atlas
// Settings (messages.js): when a message arrived, in words, and the count.
// Run with:
//   node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes messages.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReceived, messageCountText } from "./messages.js";

test("when a message arrived: day, month, year and the time, in the time zone asked", () => {
  assert.equal(formatReceived("2026-10-27T09:05:00.000Z", { timeZone: "UTC" }), "27 Oct 2026, 09:05");
  assert.equal(formatReceived("2026-10-27T09:05:00.000Z", { timeZone: "Europe/Kyiv" }), "27 Oct 2026, 11:05");
  assert.equal(formatReceived("2026-01-03T23:59:00Z", { timeZone: "UTC" }), "3 Jan 2026, 23:59");
  // The reader's own time zone when none is asked: the same day and
  // month come out, whatever the computer's clock is set to.
  assert.match(formatReceived("2026-06-15T12:00:00Z"), /^1[456] Jun 2026, \d{2}:\d{2}$/);
});

test("text that is not a moment is shown as it is", () => {
  assert.equal(formatReceived("yesterday"), "yesterday");
  assert.equal(formatReceived(""), "");
  assert.equal(formatReceived(undefined), "");
  assert.equal(formatReceived(null), "");
});

test("the count, in words", () => {
  assert.equal(messageCountText(0), "No messages yet.");
  assert.equal(messageCountText(1), "1 message");
  assert.equal(messageCountText(3), "3 messages");
  assert.equal(messageCountText(1234), "1,234 messages");
  assert.equal(messageCountText(undefined), "No messages yet.");
  assert.equal(messageCountText(-2), "No messages yet.");
});
