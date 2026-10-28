// WHAT THIS FILE DOES
// How the website's Register and Sign in pages (src/site/pages/) talk to
// the server about accounts (server/accounts.js). The browser sends the
// account cookie by itself, so nothing here handles it.
//
//   postFirebaseToken(idToken)   POST /api/auth/firebase { idToken }
//                                -> { ok, account }. The server checks the
//                                token with Firebase and sets the account
//                                cookie (30 days). 401 bad_token when the
//                                token is not good; 503 accounts_off when
//                                the server cannot check tokens at all.
//   getAccount()                 GET /api/account -> { account, profile }
//                                (401 auth_required without an account)
//   putAccount(profile)          PUT /api/account { name, age?, organization?,
//                                role, product, country?, address?, place? }
//                                -> { ok, account, profile }
//   logoutEverywhere()           POST /api/auth/logout -> { ok }: removes
//                                the account cookie and the demo's code
//                                cookie. (Firebase's own sign-out is done
//                                by the page, with firebase/auth.)
//   searchPlace(q)               GET /api/geocode?q= -> { results: [{ label,
//                                lat, lon }] }: the place a person wants to
//                                watch. The route is behind the sign-in, so
//                                it answers 401 until the account cookie is
//                                set.
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

export const postFirebaseToken = (idToken) => request("POST", "/auth/firebase", { idToken });

export const getAccount = () => request("GET", "/account");

export const putAccount = (profile) => request("PUT", "/account", profile || {});

export const logoutEverywhere = () => request("POST", "/auth/logout", {});

export const searchPlace = (q) => request("GET", `/geocode?q=${encodeURIComponent(String(q || "").slice(0, 160))}`);
