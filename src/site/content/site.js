// WHAT THIS FILE DOES
// The facts and words the public website (src/site/) repeats in more than
// one place: the menu, the links, and every number the pages quote. A
// number lives here once, with where it comes from, so a page never
// invents one and a change here changes every page.
//
// WHO EDITS IT
// Whoever updates the website's figures. Keep each number's source note.

// The website's four tabs, in order. The two actions (Demo, Register) are
// added by the menu itself.
export const SITE_PAGES = [
  { path: "/", label: "About" },
  { path: "/story", label: "Story" },
  { path: "/method", label: "Methodology" },
  { path: "/contact", label: "Contact" },
];

// The two actions in the menu bar and in the footer.
export const SITE_ACTIONS = {
  demo: { path: "/demo", label: "Demo" },
  register: { path: "/register", label: "Register" },
  signin: { path: "/signin", label: "Sign in" },
};

export const SITE = {
  name: "Chernozem",
  tagline: "Satellite farmland monitoring.",
  description:
    "Chernozem reads free satellite data over farmland and says what changed: Field for a farmer's own fields, Atlas for governments, NGOs and corporations ranking whole regions.",
  appPath: "/field",
  atlasPath: "/atlas",
  demoPath: "/demo",
  registerPath: "/register",
  madeIn: "Pasadena, California",
  year: 2026,
};

// Where the contact page's messages go (the server e-mails each one there,
// server/mail.js), and the address the page shows.
export const CONTACT_EMAIL = "chernozem.app@gmail.com";

export const LINKS = {
  github: "https://github.com/willpan0921/Chernozem-APP",
  paper: "https://doi.org/10.7910/DVN/IYXPVS",
  paperTitle:
    "Restoring Ukraine's Agricultural Lifeline: A Gated Aggregation Algorithm for Chernozem Rehabilitation under Wartime and Postwar Conditions",
  earthEngine: "https://earthengine.google.com/",
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
  // npm test on the website branch, the last full run (the date beside the
  // count), every test passing. The Methodology page prints it rounded down
  // to the hundred ("More than 1,200"), so it stays true while tests are
  // added; set the new count here after a merge.
  automatedTests: 1323, // npm test on the website branch, 2026-11-06 (the languages): 1,323 of 1,323 passed
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
  surveyedHa: 2370000, // farmland the FAO surveyed from satellite; it found over a million shell craters there
  peopleFedMillions: 400, // people a year fed by Ukraine's food exports before the war
  // The wider need.
  armedConflicts: 130, // armed conflicts in the world, about
  farmsMillions: 570, // farms in the world
  // The About page's disclaimer.
  testAccuracyPercent: 90, // the owner's own test (stated 2026-11-03: "roughly 90% accurate")
};

// Field's method, as the Methodology page quotes it and its condition
// laboratory works it out (components/ConditionLab.jsx). The rules live in
// the app's own files, named beside each value. The website does not import
// them: importing them into a page made the build split the app's code
// into extra pieces that every page then loads (about 3 kB more, gzipped,
// on a first visit to any page; npm run build, 3 November 2026). So each
// value is kept here, and site-pages.test.js checks it against its source:
// a change to the method fails the tests until it is made here too.
export const FIELD_METHOD = {
  // Clouds and the normal years (src/lib/field/method.js).
  baseline: { from: 2019, to: 2021, label: "2019 to 2021" }, // BASELINE
  clearPixelScore: 0.6, // CLEAR_PIXEL_SCORE: a pixel is clear at this Cloud Score+ or more
  minClearShare: 0.5, // MIN_CLEAR_SHARE: a pass counts when this share of the field is clear
  latestDays: 30, // a reading: the median of the clear pixels of the last 30 days (server/providers/field-gee.js LATEST_DAYS)
  // Stress (method.js STRESS_RULES, RED_EDGE_RULES and stressLevel).
  stressNdvi: { belowFieldMedian: 0.1, belowNormal: 0.08 },
  stressRedEdge: { belowFieldMedian: 0.06, belowNormal: 0.05 },
  redEdgeLead: "one to two weeks", // how much sooner the red edge (NDRE) shows chlorophyll loss than NDVI (method.js, the readings)
  stressHighShare: 0.15, // stress is "high" from this share of the field
  // Harvest timing: ready when NDVI is back down to
  // bareNdvi + share x (peak - bareNdvi) (method.js harvestStage).
  bareNdvi: 0.2, // BARE_NDVI
  readyShare: { cereals: 0.25, rowCrops: 0.35 }, // crops.js CROP_PROFILES: cereals and rapeseed; corn, soybean and sunflower
  // The condition (method.js CONDITION_WEIGHTS, HEALTH_SPAN, WATER_SPAN,
  // CONDITION_CLASSES, fieldCondition).
  weights: { plantHealth: 0.5, water: 0.3, noStress: 0.2 },
  healthSpan: 0.3, // NDVI this far below normal scores 0
  waterSpan: 0.25, // NDWI this far below normal scores 0
  classes: [
    { id: "poor", label: "Poor", upTo: 0.4 },
    { id: "fair", label: "Fair", upTo: 0.65 },
    { id: "good", label: "Good", upTo: 0.85 },
    { id: "great", label: "Very good", upTo: Infinity },
  ],
  stressedMax: 0.84, // STRESSED_CONDITION_MAX: high stress is never "Very good"
  damagedMax: 0.64, // DAMAGED_CONDITION_MAX: a damaged field is never above "Fair"
  // Finding the fields (server/providers/field-gee.js detectFields).
  edgePictures: 6, // the Sentinel-2 composites edges are traced in: early, middle and late thirds of the last two seasons (src/lib/season.js detectionWindows)
  minFieldHa: 1.5, // the smallest field offered (DETECT.minHa)
  outlineIou: 0.805, // mean overlap (IoU) of the outlines found with ones drawn by hand, demo farm near Kupiansk, 2026-10-19 (docs/METHODS.md, "Finding the fields")
  // Damage.
  radarChangeDb: 3, // RADAR_CHANGE_DB
  radarSeasons: 2, // the change counts when found in at least this many growing seasons (one, while only one is measured; src/lib/atlas/method.js HEAVY_DAMAGE.persistSeasons; field-gee.js radarChangeImage)
  damageRadarShare: 0.1, // in a war, radar change on this share of a field is damage on its own (DAMAGE_RULES.radarShare)
};

// The demo: the owner's own Ukraine workspace, open to everyone and
// read-only (anyone can look; only the owner can change it). The farm's
// number of fields is not kept here on purpose: the live farm changes
// (13 fields on 31 October 2026, 12 in the screenshots), so the pages say
// "a farm near Kupiansk" and never print a count.
export const DEMO = {
  place: "Kupiansk, Kharkiv region, Ukraine",
  // Field 11's latest reading (the demo farm's saved analysis, pass of 26 October 2026):
  // plant health 0.79 (above normal), stress 0.1 ha (under 1%), water 0.24 (near normal),
  // harvest: past peak, greenest 0.90 on 29 June; the crop is unknown to the app, so no date.
  field11: { name: "Field 11", crop: "Rapeseed", plantHealth: 0.79, stress: "under 1%", water: "near normal", latestPass: "26 October 2026", peakDate: "29 June" },
  passesSinceMarch: 50, // field-data
};

// The two doors into the demo, on the Demo page (/demo) and on the owner's
// page (/owner): each product's computer screen and its phone screen. The
// computer screen is the half-size copy (-960) shown at its own size, so
// the door shows one readable piece of it ("position" picks the piece);
// the phone screen is shown whole, and on a phone it is the only picture.
export const DEMO_DOORS = [
  {
    key: "field",
    to: SITE.appPath,
    label: "Open Field",
    caption: "Field: the demo farm near Kupiansk",
    // Field 11's readings, at the right of the screen: the door shows the
    // screen's right-hand part, and never starts right of the cards (645px
    // into the half-size screen) when the door is narrow.
    wide: { src: "/site/shots/field-fields-detail-960.webp", width: 960, height: 684, position: "max(100%, -645px) 0" },
    phone: { src: "/site/shots/phone-field-overview.webp", width: 780, height: 1688 },
  },
  {
    key: "atlas",
    to: SITE.atlasPath,
    label: "Open Atlas",
    caption: "Atlas: Ukraine, September 2026",
    // The weights beside the map of Ukraine (from the panel's left edge,
    // 124px into the half-size screen).
    wide: { src: "/site/shots/atlas-map-near-micro-960.webp", width: 960, height: 600, position: "-124px 0" },
    phone: { src: "/site/shots/phone-atlas-overview.webp", width: 780, height: 1688 },
  },
];

// Where the globe's live markers come from.
export const WORLD_SOURCES = [
  { name: "GDACS", url: "https://www.gdacs.org/", what: "Floods, droughts, wildfires, storms, earthquakes and volcanoes, as they happen." },
  { name: "Reviewed list", url: "/method#technology", what: "Armed conflicts, reviewed by hand (there is no free live feed of wars)." },
  { name: "WITS", url: "https://wits.worldbank.org/", what: "Who buys whose food: agricultural trade by country (World Bank WITS, the latest year each country reported)." },
];

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

// The pages' titles in the browser tab. The page passes its part already in
// the website's language; t (src/site/i18n/) translates the default.
// i18n namespace: common
export function pageTitle(sub, t = (text) => text) {
  return sub ? `${sub} · Chernozem` : t("Chernozem, satellite farmland monitoring");
}

// Numbers are written the way the website's language writes them: 1,780,400
// in English and Chinese, 1 780 400 in Ukrainian. The language provider
// (src/site/i18n/i18n.js) sets the locale; outside the website it is
// English.
let numberLocale = "en-US";
export function setNumberLocale(locale) {
  numberLocale = locale || "en-US";
}

export function formatInt(n, locale = numberLocale) {
  return new Intl.NumberFormat(locale).format(n);
}

// A number with a fixed count of decimals, written with the language's
// decimal mark: formatFixed(0.4, 2) is "0.40" in English and Chinese,
// "0,40" in Ukrainian. The Methodology page's formulas and its two
// laboratories use it, so a page never mixes the two marks.
export function formatFixed(n, digits, locale = numberLocale) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

// 1780400 -> "1.78M", 12151 -> "12,151" (in Ukrainian "1,78 млн", in Chinese "178万")
export function compactHa(n, locale = numberLocale) {
  if (n >= 1e6) {
    if (locale.startsWith("en")) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
    return new Intl.NumberFormat(locale, { notation: "compact", maximumSignificantDigits: 3 }).format(n);
  }
  return formatInt(n, locale);
}
