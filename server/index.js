// WHAT THIS FILE DOES
// The production server ("npm start"): one program that serves the built
// app from dist/ (made by "npm run build") and answers /api/ requests
// (what it does with each request, and the safety headers on every
// answer, are in server/web.js). It also runs the monthly auto-analysis.
//
// Port: PORT in .env (default 8787). Open http://localhost:8787
// Address: HOST in .env. Without an access code (ATLAS_ACCESS_CODE) it
// only answers this computer (127.0.0.1); with one it answers the whole
// network (0.0.0.0), so officials can reach it once they have the code.
// Online (https://chernozem.app on Render, docs/DEPLOY.md) Render sets
// PORT, and render.yaml the data folder (CHERNOZEM_DATA_DIR). There it
// refuses to start, with the reason in the log, when the access code is
// missing, short or the docs' example, or when the data folder is not the
// disk (server/online.js): the new version then never goes live.
//
// Idle connections are kept open for 125 seconds (Node's default is 5):
// Render's proxy is reported to reuse a connection for up to 120 seconds,
// and a request it sends on one this server has just closed fails with a
// random 502 error (Render's troubleshooting page, "502 errors": raise
// keepAliveTimeout and headersTimeout).
//
// When the host stops the server (a new version going live), the monthly
// check's locks are let go first, so the new copy can start it at once.
//
// WHO EDITS IT
// Nobody, normally.

import http from "node:http";
import { config } from "./env.js";
import { createHandler } from "./web.js";
import { startScheduler } from "./scheduler.js";
import { warmWorldFeed } from "./world/index.js";
import { accessCode } from "./auth.js";
import { accountsProblem, firebaseProjectId } from "./accounts.js";
import { startProblems } from "./online.js";
import { baseDataDir, releaseLock } from "./store.js";

const KEEP_ALIVE_MS = 125 * 1000;

const problems = startProblems();
if (problems.length) {
  // Written out in full before the program ends.
  const text = `[chernozem] Not starting online:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`;
  process.stderr.write(text, () => process.exit(1));
} else {
  start();
}

function start() {
  const server = http.createServer({ keepAliveTimeout: KEEP_ALIVE_MS, headersTimeout: KEEP_ALIVE_MS + 1000 }, createHandler());

  const port = config().port;
  const protectedByCode = Boolean(accessCode());
  const host = (process.env.HOST || "").trim() || (protectedByCode ? "0.0.0.0" : "127.0.0.1");
  const everywhere = host === "0.0.0.0" || host === "::";
  server.listen(port, host, () => {
    const shown = host.includes(":") ? `[${host}]` : host;
    console.log(`Chernozem Atlas is running at http://${shown}:${port}`);
    if (everywhere) console.log(`  (open to the network; on this computer use http://localhost:${port})`);
    if (protectedByCode) console.log("  Access code: on (ATLAS_ACCESS_CODE). Visitors must enter it first.");
    else if (everywhere) console.log("  Warning: no access code is set, so anyone on the network can use the app. Set ATLAS_ACCESS_CODE in .env.");
    else console.log("  Access code: off (only this computer can open the app).");
    // The shared demo's folder; registered accounts' folders are under
    // its users/ (server/store.js).
    console.log(`  Data folder: ${baseDataDir()}`);
    const accountsOff = accountsProblem();
    if (accountsOff) console.log("  Accounts: off (FIREBASE_PROJECT_ID=off).");
    else console.log(`  Accounts: Firebase project ${firebaseProjectId()} (each account's data under users/ in the data folder).`);
    startScheduler();
    // The website's globe feed (GDACS) is fetched now, so the first visitor
    // after a start does not wait for it; it never throws.
    warmWorldFeed();
  });

  // Stopping (Control + C here, or the host replacing this copy): let go of
  // the monthly check's locks (the shared demo's; an account's stale lock
  // is taken over by the next check), then end.
  let stopping = false;
  async function stop(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`[chernozem] Stopping (${signal}).`);
    server.close();
    // Never wait long: the host stops the program anyway.
    const timer = setTimeout(() => process.exit(0), 3000);
    timer.unref?.();
    await Promise.allSettled([releaseLock("scheduler"), releaseLock("field-scheduler")]);
    process.exit(0);
  }
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}
