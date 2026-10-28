// WHAT THIS FILE DOES
// useAccess(): what the access screen (src/components/atlas/AccessGate.jsx)
// learned from the server about the visitor, for any part of the app that
// needs it:
//   { shared, account, profile }
//   shared    true: the demo (an access code is set, so everyone with the
//             code sees and changes the same data); false: an account, or
//             this computer only; null: not known (the server could not be
//             reached)
//   account   null for the demo; for a person registered on the website
//             { uid, email, name, product: "field" | "atlas" | null,
//             profileComplete }
//   profile   what that person told the register page (GET /api/account:
//             name, organization, country, address, place { lat, lng,
//             label } ...), or null
// The sidebar uses it for the Field / Atlas switch (demo only), the note
// ("Your fields are private to your account" / "Shared with everyone who
// has the access code") and the account row (src/layout/Sidebar.jsx); the
// first screens use the profile to start near home
// (src/components/field/FarmSetup.jsx, src/components/atlas/AreaPicker.jsx);
// src/components/ProductGuard.jsx keeps an account on its own product.
// The pure rules are in src/lib/access.js and src/lib/profile.js.
//
// WHO EDITS IT
// Nobody, normally.

import { createContext, useContext } from "react";

export const AccessContext = createContext({ shared: null, account: null, profile: null });

export function useAccess() {
  return useContext(AccessContext);
}
