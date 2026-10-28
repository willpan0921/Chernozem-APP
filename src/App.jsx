// WHAT THIS FILE DOES
// The list of pages and their web addresses. There are two kinds:
//
// The public website (src/site/), open to anyone, no access code:
//   /             Home                     /method       How the ranking works
//   /story        The founding story       /technology   What it is built on
//   /product      Field and Atlas          /design       How it was designed
//   /guide        How to use it            /contact      Contact
//
// The app itself, inside the AppShell (the sidebar frame), behind the
// access code when the owner has set one (src/components/atlas/AccessGate.jsx):
//   /field            Field: Overview        /atlas            Atlas: Overview
//   /field/fields     Field: Fields (map)    /atlas/map        Atlas: Atlas (map)
//   /field/ai         Field: AI chat         /atlas/ai         Atlas: AI chat
//   /field/data       Field: Data            /atlas/data       Atlas: Data archive
//   /field/settings   Field: Settings        /atlas/settings   Atlas: Settings
//                                            /atlas/report     Atlas: donor report
//
// Any other address shows the website's "page not found" page.
//
// WHO EDITS IT
// Whoever adds a page. An app page goes into src/config/navigation.js too,
// so it shows up in the sidebar; a website page goes into
// src/site/content/site.js so it shows up in the website's menu.

import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell.jsx";
import ErrorBoundary from "./layout/ErrorBoundary.jsx";
import { AtlasDataProvider } from "./state/AtlasData.jsx";
import { FieldDataProvider } from "./state/FieldData.jsx";
import AccessGate from "./components/atlas/AccessGate.jsx";

// Each page is loaded only when it is first opened ("lazy"), so the app
// starts faster and the map library (Leaflet) is only downloaded by the
// pages that show a map. The website's pages and its animation library
// are likewise only downloaded by visitors who open the website.
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

const SiteShell = lazy(() => import("./site/SiteShell.jsx"));
const HomePage = lazy(() => import("./site/pages/HomePage.jsx"));
const StoryPage = lazy(() => import("./site/pages/StoryPage.jsx"));
const ProductPage = lazy(() => import("./site/pages/ProductPage.jsx"));
const GuidePage = lazy(() => import("./site/pages/GuidePage.jsx"));
const MethodPage = lazy(() => import("./site/pages/MethodPage.jsx"));
const TechnologyPage = lazy(() => import("./site/pages/TechnologyPage.jsx"));
const DesignPage = lazy(() => import("./site/pages/DesignPage.jsx"));
const ContactPage = lazy(() => import("./site/pages/ContactPage.jsx"));
const NotFoundPage = lazy(() => import("./site/pages/NotFoundPage.jsx"));

// The Atlas data and the Field data are each loaded once for the whole app
// (the first time one of their pages opens), so moving between pages is
// instant and the sidebar can show the current area or farm. See
// src/state/AtlasData.jsx and src/state/FieldData.jsx. The AccessGate around
// them only lets the app open once the visitor may use it; the website
// outside it needs no sign-in. <Suspense> shows nothing for the moment a
// page's code is first downloading; after that, moving between pages keeps
// the old page on screen until the new one is ready. A page that fails to
// show (its code gone after an update, or any error) gets a message with a
// Reload button, never a blank screen: the ErrorBoundary here, and the one
// around each page in AppShell.jsx.
function GatedApp() {
  return (
    <AccessGate>
      <AtlasDataProvider>
        <FieldDataProvider>
          <AppShell />
        </FieldDataProvider>
      </AtlasDataProvider>
    </AccessGate>
  );
}

export default function App() {
  return (
    <ErrorBoundary full>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<SiteShell />}>
            <Route index element={<HomePage />} />
            <Route path="/story" element={<StoryPage />} />
            <Route path="/product" element={<ProductPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/method" element={<MethodPage />} />
            <Route path="/technology" element={<TechnologyPage />} />
            <Route path="/design" element={<DesignPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route element={<GatedApp />}>
            <Route path="/field" element={<FieldOverviewPage />} />
            <Route path="/field/fields" element={<FieldFieldsPage />} />
            <Route path="/field/ai" element={<FieldAiPage />} />
            <Route path="/field/data" element={<FieldDataPage />} />
            <Route path="/field/settings" element={<FieldSettingsPage />} />
            {/* An old or mistyped Field address goes to the Field overview. */}
            <Route path="/field/*" element={<Navigate to="/field" replace />} />

            <Route path="/atlas" element={<AtlasOverviewPage />} />
            <Route path="/atlas/map" element={<AtlasMapPage />} />
            <Route path="/atlas/ai" element={<AtlasAiPage />} />
            <Route path="/atlas/data" element={<AtlasDataPage />} />
            <Route path="/atlas/settings" element={<AtlasSettingsPage />} />
            <Route path="/atlas/report" element={<AtlasReportPage />} />
            <Route path="/atlas/*" element={<Navigate to="/atlas" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
