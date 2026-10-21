// WHAT THIS FILE DOES
// A stand-in for the Google Earth Engine library (@google/earthengine),
// for tests only. It has just the parts gee.js and field-gee.js use (Image,
// ImageCollection, FeatureCollection, Feature, Geometry, Reducer, Filter,
// Dictionary, Number, Algorithms.If, Algorithms.CannyEdgeDetector, Join,
// data.authenticateViaPrivateKey, initialize, evaluate/getInfo,
// getDownloadURL).
//
// For the Field provider it also answers: ImageCollection.map(...).flatten()
// (one made-up image per ~3 days of the filterDate window, each with its
// date, so per-pass values follow a crop season), Image.reduceToVectors
// (made-up parcels inside the region, or small stress patches), Image.
// sampleRectangle (a grid shaped by the reproject crsTransform and the
// region, -1 / defaultValue outside the clip outline), Geometry area /
// centroid / bounds / buffer, FeatureCollection sort / toList / union, and the
// filters gt / gte / lt / notNull.
//
// Like the real library, building images does nothing until evaluate() is
// called. The stand-in:
//   - writes down every call (ee.calls) and every request (ee.requests),
//     so tests can check what gee.js asked for (pixel sizes, dates, ...)
//   - answers evaluate() with made-up but believable numbers in the same
//     shape Earth Engine would send (features with properties, counts,
//     dictionaries). The numbers are fixed per cell id, never random.
//   - refuses a JavaScript null inside ee.Dictionary or ee.Algorithms.If,
//     because the real Earth Engine fails on that
//   - keeps count of how many requests run at once (ee.stats.peakActive)
//
// Options for createFakeEe({ ... }):
//   sizes      { datasetId: number of images }  (default 6 for every collection)
//   assets     { assetId: { bands: [{ id }], properties? } | "missing" }
//              (default: has b1 and no properties)
//   authError  a message: signing in fails with it
//   fail       (request) => message | null; a message makes that request fail
//   delayMs    how long each request takes (default 1 ms), or
//              (request) => ms for each request. Like the real library, an
//              evaluate() request that takes longer than the deadline given
//              to data.setDeadline(ms) ends at that deadline with "Server
//              returned HTTP code: -1 for POST .../value:compute", from a
//              timer started when the request is sent (download links
//              ignore the deadline here)
//   nestedCollections  "describe" answers a FeatureCollection nested inside
//              an ee.Dictionary or ee.List the way REAL Earth Engine does:
//              { type: "FeatureCollection", columns: {} } with NO features
//              (use .toList(n) to send features). This is the default;
//              "full" sends the features anyway (NOT what Earth Engine does).
//   assetDelayMs  how long data.getAsset takes (default 0 ms), or
//              (assetId) => ms
//   downloadError  a message: getDownloadURL fails with it
//   parcelGrid  reduceToVectors cuts a region into parcelGrid x parcelGrid
//              made-up parcels (default 3; 0 = finds nothing)
//   extraParcels  GeoJSON geometries reduceToVectors adds to every parcel
//              trace (e.g. a broken whole-globe shape, as real Earth
//              Engine once sent)
//   gaul2      the FAO GAUL level 2 rows place names come from (default
//              one district of Kharkiv oblast)
//   values     { outputName: number | (u, { date, lat, id }) => number }: fixed
//              answers for some reduced values (e.g. { fires: 8 }), used
//              before the made-up ones
//   samplePoints  how many points Image.stratifiedSample / sample finds
//              (default 3). With 0 the sample is empty, as for a war whose
//              fires never look like fighting (real data, south Lebanon,
//              September 2026): like real Earth Engine, the distance to an
//              empty collection is masked everywhere, so an unmask(value)
//              of it reads that value in every cell (an unmask(number) of
//              any band with no pixels does)
//
// Field bands added for stress v2 and the crop type: ndre, ndyi, vhPower
// (Sentinel-1 VH as power, a tall crop in July), the phenology composites
// k0..k17 and the edge strip (stripCropland, edgeAny, edgePersistent; a
// persistent line by default; Geometry.perimeter, or values.perimeterM
// for every outline). Image.get answers a picture's orbit
// direction and relative orbit; a feature carrying `month` is valued for
// that month. Batched monthly bands m<i>_ndvi / _ndwi / _clear are valued
// like ndvi / ndwi / clear.
//
// Field NDVI follows the hemisphere of the feature reduced: a crop season
// peaking at the end of June in the north (and the tropics), at the end of
// December south of 23.5° S.
//
// WHO EDITS IT
// Whoever changes gee.js and starts using a part of Earth Engine that is
// not here yet. Used by the tests only (gee.test.js, field-gee.test.js);
// the app never loads it.

const NODE = Symbol("fake-ee node");

// A stable number 0..1 from a text (FNV-1a hash).
export function unitHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// Is there a JavaScript null (or undefined) in this value, outside Earth
// Engine objects?
function hasNull(value) {
  if (value === null || value === undefined) return true;
  if (value && value[NODE]) return false;
  if (Array.isArray(value)) return value.some(hasNull);
  if (value && typeof value === "object") return Object.values(value).some(hasNull);
  return false;
}

// What kind of object a method gives back, by the kind it is called on.
const RESULT_KIND = {
  Image: {
    reduceRegions: "FeatureCollection",
    reduceToVectors: "FeatureCollection",
    sampleRectangle: "Feature",
    stratifiedSample: "FeatureCollection",
    sample: "FeatureCollection",
    reduceRegion: "Dictionary",
    projection: "Projection",
    date: "Date",
    get: "Object",
    bandNames: "List",
  },
  ImageCollection: {
    size: "Number",
    aggregate_max: "Number",
    aggregate_min: "Number",
    first: "Image",
    median: "Image",
    mosaic: "Image",
    count: "Image",
    max: "Image",
    min: "Image",
    mean: "Image",
    sum: "Image",
    reduce: "Image",
    toList: "List",
    flatten: "FeatureCollection",
  },
  FeatureCollection: { size: "Number", aggregate_max: "Number", aggregate_array: "List", first: "Feature", geometry: "Geometry", distance: "Image", reduceToImage: "Image", toList: "List" },
  Feature: { get: "Object", geometry: "Geometry", area: "Number" },
  Geometry: { area: "Number", perimeter: "Number", coordinates: "List" },
  Date: { get: "Number", millis: "Number", format: "String" },
  Dictionary: { get: "Object" },
  List: { get: "Object", size: "Number" },
  Join: { apply: "FeatureCollection" },
};
const SAME_KIND_AS = { Number: "Number", Object: "Number", String: "String" };

// Made-up values per output name, for one feature (u is 0..1, fixed per cell).
function fakeValue(name, u, areaKm2, ctx = {}) {
  if (ctx.values && Object.hasOwn(ctx.values, name)) {
    const fixed = ctx.values[name];
    return typeof fixed === "function" ? fixed(u, ctx) : fixed;
  }
  const field = fieldValue(name, u, ctx);
  if (field !== undefined) return field;
  switch (name) {
    case "chernozemCrop":
      return 0.35 + 0.6 * u;
    case "chernozemAll":
      return 0.25 + 0.6 * u;
    case "cropland":
      return 0.15 + 0.8 * u;
    case "chiDrop":
      return -0.05 + 0.4 * u;
    case "heavy":
      return 0.5 * u;
    case "radarDb":
      return 0.2 + 1.5 * u;
    case "firesWar":
      return 0.4 * u;
    case "conflictM":
      return 5000 + 290000 * u;
    case "lights":
      return 20 * u;
    case "radarShare":
      return 0.3 * u;
    case "firesMonth":
      return 0.08 * u;
    case "people":
      return (10 + 490 * u) * areaKm2;
    case "fireDay":
      return 1 + Math.floor(27 * u);
    case "socRaw":
      return 300 + 200 * u; // SoilGrids dg/kg
    case "greatGroup":
      return 290; // Hapludolls
    case "blackSoil":
      return 1;
    case "worldCover":
      return 40;
    case "assetRaw":
      return 50 + Math.round(39 * u);
    default:
      return u;
  }
}

// A crop season: NDVI near 0.2 in winter, about 0.8 at the end of June
// (at the end of December south of 23.5° S, where seasons are reversed).
function seasonalNdvi(dayOfYear, u, lat) {
  let days = dayOfYear - 175;
  if (Number.isFinite(lat) && lat <= -23.5) days = ((((dayOfYear - 357) % 365) + 365 + 182) % 365) - 182;
  return 0.2 + 0.6 * Math.exp(-((days / 45) ** 2)) + 0.06 * (u - 0.5);
}
const dayOfYear = (ms) => Math.floor((ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 1)) / 86400000) + 1;

// The mean NDVI of one calendar month in 2019-2021 (the season finder's
// bands ndvi01..ndvi12): greenest in July in the north, in January south of
// 23.5° S, and flat (no clear season) in the tropics.
function climatologyNdvi(month, u, lat) {
  if (Number.isFinite(lat) && Math.abs(lat) < 23.5) return 0.6 + 0.01 * u;
  const peak = Number.isFinite(lat) && lat <= -23.5 ? 1 : 7;
  const gap = Math.min(Math.abs(month - peak), 12 - Math.abs(month - peak));
  return 0.2 + 0.6 * Math.exp(-((gap / 1.6) ** 2)) + 0.02 * (u - 0.5);
}

// Values for the Field provider's band names (undefined: not one of them).
function fieldValue(name, u, { date, lat } = {}) {
  const climate = name.match(/^ndvi(\d\d)$/);
  if (climate) return climatologyNdvi(Number(climate[1]), u, lat);
  if (name === "ndvi") return Number.isFinite(date) ? seasonalNdvi(dayOfYear(date), u, lat) : 0.3 + 0.5 * u;
  if (name === "ndwi") return Number.isFinite(date) ? seasonalNdvi(dayOfYear(date), u, lat) * 0.7 - 0.25 : -0.1 + 0.4 * u;
  if (name === "clear") return u < 0.25 ? u : 0.6 + 0.4 * u;
  if (/^n20\d\d_ndvi$/.test(name)) return 0.3 + 0.5 * u;
  if (/^n20\d\d_ndwi$/.test(name)) return -0.1 + 0.4 * u;
  if (/^n20\d\d_ndre$/.test(name)) return 0.2 + 0.3 * u;
  if (name === "ndre") return Number.isFinite(date) ? seasonalNdvi(dayOfYear(date), u, lat) * 0.6 - 0.05 : 0.15 + 0.35 * u;
  if (name === "ndyi") return Number.isFinite(date) ? -0.12 + 0.06 * u : -0.1 + 0.05 * u;
  // Sentinel-1 VH as power: about -17 dB bare, -12 dB under a tall crop
  // at the end of July (north), with up to 0.6 dB of speckle.
  if (name === "vhPower") {
    const crop = Number.isFinite(date) ? Math.exp(-(((dayOfYear(date) - 205) / 45) ** 2)) : 0.5;
    return 10 ** ((-17 + 5 * crop + 0.6 * (u - 0.5)) / 10);
  }
  // Batched monthly means (bands m<i>_ndvi, m<i>_ndwi, m<i>_clear).
  const monthly = name.match(/^m\d+_(ndvi|ndwi|clear)$/);
  if (monthly) return fieldValue(monthly[1], u, { lat });
  if (name === "ndwiAnomaly") return -0.12 + 0.2 * u;
  if (name === "redEdgeOnly") return 0.03 * u;
  if (name === "medNdvi" || name === "medNdre") return 0.5 * u;
  // Detection: the phenology curve composites (one crop season, peak at k9)
  // and the strip between two parcels (a real edge unless a test says not).
  const phenology = name.match(/^k(\d+)$/);
  if (phenology) return 0.2 + 0.6 * Math.exp(-(((Number(phenology[1]) - 9) / 4) ** 2)) + 0.01 * (u - 0.5);
  if (name === "stripCropland") return 0.9;
  if (name === "edgeAny") return 0.3;
  if (name === "edgePersistent") return 0.25;
  const curve = name.match(/^c20\d\d_(\d\d)$/);
  if (curve) return seasonalNdvi(Number(curve[1]) * 15.2 + 1, u, lat);
  if (name === "stressed") return 0.2 * u;
  if (name === "radarChanged") return 0.15 * u;
  if (name === "fires") return Math.floor(6 * u);
  if (name === "firesBase") return Math.floor(4 * u);
  if (name === "chernozem") return 0.35 + 0.6 * u;
  if (name === "condition") return 0.3 + 0.7 * u;
  if (name === "med" || name === "shift") return 0.5 * u;
  return undefined;
}

// Area (km²) of a GeoJSON rectangle-like polygon, roughly.
function roughAreaKm2(geometry) {
  const ring = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : geometry?.type === "MultiPolygon" ? geometry.coordinates?.[0]?.[0] : null;
  if (!ring?.length) return 1;
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const w = Math.max(...lons) - Math.min(...lons);
  const h = Math.max(...lats) - Math.min(...lats);
  const lat = (Math.max(...lats) + Math.min(...lats)) / 2;
  return w * h * 111.32 * 111.32 * Math.cos((lat * Math.PI) / 180);
}

const GAUL1 = [
  { ADM0_NAME: "Ukraine", ADM1_NAME: "Kharkivs'ka", ADM1_CODE: 3180, box: [34.9, 48.5, 38.1, 50.5] },
  { ADM0_NAME: "Ukraine", ADM1_NAME: "Kyivs'ka", ADM1_CODE: 3186, box: [29.2, 49.2, 32.2, 51.6] },
  { ADM0_NAME: "Poland", ADM1_NAME: "Mazowieckie", ADM1_CODE: 2300, box: [19.3, 51.0, 23.1, 53.5] },
];
const GAUL2 = [{ ADM0_NAME: "Ukraine", ADM1_NAME: "Kharkivs'ka", ADM2_NAME: "Chuhuivs'kyi", ADM2_CODE: 31800 }];

function boxPolygon([w, s, e, n]) {
  return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

// Outer rings of a Polygon / MultiPolygon.
function outerRings(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.map((p) => p[0]);
  return [];
}
function ringBox(ring) {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inGeometry = (lon, lat, geometry) => outerRings(geometry).some((ring) => inRing(lon, lat, ring));

// A circle of `radiusM` metres around a point, as a 24-sided polygon.
function circlePolygon([lon, lat], radiusM) {
  const ring = [];
  for (let i = 0; i <= 24; i += 1) {
    const a = ((i % 24) / 24) * 2 * Math.PI;
    ring.push([lon + (radiusM * Math.cos(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (radiusM * Math.sin(a)) / 110574]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

// Made-up field parcels inside a region: its box cut into a k x k grid
// with ~15 m gaps; cells whose centre is inside the region are parcels.
function fakeParcels(regionGeometry, k = 3) {
  const out = [];
  for (const ring of outerRings(regionGeometry)) {
    const [w, s, e, n] = ringBox(ring);
    const gapLon = 15 / (111320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
    const gapLat = 15 / 110574;
    for (let r = 0; r < k; r += 1) {
      for (let c = 0; c < k; c += 1) {
        const cell = [w + ((e - w) * c) / k + gapLon, s + ((n - s) * r) / k + gapLat, w + ((e - w) * (c + 1)) / k - gapLon, s + ((n - s) * (r + 1)) / k - gapLat];
        if (inGeometry((cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2, regionGeometry)) out.push(feature(boxPolygon(cell), { label: 1, count: 1000 }));
      }
    }
  }
  return out;
}

// Made-up stress patches: one ~80 m square near the middle of each polygon.
function fakePatches(regionGeometry) {
  return outerRings(regionGeometry).map((ring) => {
    const [w, s, e, n] = ringBox(ring);
    const lon = (w + e) / 2;
    const lat = (s + n) / 2;
    const dLon = 40 / (111320 * Math.cos((lat * Math.PI) / 180));
    const dLat = 40 / 110574;
    return feature(boxPolygon([lon - dLon, lat - dLat, lon + dLon, lat + dLat]), { label: 1, count: 64 });
  });
}
function feature(geometry, properties) {
  return { type: "Feature", geometry: geometry ?? null, properties: { ...(properties || {}) } };
}

export function createFakeEe(options = {}) {
  const { sizes = {}, assets = {}, authError = null, fail = null, delayMs = 1, assetDelayMs = 0, nestedCollections = "describe", downloadError = null, parcelGrid = 3, extraParcels = [], gaul2 = GAUL2, values = null, samplePoints = 3 } = options;
  const calls = [];
  const requests = [];
  const stats = { evaluations: 0, active: 0, peakActive: 0 };
  let initialized = false;
  let project = null;
  // data.setDeadline (0: none, like the library before it is set).
  let deadlineMs = 0;
  const delayOf = (request) => (typeof delayMs === "function" ? delayMs(request) : delayMs);

  // ----- building nodes -----

  function wrap(node) {
    return new Proxy(node, {
      get(target, prop) {
        if (prop === NODE) return target;
        if (typeof prop === "symbol" || prop === "then" || prop === "toJSON") return undefined;
        if (prop === "evaluate" || prop === "getInfo") return (callback) => runRequest(target, callback);
        if (prop === "getDownloadURL") return (params, callback) => downloadUrl(target, params, callback);
        return (...args) => callMethod(target, prop, args);
      },
    });
  }
  const unwrap = (value) => (value && value[NODE]) || null;

  function make(kind, op, args, extra = {}) {
    return wrap({ kind, op, args, ...extra });
  }

  // Band names (and whether each is empty everywhere) of an image node.
  function bandsOf(value) {
    const node = unwrap(value);
    return node?.bands || [];
  }
  const allEmpty = (bands) => bands.length > 0 && bands.every((b) => b.empty);
  // A sample of an image's pixels (stratifiedSample, sample) that finds
  // nothing (samplePoints 0).
  const isEmptySample = (node) => (node?.op === "stratifiedSample" || node?.op === "sample") && !(samplePoints > 0);
  const isZeroConstant = (value) => {
    const node = unwrap(value);
    return node?.op === "Image.constant" && node.args[0] === 0;
  };
  const names = (selector) => (Array.isArray(selector) ? selector : [selector]).filter((s) => typeof s === "string");

  function imageBands(parent, method, args) {
    const from = parent.bands || [];
    const empty = allEmpty(from);
    switch (method) {
      case "rename": {
        // A one-band image keeps the value an unmask gave it (below).
        const fill = from.length === 1 && from[0].fill !== undefined ? { fill: from[0].fill } : {};
        return names(args.length > 1 ? args : args[0]).map((name) => ({ name, empty, ...fill }));
      }
      case "select": {
        const picked = names(args[0]);
        return picked.length && !picked.includes(".*") ? picked.map((name) => ({ name, empty })) : from;
      }
      case "normalizedDifference":
        return [{ name: "nd", empty }];
      case "addBands":
        return [...from, ...bandsOf(args[0])];
      case "reduce":
        return [{ name: from.length === 1 ? from[0].name : "max", empty }];
      case "updateMask":
        return isZeroConstant(args[0]) ? from.map((b) => ({ ...b, empty: true })) : from;
      case "unmask":
        // A band with no pixels anywhere, unmasked with a number, is that
        // number everywhere (the distance to an empty sample, unmasked
        // with 300 km: every cell reads 300 km).
        return from.map((b) => ({ ...b, empty: false, ...(b.empty && typeof args[0] === "number" ? { fill: args[0] } : {}) }));
      default:
        return from;
    }
  }

  function callMethod(parent, method, args) {
    calls.push({ name: `${parent.kind}.${method}`, args });
    if (method === "map") {
      // Run the callback once on a placeholder, like Earth Engine does.
      const elementKind = parent.kind === "ImageCollection" ? "Image" : "Feature";
      const placeholder = { kind: elementKind, op: "placeholder", args: [], bands: parent.bands || [] };
      const body = args[0](wrap(placeholder));
      return make(parent.kind, "map", args, { parent, placeholder, body: unwrap(body) || body, bands: unwrap(body)?.bands || [], dataset: parent.dataset });
    }
    const kind = RESULT_KIND[parent.kind]?.[method] || SAME_KIND_AS[parent.kind] || parent.kind;
    const extra = { parent, dataset: parent.dataset };
    if (kind === "Image") {
      if (parent.kind === "Image") extra.bands = imageBands(parent, method, args);
      // The distance to a sample that found no points has no pixels.
      else if (parent.kind === "FeatureCollection") extra.bands = [{ name: "distance", empty: method === "distance" && isEmptySample(parent) }];
      else extra.bands = parent.bands || [];
    }
    if (kind === "ImageCollection") extra.bands = method === "select" ? names(args[0]).map((name) => ({ name, empty: false })) : parent.bands || [];
    return make(kind, method, args, extra);
  }

  // ----- the library's static parts -----

  function image(value) {
    calls.push({ name: "Image", args: [value] });
    if (unwrap(value)) return value;
    if (typeof value === "number") return make("Image", "Image.constant", [value], { bands: [{ name: "constant", empty: false }] });
    return make("Image", "Image.load", [value], { bands: [{ name: "b1", empty: false }], dataset: value });
  }
  image.constant = (value) => {
    calls.push({ name: "Image.constant", args: [value] });
    const bands = Array.isArray(value) ? value.map((_, i) => ({ name: `constant_${i}`, empty: false })) : [{ name: "constant", empty: false }];
    return make("Image", "Image.constant", [value], { bands });
  };
  image.cat = (...list) => {
    const parts = Array.isArray(list[0]) ? list[0] : list;
    calls.push({ name: "Image.cat", args: [parts] });
    return make("Image", "Image.cat", [parts], { bands: parts.flatMap(bandsOf) });
  };
  image.pixelArea = () => {
    calls.push({ name: "Image.pixelArea", args: [] });
    return make("Image", "Image.pixelArea", [], { bands: [{ name: "area", empty: false }] });
  };
  image.pixelLonLat = () => {
    calls.push({ name: "Image.pixelLonLat", args: [] });
    return make("Image", "Image.pixelLonLat", [], { bands: [{ name: "longitude", empty: false }, { name: "latitude", empty: false }] });
  };

  const geometry = (value) => make("Geometry", "Geometry", [value]);
  geometry.Rectangle = (coords, proj, geodesic) => {
    calls.push({ name: "Geometry.Rectangle", args: [coords, proj, geodesic] });
    return make("Geometry", "Geometry.Rectangle", [coords]);
  };
  geometry.Point = (coords) => {
    calls.push({ name: "Geometry.Point", args: [coords] });
    return make("Geometry", "Geometry.Point", [coords]);
  };
  geometry.Polygon = (coords) => make("Geometry", "Geometry.Polygon", [coords]);
  geometry.MultiPolygon = (coords, proj, geodesic) => {
    calls.push({ name: "Geometry.MultiPolygon", args: [coords, proj, geodesic] });
    return make("Geometry", "Geometry.MultiPolygon", [coords]);
  };

  const reducer = (name) => (...args) => {
    calls.push({ name: `Reducer.${name}`, args: [] });
    return make("Reducer", `Reducer.${name}`, [], { reducerName: name });
  };

  const filter = new Proxy(
    {},
    {
      get(_, name) {
        return (...args) => {
          calls.push({ name: `Filter.${String(name)}`, args });
          return make("Filter", `Filter.${String(name)}`, args);
        };
      },
    },
  );

  const ee = {
    Image: image,
    ImageCollection(id) {
      calls.push({ name: "ImageCollection", args: [id] });
      if (Array.isArray(id)) return make("ImageCollection", "ImageCollection.fromImages", [id], { dataset: null, bands: bandsOf(id[0]) });
      return make("ImageCollection", "ImageCollection.load", [id], { dataset: id, bands: [] });
    },
    FeatureCollection(value) {
      calls.push({ name: "FeatureCollection", args: [value] });
      return make("FeatureCollection", "FeatureCollection.load", [value], { dataset: typeof value === "string" ? value : null });
    },
    Feature(geom, props) {
      calls.push({ name: "Feature", args: [geom, props] });
      return make("Feature", "Feature", [geom, props]);
    },
    Geometry: geometry,
    Reducer: {
      mean: reducer("mean"),
      median: reducer("median"),
      sum: reducer("sum"),
      max: reducer("max"),
      min: reducer("min"),
      first: reducer("first"),
      count: reducer("count"),
      countEvery: reducer("countEvery"),
    },
    Filter: filter,
    Join: {
      saveFirst(opts) {
        calls.push({ name: "Join.saveFirst", args: [opts] });
        return make("Join", "Join.saveFirst", [opts]);
      },
    },
    Dictionary(object) {
      calls.push({ name: "Dictionary", args: [object] });
      if (hasNull(object)) throw new Error("fake-ee: a JavaScript null inside ee.Dictionary (Earth Engine rejects this).");
      return make("Dictionary", "Dictionary", [object]);
    },
    Number(value) {
      calls.push({ name: "Number", args: [value] });
      if (value === null || value === undefined) throw new Error("fake-ee: ee.Number(null).");
      return make("Number", "Number", [value]);
    },
    String(value) {
      return make("String", "String", [value]);
    },
    List(value) {
      return make("List", "List", [value]);
    },
    Algorithms: {
      CannyEdgeDetector(input, threshold, sigma) {
        const opts = unwrap(input) ? { image: input, threshold, sigma } : input || {};
        calls.push({ name: "Algorithms.CannyEdgeDetector", args: [opts] });
        if (hasNull([opts.threshold ?? 0, opts.sigma ?? 1])) throw new Error("fake-ee: null in CannyEdgeDetector.");
        return make("Image", "Algorithms.CannyEdgeDetector", [opts.image, opts.threshold, opts.sigma], { bands: bandsOf(opts.image) });
      },
      If(condition, whenTrue, whenFalse) {
        calls.push({ name: "Algorithms.If", args: [condition, whenTrue, whenFalse] });
        if ([condition, whenTrue, whenFalse].some(hasNull)) throw new Error("fake-ee: a JavaScript null inside ee.Algorithms.If (Earth Engine rejects this).");
        return make("Object", "If", [condition, whenTrue, whenFalse]);
      },
    },
    data: {
      authenticateViaPrivateKey(key, onOk, onFail) {
        calls.push({ name: "data.authenticateViaPrivateKey", args: [key?.client_email] });
        setTimeout(() => (authError ? onFail(authError) : onOk()), 0);
      },
      setDeadline(ms) {
        calls.push({ name: "data.setDeadline", args: [ms] });
        deadlineMs = Number(ms) || 0;
      },
      getAsset(id, callback) {
        calls.push({ name: "data.getAsset", args: [id] });
        const info = assets[id];
        setTimeout(
          () => {
            if (info === "missing") callback(undefined, `Asset '${id}' does not exist or doesn't allow this operation.`);
            else callback(info || { id, type: "IMAGE", bands: [{ id: "b1" }] });
          },
          typeof assetDelayMs === "function" ? assetDelayMs(id) : assetDelayMs,
        );
      },
    },
    initialize(baseUrl, tileUrl, onOk, onFail, xsrf, projectId) {
      calls.push({ name: "initialize", args: [projectId] });
      initialized = true;
      project = projectId;
      setTimeout(() => onOk(), 0);
    },
    reset() {
      initialized = false;
    },
    // ----- for tests -----
    calls,
    requests,
    stats,
    callsNamed: (name) => calls.filter((c) => c.name === name),
    // The recorded node behind a built object ({ kind, op, args, parent,
    // dataset, bands }), so a test can walk the image graph; null for
    // anything else.
    nodeOf: (value) => unwrap(value),
    get initialized() {
      return initialized;
    },
  };

  // ----- answering requests -----

  // Every node a request depends on (to find, e.g., its reduceRegions).
  function walk(start) {
    const seen = new Set();
    const out = [];
    const visit = (value) => {
      if (value === null || value === undefined) return;
      const node = unwrap(value) || (value && value.kind && value.op ? value : null);
      if (node) {
        if (seen.has(node)) return;
        seen.add(node);
        out.push(node);
        visit(node.parent);
        visit(node.body);
        node.args.forEach(visit);
        return;
      }
      if (typeof value === "function") return;
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(start);
    return out;
  }

  // getDownloadURL(params, callback(url, error)), like the real client.
  function downloadUrl(node, params, callback) {
    calls.push({ name: "Image.getDownloadURL", args: [params] });
    if (hasNull(params)) throw new Error("fake-ee: a JavaScript null inside getDownloadURL params.");
    const request = { node, nodes: walk(node), download: params, has: () => false, find: () => [] };
    requests.push(request);
    setTimeout(() => {
      if (!initialized) return callback(null, "Earth Engine client library not initialized.");
      const message = downloadError || (fail ? fail(request) : null);
      if (message) return callback(null, message);
      callback(`https://earthengine.googleapis.com/v1/projects/test/thumbnails/fake-${requests.length}:getPixels`);
    }, delayOf(request));
  }

  function runRequest(node, callback) {
    const nodes = walk(node);
    const request = {
      node,
      nodes,
      has: (op) => nodes.some((n) => n.op === op),
      find: (op) => nodes.filter((n) => n.op === op),
    };
    requests.push(request);
    stats.evaluations += 1;
    stats.active += 1;
    stats.peakActive = Math.max(stats.peakActive, stats.active);
    const took = delayOf(request);
    // Longer than the library's deadline: it gives up at the deadline.
    const cut = deadlineMs > 0 && took > deadlineMs;
    setTimeout(
      () => {
        stats.active -= 1;
        if (!initialized) return callback(undefined, "Earth Engine client library not initialized.");
        if (cut) return callback(undefined, `Server returned HTTP code: -1 for POST https://earthengine.googleapis.com/v1/projects/${project}/value:compute`);
        const message = fail ? fail(request) : null;
        if (message) return callback(undefined, message);
        let value;
        try {
          value = resolve(node, new Map());
        } catch (error) {
          return callback(undefined, error.message);
        }
        callback(value);
      },
      cut ? deadlineMs : took,
    );
  }

  // The date window the nearest filterDate in a collection's chain uses.
  function dateWindow(node) {
    for (let n = node; n; n = n.parent) if (n.op === "filterDate") return { start: n.args[0], end: n.args[1] };
    return null;
  }
  function collectionSize(node) {
    const window = dateWindow(node);
    if (window && !(String(window.start) < String(window.end))) return 0;
    return sizes[node.dataset] ?? 6;
  }

  function resolve(value, scope) {
    const node = unwrap(value) || (value && value.kind && value.op && !Array.isArray(value) ? value : null);
    if (!node) {
      if (Array.isArray(value)) return value.map((v) => resolve(v, scope));
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, scope)]));
      return value;
    }
    const arg = (i) => resolve(node.args[i], scope);
    const parent = () => resolve(node.parent, scope);
    switch (node.op) {
      case "placeholder":
        return scope.get(node);
      case "Number":
      case "String":
        return arg(0);
      case "Dictionary":
      case "List":
        return nestedCollections === "describe" ? describeNested(arg(0)) : arg(0);
      case "If":
        return arg(0) ? arg(1) : arg(2);
      case "Geometry.Rectangle":
        return boxPolygon(arg(0));
      case "Geometry.Point":
        return { type: "Point", coordinates: arg(0) };
      case "Geometry.Polygon":
        return { type: "Polygon", coordinates: arg(0) };
      case "Geometry.MultiPolygon":
        return { type: "MultiPolygon", coordinates: arg(0) };
      case "Geometry":
        return arg(0);
      case "Feature": {
        const first = arg(0);
        if (node.args[1] === undefined && first?.type === "Feature") return first;
        return feature(first, arg(1));
      }
      case "FeatureCollection.load": {
        const source = node.args[0];
        if (Array.isArray(source)) return { type: "FeatureCollection", features: resolve(source, scope) };
        if (source === "FAO/GAUL/2015/level1") return { type: "FeatureCollection", features: GAUL1.map(({ box, ...p }) => feature(boxPolygon(box), p)) };
        if (source === "FAO/GAUL/2015/level2") return { type: "FeatureCollection", features: gaul2.map((p) => feature(null, p)) };
        return { type: "FeatureCollection", features: [] };
      }
    }
    // Methods, by the kind they were called on.
    const kind = node.parent?.kind;
    const method = node.op;
    if (kind === "Number" || kind === "Object") {
      const a = parent();
      const b = arg(0);
      const ops = { gt: a > b, lt: a < b, gte: a >= b, lte: a <= b, eq: a === b, add: a + b, subtract: a - b, multiply: a * b, divide: a / b, and: a && b, or: a || b };
      if (method in ops) return ops[method];
      throw new Error(`fake-ee: Number.${method} is not in the stand-in.`);
    }
    if (kind === "ImageCollection") {
      if (method === "flatten") return flattenImages(node.parent, scope);
      if (method === "size") return collectionSize(node.parent);
      if (method === "aggregate_max" || method === "aggregate_min") {
        const window = dateWindow(node.parent);
        return window ? Date.parse(`${window.end}T00:00:00Z`) - 2 * 86400000 : 0;
      }
      throw new Error(`fake-ee: cannot answer ImageCollection.${method} directly.`);
    }
    if (kind === "Feature") {
      const f = parent();
      if (method === "get") return f?.properties?.[arg(0)] ?? null;
      if (method === "geometry") return f?.geometry ?? null;
      if (method === "set") {
        const changes = typeof node.args[0] === "string" ? { [arg(0)]: arg(1) } : arg(0);
        return { ...f, properties: { ...f.properties, ...changes } };
      }
      if (method === "setGeometry") return { ...f, geometry: arg(0) };
      if (method === "area") return roughAreaKm2(f?.geometry) * 1e6;
      if (["simplify", "buffer", "transform", "copyProperties"].includes(method)) return f; // same outline
    }
    if (kind === "Geometry") return geometryMethod(parent(), method, node, scope);
    if (kind === "Image" && method === "date") return resolve(node.parent, scope)?.date ?? 0;
    if (kind === "Image" && method === "get") {
      // A picture's own properties: its date, and the orbit direction
      // (ascending and descending pictures take turns).
      const picture = imageContext(node.parent, scope);
      const key = arg(0);
      if (key === "orbitProperties_pass") return picture ? (picture.index % 2 ? "DESCENDING" : "ASCENDING") : null;
      if (key === "relativeOrbitNumber_start") return picture ? 14 + (picture.index % 4) * 30 : null;
      if (key === "system:time_start") return picture?.date ?? null;
      return null;
    }
    if (kind === "Date") {
      const ms = parent();
      if (method === "format") return new Date(ms).toISOString().slice(0, 10);
      if (method === "millis") return ms;
      throw new Error(`fake-ee: Date.${method} is not in the stand-in.`);
    }
    if (kind === "Join" && method === "apply") {
      const matchKey = resolve(node.parent.args[0], scope)?.matchKey || "match";
      const right = arg(1).features;
      return { type: "FeatureCollection", features: arg(0).features.map((f) => ({ ...f, properties: { ...f.properties, [matchKey]: right[0] } })) };
    }
    if (kind === "FeatureCollection") return collectionMethod(node, method, scope);
    if (kind === "Image") return imageMethod(node, method, scope);
    if (kind === "Dictionary" && method === "get") return parent()?.[arg(0)];
    throw new Error(`fake-ee: cannot answer ${kind}.${method}.`);
  }

  // Real Earth Engine sends a collection nested in a Dictionary / List as a
  // description only (no features).
  function describeNested(value) {
    const strip = (v) => (v && v.type === "FeatureCollection" && Array.isArray(v.features) ? { type: "FeatureCollection", columns: {} } : v);
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object" && !value.type) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strip(v)]));
    return value;
  }

  function geometryMethod(g, method, node, scope) {
    const arg = (i) => resolve(node.args[i], scope);
    switch (method) {
      case "area":
        return roughAreaKm2(g) * 1e6;
      case "perimeter": {
        // values.perimeterM (a number) stands in for any outline's perimeter.
        if (values && Number.isFinite(values.perimeterM)) return values.perimeterM;
        const ring = outerRings(g)[0] || [];
        let m = 0;
        for (let i = 1; i < ring.length; i += 1) {
          const lat = (ring[i][1] + ring[i - 1][1]) / 2;
          m += Math.hypot((ring[i][0] - ring[i - 1][0]) * 111320 * Math.cos((lat * Math.PI) / 180), (ring[i][1] - ring[i - 1][1]) * 110574);
        }
        return m;
      }
      case "centroid": {
        const ring = outerRings(g)[0];
        if (!ring) return g?.type === "Point" ? g : { type: "Point", coordinates: [0, 0] };
        const [w, s, e, n] = ringBox(ring);
        return { type: "Point", coordinates: [(w + e) / 2, (s + n) / 2] };
      }
      case "bounds": {
        const ring = outerRings(g)[0];
        return ring ? boxPolygon(ringBox(ring)) : g;
      }
      case "coordinates":
        return g?.coordinates ?? [];
      case "buffer":
        return g?.type === "Point" ? circlePolygon(g.coordinates, arg(0)) : g;
      case "intersection": {
        // A shape around the whole other one is cut down to it; anything
        // else keeps its outline (close enough for parcels inside a region).
        const other = arg(0);
        const a = outerRings(g)[0];
        const b = outerRings(other)[0];
        if (!a || !b) return g;
        const [aw, as, ae, an] = ringBox(a);
        const [bw, bs, be, bn] = ringBox(b);
        return aw <= bw && as <= bs && ae >= be && an >= bn ? other : g;
      }
      default:
        return g; // simplify, intersection, transform, ...: same outline
    }
  }

  // ImageCollection.map(fn).flatten(): one made-up image per ~3 days of the
  // collection's date window, each bound to the map's placeholder.
  function flattenImages(mapNode, scope) {
    if (mapNode?.op !== "map") throw new Error("fake-ee: flatten() is only answered after map().");
    const window = dateWindow(mapNode);
    const startMs = window ? Date.parse(`${window.start}T00:00:00Z`) : 0;
    const endMs = window ? Date.parse(`${window.end}T00:00:00Z`) : 0;
    const days = Math.max(0, Math.round((endMs - startMs) / 86400000));
    const count = sizes[mapNode.dataset] ?? Math.min(150, Math.ceil(days / 3));
    const features = [];
    for (let i = 0; i < count; i += 1) {
      const image = { fakeImage: true, index: i, date: startMs + Math.floor((i * days) / Math.max(1, count)) * 86400000 };
      const body = resolve(mapNode.body, new Map([...scope, [mapNode.placeholder, image]]));
      features.push(...(body?.features || []));
    }
    return { type: "FeatureCollection", features };
  }

  function matches(filterValue, properties, scope) {
    const f = unwrap(filterValue);
    if (!f) return true;
    const a = (i) => resolve(f.args[i], scope);
    switch (f.op) {
      case "Filter.eq":
        return !(a(0) in properties) || properties[a(0)] === a(1);
      case "Filter.stringContains":
        return String(properties[a(0)] ?? "").includes(a(1));
      case "Filter.gt":
        return Number(properties[a(0)]) > a(1);
      case "Filter.gte":
        return Number(properties[a(0)]) >= a(1);
      case "Filter.lt":
        return Number(properties[a(0)]) < a(1);
      case "Filter.notNull":
        return a(0).every((name) => properties[name] !== null && properties[name] !== undefined);
      case "Filter.or":
        return f.args.some((sub) => matches(sub, properties, scope));
      case "Filter.and":
        return f.args.every((sub) => matches(sub, properties, scope));
      default:
        return true;
    }
  }

  function collectionMethod(node, method, scope) {
    if (method === "map") {
      const source = resolve(node.parent, scope);
      return {
        type: "FeatureCollection",
        features: source.features.map((f) => resolve(node.body, new Map([...scope, [node.placeholder, f]]))),
      };
    }
    const fc = resolve(node.parent, scope);
    const arg = (i) => resolve(node.args[i], scope);
    switch (method) {
      case "filterBounds":
        return fc;
      case "filter":
        return { ...fc, features: fc.features.filter((f) => matches(node.args[0], f.properties, scope)) };
      case "limit":
        return { ...fc, features: fc.features.slice(0, arg(0)) };
      case "toList":
        return fc.features.slice(0, arg(0));
      case "sort": {
        const key = arg(0);
        const ascending = node.args[1] !== false;
        const sorted = [...fc.features].sort((x, y) => (Number(x.properties[key]) - Number(y.properties[key])) * (ascending ? 1 : -1));
        return { ...fc, features: sorted };
      }
      case "select": {
        const keep = arg(0);
        const all = keep.includes(".*");
        const retain = node.args[2] !== false;
        return {
          ...fc,
          features: fc.features.map((f) => ({
            type: "Feature",
            geometry: retain ? f.geometry : null,
            properties: all ? { ...f.properties } : Object.fromEntries(keep.filter((k) => k in f.properties).map((k) => [k, f.properties[k]])),
          })),
        };
      }
      case "size":
        return fc.features.length;
      case "first":
        return fc.features[0] ?? null;
      case "union": {
        // One feature: the box around every outline (the stand-in's "join").
        const rings = fc.features.flatMap((f) => outerRings(f.geometry));
        if (!rings.length) return { type: "FeatureCollection", features: [] };
        const boxes = rings.map(ringBox);
        const box = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
        return { type: "FeatureCollection", features: [feature(boxPolygon(box), {})] };
      }
      case "flatten":
        return { ...fc, features: fc.features.flatMap((f) => (f?.type === "FeatureCollection" ? f.features : [f])) };
      case "aggregate_array":
        return fc.features.map((f) => f.properties[arg(0)]).filter((v) => v !== undefined);
      case "geometry": {
        const shapes = fc.features.map((f) => f.geometry).filter((g) => g?.type === "Polygon");
        if (!shapes.length) return { type: "GeometryCollection", geometries: [] };
        return shapes.length === 1 ? shapes[0] : { type: "MultiPolygon", coordinates: shapes.map((g) => g.coordinates) };
      }
      default:
        throw new Error(`fake-ee: cannot answer FeatureCollection.${method}.`);
    }
  }

  // The outputs a reducer gives for an image, one value per name.
  // The made-up image (with its date) a map() body is working on, if any.
  function imageContext(imageNode, scope) {
    for (let n = imageNode; n; n = n.parent) {
      if (n.op === "placeholder") {
        const value = scope.get(n);
        return value?.fakeImage ? value : null;
      }
    }
    return null;
  }

  function reduceOne(imageNode, reducerValue, f, scope = new Map()) {
    const red = unwrap(reducerValue);
    let reducerName = "mean";
    let outputs = null;
    for (let r = red; r; r = r.parent) {
      if (r.op === "setOutputs" && !outputs) outputs = r.args[0];
      if (r.reducerName) reducerName = r.reducerName;
    }
    const bands = imageNode.bands || [];
    const image = imageContext(imageNode, scope);
    // A monthly request marks its features with the month: values follow the season.
    const monthDate = !image && /^\d{4}-\d{2}$/.test(String(f.properties?.month || "")) ? Date.parse(`${f.properties.month}-15T00:00:00Z`) : undefined;
    const date = image?.date ?? monthDate;
    const id = String(f.properties?.id ?? f.properties?.fid ?? f.properties?.aid ?? JSON.stringify(f.geometry?.coordinates)) + (Number.isFinite(date) ? `|${date}` : "");
    const areaKm2 = roughAreaKm2(f.geometry);
    const ring = outerRings(f.geometry)[0];
    const lat = ring ? (ringBox(ring)[1] + ringBox(ring)[3]) / 2 : f.geometry?.type === "Point" ? f.geometry.coordinates[1] : undefined;
    const out = {};
    bands.forEach((band, i) => {
      const name = outputs ? outputs[i] : bands.length === 1 && reducerName !== "first" ? reducerName : band.name;
      if (!name || band.empty) return; // no pixels: Earth Engine leaves the value out
      const valueName = outputs ? name : band.name;
      // A band that is an unmask's number everywhere (unless `values` says otherwise).
      if (band.fill !== undefined && !(values && Object.hasOwn(values, valueName))) {
        out[name] = band.fill;
        return;
      }
      out[name] = fakeValue(valueName, unitHash(`${id}|${band.name}|${name}`), areaKm2, { date, lat, values, id: f.properties?.id ?? f.properties?.fid });
    });
    return out;
  }

  function imageMethod(node, method, scope) {
    const imageNode = node.parent;
    const options = unwrap(node.args[0]) ? {} : node.args[0] || {};
    if (method === "reduceRegions") {
      const fc = resolve(options.collection, scope);
      return {
        type: "FeatureCollection",
        features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, ...reduceOne(imageNode, options.reducer, f, scope) } })),
      };
    }
    if (method === "reduceRegion") {
      return reduceOne(imageNode, options.reducer, feature(resolve(options.geometry, scope), { id: "point" }), scope);
    }
    if (method === "reduceToVectors") {
      const region = resolve(options.geometry, scope);
      const bandNames = (imageNode.bands || []).map((b) => b.name);
      return { type: "FeatureCollection", features: bandNames.includes("patch") ? fakePatches(region) : [...fakeParcels(region, parcelGrid), ...extraParcels.map((g) => feature(g, { label: 1, count: 1000 }))] };
    }
    if (method === "sampleRectangle") return sampleGrid(imageNode, options, scope);
    if (method === "stratifiedSample" || method === "sample") {
      return {
        type: "FeatureCollection",
        features: Array.from({ length: Math.max(0, samplePoints) }, (_, i) => feature({ type: "Point", coordinates: [37 + i * 0.1, 49] }, { fire: 1 })),
      };
    }
    throw new Error(`fake-ee: cannot answer Image.${method} directly.`);
  }

  // sampleRectangle: the grid comes from the nearest reproject crsTransform
  // ([dx, 0, west, 0, -dy, north]) and the region; pixels whose centre is
  // outside a clip() outline get the default value.
  function sampleGrid(imageNode, options, scope) {
    let transform = null;
    let clipShape = null;
    for (let n = imageNode; n; n = n.parent) {
      if (!transform && n.op === "reproject") transform = (unwrap(n.args[0]) ? null : n.args[0])?.crsTransform || null;
      if (!clipShape && n.op === "clip") clipShape = resolve(n.args[0], scope);
    }
    const box = ringBox(outerRings(resolve(options.region, scope))[0] || [[0, 0]]);
    if (!transform) throw new Error("fake-ee: sampleRectangle needs a reproject with crsTransform in the stand-in.");
    const [dx, , west, , negDy, north] = transform;
    const dy = -negDy;
    const cols = Math.max(1, Math.round((box[2] - box[0]) / dx + 0.5));
    const rows = Math.max(1, Math.round((box[3] - box[1]) / dy + 0.5));
    if (cols * rows > 262144) throw new Error("Image.sampleRectangle: Too many pixels in sample; must be <= 262144.");
    const firstCol = Math.floor((box[0] - west) / dx);
    const firstRow = Math.floor((north - box[3]) / dy);
    const fallback = options.defaultValue ?? 0;
    const properties = {};
    for (const band of imageNode.bands || []) {
      properties[band.name] = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const lon = west + (firstCol + c + 0.5) * dx;
          const lat = north - (firstRow + r + 0.5) * dy;
          if (band.empty || (clipShape && !inGeometry(lon, lat, clipShape))) return fallback;
          return fakeValue(band.name, unitHash(`${band.name}|${firstRow + r}|${firstCol + c}`), 0);
        }),
      );
    }
    return feature(boxPolygon(box), properties);
  }

  return ee;
}

export default createFakeEe;
