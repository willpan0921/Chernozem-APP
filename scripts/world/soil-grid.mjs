// WHAT THIS FILE DOES
// Builds world grids of black soil and cropland by sampling Earth Engine tile by tile
// (the service account may compute values but not make thumbnails).
//   node scripts/world/soil-grid.mjs <repo> <outDir> <degreesPerPixel> [onlyFirstTile]
// See scripts/world/README.md.
//
// WHO EDITS IT
// Nobody, normally.
// Writes <name>-<w>x<h>.bin (one byte per pixel, rows from north to south) for each layer.
import ee from "@google/earthengine";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [repo, outDir, degArg, onlyFirst] = process.argv.slice(2);
const DEG = Number(degArg);
const W = Math.round(360 / DEG), H = Math.round(180 / DEG);
const key = JSON.parse(readFileSync(process.env.HOME + "/.config/chernozem/service-account.json", "utf8"));
const { BLACK_SOIL } = await import(pathToFileURL(resolve(repo, "server/providers/gee.js")).href);
await new Promise((resolve, reject) => ee.data.authenticateViaPrivateKey(key, () => ee.initialize(null, null, resolve, reject, null, "chernozem-danny"), reject));
const gg = ee.Image("OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01").select("grtgroup");
const layers = {
  blacksoil: gg.remap(BLACK_SOIL.classes, BLACK_SOIL.classes.map(() => 100), 0).unmask(0),
  cropland: ee.Image("COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019").select("crops-coverfraction").unmask(0),
};
// Tiles of at most 262,144 pixels (sampleRectangle's limit).
const TILE_W = Math.min(W, 480), TILE_H = Math.min(H, 480);
const tiles = [];
for (let ty = 0; ty < H; ty += TILE_H) for (let tx = 0; tx < W; tx += TILE_W) tiles.push({ tx, ty, w: Math.min(TILE_W, W - tx), h: Math.min(TILE_H, H - ty) });
const compute = (obj) => new Promise((resolve, reject) => obj.evaluate((value, error) => (error ? reject(new Error(error)) : resolve(value))));
for (const [name, image] of Object.entries(layers)) {
  const grid = new Uint8Array(W * H);
  const started = Date.now();
  for (const [i, t] of tiles.entries()) {
    if (onlyFirst && i > 0) break;
    const west = -180 + t.tx * DEG, north = 90 - t.ty * DEG;
    const region = ee.Geometry.Rectangle([west, north - t.h * DEG, west + t.w * DEG, north], "EPSG:4326", false);
    const img = image.rename("v").toFloat().reproject({ crs: "EPSG:4326", crsTransform: [DEG, 0, -180, 0, -DEG, 90] });
    let feature;
    for (let attempt = 0; ; attempt++) {
      try { feature = await compute(img.sampleRectangle({ region, defaultValue: 0 })); break; }
      catch (e) { if (attempt >= 2) throw e; console.log(name, "tile", i, "retry:", e.message.slice(0, 120)); }
    }
    const rows = feature.properties.v;
    for (let y = 0; y < rows.length && y < t.h; y++) for (let x = 0; x < rows[y].length && x < t.w; x++) grid[(t.ty + y) * W + t.tx + x] = Math.max(0, Math.min(255, Math.round(rows[y][x] * 2.55)));
    console.log(name, `tile ${i + 1}/${tiles.length}`, `${t.w}x${t.h}`, `${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  writeFileSync(`${outDir}/${name}-${W}x${H}.bin`, grid);
}
process.exit(0);
