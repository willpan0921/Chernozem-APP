// WHAT THIS FILE DOES
// The Atlas server's front desk: it answers every web address that starts
// with /api/. The dev server (vite-plugin.js) and the production server
// (index.js) both pass requests here.
//
//   GET    /api/status                  data source, AI and scheduler state
//   GET    /api/areas/search?q=         find a country (or a region, with Earth Engine)
//   POST   /api/areas                   save an area (country, coordinates, box, drawn)
//   GET    /api/areas                   saved areas
//   GET    /api/areas/:id               one area with its outline
//   PATCH  /api/areas/:id               rename an area ({ name })
//   DELETE /api/areas/:id               remove an area and its runs (not while
//                                       it is being analyzed)
//   GET    /api/workspace              settings, team, budget... (a current
//                                       area that no longer exists is cleared)
//   PATCH  /api/workspace               change any of those
//   POST   /api/team                    add a team member
//   PATCH  /api/team/:id                 change a member
//   DELETE /api/team/:id                 remove a member (never the last admin)
//   POST   /api/analyze                 start an analysis (gives back a job)
//   GET    /api/jobs                    recent jobs (?areaId=)
//   GET    /api/jobs/:id                how far a job got
//   GET    /api/runs?areaId=            monthly runs, newest first
//   GET    /api/runs/compare?a=&b=      what changed between two runs
//   GET    /api/runs/:id                one run with its cells and alerts
//   /api/chat, /api/chats...            the AI (server/ai/chat.js)
//   /api/farm..., /api/geocode          the Field product (server/field/routes.js)
//   /api/auth/status, login, logout     the optional access code (server/auth.js)
//
// When ATLAS_ACCESS_CODE is set in .env, every address above except the
// sign-in ones (/api/auth/...) needs a signed-in browser.
//
// Errors always come back as { error: { code, message } }.
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
  updateWorkspace,
} from "./store.js";
import { areaHa, bboxOf, displayTolerance, planGrid, simplifyGeometry, splitAntimeridian } from "./geo.js";
import { getCountry, searchCountries } from "./countries.js";
import { compareRuns, summarizeRun } from "./runs.js";
import { getJob, listJobs, startAnalysis } from "./jobs.js";
import { getProvider, providerStatus, withTimeout } from "./providers/index.js";
import { schedulerStatus } from "./scheduler.js";
import { checkSettings } from "../src/lib/atlas/method.js";
import { handleAuth } from "./auth.js";
import { handleFieldRoutes } from "./field/routes.js";

const MIN_AREA_HA = 0.5;
const MAX_CUSTOM_AREA_HA = 3000000 * 100; // 3,000,000 km²
const ROLES = ["admin", "analyst", "viewer"];

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

// [[lat, lon], ...] -> a closed GeoJSON ring of [lon, lat].
function ringFromPoints(points) {
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
  if (ring.length > 5000) throw bad("Too many points (the limit is 5,000).");
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

// Finishes an area: works out its box, size and grid, and saves it.
async function finishArea(base) {
  const grid = planGrid(base.geometry);
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

async function createArea(body) {
  const source = body.source;
  if (source === "country") {
    const country = getCountry(body.id);
    if (!country) throw bad("Unknown country. Search for it first.", "unknown_country");
    const id = `country-${slug(country.id)}`;
    const existing = await getArea(id);
    if (existing) return existing;
    return finishArea({ id, name: country.name, kind: "country", source: "country", countryId: country.id, geometry: country.geometry });
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
    return finishArea({ id, name, kind: "admin1", source: "admin1", country: body.country || result?.country || result?.properties?.country, geometry });
  }

  if (source === "coordinates" || source === "draw") {
    const geometry = { type: "Polygon", coordinates: [ringFromPoints(body.points)] };
    checkCustomSize(geometry);
    const fallback = source === "draw" ? "Drawn area" : "Custom area";
    return finishArea({ id: newId("area"), name: cleanName(body.name, fallback), kind: "custom", source, geometry });
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
    return finishArea({ id: newId("area"), name: cleanName(body.name, "Custom area"), kind: "custom", source: "bbox", geometry });
  }

  throw bad('Unknown source. Use "country", "admin1", "coordinates", "bbox" or "draw".');
}

// The area as the pages get it: outline simplified for drawing.
function areaForClient(area, { full = false } = {}) {
  if (!area) return null;
  if (full || !area.geometry || !area.bbox) return area;
  return { ...area, geometry: simplifyGeometry(area.geometry, displayTolerance(area.bbox)) };
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

// ---------- Router ----------

async function route(req, res, url) {
  const method = (req.method || "GET").toUpperCase();
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(2); // after "/api"
  const [first, second, third] = parts;
  const q = url.searchParams;

  // The access code (server/auth.js) comes before every other route: it
  // answers /api/auth/... and, when a code is set, stops browsers that have
  // not signed in (the AI chat included).
  if (await handleAuth(req, res, { method, first, second, third })) return;

  if (first === "chat" || first === "chats") return handleChat(req, res, url);

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
      const area = await createArea(await readJson(req));
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
    if (second && !third && method === "PATCH") {
      const area = await getArea(second);
      if (!area) throw notFound("That area does not exist.");
      const body = await readJson(req);
      const name = cleanName(body?.name, "");
      if (!name) throw bad("Give the area a name.");
      area.name = name;
      area.updatedAt = new Date().toISOString();
      await saveArea(area);
      return sendJson(res, 200, { area: areaForClient(area) });
    }
    if (second && !third && method === "DELETE") {
      const area = await getArea(second);
      if (!area) throw notFound("That area does not exist.");
      if (listJobs({ areaId: area.id, status: "running" }).length) {
        throw new HttpError(409, "busy", `${area.name} is being analyzed right now. Remove it once the analysis has finished.`);
      }
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
      if (!Number.isInteger(months) || months < 1 || months > 24) throw bad("months must be a whole number from 1 to 24.");
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

  // A known path with the wrong method, or an unknown path. The number is
  // how many parts after /api/ the route can have (/api/runs/:id = 2).
  const known = { status: 1, areas: 2, workspace: 1, team: 2, analyze: 1, jobs: 2, runs: 2 };
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
