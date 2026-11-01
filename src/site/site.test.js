// WHAT THIS FILE DOES
// Checks on the website's frame and About page, read from their source
// files (no browser needed):
//   - every CSS variable the site's stylesheets use is defined in site.css
//     (including the old --s-* names the frozen demo.css still uses);
//   - site.css carries every token the website brief names;
//   - index.html loads Schibsted Grotesk (and Inter for the app), none of
//     the first website's faces, and has the agreed title;
//   - the sitemap lists the six public addresses;
//   - every website file starts with the plain-English header;
//   - the About page's words avoid the banned phrases;
//   - the proof table quotes its numbers from site.js, never typed in;
//   - the pin cursor clicks at the centre of its head and shows on every
//     control (never the system's hand), and the website (never the app)
//     starts the click assist;
//   - the menu offers "Sign in" and the signed-in visitor's own button, the
//     footer has no middle-dot strings and says "Data and code";
//   - page changes are quick (a short fade, the next page's code fetched
//     when its link is pointed at);
//   - the About page, in the owner's order of 1 November 2026: the slogan
//     "Drop your pin, know your land." as its bold title beside the new
//     Earth, Why Chernozem beside a credited photograph, the Field and
//     Atlas sideways stories, "One field, one pass, one answer", the
//     record, the Ukraine demo and the close; "Register for Chernozem"
//     everywhere (never "Register for Field" or "for Atlas");
//   - the two stories are held with CSS sticky, slide one whole step at a
//     time, have 4 to 6 steps each with a picture of the app that exists,
//     stays small and has a sharp copy, and fall back to a plain list for
//     reduced motion;
//   - the page keys rest on every step of both stories, in order, both
//     ways, from the top of the page to its end and back (a simulation of
//     the presses with the stories' arithmetic and the browser's own page
//     step), including the press that brings a story onto the screen;
//   - a story keeps the visitor's step when the window changes size, a
//     phone is turned or reduced motion is switched (the arithmetic, and
//     the parts of the component and its styles that do it), and a short
//     window still shows a usable part of each picture;
//   - Atlas's first picture keeps its figure whole on every phone;
//   - the photograph exists, stays small, and is credited under it with
//     its author (as its licence box asks), a link to its licence and a
//     link to its source;
//   - what the owner had removed stays removed (the old hero sentence,
//     "What is Chernozem", the weights picture, the slider, the feature
//     lists, the film, the founder's letter, the WebGL globe on this page);
//   - no part of the website names the app challenge (the owner's rule
//     since 31 October 2026), and no part of the About page mentions a
//     demo code or prints how many fields the demo farm has;
//   - the field row is one live row; the demo is built only when near, and
//     the record, the demo and the close show at once for a visitor who
//     lands at the end of the page (Back from Register, a jump to the end),
//     with the demo's place kept at its height while it loads; useNear
//     counts an element already above the screen as near.
//
// The challenge's name (and the old demo wording) is assembled below rather
// than written out, so a search of src/site for it finds nothing.
//
// WHO EDITS IT
// Whoever changes the website's frame or About page.
// Run: node --test src/site/site.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { entryTarget, listStepAt, listTarget, nearlyHeld, pageTarget, shareMiddle, stepAt } from "./components/scrollStoryMath.js";
import { isNear } from "./hooks.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (...parts) => readFileSync(join(here, ...parts), "utf8");

const SITE_CSS = read("site.css");
const STYLESHEETS = ["components/nav.css", "components/footer.css", "components/demo.css", "components/earth.css", "components/scrollstory.css", "pages/home.css"];
// The files whose words the About page shows.
const ABOUT_FILES = ["pages/HomePage.jsx", "components/ScrollStory.jsx", "components/EarthGlobe.jsx", "components/FieldRowStates.jsx", "components/ProofTable.jsx", "components/Nav.jsx", "components/Footer.jsx"];

test("every CSS variable used by the site's stylesheets is defined in site.css", () => {
  const defined = new Set([...SITE_CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  // A few variables are set by the components themselves (the entrance
  // order --i, the load delay --d, the field row's --row-zoom, the
  // stories' --story-steps and --story-at, a picture's --fx and --fy).
  for (const dir of ["components", "pages"]) {
    for (const name of readdirSync(join(here, dir)).filter((f) => f.endsWith(".jsx"))) {
      for (const m of read(dir, name).matchAll(/"(--[a-z0-9-]+)":|setProperty\("(--[a-z0-9-]+)"/g)) defined.add(m[1] || m[2]);
    }
  }
  for (const file of STYLESHEETS) {
    const css = read(file);
    const local = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    for (const name of used) {
      assert.ok(defined.has(name) || local.has(name), `${file} uses ${name}, which site.css does not define`);
    }
  }
});

test("site.css carries the brief's tokens", () => {
  const wanted = ["--bg", "--surface", "--ink", "--muted", "--accent", "--accent-ink", "--field-dark", "--field-dark-2", "--field-dark-ink", "--field-dark-muted", "--field-sage", "--field-sage-ink", "--data-war", "--data-flood", "--data-fire", "--data-drought", "--data-storm", "--data-quake", "--data-land", "--data-arc", "--font", "--step-small", "--step-body", "--step-lead", "--step-head", "--step-display", "--margin", "--gutter", "--radius", "--ease-out"];
  for (const name of wanted) assert.match(SITE_CSS, new RegExp(`${name}\\s*:`), `${name} missing`);
  assert.match(SITE_CSS, /--bg:\s*#f3f3f0/);
  assert.match(SITE_CSS, /--accent:\s*#1f4a2a/);
  assert.match(SITE_CSS, /"Schibsted Grotesk"/);
  assert.doesNotMatch(SITE_CSS, /Fraunces|JetBrains/); // taste-skill-ignore: the faces being ruled out
  // The pin is the cursor on the site, clicking at the centre of its round head.
  assert.match(SITE_CSS, /cursor-pin\.png\) 11 10, auto/);
  assert.doesNotMatch(SITE_CSS, /cursor-pin[^;]*11 31/);
});

test("index.html loads the website's face, keeps the app's, and has the agreed title", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /family=Schibsted\+Grotesk/);
  assert.match(html, /family=Inter/); // taste-skill-ignore: Inter is the app's face, kept on purpose
  assert.match(html, /family=JetBrains\+Mono/); // taste-skill-ignore: the app's figures use it; the website never does
  assert.doesNotMatch(html, /Fraunces/); // taste-skill-ignore: the first website's face, ruled out
  assert.doesNotMatch(SITE_CSS, /JetBrains/); // taste-skill-ignore: no monospace on the website
  assert.match(html, /<title>Chernozem, satellite farmland monitoring<\/title>/);
  assert.match(html, /og:image" content="https:\/\/chernozem\.app\/chernozem-logo\.png"/);
  assert.match(html, /classList\.add\("js"\)/);
});

test("the sitemap lists the six public addresses", () => {
  const xml = readFileSync(join(root, "public", "sitemap.xml"), "utf8");
  for (const path of ["/", "/story", "/method", "/contact", "/demo", "/register"]) {
    assert.match(xml, new RegExp(`<loc>https://chernozem\\.app${path.replace("/", "\\/")}</loc>`), `${path} missing`);
  }
  assert.doesNotMatch(xml, /\/product|\/guide|\/technology|\/design/);
});

test("every website file starts with the plain-English header", () => {
  const files = [
    ...readdirSync(here).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => join(here, f)),
    ...readdirSync(join(here, "components")).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => join(here, "components", f)),
    ...readdirSync(join(here, "pages")).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => join(here, "pages", f)),
  ];
  for (const file of files) {
    const head = readFileSync(file, "utf8").slice(0, 400);
    assert.match(head, /WHAT THIS FILE DOES/, `${file} lacks the header`);
  }
});

test("the About page's words avoid the banned phrases", () => {
  const copy = ABOUT_FILES.map((f) => read(f)).join("\n");
  const banned = /\b(unlock|unleash|supercharge|elevate|empower|streamline|seamless|effortless|robust|cutting-edge|next-generation|world-class|all-in-one)\b|Get started|Learn more|lorem/i; // taste-skill-ignore: the list being checked for
  assert.doesNotMatch(copy, banned);
  // The em dash is not a habit on this page.
  assert.ok((copy.match(/—/g) || []).length <= 2);
});

test("the proof table quotes its numbers from site.js", () => {
  const source = read("components", "ProofTable.jsx");
  for (const key of ["greeceFloodHa", "greeceFloodOfficial", "bulgariaFireHa", "bulgariaFireOfficial", "pakistanFloodHa", "pakistanFloodOfficial", "cropLikelyPercent", "cropHeldOutPercent", "acledEvents", "acledCorrelation", "mapePercent", "falseAlarmPercent", "falseAlarmMeanPercent"]) {
    assert.match(source, new RegExp(`NUMBERS\\.${key}\\b`), `${key} not read from NUMBERS`);
  }
  assert.doesNotMatch(source, /12151|8388|13554|109636/, "a number is typed in rather than read from site.js");
});

// A WebP picture's width and height, read from its header (lossy "VP8 ",
// lossless "VP8L" or extended "VP8X"), so no image library is needed.
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString("ascii", 0, 4) + b.toString("ascii", 8, 12), "RIFFWEBP", `${file} is a WebP`);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  throw new Error(`${file}: unknown WebP chunk ${chunk}`);
}

const CHALLENGE = ["Congress", "ional"].join("");
// The old demo wording, assembled for the same reason (a search for it finds none in src/).
const CODE_TALK = new RegExp(["with a", "access", "demo"].map((w) => `${w} code`).join("|"), "i");
const words = (source) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the website starts the pin's click assist; the app does not", () => {
  const shell = read("SiteShell.jsx");
  assert.match(shell, /import \{ startCursorAssist \} from "\.\/cursorAssist\.js"/);
  assert.match(shell, /useEffect\(\(\) => startCursorAssist\(\), \[\]\)/);
  const app = readFileSync(join(root, "src", "App.jsx"), "utf8");
  assert.doesNotMatch(app, /cursorAssist/);
  // Every rule that answers the pointer has the same look for the pin nearby.
  const nav = read("components", "nav.css");
  assert.match(nav, /\.sn-link\[data-near\]/);
  for (const selector of ["\\.btn\\[data-near\\]", "\\.btn-light\\[data-near\\]", "\\.link\\[data-near\\]"]) assert.match(SITE_CSS, new RegExp(selector));
});

test("the pin shows on every control: buttons, links, labels, menus, sliders and the demo's map", () => {
  const rule = SITE_CSS.match(/\.site :is\(([^)]*\([^)]*\)[^)]*)*[^)]*\)[^{]*\{[^}]*\}/);
  assert.ok(rule, "one rule for every control");
  for (const part of ["a", "button", '[role="button"]', "label", "summary", "select", 'input[type="range"]', 'input[type="radio"]', 'input[type="checkbox"]', 'input[type="submit"]']) {
    assert.ok(rule[0].includes(part), `${part} keeps the pin`);
  }
  assert.match(rule[0], /\.demo-unit path/);
  assert.match(rule[0], /cursor-pin\.png\) 11 10, pointer/);
});

test("no part of the website names the app challenge (the owner's rule since 31 October 2026)", () => {
  const home = read("pages", "HomePage.jsx");
  assert.equal(home.split(CHALLENGE).length - 1, 0, "not on the About page either");
  assert.doesNotMatch(home, /LINKS\.cac/);
  const others = [...readdirSync(join(here, "components")).map((f) => join("components", f)), "SiteShell.jsx", "hooks.js", "site.css", "cursorAssist.js", "pages/home.css"].filter((f) => /\.(jsx?|css)$/.test(f));
  for (const file of others) assert.ok(!read(file).includes(CHALLENGE), `${file} does not name it`);
  for (const file of ["pages/HomePage.jsx", "components/ScrollStory.jsx", "components/EarthGlobe.jsx"]) {
    assert.doesNotMatch(words(read(file)), CODE_TALK, `${file} mentions no code`);
  }
});

// Where a part of the About page's source starts (it must be there).
function at(text, part) {
  const index = text.indexOf(part);
  assert.ok(index >= 0, `${part} is on the page`);
  return index;
}

test("the About page runs in the owner's order: the slogan and the Earth, why, the two stories, the field row, the record, the demo, the close", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home);
  const order = ['id="hero-title"', 'id="why-title"', 'id="field-story"', 'id="atlas-story"', 'id="showcase-title"', 'id="proof-title"', 'id="demo-title"', 'id="close-title"'];
  for (let i = 1; i < order.length; i++) assert.ok(at(text, order[i - 1]) < at(text, order[i]), `${order[i - 1]} comes before ${order[i]}`);
  // The slogan is the page's one title, bold, in two set lines.
  assert.equal((text.match(/<h1\b/g) || []).length, 1, "one h1");
  const h1 = text.slice(at(text, "<h1"), at(text, "</h1>"));
  assert.match(h1, />\s*Drop your pin,\s*</);
  assert.match(h1, />\s*know your land\.\s*</);
  assert.match(read("pages", "home.css"), /\.site \.hero-title \{[^}]*font-weight: 800/);
  // Beside it, the Earth (being built in components/EarthGlobe.jsx); on the left what Chernozem is.
  assert.match(home, /^import EarthGlobe from "\.\.\/components\/EarthGlobe\.jsx";$/m);
  assert.ok(at(text, "<EarthGlobe") > at(text, 'className="hero-words"'), "the Earth sits after (beside) the words");
  for (const part of ["Chernozem reads free satellite data over farmland and puts it into plain words", "Field watches a farmer’s own fields", "Atlas scores whole regions for governments, NGOs and corporations", "black soil of Ukraine and northeast China"]) {
    assert.ok(text.includes(part), `the hero says: ${part}`);
  }
  // The section names.
  for (const name of ["Why Chernozem", "One field, one pass, one answer", "The demo is Ukraine", "See your land from space"]) assert.match(text, new RegExp(`>\\s*${name}\\s*<`), name);
  assert.match(text, /title="Field, for one farm"/);
  assert.match(text, /title="Atlas, for a whole region"/);
  // The owner's eight reasons stay, each a claim with one plain sentence, in honest words.
  const claims = ["No hardware, only software", "Free satellite data on Google Earth Engine", "It plans recovery, not only health", "For one farm or a whole country", "You choose what matters: the weights", "Drop a pin, see the field", "From satellite images to an answer in a few clicks", "All it needs is a place"];
  for (const claim of claims) assert.ok(text.includes(`claim: "${claim}"`), `the reason "${claim}"`);
  assert.equal((text.match(/\bclaim: "/g) || []).length, claims.length, "eight reasons, no more");
  assert.match(text, /Most tools/);
  assert.doesNotMatch(text, /competitor/i);
  assert.match(text, /NUMBERS\.tenFieldsSeconds/);
});

test("every way to register says Register for Chernozem and goes to /register (never Register for Field or for Atlas)", () => {
  const home = read("pages", "HomePage.jsx");
  const buttons = [...home.matchAll(/<Link to=\{([^}]+)\} className="btn[^"]*">\s*Register for Chernozem\s*<\/Link>/g)];
  assert.equal(buttons.length, 2, "the hero's and the close's");
  for (const [, to] of buttons) assert.equal(to, "SITE.registerPath");
  assert.match(read("content", "site.js"), /registerPath: "\/register",/);
  for (const dir of ["pages", "components"]) {
    for (const name of readdirSync(join(here, dir)).filter((f) => /\.jsx?$/.test(f) && !f.endsWith(".test.js"))) {
      assert.doesNotMatch(read(dir, name), /Register for (Field|Atlas)\b/, `${dir}/${name} says Register for Chernozem`);
    }
  }
});

test("the two stories hold still and slide one whole step at a time, 4 to 6 steps each, with pictures that exist, stay small and have a sharp copy", () => {
  const home = read("pages", "HomePage.jsx");
  const story = read("components", "ScrollStory.jsx");
  const css = read("components", "scrollstory.css");
  // Two stories, Field first, each with its steps and a way into the demo.
  assert.match(home, /<ScrollStory id="field-story"[^>]*steps=\{FIELD_STEPS\} \/>\s*<ScrollStory id="atlas-story"[^>]*steps=\{ATLAS_STEPS\} surface \/>/);
  const crops = join(root, "public", "site", "shots", "crops");
  const manifest = JSON.parse(readFileSync(join(crops, "manifest.json"), "utf8"));
  for (const [name, first] of [["FIELD_STEPS", "Field is Chernozem for one farm"], ["ATLAS_STEPS", "Atlas is Chernozem for a whole region, for governments, NGOs and corporations"]]) {
    const list = home.slice(at(home, `const ${name} = [`), home.indexOf("];", at(home, `const ${name} = [`)));
    const steps = [...list.matchAll(/\{\s*title: "([^"]+)",\s*text: "([^"]+)",\s*shot: "([a-z-]+)",\s*alt: "([^"]+)",\s*fx: "(\d+)%",\s*fy: "(\d+)%",\s*(?:tx: "\d+%",\s*)?\}/g)];
    assert.ok(steps.length >= 4 && steps.length <= 6, `${name} has ${steps.length} steps (4 to 6)`);
    assert.equal((list.match(/\btitle: /g) || []).length, steps.length, `every step of ${name} has its title, text, picture, words for it and focus`);
    assert.ok(steps[0][2].startsWith(first), `${name} starts by saying what it is: ${first}`);
    for (const [, title, text, shot, alt, fx, fy] of steps) {
      assert.ok(title.length <= 34, `"${title}" is a short title`);
      assert.ok(text.split(/(?<=[.:])\s/).filter((part) => /\.$/.test(part)).length <= 3 && text.length <= 200, `"${title}": one or two plain sentences`);
      assert.ok(alt.length > 40, `"${title}": the picture is described`);
      assert.ok(Number(fx) <= 100 && Number(fy) <= 100);
      for (const [px, max] of [[800, 90e3], [1600, 160e3]]) {
        const file = `${shot}-${px}.webp`;
        const bytes = statSync(join(crops, file)).size;
        assert.ok(bytes > 1000 && bytes <= max, `${file} is ${bytes} bytes (at most ${max})`);
        assert.deepEqual(webpSize(join(crops, file)), [px, px * 0.625], `${file} is ${px} x ${px * 0.625}`);
        assert.ok(manifest.some((entry) => entry.file === file && entry.view && entry.shot), `${file} is in the crops' manifest with where and how it was shot`);
      }
    }
  }
  // Each picture at its true size: the 800 copy, the sharp one only on sharp screens.
  assert.match(story, /srcSet=\{`\$\{crop\(step\.shot, 800\)\} 1x, \$\{crop\(step\.shot, 1600\)\} 2x`\}/);
  assert.match(css, /\.site \.story-picture img \{[^}]*object-fit: none;[^}]*object-position: var\(--tx, 50%\) 0%/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*\.site \.story-picture img \{\s*object-position: var\(--fx, 50%\) var\(--fy, 50%\)/);
  // Held by CSS sticky, the section as tall as its steps need, the row moved a whole step at a time.
  assert.match(css, /\.site \.story\.is-held \{[^}]*height: calc\(100svh \+ var\(--story-steps\) \* 60svh\)/);
  assert.match(css, /\.site \.story\.is-held \.story-stage \{[^}]*position: sticky;[^}]*top: 0;[^}]*height: 100svh;[^}]*overflow: clip/);
  assert.match(css, /\.site \.story\.is-held \.story-track \{[^}]*transform: translateX\(calc\(var\(--story-at, 0\) \* -100%\)\);[^}]*transition: transform/);
  assert.match(story, /useScroll\(\{ target: ref, offset: \["start start", "end end"\] \}\)/);
  assert.match(read("components", "scrollStoryMath.js"), /Math\.floor\(p \* count\)/, "each step an equal share of the hold");
  assert.match(story, /import \{ entryTarget, listStepAt, listTarget, nearlyHeld, pageTarget, shareMiddle, stepAt \} from "\.\/scrollStoryMath\.js";/);
  assert.match(story, /\{current \+ 1\} of \{count\}/, "a plain count, step n of m");
  // Reduced motion (and a screen too short to hold a step): the plain list, nothing held or moved.
  assert.match(story, /useMediaQuery\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(story, /const held = !reduced && !short;/);
  assert.match(story, /\$\{held \? " is-held" : ""\}`\}/);
  assert.doesNotMatch(css.replace(/\.site \.story\.is-held[^{]*\{[^}]*\}/g, ""), /position: sticky|translateX/, "only the held layout sticks or slides");
  // The steps wait off to the right, so their pictures are fetched once the section is near.
  assert.match(story, /useNear\("1500px 0px"\)/);
  assert.match(story, /loading=\{near \? "eager" : "lazy"\}/);
});

test("a story's arithmetic: each step an equal share of the hold, and a page key moves exactly one step", () => {
  // Five steps: 0 to 0.2 is the first, 0.8 to 1 (and past it) the last.
  assert.deepEqual([0, 0.19, 0.2, 0.5, 0.79, 0.8, 1, 1.4, -0.3, NaN].map((p) => stepAt(p, 5)), [0, 0, 1, 2, 3, 4, 4, 4, 0, 0]);
  // A 1440 x 900 window: the section is 900 + 5 x 540 = 3600 px tall, 2700 px of hold, 540 a step.
  const story = { top: 2000, height: 3600, screen: 900, count: 5 };
  assert.equal(pageTarget({ ...story, step: 0, down: true }), 2000 + 810, "Page Down from the first step: the middle of the second's share");
  assert.equal(pageTarget({ ...story, step: 3, down: true }), 2000 + 2430);
  assert.equal(pageTarget({ ...story, step: 2, down: false }), 2000 + 810, "Page Up goes back one");
  assert.equal(pageTarget({ ...story, step: 4, down: true }), null, "past the last step the page scrolls on as usual");
  assert.equal(pageTarget({ ...story, step: 0, down: false }), null, "and before the first");
  // Every press from anywhere in a step's share lands in the next step's share, never further.
  for (let step = 0; step < 4; step++) {
    const target = pageTarget({ ...story, step, down: true });
    assert.equal(stepAt((target - story.top) / (story.height - story.screen), 5), step + 1);
  }
  assert.equal(pageTarget({ ...story, height: 900, step: 0, down: true }), null, "no hold, nothing to do");
  // The keys are helped while the story holds the screen and on the press that brings it in; never in a
  // form, on a button, a film, an open dialog or with the phone menu open.
  const component = read("components", "ScrollStory.jsx");
  assert.match(component, /\} else if \(box\.top <= 1 && box\.bottom >= screen - 1\) \{\s*from = stepAt\(-box\.top \/ \(box\.height - screen\), count\);\s*top = pageTarget\(\{ \.\.\.story, step: from, down \}\);/);
  assert.match(component, /top = entryTarget\(\{ \.\.\.story, scrollY: window\.scrollY, down \}\);/);
  assert.match(component, /if \(document\.documentElement\.hasAttribute\("data-menu"\)\) return;/);
  for (const own of ["input", "textarea", "select", "button", "[contenteditable]", "video", "[role='dialog']"]) assert.ok(component.includes(own), `a key on ${own} does its own work`);
  assert.doesNotMatch(component, /addEventListener\("wheel"|addEventListener\("touch/, "the wheel and a finger are never captured");
});

// Page Down (or Space) pressed again and again from the top of the About page to its end, then Page Up
// (or Shift+Space) back to the top, as a browser does it: each story's key handler in turn
// (ScrollStory.jsx: pageTarget while it holds the screen, entryTarget otherwise), the first answer
// wins; with no answer the browser's own page step, the window's height less 40 px (Chrome's). The
// stories' places are those of the real page at each window size (the section's top on the page; each
// is as tall as the screen plus 0.6 of a screen per step). Answers the steps the page comes to rest on.
function pressThrough({ screen, field, end, entering = true }) {
  const count = 5;
  const height = screen + count * 0.6 * screen;
  const stories = [
    { name: "F", top: field },
    { name: "A", top: field + height },
  ];
  const press = (y, down) => {
    for (const { top } of stories) {
      const story = { top, height, screen, count };
      const boxTop = top - y;
      const target =
        boxTop <= 1 && boxTop + height >= screen - 1
          ? pageTarget({ ...story, step: stepAt(-boxTop / (height - screen), count), down })
          : entering
            ? entryTarget({ ...story, scrollY: y, down })
            : null;
      if (target !== null) return target;
    }
    return Math.min(end, Math.max(0, y + (down ? 1 : -1) * (screen - 40)));
  };
  const restsOn = (y) => {
    for (const { name, top } of stories) {
      const boxTop = top - y;
      if (boxTop <= 0 && boxTop + height >= screen) return `${name}${stepAt(-boxTop / (height - screen), count) + 1}`;
    }
    return null;
  };
  const run = (from, down) => {
    const rests = [];
    let y = from;
    for (let i = 0; i < 100; i++) {
      const next = press(y, down);
      if (next === y) break;
      y = next;
      const on = restsOn(y);
      if (on) rests.push(on);
    }
    return { rests, at: y };
  };
  const downward = run(0, true);
  const upward = run(downward.at, false);
  return { down: downward.rests.join(","), up: upward.rests.join(","), end: downward.at, top: upward.at };
}

test("the page keys rest on every step of both stories, in order, from the top of the page to its end and back", () => {
  const ALL_DOWN = "F1,F2,F3,F4,F5,A1,A2,A3,A4,A5";
  const ALL_UP = "A5,A4,A3,A2,A1,F5,F4,F3,F2,F1";
  // The window sizes the checker pressed through (1 November 2026), with the Field story's top and the
  // page's end as measured on the built page.
  const sizes = [
    { size: "1440x900", screen: 900, field: 2070, end: 11519 },
    { size: "1920x1080", screen: 1080, field: 2357, end: 13371 },
    { size: "1536x864", screen: 864, field: 2028, end: 11274 },
    { size: "1366x768", screen: 768, field: 2071, end: 10506 },
    { size: "1280x720", screen: 720, field: 2039, end: 10083 },
    { size: "768x1024", screen: 1024, field: 2844, end: 13730 },
    { size: "390x844", screen: 844, field: 3191, end: 12921 },
  ];
  for (const { size, ...page } of sizes) {
    const keys = pressThrough(page);
    assert.equal(keys.down, ALL_DOWN, `${size}: going down, every step rests in order`);
    assert.equal(keys.up, ALL_UP, `${size}: going back up, every step rests in order`);
    assert.equal(keys.end, page.end, `${size}: the keys reach the end of the page`);
    assert.equal(keys.top, 0, `${size}: and the top again`);
  }
  // Without the help for the press that brings a story in, the browser's page step skips a step
  // at these sizes (what the checker found: Atlas's first, Field's last going up).
  assert.notEqual(pressThrough({ ...sizes[0], entering: false }).down, ALL_DOWN);
  assert.notEqual(pressThrough({ ...sizes[0], entering: false }).up, ALL_UP);
  assert.notEqual(pressThrough({ ...sizes[1], entering: false }).down, ALL_DOWN);

  // entryTarget on its own. A 1440 x 900 window: the section is 3,600 px tall, 2,700 px of hold, 540 a step.
  const story = { top: 2000, height: 3600, screen: 900, count: 5 };
  assert.equal(entryTarget({ ...story, scrollY: 1500, down: true }), 2000 + 270, "its top on the screen, going down: the middle of the first step's share");
  assert.equal(entryTarget({ ...story, scrollY: 1100, down: true }), 2270, "its top at the foot of the screen");
  assert.equal(entryTarget({ ...story, scrollY: 1099, down: true }), null, "its top still below the screen: the browser's step cannot pass the first share");
  assert.equal(entryTarget({ ...story, scrollY: 1999, down: true }), null, "within a pixel of holding the screen: pageTarget's press");
  assert.equal(entryTarget({ ...story, scrollY: 5100, down: false }), 2000 + 2430, "its foot on the screen, going up: the middle of the last step's share");
  assert.equal(entryTarget({ ...story, scrollY: 5600, down: false }), 4430, "its foot at the top of the screen");
  assert.equal(entryTarget({ ...story, scrollY: 5601, down: false }), null, "its foot above the screen");
  assert.equal(entryTarget({ ...story, scrollY: 4701, down: false }), null, "within a pixel of holding the screen");
  assert.equal(entryTarget({ ...story, scrollY: 5100, down: true }), null, "going down past its foot: the page scrolls on");
  assert.equal(entryTarget({ ...story, scrollY: 1500, down: false }), null, "going up away from its top: the page scrolls on");
  assert.equal(entryTarget({ ...story, height: 900, scrollY: 1500, down: true }), null, "no hold, nothing to do");
  for (let scrollY = 1100; scrollY < 2000; scrollY += 37) assert.equal(stepAt((entryTarget({ ...story, scrollY, down: true }) - story.top) / 2700, 5), 0, "always the first step");
  for (let scrollY = 4702; scrollY <= 5600; scrollY += 37) assert.equal(stepAt((entryTarget({ ...story, scrollY, down: false }) - story.top) / 2700, 5), 4, "always the last step");

  // Almost holding the screen (a link to #field-story stops it 24 px down): a page key goes on to the next step.
  for (const gap of [2, 24, 120]) {
    assert.equal(nearlyHeld({ ...story, scrollY: 2000 - gap, down: true }), true, `${gap} px below the top, going down`);
    assert.equal(nearlyHeld({ ...story, scrollY: 4700 + gap, down: false }), true, `${gap} px above the foot, going up`);
  }
  assert.equal(nearlyHeld({ ...story, scrollY: 2000 - 200, down: true }), false, "further down: the entering press");
  assert.equal(nearlyHeld({ ...story, scrollY: 1999.5, down: true }), false, "within a pixel: it holds the screen");
  assert.equal(nearlyHeld({ ...story, height: 900, scrollY: 1990, down: true }), false, "no hold, nothing to do");
  assert.equal(pageTarget({ ...story, step: 0, down: true }), shareMiddle({ ...story, step: 1 }), "from the first step to the second");
});

test("a story keeps the visitor's step through a resize, a turned phone or reduced motion switched on or off", () => {
  // Held: a step rests in the middle of its share (where pageTarget sends a key press too).
  const story = { top: 2000, height: 3600, screen: 900, count: 5 };
  assert.deepEqual([0, 1, 2, 3, 4].map((step) => shareMiddle({ ...story, step })), [2270, 2810, 3350, 3890, 4430]);
  for (let step = 0; step < 5; step++) assert.equal(stepAt((shareMiddle({ ...story, step }) - story.top) / 2700, 5), step);
  assert.equal(shareMiddle({ ...story, height: 900, step: 0 }), null, "no hold");
  // The plain list: the step at the middle line of the screen, and where the page rests to show one.
  assert.equal(listStepAt([-1030, -415, 200, 815, 1430], 450), 2);
  assert.equal(listStepAt([500, 1100, 1700], 450), 0, "above the first step: the first");
  assert.equal(listStepAt([-2000, -1400, -800, -200, 400], 450), 4);
  assert.equal(listTarget({ stepTop: 8000, stepHeight: 500, screen: 900 }), 7800, "a step shorter than the screen in its middle");
  assert.equal(listTarget({ stepTop: 8000, stepHeight: 700, screen: 390 }), 8000, "a taller one from its top");
  // There and back: the step put on the screen is the step read there.
  const tops = [7000, 7615, 8230, 8845, 9460];
  for (const [stepHeight, screen] of [[500, 900], [700, 390], [520, 844]]) {
    for (let step = 0; step < 5; step++) {
      const y = listTarget({ stepTop: tops[step], stepHeight, screen });
      assert.equal(listStepAt(tops.map((top) => top - y), screen / 2), step, `step ${step + 1} in a ${screen} px window`);
    }
  }
  // The component notes the step as the page scrolls, puts it back after a real change of size (its
  // width or the stage's height: a phone's bar coming and going is neither) and when the story changes
  // between held and the list, and holds the note while the page settles.
  const component = read("components", "ScrollStory.jsx");
  assert.match(component, /window\.addEventListener\("scroll", note, \{ passive: true \}\);/);
  assert.match(component, /window\.addEventListener\("resize", onResize\);/);
  assert.match(component, /const sizeOf = \(\) => `\$\{document\.documentElement\.clientWidth\} \$\{el\.offsetHeight\}`;/);
  assert.match(component, /if \(now === size\.current\) return;/);
  assert.match(component, /if \(performance\.now\(\) < settling\.current\) return;/);
  assert.match(component, /useLayoutEffect\(\(\) => \{\s*if \(wasHeld\.current === held\) return;/);
  assert.match(component, /putBack\(el, count, step\);\s*\}, \[held, count, ref\]\);/);
  // The browser's scroll anchoring leaves the held stage's parts alone (they stay still while the page
  // moves), and under reduced motion the section has no transition, so its padding arrives at once.
  const css = read("components", "scrollstory.css");
  assert.match(css, /\.site \.story\.is-held \.story-stage \{[^}]*overflow-anchor: none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.site \.story,\s*\.site \.story-stage,\s*\.site \.story-track,\s*\.site \.story-words \{\s*transition: none;/);
  // A short window up to 900 px wide (540 to 590 px tall) still shows 170 px of each picture.
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.site \.story\.is-held \.story-picture \{\s*height: clamp\(170px, calc\(100svh - 420px\), 500px\);/);
});

test("Atlas's first picture keeps its figure whole on every phone", () => {
  // On a phone the picture's window is the screen less its two 16 px margins, and its fx says where it
  // sits in the 800 px crop: from (800 - window) x fx. In story-atlas-overview-800.webp (measured) the
  // heavily damaged land's card has its words from x 423 to 542 ("1.8M ha" from 424 to 525), and the
  // words of the card before it end at x 327.
  const home = read("pages", "HomePage.jsx");
  const fx = Number(home.match(/shot: "story-atlas-overview",[\s\S]*?fx: "(\d+)%"/)[1]) / 100;
  for (let width = 320; width <= 430; width++) {
    const windowWidth = width - 32;
    const left = (800 - windowWidth) * fx;
    assert.ok(left < 423 && left + windowWidth > 542, `${width} px: the card's words whole (the window from x ${left.toFixed(1)})`);
    assert.ok(left > 327, `${width} px: none of the card before it`);
  }
});

test("the photograph beside Why Chernozem exists, stays small, and is credited under it with its author, licence and source", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home).replace(/\s+/g, " ");
  const photos = join(root, "public", "site", "photos");
  for (const [file, size, max] of [["karasivka-wheat-600.webp", [600, 750], 100e3], ["karasivka-wheat-768.webp", [768, 960], 160e3]]) {
    const bytes = statSync(join(photos, file)).size;
    assert.ok(bytes > 10e3 && bytes <= max, `${file} is ${bytes} bytes (at most ${max})`);
    assert.deepEqual(webpSize(join(photos, file)), size, `${file} is ${size.join(" x ")}`);
    assert.ok(home.includes(`/site/photos/${file}`), `the page uses ${file}`);
  }
  assert.match(home, /srcSet=\{`\$\{PHOTO\.small\} 600w, \$\{PHOTO\.large\} 768w`\}/);
  assert.match(home, /width="600"\s+height="750"/);
  // The credit: what it is, the author (with the site its licence box names: "Attribution:
  // Kharkivoda.gov.ua"), the licence (linked, and that it was cropped), the source (linked).
  assert.match(text, /<figcaption className="window-caption muted photo-caption"> Wheat near Karasivka, Kharkiv region, after shelling on 1 July 2024\. Photo: Kharkiv Regional State Administration \(kharkivoda\.gov\.ua\),/);
  assert.match(text, /CC BY 4\.0 <\/a> , cropped;/);
  assert.match(home, /licence: "https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"/);
  assert.match(home, /source: "https:\/\/commons\.wikimedia\.org\/wiki\/File:Burning_field_near_Karasivka,_2024-07-01_\(11\)\.jpg"/);
  assert.match(home, /<a href=\{PHOTO\.licence\} \{\.\.\.out\}>/);
  assert.match(home, /<a href=\{PHOTO\.source\} \{\.\.\.out\}>/);
  const manifest = JSON.parse(readFileSync(join(photos, "manifest.json"), "utf8"));
  const entry = manifest.find((e) => e.files.includes("karasivka-wheat-600.webp"));
  assert.ok(entry && entry.licence === "CC BY 4.0" && entry.author && /cropped/i.test(entry.changes) && entry.source.startsWith("https://commons.wikimedia.org/"), "the photographs' manifest records its author, licence, source and change");
  assert.ok(text.includes(`Photo: ${entry.author},`), "the caption credits the author the manifest names");
  // It replaces the weights picture beside the reasons.
  assert.doesNotMatch(home, /crops\/atlas-weights-/);
  assert.match(read("pages", "home.css"), /\.site \.why-photo \{[^}]*grid-column: 8 \/ 13;[^}]*grid-row: 1 \/ 3/);
});

test("what the owner had removed stays removed, and the page prints no demo code and no count of the demo farm's fields", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home);
  for (const gone of ["Field reads every satellite pass", "What is Chernozem", "What a farmer gets", "For governments and NGOs", "A letter from the founder", "Chernozem in three minutes", "Your land,", "seen from space"]) {
    assert.ok(!text.includes(gone), `no "${gone}" on the About page`);
  }
  for (const part of ["WorldGlobe", "GlobeCredits", "<Film", "<Letter", "StageSlider", "FeatureIndex", "crops/atlas-weights-", "crops/field-fields-map-"]) assert.ok(!home.includes(part), `no ${part} on the About page`);
  for (const file of ["Letter.jsx", "StageSlider.jsx"]) assert.ok(!existsSync(join(here, "components", file)), `components/${file} is gone`);
  const css = read("pages", "home.css");
  for (const style of ["letter", "stages-", "findex", "what-window", "why-window", "film-head", "feature-"]) assert.ok(!css.includes(`.${style}`), `home.css has no .${style} styles left`);
  for (const source of [text, words(read("components", "ScrollStory.jsx"))]) {
    assert.doesNotMatch(source, /\b(12|13|twelve|thirteen) fields\b/i, "the farm's field count is never printed");
    assert.doesNotMatch(source, CODE_TALK);
  }
});

test("the field row is one live row, and the phone menu tells the page it is open", () => {
  const row = words(read("components", "FieldRowStates.jsx"));
  for (const gone of [">Open<", ">Ask<", ">Export<"]) assert.ok(!row.replace(/\s+/g, "").includes(gone), `the row no longer has ${gone}`);
  assert.match(row, /aria-pressed/);
  assert.match(row, /Read it again/);
  assert.match(read("components", "Nav.jsx"), /setAttribute\("data-menu", "open"\)/);
});

test("the menu offers Sign in, and a signed-in visitor's own button, asked once without the demo's header", () => {
  const nav = read("components", "Nav.jsx");
  assert.match(nav, /SITE_ACTIONS\.signin/);
  assert.match(nav, /fetch\("\/api\/auth\/status"/);
  assert.doesNotMatch(nav, /demoHeaders|X-Chernozem-View/, "the status is asked about this browser's own sign-in");
  for (const label of ["Open Field", "Open Atlas", "Open the demo"]) assert.ok(nav.includes(`"${label}"`), label);
  assert.match(nav, /leaveDemo/);
  assert.match(read("components", "nav.css"), /\.sn-signin/);
});

test("the footer has no middle-dot strings and calls the Dataverse package Data and code", () => {
  const footer = words(read("components", "Footer.jsx"));
  assert.ok(!footer.includes("·"), "no middle dot");
  assert.match(footer, />\s*Data and code\s*</);
  assert.doesNotMatch(footer, />\s*Paper\s*</);
});

test("page changes are quick: a short fade out, and a page's code fetched when its link is pointed at", () => {
  const shell = read("SiteShell.jsx");
  const exit = shell.match(/exit=\{[^}]*duration: ([\d.]+)/);
  assert.ok(exit && Number(exit[1]) <= 0.15, "the old page fades out in 150 ms at most");
  assert.match(shell, /addEventListener\("pointerover"/);
  assert.match(shell, /addEventListener\("focusin"/);
  // The warming fetches through the one list of pages (src/lazyPages.js),
  // the same files App.jsx draws, so a page warmed here is simply ready
  // when it is opened; src/lib/lazyPage.test.js checks that list against
  // App.jsx's routes.
  assert.match(shell, /import \{ preloadFor \} from "\.\.\/lazyPages\.js"/);
  assert.match(shell, /preload\(path\)/);
  assert.doesNotMatch(shell, /=> import\("\.\/pages\//, "no second list of the pages' files");
  const app = readFileSync(join(root, "src", "App.jsx"), "utf8");
  assert.match(app, /from "\.\/lazyPages\.js"/);
  assert.doesNotMatch(app, /\blazy\(\(\) => import/, "App.jsx takes its pages from lazyPages.js, not React's lazy()");
  // The first page of a visit is fetched before anything is drawn.
  const main = readFileSync(join(root, "src", "main.jsx"), "utf8");
  assert.match(main, /preloadFor\(window\.location\.pathname\)/);
});

test("useNear counts an element within its margin, or already above the screen, as near", () => {
  const entry = (isIntersecting, bottom) => ({ isIntersecting, boundingClientRect: { bottom } });
  assert.equal(isNear(entry(true, 300)), true, "within the margin");
  assert.equal(isNear(entry(false, 5000)), false, "still below the screen, beyond the margin");
  assert.equal(isNear(entry(false, -2600)), true, "already above the screen (the page came back scrolled past it)");
  assert.equal(isNear(entry(false, 0)), false, "an element with no box yet");
  assert.match(read("hooks.js"), /if \(entries\.some\(isNear\)\) \{/);
});

test("the About page's small print credits only what it still shows: the maps in the pictures of the app and the satellite view", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home).replace(/\s+/g, " ");
  for (const part of ["Esri World Imagery (Esri, Maxar, Earthstar Geographics)", "Esri’s light grey canvas (Esri, HERE, Garmin, © OpenStreetMap contributors)", "The satellite view above: Esri World Imagery."]) {
    assert.ok(text.includes(part), `the small print says ${part}`);
  }
  // The globe's own sources are in its component now, not in the page's small print.
  for (const gone of ["OpenLandMap", "Copernicus Global Land Service", "this Earth texture"]) assert.ok(!text.includes(gone), `no ${gone} in the page's small print`);
});

test("every crop the crops' manifest lists exists, with the view it was cut from", () => {
  const shots = join(root, "public", "site", "shots");
  const manifest = JSON.parse(readFileSync(join(shots, "crops", "manifest.json"), "utf8"));
  for (const entry of manifest) {
    assert.ok(existsSync(join(shots, "crops", entry.file)), `${entry.file} exists`);
    assert.ok((entry.from && existsSync(join(shots, entry.from))) || (typeof entry.view === "string" && entry.view.startsWith("/")), `${entry.file} names the screenshot or the app's address it was cut from`);
  }
  // Nothing in crops/ that the manifest does not explain.
  for (const file of readdirSync(join(shots, "crops")).filter((f) => f.endsWith(".webp"))) assert.ok(manifest.some((entry) => entry.file === file), `${file} is in the manifest`);
});

test("the About page builds the Ukraine demo only near the end of the page, and closes without an empty block or the app's buttons", () => {
  const home = read("pages", "HomePage.jsx");
  assert.match(home, /lazy\(\(\) => import\("\.\.\/components\/DemoRanking\.jsx"\)\)/);
  assert.doesNotMatch(home, /^import DemoRanking/m);
  // The page's last three parts reveal together, and the demo is built,
  // once the field row is near, so a long page never leaves their words
  // hidden to a fast scroll or a scan; and once the close is near, so a
  // visitor who lands at the very end (Back from Register, a jump to the
  // end: the field row is then more than 2,400 px above a phone's screen)
  // finds them shown.
  assert.match(home, /const \[tailRef, tailNear\] = useNear\("2400px 0px"\);/);
  assert.match(home, /const \[closeRef, closeNear\] = useNear\("2400px 0px"\);\s*const near = tailNear \|\| closeNear;\s*const tail = near \? " is-in" : "";/);
  assert.match(home, /\{near && \(/);
  assert.match(home, /reveal\(node\);\s*tailRef\.current = node;/);
  assert.match(home, /className="showcase section" aria-labelledby="showcase-title" ref=\{showcaseRef\}/);
  assert.match(home, /<section className=\{`close\$\{tail\}`\} aria-labelledby="close-title" ref=\{closeRef\}>/);
  for (const part of ["proof section${tail}", "demo-section on-sage section${tail}", "close${tail}"]) assert.ok(home.includes(part), `${part} reveals with the tail`);
  // The demo's place keeps its height while it waits, while its code arrives (the stage empty) and while
  // its data loads, so the end of the page does not move under a visitor who came back to it.
  const css = read("pages", "home.css");
  assert.equal((css.match(/\.site \.demo-stage:is\(\.is-waiting, :empty, :has\(> \.demo\.is-loading\)\) \{\s*min-height: /g) || []).length, 3, "on a wide screen, up to 900 px and up to 860 px");
  assert.doesNotMatch(home, /close-tile-sage/, "no empty sage tile");
  assert.match(home, /\/site\/shots\/crops\/atlas-map-satellite-sea\.webp/, "the map alone, cut below the app's buttons");
  assert.ok(existsSync(join(root, "public", "site", "shots", "crops", "atlas-map-satellite-sea.webp")));
});

test("every About section keeps to the menu's frame, and the title is the page's largest heading", () => {
  assert.match(SITE_CSS, /--frame-inset: max\(var\(--margin\), calc\(\(100cqi - 1760px\) \/ 2 \+ var\(--margin\)\)\)/);
  const css = read("pages", "home.css");
  assert.match(css, /\.close-tile-main \{[^}]*padding: 48px var\(--gutter\) 48px var\(--frame-inset\)/);
  // The two stories keep to it too: their words and pictures sit inside the page's wrap.
  assert.match(read("components", "ScrollStory.jsx"), /className="wrap story-head"[\s\S]*className="wrap story-panel"/);
  // Title: at most 4.8rem; the page's display heading at most 4.5rem, its section heads 4rem.
  assert.match(css, /\.site \.hero-title \{\s*font-size: clamp\(2\.5rem, 5\.4vw, 4\.8rem\)/);
  assert.match(css, /\.site \.hero-title \{\s*font-size: min\(4\.8rem, calc\(\(100vw - 2 \* var\(--margin\)\) \/ 8\.2\)\)/);
  assert.match(css, /\.site \.display\.proof-head \{\s*font-size: clamp\(2rem, 0\.5rem \+ 4\.4vw, 4\.5rem\)/);
  assert.match(SITE_CSS, /--step-head: clamp\(2rem, 1\.3rem \+ 3\.2vw, 4rem\)/);
  // The links on the light grounds answer the pointer and the pin with the accent; on the green tile the underline answers.
  assert.match(css, /\.site :is\(\.hero, \.why, \.small-print\) \.link-under:hover \{[^}]*color: var\(--accent\);[^}]*text-decoration-line: underline/);
  assert.match(css, /\.site :is\(\.hero, \.why, \.small-print\) \.link-under\[data-near\] \{[^}]*color: var\(--accent\)/);
  assert.match(css, /\.site \.close-actions \.link:hover \{[^}]*text-decoration-line: underline/);
  assert.match(css, /\.site \.window-caption \.link \{[^}]*white-space: nowrap/);
});
