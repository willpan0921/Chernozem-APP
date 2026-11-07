// WHAT THIS FILE DOES
// Country names in the website's languages, for the About page's globe
// (components/EarthGlobe.jsx, globeMath.js): the browser knows every
// country's name in every language (Intl.DisplayNames: Україна, 乌克兰),
// but needs the two-letter code (ISO 3166-1 alpha-2), and the globe's data
// carries three-letter codes (alpha-3, "UKR"). ALPHA2 maps one to the
// other for every country and territory; regionName(iso3, english, locale)
// gives the name in the language, or the English name the data has for a
// code it does not know, and for English itself (the website says "the
// Netherlands" and "DR Congo" the way people do: globeMath.js plainName).
// No dictionary entries for countries.
//
// WHO EDITS IT
// Whoever adds a country (a new code in ISO 3166-1).

export const ALPHA2 = {
  ABW: "AW", AFG: "AF", AGO: "AO", AIA: "AI", ALA: "AX", ALB: "AL", AND: "AD", ARE: "AE", ARG: "AR", ARM: "AM",
  ASM: "AS", ATA: "AQ", ATF: "TF", ATG: "AG", AUS: "AU", AUT: "AT", AZE: "AZ", BDI: "BI", BEL: "BE", BEN: "BJ",
  BES: "BQ", BFA: "BF", BGD: "BD", BGR: "BG", BHR: "BH", BHS: "BS", BIH: "BA", BLM: "BL", BLR: "BY", BLZ: "BZ",
  BMU: "BM", BOL: "BO", BRA: "BR", BRB: "BB", BRN: "BN", BTN: "BT", BVT: "BV", BWA: "BW", CAF: "CF", CAN: "CA",
  CCK: "CC", CHE: "CH", CHL: "CL", CHN: "CN", CIV: "CI", CMR: "CM", COD: "CD", COG: "CG", COK: "CK", COL: "CO",
  COM: "KM", CPV: "CV", CRI: "CR", CUB: "CU", CUW: "CW", CXR: "CX", CYM: "KY", CYP: "CY", CZE: "CZ", DEU: "DE",
  DJI: "DJ", DMA: "DM", DNK: "DK", DOM: "DO", DZA: "DZ", ECU: "EC", EGY: "EG", ERI: "ER", ESH: "EH", ESP: "ES",
  EST: "EE", ETH: "ET", FIN: "FI", FJI: "FJ", FLK: "FK", FRA: "FR", FRO: "FO", FSM: "FM", GAB: "GA", GBR: "GB",
  GEO: "GE", GGY: "GG", GHA: "GH", GIB: "GI", GIN: "GN", GLP: "GP", GMB: "GM", GNB: "GW", GNQ: "GQ", GRC: "GR",
  GRD: "GD", GRL: "GL", GTM: "GT", GUF: "GF", GUM: "GU", GUY: "GY", HKG: "HK", HMD: "HM", HND: "HN", HRV: "HR",
  HTI: "HT", HUN: "HU", IDN: "ID", IMN: "IM", IND: "IN", IOT: "IO", IRL: "IE", IRN: "IR", IRQ: "IQ", ISL: "IS",
  ISR: "IL", ITA: "IT", JAM: "JM", JEY: "JE", JOR: "JO", JPN: "JP", KAZ: "KZ", KEN: "KE", KGZ: "KG", KHM: "KH",
  KIR: "KI", KNA: "KN", KOR: "KR", KWT: "KW", LAO: "LA", LBN: "LB", LBR: "LR", LBY: "LY", LCA: "LC", LIE: "LI",
  LKA: "LK", LSO: "LS", LTU: "LT", LUX: "LU", LVA: "LV", MAC: "MO", MAF: "MF", MAR: "MA", MCO: "MC", MDA: "MD",
  MDG: "MG", MDV: "MV", MEX: "MX", MHL: "MH", MKD: "MK", MLI: "ML", MLT: "MT", MMR: "MM", MNE: "ME", MNG: "MN",
  MNP: "MP", MOZ: "MZ", MRT: "MR", MSR: "MS", MTQ: "MQ", MUS: "MU", MWI: "MW", MYS: "MY", MYT: "YT", NAM: "NA",
  NCL: "NC", NER: "NE", NFK: "NF", NGA: "NG", NIC: "NI", NIU: "NU", NLD: "NL", NOR: "NO", NPL: "NP", NRU: "NR",
  NZL: "NZ", OMN: "OM", PAK: "PK", PAN: "PA", PCN: "PN", PER: "PE", PHL: "PH", PLW: "PW", PNG: "PG", POL: "PL",
  PRI: "PR", PRK: "KP", PRT: "PT", PRY: "PY", PSE: "PS", PYF: "PF", QAT: "QA", REU: "RE", ROU: "RO", RUS: "RU",
  RWA: "RW", SAU: "SA", SDN: "SD", SEN: "SN", SGP: "SG", SGS: "GS", SHN: "SH", SJM: "SJ", SLB: "SB", SLE: "SL",
  SLV: "SV", SMR: "SM", SOM: "SO", SPM: "PM", SRB: "RS", SSD: "SS", STP: "ST", SUR: "SR", SVK: "SK", SVN: "SI",
  SWE: "SE", SWZ: "SZ", SXM: "SX", SYC: "SC", SYR: "SY", TCA: "TC", TCD: "TD", TGO: "TG", THA: "TH", TJK: "TJ",
  TKL: "TK", TKM: "TM", TLS: "TL", TON: "TO", TTO: "TT", TUN: "TN", TUR: "TR", TUV: "TV", TWN: "TW", TZA: "TZ",
  UGA: "UG", UKR: "UA", UMI: "UM", URY: "UY", USA: "US", UZB: "UZ", VAT: "VA", VCT: "VC", VEN: "VE", VGB: "VG",
  VIR: "VI", VNM: "VN", VUT: "VU", WLF: "WF", WSM: "WS", YEM: "YE", ZAF: "ZA", ZMB: "ZM", ZWE: "ZW",
  // Kosovo: not in ISO 3166-1; the World Bank's trade tables (WITS) write
  // it XKX, and browsers know XK.
  XKX: "XK",
};

export const alpha2Of = (iso3) => ALPHA2[String(iso3 || "").toUpperCase()] || null;

// One name-giver per language, made when first asked for (null where the
// browser has none).
const namers = new Map();
function namerFor(locale) {
  if (!namers.has(locale)) {
    let namer = null;
    try {
      if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") namer = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    } catch {
      namer = null;
    }
    namers.set(locale, namer);
  }
  return namers.get(locale);
}

// The country's name in the language of `locale` ("uk-UA", "zh-CN"), or
// `english` (the name the data has) in English, for an unknown code, or
// where the browser cannot say.
export function regionName(iso3, english, locale) {
  const fallback = english || iso3 || "";
  if (!locale || /^en(-|$)/i.test(locale)) return fallback;
  const a2 = alpha2Of(iso3);
  if (!a2) return fallback;
  const namer = namerFor(locale);
  if (!namer) return fallback;
  try {
    return namer.of(a2) || fallback;
  } catch {
    return fallback;
  }
}
