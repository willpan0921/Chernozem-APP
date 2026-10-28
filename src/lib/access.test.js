// WHAT THIS FILE DOES
// Tests src/lib/access.js: the two kinds of visitor. The demo visitor (the
// access code) keeps both products and the note "Shared with everyone who
// has the access code"; a registered account gets one product, the note
// "Your fields are private to your account", its name in the sidebar, and
// is sent to finish its profile when that is not done. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes src/lib/access.js or the note in src/config/navigation.js.

import test from "node:test";
import assert from "node:assert/strict";
import {
  accountLabel,
  canSignOut,
  canSwitchProduct,
  homePathFor,
  isShared,
  needsProfile,
  privacyNoteFor,
  productFor,
  registerPathFor,
} from "./access.js";
import { products } from "../config/navigation.js";

const note = products.field.privacyNote;

// The server's answers (brief §9).
const DEMO = { required: true, signedIn: true, shared: true, account: null };
const LOCKED = { required: true, signedIn: false, shared: true, account: null };
const OPEN = { required: false, signedIn: true, shared: false, account: null };
const farmer = (extra = {}) => ({
  required: true,
  signedIn: true,
  shared: false,
  account: { uid: "u1", email: "ana@example.com", name: "Ana Kovalenko", product: "field", profileComplete: true, ...extra },
});
const office = () => ({ ...farmer(), account: { ...farmer().account, name: "Regional Office Kharkiv", product: "atlas" } });

test("the words of the Field note", () => {
  assert.equal(note.private, "Your fields are private");
  assert.equal(note.shared, "Shared with everyone who has the access code");
  assert.equal(note.account, "Your fields are private to your account");
  assert.equal(products.atlas.privacyNote, undefined, "the Atlas has no such note");
});

test("shared once an access code is set, private without one, never for an account", () => {
  assert.equal(isShared(LOCKED), true);
  assert.equal(isShared(OPEN), false);
  // A server from before "shared": a code means shared.
  assert.equal(isShared({ required: true, signedIn: true }), true);
  assert.equal(isShared({ required: false, signedIn: true }), false);
  // An account is its own workspace even when the server has a code set.
  assert.equal(isShared(farmer()), false);
  assert.equal(isShared({ ...farmer(), shared: true }), false, "an account is never the shared demo");
  // Not known (the server could not be reached).
  assert.equal(isShared(null), null);
  assert.equal(isShared(undefined), null);
  assert.equal(isShared({}), null);
});

test("the product: an account has one, the demo has both", () => {
  assert.equal(productFor(farmer()), "field");
  assert.equal(productFor(office()), "atlas");
  assert.equal(productFor(farmer({ product: null })), null, "no product chosen yet");
  assert.equal(productFor(farmer({ product: "both" })), null, "an unknown word counts as none");
  assert.equal(productFor(DEMO), null);
  assert.equal(productFor(OPEN), null);
  assert.equal(productFor(null), null);
  assert.equal(productFor({ account: "yes" }), null, "a bad account value");
  // What useAccess() gives works the same.
  assert.equal(productFor({ shared: false, account: farmer().account, profile: null }), "field");
});

test("the Field / Atlas switch shows only when both products are open", () => {
  assert.equal(canSwitchProduct(DEMO), true, "the demo visitor keeps both products");
  assert.equal(canSwitchProduct(OPEN), true);
  assert.equal(canSwitchProduct(null), true, "not known: as today");
  assert.equal(canSwitchProduct(farmer()), false);
  assert.equal(canSwitchProduct(office()), false);
  assert.equal(canSwitchProduct(farmer({ product: null })), true, "no product yet: nothing to lock");
});

test("where the app starts", () => {
  assert.equal(homePathFor(farmer()), "/field");
  assert.equal(homePathFor(office()), "/atlas");
  assert.equal(homePathFor(DEMO), "/field");
  assert.equal(homePathFor(null), "/field");
});

test("an unfinished profile goes back to the website's register page", () => {
  assert.equal(needsProfile(farmer()), false);
  assert.equal(needsProfile(farmer({ profileComplete: false })), true);
  assert.equal(needsProfile(farmer({ product: null, profileComplete: true })), true, "no product: the app cannot pick a home");
  assert.equal(needsProfile(DEMO), false, "the demo has no profile");
  assert.equal(needsProfile(null), false);
  assert.equal(registerPathFor(farmer({ profileComplete: false })), "/register?product=field");
  assert.equal(registerPathFor(office()), "/register?product=atlas");
  assert.equal(registerPathFor(farmer({ product: null })), "/register");
  assert.equal(registerPathFor(DEMO), "/register");
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

test("the note follows: never 'private' when the data is shared, the account's own words for an account", () => {
  assert.deepEqual(privacyNoteFor(note, true), { kind: "shared", text: "Shared with everyone who has the access code" });
  assert.deepEqual(privacyNoteFor(note, false), { kind: "private", text: "Your fields are private" });
  assert.equal(privacyNoteFor(note, null), null, "not known yet: no note rather than a wrong one");
  assert.equal(privacyNoteFor(undefined, true), null, "a product without a note");
  assert.deepEqual(privacyNoteFor(note, isShared({ required: true, signedIn: true })), { kind: "shared", text: note.shared });
  // An account: its own note, whatever "shared" says.
  assert.deepEqual(privacyNoteFor(note, false, farmer().account), { kind: "account", text: "Your fields are private to your account" });
  assert.deepEqual(privacyNoteFor(note, null, farmer().account), { kind: "account", text: note.account });
  // A note without account words falls back to the old two.
  assert.deepEqual(privacyNoteFor({ private: "p", shared: "s" }, false, farmer().account), { kind: "private", text: "p" });
});

test("Sign out shows with an access code or an account", () => {
  assert.equal(canSignOut(true), true);
  assert.equal(canSignOut(false), false, "no code: there is no sign-in to end");
  assert.equal(canSignOut(null), false, "not known yet");
  assert.equal(canSignOut(isShared(DEMO)), true);
  assert.equal(canSignOut(isShared(OPEN)), false);
  assert.equal(canSignOut(false, farmer().account), true, "an account can always sign out");
  assert.equal(canSignOut(null, farmer().account), true);
  assert.equal(canSignOut(false, null), false);
});
