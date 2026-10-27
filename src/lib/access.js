// WHAT THIS FILE DOES
// What the app says about who can see the data, worked out from the
// server's answer to /api/auth/status (read once by
// src/components/atlas/AccessGate.jsx):
//
//   isShared(status)              true when an access code is set: the app
//                                 is one workspace that everyone with the
//                                 code sees and can change; false on one's
//                                 own computer; null when not known
//   privacyNoteFor(note, shared)  the Field sidebar's note: { kind, text }
//                                 or null (not known yet: no note, rather
//                                 than a wrong one)
//   canSignOut(shared)            true when the sidebar shows "Sign out":
//                                 only with an access code (without one
//                                 there is no sign-in to end)
//
// The words themselves are in src/config/navigation.js (privacyNote).
//
// WHO EDITS IT
// Nobody, normally.

export function isShared(status) {
  if (!status || typeof status !== "object") return null;
  // An older server says only "required" (a code is set).
  if (typeof status.shared === "boolean") return status.shared;
  if (typeof status.required === "boolean") return status.required;
  return null;
}

// note: { private: "...", shared: "..." } from navigation.js.
export function privacyNoteFor(note, shared) {
  if (!note) return null;
  if (shared === true && note.shared) return { kind: "shared", text: note.shared };
  if (shared === false && note.private) return { kind: "private", text: note.private };
  return null;
}

export function canSignOut(shared) {
  return shared === true;
}
