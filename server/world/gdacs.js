// WHAT THIS FILE DOES
// Reads natural disasters from GDACS (the Global Disaster Alert and
// Coordination System, run by the European Commission and the United
// Nations) for the public website's globe: floods, droughts, wildfires,
// storms, earthquakes and volcanoes. One request per kind, all at the same
// time, each given 10 seconds; a kind that fails is reported as failed and
// the other kinds still answer. Every GDACS feature becomes one plain event
// the globe understands, each kind is kept only inside its time window
// (below), and wildfires are gathered into one marker per country.
//
// What "right now" means for each kind:
//   floods       active in the last 45 days
//   droughts     active in the last 120 days
//   wildfires    burning now (GDACS says "iscurrent"), one marker per country
//   storms       current, or active in the last 21 days
//   earthquakes  orange or red alerts, active in the last 30 days
//   volcanoes    orange or red alerts, active in the last 60 days
// "Active in the last N days" means the event's last day (GDACS "todate",
// or "fromdate" when there is none) is not older than N days. GDACS's own
// search works the same way (it returns every event that overlaps the
// dates asked for), so the request asks for the same window and this file
// checks it again, so the rule does not depend on how GDACS reads dates.
//
// The GDACS alert colour (green, orange, red) is kept as "level". An event
// with no country (a storm at sea) is left out: it touches no farmland.
// Nothing here touches the app's data; server/world/index.js caches the
// answer and merges it with the wars.
//
// WHO EDITS IT
// Whoever changes which disasters the globe shows or how they are read.

export const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
export const GDACS_SITE = "https://www.gdacs.org/";
export const GDACS_TIMEOUT_MS = 10 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

// The six kinds, by GDACS's two-letter code. days: the window; currentOnly:
// only events GDACS marks current; orCurrent: current ones are kept even
// outside the window; levels: only these alert colours; cluster: one
// marker per country.
export const GDACS_KINDS = {
  FL: { kind: "flood", days: 45 },
  DR: { kind: "drought", days: 120 },
  WF: { kind: "wildfire", days: 30, currentOnly: true, cluster: true },
  TC: { kind: "storm", days: 21, orCurrent: true },
  EQ: { kind: "earthquake", days: 30, levels: ["orange", "red"] },
  VO: { kind: "volcano", days: 60, levels: ["orange", "red"] },
};

const LEVELS = ["green", "orange", "red"];
const LEVEL_RANK = { green: 1, orange: 2, red: 3 };

// The request for one kind, asking GDACS for the kind's own window (plus a
// day on each side, so time zones cannot cut an event off).
export function gdacsQuery(type, now = Date.now()) {
  const rule = GDACS_KINDS[type];
  if (!rule) throw new Error(`Unknown GDACS kind: ${type}`);
  const levels = (rule.levels || LEVELS).map((level) => level[0].toUpperCase() + level.slice(1)).join(";");
  const params = new URLSearchParams({
    eventlist: type,
    fromDate: isoDay(now - (rule.days + 1) * DAY_MS),
    toDate: isoDay(now + DAY_MS),
    alertlevel: levels,
  });
  return `${GDACS_URL}?${params}`;
}

// ---------- Reading one answer ----------

// GDACS writes dates without a time zone ("2026-10-07T01:00:00"); they are
// UTC. Gives milliseconds, or NaN.
export function parseGdacsDate(value) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
}

function isoDay(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

// Some properties arrive as JSON written inside a string.
function jsonField(value) {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const clean = (value) => String(value ?? "").trim();

export function levelOf(value) {
  const level = clean(value).toLowerCase();
  return LEVELS.includes(level) ? level : null;
}

function isCurrent(properties) {
  const value = properties?.iscurrent;
  return value === true || clean(value).toLowerCase() === "true";
}

// The event's last day in milliseconds (todate, else fromdate).
function lastSeen(properties) {
  const end = parseGdacsDate(properties?.todate);
  return Number.isFinite(end) ? end : parseGdacsDate(properties?.fromdate);
}

// True when a GDACS feature belongs in the feed for its kind (the windows
// in the header).
export function inWindow(properties, rule, now = Date.now()) {
  if (!properties) return false;
  if (rule.levels && !rule.levels.includes(levelOf(properties.alertlevel))) return false;
  const current = isCurrent(properties);
  if (rule.currentOnly) return current;
  if (rule.orCurrent && current) return true;
  const last = lastSeen(properties);
  if (!Number.isFinite(last)) return false;
  return now - last <= rule.days * DAY_MS;
}

const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => Math.round(n).toLocaleString("en-US");

// "VANCE-26" or "Tropical Cyclone VANCE-26" -> "Tropical cyclone Vance".
function stormName(properties) {
  const raw = clean(properties.eventname) || clean(properties.name).replace(/^tropical\s+cyclone\s*/i, "");
  const word = raw.replace(/-\d{2,4}$/, "").toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
  return word ? `Tropical cyclone ${word}` : "Tropical cyclone";
}

function eventName(properties, kind, country) {
  if (kind === "storm") return stormName(properties);
  if (kind === "wildfire") return country ? `Wildfire in ${country}` : "Wildfire";
  const name = clean(properties.name).replace(/\s+/g, " ");
  // "Drought in Austria, Bosnia and Herzegovina, Belgium, ..." names every
  // country it touches; the globe has room for one.
  const listed = /^(.+?) in (.+)$/.exec(name);
  if (listed) {
    const places = listed[2].split(",").map((place) => place.trim()).filter(Boolean);
    if (places.length >= 3) return `${listed[1]} in ${places[0]} and ${places.length - 1} other countries`;
  }
  if (name) return name;
  const word = kind[0].toUpperCase() + kind.slice(1);
  return country ? `${word} in ${country}` : word;
}

// GDACS's severity line, tidied ("230587 km2" -> "230,587 km²"), when it
// says something; else GDACS's own description line without its hour
// fragments.
function eventNote(properties, severity, kind, areaHa) {
  if (kind === "wildfire") return areaHa > 0 ? `One fire, about ${fmt(areaHa)} ha burned.` : "One fire reported.";
  const text = clean(severity?.severitytext);
  const amount = Number(severity?.severity);
  if (text && amount > 0 && !/^magnitude 0\b/i.test(text)) {
    return text
      .replace(/\b(\d{4,})\b/g, (digits) => Number(digits).toLocaleString("en-US"))
      .replace(/\bkm2\b/g, "km²")
      .replace(/\s+/g, " ")
      .replace(/[.\s]*$/, ".");
  }
  // ("from: 07 Oct 2026 01 to: 22 Oct 2026 01" and "at: 10 Oct 2026 10:58"
  // carry hours the panel does not need.)
  const description = clean(properties.htmldescription).replace(/<[^>]+>/g, "");
  if (description) return description.replace(/(\d{1,2} \w{3} \d{4})\s*\d{0,2}(?::\d{2})?/g, "$1").replace(/\s+/g, " ").replace(/[.\s]*$/, ".");
  return "";
}

// The country: the one GDACS names for the event's ISO3 code when it lists
// several ("Philippines, Guam, ..."), else the first.
function countryName(properties, iso3, affected) {
  const named = Array.isArray(affected) ? affected.find((entry) => clean(entry?.iso3).toUpperCase() === iso3) : null;
  if (named && clean(named.countryname)) return clean(named.countryname);
  const own = clean(properties.country);
  if (own) return own.split(",")[0].trim();
  const first = Array.isArray(affected) ? affected.find((entry) => clean(entry?.countryname)) : null;
  return first ? clean(first.countryname) : "";
}

// One GDACS feature -> one event for the globe, or null when it cannot be
// placed (no point, no country).
export function shapeFeature(feature, type) {
  const rule = GDACS_KINDS[type];
  const properties = feature?.properties;
  if (!rule || !properties) return null;
  const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
  if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null;
  const affected = jsonField(properties.affectedcountries);
  let iso3 = clean(properties.iso3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    const found = Array.isArray(affected) ? affected.find((entry) => /^[A-Z]{3}$/.test(clean(entry?.iso3).toUpperCase())) : null;
    iso3 = found ? clean(found.iso3).toUpperCase() : "";
  }
  if (!iso3) return null;
  const severity = jsonField(properties.severitydata);
  const links = jsonField(properties.url);
  const country = countryName(properties, iso3, affected);
  const areaHa = rule.kind === "wildfire" && clean(severity?.severityunit).toLowerCase() === "ha" ? Math.max(0, Number(severity.severity) || 0) : 0;
  const event = {
    id: `${type.toLowerCase()}-${clean(properties.eventid) || `${coordinates[1]},${coordinates[0]}`}`,
    kind: rule.kind,
    iso3,
    country,
    name: eventName(properties, rule.kind, country),
    lat: round2(coordinates[1]),
    lng: round2(coordinates[0]),
    level: levelOf(properties.alertlevel),
    since: isoDay(parseGdacsDate(properties.fromdate)),
    until: isoDay(parseGdacsDate(properties.todate)),
    note: eventNote(properties, severity, rule.kind, areaHa),
    source: "GDACS",
  };
  if (links && typeof links.report === "string") event.url = links.report;
  if (rule.kind === "wildfire") {
    event.count = 1;
    if (areaHa > 0) event.areaHa = Math.round(areaHa);
  }
  return event;
}

// Wildfires: one marker per country, with the count, the strongest alert
// and the centre of the fires.
export function clusterByCountry(events) {
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.iso3)) groups.set(event.iso3, []);
    groups.get(event.iso3).push(event);
  }
  return [...groups.values()].map((list) => {
    if (list.length === 1) return list[0];
    const strongest = list.reduce((best, event) => ((LEVEL_RANK[event.level] || 0) > (LEVEL_RANK[best.level] || 0) ? event : best));
    const areaHa = list.reduce((sum, event) => sum + (event.areaHa || 0), 0);
    const days = (key, pick) => list.map((event) => event[key]).filter(Boolean).sort()[pick];
    const country = strongest.country || list.find((event) => event.country)?.country || "";
    const marker = {
      id: `wf-${strongest.iso3}`,
      kind: "wildfire",
      iso3: strongest.iso3,
      country,
      name: country ? `Wildfires in ${country}` : "Wildfires",
      lat: round2(list.reduce((sum, event) => sum + event.lat, 0) / list.length),
      lng: round2(list.reduce((sum, event) => sum + event.lng, 0) / list.length),
      level: strongest.level,
      since: days("since", 0) ?? null,
      until: days("until", list.filter((event) => event.until).length - 1) ?? null,
      note: `${list.length} fires${areaHa > 0 ? `, about ${fmt(areaHa)} ha burned together` : ""}; the strongest alert is ${strongest.level || "not rated"}.`,
      source: "GDACS",
      count: list.length,
    };
    if (strongest.url) marker.url = strongest.url;
    if (areaHa > 0) marker.areaHa = Math.round(areaHa);
    return marker;
  });
}

// One GDACS answer (a GeoJSON FeatureCollection) -> the events of that kind
// inside its window, clustered when the kind asks for it.
export function readGdacs(collection, type, now = Date.now()) {
  const rule = GDACS_KINDS[type];
  if (!rule) throw new Error(`Unknown GDACS kind: ${type}`);
  const features = Array.isArray(collection?.features) ? collection.features : [];
  const events = features
    .filter((feature) => inWindow(feature?.properties, rule, now))
    .map((feature) => shapeFeature(feature, type))
    .filter(Boolean);
  return rule.cluster ? clusterByCountry(events) : events;
}

// ---------- Fetching ----------

// One kind from GDACS. Throws when GDACS does not answer in time or
// answers with an error; the caller decides what to do then.
export async function fetchGdacsType(type, { fetch: fetchFn = globalThis.fetch, now = Date.now(), timeoutMs = GDACS_TIMEOUT_MS } = {}) {
  const url = gdacsQuery(type, now);
  const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`GDACS answered ${response.status} for ${type}`);
  const collection = await response.json();
  return readGdacs(collection, type, now);
}

// Every kind asked for (default: all six), at the same time. Never throws:
// each kind comes back as { ok: true, events } or { ok: false, error,
// events: [] }.
export async function fetchGdacs({ types = Object.keys(GDACS_KINDS), ...options } = {}) {
  const settled = await Promise.allSettled(types.map((type) => fetchGdacsType(type, options)));
  const result = {};
  types.forEach((type, i) => {
    const outcome = settled[i];
    result[type] =
      outcome.status === "fulfilled"
        ? { ok: true, events: outcome.value }
        : { ok: false, error: outcome.reason?.message || String(outcome.reason), events: [] };
  });
  return result;
}
