// WHAT THIS FILE DOES
// Who is asking: the optional access code (the shared demo), and the
// registered accounts (each with a folder of its own, server/accounts.js).
//
//   No ATLAS_ACCESS_CODE in .env  ->  everything stays open (local use).
//   ATLAS_ACCESS_CODE=something   ->  every /api/ address needs a signed-in
//                                     browser, except these (and the three
//                                     in server/app.js that need no code:
//                                     /api/health, /api/contact and
//                                     /api/admin/import):
//
//   GET  /api/auth/status    { required, signedIn, shared, account }
//                            (the page asks this first; account is null for
//                            the code's shared workspace, or { uid, email,
//                            name, product, profileComplete } for a
//                            registered account)
//   POST /api/auth/login     body { code }  ->  sets the sign-in cookie
//   POST /api/auth/firebase  body { idToken } -> a registered account's
//                            sign-in (server/accounts.js), sets the
//                            account cookie
//   POST /api/auth/logout    removes BOTH cookies (the sidebar's "Sign out")
//
// shared is true when a code is set and the browser is in with the code:
// the app is then one workspace that everyone with the code sees and can
// change (the Field sidebar says so instead of "Your fields are private").
// A registered account is never shared (shared: false): it has a folder
// of its own, <data folder>/users/<id>/ (server/store.js userRoot).
//
// TWO COOKIES
//   atlas_session       the access code's (30 days): the shared demo
//   chernozem_account   a registered account's (30 days): "<uid>.<expires
//                       at>.<random>.<signature>", signed with a secret
//                       made from this install's salt and the word
//                       "accounts", checked in constant time. It is set by
//                       POST /api/auth/firebase once Firebase has said who
//                       the person is, and carries only the account id:
//                       the e-mail, name and product are read from the
//                       account's profile.json on every request.
// A browser with a valid account cookie is that account, code or no code
// (also online, and also on one's own computer without a code). Without
// one, the access code's rules apply as before. handleAuth gives
// server/app.js the session, { kind: "code" | "account", root, account },
// and app.js runs the route inside that root.
//
// Also here, for every /api/ route (server/app.js calls assertSameSite
// first): a request that changes something is refused (403 cross_site)
// when a browser says another website sent it, code or no code. See
// "Requests sent by other websites" below.
//
// ONLINE (on Render: https://chernozem.app, docs/DEPLOY.md) the code must
// be at least 16 characters and must not be the example once printed in
// the docs (the repository is public). server/index.js refuses to start
// without such a code (server/online.js); if the code still changes to
// one like that while the server runs, the app stays locked: the access
// card shows and no code opens it, rather than the app opening to anyone.
//
// HOW SIGNING IN WORKS
// After the right code, the browser gets a cookie that lasts 30 days. The
// cookie says when it runs out and carries a signature (an HMAC) that only
// this server can make: the signing secret comes from the access code plus
// a random "salt" saved once in server/.data/auth.json. Changing the access
// code therefore signs everybody out. Codes and signatures are compared in
// constant time (so timing cannot give them away), and one visitor gets at
// most 10 wrong codes per 10 minutes. (Signing out removes the cookie from
// that browser; only a new code ends every sign-in at once.)
//
// THE VISITOR'S ADDRESS (for that limit, clientAddress below)
// Normally the address that connected. Behind a proxy every visitor seems
// to come from the proxy, so ATLAS_TRUST_PROXY says where to read it:
//   1           one proxy (nginx, Caddy, a tunnel): the last entry of
//               X-Forwarded-For, where each proxy adds the address it saw
//               at the right end
//   cloudflare  Render (render.yaml), where every request passes
//               Cloudflare's edge and then Render's own load balancer:
//               CF-Connecting-IP, which Cloudflare sets itself (it turns
//               away a request that brings its own). Without it,
//               X-Forwarded-For's entry just before Cloudflare's
//               ("visitor, cloudflare, 10.x"), taken as it is even when
//               it is a Cloudflare address too (requests sent from inside
//               Cloudflare, by its Workers, then count as one visitor)
// On Render "cloudflare" also applies when ATLAS_TRUST_PROXY is left out
// or set to 1. Entries left of the visitor's own were typed by the visitor
// (Render keeps them), so they are never used. An IPv6 visitor counts by
// its /64 network (one home or phone line can switch between millions of
// addresses inside it).
//
// WHO EDITS IT
// Nobody, normally. The setting is ATLAS_ACCESS_CODE in .env (see
// .env.example and docs/CONNECT-DATA.md).

import fs from "node:fs/promises";
import path from "node:path";
import { BlockList, isIP } from "node:net";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { onRender, refreshEnv } from "./env.js";
import { baseDataDir, getProfile, userRoot, withDataRoot } from "./store.js";
import { HttpError, readJson, sendJson } from "./http.js";
// (accounts.js imports this file too; both only use each other inside
// functions, so the circle is harmless.)
import { accountSummary, handleFirebaseSignIn } from "./accounts.js";

export const COOKIE_NAME = "atlas_session";
export const ACCOUNT_COOKIE_NAME = "chernozem_account";
export const SESSION_DAYS = 30;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 10;
export const FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000;
// How many visitors the wrong-code limit remembers at most.
export const MAX_LIMITER_KEYS = 50_000;
// Online (on Render) the code must be at least this long.
export const ACCESS_CODE_MIN_LENGTH = 16;

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

// The example code once printed in docs/CONNECT-DATA.md and docs/DEPLOY.md.
// It stays readable in the public repository's history, so online it never
// counts as a code (whatever its capitals, spaces or dashes).
const PUBLISHED_CODES = ["river-tractor-winter-maple"];
const lettersOnly = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "");

// Why a code cannot lock the online copy: "missing", "short" (under
// ACCESS_CODE_MIN_LENGTH characters) or "published" (the docs' example);
// null when it can. On one's own computer any code, or none, is fine.
export function accessCodeProblem(code) {
  if (!code) return "missing";
  if (code.length < ACCESS_CODE_MIN_LENGTH) return "short";
  if (PUBLISHED_CODES.some((example) => lettersOnly(example) === lettersOnly(code))) return "published";
  return null;
}

// True when the app must stay locked whatever is typed: online, with a code
// that cannot lock it (see the top of this file).
export function codeRefusedOnline(code = accessCode()) {
  return onRender() && accessCodeProblem(code) !== null;
}

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

// ---------- Signing a registered account's cookie (pure too) ----------

// A Firebase account id: letters, digits, "_" and "-" (Firebase makes 28
// letters and digits; custom ids may be longer). No dots, so the token's
// parts stay apart.
const UID = /^[A-Za-z0-9_-]{1,128}$/;
export const isUid = (value) => typeof value === "string" && UID.test(value);

// The secret for account cookies: this install's salt and the word
// "accounts". Not the access code, so changing the code does not sign the
// accounts out (and a new salt signs everyone out, accounts included).
export function deriveAccountSecret(salt) {
  return createHmac("sha256", String(salt)).update("accounts").digest();
}

// Makes an account token: "<uid>.<expires at, ms>.<random>.<signature>".
export function signAccountSession(secret, uid, { now = Date.now(), maxAgeMs = SESSION_MS } = {}) {
  if (!isUid(uid)) throw new Error("signAccountSession needs a Firebase account id.");
  const payload = `${uid}.${now + maxAgeMs}.${base64url(randomBytes(16))}`;
  return `${payload}.${signature(secret, payload)}`;
}

const ACCOUNT_TOKEN = /^([A-Za-z0-9_-]{1,128})\.(\d{1,16})\.([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/;

// The account id the token was made for, when it was made by
// signAccountSession with this secret and has not run out; else null.
export function verifyAccountSession(token, secret, { now = Date.now() } = {}) {
  const match = typeof token === "string" ? ACCOUNT_TOKEN.exec(token) : null;
  if (!match) return null;
  const [, uid, expires, nonce, given] = match;
  const expected = Buffer.from(signature(secret, `${uid}.${expires}.${nonce}`));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return Number(expires) > now ? uid : null;
}

// ---------- Wrong-code limit ----------

// Counts wrong codes per visitor. After `max` wrong codes inside `windowMs`
// the visitor must wait until the oldest one is older than windowMs.
// Memory stays small and every wrong code quick, however many addresses
// someone makes up: visitors whose wrong codes have all run out are swept
// away at most once per sweepEveryMs, and above maxKeys visitors the one
// whose last wrong code is oldest is forgotten first. (No limit for all
// visitors together: one person could then keep everyone out.)
export function createLoginLimiter({
  max = MAX_FAILED_LOGINS,
  windowMs = FAILED_LOGIN_WINDOW_MS,
  maxKeys = MAX_LIMITER_KEYS,
  sweepEveryMs = 60 * 1000,
} = {}) {
  // visitor -> [times of wrong codes]. A Map keeps the order its keys were
  // added in; each wrong code moves its visitor to the end, so the first
  // key is always the visitor whose last wrong code is oldest.
  const failures = new Map();
  let sweptAt = -Infinity;
  const recent = (key, now) => {
    const list = (failures.get(key) || []).filter((at) => now - at < windowMs);
    // (set() on a key already there keeps its place in the order.)
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
      failures.delete(key);
      failures.set(key, list);
      if (now - sweptAt >= sweepEveryMs) {
        sweptAt = now;
        for (const other of failures.keys()) recent(other, now);
      }
      while (failures.size > maxKeys) failures.delete(failures.keys().next().value);
    },
    reset(key) {
      failures.delete(key);
    },
    // How many visitors are remembered (for the tests).
    size() {
      return failures.size;
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
// folder ("npm run dev" and "npm start") end up with the same salt. The
// salt is the install's, so it lives in the base folder, whatever account
// is asking.
export async function installSalt() {
  const dir = baseDataDir();
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

// Behind an https proxy the proxy says so in X-Forwarded-Proto. (Also
// used by server/web.js for the Strict-Transport-Security header.)
export function isHttps(req) {
  if (req.socket?.encrypted) return true;
  return String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() === "https";
}

// ---------- Requests sent by other websites ----------

// A request that changes something (anything but GET or HEAD) must come
// from this app's own pages, never from another website a visitor has
// open: that website could otherwise sign the visitor out, spend their ten
// wrong-code tries, or change the workspace with their cookie. Browsers
// say where a request came from:
//   Sec-Fetch-Site   "same-origin" (our own pages), "none" (the visitor
//                    typed the address or used a bookmark): allowed;
//                    "same-site" or "cross-site": refused
//   Origin           older browsers: the website's address, whose host
//                    must be the host the request was sent to (Host, or
//                    X-Forwarded-Host behind a proxy), scheme and port
//                    aside; "null" or something else: refused
// A request with neither (curl, scripts/export-data.js, a server) is let
// through: it brings no visitor's cookie with it. The public website's
// contact form and the dev server's pages are this same site, so they
// pass.

// The host name in "chernozem.app", "localhost:5173" or "[::1]:5173"
// (lower case, no port); null for none.
function hostName(value) {
  const text = String(value || "").split(",")[0].trim();
  if (!text) return null;
  try {
    return new URL(`http://${text}`).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

// Why this request is refused as another website's, or null when it is
// not (see above). headers: the request's, lower-case names.
export function crossSiteProblem(headers = {}) {
  const site = String(headers["sec-fetch-site"] || "").trim().toLowerCase();
  if (site && site !== "same-origin" && site !== "none") {
    return "This request came from another website, so it was not carried out. Open Chernozem itself and try again.";
  }
  const origin = String(headers.origin || "").trim();
  if (!origin) return null;
  let originHost = null;
  try {
    originHost = new URL(origin).hostname.toLowerCase() || null;
  } catch {
    // "null" (a sandboxed page) or junk: not ours.
  }
  const ours = [hostName(headers.host), hostName(headers["x-forwarded-host"])].filter(Boolean);
  if (originHost && ours.includes(originHost)) return null;
  return "This request came from another website, so it was not carried out. Open Chernozem itself and try again.";
}

// Called by server/app.js before every /api/ route: refuses (403) a request
// that would change something when it was sent by another website.
export function assertSameSite(req, method = req.method) {
  const verb = String(method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD") return;
  const problem = crossSiteProblem(req.headers || {});
  if (problem) throw new HttpError(403, "cross_site", problem);
}

// ---------- The visitor's address (see the top of this file) ----------

// Addresses that are never a visitor on the internet: this computer,
// private networks, and hosts' own networks (Render's load balancers).
const INTERNAL = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]]) {
  INTERNAL.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [["::1", 128], ["fc00::", 7], ["fe80::", 10]]) INTERNAL.addSubnet(net, bits, "ipv6");

// Cloudflare's edge, which every request to a Render web service passes
// through (https://www.cloudflare.com/ips/, checked October 2026).
const CLOUDFLARE = new BlockList();
for (const range of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
]) {
  const [net, bits] = range.split("/");
  CLOUDFLARE.addSubnet(net, Number(bits), net.includes(":") ? "ipv6" : "ipv4");
}

const inList = (list, ip) => list.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");

// One address as written by a proxy or a socket, made plain:
// "[2001:db8::1]:443" -> "2001:db8::1", "203.0.113.9:5678" -> "203.0.113.9",
// "::ffff:203.0.113.9" -> "203.0.113.9". Gives back null when it is not an
// address at all ("unknown", junk).
export function normalizeIp(value) {
  let text = String(value ?? "").trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(text);
  if (bracketed) text = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(text)) text = text.slice(0, text.lastIndexOf(":"));
  text = text.replace(/%.*$/, "").toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (mapped) text = mapped[1];
  return isIP(text) ? text : null;
}

// The visitor in an X-Forwarded-For header (see the top of this file), or
// null when the header has no address. behindCloudflare: the server is
// known to sit behind Cloudflare (Render), so a chain without a Cloudflare
// address it recognises (Cloudflare may have added a range since the list
// above) gives its last address that is not private, rather than Render's
// own load balancer for every visitor.
export function visitorFromForwarded(header, { behindCloudflare = false } = {}) {
  const chain = String(header ?? "").split(",").map(normalizeIp).filter(Boolean);
  if (!chain.length) return null;
  // The host's own proxies come last (Render: a private 10.x address)...
  let i = chain.length - 1;
  while (i >= 0 && inList(INTERNAL, chain[i])) i--;
  // ...after Cloudflare's edge: the visitor is the address the edge got
  // the request from, the entry just before it. Only that one Cloudflare
  // address is passed over, so a request sent from inside Cloudflare (a
  // Worker) counts as its Cloudflare address, never as an entry its
  // sender typed further left.
  if (i >= 0 && inList(CLOUDFLARE, chain[i])) return chain[Math.max(i - 1, 0)];
  if (behindCloudflare && i >= 0) return chain[i];
  // One proxy, which wrote the address it saw last.
  return chain[chain.length - 1];
}

// Where the visitor's address is read (see the top of this file):
// "cloudflare" (Render), "forwarded" (one proxy) or "socket" (no proxy).
export function proxyMode(env = process.env) {
  const value = String(env.ATLAS_TRUST_PROXY ?? "").trim().toLowerCase();
  if (value === "cloudflare") return "cloudflare";
  // Every request to a web service on Render comes through Cloudflare.
  if (onRender(env) && (value === "" || flag(value))) return "cloudflare";
  return flag(value) ? "forwarded" : "socket";
}

// Said once in the server's log when CF-Connecting-IP is missing where it
// should always be: only the kinds of the addresses in X-Forwarded-For,
// never the addresses (they are the visitors').
function warnNoCloudflareHeader(forwarded) {
  if (memory.warnedNoCloudflareHeader) return;
  memory.warnedNoCloudflareHeader = true;
  const kinds = String(forwarded ?? "")
    .split(",")
    .map(normalizeIp)
    .filter(Boolean)
    .map((ip) => (inList(INTERNAL, ip) ? "private" : inList(CLOUDFLARE, ip) ? "Cloudflare" : "public"));
  console.warn(
    `[chernozem] A request came without CF-Connecting-IP, which Cloudflare (in front of every Render service) always sets, so the wrong-code limit read X-Forwarded-For instead (its addresses: ${kinds.join(", ") || "none"}). Said once.`
  );
}

// "2001:db8::1" -> its 8 groups as numbers.
function ipv6Groups(ip) {
  let text = ip;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((group) => parseInt(group, 16));
}

// What the wrong-code limit counts: an IPv4 address, or an IPv6 /64.
export function limitKey(ip) {
  if (!ip) return "unknown";
  if (isIP(ip) !== 6) return ip;
  return `${ipv6Groups(ip).slice(0, 4).map((n) => n.toString(16)).join(":")}::/64`;
}

// The visitor's address for the wrong-code limits (here and in
// server/import.js).
export function clientAddress(req) {
  const headers = req.headers || {};
  const mode = proxyMode();
  let ip = null;
  if (mode === "cloudflare") {
    ip = normalizeIp(headers["cf-connecting-ip"]);
    if (!ip) {
      warnNoCloudflareHeader(headers["x-forwarded-for"]);
      ip = visitorFromForwarded(headers["x-forwarded-for"], { behindCloudflare: true });
    }
  } else if (mode === "forwarded") {
    ip = visitorFromForwarded(headers["x-forwarded-for"]);
  }
  return limitKey(ip || normalizeIp(req.socket?.remoteAddress));
}

function cookieLine(req, name, token, maxAgeSec) {
  const parts = [`${name}=${token}`, "Path=/", `Max-Age=${maxAgeSec}`, "HttpOnly", "SameSite=Lax"];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

// The Set-Cookie line for the access code's cookie (token "" with 0
// seconds removes it; server/accounts.js does that at an account sign-in).
export function sessionCookie(req, token, maxAgeSec) {
  return cookieLine(req, COOKIE_NAME, token, maxAgeSec);
}

// The Set-Cookie line for a registered account's cookie (server/accounts.js
// sets it after a Firebase sign-in).
export function accountCookie(req, token, maxAgeSec = Math.floor(SESSION_MS / 1000)) {
  return cookieLine(req, ACCOUNT_COOKIE_NAME, token, maxAgeSec);
}

// True when this request carries a valid sign-in cookie (the access code's).
export async function isSignedIn(req, code = accessCode()) {
  if (codeRefusedOnline(code)) return false;
  if (!code) return true;
  const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
  if (!token) return false;
  return verifySession(token, deriveSecret(code, await installSalt()));
}

// The account id in this request's account cookie, when the cookie is
// valid and has not run out; else null (no cookie, a changed one, an old
// one: all the same, not signed in).
export async function accountUidOf(req) {
  const token = parseCookies(req.headers?.cookie)[ACCOUNT_COOKIE_NAME];
  if (!token) return null;
  return verifyAccountSession(token, deriveAccountSecret(await installSalt()));
}

// The registered account this request belongs to, with its profile read
// from its own folder: { kind: "account", root, account }, or null when
// the request carries no valid account cookie.
async function accountSession(req) {
  const uid = await accountUidOf(req);
  if (!uid) return null;
  const root = userRoot(uid);
  const profile = await withDataRoot(root, () => getProfile());
  return { kind: "account", root, account: accountSummary(uid, profile) };
}

// The shared workspace (the demo): the base folder, no account.
const codeSession = () => ({ kind: "code", root: baseDataDir(), account: null });

// Called by server/app.js for every /api/ request, before any route.
// Answers /api/auth/... itself (gives back false: nothing more to do). For
// everything else it gives back the session the route runs in,
//   { kind: "account", root: <the account's folder>, account: { uid,
//     email, name, product, profileComplete } }  a registered account
//   { kind: "code", root: <the base folder>, account: null }  the access
//     code's shared workspace (or everything, without a code)
// or refuses with 401 when a code is set and this browser has neither
// signed in with it nor a registered account.
export async function handleAuth(req, res, { method, first, second, third }) {
  const code = accessCode();
  // Online with a code that cannot lock the app: locked whatever is typed.
  const refused = codeRefusedOnline(code);
  const required = Boolean(code) || refused;

  if (first !== "auth") {
    const account = await accountSession(req);
    if (account) return account;
    if (required && !(await isSignedIn(req, code))) {
      throw new HttpError(401, "auth_required", "Enter the access code to continue.");
    }
    return codeSession();
  }

  if (second === "status" && !third && method === "GET") {
    const account = await accountSession(req);
    if (account) sendJson(res, 200, { required, signedIn: true, shared: false, account: account.account });
    else sendJson(res, 200, { required, signedIn: await isSignedIn(req, code), shared: required, account: null });
    return false;
  }

  if (second === "login" && !third && method === "POST") {
    const body = await readJson(req);
    if (refused) {
      throw new HttpError(
        503,
        "access_code_off",
        `The app stays locked: the access code set on the server (ATLAS_ACCESS_CODE) is missing, shorter than ${ACCESS_CODE_MIN_LENGTH} characters or the example from the docs. Whoever runs the server must set a new one.`
      );
    }
    if (!code) {
      // Nothing to sign in to; but a browser that was a registered account
      // asked for the shared workspace, so that cookie goes.
      if (parseCookies(req.headers?.cookie)[ACCOUNT_COOKIE_NAME]) res.setHeader("Set-Cookie", accountCookie(req, "", 0));
      sendJson(res, 200, { ok: true, required: false, signedIn: true, shared: false, account: null });
      return false;
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
    // The code's workspace from now on: an account cookie left in this
    // browser would otherwise still win (see handleAuth above).
    res.setHeader("Set-Cookie", [sessionCookie(req, token, Math.floor(SESSION_MS / 1000)), accountCookie(req, "", 0)]);
    sendJson(res, 200, { ok: true, required: true, signedIn: true, shared: true, account: null });
    return false;
  }

  // A registered account's sign-in (server/accounts.js).
  if (second === "firebase" && !third && method === "POST") {
    await handleFirebaseSignIn(req, res);
    return false;
  }

  if (second === "logout" && !third && method === "POST") {
    res.setHeader("Set-Cookie", [sessionCookie(req, "", 0), accountCookie(req, "", 0)]);
    sendJson(res, 200, { ok: true, required, signedIn: !required, shared: required, account: null });
    return false;
  }

  if (["status", "login", "firebase", "logout"].includes(second) && !third) {
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on /api/auth/${second}.`);
  }
  throw new HttpError(404, "not_found", "No such sign-in route.");
}
