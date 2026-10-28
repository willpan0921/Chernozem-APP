// WHAT THIS FILE DOES
// Tests the public website's world feed (server/world/index.js and
// server/world/gdacs.js) with a stand-in GDACS, so no request leaves this
// computer: the request each kind sends, the time windows, how a GDACS
// feature becomes an event, wildfires gathered per country, the merge with
// the reviewed wars and the Ukraine numbers (which must equal the
// website's), the hour-long cache (a second request answers in under
// 50 ms and asks GDACS nothing), a failed kind kept from the last good
// copy for 24 hours and tried again after a few minutes, GDACS wholly down
// (the wars still answer), and the route itself: public without an access
// code, GET and HEAD only, Cache-Control for 10 minutes, gzip when
// accepted. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/world/index.js or server/world/gdacs.js.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-world-"));
process.env.CHERNOZEM_DATA_DIR = path.join(scratch, "data");
process.env.GEE_DISABLED = "1";
// Not on Render (where a short code keeps the app locked), no proxy.
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
process.env.ATLAS_TRUST_PROXY = "";
const { handleApi } = await import("../app.js");
const world = await import("./index.js");
const gdacs = await import("./gdacs.js");
const { WORLD_CONFLICTS } = await import("./conflicts.js");

let server;
let base;
before(async () => {
  server = http.createServer(async (req, res) => {
    if (!(await handleApi(req, res))) {
      res.statusCode = 404;
      res.end("not api");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  world.setDepsForTests(null);
  fs.rmSync(scratch, { recursive: true, force: true });
});

// ---------- A stand-in GDACS ----------

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
// A GDACS date (no time zone) n days before NOW.
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 19);

// One GDACS feature the way the real feed writes it.
function feature(type, { eventid = 1, lat = 10, lng = 20, from = daysAgo(3), to = daysAgo(1), level = "Green", current = false, iso3 = "KEN", country = "Kenya", name, eventname = "", severity, affected, url = true, description } = {}) {
  const kindName = { FL: "Flood", DR: "Drought", WF: "Forest fires", TC: "Tropical Cyclone", EQ: "Earthquake", VO: "Volcano" }[type];
  const properties = {
    eventtype: type,
    eventid,
    episodeid: 1,
    eventname,
    name: name ?? `${kindName} in ${country}`,
    htmldescription: description ?? `${level} ${kindName} in ${country} from: 07 Oct 2026 01 to: 22 Oct 2026 01.`,
    alertlevel: level,
    iscurrent: current ? "true" : "false",
    country,
    fromdate: from,
    todate: to,
    iso3,
    source: "GLOFAS",
    affectedcountries: JSON.stringify(affected ?? (iso3 ? [{ iso2: iso3.slice(0, 2), iso3, countryname: country }] : [])),
    severitydata: JSON.stringify(severity ?? { severity: 0, severitytext: "Magnitude 0 ", severityunit: "" }),
  };
  if (url) properties.url = JSON.stringify({ report: `https://www.gdacs.org/report.aspx?eventid=${eventid}&eventtype=${type}` });
  return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties };
}
const collection = (...features) => ({ type: "FeatureCollection", features });

// answers[TYPE]: a FeatureCollection, an Error (the request fails), or a
// number (an HTTP status GDACS answers with). calls[TYPE] counts requests.
function fakeGdacs(answers) {
  const calls = {};
  const fetch = async (url) => {
    const type = new URL(url).searchParams.get("eventlist");
    calls[type] = (calls[type] || 0) + 1;
    const answer = answers[type];
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return { ok: false, status: answer, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => answer ?? collection() };
  };
  return { fetch, calls };
}

// A good answer for every kind: two floods, a drought, a current storm,
// three wildfires (two in one country), an orange earthquake, a red volcano.
function goodAnswers() {
  return {
    FL: collection(feature("FL", { eventid: 11, iso3: "ITA", country: "Italy", lat: 43.46, lng: 11.14 }), feature("FL", { eventid: 12, iso3: "PAK", country: "Pakistan", level: "Orange" })),
    DR: collection(feature("DR", { eventid: 21, iso3: "USA", country: "United States", from: daysAgo(200), to: daysAgo(2), severity: { severity: 230587, severitytext: "Minor impact for agricultural drought in 230587 km2", severityunit: "km2" } })),
    WF: collection(
      feature("WF", { eventid: 31, iso3: "AUS", country: "Australia", current: true, lat: -20, lng: 130, severity: { severity: 1000, severitytext: "Green impact for forestfire in 1000 ha", severityunit: "ha" } }),
      feature("WF", { eventid: 32, iso3: "AUS", country: "Australia", current: true, lat: -30, lng: 150, level: "Orange", severity: { severity: 2500.4, severitytext: "Orange impact for forestfire in 2500 ha", severityunit: "ha" } }),
      feature("WF", { eventid: 33, iso3: "ZMB", country: "Zambia", current: true, lat: -13, lng: 30, severity: { severity: 300, severitytext: "Green impact for forestfire in 300 ha", severityunit: "ha" } }),
    ),
    TC: collection(feature("TC", { eventid: 41, iso3: "IND", country: "India", current: true, level: "Red", eventname: "ARNAB-26", name: "Tropical Cyclone ARNAB-26", severity: { severity: 222, severitytext: "Hurricane/Typhoon > 74 mph (maximum wind speed of 222 km/h)", severityunit: "km/h" } })),
    EQ: collection(feature("EQ", { eventid: 51, iso3: "JPN", country: "Japan", level: "Orange", from: daysAgo(5), to: daysAgo(5), severity: { severity: 6.4, severitytext: "Magnitude 6.4M, Depth:30km", severityunit: "M" } })),
    VO: collection(feature("VO", { eventid: 61, iso3: "IDN", country: "Indonesia", level: "Red", from: daysAgo(10), to: daysAgo(9) })),
  };
}

// Two wars instead of the whole reviewed list, so the counts are known.
const TWO_WARS = [
  { id: "ukraine", iso3: "UKR", lat: 48.4, lng: 36.6, name: "War in Ukraine", since: "2022-02-24", note: "Fields mined and cratered.", also: ["RUS"] },
  { id: "drc-east", iso3: "COD", name: "Fighting in eastern DR Congo", since: "2022-03-28", note: "Farming families displaced." },
];

let clock = NOW;
let fake;
function useGdacs(answers, { conflicts = TWO_WARS } = {}) {
  fake = fakeGdacs(answers);
  world.setDepsForTests({ fetch: fake.fetch, now: () => clock, conflicts });
  return fake;
}
beforeEach(() => {
  clock = NOW;
  process.env.ATLAS_ACCESS_CODE = "";
  useGdacs(goodAnswers());
});

// A request to the feed through the app's own router: a raw request (no
// automatic unzipping), so the bytes can be checked.
function call(method, url, { cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const text = (res.headers["content-encoding"] === "gzip" && raw.length ? gunzipSync(raw) : raw).toString("utf8");
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // not JSON
        }
        resolve({ status: res.statusCode, headers: res.headers, raw, text, json });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// The handler on its own (no network), to time it.
function fakeResponse() {
  const headers = {};
  let done;
  const finished = new Promise((resolve) => (done = resolve));
  return {
    statusCode: 200,
    headers,
    setHeader: (name, value) => (headers[name.toLowerCase()] = String(value)),
    end: (payload) => done(payload ?? Buffer.alloc(0)),
    finished,
  };
}
async function direct(method = "GET", headers = {}) {
  const res = fakeResponse();
  await world.handleWorld({ method, url: "/api/world/crises", headers }, res, { method, parts: ["world", "crises"] });
  const body = await res.finished;
  const text = (res.headers["content-encoding"] === "gzip" ? gunzipSync(body) : body).toString("utf8");
  return { status: res.statusCode, headers: res.headers, body, json: text ? JSON.parse(text) : null };
}

// ---------- Asking GDACS ----------

test("each kind asks GDACS for its own window and alert colours", () => {
  const flood = new URL(gdacs.gdacsQuery("FL", NOW));
  assert.equal(flood.origin + flood.pathname, gdacs.GDACS_URL);
  assert.equal(flood.searchParams.get("eventlist"), "FL");
  assert.equal(flood.searchParams.get("fromDate"), "2026-09-12", "45 days and a day of margin");
  assert.equal(flood.searchParams.get("toDate"), "2026-10-29");
  assert.equal(flood.searchParams.get("alertlevel"), "Green;Orange;Red");
  assert.match(gdacs.gdacsQuery("FL", NOW), /alertlevel=Green%3BOrange%3BRed$/, "the working address");
  assert.equal(new URL(gdacs.gdacsQuery("EQ", NOW)).searchParams.get("alertlevel"), "Orange;Red");
  assert.equal(new URL(gdacs.gdacsQuery("DR", NOW)).searchParams.get("fromDate"), "2026-06-29", "120 days");
  assert.throws(() => gdacs.gdacsQuery("XX", NOW), /Unknown GDACS kind/);
});

test("the time windows: each kind keeps what is active in its own window", () => {
  const read = (type, ...features) => gdacs.readGdacs(collection(...features), type, NOW).map((event) => event.id);
  // Floods: the last day within 45 days.
  assert.deepEqual(read("FL", feature("FL", { eventid: 1, from: daysAgo(60), to: daysAgo(44) }), feature("FL", { eventid: 2, from: daysAgo(60), to: daysAgo(46) }), feature("FL", { eventid: 3, from: daysAgo(90), to: "" })), ["fl-1"], "ended 44 days ago: kept; 46: dropped; no last day and started 90 days ago: dropped");
  assert.deepEqual(read("FL", feature("FL", { eventid: 4, from: daysAgo(10), to: "" })), ["fl-4"], "no last day: the first day counts");
  // Droughts: 120 days.
  assert.deepEqual(read("DR", feature("DR", { eventid: 1, from: daysAgo(400), to: daysAgo(119) }), feature("DR", { eventid: 2, from: daysAgo(400), to: daysAgo(121) })), ["dr-1"]);
  // Storms: 21 days, or current whatever the dates.
  assert.deepEqual(read("TC", feature("TC", { eventid: 1, to: daysAgo(20) }), feature("TC", { eventid: 2, to: daysAgo(22) }), feature("TC", { eventid: 3, from: daysAgo(40), to: daysAgo(30), current: true })), ["tc-1", "tc-3"]);
  // Wildfires: current only.
  assert.deepEqual(read("WF", feature("WF", { eventid: 1, to: daysAgo(0), current: false }), feature("WF", { eventid: 2, iso3: "BRA", country: "Brazil", current: true })), ["wf-2"]);
  // Earthquakes: orange or red, 30 days.
  assert.deepEqual(read("EQ", feature("EQ", { eventid: 1, level: "Green", to: daysAgo(1) }), feature("EQ", { eventid: 2, level: "Orange", to: daysAgo(29) }), feature("EQ", { eventid: 3, level: "Red", to: daysAgo(31) })), ["eq-2"]);
  // Volcanoes: orange or red, 60 days.
  assert.deepEqual(read("VO", feature("VO", { eventid: 1, level: "Red", to: daysAgo(59) }), feature("VO", { eventid: 2, level: "Orange", to: daysAgo(61) }), feature("VO", { eventid: 3, level: "green", to: daysAgo(1) })), ["vo-1"]);
  assert.deepEqual(gdacs.readGdacs({ nothing: true }, "FL", NOW), [], "no features: no events");
});

test("a GDACS feature becomes one plain event", () => {
  const [flood] = gdacs.readGdacs(goodAnswers().FL, "FL", NOW);
  assert.deepEqual(flood, {
    id: "fl-11",
    kind: "flood",
    iso3: "ITA",
    country: "Italy",
    name: "Flood in Italy",
    lat: 43.46,
    lng: 11.14,
    level: "green",
    since: "2026-10-25",
    until: "2026-10-27",
    note: "Green Flood in Italy from: 07 Oct 2026 to: 22 Oct 2026.",
    source: "GDACS",
    url: "https://www.gdacs.org/report.aspx?eventid=11&eventtype=FL",
  });
  const [drought] = gdacs.readGdacs(goodAnswers().DR, "DR", NOW);
  assert.equal(drought.note, "Minor impact for agricultural drought in 230,587 km².", "the severity line, tidied");
  assert.equal(drought.level, "green");
  const [storm] = gdacs.readGdacs(goodAnswers().TC, "TC", NOW);
  assert.equal(storm.name, "Tropical cyclone Arnab");
  assert.equal(storm.level, "red");
  assert.equal(storm.note, "Hurricane/Typhoon > 74 mph (maximum wind speed of 222 km/h).");
  const [quake] = gdacs.readGdacs(goodAnswers().EQ, "EQ", NOW);
  assert.equal(quake.note, "Magnitude 6.4M, Depth:30km.");
  assert.equal(quake.kind, "earthquake");
  assert.equal(gdacs.readGdacs(goodAnswers().VO, "VO", NOW)[0].kind, "volcano");

  // GDACS names a wide drought after every country it touches.
  const wide = gdacs.shapeFeature(feature("DR", { name: "Drought in Austria, Bosnia  and  Herzegovina, Belgium, Ukraine,", country: "Austria, Bosnia  and  Herzegovina, Belgium, Ukraine,", iso3: "AUT", affected: [{ iso3: "AUT", countryname: "Austria" }, { iso3: "BIH", countryname: "Bosnia and Herzegovina" }] }), "DR");
  assert.equal(wide.name, "Drought in Austria and 3 other countries");
  assert.equal(wide.country, "Austria");
  assert.equal(gdacs.shapeFeature(feature("DR", { name: "Drought in China, Kazakhstan", country: "China, Kazakhstan", iso3: "CHN" }), "DR").name, "Drought in China, Kazakhstan", "two stay as they are");
  // A volcano's own line, with its hour fragment taken off.
  const eruption = gdacs.shapeFeature(feature("VO", { name: "Eruption  Kanlaon", level: "Orange", country: "Philippines", iso3: "PHL", description: "Orange Eruption Kanlaon in Philippines at: 10 Oct 2026 10:58." }), "VO");
  assert.equal(eruption.name, "Eruption Kanlaon");
  assert.equal(eruption.note, "Orange Eruption Kanlaon in Philippines at: 10 Oct 2026.");

  // A storm GDACS gives no iso3 for, but names the countries it touched.
  const atLand = gdacs.shapeFeature(feature("TC", { eventid: 7, iso3: "", country: "Guam, Northern Mariana Islands", affected: [{ iso2: "GU", iso3: "GUM", countryname: "Guam" }] }), "TC");
  assert.equal(atLand.iso3, "GUM");
  assert.equal(atLand.country, "Guam");
  // Several countries: the one that matches the event's code.
  const several = gdacs.shapeFeature(feature("TC", { eventid: 8, iso3: "GUM", country: "Philippines, Guam, Japan", affected: [{ iso3: "PHL", countryname: "Philippines" }, { iso3: "GUM", countryname: "Guam" }] }), "TC");
  assert.equal(several.country, "Guam");
  // At sea: no country at all, so no farmland, so no event.
  assert.equal(gdacs.shapeFeature(feature("TC", { eventid: 9, iso3: "", country: "", affected: [] }), "TC"), null);
  assert.equal(gdacs.shapeFeature({ type: "Feature", geometry: null, properties: { iso3: "KEN" } }, "FL"), null, "no point");
  assert.equal(gdacs.shapeFeature(feature("FL", { url: false }), "FL").url, undefined, "no report link: no url");
  assert.equal(gdacs.levelOf("Orange"), "orange");
  assert.equal(gdacs.levelOf("purple"), null);
  assert.equal(gdacs.parseGdacsDate("2026-10-07T01:00:00"), Date.parse("2026-10-07T01:00:00Z"), "GDACS dates are UTC");
});

test("wildfires: one marker per country with the count, the strongest alert and the centre", () => {
  const markers = gdacs.readGdacs(goodAnswers().WF, "WF", NOW);
  assert.equal(markers.length, 2);
  const australia = markers.find((marker) => marker.iso3 === "AUS");
  assert.deepEqual(australia, {
    id: "wf-AUS",
    kind: "wildfire",
    iso3: "AUS",
    country: "Australia",
    name: "Wildfires in Australia",
    lat: -25,
    lng: 140,
    level: "orange",
    since: "2026-10-25",
    until: "2026-10-27",
    note: "2 fires, about 3,500 ha burned together; the strongest alert is orange.",
    source: "GDACS",
    count: 2,
    url: "https://www.gdacs.org/report.aspx?eventid=32&eventtype=WF",
    areaHa: 3500,
  });
  const zambia = markers.find((marker) => marker.iso3 === "ZMB");
  assert.equal(zambia.id, "wf-33", "one fire keeps its own id");
  assert.equal(zambia.count, 1);
  assert.equal(zambia.name, "Wildfire in Zambia");
  assert.equal(zambia.note, "One fire, about 300 ha burned.");
  assert.equal(zambia.areaHa, 300);
  assert.deepEqual(gdacs.clusterByCountry([]), []);
});

test("fetchGdacs asks every kind at once and never throws", async () => {
  const answers = goodAnswers();
  answers.FL = new Error("The operation was aborted due to timeout");
  answers.EQ = 503;
  const { fetch, calls } = fakeGdacs(answers);
  const result = await gdacs.fetchGdacs({ fetch, now: NOW });
  assert.deepEqual(Object.keys(result), ["FL", "DR", "WF", "TC", "EQ", "VO"]);
  assert.deepEqual(calls, { FL: 1, DR: 1, WF: 1, TC: 1, EQ: 1, VO: 1 });
  assert.equal(result.FL.ok, false);
  assert.match(result.FL.error, /timeout/);
  assert.deepEqual(result.FL.events, []);
  assert.equal(result.EQ.ok, false);
  assert.match(result.EQ.error, /503/);
  assert.equal(result.DR.ok, true);
  assert.equal(result.DR.events.length, 1);
  const some = await gdacs.fetchGdacs({ fetch, now: NOW, types: ["VO"] });
  assert.deepEqual(Object.keys(some), ["VO"]);
});

// ---------- The merged feed ----------

test("the feed merges the wars, the Ukraine numbers and the disasters", async () => {
  const { status, headers, json } = await direct();
  assert.equal(status, 200);
  assert.equal(headers["cache-control"], "public, max-age=600");
  assert.equal(headers["content-type"], "application/json; charset=utf-8");
  assert.equal(json.updated, new Date(NOW).toISOString());
  assert.deepEqual(json.counts, { wars: 2, disasters: 8 });
  assert.equal(json.sources[0].name, "GDACS");
  assert.equal(json.sources[0].url, "https://www.gdacs.org/");
  assert.equal(json.sources[0].fetched, new Date(NOW).toISOString());
  assert.equal(json.sources[0].missing, undefined);
  assert.equal(json.sources[0].stale, undefined);
  assert.equal(json.sources[1].name, "Reviewed list");
  assert.match(json.sources[1].reviewed, /^\d{4}-\d{2}-\d{2}$/);

  const [ukraine, congo, ...disasters] = json.events;
  assert.deepEqual(ukraine, {
    id: "war-ukraine",
    kind: "war",
    iso3: "UKR",
    country: "Ukraine",
    name: "War in Ukraine",
    lat: 48.4,
    lng: 36.6,
    level: null,
    since: "2022-02-24",
    note: "Fields mined and cratered.",
    source: "Reviewed list",
    also: ["RUS"],
    measured: { heavyDamageHa: 1780400, peopleOnDamagedSoil: 1204041, month: "September 2026" },
  });
  assert.equal(congo.country, "DR Congo", "a plain name for the website");
  assert.equal(congo.measured, undefined, "only Ukraine is measured");
  assert.equal(congo.also, undefined);
  assert.ok(Number.isFinite(congo.lat) && Number.isFinite(congo.lng) && congo.lat !== 0, "no lat/lng in the list: the country's centre from countries.json");
  assert.deepEqual(disasters.map((event) => event.level), ["red", "red", "orange", "orange", "orange", "green", "green", "green"], "strongest alerts first");
  assert.deepEqual(disasters.filter((event) => event.kind === "wildfire").map((event) => event.count), [2, 1]);

  // The shape every event has (the contract the website builds against).
  const kinds = new Set(["war", "flood", "drought", "wildfire", "storm", "earthquake", "volcano"]);
  for (const event of json.events) {
    for (const key of ["id", "kind", "iso3", "country", "name", "lat", "lng", "since", "note", "source"]) assert.ok(key in event, `${event.id} has ${key}`);
    assert.ok(kinds.has(event.kind), event.kind);
    assert.ok([null, "green", "orange", "red"].includes(event.level), `${event.id} level`);
    assert.ok(["GDACS", "Reviewed list"].includes(event.source));
    assert.match(event.iso3, /^[A-Z]{3}$/);
    assert.match(event.since, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("the whole reviewed list answers with a centre and a plain name for every war", () => {
  world.setDepsForTests({ fetch: fake.fetch, now: () => clock });
  const wars = world.warEvents();
  assert.equal(wars.length, WORLD_CONFLICTS.length);
  assert.ok(wars.length >= 10);
  for (const war of wars) {
    assert.ok(Number.isFinite(war.lat) && Number.isFinite(war.lng) && (war.lat !== 0 || war.lng !== 0), `${war.id} has a place`);
    assert.ok(war.country && !war.country.includes(","), `${war.id}: ${war.country}`);
    assert.equal(war.kind, "war");
    assert.equal(war.source, "Reviewed list");
  }
  assert.equal(wars.find((war) => war.iso3 === "SYR").country, "Syria");
  assert.equal(wars.find((war) => war.iso3 === "PSE").country, "Palestine");
  assert.equal(world.plainCountryName("TZA", "Tanzania, United Republic of"), "Tanzania");
  assert.equal(world.plainCountryName("XXX", ""), "XXX");
});

test("the Ukraine numbers are the ones the website quotes", async () => {
  // The website keeps its numbers in src/site/content/site.js; the feed
  // carries a copy. They must not drift apart.
  let site;
  try {
    site = await import("../../src/site/content/site.js");
  } catch (error) {
    console.log(`(site.js could not be loaded here: ${error.message}; skipped the comparison)`);
    return;
  }
  assert.equal(world.UKRAINE_MEASURED.heavyDamageHa, site.NUMBERS.heavyDamageHa);
  assert.equal(world.UKRAINE_MEASURED.peopleOnDamagedSoil, site.NUMBERS.peopleOnDamagedSoil);
  assert.equal(world.UKRAINE_MEASURED.month, site.NUMBERS.ukraineMonth);
});

// ---------- The cache ----------

test("the answer is kept for an hour: the second request asks GDACS nothing and answers fast", async () => {
  const first = await direct();
  assert.equal(first.status, 200);
  assert.deepEqual(fake.calls, { FL: 1, DR: 1, WF: 1, TC: 1, EQ: 1, VO: 1 });

  clock = NOW + 30 * 60 * 1000;
  const started = performance.now();
  const second = await direct();
  const took = performance.now() - started;
  assert.deepEqual(fake.calls, { FL: 1, DR: 1, WF: 1, TC: 1, EQ: 1, VO: 1 }, "nothing asked again");
  assert.equal(second.json.updated, first.json.updated, "the same answer");
  assert.ok(took < 50, `answered from the cache in ${took.toFixed(1)} ms`);

  // After the hour: the remembered answer at once, the refresh behind it.
  clock = NOW + 61 * 60 * 1000;
  const third = await direct();
  assert.equal(third.json.updated, first.json.updated, "still the remembered answer");
  await world.refreshWorldFeed();
  assert.deepEqual(fake.calls, { FL: 2, DR: 2, WF: 2, TC: 2, EQ: 2, VO: 2 });
  const fourth = await direct();
  assert.equal(fourth.json.updated, new Date(clock).toISOString(), "now the fresh one");
});

test("two first requests at once share one round of GDACS requests", async () => {
  const [a, b] = await Promise.all([direct(), direct()]);
  assert.equal(a.json.updated, b.json.updated);
  assert.deepEqual(fake.calls, { FL: 1, DR: 1, WF: 1, TC: 1, EQ: 1, VO: 1 });
});

test("a kind that fails is skipped, said in sources, and tried again after a few minutes", async () => {
  const answers = goodAnswers();
  answers.FL = new Error("The operation was aborted due to timeout");
  const { calls } = useGdacs(answers);
  const first = await direct();
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.sources[0].missing, ["flood"]);
  assert.equal(first.json.sources[0].stale, undefined);
  assert.equal(first.json.events.filter((event) => event.kind === "flood").length, 0);
  assert.equal(first.json.counts.disasters, 6, "the other kinds still answer");

  // Not yet time to try again: nothing asked.
  clock = NOW + world.RETRY_MS - 1000;
  await direct();
  await world.refreshWorldFeed();
  assert.equal(calls.FL, 1);
  // Time: only the failed kind is asked again, and it works now.
  answers.FL = goodAnswers().FL;
  clock = NOW + world.RETRY_MS;
  await direct();
  await world.refreshWorldFeed();
  assert.deepEqual(calls, { FL: 2, DR: 1, WF: 1, TC: 1, EQ: 1, VO: 1 });
  const second = await direct();
  assert.equal(second.json.sources[0].missing, undefined);
  assert.equal(second.json.events.filter((event) => event.kind === "flood").length, 2);
  assert.equal(second.json.counts.disasters, 8);
});

test("GDACS down later: the last good copy is served for 24 hours, then only the wars", async () => {
  const answers = goodAnswers();
  useGdacs(answers);
  const good = await direct();
  assert.equal(good.json.counts.disasters, 8);

  // Everything fails from now on.
  for (const type of Object.keys(answers)) answers[type] = new Error("fetch failed");
  clock = NOW + 2 * 60 * 60 * 1000;
  await direct();
  await world.refreshWorldFeed();
  const stale = await direct();
  assert.equal(stale.status, 200);
  assert.equal(stale.json.counts.disasters, 8, "the old disasters still there");
  assert.deepEqual(stale.json.sources[0].stale, ["flood", "drought", "wildfire", "storm", "earthquake", "volcano"]);
  assert.equal(stale.json.sources[0].missing, undefined);
  assert.equal(stale.json.sources[0].fetched, new Date(NOW).toISOString(), "when the copy was fetched");
  assert.equal(stale.json.updated, new Date(clock).toISOString());

  // 23 hours after the copy: still served.
  clock = NOW + 23 * 60 * 60 * 1000;
  await direct();
  await world.refreshWorldFeed();
  assert.equal((await direct()).json.counts.disasters, 8);

  // 25 hours: too old; the wars and the Ukraine numbers still answer.
  clock = NOW + 25 * 60 * 60 * 1000;
  await direct();
  await world.refreshWorldFeed();
  const gone = await direct();
  assert.equal(gone.status, 200);
  assert.equal(gone.json.counts.disasters, 0);
  assert.equal(gone.json.counts.wars, 2);
  assert.deepEqual(gone.json.sources[0].missing, ["flood", "drought", "wildfire", "storm", "earthquake", "volcano"]);
  assert.equal(gone.json.sources[0].stale, undefined);
  assert.equal(gone.json.events[0].measured.heavyDamageHa, 1780400);
});

test("GDACS down from the start: the route still answers with the wars", async () => {
  const answers = {};
  for (const type of ["FL", "DR", "WF", "TC", "EQ", "VO"]) answers[type] = new Error("getaddrinfo ENOTFOUND www.gdacs.org");
  useGdacs(answers);
  const { status, json } = await direct();
  assert.equal(status, 200);
  assert.equal(json.counts.wars, 2);
  assert.equal(json.counts.disasters, 0);
  assert.equal(json.sources[0].fetched, null);
  assert.equal(json.sources[0].missing.length, 6);
  assert.equal(json.events[0].id, "war-ukraine");
});

// ---------- The route ----------

test("the feed is public: no access code, GET and HEAD, kept for 10 minutes, gzipped when accepted", async () => {
  process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
  try {
    assert.equal((await call("GET", "/api/workspace")).status, 401, "the app needs the code...");
    const feed = await call("GET", "/api/world/crises");
    assert.equal(feed.status, 200, "...the feed does not");
    assert.equal(feed.headers["cache-control"], "public, max-age=600");
    assert.equal(feed.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(feed.headers["content-encoding"], undefined);
    assert.equal(Number(feed.headers["content-length"]), feed.raw.length);
    assert.equal(feed.json.counts.wars, 2);
    assert.equal(feed.json.events.length, 10);

    const zipped = await call("GET", "/api/world/crises", { headers: { "Accept-Encoding": "gzip, deflate, br" } });
    assert.equal(zipped.headers["content-encoding"], "gzip");
    assert.equal(zipped.headers.vary, "Accept-Encoding");
    assert.deepEqual(zipped.json, feed.json);
    assert.ok(zipped.raw.length < feed.raw.length);

    const head = await call("HEAD", "/api/world/crises");
    assert.equal(head.status, 200);
    assert.equal(head.raw.length, 0);
    assert.equal(head.headers["cache-control"], "public, max-age=600");

    const post = await call("POST", "/api/world/crises");
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, "GET, HEAD");
    assert.equal(post.json.error.code, "method_not_allowed");
    assert.equal((await call("DELETE", "/api/world/crises")).status, 405);
    for (const url of ["/api/world", "/api/world/other", "/api/world/crises/1"]) {
      const res = await call("GET", url);
      assert.equal(res.status, 404, url);
      assert.equal(res.json.error.code, "not_found");
    }
  } finally {
    process.env.ATLAS_ACCESS_CODE = "";
  }
});
