// WHAT THIS FILE DOES
// The farm's weather from Open-Meteo (api.open-meteo.com, free, no key):
// now, the next 10 days, and the next rainy spell (used for "harvest
// before the rain"). Answers are kept for an hour in weather-cache.json.
//
//   getWeather({ lat, lon })  -> { current: { tempC, code, label },
//                                  rain: { likely, from, to, mm } | null,
//                                  daily: [{ date, tempMax, tempMin, rainMm, rainChance }],
//                                  at, lat, lon }
//   weatherLabel(code)        WMO weather code -> "Rain", "Clear"...
//   rainSpell(daily)          the next rainy days in a daily list
//
// Throws an error with status 503 and code "weather_unavailable" when
// Open-Meteo cannot be reached.
//
// WHO EDITS IT
// Nobody, normally.

import { getWeatherCache, saveWeatherCache } from "../store.js";
import { isRainyDay, RAINY_DAY } from "../../src/lib/field/method.js";

const URL_BASE = "https://api.open-meteo.com/v1/forecast";
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

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

// Open-Meteo's answer -> our shape.
export function parseForecast(data) {
  const d = data?.daily || {};
  const dates = Array.isArray(d.time) ? d.time : [];
  const daily = dates.map((date, i) => ({
    date,
    tempMax: num(d.temperature_2m_max?.[i]),
    tempMin: num(d.temperature_2m_min?.[i]),
    rainMm: num(d.precipitation_sum?.[i]),
    rainChance: num(d.precipitation_probability_max?.[i]),
  }));
  const code = num(data?.current?.weather_code);
  const tempC = num(data?.current?.temperature_2m);
  return {
    current: { tempC: tempC == null ? null : Math.round(tempC), code, label: weatherLabel(code) },
    rain: rainSpell(daily),
    daily,
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
  if (sameSpot(cached, lat, lon) && now() - Date.parse(cached.at) < TTL_MS && cached.data) return { ...cached.data, at: cached.at, lat, lon };

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,weather_code",
    daily: "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min",
    forecast_days: "10",
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
