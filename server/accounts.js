// WHAT THIS FILE DOES
// Registered accounts: a person who registered on the website (Google, or
// e-mail and password, through Firebase Authentication) gets a workspace
// of their own, fresh and separate from the shared demo and from every
// other account. The demo behind the access code is untouched.
//
// HOW IT WORKS
// The browser signs in with Firebase (src/lib/firebase.js) and gets an
// "ID token" from Google. It sends that token here once:
//
//   POST /api/auth/firebase  body { idToken }
//     The token is checked with Firebase's own library (firebase-admin):
//     who it is for (the project), that Google signed it, and that it has
//     not run out. The account's folder is made or opened (server/store.js
//     userRoot), its profile.json gets the e-mail and name from the token,
//     and the browser gets the account cookie (server/auth.js
//     accountCookie, 30 days; the access code's cookie, if any, is
//     removed: the latest sign-in wins). Answers { ok, account }.
//       401 bad_token      the token is not valid or has run out
//       503 accounts_off   accounts cannot work on this server (see below)
//
//   GET /api/account        { account, profile }   (server/app.js, signed in
//   PUT /api/account        the profile's fields    with an account only;
//                           -> { ok, account, profile }   else 401)
//
// account is always { uid, email, name, product, profileComplete }:
// product is "field" or "atlas" once chosen (null before), and
// profileComplete is true once the person has given a name and chosen a
// product. The pages send someone whose profile is not complete to the
// register page's last part.
//
// THE PROFILE (profile.json in the account's folder)
//   uid, email, emailVerified, provider   from the Firebase token
//   name            1 to 80 characters
//   age             a whole number from 13 to 120, or null
//   organization    up to 120 characters (the register page asks for it
//                   when Atlas is chosen; here it is not required)
//   role            farmer | landowner | government | ngo | research | other
//   product         field | atlas
//   country, address   up to 120 characters each
//   place           { lat, lng, label } the place to watch, or null
//   createdAt, updatedAt, signedInAt
// PUT checks every field and answers 400 with a plain sentence when one
// is wrong. Nothing here is secret: Google keeps the password.
//
// WHICH FIREBASE PROJECT
//   FIREBASE_PROJECT_ID in .env, else the Earth Engine project (the same
//   Google Cloud project, from its key or GEE_PROJECT_ID), else
//   "chernozem-danny". When the Earth Engine key is set, the library signs
//   in with it; else it only needs the project id (checking a token needs
//   no key: Google's public certificates do). FIREBASE_PROJECT_ID=off
//   switches accounts off. FIREBASE_AUTH_EMULATOR_HOST (one's own
//   computer, docs/DEPLOY.md "Accounts") makes the library use the local
//   emulator instead of Google.
// Accounts are "off" (503 accounts_off at sign-in) when FIREBASE_PROJECT_ID
// is "off", when the firebase-admin package is not installed on the
// server, or when the token cannot be checked for a reason other than
// the token itself (Google unreachable). The register page then says so.
//
// WHEN A COOKIE STOPS COUNTING (server/auth.js accountSession asks here)
//   signOutAccount(uid)   "Sign out": writes the moment into the account's
//                         session.json (every cookie made before it is
//                         nobody from then on) and, best-effort, ends the
//                         account's Firebase sessions (revokeRefreshTokens)
//   firebaseUserOk(uid)   whether the Firebase user still exists and is not
//                         disabled, asked of Firebase at most once an hour
//                         per account; a sign-in counts as "yes" for that
//                         hour. If Firebase cannot be asked (unreachable,
//                         or no Google key on this computer), the last
//                         answer stays good for a day, then the account
//                         must sign in again (a sign-in needs Firebase, so
//                         nothing stays open for ever during an outage).
//                         Deleted or disabled: "no" within the hour.
//
// FOR THE TESTS
//   setDepsForTests({ verifyIdToken, getUser, revokeRefreshTokens, now })
//     stand-ins for Firebase: verifyIdToken (idToken) -> the decoded token
//     { uid, email, name, ... } or a throw with code "auth/...";
//     getUser (uid) -> { uid, disabled } or a throw with code
//     "auth/user-not-found"; revokeRefreshTokens (uid); now () -> the
//     clock (ms) the once-an-hour check reads, to move time forward.
//     Forgets every answer kept so far.
//
// WHO EDITS IT
// Nobody, normally. The one-time Firebase console steps are in
// docs/DEPLOY.md ("Accounts").

import { HttpError, readJson, sendJson } from "./http.js";
import { config } from "./env.js";
import { getProfile, saveProfile, saveSessionFile, userRoot, withDataRoot } from "./store.js";
// (auth.js imports this file too; both only use each other inside
// functions, so the circle is harmless.)
import { accountCookie, deriveAccountSecret, installSalt, isUid, sessionCookie, signAccountSession } from "./auth.js";

export const DEFAULT_PROJECT_ID = "chernozem-danny";
export const ROLES = ["farmer", "landowner", "government", "ngo", "research", "other"];
export const PRODUCTS = ["field", "atlas"];
export const PROFILE_LIMITS = { name: 80, organization: 120, country: 120, address: 120, placeLabel: 200 };
export const AGE_RANGE = { min: 13, max: 120 };
// A Firebase ID token is a signed JSON text of about 1,000 to 2,000
// characters; anything far longer is not one.
const MAX_TOKEN_CHARS = 8192;
// How often Firebase is asked whether an account still exists (see the
// top of this file), how soon it is asked again after it could not answer,
// and how long the last answer stays good while it cannot.
export const USER_CHECK_MS = 60 * 60 * 1000;
export const USER_RETRY_MS = 5 * 60 * 1000;
export const USER_KEEP_MS = 24 * 60 * 60 * 1000;

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the one Firebase connection, the answers about accounts
// (users: uid -> { ok, answeredAt, askedAt }) and the tests' stand-ins.
const memory = (globalThis.__chernozemAccounts ??= { auth: null, verifyIdToken: null, getUser: null, revokeRefreshTokens: null, now: null, users: new Map() });
// (An older copy of this file may have made the memory without it.)
memory.users ??= new Map();

export function setDepsForTests({ verifyIdToken, getUser, revokeRefreshTokens, now } = {}) {
  const fn = (value) => (typeof value === "function" ? value : null);
  memory.verifyIdToken = fn(verifyIdToken);
  memory.getUser = fn(getUser);
  memory.revokeRefreshTokens = fn(revokeRefreshTokens);
  memory.now = fn(now);
  memory.auth = null;
  memory.users = new Map();
}

const clock = () => (memory.now ? memory.now() : Date.now());

const off = (message) => new HttpError(503, "accounts_off", message);
const bad = (message) => new HttpError(400, "bad_request", message);

// ---------- Settings ----------

// Why accounts cannot work on this server, or null when they can (as far
// as the settings say; the library may still be missing: firebaseAuth).
export function accountsProblem(env = config()) {
  const setting = String(env.firebaseProjectId || "").trim().toLowerCase();
  if (["off", "none", "0", "false", "no"].includes(setting)) {
    return "Registration is switched off on this server (FIREBASE_PROJECT_ID=off). Try the demo, or write to us.";
  }
  return null;
}

// The Firebase project whose sign-ins are accepted (see the top of this
// file); null when accounts are off.
export function firebaseProjectId(env = config()) {
  if (accountsProblem(env)) return null;
  return env.firebaseProjectId || env.geeProjectId || DEFAULT_PROJECT_ID;
}

// Firebase's own library, set up once. Throws 503 accounts_off when it
// cannot be.
async function firebaseAuth() {
  if (memory.auth) return memory.auth;
  const env = config();
  const problem = accountsProblem(env);
  if (problem) throw off(problem);
  let appModule;
  let authModule;
  try {
    appModule = await import("firebase-admin/app");
    authModule = await import("firebase-admin/auth");
  } catch (error) {
    console.error(`[chernozem] Registration is not open: the firebase-admin package cannot be loaded (${error.message}). Whoever runs the server: npm install firebase-admin, then restart.`);
    throw off("Registration is not open yet on this server. Try the demo, or write to us.");
  }
  const projectId = firebaseProjectId(env);
  const options = env.geeCredentials ? { credential: appModule.cert(env.geeCredentials), projectId } : { projectId };
  const name = "chernozem-accounts";
  const app = appModule.getApps().find((other) => other.name === name) || appModule.initializeApp(options, name);
  memory.auth = authModule.getAuth(app);
  return memory.auth;
}

// The decoded token ({ uid, email, name, email_verified, firebase: {
// sign_in_provider } ...) when Firebase vouches for it. 401 bad_token when
// the token itself is wrong or old; 503 accounts_off when it could not be
// checked at all.
async function checkedToken(idToken) {
  try {
    if (memory.verifyIdToken) return await memory.verifyIdToken(idToken);
    const auth = await firebaseAuth();
    return await auth.verifyIdToken(idToken);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (String(error?.code || "").startsWith("auth/")) {
      throw new HttpError(401, "bad_token", "That sign-in is not valid or has run out. Sign in again.");
    }
    console.error("[chernozem] A Firebase sign-in could not be checked:", error);
    throw off("Registration is not open right now: the sign-in could not be checked with Firebase. Try again in a few minutes.");
  }
}

// ---------- Whether an account still exists, and signing out ----------
// (See "WHEN A COOKIE STOPS COUNTING" at the top of this file.)

// A sign-in is Firebase's own word that the account exists now: it counts
// as this hour's answer.
function noteSignedIn(uid) {
  const now = clock();
  memory.users.set(uid, { ok: true, answeredAt: now, askedAt: now });
}

// True while the Firebase user exists and is not disabled, as far as the
// server knows (asked at most once an hour; see the top of this file).
export async function firebaseUserOk(uid) {
  const now = clock();
  const known = memory.users.get(uid);
  if (known) {
    // A real answer is good for an hour; after a failed ask, ask again sooner.
    const wait = known.answeredAt === known.askedAt ? USER_CHECK_MS : USER_RETRY_MS;
    if (now - known.askedAt < wait) return known.ok;
  }
  let next;
  try {
    const user = memory.getUser ? await memory.getUser(uid) : await (await firebaseAuth()).getUser(uid);
    next = { ok: Boolean(user) && !user.disabled, answeredAt: now, askedAt: now };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      next = { ok: false, answeredAt: now, askedAt: now };
    } else {
      // Firebase could not be asked. The last answer (or, with none since
      // the server started, the signed cookie itself) stays good for a day
      // from the last answer, then the account must sign in again.
      const answeredAt = known?.answeredAt ?? now;
      const ok = now - answeredAt < USER_KEEP_MS ? known?.ok ?? true : false;
      next = { ok, answeredAt, askedAt: now };
      if (!memory.warnedUserCheck) {
        memory.warnedUserCheck = true;
        console.warn(`[chernozem] Could not ask Firebase whether an account still exists (${error.message}). The last answer stays good for a day. Said once.`);
      }
    }
  }
  memory.users.set(uid, next);
  return next.ok;
}

// Ends the account's Firebase sessions (its refresh tokens), best-effort:
// a failure is logged once and never stops the sign-out.
async function revokeFirebaseSessions(uid) {
  try {
    if (memory.revokeRefreshTokens) await memory.revokeRefreshTokens(uid);
    else await (await firebaseAuth()).revokeRefreshTokens(uid);
  } catch (error) {
    if (memory.warnedRevoke) return;
    memory.warnedRevoke = true;
    console.warn(`[chernozem] Could not end an account's Firebase sessions at sign-out (${error.message}); its cookies are ended all the same. Said once.`);
  }
}

// "Sign out" for a registered account (server/auth.js handleAuth): from
// this moment every cookie made for the account before it is nobody.
export async function signOutAccount(uid) {
  if (!isUid(uid)) return;
  const now = new Date().toISOString();
  await withDataRoot(userRoot(uid), () => saveSessionFile({ sessionsValidFrom: now }));
  await revokeFirebaseSessions(uid);
}

// ---------- The profile ----------

function emptyProfile() {
  return {
    uid: null,
    email: null,
    emailVerified: false,
    provider: null,
    name: "",
    age: null,
    organization: "",
    role: null,
    product: null,
    country: "",
    address: "",
    place: null,
    createdAt: null,
    updatedAt: null,
    signedInAt: null,
  };
}

// One line of text, trimmed, at most `max` characters; "" when it is not
// text. (Not for the fields PUT checks: those refuse what is too long.)
function oneLine(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanEmail(value) {
  const email = typeof value === "string" ? value.trim().slice(0, 200) : "";
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// What the pages get about an account: { uid, email, name, product,
// profileComplete }. profile may be null (the folder was emptied).
export function accountSummary(uid, profile) {
  const name = typeof profile?.name === "string" ? profile.name : "";
  const product = PRODUCTS.includes(profile?.product) ? profile.product : null;
  return { uid, email: profile?.email || null, name, product, profileComplete: Boolean(name && product) };
}

// A text field of the profile: a string up to `max` characters (whitespace
// made plain), or "" when it is missing. Throws 400 when it is too long or
// not text.
function textField(body, field, max) {
  const value = body[field];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw bad(`${label(field)} must be text.`);
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length > max) throw bad(`${label(field)} can be ${max} characters at most.`);
  return clean;
}

const LABELS = { name: "The name", organization: "The organization", country: "The country", address: "The address" };
const label = (field) => LABELS[field] || field;

// The profile fields a PUT /api/account may set, checked (see the top of
// this file). Throws 400 with a plain sentence.
export function checkProfileChanges(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("Send the profile as an object, like { name, role, product }.");
  const name = textField(body, "name", PROFILE_LIMITS.name);
  if (!name) throw bad("Enter your name.");

  let age = null;
  if (body.age !== undefined && body.age !== null && body.age !== "") {
    const number = typeof body.age === "number" ? body.age : typeof body.age === "string" && body.age.trim() !== "" ? Number(body.age) : NaN;
    if (!Number.isInteger(number) || number < AGE_RANGE.min || number > AGE_RANGE.max) {
      throw bad(`The age must be a whole number from ${AGE_RANGE.min} to ${AGE_RANGE.max}, or left blank.`);
    }
    age = number;
  }

  if (!ROLES.includes(body.role)) throw bad(`Choose who you are: ${ROLES.join(", ")}.`);
  if (!PRODUCTS.includes(body.product)) throw bad('Choose a product: "field" (a farm) or "atlas" (a region).');

  let place = null;
  if (body.place !== undefined && body.place !== null) {
    const given = body.place;
    if (!given || typeof given !== "object" || Array.isArray(given)) throw bad("The place must be { lat, lng, label }, or left out.");
    const lat = Number(given.lat);
    const lng = Number(given.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw bad("The place's latitude must be a number from -90 to 90.");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw bad("The place's longitude must be a number from -180 to 180.");
    const placeLabel = given.label === undefined || given.label === null ? "" : given.label;
    if (typeof placeLabel !== "string") throw bad("The place's label must be text.");
    if (placeLabel.length > PROFILE_LIMITS.placeLabel) throw bad(`The place's label can be ${PROFILE_LIMITS.placeLabel} characters at most.`);
    place = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label: placeLabel.replace(/\s+/g, " ").trim() };
  }

  return {
    name,
    age,
    organization: textField(body, "organization", PROFILE_LIMITS.organization),
    role: body.role,
    product: body.product,
    country: textField(body, "country", PROFILE_LIMITS.country),
    address: textField(body, "address", PROFILE_LIMITS.address),
    place,
  };
}

// The profile as the pages get it (every field present, nothing secret).
function publicProfile(uid, profile) {
  return { ...emptyProfile(), ...(profile || {}), uid };
}

// ---------- Routes ----------

// POST /api/auth/firebase (called by server/auth.js handleAuth).
export async function handleFirebaseSignIn(req, res) {
  const body = await readJson(req);
  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
  if (!idToken || idToken.length > MAX_TOKEN_CHARS) throw bad("Send the Firebase sign-in token as { idToken }.");
  const decoded = await checkedToken(idToken);
  const uid = decoded?.uid || decoded?.sub;
  if (!isUid(uid)) throw new HttpError(401, "bad_token", "That sign-in is not valid. Sign in again.");

  const now = new Date().toISOString();
  const profile = await withDataRoot(userRoot(uid), async () => {
    const saved = (await getProfile()) || {};
    const next = {
      ...emptyProfile(),
      ...saved,
      uid,
      // The e-mail Google vouches for; an older one stays if the token has
      // none (a phone sign-in, say).
      email: cleanEmail(decoded.email) || saved.email || null,
      emailVerified: Boolean(decoded.email_verified),
      provider: oneLine(decoded.firebase?.sign_in_provider, 40) || saved.provider || null,
      // The name the person typed on the register page wins over Google's.
      name: typeof saved.name === "string" && saved.name ? saved.name : oneLine(decoded.name, PROFILE_LIMITS.name),
      createdAt: saved.createdAt || now,
      signedInAt: now,
    };
    return saveProfile(next);
  });

  noteSignedIn(uid);
  const token = signAccountSession(deriveAccountSecret(await installSalt()), uid);
  // This browser is the account from now on; the access code's cookie, if
  // it had one, goes (server/auth.js prefers the account cookie).
  res.setHeader("Set-Cookie", [accountCookie(req, token), sessionCookie(req, "", 0)]);
  sendJson(res, 200, { ok: true, account: accountSummary(uid, profile) });
}

// GET and PUT /api/account (called by server/app.js inside the account's
// folder). session: what server/auth.js handleAuth gave back.
export async function handleAccountRoutes(req, res, { method, parts, pathname, session }) {
  if (parts.length > 1) throw new HttpError(404, "not_found", `No such API route: ${pathname}`);
  if (!session || session.kind !== "account") throw new HttpError(401, "auth_required", "Sign in to your account first.");
  const { uid } = session.account;

  if (method === "GET") {
    const profile = await getProfile();
    return sendJson(res, 200, { account: accountSummary(uid, profile), profile: publicProfile(uid, profile) });
  }
  if (method === "PUT") {
    const changes = checkProfileChanges(await readJson(req));
    const saved = (await getProfile()) || {};
    const now = new Date().toISOString();
    const profile = await saveProfile({ ...emptyProfile(), ...saved, ...changes, uid, createdAt: saved.createdAt || now, updatedAt: now });
    return sendJson(res, 200, { ok: true, account: accountSummary(uid, profile), profile: publicProfile(uid, profile) });
  }
  res.setHeader("Allow", "GET, PUT");
  throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${pathname}.`);
}
