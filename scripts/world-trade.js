// WHAT THIS FILE DOES
// Builds the agricultural trade table the website's globe reads
// (public/site/world/trade.json: who buys whose food) from World Bank WITS
// TradeStats. Two steps:
//   1. the crawl: for every reporting country, its imports and its exports
//      by partner in three agricultural sectors (HS 01-05 live animals and
//      animal products, 06-15 vegetable products, 16-24 prepared food), for
//      the latest year with data (2023, else 2022, else 2021). About 206
//      countries x 2 flows x 3 sectors, over a thousand requests, 20 to 30
//      minutes. It saves after every country, so a stopped crawl carries on
//      where it was when run again with the same --save-raw file.
//   2. the build (server/world/trade.js buildTradeTable): the share of each
//      importer's food that comes from each exporter, the eight largest per
//      exporter, written as one small file (under 150 KB).
// It needs nothing installed beyond Node.
//
// HOW TO USE IT
// In Terminal, in the project folder (on this Mac first run
// "export PATH=~/.local/node/bin:$PATH"):
//
//   node scripts/world-trade.js                     crawl WITS, then build
//   node scripts/world-trade.js --raw crawl.json    build from a finished crawl
//
// Options
//   --raw <file>        a finished crawl to build from (no requests made)
//   --save-raw <file>   where the crawl keeps its answers (default: a file
//                       named world-trade-raw.json in the system's temporary
//                       folder; the path is printed)
//   --out <file>        where to write (default: public/site/world/trade.json)
//   --years 2023,2022   the years to try, newest first (default 2023,2022,2021)
//   --workers 4         how many countries are asked at the same time
//   --only UKR,EGY      crawl only these reporters (to try it out)
//
// WHO EDITS IT
// Whoever refreshes the globe's trade data (once a year, when WITS has a
// new year).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTradeTable, countryCode } from "../server/world/trade.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "public", "site", "world", "trade.json");
const COUNTRIES_FILE = path.join(ROOT, "public", "site", "world", "countries.json");
const SIZE_LIMIT = 150 * 1024;

const WITS = "https://wits.worldbank.org/API/V1";
const COUNTRY_LIST = `${WITS}/wits/datasource/tradestats-trade/country/ALL?format=JSON`; // (answers XML)
const SECTORS = ["01-05_Animal", "06-15_Vegetable", "16-24_FoodProd"];
const FLOWS = { imports: "MPRT-TRD-VL", exports: "XPRT-TRD-VL" };
const REQUEST_TIMEOUT_MS = 90 * 1000;

// ---------- Options ----------

function readOptions(argv) {
  const options = { raw: null, saveRaw: path.join(os.tmpdir(), "world-trade-raw.json"), out: DEFAULT_OUT, years: [2023, 2022, 2021], workers: 4, only: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--raw") options.raw = path.resolve(value), i++;
    else if (flag === "--save-raw") options.saveRaw = path.resolve(value), i++;
    else if (flag === "--out") options.out = path.resolve(value), i++;
    else if (flag === "--years") options.years = value.split(",").map((y) => Number(y.trim())).filter(Number.isFinite), i++;
    else if (flag === "--workers") options.workers = Math.max(1, Number(value) || 4), i++;
    else if (flag === "--only") options.only = new Set(value.split(",").map((c) => c.trim().toUpperCase())), i++;
    else if (flag === "--help" || flag === "-h") {
      console.log("node scripts/world-trade.js [--raw <file>] [--save-raw <file>] [--out <file>] [--years 2023,2022] [--workers 4] [--only UKR,EGY]");
      process.exit(0);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

// ---------- The crawl ----------

async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 404) return null; // no data for this ask
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

// The reporting countries from WITS's country list (XML; groups and
// non-countries left out).
async function fetchReporters() {
  const xml = await fetchText(COUNTRY_LIST);
  if (!xml) throw new Error("WITS did not give its country list.");
  const found = [];
  for (const match of xml.matchAll(/<wits:country\s+([^>]*)>([\s\S]*?)<\/wits:country>/g)) {
    const attributes = match[1];
    const body = match[2];
    if (!/isreporter="1"/.test(attributes) || /isgroup="Yes"/.test(attributes)) continue;
    const iso3 = (body.match(/<wits:iso3Code>([^<]*)</) || [])[1]?.trim();
    const name = (body.match(/<wits:name>([^<]*)</) || [])[1]?.trim().replace(/&amp;/g, "&");
    if (iso3 && countryCode(iso3)) found.push({ iso3, name });
  }
  if (!found.length) throw new Error("WITS's country list had no reporters in it.");
  return found;
}

// One SDMX-JSON answer -> { PARTNER: value } (one value per partner).
export function decodeSdmx(data) {
  if (!data?.structure || !data.dataSets?.[0]?.series) return {};
  const dimensions = data.structure.dimensions.series;
  const partnerAt = dimensions.findIndex((dimension) => dimension.id === "PARTNER");
  if (partnerAt < 0) return {};
  const out = {};
  for (const [key, series] of Object.entries(data.dataSets[0].series)) {
    const index = key.split(":").map(Number);
    const partner = dimensions[partnerAt].values[index[partnerAt]]?.id;
    const observation = Object.values(series.observations || {})[0];
    const value = Array.isArray(observation) ? observation[0] : null;
    if (partner && typeof value === "number") out[partner] = (out[partner] || 0) + value;
  }
  return out;
}

function tradeUrl(iso3, year, sector, indicator) {
  return `${WITS}/SDMX/V21/datasource/tradestats-trade/reporter/${iso3.toLowerCase()}/year/${year}/partner/all/product/${sector}/indicator/${indicator}?format=JSON`;
}

// One reporter: the newest year that has any rows, both flows, the three
// sectors added together.
async function crawlReporter(reporter, years) {
  const entry = { name: reporter.name, year: null, imports: {}, exports: {}, done: true };
  for (const year of years) {
    let any = false;
    for (const [flow, indicator] of Object.entries(FLOWS)) {
      for (const sector of SECTORS) {
        const text = await fetchText(tradeUrl(reporter.iso3, year, sector, indicator));
        const rows = text ? decodeSdmx(JSON.parse(text)) : {};
        for (const [partner, value] of Object.entries(rows)) {
          entry[flow][partner] = (entry[flow][partner] || 0) + value;
          any = true;
        }
      }
    }
    if (any) {
      entry.year = year;
      break;
    }
  }
  return entry;
}

async function crawl(options) {
  const file = options.saveRaw;
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { reporters: {} };
  raw.reporters ||= {};
  console.log(`Crawl saved to ${file}`);
  const reporters = (await fetchReporters()).filter((reporter) => !options.only || options.only.has(reporter.iso3));
  const todo = reporters.filter((reporter) => !raw.reporters[reporter.iso3]?.done);
  console.log(`${reporters.length} reporters, ${todo.length} still to ask (years ${options.years.join(", ")})`);
  let next = 0;
  let failed = 0;
  const save = () => fs.writeFileSync(file, JSON.stringify(raw));
  await Promise.all(
    Array.from({ length: options.workers }, async () => {
      while (next < todo.length) {
        const reporter = todo[next++];
        try {
          const entry = await crawlReporter(reporter, options.years);
          raw.reporters[reporter.iso3] = entry;
          save();
          console.log(`${reporter.iso3} ${reporter.name}: ${entry.year ?? "no data"}, ${Object.keys(entry.imports).length} import partners, ${Object.keys(entry.exports).length} export partners`);
        } catch (error) {
          failed += 1;
          console.log(`${reporter.iso3} ${reporter.name}: FAILED (${error.message}); run again to retry`);
        }
      }
    }),
  );
  console.log(`done: ${Object.keys(raw.reporters).length} of ${reporters.length} reporters crawled${failed ? `, ${failed} failed` : ""}`);
  return raw;
}

// ---------- The build ----------

function countryNames(raw) {
  let names = {};
  try {
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, "utf8"));
    for (const [iso3, entry] of Object.entries(countries)) names[iso3] = entry.name;
  } catch {
    names = {};
  }
  for (const [code, entry] of Object.entries(raw.reporters || {})) {
    const iso3 = countryCode(code);
    if (iso3 && !names[iso3] && entry?.name) names[iso3] = entry.name;
  }
  return names;
}

function build(raw, options) {
  const table = buildTradeTable(raw);
  const json = JSON.stringify(table);
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, json);
  const names = countryNames(raw);
  const count = Object.keys(table.exporters).length;
  console.log(`\nWrote ${options.out}: ${count} exporters, year ${table.year}, ${(json.length / 1024).toFixed(1)} KB${json.length > SIZE_LIMIT ? " (OVER THE 150 KB LIMIT)" : ""}`);
  const ukraine = table.exporters.UKR;
  if (ukraine) {
    console.log(`Ukraine sells US$ ${(ukraine.total / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })} million of food abroad; who depends on it most:`);
    for (const row of ukraine.to) console.log(`  ${names[row.iso3] || row.iso3}: ${(row.share * 100).toFixed(1)}% of its food imports (US$ ${(row.value / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })} million)`);
  } else console.log("Ukraine has no rows (check the crawl).");
  return table;
}

// ---------- Main ----------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = readOptions(process.argv.slice(2));
  const raw = options.raw ? JSON.parse(fs.readFileSync(options.raw, "utf8")) : await crawl(options);
  build(raw, options);
}
