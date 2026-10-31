// WHAT THIS FILE DOES
// Loads a page's code only when the page is first shown, like React's own
// lazy(), with one addition: the code can be fetched ahead of time
// (Page.preload()), and a page whose code has arrived shows at once.
//
// Why not React's lazy(): with it a page always "suspends" the first time
// it is drawn, even when its code is already here, and React then keeps
// the screen blank for up to 0.3 s (its guard against flicker). Here the
// page reads its code through React's use(): a download that has finished
// is marked as such on the promise itself (status "fulfilled", the way
// use() understands), so nothing suspends and nothing is held. The first
// page of a visit is fetched before React draws anything (src/main.jsx),
// and a page whose link is pointed at is fetched before the click
// (src/site/SiteShell.jsx).
//
// A download that fails (offline for a moment, or the file gone after a
// new version went live) is forgotten when it was only a fetch ahead of
// time, so the next attempt downloads again. Once the page itself has
// asked for its code, a failure stays, and the error reaches the page's
// error boundary as before (src/layout/ErrorBoundary.jsx, with the reload
// for a new version in src/lib/staleChunks.js).
//
// WHO EDITS IT
// Nobody, normally. The pages are listed in src/lazyPages.js.

import { createElement, use } from "react";

// Marks a promise the way React's use() reads it: while it runs its status
// is "pending"; once it settles, its result is on the promise itself
// ("fulfilled" with the value, or "rejected" with the reason). A promise
// already marked is left alone.
export function track(promise) {
  if (typeof promise.status === "string") return promise;
  promise.status = "pending";
  promise.then(
    (value) => {
      promise.status = "fulfilled";
      promise.value = value;
    },
    (reason) => {
      promise.status = "rejected";
      promise.reason = reason;
    }
  );
  return promise;
}

// lazyPage(() => import("./pages/SomePage.jsx")) gives a component that
// draws the file's default export, downloading the file the first time it
// is needed. Page.preload() starts the download early (and gives the
// promise); Page.loaded says whether the code is here.
export function lazyPage(load) {
  let promise = null;
  let shown = false;
  // The download starts at once (an import() that fails on the spot
  // becomes a rejected promise, like one that fails later).
  const begin = () => {
    try {
      return Promise.resolve(load());
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const start = () => {
    if (!promise) {
      const attempt = track(begin());
      // A fetch ahead of time that failed is forgotten, so the page's own
      // request (or the next pointing at its link) downloads again.
      attempt.then(null, () => {
        if (!shown && promise === attempt) promise = null;
      });
      promise = attempt;
    }
    return promise;
  };
  function Page(props) {
    shown = true;
    const module = use(start());
    return createElement(module.default, props);
  }
  Page.preload = start;
  Object.defineProperty(Page, "loaded", { get: () => promise?.status === "fulfilled" });
  return Page;
}
