// WHAT THIS FILE DOES
// The optional access code, so the owner can hand the app to officials
// safely.
//
//   No ATLAS_ACCESS_CODE in .env  ->  everything stays open (local use).
//   ATLAS_ACCESS_CODE=something   ->  every /api/ address needs a signed-in
//                                     browser, except these two:
//
//   GET  /api/auth/status    { required, signedIn }  (the page asks this first)
//   POST /api/auth/login     body { code }  ->  sets the sign-in cookie
//   POST /api/auth/logout    removes the sign-in cookie
//
// HOW SIGNING IN WORKS
// After the right code, the browser gets a cookie that lasts 30 days. The
// cookie says when it runs out and carries a signature (an HMAC) that only
// this server can make: the signing secret comes from the access code plus
// a random "salt" saved once in server/.data/auth.json. Changing the access
// code therefore signs everybody out. Codes and signatures are compared in
// constant time (so timing cannot give them away), and one address gets at
// most 10 wrong codes per 10 minutes.
//
// WHO EDITS IT
// Nobody, normally. The setting is ATLAS_ACCESS_CODE in .env (see
// .env.example and docs/CONNECT-DATA.md).

import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { refreshEnv } from "./env.js";
import { dataDir } from "./store.js";
import { HttpError, readJson, sendJson } from "./http.js";

export const COOKIE_NAME = "atlas_session";
export const SESSION_DAYS = 30;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 10;
export const FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000;

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the salt it read and the count of wrong codes.
const memory = (globalThis.__chernozemAuth ??= { salts: new Map(), limiter: null });

// ---------- Settings ----------

// The access code from .env, or null when none is set (open mode).
export function accessCode() {
  refreshEnv();
  return (process.env.ATLAS_ACCESS_CODE || "").trim() || null;
}

const flag = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

// ---------- Signing (pure: easy to test) ----------

const base64url = (buffer) => buffer.toString("base64url");

// The signing secret: the access code mixed with this install's salt.
export function deriveSecret(code, salt) {
  return createHmac("sha256", String(salt)).update(`chernozem-atlas-session\0${code}`).digest();
}

function signature(secret, payload) {
  return base64url(createHmac("sha256", secret).update(payload).digest());
}

// Makes a sign-in token: "<expires at, ms>.<random>.<signature>".
export function signSession(secret, { now = Date.now(), maxAgeMs = SESSION_MS } = {}) {
  const payload = `${now + maxAgeMs}.${base64url(randomBytes(16))}`;
  return `${payload}.${signature(secret, payload)}`;
}

const TOKEN = /^(\d{1,16})\.([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/;

// True when the token was made by signSession with this secret and has not
// run out yet.
export function verifySession(token, secret, { now = Date.now() } = {}) {
  const match = typeof token === "string" ? TOKEN.exec(token) : null;
  if (!match) return false;
  const [, expires, nonce, given] = match;
  const expected = Buffer.from(signature(secret, `${expires}.${nonce}`));
  const actual = Buffer.from(given);
  // Same length always (43 characters); compared in constant time.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  return Number(expires) > now;
}

// Compares a typed code with the real one in constant time, whatever the
// lengths (both are hashed to 32 bytes first).
export function codesMatch(given, actual) {
  const hash = (text) => createHash("sha256").update(String(text)).digest();
  return timingSafeEqual(hash(given), hash(actual));
}

// ---------- Wrong-code limit ----------

// Counts wrong codes per address. After `max` wrong codes inside `windowMs`
// the address must wait until the oldest one is older than windowMs.
export function createLoginLimiter({ max = MAX_FAILED_LOGINS, windowMs = FAILED_LOGIN_WINDOW_MS } = {}) {
  const failures = new Map(); // address -> [times of wrong codes]
  const recent = (key, now) => {
    const list = (failures.get(key) || []).filter((at) => now - at < windowMs);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
    return list;
  };
  return {
    // { blocked, retryAfterSec }
    check(key, now = Date.now()) {
      const list = recent(key, now);
      if (list.length < max) return { blocked: false, retryAfterSec: 0 };
      return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) };
    },
    fail(key, now = Date.now()) {
      const list = recent(key, now);
      list.push(now);
      failures.set(key, list);
      // Forget addresses nobody has used for a while (keeps memory small).
      if (failures.size > 5000) for (const other of failures.keys()) recent(other, now);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}

function limiter() {
  return (memory.limiter ??= createLoginLimiter());
}

// For tests: forget every wrong code.
export function resetLoginLimits() {
  memory.limiter = null;
}

// ---------- The per-install salt (server/.data/auth.json) ----------

async function readSalt(file) {
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    return typeof saved?.salt === "string" && saved.salt.length >= 32 ? saved.salt : null;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

// Reads the salt, making it the first time. Two servers sharing the data
// folder ("npm run dev" and "npm start") end up with the same salt.
export async function installSalt() {
  const dir = dataDir();
  if (memory.salts.has(dir)) return memory.salts.get(dir);
  const file = path.join(dir, "auth.json");
  let salt = await readSalt(file);
  if (!salt) {
    await fs.mkdir(dir, { recursive: true });
    const fresh = { salt: randomBytes(32).toString("hex"), createdAt: new Date().toISOString() };
    const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(fresh), { mode: 0o600 });
    try {
      // link() only succeeds if auth.json does not exist yet.
      await fs.link(tmp, file);
    } catch (error) {
      // Already there (another server made it): use it. A broken file is replaced.
      if (error.code !== "EEXIST") throw error;
      if (!(await readSalt(file))) await fs.rename(tmp, file);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
    salt = (await readSalt(file)) || fresh.salt;
  }
  memory.salts.set(dir, salt);
  return salt;
}

// ---------- Requests ----------

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    let value = part.slice(at + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep it as it is.
    }
    if (name && !(name in cookies)) cookies[name] = value;
  }
  return cookies;
}

// Behind an https proxy the proxy says so in X-Forwarded-Proto.
function isHttps(req) {
  if (req.socket?.encrypted) return true;
  return String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() === "https";
}

// The address used for the wrong-code limit. Behind a proxy (a tunnel,
// nginx...) every visitor seems to come from the proxy; ATLAS_TRUST_PROXY=1
// uses the address the proxy reports instead.
function clientAddress(req) {
  if (flag(process.env.ATLAS_TRUST_PROXY)) {
    const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1];
  }
  return req.socket?.remoteAddress || "unknown";
}

function sessionCookie(req, token, maxAgeSec) {
  const parts = [`${COOKIE_NAME}=${token}`, "Path=/", `Max-Age=${maxAgeSec}`, "HttpOnly", "SameSite=Lax"];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

// True when this request carries a valid sign-in cookie.
export async function isSignedIn(req, code = accessCode()) {
  if (!code) return true;
  const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
  if (!token) return false;
  return verifySession(token, deriveSecret(code, await installSalt()));
}

// Called by server/app.js for every /api/ request, before any route.
// Answers /api/auth/... itself (gives back true). For everything else it
// gives back false to let the route run, or refuses with 401 when a code
// is set and this browser has not signed in.
export async function handleAuth(req, res, { method, first, second, third }) {
  const code = accessCode();

  if (first !== "auth") {
    if (code && !(await isSignedIn(req, code))) {
      throw new HttpError(401, "auth_required", "Enter the access code to continue.");
    }
    return false;
  }

  if (second === "status" && !third && method === "GET") {
    sendJson(res, 200, { required: Boolean(code), signedIn: await isSignedIn(req, code) });
    return true;
  }

  if (second === "login" && !third && method === "POST") {
    const body = await readJson(req);
    if (!code) {
      sendJson(res, 200, { ok: true, required: false, signedIn: true });
      return true;
    }
    const who = clientAddress(req);
    const wait = limiter().check(who);
    if (wait.blocked) {
      res.setHeader("Retry-After", String(wait.retryAfterSec));
      const minutes = Math.ceil(wait.retryAfterSec / 60);
      throw new HttpError(429, "too_many_attempts", `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
    const given = typeof body.code === "string" ? body.code.trim().slice(0, 200) : "";
    if (!given || !codesMatch(given, code)) {
      limiter().fail(who);
      throw new HttpError(401, "wrong_code", "That access code is not right.");
    }
    limiter().reset(who);
    const token = signSession(deriveSecret(code, await installSalt()));
    res.setHeader("Set-Cookie", sessionCookie(req, token, Math.floor(SESSION_MS / 1000)));
    sendJson(res, 200, { ok: true, required: true, signedIn: true });
    return true;
  }

  if (second === "logout" && !third && method === "POST") {
    res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
    sendJson(res, 200, { ok: true, required: Boolean(code), signedIn: !code });
    return true;
  }

  if (["status", "login", "logout"].includes(second) && !third) {
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on /api/auth/${second}.`);
  }
  throw new HttpError(404, "not_found", "No such sign-in route.");
}
