// WHAT THIS FILE DOES
// The starting point. It loads the styling, switches on page routing (so
// every page has its own web address and the Back button works) and puts the
// app (App.jsx) into the "root" box in index.html.
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
import { reloadForNewVersion } from "./lib/staleChunks.js";
import "./styles.css";

// Vite's loader announces a page file (or its styles) it could not load.
// The error itself still reaches the page (src/layout/ErrorBoundary.jsx),
// in case the reload is not allowed.
window.addEventListener("vite:preloadError", () => {
  reloadForNewVersion(window);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
