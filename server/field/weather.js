// WHAT THIS FILE DOES
// The farm's weather from Open-Meteo (api.open-meteo.com, free, no key):
// now, the next 10 days, the next rainy spell (used for "harvest before the
// rain") and the two inputs of the pest and disease risk (hourly humidity
// and temperature over the 7 days before today and the 7 from today).
// Answers are kept for an hour in weather-cache.json.
//
//   getWeather({ lat, lon })  -> { current: { tempC, code, label },
//                                  rain: { likely, from, to, mm } | null,
//                                  daily: [{ date, tempMax, tempMin, rainMm, rainChance }] (from today),
//                                  hourly: { wetHours14, gdd14 } | null
//                                    (method.js hourlyRiskInputs: hours at
//                                    >= 90 % humidity and 10-25 °C, and
//                                    degree-days over 10 °C, in the 14 days),
//                                  today, at, lat, lon }
//   dailyTemperatures(lat, lon, from, to)
//                             -> [{ date, tmax, tmin }] daily highs and lows
//                                for the heat-unit (GDD) harvest estimate:
//                                the archive API (archive-api.open-meteo.com,
//                                ERA5) up to ARCHIVE_LAG_DAYS ago, the
//                                forecast API (past_days, at most 92) for
//                                the days since and the next 16; kept 6
//                                hours in temperature-cache.json
//   weatherLabel(code)        WMO weather code -> "Rain", "Clear"...
//   rainSpell(daily)          the next rainy days in a daily list
//
// Throws an error with status 503 and code "weather_unavailable" when
// Open-Meteo cannot be reached.
//
// WHO EDITS IT
// Nobody, normally.

import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { dataDir, getWeatherCache, saveWeatherCache } from "../store.js";
import { hourlyRiskInputs, isRainyDay, RAINY_DAY, RISK_DAYS } from "../../src/lib/field/method.js";
import { addDays } from "../../src/lib/season.js";

const URL_BASE = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
// Days of forecast shown, and days before today asked for the risk inputs
// (the risk looks at the 7 days before today and the 7 from today).
export const FORECAST_DAYS = 10;
export const RISK_PAST_DAYS = RISK_DAYS / 2;
// The forecast API gives at most this many past days and this many ahead.
export const FORECAST_PAST_MAX = 92;
export const FORECAST_AHEAD_MAX = 16;
// The archive (ERA5) is a few days behind real time; days older than this
// are always asked from it too. The forecast API accepts past_days up to
// 92 but answers null for its oldest days: real answer for Iowa on
// 2026-10-19, past_days=92 gave null highs and lows for 19 July to 16
// August (29 days), so every heat-unit estimate from a June green-up was
// dropped as "too many missing days".
export const ARCHIVE_LAG_DAYS = 6;
const TEMPERATURE_TTL_MS = 6 * 60 * 60 * 1000;
const TEMPERATURE_TIMEOUT_MS = 12000;
const TEMPERATURE_CACHE_ENTRIES = 20;

// A day counts as rainy at this chance and amount (the farmer's "rain
// likely"). The rule lives in src/lib/field/method.js (RAINY_DAY).
export const RAIN_CHANCE = RAINY_DAY.chance;
export const RAIN_MM = RAINY_DAY.mm;

// WMO weather codes (the ones Open-Meteo uses) -> one short word.
export function weatherLabel(code) {
  const c = Number(code);
  if (c === 0) return "Clear";
  if (c === 1) return "Mostly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Cloudy";
  if (c === 45 || c === 48) return "Fog";
  if (c >= 51 && c <= 57) return "Drizzle";
  if (c >= 61 && c <= 67) return "Rain";
  if (c >= 71 && c <= 77) return "Snow";
  if (c >= 80 && c <= 82) return "Showers";
  if (c === 85 || c === 86) return "Snow showers";
  if (c >= 95 && c <= 99) return "Thunderstorm";
  return "—";
}

// The first run of rainy days (consecutive) in the forecast, or null.
export function rainSpell(daily) {
  const rainy = isRainyDay;
  const start = daily.findIndex(rainy);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < daily.length && rainy(daily[end + 1])) end += 1;
  const mm = daily.slice(start, end + 1).reduce((sum, day) => sum + (day.rainMm || 0), 0);
  return { likely: true, from: daily[start].date, to: daily[end].date, mm: Math.round(mm) };
}

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// Open-Meteo's answer -> our shape. "today" is the farm's own date (from
// Open-Meteo's current time in the farm's time zone); the days before it
// (asked for the risk inputs) are left out of the forecast list.
export function parseForecast(data) {
  const d = data?.daily || {};
  const dates = Array.isArray(d.time) ? d.time : [];
  const today = typeof data?.current?.time === "string" && /^\d{4}-\d{2}-\d{2}/.test(data.current.time) ? data.current.time.slice(0, 10) : null;
  const daily = dates
    .map((date, i) => ({
      date,
      tempMax: num(d.temperature_2m_max?.[i]),
      tempMin: num(d.temperature_2m_min?.[i]),
      rainMm: num(d.precipitation_sum?.[i]),
      rainChance: num(d.precipitation_probability_max?.[i]),
    }))
    .filter((day) => !today || day.date >= today)
    .slice(0, FORECAST_DAYS);
  const code = num(data?.current?.weather_code);
  const tempC = num(data?.current?.temperature_2m);
  const risk = data?.hourly ? hourlyRiskInputs(data.hourly, today) : null;
  return {
    current: { tempC: tempC == null ? null : Math.round(tempC), code, label: weatherLabel(code) },
    rain: rainSpell(daily),
    daily,
    hourly: risk ? { wetHours14: risk.wetHours14, gdd14: risk.gdd14 } : null,
    today,
  };
}

function unavailable(message) {
  const error = new Error(message);
  error.status = 503;
  error.code = "weather_unavailable";
  return error;
}

const sameSpot = (entry, lat, lon) => entry && Math.abs(entry.lat - lat) < 0.01 && Math.abs(entry.lon - lon) < 0.01;

export async function getWeather({ lat, lon }, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw unavailable("The farm has no location yet.");
  const cached = await getWeatherCache().catch(() => null);
  // An answer saved before the risk inputs were asked for (no "hourly")
  // is asked again.
  const fresh = sameSpot(cached, lat, lon) && now() - Date.parse(cached.at) < TTL_MS && cached.data && cached.data.hourly !== undefined;
  if (fresh) return { ...cached.data, at: cached.at, lat, lon };

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,weather_code",
    daily: "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min",
    hourly: "temperature_2m,relative_humidity_2m",
    past_days: String(RISK_PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
    timezone: "auto",
  });
  let data;
  try {
    const res = await fetchImpl(`${URL_BASE}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    data = await res.json();
  } catch (error) {
    // An hour-old answer is better than none.
    if (sameSpot(cached, lat, lon) && cached.data) return { ...cached.data, at: cached.at, lat, lon, stale: true };
    throw unavailable(`The weather service could not be reached (${error.message}). Try again in a minute.`);
  }
  const parsed = parseForecast(data);
  const at = new Date(now()).toISOString();
  await saveWeatherCache({ at, lat, lon, data: parsed }).catch((error) => console.warn(`[chernozem] Could not save the weather: ${error.message}`));
  return { ...parsed, at, lat, lon };
}

// ---------- Daily highs and lows for heat units ----------

const DAY_MS = 86400000;
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isDay = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function temperatureCacheFile() {
  return path.join(dataDir(), "temperature-cache.json");
}

async function readTemperatureCache() {
  try {
    const data = JSON.parse(await fs.readFile(temperatureCacheFile(), "utf8"));
    return Array.isArray(data?.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function writeTemperatureCache(entries) {
  const file = temperatureCacheFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ entries }));
  await fs.rename(tmp, file);
}

// Open-Meteo daily { time, temperature_2m_max, temperature_2m_min } ->
// [{ date, tmax, tmin }] (days with a missing value are left out).
export function parseDailyTemperatures(data) {
  const d = data?.daily || {};
  const dates = Array.isArray(d.time) ? d.time : [];
  return dates
    .map((date, i) => ({ date: String(date).slice(0, 10), tmax: num(d.temperature_2m_max?.[i]), tmin: num(d.temperature_2m_min?.[i]) }))
    .filter((day) => isDay(day.date) && day.tmax !== null && day.tmin !== null);
}

async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TEMPERATURE_TIMEOUT_MS), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  return res.json();
}

// Daily highs and lows from `from` to `to` ("YYYY-MM-DD", both included;
// `to` may be up to 16 days ahead: the forecast). Days up to
// ARCHIVE_LAG_DAYS ago come from the archive API (ERA5 reanalysis, a few
// days behind real time); the forecast API (past_days, at most 92) gives
// the recent days and the days ahead, and its values replace the
// archive's where it has one (its empty old days do not).
//   today  the farm's date ("YYYY-MM-DD"), this computer's date when left out
export async function dailyTemperatures(lat, lon, from, to, { fetchImpl = globalThis.fetch, now = () => Date.now(), today = null } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw unavailable("The farm has no location yet.");
  if (!isDay(from) || !isDay(to) || from > to) throw unavailable("Ask for the temperatures with two dates, the first one first.");
  const day = isDay(today) ? today : new Date(now()).toLocaleDateString("en-CA");
  const last = to > addDays(day, FORECAST_AHEAD_MAX - 1) ? addDays(day, FORECAST_AHEAD_MAX - 1) : to;
  const inside = (list) => list.filter((d) => d.date >= from && d.date <= last);

  const entries = await readTemperatureCache();
  const hit = entries.find((e) => sameSpot(e, lat, lon) && now() - Date.parse(e.at) < TEMPERATURE_TTL_MS && e.from <= from && e.to >= last && e.today === day);
  if (hit) return inside(hit.days);

  const firstForecastDay = addDays(day, -FORECAST_PAST_MAX);
  const common = { latitude: lat.toFixed(4), longitude: lon.toFixed(4), daily: "temperature_2m_max,temperature_2m_min", timezone: "auto" };
  const byDate = new Map();
  try {
    const archiveEnd = addDays(day, -ARCHIVE_LAG_DAYS);
    if (from <= archiveEnd) {
      const end = last < archiveEnd ? last : archiveEnd;
      const params = new URLSearchParams({ ...common, start_date: from, end_date: end });
      for (const d of parseDailyTemperatures(await fetchJson(`${ARCHIVE_BASE}?${params}`, fetchImpl))) byDate.set(d.date, d);
    }
    if (last >= firstForecastDay) {
      const start = from > firstForecastDay ? from : firstForecastDay;
      const pastDays = Math.max(0, Math.min(FORECAST_PAST_MAX, dayNumber(day) - dayNumber(start)));
      const aheadDays = Math.max(1, Math.min(FORECAST_AHEAD_MAX, dayNumber(last) - dayNumber(day) + 1));
      const params = new URLSearchParams({ ...common, past_days: String(pastDays), forecast_days: String(aheadDays) });
      // The forecast's own days replace the archive's where both have one.
      for (const d of parseDailyTemperatures(await fetchJson(`${URL_BASE}?${params}`, fetchImpl))) byDate.set(d.date, d);
    }
  } catch (error) {
    throw unavailable(`The temperature record could not be read (${error.message}).`);
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const entry = { at: new Date(now()).toISOString(), lat, lon, from, to: last, today: day, days };
  const kept = [entry, ...entries.filter((e) => !(sameSpot(e, lat, lon) && e.today === day && e.from >= from && e.to <= last))].slice(0, TEMPERATURE_CACHE_ENTRIES);
  await writeTemperatureCache(kept).catch((error) => console.warn(`[chernozem] Could not save the temperatures: ${error.message}`));
  return inside(days);
}
