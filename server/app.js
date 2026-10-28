// WHAT THIS FILE DOES
// The Atlas server's front desk: it answers every web address that starts
// with /api/. The dev server (vite-plugin.js) and the production server
// (index.js) both pass requests here.
//
//   GET    /api/status                  data source, AI and scheduler state
//   GET    /api/areas/search?q=         find a country (or a region, with Earth Engine)
//   POST   /api/areas                   save an area (country, coordinates, box, drawn)
//   GET    /api/areas                   saved areas
//   GET    /api/areas/:id               one area with its outline,
//                                       listConflict: what the app's list of
//                                       wars says for it (null at peace),
//                                       and monthlyProblem when its last
//                                       monthly update went wrong
//   PATCH  /api/areas/:id               rename an area ({ name }) and/or set
//                                       its war ({ war: { mode: "list" |
//                                       "war" | "peace", since, name } }:
//                                       src/config/conflicts.js checkAreaWar)
//   GET    /api/areas/:id/units?runId=  the area's states or districts with
//                                       their borders (FAO GAUL 2015, saved
//                                       once worked out; from the squares'
//                                       place names without Earth Engine)
//                                       and which square is in which
//                                       (server/units.js)
//   DELETE /api/areas/:id               remove an area and its runs (not while
//                                       it is being analyzed: stop that
//                                       first; an analysis still waiting
//                                       for its turn is cancelled)
//   GET    /api/workspace              settings, team, budget... (a current
//                                       area that no longer exists is cleared)
//   PATCH  /api/workspace               change any of those
//   POST   /api/team                    add a team member
//   PATCH  /api/team/:id                 change a member
//   DELETE /api/team/:id                 remove a member (never the last admin)
//   POST   /api/analyze                 start an analysis (gives back a job;
//                                       one area at a time, others wait in
//                                       line, a person's before the monthly
//                                       check's)
//   GET    /api/jobs                    recent jobs (?areaId=)
//   GET    /api/jobs/:id                how far a job got
//   POST   /api/jobs/:id/cancel         cancel an analysis still waiting for
//                                       its turn, or stop one that has
//                                       started (the months done are kept)
//   GET    /api/runs?areaId=            monthly runs, newest first
//   GET    /api/runs/compare?a=&b=      what changed between two runs
//   GET    /api/runs/:id                one run with its cells and alerts
//   GET    /api/soil?areaId=&cellId=    the soil types of one square (or
//          /api/soil?areaId=&unitId=    of one state or district, or of
//          /api/soil?lat=&lon=&sizeDeg= any square), saved once read
//                                       (server/soil.js)
//   /api/chat, /api/chats...            the AI (server/ai/chat.js)
//   /api/farm..., /api/geocode          the Field product (server/field/routes.js)
//   /api/auth/status, login, logout     the optional access code (server/auth.js)
//   POST   /api/auth/firebase           a registered account's sign-in
//                                       (server/accounts.js)
//   GET    /api/account                 the signed-in account and its profile
//   PUT    /api/account                 change the profile (server/accounts.js)
//   GET    /api/health                  { ok: true }: the server is up (for the
//                                       host's health check; no data, no code)
//   POST   /api/admin/import            the one-time data upload, only while
//                                       IMPORT_TOKEN is set (server/import.js)
//   POST   /api/contact                 a message from the public website's
//                                       contact form (no code; 5 an hour per
//                                       visitor; server/messages.js)
//   GET    /api/messages                those messages, newest first (Atlas
//                                       Settings shows them)
//   DELETE /api/messages/:id            remove one
//
// When ATLAS_ACCESS_CODE is set in .env, every address above except the
// sign-in ones (/api/auth/...), /api/health, /api/contact (the website's
// form) and /api/admin/import (which has its own token) needs a signed-in
// browser.
//
// WHOSE DATA (server/auth.js handleAuth, server/store.js withDataRoot)
// Every route after the sign-in check runs inside the data folder of the
// session that asked: the shared demo's (the access code, or everything
// on one's own computer without a code) or a registered account's own
// folder (users/<id>/). The route handlers do not know which: the store
// reads and writes the right folder by itself, and a job they start
// carries the folder with it (server/jobs.js).
//
// A registered account chose one product, and may only use that one:
// an account for Field gets 403 wrong_product on the Atlas routes (status,
// areas, workspace, team, analyze, the jobs list and cancel, runs, soil,
// messages, and the Atlas AI chat), an account for Atlas on the Field
// ones (farm, the Field AI chat; /api/geocode is open to every account); an account that has not chosen
// yet gets it on both. GET /api/jobs/:id is both products' (the Field
// pages follow their field jobs with it; an account only ever sees its
// own jobs). The shared demo is never restricted. The website's messages
// (/api/messages) live in the demo's folder, so an account's list of them
// is simply empty.
//
// WHAT AN ACCOUNT MAY DO (server/quotas.js has the numbers)
// A registered account keeps at most 5 areas, each at most 1,000,000 km²
// and 1,500 squares (400 too_big), drawn with at most 1,000 points; runs
// one Atlas analysis at a time (429 busy) of at most 12 months; and the
// Field and the AI chat have their own limits (server/field/routes.js,
// server/ai/chat.js). A limit reached answers 429 (or 413) with the code
// "quota" and a plain sentence. The demo has none of these limits.
//
// Errors always come back as { error: { code, message } }. A request that
// changes something (anything but GET or HEAD) sent by another website a
// visitor has open is refused first of all, with 403 cross_site
// (server/auth.js assertSameSite).
//
// WHO EDITS IT
// Whoever adds a route. Keep the list above up to date.

import { HttpError, readJson, sendError, sendJson } from "./http.js";
import { config } from "./env.js";
import {
  deleteArea,
  getArea,
  getRun,
  getWorkspace,
  isSafeId,
  listAreas,
  listRuns,
  newId,
  saveArea,
  updateArea,
  updateWorkspace,
  withDataRoot,
} from "./store.js";
import { areaHa, bboxOf, displayTolerance, planGrid, simplifyGeometry, splitAntimeridian } from "./geo.js";
import { getCountry, searchCountries } from "./countries.js";
import { compareRuns, summarizeRun } from "./runs.js";
import { cancelAnalysis, getJob, lastMonthlyProblem, listJobs, startAnalysis } from "./jobs.js";
import { listConflictForArea } from "./conflicts.js";
import { checkAreaWar } from "../src/config/conflicts.js";
import { getProvider, providerStatus, withTimeout } from "./providers/index.js";
import { schedulerStatus } from "./scheduler.js";
import { handleWorld } from "./world/index.js";
import { checkSettings } from "../src/lib/atlas/method.js";
import { assertSameSite, handleAuth } from "./auth.js";
import { handleAccountRoutes } from "./accounts.js";
import { handleAdmin } from "./import.js";
import { handleContact, handleMessages } from "./messages.js";
import { handleFieldRoutes } from "./field/routes.js";
import { unitsForArea } from "./units.js";
import { soilFor } from "./soil.js";
import { isAccount, QUOTAS, quotaError } from "./quotas.js";

const MIN_AREA_HA = 0.5;
const MAX_CUSTOM_AREA_HA = 3000000 * 100; // 3,000,000 km²
const MAX_POINTS = 5000;
const ROLES = ["admin", "analyst", "viewer"];
const MAX_MONTHS = 24;

const bad = (message, code = "bad_request") => new HttpError(400, code, message);
const notFound = (message) => new HttpError(404, "not_found", message);

// ---------- Areas ----------

function cleanName(value, fallback) {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return name || fallback;
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

// Reads one number from a request (accepts "49.7" as well as 49.7).
function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

function checkLatLon(lat, lon, label) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw bad(`${label}: latitude must be a number from -90 to 90.`);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw bad(`${label}: longitude must be a number from -180 to 180.`);
}

// [[lat, lon], ...] -> a closed GeoJSON ring of [lon, lat]. maxPoints: the
// demo's 5,000, or an account's (server/quotas.js).
function ringFromPoints(points, maxPoints = MAX_POINTS) {
  if (!Array.isArray(points)) throw bad("Send the corners as points: [[lat, lon], ...].");
  const ring = [];
  points.forEach((point, i) => {
    if (!Array.isArray(point) || point.length < 2) throw bad(`Point ${i + 1} must be [lat, lon].`);
    const lat = toNumber(point[0]);
    const lon = toNumber(point[1]);
    checkLatLon(lat, lon, `Point ${i + 1}`);
    const last = ring[ring.length - 1];
    if (!last || last[0] !== lon || last[1] !== lat) ring.push([lon, lat]);
  });
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  if (ring.length < 3) throw bad("An area needs at least 3 different corner points.");
  if (ring.length > maxPoints) throw bad(`Too many points (the limit is ${maxPoints.toLocaleString("en-US")}).`);
  const lons = ring.map(([lon]) => lon);
  if (Math.max(...lons) - Math.min(...lons) > 180) throw bad("Areas that cross the 180° line are not supported. Split the area in two.");
  ring.push([...ring[0]]);
  return ring;
}

function checkCustomSize(geometry) {
  const ha = areaHa(geometry);
  if (!(ha >= MIN_AREA_HA)) throw bad(`The area is too small (${ha.toFixed(2)} ha). The minimum is 0.5 ha.`, "area_too_small");
  if (ha > MAX_CUSTOM_AREA_HA) throw bad("The area is too large. The maximum is 3,000,000 km² (pick a country instead).", "area_too_large");
  return ha;
}

// Finishes an area: works out its box, size and grid, and saves it. limits:
// a registered account's (server/quotas.js), or null for the demo.
async function finishArea(base, limits = null) {
  const grid = planGrid(base.geometry);
  if (limits) {
    if ((await listAreas()).length >= limits.areas) throw quotaError(`An account can keep ${limits.areas} areas; delete one first.`);
    const km2 = Math.round(grid.areaHa / 100);
    if (km2 > limits.areaKm2 || grid.cells.length > limits.areaSquares) {
      throw bad(
        `${base.name} is too large for an account: ${km2.toLocaleString("en-US")} km² in ${grid.cells.length.toLocaleString("en-US")} squares. An account's area can be ${limits.areaKm2.toLocaleString("en-US")} km² (about the size of Ukraine) and ${limits.areaSquares.toLocaleString("en-US")} squares at most; pick a region inside it, or draw a smaller area.`,
        "too_big"
      );
    }
  }
  const area = {
    ...base,
    bbox: grid.bbox,
    areaHa: Math.round(grid.areaHa * 100) / 100,
    cellSizeDeg: grid.cellSizeDeg,
    cellCount: grid.cells.length,
    createdAt: new Date().toISOString(),
  };
  await saveArea(area);
  return area;
}

// limits: a registered account's (server/quotas.js), or null for the demo.
async function createArea(body, limits = null) {
  const source = body.source;
  const maxPoints = limits ? limits.points : MAX_POINTS;
  if (source === "country") {
    const country = getCountry(body.id);
    if (!country) throw bad("Unknown country. Search for it first.", "unknown_country");
    const id = `country-${slug(country.id)}`;
    const existing = await getArea(id);
    if (existing) return existing;
    return finishArea({ id, name: country.name, kind: "country", source: "country", countryId: country.id, geometry: country.geometry }, limits);
  }

  if (source === "admin1") {
    const provider = await getProvider();
    if (provider.id !== "gee" || typeof provider.admin1Boundary !== "function") {
      throw bad("Regions inside a country need Earth Engine. Pick a country or enter coordinates instead.", "needs_gee");
    }
    if (body.id == null || String(body.id).trim() === "") throw bad("Send the region id.");
    const id = `admin1-${slug(body.id)}`;
    const existing = await getArea(id);
    if (existing) return existing;
    const result = await provider.admin1Boundary(String(body.id));
    // admin1Boundary may give a geometry, a Feature, or { geometry, name }.
    const raw = result?.type === "Feature" ? result.geometry : result?.geometry && !result.coordinates ? result.geometry : result;
    const geometry = raw && bboxOf(raw) ? splitAntimeridian(raw) : null;
    if (!geometry) throw bad("Earth Engine did not return an outline for that region.");
    const name = cleanName(body.name || result?.name || result?.properties?.name, `Region ${body.id}`);
    return finishArea({ id, name, kind: "admin1", source: "admin1", country: body.country || result?.country || result?.properties?.country, geometry }, limits);
  }

  if (source === "coordinates" || source === "draw") {
    const geometry = { type: "Polygon", coordinates: [ringFromPoints(body.points, maxPoints)] };
    checkCustomSize(geometry);
    const fallback = source === "draw" ? "Drawn area" : "Custom area";
    return finishArea({ id: newId("area"), name: cleanName(body.name, fallback), kind: "custom", source, geometry }, limits);
  }

  if (source === "bbox") {
    const north = toNumber(body.north);
    const south = toNumber(body.south);
    const east = toNumber(body.east);
    const west = toNumber(body.west);
    checkLatLon(north, east, "North-east corner");
    checkLatLon(south, west, "South-west corner");
    if (!(north > south)) throw bad("North must be greater than south.");
    if (!(east > west)) throw bad("East must be greater than west (areas crossing the 180° line are not supported).");
    const ring = [[west, south], [east, south], [east, north], [west, north], [west, south]];
    const geometry = { type: "Polygon", coordinates: [ring] };
    checkCustomSize(geometry);
    return finishArea({ id: newId("area"), name: cleanName(body.name, "Custom area"), kind: "custom", source: "bbox", geometry }, limits);
  }

  throw bad('Unknown source. Use "country", "admin1", "coordinates", "bbox" or "draw".');
}

// The area as the pages get it: outline simplified for drawing, what the
// app's list of wars says for it (listConflict: { id, name, since,
// partOfCountry?, partOf?, otherWarSquares? } or null: server/conflicts.js
// listConflictForArea; Atlas Settings shows it next to the team's own war
// setting, area.war), and, when its last monthly update went wrong and no
// analysis of it has ended well since, what happened (monthlyProblem:
// { jobId, text, months, finishedAt }, jobs.js lastMonthlyProblem).
function areaForClient(area, { full = false } = {}) {
  if (!area) return null;
  const listConflict = listConflictForArea(area);
  const monthlyProblem = lastMonthlyProblem(area.id);
  const withList = { ...area, ...(listConflict === undefined ? {} : { listConflict }), ...(monthlyProblem ? { monthlyProblem } : {}) };
  if (full || !area.geometry || !area.bbox) return withList;
  return { ...withList, geometry: simplifyGeometry(area.geometry, displayTolerance(area.bbox)) };
}

// Today as "YYYY-MM-DD" (UTC, as the pages give it): the latest day a war
// the team sets can count from.
const todayIso = () => new Date().toISOString().slice(0, 10);

// The changes a PATCH /api/areas/:id may make: { name } (a rename, the
// old shape), { war } (the team's war setting), or both. Throws a 400 with
// a message a person can read.
function areaChanges(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("Send the changes as an object, like { name } or { war }.");
  const changes = {};
  if (body.name !== undefined || body.war === undefined) {
    const name = cleanName(body.name, "");
    if (!name) throw bad("Give the area a name.");
    changes.name = name;
  }
  if (body.war !== undefined) {
    const checked = checkAreaWar(body.war, todayIso());
    if (checked.error) throw bad(checked.error, "bad_war_setting");
    changes.war = checked.war;
  }
  return changes;
}

function withoutGeometry(area) {
  const { geometry, ...rest } = area;
  return rest;
}

// Regions (provinces, states...) by name, from Earth Engine. Gives back []
// without Earth Engine, and also when Earth Engine takes longer than a few
// seconds, so the country results are never held back.
const MAX_SEARCH_RESULTS = 12;
const MIN_COUNTRY_RESULTS = 8;
const REGION_SEARCH_WAIT_MS = 4000;

async function searchRegions(text) {
  const search = (async () => {
    const provider = await getProvider();
    if (provider.id !== "gee" || typeof provider.searchAdmin1 !== "function") return [];
    const regions = await provider.searchAdmin1(text);
    return (regions || []).map((region) => ({ id: String(region.id), name: region.name, kind: "admin1", country: region.country }));
  })();
  const safe = search.catch((error) => {
    console.warn(`[chernozem] Region search failed: ${error.message}`);
    return [];
  });
  return (await withTimeout(safe, REGION_SEARCH_WAIT_MS, [])).slice(0, MAX_SEARCH_RESULTS);
}

// ---------- Workspace and team ----------

function cleanEmail(value) {
  const email = typeof value === "string" ? value.trim().slice(0, 120) : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("That email address does not look right.");
  return email;
}

function cleanRole(value, fallback) {
  if (value === undefined) return fallback;
  if (!ROLES.includes(value)) throw bad('Role must be "admin", "analyst" or "viewer".');
  return value;
}

// The workspace, with a current area that still exists: when the saved
// area was deleted (its file is gone), currentAreaId is cleared and saved,
// so the pages start at "pick an area" instead of asking for a missing
// area and getting a 404.
async function workspaceWithArea() {
  const ws = await getWorkspace();
  const id = ws.currentAreaId;
  if (!id || (isSafeId(id) && (await getArea(id)))) return ws;
  return updateWorkspace((current) => {
    // Only clear it if nobody picked another area in the meantime.
    if (current.currentAreaId === id) current.currentAreaId = null;
  });
}

async function patchWorkspace(body) {
  // Check the area before taking the lock.
  if (body.currentAreaId !== undefined && body.currentAreaId !== null) {
    if (!isSafeId(body.currentAreaId) || !(await getArea(body.currentAreaId))) throw bad("That area does not exist.", "unknown_area");
  }
  return updateWorkspace((ws) => {
    if (body.name !== undefined) ws.name = cleanName(body.name, ws.name);
    if (body.currentAreaId !== undefined) ws.currentAreaId = body.currentAreaId;
    if (body.settings !== undefined) {
      if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) throw bad("settings must be an object.");
      // Weights sent together replace the old ones; other fields merge.
      ws.settings = checkSettings({ ...ws.settings, ...body.settings, weights: body.settings.weights || ws.settings.weights });
    }
    if (body.budgetUsd !== undefined) {
      const budget = toNumber(body.budgetUsd);
      if (!Number.isFinite(budget) || budget < 0 || budget > 1e12) throw bad("The budget must be a number from 0 to 1,000,000,000,000.");
      ws.budgetUsd = Math.round(budget);
    }
    if (body.doneSteps !== undefined) {
      if (!Array.isArray(body.doneSteps)) throw bad("doneSteps must be a list.");
      ws.doneSteps = [...new Set(body.doneSteps.filter((step) => typeof step === "string").map((step) => step.slice(0, 200)))].slice(0, 200);
    }
    if (body.schedule !== undefined) {
      if (!body.schedule || typeof body.schedule !== "object" || Array.isArray(body.schedule)) throw bad("schedule must be an object.");
      if (body.schedule.autoMonthly !== undefined) ws.schedule = { ...ws.schedule, autoMonthly: Boolean(body.schedule.autoMonthly) };
    }
    return ws;
  });
}

async function addMember(body) {
  const name = cleanName(body.name, "");
  if (!name) throw bad("Enter the person's name.");
  const email = cleanEmail(body.email);
  let member;
  await updateWorkspace((ws) => {
    if (email && ws.team.some((other) => other.email && other.email.toLowerCase() === email.toLowerCase())) {
      throw new HttpError(409, "duplicate", "Someone with that email is already on the team.");
    }
    // The first person on an empty team is its admin (a team needs one).
    const role = ws.team.length ? cleanRole(body.role, "viewer") : "admin";
    member = { id: newId("member"), name, email, role, addedAt: new Date().toISOString() };
    ws.team.push(member);
    return ws;
  });
  return member;
}

async function changeMember(id, body) {
  let member;
  await updateWorkspace((ws) => {
    const found = ws.team.find((other) => other.id === id);
    if (!found) throw notFound("That team member does not exist.");
    const role = cleanRole(body.role, found.role);
    const admins = ws.team.filter((other) => other.role === "admin");
    if (found.role === "admin" && role !== "admin" && admins.length <= 1) {
      throw bad("The team needs at least one admin. Make someone else an admin first.", "last_admin");
    }
    if (body.name !== undefined) {
      const name = cleanName(body.name, "");
      if (!name) throw bad("The name cannot be empty.");
      found.name = name;
    }
    if (body.email !== undefined) found.email = cleanEmail(body.email);
    found.role = role;
    member = { ...found };
    return ws;
  });
  return member;
}

async function removeMember(id) {
  await updateWorkspace((ws) => {
    const found = ws.team.find((other) => other.id === id);
    if (!found) throw notFound("That team member does not exist.");
    if (found.role === "admin" && ws.team.filter((other) => other.role === "admin").length <= 1) {
      throw bad("You cannot remove the last admin. Make someone else an admin first.", "last_admin");
    }
    ws.team = ws.team.filter((other) => other.id !== id);
    return ws;
  });
}

// ---------- AI (delegated) ----------

async function handleChat(req, res, url) {
  let mod;
  try {
    mod = await import("./ai/chat.js");
  } catch (error) {
    console.error("[chernozem] The AI module could not be loaded:", error);
    sendError(res, 503, "ai_unavailable", "The AI is not available right now (the server could not load it). See the server log.");
    return true;
  }
  if (typeof mod.handleChatRoutes !== "function") {
    sendError(res, 503, "ai_unavailable", "The AI module is missing handleChatRoutes().");
    return true;
  }
  const handled = await mod.handleChatRoutes(req, res, url);
  if (!handled && !res.headersSent) sendError(res, 404, "not_found", "No such AI route.");
  return true;
}

// ---------- Which product a route belongs to (registered accounts) ----------

const ATLAS_ROUTES = new Set(["status", "areas", "workspace", "team", "analyze", "jobs", "runs", "soil", "messages"]);
// /api/geocode (a place lookup, no one's data) is open to every account:
// the register page uses it before the person has chosen a product.
const FIELD_ROUTES = new Set(["farm"]);
const PRODUCT_NAMES = { field: "Chernozem Field", atlas: "Chernozem Atlas" };

// The product this request is for: "atlas", "field", or null for routes
// that belong to neither (one job by its id, which the Field pages follow
// too, src/api/fieldApi.js; one chat thread by its id; /api/account). The
// AI chat says which product in its body (POST /api/chat) or query (GET
// /api/chats); the body read here is kept on the request for chat.js
// (server/http.js readJson gives it back).
async function productOf(req, { method, first, second, third, q }) {
  if (first === "jobs" && second && !third && method === "GET") return null;
  if (ATLAS_ROUTES.has(first)) return "atlas";
  if (FIELD_ROUTES.has(first)) return "field";
  if (first === "chat" && !second && method === "POST") {
    req.body = await readJson(req);
    return req.body.product === "field" ? "field" : "atlas";
  }
  if (first === "chats" && !second && method === "GET") return q.get("product") === "field" ? "field" : "atlas";
  return null;
}

// A registered account may only use the product it chose (see the top of
// this file); the shared demo may use both.
async function assertProduct(req, session, context) {
  if (session.kind !== "account") return;
  const wanted = await productOf(req, context);
  if (!wanted) return;
  const chosen = session.account.product;
  if (!chosen) throw new HttpError(403, "wrong_product", "Finish registering first: choose Field or Atlas on the register page.");
  if (chosen !== wanted) throw new HttpError(403, "wrong_product", `This account is for ${PRODUCT_NAMES[chosen]}, so it cannot use ${PRODUCT_NAMES[wanted]}.`);
}

// ---------- Router ----------

async function route(req, res, url) {
  const method = (req.method || "GET").toUpperCase();
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(2); // after "/api"
  const [first, second, third] = parts;

  // Before anything: a request that changes something must come from this
  // app's own pages, not from another website a visitor has open
  // (server/auth.js). Reads (GET, HEAD) are left alone.
  assertSameSite(req, method);

  // Before the access code: the health check (the host asks it every few
  // seconds; it says nothing about the data), the data upload, which has
  // its own token (server/import.js), and the public website's contact
  // form, which has its own limits (server/messages.js).
  if (first === "health" && !second && (method === "GET" || method === "HEAD")) return sendJson(res, 200, { ok: true });
  if (first === "admin") return handleAdmin(req, res, { method, parts, pathname: url.pathname });
  if (first === "contact") return handleContact(req, res, { method, parts, pathname: url.pathname });
  // The website's globe (server/world/index.js): public, read-only.
  if (first === "world") return handleWorld(req, res, { method, parts, pathname: url.pathname });

  // The sign-in check (server/auth.js) comes before every other route: it
  // answers /api/auth/... itself (and gives back false), and for anything
  // else says whose data the route works on: the shared demo's or a
  // registered account's folder (the session). When a code is set, a
  // browser that has neither is stopped here with 401 (the AI chat
  // included).
  const session = await handleAuth(req, res, { method, first, second, third });
  if (!session) return;
  // Everything from here reads and writes that folder (server/store.js).
  return withDataRoot(session.root, () => dispatch(req, res, url, { method, parts, session }));
}

// The routes after the sign-in check, inside the session's data folder.
async function dispatch(req, res, url, { method, parts, session }) {
  const [first, second, third] = parts;
  const q = url.searchParams;

  // A registered account uses the product it chose, Field or Atlas.
  await assertProduct(req, session, { method, first, second, third, q });

  // The signed-in account and its profile (server/accounts.js).
  if (first === "account") return handleAccountRoutes(req, res, { method, parts, pathname: url.pathname, session });

  if (first === "chat" || first === "chats") return handleChat(req, res, url);

  // The messages the contact form brought, for Atlas Settings.
  if (first === "messages") return handleMessages(req, res, { method, second, third, pathname: url.pathname });

  // The Field product (farm, fields, reports, weather, place search).
  if (first === "farm" || first === "geocode") {
    if (!(await handleFieldRoutes(req, res, url))) throw notFound(`No such API route: ${url.pathname}`);
    return;
  }

  if (first === "status" && !second && method === "GET") {
    const env = config();
    const [provider, scheduler] = await Promise.all([providerStatus(), schedulerStatus()]);
    return sendJson(res, 200, {
      provider,
      ai: { configured: Boolean(env.anthropicKey), model: env.claudeModel },
      scheduler,
      jobs: listJobs({ status: "running" }),
    });
  }

  if (first === "areas") {
    if (second === "search" && !third && method === "GET") {
      const text = (q.get("q") || "").slice(0, 100);
      const countries = searchCountries(text, MAX_SEARCH_RESULTS);
      const regions = text.trim().length >= 2 ? await searchRegions(text.trim()) : [];
      // Countries first, but always leave room for some regions.
      const room = regions.length ? Math.max(MAX_SEARCH_RESULTS - regions.length, MIN_COUNTRY_RESULTS) : MAX_SEARCH_RESULTS;
      const results = [...countries.slice(0, room), ...regions].slice(0, MAX_SEARCH_RESULTS);
      return sendJson(res, 200, { results });
    }
    if (!second && method === "POST") {
      // A registered account has limits (server/quotas.js); the demo none.
      const area = await createArea(await readJson(req), isAccount() ? QUOTAS : null);
      return sendJson(res, 201, { area: areaForClient(area) });
    }
    if (!second && method === "GET") {
      return sendJson(res, 200, { areas: (await listAreas()).map(withoutGeometry) });
    }
    if (second && !third && method === "GET") {
      const area = await getArea(second);
      if (!area) throw notFound("That area does not exist.");
      return sendJson(res, 200, { area: areaForClient(area, { full: q.get("full") === "1" }) });
    }
    if (second && third === "units" && parts.length === 3 && method === "GET") {
      const runId = q.get("runId") || null;
      if (runId !== null && !isSafeId(runId)) throw bad("That is not a month's id.");
      return sendJson(res, 200, await unitsForArea(second, { runId }));
    }
    if (second && !third && method === "PATCH") {
      if (!(await getArea(second))) throw notFound("That area does not exist.");
      const changes = areaChanges(await readJson(req));
      // Saved months keep the war setting (the crisis: a war, a natural
      // disaster or none, src/config/conflicts.js checkAreaWar) they were
      // made with; Atlas Settings offers the re-run (nothing is analyzed
      // here).
      const area = await updateArea(second, (current) => {
        if (changes.name) current.name = changes.name;
        if (changes.war) {
          if (changes.war.mode === "list") delete current.war;
          else current.war = { ...changes.war, setAt: new Date().toISOString() };
        }
        current.updatedAt = new Date().toISOString();
      });
      if (!area) throw notFound("That area does not exist.");
      return sendJson(res, 200, { area: areaForClient(area) });
    }
    if (second && !third && method === "DELETE") {
      const area = await getArea(second);
      if (!area) throw notFound("That area does not exist.");
      const analyses = listJobs({ areaId: area.id, status: "running" });
      const started = analyses.find((job) => !job.queued);
      if (started?.stopping) {
        throw new HttpError(409, "busy", `${area.name}'s analysis is stopping. Remove the area in a moment, once it has stopped.`);
      }
      // Only saved areas that are not open have a remove button (Atlas
      // Settings), and they show no progress bar: the Stop is on the area's
      // own pages, and once it is open its row (and its button) is gone
      // from Saved areas until another area is opened.
      if (started) {
        throw new HttpError(409, "busy", `${area.name} is being analyzed right now. Open it and press Stop under its progress bar, then open another area and remove it from Saved areas.`);
      }
      // Its analysis has not started yet: it is taken out of line.
      for (const job of analyses) cancelAnalysis(job.id);
      const removedRuns = await deleteArea(area.id);
      // If it was the area on screen, show none rather than a missing one.
      await updateWorkspace((ws) => {
        if (ws.currentAreaId === area.id) ws.currentAreaId = null;
        return ws;
      });
      return sendJson(res, 200, { ok: true, removedRuns });
    }
  }

  if (first === "workspace" && !second) {
    if (method === "GET") return sendJson(res, 200, { workspace: await workspaceWithArea() });
    if (method === "PATCH") return sendJson(res, 200, { workspace: await patchWorkspace(await readJson(req)) });
  }

  if (first === "team") {
    if (!second && method === "POST") return sendJson(res, 201, { member: await addMember(await readJson(req)) });
    if (second && !third && method === "PATCH") return sendJson(res, 200, { member: await changeMember(second, await readJson(req)) });
    if (second && !third && method === "DELETE") {
      await removeMember(second);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (first === "analyze" && !second && method === "POST") {
    const body = await readJson(req);
    if (!isSafeId(body.areaId)) throw bad("Send the areaId to analyze.");
    if (body.months !== undefined) {
      const months = toNumber(body.months);
      if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) throw bad(`months must be a whole number from 1 to ${MAX_MONTHS}.`);
    }
    if (isAccount()) {
      // A registered account (server/quotas.js): fewer months at a time,
      // and one analysis at a time (its own area asked again joins the
      // running job as always; another area waits until it has ended).
      if ((body.months ?? 12) > QUOTAS.monthsPerAnalysis) throw bad(`An account can analyze ${QUOTAS.monthsPerAnalysis} months at a time.`, "quota");
      const other = listJobs({ status: "running" }).find((job) => job.kind === "atlas" && job.areaId !== body.areaId);
      if (other) throw new HttpError(429, "busy", `Your other analysis (${other.areaName}) is still running. Wait for it to finish, or stop it, then start this one.`);
    }
    const job = await startAnalysis({ areaId: body.areaId, months: body.months ?? 12, rerun: Boolean(body.rerun) });
    return sendJson(res, 202, { job });
  }

  if (first === "jobs" && method === "GET") {
    if (!second) return sendJson(res, 200, { jobs: listJobs({ areaId: q.get("areaId") || undefined }) });
    if (!third) {
      const job = getJob(second);
      if (!job) throw notFound("That job does not exist (jobs are forgotten when the server restarts).");
      return sendJson(res, 200, { job });
    }
  }

  if (first === "jobs" && second && third === "cancel" && parts.length === 3 && method === "POST") {
    const job = getJob(second);
    if (!job) throw notFound("That job does not exist (jobs are forgotten when the server restarts).");
    if (job.kind !== "atlas") throw bad("Only an Atlas analysis can be cancelled here.");
    // Waiting: taken out of line. Started: stopped (job.stopping, then
    // "cancelled"; the months done are kept), except one started before
    // the server's code was reloaded, which has nothing to stop it with
    // (409 "cannot_stop": jobs.js cancelAnalysis). Ended already (done,
    // failed or cancelled): given back as it is.
    return sendJson(res, 200, { job: job.status === "running" ? cancelAnalysis(second) : job });
  }

  if (first === "runs" && method === "GET") {
    if (!second) return sendJson(res, 200, { runs: await listRuns(q.get("areaId") || undefined) });
    if (second === "compare" && !third) {
      const [a, b] = await Promise.all([getRun(q.get("a") || ""), getRun(q.get("b") || "")]);
      if (!a || !b) throw notFound("One of the two runs does not exist.");
      if (a.areaId !== b.areaId) throw bad("Both months must be from the same area.", "different_areas");
      return sendJson(res, 200, compareRuns(a, b));
    }
    if (!third) {
      const run = await getRun(second);
      if (!run) throw notFound("That run does not exist.");
      return sendJson(res, 200, { run });
    }
  }

  if (first === "soil" && !second && method === "GET") {
    return sendJson(res, 200, await soilFor(q));
  }

  // A known path with the wrong method, or an unknown path. The number is
  // how many parts after /api/ the route can have (/api/runs/:id = 2).
  const known = { status: 1, health: 1, areas: 2, workspace: 1, team: 2, analyze: 1, jobs: 2, runs: 2, soil: 1, account: 1 };
  if (first === "areas" && second && third === "units" && parts.length === 3) {
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${url.pathname}.`);
  }
  if (known[first] && parts.length <= known[first]) {
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${url.pathname}.`);
  }
  throw notFound(`No such API route: ${url.pathname}`);
}

// Answers a request if it is for /api/. Gives back false for any other
// address (so the caller can serve the page instead).
export async function handleApi(req, res) {
  const url = new URL(req.originalUrl || req.url || "/", "http://localhost");
  if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return false;
  try {
    await route(req, res, url);
  } catch (error) {
    // Errors from the data source carry a code; turn the common ones into
    // the right answer instead of "server error".
    const byCode = { bad_request: 400, not_found: 404, needs_gee: 400 };
    const status = Number.isInteger(error.status) ? error.status : byCode[error.code] || 500;
    if (status >= 500) console.error(`[chernozem] ${req.method} ${url.pathname} failed:`, error);
    // Messages written for people (HttpError, Earth Engine errors, 4xx) are
    // passed on. Anything else (a file error, a bug) may name folders on
    // this computer, so the page gets a plain message; the details are in
    // the server log above.
    const forPeople = error instanceof HttpError || error?.name === "GeeError" || status < 500;
    const message = forPeople && error.message ? error.message : "Something went wrong on the server. See the server log for details.";
    if (!res.headersSent) {
      sendError(res, status, forPeople && error.code ? error.code : status >= 500 ? "server_error" : "bad_request", message);
    } else if (!res.writableEnded) {
      res.end();
    }
  }
  return true;
}

// Re-exported for tests.
export { summarizeRun };
