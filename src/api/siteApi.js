// WHAT THIS FILE DOES
// How the public website pages (src/site/, open to everyone, no sign-in)
// talk to the server. One function so far:
//
//   sendContact({ name, email, organization?, role?, message, website? })
//     POST /api/contact (server/messages.js) -> { ok: true, id }
//     The server keeps the message and e-mails it to
//     chernozem.app@gmail.com (CONTACT_EMAIL in src/site/content/site.js;
//     server/mail.js); one that could not be sent yet is tried again
//     later, so none is lost. Throws an Error
//     whose message is the server's own words ("Enter your name.", "Too
//     many messages in a row. Try again in 42 minutes."), with error.code
//     ("bad_request", "too_many", "too_large", "offline"...) and
//     error.status (the HTTP status; 0 when the server could not be
//     reached).
//     "role" is who the visitor says they are ("Farmer"...; 60 characters
//     at most). "website" is the form's hidden honeypot field: send it
//     along as it is (empty for people; a robot that fills it is told ok
//     and ignored).
//
// Nothing here imports the app's own requests (src/api/atlasApi.js) or the
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
