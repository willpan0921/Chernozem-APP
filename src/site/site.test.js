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
//   - the pin cursor clicks at the centre of its head, and the website
//     (never the app) starts the click assist;
//   - the About page names the app challenge once, and only there; no
//     part of it mentions a demo code;
//   - the globe draws on three.js with its own pictures (no hexagon land,
//     no world-atlas or topojson in the browser), the pictures it names
//     exist and stay small, and the old single still is gone;
//   - the film has chapters and no caption; the field row is one row.
//
// The challenge's name (and the old demo wording) is assembled below rather
// than written out, so a search of src/ for it finds only the About page
// and site.js.
//
// WHO EDITS IT
// Whoever changes the website's frame or About page.
// Run: node --test src/site/site.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (...parts) => readFileSync(join(here, ...parts), "utf8");

const SITE_CSS = read("site.css");
const STYLESHEETS = ["components/nav.css", "components/footer.css", "components/globe.css", "components/demo.css", "pages/home.css"];

test("every CSS variable used by the site's stylesheets is defined in site.css", () => {
  const defined = new Set([...SITE_CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  // A few variables are set inline by the components (the entrance order
  // --i, the load delay --d, the slider's --passed, the crop frame's size).
  for (const dir of ["components", "pages"]) {
    for (const name of readdirSync(join(here, dir)).filter((f) => f.endsWith(".jsx"))) {
      for (const m of read(dir, name).matchAll(/"(--[a-z0-9-]+)":/g)) defined.add(m[1]);
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
  const copy = ["pages/HomePage.jsx", "components/Letter.jsx", "components/FieldRowStates.jsx", "components/StageSlider.jsx", "components/WorldGlobe.jsx", "components/Film.jsx", "components/ProofTable.jsx", "components/Nav.jsx", "components/Footer.jsx"].map((f) => read(f)).join("\n");
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
  assert.match(read("components", "globe.css"), /\.globe-marker\[data-near\] i/);
});

test("the About page names the app challenge once, and no part of the site's frame or About page does elsewhere", () => {
  const home = read("pages", "HomePage.jsx");
  assert.equal(home.split(CHALLENGE).length - 1, 1, "once on the About page");
  assert.match(home, /href=\{LINKS\.cac\}/);
  const others = [...readdirSync(join(here, "components")).map((f) => join("components", f)), "SiteShell.jsx", "hooks.js", "site.css", "cursorAssist.js", "pages/home.css"].filter((f) => /\.(jsx?|css)$/.test(f));
  for (const file of others) assert.ok(!read(file).includes(CHALLENGE), `${file} does not name it`);
  for (const file of ["pages/HomePage.jsx", "components/Film.jsx", "components/WorldGlobe.jsx"]) {
    assert.doesNotMatch(words(read(file)), CODE_TALK, `${file} mentions no code`);
  }
});

test("the globe draws on three.js with its own pictures, which exist and stay small", () => {
  const globe = read("components", "WorldGlobe.jsx");
  const scene = read("components", "globeScene.js");
  for (const source of [globe, scene]) {
    assert.doesNotMatch(source, /world-atlas|topojson|react-globe\.gl|hexPolygon/, "no hexagon land and no outline files in the browser");
  }
  assert.match(scene, /from "three"/);
  assert.match(globe, /import\("\.\/globeScene\.js"\)/, "the 3D is loaded only when it is drawn");
  const world = join(root, "public", "site", "world");
  const budget = { "earth-soil-3600.webp": 600e3, "earth-soil-2048.webp": 250e3, "earth-plain-3600.webp": 600e3, "earth-plain-2048.webp": 250e3, "earth-water-1024.webp": 60e3, "globe-still-wide.webp": 400e3, "globe-still-tall.webp": 250e3 };
  for (const [name, max] of Object.entries(budget)) {
    const size = statSync(join(world, name)).size;
    assert.ok(size > 1000 && size <= max, `${name} is ${size} bytes (at most ${max})`);
  }
  // The names the globe builds: earth-soil- or earth-plain-, 3600 or 2048 wide.
  assert.ok(globe.includes("/site/world/earth-${kind}-${px}.webp"));
  for (const name of ["earth-water-1024.webp", "globe-still-wide.webp", "globe-still-tall.webp"]) assert.ok(globe.includes(name), `WorldGlobe uses ${name}`);
  assert.ok(!existsSync(join(world, "globe-still.webp")), "the old still is gone");
});

test("the film has chapters and no caption; the field row is one live row", () => {
  const film = read("components", "Film.jsx");
  assert.match(film, /caption = ""/);
  assert.match(film, /aria-current/);
  const home = read("pages", "HomePage.jsx");
  for (const [label, t] of [["Northeastern China", 4], ["Ukraine", 17], ["How it reads the land", 34], ["Field", 71], ["Atlas", 108]]) {
    assert.match(home, new RegExp(`label: "${label}", t: ${t} \\}`), `chapter ${label} at ${t} s`);
  }
  const row = words(read("components", "FieldRowStates.jsx"));
  for (const gone of [">Open<", ">Ask<", ">Export<"]) assert.ok(!row.replace(/\s+/g, "").includes(gone), `the row no longer has ${gone}`);
  assert.match(row, /aria-pressed/);
  assert.match(row, /Read it again/);
  // The phone menu tells the globe to stop drawing.
  assert.match(read("components", "Nav.jsx"), /setAttribute\("data-menu", "open"\)/);
});

