// WHAT THIS FILE DOES
// The Field Settings page (/field/settings). Four cards, nothing else:
//   Farm   the farm's name (click to rename), its place, how many fields and
//          how big; a map of the fields; "Change farm" (the farm setup:
//          search, coordinates or draw, then pick the fields found);
//          "Add a field" (draw it on the satellite map); "Find fields
//          again" (detect the fields on the same land and pick again;
//          saving says how many fields it replaces); and the list of
//          fields: select (shows it on the map), rename, crop, area, remove.
//   Units  hectares, acres or 亩.
//   Data   Earth Engine status and the .env lines that connect it,
//          "Update now" and the "Update automatically" switch.
//   AI     Claude status (the key is tested when the server can) and the
//          .env line that connects it.
// Everything is saved on the server (server/field/routes.js) straight away.
//
// WHO EDITS IT
// Whoever changes the Field Settings page. The shared data and actions come
// from src/state/FieldData.jsx; the farm setup is
// src/components/field/FarmSetup.jsx; the map is
// src/components/field/FieldMap.jsx; the overlap and naming sums are
// src/lib/field/geometry.js.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MapPin,
  PenLine,
  Plus,
  RefreshCw,
  Satellite,
  ScanSearch,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { PageHeader, Card, Badge, Button, Segmented, Toggle } from "../../components/ui/index.js";
import { FarmGate, FieldProgress, useFieldData } from "../../state/FieldData.jsx";
import { API_ROOT, getStatus } from "../../api/atlasApi.js";
import { checkPolygon, pointsToGeometry } from "../../lib/atlas/coords.js";
import { STATUS_GROUPS, UNITS } from "../../lib/field/method.js";
import { candidateTotals, farmAreaHa, formatArea, formatDay, unitShort } from "../../lib/field/format.js";
import { compareNames, matchFields, overlappingFields, planFieldsToSave, redetectBody } from "../../lib/field/geometry.js";
import "./SettingsPage.css";

// The map (and the map library) and the farm setup load only when needed.
const FieldMap = lazy(() => import("../../components/field/FieldMap.jsx"));
const FarmSetup = lazy(() => import("../../components/field/FarmSetup.jsx"));

const CROPS = ["Winter wheat", "Spring wheat", "Barley", "Corn", "Sunflower", "Soybean", "Rapeseed", "Other"];
const UNIT_OPTIONS = Object.entries(UNITS).map(([value, unit]) => ({ value, label: unit.label }));

// Where people make a Claude API key.
const CLAUDE_KEYS_URL = "https://platform.claude.com/settings/keys";

// Field size limits (the same as server/field/routes.js LIMITS.fieldHa).
const FIELD_MIN_HA = 0.1;
const FIELD_MAX_HA = 5000;

// While Earth Engine is signing in, look again this often.
const CONNECTING_POLL_MS = 4000;
const CONNECTING_MAX_POLLS = 45;

const errorText = (err) => err?.message || String(err);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// "Field 4", "Field 4 and Field 7", "Field 2, Field 4 and Field 7".
const nameList = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

// ---------- Small pieces ----------

// A few lines to paste into .env, with a Copy button.
function EnvLines({ lines, hint }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. not https): the text can still be selected.
    }
  };
  return (
    <div className="fset-setup">
      <div className="fset-env">
        <div className="fset-env-head">
          <span>.env</span>
          <button type="button" className="fset-env-copy" onClick={copy}>
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <pre className="fset-env-code">{text}</pre>
      </div>
      {hint && <span className="fset-hint">{hint}</span>}
    </div>
  );
}

// One quiet line, with the .env lines folded away behind "Show how".
function ShowHow({ text, lines, hint }) {
  return (
    <details className="fset-how">
      <summary>
        <span className="fset-how-text">{text}</span>
        <span className="fset-how-toggle">Show how</span>
      </summary>
      <EnvLines lines={lines} hint={hint} />
    </details>
  );
}

// One line of a card: icon, title + badge, one short line, an action.
function StatusRow({ icon, title, badge, meta, action }) {
  return (
    <div className="fset-row">
      <span className="fset-row-icon">{icon}</span>
      <div className="fset-row-text">
        <span className="fset-row-title">
          {title}
          {badge}
        </span>
        {meta && <span className="fset-row-meta">{meta}</span>}
      </div>
      {action && <div className="fset-row-action">{action}</div>}
    </div>
  );
}

// A bin button that asks first: Remove / Keep.
function RemoveButton({ label, onRemove, onError, disabled }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const binRef = useRef(null);
  const removeRef = useRef(null);
  const focusBin = useRef(false);

  useEffect(() => {
    if (confirming) removeRef.current?.focus();
    else if (focusBin.current) {
      focusBin.current = false;
      binRef.current?.focus();
    }
  }, [confirming]);

  const keep = () => {
    focusBin.current = true;
    setConfirming(false);
  };

  const remove = async () => {
    setBusy(true);
    onError?.(null);
    try {
      await onRemove();
    } catch (err) {
      onError?.(errorText(err));
      setBusy(false);
      keep();
    }
  };

  if (confirming) {
    return (
      <div className="fset-confirm" onKeyDown={(event) => event.key === "Escape" && keep()}>
        <Button ref={removeRef} variant="danger" size="sm" disabled={busy} onClick={remove}>
          {busy ? "Removing…" : "Remove"}
        </Button>
        <Button variant="ghost" size="sm" icon={<X size={14} />} aria-label="Keep" disabled={busy} onClick={keep} />
      </div>
    );
  }
  return (
    <Button
      ref={binRef}
      variant="ghost"
      size="sm"
      className="fset-remove"
      icon={<Trash2 size={15} />}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        onError?.(null);
        setConfirming(true);
      }}
    />
  );
}

// A name that renames when clicked. Enter or leaving the box saves, Escape
// cancels. onSave(name) saves it (throw to show an error).
function InlineName({ value, label, className = "", maxLength = 60, onSave, onError }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef(null);
  const inputRef = useRef(null);
  const focusButton = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
    else if (focusButton.current) {
      focusButton.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const stop = () => {
    saving.current = true;
    focusButton.current = true;
    setEditing(false);
  };

  const save = async () => {
    if (saving.current) return;
    const name = text.replace(/\s+/g, " ").trim();
    if (!name || name === value) {
      setText(value);
      stop();
      return;
    }
    saving.current = true;
    setBusy(true);
    onError?.(null);
    try {
      await onSave(name);
      stop();
    } catch (err) {
      onError?.(errorText(err));
      saving.current = false;
      setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`input fset-rename ${className}`}
        aria-label={`New name for ${value}`}
        maxLength={maxLength}
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          } else if (event.key === "Escape") {
            setText(value);
            onError?.(null);
            stop();
          }
        }}
      />
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`fset-name ${className}`}
      title="Rename"
      aria-label={`${label || value}. Rename`}
      onClick={() => {
        saving.current = false;
        setText(value);
        setEditing(true);
      }}
    >
      <span className="fset-name-text">{value}</span>
      <PenLine size={14} className="fset-name-pen" aria-hidden="true" />
    </button>
  );
}

// ---------- Farm: one field in the list ----------

// What the list shows next to a field's name, matching the map: the
// red "Needs recovery" tint and pill, or a "Watch" badge.
function statusMark(analysis) {
  const id = analysis?.status?.id;
  if (STATUS_GROUPS.recovery.includes(id)) return { swatch: "is-recovery", badge: { tone: "red", label: "Recovery" } };
  if (id === "watch") return { swatch: null, badge: { tone: "amber", label: "Watch" } };
  return { swatch: null, badge: null };
}

function FieldRow({ field, analysis, units, selected, onSelect, busy }) {
  const { actions } = useFieldData();
  const [error, setError] = useState(null);
  const [savingCrop, setSavingCrop] = useState(false);
  const conditionClass = analysis?.condition?.class || "nodata";
  const mark = statusMark(analysis);
  const select = () => onSelect(selected ? null : field.id);
  const crops = field.crop && !CROPS.includes(field.crop) ? [field.crop, ...CROPS] : CROPS;

  const setCrop = async (crop) => {
    setSavingCrop(true);
    setError(null);
    try {
      await actions.updateField(field.id, { crop: crop || null });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSavingCrop(false);
    }
  };

  return (
    <li
      className={selected ? "fset-field is-selected" : "fset-field"}
      data-field={field.id}
      onClick={(event) => {
        // A click anywhere on the row but its controls shows the field on the map.
        if (!event.target.closest("button, select, input, a, .fset-confirm")) select();
      }}
    >
      <button
        type="button"
        className="fset-field-show"
        aria-pressed={selected}
        aria-label={`Show ${field.name} on the map`}
        title="Show on the map"
        onClick={select}
      >
        <span className={`fset-field-swatch is-${conditionClass} ${mark.swatch || ""}`} aria-hidden="true" />
      </button>
      <span className="fset-field-id">
        <InlineName
          value={field.name}
          className="fset-field-name"
          onError={setError}
          onSave={(name) => actions.updateField(field.id, { name })}
        />
        {mark.badge && <Badge tone={mark.badge.tone}>{mark.badge.label}</Badge>}
      </span>
      <select
        className="select fset-crop"
        aria-label={`Crop on ${field.name}`}
        value={field.crop || ""}
        disabled={savingCrop || busy}
        onChange={(event) => setCrop(event.target.value)}
      >
        <option value="">No crop</option>
        {crops.map((crop) => (
          <option key={crop} value={crop}>
            {crop}
          </option>
        ))}
      </select>
      <span className="fset-field-area">{formatArea(field.areaHa, units)}</span>
      <RemoveButton label={`Remove ${field.name}`} disabled={busy} onError={setError} onRemove={() => actions.removeField(field.id)} />
      {error && (
        <p className="fset-error fset-field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

// ---------- Farm ----------

function FarmCard({ onChangeFarm }) {
  const { farm, analyses, job, provider, actions } = useFieldData();
  const [mode, setMode] = useState("view"); // view | draw | find
  const [selectedId, setSelectedId] = useState(null);
  const [nameError, setNameError] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null); // null | "add" | "find" | "save"
  const [drawn, setDrawn] = useState([]);
  const [found, setFound] = useState(null); // detection result + the body sent
  const [chosen, setChosen] = useState([]);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const units = farm.units || "ha";
  const fields = farm.fields;
  const analysing = job?.status === "running";
  const sortedFields = useMemo(() => [...fields].sort((a, b) => compareNames(a.name, b.name)), [fields]);
  const drawnCheck = useMemo(() => checkPolygon(drawn), [drawn]);
  // A drawn field must not cover the farm's other fields (it may touch an edge).
  const drawnOverlaps = useMemo(
    () => (drawnCheck.ok ? overlappingFields(pointsToGeometry(drawn).geometry, fields) : []),
    [drawnCheck.ok, drawn, fields]
  );
  const drawnSizeOk = drawnCheck.ok && drawnCheck.areaHa >= FIELD_MIN_HA && drawnCheck.areaHa <= FIELD_MAX_HA;
  const drawnOk = drawnSizeOk && !drawnOverlaps.length;
  const drawnHint = !drawn.length
    ? "Click the corners of the field."
    : !drawnCheck.ok
      ? drawnCheck.message
      : drawnCheck.areaHa < FIELD_MIN_HA
        ? "Too small."
        : drawnCheck.areaHa > FIELD_MAX_HA
          ? "Too large. A field can be up to 5,000 ha."
          : drawnOverlaps.length
            ? `Overlaps ${drawnOverlaps.length > 3 ? plural(drawnOverlaps.length, "field") : nameList(drawnOverlaps.map((o) => o.field.name))}. Move the corners off ${drawnOverlaps.length > 1 ? "them" : "it"}.`
            : null;

  const close = () => {
    abortRef.current?.abort();
    setMode("view");
    setDrawn([]);
    setFound(null);
    setChosen([]);
    setError(null);
    setBusy(null);
  };

  const startDraw = () => {
    close();
    setNotice(null);
    setMode("draw");
  };

  const addDrawn = async () => {
    if (!drawnOk || busy) return;
    setBusy("add");
    setError(null);
    try {
      const { field } = await actions.addField({ geometry: pointsToGeometry(drawn).geometry, source: "drawn" });
      if (!mounted.current) return;
      close();
      setSelectedId(field.id);
      setNotice(`${field.name} added`);
    } catch (err) {
      if (!mounted.current) return;
      setError(errorText(err));
      setBusy(null);
    }
  };

  const findAgain = async () => {
    const body = redetectBody(farm);
    if (!body || busy) return;
    close();
    setNotice(null);
    setMode("find");
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("find");
    setProgress(0);
    try {
      const result = await actions.detect(body, {
        signal: controller.signal,
        onProgress: (detectJob) => setProgress(Math.min(1, (detectJob.done || 0) / (detectJob.total || 100))),
      });
      if (!mounted.current || controller.signal.aborted) return;
      const candidates = result.candidates || [];
      setFound({ ...result, body });
      // Inside the farm's land every field is chosen; around its place, only
      // the ones that are mostly one of the farm's current fields.
      const matches = matchFields(candidates, fields);
      setChosen(body.source === "boundary" ? candidates.map((c) => c.id) : candidates.filter((c) => matches.has(c.id)).map((c) => c.id));
      setBusy(null);
    } catch (err) {
      if (!mounted.current || err?.name === "AbortError") return;
      setError(errorText(err));
      setBusy(null);
    }
  };

  const saveFound = async () => {
    const list = (found?.candidates || []).filter((c) => chosen.includes(c.id));
    if (!list.length || busy) return;
    setBusy("save");
    setError(null);
    // A found field that is mostly a current field keeps its name and crop;
    // the others are numbered north-west first. The farm keeps its name.
    const request = {
      name: farm.name,
      location: farm.location || null,
      boundary: found.boundary || farm.boundary || null,
      fields: planFieldsToSave(list, fields).fields,
    };
    try {
      await actions.saveFarm(request);
      if (!mounted.current) return;
      close();
      setSelectedId(null);
      setNotice(`${plural(list.length, "field")} saved`);
    } catch (err) {
      if (!mounted.current) return;
      setError(errorText(err));
      setBusy(null);
    }
  };

  const toggle = (id) => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const candidates = found?.candidates || [];
  const totals = candidateTotals(candidates, chosen);
  const canFind = Boolean(redetectBody(farm));
  // How many of the chosen fields are mostly a current field (they keep its name).
  const keptNames = useMemo(
    () => (found ? matchFields(candidates.filter((c) => chosen.includes(c.id)), fields).size : 0),
    [found, candidates, chosen, fields]
  );
  const replaceLine = `Saving replaces your ${plural(fields.length, "field")}${keptNames ? `; ${keptNames} keep${keptNames === 1 ? "s its name" : " their names"}` : ""}.`;

  // The satellite map: the farm's fields, the field being drawn, or the
  // fields found to pick from.
  let mapProps;
  if (mode === "draw") {
    mapProps = {
      fields,
      analyses,
      // No name pills while drawing, so they never catch a click meant for a corner.
      showLabels: false,
      drawMode: true,
      drawPoints: drawn,
      onDrawPoint: (point) => setDrawn((prev) => [...prev, point]),
      fitKey: "draw",
      ariaLabel: "Draw the field: click to add corners",
    };
  } else if (mode === "find") {
    const body = found?.body;
    mapProps = {
      fields: candidates.length ? [] : fields,
      candidates,
      selectedCandidateIds: chosen,
      onToggleCandidate: toggle,
      boundary: found?.boundary || (body?.source === "boundary" ? body.points : null),
      pin: body?.source === "point" ? [body.lat, body.lon] : null,
      pinRadiusM: body?.source === "point" ? body.radiusM : undefined,
      showLabels: false,
      fitKey: `find-${candidates.length}`,
      ariaLabel: "Fields found: click a field to add or remove it",
    };
  } else {
    mapProps = {
      fields,
      analyses,
      selectedId,
      onSelect: setSelectedId,
      fitKey: `view-${fields.length}`,
      ariaLabel: "Your fields",
    };
  }

  const sample = (found?.provider?.id || provider?.id) === "sample";

  return (
    <Card className="fset-card fset-farm" title="Farm">
      <div className="fset-farm-head">
        <div className="fset-farm-id">
          <InlineName
            value={farm.name}
            label={`Farm name ${farm.name}`}
            className="fset-farm-name"
            maxLength={80}
            onError={setNameError}
            onSave={(name) => actions.updateFarm({ name })}
          />
          {farm.location?.label && (
            <span className="fset-farm-place">
              <MapPin size={14} aria-hidden="true" />
              {farm.location.label}
            </span>
          )}
        </div>
        <Button variant="primary" onClick={onChangeFarm} disabled={Boolean(busy)} className="fset-change">
          Change farm
        </Button>
      </div>
      {nameError && (
        <p className="fset-error" role="alert">
          {nameError}
        </p>
      )}

      <div className="fset-big">
        <div className="fset-big-item">
          <span className="fset-big-value">{fields.length}</span>
          <span className="fset-big-label">{fields.length === 1 ? "field" : "fields"}</span>
        </div>
        <div className="fset-big-item">
          <span className="fset-big-value">{formatArea(farmAreaHa(farm), units).replace(/ .*$/, "")}</span>
          <span className="fset-big-label">{unitShort(units)}</span>
        </div>
      </div>

      {analysing && <FieldProgress job={job} compact />}

      {/* Drawing: the bar above the map. */}
      {mode === "draw" && (
        <div className="fset-panel" data-mode="draw">
          <div className="fset-panel-text">
            <span className="fset-panel-title">{drawnSizeOk ? formatArea(drawnCheck.areaHa, units) : "Draw the field"}</span>
            {drawnHint && (
              <span className={drawnOverlaps.length ? "fset-panel-meta is-problem" : "fset-panel-meta"} role={drawnOverlaps.length ? "alert" : undefined}>
                {drawnHint}
              </span>
            )}
          </div>
          <div className="fset-panel-actions">
            <Button size="sm" icon={<Undo2 size={13} />} onClick={() => setDrawn((prev) => prev.slice(0, -1))} disabled={!drawn.length || Boolean(busy)}>
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={close} disabled={busy === "add"}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={addDrawn} disabled={!drawnOk || Boolean(busy)}>
              {busy === "add" ? "Adding…" : "Add field"}
            </Button>
          </div>
        </div>
      )}

      {/* Finding the fields again: progress, then the fields found. */}
      {mode === "find" && (
        <div className="fset-panel" data-mode="find">
          {busy === "find" ? (
            <div className="fset-finding" role="status" aria-live="polite">
              <div className="fset-finding-head">
                <span>Finding your fields…</span>
                <span className="mono">{Math.round(progress * 100)}%</span>
              </div>
              <div className="fd-progress-track">
                <div className="fd-progress-fill" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
            </div>
          ) : (
            <>
              <div className="fset-panel-text">
                <span className="fset-panel-title">
                  {!found
                    ? "Find fields again"
                    : !candidates.length
                      ? "No fields found"
                      : totals.count
                        ? `${plural(totals.count, "field")} · ${formatArea(totals.areaHa, units)}`
                        : "Tap your fields"}
                </span>
                {found && <span className="fset-panel-meta">{candidates.length ? "Tap a field to add or remove it." : "Try drawing the field instead."}</span>}
                {found && candidates.length > 0 && totals.count > 0 && <span className="fset-panel-meta is-replace">{replaceLine}</span>}
              </div>
              <div className="fset-panel-actions">
                {candidates.length > 0 && (
                  <Button size="sm" onClick={() => setChosen(candidates.map((c) => c.id))} disabled={chosen.length === candidates.length || Boolean(busy)}>
                    Select all
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={close} disabled={busy === "save"}>
                  Cancel
                </Button>
                {candidates.length > 0 && (
                  <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={saveFound} disabled={!totals.count || Boolean(busy)}>
                    {busy === "save" ? "Saving…" : totals.count ? `Replace with ${plural(totals.count, "field")}` : "Save"}
                  </Button>
                )}
              </div>
            </>
          )}
          {(found?.warnings || []).filter((w) => candidates.length || !/^No fields found/i.test(w)).map((warning) => (
            <p key={warning} className="fset-warning">
              {warning}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p className="fset-error" role="alert">
          {error}
        </p>
      )}

      <div className="fset-map">
        <Suspense fallback={<div className="fset-map-wait" />}>
          <FieldMap height="var(--fset-map-h)" {...mapProps}>
            {mode === "find" && sample && <span className="fm-chip fm-chip-light fset-sample">Sample data</span>}
          </FieldMap>
        </Suspense>
      </div>

      {mode === "view" && (
        <div className="fset-farm-actions">
          <Button icon={<Plus size={15} />} onClick={startDraw} disabled={Boolean(busy)}>
            Add a field
          </Button>
          <Button icon={<ScanSearch size={15} />} onClick={findAgain} disabled={!canFind || Boolean(busy) || analysing}>
            Find fields again
          </Button>
          {notice && (
            <span className="fset-ok" role="status">
              <Check size={14} /> {notice}
            </span>
          )}
        </div>
      )}

      <ul className="fset-fields" aria-label="Fields">
        {sortedFields.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            analysis={analyses[field.id]}
            units={units}
            selected={field.id === selectedId}
            onSelect={setSelectedId}
            busy={busy === "save"}
          />
        ))}
      </ul>
    </Card>
  );
}

// ---------- Units ----------

function UnitsCard() {
  const { farm, actions } = useFieldData();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const change = async (units) => {
    if (units === farm.units || busy) return;
    setBusy(true);
    setError(null);
    try {
      await actions.updateFarm({ units });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      className="fset-card fset-units"
      title="Units"
      actions={<Segmented light options={UNIT_OPTIONS} value={farm.units || "ha"} onChange={change} ariaLabel="Area units" />}
    >
      {error && (
        <p className="fset-error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

// ---------- Data ----------

// "Connected", "Sample data", "Turned off", "Not connected", "Connecting…".
function earthEngineState(provider) {
  if (!provider) return { tone: "outline", label: "Checking…" };
  if (provider.connecting) return { tone: "blue", label: "Connecting…" };
  if (provider.id === "gee" && provider.ok) return { tone: "green", label: "Connected" };
  if (provider.fallbackFrom || provider.credentialsError) return { tone: "red", label: "Not connected" };
  if (provider.configured) return { tone: "outline", label: "Turned off" };
  return { tone: "amber", label: "Sample data" };
}

// One plain line, and the .env lines that would connect Earth Engine
// (shown behind "Show how").
function geeSetup(provider) {
  if (!provider || provider.id === "gee" || provider.connecting) return null;
  const missing = provider.missing || [];
  const lines = [];
  if (missing.includes("GEE_PROJECT_ID")) lines.push("GEE_PROJECT_ID=your-cloud-project-id");
  if (missing.some((item) => item.includes("GOOGLE_APPLICATION_CREDENTIALS") || item.includes("GEE_SERVICE_ACCOUNT_JSON"))) {
    lines.push("GOOGLE_APPLICATION_CREDENTIALS=./service-account.json");
  }
  if (lines.length) return { text: "Using sample data. Connect Earth Engine for real satellite data.", lines, hint: "Then run npm run gee:check and restart." };
  // Key and project are there, but GEE_DISABLED=1 keeps the sample data on.
  if (provider.configured && !provider.fallbackFrom && !provider.credentialsError) {
    return { text: "Using sample data. Earth Engine is ready to turn on.", lines: ["GEE_DISABLED=0"], hint: "Then restart." };
  }
  return null;
}

// While Earth Engine is signing in, reload every few seconds until it has
// finished (connected or not).
function useWhileConnecting(connecting, reload) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!connecting) return undefined;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      reloadRef.current();
      if (polls >= CONNECTING_MAX_POLLS) clearInterval(timer);
    }, CONNECTING_POLL_MS);
    return () => clearInterval(timer);
  }, [connecting]);
}

// "2 min ago", "3 h ago", "Oct 16".
function ago(iso) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDay(new Date(at).toISOString());
}

function DataCard() {
  const { farm, analyses, provider, job, actions } = useFieldData();
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }
  const [toggleError, setToggleError] = useState(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useWhileConnecting(Boolean(provider?.connecting), actions.reload);

  const ee = earthEngineState(provider);
  const setup = geeSetup(provider);
  const problem = provider?.credentialsError || (provider?.fallbackFrom ? provider.detail : null);
  const running = job?.status === "running";

  const list = farm.fields.map((field) => analyses[field.id]).filter(Boolean);
  const latestPass = list.map((a) => a.latestPass?.date).filter(Boolean).sort().pop() || null;
  const updatedAt = list.map((a) => a.updatedAt).filter(Boolean).sort().pop() || null;
  const sources = new Set(list.map((a) => a.provider));
  const source = sources.has("sample") ? "Sample data" : sources.has("gee") ? "Sentinel-2" : null;
  const needsRealData = provider?.id === "gee" && provider.ok && sources.has("sample");

  const update = async () => {
    setStarting(true);
    setResult(null);
    try {
      const { finished } = await actions.analyze();
      if (mounted.current) setStarting(false);
      const final = await finished;
      if (!mounted.current) return;
      setResult(
        final?.status === "done"
          ? { ok: true, text: `Updated · ${plural(final.total || farm.fields.length, "field")}` }
          : { ok: false, text: final?.error || "The update stopped." }
      );
    } catch (err) {
      if (!mounted.current) return;
      setStarting(false);
      setResult({ ok: false, text: errorText(err) });
    }
  };

  const setAuto = async (value) => {
    setToggleError(null);
    try {
      await actions.updateFarm({ autoUpdate: value });
    } catch (err) {
      setToggleError(errorText(err));
    }
  };

  const latestTitle = latestPass ? formatDay(latestPass) : "No clear image yet";
  const latestMeta = [source, updatedAt ? `Updated ${ago(updatedAt)}` : null].filter(Boolean).join(" · ");

  return (
    <Card className="fset-card" title="Data">
      <div className="fset-block">
        <StatusRow
          icon={<Satellite size={16} />}
          title="Google Earth Engine"
          badge={
            <Badge tone={ee.tone} dot>
              {ee.label}
            </Badge>
          }
          meta={provider?.id === "gee" && provider.ok ? provider.detail : null}
        />
        {problem && <p className="fset-error">{problem}</p>}
        {setup && <ShowHow text={setup.text} lines={setup.lines} hint={setup.hint} />}
      </div>

      <div className="fset-block">
        <div className="fset-latest">
          <div className="fset-latest-text">
            <span className="fset-latest-label">Latest image</span>
            <span className="fset-latest-value">{latestTitle}</span>
            {latestMeta && <span className="fset-row-meta">{latestMeta}</span>}
          </div>
          <Button
            variant={needsRealData ? "primary" : "secondary"}
            icon={<RefreshCw size={14} className={running ? "fd-spin" : undefined} />}
            onClick={update}
            disabled={starting || running}
            className="fset-update"
          >
            {running ? "Updating…" : starting ? "Starting…" : "Update now"}
          </Button>
        </div>
        {running && <FieldProgress job={job} compact />}
        {!running && result && (
          <p className={result.ok ? "fset-ok" : "fset-error"} role="status">
            {result.ok && <Check size={14} />}
            {result.text}
          </p>
        )}
      </div>

      <div className="fset-block fset-auto">
        <Toggle title="Update automatically" checked={farm.autoUpdate !== false} onChange={setAuto} />
        {toggleError && <p className="fset-error">{toggleError}</p>}
      </div>
    </Card>
  );
}

// ---------- AI ----------

// Asks the server for the AI status and to test the Claude key (one cheap
// call, no tokens). A server that cannot test keys leaves "ok" out.
async function checkAi() {
  try {
    const response = await fetch(`${API_ROOT}/status?check=1`, { cache: "no-store", credentials: "same-origin" });
    if (response.ok) return (await response.json())?.ai || null;
  } catch {
    // Fall back to the plain status below.
  }
  return (await getStatus())?.ai || null;
}

// ai: { configured, model, ok?: true | false | null, error? }. "Connected"
// only once the key has really worked; a key that has not been tested is
// just "Key added".
function claudeState(ai) {
  if (ai === undefined) return { tone: "outline", label: "Checking…", usable: false };
  if (!ai?.configured) return { tone: "amber", label: "Not connected", usable: false };
  if (ai.ok === true) return { tone: "green", label: "Connected", usable: true };
  if (ai.ok === false) return { tone: "red", label: "Key rejected", usable: false };
  if (ai.error) return { tone: "amber", label: "Not reachable", usable: true };
  return { tone: "outline", label: "Key added", usable: true };
}

function AiCard() {
  const [ai, setAi] = useState(undefined); // undefined while loading, null when the server could not say
  const [error, setError] = useState(null);

  useEffect(() => {
    let stopped = false;
    checkAi()
      .then((status) => !stopped && setAi(status))
      .catch((err) => {
        if (stopped) return;
        setAi(null);
        setError(errorText(err));
      });
    return () => {
      stopped = true;
    };
  }, []);

  const state = claudeState(ai);
  const rejected = ai?.ok === false;
  const problem = error || ai?.error || null;

  return (
    <Card className="fset-card" title="AI">
      <div className="fset-block">
        <StatusRow
          icon={<Sparkles size={16} />}
          title="Claude"
          badge={
            <Badge tone={state.tone} dot>
              {state.label}
            </Badge>
          }
          meta={ai?.model ? <code>{ai.model}</code> : null}
          action={
            ai === undefined ? null : state.usable ? (
              <Button size="sm" to="/field/ai">
                Open AI
              </Button>
            ) : (
              <a className="btn btn-secondary btn-sm" href={CLAUDE_KEYS_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} aria-hidden="true" />
                Get a key
              </a>
            )
          }
        />
        {problem && (
          <p className="fset-error" role="alert">
            {problem}
          </p>
        )}
        {ai !== undefined && (!ai?.configured || rejected) && !error && (
          <EnvLines lines={["ANTHROPIC_API_KEY=sk-ant-your-key"]} hint="Then restart." />
        )}
      </div>
    </Card>
  );
}

// ---------- The page ----------

export default function SettingsPage() {
  const { status, farm } = useFieldData();
  const [changing, setChanging] = useState(false);

  // Loading, "could not load" and "no farm yet" look the same as on every
  // Field page. (A farm that is still being analysed is fine here.)
  if (status !== "ready" || !farm?.fields?.length) return <FarmGate>{null}</FarmGate>;

  if (changing) {
    return (
      <div className="page-full fs-page fset-changing">
        <Suspense fallback={null}>
          <FarmSetup title="Change farm" showDemo={!farm.demo} onDone={() => setChanging(false)} onCancel={() => setChanging(false)} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="page fset">
      <PageHeader title="Settings" />
      <FarmCard onChangeFarm={() => setChanging(true)} />
      <UnitsCard />
      <DataCard />
      <AiCard />
    </div>
  );
}
