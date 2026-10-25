// WHAT THIS FILE DOES
// Plain names for the soil classes of the Atlas's soil map (OpenLandMap
// USDA great groups, OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01, the
// map the black-soil share comes from: server/providers/gee.js BLACK_SOIL).
// A great group's name ends in its USDA soil order ("Hapludolls" -> ...olls
// -> Mollisols) and, just before that, its suborder ("Udolls"). This file
// turns that into everyday words with the WRB name officials know:
//
//   soilName("Hapludolls")
//     -> { name: "Black soil (chernozem type: Mollisol, Udolls)",
//          short: "Black soil (chernozem type)", order: "Mollisols",
//          suborder: "Udolls", wrb: "Chernozem, Kastanozem or Phaeozem",
//          blackSoil: true, greatGroup: "Hapludolls" }
//   soilName("Haplustolls").name -> "Steppe black soil (chernozem type: Mollisol, Ustolls)"
//   soilName("Hapludalfs").name  -> "Grey forest soil (luvisol type: Alfisol)"
//
//   soilMix(histogram, classes)  the top soils of a square or a state from
//                                its pixel counts (soil.js)
//
// "blackSoil" follows the black-soil rule of the map's black-soil share
// exactly (server/providers/gee.js BLACK_SOIL: Mollisols except the cold
// and bleached ones; copied below so the server does not load the Earth
// Engine code before it is needed, and checked against it in the tests),
// so a square never reads "Black soil" for a class its black-soil hectares
// do not count.
//
// WHO EDITS IT
// Whoever changes how soils are named. Tested in soil-names.test.js.

// The same as server/providers/gee.js BLACK_SOIL.keep / .drop.
export const BLACK_SOIL_RULE = { keep: /olls$/i, drop: /cryolls$|albolls$|cryoborolls$|^cryaquolls$/i };

// The USDA soil orders, by the ending of their great groups, with their
// suborders' endings (newest names first, then the older ones the map
// still uses: Borolls, Boralfs, Orthids, Ochrepts...). Checked in this
// order: "andepts" (old volcanic Inceptisols) before "epts".
export const SOIL_ORDERS = [
  { order: "Mollisols", ending: "olls", suborders: ["alb", "aqu", "rend", "gel", "cry", "xer", "ust", "ud", "bor"] },
  { order: "Alfisols", ending: "alfs", suborders: ["aqu", "cry", "ust", "xer", "ud", "bor"] },
  { order: "Andisols", ending: "ands", suborders: ["aqu", "gel", "cry", "torr", "xer", "vitr", "ust", "ud"] },
  { order: "Andisols", ending: "andepts", suborders: [""], suborderName: "Andepts" },
  { order: "Aridisols", ending: "ids", suborders: ["cry", "sal", "dur", "gyps", "arg", "calc", "camb", "orth"] },
  { order: "Entisols", ending: "ents", suborders: ["wass", "aqu", "ar", "psamm", "fluv", "orth"] },
  { order: "Histosols", ending: "ists", suborders: ["wass", "fol", "fibr", "sapr", "hem"] },
  { order: "Inceptisols", ending: "epts", suborders: ["aqu", "anthr", "gel", "cry", "ust", "xer", "ud", "ochr", "umbr", "trop"] },
  { order: "Spodosols", ending: "ods", suborders: ["aqu", "gel", "cry", "hum", "orth"] },
  { order: "Ultisols", ending: "ults", suborders: ["aqu", "hum", "ud", "ust", "xer"] },
  { order: "Vertisols", ending: "erts", suborders: ["aqu", "cry", "xer", "torr", "ust", "ud"] },
  { order: "Oxisols", ending: "ox", suborders: ["aqu", "torr", "ust", "per", "ud"] },
  { order: "Gelisols", ending: "els", suborders: ["hist", "turb", "orth"] },
];

// Each order in everyday words: the name, a short form for one-line
// summaries, and its WRB equivalent.
export const ORDER_WORDS = {
  Mollisols: { name: "Black soil (chernozem type: Mollisol, {suborder})", short: "Black soil (chernozem type)", wrb: "Chernozem, Kastanozem or Phaeozem" },
  Alfisols: { name: "Grey forest soil (luvisol type: Alfisol)", short: "Grey forest soil", wrb: "Luvisol" },
  Vertisols: { name: "Cracking clay (vertisol)", short: "Cracking clay", wrb: "Vertisol" },
  Inceptisols: { name: "Young soil (Inceptisol)", short: "Young soil", wrb: "Cambisol" },
  Spodosols: { name: "Sandy podzol (Spodosol)", short: "Sandy podzol", wrb: "Podzol" },
  Histosols: { name: "Peat (Histosol)", short: "Peat", wrb: "Histosol" },
  Aridisols: { name: "Desert soil (Aridisol)", short: "Desert soil", wrb: "Calcisol, Gypsisol or Solonchak" },
  Oxisols: { name: "Red tropical soil (Oxisol/Ultisol)", short: "Red tropical soil", wrb: "Ferralsol" },
  Ultisols: { name: "Red tropical soil (Oxisol/Ultisol)", short: "Red tropical soil", wrb: "Acrisol" },
  Andisols: { name: "Volcanic soil (Andisol)", short: "Volcanic soil", wrb: "Andosol" },
  Gelisols: { name: "Permafrost soil (Gelisol)", short: "Permafrost soil", wrb: "Cryosol" },
  Entisols: { name: "Young alluvial or sandy soil (Entisol)", short: "Young alluvial or sandy soil", wrb: "Fluvisol, Arenosol or Regosol" },
};

// The black-soil Mollisols by suborder, so a square with several of them
// tells them apart (real data, Kharkiv oblast: Aquolls 51%, Udolls 29%,
// Ustolls 8%). Udolls keep the plain "Black soil".
export const MOLLISOL_WORDS = {
  Udolls: { words: "Black soil", type: "chernozem type" },
  Ustolls: { words: "Steppe black soil", type: "chernozem type" },
  Aquolls: { words: "Wet dark soil", type: "meadow black soil" },
  Xerolls: { words: "Dry-summer black soil", type: "chernozem type" },
  Borolls: { words: "Cool black soil", type: "chernozem type" },
  Gelolls: { words: "Frozen black soil", type: "chernozem type" },
  Rendolls: { words: "Black soil on limestone", type: "rendzina type" },
};

// The Mollisols the black-soil share leaves out, in their own words.
const COLD_DARK = { name: "Cold dark soil (Mollisol, {suborder})", short: "Cold dark soil", wrb: "Chernozem or Phaeozem of cold climates" };
const BLEACHED_DARK = { name: "Bleached dark soil (Mollisol, {suborder})", short: "Bleached dark soil", wrb: "Planosol or Albic Phaeozem" };

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// The plain name of one great group (as the map's class list writes it).
// A name the rule does not know comes back as itself, with no order.
export function soilName(greatGroup) {
  const exact = String(greatGroup ?? "").trim();
  const lower = exact.toLowerCase();
  if (!lower || lower === "nodata") return null;
  const found = SOIL_ORDERS.find((entry) => lower.endsWith(entry.ending) && lower.length > entry.ending.length);
  if (!found) return { name: exact, short: exact, order: null, suborder: null, wrb: null, blackSoil: false, greatGroup: exact };
  const element = found.suborders.filter((part) => lower.endsWith(part + found.ending)).sort((a, b) => b.length - a.length)[0];
  const suborder = found.suborderName || (element !== undefined ? capital(element + found.ending) : null);
  const blackSoil = BLACK_SOIL_RULE.keep.test(exact) && !BLACK_SOIL_RULE.drop.test(exact);
  let words = ORDER_WORDS[found.order];
  if (found.order === "Mollisols" && !blackSoil) words = /albolls$/i.test(exact) ? BLEACHED_DARK : COLD_DARK;
  else if (found.order === "Mollisols" && MOLLISOL_WORDS[suborder]) {
    const { words: plain, type } = MOLLISOL_WORDS[suborder];
    words = { ...words, name: `${plain} (${type}: Mollisol, {suborder})`, short: `${plain} (${type})` };
  }
  const fill = (text) => (suborder ? text.replace("{suborder}", suborder) : text.replace(", {suborder}", ""));
  return { name: fill(words.name), short: words.short, order: found.order, suborder, wrb: words.wrb, blackSoil, greatGroup: exact };
}

// The share of a square's (or a state's) land in each soil, from the
// soil map's pixel counts.
//   histogram  { cropland: { "<value>": count }, all: { ... } }
//              (gee.js soilHistogram)
//   classes    [{ value, name }] the map's class list (when it could not be
//              read, the built-in list below is used)
// The shares are of the cropland when the square has enough of it
// (MIN_CROPLAND: at least 4 pixels of 250 m and 2% of the square), else
// of the whole square. Great groups with the same plain name are counted
// together (Hapludolls and Argiudolls are both "Black soil ... Udolls"),
// biggest first, and the first `top` that hold at least 1% are listed
// with their great groups (the first one always).
// Gives back { over: "cropland" | "all", pixels, top: [{ name, short,
// share, order, suborder, wrb, blackSoil, greatGroups: [{ value, name,
// share }] }], otherShare, blackSoilShare, summary } where summary reads
// "Black soil (chernozem type) 78% · Grey forest soil 15% · Young soil 5%".
// No pixels at all (sea, a lake, outside the map): top [], over null.
export const MIN_CROPLAND = { pixels: 4, share: 0.02 };

export function soilMix(histogram, classes = [], { top = 3 } = {}) {
  const clean = (part) =>
    Object.entries(part || {})
      .map(([value, count]) => [Number(value), Number(count)])
      .filter(([value, count]) => Number.isFinite(value) && value > 0 && Number.isFinite(count) && count > 0);
  const crop = clean(histogram?.cropland);
  const all = clean(histogram?.all);
  const sum = (rows) => rows.reduce((total, [, count]) => total + count, 0);
  const allPixels = sum(all);
  const cropPixels = sum(crop);
  const useCrop = cropPixels >= MIN_CROPLAND.pixels && cropPixels >= MIN_CROPLAND.share * allPixels;
  const rows = useCrop ? crop : all;
  const pixels = useCrop ? cropPixels : allPixels;
  if (!(pixels > 0)) return { over: null, pixels: 0, top: [], otherShare: 0, blackSoilShare: 0, summary: "" };
  const known = new Map([...BUILT_IN_CLASSES, ...(classes || []).filter((c) => Number.isFinite(c?.value) && c.name).map((c) => [c.value, String(c.name)])]);
  const groups = new Map();
  let blackSoil = 0;
  for (const [value, count] of rows) {
    const greatGroup = known.get(value);
    const plain = soilName(greatGroup) || { name: `Soil class ${value}`, short: `Soil class ${value}`, order: null, suborder: null, wrb: null, blackSoil: false, greatGroup: null };
    if (plain.blackSoil) blackSoil += count;
    const group = groups.get(plain.name) || { ...plain, count: 0, greatGroups: [] };
    group.count += count;
    group.greatGroups.push({ value, name: greatGroup || `Class ${value}`, count });
    groups.set(plain.name, group);
  }
  const share = (count) => Math.round((count / pixels) * 1000) / 1000;
  const ordered = [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const shown = ordered.slice(0, top).filter((group, i) => i === 0 || group.count / pixels >= 0.01);
  const listed = shown.map(({ greatGroup, count, greatGroups, ...group }) => ({
    ...group,
    share: share(count),
    // Its great groups, biggest first (those under 0.5% left out, never the first).
    greatGroups: greatGroups
      .sort((a, b) => b.count - a.count)
      .filter((g, i) => i === 0 || g.count / pixels >= 0.005)
      .map((g) => ({ value: g.value, name: g.name, share: share(g.count) })),
  }));
  const rest = ordered.slice(shown.length).reduce((total, group) => total + group.count, 0);
  const percent = (value) => `${Math.round(value * 100)}%`;
  return {
    over: useCrop ? "cropland" : "all",
    pixels: Math.round(pixels * 10) / 10,
    top: listed,
    otherShare: share(rest),
    blackSoilShare: share(blackSoil),
    summary: listed.map((group) => `${group.short} ${percent(group.share)}`).join(" · "),
  };
}

// The map's class list (grtgroup_class_values / grtgroup_class_names, read
// from Earth Engine on 2026-10-25), for when it cannot be read. Value 0 is
// NODATA.
const BUILT_IN_LIST =
  "1 Albaqualfs,2 Cryaqualfs,4 Durixeralfs,6 Endoaqualfs,7 Epiaqualfs,9 Fragiaqualfs,10 Fragiudalfs,11 Fragixeralfs,12 Fraglossudalfs,13 Glossaqualfs,14 Glossocryalfs,15 Glossudalfs,16 Haplocryalfs,17 Haploxeralfs,18 Hapludalfs,19 Haplustalfs,25 Natraqualfs,26 Natrixeralfs,27 Natrudalfs,28 Natrustalfs,29 Palecryalfs,30 Paleudalfs,31 Paleustalfs,32 Palexeralfs,38 Rhodustalfs,39 Vermaqualfs,41 Eutroboralfs,42 Ochraqualfs,43 Glossoboralfs,44 Cryoboralfs,45 Natriboralfs,46 Paleboralfs," +
  "50 Cryaquands,58 Fulvicryands,59 Fulvudands,61 Haplocryands,63 Haploxerands,64 Hapludands,74 Udivitrands,75 Ustivitrands,76 Vitraquands,77 Vitricryands,80 Vitrixerands," +
  "82 Aquicambids,83 Aquisalids,85 Argidurids,86 Argigypsids,87 Calciargids,89 Calcigypsids,90 Gypsiargids,92 Haplargids,93 Haplocalcids,94 Haplocambids,96 Haplodurids,97 Haplogypsids,98 Haplosalids,99 Natrargids,100 Natridurids,101 Natrigypsids,102 Paleargids,103 Petroargids,104 Petrocalcids,105 Petrocambids,107 Petrogypsids,110 Calciorthids,111 Camborthids,112 Paleorthids,113 Durorthids,114 Durargids,115 Gypsiorthids,116 Nadurargids," +
  "118 Cryaquents,119 Cryofluvents,120 Cryopsamments,121 Cryorthents,122 Endoaquents,123 Epiaquents,124 Fluvaquents,126 Frasiwassents,131 Hydraquents,133 Psammaquents,134 Psammowassents,135 Quartzipsamments,136 Sulfaquents,137 Sulfiwassents,138 Torrifluvents,139 Torriorthents,140 Torripsamments,141 Udifluvents,142 Udipsamments,143 Udorthents,144 Ustifluvents,145 Ustipsamments,146 Ustorthents,147 Xerofluvents,148 Xeropsamments,149 Xerorthents,153 Udarents,154 Torriarents,155 Xerarents," +
  "179 Cryofibrists,180 Cryofolists,181 Cryohemists,182 Cryosaprists,183 Frasiwassists,184 Haplofibrists,185 Haplohemists,186 Haplosaprists,189 Sphagnofibrists,190 Sulfihemists,191 Sulfisaprists,196 Udifolists,201 Borosaprists,202 Medisaprists,203 Borohemists," +
  "206 Calcicryepts,207 Calciustepts,208 Calcixerepts,209 Cryaquepts,210 Durixerepts,212 Durustepts,213 Dystrocryepts,215 Dystroxerepts,216 Dystrudepts,217 Dystrustepts,218 Endoaquepts,219 Epiaquepts,220 Eutrudepts,221 Fragiaquepts,222 Fragiudepts,225 Halaquepts,226 Haplocryepts,228 Haploxerepts,229 Haplustepts,230 Humaquepts,231 Humicryepts,233 Humixerepts,234 Humudepts,235 Humustepts,245 Ustochrepts,246 Eutrochrepts,247 Dystrochrepts,248 Eutrocryepts,249 Haplaquepts,250 Xerochrepts,251 Cryochrepts,252 Fragiochrepts,253 Haplumbrepts,254 Cryumbrepts,255 Dystropepts,256 Vitrandepts," +
  "268 Argialbolls,269 Argiaquolls,270 Argicryolls,271 Argiudolls,272 Argiustolls,273 Argixerolls,274 Calciaquolls,275 Calcicryolls,276 Calciudolls,277 Calciustolls,278 Calcixerolls,279 Cryaquolls,280 Cryrendolls,283 Durixerolls,284 Durustolls,285 Endoaquolls,286 Epiaquolls,287 Haplocryolls,289 Haploxerolls,290 Hapludolls,291 Haplustolls,292 Haprendolls,294 Natraquolls,296 Natrixerolls,297 Natrudolls,298 Natrustolls,299 Palecryolls,300 Paleudolls,301 Paleustolls,302 Palexerolls,303 Vermudolls,306 Haploborolls,307 Argiborolls,308 Haplaquolls,309 Cryoborolls,310 Natriborolls,311 Calciborolls,312 Paleborolls," +
  "342 Alaquods,343 Alorthods,345 Duraquods,348 Durorthods,349 Endoaquods,350 Epiaquods,351 Fragiaquods,353 Fragiorthods,354 Haplocryods,356 Haplohumods,357 Haplorthods,358 Humicryods,367 Haplaquods,368 Cryorthods," +
  "370 Albaquults,371 Endoaquults,372 Epiaquults,373 Fragiaquults,374 Fragiudults,375 Haplohumults,376 Haploxerults,377 Hapludults,378 Haplustults,381 Kandiudults,385 Kanhapludults,387 Paleaquults,388 Palehumults,389 Paleudults,390 Paleustults,391 Palexerults,396 Rhodudults,399 Umbraquults,401 Ochraquults," +
  "403 Calciaquerts,405 Calciusterts,406 Calcixererts,409 Dystraquerts,410 Dystruderts,412 Endoaquerts,413 Epiaquerts,414 Gypsitorrerts,415 Gypsiusterts,417 Haplotorrerts,418 Haploxererts,419 Hapluderts,420 Haplusterts,422 Natraquerts,424 Salitorrerts,429 Chromusterts,430 Pellusterts,431 Chromoxererts,432 Pelluderts,433 Torrerts";
export const BUILT_IN_CLASSES = new Map(
  BUILT_IN_LIST.split(",").map((item) => {
    const [value, name] = item.split(" ");
    return [Number(value), name];
  }),
);
