// WHAT THIS FILE DOES
// Setting up the farm: find the land, let the system find the fields on
// it, pick the ones that are yours, save. Used as the first screen when
// there is no farm (FarmGate in src/state/FieldData.jsx) and in Settings
// ("Change farm").
//
//   Step 1  Search       type a place or coordinates -> results -> the map flies there
//                        (click the map to move the pin); fields are found AROUND the pin
//           Coordinates  paste the corners of your land, one "lat, lon" per line;
//                        fields are found INSIDE it (one line = search around that point)
//           Draw         click the corners of your land on the satellite map
//           "Find my fields" -> the detection job, with progress
//   Step 2  the fields found, on the satellite map: inside your land all are
//           chosen, around a point none are; click a field to add or remove
//           it; "Select all"; "Save N fields" -> the farm is saved and analysed.
//   A quiet "Try an example: Ukraine · Iowa · Argentina" row loads a real
//   farm (fields near Kupiansk, Ames or Chivilcoy) and analyses it at once.
//   Any other place on Earth works the same way.
//
// WHAT IT RECEIVES
//   onDone()    called once the farm is saved (or an example loaded), e.g. to close Settings' panel
//   onCancel()  shows a "Cancel" button when given
//   title       the heading (default "Set up your farm")
//   showDemo    false hides the example farms
//   current     the example loaded now (farm.example), left out of the row
//
// WHO EDITS IT
// Whoever changes the farm setup. The coordinate reading is shared with
// the Atlas (src/lib/atlas/coords.js).

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, MapPin, Search, Undo2, X } from "lucide-react";
import { Button, Segmented, Tabs } from "../ui/index.js";
import FieldMap from "./FieldMap.jsx";
import { useFieldData } from "../../state/FieldData.jsx";
import { EXAMPLE_FARMS, geocode } from "../../api/fieldApi.js";
import { checkPolygon, parseCoordinates } from "../../lib/atlas/coords.js";
import { candidateTotals, formatArea } from "../../lib/field/format.js";
import "./field.css";

const TABS = [
  { id: "search", label: "Search" },
  { id: "coordinates", label: "Coordinates" },
  { id: "draw", label: "Draw" },
];

const RADII = [
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 3000, label: "3 km" },
];

const MIN_LAND_HA = 1;
// Any place on Earth works; this is just the shape of the input.
const COORDS_EXAMPLE = "42.0350, -93.6400\n42.0350, -93.6100\n42.0200, -93.6100\n42.0200, -93.6400";

const pinBounds = (lat, lon, radiusM) => {
  const dLat = (radiusM * 1.35) / 111320;
  const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]];
};

const pointsBounds = (points) => {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
};

// ---------- Search ----------

function SearchTab({ picked, onPick }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [state, setState] = useState("idle"); // idle | searching | done | error
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const runRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = async (text, { pickFirst = false } = {}) => {
    const q = text.trim();
    const seq = ++runRef.current;
    if (q.length < 2) {
      setResults([]);
      setState("idle");
      return;
    }
    setState("searching");
    try {
      const found = await geocode(q);
      if (seq !== runRef.current) return;
      setResults(found);
      setState("done");
      if (pickFirst && found[0]) onPick(found[0]);
    } catch (err) {
      if (seq !== runRef.current) return;
      setError(err?.message || "Search failed.");
      setState("error");
    }
  };

  // Look up as the person types (a short pause first; the server asks
  // OpenStreetMap at most once a second).
  useEffect(() => {
    const timer = setTimeout(() => run(query), 450);
    return () => clearTimeout(timer);
    // run reads the latest query itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="fs-tab">
      <form
        className="fs-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          run(query, { pickFirst: true });
        }}
      >
        <Search size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          className="fs-search-input"
          type="search"
          placeholder="Village, town or lat, lon"
          aria-label="Search a place or coordinates"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      {state === "searching" && results.length === 0 && <p className="fs-status">Searching…</p>}
      {state === "error" && <p className="fs-status is-error">{error}</p>}
      {state === "done" && results.length === 0 && <p className="fs-status">Nothing found for “{query.trim()}”.</p>}
      {results.length > 0 && (
        <ul className="fs-results" role="listbox" aria-label="Places">
          {results.map((item) => {
            const isPicked = picked && picked.lat === item.lat && picked.lon === item.lon && picked.label === item.label;
            return (
              <li key={`${item.lat},${item.lon},${item.label}`}>
                <button type="button" role="option" aria-selected={Boolean(isPicked)} className={isPicked ? "fs-result is-picked" : "fs-result"} onClick={() => onPick(item)}>
                  <MapPin size={15} aria-hidden="true" />
                  <span className="fs-result-name">{item.label}</span>
                  {isPicked && <Check size={15} className="fs-result-check" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Example farms ----------

// "Try an example: Ukraine · Iowa · Argentina". busy "demo:iowa" while
// one loads.
function Examples({ current, busy, onPick }) {
  const list = EXAMPLE_FARMS.filter((item) => item.id !== current);
  const loading = EXAMPLE_FARMS.find((item) => busy === `demo:${item.id}`);
  if (!list.length) return null;
  return (
    <p className="fs-examples">
      {loading ? (
        <span role="status">Loading {loading.label}…</span>
      ) : (
        <>
          <span>Try an example:</span>
          {list.map((item, i) => (
            <span key={item.id} className="fs-example-item">
              {i > 0 && <span aria-hidden="true">·</span>}
              <button type="button" className="fs-demo" onClick={() => onPick(item.id)} disabled={Boolean(busy)} aria-label={`Try the example farm in ${item.label}`}>
                {item.label}
              </button>
            </span>
          ))}
        </>
      )}
    </p>
  );
}

// ---------- The setup ----------

export default function FarmSetup({ onDone, onCancel, title = "Set up your farm", showDemo = true, current = null }) {
  const { provider, actions } = useFieldData();
  const [tab, setTab] = useState("search");
  const [step, setStep] = useState("find"); // find | choose
  const [busy, setBusy] = useState(null); // null | "detect" | "save" | "demo:<example id>"
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Search tab: the picked place and the pin (moved by clicking the map).
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState(null);
  const [radiusM, setRadiusM] = useState(1000);
  // Coordinates tab
  const [coordsText, setCoordsText] = useState("");
  // Draw tab
  const [drawn, setDrawn] = useState([]);
  // Step 2
  const [found, setFound] = useState(null); // { candidates, boundary, provider, warnings, source }
  const [chosen, setChosen] = useState([]);
  const [focus, setFocus] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const parsed = useMemo(() => parseCoordinates(coordsText), [coordsText]);
  const typedPoints = parsed.points;
  const typedCheck = useMemo(() => checkPolygon(typedPoints), [typedPoints]);
  const drawnCheck = useMemo(() => checkPolygon(drawn), [drawn]);

  // Fly to the typed land once it is a shape (or to the one typed point).
  const typedKey = parsed.errors.length ? "" : JSON.stringify(typedPoints);
  useEffect(() => {
    if (tab !== "coordinates" || !typedKey) return;
    if (typedPoints.length === 1) setFocus(pinBounds(typedPoints[0][0], typedPoints[0][1], radiusM));
    else if (typedPoints.length >= 3) setFocus(pointsBounds(typedPoints));
    // typedKey stands for typedPoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, typedKey]);

  // What "Find my fields" would send, or why it cannot yet.
  let body = null;
  let hint = null;
  let okLine = null;
  if (tab === "search") {
    if (pin) {
      body = { source: "point", lat: pin[0], lon: pin[1], radiusM };
      okLine = "Click the map to move the pin.";
    } else hint = "Search for your village or type coordinates.";
  } else if (tab === "coordinates") {
    if (!coordsText.trim()) hint = "Paste the corners of your land.";
    else if (parsed.errors.length) hint = parsed.errors[0].message;
    else if (typedPoints.length === 1) {
      body = { source: "point", lat: typedPoints[0][0], lon: typedPoints[0][1], radiusM };
      okLine = "1 point · fields around it";
    } else if (!typedCheck.ok) hint = typedPoints.length === 2 ? "Add at least 3 corners, or 1 point to search around it." : typedCheck.message;
    else if (typedCheck.areaHa < MIN_LAND_HA) hint = "That land is under 1 ha.";
    else {
      body = { source: "boundary", points: typedPoints };
      okLine = `${typedPoints.length} corners · ${formatArea(typedCheck.areaHa)}`;
    }
  } else {
    if (drawn.length === 0) hint = "Click the map to add the corners of your land.";
    else if (!drawnCheck.ok) hint = drawnCheck.message;
    else if (drawnCheck.areaHa < MIN_LAND_HA) hint = "That land is under 1 ha.";
    else {
      body = { source: "boundary", points: drawn };
      okLine = `${drawn.length} corners · ${formatArea(drawnCheck.areaHa)}`;
    }
  }

  const pickPlace = (item) => {
    setPicked(item);
    setPin([item.lat, item.lon]);
    setFocus(pinBounds(item.lat, item.lon, radiusM));
    setError(null);
  };

  const findFields = async () => {
    if (!body || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("detect");
    setProgress(0);
    setError(null);
    try {
      const result = await actions.detect(body, {
        signal: controller.signal,
        onProgress: (job) => setProgress(Math.min(1, (job.done || 0) / (job.total || 100))),
      });
      const candidates = result.candidates || [];
      // The server may move the search to the nearest farmland (it says so in
      // a warning); draw the circle where it actually searched.
      const searched = body.source === "point" ? (Number.isFinite(result.center?.lat) && Number.isFinite(result.center?.lon) ? [result.center.lat, result.center.lon] : [body.lat, body.lon]) : null;
      setFound({ ...result, source: body.source, center: searched, radiusM: result.radiusM ?? body.radiusM });
      setChosen(body.source === "boundary" ? candidates.map((c) => c.id) : []);
      setStep("choose");
    } catch (err) {
      if (err?.name !== "AbortError") setError(err?.message || String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id) => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    const list = (found?.candidates || []).filter((c) => chosen.includes(c.id));
    if (!list.length || busy) return;
    setBusy("save");
    setError(null);
    try {
      const request = { fields: list.map((c) => ({ geometry: c.geometry, source: "detected" })), boundary: found.boundary || null };
      if (found.source === "point" && picked && pin && picked.lat === pin[0] && picked.lon === pin[1]) {
        // Keep the place name, but put the farm where its fields were found
        // (the search may have moved to the nearest farmland).
        const at = found.center || pin;
        request.location = { label: picked.label, lat: at[0], lon: at[1] };
      }
      await actions.saveFarm(request);
      onDone?.();
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(null);
    }
  };

  const tryExample = async (example) => {
    if (busy) return;
    setBusy(`demo:${example}`);
    setError(null);
    try {
      await actions.loadDemo(example);
      onDone?.();
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(null);
    }
  };

  const backToFind = () => {
    setStep("find");
    setFound(null);
    setChosen([]);
    setError(null);
  };

  const totals = candidateTotals(found?.candidates || [], chosen);
  const candidates = found?.candidates || [];
  const sample = (found?.provider?.id || provider?.id) === "sample";

  // ---------- The map ----------
  let mapProps;
  if (step === "choose") {
    mapProps = {
      candidates,
      selectedCandidateIds: chosen,
      onToggleCandidate: toggle,
      boundary: found?.boundary || null,
      pin: found?.center || null,
      pinRadiusM: found?.center ? found.radiusM : undefined,
      fitKey: `choose-${candidates.length}-${found?.source}`,
    };
  } else if (tab === "search") {
    mapProps = { pin, pinRadiusM: pin ? radiusM : undefined, onMapClick: (point) => setPin(point), focusBounds: focus };
  } else if (tab === "coordinates") {
    const single = !parsed.errors.length && typedPoints.length === 1 ? typedPoints[0] : null;
    mapProps = {
      boundary: !parsed.errors.length && typedPoints.length >= 3 ? typedPoints : null,
      pin: single,
      pinRadiusM: single ? radiusM : undefined,
      focusBounds: focus,
    };
  } else {
    mapProps = { drawMode: true, drawPoints: drawn, onDrawPoint: (point) => setDrawn((prev) => [...prev, point]), focusBounds: focus };
  }

  const pointSearch = tab === "search" || (tab === "coordinates" && typedPoints.length === 1 && !parsed.errors.length);

  return (
    <div className="fs">
      <div className="fs-side">
        {step === "find" ? (
          <>
            <header className="fs-head">
              <h1>{title}</h1>
              <p>Find your land. We find the fields on it.</p>
            </header>

            <Tabs bar tabs={TABS} active={tab} onChange={(next) => { setTab(next); setError(null); }} ariaLabel="How to find your land" />

            {tab === "search" && <SearchTab picked={picked} onPick={pickPlace} />}

            {tab === "coordinates" && (
              <div className="fs-tab">
                <label className="field-label" htmlFor="fs-coords">
                  Corners · lat, lon · one per line
                </label>
                <textarea
                  id="fs-coords"
                  className="textarea fs-coords"
                  rows={5}
                  spellCheck={false}
                  placeholder={COORDS_EXAMPLE}
                  value={coordsText}
                  onChange={(event) => setCoordsText(event.target.value)}
                />
              </div>
            )}

            {tab === "draw" && (
              <div className="fs-tab">
                <div className="cluster">
                  <Button size="sm" icon={<Undo2 size={13} />} onClick={() => setDrawn((prev) => prev.slice(0, -1))} disabled={!drawn.length}>
                    Undo
                  </Button>
                  <Button size="sm" icon={<X size={13} />} onClick={() => setDrawn([])} disabled={!drawn.length}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {pointSearch && (
              <div className="fs-radius">
                <span className="field-label">Search around</span>
                <Segmented light options={RADII} value={radiusM} onChange={(value) => { setRadiusM(value); if (pin) setFocus(pinBounds(pin[0], pin[1], value)); }} ariaLabel="How far around" />
              </div>
            )}

            <p className={body ? "fs-status is-ok" : "fs-status"}>{body ? okLine : hint}</p>

            {busy === "detect" ? (
              <div className="fs-finding" role="status" aria-live="polite">
                <div className="fs-finding-head">
                  <span>Finding your fields…</span>
                  <span className="mono">{Math.round(progress * 100)}%</span>
                </div>
                <div className="fd-progress-track">
                  <div className="fd-progress-fill" style={{ width: `${Math.max(4, progress * 100)}%` }} />
                </div>
              </div>
            ) : (
              <Button variant="primary" size="lg" block onClick={findFields} disabled={!body || Boolean(busy)}>
                Find my fields
              </Button>
            )}

            {error && (
              <p className="fs-status is-error" role="alert">
                {error}
              </p>
            )}

            <div className="fs-foot">
              {showDemo && <Examples current={current} busy={busy} onPick={tryExample} />}
              {onCancel && (
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="fs-back" onClick={backToFind} disabled={busy === "save"}>
              <ArrowLeft size={15} /> Back
            </button>
            <header className="fs-head">
              <h1>{candidates.length === 0 ? "No fields found" : candidates.length === 1 ? "1 field found" : `${candidates.length} fields found`}</h1>
              <p>{candidates.length === 0 ? "Try a larger area, or draw your land." : "Tap a field to add or remove it."}</p>
            </header>

            {(found?.warnings || []).filter((w) => !/^No fields found/i.test(w) || candidates.length).map((warning) => (
              <p key={warning} className="fs-warning">
                {warning}
              </p>
            ))}

            {candidates.length > 0 && (
              <>
                <div className="fs-total">
                  <span className="fs-total-big">{totals.count === 1 ? "1 field" : `${totals.count} fields`}</span>
                  <span className="fs-total-area">{formatArea(totals.areaHa)}</span>
                </div>
                <div className="cluster">
                  <Button size="sm" onClick={() => setChosen(candidates.map((c) => c.id))} disabled={chosen.length === candidates.length}>
                    Select all
                  </Button>
                  <Button size="sm" onClick={() => setChosen([])} disabled={chosen.length === 0}>
                    Clear
                  </Button>
                </div>
                <Button variant="primary" size="lg" block onClick={save} disabled={!totals.count || Boolean(busy)}>
                  {busy === "save" ? "Saving…" : totals.count ? `Save ${totals.count === 1 ? "1 field" : `${totals.count} fields`}` : "Pick your fields"}
                </Button>
              </>
            )}
            {candidates.length === 0 && (
              <Button variant="primary" size="lg" block onClick={() => { backToFind(); setTab("draw"); }}>
                Draw your land
              </Button>
            )}

            {error && (
              <p className="fs-status is-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      <div className="fs-map">
        <FieldMap height="100%" showLabels={false} ariaLabel={tab === "draw" && step === "find" ? "Draw your land: click to add corners" : "Satellite map"} {...mapProps}>
          {sample && <span className="fm-chip fm-chip-light fs-sample">Sample data</span>}
        </FieldMap>
      </div>
    </div>
  );
}
