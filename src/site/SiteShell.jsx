// WHAT THIS FILE DOES
// The frame of the public website: the menu bar at the top, the page in
// the middle (src/site/pages/*), the footer at the bottom. Pages slide in
// softly when the address changes, and the window scrolls back to the top.
// The website needs no access code; "Open the app" in the menu leads to
// the app, which asks for the code if one is set.
//
// WHO EDITS IT
// Whoever works on the website's frame. The menu's links come from
// src/site/content/site.js.

import { Suspense, useEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import { useScrollTop } from "./hooks.js";
import "./site.css";

export default function SiteShell() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  useScrollTop();
  // The page wrapper only slides in from the second page on: on the first
  // load the page's own entrances (the hero, the rising headlines) play.
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
      <AnimatePresence mode="wait">
        <motion.main
          id="main"
          key={pathname}
          initial={first.current ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={<div style={{ minHeight: "70vh" }} aria-busy="true" />}>{outlet}</Suspense>
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
