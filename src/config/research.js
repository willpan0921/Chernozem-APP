// WHAT THIS FILE DOES
// The research behind the Atlas, for the "How we know it works" section of
// the Data page (and the report): the six checks of the method against
// records it never saw, and what is still open.
//
// These are fixed results from the published research, not numbers worked
// out from the current run.
//
// WHO EDITS IT
// Whoever publishes new validation results. Change the text here; the
// pages pick it up.

export const validation = {
  title: "How we know it works",
  checks: [
    { value: "0.80", text: "Radar damage matches 109,636 recorded explosion events, 2022 to 2024" },
    { value: "0.73", text: "Fire detections match the same events" },
    { value: "−0.80", text: "More damage goes with a bigger fall in harvests across 21 regions" },
    { value: "0.62", text: "Radar and fire, two different sensors, agree with each other" },
    { value: "63%", text: "Near term top five stays the same across 27 different settings" },
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

// The line every page and the report end with.
export const safetyNote = "Never treat land as safe from this map. Only certified deminers can clear land for use.";
