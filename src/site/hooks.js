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
//   useNear(margin)         [ref, near]: near turns true (and stays true)
//                           once the element comes within `margin` of the
//                           screen, or is found already above the screen
//                           (the page came back, with Back or a reload,
//                           scrolled past it; isNear is the rule), so a
//                           heavy part far down the page is only built and
//                           downloaded when the visitor heads towards it.
//                           Without the observer it is true at once.
//
// WHO EDITS IT
// Nobody, normally.

import { useCallback, useEffect, useRef, useState } from "react";
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

// How long a part the address points at (/method#use) is held in place.
export const HOLD_PART_MS = 1500;

export function useScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      // The part may not exist yet (the page's code is still arriving): keep
      // looking for up to two seconds, then give up quietly. Once there, the
      // part is held in place for a second and a half: something that
      // arrives above it after the jump (a film's chapter list, a picture)
      // would otherwise push it down the screen, as happened to /guide on
      // phones. The visitor scrolling, touching or pressing a key lets go
      // at once.
      let tries = 0;
      let timer = 0;
      let held = false;
      const letGo = () => {
        held = false;
      };
      const HANDS = ["wheel", "touchstart", "pointerdown", "keydown"];
      const look = () => {
        const target = document.getElementById(hash.slice(1));
        if (!target) {
          if (tries++ < 40) timer = window.setTimeout(look, 50);
          return;
        }
        target.scrollIntoView({ block: "start" });
        held = true;
        HANDS.forEach((name) => window.addEventListener(name, letGo, { passive: true, once: true }));
        const until = performance.now() + HOLD_PART_MS;
        let top = target.getBoundingClientRect().top;
        const hold = () => {
          if (!held || performance.now() > until || !target.isConnected) return;
          if (Math.abs(target.getBoundingClientRect().top - top) > 4) {
            target.scrollIntoView({ block: "start" });
            top = target.getBoundingClientRect().top;
          }
          timer = window.setTimeout(hold, 100);
        };
        timer = window.setTimeout(hold, 100);
      };
      look();
      return () => {
        window.clearTimeout(timer);
        HANDS.forEach((name) => window.removeEventListener(name, letGo));
      };
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

// What useNear counts as near, from one report of the observer: the element
// is within the margin of the screen, or it is already above the screen
// (its foot above the screen's top). The second matters when the page is
// opened, or comes back with Back, scrolled past the element: the observer
// then only ever reports it as outside the margin, and without this rule it
// would wait until the visitor scrolled back up to it.
export function isNear(entry) {
  return Boolean(entry.isIntersecting || entry.boundingClientRect.bottom < 0);
}

export function useNear(margin = "800px 0px") {
  const ref = useRef(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some(isNear)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near];
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
