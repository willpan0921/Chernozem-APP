// WHAT THIS FILE DOES
// Turns the ranked map squares into a short list of "Top areas": groups of
// touching squares that all score well, so the Overview can say "start in
// these five places" instead of listing five squares side by side.
//
//   groupHotspots(places, timeframe, { count: 5, cellSizeDeg })
//
// How: the best square not yet used starts a group. It takes in touching
// squares (the 8 around it, then theirs, up to 3 squares from the start)
// that score at least 70% of the starting square. Repeat until there are
// "count" groups.
//
// Each group gives back
//   { id, rank, label, coords, squares, lat, lon,
//     bounds: [[south, west], [north, east]], cellIds, blackSoilHa,
//     heavyDamageHa, people, score, share, tier, soil, damage, access }
// "label" is the one name every page uses for the group:
//   "District, Region" when the run has place names ("Bakhmut, Donetsk";
//   the display names of placeNames.js: "Kharkivs'ka" reads "Kharkiv"),
//   else where it sits in the area: "North-west", "East", "Centre"...
// When two groups in the list would get the same name, both get their
// coordinates added: "West · 47.98° N, 24.76° E".
// "coords" is always the starting square's coordinates and "squares" the
// group's size. labelParts() splits the label for two-line lists: the
// name, then "47.98° N, 24.76° E · 12 squares". The size is on that line
// so two different groups never look the same: the Near term and the Long
// term lists can both start at the same square and still be different
// groups (the 70% rule is applied to a different score).
// soil / damage / access are the group's averages; score, share and tier
// are the starting square's.
//
// The server's AI (server/ai/context.js) uses this same file.
//
// WHO EDITS IT
// Whoever changes how top areas are grouped. Tested in hotspots.test.js.

import { ranking } from "./scoring.js";
import { formatCoord } from "../format.js";
import { placeNames } from "./placeNames.js";

// How far a group may reach from its starting square, in squares.
export const HOTSPOT_RADIUS = 3;
// A square joins a group if it scores at least this share of the start.
export const HOTSPOT_MIN_SHARE = 0.7;

// "r12c40" -> { row: 12, col: 40 } (rows count down from the area's
// north-west corner). Gives back null for other ids.
export function parseCellId(id) {
  const match = /^r(-?\d+)c(-?\d+)$/.exec(id || "");
  return match ? { row: Number(match[1]), col: Number(match[2]) } : null;
}

// How many decimals a coordinate needs so neighbouring squares get
// different names: 2 for a country (0.25° squares), 4 for a farm.
export function coordDigits(cellSizeDeg) {
  if (!(cellSizeDeg > 0)) return 2;
  if (cellSizeDeg < 0.002) return 4;
  if (cellSizeDeg < 0.02) return 3;
  return 2;
}

// The name of a square: "Bakhmut, Donetsk" or "48.59° N, 38.00° E"
// (display names: placeNames.js).
//   cellSizeDeg - the run's square size, for the number of decimals (optional)
export function placeLabel(place, cellSizeDeg) {
  if (!place) return "";
  const names = placeNames(place);
  return names.length ? names.join(", ") : formatCoord(place.lat, place.lon, coordDigits(cellSizeDeg));
}

// The edges of all the squares' centres: [west, south, east, north].
export function placesExtent(places) {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const place of places || []) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
    west = Math.min(west, place.lon);
    east = Math.max(east, place.lon);
    south = Math.min(south, place.lat);
    north = Math.max(north, place.lat);
  }
  return west <= east ? [west, south, east, north] : null;
}

// Where a point sits inside the area: "North-west", "East", "Centre"...
// The area is cut into thirds each way.
//   extent - [west, south, east, north] (see placesExtent)
export function compassName(lat, lon, extent) {
  if (!extent || extent.length !== 4) return "Centre";
  const [west, south, east, north] = extent;
  const x = east > west ? (lon - west) / (east - west) : 0.5;
  const y = north > south ? (lat - south) / (north - south) : 0.5;
  const ns = y > 2 / 3 ? "North" : y < 1 / 3 ? "South" : "";
  const ew = x > 2 / 3 ? "east" : x < 1 / 3 ? "west" : "";
  if (ns && ew) return `${ns}-${ew}`;
  if (ns) return ns;
  if (ew) return ew[0].toUpperCase() + ew.slice(1);
  return "Centre";
}

// The name of a top area: its place names, else its compass part.
function areaName(place, extent) {
  const names = placeNames(place);
  return names.length ? names.join(", ") : compassName(place.lat, place.lon, extent);
}

// The map box around one square: [[south, west], [north, east]].
export function cellBounds(place, cellSizeDeg) {
  const half = (cellSizeDeg || 0) / 2;
  return [
    [place.lat - half, place.lon - half],
    [place.lat + half, place.lon + half],
  ];
}

export function groupHotspots(places, timeframe, { count = 5, cellSizeDeg = 0 } = {}) {
  const ranked = ranking(places || [], timeframe);
  const byPosition = new Map();
  for (const place of ranked) {
    const at = parseCellId(place.id);
    if (at) byPosition.set(`${at.row},${at.col}`, place);
  }

  // The compass names are worked out against all the squares of the run.
  const extent = placesExtent(places);
  const digits = coordDigits(cellSizeDeg);

  const used = new Set();
  const hotspots = [];
  for (const seed of ranked) {
    if (hotspots.length >= count) break;
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    const members = [seed];
    const seedScore = seed[timeframe].score;
    const start = parseCellId(seed.id);

    if (start) {
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        const { row, col } = queue[head];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const next = { row: row + dr, col: col + dc };
            if (Math.max(Math.abs(next.row - start.row), Math.abs(next.col - start.col)) > HOTSPOT_RADIUS) continue;
            const place = byPosition.get(`${next.row},${next.col}`);
            if (!place || used.has(place.id)) continue;
            if (!(place[timeframe].score >= HOTSPOT_MIN_SHARE * seedScore)) continue;
            used.add(place.id);
            members.push(place);
            queue.push(next);
          }
        }
      }
    }

    const sum = (key) => members.reduce((total, member) => total + (Number.isFinite(member[key]) ? member[key] : 0), 0);
    const mean = (key) => sum(key) / members.length;
    const half = (cellSizeDeg || 0) / 2;
    const lats = members.map((member) => member.lat);
    const lons = members.map((member) => member.lon);
    hotspots.push({
      id: `h-${seed.id}`,
      rank: hotspots.length + 1,
      label: areaName(seed, extent),
      coords: formatCoord(seed.lat, seed.lon, digits),
      squares: members.length,
      lat: seed.lat,
      lon: seed.lon,
      bounds: [
        [Math.min(...lats) - half, Math.min(...lons) - half],
        [Math.max(...lats) + half, Math.max(...lons) + half],
      ],
      cellIds: members.map((member) => member.id),
      blackSoilHa: sum("blackSoilHa"),
      heavyDamageHa: sum("heavyDamageHa"),
      people: sum("people"),
      score: seedScore,
      share: seed[timeframe].share,
      tier: seed[timeframe].tier,
      soil: mean("soil"),
      damage: mean("damage"),
      access: mean("access"),
    });
  }

  // Two groups with the same name get their coordinates added.
  const seen = new Map();
  for (const hotspot of hotspots) seen.set(hotspot.label, (seen.get(hotspot.label) || 0) + 1);
  for (const hotspot of hotspots) {
    if (seen.get(hotspot.label) > 1) hotspot.label = `${hotspot.label} · ${hotspot.coords}`;
  }
  return hotspots;
}

// True when a top area's name already has its coordinates in it
// ("West · 47.98° N, 24.76° E").
export function labelHasCoords(hotspot) {
  return Boolean(hotspot?.coords && hotspot.label?.endsWith(` · ${hotspot.coords}`));
}

// "1 square", "12 squares".
export function squaresText(count) {
  const n = Number.isFinite(count) ? count : 0;
  return `${n.toLocaleString("en-US")} ${n === 1 ? "square" : "squares"}`;
}

// The name split in two for lists, with where the group starts and how big
// it is on the second line:
//   { title: "West", coords: "47.98° N, 24.76° E · 12 squares",
//     point: "47.98° N, 24.76° E", size: "12 squares" }
// title + point read together are the one-line label.
export function labelParts(hotspot) {
  if (!hotspot) return { title: "", coords: null, point: null, size: null };
  const title = labelHasCoords(hotspot) ? hotspot.label.slice(0, -(hotspot.coords.length + 3)) : hotspot.label;
  const count = Number.isFinite(hotspot.squares) ? hotspot.squares : hotspot.cellIds?.length;
  const size = Number.isFinite(count) ? squaresText(count) : null;
  const point = hotspot.coords || null;
  return { title, coords: [point, size].filter(Boolean).join(" · ") || null, point, size };
}

// Finds what a "?focus=" value points at: a hotspot id ("h-r12c40") or a
// square id ("r12c40"). Gives back { kind: "hotspot", hotspot } or
// { kind: "cell", place } or null.
export function findFocus(focus, { places = [], hotspots = [] } = {}) {
  if (!focus) return null;
  const hotspot = hotspots.find((item) => item.id === focus);
  if (hotspot) return { kind: "hotspot", hotspot };
  const id = focus.startsWith("h-") ? focus.slice(2) : focus;
  const place = places.find((item) => item.id === id);
  return place ? { kind: "cell", place } : null;
}
