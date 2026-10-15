// WHAT THIS FILE DOES
// Copies the five example notes from src/data/farm.js into Firestore, so the
// Notes page has something to show. Run it from the project folder with:
//
//   node scripts/seed-notes.js
//
// It is safe to run again: each example note keeps its id ("note-1"...), so
// running it twice overwrites the same five notes instead of adding copies.
// Notes people added in the app are left alone.
//
// WHO EDITS IT
// Danny. Nobody needs it once the farm has real notes.

import { doc, setDoc, terminate } from "firebase/firestore";
import { db } from "../src/api/firebase.js";
import { STORED_FIELDS } from "../src/api/notesApi.js";
import { notes } from "../src/data/farm.js";

for (const note of notes) {
  // Keep only the basic facts; the app works out the rest.
  const saved = Object.fromEntries(
    STORED_FIELDS.filter((key) => note[key] !== undefined).map((key) => [key, note[key]])
  );
  await setDoc(doc(db, "notes", note.id), saved);
  console.log(`Saved ${note.id}: ${note.title}`);
}

// Close the connection so the script can finish.
await terminate(db);
console.log(`Done. ${notes.length} example notes are in Firestore.`);
