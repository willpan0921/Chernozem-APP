// WHAT THIS FILE DOES
// The one place the Atlas pages talk to the Atlas server (server/app.js).
// Every page gets its data through these functions, usually by way of
// src/state/AtlasData.jsx rather than directly.
//
//   getStatus()                      data source, AI and scheduler state
//   searchAreas(q)                   countries (and regions, with Earth Engine)
//   createArea(body)                 save an area: country, coordinates, box, drawn
//   listAreas() / getArea(id)        saved areas
//   updateArea(id, { name?, war? })  rename an area, or set its war
//   getWorkspace() / patchWorkspace(partial)
//   addMember / updateMember / removeMember      the team
//   analyze({ areaId, months, rerun }) / getJob(id) / listJobs(areaId)
//   cancelJob(id)                    take an analysis still waiting for its turn out of line, or stop one
//   listRuns(areaId) / getRun(id) / compareRuns(a, b)
//   getUnits(areaId, { runId })      the area's states or districts with their
//                                    borders, and which square is in which
//   getSoil({ areaId, cellId | unitId, runId })  the soil types of a square
//                                    or a state ({ available: false } without
//                                    Earth Engine)
//   streamChat({ ...body, onEvent })  the AI, streamed as it is written
//   listChats(product) / getChat(id) / deleteChat(id)
//   listMessages() / deleteMessage(id)   messages from the public website's
//                                    contact form (Atlas Settings shows them
//                                    to the owner)
//   getAuthStatus() / signOut()      who this browser is, and ending its sign-in
//                                    (signing in is the website's: the owner
//                                    on /owner, accounts on /signin and
//                                    /register, through Firebase)
//   getAccount()                     a registered person's account and profile
//
// WHO IS ASKING (server/auth.js)
// The browser sends its cookie by itself: the one the server sets after a
// Firebase sign-in, either the owner's (the Chernozem Google account,
// signed in on the hidden /owner page; the server checks its e-mail
// against OWNER_EMAILS) or a registered account's (the website's sign-in
// and register pages). Without one, the server answers as the public demo:
// the Ukraine data, read-only. A tab that chose the demo on
// the website's Demo page also sends the header X-Chernozem-View: demo with
// every call here (src/lib/demoMode.js demoHeaders), so an account holder
// sees the demo there instead of their own workspace.
//
// A change the demo may not make comes back as 403 "demo_read_only"; this
// file then announces DEMO_READ_ONLY_EVENT, and the access gate
// (src/components/atlas/AccessGate.jsx) shows the "This is the demo"
// dialog. If the server answers "not signed in" (401), it announces
// AUTH_REQUIRED_EVENT and the gate asks who this is again. signOut() ends
// either kind of sign-in and also announces ACCOUNT_SIGNED_OUT_EVENT, so the
// website's Firebase sign-in (src/lib/firebase.js, loaded only by its
// pages) can end its own session when it happens to be loaded; nothing here
// imports Firebase.
//
// Every function gives back the server's answer, or throws an ApiError with
// a message a person can read ("The area is too small (0.2 ha)...") and the
// server's code ("area_too_small").
//
// WHERE THE DATA COMES FROM
// The server decides: Google Earth Engine once its credentials are in .env,
// sample data until then. Nothing here changes when Earth Engine is
// connected.
//
// WHO EDITS IT
// Whoever adds a route to server/app.js. Add its function here too.

import { demoHeaders } from "../lib/demoMode.js";
import { isDemoRefusal } from "../lib/access.js";

// Where the server answers. The same site in development (the Vite dev
// server passes /api/ on) and in production (server/index.js).
export const API_ROOT = "/api";

// What the page says when the server cannot be reached at all. While
// developing (npm run dev) the server is usually just not running; online
// (chernozem.app) it is the visitor's connection, and "npm run dev" would
// mean nothing to them. Also used by src/api/fieldApi.js and Atlas Settings.
export const OFFLINE_MESSAGE = import.meta.env.DEV
  ? "Could not reach the Atlas server. Check that it is running (npm run dev) and try again."
  : "Could not reach Chernozem. Check your internet connection and try again.";

// Announced on window when the server says this browser is not signed in.
export const AUTH_REQUIRED_EVENT = "atlas:auth-required";
// Announced on window after signOut() ended the sign-in on the server, so
// a loaded Firebase module can sign out of Firebase too (the access gate
// itself listens to AUTH_REQUIRED_EVENT, announced right after).
export const ACCOUNT_SIGNED_OUT_EVENT = "chernozem:account-signed-out";
// Announced on window when a change was refused because this is the demo
// (the server's 403 "demo_read_only", or the app's own refusal before it
// asks: src/state/useDemoGuard.js refuseInDemo). The access gate shows the
// "This is the demo" dialog.
export const DEMO_READ_ONLY_EVENT = "chernozem:demo-read-only";

// Tells the access gate to ask who this is again (only for "not signed
// in", code "auth_required"; no other 401, such as a refused sign-in).
function noticeSignedOut(error) {
  if (error?.status === 401 && error.code === "auth_required" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }
}

// Tells the access gate to show the demo's dialog.
export function noticeDemoRefusal(error) {
  if (isDemoRefusal(error) && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEMO_READ_ONLY_EVENT));
  }
}

// The headers every call sends: the demo's (while this tab looks at the
// demo) and, with a body, its type. view "own" leaves the demo's out, to
// ask who this browser is without it (the access gate, for "Open your own
// workspace").
function headersFor(body, view) {
  const headers = view === "own" ? {} : { ...demoHeaders() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return headers;
}

export class ApiError extends Error {
  constructor(message, { code = "error", status = 0 } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function readError(response) {
  try {
    const body = await response.json();
    if (body?.error?.message) return new ApiError(body.error.message, { code: body.error.code, status: response.status });
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return new ApiError(`The server answered with error ${response.status}.`, { status: response.status });
}

// Sends one request and gives back the JSON answer.
//   options: { signal, keepalive, view: "own" (see headersFor) }
async function request(method, path, body, { signal, keepalive, view } = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: headersFor(body, view),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      keepalive,
      cache: "no-store",
      credentials: "same-origin", // sends the sign-in cookie
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(OFFLINE_MESSAGE, { code: "offline" });
  }
  if (!response.ok) {
    const error = await readError(response);
    noticeSignedOut(error);
    noticeDemoRefusal(error);
    throw error;
  }
  return response.json();
}

const query = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};
const id = (value) => encodeURIComponent(value);

// ---------- Status ----------

// { provider: { id, label, ok, detail, missing, ... }, ai: { configured, model },
//   scheduler: { autoMonthly, lastCheck }, jobs: [running jobs] }
export const getStatus = (options) => request("GET", "/status", undefined, options);

// ---------- Who is asking ----------

// -> { required, signedIn, shared, account, mode, readOnly }: mode "demo"
// (read-only), "owner" (the Chernozem Google account), "open" (one's own
// computer: no owner sign-in needed) or "account". account is { uid,
// email, name, product: "field" | "atlas" | null, profileComplete } for an
// account, the same with owner: true for the owner's Google account, else
// null (src/lib/access.js reads it: accountOf, ownerOf). While this tab
// looks at the demo the answer is the demo's (the owner stays the owner);
// options.view "own" asks without that (who the browser itself is).
export const getAuthStatus = (options) => request("GET", "/auth/status", undefined, options);

// (The old owner's key, POST /api/auth/login, is retired: the server
// answers 410 "owner_key_retired", since that key was handed out to
// visitors. The owner signs in with Google on /owner instead:
// src/lib/firebase.js, then src/api/accountApi.js postFirebaseToken.)

// Signs this browser out (the owner's sign-in and an account's both end on
// the server). With account: true the browser's own Firebase sign-in is
// ended too (the owner's Google sign-in and a registered account's alike:
// the website's sign-in pages would otherwise offer "Continue as ..." to the
// next person at this computer); Firebase is downloaded only for that, and
// only then. The app's buttons then go back to the website.
export async function signOut({ account = false } = {}) {
  await request("POST", "/auth/logout", {});
  if (account) {
    try {
      const { loadFirebaseAuth } = await import("../lib/firebase.js");
      const fb = await loadFirebaseAuth();
      await fb.signOut(fb.auth);
    } catch {
      // Offline or Firebase unreachable: the server's sign-out already took
      // effect; the website's sign-in page asks before continuing anyway.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ACCOUNT_SIGNED_OUT_EVENT));
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }
  return true;
}

// A registered person's account and what they told the register page:
// -> { account, profile: { name, age?, organization?, role, product,
//    country?, address?, place?: { lat, lng, label } } | null }.
// 401 "auth_required" without an account (the demo has none).
export const getAccount = (options) => request("GET", "/account", undefined, options);

// ---------- Areas ----------

// -> [{ id, name, kind: "country" | "admin1", country? }]
export async function searchAreas(q, options) {
  const { results } = await request("GET", `/areas/search${query({ q })}`, undefined, options);
  return results || [];
}

// body: { source: "country", id } | { source: "admin1", id, name? }
//     | { source: "coordinates" | "draw", name, points: [[lat, lon], ...] }
//     | { source: "bbox", name, north, south, east, west }
// -> the saved area (with a simplified outline)
export async function createArea(body) {
  const { area } = await request("POST", "/areas", body);
  return area;
}

// -> [area without outline], for the saved-areas list
export async function listAreas() {
  const { areas } = await request("GET", "/areas");
  return areas || [];
}

// -> the area with its outline (simplified unless full is true), its war
//    setting (war: { mode: "war" | "peace", since?, name? }; none means
//    "the app's list") and what the app's list says for it (listConflict:
//    { id, name, since, partOfCountry?, partOf?, otherWarSquares? }, or null
//    at peace: partOfCountry when the war covers the area only in part,
//    partOf "area" when the area is not a whole country, otherWarSquares
//    how many of its squares have the war's rules because another listed
//    war covers them)
export async function getArea(areaId, { full = false } = {}) {
  const { area } = await request("GET", `/areas/${id(areaId)}${full ? "?full=1" : ""}`);
  return area;
}

// body: { name } to rename, and/or { war: { mode: "list" | "war" | "peace",
// since: "YYYY-MM-DD" (for "war": 2022-01-01 to today), name? (up to 80
// characters) } }. Saved months keep the setting they were made with until
// the area is analyzed again (rerun). -> the saved area. Throws an ApiError
// (code "bad_war_setting") for a bad date or mode.
export async function updateArea(areaId, body) {
  const { area } = await request("PATCH", `/areas/${id(areaId)}`, body);
  return area;
}

// ---------- Workspace and team ----------

export async function getWorkspace() {
  const { workspace } = await request("GET", "/workspace");
  return workspace;
}

// partial: any of { name, currentAreaId, settings, budgetUsd, doneSteps, schedule }
// options.keepalive: true lets the save finish while the page is closing.
export async function patchWorkspace(partial, options) {
  const { workspace } = await request("PATCH", "/workspace", partial, options);
  return workspace;
}

// body: { name, email, role: "admin" | "analyst" | "viewer" }
export async function addMember(body) {
  const { member } = await request("POST", "/team", body);
  return member;
}

export async function updateMember(memberId, body) {
  const { member } = await request("PATCH", `/team/${id(memberId)}`, body);
  return member;
}

export async function removeMember(memberId) {
  await request("DELETE", `/team/${id(memberId)}`);
  return true;
}

// ---------- Analysis ----------

// Starts analyzing an area: the latest complete month and the months before
// it (12 by default). Months that already have a run are skipped unless
// rerun is true. -> the job
export async function analyze({ areaId, months, rerun } = {}) {
  const { job } = await request("POST", "/analyze", { areaId, months, rerun });
  return job;
}

// -> { id, areaId, areaName, status: "running" | "done" | "error" | "cancelled", done, total, analyzed, message, error?, runIds,
//      queued (true while it waits for another area's analysis: one area at a time),
//      stopping (true from a Stop until the month in progress has been given up),
//      waiting (what it waits for, to show: "Waiting for Ukraine's analysis to finish", or
//      "Waiting for farm analyses and searches to finish" while a month waits; else null) }
export async function getJob(jobId) {
  const { job } = await request("GET", `/jobs/${id(jobId)}`);
  return job;
}

// Takes an analysis that still waits for its turn out of line (-> the job,
// "cancelled"), or stops one that has started (-> the job with stopping:
// true; it ends "cancelled" a moment later, the months done kept). A job
// that has ended is given back as it is. Throws an ApiError with code
// "cannot_stop" for an analysis started before the server's code was
// reloaded.
export async function cancelJob(jobId) {
  const { job } = await request("POST", `/jobs/${id(jobId)}/cancel`, {});
  return job;
}

export async function listJobs(areaId) {
  const { jobs } = await request("GET", `/jobs${query({ areaId })}`);
  return jobs || [];
}

// ---------- Runs ----------

// -> run summaries (no squares), newest month first
export async function listRuns(areaId) {
  const { runs } = await request("GET", `/runs${query({ areaId })}`);
  return runs || [];
}

// -> the run with its squares (cells) and alerts
export async function getRun(runId) {
  const { run } = await request("GET", `/runs/${id(runId)}`);
  return run;
}

// -> { a, b, deltas: { croplandHa, blackSoilHa, heavyDamageHa, peopleOnDamagedSoil },
//      changedCells: [{ id, lat, lon, heavyDamageHaA, heavyDamageHaB, delta }] }
export const compareRuns = (a, b) => request("GET", `/runs/compare${query({ a, b })}`);

// ---------- States and regions, soil types (the Map page) ----------

// -> { areaId, runId, level: 1 | 2, label: "States" | "Districts", one, many,
//      tooltip, source: "gaul" | "squares", sourceLabel, approximate, reason?,
//      message?, note, computedAt,
//      units: [{ id, name, displayName, level, code, parent, parentDisplayName,
//                country, areaKm2, bbox, labelPoint: { lat, lon }, geometry }],
//      cellUnit: { cellId: unitId } }   (server/units.js)
// The first call for an area can take a few seconds (Earth Engine); later
// ones are instant.
export const getUnits = (areaId, { runId, signal } = {}) => request("GET", `/areas/${id(areaId)}/units${query({ runId })}`, undefined, { signal });

// -> the soil of one square ({ areaId, cellId, runId? }) or one state
//    ({ areaId, unitId }): { available: true, over: "cropland" | "all",
//    top: [{ name, short, share, order, suborder, wrb, blackSoil,
//    greatGroups: [{ value, name, share }] }], otherShare, blackSoilShare,
//    summary, pixels, source, computedAt, ... } or { available: false,
//    reason, message } without Earth Engine (server/soil.js)
export async function getSoil({ areaId, cellId, unitId, runId, signal } = {}) {
  const { soil } = await request("GET", `/soil${query({ areaId, cellId, unitId, runId })}`, undefined, { signal });
  return soil;
}

// ---------- AI ----------

// Streams an answer from the AI.
//   body:    { product: "atlas" | "field", threadId?, message,
//              context: { runId?, settings?, timeframe?, selectedCellId?, farm? } }
//   onEvent: called with (name, data) for each event as it arrives:
//              "thread" { threadId, title }   "delta" { text }
//              "tool"   { name, status }      "done"  { threadId, messageId }
//              "error"  { code, message }     (e.g. code "ai_not_configured")
//   signal:  an AbortSignal to stop the answer early (optional)
// Gives back { threadId, messageId, text, error } once the stream ends.
export async function streamChat({ onEvent = () => {}, signal, ...body }) {
  let response;
  try {
    response = await fetch(`${API_ROOT}/chat`, {
      method: "POST",
      headers: { ...headersFor(body), Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
      credentials: "same-origin", // sends the sign-in cookie
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    const failure = { code: "offline", message: OFFLINE_MESSAGE };
    onEvent("error", failure);
    return { threadId: body.threadId || null, messageId: null, text: "", error: failure };
  }

  // A bad request (empty message...) comes back as JSON before any stream,
  // and so does the demo's limit (429 "quota", with the server's own
  // sentence, shown in the chat as it is).
  if (!response.ok || !response.body) {
    const error = await readError(response);
    noticeSignedOut(error);
    noticeDemoRefusal(error);
    const failure = { code: error.code, message: error.message };
    onEvent("error", failure);
    return { threadId: body.threadId || null, messageId: null, text: "", error: failure };
  }

  const result = { threadId: body.threadId || null, messageId: null, text: "", error: null };
  const handle = (name, data) => {
    if (name === "thread") result.threadId = data.threadId;
    if (name === "delta") result.text += data.text || "";
    if (name === "done") {
      result.threadId = data.threadId || result.threadId;
      result.messageId = data.messageId || null;
    }
    if (name === "error") {
      result.error = data;
      noticeDemoRefusal(data);
    }
    onEvent(name, data);
  };

  // Server-sent events: blocks separated by a blank line, each with
  // "event: name" and "data: {json}" lines. Lines starting ":" are pings.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (block) => {
    let name = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    let parsed;
    try {
      parsed = JSON.parse(data.join("\n"));
    } catch {
      parsed = { text: data.join("\n") };
    }
    handle(name, parsed);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      flush(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) flush(buffer);
  return result;
}

// -> [{ id, title, updatedAt, preview }]
export async function listChats(product) {
  const { threads } = await request("GET", `/chats${query({ product })}`);
  return threads || [];
}

// -> { id, product, title, createdAt, updatedAt, messages: [{ id, role, text, at }] }
export async function getChat(chatId) {
  const { thread } = await request("GET", `/chats/${id(chatId)}`);
  return thread;
}

export async function deleteChat(chatId) {
  await request("DELETE", `/chats/${id(chatId)}`);
  return true;
}

// ---------- Messages from the website's contact form ----------
// Sent by visitors through src/api/siteApi.js sendContact (no sign-in
// needed for that); read here by the owner (server/messages.js; the demo
// gets 403 "owner_only", and Atlas Settings does not ask then).

// -> [{ id, receivedAt, name, email, organization, message }], newest first
export async function listMessages() {
  const { messages } = await request("GET", "/messages");
  return messages || [];
}

export async function deleteMessage(messageId) {
  await request("DELETE", `/messages/${id(messageId)}`);
  return true;
}
