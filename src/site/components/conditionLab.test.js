// WHAT THIS FILE DOES
// Checks the condition laboratory on the Methodology page (conditionLab.js,
// the arithmetic of ConditionLab.jsx, written with the numbers site.js keeps
// in FIELD_METHOD) against the app's own Field method
// (src/lib/field/method.js): a field at normal is "Very good" and one at the
// bottom of every reading "Poor"; each reading scores 1 at normal and 0 at
// its span below it; the three parts add up to the condition, which is
// always the app's own (fieldCondition); high stress holds it under "Very
// good", as in the app, and a held field is never "Very good" (so the
// line saying so can take the class's free second line); the printed
// number never belongs to the next class; the sliders reach past each span
// and start inside the scale; the sliders and the written sum use the
// Methodology page's names (NDVI and NDWI against normal; the health score
// and the water score); the large numbers are sized to their column, so
// "Good" always fits its half of it, and the class keeps room for two
// lines, so the panel never changes height; and the component and its
// stylesheet keep the gate laboratory's look, the site's tokens and the
// website brief (no shadows, gradients or monospace). No browser is needed.
//
// WHO EDITS IT
// Whoever changes the condition laboratory.
// Run: node --test src/site/components/conditionLab.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONDITION_CLASSES, CONDITION_WEIGHTS, HEALTH_SPAN, STRESSED_CONDITION_MAX, WATER_SPAN, conditionClass, conditionScore, fieldCondition, healthScore, stressLevel, waterScore } from "../../lib/field/method.js";
import { SLIDERS, labReading, shownScore, signed } from "./conditionLab.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("a field at normal is Very good; one at the bottom of every reading is Poor", () => {
  const top = labReading({ healthDelta: 0, waterDelta: 0, stressShare: 0 });
  assert.equal(top.health, 1);
  assert.equal(top.water, 1);
  assert.equal(top.score, 1);
  assert.equal(top.label, CONDITION_CLASSES[CONDITION_CLASSES.length - 1].label);
  assert.equal(top.held, false);
  const bottom = labReading({ healthDelta: SLIDERS.health.min / 100, waterDelta: SLIDERS.water.min / 100, stressShare: 1 });
  assert.equal(bottom.score, 0);
  assert.equal(bottom.classId, CONDITION_CLASSES[0].id);
  assert.equal(bottom.label, "Poor");
});

test("each reading scores 1 at or above normal, 0 at its span below, half at half the span", () => {
  for (const [key, span, score] of [
    ["healthDelta", HEALTH_SPAN, "health"],
    ["waterDelta", WATER_SPAN, "water"],
  ]) {
    assert.equal(labReading({ [key]: 0 })[score], 1, `${score} at normal`);
    assert.equal(labReading({ [key]: 0.1 })[score], 1, `${score} above normal stays 1`);
    assert.ok(close(labReading({ [key]: -span / 2 })[score], 0.5), `${score} halfway down its span`);
    assert.equal(labReading({ [key]: -span })[score], 0, `${score} at its span below normal`);
    assert.equal(labReading({ [key]: -span - 0.1 })[score], 0, `${score} further down stays 0`);
  }
  // The same scores as the app's, for the same difference from normal.
  assert.equal(labReading({ healthDelta: -0.1 }).health, healthScore(0.6, 0.7));
  assert.equal(labReading({ waterDelta: -0.05 }).water, waterScore(0.2, 0.25));
});

test("the three parts add up to the condition, which is always the app's own", () => {
  const w = CONDITION_WEIGHTS;
  const total = w.plantHealth + w.water + w.noStress;
  for (let h = SLIDERS.health.min; h <= SLIDERS.health.max; h += 5) {
    for (let v = SLIDERS.water.min; v <= SLIDERS.water.max; v += 5) {
      for (let s = SLIDERS.stress.min; s <= SLIDERS.stress.max; s += 7) {
        const r = labReading({ healthDelta: h / 100, waterDelta: v / 100, stressShare: s / 100 });
        const added = r.parts.reduce((sum, part) => sum + part.value, 0);
        assert.ok(close(added, r.sum), `the parts add up at ${h}, ${v}, ${s}%`);
        assert.ok(close(r.sum, conditionScore({ health: r.health, water: r.water, stress: s / 100 })), "the sum is the app's conditionScore");
        const app = fieldCondition({ health: r.health, water: r.water, stress: s / 100 });
        assert.equal(r.score, app.score, "the condition is the app's fieldCondition");
        assert.equal(r.classId, app.class, "and so is its class");
        for (const part of r.parts) assert.ok(part.value <= part.weight + 1e-9, `${part.id} is at most its weight`);
      }
    }
  }
  // In the formula's order, with the formula's weights.
  const parts = labReading({}).parts;
  assert.deepEqual(parts.map((p) => p.id), ["health", "water", "noStress"]);
  assert.deepEqual(parts.map((p) => p.weight), [w.plantHealth / total, w.water / total, w.noStress / total]);
});

test("high stress holds the condition under Very good, as the app does; less stress does not", () => {
  // At normal, 15% stressed: 0.5 + 0.3 + 0.2 x 0.85 = 0.97, held at 0.84.
  assert.equal(stressLevel(0.15), "high");
  const held = labReading({ healthDelta: 0, waterDelta: 0, stressShare: 0.15 });
  assert.ok(close(held.sum, 0.97));
  assert.equal(held.score, STRESSED_CONDITION_MAX);
  assert.equal(held.held, true);
  assert.equal(held.label, conditionClass(STRESSED_CONDITION_MAX).label);
  assert.notEqual(held.label, "Very good");
  // 14% is medium stress: no hold, Very good.
  const free = labReading({ healthDelta: 0, waterDelta: 0, stressShare: 0.14 });
  assert.equal(free.held, false);
  assert.equal(free.label, "Very good");
  // A hold that changes nothing is not shown: 15% stressed, but already Fair.
  const low = labReading({ healthDelta: -0.2, waterDelta: -0.1, stressShare: 0.15 });
  assert.equal(low.held, false);
  // A held field is never in the top class, so its class is one word and
  // the line about the hold can use the class's second line (conditionlab.css).
  const top = CONDITION_CLASSES[CONDITION_CLASSES.length - 1].id;
  for (let h = SLIDERS.health.min; h <= SLIDERS.health.max; h += 2) {
    for (let s = SLIDERS.stress.min; s <= SLIDERS.stress.max; s += 1) {
      const r = labReading({ healthDelta: h / 100, waterDelta: 0.1, stressShare: s / 100 });
      if (r.held) assert.notEqual(r.classId, top, `held at ${h}, ${s}%`);
    }
  }
  assert.deepEqual(CONDITION_CLASSES.filter((item) => item.label.includes(" ")).map((item) => item.id), [top], "only the top class's name has two words");
});

test("the printed condition never belongs to the next class", () => {
  for (const item of CONDITION_CLASSES.filter((c) => Number.isFinite(c.upTo))) {
    for (const below of [0.0001, 0.001, 0.004, 0.0049]) {
      const score = item.upTo - below;
      const printed = Number(shownScore(score));
      assert.equal(conditionClass(printed).id, conditionClass(score).id, `${score} prints ${printed}, still ${conditionClass(score).label}`);
    }
    assert.equal(shownScore(item.upTo), item.upTo.toFixed(2), "a boundary itself prints as itself");
  }
  assert.equal(shownScore(0.757333), "0.76", "elsewhere it rounds");
  assert.equal(shownScore(0.84), "0.84");
  // Every reading the sliders can make.
  for (let h = SLIDERS.health.min; h <= SLIDERS.health.max; h += 1) {
    for (let s = 0; s <= 100; s += 1) {
      const r = labReading({ healthDelta: h / 100, waterDelta: SLIDERS.water.start / 100, stressShare: s / 100 });
      assert.equal(conditionClass(Number(shownScore(r.score))).id, r.classId, `${h}, ${s}%`);
    }
  }
});

test("the sliders reach past each reading's span, start inside the scale, and print a true minus", () => {
  assert.ok(SLIDERS.health.min / 100 < -HEALTH_SPAN, "plant health can reach a score of 0");
  assert.ok(SLIDERS.water.min / 100 < -WATER_SPAN, "water can reach a score of 0");
  for (const slider of Object.values(SLIDERS)) {
    assert.ok(Number.isInteger(slider.min) && Number.isInteger(slider.max) && Number.isInteger(slider.start), "whole steps");
    assert.ok(slider.min < slider.start && slider.start < slider.max, "the start is inside");
  }
  assert.equal(SLIDERS.stress.min, 0);
  assert.equal(SLIDERS.stress.max, 100);
  // The starting field is neither the lowest class nor the highest, so both ways can be explored.
  const start = labReading({ healthDelta: SLIDERS.health.start / 100, waterDelta: SLIDERS.water.start / 100, stressShare: SLIDERS.stress.start / 100 });
  assert.notEqual(start.classId, CONDITION_CLASSES[0].id);
  assert.notEqual(start.classId, CONDITION_CLASSES[CONDITION_CLASSES.length - 1].id);
  assert.equal(signed(-0.1), "−0.10");
  assert.equal(signed(0.05), "+0.05");
  assert.equal(signed(0), "0.00");
  assert.equal(signed(-0.001), "0.00", "never −0.00");
  // The marks follow the language: Ukrainian writes a decimal comma.
  assert.equal(signed(-0.1, 2, "uk-UA"), "−0,10");
  assert.equal(signed(0, 2, "uk-UA"), "0,00");
  assert.equal(shownScore(0.757333, "uk-UA"), "0,76");
  assert.equal(shownScore(0.757333, "zh-CN"), "0.76");
});

test("the laboratory keeps the gate laboratory's look and says in words what it draws", () => {
  const source = read("ConditionLab.jsx");
  assert.ok(source.startsWith("// WHAT THIS FILE DOES"));
  assert.ok(source.includes("// WHO EDITS IT"));
  // A data fragment in the gate laboratory's classes, with its own stylesheet.
  assert.match(source, /<div className="gl cl" data-ui>/);
  assert.match(source, /import "\.\/conditionlab\.css";/);
  for (const cls of ["gl-controls", "gl-note", "gl-control", "gl-readout"]) assert.ok(source.includes(`className="${cls}"`), `uses .${cls}`);
  // Three labelled sliders, each with its value in words for a screen reader.
  for (const id of ["cl-health", "cl-water", "cl-stress"]) {
    assert.match(source, new RegExp(`<label htmlFor="${id}">`), `${id} has a label`);
    assert.match(source, new RegExp(`<input id="${id}" type="range"[^>]*aria-valuetext=`), `${id} says its value in words`);
  }
  // The page's names: the sliders move NDVI and NDWI against their normal
  // (a difference, not the score), and the written sum names the 0-to-1
  // parts as the page's formula does (the health score, the water score).
  assert.match(source, /<label htmlFor="cl-health">\s*\{t\("NDVI against normal"\)\} <b>/);
  assert.match(source, /<label htmlFor="cl-water">\s*\{t\("NDWI against normal"\)\} <b>/);
  assert.match(source, /<label htmlFor="cl-stress">\s*\{t\("Stressed share"\)\} <b>/);
  assert.match(source, /health: \{ name: "Health score",/);
  assert.match(source, /water: \{ name: "Water score",/);
  assert.match(source, /noStress: \{ name: "Not stressed",/);
  assert.doesNotMatch(source, /Plant health against normal|Water against normal|name: "Plant health"|name: "Water"/);
  // The numbers are announced; the drawing is for the eye, the written sum for everyone.
  assert.match(source, /<div className="gl-readout" aria-live="polite">/);
  assert.match(source, /<div aria-hidden="true">\s*<div className="cl-track">/);
  assert.match(source, /<ul className="cl-parts">/);
  // The classes come from site.js (FIELD_METHOD), never typed here; and
  // neither file loads the app's method into the website (site.js says why).
  assert.match(source, /import \{ FIELD_METHOD(?:, \w+)* \} from "\.\.\/content\/site\.js";/);
  const code = source.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /0\.4\b|0\.65|0\.85|0\.84/, "no class boundary typed into the component");
  for (const file of ["ConditionLab.jsx", "conditionLab.js"]) {
    assert.doesNotMatch(read(file).replace(/^\s*\/\/.*$/gm, ""), /from "\.\.\/\.\.\/lib\//, `${file} does not import the app's code`);
  }
});

test("its stylesheet uses only the site's tokens and nothing the website brief bans", () => {
  const css = read("conditionlab.css");
  assert.ok(css.trimStart().startsWith("/*") && css.includes("WHAT THIS FILE DOES") && css.includes("WHO EDITS IT"));
  const site = readFileSync(join(here, "..", "site.css"), "utf8");
  const defined = new Set([...site.matchAll(/(--[a-z0-9-]+)\s*:/g), ...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(defined.has(m[1]), `${m[1]} is a site.css token or the file's own`);
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /box-shadow\s*:|gradient\(|monospace|Mono\b|backdrop-filter|border\s*:\s*1px\s+solid/);
  assert.doesNotMatch(rules, /cursor\s*:/, "the site's pin stays the cursor");
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b/i, "no colour of its own");
  // Nothing moves: no transition or animation to switch off for reduced motion.
  assert.doesNotMatch(rules, /transition\s*:|animation\s*:/);
  // The sliders are 32 px tall to a finger.
  assert.match(rules, /\.cl \.gl-control input\[type="range"\] \{\s*height: 32px;/);
});

test("the large numbers fit their column at every width, and the panel keeps its height in every state", () => {
  const rules = read("conditionlab.css").replace(/\/\*[\s\S]*?\*\//g, "");
  // Sized to the controls' column (a container: 1cqi is 1% of its width),
  // never larger than the gate laboratory's numbers (--step-head).
  const cap = rules.match(/\.cl \.gl-controls \{\s*container-type: inline-size;\s*--cl-big: min\(var\(--step-head\), calc\(([\d.]+)cqi - ([\d.]+)px\)\);/);
  assert.ok(cap, "the size follows the column");
  assert.match(rules, /\.cl \.gl-readout b \{\s*font-size: var\(--cl-big\);/);
  // "Good", the widest answer of one word, is 2.45 times the type size
  // wide in the site's face at weight 800 (measured in Chromium and
  // WebKit, 3 November 2026; "0.76" is 2.05): it must fit its half of the
  // readout (two columns, a 16 px gap) at any column width.
  const pagesCss = readFileSync(join(here, "..", "pages", "pages.css"), "utf8");
  const gap = Number(pagesCss.match(/\.gl-readout \{[^}]*gap: (\d+)px;/)[1]);
  const [k, c] = [Number(cap[1]), Number(cap[2])];
  for (let width = 150; width <= 700; width += 1) {
    const size = (k * width) / 100 - c;
    assert.ok(2.45 * size <= (width - gap) / 2, `"Good" fits at a ${width} px column (${size.toFixed(1)} px type)`);
  }
  // The class keeps room for two lines ("Very / good"), and the line about
  // the hold sits in that second line (a held field is "Good" at most), so
  // nothing grows or moves while the reader drags.
  assert.match(rules, /\.cl \.gl-readout > div \+ div b \{\s*min-height: 2em;/);
  assert.match(rules, /\.pg \.cl-held \{\s*position: absolute;\s*top: calc\(100% - var\(--cl-big\) \+ \d+px\);/);
  // Beside the controls, the sum sits right under the bar and the classes:
  // no unexplained gap in the middle.
  const chart = rules.match(/\.cl-chart \{[^}]*\}/)[0];
  assert.match(chart, /justify-content: flex-start;/);
  assert.doesNotMatch(chart, /space-between/);
});
