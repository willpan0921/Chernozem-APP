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
// Danny. The Fields page uses listenToFieldOutlines().

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
