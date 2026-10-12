// WHAT THIS FILE DOES
// The starting point. It loads the styling, switches on page routing (so
// every page has its own web address and the Back button works) and puts the
// app (App.jsx) into the "root" box in index.html.
//
// WHO EDITS IT
// Nobody, normally.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
