// WHAT THIS FILE DOES
// Copies the real field outlines from scripts/fields.geojson into Firestore,
// one document per field in the "fields" collection ("field-1"...). Both the
// app's map and the Earth Engine script read the outlines from there. Run it
// from the project folder with:
//
//   node scripts/seed-fields.js
//
// Firestore cannot store a list inside a list, which is how outline
// coordinates are written, so each outline is saved as text (a GeoJSON
// Polygon) in "outline". The app turns it back into a shape when it reads it.
//
// It is safe to run again: it only replaces "name" and "outline", so anything
// else saved on a field (NDVI readings later) is left alone.
//
// WHO EDITS IT
// Danny. To change an outline, edit fields.geojson (or draw it again in the
// Earth Engine Code Editor) and run this again.

import { readFile } from "node:fs/promises";
import { doc, setDoc, terminate } from "firebase/firestore";
import { db } from "../src/api/firebase.js";

const outlines = JSON.parse(await readFile(new URL("./fields.geojson", import.meta.url), "utf8"));

for (const feature of outlines.features) {
  const { id, name } = feature.properties;
  await setDoc(doc(db, "fields", id), { name, outline: JSON.stringify(feature.geometry) }, { merge: true });
  console.log(`Saved ${id}: ${name}`);
}

// Close the connection so the script can finish.
await terminate(db);
console.log(`Done. ${outlines.features.length} field outlines are in Firestore.`);
