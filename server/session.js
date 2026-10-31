// WHAT THIS FILE DOES
// Remembers, while one request is being answered, who is asking: the
// session server/auth.js worked out for it (the owner, "open" on one's own
// computer, a registered account, or the public demo). server/app.js opens
// this scope once per request (withSession), and any server file can then
// ask isDemoSession() without being handed the session. The guards that
// keep the public demo read-only and free of Earth Engine work ask it:
// server/soil.js and server/units.js (saved answers only), server/jobs.js
// (no job is ever started for the demo), server/field/routes.js (no
// GeoTIFF, a limited place search, a throttled weather refresh) and
// server/ai/chat.js (the demo's assistant keeps its chats in memory).
//
//   withSession(session, work)  runs work() inside this request's session
//   outsideSession(work)        runs work() as nobody's (the monthly check
//                               uses it, so a check that happens to start
//                               during a demo visitor's request is never
//                               taken for the demo's)
//   currentSession()            the session being answered, or null (a
//                               background job, the monthly check, a test)
//   isDemoSession()             true while answering the public demo
//   DEMO_READ_ONLY_MESSAGE      the sentence every change tried in the
//   demoReadOnly(message?)      demo gets back: 403 demo_read_only
//
// The scope follows the awaits, like server/store.js withDataRoot.
//
// WHO EDITS IT
// Nobody, normally. The words of the refusal are the owner's (the
// website's brief); the pages show them with a Register button.

import { AsyncLocalStorage } from "node:async_hooks";
import { HttpError } from "./http.js";

export const DEMO_READ_ONLY_MESSAGE = "This is the demo, so it can't be changed. Register to do this on your own land.";

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps one scope for every copy of the server's files.
const scope = (globalThis.__chernozemSessionScope ??= new AsyncLocalStorage());

export function withSession(session, work) {
  return scope.run(session || null, work);
}

export function outsideSession(work) {
  return scope.exit(work);
}

export function currentSession() {
  return scope.getStore() || null;
}

export function isDemoSession() {
  return currentSession()?.readOnly === true;
}

// The refusal for anything the demo may not do (403 demo_read_only). A
// download the demo cannot make passes its own sentence.
export function demoReadOnly(message = DEMO_READ_ONLY_MESSAGE) {
  return new HttpError(403, "demo_read_only", message);
}
