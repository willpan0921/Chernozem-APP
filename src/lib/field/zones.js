// WHAT THIS FILE DOES
// Turns a field's zones grid (the condition score of each small square of
// the field, from the analysis) into the smooth zone picture the Zones map
// paints. Plain functions with no browser code, tested in zones.test.js.
//
//   prepareGrid(zones)           -> { cols, rows, values: Float32Array }   gaps at the edge filled, lightly smoothed
//   sampleGrid(grid, gx, gy)     -> the score between squares (bilinear)
//   zoneBand(score)              -> 0..6, the colour band (see ZONE_BANDS)
//   renderZoneBands(zones, opts) -> { width, height, bands: Uint8Array }  one band per picture pixel (NO_BAND outside data)
//
// The bands follow the four condition classes in method.js (Poor, Fair,
// Good, Very good); Fair, Good and Very good are each split in two shades
// so the picture shows where a field is a little better or worse, the way
// a zone map does. The colours themselves are tokens (--zone-*).
//
// WHO EDITS IT
// Whoever changes how the zones look. The class limits are in method.js.

import { CONDITION_CLASSES } from "./method.js";

const [POOR, FAIR, GOOD] = CONDITION_CLASSES.map((item) => item.upTo);

// Band index -> which colour: the class, and how much of the neighbouring
// class colour is mixed in (FieldMap.jsx builds the colours from this).
export const ZONE_BANDS = [
  { id: "poor", base: "poor" },
  { id: "fair-low", base: "fair", mix: "poor", amount: 0.35 },
  { id: "fair", base: "fair" },
  { id: "good", base: "good" },
  { id: "good-high", base: "good", mix: "great", amount: 0.4 },
  { id: "great", base: "great" },
  { id: "great-deep", base: "deep" },
];
export const NO_BAND = 255;

export function zoneBand(score) {
  if (!Number.isFinite(score)) return NO_BAND;
  if (score < POOR) return 0;
  if (score < FAIR) return score < (POOR + FAIR) / 2 ? 1 : 2;
  if (score < GOOD) return score < (FAIR + GOOD) / 2 ? 3 : 4;
  return score < (GOOD + 1) / 2 ? 5 : 6;
}

// The grid as numbers (NaN for "outside the field"), with the empty squares
// along the edge filled from their neighbours (so the picture reaches the
// outline everywhere) and a light smoothing (so single noisy pixels do not
// show as specks). Squares far outside the field stay empty.
export function prepareGrid(zones, { fillPasses = 2, smoothPasses = 2 } = {}) {
  const cols = zones?.cols | 0;
  const rows = zones?.rows | 0;
  const raw = Array.isArray(zones?.values) ? zones.values : [];
  let values = new Float32Array(cols * rows);
  for (let i = 0; i < values.length; i++) {
    const v = raw[i];
    values[i] = typeof v === "number" && Number.isFinite(v) ? v : NaN;
  }
  const neighbours = (src, x, y) => {
    let sum = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const v = src[yy * cols + xx];
        if (!Number.isNaN(v)) {
          sum += v;
          n += 1;
        }
      }
    }
    return n ? sum / n : NaN;
  };
  for (let pass = 0; pass < fillPasses; pass++) {
    const next = new Float32Array(values);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (Number.isNaN(values[y * cols + x])) next[y * cols + x] = neighbours(values, x, y);
    values = next;
  }
  for (let pass = 0; pass < smoothPasses; pass++) {
    const next = new Float32Array(values.length);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) next[y * cols + x] = Number.isNaN(values[y * cols + x]) ? NaN : neighbours(values, x, y);
    }
    values = next;
  }
  return { cols, rows, values };
}

// The score at grid position (gx, gy), where (0, 0) is the middle of the
// top-left square. Empty squares are left out of the blend.
export function sampleGrid(grid, gx, gy) {
  const { cols, rows, values } = grid;
  const x0 = Math.max(0, Math.min(cols - 1, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(rows - 1, Math.floor(gy)));
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, gx - x0));
  const fy = Math.max(0, Math.min(1, gy - y0));
  const corners = [
    [values[y0 * cols + x0], (1 - fx) * (1 - fy)],
    [values[y0 * cols + x1], fx * (1 - fy)],
    [values[y1 * cols + x0], (1 - fx) * fy],
    [values[y1 * cols + x1], fx * fy],
  ];
  let sum = 0;
  let weight = 0;
  for (const [v, w] of corners) {
    if (Number.isNaN(v) || w <= 0) continue;
    sum += v * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : NaN;
}

// One colour band per pixel of the zone picture.
//   maxSide - the longest side of the picture in pixels (default 384)
export function renderZoneBands(zones, { maxSide = 384 } = {}) {
  const grid = prepareGrid(zones);
  if (!grid.cols || !grid.rows) return { width: 0, height: 0, bands: new Uint8Array(0) };
  const scale = Math.max(1, Math.floor(maxSide / Math.max(grid.cols, grid.rows)));
  const width = grid.cols * scale;
  const height = grid.rows * scale;
  const bands = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = (y + 0.5) / scale - 0.5;
    for (let x = 0; x < width; x++) {
      bands[y * width + x] = zoneBand(sampleGrid(grid, (x + 0.5) / scale - 0.5, gy));
    }
  }
  return { width, height, bands };
}
