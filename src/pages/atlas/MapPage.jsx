// WHAT THIS FILE DOES
// The Atlas map page (/atlas/map). Three columns:
//   left    the area name, the month, "Change area", then three sections:
//             Weights  Near term | Postwar and the weights (Value / Damage /
//                      Feasibility; in Near term the Feasibility cutoff)
//             Detail   Squares | States (or Districts, for a region area):
//                      the map and the list by square, or by whole state
//             Map      four tabs, Priority, Value, Damage, Feasibility,
//                      that colour the map (src/components/atlas/MapTabs.jsx)
//           (the tab and the detail level are remembered by this browser)
//   middle  the real map with the states' (or districts') borders and names
//           on top of the squares (FAO GAUL, GET /api/areas/:id/units), or
//           in the States view the states themselves filled by their
//           scores; working zoom buttons and scroll zoom; the key at the
//           bottom (colour scale and "How it's measured")
//   right   the top areas (in the States view: the states ranked), or the
//           details of the square, top area or state you picked: scores,
//           soil types (GET /api/soil), hectares, people, recovery cost,
//           "Ask AI"
//
// "?focus=<top area id, square id or state id>" in the address picks that place and
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
// BIGGER MAP (wider screens): each side column's edge next to the map can
// be dragged to make it wider or narrower (double-click: back to the usual
// width; the edges are also focusable separators the arrow keys move), and
// the tab on each side of the map hides that column so the map takes its
// room (the same tab brings it back). Picking a square on the map, or
// arriving from a link to a place (the Overview), opens the right column
// again: the details are what the click asks for. Widths and hidden columns
// are remembered by this browser (src/components/ui/PanelEdge.jsx). While
// the map still shows the whole area it fits it again to its new size.
//
// "Satellite only" (the button under the zoom buttons) swaps the grey map
// for satellite imagery and hides the squares, the area's border and the
// key; also remembered (src/components/atlas/AtlasMap.jsx).
//
// WHO EDITS IT
// Whoever changes how the Atlas map page looks or behaves. The map itself is
// src/components/atlas/AtlasMap.jsx; the weights WeightsPanel.jsx.

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Crosshair, Loader2, MapPin, MessageSquare, X } from "lucide-react";
import { Badge, Button, ScoreBar } from "../../components/ui/index.js";
import { AnalysisProgress, AtlasGate, useAtlasData, useColorBy, useDetailLevel, useTimeframe } from "../../state/AtlasData.jsx";
import { useAreaUnits, useScoredUnits, useSoil } from "../../state/useUnits.js";
import AtlasMap from "../../components/atlas/AtlasMap.jsx";
import AreaPicker from "../../components/atlas/AreaPicker.jsx";
import MapLegend from "../../components/atlas/MapLegend.jsx";
import RunPicker from "../../components/atlas/RunPicker.jsx";
import WeightsPanel from "../../components/atlas/WeightsPanel.jsx";
import { DetailSwitch, MapTabs } from "../../components/atlas/MapTabs.jsx";
import PanelEdge, { usePanel, useRoom } from "../../components/ui/PanelEdge.jsx";
import { fitPanels } from "../../lib/panels.js";
import { cleanBoolean } from "../../lib/prefs.js";
import { useMedia } from "../../state/useMedia.js";
import { usePref } from "../../state/usePref.js";
import { cellBounds, compassName, coordDigits, findFocus, labelParts, placesExtent } from "../../lib/atlas/hotspots.js";
import { flatAccessNote, leftOutText, rankedCount, unrankedNote } from "../../lib/atlas/mapColors.js";
import { accessMeasured, disasterType, recoveryCost, setAsideNote } from "../../lib/atlas/overview.js";
import { placeNames } from "../../lib/atlas/placeNames.js";
import { unitRanking } from "../../lib/atlas/units.js";
import { COST_NOTE } from "../../lib/atlas/method.js";
import { formatAreaSize, formatCoord, formatCount, formatHaShort } from "../../lib/format.js";
import { haFixed } from "./overviewHelpers.js";
import "./MapPage.css";

// The width at which the columns stack (keep in step with MapPage.css).
const NARROW = "(max-width: 860px)";
const isNarrow = () => !!window.matchMedia?.(NARROW).matches;
// Below this width the columns are narrower by default (MapPage.css).
const COMPACT = "(max-width: 1180px)";
// The side columns: how narrow and how wide they may be dragged
// (src/lib/panels.js). Dragging never leaves the map narrower than MAP_MIN.
const LEFT = { min: 260, maxPx: 560, share: 0.45 };
const RIGHT = { min: 260, maxPx: 640, share: 0.45 };
const MAP_MIN = 360;

// How each tier is named and coloured on the badge.
const TIERS = {
  highest: { label: "Highest priority", tone: "green" },
  high: { label: "High priority", tone: "green" },
  medium: { label: "Medium priority", tone: "amber" },
  lower: { label: "Lower priority", tone: "outline" },
  setAside: { label: "Left out for now", tone: "outline" },
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
  const names = placeNames(place);
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

// ---------- Right panel: the states ranked (States view) ----------

//   units     the scored units (src/lib/atlas/units.js scoreUnits(...).units)
//   timeframe "nearTerm" | "postwar"
//   many      what the units are called ("states", "districts")
//   areaName  the area's name: a unit's parent is not repeated when it is
//             the area itself (Iowa's counties)
//   one       what one unit is called ("state", "district")
//   onPick(unit), onHover(unitId | null)
//   limit     show only this many rows of each list at first, with a "Show
//             all" button (on a phone, so 99 counties do not make the page
//             metres long); null shows all
function UnitList({ units, timeframe, one = "state", many, areaName, headingRef, onPick, onHover, note, limit = null }) {
  const [all, setAll] = useState(false);
  const parentOf = (unit) => (unit.parentDisplayName && unit.parentDisplayName.toLowerCase() !== String(areaName || "").toLowerCase() ? unit.parentDisplayName : null);
  const ranked = unitRanking(units, timeframe);
  const leftOut = units.filter((unit) => unit[timeframe]?.tier === "setAside").sort((a, b) => (b.blackSoilHa || 0) - (a.blackSoilHa || 0));
  const unranked = units.filter((unit) => !unit.analyzed && unit[timeframe]?.tier !== "setAside").sort((a, b) => (b.squares || 0) - (a.squares || 0));
  const title = `${many.charAt(0).toUpperCase()}${many.slice(1)} ranked`;
  const total = ranked.length + leftOut.length + unranked.length;
  const cut = limit && !all && total > limit;
  const first = (list, room) => (cut ? list.slice(0, Math.max(0, room)) : list);
  const shownRanked = first(ranked, limit);
  const shownLeftOut = first(leftOut, (limit || 0) - shownRanked.length);
  const shownUnranked = first(unranked, (limit || 0) - shownRanked.length - shownLeftOut.length);
  const row = (unit, rank) => (
    <li key={unit.id}>
      <button
        type="button"
        className="mp-top-row"
        data-unit={unit.id}
        onClick={() => onPick(unit)}
        onMouseEnter={() => onHover(unit.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(unit.id)}
        onBlur={() => onHover(null)}
      >
        <span className={rank ? "mp-top-rank" : "mp-top-rank is-muted"}>{rank || "–"}</span>
        <span className="mp-top-text">
          <span className="mp-top-name">{unit.displayName || "No name in FAO GAUL"}</span>
          <span className="mp-top-coords">
            {parentOf(unit) && <span className="mp-top-part">{parentOf(unit)} · </span>}
            <span className="mp-top-part">
              {unit.squares.toLocaleString("en-US")} {unit.squares === 1 ? "square" : "squares"}
            </span>
          </span>
          {rank ? (
            <span className="mp-top-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((unit[timeframe]?.share || 0) * 100)}%` }} />
            </span>
          ) : null}
        </span>
        <span className="mp-top-ha">{haFixed(unit.blackSoilHa)}</span>
      </button>
    </li>
  );
  return (
    <div className="mp-panel-body">
      <h2 ref={headingRef} className="mp-panel-title" tabIndex={-1}>
        {title}
      </h2>
      {note && <p className="mp-units-note">{note}</p>}
      {ranked.length === 0 ? <p className="mp-empty">No {many} ranked with these weights.</p> : <ol className="mp-top">{shownRanked.map((unit) => row(unit, unit[timeframe].rank))}</ol>}
      {shownLeftOut.length > 0 && (
        <>
          <h3 className="mp-units-sub">Left out for now · least feasible</h3>
          <p className="mp-units-note">
            Judged on each {one}&rsquo;s average Feasibility: some of its squares can still rank near the top in Squares view.
          </p>
          <ul className="mp-top">{shownLeftOut.map((unit) => row(unit, null))}</ul>
        </>
      )}
      {shownUnranked.length > 0 && (
        <>
          <h3 className="mp-units-sub">Not ranked</h3>
          <ul className="mp-top">{shownUnranked.map((unit) => row(unit, null))}</ul>
        </>
      )}
      {cut && (
        <Button size="sm" className="mp-units-more" onClick={() => setAll(true)}>
          Show all {total.toLocaleString("en-US")} {many}
        </Button>
      )}
    </div>
  );
}

// ---------- Right panel: the soil types of a picked square or state ----------

const percent = (share) => (share >= 0.995 ? "100%" : share > 0 && share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`);

//   state  useSoil(): { status, soil, error }
//   what   "square" | "state" | "district"
function SoilTypes({ state, what }) {
  const { status, soil, error } = state;
  let body;
  if (status === "loading" || status === "idle") {
    body = (
      <p className="mp-soil-wait" role="status">
        <Loader2 size={13} className="atlas-spin" aria-hidden="true" /> Reading the soil types…
      </p>
    );
  } else if (status === "error") {
    // (The server's message ends with a full stop of its own.)
    body = <p className="mp-soil-note">The soil types could not be read: {(error?.message || "try again later").replace(/\.+$/, "")}.</p>;
  } else if (!soil?.available) {
    body = <p className="mp-soil-note">{soil?.message || "The soil type needs Earth Engine."}</p>;
  } else if (!soil.top?.length) {
    body = <p className="mp-soil-note">No soil class is mapped here.</p>;
  } else {
    body = (
      <>
        <ul className="mp-soil-list">
          {soil.top.map((item) => (
            <li key={item.name} className={item.blackSoil ? "mp-soil-item is-black" : "mp-soil-item"}>
              <span className="mp-soil-name" title={item.wrb ? `${item.name} · WRB: ${item.wrb}` : item.name}>
                {item.short || item.name}
              </span>
              <span className="mp-soil-share">{percent(item.share)}</span>
              <span className="mp-soil-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(2, Math.round(item.share * 100))}%` }} />
              </span>
              <span className="mp-soil-groups">
                {[item.suborder && item.order ? `${item.suborder} (${item.order.replace(/s$/, "")})` : null, (item.greatGroups || []).map((group) => `${group.name} ${percent(group.share)}`).join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        {soil.otherShare >= 0.01 && <p className="mp-soil-note">Other soils {percent(soil.otherShare)}</p>}
        <p className="mp-soil-source">
          {soil.over === "cropland" ? `In the ${what}'s cropland` : `Over the whole ${what} (no cropland mapped)`}, USDA great groups, 250 m
          {soil.approximateBorders ? " · borders approximate" : ""}
        </p>
      </>
    );
  }
  return (
    <div className="mp-soil">
      <h3>Soil types</h3>
      {body}
    </div>
  );
}

// ---------- Right panel: one picked place ----------

//   accessUnknown  feasibility is not measured in this run (overview.js
//                  accessMeasured false: at peace, before the war, or in a
//                  war where no fire looked like fighting): its bar says
//                  "Not measured", as the Feasibility tab does, never a full
//                  100
//   soil           useSoil() for a square or a state, or null (a top area)
//   gate           the Feasibility cutoff (%), for a place it leaves out
//   backLabel      the back button's words ("Top areas", "States ranked")
function PlaceDetail({ detail, titleRef, onBack, onZoom, onAsk, accessUnknown = false, soil = null, gate = null, backLabel = "Top areas" }) {
  const tier = TIERS[detail.tier] || TIERS.notAnalyzed;
  const cost = recoveryCost(detail.blackSoilHa);
  const bars = [
    { key: "soil", label: "Value", tone: "green" },
    { key: "damage", label: "Damage", tone: "red" },
    { key: "access", label: "Feasibility", tone: "blue" },
  ];
  return (
    <div className="mp-panel-body">
      <div className="mp-detail-nav">
        <button type="button" className="mp-back" onClick={onBack}>
          <ArrowLeft size={14} /> {backLabel}
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
        {detail.tier === "setAside" && <p className="mp-left-out">{leftOutText(gate)}</p>}
        {detail.tier === "setAside" && detail.wholeText && <p className="mp-left-out">{detail.wholeText}</p>}
        {detail.kind === "unit" && detail.reason && detail.tier === "notAnalyzed" && <p className="mp-left-out">{detail.reason}</p>}
      </div>

      <div className="mp-bars">
        {bars.map((bar) => {
          if (bar.key === "access" && accessUnknown) return <ScoreBar key={bar.key} label={bar.label} tone={bar.tone} value={0} show="Not measured" valueText="Not measured here" />;
          const value = score100(detail[bar.key]);
          return <ScoreBar key={bar.key} label={bar.label} tone={bar.tone} value={(value ?? 0) / 100} show={value ?? "–"} />;
        })}
      </div>

      {soil && <SoilTypes state={soil} what={detail.what || "square"} />}

      <dl className="mp-figures">
        <div>
          <dt>Black soil</dt>
          <dd>{formatHaShort(detail.blackSoilHa)}</dd>
        </div>
        {/* A natural disaster: the black-soil cropland it hit, then the
            heavily damaged land. */}
        {Number.isFinite(detail.hitHa) && (
          <div>
            <dt>Black soil hit</dt>
            <dd className="is-red">{formatHaShort(detail.hitHa)}</dd>
          </div>
        )}
        {/* All cropland hit: a place with little black soil still shows it. */}
        {Number.isFinite(detail.hitCropHa) && (
          <div>
            <dt>Cropland hit (all soils)</dt>
            <dd className="is-red">{formatHaShort(detail.hitCropHa)}</dd>
          </div>
        )}
        <div>
          <dt>{Number.isFinite(detail.hitHa) ? "Black soil heavily damaged" : "Damaged"}</dt>
          <dd className="is-red">{formatHaShort(detail.heavyDamageHa)}</dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>{formatCount(detail.people)}</dd>
        </div>
      </dl>
      {detail.squaresText && <p className="mp-units-note">{detail.squaresText}</p>}

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
  const navigationType = useNavigationType();
  const rowRef = useRef(null);
  const mapRef = useRef(null);
  const rightRef = useRef(null);
  const mapBoxRef = useRef(null);
  const titleRef = useRef(null);
  const headingRef = useRef(null);
  const live = useAtlasData();
  const { area, job, saveError, settings } = live;
  const { run, runSummary, scored, hotspots } = held || live;
  const loadingMonth = !!held;
  const [timeframe] = useTimeframe();
  const [chosenColor, setColorBy] = useColorBy();
  // At peace with no ACLED file feasibility is 100 everywhere: there is no
  // Feasibility map (its tab says "Not measured here"; an old ?color=access
  // link shows Priority). So too in a war where no fire looked like
  // fighting (overview.js accessMeasured).
  const measured = accessMeasured(run);
  // A flood's or wildfire's Feasibility that is full everywhere is measured
  // but would colour the map flat: its tab is not offered then either, and
  // says why (mapColors.js flatAccessNote).
  const flatAccess = flatAccessNote(run, scored.places);
  const accessMap = measured && !flatAccess;
  const colorBy = chosenColor === "access" && !accessMap ? "priority" : chosenColor;
  const [params, setParams] = useSearchParams();
  const [hoverIds, setHoverIds] = useState(null);
  // The states (or districts) of the area: their borders and names over
  // the squares, and in the States view the ranking by state.
  const [detailLevel, setDetailLevel] = useDetailLevel();
  const unitsAnswer = useAreaUnits(area.id, run.id);
  const scoredUnits = useScoredUnits(unitsAnswer.data, scored, null);
  const unitList = scoredUnits?.units || null;
  const unitsUsable = unitsAnswer.status === "ready" && (unitsAnswer.data?.units?.length ?? 0) >= 2 && !!unitList;
  const unitView = detailLevel === "units" && unitsUsable;
  const unitsPending = detailLevel === "units" && unitsAnswer.status === "loading";
  const [hoverUnit, setHoverUnit] = useState(null);
  const [changing, setChanging] = useState(false);
  // On a phone the map key starts folded so it covers less of the map.
  const [keyOpen, setKeyOpen] = useState(() => !isNarrow());

  // The side columns: dragged wider or narrower, or hidden (wider screens
  // only; on a phone everything stacks as before).
  const narrow = useMedia(NARROW);
  const compact = useMedia(COMPACT);
  const leftPanel = usePanel("atlas-left");
  const rightPanel = usePanel("atlas-right");
  const leftHidden = !narrow && leftPanel.hidden;
  const rightHidden = !narrow && rightPanel.hidden;
  const room = useRoom(rowRef, 0, !narrow);
  const sizes = fitPanels({
    room,
    mapMin: MAP_MIN,
    panels: [
      { id: "left", ...LEFT, width: leftPanel.width, defaultWidth: compact ? 270 : 300, hidden: leftHidden },
      { id: "right", ...RIGHT, width: rightPanel.width, defaultWidth: compact ? 280 : 320, hidden: rightHidden },
    ],
  });
  const columnStyle = (width) => (narrow ? undefined : { flexBasis: width, width });
  const [satelliteOnly, setSatelliteOnly] = usePref("chernozem.map.atlas.satelliteOnly", false, cleanBoolean);

  const focus = params.get("focus");
  const places = scored.places;
  const size = run.cellSizeDeg;
  const extent = useMemo(() => placesExtent(places), [places]);
  const placesById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);

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

  // What ?focus= points at, worked out again whenever the weights change:
  // a state (States view), else a top area or a square.
  const pickedUnit = useMemo(() => (unitView && focus ? unitList.find((unit) => unit.id === focus) || null : null), [unitView, focus, unitList]);
  const picked = useMemo(() => (pickedUnit ? null : findFocus(focus, { places, hotspots: top })), [pickedUnit, focus, places, top]);
  const one = unitsAnswer.data?.one || "state";
  const many = unitsAnswer.data?.many || "states";
  const listTitle = `${many.charAt(0).toUpperCase()}${many.slice(1)} ranked`;

  // The numbers the right panel shows for the picked place.
  const detail = useMemo(() => {
    if (pickedUnit) {
      const u = pickedUnit;
      const entry = u[timeframe] || {};
      const ranked = rankedCount(unitList, timeframe);
      const [west, south, east, north] = u.bbox || [];
      const kind = `${one.charAt(0).toUpperCase()}${one.slice(1)}`;
      const count = (n) => n.toLocaleString("en-US");
      const squares = `${count(u.squares)} map ${u.squares === 1 ? "square" : "squares"}`;
      // Its squares by where they stand in this time frame's ranking (Near
      // term: those in the ranking, those its cutoff leaves out, and those
      // not ranked at all), so the numbers never overlap.
      const own = (u.cellIds || []).map((id) => placesById.get(id)).filter(Boolean);
      const inRanking = own.filter((p) => Number.isFinite(p[timeframe]?.rank));
      const leftOutSquares = timeframe === "nearTerm" ? own.filter((p) => p.nearTerm?.tier === "setAside").length : 0;
      const notRanked = own.length - inRanking.length - leftOutSquares;
      const parts =
        timeframe === "nearTerm"
          ? [`${count(inRanking.length)} in the near-term ranking`, leftOutSquares > 0 ? `${count(leftOutSquares)} left out for now` : null, notRanked > 0 ? `${count(notRanked)} not ranked` : null]
          : [`${count(inRanking.length)} ranked`, notRanked > 0 ? `${count(notRanked)} not ranked` : null];
      // A state left out as a whole: judged on its average, so some of its
      // squares can still rank (in Squares view); name the best of them.
      let wholeText = null;
      if (entry.tier === "setAside") {
        const ids = new Set(u.cellIds || []);
        const bestArea = top.find((hotspot) => (hotspot.cellIds || []).some((id) => ids.has(id)));
        const bestSquare = inRanking.reduce((best, p) => (!best || p.nearTerm.rank < best.nearTerm.rank ? p : best), null);
        const best = bestArea ? ` (best: Top area ${bestArea.rank})` : bestSquare ? ` (best square rank ${count(bestSquare.nearTerm.rank)})` : "";
        const whole = `It is left out as a whole, judged on its average Feasibility.`;
        wholeText = inRanking.length
          ? `${whole} ${count(inRanking.length)} of its ${count(own.length)} squares still rank in Squares view${best}.`
          : `${whole} None of its squares rank on their own either.`;
      }
      return {
        id: u.id,
        kind: "unit",
        what: one,
        name: u.displayName || "No name in FAO GAUL",
        coords: u.parentDisplayName && u.parentDisplayName.toLowerCase() !== area.name.toLowerCase() ? `${kind} · ${u.parentDisplayName}` : `${kind} · ${area.name}`,
        tier: entry.tier,
        rankText: Number.isFinite(entry.rank) ? `Rank ${entry.rank} of ${ranked}` : null,
        analyzed: u.analyzed,
        reason: u.reason,
        soil: u.soil,
        damage: u.damage,
        access: u.access,
        blackSoilHa: u.blackSoilHa,
        heavyDamageHa: u.heavyDamageHa,
        ...(Number.isFinite(u.hitHa) ? { hitHa: u.hitHa, hitCropHa: u.hitCropHa } : {}),
        people: u.people,
        squaresText: u.squares ? `${squares}: ${parts.filter(Boolean).join(", ")}. Scores are black-soil-weighted means of its ranked squares.` : null,
        wholeText,
        bounds: Number.isFinite(west) ? [[south, west], [north, east]] : null,
        cellIds: null,
      };
    }
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
        kind: "hotspot",
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
      ...(Number.isFinite(p.hitHa) ? { hitHa: p.hitHa, hitCropHa: p.hitCropHa } : {}),
      people: p.people,
      bounds: padBounds(cellBounds(p, size), size * 4),
      cellIds: null,
      kind: "cell",
      what: "square",
    };
  }, [pickedUnit, unitList, one, area.name, picked, timeframe, places, placesById, top, size, extent]);

  // The soil types of the picked square or state, read when it is picked
  // (GET /api/soil; saved by the server once read).
  const soilState = useSoil(pickedUnit ? { areaId: area.id, unitId: pickedUnit.id } : picked?.kind === "cell" ? { areaId: area.id, cellId: picked.place.id, runId: run.id } : {});

  // Flies the map to a box. The map's own flyToBounds stops at zoom 14,
  // which is wider than a farm, so this asks Leaflet directly.
  const flyTo = (bounds) => bounds && mapRef.current?.getMap()?.flyToBounds(bounds, { padding: [48, 48], maxZoom: 17, duration: 0.6 });

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

  // Fly to the place in the address when the page opens. Arriving from a
  // link to it (the Overview), its details show even if the right column
  // was hidden; a reload keeps the column as it was.
  useEffect(() => {
    if (detail) flyTo(detail.bounds);
    if (focus && navigationType === "PUSH") rightPanel.show();
    // Only once, when the page opens; later picks fly on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ?focus= that points at nothing in this area (an old or mistyped
  // link) is taken out of the address.
  useEffect(() => {
    // (While the states load, a state's id may still be found.)
    if (focus && !picked && !pickedUnit && !unitsPending && !loadingMonth && places.length) setFocus(null);
    // setFocus only wraps setParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, picked, pickedUnit, unitsPending, loadingMonth, places.length]);

  // A new area has other squares: forget the picked place.
  const shownArea = useRef(area.id);
  useEffect(() => {
    if (shownArea.current === area.id) return;
    shownArea.current = area.id;
    setFocus(null);
    // setFocus only wraps setParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id]);

  // Esc closes the picked place: not while a dialog ("How it's measured")
  // is open, when Esc closes the dialog alone.
  useEffect(() => {
    if (!focus || changing) return;
    const onKey = (event) => event.key === "Escape" && !document.querySelector("dialog[open]") && setFocus(null);
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
      const id = openedFrom.current && CSS.escape(openedFrom.current);
      const row = id && panel?.querySelector(`[data-hotspot="${id}"], [data-unit="${id}"]`);
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

  // A state from its row in the list: as a top area.
  const pickUnit = (unit) => {
    setHoverUnit(null);
    pickedFrom.current = unit.id;
    setFocus(unit.id);
    const [west, south, east, north] = unit.bbox || [];
    if (Number.isFinite(west)) flyTo([[south, west], [north, east]]);
    if (isNarrow()) mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const askAi = () => {
    // A state: the question names it and gives the page's own numbers for
    // it (the AI's data has its squares, not the states' ranking).
    let query;
    if (detail.kind === "unit") {
      query = new URLSearchParams({ state: `${detail.name} (${detail.what}${pickedUnit?.parentDisplayName ? `, ${pickedUnit.parentDisplayName}` : ""})` });
      const facts = [
        detail.rankText ? `${detail.rankText.replace(/^Rank/, "ranked")} by ${detail.what} (${timeframe === "postwar" ? "post-crisis" : "near term"})` : detail.tier === "setAside" ? "left out of the near-term ranking by state for now (least feasible)" : null,
        ...[["value", detail.soil], ["damage", detail.damage], ["feasibility", measured ? detail.access : null]].filter(([, v]) => Number.isFinite(v)).map(([k, v]) => `${k} ${Math.round(v * 100)}`),
      ].filter(Boolean);
      if (facts.length) query.set("facts", facts.join(", "));
    } else {
      query = new URLSearchParams({ about: detail.id });
    }
    if (timeframe === "postwar") query.set("view", "postwar");
    navigate(`/atlas/ai?${query}`);
  };

  // The key's line for the hatched places on the map shown, if any.
  const unranked = useMemo(() => unrankedNote(unitView ? unitList : places, colorBy, timeframe), [unitView, unitList, places, colorBy, timeframe]);

  const running = job?.status === "running" && job.areaId === area.id;
  const highlightIds = hoverIds || detail?.cellIds || undefined;
  const selectedId = picked?.kind === "cell" ? picked.place.id : null;

  return (
    <div ref={rowRef} className="page-full mp">
      <aside id="mp-left" className="mp-left" aria-label="Area, weights and map" hidden={leftHidden} style={columnStyle(sizes.left.width)}>
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

        {/* Three sections: Weights, Detail (Squares | States), Map (the four tabs). */}
        <div className="mp-weights">
          <div>
            <WeightsPanel />
            {saveError && <p className="mp-save-error">Couldn’t save the weights. They will be tried again.</p>}
          </div>
          <DetailSwitch value={detailLevel} onChange={setDetailLevel} units={unitsAnswer.data} status={unitsAnswer.status} />
          <MapTabs value={colorBy} onChange={setColorBy} measured={accessMap} why={flatAccess || setAsideNote(run)} disaster={disasterType(run)} offHint={flatAccess ? "Nothing in the way" : null} />
        </div>
      </aside>

      <div ref={mapBoxRef} className="mp-map">
        {/* The left column's edge comes first, so the keyboard meets it
            right after that column. */}
        {!narrow && (
          <PanelEdge
            side="left"
            panelId="mp-left"
            name="area, weights and map"
            hidden={leftPanel.hidden}
            onToggle={leftPanel.toggle}
            limits={sizes.left}
            onResize={leftPanel.setWidth}
            onReset={leftPanel.reset}
          />
        )}
        <AtlasMap
          ref={mapRef}
          area={area}
          run={run}
          places={places}
          colorBy={colorBy}
          timeframe={timeframe}
          selectedId={selectedId}
          highlightIds={highlightIds}
          units={unitList || unitsAnswer.data?.units || null}
          unitView={unitView}
          selectedUnitId={pickedUnit?.id || null}
          highlightUnitId={hoverUnit}
          onSelectUnit={(unit) => {
            setFocus(unit ? unit.id : null);
            if (unit) startTransition(() => rightPanel.show());
          }}
          onSelect={(place) => {
            setFocus(place ? place.id : null);
            // Its details are what the click asks for: the column opens if
            // it was hidden, in the same update as the new ?focus= (the
            // router applies that as a transition), so it opens already
            // showing the place. Should the column cover the square, the
            // map brings it back on screen (AtlasMap, "steady").
            if (place) startTransition(() => rightPanel.show());
          }}
          satelliteOnly={satelliteOnly}
          onSatelliteOnlyChange={setSatelliteOnly}
          steady
          height="100%"
          ariaLabel={`Map of ${area.name}`}
        >
          <div className={["atlas-map-float", "mp-legend", keyOpen ? "" : "is-folded"].filter(Boolean).join(" ")}>
            <MapLegend colorBy={colorBy} timeframe={timeframe} run={run} howMeasured unitView={unitView} unitWords={{ one, many }} unranked={unranked} />
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
        {!narrow && (
          <PanelEdge
            side="right"
            panelId="mp-right"
            name={detail ? "place details" : unitView ? many : "top areas"}
            hidden={rightPanel.hidden}
            onToggle={rightPanel.toggle}
            limits={sizes.right}
            onResize={rightPanel.setWidth}
            onReset={rightPanel.reset}
          />
        )}
      </div>

      <aside
        ref={rightRef}
        id="mp-right"
        className="mp-right"
        aria-label={detail ? "Selected place" : unitView ? listTitle : "Top areas"}
        hidden={rightHidden}
        style={columnStyle(sizes.right.width)}
      >
        {detail ? (
          <PlaceDetail
            detail={detail}
            titleRef={titleRef}
            onBack={() => setFocus(null)}
            onZoom={() => flyTo(detail.bounds)}
            onAsk={askAi}
            accessUnknown={!measured}
            soil={detail.kind === "hotspot" ? null : soilState}
            gate={settings?.gatePercentile}
            backLabel={unitView ? listTitle : "Top areas"}
          />
        ) : unitView ? (
          <UnitList
            units={unitList}
            timeframe={timeframe}
            one={one}
            many={many}
            limit={narrow ? 15 : null}
            areaName={area.name}
            headingRef={headingRef}
            onPick={pickUnit}
            onHover={setHoverUnit}
            note={unitsAnswer.data?.approximate ? unitsAnswer.data.message : unitsAnswer.data?.note}
          />
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
