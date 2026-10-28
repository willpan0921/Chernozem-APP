// WHAT THIS FILE DOES
// What the app knows about the visitor, worked out from the server's answer
// to /api/auth/status (read once by src/components/atlas/AccessGate.jsx):
//
//   { required, signedIn, shared, account }
//   account: null for the demo (the access code) or a visitor who is not
//   signed in; for a registered person { uid, email, name, product:
//   "field" | "atlas" | null, profileComplete }.
//
// Two kinds of visitor come out of it:
//   The demo visitor   has the access code: both products, the shared
//                      Ukraine data, "Shared with everyone who has the code".
//   An account         registered on the website: one product (Field or
//                      Atlas), their own private workspace, their name in
//                      the sidebar.
//
//   isShared(status)              true when an access code is set and the
//                                 visitor is the demo: everyone with the
//                                 code sees and changes the same data; false
//                                 for an account or on one's own computer;
//                                 null when not known
//   productFor(status)            "field" | "atlas" when the visitor is an
//                                 account with that product; null when both
//                                 products are open (the demo) or not known
//   canSwitchProduct(status)      true when the sidebar shows the Field /
//                                 Atlas switch (no account, or an account
//                                 without a product yet)
//   homePathFor(status)           where the visitor's app starts: "/atlas"
//                                 for an Atlas account, else "/field"
//   needsProfile(status)          true when an account must finish its
//                                 profile on the website first (no product
//                                 yet, or the server says profileComplete
//                                 false)
//   registerPathFor(status)       the website page that finishes the
//                                 profile, with the product already chosen
//                                 when there is one
//   accountLabel(account)         what the sidebar's account row shows:
//                                 { initials, label } from the person's name
//                                 (or e-mail)
//   privacyNoteFor(note, shared, account)
//                                 the Field sidebar's note: { kind, text }
//                                 or null (not known yet: no note, rather
//                                 than a wrong one)
//   canSignOut(shared, account)   true when the sidebar shows "Sign out":
//                                 with an access code or an account
//                                 (without either there is no sign-in to end)
//
// Every function also accepts what useAccess() gives ({ shared, account,
// profile }), since that carries the same "account".
//
// The words themselves are in src/config/navigation.js (privacyNote).
//
// WHO EDITS IT
// Nobody, normally.

const PRODUCTS = ["field", "atlas"];

function accountOf(status) {
  if (!status || typeof status !== "object") return null;
  const account = status.account;
  return account && typeof account === "object" ? account : null;
}

export function isShared(status) {
  if (!status || typeof status !== "object") return null;
  // A registered account is never the shared demo, whatever else is said.
  if (accountOf(status)) return false;
  if (typeof status.shared === "boolean") return status.shared;
  // An older server says only "required" (a code is set).
  if (typeof status.required === "boolean") return status.required;
  return null;
}

export function productFor(status) {
  const account = accountOf(status);
  if (!account) return null;
  return PRODUCTS.includes(account.product) ? account.product : null;
}

export function canSwitchProduct(status) {
  return productFor(status) === null;
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

// note: { private: "...", shared: "...", account: "..." } from navigation.js.
export function privacyNoteFor(note, shared, account = null) {
  if (!note) return null;
  if (account && note.account) return { kind: "account", text: note.account };
  if (shared === true && note.shared) return { kind: "shared", text: note.shared };
  if (shared === false && note.private) return { kind: "private", text: note.private };
  return null;
}

export function canSignOut(shared, account = null) {
  return shared === true || Boolean(account);
}
