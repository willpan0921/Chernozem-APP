// WHAT THIS FILE DOES
// The list of tiles shown on the Field page, in the order they appear.
//
// WHO EDITS IT
// Anyone on the team who wants to rename or reorder the tiles.
//
// HOW TO EDIT IT
// - To rename a tile: change its "title". This is the text people see.
// - To reorder tiles: move the whole line up or down.
// - Do NOT change an "id". The code uses the id to know which tile is which
//   (for example, the tile with id "soil-type" shows the soil information).

export const tiles = [
  { id: "soil-type", title: "Soil Type" },
  { id: "damage", title: "Damage" },
  { id: "access", title: "Access" },
  { id: "replant-verdict", title: "Replant Verdict" },
  { id: "recovery-plan", title: "Recovery Plan" },
  { id: "estimated-cost", title: "Estimated Cost" },
];
