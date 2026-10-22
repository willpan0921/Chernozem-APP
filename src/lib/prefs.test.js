// WHAT THIS FILE DOES
// Checks that the choices the browser remembers (prefs.js) are read and
// written safely: a missing, broken or refusing localStorage never breaks a
// page, it only means the defaults are used.
// Run with: node --test "src/lib/**/*.test.js"
//
// WHO EDITS IT
// Whoever changes how the app remembers choices in the browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { browserStorage, cleanBoolean, readPref, writePref } from "./prefs.js";
import { cleanPanel } from "./panels.js";

// A small stand-in for localStorage.
function memoryStorage(start = {}) {
  const items = new Map(Object.entries(start));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

// A localStorage that refuses everything (blocked site data, private mode).
const refusing = {
  getItem() {
    throw new Error("SecurityError: access denied");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

test("a value written is read back the same", () => {
  const storage = memoryStorage();
  assert.equal(writePref("chernozem.panel.x", { width: 420, hidden: true }, storage), true);
  assert.equal(storage.items.get("chernozem.panel.x"), '{"width":420,"hidden":true}');
  assert.deepEqual(readPref("chernozem.panel.x", null, cleanPanel, storage), { width: 420, hidden: true });
  writePref("chernozem.nav.collapsed", true, storage);
  assert.equal(readPref("chernozem.nav.collapsed", false, cleanBoolean, storage), true);
});

test("nothing saved yet: the fallback", () => {
  assert.equal(readPref("chernozem.nothing", "fallback", undefined, memoryStorage()), "fallback");
});

test("a broken or unexpected saved value: the fallback", () => {
  const storage = memoryStorage({ a: "{not json", b: '"yes"', c: "[1,2]", d: "null" });
  assert.equal(readPref("a", false, cleanBoolean, storage), false);
  assert.equal(readPref("b", false, cleanBoolean, storage), false);
  assert.deepEqual(readPref("c", { width: null, hidden: false }, cleanPanel, storage), { width: null, hidden: false });
  assert.deepEqual(readPref("d", { width: null, hidden: false }, cleanPanel, storage), { width: null, hidden: false });
});

test("a localStorage that throws never breaks reading or writing", () => {
  assert.equal(readPref("chernozem.nav.collapsed", false, cleanBoolean, refusing), false);
  assert.equal(writePref("chernozem.nav.collapsed", true, refusing), false);
});

test("no localStorage at all: defaults, and writes report that they did not happen", () => {
  assert.equal(readPref("chernozem.nav.collapsed", true, cleanBoolean, null), true);
  assert.equal(writePref("chernozem.nav.collapsed", true, null), false);
});

test("browserStorage gives null outside a browser and when the browser refuses access", () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    delete globalThis.window;
    assert.equal(browserStorage(), null);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.defineProperty({}, "localStorage", {
        get() {
          throw new Error("SecurityError: The operation is insecure.");
        },
      }),
    });
    assert.equal(browserStorage(), null);
    // With the default storage a refusing browser still reads the fallback.
    assert.equal(readPref("chernozem.nav.collapsed", false, cleanBoolean), false);
    assert.equal(writePref("chernozem.nav.collapsed", true), false);
    const storage = memoryStorage();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
    assert.equal(browserStorage(), storage);
    assert.equal(writePref("chernozem.nav.collapsed", true), true);
    assert.equal(readPref("chernozem.nav.collapsed", false, cleanBoolean), true);
  } finally {
    if (before) Object.defineProperty(globalThis, "window", before);
    else delete globalThis.window;
  }
});

test("cleanBoolean only accepts true and false", () => {
  assert.equal(cleanBoolean(true), true);
  assert.equal(cleanBoolean(false), false);
  for (const value of ["true", 1, 0, null, undefined, {}]) assert.equal(cleanBoolean(value), undefined);
});
