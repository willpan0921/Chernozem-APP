// WHAT THIS FILE DOES
// The example farms, ready to load with one click ("Try an example:
// Ukraine · Iowa · Argentina"). Each is a set of REAL field outlines:
//   ukraine    Danny's 7 fields near Kupiansk (scripts/fields.geojson)
//   iowa       17 fields near Ames, Iowa, found by this app's field
//              detection on Earth Engine (examples/iowa.geojson)
//   argentina  18 fields near Chivilcoy, Buenos Aires province, found the
//              same way (examples/argentina.geojson)
// The fields are named "Field 1".."Field N" from north-west to south-east
// and carry NO crop: the first analysis detects each field's crop from its
// own satellite record, as for any farm (no made-up placeholder).
//
//   EXAMPLES                       the examples: { id: { file, label, name } }
//   exampleFarmParts(example)      -> { name, example, location, fields: [{ name, geometry, crop: null, cropSource: null, source: "demo" }] }
//   demoFarmParts()                the Ukraine example (the old name)
//   isDemoCrop(name, crop)         true when that crop is the placeholder an
//                                  older demo farm saved for that field name
//                                  (before cropSource existed)
//
// WHO EDITS IT
// Whoever changes the example farms. To change the outlines, edit the
// .geojson files (Polygon features with a "name").

import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../env.js";
import { bboxOf } from "../geo.js";
import { orderNorthWestFirst } from "./run.js";

export const DEMO_FILE = path.join(ROOT, "scripts", "fields.geojson");
const EXAMPLES_DIR = path.join(ROOT, "server", "field", "examples");

export const EXAMPLES = {
  ukraine: { file: DEMO_FILE, label: "Near Kupiansk, Ukraine", name: "Demo farm" },
  iowa: { file: path.join(EXAMPLES_DIR, "iowa.geojson"), label: "Near Ames, Iowa, USA", name: "Demo farm" },
  argentina: { file: path.join(EXAMPLES_DIR, "argentina.geojson"), label: "Near Chivilcoy, Argentina", name: "Demo farm" },
};
export const DEFAULT_EXAMPLE = "ukraine";

// The placeholder crops older demo farms saved (from the design mockups),
// before cropSource existed: a field saved with one of these is read as a
// demo placeholder (analysis.js cropSourceOf), replaced by the detected crop.
export const DEMO_CROPS = {
  "Field 1": "Winter wheat",
  "Field 2": "Sunflower",
  "Field 3": "Corn",
  "Field 4": "Sunflower",
  "Field 5": "Soybean",
  "Field 6": "Barley",
  "Field 7": "Winter wheat",
};

export function isDemoCrop(name, crop) {
  return Boolean(crop) && DEMO_CROPS[name] === crop;
}

const centroidOf = (geometry) => {
  const ring = geometry.coordinates[0].slice(0, -1);
  return [ring.reduce((s, p) => s + p[1], 0) / ring.length, ring.reduce((s, p) => s + p[0], 0) / ring.length];
};

// One example farm, ready for PUT-like saving (routes.js replaceFarm).
// Unknown example ids give an error with code "unknown_example".
export async function exampleFarmParts(example = DEFAULT_EXAMPLE) {
  const id = example == null || example === "" ? DEFAULT_EXAMPLE : String(example).toLowerCase();
  const spec = Object.hasOwn(EXAMPLES, id) ? EXAMPLES[id] : null;
  if (!spec) {
    const error = new Error(`example must be one of: ${Object.keys(EXAMPLES).join(", ")}.`);
    error.code = "unknown_example";
    throw error;
  }
  const collection = JSON.parse(await fs.readFile(spec.file, "utf8"));
  const polygons = (collection.features || []).filter((f) => f?.geometry?.type === "Polygon");
  // Named Field 1..N from north-west to south-east (the file's own names
  // are not trusted to be in that order).
  const fields = orderNorthWestFirst(polygons, (f) => centroidOf(f.geometry)).map((feature, i) => ({
    name: `Field ${i + 1}`,
    geometry: feature.geometry,
    crop: null,
    cropSource: null,
    source: "demo",
  }));
  const boxes = fields.map((field) => bboxOf(field.geometry));
  const west = Math.min(...boxes.map((b) => b[0]));
  const south = Math.min(...boxes.map((b) => b[1]));
  const east = Math.max(...boxes.map((b) => b[2]));
  const north = Math.max(...boxes.map((b) => b[3]));
  return {
    name: spec.name,
    example: id,
    location: { label: spec.label, lat: Math.round(((south + north) / 2) * 1e5) / 1e5, lon: Math.round(((west + east) / 2) * 1e5) / 1e5 },
    fields,
  };
}

export const demoFarmParts = () => exampleFarmParts(DEFAULT_EXAMPLE);
