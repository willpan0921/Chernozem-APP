// WHAT THIS FILE DOES
// Tests src/lib/registration.js: the rules behind the website's Register
// and Sign in pages. Registering is one step: the choice at the top gives
// Field or Atlas; an Atlas account names its organisation and chooses its
// kind (Government, NGO, Corporation, Research or Other, the same as the
// server's roles; nothing chosen for it); Google gives the name, the e-mail way asks
// it; the page never asks for a place (the product's own setup does); every
// answer has a limit and a plain-words message; the owner is told apart;
// Firebase's error codes become sentences a person can act on; the pictures
// beside the form are the light copies and never print what the website no
// longer says.
// Run with "npm test" or "node --test src/lib/registration.test.js".
//
// WHO EDITS IT
// Whoever changes src/lib/registration.js.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import * as registration from "./registration.js";
import {
  FIELD_ORDER,
  LIMITS,
  ORG_KINDS,
  PICTURES,
  PRODUCTS,
  SIGN_IN_ENDED,
  destinationFor,
  emailProblem,
  firebaseProblem,
  firstProblem,
  isNotOpen,
  isOwner,
  nextStep,
  passwordProblem,
  productForRole,
  productFromParam,
  profileForServer,
  roleForSave,
  signInEnded,
  validateProfile,
} from "./registration.js";

const farmer = { product: "field", name: "Olena Kovalenko" };
const ngo = { product: "atlas", kind: "ngo", name: "Sam Okafor", organization: "FAO" };

test("the two products, in the owner's words", () => {
  assert.deepEqual(Object.keys(PRODUCTS), ["field", "atlas"]);
  assert.equal(`${PRODUCTS.field.name} — ${PRODUCTS.field.tagline}`, "Field — for my farm");
  assert.equal(`${PRODUCTS.atlas.name} — ${PRODUCTS.atlas.tagline}`, "Atlas — for a region");
  assert.equal(PRODUCTS.field.path, "/field");
  assert.equal(PRODUCTS.atlas.path, "/atlas");
});

test("?product= in the address chooses in advance; Field otherwise", () => {
  assert.equal(productFromParam("atlas"), "atlas");
  assert.equal(productFromParam(" Atlas "), "atlas");
  assert.equal(productFromParam("field"), "field");
  assert.equal(productFromParam(null), "field");
  assert.equal(productFromParam(""), "field");
  assert.equal(productFromParam("both"), "field");
});

test("one step: no steps to show, and no place question (the product's setup asks where)", () => {
  assert.equal(registration.STEPS, undefined, "no 'Account · About you' steps any more");
  for (const item of Object.values(PRODUCTS)) {
    assert.equal(item.placeLabel, undefined, `${item.name} asks no place here`);
  }
  for (const gone of ["parsePlace", "placeFromResult", "countryFromLabel"]) {
    assert.equal(registration[gone], undefined, `${gone} went with the place question`);
  }
  assert.equal(LIMITS.place, undefined);
  assert.equal(LIMITS.country, undefined);
});

test("the server's seven roles each belong to one product; no kind is chosen in advance", () => {
  // The same seven as server/accounts.js ROLES.
  for (const role of ["farmer", "landowner"]) assert.equal(productForRole(role), "field", role);
  for (const role of ["government", "ngo", "corporation", "research", "other"]) assert.equal(productForRole(role), "atlas", role);
  assert.equal(productForRole("investor"), null);
  assert.equal(productForRole("company"), null, "a corporation is saved as corporation, nothing else");
  assert.equal(productForRole(undefined), null);
  assert.deepEqual(
    ORG_KINDS.map((kind) => kind.label),
    ["Government", "NGO", "Corporation", "Research", "Other"]
  );
  assert.equal(registration.DEFAULT_ORG_KIND, undefined, "nothing preselected");
});

test("the kinds of organisation are exactly the server's Atlas roles (server/accounts.js ROLES)", () => {
  // Read from the server file's source, so this test needs no server code.
  const source = readFileSync(new URL("../../server/accounts.js", import.meta.url), "utf8");
  const line = source.match(/export const ROLES = \[([^\]]*)\];/);
  assert.ok(line, "server/accounts.js lists its ROLES on one line");
  const serverRoles = [...line[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(serverRoles, ["farmer", "landowner", "government", "ngo", "corporation", "research", "other"]);
  // Every kind the page offers is one the server accepts, and every role
  // the server keeps is either Field's or one of the page's kinds.
  for (const kind of ORG_KINDS) assert.ok(serverRoles.includes(kind.role), `the server accepts "${kind.role}"`);
  for (const role of serverRoles) assert.ok(productForRole(role), `"${role}" belongs to Field or Atlas`);
  assert.equal(new Set(ORG_KINDS.map((kind) => kind.role)).size, ORG_KINDS.length, "no kind twice");
});

test("the role saved: Field is a farmer, Atlas is the kind chosen", () => {
  assert.equal(roleForSave("field"), "farmer");
  assert.equal(roleForSave("field", "ngo"), "farmer", "an Atlas kind left over does not reach Field");
  assert.equal(roleForSave("field", "landowner"), "landowner", "an older profile's landowner stays one");
  assert.equal(roleForSave("atlas", "government"), "government");
  assert.equal(roleForSave("atlas", "research"), "research");
  assert.equal(roleForSave("atlas", "corporation"), "corporation");
  assert.equal(roleForSave("field", "corporation"), "farmer", "a corporation left over from Atlas does not reach Field");
  assert.equal(roleForSave("atlas"), "", "no kind chosen: nothing is made up");
  assert.equal(roleForSave("atlas", "farmer"), "");
  assert.equal(roleForSave(undefined, "ngo"), "");
});

test("the limits match the server's (server/accounts.js PROFILE_LIMITS)", () => {
  assert.equal(LIMITS.name, 80);
  assert.equal(LIMITS.organization, 120);
  assert.deepEqual(LIMITS.password, { min: 8, max: 200 });
  assert.equal(LIMITS.age, undefined, "the page does not ask the age");
  assert.equal(LIMITS.address, undefined, "the page does not ask the address");
});

test("e-mail: missing, malformed, too long, fine", () => {
  assert.equal(emailProblem(""), "Enter your e-mail address.");
  assert.equal(emailProblem("   "), "Enter your e-mail address.");
  assert.equal(emailProblem("olena"), "That e-mail address does not look right.");
  assert.equal(emailProblem("olena@site"), "That e-mail address does not look right.");
  assert.equal(emailProblem("ol ena@site.org"), "That e-mail address does not look right.");
  assert.equal(emailProblem(`${"a".repeat(LIMITS.email)}@site.org`), `Keep the e-mail to ${LIMITS.email} characters or fewer.`);
  assert.equal(emailProblem(" olena@site.org "), "");
});

test("password: one field, 8 characters or more", () => {
  assert.equal(passwordProblem(""), "Enter a password.");
  assert.equal(passwordProblem(undefined), "Enter a password.");
  assert.equal(passwordProblem("short"), "Use 8 characters or more.");
  assert.equal(passwordProblem("1234567"), "Use 8 characters or more.");
  assert.equal(passwordProblem("12345678"), "");
  assert.equal(passwordProblem("x".repeat(LIMITS.password.max)), "");
  assert.equal(passwordProblem("x".repeat(LIMITS.password.max + 1)), `Keep the password to ${LIMITS.password.max} characters or fewer.`);
});

test("Field: the e-mail way needs a name; with Google the name comes from Google", () => {
  assert.deepEqual(validateProfile(farmer), { ok: true, problems: {} });
  assert.equal(validateProfile({ ...farmer, organization: "" }).ok, true, "a farmer need not name an organisation");
  assert.equal(validateProfile({ product: "field", name: "   " }).problems.name, "Enter your name.");
  assert.deepEqual(validateProfile({ product: "field", name: "" }, { nameFromGoogle: true }), { ok: true, problems: {} }, "Google gives the name");
  assert.equal(validateProfile({ product: "field", name: "x".repeat(81) }, { nameFromGoogle: true }).problems.name, "Keep your name to 80 characters or fewer.", "a typed name is still checked");
  const empty = validateProfile({});
  assert.equal(empty.ok, false);
  assert.equal(empty.problems.product, "Choose Field or Atlas.");
  assert.equal(empty.problems.name, "Enter your name.");
});

test("Atlas: the organisation and its kind are both needed, whichever way, and nothing is chosen for the person", () => {
  assert.deepEqual(validateProfile(ngo), { ok: true, problems: {} });
  assert.deepEqual(validateProfile({ ...ngo, kind: "corporation", organization: "Black Soil Foods" }), { ok: true, problems: {} }, "a corporation registers for Atlas");
  const noKind = validateProfile({ ...ngo, kind: undefined });
  assert.equal(noKind.ok, false, "no kind chosen yet: the person must choose");
  assert.equal(noKind.problems.kind, "Choose what kind of organisation.");
  assert.equal(validateProfile({ ...ngo, kind: "" }).problems.kind, "Choose what kind of organisation.");
  assert.equal(validateProfile({ ...ngo, kind: "farmer" }).problems.kind, "Choose what kind of organisation.");
  const missing = validateProfile({ ...ngo, organization: " " });
  assert.equal(missing.ok, false);
  assert.equal(missing.problems.organization, "Name your organisation.");
  // With Google: the name may wait for Google, the organisation and kind may not.
  const google = validateProfile({ product: "atlas", name: "", organization: "", kind: "" }, { nameFromGoogle: true });
  assert.deepEqual(Object.keys(google.problems).sort(), ["kind", "organization"]);
  assert.equal(validateProfile({ ...ngo, name: "" }, { nameFromGoogle: true }).ok, true);
});

test("every limit has its message", () => {
  assert.equal(validateProfile({ ...farmer, name: "x".repeat(81) }).problems.name, "Keep your name to 80 characters or fewer.");
  assert.equal(validateProfile({ ...ngo, organization: "x".repeat(121) }).problems.organization, "Keep the organisation to 120 characters or fewer.");
  assert.equal(validateProfile({ ...farmer, name: "x".repeat(80) }).ok, true);
  assert.equal(validateProfile({ ...ngo, organization: "x".repeat(120) }).ok, true);
});

test("the keyboard goes to the first answer to fix, in the page's order", () => {
  assert.deepEqual(FIELD_ORDER, ["product", "organization", "kind", "name", "email", "password"]);
  assert.equal(firstProblem({ password: "x", email: "y" }), "email");
  assert.equal(firstProblem({ name: "x", kind: "y" }), "kind", "Atlas's answers come before the e-mail way's");
  assert.equal(firstProblem({ name: "x", organization: "y", kind: "z" }), "organization");
  assert.equal(firstProblem({}), "");
  assert.equal(firstProblem(), "");
});

test("what goes to PUT /api/account: trimmed, the organisation only for Atlas, nothing else", () => {
  assert.deepEqual(profileForServer({ product: "field", name: "  Olena ", organization: "Left from Atlas" }), {
    name: "Olena",
    product: "field",
    role: "farmer",
  });
  assert.deepEqual(profileForServer({ product: "atlas", kind: "ngo", name: "Sam", organization: " FAO " }), {
    name: "Sam",
    product: "atlas",
    role: "ngo",
    organization: "FAO",
  });
  assert.deepEqual(profileForServer({ product: "atlas", kind: "government", name: "Iryna", organization: "  " }), { name: "Iryna", product: "atlas", role: "government" });
  assert.deepEqual(profileForServer({ product: "atlas", kind: "corporation", name: "Mira", organization: " Black Soil Foods " }), {
    name: "Mira",
    product: "atlas",
    role: "corporation",
    organization: "Black Soil Foods",
  });
  // Never the questions the page does not ask.
  const body = profileForServer({ ...farmer, age: "34", address: "Main street", place: { lat: 49.71, lng: 37.62, label: "Kupiansk" }, country: "Ukraine" });
  assert.deepEqual(Object.keys(body).sort(), ["name", "product", "role"]);
});

test("the owner is told apart: mode owner, or an account the server marks as the owner's", () => {
  assert.equal(isOwner({ mode: "owner", signedIn: true, account: { uid: "o", email: "chernozem.app@gmail.com", owner: true } }), true);
  assert.equal(isOwner({ mode: "owner", signedIn: true, account: null }), true);
  assert.equal(isOwner({ mode: "account", account: { uid: "o", owner: true } }), true);
  assert.equal(isOwner({ mode: "account", account: { uid: "a", profileComplete: true } }), false);
  assert.equal(isOwner({ mode: "open", account: null }), false, "one's own computer without a code is not the owner's sign-in");
  assert.equal(isOwner({ mode: "demo", readOnly: true, account: null }), false);
  assert.equal(isOwner(null), false);
});

test("which part of the Register page comes next", () => {
  assert.equal(nextStep(null), "form");
  assert.equal(nextStep({ signedIn: false, account: null }), "form");
  assert.equal(nextStep({ mode: "demo", readOnly: true, signedIn: false, account: null }), "form", "the public demo is not an account");
  assert.equal(nextStep({ mode: "open", signedIn: true, account: null }), "form", "registering works on one's own computer too");
  assert.equal(nextStep({ mode: "owner", signedIn: true, account: { uid: "o", owner: true, profileComplete: false } }), "owner");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: false } }), "finish");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: true } }), "signed");
});

test("after signing in: the product, or the Register page to finish", () => {
  assert.equal(destinationFor({ product: "field", profileComplete: true }), "/field");
  assert.equal(destinationFor({ product: "atlas", profileComplete: true }), "/atlas");
  assert.equal(destinationFor({ product: null, profileComplete: false }), "/register");
  assert.equal(destinationFor({ product: "atlas", profileComplete: false }), "/register?product=atlas");
  assert.equal(destinationFor({ product: "both", profileComplete: true }), "/register");
  assert.equal(destinationFor(null), "/register");
});

test("Firebase's codes become plain words beside the right field", () => {
  assert.deepEqual(firebaseProblem({ code: "auth/email-already-in-use" }), { field: "email", message: "That e-mail already has an account.", signIn: true });
  assert.deepEqual(firebaseProblem({ code: "auth/account-exists-with-different-credential" }), { field: "email", message: "That e-mail already has an account.", signIn: true });
  assert.deepEqual(firebaseProblem({ code: "auth/weak-password" }), { field: "password", message: "Use 8 characters or more." });
  assert.deepEqual(firebaseProblem({ code: "auth/invalid-email" }), { field: "email", message: "That e-mail address does not look right." });
  for (const code of ["auth/wrong-password", "auth/user-not-found", "auth/invalid-credential", "auth/invalid-login-credentials"]) {
    assert.deepEqual(firebaseProblem({ code }), { field: "password", message: "That e-mail and password do not match." }, code);
  }
  assert.equal(firebaseProblem({ code: "auth/popup-closed-by-user" }).message, "The Google window was closed before you signed in. Try again.");
  assert.equal(firebaseProblem({ code: "auth/network-request-failed" }).field, "form");
  assert.equal(firebaseProblem({ code: "auth/too-many-requests" }).message, "Too many attempts. Wait a few minutes and try again.");
  assert.equal(firebaseProblem({ code: "auth/unauthorized-domain" }).message, "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead.");
  assert.deepEqual(firebaseProblem({ code: "auth/user-token-expired" }), { field: "form", message: SIGN_IN_ENDED });
  assert.deepEqual(firebaseProblem({ code: "auth/something-new" }), { field: "form", message: "Something went wrong (something-new). Try again." });
  assert.deepEqual(firebaseProblem(new Error("boom")), { field: "form", message: "Something went wrong. Try again." });
});

test("registration not open: Firebase's codes and our server's 503", () => {
  for (const code of ["auth/configuration-not-found", "auth/operation-not-allowed", "auth/admin-restricted-operation"]) {
    assert.equal(isNotOpen({ code }), true, code);
    assert.deepEqual(firebaseProblem({ code }), { field: "closed", message: "Registration is not open yet." });
  }
  const off = Object.assign(new Error("Accounts are off"), { code: "accounts_off", status: 503 });
  assert.equal(isNotOpen(off), true);
  assert.equal(firebaseProblem(off).field, "closed");
  assert.equal(isNotOpen({ code: "auth/weak-password" }), false);
  assert.equal(isNotOpen(null), false);
});

test("our server's own answers: no connection, a bad token", () => {
  const offline = Object.assign(new Error("Could not reach the server. Check your connection and try again."), { code: "offline", status: 0 });
  assert.deepEqual(firebaseProblem(offline), { field: "form", message: offline.message });
  const bad = Object.assign(new Error("Token rejected"), { code: "bad_token", status: 401 });
  assert.equal(firebaseProblem(bad).message, "The sign-in could not be checked by our server. Try again.");
});

test("a sign-in the browser kept has ended (signed out, run out): the pages forget it", () => {
  for (const code of ["bad_token", "auth/user-token-expired", "auth/invalid-user-token", "auth/user-not-found"]) {
    assert.equal(signInEnded({ code }), true, code);
  }
  for (const code of ["offline", "auth/network-request-failed", "auth/too-many-requests", "accounts_off"]) {
    assert.equal(signInEnded({ code }), false, `${code}: try again, the sign-in itself is fine`);
  }
  assert.equal(signInEnded(null), false);
  assert.match(SIGN_IN_ENDED, /^That sign-in has ended\./);
});

// A WebP file's own width and height, read from its first bytes (the three
// kinds: "VP8 " plain, "VP8L" lossless, "VP8X" extended).
function webpSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", file);
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP", file);
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  throw new Error(`${file}: an unknown WebP kind ${kind}`);
}

test("the pictures: four real shots per set, light, described, and nothing the site no longer says", () => {
  assert.deepEqual(Object.keys(PICTURES), ["field", "atlas", "signin"]);
  for (const [set, list] of Object.entries(PICTURES)) {
    assert.equal(list.length, 4, `${set}: one large and three small`);
    for (const picture of list) {
      assert.match(picture.src, /^\/site\/shots\/[a-z0-9-]+\.webp$/, picture.src);
      // The file is there, as large as the page says, and light: the
      // 960-pixel copies (the full-size shots weigh up to 214 KB).
      const file = new URL(`../../public${picture.src}`, import.meta.url);
      assert.deepEqual(webpSize(file), { width: picture.width, height: picture.height }, `${picture.src}: its width and height`);
      assert.ok(picture.width <= 960, `${picture.src}: at most 960 pixels wide`);
      assert.ok(statSync(file).size <= 90 * 1024, `${picture.src}: at most 90 KB`);
      assert.ok(picture.alt.length > 20, `${picture.src} is described`);
      assert.ok(picture.caption.split(" ").length <= 7, `${picture.src}: a short caption`);
      const words = `${picture.alt} ${picture.caption}`;
      // The demo farm has grown past twelve fields, and the website no
      // longer mentions an access code anywhere.
      assert.doesNotMatch(words, /\b(12|twelve) fields\b/i, picture.src);
      assert.doesNotMatch(words, /access code|\bcode\b/i, picture.src);
    }
  }
  // Each product's own set shows that product first.
  assert.match(PICTURES.field[0].src, /field-/);
  assert.match(PICTURES.atlas[0].src, /atlas-/);
});
