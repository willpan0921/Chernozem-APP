// WHAT THIS FILE DOES
// The armed conflicts the public website's globe shows as "wars on farmland
// right now". There is no free live feed of wars without an API key (UCDP
// and ACLED both need one), so this is a reviewed list: every entry names
// the country, where the fighting is, the day it began and a short line a
// visitor can read. Natural disasters on the same globe come live from
// GDACS (server/world/gdacs.js); this list is merged with them.
//
// It is NOT the app's own war list (src/config/conflicts.js decides how the
// Atlas measures damage, and deliberately leaves out wars that were already
// running in 2019 to 2021). This list is wider: anything with fighting on
// farmland in the last twelve months belongs here, whenever it started.
//
//   id        short name used in the data
//   iso3      the country the marker sits in (the globe looks up its centre
//             in public/site/world/countries.json)
//   lat, lng  where to put the marker when the fighting is in one part of a
//             big country (optional; otherwise the country's centre)
//   name      how the website writes it
//   since     the day it started ("YYYY-MM-DD")
//   note      one sentence about the land, for the panel
//   also      other ISO3 countries the same war touches (optional)
//
// Reviewed 2026-10-28 from the news and the conflict trackers (UCDP, ACLED
// summaries, ReliefWeb). Re-check every few months: wars end, fronts move.
//
// WHO EDITS IT
// Whoever reviews the list. Keep it honest: if a war has stopped, remove it.

export const WORLD_CONFLICTS = [
  {
    id: "ukraine",
    iso3: "UKR",
    lat: 48.4,
    lng: 36.6,
    name: "War in Ukraine",
    since: "2022-02-24",
    note: "Fighting along a front that runs through some of the deepest black soil on Earth; fields mined, cratered and abandoned.",
    also: ["RUS"],
  },
  {
    id: "sudan",
    iso3: "SDN",
    lat: 14.5,
    lng: 29.5,
    name: "War in Sudan",
    since: "2023-04-15",
    note: "Farming in the Gezira scheme, Darfur and Kordofan has been cut off by fighting and famine declared in parts of the country.",
  },
  {
    id: "gaza",
    iso3: "PSE",
    lat: 31.42,
    lng: 34.38,
    name: "War in Gaza",
    since: "2023-10-07",
    note: "Most of the Strip's orchards, greenhouses and fields have been destroyed or are out of reach.",
  },
  {
    id: "myanmar",
    iso3: "MMR",
    lat: 21.0,
    lng: 96.0,
    name: "Civil war in Myanmar",
    since: "2021-02-01",
    note: "Fighting across the dry zone, Sagaing and Rakhine has driven farmers off the land in the country's rice belt.",
  },
  {
    id: "drc-east",
    iso3: "COD",
    lat: -1.5,
    lng: 29.0,
    name: "Fighting in eastern DR Congo",
    since: "2022-03-28",
    note: "M23 and other armed groups around Goma and Bukavu; farming families displaced in North and South Kivu.",
  },
  {
    id: "sahel",
    iso3: "BFA",
    lat: 13.5,
    lng: -1.5,
    name: "Insurgency in the central Sahel",
    since: "2015-01-01",
    note: "Armed groups across Burkina Faso, Mali and Niger blockade villages and fields; millions cannot farm safely.",
    also: ["MLI", "NER"],
  },
  {
    id: "somalia",
    iso3: "SOM",
    lat: 3.0,
    lng: 45.0,
    name: "Conflict in Somalia",
    since: "2006-01-01",
    note: "Al-Shabaab control over farming districts along the Shabelle and Juba rivers, on top of repeated drought.",
  },
  {
    id: "yemen",
    iso3: "YEM",
    lat: 15.3,
    lng: 44.5,
    name: "War in Yemen",
    since: "2014-09-21",
    note: "A long war with a fragile truce; farmland mined and irrigation broken in the highlands and Tihama.",
  },
  {
    id: "syria",
    iso3: "SYR",
    lat: 35.5,
    lng: 38.5,
    name: "Conflict in Syria",
    since: "2011-03-15",
    note: "The wheat belt of the northeast changed hands many times; fighting continues in parts of the country after the fall of the old government.",
  },
  {
    id: "ethiopia-amhara",
    iso3: "ETH",
    lat: 11.5,
    lng: 38.5,
    name: "Fighting in Amhara, Ethiopia",
    since: "2023-04-01",
    note: "Fano militias against federal forces across the highlands that grow much of Ethiopia's teff and wheat.",
  },
  {
    id: "south-sudan",
    iso3: "SSD",
    lat: 7.5,
    lng: 30.5,
    name: "Fighting in South Sudan",
    since: "2025-03-01",
    note: "Renewed fighting in Upper Nile and Jonglei; planting missed, families on the move.",
  },
  {
    id: "nigeria-north",
    iso3: "NGA",
    lat: 11.5,
    lng: 9.5,
    name: "Insurgency and banditry in northern Nigeria",
    since: "2009-07-26",
    note: "Boko Haram in the northeast and armed gangs in the northwest keep farmers out of their fields in the grain belt.",
  },
  {
    id: "mozambique-cabo-delgado",
    iso3: "MOZ",
    lat: -12.5,
    lng: 39.5,
    name: "Insurgency in Cabo Delgado, Mozambique",
    since: "2017-10-05",
    note: "Attacks on villages in the far north; smallholders displaced from cassava and maize fields.",
  },
  {
    id: "haiti",
    iso3: "HTI",
    lat: 18.6,
    lng: -72.3,
    name: "Armed gang violence in Haiti",
    since: "2021-07-07",
    note: "Not a war between armies, but gangs control the roads around Port-au-Prince and the Artibonite rice valley.",
  },
  {
    id: "pakistan-northwest",
    iso3: "PAK",
    lat: 33.0,
    lng: 70.5,
    name: "Insurgency in northwest Pakistan",
    since: "2022-11-28",
    note: "Attacks in Khyber Pakhtunkhwa and Balochistan since the Pakistani Taliban ended its ceasefire.",
  },
  {
    id: "lebanon-south",
    iso3: "LBN",
    lat: 33.3,
    lng: 35.4,
    name: "Strikes on southern Lebanon",
    since: "2023-10-08",
    note: "Olive groves and tobacco fields along the border burned and abandoned; strikes continue despite the 2024 ceasefire.",
  },
  {
    id: "colombia",
    iso3: "COL",
    lat: 7.5,
    lng: -72.9,
    name: "Armed groups in Colombia",
    since: "2016-11-24",
    note: "Fighting between armed groups in Catatumbo, Cauca and the Pacific coast displaces coffee and coca farmers alike.",
  },
];
