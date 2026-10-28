// WHAT THIS FILE DOES
// Small hooks the website's pages share:
//   usePageTitle("Story")   sets the browser tab's title for this page
//   useScrollTop()          scrolls to the top when the address changes
//                           (used once, in SiteShell)
//   useScrolled(px)         true once the page is scrolled past px (the menu
//                           bar turns solid)
//
// WHO EDITS IT
// Nobody, normally.

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { pageTitle } from "./content/site.js";

export function usePageTitle(sub) {
  useEffect(() => {
    const before = document.title;
    document.title = pageTitle(sub);
    return () => {
      document.title = before;
    };
  }, [sub]);
}

export function useScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);
}

export function useScrolled(px = 12) {
  const [scrolled, setScrolled] = useState(() => typeof window !== "undefined" && window.scrollY > px);
  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > px);
        ticking = false;
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [px]);
  return scrolled;
}
