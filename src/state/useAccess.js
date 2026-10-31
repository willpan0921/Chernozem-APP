// WHAT THIS FILE DOES
// useAccess(): what the access gate (src/components/atlas/AccessGate.jsx)
// learned from the server about the visitor, for any part of the app that
// needs it:
//   { mode, readOnly, shared, account, owner, profile, ownHome }
//   mode      "demo" (the public demo, read-only), "owner" (signed in on
//             the hidden /owner page with the Chernozem Google account),
//             "open" (one's own computer, no owner sign-in needed),
//             "account" (a person registered on the website), or null
//             while not known (the server could not be reached)
//   readOnly  true for the demo, and while not known: buttons that would
//             change something open the "This is the demo" dialog instead
//             (src/state/useDemoGuard.js)
//   shared    true for the shared demo data (demo, owner, open); false for
//             an account; null while not known
//   account   null unless mode is "account": { uid, email, name, product:
//             "field" | "atlas" | null, profileComplete }
//   owner     null unless mode is "owner" and the server names the Google
//             account signed in: { uid, email, name } (the sidebar's "You
//             are editing the demo (signed in as ...)")
//   profile   what that person told the register page (GET /api/account:
//             name, organization, country, address, place { lat, lng,
//             label } ...), or null
//   ownHome   for an account holder looking at the demo: where their own
//             workspace starts ("/field" or "/atlas"), for the sidebar's
//             "Open your own workspace"; else null
// The sidebar uses it for the Field / Atlas switch, the demo box, the note
// and the account row (src/layout/Sidebar.jsx); the first screens use the
// profile to start near home (src/components/field/FarmSetup.jsx,
// src/components/atlas/AreaPicker.jsx); src/components/ProductGuard.jsx
// keeps an account on its own product, and the data layers
// (src/state/AtlasData.jsx, FieldData.jsx) ask for nothing of the other
// product. The pure rules are in src/lib/access.js and src/lib/profile.js.
//
// WHO EDITS IT
// Nobody, normally.

import { createContext, useContext } from "react";

// Before the server has answered, or without it: nobody known, read-only.
export const UNKNOWN_ACCESS = Object.freeze({ mode: null, readOnly: true, shared: null, account: null, owner: null, profile: null, ownHome: null });

export const AccessContext = createContext(UNKNOWN_ACCESS);

export function useAccess() {
  return useContext(AccessContext);
}
