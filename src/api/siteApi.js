// WHAT THIS FILE DOES
// How the public website pages (src/site/, the ones that need no access
// code) talk to the server. One function so far:
//
//   sendContact({ name, email, organization?, message, website? })
//     POST /api/contact (server/messages.js) -> { ok: true, id }
//     The message is kept on the server for the owner to read in Atlas >
//     Settings; no e-mail is sent. Throws an Error whose message is the
//     server's own words ("Enter your name.", "Too many messages in a
//     row. Try again in 42 minutes."), with error.code ("bad_request",
//     "too_many", "too_large", "offline"...) and error.status (the HTTP
//     status; 0 when the server could not be reached).
//     "website" is the form's hidden honeypot field: send it along as it
//     is (empty for people; a robot that fills it is told ok and ignored).
//
// Nothing here imports the Atlas pages' code (src/api/atlasApi.js) or the
// sign-in cookie handling, so the website stays light.
//
// WHO EDITS IT
// Whoever adds a public route to server/app.js.

// The server answers on the same site, in development (the Vite dev server
// passes /api/ on) and in production (server/index.js).
const CONTACT_URL = "/api/contact";

function failure(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function sendContact(body) {
  let response;
  try {
    response = await fetch(CONTACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      cache: "no-store",
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
