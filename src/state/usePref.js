// WHAT THIS FILE DOES
// usePref(key, fallback, clean): like React's useState, but the value is
// remembered by this browser (localStorage, through src/lib/prefs.js), so a
// reload keeps it. Used for the side panels' widths and hidden state, the
// folded menu and "Satellite only".
//
//   const [collapsed, setCollapsed] = usePref("chernozem.nav.collapsed", false, cleanBoolean);
//
// The saved value is read once, when the component first draws, and passed
// through clean (src/lib/prefs.js, src/lib/panels.js): anything it does not
// accept gives the fallback. When storage is blocked or full the value still
// works for as long as the page is open; it is just not remembered.
//
// WHO EDITS IT
// Nobody, normally.

import { useCallback, useEffect, useRef, useState } from "react";
import { readPref, writePref } from "../lib/prefs.js";

export function usePref(key, fallback, clean) {
  const [value, setValue] = useState(() => readPref(key, fallback, clean));
  // Only a change is written (not the value read at the start).
  const changed = useRef(false);
  useEffect(() => {
    if (changed.current) writePref(key, value);
  }, [key, value]);
  const update = useCallback((next) => {
    changed.current = true;
    setValue(next);
  }, []);
  return [value, update];
}
