// WHAT THIS FILE DOES
// Tests for server/env.js: settings read from the environment.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever adds a setting to env.js.

import test from "node:test";
import assert from "node:assert/strict";

const { config } = await import("./env.js");

test("a blank GEE_CHERNOZEM_ASSET turns the black-soil map off", () => {
  process.env.GEE_CHERNOZEM_ASSET = "";
  assert.equal(config().chernozemAsset, "none");
  process.env.GEE_CHERNOZEM_ASSET = "  projects/x/assets/y ";
  assert.equal(config().chernozemAsset, "projects/x/assets/y");
});
