// WHAT THIS FILE DOES
// Small hooks the website's pages share:
//   usePageTitle("Story")   sets the browser tab's title for this page
//   useScrollTop()          scrolls to the top (or to the #part of the
//                           address) when the address changes; used once,
//                           in SiteShell
//   useReveal()             gives a ref for a section; the section gets the
//                           class "is-in" the first time it scrolls into
//                           view, and its CSS plays the entrance of its
//                           parts (site.css, "Entrances"). Without the
//                           observer the class is added at once, so nothing
//                           ever stays hidden.
//   useMediaQuery(q)        true when the browser matches a media query,
//                           for example "(prefers-reduced-motion: reduce)"
//
// WHO EDITS IT
// Nobody, normally.

import { useCallback, useEffect, useState } from "react";
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
      // The part may not exist yet (the page's code is still arriving): keep
      // looking for up to two seconds, then give up quietly.
      let tries = 0;
      let timer = 0;
      const look = () => {
        const target = document.getElementById(hash.slice(1));
        if (target) {
          target.scrollIntoView({ block: "start" });
          return;
        }
        if (tries++ < 40) timer = window.setTimeout(look, 50);
      };
      look();
      return () => window.clearTimeout(timer);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return undefined;
  }, [pathname, hash]);
}

// One observer for the whole page: every section that asks for a reveal is
// watched by it, and dropped once it has been seen.
let observer = null;
function getObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
  );
  return observer;
}

export function useReveal() {
  return useCallback((node) => {
    if (!node) return;
    const io = getObserver();
    if (!io) {
      node.classList.add("is-in");
      return;
    }
    // Already on screen when it mounts (the first screen, or a page opened
    // at a #part): no need to wait for a scroll.
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight * 0.9 && box.bottom > 0) {
      node.classList.add("is-in");
      return;
    }
    io.observe(node);
  }, []);
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
