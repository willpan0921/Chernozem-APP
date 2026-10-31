// WHAT THIS FILE DOES
// The rules of the website's Register and Sign in pages
// (src/site/pages/RegisterPage.jsx, SignInPage.jsx), kept here as plain
// functions and lists with no screen attached, so they can be tested.
//
// Registering is one step: Field or Atlas at the top; for Atlas, the
// organisation and its kind; then "Continue with Google" (the name comes
// from Google) or a name, an e-mail and a password. The page then goes
// straight into the product, whose own setup asks where: Field's "Set up
// your farm" finds the land, Atlas's "Choose an area" the region. So the
// Register page never asks for a place.
//
//   PRODUCTS                       the two things a person registers for:
//                                  Field ("for my farm") and Atlas ("for a
//                                  region"), with their address in the app
//   productFromParam(value)        ?product=field|atlas in the address ->
//                                  "field" | "atlas" (Field when missing)
//   ORG_KINDS                      the kinds of organisation an Atlas account
//                                  can be: Government, NGO, Research, Other.
//                                  None is chosen until the person picks one.
//   productForRole(role)           a role the server keeps -> "field" |
//                                  "atlas" | null
//   roleForSave(product, kind)     the role PUT /api/account gets: Field ->
//                                  farmer (a landowner from an older profile
//                                  stays one); Atlas -> the organisation's
//                                  kind ("" when none is chosen)
//   LIMITS                         how long each answer may be (the same
//                                  numbers as server/accounts.js)
//   emailProblem(email)            "" when the e-mail looks right, else what
//                                  is wrong, in plain words
//   passwordProblem(password)      "" when the password is long enough
//   validateProfile(fields, opts)  { ok, problems: { field: message } } for
//                                  the product, the name and, for Atlas, the
//                                  organisation and its kind. With
//                                  { nameFromGoogle: true } the name may be
//                                  left empty: Google gives it.
//   FIELD_ORDER, firstProblem(p)   the answers in the order the page shows
//                                  them, and the first one with a problem
//                                  (where the keyboard goes)
//   profileForServer(fields)       the answers, cleaned, in the shape PUT
//                                  /api/account expects
//   isOwner(status)                true when GET /api/auth/status says this
//                                  browser is the owner (signed in with the
//                                  Chernozem Google account)
//   nextStep(status)               which part of the Register page to show
//   destinationFor(account)        where a signed-in account goes next:
//                                  /field, /atlas, or /register to finish
//   firebaseProblem(error)         a Firebase or server error -> which field
//                                  it belongs to and what to say
//   isNotOpen(error)               true when registration is not switched on
//                                  (Firebase or our server says so)
//   signInEnded(error)             true when a sign-in this browser kept has
//                                  ended (signed out, or run out)
//   SIGN_IN_ENDED                  what the pages then say
//   PICTURES                       the real pictures of the product both
//                                  pages show beside the form, none wider
//                                  than 960 pixels, so the page stays light
//
// WHO EDITS IT
// Whoever changes what the Register page asks or how it answers. Keep
// registration.test.js passing, and the limits equal to the server's.

// The two products. The choice at the top of the Register page decides
// which one the account gets; the server keeps it (PUT /api/account).
export const PRODUCTS = {
  field: {
    name: "Field",
    tagline: "for my farm",
    path: "/field",
  },
  atlas: {
    name: "Atlas",
    tagline: "for a region",
    path: "/atlas",
  },
};

export function productFromParam(value) {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PRODUCTS[key] ? key : "field";
}

// The kinds of organisation an Atlas account can be (server/accounts.js
// ROLES, the four that belong to Atlas). The page starts with none chosen.
export const ORG_KINDS = [
  { role: "government", label: "Government" },
  { role: "ngo", label: "NGO" },
  { role: "research", label: "Research" },
  { role: "other", label: "Other" },
];

// The two Field roles the server keeps. The page does not ask: everyone
// on Field is a farmer, unless an older profile already said landowner.
const FIELD_ROLES = ["farmer", "landowner"];

const isKind = (kind) => ORG_KINDS.some((item) => item.role === kind);

export function productForRole(role) {
  if (FIELD_ROLES.includes(role)) return "field";
  if (isKind(role)) return "atlas";
  return null;
}

export function roleForSave(product, kind) {
  if (product === "field") return kind === "landowner" ? "landowner" : "farmer";
  if (product === "atlas") return isKind(kind) ? kind : "";
  return "";
}

// How long each answer may be. The server checks the same numbers
// (server/accounts.js PROFILE_LIMITS).
export const LIMITS = {
  name: 80,
  email: 120,
  organization: 120,
  password: { min: 8, max: 200 },
};

const text = (value) => (typeof value === "string" ? value.trim() : "");

// Good enough to catch a missing @ or a space; Firebase and the mail
// server have the last word.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailProblem(email) {
  const value = text(email);
  if (!value) return "Enter your e-mail address.";
  if (value.length > LIMITS.email) return `Keep the e-mail to ${LIMITS.email} characters or fewer.`;
  if (!EMAIL_SHAPE.test(value)) return "That e-mail address does not look right.";
  return "";
}

export function passwordProblem(password) {
  const value = typeof password === "string" ? password : "";
  if (!value) return "Enter a password.";
  if (value.length < LIMITS.password.min) return `Use ${LIMITS.password.min} characters or more.`;
  if (value.length > LIMITS.password.max) return `Keep the password to ${LIMITS.password.max} characters or fewer.`;
  return "";
}

// fields: { product, kind?, name, organization? }. kind is the
// organisation's kind for Atlas: it must be chosen, like the organisation.
// options.nameFromGoogle: the person signs up with Google, which gives the
// name, so an empty name is fine (a typed one is still checked).
export function validateProfile(fields = {}, { nameFromGoogle = false } = {}) {
  const problems = {};
  const product = fields.product;
  if (!PRODUCTS[product]) problems.product = "Choose Field or Atlas.";

  if (product === "atlas") {
    const organization = text(fields.organization);
    if (!organization) problems.organization = "Name your organisation.";
    else if (organization.length > LIMITS.organization) problems.organization = `Keep the organisation to ${LIMITS.organization} characters or fewer.`;
    if (!isKind(fields.kind)) problems.kind = "Choose what kind of organisation.";
  }

  const name = text(fields.name);
  if (!name && !nameFromGoogle) problems.name = "Enter your name.";
  else if (name.length > LIMITS.name) problems.name = `Keep your name to ${LIMITS.name} characters or fewer.`;

  return { ok: Object.keys(problems).length === 0, problems };
}

// The answers in the order the Register page shows them: the product, then
// Atlas's organisation and kind (needed whichever way the person signs up),
// then the name, the e-mail and the password of the e-mail way.
export const FIELD_ORDER = ["product", "organization", "kind", "name", "email", "password"];

export function firstProblem(problems = {}) {
  return FIELD_ORDER.find((key) => problems[key]) || "";
}

// The cleaned answers for PUT /api/account: { name, product, role,
// organization? }. The organisation goes only with Atlas, and only when
// given.
export function profileForServer(fields = {}) {
  const product = PRODUCTS[fields.product] ? fields.product : "";
  const body = { name: text(fields.name), product, role: roleForSave(product, fields.kind) };
  if (product === "atlas") {
    const organization = text(fields.organization);
    if (organization) body.organization = organization;
  }
  return body;
}

// status: the answer of GET /api/auth/status. The owner signs in with the
// Chernozem Google account: mode "owner", and the account (when the server
// names it) says owner: true.
export function isOwner(status) {
  return status?.mode === "owner" || status?.account?.owner === true;
}

// status: the answer of GET /api/auth/status ({ mode, account: null |
// { profileComplete, owner? } }).
//   "owner"   the owner: a way into both products (the demo they edit)
//   "signed"  an account whose name and product are saved: its product
//   "finish"  an account with something still missing (Google gave no
//             name, or the connection dropped before the answers were saved)
//   "form"    nobody yet: the one-step form
export function nextStep(status) {
  if (isOwner(status)) return "owner";
  const account = status?.account;
  if (account?.profileComplete) return "signed";
  if (account) return "finish";
  return "form";
}

// Where a signed-in account goes: its product, or the Register page
// (with its product, when it has one) while something is still missing.
export function destinationFor(account) {
  const product = PRODUCTS[account?.product] ? account.product : null;
  if (account?.profileComplete && product) return PRODUCTS[product].path;
  return product ? `/register?product=${product}` : "/register";
}

// Firebase answers these when Authentication is not switched on in the
// console; our server answers 503 accounts_off when it cannot check tokens.
const NOT_OPEN = new Set(["auth/configuration-not-found", "auth/operation-not-allowed", "auth/admin-restricted-operation"]);

export function isNotOpen(error) {
  if (!error) return false;
  if (NOT_OPEN.has(error.code)) return true;
  return error.code === "accounts_off" || error.status === 503;
}

// A sign-in this browser kept has ended: the person signed out (which ends
// every sign-in of the account), or it ran out. Firebase says so when it
// cannot renew it; our server answers 401 bad_token when it is refused.
const ENDED = new Set(["bad_token", "auth/user-token-expired", "auth/invalid-user-token", "auth/user-not-found"]);

export function signInEnded(error) {
  return Boolean(error) && ENDED.has(error.code);
}

export const SIGN_IN_ENDED = "That sign-in has ended. Sign in again with Google or your e-mail.";

const TAKEN = "That e-mail already has an account.";
const NO_MATCH = "That e-mail and password do not match.";

// [field, message, signIn]: signIn is true when the page should offer
// the Sign in page next to the message.
const FIREBASE_WORDS = {
  "auth/email-already-in-use": ["email", TAKEN, true],
  "auth/account-exists-with-different-credential": ["email", TAKEN, true],
  "auth/invalid-email": ["email", "That e-mail address does not look right."],
  "auth/missing-email": ["email", "Enter your e-mail address."],
  "auth/weak-password": ["password", `Use ${LIMITS.password.min} characters or more.`],
  "auth/missing-password": ["password", "Enter a password."],
  "auth/wrong-password": ["password", NO_MATCH],
  "auth/user-not-found": ["password", NO_MATCH],
  "auth/invalid-credential": ["password", NO_MATCH],
  "auth/invalid-login-credentials": ["password", NO_MATCH],
  "auth/user-disabled": ["form", "This account has been switched off. Write to us if that is a mistake."],
  "auth/too-many-requests": ["form", "Too many attempts. Wait a few minutes and try again."],
  "auth/popup-closed-by-user": ["form", "The Google window was closed before you signed in. Try again."],
  "auth/cancelled-popup-request": ["form", "The Google window was closed before you signed in. Try again."],
  "auth/popup-blocked": ["form", "The browser blocked the Google window. Allow pop-ups for this site and try again."],
  "auth/network-request-failed": ["form", "Could not reach Google to sign in. Check your connection and try again."],
  "auth/unauthorized-domain": ["form", "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead."],
  "auth/user-token-expired": ["form", SIGN_IN_ENDED],
  "auth/invalid-user-token": ["form", SIGN_IN_ENDED],
  bad_token: ["form", "The sign-in could not be checked by our server. Try again."],
};

// -> { field: "email" | "password" | "form" | "closed", message, signIn? }
export function firebaseProblem(error) {
  if (isNotOpen(error)) return { field: "closed", message: "Registration is not open yet." };
  const code = error?.code || "";
  const known = FIREBASE_WORDS[code];
  if (known) return known[2] ? { field: known[0], message: known[1], signIn: true } : { field: known[0], message: known[1] };
  if (code === "offline" || error?.status === 0) {
    return { field: "form", message: error?.message || "Could not reach the server. Check your connection and try again." };
  }
  const detail = code ? ` (${code.replace(/^auth\//, "")})` : "";
  return { field: "form", message: `Something went wrong${detail}. Try again.` };
}

// Real pictures of the product (public/site/shots, see its manifest.json),
// four per set: one large, three small. The Register page shows the set of
// the product chosen at its top and swaps it when the choice changes; the
// Sign in page shows "signin". width and height are the files' own. Only
// the 960-pixel copies (and the one phone screen, 780 wide): the large
// picture is shown about 760 pixels wide, so the full-size files (up to
// 214 KB) would only make the page slower.
export const PICTURES = {
  field: [
    {
      src: "/site/shots/field-fields-detail-960.webp",
      width: 960,
      height: 684,
      alt: "Field: a farm's fields outlined on the satellite map, Field 11 selected, with its water, plant health, stress and harvest readings",
      caption: "Each field, read after every clear pass",
    },
    { src: "/site/shots/field-data-960.webp", width: 960, height: 600, alt: "Field's data page: plant health since 2019 against the normal years", caption: "Plant health since 2019" },
    { src: "/site/shots/field-ai-960.webp", width: 960, height: 600, alt: "Field's assistant, with suggested questions about the farm", caption: "Ask what changed" },
    { src: "/site/shots/phone-field-fields.webp", width: 780, height: 1688, alt: "Field on a phone: the fields on the satellite map", caption: "On your phone", tall: true },
  ],
  atlas: [
    {
      src: "/site/shots/atlas-map-near-macro-960.webp",
      width: 960,
      height: 600,
      alt: "Atlas: Ukraine's oblasts filled and ranked by near-term priority, Mykolaiv, Kirovohrad and Poltava first",
      caption: "A whole region, ranked",
    },
    { src: "/site/shots/atlas-map-damage-micro-960.webp", width: 960, height: 600, alt: "Atlas: the damage layer of Ukraine, square by square", caption: "Damage, square by square" },
    { src: "/site/shots/atlas-overview-960.webp", width: 960, height: 600, alt: "Atlas's overview: cropland, black soil, heavy damage and people on damaged land", caption: "The month's figures" },
    { src: "/site/shots/atlas-report-960.webp", width: 960, height: 600, alt: "Atlas's donor report: the headline figures and the top ten areas", caption: "A donor report" },
  ],
  signin: [
    {
      src: "/site/shots/field-fields-detail-960.webp",
      width: 960,
      height: 684,
      alt: "Field: a farm's fields outlined on the satellite map, Field 11 selected, with its water, plant health, stress and harvest readings",
      caption: "Field: each field after the latest pass",
    },
    { src: "/site/shots/field-data-960.webp", width: 960, height: 600, alt: "Field's data page: plant health since 2019 against the normal years", caption: "Plant health since 2019" },
    { src: "/site/shots/field-ai-960.webp", width: 960, height: 600, alt: "Field's assistant, with suggested questions about the farm", caption: "Ask what changed" },
    { src: "/site/shots/atlas-map-near-macro-960.webp", width: 960, height: 600, alt: "Atlas: Ukraine's oblasts ranked for the near term", caption: "Atlas: a region, ranked" },
  ],
};
