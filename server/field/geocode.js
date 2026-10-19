// WHAT THIS FILE DOES
// Finds a place for the farm setup: typed coordinates are read right here
// ("49.74, 37.54", "49.74N 37.54E", "49°44'N 37°32'E"); place names are
// looked up with OpenStreetMap Nominatim (server-side, at most one request
// a second as its rules ask, answers kept for 24 hours).
//
//   parseCoordinates(text)  -> { lat, lon } | null
//   geocode(text)           -> [{ label, lat, lon, bbox: [w, s, e, n] }] (at most 6)
//
// Throws status 503 "geocode_unavailable" when Nominatim cannot be reached.
//
// WHO EDITS IT
// Nobody, normally.

import { formatCoord } from "../geo.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=";
const USER_AGENT = "Chernozem/1.0 (farm setup)";
const CACHE_MS = 24 * 60 * 60 * 1000;
const GAP_MS = 1000;
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 6;

const state = (globalThis.__chernozemGeocode ??= { cache: new Map(), last: 0, chain: Promise.resolve() });

// One number: decimal degrees, or degrees/minutes/seconds.
function readAngle(text) {
  const dms = text.match(/^(-?\d+(?:\.\d+)?)\s*[°º d]\s*(?:(\d+(?:\.\d+)?)\s*['′m]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:["″]|'')\s*)?$/i);
  if (dms) {
    const deg = Number(dms[1]);
    const value = Math.abs(deg) + Number(dms[2] || 0) / 60 + Number(dms[3] || 0) / 3600;
    return deg < 0 ? -value : value;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return NaN;
}

// "49.74, 37.54" / "49.74 37.54" / "49.74N 37.54E" / "37.54E, 49.74N" /
// "N 49.74 E 37.54" / "49°44'24\"N 37°32'E" -> { lat, lon }. Without letters
// the order is latitude, longitude (as Google Maps copies it).
export function parseCoordinates(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().replace(/\s+/g, " ");
  if (!text || text.length > 80) return null;
  const parts = text.match(/^([NSns]?\s*-?[\d.°º'′"″\s]+?\s*[NSEWnsew]?)\s*(?:[,;/]|\s)\s*([NSEWnsew]?\s*-?[\d.°º'′"″\s]+?\s*[NSEWnsew]?)$/);
  if (!parts) return null;
  const read = (piece) => {
    const letters = piece.match(/[NSEWnsew]/g) || [];
    if (letters.length > 1) return null;
    const letter = letters[0]?.toUpperCase() || null;
    const value = readAngle(piece.replace(/[NSEWnsew]/g, "").trim());
    if (!Number.isFinite(value)) return null;
    const signed = letter === "S" || letter === "W" ? -Math.abs(value) : value;
    return { value: signed, axis: letter === "N" || letter === "S" ? "lat" : letter === "E" || letter === "W" ? "lon" : null };
  };
  const a = read(parts[1]);
  const b = read(parts[2]);
  if (!a || !b) return null;
  let lat;
  let lon;
  if (a.axis === "lon" || b.axis === "lat") {
    if (a.axis === "lat" || b.axis === "lon") return null; // both the same axis
    lat = b.value;
    lon = a.value;
  } else {
    if (a.axis === "lon" || b.axis === "lat") return null;
    lat = a.value;
    lon = b.value;
  }
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

function unavailable(message) {
  const error = new Error(message);
  error.status = 503;
  error.code = "geocode_unavailable";
  return error;
}

// Nominatim's display names are long ("Kupiansk, Kupiansk Hromada, ...,
// Kharkiv Oblast, 63700, Ukraine"): keep the place, the region and the country.
export function shortLabel(displayName) {
  const parts = String(displayName || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^\d[\d\s-]*$/.test(part));
  if (parts.length <= 3) return parts.join(", ");
  return [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(", ");
}

export function parseNominatim(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      const box = Array.isArray(item.boundingbox) ? item.boundingbox.map(Number) : null; // [s, n, w, e]
      return {
        label: shortLabel(item.display_name) || formatCoord(lat, lon),
        lat,
        lon,
        bbox: box && box.every(Number.isFinite) ? [box[2], box[0], box[3], box[1]] : [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01],
      };
    })
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .slice(0, MAX_RESULTS);
}

// Waits so requests to Nominatim are at least GAP_MS apart (one at a time).
function nextSlot() {
  const slot = state.chain.then(async () => {
    const wait = state.last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    state.last = Date.now();
  });
  state.chain = slot.catch(() => {});
  return slot;
}

export async function geocode(input, { fetchImpl = globalThis.fetch } = {}) {
  const text = String(input || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text) return [];
  const coords = parseCoordinates(text);
  if (coords) {
    const { lat, lon } = coords;
    const r = (value) => Math.round(value * 1e6) / 1e6;
    return [{ label: formatCoord(lat, lon, 4), lat, lon, bbox: [r(lon - 0.01), r(lat - 0.01), r(lon + 0.01), r(lat + 0.01)] }];
  }
  const key = text.toLowerCase();
  const hit = state.cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;

  await nextSlot();
  let list;
  try {
    const res = await fetchImpl(NOMINATIM + encodeURIComponent(text), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
    list = await res.json();
  } catch (error) {
    throw unavailable(`Place search is not available right now (${error.message}). You can type coordinates instead, like "49.74, 37.54".`);
  }
  const results = parseNominatim(list);
  state.cache.set(key, { at: Date.now(), results });
  if (state.cache.size > 500) state.cache.delete(state.cache.keys().next().value);
  return results;
}
