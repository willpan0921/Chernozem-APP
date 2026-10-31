// WHAT THIS FILE DOES
// Who the visitor is, worked out from the server's answer to
// GET /api/auth/status (read by src/components/atlas/AccessGate.jsx):
//
//   { required, signedIn, shared, account, mode, readOnly }
//
// There is no access code screen any more. The app always opens, and the
// server says which of four kinds of visitor this is ("mode"):
//
//   "demo"     anyone without an account, and an account holder who chose
//              "Open Field" or "Open Atlas" on the website's Demo page: the
//              public Ukraine demo, both products, READ-ONLY. They can look
//              at everything, switch views, move the Atlas weights (in
//              their own browser only) and ask the AI a few questions;
//              anything that would change the demo opens the "This is the
//              demo" dialog instead (src/state/useDemoGuard.js).
//   "owner"    the owner, signed in with the owner's key on the hidden
//              /owner page: the same demo data, and every change is saved.
//   "open"     no key set on the server (one's own computer): the same
//              powers as the owner.
//   "account"  registered on the website: one product (Field or Atlas),
//              their own private workspace, their name in the sidebar.
//   null       not known (the server could not be reached): the app opens
//              anyway, read-only, and the gate asks again later.
//
// An older server, from before "mode", is read the old way: an account is
// an account, no code set is "open", the code's cookie is the owner (the
// code is the owner's key now), and no cookie with a code set is the demo.
//
// THE RULES. Each takes the server's answer, or what useAccess() gives
// ({ mode, readOnly, shared, account, profile, ownHome }), which carries
// the same "mode" and "account".
//   modeOf(status)               "demo" | "owner" | "open" | "account" | null
//   isReadOnly(status)           true for the demo, and while not known
//   isShared(status)             true when this is the shared demo data
//                                (demo, owner, open); false for an account;
//                                null when not known
//   accountOf(status)            the registered account ({ uid, email, name,
//                                product, profileComplete }), only when the
//                                visitor IS that account; null otherwise
//                                (the demo never has one, even for an
//                                account holder looking at it)
//   productFor(status)           "field" | "atlas" for an account with that
//                                product; null when both products are open
//   restrictsProduct(status)     true when src/components/ProductGuard.jsx
//                                keeps the visitor on one product (an
//                                account; never the demo)
//   canSwitchProduct(status)     true when the sidebar shows the Field /
//                                Atlas switch (demo, owner, open; an account
//                                only before it has a product)
//   canSignOut(status)           true when the sidebar shows "Sign out": the
//                                owner and accounts, never the demo
//   showDemoNote(status)         true for the sidebar's "Demo · Ukraine,
//                                read-only" box with "Register"
//   canSeeMessages(status)       true for Atlas Settings' "Messages from the
//                                website" card (owner and open only)
//   homePathFor(status)          where the visitor's app starts: "/atlas"
//                                for an Atlas account, else "/field"
//   needsProfile(status)         true when an account must finish its
//                                profile on the website first
//   registerPathFor(status)      the website page that finishes the profile,
//                                with the product already chosen
//   demoRegisterPath(productId)  where the demo's "Register" goes:
//                                "/register?product=field" from Field,
//                                "/register?product=atlas" from the Atlas
//   backToWebsitePath()          where "Back to the website" goes: "/"
//   identityOf(status)           "demo:", "owner:", "account:<uid>"... or
//                                null when not known: the gate starts the
//                                app again when this changes
//   sidebarNoteFor(note, status) the sidebar's small note { kind, text }, or
//                                null (words in src/config/navigation.js)
//   accountLabel(account)        the sidebar's account row: { initials, label }
//   isDemoRefusal(error)         true for the server's (or the app's own)
//                                "demo_read_only" refusal
//
// The words themselves are in src/config/navigation.js (privacyNote,
// demoWords).
//
// WHO EDITS IT
// Nobody, normally. The server side is server/auth.js.

const PRODUCTS = ["field", "atlas"];
export const MODES = ["demo", "owner", "open", "account"];

// The code the server (and the app itself) gives a change refused because
// this is the demo.
export const DEMO_READ_ONLY_CODE = "demo_read_only";

function isObject(value) {
  return Boolean(value) && typeof value === "object";
}

// The account object the answer carries, whatever the mode.
function rawAccount(status) {
  if (!isObject(status)) return null;
  return isObject(status.account) ? status.account : null;
}

export function modeOf(status) {
  if (!isObject(status)) return null;
  if (MODES.includes(status.mode)) return status.mode;
  // An older server, from before "mode".
  if (rawAccount(status)) return "account";
  if (status.required === false) return "open";
  if (status.required === true) return status.signedIn === true ? "owner" : "demo";
  return null;
}

export function isReadOnly(status) {
  if (isObject(status) && typeof status.readOnly === "boolean") return status.readOnly;
  const mode = modeOf(status);
  // Not known: nothing is changed until the server has said who this is.
  return mode === null || mode === "demo";
}

export function accountOf(status) {
  return modeOf(status) === "account" ? rawAccount(status) : null;
}

export function isShared(status) {
  const mode = modeOf(status);
  if (mode === null) return null;
  return mode !== "account";
}

export function productFor(status) {
  const account = accountOf(status);
  if (!account) return null;
  return PRODUCTS.includes(account.product) ? account.product : null;
}

export function restrictsProduct(status) {
  return productFor(status) !== null;
}

export function canSwitchProduct(status) {
  return productFor(status) === null;
}

export function canSignOut(status) {
  const mode = modeOf(status);
  return mode === "owner" || mode === "account";
}

export function showDemoNote(status) {
  return modeOf(status) === "demo";
}

export function canSeeMessages(status) {
  const mode = modeOf(status);
  return mode === "owner" || mode === "open";
}

export function homePathFor(status) {
  return productFor(status) === "atlas" ? "/atlas" : "/field";
}

export function needsProfile(status) {
  const account = accountOf(status);
  if (!account) return false;
  return account.profileComplete === false || productFor(status) === null;
}

export function registerPathFor(status) {
  const product = productFor(status);
  return product ? `/register?product=${product}` : "/register";
}

export function demoRegisterPath(productId) {
  return PRODUCTS.includes(productId) ? `/register?product=${productId}` : "/register";
}

export function backToWebsitePath() {
  return "/";
}

export function identityOf(status) {
  const mode = modeOf(status);
  if (mode === null) return null;
  const uid = accountOf(status)?.uid;
  return `${mode}:${typeof uid === "string" ? uid : ""}`;
}

// note: the product's privacyNote from navigation.js, e.g. for Field
// { private, account, owner, demo }. The demo's words go inside the
// sidebar's demo box (kind "demo"); while the visitor is not known there is
// no note rather than a wrong one.
export function sidebarNoteFor(note, status) {
  if (!note) return null;
  const mode = modeOf(status);
  if (mode === "demo") return note.demo ? { kind: "demo", text: note.demo } : null;
  if (mode === "owner") return note.owner ? { kind: "owner", text: note.owner } : null;
  if (mode === "open") return note.private ? { kind: "private", text: note.private } : null;
  if (mode === "account") return note.account ? { kind: "account", text: note.account } : null;
  return null;
}

// "William Pan" -> { initials: "WP", label: "William Pan" }; one word
// "William" -> "WI"; no name -> the e-mail's first letter, else "?".
export function accountLabel(account) {
  const name = typeof account?.name === "string" ? account.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof account?.email === "string" ? account.email.trim() : "";
  if (name) {
    const words = name.split(" ");
    const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2);
    return { initials: initials.toUpperCase(), label: name };
  }
  if (email) return { initials: email[0].toUpperCase(), label: email };
  return { initials: "?", label: "Account" };
}

export function isDemoRefusal(error) {
  return isObject(error) && error.code === DEMO_READ_ONLY_CODE;
}
