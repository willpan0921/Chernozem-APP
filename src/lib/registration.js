// WHAT THIS FILE DOES
// The rules of the website's Register and Sign in pages
// (src/site/pages/RegisterPage.jsx, SignInPage.jsx), kept here as plain
// functions and lists with no screen attached, so they can be tested:
//
//   PRODUCTS                       the two things a person registers for:
//                                  Field ("for my farm") and Atlas ("for a
//                                  region"), with their address in the app
//                                  and the words of the place question
//   productFromParam(value)        ?product=field|atlas in the address ->
//                                  "field" | "atlas" (Field when missing)
//   ORG_KINDS, DEFAULT_ORG_KIND    the kind of organisation an Atlas account
//                                  is: Government, NGO, Research, Other
//                                  (Other until the person picks one)
//   productForRole(role)           a role the server keeps -> "field" |
//                                  "atlas" | null
//   roleForSave(product, kind)     the role PUT /api/account gets: Field ->
//                                  farmer (a landowner from an older profile
//                                  stays one); Atlas -> the organisation's kind
//   STEPS                          the two steps, in words: Account, About you
//   LIMITS                         how long each answer may be (the same
//                                  numbers as server/accounts.js)
//   emailProblem(email)            "" when the e-mail looks right, else what
//                                  is wrong, in plain words
//   passwordProblem(password)      "" when the password is long enough
//   validateProfile(fields)        { ok, problems: { field: message } } for
//                                  the "About you" step
//   countryFromLabel(label)        "Kupiansk, Kharkiv Oblast, Ukraine" ->
//                                  "Ukraine" (the last part of a place name)
//   profileForServer(fields)       the answers, cleaned, in the shape PUT
//                                  /api/account expects
//   nextStep(status, firebaseUser) which part of the Register page to show
//   destinationFor(account)        where a signed-in account goes next:
//                                  /field, /atlas, or /register to finish
//   parsePlace(text)               "49.71, 37.62" -> { lat, lng, label } or
//                                  null when the text is not coordinates
//   placeFromResult(result)        a place-search answer -> { lat, lng, label }
//   firebaseProblem(error)         a Firebase or server error -> which field
//                                  it belongs to and what to say
//   isNotOpen(error)               true when registration is not switched on
//                                  (Firebase or our server says so)
//   PICTURES                       the real pictures of the product both
//                                  pages show beside the form
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
    placeLabel: "Where is your land?",
    placeHint: "Village, town or coordinates",
  },
  atlas: {
    name: "Atlas",
    tagline: "for a region",
    path: "/atlas",
    placeLabel: "Which region do you work on?",
    placeHint: "Region, province or country",
  },
};

export function productFromParam(value) {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PRODUCTS[key] ? key : "field";
}

// The kinds of organisation an Atlas account can be (server/accounts.js
// ROLES, the four that belong to Atlas).
export const ORG_KINDS = [
  { role: "government", label: "Government" },
  { role: "ngo", label: "NGO" },
  { role: "research", label: "Research" },
  { role: "other", label: "Other" },
];

export const DEFAULT_ORG_KIND = "other";

// The two Field roles the server keeps. The page no longer asks: everyone
// on Field is a farmer, unless an older profile already said landowner.
const FIELD_ROLES = ["farmer", "landowner"];

export function productForRole(role) {
  if (FIELD_ROLES.includes(role)) return "field";
  if (ORG_KINDS.some((kind) => kind.role === role)) return "atlas";
  return null;
}

export function roleForSave(product, kind) {
  if (product === "field") return kind === "landowner" ? "landowner" : "farmer";
  if (product === "atlas") return ORG_KINDS.some((item) => item.role === kind) ? kind : DEFAULT_ORG_KIND;
  return "";
}

// The two steps of the Register page, shown in words, never numbered.
export const STEPS = [
  { key: "account", label: "Account" },
  { key: "profile", label: "About you" },
];

// How long each answer may be. The server checks the same numbers
// (server/accounts.js PROFILE_LIMITS; a place's name may be 200 there).
export const LIMITS = {
  name: 80,
  email: 120,
  organization: 120,
  country: 120,
  place: 160,
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

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// fields: { product, kind?, name, organization?, place? }. kind is the
// organisation's kind for Atlas (Other when left out). place is the chosen
// { lat, lng, label }, or null.
export function validateProfile(fields = {}) {
  const problems = {};
  const product = fields.product;
  if (!PRODUCTS[product]) problems.product = "Choose Field or Atlas.";

  const name = text(fields.name);
  if (!name) problems.name = "Enter your name.";
  else if (name.length > LIMITS.name) problems.name = `Keep your name to ${LIMITS.name} characters or fewer.`;

  if (product === "atlas") {
    const organization = text(fields.organization);
    if (!organization) problems.organization = "Name your organisation.";
    else if (organization.length > LIMITS.organization) problems.organization = `Keep the organisation to ${LIMITS.organization} characters or fewer.`;
    if (fields.kind !== undefined && fields.kind !== null && fields.kind !== "" && !ORG_KINDS.some((item) => item.role === fields.kind)) {
      problems.kind = "Choose what kind of organisation.";
    }
  }

  const place = fields.place;
  if (place && (!inRange(Number(place.lat), Number(place.lng)) || !text(place.label))) problems.place = "That place has no coordinates.";

  return { ok: Object.keys(problems).length === 0, problems };
}

// The country in a place-search answer's name: its last part, when the
// name has more than one ("Kupiansk, Kharkiv Oblast, Ukraine" -> "Ukraine").
// A name of one part, or coordinates ("49.7400° N, 37.5400° E"), gives "".
export function countryFromLabel(label) {
  const parts = text(label)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1];
  if (/[\d°]/.test(last)) return "";
  return last.slice(0, LIMITS.country);
}

// The cleaned answers for PUT /api/account: { name, product, role,
// organization?, country?, place? }. Empty answers are left out rather
// than sent as "". The organisation goes only with Atlas; the country is
// read from the chosen place.
export function profileForServer(fields = {}) {
  const product = PRODUCTS[fields.product] ? fields.product : "";
  const body = { name: text(fields.name), product, role: roleForSave(product, fields.kind) };
  if (product === "atlas") {
    const organization = text(fields.organization);
    if (organization) body.organization = organization;
  }
  const place = fields.place;
  if (place && inRange(Number(place.lat), Number(place.lng))) {
    const label = text(place.label).slice(0, LIMITS.place);
    body.place = { lat: Number(place.lat), lng: Number(place.lng), label };
    const country = countryFromLabel(label);
    if (country) body.country = country;
  }
  return body;
}

// status: the answer of GET /api/auth/status ({ account: null | { profileComplete } }).
// firebaseUser: the user Firebase has on this browser, or null.
//   "signed"   the account exists and its profile is complete
//   "profile"  the account cookie is set; "About you" is next
//   "token"    Firebase knows the person but our server does not yet:
//              post the ID token, then "About you"
//   "account"  nothing yet: the "Account" step
export function nextStep(status, firebaseUser) {
  const account = status?.account;
  if (account?.profileComplete) return "signed";
  if (account) return "profile";
  if (firebaseUser) return "token";
  return "account";
}

// Where a signed-in account goes: its product, or the Register page
// (with its product, when it has one) while "About you" is not finished.
export function destinationFor(account) {
  const product = PRODUCTS[account?.product] ? account.product : null;
  if (account?.profileComplete && product) return PRODUCTS[product].path;
  return product ? `/register?product=${product}` : "/register";
}

// Two numbers, latitude then longitude, as Google Maps copies them:
// "49.71, 37.62", "49.71 37.62", "49.71N 37.62E", "-33.9; 18.4".
const COORDS = /^\s*([NSns]?)\s*(-?\d+(?:[.,]\d+)?)\s*([NSns]?)\s*[,;\s]\s*([EWew]?)\s*(-?\d+(?:[.,]\d+)?)\s*([EWew]?)\s*$/;

export function parsePlace(input) {
  if (typeof input !== "string") return null;
  const m = input.match(COORDS);
  if (!m) return null;
  let lat = Number(m[2].replace(",", "."));
  let lng = Number(m[5].replace(",", "."));
  const ns = (m[1] || m[3]).toUpperCase();
  const ew = (m[4] || m[6]).toUpperCase();
  if (ns === "S") lat = -Math.abs(lat);
  if (ew === "W") lng = -Math.abs(lng);
  if (!inRange(lat, lng)) return null;
  lat = Math.round(lat * 1e4) / 1e4;
  lng = Math.round(lng * 1e4) / 1e4;
  return { lat, lng, label: `${lat}, ${lng}` };
}

const two = (n) => (Math.round(n * 100) / 100).toFixed(2);

// A place-search answer (GET /api/geocode: { label, lat, lon }) as the
// page keeps it. lng is accepted too.
export function placeFromResult(result) {
  if (!result) return null;
  const lat = Number(result.lat);
  const lng = Number(result.lng ?? result.lon);
  if (!inRange(lat, lng)) return null;
  const label = text(result.label) || `${two(lat)}, ${two(lng)}`;
  return { lat, lng, label: label.slice(0, LIMITS.place) };
}

// Firebase answers these when Authentication is not switched on in the
// console; our server answers 503 accounts_off when it cannot check tokens.
const NOT_OPEN = new Set(["auth/configuration-not-found", "auth/operation-not-allowed", "auth/admin-restricted-operation"]);

export function isNotOpen(error) {
  if (!error) return false;
  if (NOT_OPEN.has(error.code)) return true;
  return error.code === "accounts_off" || error.status === 503;
}

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
// Sign in page shows "signin". width and height are the files' own.
export const PICTURES = {
  field: [
    {
      src: "/site/shots/field-fields-detail.webp",
      width: 1920,
      height: 1369,
      alt: "Field: a farm's fields outlined on the satellite map, Field 11 selected, with its water, plant health, stress and harvest readings",
      caption: "Each field, read after every clear pass",
    },
    { src: "/site/shots/field-data-960.webp", width: 960, height: 600, alt: "Field's data page: plant health since 2019 against the normal years", caption: "Plant health since 2019" },
    { src: "/site/shots/field-ai-960.webp", width: 960, height: 600, alt: "Field's assistant, with suggested questions about the farm", caption: "Ask what changed" },
    { src: "/site/shots/phone-field-fields.webp", width: 780, height: 1688, alt: "Field on a phone: the fields on the satellite map", caption: "On your phone", tall: true },
  ],
  atlas: [
    {
      src: "/site/shots/atlas-map-near-macro.webp",
      width: 1920,
      height: 1200,
      alt: "Atlas: Ukraine's oblasts filled and ranked by near-term priority, Mykolaiv, Kirovohrad and Poltava first",
      caption: "A whole region, ranked",
    },
    { src: "/site/shots/atlas-map-damage-micro-960.webp", width: 960, height: 600, alt: "Atlas: the damage layer of Ukraine, square by square", caption: "Damage, square by square" },
    { src: "/site/shots/atlas-overview-960.webp", width: 960, height: 600, alt: "Atlas's overview: cropland, black soil, heavy damage and people on damaged land", caption: "The month's figures" },
    { src: "/site/shots/atlas-report-960.webp", width: 960, height: 600, alt: "Atlas's donor report: the headline figures and the top ten areas", caption: "A donor report" },
  ],
  signin: [
    {
      src: "/site/shots/field-fields-detail.webp",
      width: 1920,
      height: 1369,
      alt: "Field: a farm's fields outlined on the satellite map, Field 11 selected, with its water, plant health, stress and harvest readings",
      caption: "Field: each field after the latest pass",
    },
    { src: "/site/shots/field-data-960.webp", width: 960, height: 600, alt: "Field's data page: plant health since 2019 against the normal years", caption: "Plant health since 2019" },
    { src: "/site/shots/field-ai-960.webp", width: 960, height: 600, alt: "Field's assistant, with suggested questions about the farm", caption: "Ask what changed" },
    { src: "/site/shots/atlas-map-near-macro-960.webp", width: 960, height: 600, alt: "Atlas: Ukraine's oblasts ranked for the near term", caption: "Atlas: a region, ranked" },
  ],
};
