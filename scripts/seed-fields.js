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
// It signs in with the same service account key as scripts/fetch-ndvi.js
// (~/.config/chernozem/ndvi-key.json, or set NDVI_KEY_PATH), through
// firebase-admin. The app itself no longer reads Firestore.
//
// WHO EDITS IT
// Danny. To change an outline, edit fields.geojson (or draw it again in the
// Earth Engine Code Editor) and run this again.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const KEY_PATH = process.env.NDVI_KEY_PATH || join(homedir(), ".config", "chernozem", "ndvi-key.json");
let key;
try {
  key = JSON.parse(await readFile(KEY_PATH, "utf8"));
} catch {
  console.error(`No service account key at ${KEY_PATH}.`);
  console.error("Put the key there, or run with NDVI_KEY_PATH=/path/to/key.json");
  process.exit(1);
}
initializeApp({ credential: cert(key), projectId: key.project_id });
const db = getFirestore();

const outlines = JSON.parse(await readFile(new URL("./fields.geojson", import.meta.url), "utf8"));

for (const feature of outlines.features) {
  const { id, name } = feature.properties;
  await db.collection("fields").doc(id).set({ name, outline: JSON.stringify(feature.geometry) }, { merge: true });
  console.log(`Saved ${id}: ${name}`);
}

// Close the connection so the script can finish.
await db.terminate();
console.log(`Done. ${outlines.features.length} field outlines are in Firestore.`);
