// WHAT THIS FILE DOES
// The list of soil types the app knows about. The "Soil Type" tile on the
// Field page reads from this list. For now it shows the FIRST entry.
//
// WHO EDITS IT
// Shirley. You only need to edit this one file.
//
// HOW TO ADD A SOIL TYPE
// 1. Copy the example entry below, from its opening { to its closing },
//    including the comma at the end.
// 2. Paste it on a new line underneath, still inside the [ ] brackets.
// 3. Change the four values:
//      id          - a short unique name, lowercase, no spaces (use-dashes)
//      name        - the name people will see
//      family      - either "black soil" or "other" (see below)
//      description - one or two plain sentences about the soil
// 4. Save the file. The app refreshes by itself.
//
// THE "family" VALUE
// - "black soil" : chernozem and its close relatives.
// - "other"      : any soil outside the black soil family. For example:
//   { id: "podzol", name: "Podzol", family: "other", description: "..." },
//
// Keep the quotation marks around every value and the comma after every entry.

export const soilTypes = [
  {
    id: "chernozem",
    name: "Chernozem",
    family: "black soil",
    description:
      "Example entry. Dark, humus-rich soil that is among the most fertile in the world.",
  },
];
