// WHAT THIS FILE DOES
// The public website's world feed: GET /api/world/crises answers with the
// wars and natural disasters touching farmland right now, for the globe on
// the About page. Open to anyone, no access code, cached for an hour.
// (Filled in by the world-feed work; this stub answers "not ready".)
//
// WHO EDITS IT
// Whoever changes the globe's data.

import { sendError } from "../http.js";

export async function handleWorld(req, res) {
  sendError(res, 503, "not_ready", "The world feed is not built yet.");
  return true;
}
