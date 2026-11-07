// WHAT THIS FILE DOES
// The plain functions behind the website's languages (i18n.jsx is the React
// side; this file has no JSX so the tests can load it):
//   LANGUAGES              the three languages: code (en, zh, uk), the
//                          page's lang attribute, the locale for numbers,
//                          and the name each language gives itself
//   pickLanguage(...)      which language to open in: ?lang= in the
//                          address (a code, zh, or a tag, zh-CN), then the
//                          choice this browser saved, then the browser's
//                          own languages in the visitor's order (English
//                          included), else English
//   translate(dict, ns, key, vars)
//                          the sentence in the dictionary's language: the
//                          namespace's entry, else common's, else the
//                          English key itself; an entry may be a function
//                          of vars (plurals)
//   fill(text, vars)       fills {name} holes; an element among the values
//                          gives React pieces instead of one string
//
// WHO EDITS IT
// Whoever adds a language or changes how one is chosen. Tested in
// i18n.test.js.

import { Fragment, createElement } from "react";

export const LANGUAGES = [
  { code: "en", html: "en", locale: "en-US", name: "English" },
  { code: "zh", html: "zh-Hans", locale: "zh-CN", name: "中文" },
  { code: "uk", html: "uk", locale: "uk-UA", name: "Українська" },
];
export const DEFAULT_LANGUAGE = "en";
export const STORAGE_KEY = "chernozem.site.lang";
const CODES = LANGUAGES.map((language) => language.code);

export const languageInfo = (code) => LANGUAGES.find((language) => language.code === code) || LANGUAGES[0];
export const cleanLanguage = (value) => (typeof value === "string" && CODES.includes(value) ? value : undefined);

// From a language tag ("zh-TW", "uk-UA", "en-GB", "ZH"), the browser's or
// the address's, to one of ours, or undefined for a language the website
// does not have.
export function fromBrowserLanguage(tag) {
  const primary = String(tag || "")
    .toLowerCase()
    .split(/[-_]/)[0];
  return CODES.includes(primary) ? primary : undefined;
}

// The browser's languages are in the visitor's order of preference, so the
// first one the website has wins, English included: a browser set to
// French, then English, then Ukrainian opens the website in English.
export function pickLanguage({ query, stored, browserLanguages } = {}) {
  // ?lang=zh-CN, ?lang=uk-UA and ?lang=ZH, the forms links and tools
  // produce, ask for a language as surely as ?lang=zh.
  const asked = fromBrowserLanguage(query);
  if (asked) return asked;
  const saved = cleanLanguage(stored);
  if (saved) return saved;
  for (const tag of browserLanguages || []) {
    const code = fromBrowserLanguage(tag);
    if (code) return code;
  }
  return DEFAULT_LANGUAGE;
}

// Fills the {name} holes of a sentence from vars. All strings and numbers:
// one string. An element among them: an array of pieces for React, each
// element keyed. A hole with no value is left as written.
export function fill(template, vars) {
  const text = String(template);
  if (!vars || !text.includes("{")) return text;
  const parts = text.split(/\{(\w+)\}/g); // the odd positions are the names
  let plain = true;
  const pieces = parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const value = vars[part];
    if (value === undefined || value === null) return `{${part}}`;
    if (typeof value === "object") plain = false;
    return value;
  });
  if (plain) return pieces.join("");
  return pieces.filter((piece) => piece !== "").map((piece, i) => (typeof piece === "object" ? createElement(Fragment, { key: i }, piece) : String(piece)));
}

export function translate(dict, ns, key, vars) {
  const entry = dict?.[ns]?.[key] ?? dict?.common?.[key];
  const text = entry === undefined ? key : typeof entry === "function" ? entry(vars || {}) : entry;
  return fill(text, vars);
}
