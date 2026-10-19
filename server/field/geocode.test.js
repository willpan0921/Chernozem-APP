// WHAT THIS FILE DOES
// Tests for server/field/geocode.js: typed coordinates are read without the
// internet, place names go to Nominatim politely (User-Agent, cached).
// Run with "npm test".
//
// WHO EDITS IT
// Whoever changes geocode.js.

import test from "node:test";
import assert from "node:assert/strict";
import { geocode, parseCoordinates, shortLabel } from "./geocode.js";

test("typed coordinates in the usual forms", () => {
  const want = { lat: 49.74, lon: 37.54 };
  for (const text of ["49.74, 37.54", "49.74 37.54", "49.74,37.54", "49.74N 37.54E", "49.74 N, 37.54 E", "37.54E 49.74N"]) {
    assert.deepEqual(parseCoordinates(text), want, text);
  }
  assert.deepEqual(parseCoordinates("33.86S 151.2E"), { lat: -33.86, lon: 151.2 });
  assert.deepEqual(parseCoordinates("-33.86, 151.2"), { lat: -33.86, lon: 151.2 });
  assert.deepEqual(parseCoordinates(`49°44'24"N 37°32'24"E`), { lat: 49.74, lon: 37.54 });
  for (const text of ["Kupiansk", "91, 10", "10, 200", "49.74N 37.54N", "", "2024 harvest"]) assert.equal(parseCoordinates(text), null, text);
});

test("coordinates never call Nominatim", async () => {
  let calls = 0;
  const results = await geocode("49.74, 37.54", { fetchImpl: async () => (calls += 1) });
  assert.equal(calls, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].lat, 49.74);
  assert.equal(results[0].bbox.length, 4);
});

test("place names go to Nominatim with our User-Agent and are cached", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, ua: options.headers["User-Agent"] });
    return {
      ok: true,
      json: async () => [
        { display_name: "Kupiansk, Kupiansk Hromada, Kupiansk Raion, Kharkiv Oblast, 63700, Ukraine", lat: "49.7132963", lon: "37.6141992", boundingbox: ["49.6753465", "49.7446573", "37.5725231", "37.6527559"] },
      ],
    };
  };
  const first = await geocode("Kupiansk test", { fetchImpl });
  const again = await geocode("kupiansk  TEST", { fetchImpl });
  assert.equal(seen.length, 1, "the second search is answered from the cache");
  assert.match(seen[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?format=jsonv2&limit=6&q=Kupiansk%20test$/);
  assert.equal(seen[0].ua, "Chernozem/1.0 (farm setup)");
  assert.deepEqual(first, again);
  assert.equal(first[0].label, "Kupiansk, Kharkiv Oblast, Ukraine");
  assert.deepEqual(first[0].bbox, [37.5725231, 49.6753465, 37.6527559, 49.7446573]);
});

test("Nominatim down -> 503 geocode_unavailable", async () => {
  await assert.rejects(
    geocode("Nowhere at all", { fetchImpl: async () => ({ ok: false, status: 502 }) }),
    (error) => error.status === 503 && error.code === "geocode_unavailable",
  );
});

test("short labels keep the place, region and country", () => {
  assert.equal(shortLabel("Kupiansk, Kupiansk Hromada, Kupiansk Raion, Kharkiv Oblast, 63700, Ukraine"), "Kupiansk, Kharkiv Oblast, Ukraine");
  assert.equal(shortLabel("Kyiv, Ukraine"), "Kyiv, Ukraine");
});
