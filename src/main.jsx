// WHAT THIS FILE DOES
// The starting point. It loads the styling and puts the app (App.jsx) into
// the "root" box in index.html.
//
// WHO EDITS IT
// Nobody, normally.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
