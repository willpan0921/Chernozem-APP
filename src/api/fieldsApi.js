// WHAT THIS FILE DOES
// The one place the app reads the farm's fields from Firestore, in the
// collection called "fields" (one document per field: "field-1"...).
//
// For now Firestore holds only each field's name and real outline (drawn in
// the Earth Engine Code Editor, copied in by scripts/seed-fields.js). The
// crop, status and every number on the Fields page still come from
// src/data/farm.js, matched by the field's id.
//
// Firestore cannot store a list inside a list, so the outline is saved as
// GeoJSON text. This file turns it back into a GeoJSON Polygon, whose
// corners are [longitude, latitude] pairs.
//
// WHO EDITS IT
// Danny. The Fields page and the sidebar use useFieldOutlines(), and
// fieldAreaHa() / farmAreaHa() for the real hectares.

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase.js";

const fieldsCollection = collection(db, "fields");

// Starts listening to the field outlines. "onOutlines" is called right away
// with an object keyed by field id, e.g. { "field-1": { type: "Polygon",
// coordinates: [...] } }, and again whenever an outline changes. A field
// whose outline cannot be read is left out. Returns a function that stops
// listening (call it when the page closes).
export function listenToFieldOutlines(onOutlines, onError) {
  return onSnapshot(
    fieldsCollection,
    (snapshot) => {
      const outlines = {};
      for (const doc of snapshot.docs) {
        try {
          outlines[doc.id] = JSON.parse(doc.data().outline);
        } catch (error) {
          console.error(`[fields] The outline of ${doc.id} is not valid GeoJSON:`, error);
        }
      }
      onOutlines(outlines);
    },
    onError
  );
}

// For pages: the outlines (keyed by field id) and whether they are still
// loading ("loading", "ready" or "error"). Listens while the page is open.
export function useFieldOutlines() {
  const [outlines, setOutlines] = useState({});
  const [status, setStatus] = useState("loading");

  useEffect(
    () =>
      listenToFieldOutlines(
        (latest) => {
          setOutlines(latest);
          setStatus("ready");
        },
        (error) => {
          console.error("[fields] Could not load field outlines:", error);
          setStatus("error");
        }
      ),
    []
  );

  return { outlines, status };
}

/* -------------------------------------------------------------------------
   AREA
   The area inside an outline, measured on the curved Earth (the same
   formula as the Turf map library). It matches Earth Engine's area() to
   within a fraction of a hectare.
   ------------------------------------------------------------------------- */

const EARTH_RADIUS_M = 6378137;
const SQUARE_METRES_PER_HA = 10000;

// The area of one outline (a GeoJSON Polygon) in hectares. Holes, if a
// field ever has one, are taken away.
export function fieldAreaHa(outline) {
  const [outer, ...holes] = outline.coordinates;
  const squareMetres = holes.reduce((total, hole) => total - ringArea(hole), ringArea(outer));
  return squareMetres / SQUARE_METRES_PER_HA;
}

// The total area of every outline in hectares.
export function farmAreaHa(outlines) {
  return Object.values(outlines).reduce((total, outline) => total + fieldAreaHa(outline), 0);
}

// The area inside one ring of [longitude, latitude] corners, in square
// metres.
function ringArea(ring) {
  const n = ring.length;
  if (n < 3) return 0;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const before = ring[i];
    const middle = ring[(i + 1) % n];
    const after = ring[(i + 2) % n];
    total += (toRadians(after[0]) - toRadians(before[0])) * Math.sin(toRadians(middle[1]));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}
