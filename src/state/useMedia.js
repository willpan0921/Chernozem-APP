// WHAT THIS FILE DOES
// useMedia(query): true while a CSS media query matches, and the component
// draws again when that changes. For example useMedia("(max-width: 860px)")
// is true on a phone, where the pages stack.
//
// WHO EDITS IT
// Nobody, normally.

import { useEffect, useState } from "react";

export function useMedia(query) {
  const read = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
