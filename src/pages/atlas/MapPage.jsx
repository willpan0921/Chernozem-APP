// WHAT THIS FILE DOES
// The Atlas map page (/atlas/map). Three columns:
//   left    the area name, the month, "Change area", and the weights
//           (soil value / damage / safe access) that rank the map
//   middle  the real map, coloured by Priority, Damage or Access (the switch
//           on the map's key), with working zoom buttons and scroll zoom
//   right   the top areas, or the details of the square or top area you
//           picked: scores, hectares, people, recovery cost, "Ask AI"
//
// "?focus=<top area id or square id>" in the address picks that place and
// flies the map to it (the Overview links here that way). Picking a place
// on the page puts it in the address too, so a link opens the same view.
//
// Picking another month keeps the map where it is (same zoom, same picked
// place) and shows a small spinner until the month has loaded.
//
// All the data comes from the shared Atlas layer (src/state/AtlasData.jsx);
// weight changes there recolour the map at once and are saved for the team.
//
// On screens 860 px or narrower the columns stack: area, map, weights, then
// the top areas or the picked place.
//
// WHO EDITS IT
// Whoever changes how the Atlas map page looks or behaves. The map itself is
// src/components/atlas/AtlasMap.jsx; the weights WeightsPanel.jsx.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Crosshair, Loader2, MapPin, MessageSquare, X } from "lucide-react";
import { Badge, Button, ScoreBar } from "../../components/ui/index.js";
import { AnalysisProgress, AtlasGate, useAtlasData, useColorBy, useTimeframe } from "../../state/AtlasData.jsx";
import AtlasMap from "../../components/atlas/AtlasMap.jsx";
import AreaPicker from "../../components/atlas/AreaPicker.jsx";
import MapLegend from "../../components/atlas/MapLegend.jsx";
import RunPicker from "../../components/atlas/RunPicker.jsx";
import WeightsPanel from "../../components/atlas/WeightsPanel.jsx";
import { cellBounds, compassName, coordDigits, findFocus, labelParts, placesExtent } from "../../lib/atlas/hotspots.js";
import { rankedCount } from "../../lib/atlas/mapColors.js";
import { accessMeasured, noFightingFound, recoveryCost } from "../../lib/atlas/overview.js";
import { COST_NOTE } from "../../lib/atlas/method.js";
import { formatAreaSize, formatCoord, formatCount, formatHaShort } from "../../lib/format.js";
import { haFixed } from "./overviewHelpers.js";
import "./MapPage.css";

// The width at which the columns stack (keep in step with MapPage.css).
const NARROW = "(max-width: 860px)";
const isNarrow = () => !!window.matchMedia?.(NARROW).matches;

// How each tier is named and coloured on the badge.
const TIERS = {
  highest: { label: "Highest priority", tone: "green" },
  high: { label: "High priority", tone: "green" },
  medium: { label: "Medium priority", tone: "amber" },
  lower: { label: "Lower priority", tone: "outline" },
  setAside: { label: "Set aside", tone: "ink" },
  notAnalyzed: { label: "No data", tone: "outline" },
  noBlackSoil: { label: "No black soil", tone: "outline" },
};

// Dollars in short form: 4800000 -> "$4.8M", 52000 -> "$52k".
function usdShort(amount) {
  if (!Number.isFinite(amount)) return "–";
  const trim = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, ""));
  if (amount >= 1e9) return `$${trim(amount / 1e9)}B`;
  if (amount >= 1e6) return `$${trim(amount / 1e6)}M`;
  if (amount >= 1e3) return `$${trim(amount / 1e3)}k`;
  return `$${Math.round(amount)}`;
}

// A map box made bigger by "by" degrees on every side, so a picked place
// is shown with some of the land around it.
const padBounds = ([[south, west], [north, east]], by) => [
  [south - by, west - by],
  [north + by, east + by],
];

const usdRange = ([low, high]) => `${usdShort(low)} – ${usdShort(high)}`;
const score100 = (value) => (Number.isFinite(value) ? Math.round(value * 100) : null);

// The name and coordinates shown for one picked square: its district and
// region when the data has them ("Bakhmut, Donetsk"), else where it sits in
// the area ("North-west"), named the same way as the top areas. The
// coordinates go underneath.
function nameOf(place, { extent, size }) {
  const names = [place.admin2, place.admin1].filter(Boolean);
  return {
    name: names.length ? names.join(", ") : compassName(place.lat, place.lon, extent),
    coords: formatCoord(place.lat, place.lon, coordDigits(size)),
  };
}

// ---------- Right panel: the top areas ----------

function TopAreas({ hotspots, headingRef, onPick, onHover }) {
  return (
    <div className="mp-panel-body">
      <h2 ref={headingRef} className="mp-panel-title" tabIndex={-1}>
        Top areas
      </h2>
      {hotspots.length === 0 ? (
        <p className="mp-empty">No ranked land with these weights.</p>
      ) : (
        <ol className="mp-top">
          {hotspots.map((hotspot) => (
            <li key={hotspot.id}>
              <button
                type="button"
                className="mp-top-row"
                data-hotspot={hotspot.id}
                onClick={() => onPick(hotspot)}
                onMouseEnter={() => onHover(hotspot.cellIds)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(hotspot.cellIds)}
                onBlur={() => onHover(null)}
              >
                <span className="mp-top-rank">{hotspot.rank}</span>
                <span className="mp-top-text">
                  <span className="mp-top-name">{hotspot.name}</span>
                  {/* Each part ("1.41° S, 34.80° E", "1 square") stays whole when the line wraps. */}
                  <span className="mp-top-coords">
                    {String(hotspot.coords || "")
                      .split(" · ")
                      .map((part, i) => (
                        <span key={i} className="mp-top-part">
                          {i > 0 ? " · " : ""}
                          {part}
                        </span>
                      ))}
                  </span>
                  <span className="mp-top-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(hotspot.share * 100)}%` }} />
                  </span>
                </span>
                <span className="mp-top-ha">{haFixed(hotspot.blackSoilHa)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------- Right panel: one picked place ----------

//   accessUnknown  safe access is not measured in this run because no fire
//                  looked like fighting (overview.js noFightingFound): its
//                  bar says "Not measured", never a full 100 in a war zone
function PlaceDetail({ detail, titleRef, onBack, onZoom, onAsk, accessUnknown = false }) {
  const tier = TIERS[detail.tier] || TIERS.notAnalyzed;
  const cost = recoveryCost(detail.blackSoilHa);
  const bars = [
    { key: "soil", label: "Soil value", tone: "green" },
    { key: "damage", label: "Damage", tone: "red" },
    { key: "access", label: "Safe access", tone: "blue" },
  ];
  return (
    <div className="mp-panel-body">
      <div className="mp-detail-nav">
        <button type="button" className="mp-back" onClick={onBack}>
          <ArrowLeft size={14} /> Top areas
        </button>
        <button type="button" className="mp-close" onClick={onBack} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="mp-detail-head">
        <h2 ref={titleRef} className="mp-detail-title" tabIndex={-1}>
          {detail.name}
        </h2>
        {detail.coords && <span className="mp-detail-coords">{detail.coords}</span>}
        <div className="mp-detail-tags">
          <Badge tone={tier.tone}>{tier.label}</Badge>
          {detail.rankText && <span className="mp-rank">{detail.rankText}</span>}
        </div>
      </div>

      <div className="mp-bars">
        {bars.map((bar) => {
          if (bar.key === "access" && accessUnknown) return <ScoreBar key={bar.key} label={bar.label} tone={bar.tone} value={0} show="Not measured" valueText="Not measured here" />;
          const value = score100(detail[bar.key]);
          return <ScoreBar key={bar.key} label={bar.label} tone={bar.tone} value={(value ?? 0) / 100} show={value ?? "–"} />;
        })}
      </div>

      <dl className="mp-figures">
        <div>
          <dt>Black soil</dt>
          <dd>{formatHaShort(detail.blackSoilHa)}</dd>
        </div>
        <div>
          <dt>Damaged</dt>
          <dd className="is-red">{formatHaShort(detail.heavyDamageHa)}</dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>{formatCount(detail.people)}</dd>
        </div>
      </dl>

      <div className="mp-cost">
        <h3>Recovery cost</h3>
        <p className="mp-cost-note">{COST_NOTE}</p>
        <div className="mp-cost-row">
          <span>Fast path</span>
          <span className="mp-cost-value">{usdRange(cost.fast)}</span>
        </div>
        <div className="mp-cost-row">
          <span>Full recovery</span>
          <span className="mp-cost-value">{usdRange(cost.full)}</span>
        </div>
      </div>

      <div className="mp-actions">
        <Button variant="primary" icon={<MessageSquare size={14} />} onClick={onAsk}>
          Ask AI
        </Button>
        <Button icon={<Crosshair size={14} />} onClick={onZoom}>
          Zoom to
        </Button>
      </div>
    </div>
  );
}

// ---------- "Change area" dialog ----------

function ChangeAreaDialog({ open, onClose }) {
  const ref = useRef(null);
  const { areas, area, actions } = useAtlasData();
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const others = areas.filter((item) => item.id !== area?.id).slice(0, 5);
  const switchTo = async (id) => {
    setSwitching(id);
    setError(null);
    try {
      await actions.setCurrentArea(id);
      onClose();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <dialog
      ref={ref}
      className="mp-dialog"
      aria-labelledby="mp-dialog-title"
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
    >
      {open && (
        <div className="mp-dialog-inner">
          <div className="mp-dialog-head">
            <h2 id="mp-dialog-title">Change area</h2>
            <button type="button" className="mp-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {others.length > 0 && (
            <div className="mp-saved">
              <span className="field-label">Recent</span>
              <div className="mp-saved-list">
                {others.map((item) => (
                  <button key={item.id} type="button" className="mp-saved-item" onClick={() => switchTo(item.id)} disabled={!!switching}>
                    <MapPin size={13} />
                    <span className="mp-saved-name">{item.name}</span>
                    <span className="mp-saved-size">{switching === item.id ? "Opening…" : formatAreaSize(item.areaHa)}</span>
                  </button>
                ))}
              </div>
              {error && <p className="area-status is-error">{error}</p>}
            </div>
          )}

          <AreaPicker onDone={onClose} />
        </div>
      )}
    </dialog>
  );
}

// ---------- The page ----------

//   held  while another month loads: the month still on screen
//         ({ run, runSummary, scored, hotspots }), else null
function MapView({ held }) {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const rightRef = useRef(null);
  const mapBoxRef = useRef(null);
  const titleRef = useRef(null);
  const headingRef = useRef(null);
  const live = useAtlasData();
  const { area, job, saveError } = live;
  const { run, runSummary, scored, hotspots } = held || live;
  const loadingMonth = !!held;
  const [timeframe] = useTimeframe();
  const [chosenColor, setColorBy] = useColorBy();
  // At peace with no ACLED file safe access is 100 everywhere: there is no
  // Access layer (an old ?color=access link shows Priority). So too in a
  // war where no fire looked like fighting (overview.js accessMeasured).
  const colorBy = chosenColor === "access" && !accessMeasured(run) ? "priority" : chosenColor;
  const [params, setParams] = useSearchParams();
  const [hoverIds, setHoverIds] = useState(null);
  const [changing, setChanging] = useState(false);
  // On a phone the map key starts folded so it covers less of the map.
  const [keyOpen, setKeyOpen] = useState(() => !isNarrow());

  const focus = params.get("focus");
  const places = scored.places;
  const size = run.cellSizeDeg;
  const extent = useMemo(() => placesExtent(places), [places]);

  // The top areas, with the names every page uses (from hotspots.js):
  // the name, then the coordinates on a second line.
  const top = useMemo(
    () =>
      hotspots[timeframe].map((hotspot) => {
        const { title, coords } = labelParts(hotspot);
        return { ...hotspot, name: title, coords };
      }),
    [hotspots, timeframe]
  );

  // What ?focus= points at, worked out again whenever the weights change.
  const picked = useMemo(() => findFocus(focus, { places, hotspots: top }), [focus, places, top]);

  // The numbers the right panel shows for the picked place.
  const detail = useMemo(() => {
    if (!picked) return null;
    if (picked.kind === "hotspot") {
      const h = picked.hotspot;
      return {
        id: h.id,
        name: h.name,
        coords: h.coords,
        tier: h.tier,
        rankText: `Top area ${h.rank}`,
        soil: h.soil,
        damage: h.damage,
        access: h.access,
        blackSoilHa: h.blackSoilHa,
        heavyDamageHa: h.heavyDamageHa,
        people: h.people,
        bounds: padBounds(h.bounds, size * 2),
        cellIds: h.cellIds,
      };
    }
    const p = picked.place;
    const entry = p[timeframe] || {};
    const ranked = rankedCount(places, timeframe);
    return {
      id: p.id,
      ...nameOf(p, { extent, size }),
      tier: entry.tier,
      rankText: Number.isFinite(entry.rank) ? `Rank ${entry.rank.toLocaleString("en-US")} of ${ranked.toLocaleString("en-US")}` : null,
      soil: p.soil,
      damage: p.damage,
      access: p.access,
      blackSoilHa: p.blackSoilHa,
      heavyDamageHa: p.heavyDamageHa,
      people: p.people,
      bounds: padBounds(cellBounds(p, size), size * 4),
      cellIds: null,
    };
  }, [picked, timeframe, places, size, extent]);

  // Flies the map to a box. The map's own flyToBounds stops at zoom 14,
  // which is wider than a farm, so this asks Leaflet directly.
  const flyTo = (bounds) => mapRef.current?.getMap()?.flyToBounds(bounds, { padding: [48, 48], maxZoom: 17, duration: 0.6 });

  const setFocus = (id) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set("focus", id);
        else next.delete("focus");
        return next;
      },
      { replace: true }
    );

  // Fly to the place in the address when the page opens.
  useEffect(() => {
    if (detail) flyTo(detail.bounds);
    // Only once, when the page opens; later picks fly on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ?focus= that points at nothing in this area (an old or mistyped
  // link) is taken out of the address.
  useEffect(() => {
    if (focus && !picked && !loadingMonth && places.length) setFocus(null);
    // setFocus only wraps setParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, picked, loadingMonth, places.length]);

  // A new area has other squares: forget the picked place.
  const shownArea = useRef(area.id);
  useEffect(() => {
    if (shownArea.current === area.id) return;
    shownArea.current = area.id;
    setFocus(null);
    // setFocus only wraps setParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id]);

  // Esc closes the picked place.
  useEffect(() => {
    if (!focus || changing) return;
    const onKey = (event) => event.key === "Escape" && setFocus(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // setFocus only wraps setParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, changing]);

  // Keyboard focus. Opening or closing a place swaps the right panel, so the
  // button that was pressed disappears. When that happens, focus moves to
  // the place's name on opening, and back to the top-area row (or the
  // "Top areas" heading) on closing. Focus that is somewhere else, like the
  // map or a slider, is left alone.
  const lastFocus = useRef(focus);
  const openedFrom = useRef(null);
  const pickedFrom = useRef(null);
  useEffect(() => {
    const before = lastFocus.current;
    lastFocus.current = focus;
    if (before === focus) return;
    const panel = rightRef.current;
    const active = document.activeElement;
    const lost = !active || active === document.body || active.contains(panel) || panel?.contains(active);
    if (focus) {
      if (!before) openedFrom.current = pickedFrom.current;
      if (lost) titleRef.current?.focus({ preventScroll: true });
    } else if (lost) {
      const row = openedFrom.current && panel?.querySelector(`[data-hotspot="${CSS.escape(openedFrom.current)}"]`);
      (row || headingRef.current)?.focus({ preventScroll: true });
      openedFrom.current = null;
    }
    // On a phone the panel is below the map: bring it into view when a
    // place is picked on the map (a top-area pick shows the map instead).
    if (focus && pickedFrom.current === null && isNarrow()) panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    pickedFrom.current = null;
  }, [focus]);

  const pickHotspot = (hotspot) => {
    setHoverIds(null);
    pickedFrom.current = hotspot.id;
    setFocus(hotspot.id);
    flyTo(padBounds(hotspot.bounds, size * 2));
    // On a phone the map is above this list, out of sight: show it.
    if (isNarrow()) mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const askAi = () => {
    const query = new URLSearchParams({ about: detail.id });
    if (timeframe === "postwar") query.set("view", "postwar");
    navigate(`/atlas/ai?${query}`);
  };

  const running = job?.status === "running" && job.areaId === area.id;
  const highlightIds = hoverIds || detail?.cellIds || undefined;
  const selectedId = picked?.kind === "cell" ? picked.place.id : null;

  return (
    <div className="page-full mp">
      <aside className="mp-left" aria-label="Area and weights">
        <div className="mp-head">
          <div className="mp-head-row">
            <h1 className="mp-area" title={area.name}>
              {area.name}
            </h1>
            <Button size="sm" icon={<MapPin size={13} />} onClick={() => setChanging(true)}>
              Change area
            </Button>
          </div>
          <div className="mp-meta">
            <RunPicker />
            {loadingMonth && (
              <span className="mp-loading" role="status" aria-label="Loading the month">
                <Loader2 size={14} className="atlas-spin" aria-hidden="true" />
              </span>
            )}
            {(run.provider || runSummary?.provider) === "gee" ? (
              <Badge tone="green">
                <Check size={11} /> Earth Engine
              </Badge>
            ) : (
              <Badge tone="amber">Sample data</Badge>
            )}
          </div>
          {running && <AnalysisProgress job={job} compact />}
        </div>

        <div className="mp-weights">
          <WeightsPanel />
          {saveError && <p className="mp-save-error">Couldn’t save the weights. They will be tried again.</p>}
        </div>
      </aside>

      <div ref={mapBoxRef} className="mp-map">
        <AtlasMap
          ref={mapRef}
          area={area}
          run={run}
          places={places}
          colorBy={colorBy}
          timeframe={timeframe}
          selectedId={selectedId}
          highlightIds={highlightIds}
          onSelect={(place) => setFocus(place ? place.id : null)}
          height="100%"
          ariaLabel={`Map of ${area.name}`}
        >
          <div className={["atlas-map-float", "mp-legend", keyOpen ? "" : "is-folded"].filter(Boolean).join(" ")}>
            <MapLegend colorBy={colorBy} timeframe={timeframe} run={run} onColorByChange={setColorBy} />
            <button
              type="button"
              className="mp-legend-toggle"
              aria-expanded={keyOpen}
              aria-label={keyOpen ? "Hide the map key" : "Show the map key"}
              onClick={() => setKeyOpen((open) => !open)}
            >
              {keyOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
        </AtlasMap>
      </div>

      <aside ref={rightRef} className="mp-right" aria-label={detail ? "Selected place" : "Top areas"}>
        {detail ? (
          <PlaceDetail detail={detail} titleRef={titleRef} onBack={() => setFocus(null)} onZoom={() => flyTo(detail.bounds)} onAsk={askAi} accessUnknown={noFightingFound(run)} />
        ) : (
          <TopAreas hotspots={top} headingRef={headingRef} onPick={pickHotspot} onHover={setHoverIds} />
        )}
      </aside>

      <ChangeAreaDialog open={changing} onClose={() => setChanging(false)} />
    </div>
  );
}

// Shows the map once the area has a loaded month. While another month of
// the same area loads, the month already on screen stays (the map is not
// rebuilt, so the zoom and the picked place stay too). Everything else
// (first load, no area, errors) is <AtlasGate>'s job.
export default function MapPage() {
  const data = useAtlasData();
  const shown = useRef(null);
  if (data.area && data.run && data.scored) {
    shown.current = { areaId: data.area.id, run: data.run, runSummary: data.runSummary, scored: data.scored, hotspots: data.hotspots };
  }
  const ready = data.status === "ready" && !!data.area && data.runs.length > 0 && !!data.run && !!data.scored;
  const holding =
    !ready && data.status === "ready" && !!data.area && data.runStatus === "loading" && shown.current?.areaId === data.area.id;

  if (ready || holding) return <MapView held={ready ? null : shown.current} />;
  return (
    <AtlasGate>
      <MapView held={null} />
    </AtlasGate>
  );
}
