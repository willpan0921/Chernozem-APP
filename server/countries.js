// WHAT THIS FILE DOES
// The list of the world's countries with their borders, from Natural Earth
// (the world-atlas package, 1:50 million scale). Lets people find a country
// by name and gives its outline to the grid.
//
//   searchCountries("ken")  -> [{ id: "404", name: "Kenya", kind: "country" }]
//   getCountry("804")       -> { id, name, geometry, bbox }
//
// Ids are the numeric ISO 3166 country codes as text ("804" = Ukraine).
// Common other names also work: "USA", "UK", "Ivory Coast", "DRC"...
//
// WHO EDITS IT
// Whoever adds a nickname for a country (ALIASES below).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as topojson from "topojson-client";
import { ROOT } from "./env.js";
import { bboxOf, splitAntimeridian } from "./geo.js";

// Other names people type, mapped to the country code.
const ALIASES = {
  usa: "840", us: "840", "united states": "840", america: "840",
  uk: "826", "great britain": "826", britain: "826", england: "826", scotland: "826", wales: "826",
  drc: "180", "dr congo": "180", "democratic republic of the congo": "180", "congo-kinshasa": "180",
  "republic of the congo": "178", "congo-brazzaville": "178",
  car: "140", "central african republic": "140",
  "czech republic": "203",
  "ivory coast": "384", "cote d'ivoire": "384",
  "south sudan": "728",
  "north macedonia": "807",
  swaziland: "748", eswatini: "748",
  bosnia: "070", "bosnia and herzegovina": "070",
  "dominican republic": "214",
  "equatorial guinea": "226",
  uae: "784", emirates: "784",
  burma: "104",
  holland: "528",
  turkiye: "792",
  korea: "410", "republic of korea": "410",
  "western sahara": "732",
  "cape verde": "132",
  "east timor": "626",
  "vatican city": "336", "holy see": "336",
  "west bank": "275", gaza: "275",
  "south georgia": "239",
};

// Short forms in the Natural Earth names, written out for searching.
const EXPANSIONS = [
  [/\bIs\./g, "Islands"],
  [/\bRep\./g, "Republic"],
  [/\bDem\./g, "Democratic"],
  [/\bSt\./g, "Saint"],
  [/\bEq\./g, "Equatorial"],
  [/\bFr\./g, "French"],
  [/\bBr\./g, "British"],
  [/\bS\./g, "South"],
  [/\bN\./g, "North"],
  [/\bW\./g, "Western"],
  [/\bHerz\./g, "Herzegovina"],
  [/\bGeo\./g, "Georgia"],
  [/\bGren\./g, "Grenadines"],
  [/\bVin\./g, "Vincent"],
  [/\bBarb\./g, "Barbuda"],
  [/\bTer\./g, "Territory"],
];

// Lower case without accents, for comparing.
export function normalizeName(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slug(text) {
  return normalizeName(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// Natural Earth draws Crimea inside Russia. The Atlas follows the
// internationally recognised border (UN General Assembly resolution 68/262):
// Crimea is part of Ukraine. This moves that piece of outline across.
function moveCrimeaToUkraine(topology, feature, merge) {
  const objects = topology.objects.countries.geometries;
  const russia = objects.find((object) => object.properties?.name === "Russia");
  const ukraine = objects.find((object) => object.properties?.name === "Ukraine");
  if (!russia || !ukraine || russia.type !== "MultiPolygon") return;
  const pieces = feature(topology, russia).geometry.coordinates;
  const index = pieces.findIndex((polygon) => {
    const box = bboxOf({ type: "Polygon", coordinates: polygon });
    return box && box[0] > 32 && box[2] < 37 && box[1] > 44 && box[3] < 46.5 && polygon[0].length > 20;
  });
  if (index < 0) return;
  const crimea = { type: "Polygon", arcs: russia.arcs[index] };
  const merged = merge(topology, [ukraine, crimea]);
  // Keep the merged outline as plain coordinates on the Ukraine object.
  ukraine.mergedGeometry = merged;
  russia.arcs = russia.arcs.filter((_, i) => i !== index);
}

let cache = null;

function load() {
  if (cache) return cache;
  const require = createRequire(path.join(ROOT, "package.json"));
  const file = require.resolve("world-atlas/countries-50m.json");
  const topology = JSON.parse(fs.readFileSync(file, "utf8"));
  const feature = topojson.feature || topojson.default?.feature;
  const merge = topojson.merge || topojson.default?.merge;
  moveCrimeaToUkraine(topology, feature, merge);
  const collection = feature(topology, topology.objects.countries);
  const byId = new Map();
  const list = [];
  for (const item of collection.features) {
    const name = item.properties?.name || "Unnamed";
    const source = topology.objects.countries.geometries.find((object) => object.properties?.name === name && object.mergedGeometry);
    if (source) item.geometry = source.mergedGeometry;
    if (!item.geometry || !["Polygon", "MultiPolygon"].includes(item.geometry.type)) continue;
    item.geometry = splitAntimeridian(item.geometry);
    // A few places have no code (or share one): give them a name-based id.
    let id = item.id != null ? String(item.id) : `x-${slug(name)}`;
    if (byId.has(id)) id = `x-${slug(name)}`;
    let full = name;
    for (const [pattern, word] of EXPANSIONS) full = full.replace(pattern, word);
    const country = { id, name, geometry: item.geometry, bbox: bboxOf(item.geometry), search: [normalizeName(name), normalizeName(full)] };
    byId.set(id, country);
    list.push(country);
  }
  for (const [alias, id] of Object.entries(ALIASES)) byId.get(id)?.search.push(alias);
  list.sort((a, b) => a.name.localeCompare(b.name));
  cache = { byId, list };
  return cache;
}

// Countries matching the typed text, best matches first.
export function searchCountries(query, limit = 12) {
  const q = normalizeName(query);
  if (!q) return [];
  const scored = [];
  for (const country of load().list) {
    let best = Infinity;
    for (const name of country.search) {
      if (name === q) best = Math.min(best, 0);
      else if (name.startsWith(q)) best = Math.min(best, 1);
      else if (name.split(/[\s-]/).some((word) => word.startsWith(q))) best = Math.min(best, 2);
      else if (q.length >= 3 && name.includes(q)) best = Math.min(best, 3);
    }
    if (best < Infinity) scored.push([best, country]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(([, country]) => ({ id: country.id, name: country.name, kind: "country" }));
}

export function getCountry(id) {
  const country = load().byId.get(String(id));
  if (!country) return null;
  return { id: country.id, name: country.name, geometry: country.geometry, bbox: country.bbox };
}

export function listCountries() {
  return load().list.map((country) => ({ id: country.id, name: country.name }));
}
