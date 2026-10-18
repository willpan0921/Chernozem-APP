// WHAT THIS FILE DOES
// The one place the app reads and saves scouting notes. The notes live in
// Firestore, in a collection called "notes" (one document per note).
//
// Firestore keeps only the basic facts of a note (see STORED_FIELDS). Things
// the page shows but that can be worked out, like "Sep 27", the field's name
// or "3 photos", are worked out here by toPageNote(). So a new note only
// needs the basics, and the Notes page gets every note in the same shape.
//
// WHO EDITS IT
// Danny. The Notes page uses listenToNotes(), noteCategoriesFor() and
// addNote(). To add a fact to every note, add it to STORED_FIELDS and to
// toPageNote().

import { addDoc, collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase.js";
import { fieldById, noteCategoryStyles } from "../data/farm.js";

const notesCollection = collection(db, "notes");

// The facts saved in Firestore for each note. Everything else the page shows
// is worked out from these. "date" is "2026-09-27" and "time" is "10:42".
export const STORED_FIELDS = [
  "category",
  "fieldId",
  "date",
  "time",
  "title",
  "fullTitle",
  "summary",
  "body",
  "photos",
  "thumb",
  "flag",
  "satelliteNote",
  "location",
  "addedFrom",
  "tags",
];

// Starts listening to the notes. "onNotes" is called right away with every
// note, newest first, and again whenever a note is added or changed. Returns
// a function that stops listening (call it when the page closes).
export function listenToNotes(onNotes, onError) {
  return onSnapshot(
    notesCollection,
    (snapshot) => {
      const notes = snapshot.docs.map((doc) => toPageNote({ id: doc.id, ...doc.data() }));
      notes.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
      onNotes(notes);
    },
    onError
  );
}

// Saves a new note typed in the app and returns its id. "note" holds the
// fieldId, category, title and body from the form; the date and time are
// added here, from the computer's clock.
export async function addNote({ fieldId, category, title, body }) {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  const saved = await addDoc(notesCollection, {
    fieldId,
    category,
    title: title.trim(),
    body: body.trim(),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    addedFrom: "Typed in the app",
  });
  return saved.id;
}

// The category pills for a list of notes, with how many notes each holds.
// Ready for the Tabs block: { id, label, count }.
export function noteCategoriesFor(notes) {
  return [
    { id: "all", label: "All", count: notes.length },
    ...Object.keys(noteCategoryStyles).map((category) => ({
      id: category,
      label: category,
      count: notes.filter((note) => note.category === category).length,
    })),
  ];
}

// Turns a note as saved in Firestore into the note the page draws. Missing
// facts get a safe empty value, so a short note never breaks the page.
function toPageNote(saved) {
  const field = fieldById(saved.fieldId);
  const photos = saved.photos || [];
  const title = saved.title || "Untitled note";
  const body = saved.body || "";
  const day = saved.date ? new Date(`${saved.date}T00:00:00`) : null;

  return {
    id: saved.id,
    category: saved.category,
    fieldId: saved.fieldId,
    fieldName: field?.name || "No field",
    fieldCrop: field?.crop || "",
    date: saved.date || "",
    time: saved.time || "",
    dateDisplay: day ? day.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
    fullDateDisplay: day
      ? [day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), saved.time]
          .filter(Boolean)
          .join(" · ")
      : "",
    title,
    fullTitle: saved.fullTitle || title,
    summary: saved.summary || body,
    body,
    photos,
    photoCount: photos.length,
    photoCountDisplay: photos.length === 0 ? "" : photos.length === 1 ? "1 photo" : `${photos.length} photos`,
    thumb: saved.thumb || null,
    flag: saved.flag || null,
    satelliteNote: saved.satelliteNote || null,
    location: saved.location || "",
    addedFrom: saved.addedFrom || "",
    tags: saved.tags || [],
  };
}
