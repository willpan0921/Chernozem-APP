// WHAT THIS FILE DOES
// The production server ("npm start"): one program that serves the built
// app from dist/ (made by "npm run build") and answers /api/ requests
// (what it does with each request, and the safety headers on every
// answer, are in server/web.js). It also runs the monthly auto-analysis,
// and tries again, every 10 minutes, to e-mail the contact messages that
// could not be sent yet (server/messages.js startMailRetry).
//
// Port: PORT in .env (default 8787). Open http://localhost:8787
// Address: HOST in .env. On one's own computer without ATLAS_ACCESS_CODE
// everyone who reaches it may change everything ("open"), so it only
// answers this computer (127.0.0.1); online (on Render), or with
// ATLAS_ACCESS_CODE set, visitors see the read-only public demo and the
// owner signs in with Google at /owner (server/auth.js), so it answers the
// whole network (0.0.0.0).
// Online (https://chernozem.app on Render, docs/DEPLOY.md) Render sets
// PORT, and render.yaml the data folder (CHERNOZEM_DATA_DIR). There it
// refuses to start, with the reason in the log, when the data folder is
// not the disk (server/online.js): the new version then never goes live.
//
// The limits' counts (the AI assistant's questions and tokens, the contact
// form's messages and e-mails: server/counters.js) are written to the data
// folder when the server stops, so a new version goes on counting.
//
// Idle connections are kept open for 125 seconds (Node's default is 5):
// Render's proxy is reported to reuse a connection for up to 120 seconds,
// and a request it sends on one this server has just closed fails with a
// random 502 error (Render's troubleshooting page, "502 errors": raise
// keepAliveTimeout and headersTimeout).
//
// When the host stops the server (a new version going live), the limits'
// counts are written and the monthly check's locks are let go first, so
// the new copy goes on counting and can start the check at once.
//
// WHO EDITS IT
// Nobody, normally.

import http from "node:http";
import { config } from "./env.js";
import { createHandler } from "./web.js";
import { startScheduler } from "./scheduler.js";
import { warmWorldFeed } from "./world/index.js";
import { visitorsSeeDemo } from "./auth.js";
import { accountsProblem, firebaseProjectId } from "./accounts.js";
import { flushCounters } from "./counters.js";
import { startProblems } from "./online.js";
import { baseDataDir, releaseLock } from "./store.js";
import { mailStatus } from "./mail.js";
import { startMailRetry } from "./messages.js";

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
  const demoForVisitors = visitorsSeeDemo();
  const host = (process.env.HOST || "").trim() || (demoForVisitors ? "0.0.0.0" : "127.0.0.1");
  const everywhere = host === "0.0.0.0" || host === "::";
  server.listen(port, host, () => {
    const shown = host.includes(":") ? `[${host}]` : host;
    console.log(`Chernozem Atlas is running at http://${shown}:${port}`);
    if (everywhere) console.log(`  (open to the network; on this computer use http://localhost:${port})`);
    const owners = config().ownerEmails;
    const owner = owners.length ? `the owner signs in with Google at /owner (${owners.length === 1 ? "one owner's address" : `${owners.length} owners' addresses`} in OWNER_EMAILS)` : "nobody is the owner (OWNER_EMAILS=none)";
    if (demoForVisitors) console.log(`  Visitors see the read-only demo; ${owner}.`);
    else if (everywhere) console.log("  Warning: anyone on the network can change everything (no ATLAS_ACCESS_CODE on this computer). Set ATLAS_ACCESS_CODE in .env to give visitors the read-only demo.");
    else console.log("  Open: only this computer can open the app, and everything can be changed (set ATLAS_ACCESS_CODE in .env to see the read-only demo as visitors do).");
    // The shared demo's folder; registered accounts' folders are under
    // its users/ (server/store.js).
    console.log(`  Data folder: ${baseDataDir()}`);
    const accountsOff = accountsProblem();
    if (accountsOff) console.log("  Accounts: off (FIREBASE_PROJECT_ID=off).");
    else console.log(`  Accounts: Firebase project ${firebaseProjectId()} (each account's data under users/ in the data folder).`);
    // Where the contact form's messages go (never the password or key).
    const mail = mailStatus();
    const by = { gmail: "Gmail", smtp: "SMTP", resend: "Resend" }[mail.transport];
    if (mail.configured) console.log(`  Contact e-mail: to ${mail.to}, through ${by}.`);
    else console.log(`  Contact e-mail: off (set GMAIL_APP_PASSWORD: docs/DEPLOY.md, "Contact e-mail"). Messages are kept on the server and e-mailed to ${mail.to} once it is set.`);
    startScheduler();
    startMailRetry();
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
    await Promise.allSettled([flushCounters(), releaseLock("scheduler"), releaseLock("field-scheduler")]);
    process.exit(0);
  }
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}
