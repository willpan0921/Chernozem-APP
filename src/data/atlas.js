// WHAT THIS FILE DOES
// Every number and sentence the ATLAS product shows (the regional office's
// view of all of Ukraine): the Overview page, the Atlas map with the Kupiansk
// cluster, the Data archive and the Settings page. Page files read from here
// and never type numbers themselves, so changing a value here changes the
// screen.
//
// This is PLACEHOLDER data copied from the design mockups. The team will
// replace it with real data from the research pipeline later. Until then the
// pages look exactly like the mockups.
//
// WHO EDITS IT
// Whoever owns the Atlas numbers and wording. Page builders only read it.
//
// HOW TO EDIT IT
// - Find the export you want (each one has a one-line comment above it).
// - Change the value between the quotes or the number after the colon.
// - Keep the shape the same: do not rename keys, pages look them up by name.
// - Dates have two forms: "date" is a computer date ("2026-09-24") and the
//   text next to it ("Sep 24") is what people see. Change both.
// - Scores and bar values run from 0 to 1. Tiers must be one of:
//   "highest", "high", "medium", "lower", "setAside", "notAnalyzed".
// - Colours are named after the tokens in src/styles/tokens.css, e.g.
//   "scale-4" means var(--c-scale-4). Pages turn the name into the colour.
// - Save the file. The app refreshes by itself.

// ---------------------------------------------------------------------------
// The run and the country
// ---------------------------------------------------------------------------

// The country-level facts shown in the page headers and the sidebar box.
export const atlas = {
  country: "Ukraine",
  regionCount: 24,
  croplandMha: 35.01,
  run: "September 2026",
  runDate: "2026-09-30",
  imagery: "Imagery from April to September 2026, compared with 2019 to 2021",
  baseline: "2019 to 2021",
  eyebrow: "ATLAS · UKRAINE",
  overviewTitle: "Recovery overview",
  reportButton: "Download report (PDF)",
};

// The four big-number tiles on the Overview, plus the footnote line below.
export const kpis = [
  { label: "Black-soil cropland mapped", value: "15.07M ha", note: "", tone: null },
  { label: "Black soil with heavy damage", value: "2.23M ha", note: "", tone: "red" },
  { label: "Of that damage lies in the East", value: "83.7%", note: "", tone: null },
  { label: "People living on damaged black soil", value: "≈84,000", note: "", tone: null },
];

// The small line under the KPI tiles and its link.
export const kpisFootnote = {
  text: "From 35.01M ha of cropland analyzed across all 24 regions.",
  link: "See how it was measured",
};

// ---------------------------------------------------------------------------
// Time frames: Near term vs Postwar
// ---------------------------------------------------------------------------

// The two ways of ranking, for the "Near term | Postwar" switch.
export const timeframes = [
  {
    id: "nearTerm",
    label: "Near term",
    tag: "showing now",
    description:
      "Places with too little safe access, below the 30th percentile, are set aside. The rest are ranked by soil value and damage.",
    whereToStart: "Near term sets aside places with no safe access, so work can begin right away.",
    topTitle: "Top five right now",
  },
  {
    id: "postwar",
    label: "Postwar",
    tag: "",
    description:
      "All three are blended (power mean, r = 0.5), so heavy damage can outweigh lower access once fighting ends.",
    whereToStart:
      "Postwar blends all three scores, so heavily damaged black soil leads once fighting ends.",
    topTitle: "Top five after the war",
  },
];

// ---------------------------------------------------------------------------
// Regions (the tile map on the Overview)
// ---------------------------------------------------------------------------

// All 24 regions plus Crimea, as tiles on a grid. col/row are grid positions
// (0 is the left / top). Each has a tier per time frame and a rank when it
// is in the top five. Tiers: highest, high, medium, lower, setAside,
// notAnalyzed. "dashed" draws the tile with a dotted outline (Crimea).
export const regions = [
  // Row 0
  { code: "VOL", name: "Volyn", col: 1, row: 0, nearTerm: { tier: "lower" }, postwar: { tier: "lower" } },
  { code: "RIV", name: "Rivne", col: 2, row: 0, nearTerm: { tier: "lower" }, postwar: { tier: "lower" } },
  { code: "ZHY", name: "Zhytomyr", col: 3, row: 0, nearTerm: { tier: "medium" }, postwar: { tier: "lower" } },
  { code: "KYI", name: "Kyiv", col: 4, row: 0, nearTerm: { tier: "high" }, postwar: { tier: "medium" } },
  { code: "CHN", name: "Chernihiv", col: 5, row: 0, nearTerm: { tier: "medium" }, postwar: { tier: "medium" } },
  { code: "SUM", name: "Sumy", col: 6, row: 0, nearTerm: { tier: "medium" }, postwar: { tier: "high" } },
  // Row 1
  { code: "LVI", name: "Lviv", col: 0, row: 1, nearTerm: { tier: "lower" }, postwar: { tier: "lower" } },
  { code: "TER", name: "Ternopil", col: 1, row: 1, nearTerm: { tier: "medium" }, postwar: { tier: "lower" } },
  { code: "KHM", name: "Khmelnytskyi", col: 2, row: 1, nearTerm: { tier: "high" }, postwar: { tier: "medium" } },
  { code: "VIN", name: "Vinnytsia", col: 3, row: 1, nearTerm: { tier: "high" }, postwar: { tier: "medium" } },
  { code: "CHK", name: "Cherkasy", col: 4, row: 1, nearTerm: { tier: "highest", rank: 3 }, postwar: { tier: "high" } },
  { code: "POL", name: "Poltava", col: 5, row: 1, nearTerm: { tier: "highest", rank: 2 }, postwar: { tier: "high" } },
  { code: "KHA", name: "Kharkiv", col: 6, row: 1, nearTerm: { tier: "setAside" }, postwar: { tier: "highest", rank: 2 } },
  { code: "LUH", name: "Luhansk", col: 7, row: 1, nearTerm: { tier: "setAside" }, postwar: { tier: "highest", rank: 3 } },
  // Row 2
  { code: "ZAK", name: "Zakarpattia", col: 0, row: 2, nearTerm: { tier: "lower" }, postwar: { tier: "lower" } },
  { code: "IVF", name: "Ivano-Frankivsk", col: 1, row: 2, nearTerm: { tier: "lower" }, postwar: { tier: "lower" } },
  { code: "CHV", name: "Chernivtsi", col: 2, row: 2, nearTerm: { tier: "lower" }, postwar: { tier: "lower" } },
  { code: "KIR", name: "Kirovohrad", col: 4, row: 2, nearTerm: { tier: "highest", rank: 5 }, postwar: { tier: "high" } },
  { code: "DNI", name: "Dnipro", col: 5, row: 2, nearTerm: { tier: "high" }, postwar: { tier: "highest", rank: 5 } },
  { code: "DON", name: "Donetsk", col: 6, row: 2, nearTerm: { tier: "setAside" }, postwar: { tier: "highest", rank: 1 } },
  // Row 3
  { code: "ODE", name: "Odesa", col: 3, row: 3, nearTerm: { tier: "highest", rank: 1 }, postwar: { tier: "high" } },
  { code: "MYK", name: "Mykolaiv", col: 4, row: 3, nearTerm: { tier: "highest", rank: 4 }, postwar: { tier: "high" } },
  { code: "ZAP", name: "Zaporizhzhia", col: 5, row: 3, nearTerm: { tier: "setAside" }, postwar: { tier: "highest", rank: 4 } },
  // Row 4
  { code: "KHE", name: "Kherson", col: 4, row: 4, nearTerm: { tier: "setAside" }, postwar: { tier: "high" } },
  // Row 5 (not part of the 24 analysed regions)
  { code: "CRI", name: "Crimea", col: 5, row: 5, dashed: true, nearTerm: { tier: "notAnalyzed" }, postwar: { tier: "notAnalyzed" } },
];

// The five leading regions per time frame, with a bar length from 0 to 1,
// and the note under the list.
export const topFive = {
  nearTerm: [
    { rank: 1, code: "ODE", name: "Odesa", value: 1.0 },
    { rank: 2, code: "POL", name: "Poltava", value: 0.93 },
    { rank: 3, code: "CHK", name: "Cherkasy", value: 0.86 },
    { rank: 4, code: "MYK", name: "Mykolaiv", value: 0.8 },
    { rank: 5, code: "KIR", name: "Kirovohrad", value: 0.76 },
  ],
  postwar: [
    { rank: 1, code: "DON", name: "Donetsk", value: 1.0 },
    { rank: 2, code: "KHA", name: "Kharkiv", value: 0.91 },
    { rank: 3, code: "LUH", name: "Luhansk", value: 0.85 },
    { rank: 4, code: "ZAP", name: "Zaporizhzhia", value: 0.78 },
    { rank: 5, code: "DNI", name: "Dnipro", value: 0.7 },
  ],
  note: "Donetsk holds the most heavy damage, 702,000 ha, but has little safe access today. In Postwar it moves to the top.",
};

// The legend under the tile map. "colour" names a token in tokens.css;
// "pattern" is how the swatch is drawn when it is not a plain fill.
export const mapLegend = [
  { tier: "highest", label: "Highest", colour: "scale-5", pattern: "fill" },
  { tier: "high", label: "High", colour: "scale-4", pattern: "fill" },
  { tier: "medium", label: "Medium", colour: "scale-2", pattern: "fill" },
  { tier: "lower", label: "Lower", colour: "scale-1", pattern: "fill" },
  { tier: "setAside", label: "Set aside", colour: "scale-0", pattern: "striped" },
  { tier: "notAnalyzed", label: "Not analyzed", colour: "surface", pattern: "dashed" },
];

// ---------------------------------------------------------------------------
// Right column of the Overview: next steps, alerts, spring plan
// ---------------------------------------------------------------------------

// Heading text for the "Next steps for your office" card.
export const nextStepsSubtitle = "Built from this month's ranking and new alerts.";

// The four rows in "Next steps for your office". "icon" is a Lucide icon
// name; "tone" colours the icon box; "urgent" shows "when" in red.
export const nextSteps = [
  {
    id: "demining-surveys",
    title: "Fund demining surveys in Odesa and Poltava",
    help: "Highest near-term priority with safe access today.",
    when: "October",
    due: "2026-10-01",
    urgent: false,
    tone: "green",
    icon: "ShieldCheck",
  },
  {
    id: "review-kupiansk",
    title: "Review new damage near Kupiansk",
    help: "Radar change on Sep 24 and 3 farm help requests.",
    when: "This week",
    due: "2026-10-04",
    urgent: true,
    tone: "red",
    icon: "TriangleAlert",
  },
  {
    id: "soil-test-cherkasy",
    title: "Test soil on cleared land in Cherkasy",
    help: "Testing after demining is optional today. It protects the next harvest.",
    when: "November",
    due: "2026-11-01",
    urgent: false,
    tone: "amber",
    icon: "Waves",
  },
  {
    id: "send-report",
    title: "Send the September report to donors",
    help: "The PDF is ready to share.",
    when: "Today",
    due: "2026-09-30",
    urgent: false,
    tone: null,
    icon: "FileText",
  },
];

// The link under the next steps list.
export const nextStepsLink = "Ask AI to plan the quarter";

// The three coloured alert boxes. "tone" picks the panel colour.
export const alerts = [
  {
    id: "radar-kupiansk",
    title: "Radar change, Kupiansk district",
    detail: "Sep 24 · rougher ground on 6 fields",
    date: "2026-09-24",
    tone: "amber",
    icon: "Cloud",
  },
  {
    id: "fire-nikopol",
    title: "Fire detected, Nikopol district",
    detail: "Sep 21 · NASA FIRMS",
    date: "2026-09-21",
    tone: "red",
    icon: "Flame",
  },
  {
    id: "help-requests",
    title: "3 new help requests from farms",
    detail: "Kupiansk district · shared by the farmers",
    date: "2026-09-26",
    tone: "green",
    icon: "MapPin",
  },
];

// The dark "Spring plan" box under the alerts.
export const springPlan = {
  label: "Spring plan",
  amount: "$10,000,000",
  amountNumber: 10000000,
  text: "About 34,000 to 105,000 ha, starting with Odesa, Poltava, and Cherkasy",
};

// ---------------------------------------------------------------------------
// How priority is scored (Overview card and Settings page)
// ---------------------------------------------------------------------------

// The three questions, the result box, the rules per time frame, the
// research defaults and the choices offered in the Settings selects.
export const scoring = {
  title: "How priority is scored",
  subtitle: "Three questions about every place, answered from satellites and public records.",
  questions: [
    { id: "soil", label: "Soil value", question: "Is it black soil worth restoring?", tone: "green" },
    { id: "damage", label: "Damage", question: "How hard did fire and shelling hit it?", tone: "red" },
    { id: "access", label: "Safe access", question: "How far is it from recorded fighting?", tone: "blue" },
  ],
  result: { label: "Priority", help: "Where to start" },

  // Short rules shown on the Overview card.
  nearTermRule:
    "Places with too little safe access, below the 30th percentile, are set aside. The rest are ranked by soil value and damage.",
  postwarRule:
    "All three are blended (power mean, r = 0.5), so heavy damage can outweigh lower access once fighting ends.",

  // Longer wording used on the Settings page.
  settings: {
    title: "Scoring rules",
    subtitle: "The research defaults are set. Change them to test a different plan.",
    nearTerm: {
      badge: "Gate on safe access",
      text: "Places with too little safe access are set aside first. The rest are ranked by soil value and damage.",
      gateLabel: "Set aside below",
      rampLabel: "Ramp width above the gate",
    },
    postwar: {
      badge: "Power mean blend",
      text: "All three scores blend, so heavy damage on rich soil can outweigh poor access once fighting ends.",
      sumLabel: "Adds up to 100%",
      rLabel: "Blend strength, r",
    },
    baselineLabel: "Compare with these normal years",
    saveButton: "Save for next run",
    resetButton: "Reset to research defaults",
  },

  // The research defaults. Weights are percentages that add up to 100.
  defaults: {
    gatePercentile: 30,
    rampWidth: 0.2,
    weights: { soil: 30, damage: 40, access: 30 },
    r: 0.5,
    baseline: "2019–2021, before the full-scale war",
  },

  // What the Settings selects offer.
  options: {
    percentiles: [
      { value: 20, label: "20th percentile of safe access" },
      { value: 25, label: "25th percentile of safe access" },
      { value: 30, label: "30th percentile of safe access" },
      { value: 35, label: "35th percentile of safe access" },
    ],
    ramp: [
      { value: 0.1, label: "0.1" },
      { value: 0.2, label: "0.2" },
      { value: 0.3, label: "0.3" },
    ],
    r: [
      { value: 0.25, label: "r = 0.25, favours the weakest score" },
      { value: 0.5, label: "r = 0.5, research default" },
      { value: 1, label: "r = 1, plain average" },
    ],
    baselines: [
      { value: "2019-2021", label: "2019–2021, before the full-scale war" },
      { value: "2017-2021", label: "2017–2021, five normal years" },
    ],
  },

  // The small grey notes on the Settings page.
  notes: {
    r: "At r = 1 the blend becomes a plain average and western regions enter the top five.",
    postwar: "Postwar has no veto. Land still waiting for demining is left out separately.",
    gate: "The gate compares plans. It is not a mine-clearance standard.",
  },
};

// ---------------------------------------------------------------------------
// The Atlas map: the Kupiansk cluster
// ---------------------------------------------------------------------------

// Everything the map page shows when the Kupiansk cluster is selected.
// Positions (x, y) are fractions of the map width and height, 0 to 1.
export const cluster = {
  id: "kupiansk",
  name: "Kupiansk cluster",
  region: "Kharkiv region",
  regionCode: "KHA",
  areaHa: 50100,
  areaLabel: "50,100 ha",
  subtitle: "Kharkiv region · 50,100 ha of black-soil cropland",
  eyebrow: "SELECTED AREA",
  breadcrumb: ["Ukraine", "Kharkiv", "Kupiansk cluster"],
  mapLabel: "Kupiansk cluster · 50,100 ha",

  // The two time-frame boxes at the top of the side panel.
  nearTerm: {
    label: "Near term",
    status: "Set aside",
    tier: "setAside",
    why: "Safe access is below the 30th-percentile gate.",
  },
  postwar: {
    label: "Postwar",
    tag: "showing",
    status: "Highest priority",
    tier: "highest",
    why: "Damage leads once fighting ends.",
  },

  // "Why it scores this way": average scores across the cells.
  scoresTitle: "Why it scores this way",
  scores: { soil: 0.88, damage: 0.79, access: 0.03 },
  cellCount: 501,
  cellCountLabel: "Average of 501 cells",
  note: "Kharkiv is in the national Postwar top four.",

  // "What the satellites found": three small tiles.
  satellitesTitle: "What the satellites found",
  satellites: [
    { id: "radar", value: "6 fields", label: "Radar change since Sep 24", date: "2026-09-24" },
    { id: "fires", value: "412", label: "Fires since 2022, NASA FIRMS", since: "2022-01-01" },
    { id: "health", value: "−31%", label: "Plant health vs 2019 to 2021" },
  ],

  // "Recovery cost for this area": two options and a footnote.
  costsTitle: "Recovery cost for this area",
  costs: {
    fast: { label: "Fast path", amount: "$4.8M–14.5M", text: "$95–290 per ha · crops back fastest" },
    full: { label: "Full recovery", amount: "$13.0M–31.1M", text: "$260–620 per ha · restores the soil fully" },
    footnote: "Both are planning estimates and leave out demining.",
  },

  // "Help requests from farms": the numbered list in the side panel.
  helpRequestsTitle: "Help requests from farms",
  helpRequestsBadge: "3 new",
  helpRequestsSubtitle: "Farmers chose to share these. Every other farm stays private.",
  helpRequests: [
    { number: 1, name: "Field 7", ha: 48.6, title: "Field 7 · 48.6 ha", detail: "Shelling on Sep 25 · asks for a demining survey", date: "2026-09-25" },
    { number: 2, name: "Farm 2", ha: 120.4, title: "Farm 2 · 120.4 ha", detail: "Burned stubble in August · asks for soil testing", date: "2026-08-15" },
    { number: 3, name: "Farm 3", ha: 76.0, title: "Farm 3 · 76.0 ha", detail: "Craters on 2 fields · asks for a demining survey", date: "2026-09-20" },
  ],

  // The two buttons at the bottom of the side panel.
  actions: { primary: "Add to Postwar plan", secondary: "Ask AI about it" },

  // "Color the map by" choices in the top-left control box.
  colourByTitle: "Color the map by",
  colourBy: [
    { value: "priority", label: "Priority" },
    { value: "blackSoil", label: "Black soil" },
    { value: "damage", label: "Damage" },
    { value: "safeAccess", label: "Safe access" },
  ],

  // The two checkbox layers under the colour choices.
  layers: {
    farmHelp: { label: "Farm help requests", on: true, count: 3 },
    fighting: { label: "Recorded fighting", on: false, source: "ACLED" },
  },

  // The weights box at the bottom of the control panel.
  weightsTitle: "Postwar weights",
  weightsSummary: "Soil 30 · Damage 40 · Access 30",
  weightsLink: "Adjust",

  // Town and river labels drawn on the map (fractions of width / height).
  places: [
    { id: "dvorichna", name: "Dvorichna", x: 0.56, y: 0.28, kind: "town" },
    { id: "shevchenkove", name: "Shevchenkove", x: 0.13, y: 0.49, kind: "town" },
    { id: "kupiansk", name: "Kupiansk", x: 0.63, y: 0.47, kind: "city" },
    { id: "kupiansk-vuzlovyi", name: "Kupiansk-Vuzlovyi", x: 0.72, y: 0.56, kind: "town" },
    { id: "borova", name: "Borova", x: 0.63, y: 0.91, kind: "town" },
    { id: "oskil", name: "Oskil", x: 0.66, y: 0.14, kind: "river" },
  ],

  // Simple lines for the river and roads, as lists of [x, y] fractions.
  river: [
    [0.6, 0.0], [0.62, 0.1], [0.66, 0.2], [0.6, 0.32], [0.57, 0.42],
    [0.6, 0.5], [0.58, 0.62], [0.55, 0.75], [0.56, 0.88], [0.53, 1.0],
  ],
  roads: [
    [[0.0, 0.55], [0.3, 0.5], [0.6, 0.45], [1.0, 0.36]],
    [[0.62, 0.0], [0.6, 0.3], [0.63, 0.47], [0.7, 0.58], [1.0, 0.6]],
    [[0.63, 0.47], [0.6, 0.7], [0.62, 1.0]],
  ],

  // The dashed outline around the selected cluster.
  outline: { cx: 0.6, cy: 0.44, rx: 0.24, ry: 0.17 },

  // Numbered amber pins for the three help requests.
  pins: [
    { n: 1, x: 0.45, y: 0.41 },
    { n: 2, x: 0.71, y: 0.41 },
    { n: 3, x: 0.52, y: 0.58 },
  ],

  // The dark tooltip pointing at one cell.
  tooltip: {
    x: 0.67,
    y: 0.58,
    coords: "49.63° N, 37.74° E",
    tier: "Highest priority",
    soil: 0.9,
    damage: 0.84,
    access: 0.04,
  },

  // The legend box in the bottom-left of the map.
  legend: {
    title: "Priority · Postwar",
    scaleLow: "Lower",
    scaleHigh: "Highest",
    scale: ["scale-1", "scale-2", "scale-4", "scale-5"],
    dashed: "Selected area",
    pin: "Farm help request",
    scaleBar: "10 km",
    footer: "September 2026 run · 1 km cells",
  },

  // The small region map next to the legend.
  miniMap: {
    title: "Kharkiv region",
    link: "All of Ukraine",
    // A 6x6 grid of the region: 1 = cropland cell, 2 = the selected cluster,
    // 3 = dashed (not analysed), 0 = empty.
    cells: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 2, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 3, 0],
    ],
  },
};

// Names for the cell tier numbers that makeClusterCells() returns, and the
// colour token for each. 0 means no cropland there (draw nothing).
export const cellTiers = [
  { index: 0, label: "No cropland", colour: null },
  { index: 1, label: "Lower", colour: "scale-1" },
  { index: 2, label: "Medium", colour: "scale-2" },
  { index: 3, label: "High", colour: "scale-3" },
  { index: 4, label: "Highest", colour: "scale-4" },
  { index: 5, label: "Highest", colour: "scale-5" },
];

// A tiny deterministic random-number maker. The same seed always gives the
// same numbers, so the map looks identical on every load (no Math.random).
function makeRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds the grid of 1 km cells for the map: a list of rows, each a list of
// tier numbers 0 to 5 (see cellTiers). Cells near the cluster centre are
// darker; further away they fade with light noise. All inputs are optional.
//   cols, rows  - grid size (default 40 x 30)
//   seed        - any whole number; change it for a different pattern
//   centre      - { x, y } fractions of the grid where the blob sits
//   strength    - how dark the centre is, 0 to 1
export function makeClusterCells({
  cols = 40,
  rows = 30,
  seed = 7,
  centre = { x: 0.6, y: 0.44 },
  strength = 1,
} = {}) {
  const random = makeRandom(seed);
  const grid = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      const x = (c + 0.5) / cols;
      const y = (r + 0.5) / rows;
      // Distance from the blob centre, stretched to match the dashed outline.
      const dx = (x - centre.x) / 0.26;
      const dy = (y - centre.y) / 0.2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const blob = Math.max(0, 1 - distance) * strength;
      const noise = random();
      // Some cells are not cropland at all: empty patches away from the blob.
      if (blob < 0.15 && noise < 0.18) {
        row.push(0);
        continue;
      }
      const value = blob * 1.05 + noise * 0.4;
      let tier = 1;
      if (value > 1.0) tier = 5;
      else if (value > 0.8) tier = 4;
      else if (value > 0.55) tier = 3;
      else if (value > 0.3) tier = 2;
      row.push(tier);
    }
    grid.push(row);
  }
  return grid;
}

// The ready-made cell grids, one per "Color the map by" choice, keyed by the
// "value" in cluster.colourBy. Pages pick clusterCells[colourBy].
export const clusterCells = {
  priority: makeClusterCells({ seed: 7 }),
  blackSoil: makeClusterCells({ seed: 11, centre: { x: 0.5, y: 0.5 }, strength: 0.7 }),
  damage: makeClusterCells({ seed: 19, centre: { x: 0.64, y: 0.42 }, strength: 1 }),
  safeAccess: makeClusterCells({ seed: 23, centre: { x: 0.15, y: 0.8 }, strength: 0.6 }),
};

// ---------------------------------------------------------------------------
// Data archive
// ---------------------------------------------------------------------------

// Header text for the Data archive page.
export const dataArchive = {
  title: "Data archive",
  subtitle: "Every run is saved with its data, settings, and checks, so any number can be traced back.",
  regionFilterPrefix: "Region",
  regionFilterDefault: "All regions",
  compareButton: "Compare two runs",
  runsTitle: "Runs",
  runsSubtitle: "The whole country is scored again each month as new images arrive.",
  columns: ["Run", "Images used", "Heavy damage", "Checks", "Files"],
};

// The five saved runs, newest first. "badges" are the pills under the name.
// "checks.warning" is the short reason when not every check passed.
export const runs = [
  {
    id: "2026-09",
    name: "September 2026",
    date: "2026-09-30",
    badges: ["Current", "Used in the paper"],
    imagesUsed: "Apr to Sep 2026",
    heavyDamage: "2.23M ha",
    heavyDamageHa: 2230000,
    checks: { passed: 126, total: 126 },
  },
  {
    id: "2026-08",
    name: "August 2026",
    date: "2026-08-31",
    badges: [],
    imagesUsed: "Mar to Aug 2026",
    heavyDamage: "2.21M ha",
    heavyDamageHa: 2210000,
    checks: { passed: 126, total: 126 },
  },
  {
    id: "2026-07",
    name: "July 2026",
    date: "2026-07-31",
    badges: [],
    imagesUsed: "Feb to Jul 2026",
    heavyDamage: "2.19M ha",
    heavyDamageHa: 2190000,
    checks: { passed: 126, total: 126 },
  },
  {
    id: "2026-06",
    name: "June 2026",
    date: "2026-06-30",
    badges: [],
    imagesUsed: "Jan to Jun 2026",
    heavyDamage: "2.18M ha",
    heavyDamageHa: 2180000,
    checks: { passed: 125, total: 126, warning: "Cloud gap" },
  },
  {
    id: "2026-05",
    name: "May 2026",
    date: "2026-05-31",
    badges: [],
    imagesUsed: "Dec 2025 to May 2026",
    heavyDamage: "2.16M ha",
    heavyDamageHa: 2160000,
    checks: { passed: 126, total: 126 },
  },
];

// The bar chart above the runs table: new heavy damage found in each run.
// The last bar is the current run and is drawn in the stronger red.
export const runsChart = [
  { month: "May", date: "2026-05-31", newDamageHa: 11000 },
  { month: "Jun", date: "2026-06-30", newDamageHa: 15000 },
  { month: "Jul", date: "2026-07-31", newDamageHa: 12000 },
  { month: "Aug", date: "2026-08-31", newDamageHa: 16000 },
  { month: "Sep", date: "2026-09-30", newDamageHa: 22000, label: "22,000 ha", current: true },
];

// Titles for the chart.
export const runsChartMeta = {
  title: "New heavy damage found in each run",
  subtitle: "Black-soil cropland, hectares",
  ticks: [0, 10000, 20000],
  tickLabels: ["0", "10k", "20k"],
};

// "How we know it works": six check numbers, the open question and a link.
export const validation = {
  title: "How we know it works",
  subtitle: "Each layer is checked against records it never saw.",
  checks: [
    { value: "0.80", text: "Radar damage matches 109,636 recorded explosion events, 2022 to 2024" },
    { value: "0.73", text: "Fire detections match the same events" },
    { value: "−0.80", text: "More damage goes with a bigger fall in harvests across 21 regions" },
    { value: "0.62", text: "Radar and fire, two different sensors, agree with each other" },
    { value: "63%", text: "Near term top five stays the same across 27 different settings" },
    { value: "126/126", text: "Reliability checks pass on this run" },
  ],
  openNote: {
    lead: "Still open.",
    text: "The rankings are not yet tested against real recovery results, and Postwar has no outside check so far.",
  },
  link: "Read the method and its limits",
};

// "Data sources": intro text and the nine rows of the table.
export const sources = {
  title: "Data sources",
  intro: "All free and public. Normal years are 2019 to 2021, before the full-scale war.",
  columns: ["Source", "What it tells us", "Detail", "Updated"],
  rows: [
    { source: "SoilGrids WRB", tells: "Where black soil is", detail: "250 m", updated: "Fixed map" },
    { source: "ESA WorldCover", tells: "Which land is cropland", detail: "10 m", updated: "Fixed map" },
    { source: "Sentinel-1 radar", tells: "Craters and torn-up ground, even through clouds", detail: "10 m", updated: "Every 6 to 12 days" },
    { source: "NASA FIRMS", tells: "Fires and heat from shelling", detail: "375 m", updated: "Daily" },
    { source: "ACLED", tells: "Recorded fighting, for safe access and checks", detail: "Events", updated: "Weekly" },
    { source: "Sentinel-2", tells: "Plant health over the season", detail: "10 m", updated: "Every 5 days" },
    { source: "LandScan", tells: "How many people live on the land", detail: "~1 km", updated: "Yearly" },
    { source: "UkrStat", tells: "Harvest totals, used only for checking", detail: "Region", updated: "Yearly" },
    { source: "FAO GAUL", tells: "Region borders", detail: "Level 1", updated: "Fixed map" },
  ],
};

// "Download this run": the five files. "icon" is a Lucide icon name.
export const atlasDownloads = {
  title: "Download this run",
  subtitle: "September 2026 · open in any GIS tool or spreadsheet.",
  files: [
    { id: "priority-map", label: "Priority map, both time frames", format: "GeoTIFF", icon: "Map" },
    { id: "region-ranking", label: "Region ranking", format: "CSV", icon: "Table" },
    { id: "layers", label: "Soil, damage, and access layers", format: "GeoTIFF", icon: "Layers" },
    { id: "donor-report", label: "Monthly report for donors", format: "PDF", icon: "FileText" },
    { id: "all-runs", label: "Every saved run", format: "ZIP", icon: "Archive" },
  ],
};

// The dark "Cite the data" box.
export const citation = {
  title: "Cite the data",
  text: "Chernozem Recovery Atlas, Harvard Dataverse",
  doi: "doi:10.7910/DVN/IYXPVS",
  copyButton: "Copy",
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// Header text for the Settings page.
export const settingsPage = {
  title: "Settings",
  subtitle: "Changes apply to the next run. Every saved run keeps the settings it used.",
};

// The tab names along the top of Settings.
export const settingsTabs = ["Scoring", "Region", "Runs and alerts", "Team", "Farm data"];

// The dark "With these settings" box: what the current settings produce.
export const withTheseSettings = {
  title: "With these settings",
  badge: "Research result",
  nearTermLabel: "Near term top five",
  nearTermTopFive: ["Odesa", "Poltava", "Cherkasy", "Mykolaiv", "Kirovohrad"],
  postwarLabel: "Postwar top four",
  postwarTopFour: ["Donetsk", "Kharkiv", "Luhansk", "Zaporizhzhia"],
  note: "The research tested 27 Near term and 28 Postwar settings. The same five regions stay in the Near term lead across the 20th to 30th percentile gates.",
};

// The "Region" card.
export const region = {
  title: "Region",
  countryLabel: "Country",
  country: "Ukraine",
  countryOptions: [{ value: "ukraine", label: "Ukraine" }],
  boundariesLabel: "Boundaries",
  boundaries: "FAO GAUL, level 1 · 24 regions",
  uploadButton: "Upload districts",
  crimeaNote: "Crimea is not analyzed. It has been occupied since 2014, so its 2019 to 2021 baseline is not comparable.",
  expandLead: "The same method works on any black soil.",
  expandNote: "Northeast China and the US Midwest are next.",
  requestLink: "Request a region",
};

// The "Runs and alerts" card: the schedule select and two toggles.
export const runsAndAlerts = {
  title: "Runs and alerts",
  scheduleLabel: "Score the whole country",
  schedule: "Every month · next run Nov 1",
  nextRunDate: "2026-11-01",
  scheduleOptions: [
    { value: "monthly", label: "Every month · next run Nov 1" },
    { value: "quarterly", label: "Every quarter · next run Jan 1" },
  ],
  alertRadar: { label: "Alert me when radar finds new damage", on: true },
  emailDonors: { label: "Email the monthly report to donors", on: false },
};

// The "Team" card. "tone" picks the avatar colour.
export const team = {
  title: "Team",
  inviteButton: "Invite",
  members: [
    { id: "oksana", initials: "OH", name: "Oksana H.", role: "Admin", tone: "green" },
    { id: "taras", initials: "TM", name: "Taras M.", role: "Analyst", tone: "amber" },
    { id: "donors", initials: "2", name: "Donor guests", role: "View only", tone: "blue", count: 2 },
  ],
};

// The "Farm data" card: one toggle and one always-on rule.
export const farmData = {
  title: "Farm data",
  acceptRequests: {
    label: "Accept help requests from farms",
    help: "Requests appear as pins on the Atlas.",
    on: true,
  },
  consent: {
    label: "Farm data only with consent",
    note: "Nothing from a farm reaches the Atlas unless the farmer turns sharing on.",
    badge: "Always on",
  },
};
