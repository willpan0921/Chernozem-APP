// WHAT THIS FILE DOES
// Tests src/lib/access.js: the four kinds of visitor the server names
// ("mode"). The demo (anyone without an account) is read-only, keeps both
// products, never signs out and gets the "Demo · Ukraine, read-only" box
// with Register; the owner (the owner's key) and one's own computer ("open")
// change the demo's data and see the website's messages; a registered
// account gets one product, its name in the sidebar and "Sign out", and is
// sent to finish its profile when that is not done. An older server without
// "mode" is still understood, and a server that cannot be reached leaves
// the app read-only. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes src/lib/access.js or the words in src/config/navigation.js.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_READ_ONLY_CODE,
  accountLabel,
  accountOf,
  backToWebsitePath,
  canSeeMessages,
  canSignOut,
  canSwitchProduct,
  demoRegisterPath,
  homePathFor,
  identityOf,
  isDemoRefusal,
  isReadOnly,
  isShared,
  modeOf,
  needsProfile,
  productFor,
  registerPathFor,
  restrictsProduct,
  showDemoNote,
  sidebarNoteFor,
} from "./access.js";
import { DEMO_READ_ONLY_TEXT, demoWords, products } from "../config/navigation.js";

const fieldNote = products.field.privacyNote;
const atlasNote = products.atlas.privacyNote;

// The server's answers (brief: "Server sessions").
const DEMO = { required: true, signedIn: false, shared: true, account: null, mode: "demo", readOnly: true };
const OWNER = { required: true, signedIn: true, shared: true, account: null, mode: "owner", readOnly: false };
const OPEN = { required: false, signedIn: true, shared: true, account: null, mode: "open", readOnly: false };
const farmer = (extra = {}) => ({
  required: true,
  signedIn: true,
  shared: false,
  mode: "account",
  readOnly: false,
  account: { uid: "u1", email: "ana@example.com", name: "Ana Kovalenko", product: "field", profileComplete: true, ...extra },
});
const office = () => ({ ...farmer(), account: { ...farmer().account, uid: "u2", name: "Regional Office Kharkiv", product: "atlas" } });

// An older server, from before "mode" and "readOnly".
const OLD_CODE = { required: true, signedIn: true, shared: true, account: null };
const OLD_LOCKED = { required: true, signedIn: false, shared: true, account: null };
const OLD_OPEN = { required: false, signedIn: true, shared: false, account: null };
const oldFarmer = () => {
  const { mode, readOnly, ...rest } = farmer();
  return rest;
};

// What useAccess() gives (src/components/atlas/AccessGate.jsx).
const fromGate = (status) => ({ mode: modeOf(status), readOnly: isReadOnly(status), shared: isShared(status), account: accountOf(status), profile: null, ownHome: null });

test("the words: the sidebar's notes, the demo box and the dialog", () => {
  assert.deepEqual(fieldNote, {
    demo: "Everyone sees this farm",
    owner: "You are editing the demo",
    private: "Your fields are private",
    account: "Your fields are private to your account",
  });
  assert.deepEqual(atlasNote, { demo: "Everyone sees this area", owner: "You are editing the demo" });
  assert.equal(demoWords.note, "Demo · Ukraine, read-only");
  assert.equal(demoWords.back, "Back to the website");
  assert.equal(demoWords.register, "Register");
  assert.equal(demoWords.ownWorkspace, "Open your own workspace");
  assert.equal(demoWords.notNow, "Not now");
  assert.equal(DEMO_READ_ONLY_TEXT, "This is the demo, so it can't be changed. Register to do this on your own land.");
  const { before, link, after } = demoWords.settings;
  assert.equal(before + link + after, "This is the demo. Register to set up your own.");
  // Nothing of the old access code is left in what the app says.
  const said = JSON.stringify({ fieldNote, atlasNote, demoWords });
  assert.doesNotMatch(said, /access code|code/i);
});

test("the four kinds of visitor, as the server names them", () => {
  assert.equal(modeOf(DEMO), "demo");
  assert.equal(modeOf(OWNER), "owner");
  assert.equal(modeOf(OPEN), "open");
  assert.equal(modeOf(farmer()), "account");
  assert.equal(modeOf(office()), "account");
  // The server's word wins over everything else in the answer.
  assert.equal(modeOf({ ...DEMO, account: { uid: "u1", product: "field" } }), "demo", "an account holder looking at the demo");
});

test("an older server without 'mode' is read the old way", () => {
  assert.equal(modeOf(OLD_CODE), "owner", "the code's cookie: the code is the owner's key now");
  assert.equal(modeOf(OLD_LOCKED), "demo", "a code is set and this browser has none: the public demo");
  assert.equal(modeOf(OLD_OPEN), "open", "no code set: one's own computer");
  assert.equal(modeOf(oldFarmer()), "account");
  assert.equal(modeOf({ mode: "visitor", required: true, signedIn: false }), "demo", "a word the app does not know: the old rules");
});

test("not known: null, read-only, and no shared or private claim", () => {
  for (const unknown of [null, undefined, {}, "demo", 42, { mode: "visitor" }]) {
    assert.equal(modeOf(unknown), null, `modeOf(${JSON.stringify(unknown)})`);
    assert.equal(isReadOnly(unknown), true, "nothing is changed until the server has said who this is");
    assert.equal(isShared(unknown), null);
    assert.equal(identityOf(unknown), null);
  }
});

test("only the demo is read-only", () => {
  assert.equal(isReadOnly(DEMO), true);
  assert.equal(isReadOnly(OWNER), false);
  assert.equal(isReadOnly(OPEN), false);
  assert.equal(isReadOnly(farmer()), false);
  // The server's readOnly is trusted as it is.
  assert.equal(isReadOnly({ ...OWNER, readOnly: true }), true);
  // An older server: from the mode.
  assert.equal(isReadOnly(OLD_LOCKED), true);
  assert.equal(isReadOnly(OLD_CODE), false);
  assert.equal(isReadOnly(OLD_OPEN), false);
  assert.equal(isReadOnly(oldFarmer()), false);
  // What useAccess() gives works the same.
  assert.equal(isReadOnly(fromGate(DEMO)), true);
  assert.equal(isReadOnly(fromGate(OWNER)), false);
});

test("the shared demo data: demo, owner and open; never an account", () => {
  assert.equal(isShared(DEMO), true);
  assert.equal(isShared(OWNER), true);
  assert.equal(isShared(OPEN), true);
  assert.equal(isShared(farmer()), false);
  assert.equal(isShared(oldFarmer()), false);
});

test("the account: only when the visitor is that account", () => {
  assert.equal(accountOf(farmer()).uid, "u1");
  assert.equal(accountOf(DEMO), null);
  assert.equal(accountOf({ ...DEMO, account: { uid: "u1", product: "field" } }), null, "the demo never has one");
  assert.equal(accountOf(OWNER), null);
  assert.equal(accountOf({ ...farmer(), account: "yes" }), null, "a bad account value");
  assert.equal(accountOf(fromGate(farmer())).uid, "u1");
});

test("the product: an account has one, the demo and the owner have both", () => {
  assert.equal(productFor(farmer()), "field");
  assert.equal(productFor(office()), "atlas");
  assert.equal(productFor(farmer({ product: null })), null, "no product chosen yet");
  assert.equal(productFor(farmer({ product: "both" })), null, "an unknown word counts as none");
  for (const status of [DEMO, OWNER, OPEN, null]) assert.equal(productFor(status), null);
  assert.equal(productFor({ ...DEMO, account: { uid: "u1", product: "atlas" } }), null, "the demo is never kept on one product");
  assert.equal(productFor(fromGate(office())), "atlas");
});

test("ProductGuard keeps an account on its product, and never the demo", () => {
  assert.equal(restrictsProduct(farmer()), true);
  assert.equal(restrictsProduct(office()), true);
  assert.equal(restrictsProduct(farmer({ product: null })), false);
  for (const status of [DEMO, OWNER, OPEN, null, fromGate(DEMO)]) assert.equal(restrictsProduct(status), false);
});

test("the Field / Atlas switch: demo, owner and open; not an account", () => {
  assert.equal(canSwitchProduct(DEMO), true, "the demo keeps both products");
  assert.equal(canSwitchProduct(OWNER), true);
  assert.equal(canSwitchProduct(OPEN), true);
  assert.equal(canSwitchProduct(null), true, "not known: as before");
  assert.equal(canSwitchProduct(farmer()), false);
  assert.equal(canSwitchProduct(office()), false);
  assert.equal(canSwitchProduct(farmer({ product: null })), true, "no product yet: nothing to lock");
});

test("Sign out: the owner and accounts, never the demo", () => {
  assert.equal(canSignOut(OWNER), true);
  assert.equal(canSignOut(farmer()), true);
  assert.equal(canSignOut(office()), true);
  assert.equal(canSignOut(DEMO), false, "the demo has no sign-in to end");
  assert.equal(canSignOut(OPEN), false, "one's own computer: no sign-in to end");
  assert.equal(canSignOut(null), false, "not known yet");
  assert.equal(canSignOut(OLD_CODE), true, "an older server's code cookie is the owner's");
  assert.equal(canSignOut(OLD_LOCKED), false);
  assert.equal(canSignOut(fromGate(farmer())), true);
});

test("the demo box and the website's messages", () => {
  assert.equal(showDemoNote(DEMO), true);
  for (const status of [OWNER, OPEN, farmer(), null]) assert.equal(showDemoNote(status), false);
  assert.equal(canSeeMessages(OWNER), true);
  assert.equal(canSeeMessages(OPEN), true);
  for (const status of [DEMO, farmer(), office(), null]) assert.equal(canSeeMessages(status), false, "the messages are the owner's");
});

test("where the app starts, and an unfinished profile", () => {
  assert.equal(homePathFor(farmer()), "/field");
  assert.equal(homePathFor(office()), "/atlas");
  assert.equal(homePathFor(DEMO), "/field");
  assert.equal(homePathFor(null), "/field");
  assert.equal(needsProfile(farmer()), false);
  assert.equal(needsProfile(farmer({ profileComplete: false })), true);
  assert.equal(needsProfile(farmer({ product: null, profileComplete: true })), true, "no product: the app cannot pick a home");
  assert.equal(needsProfile(DEMO), false, "the demo has no profile");
  assert.equal(needsProfile({ ...DEMO, account: { uid: "u1", profileComplete: false } }), false, "an account holder looking at the demo is not sent away");
  assert.equal(needsProfile(OWNER), false);
  assert.equal(needsProfile(null), false);
  assert.equal(registerPathFor(farmer({ profileComplete: false })), "/register?product=field");
  assert.equal(registerPathFor(office()), "/register?product=atlas");
  assert.equal(registerPathFor(farmer({ product: null })), "/register");
  assert.equal(registerPathFor(DEMO), "/register");
});

test("the demo's Register keeps the product, and the way back to the website", () => {
  assert.equal(demoRegisterPath("field"), "/register?product=field");
  assert.equal(demoRegisterPath("atlas"), "/register?product=atlas");
  assert.equal(demoRegisterPath("both"), "/register");
  assert.equal(demoRegisterPath(undefined), "/register");
  assert.equal(backToWebsitePath(), "/");
});

test("who the visitor is, for starting the app again when it changes", () => {
  assert.equal(identityOf(DEMO), "demo:");
  assert.equal(identityOf(OWNER), "owner:");
  assert.equal(identityOf(OPEN), "open:");
  assert.equal(identityOf(farmer()), "account:u1");
  assert.equal(identityOf(office()), "account:u2", "another account is another visitor");
  assert.equal(identityOf({ ...DEMO, account: { uid: "u1" } }), "demo:", "an account holder in the demo is the demo");
  assert.notEqual(identityOf(farmer()), identityOf(DEMO), "signing out changes who it is");
  assert.equal(identityOf(fromGate(farmer())), "account:u1");
});

test("the sidebar's note follows the visitor, and is never wrong", () => {
  assert.deepEqual(sidebarNoteFor(fieldNote, DEMO), { kind: "demo", text: "Everyone sees this farm" });
  assert.deepEqual(sidebarNoteFor(atlasNote, DEMO), { kind: "demo", text: "Everyone sees this area" });
  assert.deepEqual(sidebarNoteFor(fieldNote, OWNER), { kind: "owner", text: "You are editing the demo" });
  assert.deepEqual(sidebarNoteFor(atlasNote, OWNER), { kind: "owner", text: "You are editing the demo" });
  assert.deepEqual(sidebarNoteFor(fieldNote, OPEN), { kind: "private", text: "Your fields are private" });
  assert.equal(sidebarNoteFor(atlasNote, OPEN), null, "the Atlas says nothing on one's own computer");
  assert.deepEqual(sidebarNoteFor(fieldNote, farmer()), { kind: "account", text: "Your fields are private to your account" });
  assert.equal(sidebarNoteFor(atlasNote, office()), null);
  assert.equal(sidebarNoteFor(fieldNote, null), null, "not known yet: no note rather than a wrong one");
  assert.equal(sidebarNoteFor(undefined, DEMO), null, "a product without notes");
  // Never "private" for the shared demo, never the demo's words for an account.
  assert.notEqual(sidebarNoteFor(fieldNote, DEMO).kind, "private");
  assert.notEqual(sidebarNoteFor(fieldNote, farmer()).kind, "demo");
  assert.deepEqual(sidebarNoteFor(fieldNote, fromGate(OWNER)), { kind: "owner", text: fieldNote.owner });
});

test("the account row: initials from the name", () => {
  assert.deepEqual(accountLabel({ name: "Ana Kovalenko", email: "ana@example.com" }), { initials: "AK", label: "Ana Kovalenko" });
  assert.deepEqual(accountLabel({ name: "  William   Pan " }), { initials: "WP", label: "William Pan" }, "spaces tidied");
  assert.deepEqual(accountLabel({ name: "Jean Claude Van Damme" }), { initials: "JD", label: "Jean Claude Van Damme" }, "first and last word");
  assert.deepEqual(accountLabel({ name: "william" }), { initials: "WI", label: "william" }, "one word: its first two letters");
  assert.deepEqual(accountLabel({ name: "", email: "ana@example.com" }), { initials: "A", label: "ana@example.com" }, "no name: the e-mail");
  assert.deepEqual(accountLabel({}), { initials: "?", label: "Account" });
  assert.deepEqual(accountLabel(null), { initials: "?", label: "Account" });
});

test("the demo's refusal is told apart from every other error", () => {
  assert.equal(DEMO_READ_ONLY_CODE, "demo_read_only");
  assert.equal(isDemoRefusal({ code: "demo_read_only", message: DEMO_READ_ONLY_TEXT, status: 403 }), true);
  assert.equal(isDemoRefusal(Object.assign(new Error("x"), { code: "demo_read_only" })), true, "an ApiError");
  for (const other of [{ code: "owner_only" }, { code: "quota" }, { code: "auth_required" }, new Error("demo_read_only"), null, undefined, "demo_read_only"]) {
    assert.equal(isDemoRefusal(other), false);
  }
});
