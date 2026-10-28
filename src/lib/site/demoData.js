// WHAT THIS FILE DOES
// Shapes the data for the public site's interactive demo: a map of a
// country's states (Ukraine's oblasts) ranked for both time frames, built
// from one saved month (a run) and the area's saved states (units), with
// the SAME functions and defaults the app's Map page uses for its "Macro"
// view (src/lib/atlas/scoring.js scorePlaces, src/lib/atlas/units.js
// scoreUnits, src/lib/atlas/method.js DEFAULT_SETTINGS). Nothing is scored
// here; this file only calls the method and arranges the answer.
//
//   shapeDemoData({ run, units, cellUnit, settings, exclude, tolerance, decimals, builtAt })
//     run       a saved month (server/.data/runs/<id>.json)
//     units     the area's states (server/.data/units/<areaId>.json .units)
//     cellUnit  which state each square is in ({ cellId: unitId },
//               server/units.js assignCells)
//     settings  the weights and cutoff (default: the research defaults)
//     exclude   states left out of the ranking: { unitId: note } (or a
//               list of ids, with a plain note). Their squares are passed
//               to scorePlaces as "excluded" (not analyzed), so the cutoff
//               and every rank are worked out over the other states only,
//               exactly as if those squares were not there. They stay in
//               the file for drawing, with excluded: true and no scores.
//     -> the demo file (public/site/<area>-demo.json), see below
//
//   paperExclusions(units)  { unitId: note } for the states the research
//                           paper leaves out (Crimea, found by its name)
//
//   simplifyLine(points, tolerance)  Douglas-Peucker on an open line
//   simplifyRing(ring, tolerance)    the same on a closed ring
//   outerRings(geometry)             a Polygon's or MultiPolygon's outer
//                                    rings, holes dropped
//   demoRings(geometry, options)     outer rings, simplified and rounded
//   summaryLines(data)               a short plain-text report of the file
//
// The demo file
//   { version, builtAt, area: { name, month, monthLabel, cellCount, totals },
//     settings: { weights, cutoffPercent, rampWidth, r },
//     timeframes: { nearTerm: { label, leftOutCount, excludedCount, ranked,
//                               gate, setAsideShare },
//                   postCrisis: { label, ranked } },
//     units: [ { id, name, labelPoint, centroidPct, excluded, scores,
//                nearTerm, postCrisis, rankChange, blackSoilHa, croplandHa,
//                heavyDamageHa, people, peopleOnDamagedSoil, squares,
//                nearestConflictKm, rings, note? } ],
//     bbox: [minLon, minLat, maxLon, maxLat] }
// "ranked" counts only the states with a rank in that time frame. An
// excluded state has scores, nearTerm and postCrisis null and a note.
// area.totals are the whole month's (run.totals), excluded states included.
// The lib calls the second time frame "postwar"; the site calls it
// "Post-crisis", as the pages do.
//
// Borders are kept small for a web page: outer rings only, simplified with
// Douglas-Peucker in degrees (about 0.025 deg, a couple of kilometres) and
// rounded to 3 decimals. A ring that collapses to fewer than four points
// (a tiny island) is dropped.
//
// WHO EDITS IT
// Whoever changes what the site's demo shows. The method itself is in
// src/lib/atlas/. Tested in demoData.test.js; the script that reads the
// saved files and writes the demo file is scripts/site-demo-data.js.

import { DEFAULT_SETTINGS, checkSettings } from "../atlas/method.js";
import { scorePlaces } from "../atlas/scoring.js";
import { scoreUnits, unitRanking } from "../atlas/units.js";

export const DEMO_VERSION = 1;
export const DEFAULT_TOLERANCE_DEG = 0.025;
export const DEFAULT_DECIMALS = 3;
export const TIMEFRAME_LABELS = { nearTerm: "Near term", postCrisis: "Post-crisis" };

// The research paper ranks 24 of Ukraine's 25 FAO GAUL level-1 units: it
// leaves out Crimea. Found by name (GAUL spells it either way; the app
// shows "Crimea"), not by a fixed id.
export const PAPER_EXCLUDED_NAMES = ["Avtonomna Respublika Krym", "Krym", "Crimea"];
export const PAPER_EXCLUSION_NOTE = "Not ranked, as in the research paper: occupied since 2014 and outside Ukrainian agricultural reporting.";
// The note for a state left out by hand (scripts/site-demo-data.js --exclude).
export const DEFAULT_EXCLUSION_NOTE = "Not ranked in this demo.";

const finite = (value) => Number.isFinite(value);
const roundTo = (value, digits) => (finite(value) ? Number(value.toFixed(digits)) : null);

// ---------- Borders ----------

// The distance from point p to the segment a-b, in the points' own units.
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas-Peucker: keeps the first and last points and every point that
// sticks out more than "tolerance" from the line through its neighbours'
// kept points. Works through a stack, so long lines do not recurse deeply.
export function simplifyLine(points, tolerance) {
  if (!Array.isArray(points)) return [];
  if (points.length <= 2 || !(tolerance > 0)) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let distance = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1 && distance > tolerance) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// A closed ring (first point = last point) is split at the point farthest
// from its first point, each half simplified as a line, and joined again,
// so the ring's two ends do not sit on one zero-length segment.
export function simplifyRing(ring, tolerance) {
  if (!Array.isArray(ring)) return [];
  if (ring.length < 4 || !(tolerance > 0)) return ring.slice();
  let far = 1;
  let distance = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > distance) {
      distance = d;
      far = i;
    }
  }
  const head = simplifyLine(ring.slice(0, far + 1), tolerance);
  const tail = simplifyLine(ring.slice(far), tolerance);
  return head.concat(tail.slice(1));
}

// The outer ring of each polygon of a GeoJSON Polygon or MultiPolygon;
// holes are left out. Anything else gives no rings.
export function outerRings(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === "Polygon") return geometry.coordinates.length ? [geometry.coordinates[0]] : [];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]).filter(Array.isArray);
  return [];
}

// Rounds a ring's coordinates, drops points that became the same as the
// one before, and keeps it closed.
function roundRing(ring, decimals) {
  const out = [];
  for (const point of ring) {
    const rounded = [roundTo(point[0], decimals), roundTo(point[1], decimals)];
    const last = out[out.length - 1];
    if (last && last[0] === rounded[0] && last[1] === rounded[1]) continue;
    out.push(rounded);
  }
  if (out.length > 1 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([out[0][0], out[0][1]]);
  return out;
}

// A unit's outer rings, simplified and rounded for the page. Rings of
// fewer than four points (a tiny island that collapsed) are dropped.
export function demoRings(geometry, { tolerance = DEFAULT_TOLERANCE_DEG, decimals = DEFAULT_DECIMALS } = {}) {
  return outerRings(geometry)
    .map((ring) => roundRing(simplifyRing(ring, tolerance), decimals))
    .filter((ring) => ring.length >= 4);
}

// [minLon, minLat, maxLon, maxLat] of some rings, or null without points.
export function bboxOfRings(rings) {
  let box = null;
  for (const ring of rings || []) {
    for (const [lon, lat] of ring) {
      if (!box) box = [lon, lat, lon, lat];
      else {
        box[0] = Math.min(box[0], lon);
        box[1] = Math.min(box[1], lat);
        box[2] = Math.max(box[2], lon);
        box[3] = Math.max(box[3], lat);
      }
    }
  }
  return box;
}

// ---------- The ranking ----------

// { unitId: note } for the units the research paper leaves out of its
// ranking (PAPER_EXCLUDED_NAMES, by GAUL name or display name, any case).
export function paperExclusions(units) {
  const wanted = new Set(PAPER_EXCLUDED_NAMES.map((name) => name.toLowerCase()));
  const out = {};
  for (const unit of units || []) {
    if ([unit?.name, unit?.displayName].some((name) => typeof name === "string" && wanted.has(name.toLowerCase()))) out[unit.id] = PAPER_EXCLUSION_NOTE;
  }
  return out;
}

// The "exclude" option as { unitId: note }: a list of ids gets the plain note.
function exclusionMap(exclude) {
  if (Array.isArray(exclude)) return Object.fromEntries(exclude.map((id) => [id, DEFAULT_EXCLUSION_NOTE]));
  if (exclude && typeof exclude === "object") return { ...exclude };
  return {};
}

// Where a point sits in a box, as percentages from its top-left corner
// (x to the right, y downwards), for placing a label on a drawn map.
function percentIn(point, box) {
  if (!point || !box || !finite(point.lon) || !finite(point.lat)) return null;
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  if (!(width > 0) || !(height > 0)) return null;
  return [roundTo((100 * (point.lon - box[0])) / width, 1), roundTo((100 * (box[3] - point.lat)) / height, 1)];
}

function monthLabelOf(run) {
  if (typeof run?.label === "string" && run.label) return run.label;
  const match = /^(\d{4})-(\d{2})$/.exec(run?.month || "");
  if (!match) return run?.month || "";
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function shapeDemoData({ run, units, cellUnit, settings = DEFAULT_SETTINGS, exclude = {}, tolerance = DEFAULT_TOLERANCE_DEG, decimals = DEFAULT_DECIMALS, builtAt = new Date().toISOString() } = {}) {
  if (!run || !Array.isArray(run.cells)) throw new Error("shapeDemoData needs a run with cells");
  const clean = checkSettings(settings);
  const exclusions = exclusionMap(exclude);
  const excludedUnits = new Set(Object.keys(exclusions));
  const unitOf = cellUnit instanceof Map ? (id) => cellUnit.get(id) : (id) => cellUnit?.[id];
  // The excluded states' squares, not analyzed (scoring.js "excluded"), so
  // neither the squares' nor the states' cutoff counts their black soil.
  const excludedCells = run.cells.filter((cell) => excludedUnits.has(unitOf(cell.id))).map((cell) => cell.id);
  // Otherwise exactly the Map page's wiring (src/state/AtlasData.jsx, then
  // src/state/useUnits.js useScoredUnits with the same settings).
  const scored = scorePlaces(run.cells, { settings: clean, conflict: run.conflict, cellSizeDeg: run.cellSizeDeg, excluded: excludedCells });
  const result = scoreUnits(scored.places, units || [], cellUnit || {}, { settings: clean });

  const nearRanked = unitRanking(result.units, "nearTerm");
  const postRanked = unitRanking(result.units, "postwar");
  const leftOut = result.units.filter((unit) => unit.nearTerm?.tier === "setAside");

  const shaped = result.units.map((unit) => {
    const excluded = excludedUnits.has(unit.id);
    const nearRank = !excluded && finite(unit.nearTerm?.rank) ? unit.nearTerm.rank : null;
    const postRank = !excluded && finite(unit.postwar?.rank) ? unit.postwar.rank : null;
    const out = {
      id: unit.id,
      name: unit.displayName || unit.name,
      labelPoint: unit.labelPoint ? { lat: unit.labelPoint.lat, lon: unit.labelPoint.lon } : null,
      centroidPct: null,
      excluded,
      scores: excluded ? null : { value: roundTo(unit.soil, 4), damage: roundTo(unit.damage, 4), access: roundTo(unit.access, 4) },
      nearTerm: excluded ? null : { priority: roundTo(unit.nearTerm?.score, 4), rank: nearRank, leftOut: unit.nearTerm?.tier === "setAside", tier: unit.nearTerm?.tier ?? null },
      postCrisis: excluded ? null : { priority: roundTo(unit.postwar?.score, 4), rank: postRank, tier: unit.postwar?.tier ?? null },
      rankChange: nearRank !== null && postRank !== null ? nearRank - postRank : null,
      blackSoilHa: Math.round(unit.blackSoilHa || 0),
      croplandHa: Math.round(unit.croplandHa || 0),
      heavyDamageHa: Math.round(unit.heavyDamageHa || 0),
      people: Math.round(unit.people || 0),
      peopleOnDamagedSoil: Math.round(unit.peopleOnDamagedSoil || 0),
      squares: unit.squares || 0,
      nearestConflictKm: excluded ? null : roundTo(unit.nearestConflictKm, 1),
      rings: demoRings(unit.geometry, { tolerance, decimals }),
    };
    if (excluded) out.note = exclusions[unit.id] || DEFAULT_EXCLUSION_NOTE;
    else if (!unit.analyzed && unit.reason) out.note = unit.reason;
    return out;
  });
  shaped.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const bbox = bboxOfRings(shaped.flatMap((unit) => unit.rings));
  for (const unit of shaped) unit.centroidPct = percentIn(unit.labelPoint, bbox);

  return {
    version: DEMO_VERSION,
    builtAt,
    area: {
      name: run.areaName || "Ukraine",
      month: run.month || null,
      monthLabel: monthLabelOf(run),
      cellCount: finite(run.cellCount) ? run.cellCount : run.cells.length,
      totals: { ...(run.totals || {}) },
    },
    settings: {
      weights: { ...clean.weights },
      cutoffPercent: clean.gatePercentile,
      rampWidth: clean.rampWidth,
      r: clean.r,
    },
    timeframes: {
      nearTerm: {
        label: TIMEFRAME_LABELS.nearTerm,
        leftOutCount: leftOut.length,
        excludedCount: shaped.filter((unit) => unit.excluded).length,
        ranked: nearRanked.length,
        gate: roundTo(result.gate, 4),
        setAsideShare: roundTo(result.setAsideShare, 4),
      },
      postCrisis: { label: TIMEFRAME_LABELS.postCrisis, ranked: postRanked.length },
    },
    units: shaped,
    bbox,
  };
}

// A short plain-text report of a demo file: the top of each ranking, what
// the cutoff left out, and the biggest moves between the two time frames.
export function summaryLines(data, { top = 8, moves = 3 } = {}) {
  const lines = [];
  const byRank = (key) => data.units.filter((unit) => finite(unit[key]?.rank)).sort((a, b) => a[key].rank - b[key].rank);
  const score = (value) => (finite(value) ? value.toFixed(3) : "-");
  lines.push(`${data.area.name}, ${data.area.monthLabel} (${data.area.cellCount} squares), weights ${data.settings.weights.soil}/${data.settings.weights.damage}/${data.settings.weights.access}, cutoff ${data.settings.cutoffPercent}%`);
  const excluded = data.units.filter((unit) => unit.excluded);
  if (excluded.length) lines.push(`Excluded from the ranking: ${excluded.map((unit) => `${unit.name} (${unit.squares} squares)`).join(", ")}`);
  lines.push(`${TIMEFRAME_LABELS.nearTerm} top ${top} of ${data.timeframes.nearTerm.ranked} ranked (${data.timeframes.nearTerm.leftOutCount} left out by the cutoff):`);
  for (const unit of byRank("nearTerm").slice(0, top)) lines.push(`  ${String(unit.nearTerm.rank).padStart(2)}. ${unit.name.padEnd(16)} ${score(unit.nearTerm.priority)}  (value ${score(unit.scores.value)}, damage ${score(unit.scores.damage)}, access ${score(unit.scores.access)})`);
  const leftOut = data.units.filter((unit) => unit.nearTerm?.leftOut).sort((a, b) => b.blackSoilHa - a.blackSoilHa);
  if (leftOut.length) lines.push(`  left out: ${leftOut.map((unit) => `${unit.name} (access ${score(unit.scores.access)})`).join(", ")}`);
  lines.push(`${TIMEFRAME_LABELS.postCrisis} top ${top} of ${data.timeframes.postCrisis.ranked} ranked:`);
  for (const unit of byRank("postCrisis").slice(0, top)) lines.push(`  ${String(unit.postCrisis.rank).padStart(2)}. ${unit.name.padEnd(16)} ${score(unit.postCrisis.priority)}  (value ${score(unit.scores.value)}, damage ${score(unit.scores.damage)}, access ${score(unit.scores.access)})`);
  const unranked = data.units.filter((unit) => unit.note && !unit.excluded);
  if (unranked.length) lines.push(`Not ranked: ${unranked.map((unit) => `${unit.name} (${unit.note})`).join(", ")}`);
  const biggest = data.units
    .filter((unit) => finite(unit.rankChange))
    .sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange) || a.name.localeCompare(b.name))
    .slice(0, moves);
  if (biggest.length) lines.push(`Biggest rank changes (near term -> post-crisis): ${biggest.map((unit) => `${unit.name} ${unit.nearTerm.rank} -> ${unit.postCrisis.rank} (${unit.rankChange > 0 ? "+" : ""}${unit.rankChange})`).join(", ")}`);
  return lines;
}
