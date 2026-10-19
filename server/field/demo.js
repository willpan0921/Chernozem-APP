// WHAT THIS FILE DOES
// The demo farm: Danny's 7 real field outlines near Kupiansk
// (scripts/fields.geojson), with their names and crops, ready to load with
// one click ("Try the demo farm").
//
//   demoFarmParts() -> { name, location, fields: [{ name, geometry, crop, source: "demo" }] }
//
// WHO EDITS IT
// Whoever changes the demo farm. To change the outlines, edit
// scripts/fields.geojson; to change a crop, edit DEMO_CROPS below.

import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../env.js";
import { bboxOf } from "../geo.js";

export const DEMO_FILE = path.join(ROOT, "scripts", "fields.geojson");

// The crops the demo farm grows (as in the design mockups). Field 7 was
// planned for winter wheat but has not been sown since it was shelled.
const DEMO_CROPS = {
  "Field 1": "Winter wheat",
  "Field 2": "Sunflower",
  "Field 3": "Corn",
  "Field 4": "Sunflower",
  "Field 5": "Soybean",
  "Field 6": "Barley",
  "Field 7": "Winter wheat",
};

export async function demoFarmParts() {
  const collection = JSON.parse(await fs.readFile(DEMO_FILE, "utf8"));
  const features = (collection.features || []).filter((f) => f?.geometry?.type === "Polygon");
  const fields = features.map((feature, i) => {
    const name = String(feature.properties?.name || `Field ${i + 1}`).slice(0, 60);
    return { name, geometry: feature.geometry, crop: DEMO_CROPS[name] || null, source: "demo" };
  });
  const boxes = fields.map((field) => bboxOf(field.geometry));
  const west = Math.min(...boxes.map((b) => b[0]));
  const south = Math.min(...boxes.map((b) => b[1]));
  const east = Math.max(...boxes.map((b) => b[2]));
  const north = Math.max(...boxes.map((b) => b[3]));
  return {
    name: "Demo farm",
    location: { label: "Near Kupiansk, Kharkiv region, Ukraine", lat: Math.round(((south + north) / 2) * 1e5) / 1e5, lon: Math.round(((west + east) / 2) * 1e5) / 1e5 },
    fields,
  };
}
