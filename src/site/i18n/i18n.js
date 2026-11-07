// WHAT THIS FILE DOES
// The public website (src/site/) in three languages: English, which is
// written in the pages themselves; Chinese (simplified) and Ukrainian,
// which live in dictionaries beside this file (zh/, uk/), one file per
// part of the website, keyed by the English sentence.
//
//   <LanguageProvider>   around the website (SiteShell.jsx): decides the
//                        language, loads its dictionary (only then: an
//                        English visitor downloads nothing), sets the
//                        page's lang, the tab's description and the
//                        numbers' locale, and loads the Chinese face.
//   useT(namespace)      gives t(english, vars): the sentence in the
//                        current language, or the English itself when the
//                        dictionary has no entry (nothing ever goes
//                        missing; it only stays English). {name} holes are
//                        filled from vars; a hole given a React element
//                        makes t return pieces instead of one string.
//                        t.lang and t.locale say which language it is.
//   useLanguage()        { lang, pending, setLang }: the language, the one
//                        a switch has asked for while its dictionary is
//                        still downloading (else null), and the switch
//                        (components/LanguageSwitch.jsx).
//
// A dictionary entry is a string, or a function of the vars for sentences
// whose form depends on a number (Ukrainian has three plural forms).
// A namespace is a part of the website (home, story, method, contact,
// demo, register, signin, owner, globe, ranking); "common" holds what the
// frame and more than one page say, and every namespace falls back to it.
// The plain functions (which language, how a sentence is looked up) are in
// language.js, tested in i18n.test.js along with every dictionary. No JSX
// here either, so the tests can load the hooks that use this file.
//
// WHO EDITS IT
// Whoever adds a language (language.js LANGUAGES, a folder of
// dictionaries, a font stack in site.css) or changes how it is loaded.

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { readPref, writePref } from "../../lib/prefs.js";
import { SITE, setNumberLocale } from "../content/site.js";
import { DEFAULT_LANGUAGE, STORAGE_KEY, cleanLanguage, fromBrowserLanguage, languageInfo, pickLanguage, translate } from "./language.js";

export { LANGUAGES, DEFAULT_LANGUAGE, STORAGE_KEY, cleanLanguage, fill, fromBrowserLanguage, languageInfo, pickLanguage, translate } from "./language.js";

const LanguageContext = createContext({ lang: DEFAULT_LANGUAGE, dict: {}, pending: null, setLang: () => {} });

// The dictionaries are downloaded only for the language in use.
const LOADERS = {
  zh: () => import("./zh/index.js"),
  uk: () => import("./uk/index.js"),
};

export async function loadDictionary(code) {
  if (code === DEFAULT_LANGUAGE || !LOADERS[code]) return {};
  const module = await LOADERS[code]();
  return module.default;
}

// The Chinese face, loaded only when the website is read in Chinese.
const ZH_FONT_ID = "site-font-zh";
const ZH_FONT_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;800&display=swap";

function ensureFont(code) {
  if (code !== "zh" || typeof document === "undefined" || document.getElementById(ZH_FONT_ID)) return;
  const link = document.createElement("link");
  link.id = ZH_FONT_ID;
  link.rel = "stylesheet";
  link.href = ZH_FONT_URL;
  document.head.appendChild(link);
}

function initialLanguage() {
  if (typeof window === "undefined") return { lang: DEFAULT_LANGUAGE, asked: false };
  const query = new URLSearchParams(window.location.search).get("lang");
  const lang = pickLanguage({
    query,
    stored: readPref(STORAGE_KEY, undefined, cleanLanguage),
    browserLanguages: navigator.languages || [navigator.language],
  });
  return { lang, asked: fromBrowserLanguage(query) === lang };
}

export function LanguageProvider({ children, initial }) {
  const [state, setState] = useState(() => {
    const start = initial ? { lang: initial, asked: false } : initialLanguage();
    return { lang: start.lang, dict: start.lang === DEFAULT_LANGUAGE ? {} : null, asked: start.asked };
  });
  // The last switch asked for wins, however the downloads come back.
  const request = useRef(0);
  // The language a switch has asked for while its dictionary downloads, so
  // the switch can show it at once; null when no download is under way.
  const [pending, setPending] = useState(null);

  // The first dictionary, for a visitor who opens the website in Chinese or
  // Ukrainian. If it cannot be downloaded (offline), the website is English,
  // but that is not recorded as the visitor's choice (asked: false).
  useEffect(() => {
    if (state.dict) return undefined;
    let alive = true;
    const id = ++request.current;
    loadDictionary(state.lang)
      .then((dict) => {
        if (alive && id === request.current) setState((s) => ({ ...s, dict }));
      })
      .catch(() => {
        if (alive && id === request.current) setState((s) => ({ ...s, lang: DEFAULT_LANGUAGE, dict: {}, asked: false }));
      });
    return () => {
      alive = false;
    };
  }, [state.lang, state.dict]);

  // The switch: the choice is saved once its dictionary has arrived (a
  // download that fails leaves the website, and the saved choice, as they
  // were), and a ?lang= in the address is dropped, so a reload or a revisit
  // of the same address does not undo it. Dropped through the router, so
  // the pages see the address as it now is (the Register page copies the
  // address's parameters when a product is picked).
  const navigate = useNavigate();
  const setLang = useCallback((code) => {
    const next = cleanLanguage(code);
    if (!next) return;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.delete("lang");
        navigate({ pathname: url.pathname, search: url.search, hash: url.hash }, { replace: true });
      }
    }
    const id = ++request.current;
    setPending(next);
    loadDictionary(next)
      .then((dict) => {
        if (id !== request.current) return;
        writePref(STORAGE_KEY, next);
        setState({ lang: next, dict, asked: false });
        setPending(null);
      })
      .catch(() => {
        if (id === request.current) setPending(null);
      });
  }, [navigate]);

  // Numbers follow the language at once, in this same render, so a page
  // drawn under this provider formats with the right locale.
  const info = languageInfo(state.lang);
  setNumberLocale(info.locale);

  // The page's own language, the tab's description, the Chinese face, and
  // a ?lang= in the address remembered as the visitor's choice once its
  // dictionary is here (a download that fails saves nothing). Leaving the
  // website (for the app, which is English) puts the page back to English.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const html = document.documentElement;
    html.lang = info.html;
    setNumberLocale(info.locale);
    ensureFont(state.lang);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", translate(state.dict || {}, "common", SITE.description));
    if (state.asked && state.dict) writePref(STORAGE_KEY, state.lang);
    return () => {
      html.lang = "en";
      setNumberLocale("en-US");
      if (meta) meta.setAttribute("content", SITE.description);
    };
  }, [state.lang, state.dict, state.asked, info.html, info.locale]);

  const value = useMemo(() => ({ lang: state.lang, dict: state.dict || {}, pending, setLang }), [state.lang, state.dict, pending, setLang]);

  // Until the first dictionary is here nothing is drawn, so the visitor
  // never sees English turn into their language a moment later.
  if (!state.dict) return createElement("div", { style: { minHeight: "100svh" }, "aria-busy": "true" });
  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLanguage() {
  const { lang, pending, setLang } = useContext(LanguageContext);
  return { lang, pending, setLang };
}

export function useT(ns = "common") {
  const { lang, dict } = useContext(LanguageContext);
  return useMemo(() => {
    const t = (key, vars) => translate(dict, ns, key, vars);
    t.lang = lang;
    t.locale = languageInfo(lang).locale;
    t.has = (key) => dict?.[ns]?.[key] !== undefined || dict?.common?.[key] !== undefined;
    return t;
  }, [dict, lang, ns]);
}
