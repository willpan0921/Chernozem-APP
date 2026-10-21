// WHAT THIS FILE DOES
// Works out everything the Atlas Overview (and the printable report) says
// from the scored run, so none of it is typed in by hand:
//
//   summarize(places)            totals over the map squares
//   kpis(summary)                the four big numbers
//   nextSteps({ run, hotspots, alerts, settings })   the "Next steps" list
//   describeAlert(alert)         the wording, colour and icon of one alert
//   springPlan(budget, hotspots, costs)   how much land a budget covers
//   recoveryCost(ha, costs)      what recovering some hectares costs
//   imageryText(run)             "Imagery from April to September 2026, ..."
//   weightsText(settings)        "Soil 30 · Damage 40 · Access 30"
//   atPeace(run)                 true when no war covers the run (the list's, or the team's peace)
//   beforeWar(run)               true when the run's month ends before its war began
//   outsideWar(run)              no war's rules in the run's month: atPeace or beforeWar
//   warInPart(run)               the war covers the area only in part (its squares)
//   warPartOf(conflict)          "country" or "area": what such a war covers part of (null otherwise)
//   peaceSquares(run)            the ids of the squares outside the war's region in such a run
//   peaceReason(run)             why: "No war recorded", "Not at war (set by your team)", "Before the war"
//   shownNewDamage(run, runs)    new heavy damage, or null when the month before is not comparable
//   sourceBadge(runs)            the Data page's "Earth Engine · 11 earlier months are sample data"
//   timeframeLabel(tf, run)      "Near term", and "Postwar" (a war) or "Long term"
//   timeframeOptions(run)        the two time frames for a Near term | ... switch
//   ruleText(tf, settings, run)  the one-line rule of a time frame
//   damageMeaning(run)           what the damage score is for this run
//   accessMeaning(run)           what safe access is for this run
//   accessMeasured(run)          false outside a war (outsideWar) without an ACLED file, and
//                                in a war where no fire looked like fighting (noFightingFound)
//   accessSourceOf(run)          where safe access came from, also for older runs
//   noFightingFound(run)         in a war, no fire within 300 km looked like fighting: not measured
//   acledFileState(run)          what a connected ACLED file did: null (none), "no-battles", "unusable"
//   notMeasuredReason(run)       why safe access is not measured: { short, note, clause, found, acled }
//   setAsideNote(run)            the weights panel's "nothing set aside" line
//   longTermAccessNote(run)      the report's note on the long-term order when access is not measured
//   noFightingNote(run)          the run's own line saying safe access is not measured (Atlas Settings)
//   conflictOf(run)              the run's war, also for older runs
//   warSetByTeam(run)            true when the team set the war (or the peace)
//   warNote(run)                 the war (or the peace) in words: the chip and the line
//   warDay(since, style)         "3 Aug 2023" / "3 August 2023"
//   warKey(conflict)             what decides a war's numbers (its start, null at peace; method.js)
//   areaWar(area)                the war an area's next analysis uses: the team's choice, else the app's list
//   monthsWithOtherWar(area, runs)  saved months made with another war setting (to re-run)
//   warText(conflict, now)       "at war since 24 Feb 2022" / "at peace", and where its rules applied
//   seasonAdded(run, runs)       the growing season ("2026") that joined the damage radar in the run's month
//   seasonJump(run, runs)        the same, only when the month's new heavy damage is above 0
//   seasonWords(run, runs)       what the pages say about such a month ("Mostly older damage: ...")
//   keepsMonth(old, options)     whether an analysis keeps a saved month (server/jobs.js uses it)
//   analysisMonths(count)        the months an analysis of `count` months covers
//
// Plain functions with no React, like scoring.js, so they can be tested and
// reused by the report and the server.
//
// WHO EDITS IT
// Whoever changes the rules behind the overview. For example, to add a new
// kind of next step, add a block to nextSteps() below.

import { COSTS, HEAVY_DAMAGE, METHOD_VERSION, PEACE_DAMAGE, SCALES, runsComparable, warKey } from "./method.js";
import { EARLIEST_WAR_DAY, TEAM_WAR_NAME, conflictForCountry, endsBeforeWar, teamConflict } from "../../config/conflicts.js";
import { addDays, addMonths, formatCoord, formatHaShort, formatCount, formatMonthYear, formatShortDate, listNames, monthName, roundThousands, toDay } from "../format.js";

// ---------- Totals and the four big numbers ----------

// Adds up the run's numbers across the scored squares.
export function summarize(places) {
  const list = places || [];
  const sum = (key) => list.reduce((total, place) => total + (Number.isFinite(place[key]) ? place[key] : 0), 0);
  const blackSoilHa = sum("blackSoilHa");
  const heavyDamageHa = sum("heavyDamageHa");
  return {
    cellCount: list.length,
    analyzedCount: list.filter((place) => place.analyzed !== false).length,
    croplandHa: sum("croplandHa"),
    blackSoilHa,
    heavyDamageHa,
    damagedShare: blackSoilHa > 0 ? heavyDamageHa / blackSoilHa : null,
    people: sum("people"),
    peopleOnDamagedSoil: sum("peopleOnDamagedSoil"),
  };
}

// The four big numbers along the top of the overview. The damage number is
// red only inside a war (`run` with a conflict, or an older run, in a month
// the war had begun by); at peace it is radar change, not an alarm.
export function kpis(summary, run = null) {
  return [
    { id: "cropland", label: "Cropland analyzed", value: formatHaShort(summary.croplandHa) },
    { id: "black-soil", label: "Black-soil cropland", value: formatHaShort(summary.blackSoilHa) },
    { id: "heavy-damage", label: "Heavily damaged", value: formatHaShort(summary.heavyDamageHa), tone: outsideWar(run) ? undefined : "red" },
    { id: "people", label: "People on damaged land", value: formatCount(summary.peopleOnDamagedSoil) },
  ];
}

// "From 31.2M ha of cropland in 1,176 squares."
export function kpiFootnote(summary) {
  return `From ${formatHaShort(summary.croplandHa)} of cropland in ${summary.cellCount.toLocaleString("en-US")} squares.`;
}

// ---------- Month to month ----------

// The run of the month before `run` among `runs` (summaries), or null.
export function previousMonthRun(run, runs) {
  if (!run?.month) return null;
  const before = addMonths(`${run.month}-01`, -1).slice(0, 7);
  return (runs || []).find((item) => item?.month === before && item.areaId === run.areaId) || null;
}

// The run's new heavy damage as the pages may show it: null when the
// month before is from another data source, method or grid (method.js
// runsComparable), because the difference then says nothing about the
// land. Runs saved before that check kept their old number; it is hidden
// here too.
export function shownNewDamage(run, runs) {
  if (!Number.isFinite(run?.newHeavyDamageHa)) return null;
  const before = previousMonthRun(run, runs);
  if (before && !runsComparable(before, run).comparable) return null;
  return run.newHeavyDamageHa;
}

// The growing season that joined the damage radar in the run's month, as
// the year it ends in ("2026"), or null. The radar holds one more complete
// season than the month before's (run.imagery.seasons, gee.js), or as many
// with a later one (at peace the two-year window lets the oldest go as a
// new one joins). Heavily damaged land is then measured over other seasons
// than the month before's, so it moves in that one month: when it grows,
// most of the increase is the new season's radar change, seen over the
// whole season (older damage), not damage done in that month (seasonJump;
// real data: Kharkiv oblast, September 2026, +64,904 ha when the 2026
// season joined; Ukraine's joins in October 2026). It can also fall (real
// data: Iowa, November 2025, 2,385 ha to 764 ha, when a change first had
// to last over two seasons): the month still says which season joined,
// never that a jump is older damage. Only for a month whose new damage is
// shown (shownNewDamage: the month before is there and comparable).
// `runs`: the area's runs or their summaries.
export function seasonAdded(run, runs) {
  if (!Number.isFinite(shownNewDamage(run, runs))) return null;
  const now = run?.imagery;
  const then = previousMonthRun(run, runs)?.imagery;
  if (!now || !then) return null;
  // A run without the count holds no complete war season (runs.js
  // cleanImagery keeps only a count of 1 or more).
  const count = (imagery) => (Number.isInteger(imagery.seasons) ? imagery.seasons : 0);
  const year = String(now.to || "").slice(0, 4);
  if (!count(now) || !/^\d{4}$/.test(year)) return null;
  const more = count(now) > count(then);
  const later = count(now) === count(then) && String(now.to) > String(then.to || "");
  return more || later ? year : null;
}

// The growing season that LEFT the damage radar in the run's month, as
// the year it began in ("2024"), or null: the radar holds fewer complete
// seasons than the month before's. At peace the two-year window moves
// every month, and the oldest season drops out before the next is
// complete. With fewer seasons a change has to show in fewer of them to
// count as heavy damage, so heavily damaged land can jump that month
// (real data: Heilongjiang, April 2026, +12,300 ha when the 2024 season
// left; Saskatchewan +920 ha, Iowa +412 ha). Only for a month whose new
// damage is shown (shownNewDamage).
export function seasonLeft(run, runs) {
  if (!Number.isFinite(shownNewDamage(run, runs))) return null;
  const now = run?.imagery;
  const then = previousMonthRun(run, runs)?.imagery;
  if (!now || !then) return null;
  const count = (imagery) => (Number.isInteger(imagery.seasons) ? imagery.seasons : 0);
  const year = String(then.from || "").slice(0, 4);
  return count(then) > count(now) && /^\d{4}$/.test(year) ? year : null;
}

// The season that joined (seasonAdded), only when the month's new heavy
// damage is above 0: the one check for every "mostly older damage" line,
// on the pages and for the AI, so they never disagree (found in review,
// 2026-10-20: Iowa's November 2025, with 0 ha of new damage, was called a
// jump on the Data page and to the AI). Null otherwise.
export function seasonJump(run, runs) {
  return shownNewDamage(run, runs) > 0 ? seasonAdded(run, runs) : null;
}

// A growing season's name, from a run's imagery (from: the first month of
// the radar's first war season; to: the last month of its newest one):
// { short: "2026", full: "2026 growing season" } for a season inside one
// calendar year; for one across the new year (the south: November to
// April) { short: "2024/25", full: "November 2024 to April 2025 growing
// season" }, never the year it ends in alone.
function seasonName(imagery) {
  const from = String(imagery?.from || "");
  const to = String(imagery?.to || "");
  const year = Number(to.slice(0, 4));
  if (!(Number(from.slice(5, 7)) > Number(to.slice(5, 7)))) return { short: String(year), full: `${year} growing season` };
  const short = `${year - 1}/${String(year).slice(2)}`;
  return { short, full: `${formatMonthYear(`${year - 1}-${from.slice(5, 7)}`)} to ${formatMonthYear(to)} growing season` };
}

// What the pages say about the month a growing season joined the damage
// radar (seasonAdded), or null for any other month:
//   season  "2026" ("2024/25" across the new year: seasonName)
//   name    "2026 growing season" ("November 2024 to April 2025 growing
//           season")
//   lasting true when the radar holds HEAVY_DAMAGE.persistSeasons complete
//           seasons for the first time (a change must now last over two
//           seasons to be heavy damage, so heavily damaged land can fall:
//           real data, Iowa, November 2025)
//   fact    "The 2026 season's radar images are counted from this month":
//           with the month's heavy damage on the Data page's trend (its
//           tooltip and line), whether it grew or fell
//   jump    only when its new heavy damage is above 0 (seasonJump), else
//           null:
//     tag   "incl. 2026 season" (the Data page's table)
//     note  "Mostly older damage: the 2026 season's radar images are
//           counted for the first time" (the Overview, under "+64.9k ha
//           this month")
//     why   "radar change seen over the whole 2026 growing season,
//           counted for the first time this month, not damage done in
//           September 2026": why most of it is older damage (the note
//           under the Data page's table, the report)
export function seasonWords(run, runs) {
  if (!seasonAdded(run, runs)) return seasonLeftWords(run, runs);
  const { short, full } = seasonName(run.imagery);
  const count = (imagery) => (Number.isInteger(imagery?.seasons) ? imagery.seasons : 0);
  const lasting = count(previousMonthRun(run, runs)?.imagery) < HEAVY_DAMAGE.persistSeasons && count(run.imagery) >= HEAVY_DAMAGE.persistSeasons;
  const jump = seasonJump(run, runs)
    ? {
        tag: `incl. ${short} season`,
        note: `Mostly older damage: the ${short} season's radar images are counted for the first time`,
        why: `radar change seen over the whole ${full}, counted for the first time this month, not damage done in ${formatMonthYear(run.month)}`,
        what: "older damage",
      }
    : null;
  return { season: short, name: full, lasting, fact: `The ${short} season's radar images are counted from this month`, jump };
}

// The same shape for the month a season left the damage radar
// (seasonLeft), with left: true; null for any other month. jump.what says
// what most of the new damage is ("a change in what is compared"), not
// "older damage".
function seasonLeftWords(run, runs) {
  const year = seasonLeft(run, runs);
  if (!year) return null;
  const name = `${year} growing season`;
  const jump =
    shownNewDamage(run, runs) > 0
      ? {
          tag: `${year} season left`,
          note: `Mostly a change in what is compared: the ${year} season left the two-year window`,
          why: `the ${name} left the two-year window this month, so a radar change has to show in fewer seasons to count as heavy damage; not damage done in ${formatMonthYear(run.month)}`,
          what: "a change in what is compared",
        }
      : null;
  return { season: year, name, lasting: false, left: true, fact: `The ${year} season's radar images are no longer counted from this month (it left the two-year window)`, jump };
}

// The Data page's source badge: the latest month's source, and how many
// earlier months came from the other one.
//   -> { text: "Earth Engine · 11 earlier months are sample data", tone: "amber" | null }
export function sourceBadge(runs) {
  const list = runs || [];
  if (!list.length) return null;
  const latest = list.reduce((best, item) => (String(item.month) > String(best.month) ? item : best));
  const real = latest.provider === "gee";
  const others = list.filter((item) => item !== latest && (item.provider === "gee") !== real).length;
  const name = real ? "Earth Engine" : "Sample data";
  if (!others) return { text: name, tone: real ? null : "amber" };
  const otherName = real ? "sample data" : "Earth Engine";
  return { text: `${name} · ${others} earlier ${others === 1 ? "month is" : "months are"} ${otherName}`, tone: "amber" };
}

// ---------- Run description ----------

// The day a run is treated as published: the 1st of the month after it.
export function publishedOn(run) {
  if (run?.month) return addMonths(`${run.month}-01`, 1);
  return toDay(new Date());
}

// Kept for older pages: the date the office is working on.
export function todayFor() {
  return toDay(new Date());
}

// "Imagery from April to September 2026, compared with 2019 to 2021"; for
// a composite of several war seasons "Imagery from April to September of
// 2022 to 2025, compared with ...".
// Where parts of the area have different growing seasons (Earth Engine
// says so in run.imagery.label): "Imagery from April to September 2025 (80%
// of the area); May to October 2025 (20% of the area), compared with ...".
export function imageryText(run) {
  const { from, to, label } = run?.imagery || {};
  if (!from || !to) return "";
  const baseline = run.baseline?.label ? `, compared with ${run.baseline.label}` : "";
  // Several areas' seasons, or the damage radar's war seasons ("April to
  // September of 2022 to 2025").
  if (label && (label.includes(";") || run.imagery.seasons > 1)) return `Imagery from ${label}${baseline}`;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = sameYear ? monthName(`${from}-01`) : formatMonthYear(from);
  return `Imagery from ${start} to ${formatMonthYear(to)}${baseline}`;
}

// "Soil 30 · Damage 40 · Access 30".
export function weightsText(settings) {
  const w = settings?.weights || {};
  return `Soil ${w.soil ?? "–"} · Damage ${w.damage ?? "–"} · Access ${w.access ?? "–"}`;
}

// Where safe access came from: "acled", "fires", "fires-none" (inside a
// war, no fire within 300 km of any square looked like fighting:
// noFightingFound), "none" or null. Runs saved before run.accessSource
// existed still carry the provider's warning (server/providers/gee.js), so
// "fires" is read from that.
const FIRES_WARNING = /estimated from unusual fires/i;
export function accessSourceOf(run) {
  if (!run) return null;
  if (run.accessSource) return run.accessSource;
  const warnings = run.checks?.warnings || run.warnings || [];
  return warnings.some((w) => FIRES_WARNING.test(String(w))) ? "fires" : null;
}

// How far from the squares the fires that stand in for fighting are looked
// for (km): server/providers/gee.js MAX_CONFLICT_M. Farther reads 300 km.
export const FIGHTING_SEARCH_KM = 300;

// True when the run is under a war's rules, has no ACLED battles near it
// (no file, or one without battles there: acledFileState), and no fire
// within 300 km of any square looked like fighting (run.accessSource
// "fires-none", server/providers/gee.js). The rule that picks those fires
// is set at a front line (about 1 detection per km² within 10 km), so a
// war of scattered strikes can find none (real data, 2026-10-21: south
// Lebanon, densest 0.74 per km²). Every square then reads 300 km, full
// access, which in a war zone is NOT "safe to reach": safe access is not
// measured there. The pages and the AI say so, never that the land is
// safe or that a distance was measured, and nothing is set aside
// (accessMeasured is false).
export function noFightingFound(run) {
  return accessSourceOf(run) === "fires-none" && !outsideWar(run);
}

// "no fires that look like fighting were found within 300 km" ("... inside
// the war's region" for a war in part of the area: those fires come only
// from there).
function noFightingClause(run) {
  return `no fires that look like fighting were found within ${FIGHTING_SEARCH_KM} km${warInPart(run) ? ` ${warFiresWhere(run)}` : ""}`;
}

// What the run's ACLED file did, when the distance did not come from it,
// read from the run's own warnings (server/providers/acled.js
// acledBattlesFor; a run summary keeps them too):
//   null          no ACLED file is connected (or the run does not say)
//   "no-battles"  a file is connected, but it has no battles within 300 km
//                 of the area in the 12 months (it may not cover this
//                 country, or the fighting there is strikes, which are not
//                 battles)
//   "unusable"    ACLED_CSV_PATH names a file that could not be used (not
//                 found, not an ACLED export, not readable)
// So a run whose fires found no fighting never says "there is no ACLED
// file", or "connect one", when one is connected. Tied to acled.js's own
// words in server/providers/gee.test.js.
const ACLED_NO_BATTLES = /^The ACLED file has no battles within 300 km/;
const ACLED_UNUSABLE = /^ACLED file not found: |does not look like an ACLED export|^The ACLED file could not be read: /;
export function acledFileState(run) {
  if (!run || accessSourceOf(run) === "acled") return null;
  const warnings = (run.checks?.warnings || run.warnings || []).map(String);
  if (warnings.some((w) => ACLED_NO_BATTLES.test(w))) return "no-battles";
  if (warnings.some((w) => ACLED_UNUSABLE.test(w))) return "unusable";
  return null;
}

// The ACLED half of "not measured here", for an acledFileState: "there is
// no ACLED file", "the ACLED file has no battles within 300 km of this
// area" or "the ACLED file could not be used" (also the AI's words:
// server/ai/context.js conflictLine).
export function acledStateText(state) {
  if (state === "no-battles") return `the ACLED file has no battles within ${FIGHTING_SEARCH_KM} km of this area`;
  if (state === "unusable") return "the ACLED file could not be used";
  return "there is no ACLED file";
}
const acledClause = (run) => acledStateText(acledFileState(run));

// Why safe access is not measured for a run (accessMeasured false), in
// words for the pages: { short, note, clause }.
//   no fighting found (noFightingFound)  "Safe access not measured here",
//            "safe access not measured here", "safe access is not
//            measured here (no fires that look like fighting were found
//            within 300 km, and there is no ACLED file)", found: "no fires
//            that look like fighting were found within 300 km", and acled:
//            "there is no ACLED file" (or, with a file connected, "the
//            ACLED file has no battles within 300 km of this area", "the
//            ACLED file could not be used": acledFileState)
//   otherwise  peaceReason(run) ("No war recorded", "Not at war (set by
//            your team)", "Before the war"), with "no war recorded" when it
//            does not say
// Null when safe access is measured.
export function notMeasuredReason(run) {
  if (accessMeasured(run)) return null;
  if (noFightingFound(run)) {
    const found = noFightingClause(run);
    const acled = acledClause(run);
    return { short: "Safe access not measured here", note: "safe access not measured here", clause: `safe access is not measured here (${found}, and ${acled})`, found, acled };
  }
  return peaceReason(run) || { short: "No war recorded", note: "no war recorded", clause: "no war is recorded here" };
}

// The weights panel's line where nothing can be set aside (accessMeasured
// false), or null: "Safe access is not measured here, so nothing can be
// set aside for it" (noFightingFound), else "No war recorded: nothing set
// aside", "Not at war (set by your team): nothing set aside", "Before the
// war: nothing set aside".
export function setAsideNote(run) {
  if (!run || accessMeasured(run)) return null;
  if (noFightingFound(run)) return "Safe access is not measured here, so nothing can be set aside for it";
  return `${notMeasuredReason(run).short}: nothing set aside`;
}

// The report's note after the long-term weights where safe access is not
// measured (it is the same in every square, so it changes no order), or "".
export function longTermAccessNote(run) {
  if (accessMeasured(run)) return "";
  if (noFightingFound(run)) return " (safe access is not measured here, so it is the same in every square and the order follows soil and damage)";
  return " (access is full everywhere, so the order follows soil and damage)";
}

// The run's own line saying safe access is not measured where no fire
// looked like fighting (its warning from server/providers/gee.js
// noFightingFiresWarning, which also says what the ACLED file did), for
// Atlas Settings, next to the month and its data source; null for any
// other run. A run summary is enough.
const NO_FIGHTING_WARNING = /Safe access is not measured here/;
export function noFightingNote(run) {
  if (!noFightingFound(run)) return null;
  const said = (run.checks?.warnings || run.warnings || []).find((w) => NO_FIGHTING_WARNING.test(String(w)));
  if (said) return String(said);
  const measure = acledFileState(run) ? `Nor can ACLED: ${acledClause(run)}.` : "An ACLED file of recorded fighting would measure it.";
  return `${noFightingClause(run).replace(/^n/, "N")}. Safe access is not measured here: every square counts as far from fighting, which does NOT make the land safe. ${measure}`;
}

// The war covering the run: { id, name, since }, null at peace, or
// undefined for an older run that does not say. A country area saved
// before run.conflict existed gets that country's war from
// src/config/conflicts.js (the Ukraine runs, country-804).
export function conflictOf(run) {
  if (!run) return undefined;
  if (run.conflict !== undefined) return run.conflict;
  const code = /^country-(\d+)$/.exec(String(run.areaId || ""))?.[1];
  const war = code ? conflictForCountry(code) : null;
  return war ? { id: war.id, name: war.name, since: war.since } : undefined;
}

// True when the run says no war covers its area (conflict null): none in
// src/config/conflicts.js, or the team marked it as not at war. Older runs
// without the field were all made inside the war in Ukraine, so they are
// not at peace.
export function atPeace(run) {
  return Boolean(run) && conflictOf(run) === null;
}

// True when the run's month ends before its war began
// (src/config/conflicts.js endsBeforeWar): a war the team set from a later
// day, or a long re-run reaching back past a new war's start. No war damage
// is counted for such a month and distance to fighting is not measured
// (server/providers/gee.js monthWindows beforeWar), but the run keeps its
// war (run.conflict), so it compares with the area's other months and
// Atlas Settings does not ask to redo it.
export function beforeWar(run) {
  return Boolean(run) && endsBeforeWar(run.month, conflictOf(run));
}

// True when no war's rules apply to the run's month: no war covers its area
// (atPeace), or the month ends before its war began (beforeWar). Then the
// damage number is not an alarm, nothing is set aside unless an ACLED file
// measured the distance (accessMeasured), there is nothing to demine, and
// the long-term ranking is not called "Postwar".
export function outsideWar(run) {
  return atPeace(run) || beforeWar(run);
}

// True when the run's war covers its area only in part
// (run.conflict.partOfCountry, server/conflicts.js listWarFor: a whole
// country, or a region, box or drawn area across the edge of the war's
// boxes): its rules apply in the squares that touch the war's region, and
// in those that lie in another listed war (run.otherWarSquares, when there
// are any: server/conflicts.js warCellsFor). The other squares (cell.atWar
// false) keep the war's dates, but get the peace rule for heavy damage and
// the peace damage score; without an ACLED file their distance to fighting
// is measured to the unusual fires in the war's region (and in its squares
// in another listed war: server/providers/gee.js, scoring.js).
export function warInPart(run) {
  return Boolean(run?.conflict?.partOfCountry) && !outsideWar(run);
}

// What a war that covers its area only in part covers part of: "country"
// for a whole-country area, "area" for a region, a box or a drawn area
// (conflict.partOf "area"; runs saved before it existed were all whole
// countries). Null for any other war, and at peace.
export function warPartOf(conflict) {
  if (!conflict?.partOfCountry) return null;
  return conflict.partOf === "area" ? "area" : "country";
}

// The ids of a run's squares outside the region of a war that covers the
// area only in part (cell.atWar false): heavy damage and the damage score
// there follow the peace rules. Empty for any other run, and for a run
// summary (no cells).
export function peaceSquares(run) {
  return new Set(warInPart(run) ? (run.cells || []).filter((cell) => cell.atWar === false).map((cell) => cell.id) : []);
}

// "in 12 of 340 squares" for a war in part of the area (run.warSquares,
// server/runs.js), or "" when the run does not say.
function warSquaresText(run) {
  if (!Number.isFinite(run?.warSquares)) return "";
  const of = run.cellCount ?? run.cells?.length;
  return Number.isFinite(of) ? `in ${run.warSquares.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} squares` : "";
}

// Where the rules of a war that covers the area only in part apply:
// "the squares that touch the war's region", "... or lie in another listed
// war" when some had them for that (run.otherWarSquares, server/runs.js;
// a box over the Kursk front, with its squares in Ukraine). A run without
// the count has no such squares.
function warSquaresWhere(run) {
  return `the squares that touch the war's region${run?.otherWarSquares > 0 ? " or lie in another listed war" : ""}`;
}

// Where the unusual fires that stand in for fighting came from in such a
// run: "inside the war's region", "... and its squares in another listed
// war" (server/providers/gee.js fightRegion).
function warFiresWhere(run) {
  return `inside the war's region${run?.otherWarSquares > 0 ? " and its squares in another listed war" : ""}`;
}

// True when the area's team set this run's war, or its peace, in Atlas
// Settings (run.conflictSource "area", server/jobs.js), instead of the
// app's list. A war set by the team also says so itself (source "area").
export function warSetByTeam(run) {
  return Boolean(run) && (run.conflictSource === "area" || run.conflict?.source === "area");
}

// Why no war's rules apply to the run (outsideWar), in words for the pages:
//   { short, note, clause }
//   before the war   "Before the war", "before the war, which began on 1 June
//                    2026", "this month ends before the war began on 1 June 2026"
//   the team's peace "Not at war (set by your team)", "not at war, set by your
//                    team", "your team marked this area as not at war"
//   the list's peace "No war recorded", "no war recorded", "no war is
//                    recorded here"
// A team's "Not at war" over a war on the app's list is never "no war
// recorded" (found in review, 2026-10-19: the report, the weights panel and
// the AI said so for a Ukraine area the team had marked as not at war).
// Null when a war's rules apply.
export function peaceReason(run) {
  if (beforeWar(run)) {
    const day = warDay(conflictOf(run).since, "long");
    return { short: "Before the war", note: `before the war, which began on ${day}`, clause: `this month ends before the war began on ${day}` };
  }
  if (!atPeace(run)) return null;
  if (warSetByTeam(run)) return { short: "Not at war (set by your team)", note: "not at war, set by your team", clause: "your team marked this area as not at war" };
  return { short: "No war recorded", note: "no war recorded", clause: "no war is recorded here" };
}

// What decides a war's numbers (its start day, and whether its rules apply
// only in part of the area), null at peace: method.js warKey,
// the key runsComparable compares.
export { warKey };

// "2023-08-03" -> "3 Aug 2023" (style "short") or "3 August 2023" ("long").
export function warDay(since, style = "short") {
  const day = new Date(`${since}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return String(since || "");
  return day.toLocaleDateString("en-GB", { day: "numeric", month: style === "long" ? "long" : "short", year: "numeric", timeZone: "UTC" });
}

// The war a run counted damage from (run.conflict, set by the server from
// the team's choice for the area or src/config/conflicts.js), in words for
// the pages (the Overview's chip, the report's line):
//   { war: true, team: false, badge: "War since 24 Feb 2022", line: "Full-scale
//     invasion of Ukraine, since 24 February 2022: damage is counted from that day." }
//   { war: true, team: true, badge: "War since 3 Aug 2023 · set by your team",
//     line: "Fighting in Amhara, set by your team, since 3 August 2023: ..." }
//     (without a name of its own: "War since 3 August 2023, set by your
//     team: ...")
//   { war: false, team: false, badge: null, line: "No war recorded here: ..." }
//   { war: false, team: true, badge: "Not at war · set by your team", line:
//     "Your team marked this area as not at war: ..." }
//   a month before its war began (beforeWar): { war: false, beforeWar: true,
//     badge: "Before the war (from 1 Jun 2026) · set by your team", line:
//     "This month ends before the war set by your team began on 1 June
//     2026: no war damage is counted, ..." }
//   a war the team counts from the earliest day allowed (EARLIEST_WAR_DAY):
//     badge "War · damage from 1 Jan 2022 · set by your team", and the line
//     says the war may be older (never "War since 1 Jan 2022")
//   a war of the list that covers the area only in part
//     (run.conflict.partOfCountry): badge "War since 24 Jul 2025 · in part of
//     the country" ("... of the area" for a region, a box or a drawn area:
//     warPartOf), and the line says its rules apply in the squares that
//     touch the war's region (or lie in another listed war:
//     run.otherWarSquares) ("in 12 of 340 squares"), and what changes for
//     the others (the peace rule for heavy damage and the damage score;
//     they also count damage from the day the war began)
//   a war where no fire looked like fighting (noFightingFound): the line
//     ends "Safe access is not measured here: no fires that look like
//     fighting were found within 300 km, and there is no ACLED file (this
//     does not make the land safe)." and never says a distance was measured
// Runs saved before the field existed give null (nothing is shown).
export function warNote(run) {
  const conflict = run?.conflict;
  if (conflict === undefined) return null;
  const team = warSetByTeam(run);
  if (!conflict?.since) {
    // At peace the damage score is the heavily damaged share of the black
    // soil (damageMeaning), from any cause.
    const damage = `Damage is ${damageMeaning(run)}, from any cause.`;
    const badge = team ? "Not at war · set by your team" : null;
    // With an ACLED file, safe access is measured from its battles even at
    // peace, so places can still be set aside.
    if (run.accessSource === "acled") {
      const lead = team ? "Your team marked this area as not at war" : "No war in the app's list covers this area";
      return { war: false, team, badge, line: `${lead}; safe access is ${accessMeaning(run)}. ${damage}` };
    }
    const lead = team ? "Your team marked this area as not at war" : "No war recorded here";
    return { war: false, team, badge, line: `${lead}, so nothing is set aside. ${damage} Everywhere counts as safe to reach; this does not prove the land is safe.` };
  }
  const short = warDay(conflict.since, "short");
  const long = warDay(conflict.since, "long");
  const named = Boolean(conflict.name) && conflict.name !== TEAM_WAR_NAME;
  if (beforeWar(run)) {
    const what = team ? (named ? `${conflict.name} (set by your team)` : "the war set by your team") : conflict.name;
    const access =
      accessSourceOf(run) === "acled"
        ? `; safe access is ${accessMeaning(run)}`
        : ", and distance to fighting is not measured, so nothing is set aside (this does not prove the land is safe)";
    return { war: false, team, beforeWar: true, name: conflict.name, badge: `Before the war (from ${short})${team ? " · set by your team" : ""}`, line: `This month ends before ${what} began on ${long}: no war damage is counted${access}.` };
  }
  // In a war where no fire looked like fighting (noFightingFound), every
  // line says safe access is not measured there.
  const notMeasured = noFightingFound(run) ? ` Safe access is not measured here: ${noFightingClause(run)}, and ${acledClause(run)} (this does not make the land safe).` : "";
  if (team) {
    // Counted from the earliest day the app allows: the war may be older,
    // so that day is not given as its start.
    if (conflict.since === EARLIEST_WAR_DAY) {
      const who = named ? `${conflict.name}, set by your team` : "A war set by your team";
      return {
        war: true,
        team,
        name: conflict.name,
        badge: `War · damage from ${short} · set by your team`,
        line: `${who}: damage is counted from ${long}, the earliest day the app allows (the normal years 2019–2021 must come before the war). The war may be older: damage before that day is not counted, and the normal years may already include it.${notMeasured}`,
      };
    }
    const line = named ? `${conflict.name}, set by your team, since ${long}` : `War since ${long}, set by your team`;
    return { war: true, team, name: conflict.name, badge: `War since ${short} · set by your team`, line: `${line}: damage is counted from that day.${notMeasured}` };
  }
  // A war of the list limited to boxes that covers the area only in part
  // (server/conflicts.js listWarFor): its rules apply in the squares that
  // touch its region (or lie in another listed war); the other squares
  // also count damage from the day it began, but get the peace rule for
  // heavy damage and the peace damage score. Their distance to fighting is
  // said only without an ACLED file: with one, every square's is to its
  // battles; where no fire in the war's region looked like fighting it was
  // not measured (notMeasured says so).
  if (conflict.partOfCountry) {
    const squares = warSquaresText(run);
    const where = warPartOf(conflict);
    const fires = accessSourceOf(run) === "acled" || notMeasured ? "" : `, and their distance to fighting is measured to the unusual fires ${warFiresWhere(run)}`;
    return {
      war: true,
      team,
      partOfCountry: true,
      partOf: where,
      name: conflict.name,
      badge: `War since ${short} · in part of the ${where}`,
      line: `${conflict.name}, since ${long}: damage is counted from that day. The war covers only part of this ${where}: its rules apply in ${warSquaresWhere(run)}${squares ? ` (${squares})` : ""}. The other squares also count damage from that day, but use the peace rules for heavy damage (strong radar change and an unusual fire) and for the damage score${fires}.${notMeasured}`,
    };
  }
  return { war: true, team, name: conflict.name, badge: `War since ${short}`, line: `${conflict.name}, since ${long}: damage is counted from that day.${notMeasured}` };
}

// The war an area's next analysis will use (server/conflicts.js
// conflictForArea): the team's own choice for it (area.war, Atlas
// Settings) first, else what the app's list says (area.listConflict, sent
// with the area by the server). { conflict, team }: conflict { id, name,
// since } or null at peace, team true when the team decided. Undefined
// when it cannot be told (no area, or the server did not say).
export function areaWar(area) {
  if (!area) return undefined;
  const own = teamConflict(area.war, area.id);
  if (own !== undefined) return { conflict: own, team: true };
  if (area.listConflict === undefined) return undefined;
  return { conflict: area.listConflict, team: false };
}

// The area's saved months (run summaries) whose numbers were made with
// another war setting than the area's now (another start day, or war
// against peace): they keep it until the area is analyzed again, so Atlas
// Settings offers the re-run. A new name alone changes no number, so it
// does not count. [] when every month matches, or when it cannot be told.
export function monthsWithOtherWar(area, runs) {
  const now = areaWar(area);
  if (!now) return [];
  const key = warKey(now.conflict);
  return (runs || []).filter((run) => {
    const made = warKey(conflictOf(run));
    return made !== undefined && made !== key;
  });
}

// A war setting in a few words: "at war since 24 Feb 2022", "at war since 7
// Oct 2023 in part of the country" (a war whose rules apply only in the
// squares that touch its region: warPartOf), "at peace". Given the setting
// now (`now`), a war that began on the same day but whose rules covered
// another part of the area says where they applied, so the two never read
// the same (Atlas Settings: "The saved months were made at war since 7 Oct
// 2023, with its rules all over the country" next to "At war since 7 Oct
// 2023" for an older run of Palestine, against the Gaza war's rules in
// part of the country now).
export function warText(conflict, now) {
  if (!conflict?.since) return "at peace";
  const text = `at war since ${warDay(conflict.since)}`;
  const part = warPartOf(conflict);
  if (now?.since === conflict.since && Boolean(now.partOfCountry) !== Boolean(conflict.partOfCountry)) {
    return part ? `${text}, with its rules only in part of the ${part}` : `${text}, with its rules all over the ${warPartOf(now)}`;
  }
  return part ? `${text} in part of the ${part}` : text;
}

// Whether an analysis keeps a saved month as it is, or analyzes it again
// (server/jobs.js runJob uses this very rule, so Atlas Settings can say
// how many months a re-run will redo):
//   old       the month's saved run (a summary is enough), or undefined
//             when the month has none (then it is analyzed)
//   rerun     redo every month (Settings, "Re-run analysis")
//   provider  the data source now, "gee" or "sample": a sample month is
//             redone once Earth Engine is connected
//   manual    a person started it: months made with an older method
//             (METHOD_VERSION) or another war setting than the area's now
//             are redone too. The monthly job (manual false) keeps them, so
//             a method or war change never sets off months of Earth Engine
//             work by itself
//   warNow    warKey() of the war the area's analysis uses now
export function keepsMonth(old, { rerun = false, provider = "sample", manual = true, warNow } = {}) {
  if (!old || rerun) return false;
  if (old.provider === "sample" && provider !== "sample") return false;
  if (!manual) return true;
  if ((old.method?.version || null) !== METHOD_VERSION) return false;
  const made = warKey(conflictOf(old));
  return made === undefined || made === warNow;
}

// The months an analysis of `count` months covers, newest first: the
// latest complete month (the month before this one by the clock, as
// server/runs.js latestCompleteMonth), then back one month at a time.
export function analysisMonths(count, now = new Date()) {
  const latest = addMonths(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, -1);
  return Array.from({ length: Math.max(0, count) }, (_, i) => addMonths(latest, -i).slice(0, 7));
}

// The name of a time frame. Without a war (and in a month before its war
// began: outsideWar) "postwar" means nothing, so the blended ranking is
// called "Long term" there.
export function timeframeLabel(timeframe, run) {
  if (timeframe === "postwar") return outsideWar(run) ? "Long term" : "Postwar";
  return "Near term";
}

// The options for a Near term | Postwar (or Long term) switch.
export function timeframeOptions(run) {
  return ["nearTerm", "postwar"].map((value) => ({ value, label: timeframeLabel(value, run) }));
}

// Whether safe access was measured for this run: in a war (or an older
// run), or with an ACLED file. At peace without one, and in a month before
// its war began (outsideWar: gee.js measures no distance then), every
// square gets full access (nothing to measure it from), so nothing is set
// aside. So too in a war where no fire within 300 km of any square looked
// like fighting (run.accessSource "fires-none": noFightingFound).
export function accessMeasured(run) {
  if (accessSourceOf(run) === "fires-none") return false;
  return !outsideWar(run) || accessSourceOf(run) === "acled";
}

// What the damage score is, as scoring.js uses it for this run:
//   in a war, made with this method (run.method.version, METHOD_VERSION)
//              "unusual fire (the fires of the worst war year, in 12-month
//              years from the day the war began, against a normal year) and
//              lasting radar change (a change seen in at least two complete
//              growing seasons since the war began, which need not include
//              the latest; while only one is complete, that one) against
//              the normal years 2019–2021": "worst war year" is not a
//              calendar year, and "lasting" is not "still to be seen"
//              (method.js FIRE_YEARS, radarPersistence)
//   in a war, an older run (fires over the whole window, the last season's
//              radar) "unusual fire and radar change against the normal
//              years 2019–2021"
//   at peace   "the heavily damaged share of the black soil (radar change
//              backed by unusual fire), full at 20%"
//   a month before its war began  "not counted for this month: it ends
//              before the war began on 1 June 2026, so the damage score is 0
//              everywhere" (no war year of fires, no war season of radar)
//   a war in part of the area (warInPart)  the war's meaning "in the squares
//              that touch the war's region [or lie in another listed war];
//              elsewhere" the peace one
export function damageMeaning(run) {
  if (beforeWar(run)) return `not counted for this month: it ends before the war began on ${warDay(conflictOf(run).since, "long")}, so the damage score is 0 everywhere`;
  if (atPeace(run)) {
    return `the heavily damaged share of the black soil (radar change backed by unusual fire), full at ${Math.round(PEACE_DAMAGE.fullShare * 100)}%`;
  }
  const war =
    run?.method?.version === METHOD_VERSION
      ? "unusual fire (the fires of the worst war year, in 12-month years from the day the war began, against a normal year) and lasting radar change (a change seen in at least two complete growing seasons since the war began, which need not include the latest; while only one is complete, that one) against the normal years 2019–2021"
      : "unusual fire and radar change against the normal years 2019–2021";
  // A war in part of the area: the other squares are scored at peace.
  if (warInPart(run)) return `${war} in ${warSquaresWhere(run)}; elsewhere the heavily damaged share of the black soil (radar change backed by unusual fire), full at ${Math.round(PEACE_DAMAGE.fullShare * 100)}%`;
  return war;
}

// What safe access is for this run. At peace without an ACLED file (and in
// a month before its war began) it is never called "distance to fighting":
// nothing was measured, and the words say why (peaceReason: no war on the
// list, the team's "Not at war", or before the war; never "no war
// recorded" for a war the team overrode). In a war with no ACLED file it is
// the distance to unusual fires (run.accessSource "fires",
// server/providers/gee.js), an estimate, never "recorded fighting"; where
// none of them looked like fighting (noFightingFound) it is "not measured
// here", never "safe to reach".
export function accessMeaning(run) {
  const km = SCALES.distance.full;
  if (noFightingFound(run)) {
    return `not measured here: ${noFightingClause(run)}, and ${acledClause(run)}, so every square counts as far from fighting (this does not make the land safe)`;
  }
  if (!accessMeasured(run)) {
    const reason = peaceReason(run);
    if (!reason || (atPeace(run) && !warSetByTeam(run))) return "full everywhere: with no war recorded, every square counts as safe to reach (this does not prove the land is safe)";
    return `full everywhere: ${reason.clause}, so every square counts as safe to reach (this does not prove the land is safe)`;
  }
  if (accessSourceOf(run) === "acled") return `the distance to battles in the ACLED file, full at ${km} km`;
  if (accessSourceOf(run) === "fires") return `the distance to unusual fires${warInPart(run) ? ` ${warFiresWhere(run)}` : ""} (an estimate of where fighting is; no ACLED file), full at ${km} km`;
  return `the distance to recorded fighting, full at ${km} km`;
}

// What the distance is measured to, in a few words: "recorded fighting",
// "an ACLED battle" or "an unusual fire"; where no fire looked like
// fighting (noFightingFound) nothing was found to measure it to: "a fire
// that looks like fighting (none was found within 300 km)".
function accessTarget(run) {
  if (accessSourceOf(run) === "acled") return "an ACLED battle";
  if (noFightingFound(run)) return `a fire that looks like fighting (none was found within ${FIGHTING_SEARCH_KM} km)`;
  if (accessSourceOf(run) === "fires") return "an unusual fire";
  return "recorded fighting";
}

// The Near term set-aside in one sentence, for the report's method:
//   at peace, no ACLED   "Near term sets nothing aside and ranks by soil value and damage."
//   no fighting found    "Near term sets nothing aside (safe access is not
//                        measured here) and ranks by soil value and damage."
//   cutoff 0%            "Near term sets nothing aside (cutoff 0%) and ranks ..."
//   else                 "Near term sets aside the least safe 30% of black soil
//                        (squares 100 km or more from an unusual fire are never
//                        set aside) and ranks the rest by soil value and damage."
export function nearTermSetAside(run, settings) {
  const gate = settings?.gatePercentile ?? 0;
  if (noFightingFound(run)) return "Near term sets nothing aside (safe access is not measured here) and ranks by soil value and damage.";
  if (!accessMeasured(run)) return "Near term sets nothing aside and ranks by soil value and damage.";
  if (!(gate > 0)) return "Near term sets nothing aside (cutoff 0%) and ranks by soil value and damage.";
  return `Near term sets aside the least safe ${gate}% of black soil (squares ${SCALES.distance.full} km or more from ${accessTarget(run)} are never set aside) and ranks the rest by soil value and damage.`;
}

// Heavy damage in one line, for the method notes:
//   at peace "radar change of 3 dB or more AND an unusual fire within 1 km"
//   in a month before its war began: none is counted
export function heavyDamageRule(run) {
  const km = HEAVY_DAMAGE.fireNearM / 1000;
  if (beforeWar(run)) return `none counted: ${peaceReason(run).clause}`;
  const peace = `radar change of ${HEAVY_DAMAGE.radarDb} dB or more and an unusual fire within ${km} km`;
  if (atPeace(run)) return peace;
  const war = `radar change of ${HEAVY_DAMAGE.radarDb} dB or more, or of ${HEAVY_DAMAGE.radarWithFireDb} dB or more with an unusual fire within ${km} km`;
  if (warInPart(run)) return `${war} in ${warSquaresWhere(run)}; elsewhere ${peace}`;
  return war;
}

// The one-line rule for each time frame (for the report). Outside a war
// (outsideWar) it says why nothing is set aside, in the words of
// peaceReason; in a war where no fire looked like fighting
// (noFightingFound), that safe access is not measured, so nothing can be
// set aside for it and it changes no order.
export function ruleText(timeframe, settings, run) {
  if (timeframe === "postwar") {
    if (noFightingFound(run)) return "All three scores are blended; safe access is not measured here, so it is the same in every square and changes no order.";
    return outsideWar(run)
      ? "All three scores are blended into one long-term ranking."
      : "All three scores are blended, so heavy damage can outweigh lower access once fighting ends.";
  }
  if (noFightingFound(run)) {
    const clause = notMeasuredReason(run).clause;
    return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}, so nothing can be set aside for it. Places are ranked by soil value and damage.`;
  }
  if (!accessMeasured(run)) {
    const clause = peaceReason(run)?.clause || "no war is recorded here";
    return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}, so nothing is set aside. Places are ranked by soil value and damage.`;
  }
  const gate = settings?.gatePercentile ?? 30;
  if (!(gate > 0)) return "Nothing is set aside (cutoff 0%). Places are ranked by soil value and damage.";
  const nearest = accessSourceOf(run) === "fires" ? "nearest the unusual fires that stand in for fighting" : accessSourceOf(run) === "acled" ? "nearest the ACLED battles" : "nearest the fighting";
  return `The least safe ${gate}% of black soil (${nearest}) is set aside. The rest is ranked by soil value and damage.`;
}

// ---------- Alerts ----------

// The wording, colour and icon of one alert.
//   radar -> { title: "Radar change", place, detail: "Sep 24 · 3.2 km² changed", tone: "amber", icon: "radar" }
//   fire  -> { title: "Fires detected", place, detail: "Sep 21 · 14 detections", tone: "red", icon: "fire" }
export function describeAlert(alert) {
  const when = alert?.date ? formatShortDate(alert.date) : "";
  const size = Number.isFinite(alert?.magnitude)
    ? `${alert.magnitude.toLocaleString("en-US", { maximumFractionDigits: alert.magnitude < 10 ? 1 : 0 })} ${alert.unit || ""}`.trim()
    : "";
  const detail = [when, size].filter(Boolean).join(" · ");
  if (alert?.kind === "fire") return { title: "Fires detected", place: alert.place || "", detail, tone: "red", icon: "fire" };
  return { title: "Radar change", place: alert?.place || "", detail, tone: "amber", icon: "radar" };
}

// Each alert's place in words, the same on the Overview, the Report and
// in the AI's context: alert.place, with its coordinates when another
// alert of the same kind has the same place ("Radar change · Nakuru, Rift
// Valley · 0.21° S, 35.80° E"), so two alerts never read the same. Gives
// back a Map alert.id -> label.
export function alertPlaces(alerts = []) {
  const key = (alert) => `${alert.kind || ""}|${alert.place || ""}`;
  const count = new Map();
  for (const alert of alerts) count.set(key(alert), (count.get(key(alert)) || 0) + 1);
  const out = new Map();
  for (const alert of alerts) {
    const place = alert.place || "";
    const coords = Number.isFinite(alert.lat) && Number.isFinite(alert.lon) ? formatCoord(alert.lat, alert.lon) : null;
    const twin = count.get(key(alert)) > 1 || !place;
    out.set(alert.id, twin && coords ? (place && place !== coords ? `${place} · ${coords}` : coords) : place);
  }
  return out;
}

// ---------- Next steps ----------

// "Next steps", built from this run's top areas and alerts. Each step has
//   id     stable, so ticking it off is remembered (workspace.doneSteps)
//   title  what to do
//   due    "YYYY-MM-DD"
//   icon   "shield" | "alert" | "soil" | "report"
//   tone   "green" | "red" | "amber" | null
//   to     the page that clicking the step opens
// "hotspots" are the Near-term top areas (groupHotspots(..., "nearTerm")).
// No step says a place is near the fighting, far from it or set aside, so
// they stay true where safe access is not measured (accessMeasured false:
// at peace, or in a war where no fire looked like fighting, noFightingFound).
export function nextSteps({ run, hotspots = [], alerts = [] }) {
  if (!run) return [];
  const steps = [];
  const published = publishedOn(run);
  // No war (none in the app's list, the team's "Not at war", or a month
  // before its war began: outsideWar): no demining, no "cleared land", and
  // radar change is just change (harvest, tillage, flooding) until someone
  // looks.
  const outside = outsideWar(run);
  // A war that covers the area only in part (warInPart): the war's words
  // only for places that touch its region; places outside it (the peace
  // rule for heavy damage and the damage score) get the peace words.
  const calm = peaceSquares(run);
  const peaceFor = (cellIds) => outside || (calm.size > 0 && (cellIds || []).length > 0 && cellIds.every((id) => calm.has(id)));

  // 1. Demining surveys (in a war) or soil surveys (at peace) come first in
  // the two best Near-term areas.
  if (hotspots.length >= 1) {
    const named = hotspots.slice(0, 2);
    const names = named.map((hotspot) => hotspot.label);
    const peace = named.every((hotspot) => peaceFor(hotspot.cellIds));
    steps.push({
      id: `${run.id}-demining`,
      title: peace ? `Plan soil surveys in ${listNames(names)}` : `Fund demining surveys in ${listNames(names)}`,
      due: addMonths(published, 1),
      icon: peace ? "soil" : "shield",
      tone: "green",
      to: `/atlas/map?focus=${hotspots[0].id}`,
    });
  }

  // 2. Each radar change (at most two) gets a review, named the way the
  // alert list names it (alertPlaces).
  const places = alertPlaces(alerts);
  for (const alert of alerts.filter((item) => item.kind === "radar").slice(0, 2)) {
    const focus = alert.cellIds?.[0];
    const where = places.get(alert.id) || alert.place;
    const peace = peaceFor(alert.cellIds);
    steps.push({
      id: `${run.id}-${alert.id}-review`,
      title: peace ? `Check the radar change near ${where}` : `Review new damage near ${where}`,
      due: alert.date ? addDays(alert.date, 7) : published,
      icon: "alert",
      tone: peace ? "amber" : "red",
      to: focus ? `/atlas/map?focus=${focus}&view=postwar&color=damage` : "/atlas/map?color=damage",
    });
  }

  // 3. Soil testing (on cleared land, in a war) in the third area.
  if (hotspots.length >= 3) {
    const peace = peaceFor(hotspots[2].cellIds);
    steps.push({
      id: `${run.id}-soil-test`,
      title: peace ? `Test soil in ${hotspots[2].label}` : `Test soil on cleared land in ${hotspots[2].label}`,
      due: addMonths(published, 2),
      icon: "soil",
      tone: "amber",
      to: `/atlas/map?focus=${hotspots[2].id}`,
    });
  }

  // 4. The monthly report.
  steps.push({
    id: `${run.id}-report`,
    title: `Send the ${monthName(`${run.month}-01`)} report`,
    due: published,
    icon: "report",
    tone: null,
    to: "/atlas/report",
  });

  return steps;
}

// ---------- Money ----------

// What recovering "ha" hectares costs, before demining:
//   { fast: [low, high], full: [low, high] } in US dollars.
export function recoveryCost(ha, costs = COSTS) {
  const area = Number.isFinite(ha) ? Math.max(0, ha) : 0;
  const fast = costs?.fastPathPerHa || COSTS.fastPathPerHa;
  const full = costs?.fullRecoveryPerHa || COSTS.fullRecoveryPerHa;
  return { fast: [area * fast[0], area * fast[1]], full: [area * full[0], area * full[1]] };
}

// How much land a budget covers on the fast path, and where to start.
// The cheapest cost per hectare gives the most land, so it sets the top of
// the range.
export function springPlan(budgetUsd, hotspots = [], costs = COSTS) {
  const [low, high] = costs?.fastPathPerHa || COSTS.fastPathPerHa;
  const start = hotspots.slice(0, 3).map((hotspot) => hotspot.label);
  const budget = Number.isFinite(budgetUsd) ? Math.max(0, budgetUsd) : 0;
  const fewestHa = budget / high;
  const mostHa = budget / low;
  const range = (value) => (value >= 1000 ? roundThousands(value) : Math.round(value).toLocaleString("en-US"));
  let text = "Set a budget to see how much land it covers.";
  if (budget > 0) {
    text = `About ${range(fewestHa)} to ${range(mostHa)} ha`;
    if (start.length) text += `, starting with ${listNames(start)}`;
  }
  return { fewestHa, mostHa, start, text };
}
