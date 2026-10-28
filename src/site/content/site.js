// WHAT THIS FILE DOES
// The facts and words the public website (src/site/) repeats in more than
// one place: the menu, the links, and every number the pages quote. A
// number lives here once, with where it comes from, so a page never
// invents one and a change here changes every page.
//
// WHO EDITS IT
// Whoever updates the website's figures. Keep each number's source note.

// The website's menu, in order. "Open the app" is added by the menu itself.
export const SITE_PAGES = [
  { path: "/story", label: "Story" },
  { path: "/product", label: "Product" },
  { path: "/guide", label: "How to use" },
  { path: "/method", label: "Method" },
  { path: "/technology", label: "Technology" },
  { path: "/design", label: "Design" },
  { path: "/contact", label: "Contact" },
];

export const SITE = {
  name: "Chernozem",
  tagline: "From a pin to an atlas.",
  description:
    "Chernozem turns free satellite data into clear answers about farmland after war and disaster, anywhere in the world.",
  appPath: "/field",
  atlasPath: "/atlas",
  madeIn: "Pasadena, California",
  year: 2026,
};

export const LINKS = {
  github: "https://github.com/willpan0921/Chernozem-APP",
  paper: "https://doi.org/10.7910/DVN/IYXPVS",
  paperTitle:
    "Restoring Ukraine's Agricultural Lifeline: A Gated Aggregation Algorithm for Chernozem Rehabilitation under Wartime and Postwar Conditions",
  earthEngine: "https://earthengine.google.com/",
  cac: "https://www.congressionalappchallenge.us/",
};

// Every number the website quotes, with its source.
export const NUMBERS = {
  // The live Ukraine area (Atlas, September 2026 run, 1,176 squares).
  ukraineSquares: 1176,
  ukraineMonth: "September 2026",
  heavyDamageHa: 1780400, // run totals.heavyDamageHa
  peopleOnDamagedSoil: 1204041, // run totals.peopleOnDamagedSoil
  ukraineMonthMinutes: "3 to 4", // one full month of Ukraine on Earth Engine
  tenFieldsSeconds: 20, // analysing a ten-field farm (docs/METHODS.md)
  // Checks against independent records (docs and the owner's statistics).
  // Statistics: scratchpad stats/reliability.py, 2026-10-26 (the owner's
  // reliability study), against the USDA Cropland Data Layer and Copernicus.
  cropAccuracyPercent: 94, // Iowa, 164 of 174 fields (the calibration set, so optimistic)
  cropIowaFields: 174,
  cropLikelyPercent: 93.5, // held-out North Dakota, when the app says "likely" (72 of 77)
  cropHeldOutPercent: 71.8, // held-out North Dakota, all six crops (176 of 245)
  greeceFloodHa: 12151, // Thessaly flood, Greece, Sep 2023, the app
  greeceFloodOfficial: "12,600 to 15,000", // Copernicus EMSR692 (13,800 central)
  bulgariaFireHa: 8388, // Yambol wildfire, Bulgaria, Jul 2024, the app
  bulgariaFireOfficial: 7703, // Copernicus EMSR738
  pakistanFloodHa: 13554, // Punjab flood, Pakistan, Aug 2025, the app (reads low)
  pakistanFloodOfficial: 16500, // Copernicus EMSR838
  mapePercent: 12.9, // mean absolute error in area against the three Copernicus maps
  mapeInterval: "1.6 to 24.2", // its 95% interval (n = 3)
  falseAlarmPercent: 1.1, // cropland wrongly flagged in the same places in a normal year, worst case
  falseAlarmMeanPercent: 0.33, // the same, on average
  analysesOk: 98, // monthly analyses that completed, of 98 since the fixes
  automatedTests: 888, // npm test on main, 2026-10-27
  // The research paper (Harvard Dataverse).
  paperOperators: 10, // aggregation operators compared on identical inputs
  paperOblasts: 24, // first-level units ranked
  paperHighDamageHa: 2230000, // chernozem above the 90th damage percentile
  acledEvents: 109636, // explosion and remote-violence events, validation slice
  acledCorrelation: 0.8, // Spearman rho, radar disturbance vs conflict density
  harvestCorrelation: -0.8, // Pearson r, damage vs crop production change
  gatePercentile: 30, // tau: the least feasible share left out in Near term
  rampWidth: 0.2, // w
  postWeights: { value: 0.3, damage: 0.4, feasibility: 0.3 },
  postExponent: 0.5, // r of the weighted power mean
  // Black soil in the world (FAO, Global status of black soils, 2022).
  blackSoilCroplandPercent: 17,
  blackSoilWheatPercent: 30,
  // The war on the land (FAO, 2025).
  cratersHa: 2370000,
  peopleFedMillions: 400, // people a year fed by Ukraine's food exports before the war
  // The wider need.
  armedConflicts: 130, // armed conflicts in the world, about
  farmsMillions: 570, // farms in the world
};

// What the app reads, in the order the website lists them.
export const DATASETS = [
  { name: "Sentinel-1", org: "ESA Copernicus", role: "Radar", what: "Lasting change in the ground itself, seen through clouds and at night." },
  { name: "Sentinel-2", org: "ESA Copernicus", role: "Optical", what: "Plant health, water, bare soil and burn scars at 10 m." },
  { name: "FIRMS", org: "NASA", role: "Active fire", what: "Fires detected every day, compared with each place's normal years." },
  { name: "VIIRS and MODIS burned area", org: "NASA", role: "Burn scars", what: "Where a wildfire actually burned." },
  { name: "WorldCover", org: "ESA", role: "Land cover", what: "Where the cropland is, at 10 m." },
  { name: "OpenLandMap soil", org: "USDA taxonomy", role: "Soil type", what: "Which soil is black soil, and what the rest is." },
  { name: "SoilGrids", org: "ISRIC", role: "Soil carbon", what: "The organic carbon that makes black soil black." },
  { name: "WorldPop", org: "WorldPop", role: "People", what: "How many people live on the damaged land." },
  { name: "VIIRS night lights", org: "NASA", role: "Activity", what: "Whether an area has gone dark." },
  { name: "GAUL", org: "FAO", role: "Borders", what: "States, provinces, oblasts and districts, with their names." },
  { name: "Global Surface Water", org: "JRC", role: "Water", what: "Permanent water, so a lake is never counted as a flood." },
  { name: "MERIT Hydro", org: "", role: "Terrain", what: "Where water can and cannot pool." },
  { name: "ERA5-Land", org: "ECMWF", role: "Weather history", what: "Snow and frost, so a frozen field is not read as flooded." },
  { name: "Open-Meteo", org: "", role: "Forecast", what: "Local weather for pest and disease risk." },
  { name: "ACLED", org: "", role: "Fighting", what: "Recorded battles, when a file is provided; otherwise fires that look like fighting." },
];

export const STACK = [
  { name: "React 19", what: "The interface, as one page that never reloads." },
  { name: "Node.js", what: "The server: analyses, the monthly schedule, the data store." },
  { name: "Google Earth Engine", what: "Where the satellite maths runs, over petabytes, server-side." },
  { name: "Leaflet", what: "The maps, over Esri World Imagery." },
  { name: "Claude", what: "The AI assistant, answering only from the user's own data." },
  { name: "Vite", what: "Builds the app into a few small files." },
];

// The pages' titles in the browser tab.
export function pageTitle(sub) {
  return sub ? `${sub} · Chernozem` : "Chernozem — from a pin to an atlas";
}

export function formatInt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

// 1780400 -> "1.78M", 12151 -> "12,151"
export function compactHa(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  return formatInt(n);
}
