// WHAT THIS FILE DOES
// The frame of the app. It draws the navigation bar at the top and decides
// which page to show underneath: Home, Field or Atlas.
//
// WHO EDITS IT
// Whoever adds a new page or tab. Teammates working on the chat, the soil
// data or the tile titles do not need to touch this file.
//
// NOTE
// Pages are switched with a simple "which page are we on" value rather than a
// routing library. This means the browser's Back button and links to a
// specific field do not work yet. A router can be added here later.

import { useState } from "react";
import HomePage from "./pages/HomePage.jsx";
import FieldPage from "./pages/FieldPage.jsx";
import AtlasPage from "./pages/AtlasPage.jsx";

export default function App() {
  // Which page is showing: "home", "field" or "atlas".
  const [page, setPage] = useState("home");
  // The name shown at the top of the Field page.
  const [fieldName, setFieldName] = useState("");

  // Runs when someone clicks Search on the Home screen.
  function handleSearch(text) {
    setFieldName(text.trim() || "Unnamed field");
    setPage("field");
  }

  // The Field page counts as part of the Home tab.
  const onHomeTab = page === "home" || page === "field";

  return (
    <div className="app">
      <header className="nav">
        <span className="nav-brand">Chernozem Field</span>
        <nav className="nav-tabs">
          <button
            type="button"
            className={onHomeTab ? "nav-tab nav-tab-active" : "nav-tab"}
            onClick={() => setPage("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={page === "atlas" ? "nav-tab nav-tab-active" : "nav-tab"}
            onClick={() => setPage("atlas")}
          >
            Atlas
          </button>
        </nav>
      </header>

      {page === "home" && <HomePage onSearch={handleSearch} />}
      {page === "field" && (
        <FieldPage fieldName={fieldName} onBack={() => setPage("home")} />
      )}
      {page === "atlas" && <AtlasPage />}
    </div>
  );
}
