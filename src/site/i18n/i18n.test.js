// WHAT THIS FILE DOES
// Tests for the website's languages (src/site/i18n/). Run with "npm test".
//   - which language the website opens in (?lang=, the saved choice, the
//     browser's languages in order, else English), and how a sentence is
//     looked up (the namespace, then common, then the English itself; holes
//     filled, elements kept as pieces, a function entry for plurals);
//   - numbers are written the way each language writes them;
//   - the dictionaries: Chinese and Ukrainian have the same namespaces and
//     the same keys; every key a page asks for (t("...")) is in both, and
//     so is every English sentence t() gets from a variable (t(page.label),
//     t(step.title), t(message)): the words of site.js, registration.js,
//     the globe's lists, the two data files and the constants at the top
//     of the pages, each in the namespace that shows it (WORDS_FROM_VARIABLES
//     says where each comes from); every key in a dictionary is a sentence
//     some page still has (no stale entries); no entry is left in English;
//     {holes} survive; Chinese uses Chinese punctuation; Ukrainian uses its
//     own apostrophe and no Russian letters;
//   - no page or component of the website still shows English that is not
//     passed through t(): one test per file, so a file's own state is
//     clear. Text between tags, text before, after and between {holes}, a
//     "string" shown on its own in braces or chosen by a ternary, and the
//     alt, aria-label, placeholder, title and label attributes are checked;
//     product and dataset names (Chernozem, Field, Atlas, NDVI, Sentinel-2,
//     GDACS and so on) are allowed to stay as they are.
//
// WHO EDITS IT
// Whoever adds a language, a namespace, or a name to ALLOWED_WORDS; whoever
// adds a constant whose English a page hands to t() (WORDS_FROM_VARIABLES).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { LANGUAGES, fill, fromBrowserLanguage, pickLanguage, translate } from "./language.js";
import { DEMO, DEMO_DOORS, FIELD_METHOD, NUMBERS, SITE, SITE_ACTIONS, SITE_PAGES, compactHa, formatInt, setNumberLocale } from "../content/site.js";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..");
const root = join(site, "..", "..");
const rel = (file) => relative(root, file);
const DICTIONARY_LANGUAGES = LANGUAGES.map((language) => language.code).filter((code) => code !== "en");

// ---- The choice of language and the lookup of a sentence ----

test("the website opens in the language asked for, else the saved one, else the browser's first language it has, else English", () => {
  assert.equal(pickLanguage({ query: "uk", stored: "zh", browserLanguages: ["en"] }), "uk");
  assert.equal(pickLanguage({ query: "fr", stored: "zh", browserLanguages: ["en"] }), "zh", "an unknown ?lang= is ignored");
  assert.equal(pickLanguage({ stored: "zh" }), "zh");
  assert.equal(pickLanguage({ stored: "ru", browserLanguages: ["uk-UA"] }), "uk", "an unknown saved value is ignored");
  assert.equal(pickLanguage({ browserLanguages: ["fr", "en-GB", "uk"] }), "en", "the visitor's own order wins, English included");
  assert.equal(pickLanguage({ browserLanguages: ["zh-TW", "en"] }), "zh");
  assert.equal(pickLanguage({ browserLanguages: ["ru", "de"] }), "en", "Russian does not open the Ukrainian website");
  assert.equal(pickLanguage({}), "en");
  assert.equal(pickLanguage(), "en");
  assert.equal(fromBrowserLanguage("UK_ua"), "uk");
  assert.equal(fromBrowserLanguage(""), undefined);
});

test("the three languages have distinct codes, page tags, locales and their own names", () => {
  assert.deepEqual(
    LANGUAGES.map((l) => l.code),
    ["en", "zh", "uk"],
  );
  assert.deepEqual(
    LANGUAGES.map((l) => l.html),
    ["en", "zh-Hans", "uk"],
  );
  assert.deepEqual(
    LANGUAGES.map((l) => l.locale),
    ["en-US", "zh-CN", "uk-UA"],
  );
  assert.deepEqual(
    LANGUAGES.map((l) => l.name),
    ["English", "中文", "Українська"],
  );
});

test("a sentence comes from the namespace, else common, else stays English; functions and holes work", () => {
  const dict = {
    common: { "Open Field": "Відкрити Field", "{n} fields": ({ n }) => (n === 1 ? "1 поле" : n < 5 ? `${n} поля` : `${n} полів`) },
    home: { "Open Field": "Відкрити Field у демо", "Hello, {name}": "Привіт, {name}" },
  };
  assert.equal(translate(dict, "home", "Open Field"), "Відкрити Field у демо");
  assert.equal(translate(dict, "story", "Open Field"), "Відкрити Field");
  assert.equal(translate(dict, "story", "Not there"), "Not there");
  assert.equal(translate({}, "home", "Not there"), "Not there");
  assert.equal(translate(undefined, "home", "Not there"), "Not there");
  assert.equal(translate(dict, "home", "Hello, {name}", { name: "Danny" }), "Привіт, Danny");
  assert.equal(translate(dict, "home", "{n} fields", { n: 1 }), "1 поле");
  assert.equal(translate(dict, "home", "{n} fields", { n: 3 }), "3 поля");
  assert.equal(translate(dict, "home", "{n} fields", { n: 11 }), "11 полів");
  // English, with holes, needs no dictionary.
  assert.equal(translate({}, "home", "{count} of {total}", { count: 2, total: 5 }), "2 of 5");
});

test("fill leaves an unknown hole as written and gives pieces when a value is an element", () => {
  assert.equal(fill("a {b} c", {}), "a {b} c");
  assert.equal(fill("plain", { x: 1 }), "plain");
  const strong = createElement("strong", null, "free");
  const pieces = fill("Reads {free} data", { free: strong });
  assert.ok(Array.isArray(pieces));
  assert.equal(pieces.length, 3);
  assert.equal(pieces[0], "Reads ");
  assert.equal(pieces[1].key, "1");
  assert.equal(pieces[1].props.children, strong);
  assert.equal(pieces[2], " data");
  const leading = fill("{free} data", { free: strong });
  assert.equal(leading.length, 2, "no empty piece before an element at the start");
});

test("numbers are written the way each language writes them", () => {
  assert.equal(formatInt(1780400, "en-US"), "1,780,400");
  assert.equal(formatInt(1780400, "zh-CN"), "1,780,400");
  assert.match(formatInt(1780400, "uk-UA"), /^1[\s\u00a0\u202f]780[\s\u00a0\u202f]400$/);
  assert.equal(compactHa(1780400, "en-US"), "1.78M");
  assert.equal(compactHa(12151, "en-US"), "12,151");
  assert.match(compactHa(1780400, "uk-UA"), /^1,78[\s\u00a0\u202f]млн$/);
  assert.equal(compactHa(1780400, "zh-CN"), "178万");
  setNumberLocale("uk-UA");
  assert.match(formatInt(12151), /^12[\s\u00a0\u202f]151$/);
  setNumberLocale("en-US");
  assert.equal(formatInt(12151), "12,151");
});

// ---- The dictionaries ----

async function loadDictionary(code) {
  const dir = join(here, code);
  const dictionary = {};
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".js") || file === "index.js") continue;
    const module = await import(pathToFileURL(join(dir, file)).href);
    dictionary[file.replace(/\.js$/, "")] = module.default;
  }
  return dictionary;
}

const dictionaries = Object.fromEntries(await Promise.all(DICTIONARY_LANGUAGES.map(async (code) => [code, await loadDictionary(code)])));

// The website's own files: pages and components, never tests, never the
// dictionaries themselves.
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      if (name !== "i18n") walk(file, out);
    } else if (/\.(jsx|js)$/.test(name) && !name.includes(".test.")) out.push(file);
  }
  return out;
}
const SOURCE_FILES = walk(site);
const stripComments = (source) =>
  source
    // Comments go, their line breaks stay, so a line number here is the file's.
    // Line comments first: one may contain "/*" (a path like pages/*), which
    // would otherwise open a block comment that eats the file.
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""));
const SOURCES = Object.fromEntries(SOURCE_FILES.map((file) => [file, stripComments(readFileSync(file, "utf8"))]));

// Words that the dictionaries are allowed to keep in English, and that the
// pages may show without t(): names, not words.
const ALLOWED_WORDS = new Set(
  (
    "Chernozem Field Atlas NDVI NDWI NDRE GDACS WITS ACLED FAO ESA NASA USDA ISRIC JRC ECMWF CSV PDF PNG JSON WebGL " +
    "Sentinel-1 Sentinel-2 Sentinel Copernicus WorldCover WorldPop SoilGrids OpenLandMap MERIT Hydro ERA5-Land Open-Meteo " +
    "VIIRS MODIS FIRMS GAUL React Node.js Vite Leaflet Claude Google Earth Engine Esri Harvard Dataverse GitHub Firebase " +
    "Cloud Score+ Colab Render Penn ZBDL Dr. Bo Zhao Danny William Pan Kupiansk Esc Tab Enter Shift " +
    "OpenStreetMap OpenFreeMap OpenMapTiles EMSR692 EMSR738 EMSR838"
  ).split(" "),
);
// A {hole} is not a word: a key made only of holes and punctuation
// ("{name}: {status}.") has nothing to translate but its punctuation.
const hasWord = (text) =>
  text
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/\{\w+\}/g, " ")
    .split(/[\s,.;:!?()[\]"“”‘’'/]+/)
    .some((word) => /[A-Za-z]{3,}/.test(word) && !ALLOWED_WORDS.has(word));

const CJK = /[\u4e00-\u9fff]/;
const CYRILLIC = /[\u0400-\u04ff]/;

for (const code of DICTIONARY_LANGUAGES) {
  test(`the ${code} dictionary's entries are strings or functions, translated, with their holes and their language's punctuation`, () => {
    const problems = [];
    for (const [ns, entries] of Object.entries(dictionaries[code])) {
      assert.ok(entries && typeof entries === "object" && !Array.isArray(entries), `${code}/${ns}.js exports an object`);
      for (const [key, value] of Object.entries(entries)) {
        const where = `${code}/${ns}: "${key.slice(0, 60)}"`;
        if (typeof value === "function") continue;
        if (typeof value !== "string" || !value.trim()) {
          problems.push(`${where} is not a sentence`);
          continue;
        }
        if (value === key && hasWord(key)) problems.push(`${where} is still English`);
        for (const hole of key.match(/\{\w+\}/g) || []) if (!value.includes(hole)) problems.push(`${where} lost its ${hole}`);
        if (value.includes('"')) problems.push(`${where} has straight double quotes (use “ ” in Chinese, « » in Ukrainian)`);
        if (/\d \d{3}\b/.test(value)) problems.push(`${where} groups a number with a breakable space (write U+00A0, so the number never parts at a line's end)`);
        if (code === "zh") {
          if (!CJK.test(value) && hasWord(value)) problems.push(`${where} has no Chinese characters`);
          if (/[\u4e00-\u9fff][,.!?:;]/.test(value)) problems.push(`${where} has ASCII punctuation after a Chinese character (use ，。！？：；)`);
          if (/[\u4e00-\u9fff]'|'[\u4e00-\u9fff]/.test(value)) problems.push(`${where} has a straight quote beside a Chinese character`);
        }
        if (code === "uk") {
          if (!CYRILLIC.test(value) && hasWord(value)) problems.push(`${where} has no Cyrillic letters`);
          if (/[\u0400-\u04ff]'[\u0400-\u04ff]/.test(value)) problems.push(`${where} uses the ASCII apostrophe (use ʼ or ’)`);
          if (/[ыэъёЫЭЪЁ]/.test(value)) problems.push(`${where} has a Russian letter`);
        }
      }
    }
    assert.ok(problems.length === 0, `${problems.length} problem(s):\n${problems.join("\n")}`);
  });
}

test("Chinese and Ukrainian have the same namespaces and the same keys", () => {
  const [first, ...rest] = DICTIONARY_LANGUAGES;
  for (const other of rest) {
    assert.deepEqual(Object.keys(dictionaries[other]).sort(), Object.keys(dictionaries[first]).sort(), `${first} and ${other} have the same namespace files`);
    for (const ns of Object.keys(dictionaries[first])) {
      const a = Object.keys(dictionaries[first][ns]).sort();
      const b = Object.keys(dictionaries[other][ns]).sort();
      const onlyA = a.filter((k) => !b.includes(k));
      const onlyB = b.filter((k) => !a.includes(k));
      assert.ok(onlyA.length === 0 && onlyB.length === 0, `${ns}: only in ${first}: ${JSON.stringify(onlyA.slice(0, 5))}; only in ${other}: ${JSON.stringify(onlyB.slice(0, 5))}`);
    }
  }
});

// The sentences a file asks for, with the namespace it asks in. A file's
// namespace is its useT("name") (one per file), or a line
// "// i18n namespace: name" for a helper that is handed t.
function keysOf(file) {
  const source = SOURCES[file];
  const raw = readFileSync(file, "utf8");
  const namespaces = new Set([...source.matchAll(/useT\(\s*"([a-z]+)"\s*\)/g)].map((m) => m[1]));
  const declared = raw.match(/^\/\/ i18n namespace: ([a-z]+)\s*$/m);
  if (declared) namespaces.add(declared[1]);
  const keys = [];
  for (const m of source.matchAll(/\bt\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`)/g)) {
    const line = source.slice(0, m.index).split("\n").length;
    if (m[1] === "`") {
      keys.push({ key: null, line });
      continue;
    }
    const literal = m[1];
    const key = literal[0] === '"' ? JSON.parse(literal) : literal.slice(1, -1).replace(/\\(['\\])/g, "$1");
    keys.push({ key, line });
  }
  return { namespaces: [...namespaces], keys };
}

test("every sentence a page asks for is in both dictionaries, asked in one namespace with a plain string", () => {
  const problems = [];
  for (const file of SOURCE_FILES) {
    const { namespaces, keys } = keysOf(file);
    if (keys.length === 0) continue;
    if (namespaces.length !== 1) {
      problems.push(`${rel(file)}: ${namespaces.length === 0 ? "calls t() without useT(\"namespace\")" : `uses more than one namespace (${namespaces.join(", ")})`}`);
      continue;
    }
    const [ns] = namespaces;
    for (const { key, line } of keys) {
      if (key === null) {
        problems.push(`${rel(file)}:${line} asks t() with a template string; use a plain "string"`);
        continue;
      }
      for (const code of DICTIONARY_LANGUAGES) {
        const dict = dictionaries[code];
        if (dict[ns]?.[key] === undefined && dict.common?.[key] === undefined) problems.push(`${rel(file)}:${line} "${key.slice(0, 70)}" is not in ${code}/${ns}.js or ${code}/common.js`);
      }
    }
  }
  assert.ok(problems.length === 0, `${problems.length} problem(s):\n${problems.join("\n")}`);
});

test("every dictionary key is a sentence some page still has (no stale entries)", () => {
  const extra = ["public/site/film/walkthroughs.json", "public/site/ukraine-demo.json", "src/lib/registration.js"].map((f) => readFileSync(join(root, f), "utf8"));
  const corpus = [...Object.values(SOURCES), ...extra]
    .join("\n")
    .replace(/\\(["'])/g, "$1")
    .replace(/\s+/g, " ");
  const problems = [];
  for (const code of DICTIONARY_LANGUAGES) {
    for (const [ns, entries] of Object.entries(dictionaries[code])) {
      for (const key of Object.keys(entries)) {
        if (!corpus.includes(key.replace(/\s+/g, " "))) problems.push(`${code}/${ns}: "${key.slice(0, 70)}" is in no page`);
      }
    }
  }
  assert.ok(problems.length === 0, `${problems.length} stale key(s):\n${problems.join("\n")}`);
});

// ---- English that reaches t() from a variable ----

// keysOf() sees t("...") only. The pages also hand t() English kept in a
// variable (t(page.label), t(step.title), t(message)): the lists of
// site.js and registration.js, the globe's names, the two data files, and
// the constants at the top of the pages. A page is JSX, which node cannot
// import, so its constants are read from its source:
//   constant(file, "NAME", fields)  every "string" of those fields in
//                                   `const NAME = ...` ("*": every string
//                                   in it; fields over no name: the whole
//                                   file)
//   sentences(file)                 every "string" ending in a full stop
//                                   that is not a t("...") key: the
//                                   messages a page keeps in English and
//                                   looks up where they are shown
//                                   (RegisterPage's sayProblem, OwnerPage's
//                                   problemOf, registration.js's checks)
const STRING = /"(?:[^"\\\n]|\\.)*"/.source;
const sourceOf = (file) => SOURCES[file] ?? stripComments(readFileSync(file, "utf8"));
const literalsIn = (text) => [...text.matchAll(new RegExp(STRING, "g"))].map((m) => JSON.parse(m[0]));

// The text of `const NAME = ...`: a "string", or a list or an object to its
// closing bracket (a string inside may hold brackets).
function constantText(source, name) {
  const start = new RegExp(`^(?:export )?const ${name} = `, "m").exec(source);
  assert.ok(start, `const ${name} is not in the file`);
  const from = start.index + start[0].length;
  const open = source[from];
  if (open === '"') return new RegExp(STRING, "y").exec(source.slice(from))[0];
  assert.ok(open === "[" || open === "{", `const ${name} is not a string, a list or an object`);
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let quote = null;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return source.slice(from, i + 1);
  }
  return assert.fail(`const ${name} does not close`);
}

function constant(file, name, fields) {
  const text = name ? constantText(sourceOf(file), name) : sourceOf(file);
  const where = `${rel(file)} ${name || ""}`.trim();
  if (fields === "*") return literalsIn(text);
  const found = fields.flatMap((field) => [...text.matchAll(new RegExp(String.raw`\b${field}:\s*(${STRING})`, "g"))].map((m) => JSON.parse(m[1])));
  assert.ok(found.length > 0, `${where} has no ${fields.join("/")}: "..."`);
  return found;
}

function sentences(file) {
  const source = sourceOf(file);
  const asked = new Set([...source.matchAll(new RegExp(String.raw`\bt\(\s*(${STRING})`, "g"))].map((m) => JSON.parse(m[1])));
  const found = literalsIn(source).filter((text) => text.endsWith(".") && !asked.has(text));
  assert.ok(found.length > 0, `${rel(file)} has no sentences outside t()`);
  return found;
}

const inSite = (name) => join(site, name);
const UKRAINE_DEMO = JSON.parse(readFileSync(join(root, "public/site/ukraine-demo.json"), "utf8"));
const WALKTHROUGHS = JSON.parse(readFileSync(join(root, "public/site/film/walkthroughs.json"), "utf8"));
const REGISTRATION = join(root, "src/lib/registration.js");

// Each: the namespaces that show the words (every one must have them, or
// common must), where they come from, and the words.
const WORDS_FROM_VARIABLES = [
  // The frame: the menu and the footer (Nav.jsx, Footer.jsx), the tab's description (i18n.js)
  { ns: ["common"], from: "site.js SITE_PAGES, SITE_ACTIONS, SITE", words: [...SITE_PAGES.map((page) => page.label), ...Object.values(SITE_ACTIONS).map((action) => action.label), SITE.madeIn, SITE.description] },
  { ns: ["common"], from: "Nav.jsx actionFor", words: constant(inSite("components/Nav.jsx"), null, ["label"]) },
  // The About page and its parts
  { ns: ["home"], from: "site.js DEMO.field11 (FieldRowStates.jsx)", words: Object.values(DEMO.field11).filter((value) => typeof value === "string") },
  { ns: ["home", "method", "globe"], from: "site.js NUMBERS.ukraineMonth", words: [NUMBERS.ukraineMonth] },
  { ns: ["home"], from: "HomePage.jsx WHY, FIELD_STEPS, ATLAS_STEPS, PHOTO (ScrollStory.jsx)", words: [...constant(inSite("pages/HomePage.jsx"), "WHY", ["claim", "text"]), ...constant(inSite("pages/HomePage.jsx"), "FIELD_STEPS", ["title", "text", "alt"]), ...constant(inSite("pages/HomePage.jsx"), "ATLAS_STEPS", ["title", "text", "alt"]), ...constant(inSite("pages/HomePage.jsx"), "PHOTO", ["alt"])] },
  { ns: ["home"], from: "ProofTable.jsx ROWS", words: constant(inSite("components/ProofTable.jsx"), "ROWS", ["year", "what", "against", "result"]) },
  { ns: ["home"], from: "FieldRowStates.jsx STATES", words: constant(inSite("components/FieldRowStates.jsx"), "STATES", ["word"]) },
  // The Methodology page and its parts
  { ns: ["method", "labs"], from: "site.js FIELD_METHOD.classes (MethodPage.jsx, ConditionLab.jsx)", words: FIELD_METHOD.classes.map((item) => item.label) },
  { ns: ["method"], from: "site.js FIELD_METHOD.baseline.label, redEdgeLead", words: [FIELD_METHOD.baseline.label, FIELD_METHOD.redEdgeLead] },
  { ns: ["method"], from: "MethodPage.jsx FIELD_STEPS", words: constant(inSite("pages/MethodPage.jsx"), "FIELD_STEPS", "*") },
  { ns: ["method"], from: "Film.jsx FILM_CHAPTERS", words: constant(inSite("components/Film.jsx"), "FILM_CHAPTERS", ["label"]) },
  { ns: ["method"], from: "walkthroughs.json chapters (Walkthrough.jsx)", words: Object.values(WALKTHROUGHS).flatMap((film) => film.chapters.map((chapter) => chapter.label)) },
  { ns: ["labs"], from: "ConditionLab.jsx PARTS", words: constant(inSite("components/ConditionLab.jsx"), "PARTS", ["name"]) },
  // The Story, Contact, Demo, Register and Owner pages
  { ns: ["story"], from: "StoryPage.jsx ROOTS, EDITIONS", words: [...constant(inSite("pages/StoryPage.jsx"), "ROOTS", "*"), ...constant(inSite("pages/StoryPage.jsx"), "EDITIONS", ["word", "label"])] },
  { ns: ["contact"], from: "ContactPage.jsx ROLES, DEFAULT_PROMPT, PHONES", words: [...constant(inSite("pages/ContactPage.jsx"), "ROLES", ["value", "prompt"]), ...constant(inSite("pages/ContactPage.jsx"), "DEFAULT_PROMPT", "*"), ...constant(inSite("pages/ContactPage.jsx"), "PHONES", ["alt"])] },
  { ns: ["demo", "owner"], from: "site.js DEMO_DOORS labels", words: DEMO_DOORS.map((door) => door.label) },
  { ns: ["owner"], from: "site.js DEMO_DOORS captions", words: DEMO_DOORS.map((door) => door.caption) },
  { ns: ["register"], from: "registration.js PRODUCTS, ORG_KINDS, PICTURES (RegisterPage.jsx, SignInPage.jsx)", words: [...constant(REGISTRATION, "PRODUCTS", ["tagline"]), ...constant(REGISTRATION, "ORG_KINDS", ["label"]), ...constant(REGISTRATION, "PICTURES", ["alt", "caption"])] },
  { ns: ["register"], from: "registration.js, the checks' and Firebase's sentences (RegisterPage.jsx sayProblem)", words: sentences(REGISTRATION) },
  { ns: ["register"], from: "RegisterPage.jsx, its own sentences (sayProblem)", words: sentences(inSite("pages/RegisterPage.jsx")) },
  { ns: ["owner"], from: "OwnerPage.jsx PROBLEMS and its sentences (problemOf)", words: sentences(inSite("pages/OwnerPage.jsx")) },
  // The globe and the Ukraine ranking
  { ns: ["globe"], from: "worldData.js WAR_NAMES", words: constant(inSite("components/worldData.js"), "WAR_NAMES", "*") },
  { ns: ["globe"], from: "globeMath.js MONTHS, KIND_WORD, LEVEL_WORD", words: [...constant(inSite("components/globeMath.js"), "MONTHS", "*"), ...constant(inSite("components/globeMath.js"), "KIND_WORD", "*"), ...constant(inSite("components/globeMath.js"), "LEVEL_WORD", "*")] },
  { ns: ["ranking"], from: "ukraine-demo.json (DemoRanking.jsx)", words: [UKRAINE_DEMO.area.monthLabel, ...Object.values(UKRAINE_DEMO.timeframes).map((frame) => frame.label), ...UKRAINE_DEMO.units.flatMap((unit) => [unit.name, unit.note].filter(Boolean))] },
  { ns: ["ranking"], from: "DemoRanking.jsx, the time frames", words: [...sourceOf(inSite("components/DemoRanking.jsx")).matchAll(new RegExp(String.raw`\["\w+", (${STRING})\]`, "g"))].map((m) => JSON.parse(m[1])) },
];

test("every English sentence t() gets from a variable is in both dictionaries, in the namespace that shows it", () => {
  const problems = [];
  for (const { ns: namespaces, from, words } of WORDS_FROM_VARIABLES) {
    assert.ok(words.length > 0, `${from}: no words found`);
    for (const word of words) {
      if (!hasWord(word)) continue; // a date, a number, a name: nothing to translate
      for (const code of DICTIONARY_LANGUAGES) {
        const dict = dictionaries[code];
        for (const ns of namespaces) {
          if (dict[ns]?.[word] === undefined && dict.common?.[word] === undefined) problems.push(`${from}: "${word.slice(0, 70)}" is not in ${code}/${ns}.js or ${code}/common.js`);
        }
      }
    }
  }
  assert.ok(problems.length === 0, `${problems.length} problem(s):\n${problems.join("\n")}`);
});

// ---- Nothing left in English on the pages ----

// Text a visitor would read that is not passed through t(): between tags
// (>text<), before a hole (>text{), after one (}text<), between two
// (}text{), a "string" shown on its own in braces ({"text"}, {`text`}) or
// chosen by a ternary ({busy ? "Sending…" : "Send"}), and in the
// attributes that are read aloud or shown.

// A fragment the patterns catch that is code, not words: an arrow function,
// && or ||, a comparison, a call (a word and "(" at once), a statement's
// end (";" then the line's end), a keyword after a block ("} else {",
// "} const {"), "for (", a declaration, an object's next property
// ("}, water: {"), an attribute before its {value} ("data-rise style="), or
// brackets, "=" or ";" among words that never come two together ("return
// (", ` className="x"`). Prose keeps its brackets and its semicolons: "Try
// the demo (no account needed)" is text.
const isCode = (fragment) =>
  /=>|&&|\|\||[=!]==|\?\./.test(fragment) ||
  /[\w$)\]]\(/.test(fragment) ||
  /;\s*(\n|$)/.test(fragment) ||
  /^\s*(else|catch|finally|try|do|return|const|let|var|export|import|function)\b/.test(fragment) ||
  /^\s*(for|if|switch|while)\s*\(/.test(fragment) ||
  /\b(const|let|var)\s+[\w$]+\s*=|\b(export|import)\s|\bfunction\s*[\w$]*\s*\(/.test(fragment) ||
  /^\s*,\s*[\w$]+:/.test(fragment) ||
  /[\w-]=\s*$/.test(fragment) ||
  (/[;=()[\]`]/.test(fragment) && !/[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(fragment));

// The attributes whose value is read aloud or shown; any other attribute's
// value (className, key, style) is not text.
const TEXT_ATTRS = new Set(["alt", "aria-label", "placeholder", "title", "label"]);
const ANY_STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`/.source;
const IN_BRACES = new RegExp(String.raw`\{\s*(${ANY_STRING})\s*\}`, "g");
const THEN_BRANCH = new RegExp(String.raw`\?\s*(${ANY_STRING})\s*:`, "g");
const ELSE_BRANCH = new RegExp(String.raw`\?[^:?{}]*:\s*(${ANY_STRING})`, "g");
const TWO_WORDS = /[A-Za-z]{3,}\s+[A-Za-z]{2,}/;
// A string literal's words: a template's ${holes} are not words.
const plainString = (literal) => {
  if (literal[0] === '"') return JSON.parse(literal);
  return literal
    .slice(1, -1)
    .replace(/\$\{[^}]*\}/g, " ")
    .replace(/\\(.)/g, "$1");
};
// The source with the insides of its strings and its trailing comments
// blanked (every line kept, so a line is the same line): the braces left
// are the code's own, never a {hole} inside a t("...") key.
const codeOnly = (source) =>
  source
    .replace(new RegExp(ANY_STRING, "g"), (literal) => literal[0] + literal.slice(1, -1).replace(/[^\n]/g, " ") + literal[0])
    .replace(/\/\/.*$/gm, (comment) => " ".repeat(comment.length));
// What the braces around a position are: an attribute's value (its name),
// a tag's child ("child": the "{" follows a tag or another child), or
// plain code (null: an object, a block, a template's "${").
function bracesOf(source, index) {
  const open = source.lastIndexOf("{", index);
  if (open < 0) return null;
  const before = source.slice(Math.max(0, open - 80), open);
  const named = /([A-Za-z][\w-]*)=\{*$/.exec(before);
  if (named) return named[1];
  return /(?<![=-])>\s*$|\}\s*$/.test(before) ? "child" : null;
}

function untranslated(source) {
  const found = [];
  // The line reported is the one the text starts on, not its tag's.
  const note = (fragment, start, what) => {
    const text = fragment.replace(/\s+/g, " ").trim();
    if (!text || !hasWord(text)) return;
    const line = source.slice(0, start + fragment.match(/^\s*/)[0].length).split("\n").length;
    found.push(`${line}: ${what} "${text.slice(0, 70)}"`);
  };
  const prose = (fragment, start, what) => {
    if (!isCode(fragment)) note(fragment, start, what);
  };
  // A tag's ">" is never the ">" of "=>", and a tag after the text starts
  // with a letter or "/", never a space (a comparison: "=> score < c.upTo").
  for (const m of source.matchAll(/(?<!=)>([^<>{}]+)(?=<[A-Za-z/]|\{)/g)) prose(m[1], m.index + 1, "text");
  for (const m of source.matchAll(/\}([^<>{}]+)(?=<[A-Za-z/])/g)) prose(m[1], m.index + 1, "text after a hole");
  // Between two holes, in the code's own braces; a template's "${" is not a hole.
  for (const m of codeOnly(source).matchAll(/\}([^<>{}]+)(?<!\$)(?=\{)/g)) prose(m[1], m.index + 1, "text between holes");
  for (const m of source.matchAll(/\b(alt|aria-label|placeholder|title|label)="([^"\n]*)"/g)) note(m[2], m.index + m[1].length + 2, m[1]);
  // A string in a tag's braces: shown on its own, or one side of a ternary.
  // In an attribute's ternary one word is a name or a key ("lazy", "text"),
  // never a sentence, so two words or more are asked for there; as a tag's
  // child one word ("Saved") is text. Braces in plain code (an object, a
  // block) are not looked into.
  const shown = (literal, at, what, twoWords) => {
    const braces = bracesOf(source, at);
    if (!braces || (braces !== "child" && !TEXT_ATTRS.has(braces))) return;
    const text = plainString(literal);
    if (twoWords && braces !== "child" && !TWO_WORDS.test(text)) return;
    note(text, at, braces === "child" ? what : braces);
  };
  for (const m of source.matchAll(IN_BRACES)) shown(m[1], m.index + m[0].indexOf(m[1]), "text in braces", false);
  for (const m of source.matchAll(THEN_BRANCH)) shown(m[1], m.index + m[0].indexOf(m[1]), "text in a choice", true);
  for (const m of source.matchAll(ELSE_BRANCH)) shown(m[1], m.index + m[0].lastIndexOf(m[1]), "text in a choice", true);
  return found;
}

for (const file of SOURCE_FILES) {
  test(`no English left outside t() in ${rel(file)}`, () => {
    const found = untranslated(SOURCES[file]);
    assert.ok(found.length === 0, `${found.length} place(s):\n${found.join("\n")}`);
  });
}

test("the untranslated-text check sees what it should and lets names through", () => {
  assert.deepEqual(untranslated('<p>Hello there</p>'), ['1: text "Hello there"']);
  assert.deepEqual(untranslated('<p>{t("Hello there")}</p>'), []);
  assert.deepEqual(untranslated('<p>Chernozem</p><span>NDVI</span><b>2019 to 2021</b>'), [], "names and years pass");
  assert.deepEqual(untranslated('<p>Read in {t("x")} and more</p>'), ['1: text "Read in"', '1: text after a hole "and more"']);
  assert.deepEqual(untranslated('<img alt="A field near Kupiansk" />'), ['1: alt "A field near Kupiansk"']);
  assert.deepEqual(untranslated('<img alt={t("A field near Kupiansk")} />'), []);
  assert.deepEqual(untranslated("if (a > b) return value;\nconst x = y;"), [], "code is not text");
  assert.deepEqual(untranslated("const f = (c) => score < c.upTo;"), [], "an arrow function's comparison is not text");
  assert.deepEqual(untranslated(stripComments("<p>\n  {/* a note */}\n  Hello there\n</p>")), ['3: text "Hello there"'], "the line is the text's own, comments stripped");
  // Prose keeps its brackets, semicolons and equals signs.
  assert.deepEqual(untranslated("<p>Try the demo (no account needed)</p>"), ['1: text "Try the demo (no account needed)"']);
  assert.deepEqual(untranslated("<p>Mark your fields; we read them</p>"), ['1: text "Mark your fields; we read them"']);
  assert.deepEqual(untranslated("<p>Condition = health plus water</p>"), ['1: text "Condition = health plus water"']);
  assert.deepEqual(untranslated("<p>Weather</p>"), ['1: text "Weather"'], "one word between tags is text");
  assert.deepEqual(untranslated("  }\n  if (!data) return null;\n  return (\n    <div>{x}</div>\n  );\n}\nexport const SLIDERS = {\n  a: 1,\n};"), [], "statements between blocks are not text");
  assert.deepEqual(untranslated("  } else {\n    go();\n  }\n  return <Spinner />;\n"), [], "a keyword after a block is not text");
  // Between two holes, and strings shown in braces or chosen by a ternary.
  assert.deepEqual(untranslated('<p>{t("Open Field")} and then {t("Open Atlas")}</p>'), ['1: text between holes "and then"']);
  assert.deepEqual(untranslated('<button>{busy ? "Sending the message" : "Send the message"}</button>'), ['1: text in a choice "Sending the message"', '1: text in a choice "Send the message"']);
  assert.deepEqual(untranslated('<b>{saved ? "Saved" : "Failed"}</b>'), ['1: text in a choice "Saved"', '1: text in a choice "Failed"'], "one word chosen as a tag's child is text");
  assert.deepEqual(untranslated("<p>{`Read on ${name} every clear pass`}</p>"), ['1: text in braces "Read on every clear pass"']);
  assert.deepEqual(untranslated('<p>{"Welcome to the demo farm"}</p>'), ['1: text in braces "Welcome to the demo farm"']);
  assert.deepEqual(untranslated('<img alt={busy ? "The field, reading" : "The field, read"} />'), ['1: alt "The field, reading"', '1: alt "The field, read"']);
  assert.deepEqual(untranslated('<p className={first ? "story-statement pg-fade" : "story-statement"} loading={below ? "lazy" : "eager"}>{t("x")}</p>'), [], "class names and one-word values are not text");
  assert.deepEqual(untranslated("const list = `${names.slice(0, -1).join(\", \")} and ${names[names.length - 1]}`;"), [], "a template's holes are not holes");
});

test("every file of the languages starts with the plain-English header", () => {
  const files = [];
  for (const name of readdirSync(here)) {
    const file = join(here, name);
    if (statSync(file).isDirectory()) for (const inner of readdirSync(file)) files.push(join(file, inner));
    else files.push(file);
  }
  for (const file of files.filter((f) => /\.(jsx?|css)$/.test(f))) {
    assert.match(readFileSync(file, "utf8").slice(0, 400), /WHAT THIS FILE DOES/, `${rel(file)} lacks the header`);
  }
});
