// WHAT THIS FILE DOES
// What the app does when a new version went live while a tab was open.
// Each page's code is a separate file, downloaded the first time the page
// opens, and every build gives those files new names (the old ones are
// gone from the server). A tab still running the old version that opens a
// page it has not loaded yet asks for a file that no longer exists:
//
//   reloadForNewVersion(win)  reloads the page once, so the tab gets the
//                             new version (called by src/main.jsx when
//                             the build's loader says a file is missing).
//                             At most once per RELOAD_GAP_MS: if the file
//                             is still missing right after a reload (the
//                             server restarting, or a broken build), the
//                             page shows "A new version of Chernozem is
//                             live" with a Reload button instead of
//                             reloading again and again
//                             (src/layout/ErrorBoundary.jsx).
//   isMissingCodeError(error) true for that kind of error, in the words of
//                             Chrome, Firefox, Safari and Vite
//
// WHO EDITS IT
// Nobody, normally.

export const RELOAD_KEY = "chernozem.newVersionReloadAt";
export const RELOAD_GAP_MS = 30 * 1000;

const MISSING_CODE = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite, for a page's styles
  /loading (?:css )?chunk [\w-]+ failed/i,
];

export function isMissingCodeError(error) {
  const text = `${error?.message ?? ""} ${error?.payload?.message ?? ""}`;
  return MISSING_CODE.some((pattern) => pattern.test(text));
}

// True when no automatic reload happened within the last gapMs (lastAt:
// when the last one happened, from sessionStorage).
export function mayReload(lastAt, now = Date.now(), gapMs = RELOAD_GAP_MS) {
  const last = Number(lastAt);
  if (!Number.isFinite(last) || last <= 0) return true;
  return now - last >= gapMs || now < last;
}

// Reloads the page unless it was just reloaded for the same reason.
// Gives back true when it reloads. Without sessionStorage (blocked by the
// browser) it never reloads by itself: the page's Reload button remains.
export function reloadForNewVersion(win = globalThis.window, now = Date.now()) {
  let storage = null;
  try {
    storage = win?.sessionStorage ?? null;
  } catch {
    storage = null;
  }
  if (!storage) return false;
  try {
    if (!mayReload(storage.getItem(RELOAD_KEY), now)) return false;
    storage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  win.location.reload();
  return true;
}
