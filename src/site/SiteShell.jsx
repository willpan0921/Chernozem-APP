// WHAT THIS FILE DOES
// The frame of the public website: the menu bar at the top, the page in
// the middle (src/site/pages/*), the footer line at the bottom. When the
// address changes the new page is put in place at once and rises in
// softly, while the old one is lifted out of the way and fades over it in
// 0.12 s (a cross-fade: nothing waits for the old page to leave), and the
// window goes back to the top. Everything inside is scoped by the class
// "site", so the website's styling (site.css) never touches the app's
// pages and the app's never touches the website.
//
// It also starts two helpers for as long as the website is open (the app
// never has them):
//   - the pin cursor's click assist (cursorAssist.js);
//   - warming: pointing at a link to another page of the website (or
//     reaching it with the Tab key) starts downloading that page's code
//     (src/lazyPages.js, the same list src/App.jsx draws from), so by the
//     time of the click it is there and the page shows at once, without
//     the blank moment a page still downloading gets.
//
// WHO EDITS IT
// Whoever works on the website's frame. The menu's links come from
// src/site/content/site.js. A new page of the website goes into
// src/lazyPages.js (its address and its file) and src/App.jsx.

// site.css first, before the menu's and the footer's sheets, so it is in
// the page before them however the website is opened (every page module
// imports it first too).
import "./site.css";
import { Suspense, useEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import { LanguageProvider, useT } from "./i18n/i18n.js";
import { useScrollTop } from "./hooks.js";
import { startCursorAssist } from "./cursorAssist.js";
import { preloadFor } from "../lazyPages.js";

// Starts downloading the page a link leads to (a page of the website, or
// the app's Field or Atlas overview behind the Demo page's buttons), once
// per address. A download that fails (offline for a moment) is forgotten,
// so the click, or the next pointing at the link, tries again.
export function startWarming(doc = document, preload = preloadFor) {
  const started = new Set();
  const warm = (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link || link.origin !== window.location.origin || link.pathname === window.location.pathname) return;
    const path = link.pathname.replace(/\/+$/, "") || "/";
    if (started.has(path)) return;
    started.add(path);
    preload(path).then((results) => {
      if (results.some((result) => result.status === "rejected")) started.delete(path);
    });
  };
  doc.addEventListener("pointerover", warm, { passive: true });
  doc.addEventListener("focusin", warm);
  return () => {
    doc.removeEventListener("pointerover", warm);
    doc.removeEventListener("focusin", warm);
  };
}

// The website is drawn inside its language (src/site/i18n/i18n.js): the
// provider decides it and holds the page until its dictionary is here.
export default function SiteShell() {
  return (
    <LanguageProvider>
      <Site />
    </LanguageProvider>
  );
}

function Site() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const t = useT("common");
  useScrollTop();
  // The page only rises in from the second page on: on the first load the
  // page's own entrance (the headline rising from its baseline) plays.
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  // A click anywhere on the pin cursor reaches the link or button under it.
  useEffect(() => startCursorAssist(), []);
  // Pointing at a link gets its page ready.
  useEffect(() => startWarming(), []);
  return (
    <div className="site">
      <a className="skip" href="#main">
        {t("Skip to content")}
      </a>
      <Nav />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.main
          id="main"
          key={pathname}
          initial={first.current || reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] } }}
          exit={reduced ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.12, ease: "linear" } }}
        >
          {/* The footer is inside the waiting boundary, so it never shows up early and then jumps away when the page's code arrives. */}
          <Suspense fallback={<div style={{ minHeight: "100svh" }} aria-busy="true" />}>
            {outlet}
            <Footer />
          </Suspense>
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
