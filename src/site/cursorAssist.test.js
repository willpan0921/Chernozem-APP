// WHAT THIS FILE DOES
// Checks the pin cursor's click assist (cursorAssist.js) with pretend
// rectangles instead of a browser: which points the pin covers around its
// click point, and which link or button it picks when a click lands on
// nothing clickable (the one under the most points; on a tie, the
// nearest). Also checks that the stylesheet's hotspot matches the pin's.
//
// WHO EDITS IT
// Whoever changes the cursor.
// Run: node --test src/site/cursorAssist.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLICKABLE, PIN, pickTarget, pinPoints } from "./cursorAssist.js";

const here = dirname(fileURLToPath(import.meta.url));

// Pretend page: rectangles in screen pixels; the first one found under a
// point is what the point hits.
const rect = (id, left, top, width, height) => ({ id, left, top, right: left + width, bottom: top + height });
const under = (rects) => (p) => rects.find((r) => p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom)?.id || null;

test("the pin covers its own shape around the click point", () => {
  const points = pinPoints(100, 200);
  assert.ok(points.length >= 30, "enough points to cover the pin");
  for (const p of points) {
    assert.ok(p.x >= 100 - PIN.hotspot.x - 1 && p.x <= 100 - PIN.hotspot.x + PIN.width, "inside the pin's width");
    assert.ok(p.y >= 200 - PIN.hotspot.y && p.y < 200 - PIN.hotspot.y + PIN.height, "inside the pin's height");
  }
  // The click point itself, the round head on both sides, and the tip.
  assert.ok(points.some((p) => p.x === 100 && p.y === 200 && p.d === 0));
  assert.ok(points.some((p) => p.x <= 100 - 11));
  assert.ok(points.some((p) => p.x >= 100 + 11));
  assert.ok(points.some((p) => p.y >= 200 + 20));
});

test("a button under part of the pin is picked", () => {
  const button = rect("register", 108, 190, 80, 30); // starts 8 px right of the click point
  assert.equal(pickTarget(pinPoints(100, 200), under([button])), "register");
});

test("a link under the pin's tip is picked", () => {
  const link = rect("story", 90, 215, 60, 20); // starts 15 px below the click point
  assert.equal(pickTarget(pinPoints(100, 200), under([link])), "story");
});

test("nothing is picked on empty ground or beyond the pin's reach", () => {
  assert.equal(pickTarget(pinPoints(100, 200), under([])), null);
  const far = rect("far", 140, 150, 80, 40); // 40 px to the right
  assert.equal(pickTarget(pinPoints(100, 200), under([far])), null);
  const justOut = rect("out", 100 + PIN.width - PIN.hotspot.x + 1, 190, 50, 20);
  assert.equal(pickTarget(pinPoints(100, 200), under([justOut])), null);
});

test("the target under the most points wins", () => {
  const small = rect("about", 85, 196, 6, 8); // a sliver to the left
  const big = rect("story", 104, 186, 60, 40); // most of the right half
  assert.equal(pickTarget(pinPoints(100, 200), under([small, big])), "story");
});

test("on a tie the target nearest the click point wins", () => {
  // Two equal targets, one hugging the head's centre, one at the far edge.
  const points = [
    { x: 0, y: 0, d: 1 },
    { x: 1, y: 0, d: 2 },
    { x: 10, y: 0, d: 9 },
    { x: 11, y: 0, d: 10 },
  ];
  const targetAt = (p) => (p.x < 5 ? "near" : "far");
  assert.equal(pickTarget(points, targetAt), "near");
  assert.equal(pickTarget([...points].reverse(), targetAt), "near");
});

test("what counts as clickable includes the globe's markers and leaves fields out", () => {
  for (const selector of ["a[href]", "button", '[role="button"]', "label", "summary", 'input[type="checkbox"]', 'input[type="radio"]', ".globe-marker"]) {
    assert.ok(CLICKABLE.includes(selector), `${selector} is clickable`);
  }
  assert.ok(!/textarea|select|input\[type="text"\]/.test(CLICKABLE));
});

test("the stylesheet clicks at the pin's head, where the assist measures from", () => {
  const css = readFileSync(join(here, "site.css"), "utf8");
  const spots = [...css.matchAll(/cursor-pin(?:@2x)?\.png\)[^;]*?(\d+) (\d+), (?:auto|pointer)/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.ok(spots.length >= 4);
  for (const spot of spots) assert.equal(spot, `${PIN.hotspot.x} ${PIN.hotspot.y}`);
  // The head's centre: the widest rows of the pin are around row 10.
  const widest = Math.max(...PIN.rows.map(([a, b]) => b - a));
  const rows = PIN.rows.map(([a, b], i) => (b - a === widest ? i : null)).filter((i) => i !== null);
  assert.ok(Math.abs((rows[0] + rows[rows.length - 1]) / 2 - PIN.hotspot.y) <= 1);
});
