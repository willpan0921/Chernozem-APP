// WHAT THIS FILE DOES
// The list of pages and their web addresses. Every page sits inside the
// AppShell (the sidebar frame). Opening "/" sends you to the Field overview.
//
//   /field            Field: Overview        /atlas            Atlas: Overview
//   /field/fields     Field: Fields (map)    /atlas/map        Atlas: Atlas (map)
//   /field/notes      Field: Notes           /atlas/ai         Atlas: AI chat
//   /field/ai         Field: AI chat         /atlas/data       Atlas: Data archive
//   /field/data       Field: Data            /atlas/settings   Atlas: Settings
//   /field/settings   Field: Settings
//
// WHO EDITS IT
// Whoever adds a page. Add the page to src/config/navigation.js too, so it
// shows up in the sidebar.

import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell.jsx";

import FieldOverviewPage from "./pages/field/OverviewPage.jsx";
import FieldFieldsPage from "./pages/field/FieldsPage.jsx";
import FieldNotesPage from "./pages/field/NotesPage.jsx";
import FieldAiPage from "./pages/field/AiPage.jsx";
import FieldDataPage from "./pages/field/DataPage.jsx";
import FieldSettingsPage from "./pages/field/SettingsPage.jsx";

import AtlasOverviewPage from "./pages/atlas/OverviewPage.jsx";
import AtlasMapPage from "./pages/atlas/MapPage.jsx";
import AtlasAiPage from "./pages/atlas/AiPage.jsx";
import AtlasDataPage from "./pages/atlas/DataPage.jsx";
import AtlasSettingsPage from "./pages/atlas/SettingsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/field" replace />} />

        <Route path="/field" element={<FieldOverviewPage />} />
        <Route path="/field/fields" element={<FieldFieldsPage />} />
        <Route path="/field/notes" element={<FieldNotesPage />} />
        <Route path="/field/ai" element={<FieldAiPage />} />
        <Route path="/field/data" element={<FieldDataPage />} />
        <Route path="/field/settings" element={<FieldSettingsPage />} />

        <Route path="/atlas" element={<AtlasOverviewPage />} />
        <Route path="/atlas/map" element={<AtlasMapPage />} />
        <Route path="/atlas/ai" element={<AtlasAiPage />} />
        <Route path="/atlas/data" element={<AtlasDataPage />} />
        <Route path="/atlas/settings" element={<AtlasSettingsPage />} />

        {/* Anything else goes back to the Field overview. */}
        <Route path="*" element={<Navigate to="/field" replace />} />
      </Route>
    </Routes>
  );
}
