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
//     footer has no middle-dot strings and no longer links GitHub or
//     "Data and code" (removed at the owner's request, 6 November 2026);
//   - page changes are quick (a short fade, the next page's code fetched
//     when its link is pointed at);
//   - the About page, in the owner's order: the slogan "Drop your pin,
//     know your land." as its bold title beside the new Earth (and the
//     slot where it opens a dot's card), the problem under it and the bold
//     line that answers it, "What is Chernozem", Why Chernozem as eight
//     bullets beside a credited photograph, the Field and Atlas sideways
//     stories, "One field, one pass, one answer", the record, the Ukraine
//     demo, the close and the disclaimer; "Register for Chernozem"
//     everywhere (never "Register for Field" or "for Atlas");
//   - the two stories are held with CSS sticky for one share of scroll per
//     step, with half a share before the first step and after the last,
//     and move sideways with the scroll (how they move, their progress
//     row, hint and settling: components/scrollStory.test.js),
//     have 4 to 6 steps each with a picture of the app that exists, stays
//     small and has a sharp copy, and fall back to a plain list for
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
//   - "What is Chernozem" is back right after the hero, as on 1 November
//     2026 (its first sentence now bold), beside the owner's picture of
//     Field and Atlas (3 November 2026), whose two copies exist and are in
//     the shots' manifest; the picture is shown whole, never wider than
//     560 px, beside the words or under them, and the heading keeps clear
//     of it (the old window onto the Fields page and its crops are gone);
//   - the photograph exists in two small copies (1x and 2x), is never
//     shown wider than its 600 px, beside the reasons (after them on a
//     tablet, before them on a phone), and is credited under it as the
//     article that published it prints it, with a link to the article;
//     the photographs' manifest says where it came from;
//   - words that belong together never part at a line's end ("Google
//     Earth Engine", "about 20 seconds", "Camera 51", each reason's last
//     two words: no-break spaces, written as an escape);
//   - the page's text links are targets of 32 px or more whose focus
//     rings sit 2 to 3 px round the words;
//   - the disclaimer sits under the close, above the small print, at a
//     readable size and the small print's measure, its figure read from
//     site.js;
//   - what the owner had removed stays removed (the old hero sentences,
//     the weights picture, the slider, the feature lists, the film, the
//     founder's letter, the WebGL globe on this page, the earlier photos);
//   - no part of the website names the app challenge (the owner's rule
//     since 31 October 2026), and no part of the About page mentions a
//     demo code or prints how many fields the demo farm has (nor do the
//     public manifests that describe the site's pictures);
//   - the field row is one live row; the demo is built only when near, and
//     the field row, the record, the demo and the close show at once for a
//     visitor who lands at the end of the page (Back from Register, a jump
//     to the end) or a tool that scans it, with the demo's place kept at
//     its height while it loads; useNear counts an element already above
//     the screen as near.
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
import { entryTarget, holdFor, listStepAt, listTarget, nearlyHeld, pageTarget, shareMiddle, spanOf, stepAt } from "./components/scrollStoryMath.js";
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
  // stories' --story-steps, a picture's --fx and --fy).
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

// The About page's words as a visitor reads them: its no-break spaces
// (NBSP and EARTH_ENGINE in HomePage.jsx: "Google Earth Engine", "about 20
// seconds", "Camera 51") as plain ones, its {earthEngine} hole filled, its
// template strings as quoted ones.
const spoken = (source) => source.replaceAll("${EARTH_ENGINE}", "Google Earth Engine").replaceAll("{earthEngine}", "Google Earth Engine").replaceAll("${NBSP}", " ").replaceAll("{NBSP}", " ").replace(/`/g, '"');

test("the About page runs in the owner's order: the slogan and the Earth, what it is, why, the two stories, the field row, the record, the demo, the close, the disclaimer", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home);
  const order = ['id="hero-title"', 'id="what-title"', 'id="why-title"', 'id="field-story"', 'id="atlas-story"', 'id="showcase-title"', 'id="proof-title"', 'id="demo-title"', 'id="close-title"', 'className="caveat"', 'className="small-print"'];
  for (let i = 1; i < order.length; i++) assert.ok(at(text, order[i - 1]) < at(text, order[i]), `${order[i - 1]} comes before ${order[i]}`);
  // The slogan is the page's one title, bold, in two set lines.
  assert.equal((text.match(/<h1\b/g) || []).length, 1, "one h1");
  const h1 = text.slice(at(text, "<h1"), at(text, "</h1>"));
  assert.match(h1, />\s*\{t\("Drop your pin,"\)\}\s*</);
  assert.match(h1, />\s*\{t\("know your land\."\)\}\s*</);
  const css = read("pages", "home.css");
  assert.match(css, /\.site \.hero-title \{[^}]*font-weight: 800/);
  // Beside it, the Earth (components/EarthGlobe.jsx), and the slot beside it where the Earth opens a dot's card.
  assert.match(home, /^import EarthGlobe from "\.\.\/components\/EarthGlobe\.jsx";$/m);
  assert.ok(at(text, "<EarthGlobe") > at(text, 'className="hero-words"'), "the Earth sits after (beside) the words");
  assert.match(home, /<div className="hero-side" ref=\{side\} \/>\s*<div className="hero-earth">\s*<EarthGlobe side=\{side\} \/>/);
  // Under the slogan, the problem; then, in bold, its own line, a step larger, what Chernozem does about it.
  const hero = text.slice(at(text, 'className="hero-words"'), at(text, 'className="hero-side"')).replace(/\s+/g, " ");
  assert.match(hero, /<p className="hero-lead"[^>]*> \{t\("As geopolitical and environmental tensions rise, wars and climate disasters strike more often\. They hit hardest the people noticed least: the farmers who depend on their land to survive\."\)\} <\/p>/);
  assert.match(hero, /<\/p> <p className="hero-solves"[^>]*> \{t\("Chernozem solves the problem of that harm going unseen\."\)\} <\/p> <div className="hero-actions"/);
  assert.match(css, /\.site \.hero-solves \{[^}]*font-size: var\(--step-lead\);[^}]*font-weight: 600;[^}]*color: var\(--ink\);/);
  // The section names.
  for (const name of ["What is Chernozem", "Why Chernozem", "One field, one pass, one answer", "The demo is Ukraine", "See your land from space"]) assert.match(text, new RegExp(`>\\s*\\{t\\("${name}"\\)\\}\\s*<`), name);
  assert.match(text, /title=\{t\("Field, for one farm"\)\}/);
  assert.match(text, /title=\{t\("Atlas, for a whole region"\)\}/);
  // The owner's eight reasons, each a short bold claim and one line, in honest words, as a bulleted list.
  const said = spoken(text);
  const claims = ["No hardware, only software.", "Free satellite data, read on Google Earth Engine.", "Recovery, not only monitoring.", "For every stakeholder.", "You choose what matters.", "Drop the pin, see the field.", "A few clicks, start to finish.", "All you need is a place."];
  for (const claim of claims) assert.ok(said.includes(`claim: "${claim}"`), `the reason "${claim}"`);
  assert.equal((said.match(/\bclaim: "/g) || []).length, claims.length, "eight reasons, no more");
  assert.match(text, /Most tools/);
  assert.doesNotMatch(text, /competitor/i);
  // Open data, never "the most accessible" (no claim to be the most of anything), and the owner's spelling, "organizations".
  assert.ok(said.includes('text: "Open data anyone can use: the public Sentinel satellites, read for you on Google Earth Engine."'), "the second reason's line");
  assert.doesNotMatch(text, /most accessible/i);
  assert.ok(said.includes('text: "Individuals and organizations alike: Field for a farmer’s own fields, Atlas for governments, NGOs and corporations."'), "the fourth reason's line");
  assert.match(text, /NUMBERS\.tenFieldsSeconds/);
  assert.match(text, /<ul className="why-list" role="list">\s*\{WHY\.map\(\(item, i\) => \(\s*<li className="why-item"[^>]*>\s*<strong className="why-claim">\{t\(item\.claim, whyVars\)\}<\/strong> \{lastTwoTogether\(digitsTogether\(t\(item\.text, whyVars\)\)\)\}\s*<\/li>/);
  assert.match(css, /\.site \.why-item::before \{[^}]*content: "";[^}]*width: 0\.5em;[^}]*height: 0\.5em;[^}]*background: var\(--accent\);/, "each bullet marked with a small accent square");
});

test("What is Chernozem is back right after the hero, as on 1 November 2026: what it is in bold, then Field, Atlas and the name, beside the owner's picture of the two", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home).replace(/\s+/g, " ");
  assert.ok(at(text, 'id="what-title"') > at(text, "<EarthGlobe") && at(text, 'id="what-title"') < at(text, 'id="why-title"'), "right after the hero");
  assert.match(text, /<section className="what section" aria-labelledby="what-title" ref=\{reveal\}>/);
  assert.match(text, /<h2 id="what-title" className="head" data-rise> \{t\("What is Chernozem"\)\} <\/h2>/);
  assert.ok(
    text.includes('<strong>{t("Chernozem is satellite farmland monitoring: free satellite data over farmland, read and put into plain words for people who are not scientists.")}</strong> {t("Field watches a farmer’s own fields; Atlas scores a whole region for governments, NGOs and corporations. The name is the black soil of Ukraine and northeast China, where its story began.")}'),
    "what it is, in bold, then one phrase each for Field and Atlas, and the name"
  );
  assert.match(text, /<Link to="\/story" className="link link-under"> \{t\("How it started"\)\} <\/Link>/);
  // The picture: the owner's (3 November 2026), the logo above Field and Atlas (3:4), with a copy twice as sharp
  // for sharp screens, both in the shots' manifest as they are.
  assert.match(text, /<figure className="what-picture"> <img src="\/site\/shots\/what-field-atlas-600\.webp" srcSet="\/site\/shots\/what-field-atlas-600\.webp 1x, \/site\/shots\/what-field-atlas-1200\.webp 2x"/);
  assert.match(text, /width="600" height="800"/);
  const shots = join(root, "public", "site", "shots");
  const manifest = JSON.parse(readFileSync(join(shots, "manifest.json"), "utf8"));
  for (const [file, size, max] of [["what-field-atlas-600.webp", [600, 800], 80e3], ["what-field-atlas-1200.webp", [1200, 1600], 160e3]]) {
    const bytes = statSync(join(shots, file)).size;
    assert.ok(bytes > 10e3 && bytes <= max, `${file} is ${bytes} bytes (at most ${max})`);
    assert.deepEqual(webpSize(join(shots, file)), size, `${file} is ${size.join(" x ")}`);
    const entry = manifest.find((e) => e.file === file);
    assert.ok(entry && entry.width === size[0] && entry.height === size[1] && entry.bytes === bytes && /owner's own picture/.test(entry.made), `${file} is in the shots' manifest, as it is`);
  }
  // The old window onto the Fields page is gone, its crops with it.
  assert.doesNotMatch(home, /field-fields-map|what-window|enterDemo/);
  for (const file of ["field-fields-map-864.webp", "field-fields-map-1728.webp"]) assert.ok(!existsSync(join(shots, "crops", file)), `${file} is gone`);
  // Its caption says which is which, and opens the demo's page (both products are in the picture).
  assert.match(text, /\{t\("Field, above, on the demo farm near Kupiansk; Atlas, below, across Ukraine\."\)\}\{" "\} <Link to=\{SITE\.demoPath\} className="link link-under"> \{t\("Open the demo"\)\} <\/Link>/);
  // The look: the words in the left half, set at the picture's middle; the picture in the right half, whole, never
  // wider than 560 px (so it stays within a laptop's screen).
  const css = read("pages", "home.css");
  assert.match(css, /\.site \.what-words \{\s*grid-column: 1 \/ 7;/);
  assert.match(css, /\.site \.what-side \{\s*grid-column: 7 \/ 13;[^}]*max-width: 560px;/);
  assert.match(css, /\.site \.what-picture img \{\s*display: block;\s*width: 100%;\s*height: auto;/);
  assert.match(css, /@media \(min-width: 901px\) \{\s*\.site \.what-words \{\s*align-self: center;/);
});

test("every way to register says Register for Chernozem and goes to /register (never Register for Field or for Atlas)", () => {
  const home = read("pages", "HomePage.jsx");
  const buttons = [...home.matchAll(/<Link to=\{([^}]+)\} className="btn[^"]*">\s*\{t\("Register for Chernozem"\)\}\s*<\/Link>/g)];
  assert.equal(buttons.length, 2, "the hero's and the close's");
  for (const [, to] of buttons) assert.equal(to, "SITE.registerPath");
  assert.match(read("content", "site.js"), /registerPath: "\/register",/);
  for (const dir of ["pages", "components"]) {
    for (const name of readdirSync(join(here, dir)).filter((f) => /\.jsx?$/.test(f) && !f.endsWith(".test.js"))) {
      assert.doesNotMatch(read(dir, name), /Register for (Field|Atlas)\b/, `${dir}/${name} says Register for Chernozem`);
    }
  }
});

test("the two stories are held and move sideways with the scroll, 4 to 6 steps each, with pictures that exist, stay small and have a sharp copy", () => {
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
  // Held by CSS sticky, the section as tall as the screen plus one share per step and half a share before
  // the first step and after the last, the row moved by the component as the page scrolls (frame by frame,
  // no slide of its own; components/scrollStory.test.js).
  assert.match(css, /\.site \.story\.is-held \{[^}]*--story-hold: clamp\(440px, 50svh, 460px\);[^}]*--story-lead: 0\.5;[^}]*height: calc\(100svh \+ \(var\(--story-steps\) \+ 2 \* var\(--story-lead\)\) \* var\(--story-hold\)\)/);
  assert.match(css, /\.site \.story\.is-held \.story-stage \{[^}]*position: sticky;[^}]*top: 0;[^}]*height: 100svh;[^}]*overflow: clip/);
  assert.match(css, /\.site \.story\.is-held \.story-track \{[^}]*will-change: transform;/);
  assert.match(story, /track\.style\.transform = `translate3d\(/);
  assert.match(story, /useScroll\(\{ target: ref, offset: \["start start", "end end"\] \}\)/);
  assert.match(read("components", "scrollStoryMath.js"), /Math\.floor\(p \* spanOf\(count\) - LEAD\)/, "each step an equal share of the hold, after the lead-in");
  assert.match(story, /import \{ FOLLOW, LEAD, entryTarget, fillAt, followStep, glideAt, glideMs, listStepAt, listTarget, nearlyHeld, pageTarget, rowAt, settleTarget, shareMiddle, spanOf, stepAt \} from "\.\/scrollStoryMath\.js";/);
  assert.match(story, /\{t\("\{current\} of \{count\}", \{ current: current \+ 1, count \}\)\}/, "a plain count, step n of m, where the titles do not fit");
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
  // Five steps in a hold of six shares: the lead-in (0 to 1/12) and the first step's share (to 3/12) show
  // the first, the last step's share and the lead-out (from 9/12, and past it) the last.
  assert.deepEqual([0, 0.08, 0.24, 0.26, 0.5, 0.74, 0.76, 0.95, 1, 1.4, -0.3, NaN].map((p) => stepAt(p, 5)), [0, 0, 0, 1, 2, 3, 4, 4, 4, 4, 0, 0]);
  // A 1440 x 900 window: the section is 900 + 6 x 450 = 3,600 px tall, 2,700 px of hold, 450 a step.
  const story = { top: 2000, height: 900 + spanOf(5) * holdFor(900), screen: 900, count: 5 };
  assert.equal(story.height, 3600);
  assert.equal(pageTarget({ ...story, step: 0, down: true }), 2000 + 900, "Page Down from the first step: the middle of the second's share");
  assert.equal(pageTarget({ ...story, step: 3, down: true }), 2000 + 2250);
  assert.equal(pageTarget({ ...story, step: 2, down: false }), 2000 + 900, "Page Up goes back one");
  assert.equal(pageTarget({ ...story, step: 4, down: true }), null, "past the last step the page scrolls on as usual");
  assert.equal(pageTarget({ ...story, step: 0, down: false }), null, "and before the first");
  // Every press from anywhere in a step's share lands in the next step's share, never further.
  for (let step = 0; step < 4; step++) {
    const target = pageTarget({ ...story, step, down: true });
    assert.equal(stepAt((target - story.top) / (story.height - story.screen), 5), step + 1);
  }
  assert.equal(pageTarget({ ...story, height: 900, step: 0, down: true }), null, "no hold, nothing to do");
  // The keys are helped while the story holds the screen and on the press that brings it in; never in a
  // form, a film, an open dialog or with the phone menu open, and Space never on a button (it presses it;
  // Page Down and Page Up still help on one, such as a step of the progress row just clicked).
  const component = read("components", "ScrollStory.jsx");
  assert.match(component, /\} else if \(box\.top <= 1 && box\.bottom >= screen - 1\) \{\s*from = stepAt\(-box\.top \/ \(box\.height - screen\), count\);\s*top = pageTarget\(\{ \.\.\.story, step: from, down \}\);/);
  assert.match(component, /top = entryTarget\(\{ \.\.\.story, scrollY: window\.scrollY, down \}\);/);
  assert.match(component, /if \(document\.documentElement\.hasAttribute\("data-menu"\)\) return false;/);
  for (const own of ["input", "textarea", "select", "[contenteditable]", "video", "[role='dialog']"]) assert.ok(component.match(/const OWN_KEYS = "[^"]*";/)[0].includes(own), `a key on ${own} does its own work`);
  assert.match(component, /event\.target\.closest\(event\.key === " " \? `\$\{OWN_KEYS\}, \$\{OWN_SPACE\}` : OWN_KEYS\)/, "Space on a button presses it");
  // The wheel and a finger are listened to (a touch stops the page's own glide at once) but never captured
  // and never held back: every such listener passive, none capturing, and the one preventDefault the page
  // keys' own.
  const handlers = [...component.matchAll(/addEventListener\("(wheel|touch\w*)", (\w+), (\w+)\)/g)];
  assert.ok(handlers.length >= 4, "the wheel and the touch events are listened to");
  for (const [line, , , options] of handlers) assert.equal(options, "passive", `${line}: passive`);
  assert.match(component, /const passive = \{ passive: true \};/);
  assert.doesNotMatch(component, /passive: false|capture: true|addEventListener\("(wheel|touch\w*)", \w+, true\)/, "nothing captured, nothing that could stop the page scrolling");
  assert.equal(component.match(/preventDefault\(\)/g).length, 1, "only the page keys' own");
});

// Page Down (or Space) pressed again and again from the top of the About page to its end, then Page Up
// (or Shift+Space) back to the top, as a browser does it: each story's key handler in turn
// (ScrollStory.jsx: pageTarget while it holds the screen, entryTarget otherwise), the first answer
// wins; with no answer the browser's own page step, the window's height less 40 px (Chrome's). The
// stories' places are those of the real page at each window size (the section's top on the page; each
// is as tall as the screen plus one share per step and half a share before and after them, spanOf and
// holdFor, as scrollstory.css makes it). Answers the steps the page comes to rest on.
function pressThrough({ screen, field, end, entering = true }) {
  const count = 5;
  const height = screen + spanOf(count) * holdFor(screen);
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
  // The window sizes the checker pressed through, with the Field story's top and the page's end as
  // measured on the page (3 November 2026, one share of 440 to 460 px per step and half a share before
  // and after them; every section's height as the arithmetic says).
  const sizes = [
    { size: "1440x900", screen: 900, field: 2775, end: 12375 },
    { size: "1920x1080", screen: 1080, field: 3065, end: 13269 },
    { size: "1536x864", screen: 864, field: 2787, end: 12281 },
    { size: "1366x768", screen: 768, field: 2693, end: 11950 },
    { size: "1280x720", screen: 720, field: 2720, end: 11875 },
    { size: "768x1024", screen: 1024, field: 4034, end: 14447 },
    { size: "390x844", screen: 844, field: 3837, end: 14023 },
  ];
  for (const { size, ...page } of sizes) {
    const keys = pressThrough(page);
    assert.equal(keys.down, ALL_DOWN, `${size}: going down, every step rests in order`);
    assert.equal(keys.up, ALL_UP, `${size}: going back up, every step rests in order`);
    assert.equal(keys.end, page.end, `${size}: the keys reach the end of the page`);
    assert.equal(keys.top, 0, `${size}: and the top again`);
  }
  // Wherever the stories sit on the page (the sections above them change), on any window.
  for (const screen of [600, 720, 768, 844, 900, 1024, 1080, 1440]) {
    const height = screen + spanOf(5) * holdFor(screen);
    for (let field = 900; field < 4200; field += 47) {
      const keys = pressThrough({ screen, field, end: field + 2 * height + 3000 });
      assert.ok(keys.down === ALL_DOWN && keys.up === ALL_UP && keys.top === 0, `a ${screen} px window, Field's top at ${field}: ${keys.down} / ${keys.up}`);
    }
  }
  // Without the help for the press that brings a story in, the browser's page step skips steps at some
  // of these sizes (Field's first going down on the tablet, Atlas's last going up on the phone and at
  // 1536 x 864), even with the first and last steps' longer stretch.
  assert.notEqual(pressThrough({ ...sizes[5], entering: false }).down, ALL_DOWN);
  assert.notEqual(pressThrough({ ...sizes[6], entering: false }).up, ALL_UP);
  assert.notEqual(pressThrough({ ...sizes[2], entering: false }).up, ALL_UP);

  // entryTarget on its own. A 1440 x 900 window: the section is 3,600 px tall, 2,700 px of hold, 450 a
  // step; the first step rests 450 px into the hold (the lead-in and half its share), the last 450 px
  // before its end.
  const story = { top: 2000, height: 900 + spanOf(5) * holdFor(900), screen: 900, count: 5 };
  assert.equal(entryTarget({ ...story, scrollY: 1500, down: true }), 2000 + 450, "its top on the screen, going down: the first step's resting place");
  assert.equal(entryTarget({ ...story, scrollY: 1100, down: true }), 2450, "its top at the foot of the screen");
  assert.equal(entryTarget({ ...story, scrollY: 1099, down: true }), null, "its top still below the screen: the browser's step cannot pass the first share");
  assert.equal(entryTarget({ ...story, scrollY: 1999, down: true }), null, "within a pixel of holding the screen: pageTarget's press");
  assert.equal(entryTarget({ ...story, scrollY: 5120, down: false }), 2000 + 2250, "its foot on the screen, going up: the last step's resting place");
  assert.equal(entryTarget({ ...story, scrollY: 5600, down: false }), 4250, "its foot at the top of the screen");
  assert.equal(entryTarget({ ...story, scrollY: 5601, down: false }), null, "its foot above the screen");
  assert.equal(entryTarget({ ...story, scrollY: 4701, down: false }), null, "within a pixel of holding the screen");
  assert.equal(entryTarget({ ...story, scrollY: 5120, down: true }), null, "going down past its foot: the page scrolls on");
  assert.equal(entryTarget({ ...story, scrollY: 1500, down: false }), null, "going up away from its top: the page scrolls on");
  assert.equal(entryTarget({ ...story, height: 900, scrollY: 1500, down: true }), null, "no hold, nothing to do");
  for (let scrollY = 1100; scrollY < 2000; scrollY += 37) assert.equal(stepAt((entryTarget({ ...story, scrollY, down: true }) - story.top) / 2700, 5), 0, "always the first step");
  for (let scrollY = 4702; scrollY <= 5600; scrollY += 37) assert.equal(stepAt((entryTarget({ ...story, scrollY, down: false }) - story.top) / 2700, 5), 4, "always the last step");

  // Almost holding the screen (the page put back near it, say): a page key goes on to the next step.
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
  // Held: a step rests in the middle of its share (where pageTarget, a click on the progress row and the
  // settling send the page too), on its plateau.
  const story = { top: 2000, height: 900 + spanOf(5) * holdFor(900), screen: 900, count: 5 };
  assert.deepEqual([0, 1, 2, 3, 4].map((step) => shareMiddle({ ...story, step })), [2450, 2900, 3350, 3800, 4250]);
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
  // With the words under the picture, the picture takes the height the tallest step's words leave
  // (--story-fit, measured as the layout changes), so every step fits whole on a short phone; a short
  // window up to 900 px wide (540 to 640 px tall) still shows 170 px of each picture, a phone 150.
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.site \.story\.is-held \.story-picture \{\s*height: clamp\(170px, var\(--story-fit, calc\(100svh - 470px\)\), 500px\);/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?\.site \.story\.is-held \.story-picture \{\s*height: clamp\(150px, var\(--story-fit, 34svh\), 300px\);/);
  assert.match(component, /const room = stage\.clientHeight - head\.offsetHeight - gap - between - tallest - 2 \* FIT_MARGIN;\s*stage\.style\.setProperty\("--story-fit", `\$\{Math\.floor\(room\)\}px`\);/);
  assert.match(component, /const narrow = window\.matchMedia\("\(max-width: 900px\)"\);/);
  // Back in the held layout, the row is put at the step at once (no glide).
  assert.match(component, /if \(held\) \{\s*atRef\.current = step;\s*jumpNext\.current = true;\s*setAt\(step\);/);
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

test("the photograph beside Why Chernozem exists in two small copies, is never shown wider than 600 px, and is credited under it as the article that published it prints it", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home).replace(/\s+/g, " ");
  const photos = join(root, "public", "site", "photos");
  for (const [file, size, max] of [["shell-casings-field-600.webp", [600, 582], 125e3], ["shell-casings-field-1200.webp", [1200, 1164], 265e3]]) {
    const bytes = statSync(join(photos, file)).size;
    assert.ok(bytes > 10e3 && bytes <= max, `${file} is ${bytes} bytes (at most ${max})`);
    assert.deepEqual(webpSize(join(photos, file)), size, `${file} is ${size.join(" x ")}`);
    assert.ok(home.includes(`/site/photos/${file}`), `the page uses ${file}`);
  }
  // The sharp copy only on sharp screens, the picture laid out at the small copy's size and never wider.
  assert.match(home, /srcSet=\{`\$\{PHOTO\.small\} 1x, \$\{PHOTO\.large\} 2x`\}/);
  assert.match(home, /width="600" height="582" loading="lazy"/);
  const css = read("pages", "home.css");
  assert.match(css, /\.site \.why-photo img \{[^}]*max-width: 600px;/, "never wider than its 600 px");
  assert.match(css, /\.site \.why-photo \{[^}]*grid-column: 8 \/ 13;[^}]*grid-row: 1 \/ 3;/, "beside the list on a screen wider than 900 px");
  // At 900 px or less, one column: on a tablet the reasons come first, under the heading (the photograph, 600 px
  // tall, would otherwise fill the screen), then the photograph; on a phone the photograph first.
  assert.match(css, /@media \(max-width: 900px\) \{[^@]*\.site \.why-list \{\s*grid-row: 2;[^@]*\.site \.why-photo \{\s*grid-row: 3;/, "the reasons first on a tablet");
  assert.match(css, /@media \(max-width: 700px\) \{\s*\.site \.why-photo \{\s*grid-row: 2;[^@]*\.site \.why-list \{\s*grid-row: 3;/, "the photograph first on a phone");
  assert.doesNotMatch(css, /\.why-photo \.window-caption \{[^}]*flex:/, "the credit is no longer docked beside the photograph's foot");
  // What it shows, and the credit the article prints, with a link to the article (no place or date: it gives none).
  assert.match(home, /alt: "Spent artillery shell casings, some rusted, lie in the grass of a field, with dry weeds and trees behind\."/);
  assert.match(home, /alt=\{t\(PHOTO\.alt\)\}/);
  // The credit and the publication's name are names, the same in every language: the caption's two holes.
  assert.match(home, /publication: "Responsible Statecraft",/);
  assert.match(text, /<figcaption className="window-caption muted"> \{t\("Spent artillery shell casings left in a field\. Photo: \{credit\}, as published in \{article\}\.", \{ credit: PHOTO\.credit, article: \( <a href=\{PHOTO\.article\} className="link link-under" target="_blank" rel="noreferrer"> \{PHOTO\.publication\} <\/a> \), \}\)\} <\/figcaption>/);
  assert.match(home, /article: "https:\/\/responsiblestatecraft\.org\/ukraine-soil-contamination\/"/);
  assert.doesNotMatch(text, /BBC/, "not the BBC picture");
  // The photographs' manifest: where it came from, who took it, its licence, what was changed.
  const manifest = JSON.parse(readFileSync(join(photos, "manifest.json"), "utf8"));
  const entry = manifest.find((e) => e.files.includes("shell-casings-field-600.webp"));
  assert.ok(entry && entry.files.includes("shell-casings-field-1200.webp"), "both copies in one entry");
  assert.equal(entry.title, "Spent artillery shell casings in a field");
  assert.equal(entry.source, "https://responsiblestatecraft.org/ukraine-soil-contamination/");
  assert.match(entry.original, /^https:\/\/responsiblestatecraft\.org\/media-library\//);
  assert.match(entry.licence, /Chernozem holds no licence of its own/);
  assert.match(entry.changes, /converted to WebP/);
  const credit = home.match(/^  credit: (`[^`\n]+`),$/m);
  assert.ok(credit, "the credit is the PHOTO constant's");
  assert.equal(spoken(credit[1]).slice(1, -1), entry.author.replace(/ \(.*\)$/, ""), "the caption credits the author the manifest names");
  // Every file in the folder is one the manifest explains (the earlier pictures are gone).
  for (const file of readdirSync(photos).filter((f) => f !== "manifest.json")) assert.ok(manifest.some((e) => e.files.includes(file)), `${file} is in the manifest`);
  for (const e of manifest) for (const file of e.files) assert.ok(existsSync(join(photos, file)), `${file} exists`);
  // It replaces the weights picture beside the reasons.
  assert.doesNotMatch(home, /crops\/atlas-weights-/);
});

test("words that belong together never part at a line's end on the About page: Google Earth Engine, about 20 seconds, Camera 51, each reason's last two words", () => {
  const home = read("pages", "HomePage.jsx");
  const NB = String.fromCharCode(160);
  // One no-break space, written as an escape so it shows in the source (never typed in invisibly).
  assert.match(home, /^const NBSP = "\\u00a0";$/m);
  assert.ok(!home.includes(NB), "no invisible no-break space typed into the page");
  assert.match(home, /^const EARTH_ENGINE = `Google\$\{NBSP\}Earth\$\{NBSP\}Engine`;$/m);
  // (Since the website has languages, the joined name is a hole, {earthEngine}, filled with EARTH_ENGINE where
  // the reasons are drawn, so each reason is one dictionary key.)
  assert.equal((words(home).match(/\{earthEngine\}/g) || []).length, 2, "in the second reason's claim and its line");
  assert.match(home, /earthEngine: EARTH_ENGINE/, "the hole filled with the joined name");
  assert.doesNotMatch(words(home), /Google Earth Engine/, "never with plain spaces");
  // The number is a hole too, and the plain spaces beside a digit become no-break ones where the reasons are drawn.
  assert.match(home, /read in about \{seconds\} seconds\./, "the about before the number, its unit after it");
  assert.match(home, /seconds: formatInt\(NUMBERS\.tenFieldsSeconds\)/);
  const digits = home.match(/^const digitsTogether = \(text\) => text\.replace\(\/(.+)\/g, NBSP\);$/m);
  assert.ok(digits, "the digits rule is there");
  assert.equal("read in about 20 seconds.".replace(new RegExp(digits[1], "g"), NB), `read in about${NB}20${NB}seconds.`, "a number and its unit, and the about before them");
  assert.match(home, /credit: `Jose Hernandez, Camera\$\{NBSP\}51 \//);
  // A reason's last two words share a line: its last plain space becomes a no-break one (Safari before 26 has no text-wrap: pretty).
  const rule = home.match(/^const lastTwoTogether = \(text\) => text\.replace\(\/(.+)\/, NBSP\);$/m);
  assert.ok(rule, "the rule is there");
  const lastTwo = (s) => s.replace(new RegExp(rule[1]), NB);
  assert.equal(lastTwo("and often impossible to bring in."), `and often impossible to bring${NB}in.`);
  assert.equal(lastTwo(`a ten-field farm is read in about${NB}20${NB}seconds.`), `a ten-field farm is read in${NB}about${NB}20${NB}seconds.`, "words already joined count as one");
  assert.equal(lastTwo("alone"), "alone");
});

test("the What picture is shown whole, never wider than 560 px, beside the words or under them, and the heading keeps clear of it", () => {
  const css = read("pages", "home.css");
  const what = css.slice(css.indexOf("---- 2. What is Chernozem"), css.indexOf("---- 3. Why Chernozem"));
  assert.ok(what.length > 0, "the What block is where home.css says");
  // Beside the picture the words keep two gutters of air, as the Why list does (none once the picture is under them).
  assert.match(what, /\.site \.what-words \{\s*grid-column: 1 \/ 7;\s*padding-right: calc\(2 \* var\(--gutter\)\);/);
  assert.match(what, /@media \(max-width: 900px\) \{[^@]*\.site \.what-words \{\s*padding-right: 0;/);
  // On a screen of 900 px or less the picture comes under the words, on their left edge, still at most 560 px wide.
  assert.match(what, /@media \(max-width: 900px\) \{[^@]*\.site \.what-words,\s*\.site \.what-side \{\s*grid-column: 1 \/ 13;/);
  assert.match(what, /@media \(max-width: 900px\) \{[^@]*\.site \.what-side \{\s*justify-self: start;\s*margin-top: 2\.5rem;/);
  // Nothing crops it any more: no window's height, no object-fit, no container rules.
  assert.doesNotMatch(what, /what-window|container: what-side|@container|object-fit|height: \d+px/);
});

test("the About page's text links are targets a finger can hit, and their focus rings clear the words", () => {
  const css = read("pages", "home.css");
  // Each: its padding (vertical, sideways) and the ring's offset; the ring sits padding + offset px from the words.
  const rings = [
    // "Try the demo" beside the hero's and the close's button: 5 px all round, given back by the margin.
    [/\.site :is\(\.hero-actions, \.close-actions\) \.link \{\s*padding: (\d+)px;\s*margin: -\1px;\s*\}/, /\.site :is\(\.hero-actions, \.close-actions\) \.link:focus-visible \{\s*outline-offset: (-?\d+)px;/],
    // The captions' links, inline in their sentence: 7 px above and below (an inline box's padding takes no room), 6 px at the sides given back by the margin.
    [/\.site \.window-caption \.link \{[^}]*padding: (\d+)px (\d+)px;\s*margin-inline: -\2px;/, /\.site \.window-caption \.link:focus-visible \{\s*outline-offset: (-?\d+)px;/],
    // "How it started": 12 px all round, its line pulled 12 px left rather than a negative margin on the link (Safari ignores that where the link starts its block).
    [/\.site \.what-link \.link \{\s*padding: (\d+)px;\s*\}/, /\.site \.what-link \.link:focus-visible \{\s*outline-offset: (-?\d+)px;/],
  ];
  for (const [box, ring] of rings) {
    const pad = css.match(box);
    const offset = css.match(ring);
    assert.ok(pad && offset, `${box} and its ring are in home.css`);
    const vertical = Number(pad[1]);
    const sideways = Number(pad[2] || pad[1]);
    // A target 32 px tall or more for words about 19 to 27 px tall (Safari rounds a phone's 23.8 px line down to 23).
    assert.ok(vertical >= 5, `${box}: at least 5 px above and below`);
    for (const side of [vertical, sideways]) {
      const gap = side + Number(offset[1]);
      assert.ok(gap >= 2 && gap <= 3, `${box}: the ring ${gap} px from the words`);
    }
  }
  assert.match(css, /\.site \.what-link \{\s*margin-top: 1\.75rem;\s*margin-left: -12px;\s*\}/, "How it started: its line pulled left by its padding");
});

test("under the close, the disclaimer: a detection framework, as accurate as the owner's tests found, at a readable size above the small print", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home).replace(/\s+/g, " ");
  assert.ok(at(text, 'id="close-title"') < at(text, 'className="caveat"') && at(text, 'className="caveat"') < at(text, 'className="small-print"'), "after the close's tile, before the small print");
  assert.ok(
    text.includes(
      '<p className="caveat"> <strong>{t("A detection framework.")}</strong> {t("Chernozem reads farmland from space. It cannot take soil samples in a disaster zone, and it has no hardware on the ground to confirm what it sees. In our tests its readings were roughly {percent}% accurate: close, for a tool of its kind, but not 100%. Use them as a guide, check on the ground before acting, and know that Chernozem is not responsible for decisions made from them.", { percent: NUMBERS.testAccuracyPercent })} </p>'
    ),
    "the owner's disclaimer, word for word"
  );
  // Its figure comes from site.js (the owner's own tests), never typed into the page.
  assert.match(read("content", "site.js"), /testAccuracyPercent: \d+, \/\/ the owner's own test/);
  const caveat = text.slice(at(text, '<p className="caveat">'), text.indexOf("</p>", at(text, '<p className="caveat">')));
  assert.doesNotMatch(caveat.replace("100%", ""), /\d/, "no figure typed into it");
  // A readable size in full ink, not the small print's 13 px (nor the app's global .disclaimer: 11 px, muted).
  const rule = read("pages", "home.css").match(/\.site \.caveat \{[^}]*\}/);
  assert.ok(rule, "the disclaimer has its own rule");
  const size = Number(rule[0].match(/font-size: (\d+)px/)[1]);
  assert.ok(size >= 15, "at least 15 px");
  assert.match(rule[0], /color: var\(--ink\)/);
  // Its measure is the small print's width under it (the same px, in its own larger ch): about 66 characters a line.
  const small = read("pages", "home.css").match(/\.site \.small-print \{\s*max-width: (\d+)ch;\s*font-size: (\d+)px;/);
  assert.ok(small, "the small print keeps its measure");
  assert.equal(Number(rule[0].match(/max-width: (\d+)ch/)[1]), Math.round((Number(small[1]) * Number(small[2])) / size), "the two share a right edge");
  assert.doesNotMatch(home, /className="disclaimer"/);
});

test("what the owner had removed stays removed, and the page prints no demo code and no count of the demo farm's fields", () => {
  const home = read("pages", "HomePage.jsx");
  const text = words(home);
  // ("What is Chernozem", gone in the round of 1 November 2026, came back at the owner's request: its own test is above.)
  for (const gone of ["Field reads every satellite pass", "Chernozem reads free satellite data over farmland and puts it into plain words", "What a farmer gets", "For governments and NGOs", "A letter from the founder", "Chernozem in three minutes", "Your land,", "seen from space", "Karasivka", "BBC"]) {
    assert.ok(!text.includes(gone), `no "${gone}" on the About page`);
  }
  for (const part of ["WorldGlobe", "GlobeCredits", "<Film", "<Letter", "StageSlider", "FeatureIndex", "crops/atlas-weights-", "karasivka", "destroyed-tank"]) assert.ok(!home.includes(part), `no ${part} on the About page`);
  for (const file of ["Letter.jsx", "StageSlider.jsx"]) assert.ok(!existsSync(join(here, "components", file)), `components/${file} is gone`);
  for (const file of ["karasivka-wheat-600.webp", "karasivka-wheat-768.webp", "destroyed-tank-field-596.webp"]) assert.ok(!existsSync(join(root, "public", "site", "photos", file)), `photos/${file} is gone`);
  const css = read("pages", "home.css");
  for (const style of ["letter", "stages-", "findex", "why-window", "why-photo-frame", "film-head", "feature-"]) assert.ok(!css.includes(`.${style}`), `home.css has no .${style} styles left`);
  for (const source of [text, words(read("components", "ScrollStory.jsx"))]) {
    assert.doesNotMatch(source, /\b(12|13|twelve|thirteen) fields\b/i, "the farm's field count is never printed");
    assert.doesNotMatch(source, CODE_TALK);
  }
  // Nor by the files that describe the site's pictures: they are served with it (/site/shots/manifest.json ...).
  for (const file of [["shots", "manifest.json"], ["shots", "crops", "manifest.json"], ["photos", "manifest.json"]]) {
    const raw = readFileSync(join(root, "public", "site", ...file), "utf8");
    assert.doesNotMatch(raw, /\b(\d+|ten|eleven|twelve|thirteen) fields\b/i, `${file.join("/")} prints no count of the demo farm's fields`);
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

test("the footer has no middle-dot strings and no GitHub or Data and code link (removed 6 November 2026)", () => {
  const footer = words(read("components", "Footer.jsx"));
  assert.ok(!footer.includes("·"), "no middle dot");
  assert.doesNotMatch(footer, />\s*GitHub\s*<|>\s*Data and code\s*<|>\s*Paper\s*</);
  assert.doesNotMatch(footer, /LINKS\./, "the footer links only the four pages");
  assert.match(footer, /SITE_PAGES\.map/);
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
  // The page's last four parts (the field row too) reveal together, and the
  // demo is built, once the field row is near, so a long page never leaves
  // their words hidden to a fast scroll or a scan (the design inspector's
  // eleven screens end above the field row on a phone and at 1,024 px);
  // and once the close is near, so a visitor who lands at the very end
  // (Back from Register, a jump to the end: the field row is then more
  // than 2,400 px above a phone's screen) finds them shown.
  assert.match(home, /const \[tailRef, tailNear\] = useNear\("2400px 0px"\);/);
  assert.match(home, /const \[closeRef, closeNear\] = useNear\("2400px 0px"\);\s*const near = tailNear \|\| closeNear;\s*const tail = near \? " is-in" : "";/);
  assert.match(home, /\{near && \(/);
  assert.match(home, /reveal\(node\);\s*tailRef\.current = node;/);
  assert.match(home, /className=\{`showcase section\$\{tail\}`\} aria-labelledby="showcase-title" ref=\{showcaseRef\}/);
  assert.match(home, /<section className=\{`close\$\{tail\}`\} aria-labelledby="close-title" ref=\{closeRef\}>/);
  for (const part of ["showcase section${tail}", "proof section${tail}", "demo-section on-sage section${tail}", "close${tail}"]) assert.ok(home.includes(part), `${part} reveals with the tail`);
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
  assert.match(css, /\.site :is\(\.hero, \.what, \.why, \.small-print\) \.link-under:hover \{[^}]*color: var\(--accent\);[^}]*text-decoration-line: underline/);
  assert.match(css, /\.site :is\(\.hero, \.what, \.why, \.small-print\) \.link-under\[data-near\] \{[^}]*color: var\(--accent\)/);
  assert.match(css, /\.site \.close-actions \.link:hover \{[^}]*text-decoration-line: underline/);
  assert.match(css, /\.site \.window-caption \.link \{[^}]*white-space: nowrap/);
});
