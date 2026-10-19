// WHAT THIS FILE DOES
// The wars the app knows about. Chernozem works anywhere on Earth; most of
// the world is at peace, and there "damage" simply means unusual fire or
// disturbance compared with the normal years 2019 to 2021, from any cause.
// Where an area lies in one of the countries below, damage is counted from
// the day that war started, and the Data page marks that day on its charts.
//
//   id         short name used in the data
//   name       how the app writes it
//   since      the day it started ("YYYY-MM-DD")
//   countries  numeric ISO 3166 codes (as text) of the countries it covers
//
// The normal years (2019 to 2021) must be BEFORE the war started, so only
// wars that began in 2022 or later belong here.
//
// LIMITS: a war is matched by COUNTRY only. Fighting that spills across a
// border (Russia's Kursk and Belgorod regions, northern Israel and south
// Lebanon) and wars not listed here (for example in Myanmar, the Sahel,
// eastern DR Congo or Yemen) count as peace: damage there is still found
// from unusual fire and radar change, but nothing is measured as distance
// to fighting. That does not mean the land is safe.
//
// WHO EDITS IT
// Whoever adds a war. Add a line; nothing else needs to change.

export const CONFLICTS = [
  { id: "ukraine-2022", name: "Full-scale invasion of Ukraine", since: "2022-02-24", countries: ["804"] },
  { id: "sudan-2023", name: "War in Sudan", since: "2023-04-15", countries: ["729"] },
  { id: "gaza-2023", name: "Gaza war", since: "2023-10-07", countries: ["275"] },
];

// Without a known war, damage is looked for over this many years before
// today (still compared with the normal years).
export const DEFAULT_DAMAGE_YEARS = 2;

// The war that covers a country, or null.
export function conflictForCountry(countryId) {
  if (!countryId) return null;
  return CONFLICTS.find((conflict) => conflict.countries.includes(String(countryId))) || null;
}

// Where damage is counted from, for an area or a farm.
//   conflict - from conflictForCountry() (or null)
//   today    - "YYYY-MM-DD"
// Gives back { start, end, conflict } (end not included).
export function damageWindow(conflict, today) {
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (conflict) return { start: conflict.since, end, conflict };
  const year = Number(today.slice(0, 4)) - DEFAULT_DAMAGE_YEARS;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  // 29 February in a year without it becomes 1 March.
  const start = today.slice(5, 10) === "02-29" && !leap ? `${year}-03-01` : `${year}${today.slice(4, 10)}`;
  return { start, end, conflict: null };
}
