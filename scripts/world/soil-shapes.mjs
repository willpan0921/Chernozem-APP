// WHAT THIS FILE DOES
// Writes public/site/world/black-soil.json from the 0.1 degree grid with earthMath.js's SOIL_RECIPE.
//   node scripts/world/soil-shapes.mjs <repo> <grid.bin>
// See scripts/world/README.md.
//
// WHO EDITS IT
// Nobody, normally.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [repo, bin] = process.argv.slice(2);
const M = await import(pathToFileURL(`${repo}/src/site/components/earthMath.js`).href);
const geometry = M.soilShapes(readFileSync(bin), 3600, 1800, M.SOIL_RECIPE);
const doc = {
  type: "Feature",
  properties: {
    what: "Black soil: where at least 30% of the land is one of the soils Chernozem counts as black soil (Mollisols, except the cold and bleached ones)",
    source: "OpenLandMap USDA great groups (Hengl and Nauman, 2018), https://doi.org/10.5281/zenodo.1476844",
    licence: "CC BY-SA 4.0, modified, https://creativecommons.org/licenses/by-sa/4.0/; these shapes are shared under the same licence",
    made: "2026-11-01 with soilShapes in src/site/components/earthMath.js",
    recipe: M.SOIL_RECIPE,
  },
  geometry,
};
const text = JSON.stringify(doc);
writeFileSync(`${repo}/public/site/world/black-soil.json`, text);
console.log("black-soil.json", text.length, "bytes,", geometry.coordinates.length, "shapes");
