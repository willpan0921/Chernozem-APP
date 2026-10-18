// WHAT THIS FILE DOES
// Where each region sits on the small tile map of Ukraine on the Atlas
// overview: an 8-column by 6-row grid, roughly in the shape of the country.
// Regions are matched to the data by their adm1Pcode (the standard code for
// each oblast), so the names in the data can be spelled any way.
//
// WHO EDITS IT
// Whoever changes the tile map's layout. A region that is in the data but
// not listed here is still scored and ranked; it just has no tile.

export const GRID_COLUMNS = 8;
export const GRID_ROWS = 6;

export const regionGrid = [
  { adm1Pcode: "UA07", code: "VOL", col: 1, row: 0 },
  { adm1Pcode: "UA56", code: "RIV", col: 2, row: 0 },
  { adm1Pcode: "UA18", code: "ZHY", col: 3, row: 0 },
  { adm1Pcode: "UA32", code: "KYI", col: 4, row: 0 },
  { adm1Pcode: "UA74", code: "CHN", col: 5, row: 0 },
  { adm1Pcode: "UA59", code: "SUM", col: 6, row: 0 },
  { adm1Pcode: "UA46", code: "LVI", col: 0, row: 1 },
  { adm1Pcode: "UA61", code: "TER", col: 1, row: 1 },
  { adm1Pcode: "UA68", code: "KHM", col: 2, row: 1 },
  { adm1Pcode: "UA05", code: "VIN", col: 3, row: 1 },
  { adm1Pcode: "UA71", code: "CHK", col: 4, row: 1 },
  { adm1Pcode: "UA53", code: "POL", col: 5, row: 1 },
  { adm1Pcode: "UA63", code: "KHA", col: 6, row: 1 },
  { adm1Pcode: "UA44", code: "LUH", col: 7, row: 1 },
  { adm1Pcode: "UA21", code: "ZAK", col: 0, row: 2 },
  { adm1Pcode: "UA26", code: "IVF", col: 1, row: 2 },
  { adm1Pcode: "UA73", code: "CHV", col: 2, row: 2 },
  { adm1Pcode: "UA35", code: "KIR", col: 4, row: 2 },
  { adm1Pcode: "UA12", code: "DNI", col: 5, row: 2 },
  { adm1Pcode: "UA14", code: "DON", col: 6, row: 2 },
  { adm1Pcode: "UA51", code: "ODE", col: 3, row: 3 },
  { adm1Pcode: "UA48", code: "MYK", col: 4, row: 3 },
  { adm1Pcode: "UA23", code: "ZAP", col: 5, row: 3 },
  { adm1Pcode: "UA65", code: "KHE", col: 4, row: 4 },
  { adm1Pcode: "UA01", code: "CRI", col: 5, row: 5 },
];

// Look up a region's tile by its adm1Pcode.
export const gridByPcode = Object.fromEntries(regionGrid.map((tile) => [tile.adm1Pcode, tile]));
