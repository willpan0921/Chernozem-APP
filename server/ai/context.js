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
import { accessMeasured, accessSourceOf, alertPlaces, atPeace, beforeWar, conflictOf, outsideWar, peaceSquares, shownNewDamage, warInPart, warKey, warSetByTeam } from "../../src/lib/atlas/overview.js";
import { EARLIEST_WAR_DAY, TEAM_WAR_NAME, teamConflict } from "../../src/config/conflicts.js";
import { listConflictForArea } from "../conflicts.js";
import { NO_WAR_WARNING, TEAM_PEACE_WARNING } from "../runs.js";

// ---------- Tool definitions (sent to Claude) ----------
// strict: true makes Claude's tool inputs always match these shapes.
// Numeric limits (like "at most 20") are checked in code, not here, because
// strict schemas do not support minimum/maximum.
export const ATLAS_TOOLS = [
  {
    name: "get_ranking",
    description:
      "Top-priority places in the current area under the user's current weights. Call this when the user asks where to start, which places matter most, or for a ranked list. timeframe: nearTerm (only places with safe access, least-safe share set aside) or postwar (all three scores blended).",
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
      "Full detail for one map cell: soil, damage and safe-access scores, ranks in both timeframes, black-soil and heavily damaged hectares, people, and recovery cost. Call this when the user asks about a specific place, a cell id (like r12c40) or a coordinate. Give either cellId, or lat and lon (the nearest cell is used).",
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

// "Bakhmut, Donetsk" when the run has place names, else the coordinates.
export function placeLabel(cell) {
  const names = [cell.admin2, cell.admin1].filter(Boolean);
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
// damage score and safe access mean for this run (they differ at peace:
// src/lib/atlas/scoring.js). Callers pass conflictOf(run) (overview.js),
// which fills in the war for older country runs; when it is still
// undefined nothing is said.
//   accessSource   where safe access came from (run.accessSource: "acled",
//                  "fires", "none" or null)
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
//   inPart         the war covers this whole-country area only in part
//                  (run.conflict.partOfCountry): { warSquares, squares },
//                  the squares that had its rules (run.warSquares) and all
//                  of them; the others were read at peace rules
export function conflictLine(conflict, accessSource = null, { currentMethod = true, setByTeam = false, beforeWar = false, inPart = null } = {}) {
  if (conflict === undefined) return "";
  const notMeasured = (why) =>
    `Safe access: ${why}, so it is full (100) everywhere and nothing is set aside for it. That does NOT mean the land is safe: never call land safe, and point to local authorities for unexploded ordnance or security questions.`;
  const acledAccess = "Safe access: the distance to battles in the ACLED file, full at 100 km.";
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
      return `War: ${conflict.name || conflict.id}, since ${conflict.since}.${who} This month ends before the war began, so no war damage is counted for it (no war year of fires, no war season of radar: the damage score is 0 everywhere) and distance to fighting was not measured for it. Do not present this month's numbers as war damage; the months from the day the war began count it. ${accessSource === "acled" ? acledAccess : notMeasured("not measured for this month")}`;
    }
    // With no ACLED file the distance is to unusual fires: an estimate of
    // where fighting is, not recorded fighting (server/providers/gee.js).
    // "none" (nothing measured) is never called recorded fighting.
    const warAccess =
      accessSource === "acled"
        ? acledAccess
        : accessSource === "fires"
          ? "Safe access: the distance to unusual fires (an estimate of where fighting is; there is no ACLED file of recorded fighting), full at 100 km. Treat it as rough."
          : accessSource === "none"
            ? notMeasured("not measured for this month")
            : "Safe access: the distance to recorded fighting, full at 100 km.";
    // A war in part of a whole-country area: where its rules apply, and
    // what the other squares are (src/config/conflicts.js warSquares).
    const fullAt = Math.round(PEACE_DAMAGE.fullShare * 100);
    const counted = Number.isFinite(inPart?.warSquares) && Number.isFinite(inPart?.squares) ? ` (${inPart.warSquares} of ${inPart.squares} squares)` : "";
    const part = inPart
      ? ` This war covers only part of this country: its rules apply only in the map squares that touch the war's region${counted}, which have atWar true in their details. The other squares were read as at peace: there heavy damage needs radar change of ${HEAVY_DAMAGE.radarDb} dB or more AND an unusual fire within ${HEAVY_DAMAGE.fireNearM / 1000} km, the damage score is the heavily damaged share of the black soil (full at ${fullAt}%), and unusual fires there have ordinary causes (harvest burning, wildfire); their distance to fighting is measured to the unusual fires inside the war's region. Do not talk about fighting, a front line or demining for a place outside the war's region unless the user raises it.`
      : "";
    return `War: ${conflict.name || conflict.id}, since ${conflict.since}.${who} Damage is counted from that day. Damage score: the mean of unusual fire and radar change against the normal years 2019 to 2021. ${currentMethod ? damageOverTime() : OLDER_METHOD} ${warAccess}${part}`;
  }
  const fullAt = Math.round(PEACE_DAMAGE.fullShare * 100);
  const damage = `Damage score: the share of each place's black-soil cropland that is heavily damaged (radar change of ${HEAVY_DAMAGE.radarDb} dB or more backed by an unusual fire within ${HEAVY_DAMAGE.fireNearM / 1000} km, against the normal years 2019 to 2021), full at ${fullAt}%. Here that change has everyday causes (tillage, new buildings, wildfire, flooding).`;
  // Who decided there is no war: never "no war is recorded" where the app's
  // list has one that the team overrode.
  const access = accessSource === "acled" ? acledAccess : notMeasured(setByTeam ? "the user's team marked this area as not at war" : "no war is recorded here");
  const none = setByTeam
    ? "War: none. The user's team marked this area as not at war in Atlas Settings, so the app's list of wars is not used for it (say so if asked about a war here)."
    : "War: none in the app's list covers this area (wars are matched by country and, where listed, by area, e.g. the Gaza Strip only).";
  return `${none} ${damage} ${access} Do not talk about a war, a front line or demining for this area unless the user raises it.`;
}

// Why nothing is set aside for safe access, as the AI should say it (the
// pages' words are overview.js peaceReason, which speaks to "your team"):
// "no war recorded", "the user's team marked this area as not at war", or
// "this month ends before the war began on 2026-06-01".
export function quietReason(run) {
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
  // over a whole-country area, or only in its squares that touch the war's
  // region: partOfCountry).
  const where = (war) => (war?.since && now?.since === madeWith?.since ? (war.partOfCountry ? " (war rules only in the squares that touch the war's region)" : " (war rules all over the area)") : "");
  const nowText = now ? `at war (${now.name}) since ${now.since}${where(now)}` : "not at war";
  const who = own !== undefined ? `the user's team has since marked this area ${nowText}` : now ? `the app's list now has this area ${nowText}` : "the app's list now has no war for this area";
  return `War setting changed: this month was made ${made ? `at war since ${madeWith.since}${where(madeWith)}` : "at peace"}, but ${who}. Its numbers follow the setting it was made with until the analysis is re-run (Atlas Settings, Re-run analysis).`;
}

// How damage behaves from month to month in a war, for runs made with this
// method (src/lib/atlas/method.js FIRE_YEARS, radarPersistence; season.js
// damageSeasons), with the exceptions the code has, so the AI can explain a
// drop: a war's second season, a new season (which can also change the
// orbit direction compared: gee.js pickPass), a month measured with coarser
// pixels or the latitude's season, and scores that are relative (ranks,
// tiers) or use the last 12 months (safe access).
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
//   Near term   soil and damage only, as shares of 100; safe access is a
//               cutoff there (the least safe share of the black soil is set
//               aside first), not a weight
//   Long term / Postwar   all three, weighted power mean
// At peace without ACLED safe access is full everywhere, so it changes no
// order: both rankings put the squares in the same order (real Kenya run,
// 2026-09: 135 of 135 ranked squares in the same place). Their top places
// can still group differently: the 70% grouping rule is applied to scores
// of a different size.
export function settingsLine(settings, run, scored, timeframe) {
  const w = settings.weights;
  const near = nearTermShares(w);
  // Outside a war's rules (at peace, or a month before its war began) the
  // long view is "Long term", and without an ACLED file nothing is set
  // aside (overview.js outsideWar, accessMeasured).
  const measured = accessMeasured(run);
  const setAside = scored.places.filter((p) => p.nearTerm.tier === "setAside").length;
  const longName = outsideWar(run) ? "Long term" : "Postwar";
  const cutoff = !measured
    ? `nothing is set aside (${quietReason(run)})`
    : settings.gatePercentile > 0
      ? `safe access is a cutoff, not a weight: the least safe ${settings.gatePercentile}% of the black soil is set aside first (${setAside} squares set aside)`
      : "safe access is a cutoff, not a weight, and the cutoff is 0%: nothing is set aside";
  const longNote = measured ? "" : "; safe access is 100 everywhere here, so it changes no order: both rankings put the squares in the same order (their top places can still group differently)";
  const viewing = timeframe === "postwar" ? longName : "Near term";
  return `Weights as used: Near term ranks by soil value ${near.soil}% and damage ${near.damage}%; ${cutoff}. ${longName} blends soil value ${w.soil}%, damage ${w.damage}% and safe access ${w.access}% (weighted power mean, r = ${settings.r})${longNote}. The user is viewing ${viewing}.`;
}

// A top place outside the region of a war that covers the area only in
// part: every one of its squares was read at peace rules (overview.js
// peaceSquares).
const outsideWarRegion = (h, calm) => calm.size > 0 && h.cellIds.length > 0 && h.cellIds.every((id) => calm.has(id));

function hotspotLine(h, index, calm = new Set()) {
  const coords = coordLabel(h.lat, h.lon);
  // A repeated name already ends in " · <coords>" (see labelHasCoords in
  // src/lib/atlas/hotspots.js), so it is used as it is.
  const labelHasCoords = Boolean(h.coords && h.label?.endsWith(` · ${h.coords}`));
  const where = h.label === coords || labelHasCoords ? h.label : `${h.label} (${coords})`;
  const squares = h.cellIds.length;
  const region = outsideWarRegion(h, calm) ? " (outside the war's region: read as at peace)" : "";
  return `${index + 1}. ${where}, ${squares} ${squares === 1 ? "square" : "squares"}${region}: score ${score100(h.score)}/100, tier ${h.tier}, black-soil ${ha(h.blackSoilHa)}, heavily damaged ${ha(h.heavyDamageHa)}, soil ${score100(h.soil)} / damage ${score100(h.damage)} / access ${score100(h.access)}`;
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
  const inPart = warInPart(run) ? { warSquares: run.warSquares, squares: run.cellCount ?? run.cells?.length } : null;
  const war = conflictLine(conflictOf(run), accessSourceOf(run), { currentMethod: run.method?.version === METHOD_VERSION, setByTeam: warSetByTeam(run), beforeWar: beforeWar(run), inPart });
  if (war) lines.push(war);
  const changed = warSettingNote(area, run);
  if (changed) lines.push(changed);
  lines.push(`Grid: ${run.cellCount ?? run.cells?.length ?? 0} map squares (cells) of about ${round(run.cellSizeKm, 2)} km.`);
  const t = run.totals || {};
  lines.push(
    `Totals: cropland ${ha(t.croplandHa)}, black-soil cropland ${ha(t.blackSoilHa)}, heavily damaged ${ha(t.heavyDamageHa)}, people on damaged land ${people(t.peopleOnDamagedSoil)}.` +
      (Number.isFinite(shownNewDamage(run, summaries)) ? ` New heavy damage since the previous month: ${ha(run.newHeavyDamageHa)}.` : "")
  );
  // The "no war" warning (or the team's "not at war") is said better by the
  // War line above (it still names distance to fighting, which is not part
  // of a run at peace).
  // At peace the damage score needs radar change (scoring.js), so a square
  // without radar has no damage score from fires alone.
  const warnings = (run.checks?.warnings || [])
    .filter((w) => !(peace && (w === NO_WAR_WARNING || w === TEAM_PEACE_WARNING)))
    .map((w) => (peace ? String(w).replace(/their damage uses fires only\.?$/, "no heavy damage can be found there (here it needs radar change).") : w));
  if (warnings.length) lines.push(`Data warnings: ${warnings.map((w) => String(w).replace(/[.\s]+$/, "")).join("; ")}.`);

  lines.push(settingsLine(settings, run, scored, timeframe));

  // Top places are groups of touching squares; the same name in both lists
  // can be two different groups (see the square counts).
  lines.push("", "Top places, near term:");
  const calm = peaceSquares(run);
  hotspots.nearTerm.forEach((h, i) => lines.push(hotspotLine(h, i, calm)));
  if (!hotspots.nearTerm.length) lines.push("(none)");
  lines.push("", `Top places, ${outsideWar(run) ? "long term" : "postwar"}:`);
  hotspots.postwar.forEach((h, i) => lines.push(hotspotLine(h, i, calm)));
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
      lines.push(
        `- ${s.month}: heavily damaged ${ha(s.totals?.heavyDamageHa)}, new ${Number.isFinite(shownNewDamage(s, summaries)) ? ha(s.newHeavyDamageHa) : "n/a"}, black-soil ${ha(s.totals?.blackSoilHa)}, people on damaged land ${people(s.totals?.peopleOnDamagedSoil)}, ${s.provider === "gee" ? "Earth Engine" : "sample"}`
      );
    }
  }

  if (selected) lines.push("", `The user has this cell selected on the map: ${JSON.stringify(placeDetail(selected, atWar(run)))}`);
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
// part, a square read at peace rules (p.atWar false) says so, and its costs
// are not "before demining".
function placeDetail(p, war = true) {
  const atWarHere = war && p.atWar !== false;
  return {
    cellId: p.id,
    ...(typeof p.atWar === "boolean" ? { atWar: p.atWar } : {}),
    label: placeLabel(p),
    lat: round(p.lat, 4),
    lon: round(p.lon, 4),
    scores: { soil: score100(p.soil), damage: score100(p.damage), access: score100(p.access) },
    ...(p.reason ? { notRanked: p.reason } : {}),
    nearTerm: { score: score100(p.nearTerm.score), rank: p.nearTerm.rank, tier: p.nearTerm.tier },
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
    scores: { soil: score100(h.soil), damage: score100(h.damage), access: score100(h.access) },
    cellIds: h.cellIds.slice(0, 12),
    squares: h.cellIds.length,
  };
}

const NO_RUN = { error: "No analysis is available for the current area yet." };

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
            ? { ...nearTermShares(data.settings.weights), safeAccess: !accessMeasured(run) ? `not used: full everywhere (${quietReason(run)})` : "cutoff, not a weight" }
            : data.settings.weights,
        setAsideCells: scored.places.filter((p) => p.nearTerm.tier === "setAside").length,
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
      return { month: run.month, dataSource: run.provider, place: placeDetail(place, atWar(run)) };
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
        months: summaries.map((s) => ({
          month: s.month,
          dataSource: s.provider,
          heavyDamageHa: round(s.totals?.heavyDamageHa),
          newHeavyDamageHa: round(shownNewDamage(s, summaries)),
          blackSoilHa: round(s.totals?.blackSoilHa),
          croplandHa: round(s.totals?.croplandHa),
          peopleOnDamagedSoil: round(s.totals?.peopleOnDamagedSoil),
          alerts: s.alertsCount ?? null,
        })),
      };
    }
    default:
      return { error: `Unknown tool "${name}".` };
  }
}
