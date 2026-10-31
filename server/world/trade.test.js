// WHAT THIS FILE DOES
// Tests the trade table behind the globe's arrows (server/world/trade.js
// buildTradeTable) on a small made-up crawl: the importer's figure wins
// and the exporter's stands in when the importer reported nothing, the
// share is of the importer's whole agricultural imports, region groups and
// non-countries are left out, WITS's old codes become ISO3, the eight
// largest shares are kept above the 2% and US$ 20 million floors, rounding,
// each row's year and side ("buyer" or "seller"), and the years and note
// at the top. Then the real file, public/site/world/trade.json, is checked
// against the same contract. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/world/trade.js or scripts/world-trade.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTradeTable, countryCode, MAX_PARTNERS, MIN_SHARE, MIN_VALUE } from "./trade.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// A small world: Ukraine sells to Egypt, Türkiye (whose latest report is
// from 2021), Romania (under WITS's old code), Moldova (which reported
// nothing) and Somalia (not a reporter).
function smallWorld() {
  return {
    reporters: {
      UKR: {
        name: "Ukraine",
        year: 2023,
        imports: { POL: 100, UKR: 5 },
        exports: { EGY: 1500000, TUR: 300000, MDA: 300000.4, SOM: 50000, WLD: 99999999, ECS: 5000000, UNS: 70000 },
      },
      EGY: { name: "Egypt", year: 2023, imports: { UKR: 2000000.4, RUS: 6000000, BRA: 1000000, ARG: 150000, WLD: 9999999, EUN: 100, FRE: 500 }, exports: {} },
      TUR: { name: "Turkiye", year: 2021, imports: { UKR: 400000, RUS: 100000, BLR: 15000 }, exports: {} },
      ROM: { name: "Romania", year: 2023, imports: { UKR: 100000, SER: 20000 }, exports: {} },
      MDA: { name: "Moldova", year: 2022, imports: {}, exports: {} },
      RUS: { name: "Russia", year: 2023, imports: {}, exports: { EGY: 6500000, TUR: 90000 } },
      ARG: {
        name: "Argentina",
        year: 2023,
        imports: {},
        exports: { BOL: 30000, CHL: 30000, PER: 30000, ECU: 30000, PRY: 30000, URY: 30000, VEN: 30000, COL: 30000, GTM: 30000, HND: 30000 },
      },
      VEN: { name: "Venezuela", year: null, imports: {}, exports: {} },
    },
  };
}

test("WITS codes: groups and non-countries are dropped, old codes become ISO3", () => {
  for (const group of ["WLD", "EUN", "ECS", "EAS", "LCN", "MEA", "NAC", "SAS", "SSF"]) assert.equal(countryCode(group), null, group);
  for (const other of ["BUN", "FRE", "SPE", "UNS", "YUG", "CSK", "ANT"]) assert.equal(countryCode(other), null, other);
  assert.equal(countryCode("ROM"), "ROU");
  assert.equal(countryCode("SER"), "SRB");
  assert.equal(countryCode("SUD"), "SDN");
  assert.equal(countryCode("ZAR"), "COD");
  assert.equal(countryCode("TMP"), "TLS");
  assert.equal(countryCode("MNT"), "MNE");
  assert.equal(countryCode("OAS"), "TWN");
  assert.equal(countryCode("ukr"), "UKR");
  assert.equal(countryCode("US"), null);
  assert.equal(countryCode(""), null);
  assert.equal(countryCode(null), null);
});

test("the importer's figure wins; the exporter's stands in when the importer reported nothing; each row says its year and whose figure it is", () => {
  const table = buildTradeTable(smallWorld());
  assert.equal(table.year, 2023, "the most common reporting year");
  assert.deepEqual(table.years, [2021, 2023], "the first and last year of any row");
  assert.match(table.note, /World Bank WITS, three agricultural sectors/);
  assert.match(table.note, /the latest year each country reported \(2021 to 2023; most often 2023\)/);
  assert.match(table.note, /by "buyer"/);
  assert.match(table.note, /by "seller"/);

  const ukraine = table.exporters.UKR;
  // Egypt's own report (2,000,000) over Ukraine's figure (1,500,000); the
  // share is of Egypt's imports from countries only (9,150,000, no WLD/EUN/FRE).
  assert.deepEqual(ukraine.to, [
    { iso3: "MDA", share: 1, value: 300000, year: 2023, by: "seller" }, // reported nothing: Ukraine's own figure (and year), all of it
    { iso3: "SOM", share: 1, value: 50000, year: 2023, by: "seller" }, // not a reporter at all: the same
    { iso3: "ROU", share: 0.833, value: 100000, year: 2023, by: "buyer" }, // Romania under WITS's old code
    { iso3: "TUR", share: 0.777, value: 400000, year: 2021, by: "buyer" }, // Türkiye's own latest report, from 2021
    { iso3: "EGY", share: 0.219, value: 2000000, year: 2023, by: "buyer" },
  ]);
  assert.equal(ukraine.total, 2850001, "the same figures added up (2,000,000.4 + 400,000 + 300,000.4 + 50,000 + 100,000, then rounded)");

  const russia = table.exporters.RUS;
  assert.deepEqual(russia.to, [
    { iso3: "EGY", share: 0.656, value: 6000000, year: 2023, by: "buyer" }, // Egypt says 6,000,000, not Russia's 6,500,000
    { iso3: "TUR", share: 0.194, value: 100000, year: 2021, by: "buyer" },
  ]);
  assert.equal(russia.total, 6100000);
  assert.deepEqual(table.exporters.SRB, { total: 20000, to: [{ iso3: "ROU", share: 0.167, value: 20000, year: 2023, by: "buyer" }] }, "SER -> SRB; exactly US$ 20 million passes");
  assert.deepEqual(table.exporters.BRA.to, [{ iso3: "EGY", share: 0.109, value: 1000000, year: 2023, by: "buyer" }]);
  // Argentina's buyers reported nothing: Argentina's own figures and year.
  assert.ok(table.exporters.ARG.to.every((row) => row.by === "seller" && row.year === 2023));
});

test("the floors, the eight largest, the order and what is left out", () => {
  const table = buildTradeTable(smallWorld());
  assert.equal(table.exporters.BLR, undefined, "15,000 to Türkiye: 2.9% but under US$ 20 million");
  assert.equal(table.exporters.ARG.to.find((row) => row.iso3 === "EGY"), undefined, "1.6% of Egypt's imports: under 2%");
  assert.equal(table.exporters.POL, undefined, "100 to Ukraine: nothing kept, so no row at all");
  assert.equal(table.exporters.WLD, undefined);
  assert.equal(table.exporters.ECS, undefined);
  assert.equal(table.exporters.UNS, undefined);
  assert.equal(table.exporters.VEN, undefined, "reported nothing and sold nothing");
  for (const rows of Object.values(table.exporters)) for (const row of rows.to) assert.notEqual(row.iso3, "WLD");
  assert.equal(table.exporters.UKR.to.find((row) => row.iso3 === "UKR"), undefined, "no country buys from itself");

  // Ten equal buyers: eight kept, ties by value then by code.
  assert.deepEqual(
    table.exporters.ARG.to.map((row) => row.iso3),
    ["BOL", "CHL", "COL", "ECU", "GTM", "HND", "PER", "PRY"],
  );
  assert.equal(table.exporters.ARG.total, 450000, "the total counts every buyer, kept or not (ten at 30,000 and Egypt's dropped 150,000)");
  assert.equal(MAX_PARTNERS, 8);
  assert.equal(MIN_SHARE, 0.02);
  assert.equal(MIN_VALUE, 20000);

  // The options can move the floors.
  const loose = buildTradeTable(smallWorld(), { maxPartners: 2, minShare: 0, minValue: 0 });
  assert.equal(loose.exporters.UKR.to.length, 2);
  assert.deepEqual(loose.exporters.BLR, { total: 15000, to: [{ iso3: "TUR", share: 0.029, value: 15000, year: 2021, by: "buyer" }] });
  assert.deepEqual(loose.exporters.POL, { total: 100, to: [{ iso3: "UKR", share: 1, value: 100, year: 2023, by: "buyer" }] });
});

test("empty or odd crawls give an empty table", () => {
  assert.deepEqual(buildTradeTable({}).exporters, {});
  assert.deepEqual(buildTradeTable(null).exporters, {});
  assert.equal(buildTradeTable({ reporters: {} }).year, null);
  assert.equal(buildTradeTable({ reporters: {} }).years, null, "no rows, no years");
  // A crawl without years still builds (each row's year is then null).
  const yearless = buildTradeTable({ reporters: { EGY: { imports: { UKR: 2000000 }, exports: {} } } });
  assert.deepEqual(yearless.exporters.UKR.to, [{ iso3: "EGY", share: 1, value: 2000000, year: null, by: "buyer" }]);
  assert.equal(yearless.years, null);
  const odd = buildTradeTable({ reporters: { WLD: { year: 2023, imports: { UKR: 5000000 }, exports: {} }, XY: { year: 2023, imports: { UKR: 1 }, exports: {} } } });
  assert.deepEqual(odd.exporters, {}, "a group or a bad code as a reporter counts for nothing");
});

test("the real file follows the contract", () => {
  const file = path.join(ROOT, "public", "site", "world", "trade.json");
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.length < 150 * 1024, `${text.length} bytes, under 150 KB`);
  const table = JSON.parse(text);
  assert.equal(typeof table.year, "number");
  assert.ok(table.year >= 2021);
  assert.ok(Array.isArray(table.years) && table.years.length === 2, "years: [first, last]");
  assert.ok(table.years[0] >= 2021 && table.years[0] <= table.year && table.year <= table.years[1] && table.years[1] <= 2023, `years ${table.years}`);
  assert.match(table.note, /World Bank WITS, three agricultural sectors/);
  assert.match(table.note, /the latest year each country reported/);
  const sides = new Set();
  const exporters = Object.entries(table.exporters);
  assert.ok(exporters.length >= 100, `${exporters.length} exporters`);
  for (const [iso3, entry] of exporters) {
    assert.match(iso3, /^[A-Z]{3}$/);
    assert.equal(countryCode(iso3), iso3, `${iso3} is a country code`);
    assert.ok(Number.isInteger(entry.total) && entry.total > 0, `${iso3} total`);
    assert.ok(entry.to.length >= 1 && entry.to.length <= 8, `${iso3} keeps 1 to 8 buyers`);
    let previous = Infinity;
    for (const row of entry.to) {
      assert.match(row.iso3, /^[A-Z]{3}$/);
      assert.equal(countryCode(row.iso3), row.iso3, `${iso3} -> ${row.iso3}`);
      assert.notEqual(row.iso3, iso3);
      assert.ok(row.share >= 0.02 && row.share <= 1, `${iso3} -> ${row.iso3} share ${row.share}`);
      assert.equal(row.share, Math.round(row.share * 1000) / 1000, "three decimals");
      assert.ok(Number.isInteger(row.value) && row.value >= 20000, `${iso3} -> ${row.iso3} value ${row.value}`);
      assert.ok(Number.isInteger(row.year) && row.year >= table.years[0] && row.year <= table.years[1], `${iso3} -> ${row.iso3} year ${row.year}`);
      assert.ok(row.by === "buyer" || row.by === "seller", `${iso3} -> ${row.iso3} by ${row.by}`);
      sides.add(row.by);
      assert.ok(row.share <= previous, "largest shares first");
      previous = row.share;
    }
  }
  assert.deepEqual([...sides].sort(), ["buyer", "seller"], "both kinds of row are in the file");
  const ukraine = table.exporters.UKR.to.map((row) => row.iso3);
  assert.ok(ukraine.includes("EGY") && ukraine.includes("TUR"), `Ukraine feeds Egypt and Türkiye: ${ukraine.join(", ")}`);
  // Belarus has reported nothing since 2021: its row says so (the globe
  // leaves rows from before a war out).
  const belarus = table.exporters.UKR.to.find((row) => row.iso3 === "BLR");
  if (belarus) assert.equal(belarus.year, 2021, "Belarus's figure is its 2021 report");
});
