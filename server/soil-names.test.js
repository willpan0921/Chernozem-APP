// Tests for the plain soil names (soil-names.js). Run with "npm test".

import test from "node:test";
import assert from "node:assert/strict";
import { BLACK_SOIL_RULE, BUILT_IN_CLASSES, ORDER_WORDS, soilMix, soilName } from "./soil-names.js";
import { BLACK_SOIL } from "./providers/gee.js";

test("great groups are named by their USDA order and suborder, with the WRB name", () => {
  const udoll = soilName("Hapludolls");
  assert.equal(udoll.name, "Black soil (chernozem type: Mollisol, Udolls)");
  assert.equal(udoll.short, "Black soil (chernozem type)");
  assert.equal(udoll.order, "Mollisols");
  assert.equal(udoll.suborder, "Udolls");
  assert.equal(udoll.blackSoil, true);
  assert.equal(udoll.greatGroup, "Hapludolls");
  assert.match(udoll.wrb, /Chernozem/);
  assert.equal(soilName("Haplustolls").name, "Steppe black soil (chernozem type: Mollisol, Ustolls)");
  assert.equal(soilName("Endoaquolls").name, "Wet dark soil (meadow black soil: Mollisol, Aquolls)");
  assert.equal(soilName("Endoaquolls").short, "Wet dark soil (meadow black soil)");
  assert.equal(soilName("Haprendolls").name, "Black soil on limestone (rendzina type: Mollisol, Rendolls)");
  assert.equal(soilName("Haploxerolls").short, "Dry-summer black soil (chernozem type)");
  assert.equal(soilName("Cryrendolls").suborder, "Rendolls");
  assert.equal(soilName("Argiaquolls").suborder, "Aquolls");
  assert.equal(soilName("Haploborolls").suborder, "Borolls");
  assert.equal(soilName("Hapludalfs").name, "Grey forest soil (luvisol type: Alfisol)");
  assert.equal(soilName("Hapludalfs").suborder, "Udalfs");
  assert.equal(soilName("Eutroboralfs").suborder, "Boralfs");
  assert.equal(soilName("Haplusterts").name, "Cracking clay (vertisol)");
  assert.equal(soilName("Eutrudepts").name, "Young soil (Inceptisol)");
  assert.equal(soilName("Ustochrepts").suborder, "Ochrepts");
  assert.equal(soilName("Haplorthods").name, "Sandy podzol (Spodosol)");
  assert.equal(soilName("Haplosaprists").name, "Peat (Histosol)");
  assert.equal(soilName("Haplocalcids").name, "Desert soil (Aridisol)");
  assert.equal(soilName("Calciorthids").suborder, "Orthids");
  assert.equal(soilName("Hapludults").name, "Red tropical soil (Oxisol/Ultisol)");
  assert.equal(soilName("Hapludox").name, "Red tropical soil (Oxisol/Ultisol)");
  assert.equal(soilName("Hapludox").order, "Oxisols");
  assert.equal(soilName("Hapludands").name, "Volcanic soil (Andisol)");
  assert.equal(soilName("Vitrandepts").order, "Andisols", "the old volcanic Inceptisols read as volcanic soil");
  assert.equal(soilName("Haploturbels").name, "Permafrost soil (Gelisol)");
  assert.equal(soilName("Udifluvents").name, "Young alluvial or sandy soil (Entisol)");
  assert.equal(soilName("Udifluvents").suborder, "Fluvents");
  assert.equal(soilName("Udarents").suborder, "Arents");
});

test("only the Mollisols the black-soil share counts are called black soil", () => {
  // The same rule as the black-soil share (gee.js), and the same classes.
  assert.equal(String(BLACK_SOIL_RULE.keep), String(BLACK_SOIL.keep));
  assert.equal(String(BLACK_SOIL_RULE.drop), String(BLACK_SOIL.drop));
  const counted = [...BUILT_IN_CLASSES].filter(([, name]) => soilName(name).blackSoil).map(([value]) => value);
  assert.deepEqual(counted, BLACK_SOIL.classes);
  for (const name of BUILT_IN_CLASSES.values()) {
    const plain = soilName(name);
    const counted = BLACK_SOIL.keep.test(name) && !BLACK_SOIL.drop.test(name);
    assert.equal(plain.blackSoil, counted, name);
    assert.equal(/black soil/i.test(plain.name), counted, name);
  }
  assert.equal(soilName("Haplocryolls").name, "Cold dark soil (Mollisol, Cryolls)");
  assert.equal(soilName("Cryaquolls").name, "Cold dark soil (Mollisol, Aquolls)");
  assert.equal(soilName("Argialbolls").name, "Bleached dark soil (Mollisol, Albolls)");
});

test("every class of the soil map has an order and a plain name", () => {
  assert.equal(BUILT_IN_CLASSES.size, 242, "the map's 243 classes less NODATA");
  for (const [value, name] of BUILT_IN_CLASSES) {
    const plain = soilName(name);
    assert.ok(plain.order, `${value} ${name}`);
    assert.ok(ORDER_WORDS[plain.order], plain.order);
    assert.ok(plain.suborder, `${value} ${name} has a suborder`);
    assert.ok(!plain.name.includes("{"), plain.name);
  }
  assert.equal(soilName("NODATA"), null);
  assert.equal(soilName(""), null);
  assert.equal(soilName(undefined), null);
  // A name the rule does not know is shown as it is, never guessed.
  assert.deepEqual(soilName("Rock outcrop"), { name: "Rock outcrop", short: "Rock outcrop", order: null, suborder: null, wrb: null, blackSoil: false, greatGroup: "Rock outcrop" });
});

test("a square's soils: shares of its cropland, great groups of one plain name together, top 3 with the rest", () => {
  // Hapludolls 290 and Argiudolls 271 are both "Black soil ... Udolls".
  const histogram = { cropland: { 290: 50, 271: 28, 18: 15, 216: 4, 143: 3, 0: 40 }, all: { 290: 60, 18: 100 } };
  const mix = soilMix(histogram);
  assert.equal(mix.over, "cropland");
  assert.equal(mix.pixels, 100, "NODATA (0) is left out");
  assert.equal(mix.top.length, 3);
  assert.equal(mix.top[0].name, "Black soil (chernozem type: Mollisol, Udolls)");
  assert.equal(mix.top[0].share, 0.78);
  assert.deepEqual(mix.top[0].greatGroups, [{ value: 290, name: "Hapludolls", share: 0.5 }, { value: 271, name: "Argiudolls", share: 0.28 }]);
  assert.equal(mix.top[1].name, "Grey forest soil (luvisol type: Alfisol)");
  assert.equal(mix.top[1].share, 0.15);
  assert.equal(mix.top[2].short, "Young soil");
  assert.equal(mix.otherShare, 0.03);
  assert.equal(mix.blackSoilShare, 0.78);
  assert.equal(mix.summary, "Black soil (chernozem type) 78% · Grey forest soil 15% · Young soil 4%");
});

test("several black soils are told apart; a soil under 1% is not listed", () => {
  // Real shares of a square in Kharkiv oblast (2026-10-25).
  const mix = soilMix({ cropland: { 285: 56, 274: 1, 290: 28, 271: 1, 291: 7, 18: 0.4 }, all: {} });
  assert.deepEqual(mix.top.map((g) => g.short), ["Wet dark soil (meadow black soil)", "Black soil (chernozem type)", "Steppe black soil (chernozem type)"]);
  assert.equal(mix.summary, "Wet dark soil (meadow black soil) 61% · Black soil (chernozem type) 31% · Steppe black soil (chernozem type) 8%");
  const iowa = soilMix({ cropland: { 290: 92, 18: 7.6, 285: 0.4 }, all: {} });
  assert.deepEqual(iowa.top.map((g) => g.short), ["Black soil (chernozem type)", "Grey forest soil"]);
  assert.equal(iowa.otherShare, 0.004);
});

test("with little or no cropland the whole square is counted; with no pixels there is no soil", () => {
  const noCrop = soilMix({ cropland: {}, all: { 18: 30, 290: 10 } });
  assert.equal(noCrop.over, "all");
  assert.equal(noCrop.top[0].short, "Grey forest soil");
  assert.equal(noCrop.top[0].share, 0.75);
  // 3 pixels of cropland is too few to speak for the square.
  assert.equal(soilMix({ cropland: { 290: 3 }, all: { 18: 300, 290: 3 } }).over, "all");
  assert.deepEqual(soilMix({ cropland: {}, all: {} }), { over: null, pixels: 0, top: [], otherShare: 0, blackSoilShare: 0, summary: "" });
  assert.equal(soilMix(null).top.length, 0);
});

test("the map's own class list is used when given; an unknown value is named by its number", () => {
  const mix = soilMix({ cropland: {}, all: { 999: 10, 290: 30 } }, [{ value: 999, name: "Haplustolls" }]);
  assert.equal(mix.top[1].name, "Steppe black soil (chernozem type: Mollisol, Ustolls)");
  const unknown = soilMix({ cropland: {}, all: { 998: 10 } });
  assert.equal(unknown.top[0].name, "Soil class 998");
  assert.equal(unknown.top[0].blackSoil, false);
});
