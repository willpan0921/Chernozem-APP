// WHAT THIS FILE DOES
// The starting point. It loads the styling, switches on page routing (so
// every page has its own web address and the Back button works) and puts the
// app (App.jsx) into the "root" box in index.html.
//
// Before anything is drawn, the code of the page at this address is
// fetched (src/lazyPages.js), for at most 0.6 seconds: on most connections
// it arrives within that, and the page then shows the moment React runs,
// instead of after a blank moment and React's 0.3 s hold for a page still
// downloading. On a slow connection the app starts after 0.6 s anyway, so
// the menu bar shows while the page itself arrives (as before), and if the
// code cannot be fetched at all (offline for a moment; the file gone after
// a new version went live) the usual error handling takes over.
//
// An address typed with capitals (/Story) is first put in lowercase.
//
// When a new version of the app went live while this tab was open, the
// first page the tab opens after that finds its code gone from the server:
// the page then reloads once by itself, onto the new version
// (src/lib/staleChunks.js).
//
// WHO EDITS IT
// Nobody, normally.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { preloadFor } from "./lazyPages.js";
import { reloadForNewVersion } from "./lib/staleChunks.js";
import "./styles.css";

// Vite's loader announces a page file (or its styles) it could not load.
// The error itself still reaches the page (src/layout/ErrorBoundary.jsx),
// in case the reload is not allowed.
window.addEventListener("vite:preloadError", () => {
  reloadForNewVersion(window);
});

// Every address of the site and the app is lowercase. A typed or shared
// address with capitals (/Story, /Field/AI) is put in lowercase before
// anything is drawn, so the page, its code and its data all find it (the
// query and the part after # are left as they are).
const { pathname: typed, search, hash } = window.location;
if (typed !== typed.toLowerCase()) window.history.replaceState(window.history.state, "", typed.toLowerCase() + search + hash);

const root = createRoot(document.getElementById("root"));
const draw = () =>
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
const FIRST_DRAW_WAIT_MS = 600;
const atMost = new Promise((done) => setTimeout(done, FIRST_DRAW_WAIT_MS));
Promise.race([preloadFor(window.location.pathname), atMost]).then(draw, draw);
