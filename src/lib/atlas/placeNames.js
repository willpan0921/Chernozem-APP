// WHAT THIS FILE DOES
// The names the Atlas shows for states, regions and districts. The place
// names come from FAO GAUL 2015 (the Earth Engine boundaries: the run's
// squares, server/providers/gee.js placeNames, and the map's states and
// regions, server/units.js). Most read well as they are ("Iowa", "Polk",
// "Rift Valley"); a few do not, and this file gives them a friendlier
// display name. It never makes a name up: a name that is not in the list
// below is shown as GAUL writes it (only its spacing is tidied).
//
//   displayPlaceName("Kharkivs'ka")       -> "Kharkiv"
//   displayPlaceName("Division No.  9")   -> "Division No. 9"
//   displayPlaceName("Polk")              -> "Polk"
//   displayPlaceName("Administrative unit not available") -> null
//   placeNames({ admin1: "Kharkivs'ka", admin2: "Chuhuivs'kyi" })
//                                         -> ["Chuhuivs'kyi", "Kharkiv"]
//   displayPlaceText("Chuhuivs'kyi, Kharkivs'ka") -> "Chuhuivs'kyi, Kharkiv"
//
// One helper for every page, the report and the AI, so a state is called
// the same everywhere. The saved runs keep GAUL's names (the report's CSV
// keeps them too, in its admin1 / admin2 columns).
//
// WHO EDITS IT
// Whoever finds another awkward GAUL name: add it to DISPLAY_NAMES with the
// name officials use in English. Tested in placeNames.test.js.

// GAUL name -> display name.
export const DISPLAY_NAMES = {
  // Ukraine. GAUL 2015 writes the oblasts as Ukrainian adjectives
  // ("Kharkivs'ka" = "of Kharkiv"); in English they are named after their
  // main city ("Kharkiv oblast"). GAUL 2015 has 25: Kyiv city is inside
  // Kyyivs'ka and Sevastopol inside Krym.
  "Cherkas'ka": "Cherkasy",
  "Chernihivs'ka": "Chernihiv",
  "Chernivets'ka": "Chernivtsi",
  "Dnipropetrovs'ka": "Dnipropetrovsk",
  "Donets'ka": "Donetsk",
  "Ivano-frankivs'ka": "Ivano-Frankivsk",
  "Ivano-Frankivs'ka": "Ivano-Frankivsk",
  "Kharkivs'ka": "Kharkiv",
  "Khersons'ka": "Kherson",
  "Khmel'nyts'ka": "Khmelnytskyi",
  "Kirovohrads'ka": "Kirovohrad",
  Krym: "Crimea",
  "Avtonomna Respublika Krym": "Crimea",
  "Kyyivs'ka": "Kyiv",
  "Kyivs'ka": "Kyiv",
  "L'vivs'ka": "Lviv",
  "Luhans'ka": "Luhansk",
  "Mykolayivs'ka": "Mykolaiv",
  "Mykolaivs'ka": "Mykolaiv",
  "Odes'ka": "Odesa",
  "Poltavs'ka": "Poltava",
  "Rivnens'ka": "Rivne",
  "Sums'ka": "Sumy",
  "Ternopil's'ka": "Ternopil",
  "Vinnyts'ka": "Vinnytsia",
  "Volyns'ka": "Volyn",
  "Zakarpats'ka": "Zakarpattia",
  "Zaporiz'ka": "Zaporizhzhia",
  "Zhytomyrs'ka": "Zhytomyr",
  "Misto Kyyiv": "Kyiv city",
  "Misto Kyiv": "Kyiv city",
  "Sevastopol'": "Sevastopol",
  // China: GAUL's level 2 adds the kind of unit ("Sheng" = province).
  "Heilongjiang Sheng": "Heilongjiang",
};

// What FAO GAUL writes where a unit has no name.
const NO_NAME = /^(administrative unit not available|null|undefined)$/i;

// The name to show for a GAUL name, or null when there is none.
export function displayPlaceName(name) {
  if (name === null || name === undefined) return null;
  const text = String(name).replace(/\s+/g, " ").trim();
  if (!text || NO_NAME.test(text)) return null;
  return Object.hasOwn(DISPLAY_NAMES, text) ? DISPLAY_NAMES[text] : text;
}

// A place's display names, smallest first: [district, state] (either can
// be missing), as the squares' names read ("Chuhuivs'kyi, Kharkiv").
export function placeNames(place) {
  if (!place) return [];
  return [displayPlaceName(place.admin2), displayPlaceName(place.admin1)].filter(Boolean);
}

// Loose form of a name for matching two spellings of the same place
// (GAUL's level 1 and level 2 tables, a person's typing): lower case, no
// accents, letters and digits only. "Ivano-frankivs'ka" -> "ivanofrankivska".
export function nameKey(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// A place name already joined by the server ("Chuhuivs'kyi, Kharkivs'ka",
// an alert's place) with each part read as its display name:
// "Chuhuivs'kyi, Kharkiv". Parts without a display name stay as written.
export function displayPlaceText(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .split(", ")
    .map((part) => displayPlaceName(part) ?? part)
    .join(", ");
}
