// WHAT THIS FILE DOES
// useAccess(): what the access screen (src/components/atlas/AccessGate.jsx)
// learned from the server, for any part of the app that needs it:
//   { shared }   true: an access code is set, so everyone with the code
//                sees and changes the same data; false: this computer only;
//                null: not known (the server could not be reached)
// The Field sidebar uses it for "Your fields are private" or "Shared with
// everyone who has the access code" (src/layout/Sidebar.jsx).
//
// WHO EDITS IT
// Nobody, normally.

import { createContext, useContext } from "react";

export const AccessContext = createContext({ shared: null });

export function useAccess() {
  return useContext(AccessContext);
}
