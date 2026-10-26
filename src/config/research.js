// WHAT THIS FILE DOES
// The research behind the Atlas, for the "How we know it works" section of
// the Data page (and the report): the six checks of the method against
// records it never saw, and what is still open. These are fixed results
// from the published research in Ukraine, not numbers worked out from the
// current run or area.
//
// Also the words of the "How it's measured" panels (fieldMethods on the
// Fields page, atlasMethods on the Atlas map): what each number is, the
// data it comes from and what it cannot see. The full version is
// docs/METHODS.md; keep the two saying the same thing.
//
// And the closing safety line of the Atlas report: safetyNote inside a
// known war, peaceNote elsewhere (safetyNoteFor(run)).
//
// A natural disaster the team set (src/lib/atlas/method.js isDisaster)
// has its own words: the items' whatDisaster / formulaDisaster /
// sourceDisaster by type, and the report's disasterNote.
//
// WHO EDITS IT
// Whoever publishes new validation results. Change the text here; the
// pages pick it up.

import { isDisaster } from "../lib/atlas/method.js";

export const validation = {
  title: "How we know it works",
  // The badge: it describes the research, not the area on screen.
  scope: "Research tested in Ukraine",
  intro: "Results of the published research in Ukraine, checked against records the method never saw.",
  checks: [
    { value: "0.80", text: "Radar damage matched 109,636 recorded explosion events in Ukraine, 2022 to 2024" },
    { value: "0.73", text: "Fire detections matched the same events" },
    { value: "−0.80", text: "More damage went with a bigger fall in harvests across 21 regions" },
    { value: "0.62", text: "Radar and fire, two different sensors, agreed with each other" },
    { value: "63%", text: "The Near term top five stayed the same across 27 different settings" },
    { value: "126/126", text: "Reliability checks passed on the research run" },
  ],
  openNote: {
    lead: "Still open.",
    text: "The rankings are not yet tested against real recovery results, and Post-crisis has no outside check so far.",
  },
};

// "How we know it works" for an area in a natural disaster (DataPage):
// the disaster rules' own checks on real data (docs/METHODS.md, "Natural
// disasters", scripts/disaster-check.js), one type at a time. `validation`
// above is the war method's research and stays as it is.
//   checks   { value, text }, as validation's
//   failed   the amber note of a rule that failed its checks, or null
export const disasterValidation = {
  title: "How we know it works",
  scope: "Checked on past disasters",
  intro: "The app's own analysis run on past disasters and on the same places in years without one, against official maps and figures.",
  warNote: "The research tested in Ukraine checks the war method; this area uses the {noun} rule below.",
  checked: "Checked on real data on 25 October 2026.",
  types: {
    flood: {
      checks: [
        { value: "−4 to −19%", text: "Thessaly, Storm Daniel 2023: 12,151 ha of cropland flooded against the Copernicus flood maps (12,600 to 15,000 ha)" },
        { value: "−17%", text: "Punjab, Chenab floods 2025: 13,747 ha against the Copernicus map (about 16,500 ha of cropland); on rice paddies only water far deeper than their own counts, so it reads a little low" },
        { value: "37%", text: "Big Sioux, Iowa 2024: of the USDA crop-flood figure (19,269 of about 52,600 ha), a known undercount" },
        { value: "0–8%", text: "Cropland read as flooded in the same places without a flood: 0.2% Thessaly, 1.1% Punjab, 0% Iowa in summer; about 3% in the Punjab paddy season, 7–8% in an Iowa winter and spring (meltwater and rain on fields)" },
      ],
      failed: null,
    },
    wildfire: {
      checks: [
        { value: "+9 to +15%", text: "Yambol, Bulgaria 2024: 8,388 to 8,860 ha burned against the Copernicus map (7,703 ha)" },
        { value: "74.5%", text: "Smokehouse Creek, Texas 2024: share of the area burned (official 70–74%)" },
        { value: "0–8%", text: "Cropland read as burned without a wildfire: 0% Yambol; with crop-residue or stubble burning 1.6% (Punjab 2024), 4.6% (Rostov 2024) and 8.1% (Punjab 2025, unusually heavy burning)" },
      ],
      failed: null,
    },
    drought: {
      checks: [
        { value: "72–73%", text: "Nebraska Panhandle 2026: share of the cropland hit, 107,205 to 109,148 ha, the same from July on (wheat drought claims cover 46,275 ha)" },
        { value: "11.2%", text: "Heavily damaged share, June to September: above the 8% the check asked for" },
        { value: "0–20%", text: "Cropland read as hit without a drought: 19.7% in Nebraska 2025 (wetter normal years), 0% in Iowa 2023" },
      ],
      failed: null,
    },
    ground: {
      checks: [],
      failed: "Provisional: this rule failed its checks. Over the Romagna landslides of May 2023 it read only 1.3 times the hit land of nearby hills without slides (2 times was needed), and an irrigated plain with no disaster read 15.6% of its cropland as hit. Treat it as a pointer to where to look, not a measurement.",
    },
    other: {
      checks: [],
      failed: "Provisional: this rule (the storm, earthquake and landslide one) failed its checks: it read about as much change in places without a disaster. Treat it as a pointer to where to look, not a measurement.",
    },
  },
};

// Where the research is published.
export const citation = {
  text: "Chernozem Recovery Atlas, Harvard Dataverse",
  doi: "doi:10.7910/DVN/IYXPVS",
  url: "https://doi.org/10.7910/DVN/IYXPVS",
};

// The line the report ends with. Inside a known war (run.conflict set, or
// an older run that does not say): explosives. Elsewhere: a plain "check
// on the ground".
export const safetyNote = "Never treat land as safe from this map. Only certified deminers can clear land for use.";
export const peaceNote = "Scores show model priority from satellite data, not proven results. Check the land on the ground before you act on it.";

// A natural disaster: no deminers, but the land can still be dangerous,
// in the way of its type (a drought has no such hazard).
const DISASTER_HAZARD = {
  flood: "Flood water, mud and weakened banks can still be dangerous: check",
  wildfire: "Smouldering ground and fire-damaged trees can still be dangerous: check",
  ground: "Unstable slopes and cracked ground can still be dangerous: check",
  other: "The land can still be dangerous after a disaster: check",
};
export function disasterNoteFor(type) {
  const hazard = DISASTER_HAZARD[type];
  return `Scores show model priority from satellite data, not proven results. ${hazard ? `${hazard} the land on the ground with local authorities before you act.` : "Check the land and the crop on the ground before you act on it."}`;
}
export const disasterNote = disasterNoteFor("other");

export function safetyNoteFor(run) {
  if (run && isDisaster(run.conflict)) return disasterNoteFor(run.conflict.type);
  return run && run.conflict === null ? peaceNote : safetyNote;
}

// ---------------------------------------------------------------------------
// "How it's measured"
// ---------------------------------------------------------------------------
// Each item: { id, name, what (one plain sentence), formula, source }. The
// Atlas items may also say what they are at peace (whatPeace, formulaPeace;
// whatTeamPeace where the team marked the area as not at war), in a
// month that ends before its war began (whatBeforeWar, formulaBeforeWar)
// and, for feasibility, in a war where no fire looked like fighting
// (whatNoFighting): src/lib/atlas/mapColors.js methodsFor picks them.
// The Atlas's three scores are named as the Map page's tabs name them
// (2026-10-25): Value (soil value), Damage and Feasibility (safe access:
// the distance to fighting; the code's key is still "access").

export const fieldMethods = {
  title: "How it's measured",
  intro: "Every number is read from free satellite and weather data for each field, and compared with the same weeks in 2019 to 2021 (normal).",
  items: [
    {
      id: "water",
      name: "Water",
      what: "How much water the crop holds, against the field's normal.",
      formula: "NDWI = (NIR − SWIR) / (NIR + SWIR)",
      source: "Sentinel-2, 20 m, a pass every 2–5 days",
    },
    {
      id: "plantHealth",
      name: "Plant health",
      what: "How green and dense the crop is, against its normal.",
      formula: "NDVI = (NIR − red) / (NIR + red)",
      source: "Sentinel-2, 10 m, cloud-free pixels only (Cloud Score+)",
    },
    {
      id: "stress",
      name: "Stress",
      what: "Patches weaker than the rest of the field and than normal. The red-edge band sees them 1–2 weeks before NDVI does. Water readings tell a dry patch from other causes. Not read once a crop has dried down for harvest. Pest and disease risk is a weather forecast, not a sighting.",
      formula: "Below the field's median and normal (NDVI or red-edge NDRE)",
      source: "Sentinel-2 red-edge, 20 m · Open-Meteo hourly humidity and temperature",
    },
    {
      id: "harvest",
      name: "Harvest readiness",
      what: "Ready when the crop has dried down from its peak, or has had the heat units its crop needs. Radar sees a harvest through cloud. Soybeans drop their leaves before harvest, which looks like a cut on radar: such fields read \"Leaves down · check if cut\" for up to 30 days. With no crop known, no date is given. After harvest, the season is graded: plant health from green-up to harvest, and its peak (the 3 greenest passes), against the same days of 2019–2021. Whichever of the two is lower is used, so the grade rests mainly on the peak.",
      formula: "Season NDVI dry-down · growing degree-days per crop · radar drop of 3 dB or more · season vs normal",
      source: "Sentinel-2 · Open-Meteo daily temperatures · Sentinel-1 radar, 10 m",
    },
  ],
  note: "The crop is worked out from when a field greens up, peaks and dries down; land that fades slowly and never goes bare reads as fallow or grass. Pick your own in Settings to replace it.",
  limits: "A satellite cannot name a pest or prove land safe. Thick cloud can delay a reading by days.",
  sources: "Processed in Google Earth Engine. Weather from Open-Meteo.",
};

export const atlasMethods = {
  title: "How it's measured",
  intro: "Each map square gets three scores from 0 to 1 on fixed scales, so places and months compare fairly.",
  // For the States (or Districts) view of the Map page
  // (src/lib/atlas/units.js).
  // "{one}" and "{many}" are the units' own words ("district", "districts"):
  // mapColors.js unitsNote.
  noteUnits: "A {one}'s value, damage and feasibility are the black-soil-weighted means of its ranked squares; its priority is then worked out across the {many} the same way as for squares. A {one} is judged by its average, so some of its squares can still rank near the top in the Micro view, even when the {one} as a whole is left out for now.",
  items: [
    {
      id: "soil",
      name: "Value",
      what: "Soil value: how much of the square is black soil, and how much is farmed.",
      formula: "Mean of black-soil share and cropland share",
      source: "OpenLandMap USDA soil classes (Mollisols), 250 m · ESA WorldCover cropland, 10 m",
    },
    {
      id: "damage",
      name: "Damage",
      what: "Fire beyond the place's normal year in its worst war year, and radar change that lasts: each complete growing season since the war began against the same season in 2019–2021, counted where it shows in at least two seasons. Damage once found stays counted: abandoned land is not burned again, and soil damage persists.",
      whatPeace: "The share of the square's black-soil cropland heavily damaged over the last two years: radar change of 3 dB or more in a growing season together with fire beyond the normal year (the worst year). Squares with almost no black-soil cropland are not ranked.",
      formula: "Mean of excess fire (worst war year) and lasting radar (VV) change (war seasons)",
      formulaPeace: "Heavily damaged ha ÷ black-soil ha, full at 20 %",
      whatBeforeWar: "This month ends before the war began, so no war damage is counted: the damage score is 0 everywhere. Months from the day the war began count its fires and radar change.",
      formulaBeforeWar: "Not counted before the war began",
      source: "NASA FIRMS fire detections, 1 km · Sentinel-1 radar, 10 m",
    },
    {
      id: "access",
      name: "Feasibility",
      what: "How safe it is to reach and work the land now, measured as the distance to fighting: battles in an ACLED file, or fires that look like fighting (a rough estimate); full at 100 km. This does not make the land safe.",
      whatPeace: "Feasibility not measured here: no known war covers this area (this does not make the land safe).",
      whatTeamPeace: "Feasibility not measured here: your team marked this area as not at war (this does not make the land safe).",
      whatBeforeWar: "Feasibility not measured here: this month ends before the war began (this does not make the land safe).",
      // After "Not measured here: no fires that look like fighting were
      // found within 300 km (inside the war's region), and there is no
      // ACLED file (or what the connected one did)." (mapColors.js
      // methodsFor, from overview.js notMeasuredReason).
      whatNoFighting: "The fire rule needs fire as dense as at a front line and well above the place's normal years; scattered strikes do not reach it. Every square counts as far from fighting, which does NOT make the land safe: recorded fighting (an ACLED file that covers this area) or your team's knowledge is needed here.",
      formula: "Distance to the nearest fighting, capped at 100 km",
      source: "ACLED battles when connected, else unusual fire inside a known war",
    },
  ],
  note: "Near term leaves the least feasible places out for now (the Feasibility cutoff; they show in the lowest priority shade) and ranks the rest by value and damage; Post-crisis blends all three. The soil-health index is shown for context only.",
  notePeace: "Near term ranks by value and damage; Post-crisis blends all three. The soil-health index is shown for context only.",
  // In a war where no fire looked like fighting (src/lib/atlas/overview.js
  // noFightingFound): feasibility is not measured, so nothing is left out.
  noteNoFighting: "Feasibility not measured here, so Near term leaves nothing out and ranks by value and damage; Post-crisis blends all three. The soil-health index is shown for context only.",
  // Added for a war that covers a whole-country area only in part, and
  // (notePartOfArea) a region, a box or a drawn area; notePartOtherWar
  // after it when some squares have the war's rules because another listed
  // war covers them (run.otherWarSquares), then notePartElsewhere. The
  // other squares keep the war's dates; only these rules differ there.
  notePartOfCountry: "The war covers only part of this country: its rules apply in the squares that touch its region.",
  notePartOfArea: "The war covers only part of this area: its rules apply in the squares that touch its region.",
  notePartOtherWar: "Squares that lie in another listed war have its rules too.",
  notePartElsewhere: "Elsewhere damage is also counted from the day the war began, but heavy damage needs strong radar change and an unusual fire, and the damage score is the heavily damaged share of the black soil.",
  limits: "Scores show model priority, not proven results. Check the land on the ground before you act on it.",
  sources: "Processed in Google Earth Engine.",
};

// How the three scores become a priority, in the two time frames (the
// owner's research method: "Gated Aggregation"; src/lib/atlas/scoring.js
// does exactly this). Shown in the Atlas "How it's measured" panel, after
// the three scores (src/lib/atlas/mapColors.js priorityMethods picks the
// words for where Feasibility is not measured).
export const priorityMethods = {
  title: "How priority is worked out",
  intro: "The two time frames use the same three scores but combine them differently, as in the research method (Gated Aggregation).",
  frames: [
    {
      id: "nearTerm",
      name: "Near term",
      tag: "Gated",
      what: "What can be done now, while the crisis goes on.",
      steps: [
        "Gate: the least feasible places are left out for now, until they hold the Feasibility cutoff share of the black soil (30% unless you change it). Places with full feasibility are never left out.",
        "Ramp: places just above the gate fade in over a band of feasibility (0.2), so a place a hair over the line does not jump from nothing to full strength.",
        "Rank the rest by Value and Damage only, blended with their two weights. Feasibility has already done its job as the gate, so it is not a weight here.",
      ],
      stepsUnmeasured: [
        "Gate: Feasibility is not measured here, so the gate leaves nothing out.",
        "Rank every place by Value and Damage, blended with their two weights.",
      ],
      formula: "Priority = ramp × (w₁·√Value + w₂·√Damage)²   (weights add up to 1)",
    },
    {
      id: "postCrisis",
      name: "Post-crisis",
      tag: "Blended",
      what: "Where to recover once the war or disaster is over.",
      steps: [
        "Nothing is left out.",
        "Value, Damage and Feasibility are blended with their three weights. Feasibility still counts (mines, damaged roads, wet or burned ground), but as one factor, not a barrier.",
      ],
      stepsUnmeasured: [
        "Nothing is left out.",
        "Value, Damage and Feasibility are blended with their three weights; Feasibility is not measured here, so it is the same everywhere and the order follows Value and Damage.",
      ],
      formula: "Priority = (w₁·√Value + w₂·√Damage + w₃·√Feasibility)²   (weights add up to 1)",
    },
  ],
  blend: "Both use a weighted power mean (r = 0.5), between an average and a product: a place that is fair on every score ranks above one that is strong on one and weak on another. Value 0.5 and Damage 0.5 give 0.50; Value 0.8 and Damage 0.2 give 0.45.",
  scale: "Priority is shown from 0 to 100 as a share of the best place's score. Tiers go by rank: the top 25% are highest, the next 25% high, the next 20% medium, the rest lower. Default weights: Value 30, Damage 40, Feasibility 30; cutoff 30%.",
};

// The "How it's measured" words of a natural disaster the team set
// (src/lib/atlas/mapColors.js methodsFor), kept apart from atlasMethods so
// a war's and peace's panel stay exactly as they are: per item (damage,
// access) what / formula / source by type, and the notes. "{noun}" is the
// disaster's noun ("flood", "storm, earthquake or landslide").
export const atlasDisasterMethods = {
  damage: {
    whatDisaster: {
      flood: "Cropland flooded since the day the flood began: normally dry land seen under water on radar (darker than in the same days of 2019–2021, on a day without snow or frozen ground) or in a clear optical image at any look in the 60 days from that day. Heavy damage is land under water over 4 days or more. Land that is often under water (lakes, rivers, and fields under water in the same weeks of most years 2019–2021, as many rice paddies are) and land more than 15 m above the nearest stream are left out, unless the radar sees such a field far darker than it normally is at that time of the year (8 dB or more: a flood over a paddy, deeper than its own water).",
      wildfire: "Cropland burned since the day the wildfire began: a day on the MODIS or VIIRS burned-area map in the 60 days from it, or an unusual fire within 1 km (at least 3 times the fires of the same days in 2019–2021) with a severe loss of vegetation (Sentinel-2 dNBR of 0.27 or more). On cropland, burning only counts where it is clearly above those years, so fields burned every year (crop residue, stubble) are left out. Heavy damage is burned land with that severe loss. The burned-area maps come about 2.5 months late; until then dormant or grazed land is under-counted.",
      drought: "This season's crop loss: crop greenness 20% or more below the same weeks of 2019–2021 (35% or more for heavy damage), smoothed over 1.5 km so crop rotation cancels out. It is read at each month's end and the season's worst reading so far is kept, so it does not fall within the season; it starts again when a new season begins. Greenness is not yield.",
      ground: "Provisional: lasting change of the land over the growing season that contains the day the {noun} began, where two sensors agree: crop greenness 20% or more below normal AND radar change of 2 dB (3 dB for heavy damage). Measured once that season is complete; small slides and wooded slopes are missed.",
      other: "Provisional: lasting change of the land over the growing season that contains the day the {noun} began, where two sensors agree: crop greenness 20% or more below normal AND radar change of 2 dB (3 dB for heavy damage). Measured once that season is complete.",
    },
    formulaDisaster: {
      flood: "Mean of flooded share and heavily flooded share of the black soil, each full at 20 %",
      wildfire: "Mean of burned share and severely burned share of the black soil, each full at 20 %",
      drought: "Mean of the shares with 20 % and 35 % greenness loss, each full at 20 %",
      ground: "Mean of the shares with greenness loss and 2 dB / 3 dB radar change, each full at 20 %",
      other: "Mean of the shares with greenness loss and 2 dB / 3 dB radar change, each full at 20 %",
    },
    sourceDisaster: {
      flood: "Sentinel-1 radar, 10 m · Sentinel-2, 10–20 m · JRC Global Surface Water · MERIT Hydro",
      wildfire: "MODIS MCD64A1 and VIIRS VNP64A1 burned area, 500 m · NASA FIRMS, 1 km · Sentinel-2, 20 m",
      drought: "MODIS MOD13Q1 greenness, 250 m (VIIRS VNP13A1 when MODIS has none)",
      ground: "Sentinel-2, 10 m · Sentinel-1 radar, 10 m",
      other: "Sentinel-2, 10 m · Sentinel-1 radar, 10 m",
    },
  },
  access: {
    whatDisaster: {
      flood: "What satellites see now: the share of the square's cropland not under water at its latest look in the last 12 days of the month. Where the radar looked in those days, water in an optical image counts only if the radar saw it too (wet soil and rice paddies look like water to Sentinel-2). A square with 5% or less of its cropland under water counts as nothing in the way, so ponds and puddles never leave it out. 1 means nothing was seen in the way, never that the land can be worked: roads, debris and power are not seen.",
      wildfire: "What satellites see now: the distance to a fire burning in the last 7 days of the month, full at 10 km. 1 means no fire was seen burning nearby, never that the land can be worked.",
      drought: "Not measured for a drought: it does not stop fieldwork, so nothing is left out (this does not prove the land can be worked).",
      ground: "Not measured for a {noun}: satellites do not show what stops fieldwork after it, so nothing is left out (this does not prove the land can be worked).",
      other: "Not measured for a {noun}: satellites do not show what stops fieldwork after it, so nothing is left out (this does not prove the land can be worked).",
    },
    whatDisasterNone: "Not measured this month: no images of its last days to see the {noun} in, so nothing is left out (this does not prove the land can be worked).",
    formulaDisaster: {
      flood: "1 when 5 % or less of the cropland is under water at the latest look; above that, falling to 0 when all of it is",
      wildfire: "Distance to a fire burning now ÷ 10 km, capped at 1",
    },
    sourceDisaster: {
      flood: "Sentinel-1 radar and Sentinel-2, the month's last 12 days",
      wildfire: "NASA FIRMS fire detections, the month's last 7 days",
      drought: "Not measured",
      ground: "Not measured",
      other: "Not measured",
    },
  },
  // The note when Feasibility is measured (a flood, a wildfire) and when
  // it is not, and the damage item before the disaster's day.
  noteDisaster: "Near term leaves the least feasible places out for now (the Feasibility cutoff; they show in the lowest priority shade) and ranks the rest by value and damage; Post-crisis blends all three. The soil-health index is shown for context only.",
  noteDisasterUnmeasured: "Feasibility is not measured here, so Near term leaves nothing out and ranks by value and damage; Post-crisis blends all three. The soil-health index is shown for context only.",
  whatBeforeDisaster: "This month ends before the {noun} began, so no disaster damage is counted and Feasibility is not measured. Months from its day count it.",
  limitsDisaster: {
    flood: "Scores show model priority, not proven results. Flooded tall crops and towns can be missed, sparse images under-count long floods, and sand, silt and salt left on fields are not measured. Fields under water in most years in those weeks (paddies) count only where the radar sees them far darker than normal, so a shallow flood on them reads low, and some paddies and river beds that are wet every season can still read as flooded. Check the land on the ground before you act on it.",
    wildfire: "Scores show model priority, not proven results. Until the month's burned-area map is out, fires on dormant or grazed land are under-counted, and pasture is reported, not scored. Where fields burn every year, a wildfire on cropland counts only where burning is clearly above normal, so it can read low there. Check the land on the ground before you act on it.",
    drought: "Scores show model priority, not proven results. Greenness is not yield, irrigated land shows little loss, and 2019–2021 were wet in some places. Check the land on the ground before you act on it.",
    ground: "Scores show model priority, not proven results. This rule is provisional: it finds a fraction of the mapped slides, and earthquake cracks are not seen. Check the land on the ground before you act on it.",
    other: "Scores show model priority, not proven results. This rule is provisional. Check the land on the ground before you act on it.",
  },
};
