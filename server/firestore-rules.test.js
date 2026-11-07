// WHAT THIS FILE DOES
// Tests for firestore.rules (at the top of the project): the Firestore
// database stays closed to every browser and phone, so nobody re-opens it
// by accident. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes firestore.rules on purpose (see the note in that file).

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const rules = await readFile(new URL("firestore.rules", root), "utf8");
const firebaseJson = JSON.parse(await readFile(new URL("firebase.json", root), "utf8"));
// The rules without their comments, so a word in a comment cannot pass or fail a test.
const code = rules.replace(/\/\/.*$/gm, "");

test("firebase.json deploys firestore.rules as the Firestore rules", () => {
  assert.equal(firebaseJson.firestore?.rules, "firestore.rules");
});

test("Firestore refuses every request from a browser, signed in or not", () => {
  assert.match(code, /rules_version\s*=\s*'2'/);
  assert.match(code, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  const allows = code.match(/\ballow\b[^;]*;/g) || [];
  assert.deepEqual(allows, ["allow read, write: if false;"]);
});

test("no test-mode rule, open rule or any-account rule is left", () => {
  assert.doesNotMatch(code, /request\.time/);
  assert.doesNotMatch(code, /if\s+true/);
  assert.doesNotMatch(code, /request\.auth\s*!=\s*null/);
});
