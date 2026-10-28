// WHAT THIS FILE DOES
// Checks on the website's inner pages (Story, Methodology, Contact, Demo,
// Page not found) and the gate laboratory, read from their source files:
//   - each page starts with the plain-English header every file carries,
//     sets its browser-tab title, and has exactly one h1;
//   - none imports the components the second website removed;
//   - the Methodology page carries the eight ids the old addresses jump to;
//   - pages.css uses only the tokens defined by src/site/site.css and none
//     of the things the website brief bans (shadows, gradients, monospace);
//   - the gate laboratory's two formulas give the answers the method says.
//
// WHO EDITS IT
// Whoever changes these pages. Run: node --test src/site/pages/site-pages.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");

const PAGES = ["StoryPage.jsx", "MethodPage.jsx", "ContactPage.jsx", "DemoPage.jsx", "NotFoundPage.jsx"];
const REMOVED = ["HeroField", "PinStory", "ScrollText", "SplitWords", "PageHero", "ProofBars"];

test("every page carries the file header, a tab title and one h1", () => {
  for (const name of PAGES) {
    const source = read(name);
    assert.ok(source.startsWith("// WHAT THIS FILE DOES"), `${name} starts with WHAT THIS FILE DOES`);
    assert.ok(source.includes("// WHO EDITS IT"), `${name} says who edits it`);
    assert.ok(/usePageTitle\("[^"]+"\)/.test(source), `${name} sets its title`);
    assert.equal((source.match(/<h1\b/g) || []).length, 1, `${name} has exactly one h1`);
    assert.ok(source.includes('import "./pages.css"'), `${name} loads pages.css`);
  }
});

test("no page imports a component the second website removed", () => {
  for (const name of PAGES) {
    const source = read(name);
    for (const gone of REMOVED) assert.ok(!source.includes(`/${gone}.jsx`), `${name} does not import ${gone}`);
  }
});

test("the Methodology page has the ids the old addresses jump to", () => {
  const source = read("MethodPage.jsx");
  for (const id of ["scores", "gate", "demo", "product", "use", "checks", "technology", "design"]) {
    assert.ok(source.includes(`id="${id}"`), `MethodPage has #${id}`);
    assert.ok(source.includes(`"#${id}"`) || source.includes("`#${id}`"), `MethodPage links to #${id}`);
  }
});

test("pages.css uses only the site's tokens and nothing the brief bans", () => {
  const css = read("pages.css");
  const allowed = new Set(["bg", "surface", "ink", "muted", "accent", "accent-ink", "field-dark", "field-dark-2", "field-dark-ink", "field-dark-muted", "field-sage", "field-sage-ink", "font", "step-small", "step-body", "step-lead", "step-head", "step-display", "margin", "gutter", "radius", "ease-out", "pg-gap"]);
  for (const match of css.matchAll(/var\(--([a-z0-9-]+)/g)) {
    assert.ok(allowed.has(match[1]), `token --${match[1]} is one site.css defines`);
  }
  assert.ok(!/box-shadow\s*:/.test(css), "no shadows");
  assert.ok(!/gradient\(/.test(css), "no gradients");
  assert.ok(!/monospace|Mono\b/.test(css), "no monospace");
  assert.ok(!/backdrop-filter/.test(css), "no glass");
  assert.ok(!/border\s*:\s*1px\s+solid/.test(css), "no 1px outlined boxes");
});

// The two formulas, taken from the component's source so they are tested
// as written there (the file is JSX, which node cannot import directly).
function formulas() {
  const source = readFileSync(join(here, "..", "components", "GateLab.jsx"), "utf8");
  const start = source.indexOf("function clamp01");
  const end = source.indexOf("const VALUE");
  assert.ok(start > 0 && end > start, "the formulas are where the file says");
  const code = source.slice(start, end).replace(/export function/g, "function");
  const context = {};
  vm.runInNewContext(`${code}\nthis.near = nearTermScore; this.post = postCrisisScore;`, context);
  return context;
}

test("near term: zero below the cutoff, open above the ramp, in step with the weights", () => {
  const { near } = formulas();
  assert.equal(near(0.72, 0.81, 0.1, 0.3, 0.2, 30, 40), 0, "left out below the cutoff");
  const open = near(0.72, 0.81, 0.6, 0.3, 0.2, 30, 40);
  assert.equal(near(0.72, 0.81, 0.95, 0.3, 0.2, 30, 40), open, "extra feasibility earns nothing once the gate is open");
  const half = near(0.72, 0.81, 0.4, 0.3, 0.2, 30, 40);
  assert.ok(Math.abs(half - open / 2) < 1e-9, "halfway up the ramp the gate is half open");
  const expected = ((30 / 70) * Math.sqrt(0.72) + (40 / 70) * Math.sqrt(0.81)) ** 2;
  assert.ok(Math.abs(open - expected) < 1e-9, "the open score is the squared weighted sum of square roots");
});

test("post-crisis: equal inputs give that value, and the default weights blend all three", () => {
  const { post } = formulas();
  assert.ok(Math.abs(post(0.5, 0.5, 0.5, 30, 40, 30) - 0.5) < 1e-9, "idempotent");
  const expected = (0.3 * Math.sqrt(0.72) + 0.4 * Math.sqrt(0.81) + 0.3 * Math.sqrt(0.35)) ** 2;
  assert.ok(Math.abs(post(0.72, 0.81, 0.35, 30, 40, 30) - expected) < 1e-9, "weights 30 / 40 / 30, exponent 0.5");
  assert.ok(post(0.72, 0.81, 0.1, 30, 40, 30) > 0, "feasibility only slows the result, never vetoes it");
});
