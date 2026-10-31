// WHAT THIS FILE DOES
// Checks on the website's inner pages (Story, Methodology, Contact, Demo,
// Owner sign-in, Page not found) and the gate laboratory, read from their
// source files (no browser needed):
//   - each page starts with the plain-English header every file carries,
//     sets its browser-tab title, and has exactly one h1;
//   - none imports the components the second website removed;
//   - the Story is the five parts the owner asked for, in his order, and
//     nothing else (no film, no "Who makes it", no closing sign-up);
//   - the Demo page is the two doors (which switch the tab to the demo)
//     and the Register line, with no code anywhere;
//   - the Contact page says where messages go (chernozem.app@gmail.com),
//     keeps the robot trap, and has lost "What to write about" and
//     "Elsewhere";
//   - the Owner page is unlisted (noindex) and signs in with the code;
//   - no page mentions an access code or the challenge the app was made for
//     (the About page names it once; the words are built from pieces here so
//     a search of the code finds only the About page),
//     and none prints the demo farm's number of fields;
//   - every picture the pages name exists in public/;
//   - the Methodology page carries the eight ids the old addresses jump to;
//   - pages.css uses only the tokens defined by src/site/site.css and none
//     of the things the website brief bans (shadows, gradients, monospace);
//   - the sitemap lists no unlisted page;
//   - the gate laboratory's two formulas give the answers the method says.
//
// WHO EDITS IT
// Whoever changes these pages. Run: node --test src/site/pages/site-pages.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { CONTACT_EMAIL, LINKS, SITE } from "../content/site.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const read = (name) => readFileSync(join(here, name), "utf8");

const PAGES = ["StoryPage.jsx", "MethodPage.jsx", "ContactPage.jsx", "DemoPage.jsx", "OwnerPage.jsx", "NotFoundPage.jsx"];
const REMOVED = ["HeroField", "PinStory", "ScrollText", "SplitWords", "PageHero", "ProofBars"];

// The words a visitor reads: the source without its comments (so a file's
// header may explain what was removed without failing the checks).
function words(name) {
  return read(name)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// The text of every h1 and h2 in a page, in order.
function headings(name) {
  return [...words(name).matchAll(/<(h[12])\b[^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => ({ tag: m[1], text: m[2].replace(/\s+/g, " ").trim() }));
}

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

test("the Story is the meal, the meeting and the three editions, in that order, and nothing else", () => {
  const list = headings("StoryPage.jsx");
  assert.deepEqual(
    list.map((h) => h.text),
    ["Where Chernozem comes from", "At Penn", "First edition", "Second edition", "Third edition"],
  );
  assert.equal(list[0].tag, "h1");
  const text = words("StoryPage.jsx");
  // The meal is on the first screen, under the title.
  assert.match(text, /family table/);
  assert.match(text, /northeastern China/);
  assert.match(text, /University of Pennsylvania/);
  // What the owner asked to take out.
  for (const gone of ["Who makes it", "What it stands for", "Try it on your own land", "The soil", "Film", "Register", "Polytechnic", "Pasadena"]) {
    assert.ok(!text.includes(gone), `the Story no longer has "${gone}"`);
  }
  assert.ok(!/import Film/.test(read("StoryPage.jsx")), "the Story does not load the film");
});

test("the Story's edition bar links to each edition, and each edition has its pictures", () => {
  const source = words("StoryPage.jsx");
  for (const id of ["first-edition", "second-edition", "third-edition"]) {
    assert.ok(source.includes(`id: "${id}"`), `the bar lists #${id}`);
    assert.ok(source.includes(`id="${id}"`), `the page has a part #${id}`);
  }
  assert.ok(source.includes("href={`#${id}`}"), "each part of the bar is a plain link to its edition");
  for (const picture of ["edition-1-colab.webp", "disturbance-map.webp", "acled-events.webp", "edition-2-atlas.webp", "field-fields-detail.webp", "atlas-overview.webp"]) {
    assert.ok(source.includes(picture), `the Story shows ${picture}`);
  }
  // The numbers come from site.js, never typed in.
  assert.doesNotMatch(source, /109,?636|−0\.8|-0\.8\b/);
  assert.match(source, /NUMBERS\.acledEvents/);
  assert.match(source, /LINKS\.paper/);
});

test("the Demo page is the two doors and the Register line, and nothing about a code", () => {
  const source = read("DemoPage.jsx");
  const text = words("DemoPage.jsx");
  assert.equal(headings("DemoPage.jsx")[0].text, "Try the demo");
  assert.ok(text.includes("The demo is Ukraine, where Chernozem started: a farm near Kupiansk in Field, and the whole country in Atlas."));
  assert.match(source, /import \{ enterDemo \} from "\.\.\/\.\.\/lib\/demoMode\.js"/);
  assert.match(text, /onClick=\{enterDemo\}/, "a door switches the tab to the demo before the app opens");
  assert.match(text, /to: SITE\.appPath/);
  assert.match(text, /to: SITE\.atlasPath/);
  assert.equal(SITE.appPath, "/field");
  assert.equal(SITE.atlasPath, "/atlas");
  assert.ok(text.includes("Open Field") && text.includes("Open Atlas"));
  assert.ok(text.includes("Want your own fields or region? Register, it’s free."));
  for (const gone of ["signIn", "getAuthStatus", "Access code", "code", "What is in the demo", "Without a code", "twelve"]) {
    assert.ok(!text.includes(gone), `the Demo page no longer has "${gone}"`);
  }
});

test("the Contact page says where messages go and keeps only the form", () => {
  const text = words("ContactPage.jsx");
  assert.equal(CONTACT_EMAIL, "chernozem.app@gmail.com");
  assert.match(text, /Messages go to <a href=\{`mailto:\$\{CONTACT_EMAIL\}`\}>\{CONTACT_EMAIL\}<\/a>/);
  assert.match(text, /on its way to \{CONTACT_EMAIL\}\. The reply will come to \{sentTo\}/, "the done state names both addresses");
  for (const gone of ["What to write about", "Elsewhere", "Saved privately", "No mailing list", "LINKS.github", "demo code"]) {
    assert.ok(!text.includes(gone), `the Contact page no longer has "${gone}"`);
  }
  // The fields the server takes, the robot trap and the limits.
  for (const field of ['name="role"', 'name="name"', 'name="email"', 'name="organization"', 'name="message"', 'name="website"']) {
    assert.ok(text.includes(field), `the form has ${field}`);
  }
  assert.match(text, /maxLength=\{80\}/);
  assert.match(text, /maxLength=\{120\}/);
  assert.match(text, /const MAX = 2000/);
  // The role travels as its own field (server/messages.js takes "role"),
  // so the message is sent as typed.
  assert.match(text, /sendContact\(\{ \.\.\.form, role, message: form\.message\.trim\(\) \}\)/);
  for (const role of ["Farmer", "Government or NGO", "Researcher", "Something else"]) {
    assert.ok(text.includes(`value: "${role}"`), `"${role}" is one of the choices`);
    assert.ok(role.length <= 60, "a role fits the server's 60 characters");
  }
});

test("the Contact page calls its hooks at the top, never inside a branch", () => {
  const source = words("ContactPage.jsx");
  const body = source.slice(source.indexOf("export default function ContactPage"));
  const firstReturn = body.indexOf("return (");
  assert.ok(firstReturn > 0);
  const top = body.slice(0, firstReturn);
  assert.match(top, /const reveal = useReveal\(\);/, "useReveal is called before anything is returned");
  assert.equal((body.match(/useReveal\(/g) || []).length, 1, "useReveal is called once");
  assert.ok(!/\?\s*\(?\s*use[A-Z]\w*\(/.test(body), "no hook is called inside a condition");
});

test("the Owner page is unlisted and signs in with the code", () => {
  const source = read("OwnerPage.jsx");
  const text = words("OwnerPage.jsx");
  assert.match(source, /usePageTitle\("Owner sign-in"\)/);
  assert.match(text, /meta\.name = "robots"/);
  assert.match(text, /meta\.content = "noindex, nofollow"/);
  assert.match(text, /return \(\) => meta\.remove\(\)/, "the noindex line leaves with the page");
  assert.match(source, /import \{ getAuthStatus, signIn \} from "\.\.\/\.\.\/api\/atlasApi\.js"/);
  assert.match(text, /leaveDemo\(\)/);
  assert.ok(text.includes("That code is not right."));
  assert.match(text, /to=\{SITE\.appPath\}/);
  assert.match(text, /to=\{SITE\.atlasPath\}/);
  // Linked from nowhere on the website.
  for (const name of PAGES.filter((n) => n !== "OwnerPage.jsx")) assert.ok(!read(name).includes('"/owner"'), `${name} does not link to /owner`);
  const sitemap = readFileSync(join(root, "public", "sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /\/owner/);
});

const CHALLENGE = ["Congress", "ional"].join("");
const CODE_WORDS = new RegExp(["access code", "with a " + "code", "demo code", "ask for a " + "code"].join("|"), "i");

test("no page mentions an access code, the app challenge or a field count", () => {
  for (const name of PAGES) {
    const text = words(name);
    assert.doesNotMatch(text, CODE_WORDS, `${name} mentions no access code`);
    assert.doesNotMatch(text, new RegExp(`${CHALLENGE}|LINKS\\.cac`), `${name} does not name the app challenge (the About page does, once)`);
    assert.doesNotMatch(text, /\b1[23] fields\b|twelve fields|DEMO\.fields/i, `${name} prints no field count`);
  }
  // The About page still has the link it uses.
  assert.equal(LINKS.cac, "https://www.congressionalappchallenge.us/");
  const content = readFileSync(join(here, "..", "content", "site.js"), "utf8");
  assert.doesNotMatch(content, /access code/i, "site.js no longer talks about an access code");
});

test("every picture the pages name exists in public/", () => {
  for (const name of PAGES) {
    const source = read(name);
    const paths = [...source.matchAll(/["'](\/site\/[^"'\s]+\.(?:webp|png|jpg))["']/g)].map((m) => m[1]);
    for (const path of paths) assert.ok(existsSync(join(root, "public", path)), `${name}: ${path} exists`);
  }
});

test("the Methodology page has the ids the old addresses jump to", () => {
  const source = read("MethodPage.jsx");
  for (const id of ["scores", "gate", "demo", "product", "use", "checks", "technology", "design"]) {
    assert.ok(source.includes(`id="${id}"`), `MethodPage has #${id}`);
    assert.ok(source.includes(`"#${id}"`) || source.includes("`#${id}`"), `MethodPage links to #${id}`);
  }
  assert.match(words("MethodPage.jsx"), /The demo is open to everyone and read-only\./);
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
