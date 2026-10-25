// Tests for the display names of states and regions (placeNames.js).
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DISPLAY_NAMES, displayPlaceName, nameKey, placeNames } from "./placeNames.js";
import { placeLabel } from "./hotspots.js";

// The 25 level-1 names FAO GAUL 2015 has for Ukraine (read from Earth
// Engine, 2026-10-25).
const UKRAINE_GAUL_2015 = [
  "Cherkas'ka", "Chernihivs'ka", "Chernivets'ka", "Dnipropetrovs'ka", "Donets'ka", "Ivano-frankivs'ka", "Kharkivs'ka", "Khersons'ka",
  "Khmel'nyts'ka", "Kirovohrads'ka", "Krym", "Kyyivs'ka", "L'vivs'ka", "Luhans'ka", "Mykolayivs'ka", "Odes'ka", "Poltavs'ka", "Rivnens'ka",
  "Sums'ka", "Ternopil's'ka", "Vinnyts'ka", "Volyns'ka", "Zakarpats'ka", "Zaporiz'ka", "Zhytomyrs'ka",
];

test("Ukraine's oblasts get their English names, each one different", () => {
  assert.equal(displayPlaceName("Kharkivs'ka"), "Kharkiv");
  assert.equal(displayPlaceName("Kyyivs'ka"), "Kyiv");
  assert.equal(displayPlaceName("Kyivs'ka"), "Kyiv");
  assert.equal(displayPlaceName("Krym"), "Crimea");
  assert.equal(displayPlaceName("Avtonomna Respublika Krym"), "Crimea");
  assert.equal(displayPlaceName("Ivano-frankivs'ka"), "Ivano-Frankivsk");
  assert.equal(displayPlaceName("Zaporiz'ka"), "Zaporizhzhia");
  const shown = UKRAINE_GAUL_2015.map(displayPlaceName);
  assert.ok(shown.every((name) => name && !name.includes("'")), shown.join(", "));
  assert.equal(new Set(shown).size, UKRAINE_GAUL_2015.length, "no two oblasts share a name");
});

test("names not in the list are shown as GAUL writes them, only the spacing tidied; no name is made up", () => {
  assert.equal(displayPlaceName("Polk"), "Polk");
  assert.equal(displayPlaceName("Rift Valley"), "Rift Valley");
  assert.equal(displayPlaceName("Chuhuivs'kyi"), "Chuhuivs'kyi");
  assert.equal(displayPlaceName("Division No.  9"), "Division No. 9");
  assert.equal(displayPlaceName("  San  Fernando "), "San Fernando");
  assert.equal(displayPlaceName("Heilongjiang Sheng"), "Heilongjiang");
  for (const missing of [null, undefined, "", "  ", "Administrative unit not available", "null"]) {
    assert.equal(displayPlaceName(missing), null, String(missing));
  }
  // Every display name is a real English name, never empty.
  for (const [gaul, shown] of Object.entries(DISPLAY_NAMES)) assert.ok(shown && shown !== gaul, gaul);
});

test("a square's names read smallest first, with the display names", () => {
  assert.deepEqual(placeNames({ admin1: "Kharkivs'ka", admin2: "Chuhuivs'kyi" }), ["Chuhuivs'kyi", "Kharkiv"]);
  assert.deepEqual(placeNames({ admin1: "Iowa", admin2: "Polk" }), ["Polk", "Iowa"]);
  assert.deepEqual(placeNames({ admin1: "Kharkivs'ka", admin2: "Administrative unit not available" }), ["Kharkiv"]);
  assert.deepEqual(placeNames({}), []);
  assert.deepEqual(placeNames(null), []);
  // The pages' square names use the same helper.
  assert.equal(placeLabel({ lat: 49.5, lon: 36.2, admin1: "Kharkivs'ka" }), "Kharkiv");
  assert.equal(placeLabel({ lat: 49.5, lon: 36.2, admin1: "Iowa", admin2: "Polk" }), "Polk, Iowa");
});

test("nameKey matches two spellings of one name", () => {
  assert.equal(nameKey("Ivano-frankivs'ka"), nameKey("Ivano-Frankivs'ka"));
  assert.equal(nameKey("Division No.  9"), nameKey("Division No. 9"));
  assert.equal(nameKey("Córdoba"), "cordoba");
  assert.notEqual(nameKey("Kyyivs'ka"), nameKey("Kyiv"));
});

test("a joined place name reads each part by its display name (alerts)", async () => {
  const { displayPlaceText } = await import("./placeNames.js");
  assert.equal(displayPlaceText("Chuhuivs'kyi, Kharkivs'ka"), "Chuhuivs'kyi, Kharkiv");
  assert.equal(displayPlaceText("Kharkivs'ka"), "Kharkiv");
  assert.equal(displayPlaceText("Nakuru, Rift Valley"), "Nakuru, Rift Valley");
  assert.equal(displayPlaceText(""), "");
  assert.equal(displayPlaceText(null), "");
});
