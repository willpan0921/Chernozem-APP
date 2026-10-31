// Tests for wheelZoom.js (how far a wheel, a trackpad scroll or a pinch
// zooms the maps and the globe). Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import {
  GLOBE_NEAR_ALTITUDE,
  GLOBE_ZOOM_STEP,
  approach,
  createWheelZoom,
  globeZoomFactor,
  globeZoomLimits,
  isZoomedIn,
  registerMapForChecks,
  wheelLevels,
  wheelPixels,
} from "./wheelZoom.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test("the wheel's travel is read in pixels whatever unit the browser used", () => {
  assert.equal(wheelPixels({ deltaY: -100 }), -100);
  assert.equal(wheelPixels({ deltaY: -100, deltaMode: 0 }), -100);
  assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }), 60); // lines
  assert.equal(wheelPixels({ deltaY: 1, deltaMode: 2 }), 60); // pages
  assert.equal(wheelPixels({}), 0);
  assert.equal(wheelPixels(null), 0);
});

test("rolling the wheel up zooms a map in; one notch is about 1.4 levels", () => {
  const notch = wheelLevels(-100);
  assert.ok(notch > 1.3 && notch < 1.5, `one notch: ${notch}`);
  // The same notch the other way zooms out by the same amount.
  close(wheelLevels(100), -notch);
  assert.equal(wheelLevels(0), 0);
  // Three notches reach at least the four levels the owner's check asks for.
  assert.ok(wheelLevels(-100) * 3 >= 4);
});

test("small trackpad ticks add up nearly in proportion, one level per 60 px or so", () => {
  // 30 ticks of 10 px.
  let levels = 0;
  for (let i = 0; i < 30; i++) levels += wheelLevels(-10);
  assert.ok(levels > 4.4 && levels < 5.2, `300 px of ticks: ${levels} levels`);
  // A single huge event never zooms more than four levels (Leaflet's own cap).
  assert.ok(wheelLevels(-100000) <= 4);
  assert.ok(wheelLevels(-100000) > 3.99);
});

test("a pinch (ctrlKey) scales the map with the fingers: one level per 100 px", () => {
  close(wheelLevels(-100, { ctrlKey: true }), 1);
  close(wheelLevels(50, { ctrlKey: true }), -0.5);
  // Lines are turned into pixels first.
  close(wheelLevels(-5, { ctrlKey: true, deltaMode: 1 }), 1);
});

test("approach eases a share of the way and lands exactly once close", () => {
  close(approach(10, 12, 0.5), 11);
  assert.equal(approach(11.999, 12, 0.5, 0.002), 12);
  assert.equal(approach(12, 12), 12);
  assert.equal(approach(NaN, 12), 12);
  // Zooming out eases the same way.
  close(approach(12, 10, 0.25), 11.5);
});

test("a notch of the wheel brings the globe a fifth nearer; a pinch follows the fingers", () => {
  close(globeZoomFactor(-100), 0.8);
  close(globeZoomFactor(100), 1.25);
  assert.equal(globeZoomFactor(0), 1);
  // Chrome's pinch: the altitude scales by exp(deltaY / 100), so about a
  // hundred pixels of deltaY halves or doubles it.
  close(globeZoomFactor(-69.3147, { ctrlKey: true }), 0.5, 1e-4);
  close(globeZoomFactor(69.3147, { ctrlKey: true }), 2, 1e-4);
  // Lines are pixels first here too.
  close(globeZoomFactor(-5, { deltaMode: 1 }), 0.8);
});

test("the globe zooms between one country and today's layout", () => {
  assert.deepEqual(globeZoomLimits(0.54), { near: GLOBE_NEAR_ALTITUDE, far: 0.54 });
  // A layout already nearer than two countries keeps a gap to zoom into.
  assert.deepEqual(globeZoomLimits(0.3), { near: 0.15, far: 0.3 });
  // Nonsense falls back to one Earth radius.
  assert.deepEqual(globeZoomLimits(NaN), { near: GLOBE_NEAR_ALTITUDE, far: 1 });
  assert.ok(GLOBE_ZOOM_STEP > 0 && GLOBE_ZOOM_STEP < 1);
});

test("zoomed in means nearer than the layout's rest altitude, with a little slack", () => {
  assert.equal(isZoomedIn(0.3, 0.54), true);
  assert.equal(isZoomedIn(0.53, 0.54), false); // within the slack: at rest
  assert.equal(isZoomedIn(0.54, 0.54), false);
  assert.equal(isZoomedIn(0.6, 0.54), false);
  assert.equal(isZoomedIn(NaN, 0.54), false);
});

test("the map handler does nothing on a Leaflet without the internal move", () => {
  const listeners = [];
  const map = { getContainer: () => ({ addEventListener: (name) => listeners.push(name), removeEventListener: () => {} }) };
  const wheel = createWheelZoom(map);
  assert.equal(wheel.supported, false);
  wheel.enable();
  assert.equal(wheel.enabled(), false);
  assert.deepEqual(listeners, []);
  wheel.remove();
});

test("the checks' registry is off without ?map-debug=1", () => {
  const unregister = registerMapForChecks({});
  assert.equal(typeof unregister, "function");
  unregister();
});
