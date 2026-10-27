// WHAT THIS FILE DOES
// The list of pages and their web addresses. Every page sits inside the
// AppShell (the sidebar frame). Opening "/" sends you to the Field overview.
//
//   /field            Field: Overview        /atlas            Atlas: Overview
//   /field/fields     Field: Fields (map)    /atlas/map        Atlas: Atlas (map)
//   /field/ai         Field: AI chat         /atlas/ai         Atlas: AI chat
//   /field/data       Field: Data            /atlas/data       Atlas: Data archive
//   /field/settings   Field: Settings        /atlas/settings   Atlas: Settings
//                                            /atlas/report     Atlas: donor report
//
// When the owner has set an access code on the server, the AccessGate
// asks for it before any page opens (src/components/atlas/AccessGate.jsx).
//
// WHO EDITS IT
// Whoever adds a page. Add the page to src/config/navigation.js too, so it
// shows up in the sidebar.

import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell.jsx";
import ErrorBoundary from "./layout/ErrorBoundary.jsx";
import { AtlasDataProvider } from "./state/AtlasData.jsx";
import { FieldDataProvider } from "./state/FieldData.jsx";
import AccessGate from "./components/atlas/AccessGate.jsx";

// Each page is loaded only when it is first opened ("lazy"), so the app
// starts faster and the map library (Leaflet) is only downloaded by the
// pages that show a map.
const FieldOverviewPage = lazy(() => import("./pages/field/OverviewPage.jsx"));
const FieldFieldsPage = lazy(() => import("./pages/field/FieldsPage.jsx"));
const FieldAiPage = lazy(() => import("./pages/field/AiPage.jsx"));
const FieldDataPage = lazy(() => import("./pages/field/DataPage.jsx"));
const FieldSettingsPage = lazy(() => import("./pages/field/SettingsPage.jsx"));

const AtlasOverviewPage = lazy(() => import("./pages/atlas/OverviewPage.jsx"));
const AtlasMapPage = lazy(() => import("./pages/atlas/MapPage.jsx"));
const AtlasAiPage = lazy(() => import("./pages/atlas/AiPage.jsx"));
const AtlasDataPage = lazy(() => import("./pages/atlas/DataPage.jsx"));
const AtlasSettingsPage = lazy(() => import("./pages/atlas/SettingsPage.jsx"));
const AtlasReportPage = lazy(() => import("./pages/atlas/ReportPage.jsx"));

// The Atlas data and the Field data are each loaded once for the whole app
// (the first time one of their pages opens), so moving between pages is
// instant and the sidebar can show the current area or farm. See
// src/state/AtlasData.jsx and src/state/FieldData.jsx. The AccessGate around
// it only lets the app open once the visitor may use it. <Suspense> shows
// nothing for the moment a page's code is first downloading; after that,
// moving between pages keeps the old page on screen until the new one is
// ready. A page that fails to show (its code gone after an update, or any
// error) gets a message with a Reload button, never a blank screen: the
// ErrorBoundary here, and the one around each page in AppShell.jsx.
export default function App() {
  return (
    <ErrorBoundary full>
      <AccessGate>
        <AtlasDataProvider>
          <FieldDataProvider>
            <Suspense fallback={null}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Navigate to="/field" replace />} />

                  <Route path="/field" element={<FieldOverviewPage />} />
                  <Route path="/field/fields" element={<FieldFieldsPage />} />
                  <Route path="/field/ai" element={<FieldAiPage />} />
                  <Route path="/field/data" element={<FieldDataPage />} />
                  <Route path="/field/settings" element={<FieldSettingsPage />} />

                  <Route path="/atlas" element={<AtlasOverviewPage />} />
                  <Route path="/atlas/map" element={<AtlasMapPage />} />
                  <Route path="/atlas/ai" element={<AtlasAiPage />} />
                  <Route path="/atlas/data" element={<AtlasDataPage />} />
                  <Route path="/atlas/settings" element={<AtlasSettingsPage />} />
                  <Route path="/atlas/report" element={<AtlasReportPage />} />

                  {/* Anything else goes back to the Field overview. */}
                  <Route path="*" element={<Navigate to="/field" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </FieldDataProvider>
        </AtlasDataProvider>
      </AccessGate>
    </ErrorBoundary>
  );
}
