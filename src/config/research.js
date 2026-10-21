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
// WHO EDITS IT
// Whoever publishes new validation results. Change the text here; the
// pages pick it up.

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
    text: "The rankings are not yet tested against real recovery results, and Postwar has no outside check so far.",
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

export function safetyNoteFor(run) {
  return run && run.conflict === null ? peaceNote : safetyNote;
}

// ---------------------------------------------------------------------------
// "How it's measured"
// ---------------------------------------------------------------------------
// Each item: { id, name, what (one plain sentence), formula, source }. The
// Atlas items may also say what they are at peace (whatPeace, formulaPeace;
// whatTeamPeace where the team marked the area as not at war), in a
// month that ends before its war began (whatBeforeWar, formulaBeforeWar)
// and, for safe access, in a war where no fire looked like fighting
// (whatNoFighting): src/lib/atlas/mapColors.js methodsFor picks them.

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
  items: [
    {
      id: "soil",
      name: "Soil value",
      what: "How much of the square is black soil, and how much is farmed.",
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
      name: "Safe access",
      what: "Distance to fighting: ACLED battles when a file is connected, else unusual fires (a rough estimate). 100 km or more scores full access (1.0); this does not make the land safe.",
      whatPeace: "No known war covers this area, so access is not measured (this does not make the land safe).",
      whatTeamPeace: "Your team marked this area as not at war, so access is not measured (this does not make the land safe).",
      whatBeforeWar: "This month ends before the war began, so distance to fighting is not measured (this does not make the land safe).",
      // After "Not measured here: no fires that look like fighting were
      // found within 300 km (inside the war's region), and there is no
      // ACLED file (or what the connected one did)." (mapColors.js
      // methodsFor, from overview.js notMeasuredReason).
      whatNoFighting: "The fire rule needs fire as dense as at a front line and well above the place's normal years; scattered strikes do not reach it. Every square counts as far from fighting, which does NOT make the land safe: recorded fighting (an ACLED file that covers this area) or your team's knowledge is needed here.",
      formula: "Distance to the nearest fighting, capped at 100 km",
      source: "ACLED battles when connected, else unusual fire inside a known war",
    },
  ],
  note: "Near term sets aside the least safe places and ranks the rest by soil value and damage; the long view blends all three. The soil-health index is shown for context only.",
  notePeace: "Near term ranks by soil value and damage; the long view blends all three. The soil-health index is shown for context only.",
  // In a war where no fire looked like fighting (src/lib/atlas/overview.js
  // noFightingFound): safe access is not measured, so nothing is set aside.
  noteNoFighting: "Safe access is not measured here, so Near term sets nothing aside and ranks by soil value and damage; the long view blends all three. The soil-health index is shown for context only.",
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
