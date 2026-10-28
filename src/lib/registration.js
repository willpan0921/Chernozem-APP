// WHAT THIS FILE DOES
// The rules of the website's Register and Sign in pages
// (src/site/pages/RegisterPage.jsx, SignInPage.jsx), kept here as plain
// functions with no screen attached, so they can be tested:
//
//   ROLES                          the two big choices ("who are you?"):
//                                  farmer -> Field, organisation -> Atlas
//   KINDS                          the exact role the server keeps, per
//                                  product (server/accounts.js ROLES):
//                                  field: farmer, landowner; atlas:
//                                  government, ngo, research, other
//   LIMITS                         how long each answer may be (the same
//                                  numbers as server/accounts.js)
//   productForRole(role)           a choice or a server role -> "field" |
//                                  "atlas" | null
//   roleForProduct(product)        the choice for a product ("farmer" or
//                                  "organisation"), for ?product=field
//   emailProblem(email)            "" when the e-mail looks right, else what
//                                  is wrong, in plain words
//   passwordProblem(pw, repeat)    "" when the password is long enough and
//                                  the repeat matches
//   validateProfile(fields)        { ok, problems: { field: message } } for
//                                  the "About you" form
//   profileForServer(fields)       the same answers, cleaned, in the shape
//                                  PUT /api/account expects
//   nextStep(status, firebaseUser) which part of the Register page to show
//   parsePlace(text)               "49.71, 37.62" -> { lat, lng, label } or
//                                  null when the text is not coordinates
//   placeFromResult(result)        a place-search answer -> { lat, lng, label }
//   placeOffer(result)             "Use: Kupiansk, Kharkiv, Ukraine (49.71, 37.62)"
//   firebaseProblem(error)         a Firebase or server error -> which field
//                                  it belongs to and what to say
//   isNotOpen(error)               true when registration is not switched on
//                                  (Firebase or our server says so)
//
// WHO EDITS IT
// Whoever changes what the Register page asks or how it answers. Keep
// registration.test.js passing, and the limits equal to the server's.

// The two big choices. The choice decides the product: a farmer gets
// Field, an organisation gets Atlas.
export const ROLES = {
  farmer: {
    product: "field",
    title: "A farmer or landowner",
    text: "Chernozem Field: your own fields, every pass",
  },
  organisation: {
    product: "atlas",
    title: "An organisation: government, NGO, research",
    text: "Chernozem Atlas: a whole region, ranked",
  },
};

// The exact role the server keeps (server/accounts.js ROLES), by product.
export const KINDS = {
  field: [
    { role: "farmer", label: "A farmer" },
    { role: "landowner", label: "A landowner" },
  ],
  atlas: [
    { role: "government", label: "Government" },
    { role: "ngo", label: "NGO" },
    { role: "research", label: "Research" },
    { role: "other", label: "Other" },
  ],
};

// How long each answer may be. Every limit is also said beside its field.
export const LIMITS = {
  name: 80,
  email: 120,
  organization: 120,
  country: 120,
  address: 120,
  place: 160,
  password: { min: 8, max: 200 },
  age: { min: 13, max: 120 },
};

export function productForRole(role) {
  if (ROLES[role]) return ROLES[role].product;
  for (const [product, kinds] of Object.entries(KINDS)) if (kinds.some((kind) => kind.role === role)) return product;
  return null;
}

export function roleForProduct(product) {
  const found = Object.entries(ROLES).find(([, role]) => role.product === product);
  return found ? found[0] : null;
}

const text = (value) => (typeof value === "string" ? value.trim() : "");

// Good enough to catch a missing @ or a space; Firebase and the mail
// server have the last word.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailProblem(email) {
  const value = text(email);
  if (!value) return "Enter your e-mail address.";
  if (value.length > LIMITS.email) return `Keep the e-mail under ${LIMITS.email} characters.`;
  if (!EMAIL_SHAPE.test(value)) return "That e-mail address does not look right.";
  return "";
}

// repeat: leave it out (undefined) when there is no repeat field, as on the
// Sign in page.
export function passwordProblem(password, repeat) {
  const value = typeof password === "string" ? password : "";
  if (!value) return "Enter a password.";
  if (value.length < LIMITS.password.min) return `Use ${LIMITS.password.min} characters or more.`;
  if (value.length > LIMITS.password.max) return `Keep the password under ${LIMITS.password.max} characters.`;
  if (repeat !== undefined) {
    if (!repeat) return "Repeat the password.";
    if (repeat !== value) return "The passwords do not match.";
  }
  return "";
}

function ageProblem(age) {
  const value = text(age === undefined || age === null ? "" : String(age));
  if (!value) return "";
  if (!/^\d{1,3}$/.test(value)) return `Age is a whole number from ${LIMITS.age.min} to ${LIMITS.age.max}.`;
  const n = Number(value);
  if (n < LIMITS.age.min || n > LIMITS.age.max) return `Age is a whole number from ${LIMITS.age.min} to ${LIMITS.age.max}.`;
  return "";
}

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// fields: { role, product?, name, email, age?, organization?, country?,
// address?, place? }. role is the server's exact role (KINDS); product is
// taken from it when left out. A big choice alone ("farmer",
// "organisation") gives the product but still needs its kind.
export function validateProfile(fields = {}) {
  const problems = {};
  const product = fields.product || productForRole(fields.role);
  if (product !== "field" && product !== "atlas") problems.role = "Choose who you are.";
  else if (!KINDS[product].some((kind) => kind.role === fields.role)) {
    problems.kind = product === "atlas" ? "Say what kind of organisation." : "Farmer or landowner?";
  }

  const name = text(fields.name);
  if (!name) problems.name = "Enter your name.";
  else if (name.length > LIMITS.name) problems.name = `Keep your name under ${LIMITS.name} characters.`;

  const email = emailProblem(fields.email);
  if (email) problems.email = email;

  const age = ageProblem(fields.age);
  if (age) problems.age = age;

  const organization = text(fields.organization);
  if (product === "atlas" && !organization) problems.organization = "Name your organisation.";
  else if (organization.length > LIMITS.organization) problems.organization = `Keep the organisation under ${LIMITS.organization} characters.`;

  if (text(fields.country).length > LIMITS.country) problems.country = `Keep the country under ${LIMITS.country} characters.`;
  if (text(fields.address).length > LIMITS.address) problems.address = `Keep the town or address under ${LIMITS.address} characters.`;

  const place = fields.place;
  if (place && (!inRange(Number(place.lat), Number(place.lng)) || !text(place.label))) problems.place = "That place has no coordinates.";

  return { ok: Object.keys(problems).length === 0, problems };
}

// The cleaned answers for PUT /api/account. Empty optional answers are
// left out rather than sent as "".
export function profileForServer(fields = {}) {
  const product = fields.product || productForRole(fields.role);
  const body = { name: text(fields.name), role: fields.role || "", product };
  const age = text(fields.age === undefined || fields.age === null ? "" : String(fields.age));
  if (age) body.age = Number(age);
  for (const key of ["organization", "country", "address"]) {
    const value = text(fields[key]);
    if (value) body[key] = value;
  }
  if (fields.place && inRange(Number(fields.place.lat), Number(fields.place.lng))) {
    body.place = { lat: Number(fields.place.lat), lng: Number(fields.place.lng), label: text(fields.place.label) };
  }
  return body;
}

// status: the answer of GET /api/auth/status ({ account: null | { profileComplete } }).
// firebaseUser: the user Firebase has on this browser, or null.
//   "done"     the account exists and the profile is complete
//   "profile"  the account cookie is set; the "About you" form is next
//   "token"    Firebase knows the person but our server does not yet:
//              post the ID token, then the profile
//   "account"  nothing yet: pick a role and make the account
export function nextStep(status, firebaseUser) {
  const account = status?.account;
  if (account?.profileComplete) return "done";
  if (account) return "profile";
  if (firebaseUser) return "token";
  return "account";
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

export function placeOffer(result) {
  const place = placeFromResult(result);
  if (!place) return "";
  return `Use: ${place.label} (${two(place.lat)}, ${two(place.lng)})`;
}

// Firebase answers these when Authentication is not switched on in the
// console; our server answers 503 accounts_off when it cannot check tokens.
const NOT_OPEN = new Set(["auth/configuration-not-found", "auth/operation-not-allowed", "auth/admin-restricted-operation"]);

export function isNotOpen(error) {
  if (!error) return false;
  if (NOT_OPEN.has(error.code)) return true;
  return error.code === "accounts_off" || error.status === 503;
}

const FIREBASE_WORDS = {
  "auth/email-already-in-use": ["email", "That e-mail already has an account; sign in instead."],
  "auth/invalid-email": ["email", "That e-mail address does not look right."],
  "auth/missing-email": ["email", "Enter your e-mail address."],
  "auth/weak-password": ["password", `Use ${LIMITS.password.min} characters or more.`],
  "auth/missing-password": ["password", "Enter a password."],
  "auth/wrong-password": ["password", "That e-mail and password do not match."],
  "auth/user-not-found": ["password", "That e-mail and password do not match."],
  "auth/invalid-credential": ["password", "That e-mail and password do not match."],
  "auth/invalid-login-credentials": ["password", "That e-mail and password do not match."],
  "auth/user-disabled": ["form", "This account has been switched off. Write to us if that is a mistake."],
  "auth/too-many-requests": ["form", "Too many attempts. Wait a few minutes and try again."],
  "auth/popup-closed-by-user": ["form", "The Google window was closed before you signed in. Try again."],
  "auth/cancelled-popup-request": ["form", "The Google window was closed before you signed in. Try again."],
  "auth/popup-blocked": ["form", "The browser blocked the Google window. Allow pop-ups for this site and try again."],
  "auth/network-request-failed": ["form", "Could not reach Google to sign in. Check your connection and try again."],
  "auth/account-exists-with-different-credential": ["email", "That e-mail already has an account; sign in instead."],
  bad_token: ["form", "The sign-in could not be checked by our server. Try again."],
};

// -> { field: "email" | "password" | "form" | "closed", message }
export function firebaseProblem(error) {
  if (isNotOpen(error)) return { field: "closed", message: "Registration is not open yet." };
  const code = error?.code || "";
  const known = FIREBASE_WORDS[code];
  if (known) return { field: known[0], message: known[1] };
  if (code === "offline" || error?.status === 0) {
    return { field: "form", message: error?.message || "Could not reach the server. Check your connection and try again." };
  }
  const detail = code ? ` (${code.replace(/^auth\//, "")})` : "";
  return { field: "form", message: `Something went wrong${detail}. Try again.` };
}
