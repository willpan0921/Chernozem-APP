// WHAT THIS FILE DOES
// Checks on the website's inner pages (Story, Methodology, Contact, Demo,
// Owner sign-in, Page not found) and the gate laboratory, read from their
// source files (no browser needed):
//   - each page starts with the plain-English header every file carries,
//     sets its browser-tab title, and has exactly one h1;
//   - every page module in this folder, the About page and the register
//     pages included, loads site.css before its own stylesheet (and the
//     frame, SiteShell.jsx, loads it before the menu's and the footer's),
//     so the page's rules win their ties with site.css however it is opened;
//   - none imports the components the second website removed;
//   - the Story is what the owner asked for, in his order, and nothing
//     else (no film, no "Who makes it", no closing sign-up): its title
//     "Forged in Three Generations", then five steps on the dark band (the
//     table, the visit, Ukraine, building it, Penn: At Penn is a step now,
//     not a section) joined by four drawn arrows hidden from screen
//     readers, then the three editions; "ten ways" comes from site.js as
//     a word; "Dr. Bo", "black‑soil" and "great‑grandparents" never break
//     across lines; the steps rise and the arrows draw only for visitors
//     who did not ask for reduced motion, and a fast scroll never leaves
//     one unfinished; the title stands above the steps, which start three
//     columns in on a wide screen (no sticky title beside an empty half);
//     no class of the page is one the About page's sideways stories style
//     (their ".story" once padded this page); it counts ACLED's events as
//     events, links the Dataverse deposit (the Recovery Atlas's package)
//     under the Second edition, which says it was the first Chernozem
//     Atlas, for Ukraine only and before Field (the owner's answer),
//     credits the old maps' base maps, and its
//     Third edition sets harvest timing apart from what is compared with
//     2019 to 2021;
//   - the Demo page is the two doors (which switch the tab to the demo)
//     and the Register line, with no code anywhere; the doors' pictures are
//     the half-size copies;
//   - the Contact page says where messages go (chernozem.app@gmail.com) and
//     that visitors may write there directly, in the owner's words; keeps
//     the robot trap; offers who-you-are as five plain words, Corporation
//     among them (no pictures in the choice, every row of them filled at
//     every width); says after sending that the message was received (not
//     that it is on its way) and moves the keyboard there; and has lost
//     "What to write about" and "Elsewhere";
//   - the Register page offers Corporation among the kinds of organisation,
//     the five laid out three above two (register.css), and no page says
//     "Register for Field" (it is "Register for Chernozem" now);
//   - the Owner page is unlisted (noindex), signs in with the Chernozem
//     Google account (no code field), lets the server decide who the owner
//     is, and refuses any other account in plain words;
//   - no page mentions an access code or the challenge the app was made for
//     (it is named nowhere, and site.js has no link to it; its name is built
//     from pieces here, so a search of the code never finds it),
//     and none prints the demo farm's number of fields;
//   - every page title's mask leaves room for the tails of g, p and y (a
//     title's line is tighter than its letters) and gives it back, so
//     nothing after the title moves;
//   - every picture the pages name exists in public/;
//   - the Methodology page is two parts, Field and Atlas, each opening with
//     one plain sentence of what it is (Atlas's names governments, NGOs and
//     corporations, and keeps Ukraine as the demo, where Chernozem
//     started) and its walkthrough film (Walkthrough.jsx); a short "Behind
//     it"; then the three-minute film (Film.jsx, its five chapters, moved
//     from the About page); the close says "Register for Chernozem"; no
//     row of in-page links and no sub-sub-headings; it keeps the ids the
//     old addresses jump to, says contact messages are kept on the server,
//     and prints no stale test count;
//   - the three-minute film: its two copies (the phone's smaller) and its
//     poster exist, both copies keep their sound track, it downloads only
//     on play, and its chapters are marked like the walkthroughs' (the
//     same rule and the same look); the page plays one film at a time;
//   - the two walkthrough films exist with their posters and chapter list
//     (public/site/film/walkthroughs.json), each two to three minutes and
//     under 25 MB, and Walkthrough.jsx only downloads a film on play;
//   - under each film the chapter playing now is marked (aria-current, an
//     ink fill that hover never imitates), at once when it is pressed and as
//     the film plays, and the time-to-chapter rule gives the right chapter;
//   - the Field part's "What it reads" follows the steps closely, with the
//     phone beside both (wide) or between them (tablet, phone); no step or
//     score ends on one lone word; nothing on the page is under 14 px; the
//     gate chart is drawn at its real width, its axis's name on a line of
//     its own under the numbers;
//   - then Field's technical part, in the Atlas part's look and as calm:
//     the four readings with a formula and one sentence under each name
//     (two by two from a tablet up, never four across; one under the other
//     on a phone), an intro that says what the code does (the 30 days'
//     median, the per-pixel middle of the normal years, the range only for
//     the app's Below and Above normal, the half-clear rule only for the
//     passes harvest timing reads), the condition with its three formulas
//     (the health score and water score, held between 0 and 1, and the
//     stress rule's thresholds) beside its laboratory (ConditionLab.jsx;
//     its arithmetic is checked in components/conditionLab.test.js), the
//     notes on how fields, crop and damage are found (about two sentences
//     each), and what it cannot see; every number it quotes comes from
//     site.js (FIELD_METHOD, NUMBERS), each FIELD_METHOD value equals the
//     app's own rule (src/lib/field/method.js, crops.js, the server's Earth
//     Engine code, the docs), and the page does not load the app's method
//     (it would add to every page's first load);
//   - pages.css uses only the tokens defined by src/site/site.css and none
//     of the things the website brief bans (shadows, gradients, monospace),
//     sets no cursor of its own (the site's pin stays), keeps the menu bar's
//     frame on wide screens, and gives back the spacings site.css's element
//     resets would cancel;
//   - the sitemap lists no unlisted page;
//   - the gate laboratory's two formulas give the answers the method says.
//
// WHO EDITS IT
// Whoever changes these pages. Run: node --test src/site/pages/site-pages.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
// Every page module in this folder (the stylesheet-order check).
import { readdirSync } from "node:fs";
import { CONTACT_EMAIL, DEMO_DOORS, LINKS, NUMBERS, SITE } from "../content/site.js";
// The Field part's numbers (site.js FIELD_METHOD) and the app's rules they
// must match, so what the Methodology page says is checked against the app.
import { FIELD_METHOD } from "../content/site.js";
import { HEAVY_DAMAGE } from "../../lib/atlas/method.js";
import {
  BARE_NDVI,
  BASELINE,
  CLEAR_PIXEL_SCORE,
  CONDITION_CLASSES,
  CONDITION_WEIGHTS,
  CROP_PROFILES,
  DAMAGED_CONDITION_MAX,
  DAMAGE_RULES,
  HEALTH_SPAN,
  MIN_CLEAR_SHARE,
  RADAR_CHANGE_DB,
  RED_EDGE_RULES,
  STRESSED_CONDITION_MAX,
  STRESS_RULES,
  WATER_SPAN,
  conditionClass,
  stressLevel,
} from "../../lib/field/method.js";
import { detectionWindows } from "../../lib/season.js";

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

// What a visitor can see: the text between the tags and the double-quoted
// strings (JavaScript names such as error.code are left out).
function visible(name) {
  const text = words(name);
  const between = [...text.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  const quoted = [...text.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]);
  return [...between, ...quoted].join(" | ");
}

// The text of every h1 and h2 in a page, in order.
function headings(name) {
  return [...words(name).matchAll(/<(h[12])\b[^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => ({ tag: m[1], text: m[2].replace(/\s+/g, " ").trim() }));
}

// The part of a page's source between two markers.
function between(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `"${from}" comes before "${to}"`);
  return source.slice(start, end);
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

test("a page that leaves puts the site's title back only if the next page has not set its own", () => {
  // The pages' changes overlap: the next page can set its title before this
  // one has gone, and putting back the title from before this page left the
  // tab naming a page the visitor had left (19 of 40 moves through the menu).
  const hooks = readFileSync(join(here, "..", "hooks.js"), "utf8");
  const hook = between(hooks, "export function usePageTitle", "\n}\n");
  assert.match(hook, /const title = pageTitle\(sub\);\s*document\.title = title;/);
  assert.match(hook, /if \(document\.title === title\) document\.title = pageTitle\(\);/);
  assert.doesNotMatch(hook, /const before = document\.title/);
});

// Each page's stylesheet beats site.css's rules of the same weight only
// when it comes after it in the page. Which page's code runs first depends
// on how the page was opened (fresh, through the menu, fetched ahead), so
// every page module loads site.css itself, before its own sheet: the
// module runs once, and site.css is always in the page first (the review
// of 3 November 2026 found pages.css before site.css on every fresh /story
// on the dev server, and the Story's links without their underline).
test("every page module loads site.css before its own stylesheet", () => {
  const modules = readdirSync(here).filter((name) => name.endsWith(".jsx"));
  for (const page of ["HomePage.jsx", "StoryPage.jsx", "MethodPage.jsx", "ContactPage.jsx", "DemoPage.jsx", "OwnerPage.jsx", "NotFoundPage.jsx", "RegisterPage.jsx", "SignInPage.jsx"]) {
    assert.ok(modules.includes(page), `${page} is one of them`);
  }
  for (const name of modules) {
    const sheets = [...read(name).matchAll(/^import "([^"]+\.css)";/gm)].map((m) => m[1]);
    const own = sheets.find((sheet) => sheet.startsWith("./"));
    assert.ok(own, `${name} has a stylesheet of its own`);
    assert.equal(sheets[0], "../site.css", `${name} loads ../site.css first (its sheets: ${sheets.join(", ")})`);
    assert.ok(sheets.indexOf("../site.css") < sheets.indexOf(own), `${name} loads site.css before ${own}`);
  }
  // The frame too: site.css is its first import, before the menu and the footer bring their sheets, so on a
  // fresh About or Methodology page (whose code may run after the frame's) site.css still comes first.
  const shell = readFileSync(join(here, "..", "SiteShell.jsx"), "utf8");
  assert.match(shell.match(/^import [^\n]+$/m)[0], /^import "\.\/site\.css";$/, "SiteShell.jsx imports site.css first");
});

test("no page imports a component the second website removed", () => {
  for (const name of PAGES) {
    const source = read(name);
    for (const gone of REMOVED) assert.ok(!source.includes(`/${gone}.jsx`), `${name} does not import ${gone}`);
  }
});

// The class names a page's JSX gives its elements ("pg story-page", and
// each quoted name inside className={...}).
function classNames(name) {
  const text = words(name);
  const lists = [...text.matchAll(/className="([^"]+)"/g)].map((m) => m[1]);
  for (const m of text.matchAll(/className=\{([^}]+)\}/g)) lists.push(...[...m[1].matchAll(/"([^"]+)"/g)].map((q) => q[1]));
  return new Set(lists.flatMap((list) => list.split(/\s+/)).filter(Boolean));
}

test("the Story is its title, the five steps of the roots and the three editions, in that order, and nothing else", () => {
  const list = headings("StoryPage.jsx");
  assert.deepEqual(
    list.map((h) => h.text),
    ["Forged in Three Generations", "First edition", "Second edition", "Third edition"],
  );
  assert.equal(list[0].tag, "h1");
  // The browser tab still says Story.
  assert.match(read("StoryPage.jsx"), /usePageTitle\("Story"\)/);
  const text = words("StoryPage.jsx");
  // The five steps, in the owner's order: the table, the visit, Ukraine,
  // building it, Penn (the last step now; no "At Penn" section).
  assert.deepEqual(
    [...text.matchAll(/say: "([^"]+)"/g)].map((m) => m[1]),
    [
      "For three generations, one story was told at William’s family table.",
      "The summer after his freshman year, William went to see that land.",
      "Then he saw the same story on the same black soil, in Ukraine.",
      "He built it for Ukraine, then for everyone.",
      "William took that story with him to a business program at the University of Pennsylvania.",
    ],
  );
  assert.doesNotMatch(text, /At Penn|story-penn|story-meal|Where Chernozem comes from/);
  // The facts the owner gave this round, as he gave them (with the
  // characters that keep a line from breaking in the wrong place: U+2011,
  // the non-breaking hyphen, and U+00A0, the no-break space after "Dr.").
  const NBSP = String.fromCharCode(0xa0);
  for (const fact of [
    "After the Sino-Japanese War, his great‑grandparents were starving",
    "He visited his relatives in northeastern China and walked the black‑soil plains his family once farmed.",
    "He wanted to build a tool for them.",
    "He chose to build for its farmers first, so they would not go through what his great‑grandparents did.",
    `He spent a year researching chernozem rehabilitation with Dr.${NBSP}Bo Zhao of the University of Washington`,
    "designed gated aggregation and built the first Chernozem Atlas",
    "an internship at ZBDL Land and Resources in Beijing, where he worked on recovering land after disasters",
    "There he met some of his current partners.",
    "with support from people at Penn and in the industry",
  ]) {
    assert.ok(text.includes(fact), `the Story tells "${fact}"`);
  }
  // Never the plain characters there: "Dr." alone at a line's end, or
  // "black-" and "great-" broken from the rest of their word.
  assert.doesNotMatch(text, /Dr\. Bo|great-grandparents|black-soil/, "no line breaks inside a name or a compound");
  // "ten ways" is NUMBERS.paperOperators, written as a word, never typed.
  assert.equal(NUMBERS.paperOperators, 10);
  assert.match(text, /he compared \$\{inWords\(NUMBERS\.paperOperators\)\} ways to rank damaged land/);
  assert.doesNotMatch(text, /compared (ten|10) ways/);
  // What the owner asked to take out.
  for (const gone of ["Who makes it", "What it stands for", "Try it on your own land", "The soil", "Film", "Register", "Polytechnic", "Pasadena"]) {
    assert.ok(!text.includes(gone), `the Story no longer has "${gone}"`);
  }
  assert.ok(!/import Film/.test(read("StoryPage.jsx")), "the Story does not load the film");
});

test("the Story's five steps are an ordered list on the dark band, joined by four drawn arrows that screen readers skip", () => {
  const text = words("StoryPage.jsx");
  // Everything up to the editions is inside the dark band.
  const band = between(text, 'className="pg-sec pg-sec-dark story-roots"', 'className="story-editions"');
  assert.match(band, /<h1 className="pg-h1 pg-display" id="story-title">/);
  // role="list": Safari's screen reader stops calling a list a list once site.css styles its markers away.
  assert.match(band, /<ol className="story-roots-steps" role="list">\s*\{ROOTS\.map\(/);
  assert.equal([...text.matchAll(/^\s*say: "/gm)].length, 5, "five steps");
  // Each step: the statement set large, then its smaller description.
  assert.match(band, /"story-statement pg-fade" : "story-statement"/);
  assert.match(band, /"story-roots-tell pg-fade-2" : "story-roots-tell"/);
  // A description's last two words share a line (Safari before 26 has no
  // text-wrap: pretty; a phone left "it." alone), as on the About page.
  assert.match(band, /\{lastTwoTogether\(text\)\}/);
  const join = vm.runInNewContext(text.match(/const lastTwoTogether = (\(text\) => [^\n]+);\n/)[1]);
  assert.equal(join("and have gradually scaled it."), `and have gradually scaled${String.fromCharCode(0xa0)}it.`);
  // An arrow after every step but the last: four, pointing down.
  assert.match(band, /\{n < ROOTS\.length - 1 \? <DownArrow reveal=\{rootsReveal\} \/> : null\}/);
  const arrow = between(text, "function DownArrow", "\n}\n");
  assert.match(arrow, /<span className="story-roots-next" aria-hidden="true"/);
  assert.match(arrow, /<svg className="story-roots-arrow" viewBox="0 0 20 88" focusable="false">/);
  assert.match(arrow, /className="story-roots-shaft" d="M10 1V86"/);
  assert.match(arrow, /className="story-roots-tip" d="M2 78l8 8 8-8"/);
  // Light on the dark band.
  const css = read("pages.css");
  assert.match(css, /\.story-roots-next \{[^}]*color: var\(--field-dark-muted\);/);
  assert.match(css, /\.story-roots-arrow path \{[^}]*fill: none;[^}]*stroke: currentColor;/);
});

test("the Story's steps rise and its arrows draw only when motion is welcome, and a fast scroll never leaves one unfinished", () => {
  const text = words("StoryPage.jsx");
  const hook = between(text, "function useRootsReveal", "function DownArrow");
  // Without an observer everything is simply there.
  assert.match(hook, /typeof IntersectionObserver === "undefined"\) \{\s*node\.classList\.add\("is-in"\);/);
  // A part above the screen is finished at once, and whatever starts
  // finishes every part above it with it (a fling, a jump to an edition).
  assert.match(hook, /if \(entry\.boundingClientRect\.bottom < 0\) \{\s*finish\(target\);/);
  assert.match(hook, /parts\.slice\(0, parts\.indexOf\(target\) \+ 1\)/);
  // The first screen's parts come after the title and the first step, in
  // reading order; the first step itself is plain CSS on the first frame.
  assert.match(text, /const OPENING_MS = \d+;\s*const STAGGER_MS = \d+;/);
  assert.match(hook, /OPENING_MS \+ STAGGER_MS \* queued\+\+/);
  assert.match(text, /data-rise=\{first \? undefined : ""\}/);
  // pages.css hides the arrows only for visitors who did not ask for
  // reduced motion (data-rise is site.css's, under the same condition).
  const css = read("pages.css");
  const motion = css.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.story-roots-shaft \{[\s\S]*?\n\}\n/);
  assert.ok(motion, "the arrows' entrance sits in a no-preference block");
  assert.match(motion[0], /\.story-roots-next:not\(\.is-in\) \.story-roots-shaft \{\s*transform: scaleY\(0\);/);
  // The head starts where the line starts: its travel is the line's length
  // (the line runs from 1 to 86, the head's point is at 86).
  assert.match(motion[0], /\.story-roots-next:not\(\.is-in\) \.story-roots-tip \{\s*opacity: 0;\s*transform: translateY\(-85px\);/);
  assert.match(text, /d="M10 1V86" \/>\s*<path className="story-roots-tip" d="M2 78l8 8 8-8"/);
  assert.doesNotMatch(css.replace(motion[0], ""), /story-roots[^{}]*:not\(\.is-in\)/, "nothing of the roots is hidden outside it");
  const site = readFileSync(join(here, "..", "site.css"), "utf8");
  assert.match(site, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.js \.site \[data-rise\] \{\s*opacity: 0;/);
});

test("pages.css: the Story's title stands above its steps, which start three columns in on a wide screen", () => {
  const css = read("pages.css");
  assert.match(css, /\.story-roots-head \{\s*grid-column: 1 \/ 13;\s*\}/);
  assert.match(css, /\.story-roots-steps \{\s*grid-column: 1 \/ 13;\s*\}/);
  // Wide: the steps from the page's second line of text (three columns
  // in, as on the About page), a clear step under the title; no sticky
  // title beside a half of the band left empty (the review, 3 November 2026).
  const wide = css.match(/@media \(min-width: 1101px\) \{\s*\.pg \.story-roots-steps \{\s*grid-column: 4 \/ 13;\s*margin-top: (\d+)px;/);
  assert.ok(wide, "the steps three columns in on a wide screen");
  assert.ok(Number(wide[1]) >= 32, "a clear step under the title");
  assert.doesNotMatch(css, /\.story-roots-head \{[^}]*position: sticky/);
  // Below 1100 px the steps take the whole width, a step under the title.
  assert.match(css, /@media \(max-width: 1100px\) \{[\s\S]*?\.pg \.story-roots-steps \{\s*margin-top: 28px;/);
  // The arrows and the statements share one left edge: one axis.
  assert.match(css, /\.story-roots-next \{\s*display: block;\s*width: 20px;/);
  // Two lines at most for the title, on the narrowest phones too.
  assert.match(css, /@media \(max-width: 359px\) \{\s*\.story-roots \.pg-display \{\s*font-size: var\(--step-head\);/);
  // The old meal and Penn rules are gone with their section.
  assert.doesNotMatch(css, /story-meal|story-penn/);
});

test("no class of the Story page is one the About page's sideways stories style", () => {
  // scrollstory.css styles ".site .story" and its parts; once the About
  // page has been opened its rules stay in the browser, and ".story" on
  // this page's outer box added a light band above the black soil.
  const used = classNames("StoryPage.jsx");
  assert.ok(used.has("story-page") && !used.has("story"), "the page's outer box is story-page");
  const scroll = readFileSync(join(here, "..", "components", "scrollstory.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const styled = new Set([...scroll.matchAll(/\.(story[a-z0-9-]*)/g)].map((m) => m[1]));
  assert.ok(styled.has("story"), "scrollstory.css still styles .story (the reason for this check)");
  for (const name of used) assert.ok(!styled.has(name), `scrollstory.css does not style .${name}`);
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

test("the Story counts ACLED's events as events, and links the Dataverse deposit under the Second edition", () => {
  const source = words("StoryPage.jsx");
  // ACLED counts events (one event can hold many explosions).
  assert.match(source, /\{formatInt\(NUMBERS\.acledEvents\)\} recorded explosion and remote-violence events from ACLED/);
  assert.doesNotMatch(source, /explosions and remote attacks/);
  // The deposit is the Recovery Atlas's package: its link sits in the
  // Second edition; the First edition only says it became the paper.
  const first = between(source, 'id="first-edition"', 'id="second-edition"');
  const second = between(source, 'id="second-edition"', 'id="third-edition"');
  assert.match(first, /it became a research paper ranking \{NUMBERS\.paperOblasts\} oblasts/);
  assert.doesNotMatch(first, /LINKS\.paper|Dataverse/);
  assert.match(second, /href=\{LINKS\.paper\}/);
  assert.match(second, /Its data and code are on Harvard Dataverse/);
  assert.equal(LINKS.paper, "https://doi.org/10.7910/DVN/IYXPVS");
});

test("the Story's Second edition is the first Chernozem Atlas the fourth step names: for Ukraine only, before Field", () => {
  // The owner (2026-11-03): when he made the second edition he had only a
  // Chernozem Atlas, for Ukraine alone, and no Field; Field came with the
  // third. The fourth step keeps his "built the first Chernozem Atlas".
  const source = words("StoryPage.jsx");
  const first = between(source, 'id="first-edition"', 'id="second-edition"');
  const second = between(source, 'id="second-edition"', 'id="third-edition"');
  const third = between(source, 'id="third-edition"', "</section>");
  assert.ok(source.includes("designed gated aggregation and built the first Chernozem Atlas"));
  assert.match(second, /<p>The Chernozem Recovery Atlas, a web page run on a laptop\. It was the first Chernozem Atlas, for Ukraine only\. There was no Field&nbsp;yet\.<\/p>/);
  assert.doesNotMatch(first, /\bField\b/, "the First edition had no Field");
  assert.match(third, /<p>Field reads a farmer’s own fields/, "Field arrives with the Third edition");
});

test("a page title's mask leaves room for the tails of g, p and y, and nothing after the title moves", () => {
  // A title's line is 0.88 to 0.92 of its size, so the tails of "Forged"
  // and "Try the demo" hung below a mask that ended at the line, and were
  // cut off. The mask reaches a fifth of the largest title size lower and
  // gives that back below itself; the rise starts as much lower, so the
  // title still starts out of sight.
  const css = read("pages.css");
  const mask = css.match(/\n\.pg-mask \{([^}]*)\}/)[1];
  assert.match(mask, /overflow: hidden;/);
  assert.match(mask, /padding-bottom: calc\(var\(--step-display\) \* 0\.2 \+ 0\.08em\);/);
  assert.match(mask, /margin-bottom: calc\(var\(--step-display\) \* -0\.2\);/);
  assert.match(css, /@keyframes pg-rise \{\s*from \{\s*transform: translateY\(calc\(104% \+ 0\.2em\)\);/);
  // Each page's one mask holds its title, no larger than the display size.
  for (const page of PAGES) {
    const masks = [...words(page).matchAll(/<div className="pg-mask">\s*<(\w+) className="([^"]+)"/g)];
    assert.equal(masks.length, 1, `${page} has one title mask`);
    assert.equal(masks[0][1], "h1", `${page}: the mask holds the title`);
    assert.match(masks[0][2], /^pg-h1( pg-display)?$/, `${page}: the title is heading or display size`);
  }
});

test("the Story credits the base maps its old maps were drawn on", () => {
  const source = words("StoryPage.jsx");
  const first = between(source, 'id="first-edition"', 'id="second-edition"');
  const second = between(source, 'id="second-edition"', 'id="third-edition"');
  // The first edition's maps: OpenStreetMap, and ACLED for the attacks.
  assert.match(first, /className="story-credit"/);
  assert.match(first, /Base maps ©/);
  assert.match(first, /https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.match(first, /contributors\. Attacks:/);
  assert.match(first, /https:\/\/acleddata\.com\//);
  // The Recovery Atlas's map: OpenFreeMap (OpenMapTiles, OpenStreetMap).
  assert.match(second, /Base map:/);
  assert.match(second, /https:\/\/openfreemap\.org\//);
  assert.match(second, /OpenMapTiles/);
  assert.match(second, /OpenStreetMap/);
});

test("the Story's Third edition sets plant health, water and stress against 2019 to 2021, and harvest timing apart, as the other pages do", () => {
  // Harvest timing is read from this season's curve, heat units and radar,
  // never from the normal years (src/lib/field/method.js harvestStage and
  // combineHarvestEstimate); the About page and the Methodology say so too.
  const third = between(words("StoryPage.jsx"), 'id="third-edition"', "</section>");
  assert.match(third, /<p>Field reads a farmer’s own fields on every clear Sentinel-2 pass: plant health, water and stress against 2019 to 2021, and harvest timing\.<\/p>/);
  assert.doesNotMatch(third, /harvest timing, against/);
});

test("the Demo page is the two doors and the Register line, and nothing about a code", () => {
  const source = read("DemoPage.jsx");
  const text = words("DemoPage.jsx");
  assert.equal(headings("DemoPage.jsx")[0].text, "Try the demo");
  assert.ok(text.includes("The demo is Ukraine, where Chernozem started: a farm near Kupiansk in Field, and the whole country in Atlas."));
  assert.match(source, /import \{ enterDemo \} from "\.\.\/\.\.\/lib\/demoMode\.js"/);
  assert.match(text, /onClick=\{enterDemo\}/, "a door switches the tab to the demo before the app opens");
  assert.match(text, /DEMO_DOORS\.map\(/);
  assert.match(text, /to=\{door\.to\}/);
  assert.equal(SITE.appPath, "/field");
  assert.equal(SITE.atlasPath, "/atlas");
  assert.deepEqual(
    DEMO_DOORS.map((door) => [door.to, door.label]),
    [
      ["/field", "Open Field"],
      ["/atlas", "Open Atlas"],
    ],
  );
  assert.ok(text.includes("Want your own fields or region? Register, it’s free."));
  for (const gone of ["signIn", "getAuthStatus", "Access code", "code", "What is in the demo", "Without a code", "twelve"]) {
    assert.ok(!text.includes(gone), `the Demo page no longer has "${gone}"`);
  }
});

test("the doors use the half-size computer screens, and a phone never downloads them", () => {
  for (const door of DEMO_DOORS) {
    // The -960 copy, shown at its own size (a readable piece of the screen).
    assert.match(door.wide.src, /-960\.webp$/, `${door.key}: the computer screen is the half-size copy`);
    assert.equal(door.wide.width, 960);
    assert.ok(door.wide.position, `${door.key}: the door says which piece of the screen it shows`);
    assert.match(door.phone.src, /^\/site\/shots\/phone-/);
    for (const picture of [door.wide.src, door.phone.src]) assert.ok(existsSync(join(root, "public", picture)), `${picture} exists`);
  }
  for (const name of ["DemoPage.jsx", "OwnerPage.jsx"]) {
    const text = words(name);
    // Hidden on a phone, and lazy, so a phone never fetches it.
    assert.match(text, /<img src=\{door\.wide\.src\}[^>]*loading="lazy"[^>]*style=\{\{ objectPosition: door\.wide\.position \}\}/, `${name}: the computer screen is lazy and cropped`);
  }
  const css = read("pages.css");
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.match(phone, /\.dm-door-wide \{\s*display: none;/, "on a phone the computer screen is not shown");
  assert.match(phone, /\.dm-door-label,\s*\.dm-door-caption \{\s*order: -1;/, "on a phone the button comes first");
  assert.match(css, /\.pg \.dm-door-wide img \{\s*object-fit: none;/, "the computer screen is shown at its own size");
});

test("the Contact page says where messages go and keeps only the form", () => {
  const text = words("ContactPage.jsx");
  assert.equal(CONTACT_EMAIL, "chernozem.app@gmail.com");
  // The owner's sentence, the address a mailto link: "Messages go to
  // chernozem.app@gmail.com. Feel free to email us directly as well."
  assert.match(text, /Messages go to <a href=\{`mailto:\$\{CONTACT_EMAIL\}`\}>\{CONTACT_EMAIL\}<\/a>\. Feel free to email us directly as well\.\s*<\/p>/);
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
  for (const role of ["Farmer", "Government or NGO", "Corporation", "Researcher", "Something else"]) {
    assert.ok(text.includes(`value: "${role}"`), `"${role}" is one of the choices`);
    assert.ok(role.length <= 60, "a role fits the server's 60 characters");
  }
  // A corporation gets a prompt of its own, like every other choice.
  assert.match(text, /\{ value: "Corporation", prompt: "[^"]{20,}\?" \}/);
});

test("who you are is five plain words, not pictures, and every row of them is filled", () => {
  const text = words("ContactPage.jsx");
  const roles = between(text, "const ROLES = [", "];");
  assert.equal((roles.match(/\{ value: "/g) || []).length, 5, "five choices");
  assert.doesNotMatch(roles, /src:|width:|height:|position:|zoom:/, "the choices carry no picture");
  assert.doesNotMatch(text, /ct-role-pic|ct-role-frame/);
  // Each choice is the word's own label around a real radio button.
  assert.match(text, /<label key=\{item\.value\} className="ct-role"[^>]*>\s*<input className="ct-role-input" type="radio" name="role"/);
  const css = read("pages.css");
  assert.match(css, /\.ct-role-row \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/, "one row of five");
  assert.match(css, /\.ct-role \{[^}]*min-height: 48px;/, "48 px tall");
  // Just over 1100 px the half of the form is too narrow for five: three
  // above, two below, on a grid of six (2 + 2 + 2, then 3 + 3).
  const narrow = between(css, "@media (min-width: 1101px) and (max-width: 1240px) {", "\n}\n");
  assert.match(narrow, /\.ct-role-row \{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
  assert.match(narrow, /\.ct-role \{\s*grid-column: span 2;/);
  assert.match(narrow, /\.ct-role:nth-child\(n \+ 4\) \{\s*grid-column: span 3;/);
  // A phone: two by two, and the fifth across the whole row.
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.match(phone, /\.ct-role-row \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, "two by two on a phone");
  assert.match(phone, /\.ct-role:last-child:nth-child\(odd\) \{\s*grid-column: 1 \/ -1;/, "the odd one out takes the whole row");
  // The product's phone screens stand beside the form on wide screens only,
  // and are never fetched where they are hidden.
  assert.match(text, /className="ct-phone"[^>]*loading="lazy"/);
  const tablet = css.slice(css.indexOf("@media (max-width: 1100px)"), css.indexOf("@media (max-width: 700px)"));
  assert.match(tablet, /\.ct-phones \{\s*display: none;/);
});

test("after sending, Contact says the message was received and moves the keyboard to it", () => {
  const text = words("ContactPage.jsx");
  // True whether or not the server can e-mail yet (a message waits there
  // until e-mail is set up), and no promise of a reply.
  assert.match(text, /Your message was received\. Any reply will go to \{sentTo\}\./);
  assert.doesNotMatch(text, /on its way/);
  assert.doesNotMatch(text, /The reply will come/);
  // The keyboard's place: the "Thank you." heading, which can take focus.
  assert.match(text, /<h2 className="pg-h2 ct-done-title" tabIndex=\{-1\} ref=\{doneTitle\}>/);
  assert.match(text, /if \(sentTo\) doneTitle\.current\?\.focus\(\);/);
  // "Send another" puts it back on Name.
  assert.match(text, /getElementById\("ct-name"\)\?\.focus\(\)/);
  assert.match(text, /<input id="ct-name"/);
  // The server's own words for a refusal, with the address made a link
  // (the "busy" answer asks the visitor to write to it).
  assert.match(text, /\{withMailLink\(error\)\}/);
  assert.match(text, /\.split\(CONTACT_EMAIL\)/);
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

test("the Owner page is unlisted and signs in with the Chernozem Google account, never a code", () => {
  const source = read("OwnerPage.jsx");
  const text = words("OwnerPage.jsx");
  assert.match(source, /usePageTitle\("Owner sign-in"\)/);
  assert.match(text, /meta\.name = "robots"/);
  assert.match(text, /meta\.content = "noindex, nofollow"/);
  assert.match(text, /return \(\) => meta\.remove\(\)/, "the noindex line leaves with the page");
  // Google through Firebase, then our server, then who this browser is.
  assert.match(source, /import \{ getStatus, logoutEverywhere, postFirebaseToken \} from "\.\.\/\.\.\/api\/accountApi\.js"/);
  assert.match(source, /import \{ loadFirebaseAuth \} from "\.\.\/\.\.\/lib\/firebase\.js"/);
  assert.match(text, /signInWithPopup\(module\.auth, module\.googleProvider\(\)\)/);
  assert.match(text, /await postFirebaseToken\(idToken\)/);
  assert.match(text, /const status = await getStatus\(\)/);
  assert.ok(text.includes("Sign in with the Chernozem Google account"));
  // No code: no field, no old sign-in, no word of it.
  assert.doesNotMatch(text, /<input|<form|type="password"/);
  assert.doesNotMatch(source, /atlasApi|signIn\(typed|\/api\/auth\/login/);
  assert.doesNotMatch(visible("OwnerPage.jsx"), /\bcode\b/i);
  for (const gone of ["Type the code", "That code is not right", "<span>Code</span>", "ow-code", "owner’s key"]) assert.ok(!text.includes(gone), `the Owner page no longer has "${gone}"`);
  // The server decides who the owner is ("mode"); the page never compares
  // e-mail addresses itself.
  assert.match(text, /status\?\.mode === "owner"/);
  assert.doesNotMatch(text, /chernozem\.app@gmail\.com|OWNER_EMAILS/);
  // The owner's doors open the app outside the demo view.
  assert.match(text, /leaveDemo\(\)/);
  assert.match(text, /onClick=\{leaveDemo\}/);
  assert.match(text, /to=\{door\.to\}/);
  // Anyone else is told plainly and may sign out.
  assert.ok(text.includes("This Google account is not the owner’s."));
  assert.match(text, /onClick=\{signOut\}/);
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
    assert.doesNotMatch(text, new RegExp(`${CHALLENGE}|LINKS\\.cac`), `${name} does not name the app challenge`);
    assert.doesNotMatch(text, /\b1[23] fields\b|twelve fields|DEMO\.fields/i, `${name} prints no field count`);
  }
  // No link to it either.
  assert.equal(LINKS.cac, undefined, "the app challenge is named nowhere, so there is no link to it");
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

test("the Methodology page is two parts, Field and Atlas, each with its film, then Behind it, the three-minute film and a short close", () => {
  const source = read("MethodPage.jsx");
  const list = headings("MethodPage.jsx");
  assert.deepEqual(
    list.map((h) => h.text),
    ["How Chernozem works", "Field", "Atlas", "Behind it", "Chernozem in three minutes", "Run it on your own land"],
  );
  assert.equal(list[0].tag, "h1");
  assert.equal((source.match(/<h3\b/g) || []).length, 0, "no sub-sub-headings");
  assert.doesNotMatch(source, /meth-toc|\bPARTS\b|On this page/, "no row of in-page links under the title");
  // The old addresses (src/App.jsx: /product, /guide, /technology, /design)
  // still land on the matching block.
  for (const id of ["scores", "gate", "demo", "product", "use", "checks", "technology", "design"]) {
    assert.ok(source.includes(`id="${id}"`), `MethodPage keeps #${id}`);
  }
  // An id written on <Reveal>, <Stagger> or <StaggerItem> reaches the page
  // only if the component passes it on (motion.jsx); otherwise /guide lands
  // at the top of the page instead of on "How to use it".
  const motionSource = readFileSync(join(here, "..", "components", "motion.jsx"), "utf8");
  for (const name of ["Reveal", "Stagger", "StaggerItem"]) {
    const fn = motionSource.slice(motionSource.indexOf(`export function ${name}(`));
    const head = fn.slice(0, fn.indexOf(")"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.match(head, /\bid\b/, `${name} takes an id`);
    assert.match(body, /<Tag\s+id=\{id\}/, `${name} puts the id on its element`);
  }
  // One walkthrough film per product, right after the sentence that says
  // what the product is.
  assert.match(source, /import Walkthrough from "\.\.\/components\/Walkthrough\.jsx"/);
  const field = between(source, 'id="product"', 'id="atlas"');
  const atlas = between(source, 'id="atlas"', 'id="technology"');
  const behind = between(source, 'id="technology"', 'id="film"');
  const film = between(source, 'id="film"', 'id="meth-close"');
  assert.match(field, /className="pg-lead meth-what"[\s\S]*<Walkthrough product="field"[\s\S]*FIELD_STEPS\.map[\s\S]*What it reads\./);
  assert.match(atlas, /className="pg-lead meth-what"[\s\S]*<Walkthrough product="atlas"/);
  // Next to each name, what it is, plainly (the owner: "describe what it
  // is clearly", no paragraph of features). Atlas names whom it is for and
  // keeps Ukraine as the demo, where Chernozem started.
  const what = (part) => part.match(/<p className="pg-lead meth-what">([^<]+)<\/p>/)[1];
  assert.equal(what(field), "Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.");
  assert.equal(what(atlas), "Atlas is Chernozem for a whole region, for governments, NGOs and corporations: it scores every square of farmland and ranks where recovery should start. Ukraine is the demo because that is where Chernozem started.");
  for (const part of [field, atlas]) {
    const sentence = what(part);
    assert.ok(sentence.split(/(?<=\.)\s+/).length <= 2, `"${sentence.slice(0, 30)}…" is one or two sentences`);
    assert.ok(sentence.split(/\s+/).length <= 40, `"${sentence.slice(0, 30)}…" stays short`);
  }
  assert.doesNotMatch(source, /communism/i);
  // After "Behind it", the three-minute film (Film.jsx) under its own
  // heading, with the film's own five chapters; it is no longer the About page's.
  assert.match(source, /import Film from "\.\.\/components\/Film\.jsx"/);
  assert.match(source, /<section className="pg-sec pg-sec-surface" id="film" aria-labelledby="meth-film-title">/);
  assert.match(film, /<h2 className="pg-h2" id="meth-film-title">\s*Chernozem in three minutes\s*<\/h2>[\s\S]*<div className="meth-film">\s*<Film \/>\s*<\/div>/);
  assert.ok(source.indexOf("<Film />") > source.indexOf('id="meth-behind"'), "the film comes after Behind it");
  assert.ok(source.indexOf("<Film />") < source.indexOf('id="meth-close"'), "and before the close");
  assert.equal((source.match(/<Film\b/g) || []).length, 1, "the film once");
  // The close: "Register for Chernozem" (never "Register for Field" or "for Field or Atlas").
  assert.match(words("MethodPage.jsx"), /Register for Chernozem and read the first pass yourself\./);
  assert.doesNotMatch(words("MethodPage.jsx"), /Register for (Field|Atlas)/);
  // The owner's favourite parts stay: the scores, the gate with its
  // sliders and the two time frames, the ranking as the app shows it
  // (untouched, a piece of the product), the checks and the limits.
  for (const kept of ["<dt>Value</dt>", "<dt>Damage</dt>", "<dt>Feasibility</dt>", "<GateLab />", "Near term:", "Post-crisis:", "<ProofTable />", "What it cannot do."]) {
    assert.ok(atlas.includes(kept), `the Atlas part keeps ${kept}`);
  }
  assert.match(atlas, /<div data-ui>\s*<DemoRanking \/>/);
  assert.doesNotMatch(source, /DemoRanking\s+[a-z]+=/, "DemoRanking takes no props");
  // Behind it: the datasets in one line, the stack in one line, the links.
  assert.match(behind, /listOf\(DATASETS\.map\(\(item\) => item\.name\)\)/);
  assert.match(behind, /listOf\(STACK\.map\(\(item\) => item\.name\)\)/);
  assert.match(behind, /href=\{LINKS\.github\}/);
  assert.match(behind, /href=\{LINKS\.paper\}/);
  assert.match(words("MethodPage.jsx"), /The demo is open to everyone and read-only\./);
});

test("the walkthrough films: one per product, with a poster and chapters, two to three minutes, under 25 MB", () => {
  const source = readFileSync(join(here, "..", "components", "Walkthrough.jsx"), "utf8");
  assert.ok(source.startsWith("// WHAT THIS FILE DOES"), "Walkthrough.jsx carries the file header");
  assert.ok(source.includes("// WHO EDITS IT"));
  // Nothing downloads until play; the poster waits until the film is near.
  assert.match(source, /preload="none"/);
  assert.match(source, /playsInline/);
  assert.match(source, /<video[^>]* controls[^>]*>/);
  assert.match(source, /poster=\{near \? files\.poster : undefined\}/);
  assert.match(source, /fetch\(WALKTHROUGHS_URL\)/);
  assert.match(source, /className="wk-chapter/);
  assert.doesNotMatch(source, /figcaption/, "nothing is written under a film but its chapters");
  const film = join(root, "public", "site", "film");
  const list = JSON.parse(readFileSync(join(film, "walkthroughs.json"), "utf8"));
  for (const product of ["field", "atlas"]) {
    const info = list[product];
    assert.ok(info, `${product} is in walkthroughs.json`);
    assert.equal(info.src, `/site/film/${product}-walkthrough.mp4`);
    assert.equal(info.poster, `/site/film/${product}-walkthrough-poster.jpg`);
    assert.equal(info.width, 1440);
    assert.equal(info.height, 900);
    assert.ok(existsSync(join(root, "public", info.poster)), `${product}: the poster exists`);
    const size = statSync(join(root, "public", info.src)).size;
    assert.ok(size < 25 * 1024 * 1024, `${product}: ${size} bytes is under 25 MB`);
    assert.ok(info.seconds >= 120 && info.seconds <= 180, `${product}: ${info.seconds} s is two to three minutes`);
    assert.ok(info.chapters.length >= 6, `${product}: at least six chapters`);
    let last = -1;
    for (const chapter of info.chapters) {
      assert.ok(chapter.label.length > 0 && chapter.t > last && chapter.t < info.seconds, `${product}: chapter "${chapter.label}" at ${chapter.t} s is in order and inside the film`);
      assert.doesNotMatch(chapter.label, new RegExp(`·|${CHALLENGE}`), `${product}: "${chapter.label}" has no middle dot and no challenge`);
      last = chapter.t;
    }
  }
  // The component's own paths match the files on disk.
  assert.ok(source.includes('src: "/site/film/field-walkthrough.mp4?v=narrated"'));
  assert.ok(source.includes('src: "/site/film/atlas-walkthrough.mp4?v=narrated"'));
});

// The film's own caption sits where the player's controls cover it (paused,
// and on a phone), so the chapter list says which step is playing.
test("under each film the chapter playing now is marked: aria-current and an ink fill, at once when pressed and as the film plays", () => {
  const source = readFileSync(join(here, "..", "components", "Walkthrough.jsx"), "utf8");
  // One state for the eye and for screen readers: pages.css styles aria-current itself.
  assert.match(source, /<button type="button" className="wk-chapter" aria-current=\{i === current \? "true" : undefined\} onClick=\{\(\) => jump\(c\.t, i\)\}>/);
  assert.doesNotMatch(source, /is-on/);
  // It follows the film as it plays, and when the film is moved on its own timeline.
  assert.match(source, /onTimeUpdate=\{follow\}/);
  assert.match(source, /onSeeked=\{settled\}/);
  assert.match(source, /onPlay=\{follow\}/);
  assert.match(source, /setCurrent\(chapterAt\(chapters, video\.currentTime, video\.paused\)\)/);
  // A pressed chapter is marked at once, before the film has even loaded.
  const jump = source.slice(source.indexOf("const jump = (t, index) =>"));
  assert.match(jump.slice(0, jump.indexOf("video.currentTime = t;")), /pressed\.current = t;\s*setCurrent\(index\);/);
  const css = read("pages.css");
  // One look for the chapters under all three films on the page (the walkthroughs' and Film.jsx's).
  assert.match(css, /\.pg \.wk-chapter\[aria-current="true"\],\s*\.pg \.film-chapter\[aria-current="true"\] \{\s*background: var\(--ink\);\s*color: var\(--bg\);\s*\}/);
  // Pointing at a chapter only underlines it, so it never looks like the one playing.
  const looks = [...css.matchAll(/([^{}]*\.(?:wk|film)-chapter(?::hover|\[data-near\])[^{}]*)\{([^}]*)\}/g)];
  assert.ok(looks.length >= 2, "a hover look and a pin-near look");
  for (const kind of ["wk", "film"]) {
    assert.ok(looks.some(([, selector]) => selector.includes(`.${kind}-chapter:hover`)), `.${kind}-chapter has a hover look`);
    assert.ok(looks.some(([, selector]) => selector.includes(`.${kind}-chapter[data-near]`)), `.${kind}-chapter has a pin-near look`);
  }
  for (const [, selector, body] of looks) {
    assert.match(body, /text-decoration-color: currentColor;/, `${selector.trim()} underlines`);
    assert.doesNotMatch(body, /background/, `${selector.trim()} does not fill`);
  }
});

// chapterAt, taken from the component's source (JSX, which node cannot import).
function walkthroughChapterAt() {
  const source = readFileSync(join(here, "..", "components", "Walkthrough.jsx"), "utf8");
  const start = source.indexOf("export function chapterAt");
  const end = source.indexOf("\n}\n", start);
  assert.ok(start > 0 && end > start, "chapterAt is where the file says");
  const context = {};
  vm.runInNewContext(`${source.slice(start, end + 2).replace("export function", "function")}\nthis.chapterAt = chapterAt;`, context);
  return context.chapterAt;
}

test("the chapter playing at a time: the last one started, none before the first or on an unplayed film", () => {
  const chapterAt = walkthroughChapterAt();
  const films = JSON.parse(readFileSync(join(root, "public", "site", "film", "walkthroughs.json"), "utf8"));
  for (const product of ["field", "atlas"]) {
    const { chapters, seconds } = films[product];
    assert.equal(chapterAt(chapters, 0, true), -1, `${product}: an unplayed film marks nothing`);
    assert.equal(chapterAt(chapters, chapters[0].t - 1, false), -1, `${product}: before the first chapter, nothing`);
    // A chapter well apart from the one before it.
    const i = chapters.findIndex((c, k) => k > 0 && c.t - chapters[k - 1].t > 2);
    assert.ok(i > 0, `${product}: two chapters more than 2 s apart`);
    assert.equal(chapterAt(chapters, chapters[i].t, false), i, `${product}: a jump to "${chapters[i].label}" is in it`);
    assert.equal(chapterAt(chapters, chapters[i].t - 0.2, true), i, `${product}: a quarter of a second early counts`);
    assert.equal(chapterAt(chapters, chapters[i].t - 1, true), i - 1, `${product}: paused just before it, the part before stays marked`);
    assert.equal(chapterAt(chapters, seconds, true), chapters.length - 1, `${product}: at the end, the last chapter`);
  }
});

// The "moov" box of an MP4 file: where its tracks are described (read box
// by box from the top of the file, so a 36 MB film is not read whole).
function mp4Moov(file) {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const head = Buffer.alloc(16);
    let at = 0;
    while (at + 8 <= size) {
      readSync(fd, head, 0, 16, at);
      let boxSize = head.readUInt32BE(0);
      let headerSize = 8;
      if (boxSize === 1) {
        boxSize = Number(head.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) boxSize = size - at;
      if (head.toString("latin1", 4, 8) === "moov") {
        const body = Buffer.alloc(boxSize - headerSize);
        readSync(fd, body, 0, body.length, at + headerSize);
        return body;
      }
      if (boxSize < 8) break;
      at += boxSize;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

// A film's length in seconds, from its "mvhd" box (version 0 or 1).
function mp4Seconds(moov) {
  const at = moov.indexOf("mvhd");
  const v1 = moov[at + 4] === 1;
  const timescale = moov.readUInt32BE(at + (v1 ? 24 : 16));
  const duration = v1 ? Number(moov.readBigUInt64BE(at + 28)) : moov.readUInt32BE(at + 20);
  return duration / timescale;
}

test("the three-minute film: two copies with their sound, a poster, its five chapters inside it, and only downloaded on play", () => {
  const source = readFileSync(join(here, "..", "components", "Film.jsx"), "utf8");
  assert.ok(source.startsWith("// WHAT THIS FILE DOES"), "Film.jsx carries the file header");
  assert.ok(source.includes("// WHO EDITS IT"));
  assert.match(source, /on the Methodology page/);
  assert.doesNotMatch(source, /used on the About page/);
  // Nothing downloads until play; the poster waits until the film is near;
  // a phone gets the smaller copy.
  assert.match(source, /preload="none"/);
  assert.match(source, /playsInline/);
  assert.match(source, /<video[^>]* controls[^>]*>/);
  assert.match(source, /poster=\{near \? POSTER_SRC : undefined\}/);
  assert.match(source, /window\.matchMedia\("\(max-width: 700px\)"\)\.matches \? FILM_SMALL_SRC : FILM_SRC/);
  // The files, and both copies keep their picture and their sound.
  const film = join(root, "public", "site", "film");
  const big = join(film, "chernozem-2026.mp4");
  const small = join(film, "chernozem-2026-small.mp4");
  assert.ok(existsSync(join(film, "chernozem-2026-poster.jpg")), "the poster exists");
  assert.ok(statSync(small).size < statSync(big).size, "the phone's copy is the smaller one");
  let seconds = 0;
  for (const file of [big, small]) {
    const moov = mp4Moov(file);
    assert.ok(moov, `${file}: the film describes its tracks`);
    assert.ok(moov.includes("vide"), `${file}: a picture track`);
    assert.ok(moov.includes("soun") && moov.includes("mp4a"), `${file}: a sound track (AAC)`);
    seconds = mp4Seconds(moov);
    assert.ok(seconds > 170 && seconds < 190, `${file}: about three minutes (${seconds.toFixed(1)} s)`);
  }
  // Its own five chapters, at the times checked frame by frame, inside the film.
  const block = between(source, "export const FILM_CHAPTERS = [", "];");
  const chapters = [...block.matchAll(/\{ label: "([^"]+)", t: (\d+) \}/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(chapters, [
    ["Northeastern China", 4],
    ["Ukraine", 17],
    ["How it reads the land", 34],
    ["Field", 71],
    ["Atlas", 108],
  ]);
  for (const [label, t] of chapters) assert.ok(t < seconds, `"${label}" at ${t} s is inside the film`);
  assert.match(source, /chapters = FILM_CHAPTERS/, "the film's own chapters unless others are given");
});

test("the three-minute film's chapters are marked like the walkthroughs': the same rule, at once when pressed, aria-current only", () => {
  const source = readFileSync(join(here, "..", "components", "Film.jsx"), "utf8");
  // The walkthroughs' rule for "the chapter playing now".
  assert.match(source, /import \{ chapterAt \} from "\.\/Walkthrough\.jsx";/);
  assert.match(source, /setCurrent\(chapterAt\(chapters, video\.currentTime, video\.paused\)\)/);
  assert.match(source, /<button type="button" className="film-chapter" aria-current=\{i === current \? "true" : undefined\} onClick=\{\(\) => jump\(c\.t, i\)\}>/);
  assert.doesNotMatch(source, /is-on/, "one state for the eye and for screen readers");
  assert.match(source, /onTimeUpdate=\{follow\}/);
  assert.match(source, /onSeeked=\{settled\}/);
  assert.match(source, /onPlay=\{follow\}/);
  const jump = source.slice(source.indexOf("const jump = (t, index) =>"));
  assert.match(jump.slice(0, jump.indexOf("video.currentTime = t;")), /pressed\.current = t;\s*setCurrent\(index\);/);
  // Its list is named for screen readers, apart from the walkthroughs' two.
  assert.match(source, /aria-label=\{`Chapters of \$\{title\}`\}/);
  assert.match(source, /title = "Chernozem in three minutes"/);
});

test("the Methodology page plays one film at a time: starting one pauses any other", () => {
  const source = words("MethodPage.jsx");
  assert.match(source, /function useOneFilmAtATime\(\)/);
  // "play" does not bubble, so the page listens on the way down (capture), and stops when it goes.
  assert.match(source, /document\.addEventListener\("play", onPlay, true\);/);
  assert.match(source, /return \(\) => document\.removeEventListener\("play", onPlay, true\);/);
  assert.match(source, /for \(const video of document\.querySelectorAll\("\.pg video"\)\) \{\s*if \(video !== started && !video\.paused\) video\.pause\(\);/);
  const body = source.slice(source.indexOf("export default function MethodPage"));
  assert.match(body.slice(0, body.indexOf("return (")), /useOneFilmAtATime\(\);/, "the page calls it");
});

test("the Register page offers Corporation among the kinds of organisation, three above two", () => {
  const source = read("RegisterPage.jsx");
  assert.match(source, /ORG_KINDS\.map\(\(item\) => \(/, "the kinds come from registration.js ORG_KINDS");
  const lib = readFileSync(join(root, "src", "lib", "registration.js"), "utf8");
  assert.match(lib, /\{ role: "corporation", label: "Corporation" \}/);
  const css = readFileSync(join(here, "register.css"), "utf8");
  // A grid of six: the first three kinds take two columns each, the last two three each.
  assert.match(css, /\.site \.reg-kind-row \{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);\s*\}/);
  assert.match(css, /\.site \.reg-kind \{\s*grid-column: span 2;\s*\}/);
  assert.match(css, /\.site \.reg-kind:nth-child\(n \+ 4\) \{\s*grid-column: span 3;\s*\}/);
  assert.doesNotMatch(css, /\.reg-kind-row \{\s*grid-template-columns: repeat\(4,/, "no longer a row of four");
  // On a phone two by two, the fifth across the whole row (three would not hold "Government" at 360 px).
  const phone = css.slice(css.indexOf("@media (max-width: 640px)"), css.indexOf("@media (prefers-reduced-motion"));
  assert.match(phone, /\.site \.reg-kind-row \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(phone, /\.site \.reg-kind,\s*\.site \.reg-kind:nth-child\(n \+ 4\) \{\s*grid-column: auto;/);
  assert.match(phone, /\.site \.reg-kind:last-child:nth-child\(odd\) \{\s*grid-column: 1 \/ -1;/);
});

test("no page says Register for Field (or Atlas): it is Register for Chernozem", () => {
  for (const name of [...PAGES, "RegisterPage.jsx", "SignInPage.jsx"]) {
    assert.doesNotMatch(words(name), /Register for (Field|Atlas)/, `${name} says Register for Chernozem`);
  }
});

test("Field: 'What it reads' follows the steps closely, the phone beside both on a wide screen and between them below 1100 px", () => {
  const source = read("MethodPage.jsx");
  const field = between(source, 'id="product"', 'id="atlas"');
  // One block of their own, in reading order: the steps, the phone, what it reads.
  assert.match(field, /<div className="meth-use-row">\s*<Reveal className="meth-use" id="use">[\s\S]*<Reveal className="meth-use-phone"[\s\S]*<Reveal className="meth-reads"[\s\S]*?<\/Reveal>\s*<\/div>/);
  const css = read("pages.css");
  // Wide: two rows; the phone spans both and its extra height goes to the
  // second (1fr) only, so the first row is as tall as the steps.
  assert.match(css, /\.meth-use-row \{[^}]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);[^}]*grid-template-rows: auto 1fr;/);
  assert.match(css, /\.meth-use \{\s*grid-column: 1 \/ 8;\s*grid-row: 1;/);
  assert.match(css, /\.meth-use-phone \{\s*grid-column: 9 \/ 13;\s*grid-row: 1 \/ 3;/);
  assert.match(css, /\.meth-reads \{\s*grid-column: 1 \/ 8;\s*grid-row: 2;/);
  assert.doesNotMatch(css, /grid-row: span 2/, "the phone no longer stretches a row of the page's grid");
  // Tablet and phone: one column, in reading order.
  const tablet = css.slice(css.indexOf("@media (max-width: 1100px)"), css.indexOf("@media (max-width: 700px)"));
  assert.match(tablet, /\.meth-use-row \{\s*grid-template-rows: none;/);
  assert.match(tablet, /\.meth-use,\s*\.meth-reads \{\s*grid-row: auto;/);
});

test("Field's technical part: the four readings, the condition beside its laboratory, how fields, crop and damage are found, and what it cannot see", () => {
  const source = read("MethodPage.jsx");
  const field = between(source, 'id="product"', 'id="atlas"');
  // After "What it reads", in reading order, on the Atlas part's classes
  // (the owner: "have the descriptions ... of the algorithms behind Field, as well").
  const order = ['<div className="meth-use-row">', 'className="meth-scores-intro" id="readings"', 'className="meth-scores meth-readings"', 'className="meth-gate-text" id="condition"', 'className="meth-gate-lab"', "<ConditionLab />", 'className="meth-scores meth-how"', 'className="meth-limits-text"', "What it cannot see."];
  let last = -1;
  for (const part of order) {
    const at = field.indexOf(part);
    assert.ok(at > last, `${part} comes next in the Field part`);
    last = at;
  }
  assert.match(source, /import ConditionLab from "\.\.\/components\/ConditionLab\.jsx";/);
  // The four readings, a formula and one sentence under each name.
  const readings = between(field, 'className="meth-scores meth-readings"', "</Stagger>");
  assert.deepEqual([...readings.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]), ["Plant health", "Water", "Stress", "Harvest timing"]);
  assert.equal((readings.match(/<dd className="meth-eq">/g) || []).length, 4, "a formula under each name");
  for (const formula of ["NDVI = <span className=\"meth-whole\">(B8 − B4) / (B8 + B4)</span>", "NDWI = <span className=\"meth-whole\">(B8 − B11) / (B8 + B11)</span>", "NDRE = <span className=\"meth-whole\">(B8A − B5) / (B8A + B5)</span>", "ready = <span className=\"meth-whole\">{FM.bareNdvi} + share·(peak − {FM.bareNdvi})</span>"]) {
    assert.ok(readings.includes(formula), `the readings show ${formula}`);
  }
  // As calm as Atlas's scores: one sentence a reading (the review, 3
  // November 2026: Field's part was 3.6 times Atlas's words).
  const sentences = [...readings.matchAll(/<dd>\s*([\s\S]*?)\s*<\/dd>/g)].map((m) => m[1].replace(/\s+/g, " "));
  assert.equal(sentences.length, 4);
  for (const sentence of sentences) assert.equal(sentence.split(/[.;:]\s+(?=[A-Z])/).length, 1, `one sentence: "${sentence.slice(0, 40)}…"`);
  // Its last two words share a line (Safari before 26 has no text-wrap:
  // pretty, which keeps a last word from standing alone elsewhere), as on
  // the About page.
  for (const sentence of sentences) assert.match(sentence, /&nbsp;\S+$/, `"…${sentence.slice(-24)}" keeps its last two words together`);
  assert.match(readings, /\{FM\.redEdgeLead\} before&nbsp;NDVI/);
  assert.match(readings, /\(share \{FM\.readyShare\.cereals\} for cereals and rapeseed, \{FM\.readyShare\.rowCrops\} for row crops\)/);
  // The radar cut counts only for row crops (corn, soybean, sunflower; never cereals or rapeseed).
  assert.match(readings, /checked by heat units and, for row crops, radar through&nbsp;cloud\./);
  // The clouds, the 30 days and the normal years, as the code works them
  // out: the readings are the median of every clear pixel of the last 30
  // days; the scores and both stress rules use, per pixel, the middle of
  // the three years, and the lowest-to-highest range gives only the tiles'
  // Below and Above normal; the half-clear rule only picks the season's
  // passes, which harvest timing reads.
  const intro = between(field, 'id="readings"', "</Reveal>");
  assert.match(intro, /Cloud Score\+ removes clouds pixel by pixel \(clear at \{FM\.clearPixelScore\} or more\)/);
  assert.match(intro, /Plant health, water and stress use the median of the last \{FM\.latestDays\} days’ clear pixels, against the same weeks of \{FM\.baseline\.label\}: per pixel, the middle of the \{FIELD_RULES\.normalYears\} years \(the app’s Below and Above normal use their range\)\./);
  assert.match(intro, /Harvest timing follows the passes \{FIELD_RULES\.clearShare\}&nbsp;clear\./);
  assert.doesNotMatch(intro, /the normal is a range|a pass counts|from every clear pass/, "no rule wider than the code's");
  // The condition: three formulas (the scores, held between 0 and 1, have
  // their own names; the stress rule's thresholds have a line of their
  // own); the weights, spans, thresholds, classes and holds all from
  // site.js's FIELD_METHOD.
  const condition = between(field, 'id="condition"', "<ConditionLab />");
  assert.equal((condition.match(/className="meth-formula"/g) || []).length, 3);
  assert.match(condition, /condition = <span className="meth-whole">\{FM\.weights\.plantHealth\}·health score<\/span> <span className="meth-whole">\+ \{FM\.weights\.water\}·water score<\/span> <span className="meth-whole">\+ \{FM\.weights\.noStress\}·\(1 − stressed share\)<\/span>/);
  assert.match(condition, /health score = <span className="meth-whole">1 \+ \(NDVI − normal\) \/ \{FM\.healthSpan\}<\/span>\s*<br \/>\s*water score = <span className="meth-whole">1 \+ \(NDWI − normal\) \/ \{FM\.waterSpan\}<\/span>\s*<br \/>\s*each held between 0 and 1/);
  assert.match(condition, /stressed = <span className="meth-whole">NDVI &lt; field median − \{two\(FM\.stressNdvi\.belowFieldMedian\)\}<\/span> <span className="meth-whole">and &lt; normal − \{two\(FM\.stressNdvi\.belowNormal\)\},<\/span> <span className="meth-whole">or NDRE &lt; field median − \{two\(FM\.stressRedEdge\.belowFieldMedian\)\}<\/span> <span className="meth-whole">and &lt; normal − \{two\(FM\.stressRedEdge\.belowNormal\)\}<\/span>/);
  assert.doesNotMatch(condition, /plant health =|·plant health|·water \+|kept between/, "one name for the 0-to-1 parts");
  assert.match(condition, /which colours it on the map: \{FIELD_RULES\.classes\}\./);
  assert.match(condition, /High stress \(\{FIELD_RULES\.highStress\}% of the field or more\) holds it under \{FIELD_RULES\.stressedUnder\}, damage under \{FIELD_RULES\.damagedUnder\}, and a field with no crop has no&nbsp;condition\./);
  // How fields, crop and damage are found, two sentences each; what it cannot see.
  const how = between(field, 'className="meth-scores meth-how"', "</Stagger>");
  assert.deepEqual([...how.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]), ["Finding the fields", "The crop", "Damage on a field"]);
  for (const [, note] of how.matchAll(/<dd>\s*([\s\S]*?)\s*<\/dd>/g)) {
    assert.ok(note.replace(/\s+/g, " ").split(/(?<=[.;”])\s+(?=[A-Z])/).length <= 2, `about two sentences: "${note.trim().slice(0, 40)}…"`);
    assert.match(note.trim(), /&nbsp;\S+$/, `"…${note.trim().slice(-24)}" keeps its last two words together`);
  }
  for (const quoted of ["{inWords(FM.edgePictures)} Sentinel‑2 pictures", "{FM.minFieldHa} ha", "{FM.outlineIou}", "{NUMBERS.cropHeldOutPercent}%", "{NUMBERS.cropLikelyPercent}%", "{FM.radarChangeDb} dB", "in at least {inWords(FM.radarSeasons)} growing seasons", "{FIELD_RULES.damageShare}%"]) {
    assert.ok(how.includes(quoted), `the notes quote ${quoted}`);
  }
  // Fire is "unusual" against a normal year; the note no longer ties it to
  // a war's start, since it also covers fields far from one.
  assert.doesNotMatch(how, /worst year since the war began|lasts over/);
  const limits = between(field, 'className="meth-limits-text"', "</Reveal>");
  assert.match(limits, /Which pest or disease is at work/);
  assert.match(limits, /a field with no damage found is not a safe field/);
  // Compounds that read oddly split at a line's end keep their hyphen whole
  // (U+2011, the non-breaking hyphen, as in "Sentinel‑2").
  for (const word of ["hand‑drawn", "held‑out", "red‑edge"]) assert.ok(how.includes(word), `the notes write "${word}" with a non-breaking hyphen`);
  assert.ok(limits.includes("look‑alike"), "and the limits \"look‑alike\"");
  // No number typed into the words where the method or site.js has it.
  const text = between(field, 'id="readings"', "What it cannot see.").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(text, /0\.[532]·|\b0\.40\b|\b0\.65\b|\b0\.85\b|\b0\.805\b|\b0\.0[568]\b|\b0\.10\b|\b1\.5 ha\b|\b30 days\b|\b15%|\b3 dB\b|\b71\.8\b|\b93\.5\b/, "the rules and numbers come from the code or site.js");
  // The look: the readings one under the other on a phone, two by two from
  // 701 px, and still two by two on a wide screen, on the intro's eight
  // columns (four across made lines of 30 letters); a formula's side never
  // breaks inside; the notes keep a paragraph's measure.
  const css = read("pages.css");
  assert.match(css, /\.pg \.meth-readings \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /@media \(min-width: 701px\) \{\s*\.pg \.meth-readings \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width: 1101px\) \{\s*\.pg \.meth-readings \{\s*grid-column: 1 \/ 9;\s*\}/);
  assert.doesNotMatch(css, /\.meth-readings \{[^}]*repeat\([34],/, "never three or four across");
  assert.match(css, /\.meth-whole \{\s*white-space: nowrap;/);
  assert.match(css, /\.pg \.meth-how dd \{\s*max-width: 62ch;/);
  // A formula keeps its own margin (".pg p" would zero it).
  assert.match(css, /\.pg \.meth-formula \{\s*margin-top: 1\.2em;/);
});

test("the Field part's numbers in site.js are the app's own rules, and the page does not load the app's method", () => {
  const FM = FIELD_METHOD;
  // The website keeps the numbers instead of importing the method: an
  // import made the build split the app's code into extra pieces every page
  // loads (site.js, FIELD_METHOD's note).
  for (const name of ["MethodPage.jsx", "../components/ConditionLab.jsx", "../components/conditionLab.js"]) {
    const code = read(name).replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /from "(\.\.\/)+lib\//, `${name} does not import the app's code`);
  }
  assert.match(read("MethodPage.jsx"), /import \{[^}]*\bFIELD_METHOD\b[^}]*\} from "\.\.\/content\/site\.js";/);
  // Clouds, the normal years, a reading's window (method.js; field-gee.js).
  assert.deepEqual([FM.baseline.from, FM.baseline.to, FM.baseline.label], [BASELINE.from, BASELINE.to, BASELINE.label]);
  assert.equal(FM.clearPixelScore, CLEAR_PIXEL_SCORE);
  assert.equal(FM.minClearShare, MIN_CLEAR_SHARE);
  const gee = readFileSync(join(root, "server", "providers", "field-gee.js"), "utf8");
  assert.equal(Number(gee.match(/export const LATEST_DAYS = (\d+);/)[1]), FM.latestDays);
  // Stress: the two rules, and where "high" starts.
  assert.deepEqual(FM.stressNdvi, STRESS_RULES);
  assert.deepEqual(FM.stressRedEdge, RED_EDGE_RULES);
  assert.equal(stressLevel(FM.stressHighShare), "high");
  assert.notEqual(stressLevel(FM.stressHighShare - 0.001), "high");
  const method = readFileSync(join(root, "src", "lib", "field", "method.js"), "utf8");
  assert.match(method, /1 to 2 weeks before NDVI/);
  assert.equal(FM.redEdgeLead, "one to two weeks");
  // Harvest timing: bare soil, one ready share for cereals and rapeseed, one for the row crops.
  assert.equal(FM.bareNdvi, BARE_NDVI);
  for (const id of ["winterCereal", "springCereal", "rapeseed"]) assert.equal(CROP_PROFILES[id].readyShare, FM.readyShare.cereals, id);
  for (const id of ["corn", "soybean", "sunflower"]) assert.equal(CROP_PROFILES[id].readyShare, FM.readyShare.rowCrops, id);
  // The condition: weights (adding up to 1, so the formula needs no
  // division), spans, classes and the two holds.
  assert.deepEqual(FM.weights, CONDITION_WEIGHTS);
  assert.ok(Math.abs(FM.weights.plantHealth + FM.weights.water + FM.weights.noStress - 1) < 1e-9);
  assert.equal(FM.healthSpan, HEALTH_SPAN);
  assert.equal(FM.waterSpan, WATER_SPAN);
  assert.deepEqual(FM.classes, CONDITION_CLASSES);
  assert.equal(FM.stressedMax, STRESSED_CONDITION_MAX);
  assert.equal(FM.damagedMax, DAMAGED_CONDITION_MAX);
  // What they make the page say (the brief's words).
  const classes = FM.classes.map((item) => (Number.isFinite(item.upTo) ? `${item.label} under ${item.upTo.toFixed(2)}` : `${item.label} above`)).join(", ");
  assert.equal(classes, "Poor under 0.40, Fair under 0.65, Good under 0.85, Very good above");
  assert.equal(conditionClass(FM.stressedMax).label, "Good", "high stress: never above Good");
  assert.equal(conditionClass(FM.damagedMax).label, "Fair", "damage: never above Fair");
  // The page says it as the class each is held under.
  const above = (score) => FM.classes[FM.classes.findIndex((item) => item.id === conditionClass(score).id) + 1].label;
  assert.equal(above(FM.stressedMax), "Very good", "high stress: held under Very good");
  assert.equal(above(FM.damagedMax), "Good", "damage: held under Good");
  // Finding the fields: the smallest field, the pictures, the overlap measured.
  assert.equal(Number(gee.match(/\n {2}minHa: ([\d.]+),/)[1]), FM.minFieldHa);
  for (const lat of [49.7, -34.9, 5]) assert.equal(detectionWindows(lat, "2026-10-01", null).length, FM.edgePictures, `edge pictures at ${lat}°`);
  const docs = readFileSync(join(root, "docs", "METHODS.md"), "utf8");
  assert.ok(docs.includes(`mean overlap (IoU) **${FM.outlineIou}**`), "the outline overlap is the docs' measurement");
  // The harvest's radar check counts for the row crops (the tall ones)
  // and never for cereals or rapeseed, as the page says.
  for (const id of ["corn", "soybean", "sunflower"]) assert.equal(CROP_PROFILES[id].tall, true, `${id} is a tall row crop`);
  for (const id of ["winterCereal", "springCereal", "rapeseed"]) assert.equal(CROP_PROFILES[id].tall, false, `${id} has no radar cut`);
  assert.match(readFileSync(join(root, "src", "lib", "field", "method.js"), "utf8"), /if \(drop && \(!crop \|\| cropProfile\(crop\)\.id === "other" \|\| isTallCropId\(crop\)\)\)/);
  // Damage: the radar change, how long it must last (field-gee.js takes the
  // second-largest season, the Atlas's persistSeasons) and the war rule.
  assert.equal(FM.radarChangeDb, RADAR_CHANGE_DB);
  assert.equal(FM.radarSeasons, HEAVY_DAMAGE.persistSeasons);
  assert.equal(FM.radarSeasons, 2, "field-gee.js radarChangeImage reads the second-largest season");
  assert.match(gee, /for \(let j = i \+ 1; j < changes\.length; j \+= 1\) second = second\.max\(changes\[i\]\.min\(changes\[j\]\)\);/);
  assert.equal(FM.damageRadarShare, DAMAGE_RULES.radarShare);
});

test("Methodology type: no step or score ends on one lone word, and nothing is under 14 px", () => {
  const css = read("pages.css");
  assert.match(css, /\.meth-use ol li \{[^}]*text-wrap: pretty;/);
  assert.match(css, /\.meth-scores dd \{[^}]*text-wrap: pretty;/);
  // The page's small size stays at 14 px on tablets and phones too (site.css lets it reach 13).
  assert.match(read("MethodPage.jsx"), /<div className="pg meth">/);
  assert.match(css, /\.pg\.meth \{\s*--step-small: 0\.875rem;\s*\}/);
  assert.match(css, /\.meth-formula sup \{\s*font-size: max\(0\.6em, var\(--step-small\)\);/);
  assert.match(css, /\.gl-chart text \{[^}]*font-size: var\(--step-small\);/);
});

test("the gate chart is drawn at its real width, the numbers under the axis and its name on a line of its own below them", () => {
  const source = readFileSync(join(here, "..", "components", "GateLab.jsx"), "utf8");
  // Measured and followed on resize: one unit is one pixel, so its 14 px text is 14 px on a phone too.
  assert.match(source, /const W = useBoxWidth\(chartRef, FIRST_WIDTH\);/);
  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /<div className="gl-chart" ref=\{chartRef\}>/);
  assert.match(source, /<svg viewBox=\{`0 0 \$\{W\} \$\{H\}`\}/);
  // The geometry, from the file's own numbers.
  const H = Number(source.match(/const H = (\d+);/)[1]);
  const PAD = vm.runInNewContext(`(${source.match(/const PAD = (\{[^}]*\});/)[1]})`);
  assert.match(source, /<text key=\{`x\$\{t\}`\} x=\{x\(t\)\} y=\{y\(0\) \+ 20\} textAnchor="middle">/);
  assert.match(source, /<text x=\{\(x\(0\) \+ x\(1\)\) \/ 2\} y=\{H - 10\} textAnchor="middle">\s*Feasibility\s*<\/text>/);
  const SIZE = 14; // var(--step-small) on the Methodology
  const axis = H - PAD.b;
  const numbers = axis + 20;
  const name = H - 10;
  assert.ok(numbers - 0.75 * SIZE > axis, "the numbers start under the axis line");
  assert.ok(name - numbers >= SIZE + 4, `the name (baseline ${name}) is a whole line under the numbers (baseline ${numbers})`);
  assert.ok(PAD.r >= SIZE, "the last number, 100, centred on the axis's end, stays inside the chart");
  assert.ok(PAD.l - 10 >= 1.8 * SIZE, "the numbers at the left, up to 100, fit beside the axis");
  // The old overlap: the name at the axis's right end, on the numbers' own line.
  assert.doesNotMatch(source, /x=\{W - PAD\.r\} y=\{H - 10\} textAnchor="end"/);
});

test("the Methodology page says where contact messages are kept, and no stale test count", () => {
  const text = words("MethodPage.jsx");
  // server/messages.js saves every message before it is e-mailed.
  assert.match(text, /messages from the contact page are kept on our server and e‑mailed to \{CONTACT_EMAIL\}/);
  // The count is rounded down to the hundred, so it stays true as tests
  // are added: "More than 1,000 automated tests."
  assert.match(text, /More than \{formatInt\(testsFloor\)\} automated tests\./);
  assert.match(text, /Math\.floor\(NUMBERS\.automatedTests \/ 100\) \* 100/);
  assert.ok(NUMBERS.automatedTests >= 1270, "the count is at least the last full run's (3 November 2026, after the review's fixes)");
  assert.doesNotMatch(text, /\b888\b/);
  // The Dataverse deposit is the research package, not "the paper's".
  assert.doesNotMatch(text, /The paper’s data and code/);
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

test("pages.css sets no cursor of its own, so the site's pin shows everywhere", () => {
  const css = read("pages.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const cursors = [...css.matchAll(/cursor\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
  // Only "inherit" (the frozen ranking's map takes the pin from its parent).
  assert.deepEqual([...new Set(cursors)], ["inherit"]);
  assert.match(css, /\.pg \.demo-unit path \{\s*cursor: inherit;/);
  // The pin's near look ([data-near], src/site/cursorAssist.js) beside the hover looks.
  for (const near of [".pg-btn[data-near]", ".pg a[data-near]", "a.dm-door[data-near]", ".story-mark-link[data-near]", ".ct-role[data-near]"]) {
    assert.ok(css.includes(near), `pages.css styles ${near}`);
  }
});

test("pages.css keeps the menu bar's frame on wide screens", () => {
  const css = read("pages.css");
  // The same 1760px as .wrap in site.css, minus the margins the section keeps.
  const rule = css.match(/([^{}]+)\{\s*width: 100%;\s*max-width: calc\(1760px - 2 \* var\(--margin\)\);\s*margin-inline: auto;\s*\}/);
  assert.ok(rule, "a frame rule");
  for (const sel of [".pg-sec > .pg-grid", ".pg-sec > .pg-frame", ".pg-sec > .ct-body", ".pg-sec > .dm-close-row", ".pg .story-mark-list"]) {
    assert.ok(rule[1].includes(sel), `the frame holds ${sel}`);
  }
  // Every section of these pages is one of them.
  for (const name of PAGES) {
    for (const m of read(name).matchAll(/<section className="pg-sec[^"]*"[^>]*>\s*<(\w+) className="([^"]+)"/g)) {
      assert.ok(/\b(pg-grid|pg-frame|ct-body|dm-close-row)\b/.test(m[2]) || m[2].includes("story-mark"), `${name}: a section's content (${m[2]}) sits in the frame`);
    }
  }
});

test("pages.css gives back the spacings site.css's element resets would cancel", () => {
  const css = read("pages.css");
  // ".site h3 / ul / p / button" outrank a single class, so these carry ".pg".
  assert.match(css, /\.pg \.pg-h3 \{\s*margin: 0 0 10px;/);
  assert.match(css, /\.pg \.meth-use ol \{[^}]*margin: 14px 0 0;/);
  // The chapters keep 10 px at their sides for the fill of the one playing
  // now; the row is pulled back by as much, so the words start on the film's edge.
  assert.match(css, /\.pg \.wk-chapters,\s*\.pg \.film-chapters \{[^}]*margin: 16px 0 0 -10px;/);
  assert.match(css, /\.pg \.wk-chapter,\s*\.pg \.film-chapter \{[^}]*padding: 0 10px;/);
  assert.match(css, /\.pg \.gl-note \{[^}]*margin-bottom: 18px;/);
  assert.match(css, /\.pg \.demo-tab \{\s*padding: 10px 18px;/);
  assert.match(css, /\.pg \.demo-foot \{\s*margin-top: 12px;/);
});

test("the sitemap lists no unlisted page", () => {
  const sitemap = readFileSync(join(root, "public", "sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /\/owner|\/signin|\/field|\/atlas/);
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

test("the gate lab's formulas stay numbers when the visitor slides every weight to 0", () => {
  const { near, post } = formulas();
  const openNear = near(0.72, 0.81, 0.6, 0.3, 0.2, 0, 0);
  assert.ok(Number.isFinite(openNear), "near term with value and damage both at 0");
  const half = ((Math.sqrt(0.72) + Math.sqrt(0.81)) / 2) ** 2;
  assert.ok(Math.abs(openNear - half) < 1e-9, "value and damage then count half each, as in the app");
  assert.equal(near(0.72, 0.81, 0.1, 0.3, 0.2, 0, 0), 0, "still left out below the cutoff");
  const blend = post(0.72, 0.81, 0.35, 0, 0, 0);
  assert.ok(Number.isFinite(blend), "post-crisis with all three at 0");
  const third = ((Math.sqrt(0.72) + Math.sqrt(0.81) + Math.sqrt(0.35)) / 3) ** 2;
  assert.ok(Math.abs(blend - third) < 1e-9, "the three then count equally");
});

test("post-crisis: equal inputs give that value, and the default weights blend all three", () => {
  const { post } = formulas();
  assert.ok(Math.abs(post(0.5, 0.5, 0.5, 30, 40, 30) - 0.5) < 1e-9, "idempotent");
  const expected = (0.3 * Math.sqrt(0.72) + 0.4 * Math.sqrt(0.81) + 0.3 * Math.sqrt(0.35)) ** 2;
  assert.ok(Math.abs(post(0.72, 0.81, 0.35, 30, 40, 30) - expected) < 1e-9, "weights 30 / 40 / 30, exponent 0.5");
  assert.ok(post(0.72, 0.81, 0.1, 30, 40, 30) > 0, "feasibility only slows the result, never vetoes it");
});
