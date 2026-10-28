// WHAT THIS FILE DOES
// Tests src/lib/registration.js: the rules behind the website's Register
// and Sign in pages. A farmer gets Field and an organisation gets Atlas;
// every answer has a limit and a plain-words message; typed coordinates
// are read; Firebase's error codes become sentences a person can act on.
// Run with "npm test" or "node --test src/lib/registration.test.js".
//
// WHO EDITS IT
// Whoever changes src/lib/registration.js.

import test from "node:test";
import assert from "node:assert/strict";
import {
  KINDS,
  LIMITS,
  ROLES,
  emailProblem,
  firebaseProblem,
  isNotOpen,
  nextStep,
  parsePlace,
  passwordProblem,
  placeFromResult,
  placeOffer,
  productForRole,
  profileForServer,
  roleForProduct,
  validateProfile,
} from "./registration.js";

const good = { role: "farmer", name: "Olena Kovalenko", email: "olena@example.org" };

test("the choice decides the product, both ways", () => {
  assert.equal(productForRole("farmer"), "field");
  assert.equal(productForRole("organisation"), "atlas");
  assert.equal(productForRole("investor"), null);
  assert.equal(productForRole(undefined), null);
  assert.equal(roleForProduct("field"), "farmer");
  assert.equal(roleForProduct("atlas"), "organisation");
  assert.equal(roleForProduct("both"), null);
  assert.equal(ROLES.farmer.title, "A farmer or landowner");
  assert.equal(ROLES.organisation.text, "Chernozem Atlas: a whole region, ranked");
});

test("the server's exact roles each belong to one product", () => {
  // The same six as server/accounts.js ROLES.
  const all = [...KINDS.field, ...KINDS.atlas].map((kind) => kind.role);
  assert.deepEqual(all.sort(), ["farmer", "government", "landowner", "ngo", "other", "research"]);
  for (const kind of KINDS.field) assert.equal(productForRole(kind.role), "field", kind.role);
  for (const kind of KINDS.atlas) assert.equal(productForRole(kind.role), "atlas", kind.role);
});

test("the limits match the server's (server/accounts.js PROFILE_LIMITS)", () => {
  assert.equal(LIMITS.name, 80);
  assert.equal(LIMITS.organization, 120);
  assert.equal(LIMITS.country, 120);
  assert.equal(LIMITS.address, 120);
  assert.ok(LIMITS.place <= 200, "the place label may be 200 at most on the server");
  assert.deepEqual(LIMITS.age, { min: 13, max: 120 });
});

test("e-mail: missing, malformed, too long, fine", () => {
  assert.equal(emailProblem(""), "Enter your e-mail address.");
  assert.equal(emailProblem("   "), "Enter your e-mail address.");
  assert.equal(emailProblem("olena"), "That e-mail address does not look right.");
  assert.equal(emailProblem("olena@site"), "That e-mail address does not look right.");
  assert.equal(emailProblem("ol ena@site.org"), "That e-mail address does not look right.");
  assert.equal(emailProblem(`${"a".repeat(LIMITS.email)}@site.org`), `Keep the e-mail under ${LIMITS.email} characters.`);
  assert.equal(emailProblem(" olena@site.org "), "");
});

test("password: 8 characters or more, and the repeat must match", () => {
  assert.equal(passwordProblem("", ""), "Enter a password.");
  assert.equal(passwordProblem("short", "short"), "Use 8 characters or more.");
  assert.equal(passwordProblem("longenough", ""), "Repeat the password.");
  assert.equal(passwordProblem("longenough", "longenougH"), "The passwords do not match.");
  assert.equal(passwordProblem("longenough", "longenough"), "");
  assert.equal(passwordProblem("x".repeat(LIMITS.password.max + 1), undefined), `Keep the password under ${LIMITS.password.max} characters.`);
  // The Sign in page has no repeat field.
  assert.equal(passwordProblem("longenough"), "");
  assert.equal(passwordProblem("short"), "Use 8 characters or more.");
});

test("the profile: a farmer needs a name and an e-mail, nothing else", () => {
  assert.deepEqual(validateProfile(good), { ok: true, problems: {} });
  assert.equal(validateProfile({ ...good, role: "landowner" }).ok, true);
  const empty = validateProfile({});
  assert.equal(empty.ok, false);
  assert.equal(empty.problems.role, "Choose who you are.");
  assert.equal(empty.problems.name, "Enter your name.");
  assert.equal(empty.problems.email, "Enter your e-mail address.");
  assert.equal(empty.problems.organization, undefined, "a farmer need not name an organisation");
});

test("the profile: an organisation must be named and given its kind for Atlas", () => {
  const atlas = validateProfile({ ...good, role: "organisation" });
  assert.equal(atlas.ok, false);
  assert.equal(atlas.problems.organization, "Name your organisation.");
  assert.equal(atlas.problems.kind, "Say what kind of organisation.");
  assert.equal(validateProfile({ ...good, role: "ngo", organization: "FAO" }).ok, true);
  assert.equal(validateProfile({ ...good, role: "government", organization: "Ministry of Agrarian Policy" }).ok, true);
  // The product can be given on its own (an account made earlier): the
  // kind is still needed.
  const product = validateProfile({ ...good, role: undefined, product: "atlas" });
  assert.equal(product.problems.organization, "Name your organisation.");
  assert.equal(product.problems.kind, "Say what kind of organisation.");
  assert.equal(validateProfile({ ...good, role: undefined, product: "field" }).problems.kind, "Farmer or landowner?");
  // A kind from the other product does not fit.
  assert.equal(validateProfile({ ...good, role: "ngo", product: "field" }).problems.kind, "Farmer or landowner?");
});

test("the profile: every limit has its message", () => {
  assert.equal(validateProfile({ ...good, name: "x".repeat(81) }).problems.name, "Keep your name under 80 characters.");
  assert.equal(validateProfile({ ...good, organization: "x".repeat(121) }).problems.organization, "Keep the organisation under 120 characters.");
  assert.equal(validateProfile({ ...good, country: "x".repeat(121) }).problems.country, "Keep the country under 120 characters.");
  assert.equal(validateProfile({ ...good, address: "x".repeat(121) }).problems.address, "Keep the town or address under 120 characters.");
  assert.equal(validateProfile({ ...good, name: "x".repeat(80), country: "x".repeat(120), address: "x".repeat(120) }).ok, true);
});

test("the profile: age is optional, a whole number from 13 to 120", () => {
  const message = "Age is a whole number from 13 to 120.";
  assert.equal(validateProfile({ ...good, age: "" }).ok, true);
  assert.equal(validateProfile({ ...good, age: undefined }).ok, true);
  assert.equal(validateProfile({ ...good, age: "17" }).ok, true);
  assert.equal(validateProfile({ ...good, age: 120 }).ok, true);
  assert.equal(validateProfile({ ...good, age: "12" }).problems.age, message);
  assert.equal(validateProfile({ ...good, age: "121" }).problems.age, message);
  assert.equal(validateProfile({ ...good, age: "17.5" }).problems.age, message);
  assert.equal(validateProfile({ ...good, age: "old" }).problems.age, message);
});

test("the profile: a chosen place must carry coordinates", () => {
  assert.equal(validateProfile({ ...good, place: null }).ok, true);
  assert.equal(validateProfile({ ...good, place: { lat: 49.71, lng: 37.62, label: "Kupiansk" } }).ok, true);
  assert.equal(validateProfile({ ...good, place: { lat: 91, lng: 37.62, label: "Nowhere" } }).problems.place, "That place has no coordinates.");
  assert.equal(validateProfile({ ...good, place: { lat: 49.71, lng: 37.62, label: "" } }).problems.place, "That place has no coordinates.");
});

test("what goes to the server: trimmed, empty answers left out, numbers as numbers", () => {
  assert.deepEqual(profileForServer({ role: "farmer", name: "  Olena ", email: "o@x.org", age: "", organization: " ", country: "Ukraine", address: "" }), {
    name: "Olena",
    role: "farmer",
    product: "field",
    country: "Ukraine",
  });
  assert.deepEqual(profileForServer({ role: "ngo", name: "Sam", age: "34", organization: "FAO", place: { lat: "49.71", lng: "37.62", label: " Kupiansk " } }), {
    name: "Sam",
    role: "ngo",
    product: "atlas",
    age: 34,
    organization: "FAO",
    place: { lat: 49.71, lng: 37.62, label: "Kupiansk" },
  });
  // The product can be named on its own (the server then refuses the
  // empty role, as validateProfile would have).
  assert.deepEqual(profileForServer({ product: "atlas", name: "Sam", organization: "FAO" }), { name: "Sam", role: "", product: "atlas", organization: "FAO" });
});

test("which part of the page comes next", () => {
  assert.equal(nextStep(null, null), "account");
  assert.equal(nextStep({ signedIn: false, account: null }, null), "account");
  assert.equal(nextStep({ signedIn: true, account: null }, null), "account", "the demo's code session is not an account");
  assert.equal(nextStep({ account: null }, { uid: "abc" }), "token");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: false } }, null), "profile");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: false } }, { uid: "abc" }), "profile");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: true } }, null), "done");
});

test("typed coordinates are read; anything else is a search", () => {
  assert.deepEqual(parsePlace("49.71, 37.62"), { lat: 49.71, lng: 37.62, label: "49.71, 37.62" });
  assert.deepEqual(parsePlace("49.71 37.62"), { lat: 49.71, lng: 37.62, label: "49.71, 37.62" });
  assert.deepEqual(parsePlace("49.71N 37.62E"), { lat: 49.71, lng: 37.62, label: "49.71, 37.62" });
  assert.deepEqual(parsePlace("33.9S, 18.4W"), { lat: -33.9, lng: -18.4, label: "-33.9, -18.4" });
  assert.deepEqual(parsePlace("-34,6; -58,4"), { lat: -34.6, lng: -58.4, label: "-34.6, -58.4" });
  assert.equal(parsePlace("Kupiansk"), null);
  assert.equal(parsePlace("91, 10"), null, "latitude past 90");
  assert.equal(parsePlace("10, 181"), null, "longitude past 180");
  assert.equal(parsePlace(""), null);
  assert.equal(parsePlace(undefined), null);
});

test("a place-search answer becomes a place and an offer", () => {
  const result = { label: "Kupiansk, Kharkiv, Ukraine", lat: 49.7106, lon: 37.6156, bbox: [37.5, 49.6, 37.7, 49.8] };
  assert.deepEqual(placeFromResult(result), { lat: 49.7106, lng: 37.6156, label: "Kupiansk, Kharkiv, Ukraine" });
  assert.equal(placeOffer(result), "Use: Kupiansk, Kharkiv, Ukraine (49.71, 37.62)");
  assert.deepEqual(placeFromResult({ label: "x", lat: 1, lng: 2 }), { lat: 1, lng: 2, label: "x" }, "lng works like lon");
  assert.equal(placeFromResult({ label: "x", lat: "n", lon: 2 }), null);
  assert.equal(placeOffer(null), "");
  assert.equal(placeFromResult({ label: "x".repeat(300), lat: 1, lon: 2 }).label.length, LIMITS.place);
});

test("Firebase's codes become plain words beside the right field", () => {
  assert.deepEqual(firebaseProblem({ code: "auth/email-already-in-use" }), { field: "email", message: "That e-mail already has an account; sign in instead." });
  assert.deepEqual(firebaseProblem({ code: "auth/weak-password" }), { field: "password", message: "Use 8 characters or more." });
  assert.deepEqual(firebaseProblem({ code: "auth/invalid-email" }), { field: "email", message: "That e-mail address does not look right." });
  assert.equal(firebaseProblem({ code: "auth/wrong-password" }).message, "That e-mail and password do not match.");
  assert.equal(firebaseProblem({ code: "auth/invalid-credential" }).message, "That e-mail and password do not match.");
  assert.equal(firebaseProblem({ code: "auth/popup-closed-by-user" }).message, "The Google window was closed before you signed in. Try again.");
  assert.equal(firebaseProblem({ code: "auth/network-request-failed" }).field, "form");
  assert.equal(firebaseProblem({ code: "auth/too-many-requests" }).message, "Too many attempts. Wait a few minutes and try again.");
  assert.deepEqual(firebaseProblem({ code: "auth/something-new" }), { field: "form", message: "Something went wrong (something-new). Try again." });
  assert.deepEqual(firebaseProblem(new Error("boom")), { field: "form", message: "Something went wrong. Try again." });
});

test("registration not open: Firebase's two codes and our server's 503", () => {
  for (const code of ["auth/configuration-not-found", "auth/operation-not-allowed"]) {
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
