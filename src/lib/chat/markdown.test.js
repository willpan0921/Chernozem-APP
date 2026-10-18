// Tests for markdown.js and threads.js (the chat helpers).
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown, plainText } from "./markdown.js";
import { threadDate, toolLabel, upsertThread, titleFrom } from "./threads.js";

test("bold, italic and code inside a line", () => {
  assert.deepEqual(parseInline("Top: **47.98° N** and *fast* `get_ranking`"), [
    { type: "text", text: "Top: " },
    { type: "strong", text: "47.98° N" },
    { type: "text", text: " and " },
    { type: "em", text: "fast" },
    { type: "text", text: " " },
    { type: "code", text: "get_ranking" },
  ]);
});

test("an unclosed ** while streaming stays plain text", () => {
  assert.deepEqual(parseInline("centred at **47.98° N, 34"), [{ type: "text", text: "centred at **47.98° N, 34" }]);
});

test("snake_case words are not italic", () => {
  assert.deepEqual(parseInline("the get_ranking_tool name"), [{ type: "text", text: "the get_ranking_tool name" }]);
});

test("paragraphs, headings and lists", () => {
  const blocks = parseMarkdown("## Answer\nFirst line\nsecond line\n\n- one\n- **two**\n\n1. a\n2. b");
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].type, "h");
  assert.equal(blocks[0].level, 2);
  assert.deepEqual(blocks[1], { type: "p", inline: [{ type: "text", text: "First line\nsecond line" }] });
  assert.equal(blocks[2].type, "ul");
  assert.equal(blocks[2].items.length, 2);
  assert.deepEqual(blocks[2].items[1], [{ type: "strong", text: "two" }]);
  assert.equal(blocks[3].type, "ol");
  assert.equal(blocks[3].start, 1);
});

test("a blank line between bullets keeps one list", () => {
  const blocks = parseMarkdown("- one\n\n- two");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].items.length, 2);
});

test("indented bullets are sub-points of the list", () => {
  const [list] = parseMarkdown("- **Top picks:**\n  - Place 1\n  - Place 2\n- Next");
  assert.equal(list.type, "ul");
  assert.equal(list.items.length, 4);
  assert.deepEqual(list.depths, [0, 1, 1, 0]);
  assert.equal(plainText("- a\n  - b"), "• a\n    – b");
});

test("a table", () => {
  const blocks = parseMarkdown("| Area | Ha |\n|---|---:|\n| A | 10 |\n| B | 20 |\nAfter");
  assert.equal(blocks[0].type, "table");
  assert.deepEqual(blocks[0].header.map((cell) => cell[0].text), ["Area", "Ha"]);
  assert.equal(blocks[0].rows.length, 2);
  assert.equal(blocks[1].type, "p");
});

test("plain text for copying drops the marks", () => {
  assert.equal(plainText("**Hi** there\n\n- a\n- b"), "Hi there\n\n• a\n• b");
});

test("chat list dates", () => {
  const now = new Date(2026, 9, 18, 12, 0);
  assert.equal(threadDate(new Date(2026, 9, 18, 8, 0).toISOString(), now), "Today");
  assert.equal(threadDate(new Date(2026, 9, 17, 23, 0).toISOString(), now), "Yesterday");
  assert.equal(threadDate(new Date(2026, 9, 2).toISOString(), now), "Oct 2");
  assert.equal(threadDate(new Date(2025, 0, 5).toISOString(), now), "Jan 5, 2025");
  assert.equal(threadDate("nonsense", now), "");
});

test("tool labels", () => {
  assert.equal(toolLabel("get_ranking"), "Looking up the ranking…");
  assert.equal(toolLabel("something_new"), "Checking the data…");
});

test("upsertThread moves a chat to the top and keeps its preview", () => {
  const list = [
    { id: "a", title: "A", preview: "x" },
    { id: "b", title: "B", preview: "y" },
  ];
  assert.deepEqual(upsertThread(list, { id: "b", title: "B2" }), [
    { id: "b", title: "B2", preview: "y" },
    { id: "a", title: "A", preview: "x" },
  ]);
  assert.equal(upsertThread(list, { id: "c", title: "C" })[0].id, "c");
});

test("titles match the server", () => {
  assert.equal(titleFrom("  Where   first? "), "Where first?");
  assert.equal(titleFrom("x".repeat(80)).length, 60);
});
