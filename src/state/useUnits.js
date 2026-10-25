// WHAT THIS FILE DOES
// The React side of the area's states and regions ("units") and of the
// soil types, for the Atlas Map page and the Overview map:
//
//   const units = useAreaUnits(area?.id, run?.id);
//     -> { status: "idle" | "loading" | "ready" | "error", data, error }
//        data is the answer of GET /api/areas/:id/units (src/api/atlasApi.js
//        getUnits): { label, one, many, tooltip, approximate, message, note,
//        units: [...], cellUnit: { squareId: unitId } }
//   const scoredUnits = useScoredUnits(units.data, scored, settings);
//     -> the units with their scores (src/lib/atlas/units.js scoreUnits),
//        or null while there are none
//   const soil = useSoil({ areaId, cellId | unitId, runId });
//     -> { status, soil, error }; soil is getSoil's answer ({ available,
//        top, summary, message, ... })
//
// Answers are kept for as long as the page is open (one request per area
// and month, and per square or state), so going back and forth is instant.
// Units built without Earth Engine (approximate) are asked again after two
// minutes, as the server tries Earth Engine again then.
//
// WHO EDITS IT
// Whoever changes how the Map page gets its states or soil types.

import { useEffect, useMemo, useState } from "react";
import * as api from "../api/atlasApi.js";
import { scoreUnits } from "../lib/atlas/units.js";

const APPROXIMATE_MS = 2 * 60 * 1000;
const unitsCache = new Map(); // key -> { at, promise, data, error }
const soilCache = new Map();

function cached(cache, key, load, { keepFor } = {}) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && !hit.error && !(hit.data && keepFor && now - hit.at > keepFor(hit.data))) return hit;
  const entry = { at: now, data: null, error: null, promise: null };
  entry.promise = load().then(
    (data) => {
      entry.data = data;
      return data;
    },
    (error) => {
      entry.error = error;
      throw error;
    }
  );
  cache.set(key, entry);
  return entry;
}

// Follows one cached request: its answer, or "loading", or the error.
function useCached(cache, key, load, options) {
  const [state, setState] = useState({ key: null, status: "idle", data: null, error: null });
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const entry = cached(cache, key, load, options);
    if (entry.data) setState({ key, status: "ready", data: entry.data, error: null });
    else {
      setState({ key, status: "loading", data: null, error: null });
      entry.promise.then(
        (data) => live && setState({ key, status: "ready", data, error: null }),
        (error) => live && setState({ key, status: "error", data: null, error })
      );
    }
    return () => {
      live = false;
    };
    // load and options are read when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return { status: "idle", data: null, error: null };
  // A new key before the effect ran: loading, never the old answer.
  return state.key === key ? state : { status: "loading", data: null, error: null };
}

export function useAreaUnits(areaId, runId) {
  const key = areaId ? `${areaId}|${runId || ""}` : null;
  return useCached(unitsCache, key, () => api.getUnits(areaId, { runId }), {
    keepFor: (data) => (data?.approximate ? APPROXIMATE_MS : Infinity),
  });
}

// The units scored with the current weights (the same method as the
// squares), or null while there are none.
export function useScoredUnits(unitsData, scored, settings) {
  return useMemo(() => {
    if (!unitsData?.units?.length || !scored?.places) return null;
    return scoreUnits(scored.places, unitsData.units, unitsData.cellUnit, { settings: settings || scored.settings });
  }, [unitsData, scored, settings]);
}

export function useSoil({ areaId, cellId, unitId, runId } = {}) {
  const key = areaId && (cellId || unitId) ? `${areaId}|${cellId ? `c:${cellId}|${runId || ""}` : `u:${unitId}`}` : null;
  const state = useCached(soilCache, key, () => api.getSoil({ areaId, cellId, unitId, runId: cellId ? runId : undefined }), {
    // Without Earth Engine: asked again later (the server retries then).
    keepFor: (data) => (data?.available === false ? APPROXIMATE_MS : Infinity),
  });
  return { status: state.status, soil: state.data, error: state.error };
}
