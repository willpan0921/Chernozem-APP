// WHAT THIS FILE DOES
// Choosing the area the Atlas analyzes, three ways:
//   Country      search any country (or, with Earth Engine, a region)
//   Coordinates  type or paste GPS corners, one "lat, lon" per line, or a
//                north / south / east / west box. A small map shows it.
//   Draw         click corners on the map
// "Analyze" saves the area, makes it the current one and analyzes the last
// 12 months. Used by the first screen, the map page and Settings.
//
// A REGISTERED ACCOUNT (src/state/useAccess.js) starts near home: the
// country search begins with the country they gave when registering (its
// results already listed), and the grey example coordinates are drawn
// around their place instead of Kupiansk (src/lib/profile.js). The demo
// visitor sees everything exactly as before.
//
// WHAT IT RECEIVES
//   onDone(area)  called once the analysis has started (optional), e.g. to
//                 close a dialog
//   months        how many months to analyze (default 12)
//   defaultTab    "country" | "coordinates" | "draw" (default "country")
//
// WHO EDITS IT
// Whoever changes how an area is chosen. The coordinate rules are in
// src/lib/atlas/coords.js.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe2, MapPin, Search, Undo2, X } from "lucide-react";
import { Button, Segmented, Tabs } from "../ui/index.js";
import AtlasMap from "./AtlasMap.jsx";
import { useAtlasData } from "../../state/AtlasData.jsx";
import { useAccess } from "../../state/useAccess.js";
import { searchAreas } from "../../api/atlasApi.js";
import { boxToPoints, checkBox, checkPolygon, parseCoordinates, pointsToGeometry } from "../../lib/atlas/coords.js";
import { formatAreaSize } from "../../lib/format.js";
import { boxPlaceholder, cornersPlaceholder, profileCountry, profilePlace } from "../../lib/profile.js";
import "./atlas.css";

const TABS = [
  { id: "country", label: "Country" },
  { id: "coordinates", label: "Coordinates" },
  { id: "draw", label: "Draw" },
];

const COORD_MODES = [
  { value: "points", label: "Points" },
  { value: "box", label: "Box" },
];

// The demo's example corners and box (near Kupiansk); an account gets its own.
const POINTS_EXAMPLE = "49.7400, 37.5400\n49.7400, 37.5499\n49.7464, 37.5499\n49.7464, 37.5400";
const BOX_EXAMPLE = { north: "49.7464", south: "49.7400", west: "37.5400", east: "37.5499" };

// A stand-in "area" so the map can draw and fit a shape before it is saved.
function usePreviewArea(points, enabled) {
  return useMemo(() => {
    if (!enabled) return null;
    const shape = pointsToGeometry(points);
    return shape ? { id: "preview", ...shape } : null;
  }, [points, enabled]);
}

// ---------- Country search ----------

// initialQuery: the words in the box to begin with (an account's country),
// looked up at once so the country is there to pick.
function CountryTab({ selected, onSelect, onSubmit, initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [state, setState] = useState("idle"); // idle | searching | done | error
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults([]);
      setState("idle");
      return;
    }
    const controller = new AbortController();
    setState("searching");
    const timer = setTimeout(() => {
      searchAreas(text, { signal: controller.signal }).then(
        (found) => {
          setResults(found);
          setState("done");
        },
        (error) => {
          if (error?.name !== "AbortError") setState("error");
        }
      );
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="area-tab">
      <div className="area-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          className="area-search-input"
          type="search"
          placeholder="Search a country"
          aria-label="Search a country"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              const pick = selected && results.some((item) => item.id === selected.id) ? selected : results[0];
              onSelect(pick);
              onSubmit(pick);
            }
          }}
        />
      </div>

      {state === "error" && <p className="area-status is-error">Search failed. Check the connection and try again.</p>}
      {state === "done" && results.length === 0 && <p className="area-status">No country called “{query.trim()}”.</p>}

      {results.length > 0 && (
        <ul className="area-results" role="listbox" aria-label="Results">
          {results.map((item) => {
            const isSelected = selected?.id === item.id && selected?.kind === item.kind;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? "area-result is-selected" : "area-result"}
                  onClick={() => onSelect(item)}
                  onDoubleClick={() => onSubmit(item)}
                >
                  {item.kind === "country" ? <Globe2 size={15} /> : <MapPin size={15} />}
                  <span className="area-result-name">{item.name}</span>
                  <span className="area-result-kind">{item.kind === "country" ? "Country" : item.country || "Region"}</span>
                  {isSelected && <Check size={15} className="area-result-check" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- The picker ----------

export default function AreaPicker({ onDone, months = 12, defaultTab = "country" }) {
  const { area: currentArea, actions } = useAtlasData();
  const { account, profile } = useAccess();
  // An account's home: its country for the search, its place for the examples.
  const homeCountry = account ? profileCountry(profile) : "";
  const examples = useMemo(() => {
    if (!account) return { points: POINTS_EXAMPLE, box: BOX_EXAMPLE };
    const place = profilePlace(profile);
    return { points: cornersPlaceholder(place), box: boxPlaceholder(place) };
  }, [account, profile]);
  const [tab, setTab] = useState(defaultTab);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Country tab
  const [picked, setPicked] = useState(null);
  // Coordinates tab
  const [coordMode, setCoordMode] = useState("points");
  const [pointsText, setPointsText] = useState("");
  const [box, setBox] = useState({ north: "", south: "", east: "", west: "" });
  // Draw tab
  const [drawn, setDrawn] = useState([]);

  const parsed = useMemo(() => parseCoordinates(pointsText), [pointsText]);
  const boxCheck = useMemo(() => checkBox(box), [box]);
  const typedPoints = useMemo(
    () => (coordMode === "box" ? (boxCheck.box ? boxToPoints(boxCheck.box) : []) : parsed.points),
    [coordMode, boxCheck, parsed]
  );
  const typedCheck = coordMode === "box" ? boxCheck : parsed.errors.length ? { ok: false, message: parsed.errors[0].message } : checkPolygon(parsed.points);
  const drawnCheck = checkPolygon(drawn);
  const preview = usePreviewArea(typedPoints, tab === "coordinates");

  // What "Analyze" would send, or why it cannot yet.
  let body = null;
  let blocker = null;
  if (tab === "country") {
    if (picked) body = picked.kind === "admin1" ? { source: "admin1", id: picked.id, name: picked.name, country: picked.country } : { source: "country", id: picked.id };
    else blocker = "Pick a country.";
  } else if (tab === "coordinates") {
    if (!typedCheck.ok) blocker = coordMode === "points" && !pointsText.trim() ? "Add at least 3 corner points." : typedCheck.message;
    else if (coordMode === "box") body = { source: "bbox", name: name || "Custom area", ...boxCheck.box };
    else body = { source: "coordinates", name: name || "Custom area", points: parsed.points };
  } else {
    if (!drawnCheck.ok) blocker = drawnCheck.message;
    else body = { source: "draw", name: name || "Drawn area", points: drawn };
  }

  const submit = async (override) => {
    const request = override ? { source: override.kind === "admin1" ? "admin1" : "country", id: override.id, name: override.name, country: override.country } : body;
    if (!request || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { area } = await actions.chooseArea(request, { months });
      onDone?.(area);
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  };

  const okLine = (check, count) => (check.ok ? `${count} points · ${formatAreaSize(check.areaHa)}` : null);
  const label = tab === "country" && picked ? `Analyze ${picked.name}` : "Analyze";

  return (
    <div className="area-picker">
      <Tabs bar tabs={TABS} active={tab} onChange={(next) => { setTab(next); setError(null); }} ariaLabel="How to choose the area" />

      {tab === "country" && <CountryTab selected={picked} onSelect={setPicked} onSubmit={(item) => submit(item)} initialQuery={homeCountry} />}

      {tab === "coordinates" && (
        <div className="area-tab">
          <Segmented light options={COORD_MODES} value={coordMode} onChange={setCoordMode} ariaLabel="Points or box" />
          <div className="area-coords">
            <div className="area-coords-input">
              {coordMode === "points" ? (
                <>
                  <label className="field-label" htmlFor="area-points">
                    Corners · latitude, longitude · one per line
                  </label>
                  <textarea
                    id="area-points"
                    className="textarea area-points"
                    rows={6}
                    spellCheck={false}
                    placeholder={examples.points}
                    value={pointsText}
                    onChange={(event) => setPointsText(event.target.value)}
                  />
                </>
              ) : (
                <div className="area-box">
                  {["north", "south", "west", "east"].map((key) => (
                    <label key={key} className="area-box-field">
                      <span className="field-label">{key[0].toUpperCase() + key.slice(1)}</span>
                      <input
                        className="input mono"
                        inputMode="decimal"
                        placeholder={examples.box[key]}
                        value={box[key]}
                        onChange={(event) => setBox((prev) => ({ ...prev, [key]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              )}
              <p className={typedCheck.ok ? "area-status is-ok" : "area-status"}>
                {okLine(typedCheck, typedPoints.length) || (pointsText.trim() || coordMode === "box" ? typedCheck.message : "Paste or type the corners.")}
              </p>
            </div>
            <AtlasMap area={preview} height={220} className="area-preview" ariaLabel="Preview of the area" />
          </div>
        </div>
      )}

      {tab === "draw" && (
        <div className="area-tab">
          <AtlasMap
            area={currentArea}
            height={340}
            drawMode
            drawPoints={drawn}
            onDrawPoint={(point) => setDrawn((prev) => [...prev, point])}
            ariaLabel="Draw the area: click to add corners"
          >
            <div className="area-draw-bar">
              <span className={drawnCheck.ok ? "area-status is-ok" : "area-status"}>
                {okLine(drawnCheck, drawn.length) || (drawn.length ? drawnCheck.message : "Click the map to add corners")}
              </span>
              <Button size="sm" icon={<Undo2 size={13} />} onClick={() => setDrawn((prev) => prev.slice(0, -1))} disabled={!drawn.length}>
                Undo
              </Button>
              <Button size="sm" icon={<X size={13} />} onClick={() => setDrawn([])} disabled={!drawn.length}>
                Clear
              </Button>
            </div>
          </AtlasMap>
        </div>
      )}

      <div className="area-footer">
        {tab !== "country" && (
          <input
            className="input area-name"
            placeholder={tab === "draw" ? "Name · e.g. North field" : "Name · e.g. My farm"}
            aria-label="Name of the area"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        <Button variant="primary" size="lg" onClick={() => submit()} disabled={!body || busy} title={blocker || undefined}>
          {busy ? "Starting…" : label}
        </Button>
      </div>
      {error && (
        <p className="area-status is-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
