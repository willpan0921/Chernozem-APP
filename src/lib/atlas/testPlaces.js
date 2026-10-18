// WHAT THIS FILE DOES
// Makes a made-up grid of map squares for the tests (scoring, hotspots,
// overview, map colours). Not used by the app.
//
//   makePlaces(rows, cols) -> [{ id: "r0c0", lat, lon, wrb, agOutput, firms,
//                               chi, distance, croplandHa, blackSoilHa, ... }]
//
// The grid is predictable: columns further east are closer to the fighting
// (lower "distance") and more damaged, and a bump in the middle of the
// north half has the best soil.
//
// WHO EDITS IT
// Whoever writes a test that needs different made-up squares.

export function makePlaces(rows = 12, cols = 12, { cellSizeDeg = 0.25, north = 52, west = 24 } = {}) {
  const places = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const east = cols > 1 ? col / (cols - 1) : 0;
      const south = rows > 1 ? row / (rows - 1) : 0;
      // Best soil in a bump around row 3, column 4.
      const soilBump = Math.exp(-((row - 3) ** 2 + (col - 4) ** 2) / 18);
      const croplandHa = 1000 + 50 * ((row * 7 + col * 3) % 10);
      const wrb = 0.3 + 0.6 * soilBump;
      const heavyShare = 0.4 * east ** 2;
      const blackSoilHa = croplandHa * wrb;
      places.push({
        id: `r${row}c${col}`,
        lat: north - (row + 0.5) * cellSizeDeg,
        lon: west + (col + 0.5) * cellSizeDeg,
        wrb,
        agOutput: 0.4 + 0.3 * (1 - south),
        firms: Math.min(1, 0.9 * east ** 1.5 + 0.02 * (row % 3)),
        chi: Math.min(1, 0.8 * east ** 2 + 0.03 * (col % 2)),
        distance: Math.max(0, 1 - east),
        croplandHa,
        blackSoilHa,
        heavyDamageHa: blackSoilHa * heavyShare,
        people: 200 + 30 * col,
        peopleOnDamagedSoil: Math.round((200 + 30 * col) * heavyShare),
        raw: { conflictKm: Math.max(0, 1 - east) * 100 },
      });
    }
  }
  return places;
}
