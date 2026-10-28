// WHAT THIS FILE DOES
// What the production server ("npm start", server/index.js) does with each
// request: /api/ addresses go to server/app.js, everything else is the
// built app from dist/ ("npm run build"). Kept apart from index.js so the
// tests can run it without starting the real server.
//
// Every answer gets a few safety headers:
//   X-Content-Type-Options: nosniff        files are only read as what they are
//   Referrer-Policy: strict-origin-when-cross-origin
//                                          other sites see at most the address
//                                          of the site, never the page
//   X-Frame-Options: SAMEORIGIN            other sites cannot show the app
//                                          inside their own page
//   Strict-Transport-Security              only over https (the host says so in
//                                          X-Forwarded-Proto): browsers then
//                                          always use https for a year
// (No Content-Security-Policy: the map tiles and the fonts come from other
// sites.)
//
// Text files (.html, .js, .css, .json, .svg...) are gzipped when the
// browser accepts it; the /api/ answers are gzipped in server/http.js
// sendJson. The AI chat's live stream is never gzipped.
//
// Built files under assets/ have a fingerprint in their name, so browsers
// keep them for a year. The website's film (site/film/) is kept for a week
// by browsers and by Cloudflare, so a play does not fetch 36 MB from this
// server every time. Every other file (index.html, the logo, the icons) is
// checked again on each visit, but with ETag and Last-Modified: unchanged
// since the browser's copy, the answer is a short 304 ("use yours")
// instead of the whole file again.
//
// Files that are not gzipped (pictures, fonts, the film) can be asked for
// in pieces: a "Range: bytes=start-end" request gets just those bytes
// (206 Partial Content, with Content-Range saying which), which is how a
// browser plays a video and jumps around in it; a range outside the file
// gets 416. HEAD answers the same headers without the bytes.
//
// WHO EDITS IT
// Nobody, normally.

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";
import { createGzip } from "node:zlib";
import { ROOT } from "./env.js";
import { handleApi } from "./app.js";
import { isHttps } from "./auth.js";
import { acceptsGzip } from "./http.js";

export const DIST = path.join(ROOT, "dist");

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
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".vtt": "text/vtt; charset=utf-8",
};

// Worth gzipping (pictures, fonts and video are compressed already).
const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".map", ".csv", ".geojson", ".vtt"]);
const GZIP_MIN_BYTES = 1024;

// The website's film lives here (public/site/film/ -> dist/site/film/).
const FILM_DIR = `${path.sep}site${path.sep}film${path.sep}`;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

// The safety headers above, on every answer.
export function securityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

// A weak validator from the file's size and time: a new build gives new
// files, so a new tag.
export function fileTag(stat) {
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

// True when the browser's copy is still the file (If-None-Match decides
// when it is sent, else If-Modified-Since, to the second).
export function stillFresh(headers, tag, mtimeMs) {
  const match = headers?.["if-none-match"];
  if (match) {
    const plain = (value) => value.trim().replace(/^W\//, "");
    return String(match)
      .split(",")
      .some((value) => value.trim() === "*" || plain(value) === plain(tag));
  }
  const since = Date.parse(headers?.["if-modified-since"] || "");
  return Number.isFinite(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
}

// How long a file may be kept without asking again.
export function cacheControlFor(file) {
  // Built files under assets/ have a fingerprint in their name: cache them.
  if (file.includes(`${path.sep}assets${path.sep}`)) return "public, max-age=31536000, immutable";
  if (file.includes(FILM_DIR)) return `public, max-age=${WEEK_SECONDS}`;
  return "no-cache";
}

// Reads one "Range: bytes=start-end" for a file of `size` bytes. Gives
// null when there is no usable range (so the whole file is sent: no
// header, several ranges at once, or one that cannot be read),
// "unsatisfiable" when the range lies outside the file (416), else
// { start, end } with both ends inside the file. "bytes=100-" means from
// byte 100 to the end; "bytes=-100" means the last 100 bytes.
export function parseRange(header, size) {
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(String(header ?? ""));
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    const last = Number(match[2]);
    if (last === 0) return "unsatisfiable";
    start = Math.max(0, size - last);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

// If-Range: a range is honoured only when the browser's copy is still this
// file (it sends back the ETag or the Last-Modified date it was given);
// otherwise the whole file is sent, so pieces of two builds never mix.
function rangeStillValid(headers, tag, lastModified) {
  const given = headers?.["if-range"];
  if (!given) return true;
  const value = String(given).trim();
  return value === tag || value === lastModified;
}

function streamFile(res, stages, file) {
  // A file that cannot be read (removed by a new build meanwhile) ends the
  // answer instead of taking the server down.
  pipeline(...stages, res, (error) => {
    if (error && error.code !== "ERR_STREAM_PREMATURE_CLOSE") console.warn(`[chernozem] Could not send ${path.basename(file)}: ${error.message}`);
  });
}

function sendFile(req, res, file, stat) {
  const ext = path.extname(file).toLowerCase();
  const head = req.method === "HEAD";
  res.statusCode = 200;
  res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", cacheControlFor(file));
  const tag = fileTag(stat);
  const lastModified = stat.mtime.toUTCString();
  res.setHeader("ETag", tag);
  res.setHeader("Last-Modified", lastModified);
  const compressible = TEXT.has(ext) && stat.size >= GZIP_MIN_BYTES;
  if (compressible) res.setHeader("Vary", "Accept-Encoding");
  // A gzipped answer has other bytes than the file, so only files sent as
  // they are can be asked for in pieces.
  else res.setHeader("Accept-Ranges", "bytes");
  if (stillFresh(req.headers, tag, stat.mtimeMs)) {
    res.statusCode = 304;
    return res.end();
  }
  if (!compressible && req.headers?.range !== undefined && rangeStillValid(req.headers, tag, lastModified)) {
    const range = parseRange(req.headers.range, stat.size);
    if (range === "unsatisfiable") {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      return res.end();
    }
    if (range) {
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
      res.setHeader("Content-Length", range.end - range.start + 1);
      if (head) return res.end();
      return streamFile(res, [fs.createReadStream(file, { start: range.start, end: range.end })], file);
    }
  }
  const gzip = compressible && acceptsGzip(req.headers?.["accept-encoding"]);
  if (gzip) res.setHeader("Content-Encoding", "gzip");
  else res.setHeader("Content-Length", stat.size);
  if (head) return res.end();
  streamFile(res, gzip ? [fs.createReadStream(file), createGzip()] : [fs.createReadStream(file)], file);
}

function plainText(res, status, text) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}

function statFile(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

function serveStatic(req, res, dist) {
  const index = path.join(dist, "index.html");
  const indexStat = statFile(index);
  if (!indexStat) return plainText(res, 503, "The app is not built yet. Run: npm run build   (the /api/ addresses already work)\n");
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return plainText(res, 400, "Bad address");
  }
  const file = path.normalize(path.join(dist, pathname));
  // Never serve anything outside dist/.
  const stat = file.startsWith(dist + path.sep) ? statFile(file) : null;
  if (stat) return sendFile(req, res, file, stat);
  // A missing file with an extension is a real 404; anything else is a page
  // of the app (React decides what to show).
  if (path.extname(pathname)) return plainText(res, 404, "Not found");
  return sendFile(req, res, index, indexStat);
}

// The request handler. dist: the built app (a test passes its own).
export function createHandler({ dist = DIST } = {}) {
  const root = path.resolve(dist);
  return async function handle(req, res) {
    try {
      securityHeaders(req, res);
      if (await handleApi(req, res)) return;
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET, HEAD");
        return res.end();
      }
      serveStatic(req, res, root);
    } catch (error) {
      console.error("[chernozem] Request failed:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        // No details for the page (they can name folders); they are logged above.
        res.end(JSON.stringify({ error: { code: "server_error", message: "Something went wrong on the server. See the server log for details." } }));
      } else res.end();
    }
  };
}
