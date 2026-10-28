// WHAT THIS FILE DOES
// Small helpers every server route uses to read a request and answer it:
//   readJson(req, { maxBytes })         the request body as an object
//                                       (maxBytes: a bigger limit for one route)
//   sendJson(res, status, body)         answer with JSON (gzipped from 1 KB
//                                       when the browser accepts it)
//   sendError(res, status, code, text)  answer with { error: { code, message } }
//   openSse(res)                        start a live stream (used by the AI chat;
//                                       never gzipped, so each part arrives at once)
//   acceptsGzip(header)                 true when Accept-Encoding allows gzip
//   HttpError                           throw one inside a route to answer with an error
//
// WHO EDITS IT
// Nobody, normally.

import { gzipSync } from "node:zlib";

// Throw this inside a route: the router turns it into a JSON error answer.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 1 MB. The largest real request, an area of 5,000 points, is about 150 KB.
const MAX_BODY_BYTES = 1024 * 1024;

// Reads the request body as JSON. An empty body gives {}.
// maxBytes raises the limit for one route (the Field photo reports).
export async function readJson(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  // Some frameworks have already read the body.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const text = (await readBody(req, maxBytes)).toString("utf8").trim();
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value;
  } catch {
    throw new HttpError(400, "bad_json", "The request body must be a JSON object.");
  }
}

// The raw body. A body over the limit is read to the end but thrown away,
// so the sender still gets the "too large" answer (stopping half-way would
// cut the connection). A body far over the limit cuts the connection.
function readBody(req, maxBytes = MAX_BODY_BYTES) {
  const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : MAX_BODY_BYTES;
  const limitText = limit >= 1024 * 1024 ? `${Math.round(limit / (1024 * 1024))} MB` : `${Math.round(limit / 1024)} KB`;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = Number(req.headers?.["content-length"]) > limit;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      if (size > Math.max(limit * 2, MAX_BODY_BYTES * 16)) {
        req.destroy();
        reject(new HttpError(413, "too_large", "The request is too large."));
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) reject(new HttpError(413, "too_large", `The request is too large (the limit is ${limitText}).`));
      else resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

// True when an Accept-Encoding header allows gzip ("gzip, deflate, br"
// yes; "gzip;q=0" or no header no). A listed "gzip" decides; else "*".
export function acceptsGzip(header) {
  let gzip = null;
  let any = null;
  for (const part of String(header || "").toLowerCase().split(",")) {
    const [name, ...params] = part.split(";").map((piece) => piece.trim());
    const q = params.find((param) => param.startsWith("q="));
    const weight = q ? Number(q.slice(2)) : 1;
    const allowed = Number.isFinite(weight) && weight > 0;
    if (name === "gzip" || name === "x-gzip") gzip = allowed;
    else if (name === "*") any = allowed;
  }
  return gzip ?? any ?? false;
}

// Small answers are not worth compressing.
const GZIP_MIN_BYTES = 1024;

export function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end();
    return;
  }
  let payload = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (payload.length >= GZIP_MIN_BYTES) {
    res.setHeader("Vary", "Accept-Encoding");
    // res.req: the request this answers (set by Node's server).
    if (acceptsGzip(res.req?.headers?.["accept-encoding"])) {
      payload = gzipSync(payload);
      res.setHeader("Content-Encoding", "gzip");
    }
  }
  res.setHeader("Content-Length", payload.length);
  res.end(payload);
}

export function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

// Starts a Server-Sent Events stream. send("delta", { text }) pushes one
// event; close() ends the stream.
export function openSse(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  let open = true;
  // A comment line every 15 s keeps proxies from closing a quiet stream.
  const heartbeat = setInterval(() => open && res.write(": keep-alive\n\n"), 15000);
  heartbeat.unref?.();
  const close = () => {
    if (!open) return;
    open = false;
    clearInterval(heartbeat);
    res.end();
  };
  res.on("close", () => {
    open = false;
    clearInterval(heartbeat);
  });
  return {
    get open() {
      return open;
    },
    send(event, data) {
      if (!open) return false;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
      return true;
    },
    close,
  };
}
