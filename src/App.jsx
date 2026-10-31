// WHAT THIS FILE DOES
// The list of pages and their web addresses. There are two kinds:
//
// The public website (src/site/), open to anyone, no sign-in:
//   /             About: what Chernozem is   /contact      Contact
//   /story        The story                  /demo         Try the Ukraine demo (open to all, read-only)
//   /method       Methodology                /register     Make an account (Field or Atlas)
//                                            /signin       Sign in to an account
//                                            /owner        The owner signs in with the Chernozem Google account (not linked anywhere)
//   Old addresses (/about, /product, /guide, /technology, /design) go to
//   the page that now holds that content.
//
// The app itself, inside the AppShell (the sidebar frame), behind the
// AccessGate (src/components/atlas/AccessGate.jsx): a visitor with no
// account sees the public demo (both products, read-only); a registered
// account opens the product it chose; the owner (the Chernozem Google account) edits the demo.
//   /field            Field: Overview        /atlas            Atlas: Overview
//   /field/fields     Field: Fields (map)    /atlas/map        Atlas: Atlas (map)
//   /field/ai         Field: AI chat         /atlas/ai         Atlas: AI chat
//   /field/data       Field: Data            /atlas/data       Atlas: Data archive
//   /field/settings   Field: Settings        /atlas/settings   Atlas: Settings
//                                            /atlas/report     Atlas: donor report
//
// Any other address shows the website's "page not found" page.
//
// Each page's code is loaded only when the page is first opened; the list
// of the files, and which code each address needs, is src/lazyPages.js
// (the first page of a visit is fetched before anything is drawn, so it
// shows at once: src/main.jsx).
//
// WHO EDITS IT
// Whoever adds a page: its file goes into src/lazyPages.js and its <Route>
// here (a test checks the two agree). An app page goes into
// src/config/navigation.js too, so it shows up in the sidebar; a website
// page goes into src/site/content/site.js so it shows up in the website's
// menu.

import { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell.jsx";
import ErrorBoundary from "./layout/ErrorBoundary.jsx";
import { AtlasDataProvider } from "./state/AtlasData.jsx";
import { FieldDataProvider } from "./state/FieldData.jsx";
import AccessGate from "./components/atlas/AccessGate.jsx";
import ProductGuard from "./components/ProductGuard.jsx";
import {
  SiteShell,
  HomePage,
  StoryPage,
  MethodPage,
  ContactPage,
  DemoPage,
  RegisterPage,
  SignInPage,
  OwnerPage,
  NotFoundPage,
  FieldOverviewPage,
  FieldFieldsPage,
  FieldAiPage,
  FieldDataPage,
  FieldSettingsPage,
  AtlasOverviewPage,
  AtlasMapPage,
  AtlasAiPage,
  AtlasDataPage,
  AtlasSettingsPage,
  AtlasReportPage,
} from "./lazyPages.js";

// The Atlas data and the Field data are each loaded once for the whole app
// (the first time one of their pages opens), so moving between pages is
// instant and the sidebar can show the current area or farm. See
// src/state/AtlasData.jsx and src/state/FieldData.jsx. The AccessGate around
// them only lets the app open once the visitor may use it (the public
// demo, an account, or the owner signed in on the website); the website
// outside it needs no sign-in. Inside, a ProductGuard around each product's
// routes keeps a registered account on the product it chose: an Atlas
// account that opens a Field address lands on /atlas, and the other way
// round. The demo visitor passes both. <Suspense> shows nothing for the
// moment a page's code is still downloading (rare: the first page of a
// visit is fetched before anything is drawn, and a page whose link was
// pointed at is already here); after that, moving between pages keeps the
// old page on screen until the new one is ready. A page that fails to show
// (its code gone after an update, or any error) gets a message with a
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
            <Route path="/method" element={<MethodPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/signin" element={<SignInPage />} />
            {/* The owner's own sign-in (the Chernozem Google account), not linked from anywhere. */}
            <Route path="/owner" element={<OwnerPage />} />
            {/* The first website's addresses, kept so old links still land somewhere (the same list as OLD_ADDRESSES in src/lazyPages.js). */}
            <Route path="/about" element={<Navigate to="/" replace />} />
            <Route path="/product" element={<Navigate to="/method#product" replace />} />
            <Route path="/guide" element={<Navigate to="/method#use" replace />} />
            <Route path="/technology" element={<Navigate to="/method#technology" replace />} />
            <Route path="/design" element={<Navigate to="/method#design" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route element={<GatedApp />}>
            {/* Field: an Atlas account is sent to /atlas from any of these. */}
            <Route element={<ProductGuard product="field" />}>
              <Route path="/field" element={<FieldOverviewPage />} />
              <Route path="/field/fields" element={<FieldFieldsPage />} />
              <Route path="/field/ai" element={<FieldAiPage />} />
              <Route path="/field/data" element={<FieldDataPage />} />
              <Route path="/field/settings" element={<FieldSettingsPage />} />
              {/* An old or mistyped Field address goes to the Field overview. */}
              <Route path="/field/*" element={<Navigate to="/field" replace />} />
            </Route>

            {/* Atlas: a Field account is sent to /field from any of these. */}
            <Route element={<ProductGuard product="atlas" />}>
              <Route path="/atlas" element={<AtlasOverviewPage />} />
              <Route path="/atlas/map" element={<AtlasMapPage />} />
              <Route path="/atlas/ai" element={<AtlasAiPage />} />
              <Route path="/atlas/data" element={<AtlasDataPage />} />
              <Route path="/atlas/settings" element={<AtlasSettingsPage />} />
              <Route path="/atlas/report" element={<AtlasReportPage />} />
              <Route path="/atlas/*" element={<Navigate to="/atlas" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
