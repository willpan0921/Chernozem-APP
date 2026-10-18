// WHAT THIS FILE DOES
// Remembers what the regional office types or ticks in the Atlas: the
// spring budget, which next steps are done, and so on. Right now it saves
// them in this browser only (localStorage), so they survive a refresh but
// are not shared with colleagues.
//
// TO SHARE THEM ACROSS THE TEAM
// Replace the inside of loadOffice and saveOffice with calls to the
// database (Firebase, like src/api/notesApi.js on Danny's branch). The
// pages use useOfficeValue() and do not need to change.
//
// WHO EDITS IT
// Whoever connects office data to the database.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "chernozem.atlas.office";

// What a brand-new office starts with.
export const OFFICE_DEFAULTS = {
  springBudgetUsd: 10000000,
  doneSteps: [],
};

function loadOffice() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...OFFICE_DEFAULTS, ...saved };
  } catch {
    return { ...OFFICE_DEFAULTS };
  }
}

function saveOffice(office) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(office));
  } catch {
    // Private windows can refuse storage; the value still works until refresh.
  }
}

// Every component using the same value hears about changes.
const listeners = new Set();

// Reads one office value and gives a function to change it, like useState.
//   const [budget, setBudget] = useOfficeValue("springBudgetUsd");
export function useOfficeValue(key) {
  const [value, setValue] = useState(() => loadOffice()[key]);

  useEffect(() => {
    const listener = (office) => setValue(office[key]);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, [key]);

  const update = useCallback(
    (next) => {
      const office = loadOffice();
      office[key] = typeof next === "function" ? next(office[key]) : next;
      saveOffice(office);
      listeners.forEach((listener) => listener(office));
    },
    [key]
  );

  return [value, update];
}
