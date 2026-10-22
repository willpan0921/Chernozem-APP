// WHAT THIS FILE DOES
// The Field "Overview" page (web address /field): the first thing a farmer
// sees. From top to bottom:
//   - the farm name, where the data comes from and the date of the latest
//     satellite pass, with the "Open map" button,
//   - one status sentence ("1 field needs recovery · 1 to watch"),
//   - the big tiles: the farm's real mix, one tile per status that has
//     fields ("Harvested 3", "Fallow or grass 6", "Growing well 2", "To
//     watch 1", "Ready to harvest 2"...; overview.js statTiles), then farm
//     area and weather. Press a status tile to pick out its fields in the
//     list. "Needs recovery" shows where a known war covers the farm (0
//     there is good news) or a field needs it; never a row of zeros,
//   - "What needs doing": only things worked out from the analyses
//     (recovery of damaged fields with its cost, fields ready to harvest
//     before the rain, stress patches...), or "Nothing urgent",
//   - "Tell us what happened": a report with up to 4 photos; Send saves it
//     and opens the AI chat about it (/field/ai?report=<id>). "Shelling" is
//     offered only where a known war covers the farm (analysis.conflict),
//   - on the right, "Your fields": a small satellite map and the list of
//     fields, each with its square in the map's colour and pattern
//     (format.js mapLook), its crop (the farmer's, else "Corn · detected"),
//     status and, for a harvested field, how its season went ("Season:
//     Good"); a new field says "Analysing…" until its analysis is saved
//     (click one to open it on the Fields map).
//
// Everything comes from the farm and its analyses (useFieldData). The rules
// (what counts as damaged, ready, stressed...) are in
// src/lib/field/method.js; the status sentence and the "What needs doing"
// items are worded in src/lib/field/overview.js (tested there). The report
// kinds are REPORT_KINDS in src/data/chats.js (shared with the AI page).
//
// WHO EDITS IT
// Whoever changes how the Field overview looks or is laid out. Its styles
// are in OverviewPage.css next to this file (every class starts "fo-").

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Camera,
  ChevronRight,
  CircleCheck,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Map as MapIcon,
  RefreshCw,
  Send,
  ShieldAlert,
  Sun,
  TriangleAlert,
  Wheat,
  Activity,
  Droplets,
  Sprout,
  X,
} from "lucide-react";
import { PageHeader, Badge, Button } from "../../components/ui/index.js";
import { FarmGate, FieldProgress, useFieldData } from "../../state/FieldData.jsx";
import { ANALYSING_LABEL, cropInfo, farmAreaHa, formatArea, formatDay, formatDayRange, mapLook, seasonLine, statusOf } from "../../lib/field/format.js";
import { fieldKind, latestPass, likelyRain, needsDoing, statTiles, statusSentence } from "../../lib/field/overview.js";
import { LookSwatch } from "../../components/field/ConditionLegend.jsx";
import { REPORT_KINDS } from "../../data/chats.js";
import { PHOTO_TYPES } from "../../api/fieldApi.js";
import "./OverviewPage.css";

// The map (and the map library) only downloads once the page shows.
const FieldMap = lazy(() => import("../../components/field/FieldMap.jsx"));

const MAX_PHOTOS = 4;
const ITEMS_SHOWN = 5;
// The small satellite map: the farm fills the frame (and fills it again
// when the frame changes size, e.g. the menu folded: FieldMap "steady").
const MAP_FIT_PADDING = [14, 14];

export default function OverviewPage() {
  return (
    <FarmGate>
      <Overview />
    </FarmGate>
  );
}

const ITEM_ICONS = { shield: ShieldAlert, wheat: Wheat, stress: Activity, health: Sprout, water: Droplets, cloud: CloudFog, alert: TriangleAlert };

// WMO weather code (Open-Meteo) -> an icon.
function WeatherIcon({ code, size = 26 }) {
  let Icon = Cloud;
  if (code === 0) Icon = Sun;
  else if (code === 1 || code === 2) Icon = CloudSun;
  else if (code === 45 || code === 48) Icon = CloudFog;
  else if (code >= 51 && code <= 57) Icon = CloudDrizzle;
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) Icon = CloudRain;
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) Icon = CloudSnow;
  else if (code >= 95) Icon = CloudLightning;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />;
}

// ---------- The page ----------

function Overview() {
  const navigate = useNavigate();
  const { farm, analyses, provider, job, weather, weatherError, analysing, conflict, actions } = useFieldData();
  const [hoveredId, setHoveredId] = useState(null);
  // A status tile that is pressed: its fields stand out in "Your fields".
  const [group, setGroup] = useState(null);
  const toggleGroup = (id) => setGroup((now) => (now === id ? null : id));
  const inGroup = (analysis) => !group || fieldKind(analysis) === group;

  const status = statusSentence(farm, analyses, job);
  // One tile per status that has fields ("Harvested 3", "Fallow or grass
  // 6"...), and "Needs recovery" where a war covers the farm.
  const tiles = statTiles(farm, analyses, conflict);
  const items = useMemo(() => needsDoing({ farm, analyses, weather, job }), [farm, analyses, weather, job]);
  const pass = latestPass(farm, analyses);
  const running = job?.status === "running";
  // The badge follows the readings shown, not the current data source.
  const shown = Object.values(analyses || {}).filter(Boolean);
  const fromEarthEngine = shown.length ? shown.every((item) => item.provider === "gee") : provider?.id === "gee";

  return (
    <div className="page fo">
      <PageHeader
        title={farm.name}
        subtitle={
          <span className="fo-meta">
            {fromEarthEngine ? (
              <Badge tone="green" dot>
                Earth Engine
              </Badge>
            ) : (
              <Badge tone="amber">Sample data</Badge>
            )}
            {pass && <span>{fromEarthEngine ? `Sentinel-2 · ${formatDay(pass)}` : formatDay(pass)}</span>}
          </span>
        }
        actions={
          <Button variant="primary" icon={<MapIcon size={15} />} to="/field/fields">
            Open map
          </Button>
        }
      />

      <p className={`fo-status fo-tone-${status.tone}`} role="status">
        <span className="fo-status-dot" aria-hidden="true" />
        {status.text}
      </p>

      {running && (
        <div className="card fo-progress">
          <FieldProgress job={job} compact />
        </div>
      )}

      {/* An even number of status tiles leaves Farm area alone on a phone's
          two-a-row grid: it then shares the weather's row (is-area-pair). */}
      <div className={tiles.length % 2 === 0 ? "fo-stats is-area-pair" : "fo-stats"}>
        {tiles.map((tile) => (
          <StatTile key={tile.id} id={tile.id} label={tile.label} value={tile.value} tone={tile.tone} look={tile.look} pressed={group === tile.id} onPress={toggleGroup} />
        ))}
        <StatTile id="area" label="Farm area" value={formatArea(farmAreaHa(farm), farm.units)} />
        <WeatherTile weather={weather} error={weatherError} onRetry={actions.reloadWeather} />
      </div>

      <div className="fo-grid">
        <div className="fo-main">
          <NeedsDoing items={items} onAnalyze={actions.analyze} />
          <TellUs farm={farm} inWar={Boolean(conflict)} onSent={(report) => navigate(`/field/ai?report=${encodeURIComponent(report.id)}`)} />
        </div>

        <section className="card fo-fields" aria-labelledby="fo-fields-title">
          <div className="fo-card-head">
            <h2 id="fo-fields-title">Your fields</h2>
            <Link to="/field/fields" className="fo-head-link">
              Map <ChevronRight size={14} />
            </Link>
          </div>
          <div className="fo-map">
            <Suspense fallback={<div className="fo-map-wait" />}>
              <FieldMap
                fields={farm.fields}
                analyses={analyses}
                analysing={analysing}
                selectedId={hoveredId}
                onSelect={(id) => id && navigate(`/field/fields?field=${encodeURIComponent(id)}`)}
                height="100%"
                fitPadding={MAP_FIT_PADDING}
                interactive={false}
                showLabels={false}
                steady
                ariaLabel="Satellite map of your fields"
              />
            </Suspense>
          </div>
          <ul className={group ? "fo-field-list is-filtered" : "fo-field-list"}>
            {farm.fields.map((field) => {
              const a = analyses[field.id];
              const status = statusOf(a);
              const statusId = status?.id;
              // The field's square as it looks on the map (format.js
              // mapLook): a crop in its condition class, a harvested field
              // with stubble lines over its season's colour, fallow olive...
              const look = mapLook(a);
              // The badge already says "Fallow or grass": the crop is not
              // repeated, so the area always shows.
              const crop = statusId === "fallow" ? null : statusId === "unclear" ? "Possibly grass" : cropInfo(field, a).text;
              // A harvested field: how its season went ("Season: Good").
              const season = look.kind === "harvested" ? seasonLine(a) : null;
              return (
                <li key={field.id} className={inGroup(a) ? "is-in" : "is-out"}>
                  <Link
                    to={`/field/fields?field=${encodeURIComponent(field.id)}`}
                    className="fo-field"
                    onMouseEnter={() => setHoveredId(field.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(field.id)}
                    onBlur={() => setHoveredId(null)}
                  >
                    <LookSwatch look={a ? look : null} className="fo-swatch" title={a ? look.label : undefined} />
                    <span className="fo-field-text">
                      <span className="fo-field-name">{field.name}</span>
                      <span className="fo-field-sub">{[crop, formatArea(field.areaHa, farm.units)].filter(Boolean).join(" · ")}</span>
                      {season && <span className="fo-field-season">{season}</span>}
                    </span>
                    {a ? (
                      <Badge tone={status?.tone || undefined}>{status?.label}</Badge>
                    ) : analysing.has(field.id) ? (
                      <Badge tone="outline">{ANALYSING_LABEL}</Badge>
                    ) : (
                      <Badge>Not analysed</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

// A big number. With onPress (and a count above 0) it is a button that
// picks out its fields in the "Your fields" list. With look, the label has
// the fields' square beside it (stubble, olive dots, tan...), as on the map.
function StatTile({ id, label, value, tone, look = null, pressed = false, onPress }) {
  const className = `stat fo-stat fo-stat-${id}${tone ? ` fo-tone-${tone}` : ""}`;
  const body = (
    <>
      <span className="stat-label">
        {look && <LookSwatch look={look} className="fo-stat-swatch" />}
        {label}
      </span>
      <span className="fo-stat-value">{value}</span>
    </>
  );
  if (!onPress || !value) return <div className={className}>{body}</div>;
  return (
    <button type="button" className={`${className} fo-stat-button${pressed ? " is-pressed" : ""}`} aria-pressed={pressed} onClick={() => onPress(id)}>
      {body}
    </button>
  );
}

function WeatherTile({ weather, error, onRetry }) {
  if (!weather) {
    return (
      <div className="stat stat-dark fo-weather">
        <span className="stat-label">Weather</span>
        {error ? (
          <button type="button" className="fo-weather-retry" onClick={onRetry}>
            <RefreshCw size={13} /> No forecast · retry
          </button>
        ) : (
          <span className="fo-stat-value fo-weather-wait">–</span>
        )}
      </div>
    );
  }
  const rain = likelyRain(weather);
  const current = weather.current || {};
  return (
    <div className="stat stat-dark fo-weather">
      <span className="stat-label">Weather</span>
      <span className="fo-weather-now">
        <WeatherIcon code={current.code} />
        <span className="fo-stat-value">{Number.isFinite(current.tempC) ? `${Math.round(current.tempC)}°` : "–"}</span>
        {current.label && <span className="fo-weather-label">{current.label}</span>}
      </span>
      <span className={rain ? "fo-weather-rain is-rain" : "fo-weather-rain"}>
        {rain ? `Rain ${formatDayRange(rain.from, rain.to)}${Number.isFinite(rain.mm) ? ` · ${Math.round(rain.mm)} mm` : ""}` : "No rain coming"}
      </span>
    </div>
  );
}

// ---------- What needs doing ----------

// onAnalyze starts an update (actions.analyze); the "Try again" button
// waits for it and shows why it could not start.
function NeedsDoing({ items, onAnalyze }) {
  const [showAll, setShowAll] = useState(false);
  // error is kept with the failed update it was for (forLine), so a later
  // failure does not show an old message.
  const [retry, setRetry] = useState({ pending: false, error: null, forLine: null });
  const failed = items.find((item) => item.action.run);
  const tryAgain = async () => {
    if (retry.pending) return;
    const forLine = failed?.line ?? null;
    setRetry({ pending: true, error: null, forLine });
    try {
      await onAnalyze();
      setRetry({ pending: false, error: null, forLine: null });
    } catch (err) {
      setRetry({ pending: false, error: err?.message || String(err), forLine });
    }
  };
  const shownRetry = retry.forLine === (failed?.line ?? null) ? retry : { pending: false, error: null };
  const shown = showAll ? items : items.slice(0, ITEMS_SHOWN);
  return (
    <section className="card fo-todo" aria-labelledby="fo-todo-title">
      <div className="fo-card-head">
        <h2 id="fo-todo-title">What needs doing</h2>
        {items.length > 0 && <span className="fo-count">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <p className="fo-calm">
          <CircleCheck size={20} aria-hidden="true" /> Nothing urgent
        </p>
      ) : (
        <ul className="fo-items">
          {shown.map((item) => (
            <TodoItem key={item.id} item={item} onRun={tryAgain} retry={shownRetry} />
          ))}
        </ul>
      )}
      {items.length > ITEMS_SHOWN && (
        <button type="button" className="fo-more" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

function TodoItem({ item, onRun, retry }) {
  const Icon = ITEM_ICONS[item.icon] || TriangleAlert;
  const isRecovery = item.id === "recovery";
  const runs = Boolean(item.action.run);
  const line = runs && retry.error ? `Could not start: ${retry.error}` : item.line;
  const action = runs ? (
    <Button variant="secondary" size="sm" icon={<RefreshCw size={13} className={retry.pending ? "fo-spin" : undefined} />} onClick={onRun} disabled={retry.pending}>
      {retry.pending ? "Starting…" : item.action.label}
    </Button>
  ) : (
    <Button variant={isRecovery ? "primary" : "secondary"} size="sm" to={item.action.to}>
      {item.action.label}
      {!isRecovery && <ChevronRight size={14} />}
    </Button>
  );
  return (
    <li className={`fo-item${isRecovery ? " is-recovery" : ""}`}>
      <span className={`fo-item-icon fo-tone-${item.tone || "none"}`} aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="fo-item-text">
        <span className="fo-item-title">
          {item.title}
          {item.amount && <span className="fo-item-amount">{item.amount}</span>}
        </span>
        {item.costs && (
          <span className="fo-costs">
            {item.costs.map((cost) => (
              <span key={cost.id} className="fo-cost">
                <span className="fo-cost-label">{cost.label}</span>
                <span className="fo-cost-value">{cost.value}</span>
              </span>
            ))}
            {item.costNote && <span className="fo-cost-note">{item.costNote}</span>}
          </span>
        )}
        {line && (
          <span className={runs && retry.error ? "fo-item-line is-error" : "fo-item-line"} role={runs && retry.error ? "alert" : undefined}>
            {line}
          </span>
        )}
      </span>
      <span className="fo-item-action">{action}</span>
    </li>
  );
}

// ---------- Tell us what happened ----------

// Shelling is a choice only where a known war covers the farm.
const kindsFor = (inWar) => (inWar ? REPORT_KINDS : REPORT_KINDS.filter((item) => item.id !== "shelling"));

function TellUs({ farm, inWar, onSent }) {
  const { actions } = useFieldData();
  const [fieldId, setFieldId] = useState("");
  const [kind, setKind] = useState(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // [{ id, file, url }]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Free the photo previews when the page closes.
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const addPhotos = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const images = files.filter((file) => PHOTO_TYPES.includes(file.type));
    const room = MAX_PHOTOS - photos.length;
    const taken = images.slice(0, Math.max(0, room));
    if (images.length < files.length) setError("Only JPEG, PNG or WebP photos.");
    else if (images.length > room) setError(`Up to ${MAX_PHOTOS} photos.`);
    else setError(null);
    if (taken.length) {
      setPhotos((prev) => [...prev, ...taken.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, url: URL.createObjectURL(file) }))]);
    }
  };

  const removePhoto = (id) => {
    setPhotos((prev) => {
      const gone = prev.find((photo) => photo.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((photo) => photo.id !== id);
    });
    setError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!kind) return setError("Choose what happened.");
    if (!text.trim() && photos.length === 0) return setError("Add a few words or a photo.");
    setSending(true);
    setError(null);
    try {
      const report = await actions.report({ fieldId: fieldId || null, kind, text: text.trim(), files: photos.map((photo) => photo.file) });
      onSent(report);
    } catch (err) {
      setError(err.message || String(err));
      setSending(false);
    }
  };

  return (
    <section className="card fo-tell" aria-labelledby="fo-tell-title">
      <form className="fo-tell-form" onSubmit={submit} noValidate>
        <div className="fo-card-head">
          <h2 id="fo-tell-title">Tell us what happened</h2>
          <select className="select fo-tell-field" value={fieldId} onChange={(event) => setFieldId(event.target.value)} aria-label="Which field">
            <option value="">Whole farm</option>
            {farm.fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </div>

        <div className="fo-kinds" role="group" aria-label="What happened">
          {kindsFor(inWar).map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === kind ? "fo-kind is-active" : "fo-kind"}
              aria-pressed={item.id === kind}
              onClick={() => {
                setKind(item.id === kind ? null : item.id);
                setError(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <textarea
          className="textarea fo-tell-text"
          placeholder="What did you see, and when?"
          aria-label="What happened"
          value={text}
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
          rows={3}
        />

        {photos.length > 0 && (
          <ul className="fo-photos" aria-label="Photos">
            {photos.map((photo) => (
              <li key={photo.id} className="fo-photo">
                <img src={photo.url} alt={photo.file.name} />
                <button type="button" className="fo-photo-remove" onClick={() => removePhoto(photo.id)} aria-label={`Remove ${photo.file.name}`}>
                  <X size={12} strokeWidth={3} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="fo-tell-foot">
          <input
            ref={fileRef}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            multiple
            hidden
            onChange={(event) => {
              addPhotos(event.target.files);
              event.target.value = "";
            }}
          />
          <Button variant="secondary" icon={<Camera size={14} />} onClick={() => fileRef.current?.click()} disabled={photos.length >= MAX_PHOTOS || sending}>
            {photos.length ? `Photos ${photos.length}/${MAX_PHOTOS}` : "Add photos"}
          </Button>
          {error && (
            <span className="fo-tell-error" role="alert">
              {error}
            </span>
          )}
          <Button variant="primary" type="submit" className="fo-send" disabled={sending}>
            {sending ? "Sending…" : "Send"}
            {!sending && <Send size={14} />}
          </Button>
        </div>
      </form>
    </section>
  );
}
