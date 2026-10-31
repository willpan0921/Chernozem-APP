// Tests for src/lib/demoMode.js: the tab remembers the demo, tells the
// server, and fails quietly when the browser has no sessionStorage.

import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_VIEW_HEADER, demoHeaders, enterDemo, isDemoView, leaveDemo } from "./demoMode.js";

function fakeSessionStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("entering and leaving the demo, and the header it sends", () => {
  globalThis.window = { sessionStorage: fakeSessionStorage() };
  try {
    assert.equal(isDemoView(), false);
    assert.deepEqual(demoHeaders(), {});
    enterDemo();
    assert.equal(isDemoView(), true);
    assert.deepEqual(demoHeaders(), { [DEMO_VIEW_HEADER]: "demo" });
    assert.equal(DEMO_VIEW_HEADER, "X-Chernozem-View");
    leaveDemo();
    assert.equal(isDemoView(), false);
    assert.deepEqual(demoHeaders(), {});
  } finally {
    delete globalThis.window;
  }
});

test("no window or a storage that throws: never in the demo view, no errors", () => {
  assert.equal(isDemoView(), false);
  enterDemo();
  leaveDemo();
  globalThis.window = {
    get sessionStorage() {
      throw new Error("blocked");
    },
  };
  try {
    enterDemo();
    assert.equal(isDemoView(), false);
    assert.deepEqual(demoHeaders(), {});
  } finally {
    delete globalThis.window;
  }
});
