// WHAT THIS FILE DOES
// Small choices this browser remembers for the person using it: how wide
// they dragged a side panel and whether they hid it, whether the menu is
// folded to icons, whether a map shows the satellite picture only. They are
// kept in the browser's localStorage, under names that start "chernozem.".
// Nothing here is sent to the server or shared with the team.
//
// Storage can be missing or refuse to work (a private window, blocked site
// data, a full disk): every read and write here is wrapped, so the app then
// simply uses its defaults and forgets the choice when the page closes.
//
//   browserStorage()                         the browser's localStorage, or null
//   readPref(key, fallback, clean, storage)  the saved value (passed through
//                                            clean, which gives undefined for a
//                                            value it does not accept), else
//                                            the fallback
//   writePref(key, value, storage)           saves it; false when it could not
//   cleanBoolean(value)                      true / false, else undefined
//
// Plain functions, tested in prefs.test.js. The React side is
// src/state/usePref.js.
//
// WHO EDITS IT
// Nobody, normally.

export function browserStorage() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    // Reading window.localStorage itself throws when site data is blocked.
    return null;
  }
}

export function readPref(key, fallback, clean = (value) => value, storage = browserStorage()) {
  try {
    if (!storage) return fallback;
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const value = clean(JSON.parse(raw));
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writePref(key, value, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const cleanBoolean = (value) => (typeof value === "boolean" ? value : undefined);
