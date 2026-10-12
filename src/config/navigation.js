// WHAT THIS FILE DOES
// Describes the two products in the app and the pages inside each one. The
// sidebar (src/layout/Sidebar.jsx) draws itself from this list, and App.jsx
// uses the same paths for its routes.
//
//   Field - what a farmer sees: their own farm.
//   Atlas - what a regional office sees: the whole country.
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
  NotebookPen,
  MessageSquare,
  Database,
  SlidersHorizontal,
} from "lucide-react";

export const products = {
  field: {
    id: "field",
    label: "Field",
    basePath: "/field",
    // The box under the Field / Atlas switch.
    scope: {
      title: "My farm",
      subtitle: "7 fields · 271.0 ha",
      icon: Grid2x2,
    },
    // The small note near the bottom of the sidebar.
    privacyNote: "Your fields are private",
    account: { initials: "MF", label: "Account", tone: "farm" },
    pages: [
      { id: "overview", label: "Overview", path: "/field", icon: LayoutGrid },
      { id: "fields", label: "Fields", path: "/field/fields", icon: Grid2x2 },
      { id: "notes", label: "Notes", path: "/field/notes", icon: NotebookPen },
      { id: "ai", label: "AI", path: "/field/ai", icon: MessageSquare },
      { id: "data", label: "Data", path: "/field/data", icon: Database },
      { id: "settings", label: "Settings", path: "/field/settings", icon: SlidersHorizontal },
    ],
  },

  atlas: {
    id: "atlas",
    label: "Atlas",
    basePath: "/atlas",
    scope: {
      title: "Ukraine",
      subtitle: "24 regions · 35.0M ha cropland",
      icon: Map,
    },
    privacyNote: "Farm data joins only with consent",
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
