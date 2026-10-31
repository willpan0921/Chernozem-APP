// WHAT THIS FILE DOES
// How the website's Register, Sign in and owner pages (src/site/pages/)
// talk to the server about accounts (server/accounts.js). The browser sends
// the account cookie by itself, so nothing here handles it.
//
//   getStatus()                  GET /api/auth/status -> { required,
//                                signedIn, shared, account, mode, readOnly }:
//                                who this browser is. account is null, or
//                                { uid, email, name, product,
//                                profileComplete } for a registered account
//                                (with owner: true for the owner, whose
//                                mode is "owner").
//   postFirebaseToken(idToken)   POST /api/auth/firebase { idToken }
//                                -> { ok, account }. The server checks the
//                                token with Firebase and sets the account
//                                cookie (30 days). 401 bad_token when the
//                                token is not good; 503 accounts_off when
//                                the server cannot check tokens at all.
//   getAccount()                 GET /api/account -> { account, profile }
//                                (401 auth_required without an account)
//   putAccount(profile)          PUT /api/account { name, product, role,
//                                organization? } -> { ok, account, profile }
//                                (the Register page sends these four; the
//                                place is asked later, by the product's own
//                                setup)
//   logoutEverywhere()           POST /api/auth/logout -> { ok }: ends the
//                                sign-in on the server. Firebase's own
//                                sign-out is done by the page, with
//                                firebase/auth.
//
// None of these sends the demo's "X-Chernozem-View: demo" header
// (src/lib/demoMode.js): these pages are about the person's own account,
// even in a browser tab that was looking at the public demo, so the server
// answers about the account, never about the demo.
//
// Every function gives back the server's answer, or throws an Error whose
// message is the server's own words, with error.code ("bad_token",
// "accounts_off", "auth_required", "offline"...) and error.status (the
// HTTP status; 0 when the server could not be reached). The same shape as
// src/api/siteApi.js, and nothing here imports the app's own API files,
// so the website stays light.
//
// WHO EDITS IT
// Whoever adds an account route to server/accounts.js.

// The server answers on the same site, in development (the Vite dev server
// passes /api/ on) and in production (server/index.js).
const API_ROOT = "/api";

function failure(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin", // sends the account cookie
    });
  } catch {
    throw failure("Could not reach the server. Check your connection and try again.", "offline", 0);
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    // Not JSON: the generic message below.
  }
  if (!response.ok) {
    const message = json?.error?.message || `The server answered with error ${response.status}.`;
    throw failure(message, json?.error?.code || "error", response.status);
  }
  return json || { ok: true };
}

export const getStatus = () => request("GET", "/auth/status");

export const postFirebaseToken = (idToken) => request("POST", "/auth/firebase", { idToken });

export const getAccount = () => request("GET", "/account");

export const putAccount = (profile) => request("PUT", "/account", profile || {});

export const logoutEverywhere = () => request("POST", "/auth/logout", {});
