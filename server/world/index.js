// WHAT THIS FILE DOES
// The public website's world feed: GET /api/world/crises answers with the
// wars and natural disasters touching farmland right now, for the globe on
// the About page. Three things go into it:
//   1. GDACS, live (server/world/gdacs.js): floods, droughts, wildfires,
//      storms, earthquakes and volcanoes;
//   2. the reviewed list of wars (server/world/conflicts.js);
//   3. the app's own Ukraine measurement (the numbers the website quotes),
//      attached to the Ukraine war as "measured".
// Open to anyone, no access code, read-only (server/app.js sends
// /api/world/... here before the access code).
//
// The answer is kept in memory for an hour. GDACS is slow and sometimes
// down, so: the six kinds are fetched at the same time with 10 seconds
// each; a kind that fails keeps its last good copy for up to 24 hours (said
// in "sources") and is tried again after a few minutes; once there is a
// copy, a visitor never waits for a refresh (it runs behind the answer);
// and the wars and the Ukraine numbers always answer, even with GDACS down.
// Only the very first request after a start waits for GDACS.
//
// Browsers and Cloudflare may keep the answer for 10 minutes
// (Cache-Control: public, max-age=600).
//
// The answer:
//   { updated, counts: { wars, disasters }, sources: [ { name, url, ... } ],
//     events: [ { id, kind, iso3, country, name, lat, lng, level, since,
//                 until?, note, source, url?, count?, areaHa?, also?, measured? } ] }
//   kind: war | flood | drought | wildfire | storm | earthquake | volcano
//   level: red | orange | green | null (wars have no level)
//   source: "GDACS" | "Reviewed list"
//
// WHO EDITS IT
// Whoever changes the globe's data.

import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { ROOT } from "../env.js";
import { acceptsGzip, sendError } from "../http.js";
import { WORLD_CONFLICTS, WORLD_CONFLICTS_REVIEWED } from "./conflicts.js";
import { GDACS_KINDS, GDACS_SITE, fetchGdacs } from "./gdacs.js";

// The app's own measurement of Ukraine, from the September 2026 Atlas run.
// A copy of NUMBERS in src/site/content/site.js (heavyDamageHa,
// peopleOnDamagedSoil, ukraineMonth): the website quotes the same numbers,
// so keep the two equal (world.test.js checks).
export const UKRAINE_MEASURED = Object.freeze({
  heavyDamageHa: 1780400,
  peopleOnDamagedSoil: 1204041,
  month: "September 2026",
});

export const FRESH_MS = 60 * 60 * 1000; // a good answer is kept this long
export const STALE_MS = 24 * 60 * 60 * 1000; // a failed kind keeps its old copy this long
export const RETRY_MS = 3 * 60 * 1000; // a failed kind is tried again after this
export const CACHE_CONTROL = "public, max-age=600";

const COUNTRIES_FILE = path.join(ROOT, "public", "site", "world", "countries.json");
const CONFLICTS_URL = "https://github.com/willpan0921/Chernozem-APP/blob/main/server/world/conflicts.js";

// ---------- Test hooks ----------

// setDepsForTests({ fetch, now, timeoutMs, conflicts, countries }) swaps the
// network, the clock, the war list or the country centres; it also empties
// the cache. Pass nothing to go back to the real ones.
let deps = {};
export function setDepsForTests(overrides) {
  deps = overrides || {};
  resetWorldCache();
}
const now = () => (deps.now ? deps.now() : Date.now());

// What is remembered between requests.
const state = { perType: {}, answer: null, encoded: null, inFlight: null };
export function resetWorldCache() {
  state.perType = {};
  state.answer = null;
  state.encoded = null;
  state.inFlight = null;
}

// ---------- Country names ----------

let countriesCache = null;
function countries() {
  if (deps.countries) return deps.countries;
  if (!countriesCache) {
    try {
      countriesCache = JSON.parse(fs.readFileSync(COUNTRIES_FILE, "utf8"));
    } catch {
      countriesCache = {};
    }
  }
  return countriesCache;
}

// countries.json writes "Syrian Arab Republic" and "Congo, Democratic
// Republic of the"; the website says "Syria" and "DR Congo".
const PLAIN_NAMES = {
  COD: "DR Congo",
  COG: "Republic of the Congo",
  SYR: "Syria",
  RUS: "Russia",
  PSE: "Palestine",
  LAO: "Laos",
  KOR: "South Korea",
  PRK: "North Korea",
  USA: "United States",
  VNM: "Vietnam",
  BRN: "Brunei",
  FSM: "Micronesia",
  GBR: "United Kingdom",
  TUR: "Türkiye",
  CZE: "Czechia",
};
export function plainCountryName(iso3, name) {
  if (PLAIN_NAMES[iso3]) return PLAIN_NAMES[iso3];
  const text = String(name || "").trim();
  if (!text) return iso3 || "";
  return text.includes(", ") ? text.split(", ")[0] : text;
}

// ---------- Building the feed ----------

const LEVEL_RANK = { red: 3, orange: 2, green: 1 };

// The reviewed wars as events. The marker sits where the list says, else
// at the country's centre.
export function warEvents() {
  const centres = countries();
  return (deps.conflicts || WORLD_CONFLICTS).map((war) => {
    const centre = centres[war.iso3] || {};
    const event = {
      id: `war-${war.id}`,
      kind: "war",
      iso3: war.iso3,
      country: plainCountryName(war.iso3, centre.name),
      name: war.name,
      lat: Number.isFinite(war.lat) ? war.lat : centre.lat ?? 0,
      lng: Number.isFinite(war.lng) ? war.lng : centre.lng ?? 0,
      level: null,
      since: war.since,
      note: war.note,
      source: "Reviewed list",
    };
    if (Array.isArray(war.also) && war.also.length) event.also = [...war.also];
    if (war.id === "ukraine" || war.iso3 === "UKR") event.measured = { ...UKRAINE_MEASURED };
    return event;
  });
}

// The whole answer from what is remembered per kind. perType[TYPE] =
// { events | null, fetchedAt, stale, error }.
export function buildWorldFeed({ perType = {}, at = Date.now() } = {}) {
  const centres = countries();
  const disasters = [];
  const missing = [];
  const stale = [];
  let fetched = 0;
  for (const [type, rule] of Object.entries(GDACS_KINDS)) {
    const entry = perType[type];
    if (!entry || !Array.isArray(entry.events)) {
      missing.push(rule.kind);
      continue;
    }
    if (entry.stale) stale.push(rule.kind);
    fetched = Math.max(fetched, entry.fetchedAt || 0);
    for (const event of entry.events) {
      disasters.push(event.country ? event : { ...event, country: plainCountryName(event.iso3, centres[event.iso3]?.name) });
    }
  }
  disasters.sort((a, b) => (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0) || a.name.localeCompare(b.name));
  const wars = warEvents();
  const gdacs = { name: "GDACS", url: GDACS_SITE, fetched: fetched ? new Date(fetched).toISOString() : null };
  if (missing.length) gdacs.missing = missing;
  if (stale.length) gdacs.stale = stale;
  return {
    updated: new Date(at).toISOString(),
    counts: { wars: wars.length, disasters: disasters.length },
    sources: [gdacs, { name: "Reviewed list", url: CONFLICTS_URL, reviewed: WORLD_CONFLICTS_REVIEWED }],
    events: [...wars, ...disasters],
  };
}

// ---------- The cache ----------

// Which kinds are due: never fetched, or past their next try.
function dueTypes(at) {
  return Object.keys(GDACS_KINDS).filter((type) => !state.perType[type] || at >= state.perType[type].nextTryAt);
}

// Fetches the kinds that are due and rebuilds the answer. Never throws.
// Only one refresh runs at a time; a second caller shares it.
export function refreshWorldFeed() {
  if (state.inFlight) return state.inFlight;
  state.inFlight = (async () => {
    const at = now();
    const types = dueTypes(at);
    let result = {};
    if (types.length) {
      try {
        result = await fetchGdacs({ types, fetch: deps.fetch || globalThis.fetch, now: at, timeoutMs: deps.timeoutMs });
      } catch (error) {
        console.warn(`[chernozem] GDACS could not be asked: ${error.message}`);
      }
    }
    for (const type of types) {
      const got = result[type];
      if (got?.ok) {
        state.perType[type] = { events: got.events, fetchedAt: at, nextTryAt: at + FRESH_MS, stale: false, error: null };
        continue;
      }
      const message = got?.error || "no answer";
      const old = state.perType[type];
      const keepOld = Boolean(old && Array.isArray(old.events) && at - old.fetchedAt <= STALE_MS);
      state.perType[type] = keepOld
        ? { ...old, nextTryAt: at + RETRY_MS, stale: true, error: message }
        : { events: null, fetchedAt: old?.fetchedAt || 0, nextTryAt: at + RETRY_MS, stale: false, error: message };
      console.warn(`[chernozem] GDACS ${GDACS_KINDS[type].kind}s: ${message}${keepOld ? " (serving the last good copy)" : ""}`);
    }
    state.answer = buildWorldFeed({ perType: state.perType, at });
    state.encoded = null;
  })().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

// The answer for a request: the remembered one at once (a refresh, when
// due, runs behind it), or the first one when there is none yet.
export async function getWorldFeed() {
  if (!state.answer) {
    await refreshWorldFeed();
    return state.answer;
  }
  if (dueTypes(now()).length) refreshWorldFeed().catch(() => {});
  return state.answer;
}

// For server/index.js, if it wants the feed ready before the first visitor.
export function warmWorldFeed() {
  return refreshWorldFeed();
}

// ---------- The route ----------

// The JSON (and its gzipped copy) are made once per answer.
function encoded(feed) {
  if (!state.encoded || state.encoded.feed !== feed) {
    const json = Buffer.from(JSON.stringify(feed));
    state.encoded = { feed, json, gzip: gzipSync(json) };
  }
  return state.encoded;
}

function sendFeed(req, res, feed) {
  const { json, gzip } = encoded(feed);
  const zipped = acceptsGzip(req.headers?.["accept-encoding"]);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("Vary", "Accept-Encoding");
  if (zipped) res.setHeader("Content-Encoding", "gzip");
  const payload = zipped ? gzip : json;
  res.setHeader("Content-Length", payload.length);
  if ((req.method || "GET").toUpperCase() === "HEAD") return res.end();
  res.end(payload);
}

// GET /api/world/crises. Always answers (true), even when GDACS is down.
export async function handleWorld(req, res, { method, parts } = {}) {
  const verb = (method || req.method || "GET").toUpperCase();
  const pieces = parts || new URL(req.url || "/", "http://localhost").pathname.replace(/\/+$/, "").split("/").slice(2);
  const [, second, third] = pieces;
  if (second !== "crises" || third !== undefined) {
    sendError(res, 404, "not_found", "No such world feed. The feed is /api/world/crises.");
    return true;
  }
  if (verb !== "GET" && verb !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    sendError(res, 405, "method_not_allowed", `${verb} is not supported on /api/world/crises.`);
    return true;
  }
  const feed = await getWorldFeed();
  sendFeed(req, res, feed);
  return true;
}
