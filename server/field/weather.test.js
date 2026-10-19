// WHAT THIS FILE DOES
// Tests for server/field/weather.js: Open-Meteo's answer becomes "now,
// 10 days, next rain", is kept for an hour, and a failure is a clear 503.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever changes weather.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-weather-"));
const { getWeather, parseForecast, rainSpell, weatherLabel } = await import("./weather.js");

const answer = {
  current: { temperature_2m: 16.6, weather_code: 61 },
  daily: {
    time: ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"],
    precipitation_sum: [0, 6.2, 5.1, 2.4, 0],
    precipitation_probability_max: [10, 80, 75, 60, 20],
    temperature_2m_max: [18, 15, 14, 13, 16],
    temperature_2m_min: [8, 9, 8, 7, 6],
  },
};

test("weather codes become short words", () => {
  assert.equal(weatherLabel(0), "Clear");
  assert.equal(weatherLabel(63), "Rain");
  assert.equal(weatherLabel(95), "Thunderstorm");
});

test("the forecast is read and the next rainy spell found", () => {
  const w = parseForecast(answer);
  assert.deepEqual(w.current, { tempC: 17, code: 61, label: "Rain" });
  assert.equal(w.daily.length, 5);
  assert.deepEqual(w.rain, { likely: true, from: "2026-10-09", to: "2026-10-11", mm: 14 });
  assert.equal(rainSpell([{ date: "2026-10-08", rainChance: 90, rainMm: 0.2 }]), null);
});

test("answers are kept for an hour; a failure is 503 weather_unavailable", async () => {
  let calls = 0;
  let url = "";
  const fetchImpl = async (u) => {
    calls += 1;
    url = u;
    return { ok: true, json: async () => answer };
  };
  let now = Date.parse("2026-10-08T10:00:00Z");
  const first = await getWeather({ lat: 49.72, lon: 37.54 }, { fetchImpl, now: () => now });
  assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  for (const part of ["current=temperature_2m%2Cweather_code", "forecast_days=10", "timezone=auto", "precipitation_probability_max"]) assert.ok(url.includes(part), part);
  now += 30 * 60 * 1000;
  const second = await getWeather({ lat: 49.72, lon: 37.54 }, { fetchImpl, now: () => now });
  assert.equal(calls, 1);
  assert.deepEqual(second.rain, first.rain);
  // After an hour, a failed request falls back to the old answer...
  now += 2 * 60 * 60 * 1000;
  const stale = await getWeather({ lat: 49.72, lon: 37.54 }, { fetchImpl: async () => ({ ok: false, status: 500 }), now: () => now });
  assert.equal(stale.stale, true);
  // ...and somewhere else with no saved answer, it is a clear error.
  await assert.rejects(getWeather({ lat: 10, lon: 10 }, { fetchImpl: async () => { throw new Error("offline"); }, now: () => now }), (e) => e.status === 503 && e.code === "weather_unavailable");
});
