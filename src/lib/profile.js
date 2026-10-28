// WHAT THIS FILE DOES
// Reads a registered person's profile (GET /api/account -> { account,
// profile }, saved by the website's register page) for the app's first
// screens, so an account starts near home instead of at the demo's places:
//
//   profilePlace(profile)       the place they asked to watch, as the app's
//                               { lat, lon, label }, or null. The profile
//                               stores it as { lat, lng, label } (the
//                               website's word is "lng"; the app says "lon").
//   profileCountry(profile)     the country they gave, or "" (the Atlas's
//                               country search starts with it)
//   cornersPlaceholder(place)   the grey example text in a "corners" box:
//                               four corners of a small square around the
//                               place when there is one, else plain words
//                               (never Kupiansk or Iowa for an account)
//   boxPlaceholder(place)       the same for a north / south / east / west
//                               box: { north, south, east, west } as text
//
// WHO EDITS IT
// Whoever changes what the register page saves (brief §8, PUT /api/account).

// Half the side of the example square, in degrees: about 350 m.
const HALF_SIDE = 0.0032;

const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function profilePlace(profile) {
  const place = profile && typeof profile === "object" ? profile.place : null;
  if (!place || typeof place !== "object") return null;
  const lat = place.lat;
  const lon = finite(place.lon) ? place.lon : place.lng;
  if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const label = typeof place.label === "string" && place.label.trim() ? place.label.trim() : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  return { lat, lon, label };
}

export function profileCountry(profile) {
  const country = profile && typeof profile === "object" ? profile.country : "";
  return typeof country === "string" ? country.trim() : "";
}

// The four corners around a place, as "lat, lon" text, or the generic box.
function corners(place) {
  if (!place) return null;
  const north = (place.lat + HALF_SIDE).toFixed(4);
  const south = (place.lat - HALF_SIDE).toFixed(4);
  const dLon = HALF_SIDE / Math.max(0.2, Math.cos((place.lat * Math.PI) / 180));
  const east = (place.lon + dLon).toFixed(4);
  const west = (place.lon - dLon).toFixed(4);
  return { north, south, east, west };
}

export function cornersPlaceholder(place) {
  const box = corners(profilePlace({ place }));
  if (!box) return "latitude, longitude\nlatitude, longitude\nlatitude, longitude\nlatitude, longitude";
  return [`${box.south}, ${box.west}`, `${box.south}, ${box.east}`, `${box.north}, ${box.east}`, `${box.north}, ${box.west}`].join("\n");
}

export function boxPlaceholder(place) {
  return corners(profilePlace({ place })) || { north: "latitude", south: "latitude", east: "longitude", west: "longitude" };
}
