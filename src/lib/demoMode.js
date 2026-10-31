// WHAT THIS FILE DOES
// Remembers, for one browser tab, that the visitor chose to look at the
// public demo (the Ukraine farm and the Ukraine Atlas), and tells the
// server so with every request.
//
// Why it is needed: a visitor with no account is shown the demo anyway.
// A visitor WITH an account normally sees their own workspace; when they
// press "Open Field" or "Open Atlas" on the website's Demo page, this tab
// switches to the demo instead, until they leave it (the app's "Back to
// the website" or "Open your own workspace", or signing in again).
//
//   enterDemo()    the Demo page's buttons call this before opening the app
//   leaveDemo()    signing in, finishing registration and "leave the demo" call this
//   isDemoView()   true while this tab looks at the demo
//   demoHeaders()  { "X-Chernozem-View": "demo" } while in the demo, else {}
//
// The server never trusts this for more than looking: the demo is read-only
// whoever asks for it (server/auth.js).
//
// WHO EDITS IT
// Whoever changes how the demo is opened. Keep the header name the same as
// DEMO_VIEW_HEADER in server/auth.js.

const KEY = "chernozem.view";

export const DEMO_VIEW_HEADER = "X-Chernozem-View";

// sessionStorage can be missing (very old browsers, some privacy modes)
// or throw; the demo then simply works as for a visitor with no account.
function storage() {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function enterDemo() {
  try {
    storage()?.setItem(KEY, "demo");
  } catch {
    // Nothing to do: see storage().
  }
}

export function leaveDemo() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to do: see storage().
  }
}

export function isDemoView() {
  try {
    return storage()?.getItem(KEY) === "demo";
  } catch {
    return false;
  }
}

export function demoHeaders() {
  return isDemoView() ? { [DEMO_VIEW_HEADER]: "demo" } : {};
}
