// WHAT THIS FILE DOES
// Reads GPS coordinates typed or pasted by a person and checks them before
// they are sent to the server, so the Area picker can say "4 points · 50 ha"
// or "Line 2: latitude must be from -90 to 90" while the person types.
//
//   parseCoordinates(text)  one "lat, lon" per line -> { points, errors }
//   polygonAreaHa(points)   the area inside the points, in hectares
//   checkPolygon(points)    { ok, areaHa, message } (same limits as the server)
//   checkBox(box)           the same for a north / south / east / west box
//   boxToPoints(box)        the four corners of a box as points
//   pointsToGeometry(points) a GeoJSON Polygon (lon, lat), for the map preview
//
// Points are always [lat, lon] (latitude first, like Google Maps).
//
// The limits (0.5 ha to 3,000,000 km²) match server/app.js. The server
// checks again; this is only so the person sees the problem straight away.
//
// WHO EDITS IT
// Whoever changes which coordinate formats the Area picker accepts.
// Tested in coords.test.js.

export const MIN_AREA_HA = 0.5;
export const MAX_AREA_HA = 3000000 * 100; // 3,000,000 km²

const EARTH_RADIUS_M = 6378137;
const rad = (degrees) => (degrees * Math.PI) / 180;

// One number with an optional ° and an optional N/S/E/W letter:
// "49.7", "-37.5", "49.7°", "49.7°N", "37.5 E", "49,7" is NOT accepted
// (the comma separates latitude from longitude).
const PART = /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])?$/;

// Splits one line into its two halves: "49.7, 37.5", "49.7 37.5",
// "49.7°N 37.5°E", "49.7N,37.5E", "49.7;37.5" or a tab between them.
function splitLine(line) {
  const cleaned = line.trim().replace(/^[[(]|[\])]$/g, "").trim();
  let parts = cleaned.split(/\s*[,;\t]\s*/).filter(Boolean);
  if (parts.length === 1) {
    // No comma: split on the space after a number (and its letter, if any).
    const match = /^(.+?[\d°NSEWnsew])\s+([+-]?\d.*)$/.exec(cleaned);
    parts = match ? [match[1], match[2]] : parts;
  }
  return parts;
}

function readPart(text) {
  const match = PART.exec(text.trim());
  if (!match) return null;
  const letter = (match[2] || "").toUpperCase();
  let value = Number(match[1]);
  if (letter === "S" || letter === "W") value = -Math.abs(value);
  return { value, letter };
}

// Reads one "lat, lon" per line. Blank lines are skipped. Gives back
//   { points: [[lat, lon], ...], errors: [{ line, message }] }
export function parseCoordinates(text) {
  const points = [];
  const errors = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = index + 1;
      if (!raw.trim()) return;
      const parts = splitLine(raw);
      if (parts.length !== 2) {
        errors.push({ line, message: `Line ${line}: write latitude, longitude (like 49.74, 37.54).` });
        return;
      }
      const a = readPart(parts[0]);
      const b = readPart(parts[1]);
      if (!a || !b) {
        errors.push({ line, message: `Line ${line}: "${raw.trim()}" is not a coordinate.` });
        return;
      }
      // Letters can put longitude first ("37.5E 49.7N"); otherwise lat comes first.
      let lat = a.value;
      let lon = b.value;
      if ("EW".includes(a.letter || "-") && "NS".includes(b.letter || "-")) {
        lat = b.value;
        lon = a.value;
      }
      if (!(lat >= -90 && lat <= 90)) {
        errors.push({ line, message: `Line ${line}: latitude must be from -90 to 90.` });
        return;
      }
      if (!(lon >= -180 && lon <= 180)) {
        errors.push({ line, message: `Line ${line}: longitude must be from -180 to 180.` });
        return;
      }
      points.push([lat, lon]);
    });
  return { points, errors };
}

// Drops a repeated closing point and back-to-back duplicates.
export function cleanRing(points) {
  const ring = [];
  for (const point of points || []) {
    const last = ring[ring.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) ring.push(point);
  }
  if (ring.length > 1) {
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] === last[0] && first[1] === last[1]) ring.pop();
  }
  return ring;
}

// The area inside the points in hectares (same formula as server/geo.js).
export function polygonAreaHa(points) {
  const ring = cleanRing(points);
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lat1, lon1] = ring[i];
    const [lat2, lon2] = ring[(i + 1) % ring.length];
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2) / 10000;
}

function sizeMessage(areaHa) {
  if (!(areaHa >= MIN_AREA_HA)) return `Too small (${areaHa.toFixed(2)} ha). The minimum is 0.5 ha.`;
  if (areaHa > MAX_AREA_HA) return "Too large. The maximum is 3,000,000 km² — pick a country instead.";
  return null;
}

// Checks a list of points. Gives back { ok, areaHa, message }.
export function checkPolygon(points) {
  const ring = cleanRing(points);
  if (ring.length < 3) {
    return { ok: false, areaHa: 0, message: ring.length === 0 ? "Add at least 3 corner points." : `Add ${3 - ring.length} more point${ring.length === 2 ? "" : "s"}.` };
  }
  const lons = ring.map((point) => point[1]);
  if (Math.max(...lons) - Math.min(...lons) > 180) {
    return { ok: false, areaHa: 0, message: "Areas that cross the 180° line are not supported." };
  }
  const areaHa = polygonAreaHa(ring);
  const message = sizeMessage(areaHa);
  return { ok: !message, areaHa, message };
}

// A box as its four corners, going round: SW, SE, NE, NW.
export function boxToPoints({ north, south, east, west }) {
  return [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
  ];
}

// Checks a box typed as four numbers (text or numbers).
export function checkBox(box) {
  const values = {};
  for (const key of ["north", "south", "east", "west"]) {
    const text = typeof box?.[key] === "string" ? box[key].trim() : box?.[key];
    if (text === "" || text == null) return { ok: false, areaHa: 0, message: "Fill in north, south, east and west." };
    values[key] = Number(text);
    if (!Number.isFinite(values[key])) return { ok: false, areaHa: 0, message: `${key[0].toUpperCase()}${key.slice(1)} is not a number.` };
  }
  const { north, south, east, west } = values;
  if (north > 90 || south < -90) return { ok: false, areaHa: 0, message: "Latitude must be from -90 to 90." };
  if (east > 180 || west < -180) return { ok: false, areaHa: 0, message: "Longitude must be from -180 to 180." };
  if (!(north > south)) return { ok: false, areaHa: 0, message: "North must be greater than south." };
  if (!(east > west)) return { ok: false, areaHa: 0, message: "East must be greater than west." };
  const areaHa = polygonAreaHa(boxToPoints(values));
  const message = sizeMessage(areaHa);
  return { ok: !message, areaHa, message, box: values };
}

// Points -> a closed GeoJSON Polygon of [lon, lat], plus its bbox
// [west, south, east, north]. Gives back null for fewer than 2 points.
export function pointsToGeometry(points) {
  const ring = cleanRing(points);
  if (ring.length < 2) return null;
  const coords = ring.map(([lat, lon]) => [lon, lat]);
  coords.push([...coords[0]]);
  const lats = ring.map((point) => point[0]);
  const lons = ring.map((point) => point[1]);
  return {
    geometry: { type: "Polygon", coordinates: [coords] },
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
  };
}
