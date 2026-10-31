// WHAT THIS FILE DOES
// Who is asking. Every /api/ request belongs to one of four sessions:
//
//   owner    the owner, signed in with Google on the hidden page /owner
//            (linked from nowhere): a Firebase account whose e-mail address
//            Google has verified and that is listed in OWNER_EMAILS (blank:
//            chernozem.app@gmail.com; capitals do not matter). The demo's
//            own data folder, where everything can be changed, both
//            products, and the website's messages.
//   open     one's own computer, not online, with no ATLAS_ACCESS_CODE set:
//            the same powers as the owner, for whoever asks ("npm start"
//            then answers this computer only: server/index.js). Never on
//            Render.
//   account  a registered account's cookie (server/accounts.js): its own
//            folder users/<id>/, the one product it chose, the limits of
//            server/quotas.js.
//   demo     everyone else: the public demo (the Ukraine farm and areas,
//            both products), READ-ONLY. Online (on Render) every visitor
//            without a cookie is the demo, whatever is set; on one's own
//            computer too once ATLAS_ACCESS_CODE is set (to anything).
//            Also any request with the header "X-Chernozem-View: demo"
//            (DEMO_VIEW_HEADER; the website's Demo page sets it for one
//            browser tab: src/lib/demoMode.js), unless it also brings the
//            owner's cookie. The header can only lower a session, never
//            raise one: an account's cookie is ignored for that request,
//            and the owner stays the owner.
//
// THE OLD ACCESS CODE IS RETIRED (31 October 2026). It was handed out to
// visitors to open the demo, so it must never become an owner's key:
// POST /api/auth/login answers 410 owner_key_retired ("The owner signs in
// with the Chernozem Google account at /owner."), and the atlas_session
// cookies it made are never read (Sign out and every sign-in still remove
// them from the browser). ATLAS_ACCESS_CODE is now only a switch for one's
// own computer: set, visitors get the read-only demo as online; online it
// changes nothing (the owner may delete it on Render).
//
// In the demo every change is refused with 403 demo_read_only ("This is
// the demo, so it can't be changed. Register to do this on your own
// land.": server/app.js), except the AI assistant's questions, whose
// chats live in this server's memory per visitor (server/ai/demoChats.js);
// and nothing a demo request asks for starts a job or Earth Engine work
// (server/session.js says which files check).
//
//   GET  /api/auth/status    { required, signedIn, shared, account, mode,
//                            readOnly }: mode "owner" | "open" | "account"
//                            | "demo"; readOnly true in the demo only;
//                            signedIn false in the demo only; shared true
//                            for the owner, open and the demo (the one
//                            workspace everyone sees), false for an
//                            account; account null for open and the demo,
//                            { uid, email, name, product, profileComplete }
//                            for an account, and the same with owner: true
//                            for the owner (profileComplete is always true
//                            there: the owner needs no profile); required:
//                            a visitor without a cookie is the read-only
//                            demo here (always online). The page asks this
//                            first.
//   POST /api/auth/firebase  body { idToken } -> a Google or e-mail sign-in
//                            through Firebase (server/accounts.js): the
//                            owner's cookie for the owner's verified
//                            e-mail, else the account cookie
//   POST /api/auth/logout    removes every cookie (the sidebar's "Sign
//                            out"); for an account or the owner it also
//                            ends every cookie made for it so far (below)
//   POST /api/auth/login     retired: 410 owner_key_retired
//
// THE COOKIES
//   chernozem_owner     the owner's (30 days), set only by a sign-in whose
//                       Firebase token says the e-mail is verified and the
//                       owner's: "<uid>.<made at>.<expires at>.<random>.
//                       <signature>", signed with a secret made from this
//                       install's salt and the word "owner"
//   chernozem_account   a registered account's (30 days): the same shape,
//                       signed with the salt and the word "accounts" (so
//                       neither cookie can pass for the other), checked in
//                       constant time. Both carry only the account id and
//                       the times: the e-mail, name and product are read
//                       from the account's profile.json on every request.
//   chernozem_demo      a demo visitor's random number (1 day), made at
//                       the visitor's first question to the demo's AI
//                       assistant, so their chats (kept in memory, never
//                       on disk) are theirs only: server/ai/demoChats.js
//   atlas_session       the retired code's: never read, only removed
// Without the demo header, a browser with a valid account cookie is that
// account; else the owner's cookie makes it the owner; else it is open or
// the demo (above). handleAuth gives server/app.js the session, { kind:
// "owner" | "open" | "account" | "demo", root, account, readOnly }, and
// app.js runs the route inside that root and that session
// (server/session.js withSession).
//
// WHEN A COOKIE STOPS COUNTING (before its 30 days)
// A cookie is a signed note; the server cannot take it back from a browser
// that keeps a copy. So, on every request, the owner's and an account's
// cookie are also checked against:
//   - the account's session.json (server/store.js): "Sign out" writes the
//     moment into it (server/accounts.js signOutAccount), and a cookie
//     made before that moment is nobody. A sign-in after it makes a newer
//     cookie, which counts. (Firebase's own sessions are ended too, and a
//     Firebase sign-in from before the moment is refused: accounts.js.)
//   - Firebase itself, at most once an hour per account
//     (server/accounts.js firebaseUserState): the user still exists and is
//     not disabled, and, for the owner, its e-mail is still verified and
//     still in OWNER_EMAILS. Deleted, disabled or no longer the owner's: the
//     cookie is nobody within the hour.
// An owner's Google account is never an ordinary account as well: an
// account cookie whose account now has a verified owner's e-mail is nobody.
//
// Also here, for every /api/ route (server/app.js calls assertSameSite
// first): a request that changes something is refused (403 cross_site)
// when a browser says another website sent it. See "Requests sent by
// other websites" below.
//
// THE VISITOR'S ADDRESS (clientAddress below: the contact form's, the demo
// assistant's, the demo place search's and the data upload's limits use it)
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
// addresses inside it), or by its /48 where asked (the contact form and
// the demo's assistant: one provider's customer often holds a whole /48).
//
// WHO EDITS IT
// Nobody, normally. The settings are OWNER_EMAILS and ATLAS_ACCESS_CODE in
// .env (see .env.example and docs/DEPLOY.md, "The public demo and the
// owner").

import fs from "node:fs/promises";
import path from "node:path";
import { BlockList, isIP } from "node:net";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config, onRender, refreshEnv } from "./env.js";
import { baseDataDir, getProfile, getSessionFile, userRoot, withDataRoot } from "./store.js";
import { HttpError, sendJson } from "./http.js";
// (accounts.js imports this file too; both only use each other inside
// functions, so the circle is harmless.)
import { accountSummary, firebaseUserState, handleFirebaseSignIn, ownerSummary, signOutAccount } from "./accounts.js";

export const OWNER_COOKIE_NAME = "chernozem_owner";
export const ACCOUNT_COOKIE_NAME = "chernozem_account";
export const DEMO_COOKIE_NAME = "chernozem_demo";
// The retired access code's cookie: never read, only removed.
export const RETIRED_COOKIE_NAME = "atlas_session";
export const DEMO_COOKIE_SECONDS = 24 * 60 * 60;
// The header a browser tab sends while it looks at the public demo (keep
// it the same as DEMO_VIEW_HEADER in src/lib/demoMode.js). Node gives
// header names in small letters.
export const DEMO_VIEW_HEADER = "X-Chernozem-View";
export const SESSION_DAYS = 30;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
// The wrong-try limit's defaults (createLoginLimiter; the data upload's
// wrong tokens use them).
export const MAX_FAILED_LOGINS = 10;
export const FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000;
// How many visitors such a limit remembers at most.
export const MAX_LIMITER_KEYS = 50_000;
export const OWNER_KEY_RETIRED_MESSAGE = "The owner signs in with the Chernozem Google account at /owner.";

// Kept on globalThis so the dev server, which reloads this file after
// edits, keeps the salt it read.
const memory = (globalThis.__chernozemAuth ??= { salts: new Map() });

// ---------- Settings ----------

// ATLAS_ACCESS_CODE in .env, or null when it is not set. No longer a key
// (see the top of this file): only "visitors are the demo" on one's own
// computer.
export function accessCode() {
  refreshEnv();
  return (process.env.ATLAS_ACCESS_CODE || "").trim() || null;
}

// True when a visitor without a cookie is the read-only demo rather than
// open: always online (on Render), and on one's own computer once
// ATLAS_ACCESS_CODE is set. (The status's "required".)
export function visitorsSeeDemo() {
  return onRender() || Boolean(accessCode());
}

// True when this e-mail address is one of the owner's (OWNER_EMAILS).
// Whether Google verified it is checked by the callers.
export function isOwnerEmail(email) {
  if (typeof email !== "string" || !email.trim()) return false;
  return config().ownerEmails.includes(email.trim().toLowerCase());
}

const flag = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

// ---------- Signing (pure: easy to test) ----------

const base64url = (buffer) => buffer.toString("base64url");

function signature(secret, payload) {
  return base64url(createHmac("sha256", secret).update(payload).digest());
}

// Compares two texts in constant time, whatever their lengths (both are
// hashed to 32 bytes first). The data upload's token check uses it
// (server/import.js).
export function codesMatch(given, actual) {
  const hash = (text) => createHash("sha256").update(String(text)).digest();
  return timingSafeEqual(hash(given), hash(actual));
}

// A Firebase account id: letters, digits, "_" and "-" (Firebase makes 28
// letters and digits; custom ids may be longer). No dots, so the token's
// parts stay apart.
const UID = /^[A-Za-z0-9_-]{1,128}$/;
export const isUid = (value) => typeof value === "string" && UID.test(value);

// The secret for account cookies: this install's salt and the word
// "accounts" (a new salt signs everyone out, the owner included).
export function deriveAccountSecret(salt) {
  return createHmac("sha256", String(salt)).update("accounts").digest();
}

// The secret for the owner's cookie: the salt and the word "owner", so an
// account cookie can never pass for the owner's, nor the other way round.
export function deriveOwnerSecret(salt) {
  return createHmac("sha256", String(salt)).update("owner").digest();
}

// Makes a token (the owner's or an account's, by the secret): "<uid>.<made
// at, ms>.<expires at, ms>.<random>.<signature>". The time it was made at
// lets a sign-out end it (see the top of this file).
export function signAccountSession(secret, uid, { now = Date.now(), maxAgeMs = SESSION_MS } = {}) {
  if (!isUid(uid)) throw new Error("signAccountSession needs a Firebase account id.");
  const payload = `${uid}.${now}.${now + maxAgeMs}.${base64url(randomBytes(16))}`;
  return `${payload}.${signature(secret, payload)}`;
}

const ACCOUNT_TOKEN = /^([A-Za-z0-9_-]{1,128})\.(\d{1,16})\.(\d{1,16})\.([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/;

// { uid, issuedAt, expiresAt } (the account id and the times, ms) when the
// token was made by signAccountSession with this secret and has not run
// out; else null. (A cookie of the older shape, without the time it was
// made at, is null too: those browsers sign in again once.)
export function verifyAccountSession(token, secret, { now = Date.now() } = {}) {
  const match = typeof token === "string" ? ACCOUNT_TOKEN.exec(token) : null;
  if (!match) return null;
  const [, uid, issued, expires, nonce, given] = match;
  const expected = Buffer.from(signature(secret, `${uid}.${issued}.${expires}.${nonce}`));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  if (!(Number(expires) > now)) return null;
  return { uid, issuedAt: Number(issued), expiresAt: Number(expires) };
}

// ---------- A limit on wrong tries ----------

// Counts wrong tries per visitor (the data upload's wrong tokens, the demo
// place search's lookups). After `max` inside `windowMs` the visitor must
// wait until the oldest one is older than windowMs. Memory stays small and
// every try quick, however many addresses someone makes up: visitors
// whose tries have all run out are swept away at most once per
// sweepEveryMs, and above maxKeys visitors the one whose last try is
// oldest is forgotten first. (Kept in memory only: the limits that must
// outlive a restart are in server/counters.js.)
export function createLoginLimiter({
  max = MAX_FAILED_LOGINS,
  windowMs = FAILED_LOGIN_WINDOW_MS,
  maxKeys = MAX_LIMITER_KEYS,
  sweepEveryMs = 60 * 1000,
} = {}) {
  // visitor -> [times of tries]. A Map keeps the order its keys were added
  // in; each try moves its visitor to the end, so the first key is always
  // the visitor whose last try is oldest.
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
// open: that website could otherwise sign the visitor out, or change the
// workspace with their cookie. Browsers say where a request came from:
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
    `[chernozem] A request came without CF-Connecting-IP, which Cloudflare (in front of every Render service) always sets, so the visitor's address was read from X-Forwarded-For instead (its addresses: ${kinds.join(", ") || "none"}). Said once.`
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

// What a limit counts: an IPv4 address, or an IPv6 network: its /64
// (ipv6Bits 64, the default) or its /48 (ipv6Bits 48).
export function limitKey(ip, { ipv6Bits = 64 } = {}) {
  if (!ip) return "unknown";
  if (isIP(ip) !== 6) return ip;
  const bits = ipv6Bits === 48 ? 48 : 64;
  return `${ipv6Groups(ip).slice(0, bits / 16).map((n) => n.toString(16)).join(":")}::/${bits}`;
}

// The visitor's address for the limits per visitor (see the top of this
// file). ipv6Bits: 48 to count an IPv6 visitor by its /48.
export function clientAddress(req, { ipv6Bits = 64 } = {}) {
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
  return limitKey(ip || normalizeIp(req.socket?.remoteAddress), { ipv6Bits });
}

function cookieLine(req, name, token, maxAgeSec) {
  const parts = [`${name}=${token}`, "Path=/", `Max-Age=${maxAgeSec}`, "HttpOnly", "SameSite=Lax"];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

// The Set-Cookie line for the owner's cookie (token "" with 0 seconds
// removes it; server/accounts.js sets it after the owner's sign-in).
export function ownerCookie(req, token, maxAgeSec = Math.floor(SESSION_MS / 1000)) {
  return cookieLine(req, OWNER_COOKIE_NAME, token, maxAgeSec);
}

// The Set-Cookie line for a registered account's cookie (server/accounts.js
// sets it after a Firebase sign-in).
export function accountCookie(req, token, maxAgeSec = Math.floor(SESSION_MS / 1000)) {
  return cookieLine(req, ACCOUNT_COOKIE_NAME, token, maxAgeSec);
}

// The Set-Cookie line that removes the retired code's cookie.
export function retiredCookieRemoval(req) {
  return cookieLine(req, RETIRED_COOKIE_NAME, "", 0);
}

// The Set-Cookie line for a demo visitor's number (server/ai/demoChats.js
// sets it at the visitor's questions to the demo's assistant; 1 day).
export function demoCookie(req, value, maxAgeSec = DEMO_COOKIE_SECONDS) {
  return cookieLine(req, DEMO_COOKIE_NAME, value, maxAgeSec);
}

// True when this request asks for the public demo with the header
// "X-Chernozem-View: demo" (see the top of this file).
export function wantsDemoView(req) {
  const value = req.headers?.[DEMO_VIEW_HEADER.toLowerCase()];
  if (String(Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase() === "demo") return true;
  // Plain links (a download, a photo in an <img>) cannot send a header, so
  // a read may say "?view=demo" instead (src/api/fieldApi.js exportUrl,
  // photoUrl). Like the header, it can only lower a session to the demo.
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  try {
    return new URL(req.url || "/", "http://localhost").searchParams.get("view") === "demo";
  } catch {
    return false;
  }
}

// What this request's account cookie says, { uid, issuedAt, expiresAt },
// when the cookie is properly signed and has not run out; else null (no
// cookie, a changed one, an old one: all the same, not signed in). Only
// the cookie itself is checked here; accountSession adds the sign-out and
// Firebase checks.
export async function accountTokenOf(req) {
  const token = parseCookies(req.headers?.cookie)[ACCOUNT_COOKIE_NAME];
  if (!token) return null;
  return verifyAccountSession(token, deriveAccountSecret(await installSalt()));
}

// The same for the owner's cookie.
export async function ownerTokenOf(req) {
  const token = parseCookies(req.headers?.cookie)[OWNER_COOKIE_NAME];
  if (!token) return null;
  return verifyAccountSession(token, deriveOwnerSecret(await installSalt()));
}

// The account a signed cookie names, while that cookie still counts (see
// "WHEN A COOKIE STOPS COUNTING" at the top of this file): { uid, root,
// profile, user: { ok, email, emailVerified } }, or null.
async function stillSignedIn({ uid, issuedAt }) {
  const root = userRoot(uid);
  const [profile, signedOut] = await withDataRoot(root, () => Promise.all([getProfile(), getSessionFile()]));
  const validFrom = Date.parse(signedOut?.sessionsValidFrom || "");
  if (Number.isFinite(validFrom) && issuedAt < validFrom) return null;
  const user = await firebaseUserState(uid, profile);
  if (!user.ok) return null;
  return { uid, root, profile, user };
}

const isOwnersUser = (user) => user.emailVerified === true && isOwnerEmail(user.email);

// The registered account this request belongs to, with its profile read
// from its own folder: { kind: "account", root, account, readOnly: false,
// emailVerified }, or null (no valid account cookie, signed out since, the
// Firebase user gone or disabled, or the owner's own Google account).
async function accountSession(req) {
  const token = await accountTokenOf(req);
  if (!token) return null;
  const found = await stillSignedIn(token);
  if (!found || isOwnersUser(found.user)) return null;
  return { kind: "account", root: found.root, account: accountSummary(found.uid, found.profile), readOnly: false, emailVerified: found.user.emailVerified === true };
}

// The owner, when this request brings the owner's cookie and it still
// counts: { kind: "owner", root: <the base folder>, account: { ...,
// owner: true }, readOnly: false }, or null.
async function ownerSession(req) {
  const token = await ownerTokenOf(req);
  if (!token) return null;
  const found = await stillSignedIn(token);
  if (!found || !isOwnersUser(found.user)) return null;
  return { kind: "owner", root: baseDataDir(), account: ownerSummary(found.uid, found.profile, found.user.email), readOnly: false };
}

// The demo's own folder (the base folder), open or read-only.
const baseSession = (kind) => ({ kind, root: baseDataDir(), account: null, readOnly: kind === "demo" });

// The session this request runs in (see the top of this file):
//   the demo header: the owner stays the owner; anyone else is the demo
//   no header:       a registered account; else the owner; else open (one's
//                    own computer without ATLAS_ACCESS_CODE) or the demo
export async function sessionOf(req) {
  if (wantsDemoView(req)) return (await ownerSession(req)) || baseSession("demo");
  const account = await accountSession(req);
  if (account) return account;
  const owner = await ownerSession(req);
  if (owner) return owner;
  return baseSession(visitorsSeeDemo() ? "demo" : "open");
}

// What GET /api/auth/status (and the sign-out answer) say about a session:
// { required, signedIn, shared, account, mode, readOnly }.
export function statusOf(session, required) {
  return {
    required,
    signedIn: session.kind !== "demo",
    shared: session.kind !== "account",
    account: session.kind === "account" || session.kind === "owner" ? session.account || null : null,
    mode: session.kind,
    readOnly: session.kind === "demo",
  };
}

// Called by server/app.js for every /api/ request, before any route.
// Answers /api/auth/... itself (gives back false: nothing more to do). For
// everything else it gives back the session the route runs in (sessionOf
// above):
//   { kind: "owner", root: <the base folder>, account: { ..., owner: true }, readOnly: false }
//   { kind: "open", root: <the base folder>, account: null, readOnly: false }
//   { kind: "account", root: <the account's folder>, account: { uid,
//     email, name, product, profileComplete }, readOnly: false, emailVerified }
//   { kind: "demo", root: <the base folder>, account: null, readOnly: true }
// Nobody is turned away here: a visitor without a cookie is the read-only
// demo (server/app.js refuses the changes), or open on one's own computer.
export async function handleAuth(req, res, { method, first, second, third }) {
  const required = visitorsSeeDemo();

  if (first !== "auth") return sessionOf(req);

  if (second === "status" && !third && method === "GET") {
    sendJson(res, 200, statusOf(await sessionOf(req), required));
    return false;
  }

  // The retired access code (see the top of this file), whatever is sent.
  if (second === "login" && !third) {
    throw new HttpError(410, "owner_key_retired", OWNER_KEY_RETIRED_MESSAGE);
  }

  // A Google or e-mail sign-in through Firebase: the owner or an account
  // (server/accounts.js).
  if (second === "firebase" && !third && method === "POST") {
    await handleFirebaseSignIn(req, res);
    return false;
  }

  if (second === "logout" && !third && method === "POST") {
    // An account or the owner: every cookie made for it so far stops
    // counting (server/accounts.js signOutAccount), not only the one this
    // browser drops. Only a cookie that still counts can do that: a copy
    // kept from before an earlier sign-out cannot sign the person out of
    // Firebase on their other devices again and again. (Also with the demo
    // header: "Sign out" is never only a look.)
    const signedIn = (await accountSession(req)) || (await ownerSession(req));
    if (signedIn) await signOutAccount(signedIn.account.uid);
    res.setHeader("Set-Cookie", [ownerCookie(req, "", 0), accountCookie(req, "", 0), retiredCookieRemoval(req)]);
    // Without its cookies the browser is the demo, or open on one's own
    // computer without ATLAS_ACCESS_CODE.
    const after = required || wantsDemoView(req) ? "demo" : "open";
    sendJson(res, 200, { ok: true, ...statusOf(baseSession(after), required) });
    return false;
  }

  if (["status", "firebase", "logout"].includes(second) && !third) {
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on /api/auth/${second}.`);
  }
  throw new HttpError(404, "not_found", "No such sign-in route.");
}
