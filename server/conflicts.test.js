// WHAT THIS FILE DOES
// Checks that places are matched to the right country and war: the app's
// list (each war with a point inside and one outside its boxes), the
// squares of an area a war covers only in part (a whole country, a region,
// a box or a drawn area across the edge of its boxes), the months
// that end before a war began, and the team's own choice for an area
// (Atlas Settings), which comes first.
//
// WHO EDITS IT
// Whoever changes server/conflicts.js or src/config/conflicts.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictAt, conflictForArea, countryAt, listConflictForArea, listWarFor, warCellsFor } from "./conflicts.js";
import { CONFLICTS, EARLIEST_WAR_DAY, TEAM_WAR_NAME, WAR_NAME_MAX, checkAreaWar, crisisFormFor, damageWindow, endsBeforeWar, teamConflict, warBoxes, warSquares } from "../src/config/conflicts.js";

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

test("a region, a box or a drawn area across the edge of a war's boxes holds it only in part, by the same rule as a whole country; one inside the boxes has it all over", async () => {
  const { planGrid } = await import("./geo.js");
  const { getCountry } = await import("./countries.js");
  const box = (west, south, east, north) => ({ type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
  // An Afar-like region box (regions have no countryId): only the squares
  // that touch the Amhara boxes get the war's rules.
  const afar = { id: "admin1-afar-like", kind: "admin1", createdAt: "2026-10-20T00:00:00Z", geometry: box(39.9, 8.9, 42.4, 14.4) };
  const afarGrid = planGrid(afar.geometry);
  const afarWar = listWarFor(afar, afarGrid);
  assert.equal(afarWar.id, "amhara");
  assert.equal(afarWar.partOfCountry, true);
  assert.equal(afarWar.partOf, "area");
  const touching = warSquares(afarWar, afarGrid.cells, afarGrid.cellSizeDeg);
  assert.ok(touching.size > 0 && touching.size < afarGrid.cells.length, `${touching.size} of ${afarGrid.cells.length} squares`);
  assert.deepEqual(listConflictForArea(afar), { id: "amhara", name: "War in Ethiopia's Amhara region", since: "2023-08-01", partOfCountry: true, partOf: "area" });
  // A Kursk-oblast-like box: Kursk city and the east are outside the boxes.
  // Its squares in Ukraine (Sumy oblast, in the war in Ukraine) keep the
  // war's rules, touching the boxes or not (warCellsFor).
  const kursk = { id: "area-kursk-like", kind: "custom", source: "bbox", createdAt: "2026-10-20T00:00:00Z", geometry: box(34.1, 50.9, 38.5, 52.4) };
  assert.deepEqual(listConflictForArea(kursk), { id: "russia-kursk-belgorod", name: "Fighting in Russia's Kursk and Belgorod border areas", since: "2022-02-24", partOfCountry: true, partOf: "area", otherWarSquares: 23 });
  const kurskGrid = planGrid(kursk.geometry);
  const kurskWar = listWarFor(kursk, kurskGrid);
  const kurskSquares = warSquares(kurskWar, kurskGrid.cells, kurskGrid.cellSizeDeg);
  assert.ok(kurskSquares.size > 0 && kurskSquares.size < kurskGrid.cells.length);
  const kurskRuled = warCellsFor(kurskWar, kurskGrid.cells, kurskGrid.cellSizeDeg);
  const inUkraine = kurskGrid.cells.filter((cell) => countryAt(cell.lat, cell.lon)?.id === "804");
  assert.equal(inUkraine.length, 44);
  assert.ok(inUkraine.every((cell) => kurskRuled.has(cell.id)), "every Ukrainian square has the war's rules");
  assert.equal(inUkraine.filter((cell) => !kurskSquares.has(cell.id)).length, 23, "23 of them without touching the Kursk boxes");
  assert.equal(kurskGrid.cells.filter((cell) => !kurskRuled.has(cell.id)).length, 535, "Kursk city and the east keep the peace rules");
  assert.ok(kurskGrid.cells.filter((cell) => !kurskRuled.has(cell.id)).every((cell) => countryAt(cell.lat, cell.lon)?.id === "643" && !conflictAt(cell.lat, cell.lon)));
  // A drawn area inside one of the Amhara boxes: every square at war, so
  // nothing is "in part".
  const drawn = { id: "area-gondar-like", kind: "custom", source: "draw", createdAt: "2026-10-20T00:00:00Z", geometry: box(37.2, 12.2, 37.6, 12.7) };
  const drawnGrid = planGrid(drawn.geometry);
  const drawnWar = listWarFor(drawn, drawnGrid);
  assert.equal(drawnWar.id, "amhara");
  assert.equal(drawnWar.partOfCountry, undefined);
  assert.equal(warSquares({ ...drawnWar, partOfCountry: true }, drawnGrid.cells, drawnGrid.cellSizeDeg).size, drawnGrid.cells.length);
  assert.deepEqual(listConflictForArea(drawn), { id: "amhara", name: "War in Ethiopia's Amhara region", since: "2023-08-01" });
  // A whole country keeps "in part of the country" (no partOf), with or
  // without its outline on the saved area.
  const ethiopia = { id: "country-231", kind: "country", countryId: "231", createdAt: "2026-10-20T00:00:00Z", geometry: getCountry("231").geometry };
  assert.deepEqual(listConflictForArea(ethiopia), { id: "amhara", name: "War in Ethiopia's Amhara region", since: "2023-08-01", partOfCountry: true });
  assert.equal(listWarFor(ethiopia, planGrid(ethiopia.geometry)).partOf, undefined);
  assert.deepEqual(listConflictForArea({ id: "country-231-no-outline", countryId: "231" }), { id: "amhara", name: "War in Ethiopia's Amhara region", since: "2023-08-01", partOfCountry: true });
  // A war over whole countries is never "in part" (a Kharkiv-like box).
  const kharkiv = { id: "area-kharkiv-like", createdAt: "x", geometry: box(35.5, 49.0, 37.5, 50.3) };
  assert.deepEqual(listConflictForArea(kharkiv), { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24" });
  // At peace: null.
  assert.equal(listWarFor({ id: "area-iowa" }, planGrid(box(-93.7, 42.0, -93.6, 42.1))), null);
});

test("land inside another listed war never gets the peace rules: a box over the Kursk front has the war's rules all over; one with Russian land in no war holds it in part, with its Ukrainian squares at war (warCellsFor)", async () => {
  const { planGrid } = await import("./geo.js");
  const { sampleReadings } = await import("./providers/sample.js");
  const box = (west, south, east, north) => ({ type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
  // A box drawn over the Sudzha front (2026-10-20 review): 177 squares in
  // the Kursk war, 103 in Sumy oblast (the war in Ukraine), 52 of them not
  // touching the Kursk boxes. All of them are land at war: no "in part".
  const sudzha = { id: "area-sudzha", kind: "custom", source: "bbox", createdAt: "2026-10-20T00:00:00Z", geometry: box(34.6, 50.8, 35.6, 51.5) };
  const sudzhaGrid = planGrid(sudzha.geometry);
  const sudzhaWar = listWarFor(sudzha, sudzhaGrid);
  assert.equal(sudzhaWar.id, "russia-kursk-belgorod");
  assert.equal(sudzhaWar.partOfCountry, undefined);
  const sudzhaTouching = warSquares({ ...sudzhaWar, partOfCountry: true }, sudzhaGrid.cells, sudzhaGrid.cellSizeDeg);
  assert.equal(sudzhaGrid.cells.length - sudzhaTouching.size, 52, "52 squares do not touch the boxes");
  assert.equal(warCellsFor({ ...sudzhaWar, partOfCountry: true }, sudzhaGrid.cells, sudzhaGrid.cellSizeDeg).size, sudzhaGrid.cells.length);
  assert.deepEqual(listConflictForArea(sudzha), { id: "russia-kursk-belgorod", name: "Fighting in Russia's Kursk and Belgorod border areas", since: "2022-02-24" });

  // A box from Kharkiv oblast to Belgorod: its Russian squares outside the
  // boxes are in no war, so it holds the war in part; its Ukrainian squares
  // keep the war's rules, those that touch the boxes and those that do not.
  const khb = { id: "area-kharkiv-belgorod", kind: "custom", source: "bbox", createdAt: "2026-10-20T00:00:00Z", geometry: box(36.0, 49.95, 37.0, 50.8) };
  const grid = planGrid(khb.geometry);
  const war = listWarFor(khb, grid);
  assert.equal(war.id, "russia-kursk-belgorod");
  assert.equal(war.partOfCountry, true);
  assert.equal(war.partOf, "area");
  const ruled = warCellsFor(war, grid.cells, grid.cellSizeDeg);
  const touching = warSquares(war, grid.cells, grid.cellSizeDeg);
  const ukraine = grid.cells.filter((cell) => countryAt(cell.lat, cell.lon)?.id === "804");
  const russiaAtPeace = grid.cells.filter((cell) => countryAt(cell.lat, cell.lon)?.id === "643" && !conflictAt(cell.lat, cell.lon) && !touching.has(cell.id));
  assert.ok(ukraine.length > 0 && ukraine.every((cell) => ruled.has(cell.id)));
  assert.ok(ukraine.some((cell) => !touching.has(cell.id)), "some Ukrainian squares do not touch the Kursk boxes");
  assert.ok(russiaAtPeace.length > 0 && russiaAtPeace.every((cell) => !ruled.has(cell.id)));
  assert.equal(ruled.size + russiaAtPeace.length, grid.cells.length);
  assert.deepEqual(listConflictForArea(khb), { id: "russia-kursk-belgorod", name: "Fighting in Russia's Kursk and Belgorod border areas", since: "2022-02-24", partOfCountry: true, partOf: "area", otherWarSquares: ruled.size - touching.size });
  // The analysis reads them so (sample data; gee.js uses the same squares).
  const result = sampleReadings({ area: { ...khb, bbox: grid.bbox }, cells: grid.cells, month: "2026-09", cellSizeDeg: grid.cellSizeDeg, conflict: war });
  const atWar = new Map(result.readings.map((reading) => [reading.id, reading.atWar]));
  assert.ok(ukraine.every((cell) => atWar.get(cell.id) === true));
  assert.ok(russiaAtPeace.every((cell) => atWar.get(cell.id) === false));

  // A whole country keeps its squares as they were: none of them lies in
  // another listed war.
  assert.equal(listConflictForArea({ id: "country-643-x", countryId: "643", createdAt: "x" }).otherWarSquares, undefined);
  // No war in part: null.
  assert.equal(warCellsFor(null, grid.cells, grid.cellSizeDeg), null);
  assert.equal(warCellsFor({ ...war, partOfCountry: undefined }, grid.cells, grid.cellSizeDeg), null);
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
    [{ mode: "sometimes" }, /must be "list" \(the app's list of wars\), "war" \(at war from a day\), "disaster" \(a natural disaster from a day\) or "peace" \(no crisis\), not "sometimes"/],
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

test("checkAreaWar and teamConflict: a natural disaster since a day, with its type and an optional name; wars, peace and the list as before", async () => {
  const { TEAM_DISASTER_NAME } = await import("../src/config/conflicts.js");
  const today = "2026-10-19";
  assert.deepEqual(checkAreaWar({ mode: "disaster", since: "2023-09-04", type: "flood", name: "  Storm   Daniel floods " }, today), { war: { mode: "disaster", since: "2023-09-04", type: "flood", name: "Storm Daniel floods" } });
  assert.deepEqual(checkAreaWar({ mode: "disaster", since: "2024-07-17", type: "wildfire" }, today), { war: { mode: "disaster", since: "2024-07-17", type: "wildfire" } });
  for (const type of ["drought", "ground", "other"]) assert.equal(checkAreaWar({ mode: "disaster", since: "2024-01-01", type }, today).war.type, type);
  const errors = [
    [{ mode: "disaster", since: "2023-09-04" }, "Choose what kind of disaster it was: flood, wildfire, drought, storm/earthquake/landslide, or other."],
    [{ mode: "disaster", since: "2023-09-04", type: "volcano" }, "Choose what kind of disaster it was: flood, wildfire, drought, storm/earthquake/landslide, or other."],
    [{ mode: "disaster", since: "2021-12-31", type: "flood" }, "The day must be 1 January 2022 or later: the normal years 2019 to 2021 must come before the disaster."],
    [{ mode: "disaster", since: "2026-10-20", type: "flood" }, "The day cannot be after today (2026-10-19)."],
    [{ mode: "disaster", since: "2023-02-30", type: "flood" }, "Give the day the disaster began, as YYYY-MM-DD (for example 2024-06-21)."],
    [{ mode: "disaster", since: "2023-09-04", type: "flood", name: "x".repeat(81) }, `The disaster's name can have at most ${WAR_NAME_MAX} characters (this one has 81).`],
  ];
  for (const [input, message] of errors) assert.deepEqual(checkAreaWar(input, today), { error: message }, JSON.stringify(input));
  // The crisis object: a war's, plus kind and type.
  assert.deepEqual(teamConflict({ mode: "disaster", since: "2023-09-04", type: "flood" }, "a1"), { id: "area-a1", name: "Flood (set for this area)", since: "2023-09-04", source: "area", kind: "disaster", type: "flood" });
  assert.deepEqual(teamConflict({ mode: "disaster", since: "2023-09-04", type: "flood", name: "Storm Daniel floods" }, "a1").name, "Storm Daniel floods");
  assert.equal(TEAM_DISASTER_NAME("ground"), "Storm, earthquake or landslide (set for this area)");
  assert.equal(teamConflict({ mode: "disaster", since: "2023-09-04", type: "volcano" }, "a1"), undefined);
  // Wars, peace and the list: exactly as before (no new key).
  assert.deepEqual(teamConflict({ mode: "war", since: "2023-08-01" }, "a1"), { id: "area-a1", name: "War (set for this area)", since: "2023-08-01", source: "area" });
  assert.equal(teamConflict({ mode: "peace" }, "a1"), null);
  assert.equal(teamConflict({ mode: "list" }, "a1"), undefined);
  // The area's analyses use it first, whatever the list says.
  assert.equal(conflictForArea({ countryId: "804", war: { mode: "disaster", since: "2023-09-04", type: "flood" }, areaId: "u" }).kind, "disaster");
});

test("crisisFormFor: each Crisis choice starts from its own day and name; a war's never fills a disaster, nor a disaster's a war", () => {
  // A war of the app's list (Kharkiv since 24 Feb 2022): Natural disaster starts empty.
  assert.deepEqual(crisisFormFor("disaster", null, "2022-02-24"), { since: "", name: "", type: "" });
  assert.deepEqual(crisisFormFor("war", null, "2022-02-24"), { since: "2022-02-24", name: "", type: "" });
  assert.deepEqual(crisisFormFor("war", null, "2014-04-06"), { since: "", name: "", type: "" }, "a list war older than 2022 is not offered");
  // A saved flood: reopened as it is; At war gets the list day and no name.
  const flood = { mode: "disaster", since: "2025-08-15", type: "flood", name: "Chenab floods" };
  assert.deepEqual(crisisFormFor("disaster", flood, "2022-02-24"), { since: "2025-08-15", name: "Chenab floods", type: "flood" });
  assert.deepEqual(crisisFormFor("war", flood, null), { since: "", name: "", type: "" });
  // A saved war: Natural disaster starts empty, never "Fighting in Amhara".
  const war = { mode: "war", since: "2023-08-01", name: "Fighting in Amhara" };
  assert.deepEqual(crisisFormFor("disaster", war, null), { since: "", name: "", type: "" });
  assert.deepEqual(crisisFormFor("war", war, null), { since: "2023-08-01", name: "Fighting in Amhara", type: "" });
});
