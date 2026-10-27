// WHAT THIS FILE DOES
// Describes the two products in the app and the pages inside each one. The
// sidebar (src/layout/Sidebar.jsx) draws itself from this list, and App.jsx
// uses the same paths for its routes.
//
//   Field - what a farmer sees: their own farm.
//   Atlas - what an office sees: a country, a region or a farm it picks.
//
// WHO EDITS IT
// Whoever adds, renames or reorders a page. To add a page:
//   1. Add a line to the product's "pages" list below.
//   2. Create the page file in src/pages/<product>/.
//   3. Add a <Route> for it in src/App.jsx.
//
// The "icon" names are from the Lucide icon set: https://lucide.dev/icons

import {
  LayoutGrid,
  Grid2x2,
  Map,
  MessageSquare,
  Database,
  SlidersHorizontal,
} from "lucide-react";

export const products = {
  field: {
    id: "field",
    label: "Field",
    basePath: "/field",
    // The box under the switch shows the farm (Sidebar.jsx reads its name
    // and fields from the Field data); only the icon is set here.
    scope: { icon: Grid2x2 },
    // The small note near the bottom of the sidebar: "private" on one's
    // own computer, "shared" when the owner set an access code (everyone
    // with the code sees and can change the same farm). Which one shows is
    // worked out in src/lib/access.js from the server's answer.
    privacyNote: {
      private: "Your fields are private",
      shared: "Shared with everyone who has the access code",
    },
    account: { initials: "MF", label: "Account", tone: "farm" },
    pages: [
      { id: "overview", label: "Overview", path: "/field", icon: LayoutGrid },
      { id: "fields", label: "Fields", path: "/field/fields", icon: Grid2x2 },
      { id: "ai", label: "AI", path: "/field/ai", icon: MessageSquare },
      { id: "data", label: "Data", path: "/field/data", icon: Database },
      { id: "settings", label: "Settings", path: "/field/settings", icon: SlidersHorizontal },
    ],
  },

  atlas: {
    id: "atlas",
    label: "Atlas",
    basePath: "/atlas",
    // The box under the switch shows the current area (Sidebar.jsx reads
    // its name from the Atlas data); only the icon is set here.
    scope: { icon: Map },
    account: { initials: "RO", label: "Regional office", tone: "atlas" },
    pages: [
      { id: "overview", label: "Overview", path: "/atlas", icon: LayoutGrid },
      { id: "atlas", label: "Atlas", path: "/atlas/map", icon: Map },
      { id: "ai", label: "AI", path: "/atlas/ai", icon: MessageSquare },
      { id: "data", label: "Data", path: "/atlas/data", icon: Database },
      { id: "settings", label: "Settings", path: "/atlas/settings", icon: SlidersHorizontal },
    ],
  },
};

// Works out which product a page path belongs to. "/atlas/data" -> atlas.
export function productForPath(pathname) {
  return pathname.startsWith(products.atlas.basePath) ? products.atlas : products.field;
}
