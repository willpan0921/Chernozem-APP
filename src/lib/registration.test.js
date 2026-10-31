// WHAT THIS FILE DOES
// Tests src/lib/registration.js: the rules behind the website's Register
// and Sign in pages. The choice at the top gives Field or Atlas; an Atlas
// account names its organisation and its kind; every answer has a limit and
// a plain-words message; a place found by the search gives the country;
// Firebase's error codes become sentences a person can act on; the
// pictures beside the form never print what the website no longer says.
// Run with "npm test" or "node --test src/lib/registration.test.js".
//
// WHO EDITS IT
// Whoever changes src/lib/registration.js.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ORG_KIND,
  LIMITS,
  ORG_KINDS,
  PICTURES,
  PRODUCTS,
  STEPS,
  countryFromLabel,
  destinationFor,
  emailProblem,
  firebaseProblem,
  isNotOpen,
  nextStep,
  parsePlace,
  passwordProblem,
  placeFromResult,
  productForRole,
  productFromParam,
  profileForServer,
  roleForSave,
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
  assert.equal(PRODUCTS.field.placeLabel, "Where is your land?");
  assert.equal(PRODUCTS.atlas.placeLabel, "Which region do you work on?");
});

test("?product= in the address chooses in advance; Field otherwise", () => {
  assert.equal(productFromParam("atlas"), "atlas");
  assert.equal(productFromParam(" Atlas "), "atlas");
  assert.equal(productFromParam("field"), "field");
  assert.equal(productFromParam(null), "field");
  assert.equal(productFromParam(""), "field");
  assert.equal(productFromParam("both"), "field");
});

test("the steps are words, never numbers", () => {
  assert.deepEqual(
    STEPS.map((step) => step.label),
    ["Account", "About you"]
  );
  for (const step of STEPS) assert.doesNotMatch(step.label, /\d/);
});

test("the server's six roles each belong to one product", () => {
  // The same six as server/accounts.js ROLES.
  for (const role of ["farmer", "landowner"]) assert.equal(productForRole(role), "field", role);
  for (const role of ["government", "ngo", "research", "other"]) assert.equal(productForRole(role), "atlas", role);
  assert.equal(productForRole("investor"), null);
  assert.equal(productForRole(undefined), null);
  assert.deepEqual(
    ORG_KINDS.map((kind) => kind.label),
    ["Government", "NGO", "Research", "Other"]
  );
  assert.equal(DEFAULT_ORG_KIND, "other");
});

test("the role saved: Field is a farmer, Atlas is its kind (Other when none)", () => {
  assert.equal(roleForSave("field"), "farmer");
  assert.equal(roleForSave("field", "ngo"), "farmer", "an Atlas kind left over does not reach Field");
  assert.equal(roleForSave("field", "landowner"), "landowner", "an older profile's landowner stays one");
  assert.equal(roleForSave("atlas", "government"), "government");
  assert.equal(roleForSave("atlas", "research"), "research");
  assert.equal(roleForSave("atlas"), "other");
  assert.equal(roleForSave("atlas", "farmer"), "other");
  assert.equal(roleForSave(undefined, "ngo"), "");
});

test("the limits match the server's (server/accounts.js PROFILE_LIMITS)", () => {
  assert.equal(LIMITS.name, 80);
  assert.equal(LIMITS.organization, 120);
  assert.equal(LIMITS.country, 120);
  assert.ok(LIMITS.place <= 200, "the place label may be 200 at most on the server");
  assert.deepEqual(LIMITS.password, { min: 8, max: 200 });
  assert.equal(LIMITS.age, undefined, "the page no longer asks the age");
  assert.equal(LIMITS.address, undefined, "the page no longer asks the address");
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

test("About you, Field: a name is all that is needed", () => {
  assert.deepEqual(validateProfile(farmer), { ok: true, problems: {} });
  assert.equal(validateProfile({ ...farmer, organization: "" }).ok, true, "a farmer need not name an organisation");
  const empty = validateProfile({});
  assert.equal(empty.ok, false);
  assert.equal(empty.problems.product, "Choose Field or Atlas.");
  assert.equal(empty.problems.name, "Enter your name.");
  assert.equal(validateProfile({ product: "field", name: "   " }).problems.name, "Enter your name.");
});

test("About you, Atlas: the organisation is needed, its kind is Other until chosen", () => {
  assert.deepEqual(validateProfile(ngo), { ok: true, problems: {} });
  assert.equal(validateProfile({ ...ngo, kind: undefined }).ok, true, "no kind chosen yet: Other");
  const missing = validateProfile({ ...ngo, organization: " " });
  assert.equal(missing.ok, false);
  assert.equal(missing.problems.organization, "Name your organisation.");
  assert.equal(validateProfile({ ...ngo, kind: "farmer" }).problems.kind, "Choose what kind of organisation.");
});

test("About you: every limit has its message", () => {
  assert.equal(validateProfile({ ...farmer, name: "x".repeat(81) }).problems.name, "Keep your name to 80 characters or fewer.");
  assert.equal(validateProfile({ ...ngo, organization: "x".repeat(121) }).problems.organization, "Keep the organisation to 120 characters or fewer.");
  assert.equal(validateProfile({ ...farmer, name: "x".repeat(80) }).ok, true);
  assert.equal(validateProfile({ ...ngo, organization: "x".repeat(120) }).ok, true);
});

test("About you: a chosen place must carry coordinates and a name", () => {
  assert.equal(validateProfile({ ...farmer, place: null }).ok, true);
  assert.equal(validateProfile({ ...farmer, place: { lat: 49.71, lng: 37.62, label: "Kupiansk" } }).ok, true);
  assert.equal(validateProfile({ ...farmer, place: { lat: 91, lng: 37.62, label: "Nowhere" } }).problems.place, "That place has no coordinates.");
  assert.equal(validateProfile({ ...farmer, place: { lat: 49.71, lng: 37.62, label: "" } }).problems.place, "That place has no coordinates.");
});

test("the country is the last part of a found place's name", () => {
  assert.equal(countryFromLabel("Kupiansk, Kharkiv Oblast, Ukraine"), "Ukraine");
  assert.equal(countryFromLabel("Kharkiv Oblast, Ukraine"), "Ukraine");
  assert.equal(countryFromLabel(" Ames , Iowa , United States "), "United States");
  assert.equal(countryFromLabel("Ukraine"), "", "one part: nothing to tell it by");
  assert.equal(countryFromLabel("49.7400° N, 37.5400° E"), "", "coordinates have no country");
  assert.equal(countryFromLabel("49.71, 37.62"), "");
  assert.equal(countryFromLabel(""), "");
  assert.equal(countryFromLabel(undefined), "");
  assert.equal(countryFromLabel(`Somewhere, ${"x".repeat(200)}`).length, LIMITS.country);
});

test("what goes to PUT /api/account: trimmed, empty answers left out", () => {
  assert.deepEqual(profileForServer({ product: "field", name: "  Olena ", organization: "Left from Atlas" }), {
    name: "Olena",
    product: "field",
    role: "farmer",
  });
  assert.deepEqual(
    profileForServer({ product: "atlas", kind: "ngo", name: "Sam", organization: " FAO ", place: { lat: "49.71", lng: "37.62", label: " Kupiansk, Kharkiv Oblast, Ukraine " } }),
    {
      name: "Sam",
      product: "atlas",
      role: "ngo",
      organization: "FAO",
      place: { lat: 49.71, lng: 37.62, label: "Kupiansk, Kharkiv Oblast, Ukraine" },
      country: "Ukraine",
    }
  );
  // Atlas without a chosen kind is Other; a place from coordinates has no country.
  assert.deepEqual(profileForServer({ product: "atlas", name: "Sam", organization: "FAO", place: { lat: 49.71, lng: 37.62, label: "49.71, 37.62" } }), {
    name: "Sam",
    product: "atlas",
    role: "other",
    organization: "FAO",
    place: { lat: 49.71, lng: 37.62, label: "49.71, 37.62" },
  });
  // A place without coordinates is left out (validateProfile has said why).
  assert.equal(profileForServer({ ...farmer, place: { lat: 95, lng: 0, label: "x" } }).place, undefined);
  // Never the questions the page no longer asks.
  const body = profileForServer({ ...farmer, age: "34", address: "Main street" });
  assert.equal(body.age, undefined);
  assert.equal(body.address, undefined);
});

test("which part of the Register page comes next", () => {
  assert.equal(nextStep(null, null), "account");
  assert.equal(nextStep({ signedIn: false, account: null }, null), "account");
  assert.equal(nextStep({ mode: "demo", readOnly: true, signedIn: false, account: null }, null), "account", "the public demo is not an account");
  assert.equal(nextStep({ mode: "owner", signedIn: true, account: null }, null), "account", "the owner's key is not an account");
  assert.equal(nextStep({ account: null }, { uid: "abc" }), "token");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: false } }, null), "profile");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: false } }, { uid: "abc" }), "profile");
  assert.equal(nextStep({ account: { uid: "abc", profileComplete: true } }, null), "signed");
});

test("after signing in: the product, or the Register page to finish", () => {
  assert.equal(destinationFor({ product: "field", profileComplete: true }), "/field");
  assert.equal(destinationFor({ product: "atlas", profileComplete: true }), "/atlas");
  assert.equal(destinationFor({ product: null, profileComplete: false }), "/register");
  assert.equal(destinationFor({ product: "atlas", profileComplete: false }), "/register?product=atlas");
  assert.equal(destinationFor({ product: "both", profileComplete: true }), "/register");
  assert.equal(destinationFor(null), "/register");
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

test("a place-search answer becomes a place", () => {
  const result = { label: "Kupiansk, Kharkiv Oblast, Ukraine", lat: 49.7106, lon: 37.6156, bbox: [37.5, 49.6, 37.7, 49.8] };
  assert.deepEqual(placeFromResult(result), { lat: 49.7106, lng: 37.6156, label: "Kupiansk, Kharkiv Oblast, Ukraine" });
  assert.deepEqual(placeFromResult({ label: "x", lat: 1, lng: 2 }), { lat: 1, lng: 2, label: "x" }, "lng works like lon");
  assert.deepEqual(placeFromResult({ label: " ", lat: 1.234, lon: 2.345 }), { lat: 1.234, lng: 2.345, label: "1.23, 2.35" });
  assert.equal(placeFromResult({ label: "x", lat: "n", lon: 2 }), null);
  assert.equal(placeFromResult(null), null);
  assert.equal(placeFromResult({ label: "x".repeat(300), lat: 1, lon: 2 }).label.length, LIMITS.place);
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

test("the pictures: four real shots per set, described, and nothing the site no longer says", () => {
  assert.deepEqual(Object.keys(PICTURES), ["field", "atlas", "signin"]);
  for (const [set, list] of Object.entries(PICTURES)) {
    assert.equal(list.length, 4, `${set}: one large and three small`);
    for (const picture of list) {
      assert.match(picture.src, /^\/site\/shots\/[a-z0-9-]+\.webp$/, picture.src);
      assert.ok(picture.width > 0 && picture.height > 0, `${picture.src} has its size`);
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
