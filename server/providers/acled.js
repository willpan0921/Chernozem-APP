// WHAT THIS FILE DOES
// Reads an optional ACLED export (a CSV of recorded conflict events) and
// picks out the recent battles near an area. The Earth Engine provider
// (gee.js) measures each map cell's distance to these battles: far from
// the fighting = safer to work on the land.
//
//   parseCsv(text)          a CSV file -> rows (handles quotes, commas and
//                           line breaks inside the notes column)
//   toEvent(row)            one ACLED row -> { date, year, type, lat, lon, fatalities, country }
//   loadAcledEvents(path)   the whole file, cached until the file changes
//   battlePoints(events, …) recent battles near an area, thinned to a grid
//   acledBattlesFor(…)      all of the above for one area and month
//
// Same rules as the research deposit's server.js: only "Battles" count
// (long-range strikes are left out so a city hit by a drone does not look
// like the front line), events are grouped into ~5 km squares, and only
// squares with sustained fighting (5 or more battles) are kept. The
// deposit used "2025 and later"; here it is "the 12 months up to the
// month analyzed", so every month gets its own front line.
//
// The file is optional. Without it, gee.js falls back to fire detections.
// Download from acleddata.com (Data Export Tool), any country, CSV format,
// then set ACLED_CSV_PATH in .env.
//
// WHO EDITS IT
// Whoever changes how distance to fighting is measured. Tested in
// gee.test.js.

import fs from "node:fs";

// --- CSV -------------------------------------------------------------------

// Splits CSV text into rows of strings. Quotes may contain commas, doubled
// quotes ("") and line breaks, which ACLED's "notes" column often has.
export function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;
  const input = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      record.push(value);
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value !== "" || record.length) {
    record.push(value);
    if (record.length > 1 || record[0] !== "") records.push(record);
  }
  return records;
}

// CSV text -> objects keyed by the header row (header names lower-cased,
// because ACLED exports use both "EVENT_TYPE" and "event_type").
export function parseCsv(text) {
  const [header, ...rows] = parseCsvRecords(text);
  if (!header) return [];
  const keys = header.map((name) => name.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(keys.map((key, index) => [key, (values[index] ?? "").trim()])));
}

// --- Rows -> events --------------------------------------------------------

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// ACLED dates come as "2024-03-15", "15 March 2024" or "15-March-2024".
// Gives back "YYYY-MM-DD" or null.
export function parseAcledDate(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return isoDay(+match[1], +match[2], +match[3]);
  match = value.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{4})$/);
  if (match) {
    const month = MONTHS.findIndex((name) => name.startsWith(match[2].toLowerCase().slice(0, 3)));
    if (month >= 0) return isoDay(+match[3], month + 1, +match[1]);
  }
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US style 3/15/2024
  if (match) return isoDay(+match[3], +match[1], +match[2]);
  return null;
}

function isoDay(year, month, day) {
  if (!(year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// One CSV row -> a tidy event, or null when it has no usable position.
export function toEvent(row) {
  const coord = (text) => (String(text ?? "").trim() === "" ? NaN : Number(text));
  const lat = coord(row.latitude);
  const lon = coord(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const date = parseAcledDate(row.event_date);
  const year = Number(row.year) || (date ? Number(date.slice(0, 4)) : null);
  return {
    date,
    year,
    type: row.event_type || "",
    lat,
    lon,
    fatalities: Number(row.fatalities) || 0,
    country: row.country || "",
  };
}

// --- Loading (cached until the file changes) -------------------------------

const cache = { path: null, mtimeMs: -1, events: [] };

// Reads the file once and keeps the events in memory. Throws a clear error
// when the file is missing or is not an ACLED export.
export function loadAcledEvents(csvPath) {
  let stat;
  try {
    stat = fs.statSync(csvPath);
  } catch {
    throw new Error(`ACLED file not found: ${csvPath}. Fix ACLED_CSV_PATH in .env or leave it empty.`);
  }
  if (cache.path === csvPath && cache.mtimeMs === stat.mtimeMs) return cache.events;
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  if (rows.length && !("latitude" in rows[0] && "event_type" in rows[0])) {
    throw new Error(`${csvPath} does not look like an ACLED export (it needs latitude, longitude and event_type columns).`);
  }
  const events = rows.map(toEvent).filter(Boolean);
  Object.assign(cache, { path: csvPath, mtimeMs: stat.mtimeMs, events });
  return events;
}

// --- Picking the battles near an area --------------------------------------

// The bounding box grown by `km` on every side (so battles just outside the
// area still count when measuring distance).
export function expandBbox([west, south, east, north], km) {
  const dLat = km / 111.32;
  const maxLat = Math.min(89, Math.max(Math.abs(south), Math.abs(north)) + dLat);
  const dLon = km / (111.32 * Math.max(0.05, Math.cos((maxLat * Math.PI) / 180)));
  return [Math.max(-180, west - dLon), Math.max(-90, south - dLat), Math.min(180, east + dLon), Math.min(90, north + dLat)];
}

// The date window for a month: the 12 months that end with it.
// "2026-09" -> { from: "2025-10-01", to: "2026-09-30" } (both included).
export function acledWindow(month, months = 12) {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - months, 1));
  const end = new Date(Date.UTC(year, mon, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

// Recent battles near an area, thinned to one point per ~5 km square with
// sustained fighting. Gives back { points: [[lon, lat], ...], battles, squares }.
//   bbox       [west, south, east, north] of the area
//   month      "YYYY-MM": battles in the 12 months ending with it count
//   bufferKm   how far outside the area battles still count (300 km)
//   gridDeg    square size for thinning (0.05° ≈ 5 km, as in the deposit)
//   minEvents  battles a square needs to count as the front (5, as in the deposit)
//   maxPoints  cap so the Earth Engine request stays small
export function battlePoints(events, { bbox, month, bufferKm = 300, gridDeg = 0.05, minEvents = 5, maxPoints = 5000 } = {}) {
  const [west, south, east, north] = expandBbox(bbox, bufferKm);
  const { from, to } = acledWindow(month);
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const squares = new Map();
  let battles = 0;
  for (const event of events) {
    if (event.type !== "Battles") continue;
    if (event.lat < south || event.lat > north || event.lon < west || event.lon > east) continue;
    // Use the exact date when there is one, else the year.
    if (event.date) {
      if (event.date < from || event.date > to) continue;
    } else if (!(event.year >= fromYear && event.year <= toYear)) continue;
    battles += 1;
    const gLon = Math.round(event.lon / gridDeg) * gridDeg;
    const gLat = Math.round(event.lat / gridDeg) * gridDeg;
    const key = `${gLon.toFixed(3)},${gLat.toFixed(3)}`;
    const square = squares.get(key);
    if (square) square.count += 1;
    else squares.set(key, { lon: Number(gLon.toFixed(4)), lat: Number(gLat.toFixed(4)), count: 1 });
  }
  const all = [...squares.values()].sort((a, b) => b.count - a.count);
  let kept = all.filter((square) => square.count >= minEvents);
  // A quieter conflict may have no square with 5 battles; then every
  // battle square counts rather than none.
  const relaxed = kept.length === 0 && all.length > 0;
  if (relaxed) kept = all;
  return {
    points: kept.slice(0, maxPoints).map((square) => [square.lon, square.lat]),
    battles,
    squares: kept.length,
    relaxed,
  };
}

// Everything for one area and month. Never throws: problems come back as
// a warning so the run can carry on with the fire-based fallback.
//   -> { points, warning|null, source: "acled"|null, status }
//   status  "none" (no file is set), "ok" (battles found), "no-battles"
//           (the file has none within 300 km of the area in the 12
//           months) or "unusable" (the file could not be used). The
//           warnings of the last two are worded so the pages can tell them
//           apart (src/lib/atlas/overview.js acledFileState): a run whose
//           fires found no fighting must not say "there is no ACLED file"
//           when one is connected.
export const ACLED_NO_BATTLES_WARNING = "The ACLED file has no battles within 300 km of this area in the last 12 months.";
export function acledBattlesFor({ csvPath, bbox, month }) {
  if (!csvPath) return { points: [], warning: null, source: null, status: "none" };
  try {
    const events = loadAcledEvents(csvPath);
    const result = battlePoints(events, { bbox, month });
    if (!result.points.length) {
      return { points: [], warning: ACLED_NO_BATTLES_WARNING, source: null, status: "no-battles" };
    }
    const warning = result.relaxed ? "No place near this area had 5 or more recorded battles; every recorded battle was used." : null;
    return { points: result.points, warning, source: "acled", status: "ok" };
  } catch (error) {
    // loadAcledEvents says "ACLED file not found: ..." or "... does not
    // look like an ACLED export ..."; anything else (a file that cannot be
    // read) is said as the ACLED file's problem too.
    const message = String(error?.message || error);
    return { points: [], warning: /ACLED/.test(message) ? message : `The ACLED file could not be read: ${message}`, source: null, status: "unusable" };
  }
}

// For the gee:check script and the status line: is the file usable?
export function acledStatus(csvPath) {
  if (!csvPath) return { ok: false, detail: "Not set (optional). Fire detections are used for distance to fighting." };
  try {
    const events = loadAcledEvents(csvPath);
    const battles = events.filter((event) => event.type === "Battles").length;
    return { ok: true, detail: `${events.length.toLocaleString("en-US")} events, ${battles.toLocaleString("en-US")} battles.` };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}
