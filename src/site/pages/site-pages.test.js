// WHAT THIS FILE DOES
// Checks on the website's inner pages (Story, Methodology, Contact, Demo,
// Owner sign-in, Page not found) and the gate laboratory, read from their
// source files (no browser needed):
//   - each page starts with the plain-English header every file carries,
//     sets its browser-tab title, and has exactly one h1;
//   - none imports the components the second website removed;
//   - the Story is the five parts the owner asked for, in his order, and
//     nothing else (no film, no "Who makes it", no closing sign-up); it
//     counts ACLED's events as events, links the Dataverse deposit (the
//     Recovery Atlas's package) under the Second edition, and credits the
//     old maps' base maps;
//   - the Demo page is the two doors (which switch the tab to the demo)
//     and the Register line, with no code anywhere; the doors' pictures are
//     the half-size copies;
//   - the Contact page says where messages go (chernozem.app@gmail.com),
//     keeps the robot trap, offers who-you-are as four plain words (no
//     pictures in the choice), says after sending that the message was
//     received (not that it is on its way) and moves the keyboard there,
//     and has lost "What to write about" and "Elsewhere";
//   - the Owner page is unlisted (noindex), signs in with the Chernozem
//     Google account (no code field), lets the server decide who the owner
//     is, and refuses any other account in plain words;
//   - no page mentions an access code or the challenge the app was made for
//     (the About page names it once; the words are built from pieces here so
//     a search of the code finds only the About page),
//     and none prints the demo farm's number of fields;
//   - every picture the pages name exists in public/;
//   - the Methodology page is two parts, Field and Atlas, each with its
//     walkthrough film (Walkthrough.jsx) and the owner's descriptions, a
//     short "Behind it", no row of in-page links and no sub-sub-headings;
//     it keeps the ids the old addresses jump to, says contact messages
//     are kept on the server, and prints no stale test count;
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
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { CONTACT_EMAIL, DEMO_DOORS, LINKS, NUMBERS, SITE } from "../content/site.js";

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
  assert.match(text, /Messages go to <a href=\{`mailto:\$\{CONTACT_EMAIL\}`\}>\{CONTACT_EMAIL\}<\/a>/);
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

test("who you are is four plain words, not pictures", () => {
  const text = words("ContactPage.jsx");
  const roles = between(text, "const ROLES = [", "];");
  assert.equal((roles.match(/\{ value: "/g) || []).length, 4, "four choices");
  assert.doesNotMatch(roles, /src:|width:|height:|position:|zoom:/, "the choices carry no picture");
  assert.doesNotMatch(text, /ct-role-pic|ct-role-frame/);
  // Each choice is the word's own label around a real radio button.
  assert.match(text, /<label key=\{item\.value\} className="ct-role"[^>]*>\s*<input className="ct-role-input" type="radio" name="role"/);
  const css = read("pages.css");
  assert.match(css, /\.ct-role-row \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/, "one row of four");
  assert.match(css, /\.ct-role \{[^}]*min-height: 48px;/, "48 px tall");
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.match(phone, /\.ct-role-row \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, "two by two on a phone");
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
  // The About page still has the link it uses.
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

test("the Methodology page is two parts, Field and Atlas, each with its film, and a short close", () => {
  const source = read("MethodPage.jsx");
  const list = headings("MethodPage.jsx");
  assert.deepEqual(
    list.map((h) => h.text),
    ["How Chernozem works", "Field", "Atlas", "Behind it", "Run it on your own land"],
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
  // One walkthrough film per product, right after its two sentences.
  assert.match(source, /import Walkthrough from "\.\.\/components\/Walkthrough\.jsx"/);
  const field = between(source, 'id="product"', 'id="atlas"');
  const atlas = between(source, 'id="atlas"', 'id="technology"');
  const behind = between(source, 'id="technology"', 'id="meth-close"');
  assert.match(field, /className="pg-lead meth-what"[\s\S]*<Walkthrough product="field"[\s\S]*FIELD_STEPS\.map[\s\S]*What it reads\./);
  assert.match(atlas, /className="pg-lead meth-what"[\s\S]*<Walkthrough product="atlas"/);
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
  assert.ok(source.includes('src: "/site/film/field-walkthrough.mp4"'));
  assert.ok(source.includes('src: "/site/film/atlas-walkthrough.mp4"'));
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
  assert.match(css, /\.pg \.wk-chapter\[aria-current="true"\] \{\s*background: var\(--ink\);\s*color: var\(--bg\);\s*\}/);
  // Pointing at a chapter only underlines it, so it never looks like the one playing.
  const looks = [...css.matchAll(/([^{}]*\.wk-chapter(?::hover|\[data-near\])[^{}]*)\{([^}]*)\}/g)];
  assert.ok(looks.length >= 2, "a hover look and a pin-near look");
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
  assert.ok(NUMBERS.automatedTests >= 1053, "the count is at least the last full run's");
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
  assert.match(css, /\.pg \.wk-chapters \{[^}]*margin: 16px 0 0 -10px;/);
  assert.match(css, /\.pg \.wk-chapter \{[^}]*padding: 0 10px;/);
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

test("post-crisis: equal inputs give that value, and the default weights blend all three", () => {
  const { post } = formulas();
  assert.ok(Math.abs(post(0.5, 0.5, 0.5, 30, 40, 30) - 0.5) < 1e-9, "idempotent");
  const expected = (0.3 * Math.sqrt(0.72) + 0.4 * Math.sqrt(0.81) + 0.3 * Math.sqrt(0.35)) ** 2;
  assert.ok(Math.abs(post(0.72, 0.81, 0.35, 30, 40, 30) - expected) < 1e-9, "weights 30 / 40 / 30, exponent 0.5");
  assert.ok(post(0.72, 0.81, 0.1, 30, 40, 30) > 0, "feasibility only slows the result, never vetoes it");
});
