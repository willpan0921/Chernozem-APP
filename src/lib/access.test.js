// WHAT THIS FILE DOES
// Tests src/lib/access.js: the Field sidebar says "Your fields are
// private" on one's own computer, "Shared with everyone who has the access
// code" when the owner set one, and nothing while that is not known; and
// "Sign out" shows only with a code. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes src/lib/access.js or the note in src/config/navigation.js.

import test from "node:test";
import assert from "node:assert/strict";
import { canSignOut, isShared, privacyNoteFor } from "./access.js";
import { products } from "../config/navigation.js";

const note = products.field.privacyNote;

test("the words of the Field note", () => {
  assert.equal(note.private, "Your fields are private");
  assert.equal(note.shared, "Shared with everyone who has the access code");
  assert.equal(products.atlas.privacyNote, undefined, "the Atlas has no such note");
});

test("shared once an access code is set, private without one", () => {
  assert.equal(isShared({ required: true, signedIn: false, shared: true }), true);
  assert.equal(isShared({ required: false, signedIn: true, shared: false }), false);
  // A server from before "shared": a code means shared.
  assert.equal(isShared({ required: true, signedIn: true }), true);
  assert.equal(isShared({ required: false, signedIn: true }), false);
  // Not known (the server could not be reached).
  assert.equal(isShared(null), null);
  assert.equal(isShared(undefined), null);
  assert.equal(isShared({}), null);
});

test("the note follows: never 'private' when the data is shared", () => {
  assert.deepEqual(privacyNoteFor(note, true), { kind: "shared", text: "Shared with everyone who has the access code" });
  assert.deepEqual(privacyNoteFor(note, false), { kind: "private", text: "Your fields are private" });
  assert.equal(privacyNoteFor(note, null), null, "not known yet: no note rather than a wrong one");
  assert.equal(privacyNoteFor(undefined, true), null, "a product without a note");
  assert.deepEqual(privacyNoteFor(note, isShared({ required: true, signedIn: true })), { kind: "shared", text: note.shared });
});

test("Sign out shows only when an access code is set", () => {
  assert.equal(canSignOut(true), true);
  assert.equal(canSignOut(false), false, "no code: there is no sign-in to end");
  assert.equal(canSignOut(null), false, "not known yet");
  assert.equal(canSignOut(isShared({ required: true, signedIn: true, shared: true })), true);
  assert.equal(canSignOut(isShared({ required: false, signedIn: true, shared: false })), false);
});
