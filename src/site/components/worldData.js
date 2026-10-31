// WHAT THIS FILE DOES
// One shared load of the three files the About page's globe reads, used by
// the globe (WorldGlobe.jsx) and by the small print at the foot of the page
// (HomePage.jsx), so each file is fetched once per visit:
//   GET /api/world/crises           the events: disaster alerts live from
//                                   GDACS, armed conflicts from a list
//                                   reviewed by hand (server/world/)
//   GET /site/world/countries.json  every country's name and centre
//   GET /site/world/trade.json      who buys whose food (World Bank WITS)
// Each file on its own: one that fails costs only its part. Without the
// feed the globe says the live list could not be loaded and the small
// print leaves out the review date.
//
//   const world = useWorldData();
//   world.status     "loading" | "ok" | "failed" (the feed)
//   world.events     every event with a place: its own, or its country's
//                    centre; armed conflicts first, then alerts red to green
//   world.reviewed   the day the conflict list was last reviewed, or null
//   world.gdacs      GDACS's line from the feed ({ url, missing, stale }) or null
//   world.countries  the country file, or null
//   world.trade      the trade file, or null
//
// WHO EDITS IT
// Whoever changes where the globe's data comes from.

import { useEffect, useState } from "react";
import { plainName } from "./globeMath.js";

const LEVEL_ORDER = { red: 0, orange: 1, green: 2 };

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// Places every event and puts them in the globe's order.
export function placeEvents(rawEvents, countries) {
  return (Array.isArray(rawEvents) ? rawEvents : [])
    .map((e) => {
      const c = countries?.[e.iso3];
      const lat = Number.isFinite(e.lat) ? e.lat : c?.lat;
      const lng = Number.isFinite(e.lng) ? e.lng : c?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !e.id || !e.name) return null;
      return { ...e, lat, lng, country: e.country || plainName(e.iso3, c?.name) };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if ((a.kind === "war") !== (b.kind === "war")) return a.kind === "war" ? -1 : 1;
      return (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3);
    });
}

const EMPTY = { status: "loading", events: [], reviewed: null, gdacs: null, countries: null, trade: null };

let pending = null; // the shared promise
let settled = null; // its answer, once there is one

export function loadWorldData() {
  if (pending) return pending;
  const settle = (p) => p.then((value) => ({ ok: true, value })).catch(() => ({ ok: false, value: null }));
  pending = Promise.all([settle(getJson("/api/world/crises")), settle(getJson("/site/world/countries.json")), settle(getJson("/site/world/trade.json"))]).then(([feed, countries, trade]) => {
    const sources = feed.ok && Array.isArray(feed.value?.sources) ? feed.value.sources : [];
    const reviewedSource = sources.find((s) => s.reviewed || /reviewed/i.test(s.name || ""));
    const answer = {
      status: feed.ok ? "ok" : "failed",
      events: feed.ok ? placeEvents(feed.value?.events, countries.value) : [],
      reviewed: reviewedSource?.reviewed || null,
      gdacs: sources.find((s) => s.name === "GDACS") || null,
      countries: countries.ok ? countries.value : null,
      trade: trade.ok ? trade.value : null,
    };
    settled = answer;
    // A failed feed is tried again the next time the page opens.
    if (!feed.ok) pending = null;
    return answer;
  });
  return pending;
}

export function useWorldData() {
  const [data, setData] = useState(() => settled || EMPTY);
  useEffect(() => {
    let alive = true;
    loadWorldData().then((answer) => {
      if (alive) setData(answer);
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
