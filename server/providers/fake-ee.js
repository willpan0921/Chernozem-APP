// WHAT THIS FILE DOES
// A stand-in for the Google Earth Engine library (@google/earthengine),
// for tests only. It has just the parts gee.js uses (Image,
// ImageCollection, FeatureCollection, Feature, Geometry, Reducer, Filter,
// Dictionary, Number, Algorithms.If, Join, data.authenticateViaPrivateKey,
// initialize, evaluate/getInfo).
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
//   assets     { assetId: { bands: [{ id }] } | "missing" }  (default: has b1)
//   authError  a message: signing in fails with it
//   fail       (request) => message | null; a message makes that request fail
//   delayMs    how long each request takes (default 1 ms)
//
// WHO EDITS IT
// Whoever changes gee.js and starts using a part of Earth Engine that is
// not here yet. Used by gee.test.js only; the app never loads it.

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
  Image: { reduceRegions: "FeatureCollection", stratifiedSample: "FeatureCollection", sample: "FeatureCollection", reduceRegion: "Dictionary", projection: "Projection", date: "Date", get: "Object", bandNames: "List" },
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
  },
  FeatureCollection: { size: "Number", aggregate_max: "Number", aggregate_array: "List", first: "Feature", geometry: "Geometry", distance: "Image", reduceToImage: "Image" },
  Feature: { get: "Object", geometry: "Geometry" },
  Geometry: { area: "Number" },
  Date: { get: "Number", millis: "Number" },
  Dictionary: { get: "Object" },
  List: { get: "Object", size: "Number" },
  Join: { apply: "FeatureCollection" },
};
const SAME_KIND_AS = { Number: "Number", Object: "Number", String: "String" };

// Made-up values per output name, for one feature (u is 0..1, fixed per cell).
function fakeValue(name, u, areaKm2) {
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
      return 4 + 4 * u;
    case "worldCover":
      return 40;
    case "assetRaw":
      return 50 + Math.round(39 * u);
    default:
      return u;
  }
}

// Area (km²) of a GeoJSON rectangle-like polygon, roughly.
function roughAreaKm2(geometry) {
  const ring = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : null;
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
function feature(geometry, properties) {
  return { type: "Feature", geometry: geometry ?? null, properties: { ...(properties || {}) } };
}

export function createFakeEe(options = {}) {
  const { sizes = {}, assets = {}, authError = null, fail = null, delayMs = 1 } = options;
  const calls = [];
  const requests = [];
  const stats = { evaluations: 0, active: 0, peakActive: 0 };
  let initialized = false;

  // ----- building nodes -----

  function wrap(node) {
    return new Proxy(node, {
      get(target, prop) {
        if (prop === NODE) return target;
        if (typeof prop === "symbol" || prop === "then" || prop === "toJSON") return undefined;
        if (prop === "evaluate" || prop === "getInfo") return (callback) => runRequest(target, callback);
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
  const isZeroConstant = (value) => {
    const node = unwrap(value);
    return node?.op === "Image.constant" && node.args[0] === 0;
  };
  const names = (selector) => (Array.isArray(selector) ? selector : [selector]).filter((s) => typeof s === "string");

  function imageBands(parent, method, args) {
    const from = parent.bands || [];
    const empty = allEmpty(from);
    switch (method) {
      case "rename":
        return names(args.length > 1 ? args : args[0]).map((name) => ({ name, empty }));
      case "select": {
        const picked = names(args[0]);
        return picked.length && !picked.includes(".*") ? picked.map((name) => ({ name, empty })) : from;
      }
      case "normalizedDifference":
        return [{ name: "nd", empty }];
      case "updateMask":
        return isZeroConstant(args[0]) ? from.map((b) => ({ ...b, empty: true })) : from;
      case "unmask":
        return from.map((b) => ({ ...b, empty: false }));
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
      else if (parent.kind === "FeatureCollection") extra.bands = [{ name: "distance", empty: false }];
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
    return make("Image", "Image.constant", [value], { bands: [{ name: "constant", empty: false }] });
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

  const reducer = (name) => () => {
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
    Reducer: { mean: reducer("mean"), sum: reducer("sum"), max: reducer("max"), min: reducer("min"), first: reducer("first"), count: reducer("count") },
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
      },
      getAsset(id, callback) {
        calls.push({ name: "data.getAsset", args: [id] });
        const info = assets[id];
        setTimeout(() => {
          if (info === "missing") callback(undefined, `Asset '${id}' does not exist or doesn't allow this operation.`);
          else callback(info || { id, type: "IMAGE", bands: [{ id: "b1" }] });
        }, 0);
      },
    },
    initialize(baseUrl, tileUrl, onOk, onFail, xsrf, project) {
      calls.push({ name: "initialize", args: [project] });
      initialized = true;
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
    setTimeout(() => {
      stats.active -= 1;
      if (!initialized) return callback(undefined, "Earth Engine client library not initialized.");
      const message = fail ? fail(request) : null;
      if (message) return callback(undefined, message);
      let value;
      try {
        value = resolve(node, new Map());
      } catch (error) {
        return callback(undefined, error.message);
      }
      callback(value);
    }, delayMs);
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
      case "List":
        return arg(0);
      case "Dictionary":
        return arg(0);
      case "If":
        return arg(0) ? arg(1) : arg(2);
      case "Geometry.Rectangle":
        return boxPolygon(arg(0));
      case "Geometry.Point":
        return { type: "Point", coordinates: arg(0) };
      case "Geometry.Polygon":
        return { type: "Polygon", coordinates: arg(0) };
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
        if (source === "FAO/GAUL/2015/level2") return { type: "FeatureCollection", features: GAUL2.map((p) => feature(null, p)) };
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
    }
    if (kind === "Geometry") return parent(); // simplify, buffer, ...: same outline
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

  function matches(filterValue, properties, scope) {
    const f = unwrap(filterValue);
    if (!f) return true;
    const a = (i) => resolve(f.args[i], scope);
    switch (f.op) {
      case "Filter.eq":
        return !(a(0) in properties) || properties[a(0)] === a(1);
      case "Filter.stringContains":
        return String(properties[a(0)] ?? "").includes(a(1));
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
  function reduceOne(imageNode, reducerValue, f) {
    const red = unwrap(reducerValue);
    let reducerName = "mean";
    let outputs = null;
    for (let r = red; r; r = r.parent) {
      if (r.op === "setOutputs" && !outputs) outputs = r.args[0];
      if (r.reducerName) reducerName = r.reducerName;
    }
    const bands = imageNode.bands || [];
    const id = String(f.properties?.id ?? f.properties?.aid ?? JSON.stringify(f.geometry?.coordinates));
    const areaKm2 = roughAreaKm2(f.geometry);
    const out = {};
    bands.forEach((band, i) => {
      const name = outputs ? outputs[i] : bands.length === 1 && reducerName !== "first" ? reducerName : band.name;
      if (!name || band.empty) return; // no pixels: Earth Engine leaves the value out
      out[name] = fakeValue(outputs ? name : band.name, unitHash(`${id}|${band.name}|${name}`), areaKm2);
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
        features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, ...reduceOne(imageNode, options.reducer, f) } })),
      };
    }
    if (method === "reduceRegion") {
      return reduceOne(imageNode, options.reducer, feature(resolve(options.geometry, scope), { id: "point" }));
    }
    if (method === "stratifiedSample" || method === "sample") {
      return {
        type: "FeatureCollection",
        features: [0, 1, 2].map((i) => feature({ type: "Point", coordinates: [37 + i * 0.1, 49] }, { fire: 1 })),
      };
    }
    throw new Error(`fake-ee: cannot answer Image.${method} directly.`);
  }

  return ee;
}

export default createFakeEe;
