// WHAT THIS FILE DOES
// Tests src/lib/profile.js: an account's place and country come out of its
// profile in the app's shape, and the example text in the corner boxes
// never names the demo's places for an account. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes src/lib/profile.js.

import test from "node:test";
import assert from "node:assert/strict";
import { boxPlaceholder, cornersPlaceholder, profileCountry, profilePlace } from "./profile.js";

const kupiansk = { lat: 49.7106, lng: 37.6163, label: "Kupiansk, Kharkiv, Ukraine" };

test("the place: the website's lng becomes the app's lon", () => {
  assert.deepEqual(profilePlace({ place: kupiansk }), { lat: 49.7106, lon: 37.6163, label: "Kupiansk, Kharkiv, Ukraine" });
  assert.deepEqual(profilePlace({ place: { lat: 1, lon: 2, label: "x" } }), { lat: 1, lon: 2, label: "x" }, "lon is accepted too");
  assert.deepEqual(profilePlace({ place: { lat: 42.03, lng: -93.62, label: " " } }), { lat: 42.03, lon: -93.62, label: "42.0300, -93.6200" }, "no label: the numbers");
});

test("no place, or a bad one, is null", () => {
  assert.equal(profilePlace(null), null);
  assert.equal(profilePlace({}), null);
  assert.equal(profilePlace({ place: null }), null);
  assert.equal(profilePlace({ place: { label: "Somewhere" } }), null, "no numbers");
  assert.equal(profilePlace({ place: { lat: "49.7", lng: "37.6" } }), null, "numbers as text are not trusted");
  assert.equal(profilePlace({ place: { lat: 95, lng: 0 } }), null, "off the Earth");
  assert.equal(profilePlace({ place: { lat: 0, lng: 181 } }), null);
});

test("the country", () => {
  assert.equal(profileCountry({ country: " Ukraine " }), "Ukraine");
  assert.equal(profileCountry({}), "");
  assert.equal(profileCountry(null), "");
  assert.equal(profileCountry({ country: 7 }), "");
});

test("the corner examples: around the place when there is one, plain words otherwise", () => {
  const text = cornersPlaceholder(kupiansk);
  const lines = text.split("\n");
  assert.equal(lines.length, 4);
  for (const line of lines) assert.match(line, /^-?\d+\.\d{4}, -?\d+\.\d{4}$/);
  // 0.0032° north-south; east-west widened by 1 / cos(49.7°) so the square stays square.
  assert.equal(lines[0], "49.7074, 37.6114", "south-west corner, about 350 m from the place");
  assert.equal(lines[2], "49.7138, 37.6212", "north-east corner");
  assert.equal(cornersPlaceholder(null), "latitude, longitude\nlatitude, longitude\nlatitude, longitude\nlatitude, longitude");
  assert.equal(cornersPlaceholder({ label: "no numbers" }), cornersPlaceholder(null));
  assert.doesNotMatch(cornersPlaceholder(null), /49\.74|93\.6/, "never the demo's Kupiansk or Iowa numbers");
});

test("the box examples", () => {
  assert.deepEqual(boxPlaceholder(kupiansk), { north: "49.7138", south: "49.7074", east: "37.6212", west: "37.6114" });
  assert.deepEqual(boxPlaceholder(null), { north: "latitude", south: "latitude", east: "longitude", west: "longitude" });
  // Near the poles the east-west step grows, but stays finite.
  const polar = boxPlaceholder({ lat: 89, lng: 0 });
  assert.ok(Number.isFinite(Number(polar.east)) && Number(polar.east) > 0);
});
