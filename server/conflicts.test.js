// WHAT THIS FILE DOES
// Checks that places are matched to the right country and war: the app's
// list (each war with a point inside and one outside its boxes), the
// squares of a whole-country area a war covers only in part, the months
// that end before a war began, and the team's own choice for an area
// (Atlas Settings), which comes first.
//
// WHO EDITS IT
// Whoever changes server/conflicts.js or src/config/conflicts.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictAt, conflictForArea, countryAt, listConflictForArea } from "./conflicts.js";
import { CONFLICTS, EARLIEST_WAR_DAY, TEAM_WAR_NAME, WAR_NAME_MAX, checkAreaWar, damageWindow, endsBeforeWar, teamConflict, warBoxes, warSquares } from "../src/config/conflicts.js";

test("countries are found from a point", () => {
  assert.equal(countryAt(49.73, 37.54)?.name, "Ukraine"); // Kupiansk
  assert.equal(countryAt(42.0, -93.5)?.name, "United States of America"); // Iowa
  assert.equal(countryAt(-13.0, -55.9)?.name, "Brazil"); // Mato Grosso
  assert.equal(countryAt(45.75, 126.6)?.name, "China"); // Harbin
  assert.equal(countryAt(47.0, 28.85)?.name, "Moldova"); // Chișinău, inside Ukraine's box but not Ukraine
  assert.equal(countryAt(0, -30), null); // the Atlantic
});

test("only places in a listed war get a war start date", () => {
  assert.equal(conflictAt(49.73, 37.54)?.id, "ukraine-2022");
  assert.equal(conflictAt(47.0, 28.85), null);
  assert.equal(conflictAt(42.0, -93.5), null);
  assert.equal(conflictForArea({ countryId: "804" })?.since, "2022-02-24");
  assert.equal(conflictForArea({ bbox: [-94, 41, -93, 43] }), null);
});

test("custom areas: the war covering any of its land, not just its middle", () => {
  // The Gaza Strip: the box's middle misses the coarse outline.
  assert.equal(conflictForArea({ bbox: [34.2, 31.2, 34.6, 31.6] })?.id, "gaza-2023");
  // The Odesa coast, a box whose middle is at sea.
  assert.equal(conflictForArea({ bbox: [30.4, 45.6, 31.6, 46.6] })?.id, "ukraine-2022");
  // Kharkiv / Belgorod: the middle is in Russia, half the box in Ukraine.
  // (Belgorod's border strip is at war too, also since 2022-02-24; the
  // Ukrainian half covers more of the box.)
  assert.equal(conflictForArea({ bbox: [35.6, 49.9, 37.4, 51.1] })?.id, "ukraine-2022");
  // Kupiansk / Valuyki: the middle is in Russia, east of its war's boxes.
  assert.equal(conflictForArea({ bbox: [37.5, 49.6, 38.3, 50.4] })?.id, "ukraine-2022");
  // The grid cells decide when they are given: two in Russia at peace
  // (Valuyki), one in Ukraine.
  const cells = [{ lat: 50.21, lon: 38.1 }, { lat: 50.3, lon: 37.9 }, { lat: 49.71, lon: 37.61 }];
  assert.equal(conflictForArea({ bbox: [37.5, 49.6, 38.3, 50.4], cells })?.id, "ukraine-2022");
  assert.equal(conflictForArea({ bbox: [37.5, 49.6, 38.3, 50.4], cells: cells.slice(0, 2) }), null);
  // Peaceful places stay at peace; Moldova by its country is not Ukraine.
  assert.equal(conflictForArea({ bbox: [-94, 41, -93, 43] }), null);
  assert.equal(conflictForArea({ countryId: "498", bbox: [26.6, 45.4, 30.2, 48.5] }), null);
  assert.equal(conflictForArea({ bbox: [0, -31, 1, -30] }), null); // open sea
});

test("wars by area: the Gaza war covers the Gaza Strip only, not the West Bank or Israel", async () => {
  const { conflictCovers, conflictForCountry } = await import("../src/config/conflicts.js");
  assert.equal(conflictAt(31.5, 34.45)?.id, "gaza-2023"); // Gaza City
  assert.equal(conflictAt(31.35, 34.3)?.id, "gaza-2023"); // Khan Younis
  assert.equal(conflictAt(31.9, 35.2), null); // Ramallah, West Bank
  assert.equal(conflictAt(32.2, 35.25), null); // Nablus, West Bank
  assert.equal(countryAt(31.5, 34.58)?.name, "Israel");
  assert.equal(conflictAt(31.5, 34.58), null); // Sderot area: in the box but in Israel
  assert.equal(conflictForArea({ bbox: [34.9, 31.3, 35.6, 32.5] }), null); // a West Bank box
  assert.equal(conflictForArea({ bbox: [34.2, 31.2, 34.6, 31.6] })?.id, "gaza-2023");
  // The whole country still holds the war zone.
  assert.equal(conflictForCountry("275")?.id, "gaza-2023");
  // A war given by boxes only covers them whatever the country (or at sea).
  const boxOnly = { id: "x", areas: [[10, 10, 11, 11]] };
  assert.equal(conflictCovers(boxOnly, null, 10.5, 10.5), true);
  assert.equal(conflictCovers(boxOnly, "123", 12, 10.5), false);
  assert.equal(conflictCovers({ id: "y" }, "804", 49, 37), false);
});

test("damage window: from the war start, else the last two years", () => {
  assert.deepEqual(damageWindow({ since: "2022-02-24" }, "2026-10-18"), { start: "2022-02-24", end: "2026-10-19", conflict: { since: "2022-02-24" } });
  assert.deepEqual(damageWindow(null, "2026-10-18"), { start: "2024-10-18", end: "2026-10-19", conflict: null });
  // A leap day: two years back has no 29 February.
  assert.deepEqual(damageWindow(null, "2028-02-29"), { start: "2026-03-01", end: "2028-03-01", conflict: null });
});

// ---------- The wars added on 2026-10-19 (src/config/conflicts.js) ----------

// [name, lat, lon, the war expected there (null at peace)]
const PLACES = {
  "russia-kursk-belgorod": [
    ["Sudzha", 51.19, 35.27, "russia-kursk-belgorod"],
    ["Demidovka", 50.946, 35.394, "russia-kursk-belgorod"],
    ["Belgorod", 50.6, 36.59, "russia-kursk-belgorod"],
    ["Kursk city, north of the boxes", 51.73, 36.19, null],
    ["Valuyki, east of the boxes", 50.21, 38.1, null],
    ["Moscow", 55.75, 37.62, null],
    // Across the border the war in Ukraine is the one that counts.
    ["Sumy, Ukraine", 50.91, 34.8, "ukraine-2022"],
  ],
  "eastern-drc-m23": [
    ["Goma", -1.68, 29.22, "eastern-drc-m23"],
    ["Bukavu", -2.51, 28.86, "eastern-drc-m23"],
    ["Kipese, south Lubero", -0.24, 29.27, "eastern-drc-m23"],
    ["Butembo, north of the boxes", 0.14, 29.29, null],
    ["Kinshasa", -4.32, 15.31, null],
    // Inside a box but in Rwanda: the boxes only count in DR Congo.
    ["Gisenyi, Rwanda", -1.7, 29.26, null],
  ],
  amhara: [
    ["Bahir Dar", 11.59, 37.39, "amhara"],
    ["Lalibela", 12.03, 39.04, "amhara"],
    ["Debre Birhan", 9.68, 39.53, "amhara"],
    ["Addis Ababa", 9.03, 38.75, null],
    ["Mekelle, Tigray", 13.5, 39.47, null],
    ["Alamata, Tigray", 12.42, 39.56, null],
  ],
  "israel-hezbollah": [
    ["Bint Jbeil, Lebanon", 33.12, 35.43, "israel-hezbollah"],
    ["Kiryat Shmona, Israel", 33.21, 35.57, "israel-hezbollah"],
    // The app's map draws the Golan Heights inside Israel (376).
    ["Katzrin, Golan Heights", 32.99, 35.69, "israel-hezbollah"],
    ["Baalbek, Lebanon", 34.0, 36.2, null],
    ["Tel Aviv", 32.08, 34.78, null],
    ["Tiberias", 32.79, 35.53, null],
    ["Damascus, Syria", 33.51, 36.29, null],
  ],
  "south-sudan": [
    ["Nasir", 8.6, 33.07, "south-sudan"],
    ["Akobo", 7.78, 33.0, "south-sudan"],
    ["Ayod", 8.12, 31.42, "south-sudan"],
    ["Juba", 4.85, 31.6, null],
    ["Malakal, north of the box", 9.53, 31.66, null],
    ["Gambela side, Ethiopia", 8.0, 34.05, null],
  ],
  "thailand-cambodia": [
    ["Kap Choeng, Thailand", 14.5, 103.58, "thailand-cambodia"],
    ["Samraong, Cambodia", 14.18, 103.52, "thailand-cambodia"],
    ["Poipet, Cambodia", 13.66, 102.56, "thailand-cambodia"],
    ["Thma Da, Cambodia", 12.154, 102.733, "thailand-cambodia"],
    ["Surin city, north of the box", 14.88, 103.49, null],
    ["Siem Reap", 13.36, 103.86, null],
    ["Bangkok", 13.75, 100.5, null],
    ["Phnom Penh", 11.56, 104.92, null],
  ],
};

test("the wars added on 2026-10-19: places inside their boxes are at war, places outside are not", () => {
  for (const [id, places] of Object.entries(PLACES)) {
    const war = CONFLICTS.find((item) => item.id === id);
    assert.ok(war, `${id} is in the list`);
    // Only wars that began in 2022 or later (the normal years come before).
    assert.ok(war.since >= "2022-01-01", `${id} began ${war.since}`);
    assert.ok(war.areas?.length, `${id} has boxes`);
    for (const [name, lat, lon, expected] of places) {
      assert.equal(conflictAt(lat, lon)?.id ?? null, expected, `${name} (${lat}, ${lon})`);
    }
  }
  // The start days the list was checked with.
  const since = Object.fromEntries(CONFLICTS.map((item) => [item.id, item.since]));
  assert.deepEqual(
    { kursk: since["russia-kursk-belgorod"], drc: since["eastern-drc-m23"], amhara: since.amhara, hezbollah: since["israel-hezbollah"], southSudan: since["south-sudan"], thaiCambodia: since["thailand-cambodia"] },
    { kursk: "2022-02-24", drc: "2022-03-27", amhara: "2023-08-01", hezbollah: "2023-10-08", southSudan: "2025-03-04", thaiCambodia: "2025-07-24" }
  );
  // The Gaza war still covers the Gaza Strip only: Sderot and a West Bank
  // box stay outside the Israel-Hezbollah box too.
  assert.equal(conflictAt(31.5, 34.58), null);
  assert.equal(conflictForArea({ bbox: [34.9, 31.3, 35.6, 32.5] }), null);
});

test("a whole country that holds a regional war has its war; the list says so for a saved area", () => {
  assert.equal(conflictForArea({ countryId: "643" })?.id, "russia-kursk-belgorod");
  assert.equal(conflictForArea({ countryId: "231" })?.id, "amhara");
  assert.equal(conflictForArea({ countryId: "116" })?.id, "thailand-cambodia");
  assert.equal(conflictForArea({ countryId: "760" }), null); // Syria is not listed
  assert.deepEqual(listConflictForArea({ id: "country-643", countryId: "643", createdAt: "2026-10-19T00:00:00Z" }), {
    id: "russia-kursk-belgorod",
    name: "Fighting in Russia's Kursk and Belgorod border areas",
    since: "2022-02-24",
    partOfCountry: true,
  });
  assert.deepEqual(listConflictForArea({ id: "country-804", countryId: "804" }), { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  // A drawn area: its own grid decides, as in an analysis.
  const box = (west, south, east, north) => ({ type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
  assert.equal(listConflictForArea({ id: "area-goma", geometry: box(29.1, -1.75, 29.3, -1.6) })?.id, "eastern-drc-m23");
  assert.equal(listConflictForArea({ id: "area-iowa", geometry: box(-93.7, 42.0, -93.6, 42.1) }), null);
  // Without an outline it cannot be told.
  assert.equal(listConflictForArea({ id: "area-none" }), undefined);
});

test("a war that covers a whole-country area only in part has its rules in the squares that touch its boxes (warSquares)", () => {
  const kursk = { id: "russia-kursk-belgorod", name: "Fighting in Russia's Kursk and Belgorod border areas", since: "2022-02-24", partOfCountry: true };
  assert.deepEqual(warBoxes(kursk), CONFLICTS.find((war) => war.id === "russia-kursk-belgorod").areas);
  assert.equal(warBoxes({ id: "ukraine-2022", since: "2022-02-24" }), null, "a war over whole countries has no boxes");
  assert.equal(warBoxes({ id: "area-x", since: "2023-08-01", source: "area" }), null, "a war the team set is not on the list");
  // 0.1° squares across the north edge of the Kursk box (51.6° N).
  const cells = [
    { id: "far-north", lat: 51.82, lon: 34.55 },
    { id: "just-north", lat: 51.72, lon: 34.55 },
    // Its square (51.57 to 51.67) reaches into the box: it counts.
    { id: "edge", lat: 51.62, lon: 34.55 },
    { id: "inside", lat: 51.52, lon: 34.55 },
    // Moscow, far from every box.
    { id: "moscow", lat: 55.75, lon: 37.62 },
  ];
  assert.deepEqual([...warSquares(kursk, cells, 0.1)].sort(), ["edge", "inside"]);
  // A coarse square overlaps a box although its centre is outside it (at
  // Russia's 2° grid no centre falls inside the boxes).
  assert.deepEqual([...warSquares(kursk, [{ id: "big", lat: 52.4, lon: 36 }], 2)], ["big"]);
  // Only for a war marked partOfCountry; otherwise every square has the rules.
  assert.equal(warSquares({ ...kursk, partOfCountry: false }, cells, 0.1), null);
  assert.equal(warSquares({ id: "ukraine-2022", since: "2022-02-24", partOfCountry: true }, cells, 0.1), null);
  assert.equal(warSquares(null, cells, 0.1), null);
});

// ---------- The team's own choice (Atlas Settings, area.war) ----------

test("the team's own choice for an area comes first: at war from its day, or not at war; otherwise the app's list", () => {
  const iowa = { bbox: [-94, 41, -93, 43] };
  // At war from the team's day, with its name (or a plain one).
  assert.deepEqual(conflictForArea({ ...iowa, war: { mode: "war", since: "2024-05-01", name: "Fighting in the county" }, areaId: "area-iowa" }), {
    id: "area-area-iowa",
    name: "Fighting in the county",
    since: "2024-05-01",
    source: "area",
  });
  assert.equal(conflictForArea({ ...iowa, war: { mode: "war", since: "2024-05-01" }, areaId: "area-iowa" }).name, TEAM_WAR_NAME);
  // Not at war, even where the list has a war (Ukraine, by country or by box).
  assert.equal(conflictForArea({ countryId: "804", war: { mode: "peace" }, areaId: "country-804" }), null);
  assert.equal(conflictForArea({ bbox: [30.4, 45.6, 31.6, 46.6], war: { mode: "peace" } }), null);
  // The app's list: the default, and what a setting that is not one gives.
  for (const war of [undefined, null, { mode: "list" }, { mode: "war", since: "not a day" }, { mode: "sometimes" }]) {
    assert.equal(conflictForArea({ countryId: "804", war, areaId: "country-804" })?.id, "ukraine-2022", JSON.stringify(war));
    assert.equal(conflictForArea({ ...iowa, war }), null, JSON.stringify(war));
  }
  assert.equal(teamConflict({ mode: "list" }, "x"), undefined);
  assert.equal(teamConflict({ mode: "peace" }, "x"), null);
  // The damage window follows the team's day.
  assert.equal(damageWindow(conflictForArea({ ...iowa, war: { mode: "war", since: "2024-05-01" }, areaId: "a" }), "2026-10-18").start, "2024-05-01");
  assert.equal(damageWindow(conflictForArea({ countryId: "804", war: { mode: "peace" } }), "2026-10-18").start, "2024-10-18");
});

test("checkAreaWar: one of three choices; for a war a real day from 2022-01-01 to today and a name of at most 80 characters", () => {
  const today = "2026-10-19";
  assert.deepEqual(checkAreaWar({ mode: "list" }, today), { war: { mode: "list" } });
  assert.deepEqual(checkAreaWar({ mode: "peace", since: "2023-01-01", name: "x" }, today), { war: { mode: "peace" } });
  assert.deepEqual(checkAreaWar({ mode: "war", since: "2023-08-01", name: "  Fighting   in Amhara " }, today), { war: { mode: "war", since: "2023-08-01", name: "Fighting in Amhara" } });
  assert.deepEqual(checkAreaWar({ mode: "war", since: EARLIEST_WAR_DAY }, today), { war: { mode: "war", since: "2022-01-01" } });
  assert.deepEqual(checkAreaWar({ mode: "war", since: today, name: "" }, today), { war: { mode: "war", since: today } });
  assert.equal(checkAreaWar({ mode: "war", since: "2023-08-01", name: "x".repeat(WAR_NAME_MAX) }, today).war.name.length, 80);
  const errors = [
    [{ mode: "war", since: "2021-12-31" }, /1 January 2022 or later: the normal years 2019 to 2021 must come before the war\. For a war that began earlier, count from 2022-01-01/],
    [{ mode: "war", since: "2026-10-20" }, /cannot be after today \(2026-10-19\)/],
    [{ mode: "war", since: "2023-02-30" }, /Give the day the war began, as YYYY-MM-DD/],
    [{ mode: "war", since: "3 Aug 2023" }, /YYYY-MM-DD/],
    [{ mode: "war" }, /YYYY-MM-DD/],
    [{ mode: "war", since: "2023-08-01", name: "x".repeat(81) }, /at most 80 characters \(this one has 81\)/],
    [{ mode: "war", since: "2023-08-01", name: 5 }, /must be text/],
    [{ mode: "sometimes" }, /must be "list" \(the app's list\), "war" \(at war from a day\) or "peace" \(not at war\), not "sometimes"/],
    [{}, /must be "list"/],
    [null, /Send the war setting as/],
    ["war", /Send the war setting as/],
    [["war"], /Send the war setting as/],
  ];
  for (const [input, message] of errors) {
    const checked = checkAreaWar(input, today);
    assert.equal(checked.war, undefined, JSON.stringify(input));
    assert.match(checked.error, message, JSON.stringify(input));
  }
});

test("a month ends before its war began when the war's first day comes after the month's last day", () => {
  const war = { id: "area-x", name: "Test war", since: "2026-06-01" };
  assert.equal(endsBeforeWar("2026-05", war), true);
  assert.equal(endsBeforeWar("2025-12", war), true);
  assert.equal(endsBeforeWar("2026-06", war), false, "the month the war began in counts from that day");
  assert.equal(endsBeforeWar("2026-09", war), false);
  assert.equal(endsBeforeWar("2026-05", { ...war, since: "2026-05-31" }), false);
  assert.equal(endsBeforeWar("2025-12", { ...war, since: "2026-01-01" }), true, "across the new year");
  assert.equal(endsBeforeWar("2026-05", null), false, "at peace");
  assert.equal(endsBeforeWar("not a month", war), false);
});
