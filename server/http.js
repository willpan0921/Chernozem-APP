// WHAT THIS FILE DOES
// Small helpers every server route uses to read a request and answer it:
//   readJson(req)                       the request body as an object
//   sendJson(res, status, body)         answer with JSON
//   sendError(res, status, code, text)  answer with { error: { code, message } }
//   openSse(res)                        start a live stream (used by the AI chat)
//   HttpError                           throw one inside a route to answer with an error
//
// WHO EDITS IT
// Nobody, normally.

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
export async function readJson(req) {
  // Some frameworks have already read the body.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const text = (await readBody(req)).toString("utf8").trim();
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
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = Number(req.headers?.["content-length"]) > MAX_BODY_BYTES;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      if (size > MAX_BODY_BYTES * 16) {
        req.destroy();
        reject(new HttpError(413, "too_large", "The request is too large."));
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) reject(new HttpError(413, "too_large", "The request is too large (the limit is 1 MB)."));
      else resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

export function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(text));
  res.end(text);
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
