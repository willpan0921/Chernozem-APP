// WHAT THIS FILE DOES
// Gives the AI the facts it answers from. For the Atlas it loads the
// workspace, the current area and the chosen month's run, scores the run
// with the same code the map uses (so the AI and the map always agree), and
// then offers two things:
//   - a short "context text" that goes at the top of every chat request
//     (area, month, data source, totals, top places, alerts, settings,
//     history), and
//   - the tools Claude may call to look things up: get_ranking, get_place,
//     compare_months, budget_coverage and get_history.
// The Field app's context is built from the saved farm in field-context.js.
//
// WHO EDITS IT
// Whoever changes what the AI knows or can look up. To add a tool, add its
// definition to ATLAS_TOOLS and a matching function in runTool() below.
// Tool definitions must stay in the same order (it keeps Claude's prompt
// cache working).

import { scorePlaces, ranking, nearTermShares } from "../../src/lib/atlas/scoring.js";
import { COSTS, DEFAULT_SETTINGS, FIRE_YEARS, HEAVY_DAMAGE, METHOD_VERSION, PEACE_DAMAGE, checkSettings, runsComparable } from "../../src/lib/atlas/method.js";
import { FIGHTING_SEARCH_KM, warningWords, accessMeasured, accessSourceOf, acledFileState, acledStateText, alertPlaces, atPeace, beforeWar, conflictOf, noFightingFound, notMeasuredReason, outsideWar, peaceSquares, seasonWords, shownNewDamage, warInPart, warKey, warPartOf, warSetByTeam } from "../../src/lib/atlas/overview.js";
import { EARLIEST_WAR_DAY, TEAM_WAR_NAME, teamConflict } from "../../src/config/conflicts.js";
import { listConflictForArea } from "../conflicts.js";
import { NO_WAR_WARNING, TEAM_PEACE_WARNING } from "../runs.js";
import { placeNames } from "../../src/lib/atlas/placeNames.js";

// ---------- Tool definitions (sent to Claude) ----------
// strict: true makes Claude's tool inputs always match these shapes.
// Numeric limits (like "at most 20") are checked in code, not here, because
// strict schemas do not support minimum/maximum.
export const ATLAS_TOOLS = [
  {
    name: "get_ranking",
    description:
      "Top-priority places in the current area under the user's current weights. Call this when the user asks where to start, which places matter most, or for a ranked list. timeframe: nearTerm (value and damage; the least feasible share is left out for now: the Feasibility cutoff) or postwar (the Post-crisis ranking: value, damage and feasibility blended).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        timeframe: { type: "string", enum: ["nearTerm", "postwar"], description: "Which ranking to use." },
        limit: { type: "integer", description: "How many places to return, 1 to 20." },
      },
      required: ["timeframe", "limit"],
      additionalProperties: false,
    },
  },
  {
    name: "get_place",
    description:
      "Full detail for one map cell: value, damage and feasibility (safe access: distance to fighting) scores, ranks in both timeframes, black-soil and heavily damaged hectares, people, and recovery cost. Call this when the user asks about a specific place, a cell id (like r12c40) or a coordinate. Give either cellId, or lat and lon (the nearest cell is used).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        cellId: { type: "string", description: "A cell id such as r12c40." },
        lat: { type: "number", description: "Latitude in degrees." },
        lon: { type: "number", description: "Longitude in degrees." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "compare_months",
    description:
      "Compares two analyzed months of the current area: change in cropland, black-soil cropland, heavily damaged hectares and people on damaged land, plus the cells that changed most. Call this when the user asks what changed, whether damage is growing, or about one month versus another. Months are YYYY-MM.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        a: { type: "string", description: "The earlier month, YYYY-MM." },
        b: { type: "string", description: "The later month, YYYY-MM." },
      },
      required: ["a", "b"],
      additionalProperties: false,
    },
  },
  {
    name: "budget_coverage",
    description:
      "How many hectares a budget in US dollars can restore (fast path and full recovery; where a war is listed, before demining) and which top near-term places it covers first. Call this when the user mentions money, a budget, funding or cost.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        usd: { type: "number", description: "Budget in US dollars." },
      },
      required: ["usd"],
      additionalProperties: false,
    },
  },
  {
    name: "get_history",
    description:
      "Totals for every analyzed month of the current area, newest first (heavily damaged hectares, new damage, black-soil cropland, people on damaged land, data source). Call this for trends over time.",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// ---------- Small helpers ----------

// What the AI calls the safe-access score (the pages' word since
// 2026-10-25); the code and the saved data keep the key "access".
export const FEASIBILITY = "Feasibility (safe access: distance to fighting)";
// At peace, where the AI does not bring up fighting.
export const FEASIBILITY_PEACE = "Feasibility (safe access)";

// A place's three scores as the AI reads them: value, damage, feasibility.
const scoresFor = (p) => ({ value: score100(p.soil), damage: score100(p.damage), feasibility: score100(p.access) });
// Weights as the AI reads them ({ soil, damage, access } -> value, damage,
// feasibility; a near-term share has no access).
const weightWords = (w) => ({ value: w.soil, damage: w.damage, ...(w.access !== undefined ? { feasibility: w.access } : {}) });
// The near-term tier of a square the cutoff leaves out, in words.
const tierWords = (tier) => (tier === "setAside" ? "left out for now (least feasible: Feasibility cutoff)" : tier);

const round = (value, digits = 0) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const ha = (value) => (Number.isFinite(value) ? `${Math.round(value).toLocaleString("en-US")} ha` : "unknown");
const people = (value) => (Number.isFinite(value) ? `about ${Math.round(value).toLocaleString("en-US")}` : "unknown");
const score100 = (value) => (Number.isFinite(value) ? Math.round(value * 100) : null);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// 49.62, 37.74 -> "49.62° N, 37.74° E"
export function coordLabel(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

// "Bakhmut, Donetsk" when the run has place names (the display names the
// pages use: src/lib/atlas/placeNames.js, "Kharkivs'ka" -> "Kharkiv"),
// else the coordinates.
export function placeLabel(cell) {
  const names = placeNames(cell);
  return names.length ? names.join(", ") : coordLabel(cell.lat, cell.lon);
}

// ---------- Hotspot grouping ----------
// The pages use src/lib/atlas/hotspots.js. If that file is not there (yet),
// this simpler local version is used so the AI still works.

let hotspotModule;
async function loadGroupHotspots() {
  if (hotspotModule === undefined) {
    try {
      hotspotModule = await import("../../src/lib/atlas/hotspots.js");
    } catch {
      hotspotModule = null;
    }
  }
  return typeof hotspotModule?.groupHotspots === "function" ? hotspotModule.groupHotspots : fallbackGroupHotspots;
}

// Greedy grouping: the best cell not yet used starts a hotspot and takes in
// touching cells (up to 3 cells away) that score at least 70% of it.
export function fallbackGroupHotspots(places, timeframe, { count = 5, cellSizeDeg = 0 } = {}) {
  const ranked = ranking(places, timeframe);
  const grid = new Map();
  const rowCol = (id) => {
    const match = /^r(-?\d+)c(-?\d+)$/.exec(id || "");
    return match ? [Number(match[1]), Number(match[2])] : null;
  };
  for (const place of ranked) {
    const rc = rowCol(place.id);
    if (rc) grid.set(`${rc[0]},${rc[1]}`, place);
  }
  const used = new Set();
  const hotspots = [];
  for (const seed of ranked) {
    if (hotspots.length >= count) break;
    if (used.has(seed.id)) continue;
    const seedScore = seed[timeframe].score;
    const members = [seed];
    used.add(seed.id);
    const seedRc = rowCol(seed.id);
    if (seedRc) {
      const queue = [seedRc];
      while (queue.length) {
        const [r, c] = queue.shift();
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (Math.max(Math.abs(nr - seedRc[0]), Math.abs(nc - seedRc[1])) > 3) continue;
            const next = grid.get(`${nr},${nc}`);
            if (!next || used.has(next.id) || !(next[timeframe].score >= 0.7 * seedScore)) continue;
            used.add(next.id);
            members.push(next);
            queue.push([nr, nc]);
          }
        }
      }
    }
    const sum = (key) => members.reduce((total, m) => total + (Number.isFinite(m[key]) ? m[key] : 0), 0);
    const mean = (key) => sum(key) / members.length;
    const half = cellSizeDeg / 2;
    hotspots.push({
      id: `h-${seed.id}`,
      rank: hotspots.length + 1,
      label: placeLabel(seed),
      lat: seed.lat,
      lon: seed.lon,
      bounds: [
        [Math.min(...members.map((m) => m.lat)) - half, Math.min(...members.map((m) => m.lon)) - half],
        [Math.max(...members.map((m) => m.lat)) + half, Math.max(...members.map((m) => m.lon)) + half],
      ],
      cellIds: members.map((m) => m.id),
      blackSoilHa: sum("blackSoilHa"),
      heavyDamageHa: sum("heavyDamageHa"),
      score: seedScore,
      share: seed[timeframe].share,
      tier: seed[timeframe].tier,
      soil: mean("soil"),
      damage: mean("damage"),
      access: mean("access"),
    });
  }
  return hotspots;
}

// ---------- Loading the Atlas data ----------

// Loads and scores everything the Atlas AI needs.
//   store    - server/store.js (or a stand-in in tests)
//   runs     - server/runs.js (for compareRuns), optional
//   context  - what the page sent: { runId?, settings?, timeframe?, selectedCellId? }
// Gives back { workspace, area, run, summaries, scored, settings, timeframe, hotspots, text, tools, runTool }.
export async function buildAtlasContext({ store, runs, context = {} }) {
  const workspace = (await store.getWorkspace()) || {};
  const settings = checkSettings(context.settings || workspace.settings || DEFAULT_SETTINGS);
  const timeframe = context.timeframe === "postwar" ? "postwar" : "nearTerm";

  // The area: the run's own area when a run is asked for, else the current one.
  let run = null;
  if (typeof context.runId === "string" && context.runId) {
    run = await safe(() => store.getRun(context.runId));
  }
  const areaId = run?.areaId || workspace.currentAreaId || null;
  const area = areaId ? await safe(() => store.getArea(areaId)) : null;
  const summaries = area ? (await safe(() => store.listRuns(area.id))) || [] : [];
  if (!run && summaries.length) run = await safe(() => store.getRun(summaries[0].id));

  const cells = Array.isArray(run?.cells) ? run.cells : [];
  const scored = scorePlaces(cells, { settings, conflict: conflictOf(run), cellSizeDeg: run?.cellSizeDeg });
  const groupHotspots = await loadGroupHotspots();
  const hotspotsFor = (tf, count) =>
    cells.length ? groupHotspots(scored.places, tf, { count, cellSizeDeg: run.cellSizeDeg }) : [];
  const hotspots = { nearTerm: hotspotsFor("nearTerm", 10), postwar: hotspotsFor("postwar", 10) };

  const data = { workspace, area, run, summaries, scored, settings, timeframe, hotspots, hotspotsFor };
  const selected = context.selectedCellId ? scored.places.find((p) => p.id === context.selectedCellId) : null;

  return {
    ...data,
    text: contextText({ ...data, selected }),
    tools: ATLAS_TOOLS,
    runTool: (name, input) => runAtlasTool(name, input, { ...data, store, runs }),
  };
}

// Runs a store call, giving null instead of an error (missing files etc.).
async function safe(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ---------- The context text ----------

// The war covering the area, as the AI should read it, with what the
// damage score and Feasibility (safe access: distance to fighting) mean
// for this run (they differ at peace:
// src/lib/atlas/scoring.js). Callers pass conflictOf(run) (overview.js),
// which fills in the war for older country runs; when it is still
// undefined nothing is said.
//   accessSource   where Feasibility came from (run.accessSource: "acled",
//                  "fires", "fires-none", "none" or null). "fires-none": in
//                  the war, no fire within 300 km of any square looked like
//                  fighting (server/providers/gee.js), so Feasibility is
//                  not measured: every square reads as far from fighting,
//                  which does not mean safe, and the AI is told never to
//                  call land safe
//   currentMethod  the run was made with this method version
//                  (run.method.version === METHOD_VERSION): how damage
//                  behaves over time (src/lib/atlas/method.js FIRE_YEARS) is
//                  said only then; an older run is said to be older
//   setByTeam      the area's team set this war (or this peace) in Atlas
//                  Settings, instead of the app's list (overview.js
//                  warSetByTeam): the AI is told so, and to say so
//   beforeWar      the month ends before the war began (overview.js
//                  beforeWar): no war damage is counted for it and distance
//                  to fighting is not measured, so neither "Damage is counted
//                  from that day" nor "recorded fighting" is said
//   inPart         the war covers this area only in part
//                  (run.conflict.partOfCountry): { warSquares, squares, of,
//                  otherWar }, the squares that had its rules
//                  (run.warSquares), all of them, what the area is
//                  ("country", or "area" for a region, a box or a drawn
//                  area: overview.js warPartOf), and how many of the first
//                  had them because another listed war covers them
//                  (run.otherWarSquares: server/conflicts.js warCellsFor);
//                  the others keep the war's dates but get the peace rule
//                  for heavy damage and the peace damage score
//   acled          what a connected ACLED file did when the distance did not
//                  come from it (overview.js acledFileState: null,
//                  "no-battles", "unusable"): where no fire looked like
//                  fighting, the AI is then never told "there is no ACLED
//                  file"
export function conflictLine(conflict, accessSource = null, { currentMethod = true, setByTeam = false, beforeWar = false, inPart = null, acled = null } = {}) {
  if (conflict === undefined) return "";
  // At peace the label does not bring up fighting (FEASIBILITY_PEACE).
  const notMeasured = (why, label = FEASIBILITY) =>
    `${label} is not measured here: ${why}, so it reads full (100) everywhere and nothing is left out of the near-term ranking for it. That does NOT mean the land is safe: never call land safe, and point to local authorities for unexploded ordnance or security questions.`;
  const acledLine = (label = FEASIBILITY) => `${label}: measured to the battles in the ACLED file, full at 100 km.`;
  const acledAccess = acledLine();
  if (conflict && conflict.since) {
    // A war the team set from the earliest day allowed may have begun
    // before it (src/config/conflicts.js EARLIEST_WAR_DAY).
    const earliest =
      setByTeam && conflict.since === EARLIEST_WAR_DAY
        ? " That is the earliest day the app allows (the normal years 2019 to 2021 must come before the war): the war may have begun earlier, so damage before that day is not counted, and the normal years may already include the war."
        : "";
    // Without a name of its own (TEAM_WAR_NAME), the AI does not call the
    // placeholder the team's name for it.
    const named = conflict.name && conflict.name !== TEAM_WAR_NAME;
    const who = setByTeam
      ? named
        ? ` This war was set by the user's team for this area in Atlas Settings (its name and start date are the team's, not from the app's list of wars); say so when you name it.${earliest}`
        : ` This war was set by the user's team for this area in Atlas Settings (its start date is the team's; the team gave it no name, so call it the war the user's team set for this area, not by a name).${earliest}`
      : "";
    if (beforeWar) {
      return `War: ${conflict.name || conflict.id}, since ${conflict.since}.${who} This month ends before the war began, so no war damage is counted for it (no war year of fires, no war season of radar: the damage score is 0 everywhere) and distance to fighting was not measured for it. Do not present this month's numbers as war damage; the months from the day the war began count it. ${accessSource === "acled" ? acledAccess : notMeasured("this month ends before the war began")}`;
    }
    // With no ACLED file the distance is to unusual fires: an estimate of
    // where fighting is, not recorded fighting (server/providers/gee.js).
    // "none" (nothing measured) is never called recorded fighting, and
    // "fires-none" (no fire looked like fighting) is never called safe.
    const otherWarFires = inPart?.otherWar > 0;
    const firesWhere = inPart ? ` inside the war's region${otherWarFires ? " and its squares in another listed war" : ""}` : "";
    // A connected ACLED file that had no battles near the area, or could
    // not be used, is said as such (never "there is no ACLED file"), and
    // the AI points to what would measure it.
    const pointTo = acled === "no-battles" ? "ACLED data that covers this area (only battles count, not strikes)" : acled === "unusable" ? "fixing the ACLED file (see the data warnings)" : "an ACLED file";
    const warAccess =
      accessSource === "acled"
        ? acledAccess
        : accessSource === "fires"
          ? `${FEASIBILITY}: measured to unusual fires (an estimate of where fighting is; there is no ACLED file of recorded fighting), full at 100 km. Treat it as rough.`
          : accessSource === "fires-none"
            ? `${FEASIBILITY} is not measured here (no fires that look like fighting were found within ${FIGHTING_SEARCH_KM} km${firesWhere}, and ${acledStateText(acled)}); every square reads as far from fighting, which does not mean safe. Never call land safe; point to local authorities and ${pointTo}.`
            : accessSource === "none"
              ? notMeasured("nothing was measured for this month")
              : `${FEASIBILITY}: measured to recorded fighting, full at 100 km.`;
    // A war in part of the area: where its rules apply (the squares that
    // touch its region, and those another listed war covers:
    // server/conflicts.js warCellsFor), and exactly what differs for the
    // other squares. Their distance to fighting is said only without an
    // ACLED file (with one, every square's is to its battles).
    const fullAt = Math.round(PEACE_DAMAGE.fullShare * 100);
    const counted = Number.isFinite(inPart?.warSquares) && Number.isFinite(inPart?.squares) ? ` (${inPart.warSquares} of ${inPart.squares} squares)` : "";
    const otherWar = inPart?.otherWar > 0 ? inPart.otherWar : 0;
    const elsewhere = otherWar
      ? ` ${otherWar === 1 ? "1 of them lies" : `${otherWar} of them lie`} in another war of the app's list without touching this war's region: that is land at war too (counted with this war's dates).`
      : "";
    const fires =
      accessSource === "acled"
        ? ""
        : accessSource === "fires-none"
          ? ` ${acled === "no-battles" ? "With no ACLED battles near the area" : acled === "unusable" ? "Without a usable ACLED file" : "Without an ACLED file"}, only the fires inside the war's region${otherWar ? " and its squares in another listed war" : ""} could stand in for fighting, and none of them looked like fighting, so feasibility is not measured in any square; unusual fires in the other squares do not count as fighting (they are taken to have ordinary causes: harvest burning, wildfire).`
          : ` Without an ACLED file, every square's distance to fighting is measured to the unusual fires inside the war's region${otherWar ? " and its squares in another listed war" : ""}; unusual fires in the other squares do not count as fighting (they are taken to have ordinary causes: harvest burning, wildfire).`;
    const part = inPart
      ? ` This war covers only part of this ${inPart.of === "area" ? "area" : "country"}: its rules apply only in the map squares that touch the war's region${otherWar ? " or lie in another listed war" : ""}${counted}, which have atWar true in their details.${elsewhere} The other squares (atWar false) keep the war's dates (damage counted from the day it began, its fire years and war seasons), but two things there follow the peace rules: heavy damage needs radar change of ${HEAVY_DAMAGE.radarDb} dB or more AND an unusual fire within ${HEAVY_DAMAGE.fireNearM / 1000} km, and the damage score is the heavily damaged share of the black soil (full at ${fullAt}%).${fires} Do not talk about fighting, a front line or demining for a place whose squares all have atWar false unless the user raises it.`
      : "";
    return `War: ${conflict.name || conflict.id}, since ${conflict.since}.${who} Damage is counted from that day. Damage score: the mean of unusual fire and radar change against the normal years 2019 to 2021. ${currentMethod ? damageOverTime() : OLDER_METHOD} ${warAccess}${part}`;
  }
  const fullAt = Math.round(PEACE_DAMAGE.fullShare * 100);
  const damage = `Damage score: the share of each place's black-soil cropland that is heavily damaged (radar change of ${HEAVY_DAMAGE.radarDb} dB or more backed by an unusual fire within ${HEAVY_DAMAGE.fireNearM / 1000} km, against the normal years 2019 to 2021), full at ${fullAt}%. Here that change has everyday causes (tillage, new buildings, wildfire, flooding).`;
  // Who decided there is no war: never "no war is recorded" where the app's
  // list has one that the team overrode.
  const access = accessSource === "acled" ? acledLine(FEASIBILITY_PEACE) : notMeasured(setByTeam ? "the user's team marked this area as not at war" : "no war is recorded for this area", FEASIBILITY_PEACE);
  const none = setByTeam
    ? "War: none. The user's team marked this area as not at war in Atlas Settings, so the app's list of wars is not used for it (say so if asked about a war here)."
    : "War: none in the app's list covers this area (wars are matched by country and, where listed, by area, e.g. the Gaza Strip only).";
  return `${none} ${damage} ${access} Do not talk about a war, a front line or demining for this area unless the user raises it.`;
}

// Why nothing is left out for feasibility, as the AI should say it (the
// pages' words are overview.js peaceReason, which speaks to "your team"):
// "no war recorded", "the user's team marked this area as not at war",
// "this month ends before the war began on 2026-06-01", or, in a war where
// no fire looked like fighting (overview.js noFightingFound), "feasibility
// is not measured here: no fires that look like fighting were found within
// 300 km, and there is no ACLED file" (or what a connected ACLED file did:
// overview.js acledFileState).
export function quietReason(run) {
  if (noFightingFound(run)) {
    const reason = notMeasuredReason(run);
    return `feasibility is not measured here: ${reason.found}, and ${reason.acled}`;
  }
  if (beforeWar(run)) return `this month ends before the war began on ${conflictOf(run).since}`;
  if (atPeace(run) && warSetByTeam(run)) return "the user's team marked this area as not at war";
  return "no war recorded";
}

// A line for when the area's war setting no longer gives the war this
// month was made with: the team changed it in Atlas Settings (area.war),
// or the app's list changed, and the analysis has not been re-run. The
// month's numbers follow the setting it was made with. "" otherwise, and
// when it cannot be told (an older run, an area without an outline).
export function warSettingNote(area, run) {
  const madeWith = conflictOf(run);
  const made = warKey(madeWith);
  if (!area || made === undefined) return "";
  const own = teamConflict(area.war, area.id);
  const now = own !== undefined ? own : listConflictForArea(area);
  if (now === undefined || warKey(now) === made) return "";
  // The same start day: what changed is where the war's rules apply (all
  // over the area, or only in part of it: partOfCountry).
  const where = (war) => (war?.since && now?.since === madeWith?.since ? (war.partOfCountry ? " (war rules only in part of the area)" : " (war rules all over the area)") : "");
  // A war the team set without a name of its own is never called by the
  // placeholder (TEAM_WAR_NAME), as in conflictLine.
  const named = now?.name && now.name !== TEAM_WAR_NAME ? ` (${now.name})` : "";
  const nowText = now ? `at war${named} since ${now.since}${where(now)}` : "not at war";
  const who = own !== undefined ? `the user's team has since marked this area ${nowText}` : now ? `the app's list now has this area ${nowText}` : "the app's list now has no war for this area";
  return `War setting changed: this month was made ${made ? `at war since ${madeWith.since}${where(madeWith)}` : "at peace"}, but ${who}. Its numbers follow the setting it was made with until the analysis is re-run (Atlas Settings, Re-run analysis).`;
}

// For a month whose damage radar took in a new growing season
// (overview.js seasonWords): " This is the first month that counts the
// radar images of the 2026 growing season: most of this month's new heavy
// damage is older damage ..." when its new heavy damage is above 0 (the
// one check the pages use too: seasonJump); otherwise the plain fact, and
// why heavily damaged land can fall that month (never a "jump": real data,
// Iowa, November 2025, 0 ha new). "" for any other month.
export function newSeasonFact(run, runs) {
  const season = seasonWords(run, runs);
  if (!season) return "";
  if (season.left) {
    const first = ` This is the first month without the radar images of the ${season.name} (it left the two-year window)`;
    if (season.jump) return `${first}: with fewer seasons compared, a change has to show in fewer seasons to count as heavy damage, so most of this month's new heavy damage is that change in what is compared, not damage done within this one month. Say so when you talk about this month's new damage.`;
    return `${first}. Heavily damaged land is now measured over fewer seasons, so it can move this month; that alone does not mean land was damaged or recovered.`;
  }
  const first = ` This is the first month that counts the radar images of the ${season.name}`;
  if (season.jump) return `${first}: most of this month's new heavy damage is older damage, radar change seen over that whole season, not damage done within this one month. Say so when you talk about this month's new damage.`;
  return `${first}. No new heavy damage was found: ${fallWhy(season)}`;
}

// Why heavily damaged land can fall in the month a season joined (for the
// AI): a change must now last over two seasons (the radar holds that many
// for the first time: seasonWords lasting), or it is measured over other
// seasons than the month before's (the new season can also change the
// orbit direction compared). Never "because two seasons" otherwise.
function fallWhy(season) {
  return season.lasting
    ? `with two complete seasons for the first time, a change must now last over both to count as heavy damage, so heavily damaged land can fall this month; that alone does not mean land recovered.`
    : `heavily damaged land is now measured over other seasons than the month before's (the new season can also change the orbit direction the radar is compared from), so it can fall; that alone does not mean land recovered.`;
}

// How damage behaves from month to month in a war, for runs made with this
// method (src/lib/atlas/method.js FIRE_YEARS, radarPersistence; season.js
// damageSeasons), with the exceptions the code has, so the AI can explain a
// drop: a war's second season, a new season (which can also change the
// orbit direction compared: gee.js pickPass), a month measured with coarser
// pixels or the latitude's season, and scores that are relative (ranks,
// tiers) or use the last 12 months (feasibility).
function damageOverTime() {
  return [
    `Unusual fire is the fires of the worst war year (12-month years counted from the day the war began; the current one so far, once it is ${FIRE_YEARS.minMonths} months long) above a normal year (the 2019 to 2021 average).`,
    "Radar change is the change that lasts: reached in at least two complete growing seasons since the war began (while only one is complete, that one).",
    "Damage is not allowed to fade with time, because soil damage lasts after the fires stop (land abandoned near the front is not burned again).",
    "So while the war seasons stay the same, heavily damaged land does not shrink from one month to the next: it can only grow, with new fires.",
    "When a new year's growing season joins (once a year) it usually grows, but it can fall where a place goes from one measured season to two (normally the war's second year), or when the new season changes the orbit direction the radar is compared from (the one with the most passes in both the war seasons and the same season of 2019 to 2021): every season is then measured again from the other side.",
    "A month whose data warnings say it used coarser pixels, or took the growing season from the latitude, can differ either way.",
    "This is about heavily damaged hectares; the damage score usually moves the same way, but a square scored on fire alone (no radar reading) can drop when radar is first read, and priority scores, ranks and tiers can go up or down from month to month.",
  ].join(" ");
}
// The same for a run made with an older method (before METHOD_VERSION).
const OLDER_METHOD = `This month was made with an older method (fires over the whole window, the last season's radar): its heavy damage could fall from month to month, and it is not comparable with months made with the current method (${METHOD_VERSION}).`;

// The weights as the two rankings really use them (scoring.js):
//   Near term   value and damage only, as shares of 100; feasibility is a
//               cutoff there (the least feasible share of the black soil is
//               left out for now: the Feasibility cutoff), not a weight
//   Post-crisis           all three, weighted power mean
// At peace without ACLED feasibility is full everywhere, so it changes no
// order: both rankings put the squares in the same order (real Kenya run,
// 2026-09: 135 of 135 ranked squares in the same place). Their top places
// can still group differently: the 70% grouping rule is applied to scores
// of a different size.
export function settingsLine(settings, run, scored, timeframe) {
  const w = settings.weights;
  const near = nearTermShares(w);
  // Outside a war's rules (at peace, or a month before its war began) the
  // long view is "Long term", and without an ACLED file nothing is set
  // out for it (overview.js outsideWar, accessMeasured).
  const measured = accessMeasured(run);
  const setAside = scored.places.filter((p) => p.nearTerm.tier === "setAside").length;
  const longName = "Post-crisis";
  const cutoff = !measured
    ? `nothing is left out for feasibility (${quietReason(run)})`
    : settings.gatePercentile > 0
      ? `feasibility is a cutoff there, not a weight (the Feasibility cutoff): the least feasible ${settings.gatePercentile}% of the black soil is left out of the near-term ranking for now (${setAside} ${setAside === 1 ? "square" : "squares"} left out; they show in the lowest priority shade on the map)`
      : "feasibility is a cutoff there, not a weight, and the Feasibility cutoff is 0%: nothing is left out";
  const longNote = measured
    ? ""
    : noFightingFound(run)
      ? "; feasibility is not measured here (it reads 100 everywhere, which does not mean safe), so it changes no order: both rankings put the squares in the same order (their top places can still group differently)"
      : "; feasibility is 100 everywhere here (not measured), so it changes no order: both rankings put the squares in the same order (their top places can still group differently)";
  const viewing = timeframe === "postwar" ? longName : "Near term";
  return `Weights as used: Near term ranks by value ${near.soil}% and damage ${near.damage}%; ${cutoff}. ${longName} blends value ${w.soil}%, damage ${w.damage}% and feasibility ${w.access}% (weighted power mean, r = ${settings.r})${longNote}. The user is viewing ${viewing}.`;
}

// A top place outside the squares of a war that covers the area only in
// part: every one of its squares is outside them (atWar false), so heavy
// damage and the damage score there follow the peace rules (overview.js
// peaceSquares).
const outsideWarRegion = (h, calm) => calm.size > 0 && h.cellIds.length > 0 && h.cellIds.every((id) => calm.has(id));

// accessUnknown: feasibility is not measured in the run (overview.js
// noFightingFound), so a place's feasibility is "not measured", not 100.
function hotspotLine(h, index, calm = new Set(), accessUnknown = false) {
  const coords = coordLabel(h.lat, h.lon);
  // A repeated name already ends in " · <coords>" (see labelHasCoords in
  // src/lib/atlas/hotspots.js), so it is used as it is.
  const labelHasCoords = Boolean(h.coords && h.label?.endsWith(` · ${h.coords}`));
  const where = h.label === coords || labelHasCoords ? h.label : `${h.label} (${coords})`;
  const squares = h.cellIds.length;
  const region = outsideWarRegion(h, calm) ? " (outside the war's squares: heavy damage and the damage score by the peace rules)" : "";
  return `${index + 1}. ${where}, ${squares} ${squares === 1 ? "square" : "squares"}${region}: score ${score100(h.score)}/100, tier ${h.tier}, black-soil ${ha(h.blackSoilHa)}, heavily damaged ${ha(h.heavyDamageHa)}, value ${score100(h.soil)} / damage ${score100(h.damage)} / feasibility ${accessUnknown ? "not measured" : score100(h.access)}`;
}

export function contextText({ workspace, area, run, summaries, scored, settings, timeframe, hotspots, selected }) {
  const lines = [];
  if (!area) {
    lines.push("No area has been chosen yet. Tell the user to pick a country or enter coordinates on the Atlas Overview or Settings page.");
    return lines.join("\n");
  }
  lines.push(`Area: ${area.name} (${area.kind}${area.source ? `, entered by ${area.source}` : ""}), ${ha(area.areaHa)} in total.`);
  if (!run) {
    lines.push("No analysis has finished for this area yet. Tell the user to run the analysis (Settings → Re-run analysis).");
    return lines.join("\n");
  }
  const source = run.provider === "gee" ? "Google Earth Engine (real satellite data)" : "SAMPLE DATA (synthetic, for testing only — not real measurements)";
  lines.push(`Month: ${run.label || run.month} (imagery ${run.imagery?.from || "?"} to ${run.imagery?.to || "?"}, baseline ${run.baseline?.label || "2019 to 2021"}).`);
  lines.push(`Data source: ${source}.`);
  const peace = conflictOf(run) === null;
  // How damage behaves over time is said only for a run made with this
  // method (older runs: fires over the whole window, the last season's radar).
  const inPart = warInPart(run) ? { warSquares: run.warSquares, squares: run.cellCount ?? run.cells?.length, of: warPartOf(run.conflict), otherWar: run.otherWarSquares } : null;
  const war = conflictLine(conflictOf(run), accessSourceOf(run), { currentMethod: run.method?.version === METHOD_VERSION, setByTeam: warSetByTeam(run), beforeWar: beforeWar(run), inPart, acled: acledFileState(run) });
  if (war) lines.push(war);
  const changed = warSettingNote(area, run);
  if (changed) lines.push(changed);
  lines.push(`Grid: ${run.cellCount ?? run.cells?.length ?? 0} map squares (cells) of about ${round(run.cellSizeKm, 2)} km.`);
  const t = run.totals || {};
  lines.push(
    `Totals: cropland ${ha(t.croplandHa)}, black-soil cropland ${ha(t.blackSoilHa)}, heavily damaged ${ha(t.heavyDamageHa)}, people on damaged land ${people(t.peopleOnDamagedSoil)}.` +
      (Number.isFinite(shownNewDamage(run, summaries)) ? ` New heavy damage since the previous month: ${ha(run.newHeavyDamageHa)}.${newSeasonFact(run, summaries)}` : "")
  );
  // The "no war" warning (or the team's "not at war") is said better by the
  // War line above (it still names distance to fighting, which is not part
  // of a run at peace).
  // At peace the damage score needs radar change (scoring.js), so a square
  // without radar has no damage score from fires alone.
  const warnings = (run.checks?.warnings || [])
    .filter((w) => !(peace && (w === NO_WAR_WARNING || w === TEAM_PEACE_WARNING)))
    .map((w) => (peace ? String(w).replace(/their damage uses fires only\.?$/, "no heavy damage can be found there (here it needs radar change).") : w))
    // In the words the pages use ("Feasibility", "left out"), saved runs too.
    .map(warningWords);
  if (warnings.length) lines.push(`Data warnings: ${warnings.map((w) => String(w).replace(/[.\s]+$/, "")).join("; ")}.`);

  lines.push(settingsLine(settings, run, scored, timeframe));

  // Top places are groups of touching squares; the same name in both lists
  // can be two different groups (see the square counts).
  lines.push("", "Top places, near term:");
  const calm = peaceSquares(run);
  const accessUnknown = noFightingFound(run);
  hotspots.nearTerm.forEach((h, i) => lines.push(hotspotLine(h, i, calm, accessUnknown)));
  if (!hotspots.nearTerm.length) lines.push("(none)");
  lines.push("", "Top places, post-crisis:");
  hotspots.postwar.forEach((h, i) => lines.push(hotspotLine(h, i, calm, accessUnknown)));
  if (!hotspots.postwar.length) lines.push("(none)");

  const alerts = run.alerts || [];
  // Named as the Overview and the Report name them (coordinates added when
  // two of a kind share a place).
  const alertNames = alertPlaces(alerts);
  lines.push("", alerts.length ? "Alerts this month:" : "Alerts this month: none.");
  for (const a of alerts) {
    lines.push(`- ${a.kind === "radar" ? "Radar change" : "Fires"} on ${a.date} at ${alertNames.get(a.id) || a.place || coordLabel(a.lat, a.lon)}: ${round(a.magnitude, 1)} ${a.unit}.`);
  }

  if (summaries.length) {
    lines.push("", "History by month (newest first):");
    lines.push("(Months from different data sources, method versions or war settings are not comparable: never subtract them.)");
    for (const s of summaries.slice(0, 24)) {
      // A month whose damage radar took in a new growing season says so
      // (seasonWords), whatever its heavy damage did.
      const season = seasonWords(s, summaries);
      const joined = season ? ` (first month with the radar images of the ${season.season} growing season)` : "";
      lines.push(
        `- ${s.month}: heavily damaged ${ha(s.totals?.heavyDamageHa)}, new ${Number.isFinite(shownNewDamage(s, summaries)) ? ha(s.newHeavyDamageHa) : "n/a"}${joined}, black-soil ${ha(s.totals?.blackSoilHa)}, people on damaged land ${people(s.totals?.peopleOnDamagedSoil)}, ${s.provider === "gee" ? "Earth Engine" : "sample"}`
      );
    }
  }

  // The place picked on the map. Where feasibility is not measured
  // (noFightingFound) its feasibility reads "not measured", as on the Map page
  // and in the top places above, with the tools' note beside it: never a
  // bare 100 for the place the user asks about.
  if (selected) {
    const detail = placeDetail(selected, atWar(run));
    if (accessUnknown) detail.scores.feasibility = "not measured";
    lines.push("", `The user has this cell selected on the map: ${JSON.stringify({ ...accessNote(run), ...detail })}`);
  }
  if (workspace?.budgetUsd) lines.push("", `Workspace budget: $${Math.round(workspace.budgetUsd).toLocaleString("en-US")}.`);
  return lines.join("\n");
}

// ---------- Tools ----------

// True when a known war covers the run's area (run.conflict). Older runs
// have no conflict field: they were all made inside Ukraine.
export function atWar(run) {
  const conflict = conflictOf(run);
  return conflict === undefined ? true : Boolean(conflict);
}

// What the recovery cost leaves out: demining only where a war is listed.
// Every cost the AI sees says it is a planning assumption: the per-hectare
// ranges are not measured and not tied to a published source.
export function costNote(war) {
  return war ? "before demining; planning assumption (not sourced)" : "rough ranges for restoring the soil; planning assumption (not sourced)";
}

// A place's details for the AI. For a war that covers the area only in
// part, a square outside its region (p.atWar false: the peace rules for
// heavy damage and the damage score) says so, and its costs are not
// "before demining".
function placeDetail(p, war = true) {
  const atWarHere = war && p.atWar !== false;
  return {
    cellId: p.id,
    ...(typeof p.atWar === "boolean" ? { atWar: p.atWar } : {}),
    label: placeLabel(p),
    lat: round(p.lat, 4),
    lon: round(p.lon, 4),
    scores: scoresFor(p),
    ...(p.reason ? { notRanked: p.reason } : {}),
    nearTerm: { score: score100(p.nearTerm.score), rank: p.nearTerm.rank, tier: tierWords(p.nearTerm.tier) },
    postwar: { score: score100(p.postwar.score), rank: p.postwar.rank, tier: p.postwar.tier },
    croplandHa: round(p.croplandHa),
    blackSoilHa: round(p.blackSoilHa),
    heavyDamageHa: round(p.heavyDamageHa),
    people: round(p.people),
    peopleOnDamagedSoil: round(p.peopleOnDamagedSoil),
    recoveryCostUsd: recoveryCost(p.heavyDamageHa, atWarHere),
  };
}

// The cost to restore some hectares, as [low, high] US dollars.
//   war  true when a known war covers the area (the note then says the
//        costs are before demining; at peace there is nothing to demine)
function recoveryCost(hectares, war = true) {
  const h = Number.isFinite(hectares) ? hectares : 0;
  return {
    fastPath: COSTS.fastPathPerHa.map((perHa) => Math.round(perHa * h)),
    fullRecovery: COSTS.fullRecoveryPerHa.map((perHa) => Math.round(perHa * h)),
    note: costNote(war),
  };
}

function hotspotDetail(h, calm = new Set()) {
  return {
    rank: h.rank,
    ...(outsideWarRegion(h, calm) ? { outsideWarRegion: true } : {}),
    label: h.label,
    lat: round(h.lat, 4),
    lon: round(h.lon, 4),
    score: score100(h.score),
    tier: h.tier,
    blackSoilHa: round(h.blackSoilHa),
    heavyDamageHa: round(h.heavyDamageHa),
    scores: scoresFor(h),
    cellIds: h.cellIds.slice(0, 12),
    squares: h.cellIds.length,
  };
}

const NO_RUN = { error: "No analysis is available for the current area yet." };

// In a war where no fire looked like fighting (overview.js
// noFightingFound), the tools' answers (and the place selected on the map,
// in the context) say once that the places' feasibility score of 100 is
// not a measurement: { feasibility }; {} otherwise.
function accessNote(run) {
  if (!noFightingFound(run)) return {};
  const reason = notMeasuredReason(run);
  return { feasibility: `not measured here (${reason.found}, and ${reason.acled}): every place's feasibility of 100 only means nothing was found, not that it is safe` };
}

// What get_ranking says of feasibility where it is not measured: "not
// used: full everywhere (no war recorded)" at peace; in a war where no
// fire looked like fighting, that it is not measured and that its 100 does
// not mean safe.
function unusedAccess(run) {
  if (noFightingFound(run)) return `not used: ${quietReason(run)}; it reads 100 everywhere, which does not mean safe, and nothing is left out`;
  return `not used: full everywhere (${quietReason(run)})`;
}

// Runs one tool. Always gives back a plain object (sent to Claude as JSON).
// Problems come back as { error } so Claude can explain them.
export async function runAtlasTool(name, input = {}, data) {
  const { run, scored, summaries, area } = data;
  switch (name) {
    case "get_ranking": {
      if (!run) return NO_RUN;
      const timeframe = input.timeframe === "postwar" ? "postwar" : "nearTerm";
      const limit = Math.min(20, Math.max(1, Math.round(Number(input.limit) || 5)));
      const list = data.hotspotsFor(timeframe, limit);
      return {
        area: area?.name,
        month: run.month,
        dataSource: run.provider,
        timeframe,
        // The weights as this ranking uses them (see settingsLine).
        weightsUsed:
          timeframe === "nearTerm"
            ? { ...weightWords(nearTermShares(data.settings.weights)), feasibility: !accessMeasured(run) ? unusedAccess(run) : "Feasibility cutoff, not a weight" }
            : weightWords(data.settings.weights),
        // Squares the Feasibility cutoff leaves out of the near-term ranking
        // for now (scoring.js tier "setAside").
        leftOutForNowCells: scored.places.filter((p) => p.nearTerm.tier === "setAside").length,
        ...accessNote(run),
        places: list.map((h) => hotspotDetail(h, peaceSquares(run))),
      };
    }
    case "get_place": {
      if (!run) return NO_RUN;
      let place = null;
      if (typeof input.cellId === "string" && input.cellId) {
        place = scored.places.find((p) => p.id === input.cellId);
        if (!place) return { error: `No cell "${input.cellId}" in this run. Cell ids look like r12c40.` };
      } else if (Number.isFinite(input.lat) && Number.isFinite(input.lon)) {
        let best = Infinity;
        for (const p of scored.places) {
          const d = (p.lat - input.lat) ** 2 + ((p.lon - input.lon) * Math.cos((input.lat * Math.PI) / 180)) ** 2;
          if (d < best) {
            best = d;
            place = p;
          }
        }
        if (!place) return { error: "This run has no cells." };
        const km = Math.sqrt(best) * 111.32;
        if (km > Math.max(5, (run.cellSizeKm || 1) * 2)) {
          return { error: `That point is about ${Math.round(km)} km from the nearest analyzed cell, outside ${area?.name || "the area"}.` };
        }
      } else {
        return { error: "Give a cellId, or both lat and lon." };
      }
      return { month: run.month, dataSource: run.provider, ...accessNote(run), place: placeDetail(place, atWar(run)) };
    }
    case "compare_months": {
      if (!run) return NO_RUN;
      const { a, b } = input;
      if (!MONTH_RE.test(a || "") || !MONTH_RE.test(b || "")) return { error: "Months must look like 2026-09." };
      const byMonth = (m) => summaries.find((s) => s.month === m);
      const available = summaries.map((s) => s.month);
      if (!byMonth(a) || !byMonth(b)) return { error: `Not analyzed: ${[a, b].filter((m) => !byMonth(m)).join(", ")}. Available months: ${available.join(", ")}.` };
      if (!data.runs?.compareRuns) return { error: "Comparison is not available on this server." };
      const runA = await data.store.getRun(byMonth(a).id);
      const runB = await data.store.getRun(byMonth(b).id);
      // Another data source, method, grid or war setting: no differences (method.js runsComparable).
      const check = runsComparable(runA, runB);
      if (!check.comparable) {
        return { a: { month: a, dataSource: runA.provider }, b: { month: b, dataSource: runB.provider }, comparable: false, note: `${check.text}: these two months cannot be subtracted. Say so; do not compare their totals.` };
      }
      const result = data.runs.compareRuns(runA, runB);
      const roundObject = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, round(v)]));
      return {
        a: { month: a, totals: roundObject(result.a?.totals) },
        b: { month: b, totals: roundObject(result.b?.totals) },
        change: roundObject(result.deltas),
        biggestChanges: (result.changedCells || []).slice(0, 10).map((c) => {
          const cell = scored.places.find((p) => p.id === c.id);
          return {
            cellId: c.id,
            label: cell ? placeLabel(cell) : coordLabel(c.lat, c.lon),
            heavyDamageHaA: round(c.heavyDamageHaA),
            heavyDamageHaB: round(c.heavyDamageHaB),
            change: round(c.delta),
          };
        }),
      };
    }
    case "budget_coverage": {
      if (!run) return NO_RUN;
      const usd = Number(input.usd);
      if (!(usd > 0)) return { error: "The budget must be a positive number of US dollars." };
      const [fastLo, fastHi] = COSTS.fastPathPerHa;
      const [fullLo, fullHi] = COSTS.fullRecoveryPerHa;
      const coverage = {
        fastPathHa: [Math.round(usd / fastHi), Math.round(usd / fastLo)],
        fullRecoveryHa: [Math.round(usd / fullHi), Math.round(usd / fullLo)],
      };
      // Walk down the near-term list with the cautious (smaller) estimate.
      // A place with heavy damage needs its damaged hectares restored; one
      // with none found is counted by its black-soil cropland, and says so
      // (black soil is never called damage).
      let left = coverage.fastPathHa[0];
      const coversFirst = [];
      for (const h of data.hotspotsFor("nearTerm", 20)) {
        if (left <= 0) break;
        const damaged = h.heavyDamageHa > 0;
        const need = damaged ? h.heavyDamageHa : h.blackSoilHa;
        const share = need > 0 ? Math.min(1, left / need) : 1;
        coversFirst.push({
          label: h.label,
          squares: h.cellIds.length,
          heavyDamageHa: round(h.heavyDamageHa),
          blackSoilHa: round(h.blackSoilHa),
          countedHa: round(need),
          counted: damaged ? "heavily damaged hectares" : "black-soil cropland (no heavy damage found)",
          coveredShare: round(share, 2),
        });
        left -= need;
      }
      return {
        usd,
        costPerHaUsd: { fastPath: COSTS.fastPathPerHa, fullRecovery: COSTS.fullRecoveryPerHa },
        coversHa: coverage,
        coversFirst,
        note: atWar(run)
          ? "Costs exclude demining. Only certified deminers can declare land safe. The per-hectare costs are planning assumptions (not sourced), not measurements: say so."
          : `Rough ranges for restoring damaged soil. ${warSetByTeam(run) ? "The user's team marked this area as not at war" : "No war is recorded in this area"}; this does not say the land is safe. The per-hectare costs are planning assumptions (not sourced), not measurements: say so.`,
      };
    }
    case "get_history": {
      if (!summaries.length) return { error: "No months have been analyzed for this area yet." };
      return {
        area: area?.name,
        months: summaries.map((s) => {
          // The month a new growing season joined the damage radar
          // (seasonWords): most of its new heavy damage is older damage
          // when there is any; else why heavily damaged land can fall.
          const season = seasonWords(s, summaries);
          return {
            month: s.month,
            dataSource: s.provider,
            heavyDamageHa: round(s.totals?.heavyDamageHa),
            newHeavyDamageHa: round(shownNewDamage(s, summaries)),
            ...(season
              ? {
                  newGrowingSeason: season.jump
                    ? `the radar images of the ${season.name} are counted from this month: most of this month's new heavy damage is older damage, radar change seen over that whole season, not damage done within the month`
                    : `the radar images of the ${season.name} are counted from this month; no new heavy damage: ${fallWhy(season)}`,
                }
              : {}),
            blackSoilHa: round(s.totals?.blackSoilHa),
            croplandHa: round(s.totals?.croplandHa),
            peopleOnDamagedSoil: round(s.totals?.peopleOnDamagedSoil),
            alerts: s.alertsCount ?? null,
          };
        }),
      };
    }
    default:
      return { error: `Unknown tool "${name}".` };
  }
}
