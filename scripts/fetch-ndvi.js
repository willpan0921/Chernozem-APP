// WHAT THIS FILE DOES
// Gets real NDVI (plant health) for every field from Earth Engine and saves
// it to Firestore. Run it from the project folder with:
//
//   node scripts/fetch-ndvi.js               (every pass since 1 April)
//   node scripts/fetch-ndvi.js 2026-09-01    (every pass since that date)
//
// For each field in the Firestore "fields" collection it:
//   1. reads the field's outline,
//   2. finds every Sentinel-2 pass over it (COPERNICUS/S2_SR_HARMONIZED)
//      and hides cloudy pixels with Google's Cloud Score+ mask,
//   3. works out the average NDVI over the clear part of the field and how
//      much of the field was clear,
//   4. saves one reading per day in fields/<id>/readings/<YYYY-MM-DD>, and
//      the newest clear reading on the field itself as "latestNdvi".
// A pass where less than half the field was clear is saved as "cloudy",
// with no NDVI. Running it again just overwrites the same days.
//
// It signs in with the service account key, which must never be in the
// project folder. By default it looks in ~/.config/chernozem/ndvi-key.json;
// set NDVI_KEY_PATH to use another place. The key signs in past Firestore's
// rules, so the script keeps working when test mode ends.
//
// WHO EDITS IT
// Danny. The settings below change what counts as "clear".

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import ee from "@google/earthengine";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const KEY_PATH = process.env.NDVI_KEY_PATH || join(homedir(), ".config", "chernozem", "ndvi-key.json");

// First day to look at ("2026-04-01"), from the command line or 1 April.
const START_DATE = process.argv[2] || `${new Date().getFullYear()}-04-01`;

// A pixel counts as clear when its Cloud Score+ value is at least this
// (0 = surely cloud, 1 = surely clear). 0.6 is Google's suggested start.
const CLEAR_PIXEL_SCORE = 0.6;
// A pass counts only when at least this share of the field was clear.
const MIN_CLEAR_SHARE = 0.5;

/* -------------------------------------------------------------------------
   SIGN IN
   ------------------------------------------------------------------------- */

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

await new Promise((resolve, reject) =>
  ee.data.authenticateViaPrivateKey(key, resolve, (error) => reject(new Error(`Earth Engine sign-in failed: ${error}`)))
);
await new Promise((resolve, reject) =>
  ee.initialize(null, null, resolve, (error) => reject(new Error(`Earth Engine start failed: ${error}`)), null, key.project_id)
);

/* -------------------------------------------------------------------------
   EARTH ENGINE
   ------------------------------------------------------------------------- */

// Every Sentinel-2 pass over one outline, as a list of
// { date, ndvi, clear } where "clear" is the share of the field (0 to 1)
// that was clear and inside the picture.
function fetchPasses(outline) {
  const area = ee.Geometry(outline);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const passes = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(area)
    .filterDate(START_DATE, tomorrow)
    .linkCollection(ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED"), ["cs"])
    .map((image) => {
      const clear = image.select("cs").gte(CLEAR_PIXEL_SCORE);
      const ndvi = image.normalizedDifference(["B8", "B4"]).updateMask(clear);
      const meanOverField = (picture) =>
        picture.reduceRegion({ reducer: ee.Reducer.mean(), geometry: area, scale: 10, maxPixels: 1e8 });
      return ee.Feature(null, {
        date: image.date().format("YYYY-MM-dd"),
        ndvi: meanOverField(ndvi).get("nd"),
        // Pixels outside the picture count as not clear.
        clear: meanOverField(clear.unmask(0)).get("cs"),
      });
    });

  return new Promise((resolve, reject) =>
    ee.FeatureCollection(passes).evaluate((result, error) =>
      error ? reject(new Error(error)) : resolve(result.features.map((feature) => feature.properties))
    )
  );
}

/* -------------------------------------------------------------------------
   SAVE
   ------------------------------------------------------------------------- */

// One reading per day. Where two pictures cover the same day (the field
// sits where two satellite tiles overlap), keep the clearer one.
function oneReadingPerDay(passes) {
  const byDate = new Map();
  for (const pass of passes) {
    const kept = byDate.get(pass.date);
    if (!kept || (pass.clear ?? 0) > (kept.clear ?? 0)) byDate.set(pass.date, pass);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function saveReadings(fieldId, readings) {
  const fieldRef = db.collection("fields").doc(fieldId);
  const batch = db.batch();
  let latest = null;

  for (const reading of readings) {
    const clearShare = reading.clear ?? 0;
    const usable = clearShare >= MIN_CLEAR_SHARE && reading.ndvi != null;
    const ndvi = usable ? Math.round(reading.ndvi * 1000) / 1000 : null;
    batch.set(fieldRef.collection("readings").doc(reading.date), {
      date: reading.date,
      source: "Sentinel-2",
      status: usable ? "ok" : "cloudy",
      ndvi,
      clearPct: Math.round(clearShare * 100),
      fetchedAt: FieldValue.serverTimestamp(),
    });
    if (usable) latest = { date: reading.date, value: ndvi };
  }

  if (latest) batch.set(fieldRef, { latestNdvi: latest }, { merge: true });
  await batch.commit();
  return latest;
}

/* -------------------------------------------------------------------------
   RUN
   ------------------------------------------------------------------------- */

console.log(`Getting NDVI since ${START_DATE}…`);
const fields = await db.collection("fields").get();

for (const field of fields.docs) {
  const outline = JSON.parse(field.data().outline);
  const readings = oneReadingPerDay(await fetchPasses(outline));
  const latest = await saveReadings(field.id, readings);
  const clearCount = readings.filter((reading) => (reading.clear ?? 0) >= MIN_CLEAR_SHARE).length;
  console.log(
    `${field.id}: ${readings.length} passes, ${clearCount} clear` +
      (latest ? `, latest NDVI ${latest.value.toFixed(2)} on ${latest.date}` : ", no clear pass yet")
  );
}

console.log("Done.");
// Firebase keeps its connection open; close it so the script finishes.
process.exit(0);
