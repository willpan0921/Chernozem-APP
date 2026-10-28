// WHAT THIS FILE DOES
// The frame of the public website: the menu bar at the top, the page in
// the middle (src/site/pages/*), the footer line at the bottom. When the
// address changes the new page rises in softly and the window goes back
// to the top. Everything inside is scoped by the class "site", so the
// website's styling (site.css) never touches the app's pages and the
// app's never touches the website.
//
// WHO EDITS IT
// Whoever works on the website's frame. The menu's links come from
// src/site/content/site.js.

import { Suspense, useEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import { useScrollTop } from "./hooks.js";
import "./site.css";

export default function SiteShell() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  useScrollTop();
  // The page only rises in from the second page on: on the first load the
  // page's own entrance (the headline rising from its baseline) plays.
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return (
    <div className="site">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="main"
          key={pathname}
          initial={first.current || reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          <Suspense fallback={<div style={{ minHeight: "70svh" }} aria-busy="true" />}>{outlet}</Suspense>
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
