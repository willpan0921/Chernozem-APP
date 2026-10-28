// WHAT THIS FILE DOES
// Turns the raw World Bank WITS crawl (every country's agricultural
// imports and exports by partner, in three sectors: live animals and animal
// products HS 01-05, vegetable products 06-15, prepared food 16-24) into
// the small table the website's globe reads, public/site/world/trade.json:
//
//   { year, note, exporters: { ISO3: { total, to: [ { iso3, share, value } ] } } }
//
// For an exporter A and an importer B:
//   value   what B says it bought from A (US$ thousands, the three sectors
//           together). When B reported nothing at all, A's own figure for
//           its exports to B stands in.
//   share   value divided by everything B imports in those sectors from
//           every country: "23% of Egypt's food imports come from Ukraine".
//   total   everything A sells abroad in those sectors, counted the same way.
// Each exporter keeps its eight largest shares, and only those of at least
// 2% and at least US$ 20 million (20,000 thousand). Region groups ("World",
// "Europe & Central Asia"...), bunkers, free zones, "unspecified" and
// dissolved states are left out everywhere, and WITS's old codes (ROM for
// Romania...) become today's ISO3 codes, so every code in the file is a
// country the globe can place. The crawl itself is scripts/world-trade.js.
//
// The raw crawl: { reporters: { ISO3: { name, year, imports: { PARTNER:
// usd_thousands }, exports: { PARTNER: usd_thousands } } } }.
//
// WHO EDITS IT
// Whoever changes what the globe's arrows mean.

// WITS region groups (isgroup="Yes" in its country list) and the EU.
export const WITS_GROUPS = new Set(["WLD", "EUN", "EAS", "ECS", "LCN", "MEA", "NAC", "SAS", "SSF"]);
// WITS partner codes that are not a country: bunkers, free zones, special
// categories, unspecified, and states that no longer exist.
export const WITS_NOT_A_COUNTRY = new Set(["BUN", "FRE", "SPE", "UNS", "YUG", "CSK", "ANT"]);
// WITS's own codes for today's ISO3 countries. "Other Asia, nes" (OAS) is
// how the trade statistics name Taiwan.
export const WITS_LEGACY = { ROM: "ROU", SER: "SRB", SUD: "SDN", ZAR: "COD", TMP: "TLS", MNT: "MNE", OAS: "TWN" };

export const MAX_PARTNERS = 8;
export const MIN_SHARE = 0.02;
export const MIN_VALUE = 20000; // US$ thousands = US$ 20 million

// A WITS code -> an ISO3 country code, or null when it is not a country.
export function countryCode(code) {
  const text = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(text)) return null;
  if (WITS_GROUPS.has(text) || WITS_NOT_A_COUNTRY.has(text)) return null;
  return WITS_LEGACY[text] || text;
}

// { PARTNER: value } -> { ISO3: value } with the codes made plain and
// anything that is not a country dropped.
function countryRows(rows) {
  const out = {};
  for (const [code, value] of Object.entries(rows || {})) {
    const iso3 = countryCode(code);
    const amount = Number(value);
    if (!iso3 || !Number.isFinite(amount) || amount <= 0) continue;
    out[iso3] = (out[iso3] || 0) + amount;
  }
  return out;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

// The most common reporting year.
function commonYear(reporters) {
  const counts = new Map();
  for (const entry of Object.values(reporters)) {
    const year = Number(entry?.year);
    if (Number.isFinite(year)) counts.set(year, (counts.get(year) || 0) + 1);
  }
  let best = null;
  for (const [year, count] of counts) if (best === null || count > counts.get(best) || (count === counts.get(best) && year > best)) best = year;
  return best;
}

export function buildTradeTable(raw, { maxPartners = MAX_PARTNERS, minShare = MIN_SHARE, minValue = MIN_VALUE } = {}) {
  const reporters = {};
  for (const [code, entry] of Object.entries(raw?.reporters || {})) {
    const iso3 = countryCode(code);
    if (!iso3 || !entry) continue;
    const have = reporters[iso3] || (reporters[iso3] = { year: entry.year ?? null, imports: {}, exports: {} });
    for (const [partner, value] of Object.entries(countryRows(entry.imports))) have.imports[partner] = (have.imports[partner] || 0) + value;
    for (const [partner, value] of Object.entries(countryRows(entry.exports))) have.exports[partner] = (have.exports[partner] || 0) + value;
  }

  // What each importer B bought from each A: B's own report when it made
  // one, else what every A says it sent to B.
  const importers = {};
  for (const [iso3, entry] of Object.entries(reporters)) {
    const from = Object.fromEntries(Object.entries(entry.imports).filter(([partner]) => partner !== iso3));
    if (Object.keys(from).length) importers[iso3] = { reported: true, from };
  }
  for (const [iso3, entry] of Object.entries(reporters)) {
    for (const [partner, value] of Object.entries(entry.exports)) {
      if (partner === iso3 || importers[partner]?.reported) continue;
      const mirror = importers[partner] || (importers[partner] = { reported: false, from: {} });
      mirror.from[iso3] = (mirror.from[iso3] || 0) + value;
    }
  }

  const exporters = {};
  for (const [importer, record] of Object.entries(importers)) {
    const total = Object.values(record.from).reduce((sum, value) => sum + value, 0);
    if (total <= 0) continue;
    for (const [exporter, value] of Object.entries(record.from)) {
      if (value <= 0) continue;
      const have = exporters[exporter] || (exporters[exporter] = { total: 0, rows: [] });
      have.total += value;
      have.rows.push({ iso3: importer, value, share: value / total });
    }
  }

  const table = {};
  for (const exporter of Object.keys(exporters).sort()) {
    const { total, rows } = exporters[exporter];
    const to = rows
      .filter((row) => row.share >= minShare && row.value >= minValue)
      .sort((a, b) => b.share - a.share || b.value - a.value || a.iso3.localeCompare(b.iso3))
      .slice(0, maxPartners)
      .map((row) => ({ iso3: row.iso3, share: round3(row.share), value: Math.round(row.value) }));
    if (to.length) table[exporter] = { total: Math.round(total), to };
  }

  const year = commonYear(reporters);
  return {
    year,
    note: `World Bank WITS, importer-reported, three agricultural sectors (HS 01-05 animal, 06-15 vegetable, 16-24 food products), ${year ?? "latest year with data"}. value: US$ thousands the importer reports buying from this exporter (the exporter's own figure when the importer reported nothing); share: that value over everything the importer buys in these sectors; total: the exporter's sales to every country, counted the same way. Up to eight partners per exporter, each at least 2% and US$ 20 million.`,
    exporters: table,
  };
}
