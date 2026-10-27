// WHAT THIS FILE DOES
// Tests src/lib/staleChunks.js: after a new version went live, a tab still
// running the old one reloads once by itself when a page's code is gone,
// never again and again, and never at all when the browser blocks
// sessionStorage. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes src/lib/staleChunks.js.

import test from "node:test";
import assert from "node:assert/strict";
import { RELOAD_GAP_MS, RELOAD_KEY, isMissingCodeError, mayReload, reloadForNewVersion } from "./staleChunks.js";

// A stand-in for the browser window.
function fakeWindow({ storage = new Map(), blocked = false, throwing = false } = {}) {
  const win = { reloads: 0, location: { reload: () => (win.reloads += 1) } };
  Object.defineProperty(win, "sessionStorage", {
    get() {
      if (blocked) throw new Error("SecurityError: access denied");
      return {
        getItem: (key) => {
          if (throwing) throw new Error("no storage");
          return storage.has(key) ? storage.get(key) : null;
        },
        setItem: (key, value) => {
          if (throwing) throw new Error("QuotaExceededError");
          storage.set(key, String(value));
        },
      };
    },
  });
  return win;
}

test("the errors of a page whose code is gone, in each browser's words", () => {
  for (const message of [
    "Failed to fetch dynamically imported module: https://chernozem.app/assets/OverviewPage-o4QUHTuk.js",
    "error loading dynamically imported module: https://chernozem.app/assets/MapPage-abc.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/MapPage-abc.css",
  ]) {
    assert.equal(isMissingCodeError(new TypeError(message)), true, message);
  }
  assert.equal(isMissingCodeError({ payload: new Error("Unable to preload CSS for /assets/x.css") }), true, "Vite's event");
  assert.equal(isMissingCodeError(new Error("Cannot read properties of undefined (reading 'map')")), false);
  assert.equal(isMissingCodeError(null), false);
  assert.equal(isMissingCodeError(undefined), false);
});

test("an automatic reload at most once per gap", () => {
  const now = 1_000_000_000;
  assert.equal(mayReload(null, now), true, "never reloaded");
  assert.equal(mayReload("", now), true);
  assert.equal(mayReload("junk", now), true);
  assert.equal(mayReload(String(now - 5000), now), false, "just reloaded");
  assert.equal(mayReload(String(now - RELOAD_GAP_MS), now), true);
  assert.equal(mayReload(String(now + 60_000), now), true, "a time in the future (the clock was changed)");
  assert.equal(RELOAD_GAP_MS, 30_000);
});

test("reloads once, then lets the page say it instead of reloading again and again", () => {
  const storage = new Map();
  const win = fakeWindow({ storage });
  const now = 2_000_000_000;
  assert.equal(reloadForNewVersion(win, now), true);
  assert.equal(win.reloads, 1);
  assert.equal(storage.get(RELOAD_KEY), String(now));
  // The file is still missing right after the reload (the server restarting).
  assert.equal(reloadForNewVersion(win, now + 3000), false);
  assert.equal(win.reloads, 1);
  // Another new version, much later: reloads again.
  assert.equal(reloadForNewVersion(win, now + RELOAD_GAP_MS + 1), true);
  assert.equal(win.reloads, 2);
});

test("without sessionStorage it never reloads by itself (the Reload button remains)", () => {
  for (const options of [{ blocked: true }, { throwing: true }]) {
    const win = fakeWindow(options);
    assert.equal(reloadForNewVersion(win, 3_000_000_000), false, JSON.stringify(options));
    assert.equal(win.reloads, 0);
  }
  assert.equal(reloadForNewVersion(undefined), false, "no window at all");
});
