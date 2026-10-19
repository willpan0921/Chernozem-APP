// WHAT THIS FILE DOES
// Checks the data-source switch (index.js): when Earth Engine is set up but
// cannot connect, jobs stop with a retryable "Earth Engine unavailable"
// error instead of saving sample numbers for real places. Run with: npm test
//
// WHO EDITS IT
// Whoever changes how the data source is picked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldUnavailableError, resetFieldProvider, resetProvider, unavailableError } from "./index.js";

test("Earth Engine set up but unreachable: jobs stop with a retryable error, never sample data", () => {
  for (const [state, check, reset] of [
    [globalThis.__chernozemProvider, unavailableError, resetProvider],
    [globalThis.__chernozemFieldProvider, fieldUnavailableError, resetFieldProvider],
  ]) {
    reset();
    // Sample data on purpose (not set up): no error.
    assert.equal(check({ id: "sample" }), null);
    // Set up but could not connect: the sample provider is handed back for
    // the status pages, but a job must not use it.
    Object.assign(state, { fallback: true, detail: "Earth Engine is set up but could not connect: timeout." });
    const error = check({ id: "sample" });
    assert.equal(error.code, "gee_unavailable");
    assert.equal(error.status, 503);
    assert.equal(error.retryable, true);
    assert.match(error.message, /Try again/);
    // Connected: no error.
    assert.equal(check({ id: "gee" }), null);
    reset();
  }
});
