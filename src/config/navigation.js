// WHAT THIS FILE DOES
// Describes the two products in the app and the pages inside each one. The
// sidebar (src/layout/Sidebar.jsx) draws itself from this list, and App.jsx
// uses the same paths for its routes.
//
//   Field - what a farmer sees: their own farm.
//   Atlas - what an office sees: a country, a region or a farm it picks.
//
// Also here, at the end: the words the app uses for the public demo
// (demoWords): the sidebar's demo box, "Back to the website", the "This is
// the demo" dialog and the line on the Settings pages.
//
// WHO EDITS IT
// Whoever adds, renames or reorders a page. To add a page:
//   1. Add a line to the product's "pages" list below.
//   2. Create the page file in src/pages/<product>/.
//   3. Add a <Route> for it in src/App.jsx.
// Whoever changes how the demo is worded edits demoWords and privacyNote.
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
    // The small note near the bottom of the sidebar, by kind of visitor
    // (src/lib/access.js sidebarNoteFor): "demo" inside the demo box (the
    // public demo: everyone sees the same farm, nobody can change it),
    // "owner" for the owner editing that demo, "private" on one's own
    // computer, "account" for a person registered on the website (their
    // own farm, nobody else's).
    privacyNote: {
      demo: "Everyone sees this farm",
      owner: "You are editing the demo",
      private: "Your fields are private",
      account: "Your fields are private to your account",
    },
    // The account row for the owner (and one's own computer). A registered
    // account shows the person's own name and initials instead
    // (src/lib/access.js accountLabel); the demo shows its demo box instead.
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
    // The sidebar's note (see Field above). The Atlas says nothing on one's
    // own computer or for an account.
    privacyNote: {
      demo: "Everyone sees this area",
      owner: "You are editing the demo",
    },
    // The account row for the owner (an account shows its own name).
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

// The public demo's words (src/lib/access.js says who sees them):
//   back           the sidebar's link to the public website, for everyone
//   note           the title of the sidebar's demo box
//   register       its button (to the website's register page)
//   signIn         its quiet link for someone who already has an account
//   ownWorkspace   for an account holder looking at the demo: back to their
//                  own fields or area (it takes Register's place for them)
//   dialogTitle,   the dialog any change opens in the demo
//   dialogText,
//   notNow
//   dialogOwnText  the dialog's second line for an account holder looking
//                  at the demo (its button is then ownWorkspace)
//   offlineTitle,  the same dialog while the server could not be reached
//   offlineText,   (the visitor is not known yet, so nothing is changed)
//   close
//   settings       the one line on both Settings pages in the demo
//                  ("Register" in it is the link)
export const demoWords = {
  back: "Back to the website",
  note: "Demo · Ukraine, read-only",
  register: "Register",
  signIn: "Sign in",
  ownWorkspace: "Open your own workspace",
  dialogTitle: "This is the demo, so it can't be changed.",
  dialogText: "Register to do this on your own land.",
  notNow: "Not now",
  dialogOwnText: "Do this in your own workspace.",
  offlineTitle: "Chernozem can't be reached right now.",
  offlineText: "Nothing can be changed until it answers. Try again in a moment.",
  close: "Close",
  settings: { before: "This is the demo. ", link: "Register", after: " to set up your own." },
};

// The refusal's full sentence, as the server words it too.
export const DEMO_READ_ONLY_TEXT = `${demoWords.dialogTitle} ${demoWords.dialogText}`;
