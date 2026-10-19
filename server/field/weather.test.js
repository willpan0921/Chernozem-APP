// WHAT THIS FILE DOES
// Tests for server/field/weather.js: Open-Meteo's answer becomes "now,
// 10 days, next rain" and the pest-risk inputs, is kept for an hour, and a
// failure is a clear 503; the daily highs and lows for heat units come from
// the archive (up to 6 days ago) and the forecast (recent days and ahead,
// filling the archive's last days), cached.
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
const { dailyTemperatures, getWeather, parseForecast, rainSpell, weatherLabel } = await import("./weather.js");

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
  for (const part of ["current=temperature_2m%2Cweather_code", "forecast_days=10", "past_days=7", "hourly=temperature_2m%2Crelative_humidity_2m", "timezone=auto", "precipitation_probability_max"]) assert.ok(url.includes(part), part);
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

// 7 past days + 7 ahead of hourly readings around 2026-10-19.
function hourlyAround(today, { wet = 0, mean = 15 } = {}) {
  const time = [];
  const temperature_2m = [];
  const relative_humidity_2m = [];
  const day0 = Date.parse(`${today}T00:00:00Z`) - 7 * 86400000;
  for (let h = 0; h < 14 * 24; h += 1) {
    time.push(new Date(day0 + h * 3600000).toISOString().slice(0, 16));
    temperature_2m.push(mean);
    relative_humidity_2m.push(h < wet ? 95 : 60);
  }
  return { time, temperature_2m, relative_humidity_2m };
}

test("the risk inputs come from the 7 days before today and the 7 from today; past days leave the forecast list", () => {
  const today = "2026-10-19";
  const days = Array.from({ length: 17 }, (_, i) => new Date(Date.parse("2026-10-12T00:00:00Z") + i * 86400000).toISOString().slice(0, 10));
  const data = {
    current: { time: `${today}T14:00`, temperature_2m: 14, weather_code: 3 },
    daily: { time: days, precipitation_sum: days.map(() => 0), precipitation_probability_max: days.map(() => 0), temperature_2m_max: days.map(() => 20), temperature_2m_min: days.map(() => 10) },
    hourly: hourlyAround(today, { wet: 30, mean: 18 }),
  };
  const w = parseForecast(data);
  assert.equal(w.today, today);
  assert.equal(w.daily[0].date, today);
  assert.equal(w.daily.length, 10);
  // 30 wet hours at 18 °C; 14 days at a mean of 18 °C -> 8 degree-days a day.
  assert.deepEqual(w.hourly, { wetHours14: 30, gdd14: 112 });
  assert.equal(parseForecast({ ...data, hourly: undefined }).hourly, null);
});

test("daily temperatures: archive up to 6 days ago, forecast for the recent days and ahead, kept 6 hours", async () => {
  const urls = [];
  // The forecast API answers null for its oldest past days (real answer,
  // Iowa, 2026-10-19: null from 19 July to 16 August with past_days=92).
  const forecastFirstValue = "2026-08-17";
  const answer = (from, count, tmax, firstValue = null) => {
    const time = Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
    return {
      daily: {
        time,
        temperature_2m_max: time.map((d) => (firstValue && d < firstValue ? null : tmax)),
        temperature_2m_min: time.map((d) => (firstValue && d < firstValue ? null : 5)),
      },
    };
  };
  const fetchImpl = async (url) => {
    urls.push(url);
    const q = new URL(url).searchParams;
    if (url.startsWith("https://archive-api.open-meteo.com/v1/archive?")) {
      const from = q.get("start_date");
      const to = q.get("end_date");
      const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
      return { ok: true, json: async () => answer(from, count, 25) };
    }
    const past = Number(q.get("past_days"));
    const ahead = Number(q.get("forecast_days"));
    const from = new Date(Date.parse("2026-10-19T00:00:00Z") - past * 86400000).toISOString().slice(0, 10);
    return { ok: true, json: async () => answer(from, past + ahead, 15, forecastFirstValue) };
  };
  const now = () => Date.parse("2026-10-19T12:00:00Z");
  const days = await dailyTemperatures(42.03, -93.62, "2026-05-01", "2026-11-10", { fetchImpl, now, today: "2026-10-19" });
  assert.equal(urls.length, 2);
  const archive = new URL(urls[0]).searchParams;
  assert.equal(archive.get("start_date"), "2026-05-01");
  assert.equal(archive.get("end_date"), "2026-10-13"); // 6 days ago (ERA5 lags real time)
  assert.equal(archive.get("daily"), "temperature_2m_max,temperature_2m_min");
  const forecast = new URL(urls[1]).searchParams;
  assert.equal(forecast.get("past_days"), "92");
  assert.equal(forecast.get("forecast_days"), "16"); // at most 16 days ahead
  assert.equal(days[0].date, "2026-05-01");
  assert.equal(days[0].tmax, 25);
  // The forecast's empty old days are filled from the archive...
  assert.equal(days.find((d) => d.date === "2026-07-25").tmax, 25);
  // ...and its own days replace the archive's.
  assert.equal(days.find((d) => d.date === "2026-09-01").tmax, 15);
  assert.equal(days.find((d) => d.date === "2026-10-19").tmax, 15);
  assert.equal(days.at(-1).date, "2026-11-03");
  // Days follow one another with none missing.
  assert.equal(days.length, Math.round((Date.parse("2026-11-03") - Date.parse("2026-05-01")) / 86400000) + 1);
  // Asked again (a shorter span): from the cache, no new request.
  const again = await dailyTemperatures(42.03, -93.62, "2026-06-01", "2026-10-25", { fetchImpl, now, today: "2026-10-19" });
  assert.equal(urls.length, 2);
  assert.equal(again[0].date, "2026-06-01");
  assert.equal(again.at(-1).date, "2026-10-25");
  // The last few days only: the forecast alone.
  await dailyTemperatures(10, 10, "2026-10-15", "2026-10-19", { fetchImpl, now, today: "2026-10-19" });
  assert.equal(urls.length, 3);
  assert.ok(urls[2].startsWith("https://api.open-meteo.com/v1/forecast?"));
  assert.equal(new URL(urls[2]).searchParams.get("past_days"), "4");
  // Offline: a clear 503.
  await assert.rejects(dailyTemperatures(20, 20, "2026-09-01", "2026-10-19", { fetchImpl: async () => { throw new Error("offline"); }, now, today: "2026-10-19" }), (e) => e.status === 503 && e.code === "weather_unavailable");
});
