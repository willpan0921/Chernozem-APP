// WHAT THIS FILE DOES
// The starting point. It loads the styling, switches on page routing (so
// every page has its own web address and the Back button works) and puts the
// app (App.jsx) into the "root" box in index.html.
//
// Before anything is drawn, the code of the page at this address is
// fetched (src/lazyPages.js): the page then shows the moment React runs,
// instead of after a blank moment and React's 0.3 s hold for a page still
// downloading. If it cannot be fetched (offline for a moment; the file
// gone after a new version went live), or takes more than 8 seconds, the
// app starts anyway and the usual error handling takes over.
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

const root = createRoot(document.getElementById("root"));
const draw = () =>
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
const atMost = new Promise((done) => setTimeout(done, 8000));
Promise.race([preloadFor(window.location.pathname), atMost]).then(draw, draw);
