// WHAT THIS FILE DOES
// Tests the production server's request handling (server/web.js, used by
// "npm start"): the safety headers on every answer (Strict-Transport-
// Security only over https), gzip for text files and larger /api/ answers
// when the browser accepts it but never for the AI chat's live stream,
// ETag and Last-Modified (304 for an unchanged file), the health check
// without an access code, and that only files inside dist/ are ever
// served. Uses a temporary dist/ and data folder and sample
// data. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/web.js, server/index.js or sendJson in
// server/http.js.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-web-"));
process.env.CHERNOZEM_DATA_DIR = path.join(scratch, "data");
process.env.GEE_DISABLED = "1";
// Not on Render (where a short code keeps the app locked).
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.IMPORT_TOKEN = "";
const { createHandler, securityHeaders } = await import("./web.js");
const { acceptsGzip } = await import("./http.js");

// A small built app.
const dist = path.join(scratch, "dist");
const APP_JS = `console.log(${JSON.stringify("chernozem ".repeat(500))});\n`;
fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
fs.writeFileSync(path.join(dist, "index.html"), `<!doctype html><title>Chernozem</title><div id="root"></div>${"<!-- padding -->".repeat(100)}`);
fs.writeFileSync(path.join(dist, "assets", "index-abc123.js"), APP_JS);
fs.writeFileSync(path.join(dist, "assets", "tiny-abc123.css"), "a{}");
fs.writeFileSync(path.join(dist, "chernozem-logo.png"), Buffer.alloc(4096, 7));
fs.writeFileSync(path.join(scratch, "secret.txt"), "outside dist");

let server;
let port;
before(async () => {
  server = http.createServer(createHandler({ dist }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});
after(() => {
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

// A raw request (no automatic unzipping), so the bytes can be checked.
function call(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        // (A HEAD answer says gzip but has no body.)
        const text = (res.headers["content-encoding"] === "gzip" && raw.length ? gunzipSync(raw) : raw).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, raw, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

const GZIP = { "Accept-Encoding": "gzip, deflate, br" };

function assertSafetyHeaders(res, label) {
  assert.equal(res.headers["x-content-type-options"], "nosniff", label);
  assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin", label);
  assert.equal(res.headers["x-frame-options"], "SAMEORIGIN", label);
  assert.equal(res.headers["content-security-policy"], undefined, `${label}: no CSP (map tiles and fonts come from other sites)`);
}

test("every answer has the safety headers; HSTS only over https", async () => {
  const answers = {
    page: await call("GET", "/field"),
    file: await call("GET", "/assets/index-abc123.js"),
    missing: await call("GET", "/missing.js"),
    api: await call("GET", "/api/workspace"),
    apiError: await call("GET", "/api/nothing-here"),
    health: await call("GET", "/api/health"),
    postToPage: await call("POST", "/field"),
  };
  assert.deepEqual(Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.status])), { page: 200, file: 200, missing: 404, api: 200, apiError: 404, health: 200, postToPage: 405 });
  for (const [label, res] of Object.entries(answers)) {
    assertSafetyHeaders(res, label);
    assert.equal(res.headers["strict-transport-security"], undefined, `${label}: plain http has no HSTS`);
  }
  assert.equal(answers.postToPage.headers.allow, "GET, HEAD");

  for (const url of ["/field", "/api/health", "/api/workspace"]) {
    const res = await call("GET", url, { headers: { "X-Forwarded-Proto": "https" } });
    assertSafetyHeaders(res, url);
    assert.equal(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", url);
  }
  const viaHttp = await call("GET", "/field", { headers: { "X-Forwarded-Proto": "http" } });
  assert.equal(viaHttp.headers["strict-transport-security"], undefined);
});

test("securityHeaders on its own", () => {
  const set = {};
  const res = { setHeader: (name, value) => (set[name] = value) };
  securityHeaders({ headers: { "x-forwarded-proto": "https,http" }, socket: {} }, res);
  assert.equal(set["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
  assert.equal(set["X-Frame-Options"], "SAMEORIGIN");
});

test("text files are gzipped when the browser accepts it", async () => {
  const zipped = await call("GET", "/assets/index-abc123.js", { headers: GZIP });
  assert.equal(zipped.status, 200);
  assert.equal(zipped.headers["content-encoding"], "gzip");
  assert.equal(zipped.headers.vary, "Accept-Encoding");
  assert.equal(zipped.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(zipped.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(zipped.text, APP_JS);
  assert.ok(zipped.raw.length < APP_JS.length / 5, `gzipped: ${zipped.raw.length} bytes`);

  const plain = await call("GET", "/assets/index-abc123.js");
  assert.equal(plain.headers["content-encoding"], undefined, "no Accept-Encoding: not gzipped");
  assert.equal(plain.text, APP_JS);
  const refused = await call("GET", "/assets/index-abc123.js", { headers: { "Accept-Encoding": "gzip;q=0, br" } });
  assert.equal(refused.headers["content-encoding"], undefined, "gzip;q=0: not gzipped");

  const page = await call("GET", "/atlas/map", { headers: GZIP });
  assert.equal(page.headers["content-encoding"], "gzip", "the app's page");
  assert.match(page.text, /<title>Chernozem<\/title>/);
  assert.equal(page.headers["cache-control"], "no-cache");

  const tiny = await call("GET", "/assets/tiny-abc123.css", { headers: GZIP });
  assert.equal(tiny.headers["content-encoding"], undefined, "a tiny file is sent as it is");
  assert.equal(tiny.text, "a{}");
  const image = await call("GET", "/chernozem-logo.png", { headers: GZIP });
  assert.equal(image.headers["content-encoding"], undefined, "pictures are compressed already");
  assert.equal(image.raw.length, 4096);
  const head = await call("HEAD", "/assets/index-abc123.js", { headers: GZIP });
  assert.equal(head.status, 200);
  assert.equal(head.raw.length, 0);
});

test("files are checked again with ETag and Last-Modified: unchanged ones answer 304", async () => {
  const logo = await call("GET", "/chernozem-logo.png");
  assert.equal(logo.status, 200);
  assert.equal(logo.headers["cache-control"], "no-cache", "checked again on each visit...");
  const tag = logo.headers.etag;
  assert.match(tag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
  const modified = logo.headers["last-modified"];
  assert.equal(new Date(modified).getTime(), Math.floor(fs.statSync(path.join(dist, "chernozem-logo.png")).mtimeMs / 1000) * 1000);

  // ...but downloaded again only when it changed.
  const same = await call("GET", "/chernozem-logo.png", { headers: { "If-None-Match": tag } });
  assert.equal(same.status, 304);
  assert.equal(same.raw.length, 0);
  assert.equal(same.headers.etag, tag);
  assertSafetyHeaders(same, "304");
  assert.equal((await call("GET", "/chernozem-logo.png", { headers: { "If-None-Match": `"other", ${tag}` } })).status, 304, "one of several tags");
  assert.equal((await call("GET", "/chernozem-logo.png", { headers: { "If-None-Match": '"other"' } })).status, 200);
  assert.equal((await call("GET", "/chernozem-logo.png", { headers: { "If-Modified-Since": modified } })).status, 304);
  assert.equal((await call("GET", "/chernozem-logo.png", { headers: { "If-Modified-Since": "Thu, 01 Jan 2015 00:00:00 GMT" } })).status, 200);
  assert.equal((await call("GET", "/chernozem-logo.png", { headers: { "If-None-Match": '"other"', "If-Modified-Since": modified } })).status, 200, "If-None-Match decides when both are sent");
  assert.equal((await call("HEAD", "/chernozem-logo.png", { headers: { "If-None-Match": tag } })).status, 304);

  // The app's page too (gzipped or not, the same file).
  const page = await call("GET", "/field", { headers: GZIP });
  const again = await call("GET", "/atlas/map", { headers: { ...GZIP, "If-None-Match": page.headers.etag } });
  assert.equal(again.status, 304);
  assert.equal(again.headers["content-encoding"], undefined, "no body, so no encoding");

  // A new build (a changed file) gets a new tag.
  const file = path.join(dist, "chernozem-logo.png");
  fs.writeFileSync(file, Buffer.alloc(4097, 7));
  fs.utimesSync(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  const changed = await call("GET", "/chernozem-logo.png", { headers: { "If-None-Match": tag, "If-Modified-Since": modified } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.etag, tag);
  assert.equal(changed.raw.length, 4097);
  fs.writeFileSync(file, Buffer.alloc(4096, 7));
});

test("larger /api/ answers are gzipped too, small ones are not", async () => {
  const search = await call("GET", "/api/areas/search?q=ukr");
  const ukraine = JSON.parse(search.text).results.find((r) => r.name === "Ukraine");
  const created = await call("POST", "/api/areas", { body: { source: "country", id: ukraine.id } });
  assert.equal(created.status, 201);
  const id = JSON.parse(created.text).area.id;

  const zipped = await call("GET", `/api/areas/${id}?full=1`, { headers: GZIP });
  assert.equal(zipped.status, 200);
  assert.equal(zipped.headers["content-encoding"], "gzip");
  assert.equal(zipped.headers.vary, "Accept-Encoding");
  assert.equal(Number(zipped.headers["content-length"]), zipped.raw.length);
  assert.equal(JSON.parse(zipped.text).area.id, id);
  const plain = await call("GET", `/api/areas/${id}?full=1`);
  assert.equal(plain.headers["content-encoding"], undefined);
  assert.equal(plain.text, zipped.text);
  assert.ok(zipped.raw.length < plain.raw.length / 2);

  const small = await call("GET", "/api/health", { headers: GZIP });
  assert.equal(small.headers["content-encoding"], undefined);
  assert.deepEqual(JSON.parse(small.text), { ok: true });
});

test("the AI chat's live stream is never gzipped", async () => {
  const res = await call("POST", "/api/chat", { headers: GZIP, body: { product: "atlas", message: "hello" } });
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /^text\/event-stream/);
  assert.equal(res.headers["content-encoding"], undefined);
  assert.match(res.text, /event: error\ndata: .*ai_not_configured/);
  assertSafetyHeaders(res, "chat stream");
});

test("the health check needs no access code and says nothing else", async () => {
  process.env.ATLAS_ACCESS_CODE = "test-code";
  try {
    const health = await call("GET", "/api/health");
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.text), { ok: true });
    assert.equal(health.headers["cache-control"], "no-store");
    const head = await call("HEAD", "/api/health");
    assert.equal(head.status, 200);
    assert.equal((await call("GET", "/api/workspace")).status, 401, "the rest still needs the code");
    assert.equal((await call("POST", "/api/health")).status, 401, "other methods are not open");
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
  assert.equal((await call("POST", "/api/health")).status, 405);
  assert.equal((await call("GET", "/api/health/extra")).status, 404);
});

test("nothing outside dist/ is ever served", async () => {
  for (const url of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/..%5csecret.txt", "/%2e%2e%2fsecret.txt", "/field/../../secret.txt"]) {
    const res = await call("GET", url);
    assert.equal(res.status, 404, url);
    assert.notEqual(res.text, "outside dist", url);
  }
  assert.equal((await call("GET", "/%E0%A4%A")).status, 400, "a broken address");
});

test("the app not built yet: a plain message (the API still works)", async () => {
  const other = http.createServer(createHandler({ dist: path.join(scratch, "no-dist") }));
  await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${other.address().port}/field`);
    assert.equal(res.status, 503);
    assert.match(await res.text(), /npm run build/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await fetch(`http://127.0.0.1:${other.address().port}/api/health`)).status, 200);
  } finally {
    other.close();
  }
});

test("acceptsGzip reads Accept-Encoding", () => {
  assert.equal(acceptsGzip("gzip, deflate, br"), true);
  assert.equal(acceptsGzip("br;q=1.0, gzip;q=0.8, *;q=0.1"), true);
  assert.equal(acceptsGzip("GZIP"), true);
  assert.equal(acceptsGzip("*"), true);
  assert.equal(acceptsGzip("gzip;q=0"), false);
  assert.equal(acceptsGzip("gzip;q=0, *"), false, "a listed gzip decides");
  assert.equal(acceptsGzip("br"), false);
  assert.equal(acceptsGzip("identity"), false);
  assert.equal(acceptsGzip(""), false);
  assert.equal(acceptsGzip(undefined), false);
});
