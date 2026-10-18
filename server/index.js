// WHAT THIS FILE DOES
// The production server ("npm start"): one program that serves the built
// app from dist/ (made by "npm run build") and answers /api/ requests.
// It also runs the monthly auto-analysis.
//
// Port: PORT in .env (default 8787). Open http://localhost:8787
// Address: HOST in .env. Without an access code (ATLAS_ACCESS_CODE) it
// only answers this computer (127.0.0.1); with one it answers the whole
// network (0.0.0.0), so officials can reach it once they have the code.
//
// WHO EDITS IT
// Nobody, normally.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT, config } from "./env.js";
import { handleApi } from "./app.js";
import { startScheduler } from "./scheduler.js";
import { accessCode } from "./auth.js";

const DIST = path.join(ROOT, "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
  ".geojson": "application/geo+json",
};

function sendFile(res, file, req) {
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  // Built files under assets/ have a fingerprint in their name: cache them.
  res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

function serveStatic(req, res) {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("The app is not built yet. Run: npm run build   (the /api/ addresses already work)\n");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.statusCode = 400;
    return res.end("Bad address");
  }
  const file = path.normalize(path.join(DIST, pathname));
  // Never serve anything outside dist/.
  if (file.startsWith(DIST + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(res, file, req);
  // A missing file with an extension is a real 404; anything else is a page
  // of the app (React decides what to show).
  if (path.extname(pathname)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Not found");
  }
  return sendFile(res, path.join(DIST, "index.html"), req);
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      return res.end();
    }
    serveStatic(req, res);
  } catch (error) {
    console.error("[chernozem] Request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      // No details for the page (they can name folders); they are logged above.
      res.end(JSON.stringify({ error: { code: "server_error", message: "Something went wrong on the server. See the server log for details." } }));
    } else res.end();
  }
});

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
  startScheduler();
});
