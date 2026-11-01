// WHAT THIS FILE DOES
// Every page's code, and the address each page answers. Each page is
// loaded only when it is first opened (src/lib/lazyPage.js), so the app
// starts faster and the map library (Leaflet) is only downloaded by the
// pages that show a map; the website's pages, its animation library and
// the 3D globe are likewise only downloaded by visitors who open them.
//
// preloadFor(address) fetches the code an address needs (the website's
// frame and its page, or the app's page) ahead of time: src/main.jsx does
// it for the first page of a visit, before React draws anything, and the
// website's frame does it for a link the visitor points at. codeFor()
// only says which code that is.
//
// WHO EDITS IT
// Whoever adds a page: its file goes here with its address, and its
// <Route> into src/App.jsx (a test checks the two agree). An app page goes
// into src/config/navigation.js too, so it shows up in the sidebar; a
// website page into src/site/content/site.js so it shows up in the menu.

import { lazyPage } from "./lib/lazyPage.js";

// The public website (src/site/), open to anyone, no sign-in.
export const SiteShell = lazyPage(() => import("./site/SiteShell.jsx"));
export const HomePage = lazyPage(() => import("./site/pages/HomePage.jsx"));
export const StoryPage = lazyPage(() => import("./site/pages/StoryPage.jsx"));
export const MethodPage = lazyPage(() => import("./site/pages/MethodPage.jsx"));
export const ContactPage = lazyPage(() => import("./site/pages/ContactPage.jsx"));
export const DemoPage = lazyPage(() => import("./site/pages/DemoPage.jsx"));
export const RegisterPage = lazyPage(() => import("./site/pages/RegisterPage.jsx"));
export const SignInPage = lazyPage(() => import("./site/pages/SignInPage.jsx"));
export const OwnerPage = lazyPage(() => import("./site/pages/OwnerPage.jsx"));
export const NotFoundPage = lazyPage(() => import("./site/pages/NotFoundPage.jsx"));

// The app itself (src/pages/), inside the sidebar frame.
export const FieldOverviewPage = lazyPage(() => import("./pages/field/OverviewPage.jsx"));
export const FieldFieldsPage = lazyPage(() => import("./pages/field/FieldsPage.jsx"));
export const FieldAiPage = lazyPage(() => import("./pages/field/AiPage.jsx"));
export const FieldDataPage = lazyPage(() => import("./pages/field/DataPage.jsx"));
export const FieldSettingsPage = lazyPage(() => import("./pages/field/SettingsPage.jsx"));

export const AtlasOverviewPage = lazyPage(() => import("./pages/atlas/OverviewPage.jsx"));
export const AtlasMapPage = lazyPage(() => import("./pages/atlas/MapPage.jsx"));
export const AtlasAiPage = lazyPage(() => import("./pages/atlas/AiPage.jsx"));
export const AtlasDataPage = lazyPage(() => import("./pages/atlas/DataPage.jsx"));
export const AtlasSettingsPage = lazyPage(() => import("./pages/atlas/SettingsPage.jsx"));
export const AtlasReportPage = lazyPage(() => import("./pages/atlas/ReportPage.jsx"));

// The website's addresses (inside the SiteShell frame).
export const SITE_PAGES = {
  "/": HomePage,
  "/story": StoryPage,
  "/method": MethodPage,
  "/contact": ContactPage,
  "/demo": DemoPage,
  "/register": RegisterPage,
  "/signin": SignInPage,
  "/owner": OwnerPage,
};

// The first website's addresses, kept so old links still land somewhere.
export const OLD_ADDRESSES = {
  "/about": "/",
  "/product": "/method",
  "/guide": "/method",
  "/technology": "/method",
  "/design": "/method",
};

// The app's addresses (inside the AppShell frame, behind the AccessGate).
export const APP_PAGES = {
  "/field": FieldOverviewPage,
  "/field/fields": FieldFieldsPage,
  "/field/ai": FieldAiPage,
  "/field/data": FieldDataPage,
  "/field/settings": FieldSettingsPage,
  "/atlas": AtlasOverviewPage,
  "/atlas/map": AtlasMapPage,
  "/atlas/ai": AtlasAiPage,
  "/atlas/data": AtlasDataPage,
  "/atlas/settings": AtlasSettingsPage,
  "/atlas/report": AtlasReportPage,
};

// The pages an address needs, in the order they are drawn: the website's
// frame and its page, or the app's page (any other Field or Atlas address
// lands on that product's overview; an unknown website address on the
// "page not found" page). Capitals do not matter, as for the router
// (/Story is the Story page).
export function codeFor(pathname) {
  const path = String(pathname || "/").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase() || "/";
  if (path === "/field" || path.startsWith("/field/")) return [APP_PAGES[path] || FieldOverviewPage];
  if (path === "/atlas" || path.startsWith("/atlas/")) return [APP_PAGES[path] || AtlasOverviewPage];
  const target = OLD_ADDRESSES[path] || path;
  return [SiteShell, SITE_PAGES[target] || NotFoundPage];
}

// Starts fetching the code an address needs. Settles once every file has
// arrived or failed (it never rejects: a page whose code cannot be fetched
// now is simply fetched again when it is opened).
export function preloadFor(pathname) {
  return Promise.allSettled(codeFor(pathname).map((Page) => Page.preload()));
}
