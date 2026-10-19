// WHAT THIS FILE DOES
// Checks that places are matched to the right country and war.
//
// WHO EDITS IT
// Whoever changes server/conflicts.js or src/config/conflicts.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictAt, conflictForArea, countryAt } from "./conflicts.js";
import { damageWindow } from "../src/config/conflicts.js";

test("countries are found from a point", () => {
  assert.equal(countryAt(49.73, 37.54)?.name, "Ukraine"); // Kupiansk
  assert.equal(countryAt(42.0, -93.5)?.name, "United States of America"); // Iowa
  assert.equal(countryAt(-13.0, -55.9)?.name, "Brazil"); // Mato Grosso
  assert.equal(countryAt(45.75, 126.6)?.name, "China"); // Harbin
  assert.equal(countryAt(47.0, 28.85)?.name, "Moldova"); // Chișinău, inside Ukraine's box but not Ukraine
  assert.equal(countryAt(0, -30), null); // the Atlantic
});

test("only places in a listed war get a war start date", () => {
  assert.equal(conflictAt(49.73, 37.54)?.id, "ukraine-2022");
  assert.equal(conflictAt(47.0, 28.85), null);
  assert.equal(conflictAt(42.0, -93.5), null);
  assert.equal(conflictForArea({ countryId: "804" })?.since, "2022-02-24");
  assert.equal(conflictForArea({ bbox: [-94, 41, -93, 43] }), null);
});

test("custom areas: the war covering any of its land, not just its middle", () => {
  // The Gaza Strip: the box's middle misses the coarse outline.
  assert.equal(conflictForArea({ bbox: [34.2, 31.2, 34.6, 31.6] })?.id, "gaza-2023");
  // The Odesa coast, a box whose middle is at sea.
  assert.equal(conflictForArea({ bbox: [30.4, 45.6, 31.6, 46.6] })?.id, "ukraine-2022");
  // Kharkiv / Belgorod: the middle is in Russia, half the box in Ukraine.
  assert.equal(conflictForArea({ bbox: [35.6, 49.9, 37.4, 51.1] })?.id, "ukraine-2022");
  // The grid cells decide when they are given.
  const cells = [{ lat: 50.6, lon: 36.6 }, { lat: 50.6, lon: 36.4 }, { lat: 50.0, lon: 36.3 }];
  assert.equal(conflictForArea({ bbox: [36, 49.9, 37, 50.7], cells })?.id, "ukraine-2022");
  assert.equal(conflictForArea({ bbox: [36, 49.9, 37, 50.7], cells: cells.slice(0, 2) }), null);
  // Peaceful places stay at peace; Moldova by its country is not Ukraine.
  assert.equal(conflictForArea({ bbox: [-94, 41, -93, 43] }), null);
  assert.equal(conflictForArea({ countryId: "498", bbox: [26.6, 45.4, 30.2, 48.5] }), null);
  assert.equal(conflictForArea({ bbox: [0, -31, 1, -30] }), null); // open sea
});

test("damage window: from the war start, else the last two years", () => {
  assert.deepEqual(damageWindow({ since: "2022-02-24" }, "2026-10-18"), { start: "2022-02-24", end: "2026-10-19", conflict: { since: "2022-02-24" } });
  assert.deepEqual(damageWindow(null, "2026-10-18"), { start: "2024-10-18", end: "2026-10-19", conflict: null });
  // A leap day: two years back has no 29 February.
  assert.deepEqual(damageWindow(null, "2028-02-29"), { start: "2026-03-01", end: "2028-03-01", conflict: null });
});
