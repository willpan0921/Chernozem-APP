// WHAT THIS FILE DOES
// The Atlas Settings page (/atlas/settings). Five cards:
//   Area   the area being analyzed, "New area" (country, GPS coordinates
//          or a drawn shape) and the saved areas: open, rename, remove,
//          with "Analyzing…" or "Waiting" while one is in the line of
//          analyses (asked again every few seconds)
//   War    whether the current area is at war, and from which day damage
//          is counted: the app's list (src/config/conflicts.js), "At war"
//          from a day the team picks, or "Not at war" (saved as area.war).
//          When saved months were made with another setting, one line
//          offers the re-run that applies it (never started by itself)
//   Data   Earth Engine status and the .env lines that connect it,
//          "Re-run analysis" and the switch that analyzes every saved
//          area automatically each month. Under the latest month, when it
//          is in a war where no fire looked like fighting, the run's own
//          line saying safe access is not measured there, and how an ACLED
//          file would measure it (overview.js noFightingNote; "Connect one"
//          only when none is connected: acledFileState)
//   AI     Claude status (the key is tested by "Check connections") and
//          the .env line that connects it
//   Team   who has access: add, change role, remove
// Everything is saved on the Atlas server (server/app.js) straight away.
//
// WHO EDITS IT
// Whoever changes the Atlas Settings page. The shared data and actions
// come from src/state/AtlasData.jsx; the area chooser is
// src/components/atlas/AreaPicker.jsx.

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  MapPin,
  PenLine,
  Plus,
  RefreshCw,
  Satellite,
  ShieldAlert,
  Sparkles,
  SquareDashed,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader, Card, Badge, Button, Segmented, Toggle } from "../../components/ui/index.js";
import { AnalysisNotice, AnalysisProgress, AtlasGate, useAtlasData } from "../../state/AtlasData.jsx";
import AreaPicker from "../../components/atlas/AreaPicker.jsx";
import { API_ROOT, ApiError, AUTH_REQUIRED_EVENT, listJobs } from "../../api/atlasApi.js";
import { lineMarks } from "../../lib/atlas/analysisNotice.js";
import { formatAreaSize, formatMonthYear } from "../../lib/format.js";
import { EARLIEST_WAR_DAY, WAR_NAME_MAX, checkAreaWar, crisisFormFor } from "../../config/conflicts.js";
import { DISASTER_LABELS, DISASTER_TYPES, isDisaster } from "../../lib/atlas/method.js";
import { acledFileState, analysisMonths, areaWar, conflictOf, keepsMonth, monthsWithOtherWar, noFightingNote, warDay, warKey, warPartOf, warText } from "../../lib/atlas/overview.js";
import "./SettingsPage.css";

// Where people make a Claude API key.
const CLAUDE_KEYS_URL = "https://platform.claude.com/settings/keys";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "analyst", label: "Analyst" },
  { value: "viewer", label: "Viewer" },
];

// How each kind of saved area is labelled, with its icon.
const AREA_KINDS = {
  country: { label: "Country", Icon: Globe2 },
  admin1: { label: "Region", Icon: Globe2 },
  coordinates: { label: "Coordinates", Icon: MapPin },
  bbox: { label: "Box", Icon: SquareDashed },
  draw: { label: "Drawn", Icon: PenLine },
};
const areaKind = (area) => AREA_KINDS[area?.source] || AREA_KINDS[area?.kind] || AREA_KINDS.coordinates;

// How many months "Re-run analysis" recomputes (at least 12, at most 24:
// MAX_RERUN_MONTHS, as server/jobs.js allows).
const MAX_RERUN_MONTHS = 24;
const rerunMonths = (runCount) => Math.min(MAX_RERUN_MONTHS, Math.max(12, runCount));

// Re-running these takes a while (and uses Earth Engine quota), so the
// button asks first: anything on Earth Engine, or bigger than 100,000 km².
const BIG_AREA_HA = 10000000;

// While Earth Engine is signing in, ask the server again this often.
const CONNECTING_POLL_MS = 4000;
const CONNECTING_MAX_POLLS = 45; // about 3 minutes

const errorText = (err) => err?.message || String(err);

// The few server calls this page makes that the shared data layer does not
// (rename / remove an area, test the connections). Same error format.
async function send(method, path, body) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Could not reach the Atlas server. Check that it is running (npm run dev) and try again.", { code: "offline" });
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    // Not JSON.
  }
  if (!response.ok) {
    // Signed out (access code on): bring the access screen back.
    if (response.status === 401 && json?.error?.code === "auth_required") window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    throw new ApiError(json?.error?.message || `The server answered with error ${response.status}.`, {
      code: json?.error?.code,
      status: response.status,
    });
  }
  return json;
}

const renameArea = (id, name) => send("PATCH", `/areas/${encodeURIComponent(id)}`, { name });
const deleteArea = (id) => send("DELETE", `/areas/${encodeURIComponent(id)}`);
// ?check=1 also tests the Claude key (one cheap call, no tokens).
const checkStatus = () => send("GET", "/status?check=1");

// ---------- Small pieces ----------

// A few lines to paste into .env, with a Copy button.
function EnvLines({ lines }) {
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
    <div className="aset-env">
      <div className="aset-env-head">
        <span>.env</span>
        <button type="button" className="aset-env-copy" onClick={copy}>
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="aset-env-code">{text}</pre>
    </div>
  );
}

// One line of a card: icon, title, status, and something on the right.
function StatusRow({ icon, title, badge, meta, action }) {
  return (
    <div className="aset-row">
      <span className="aset-row-icon">{icon}</span>
      <div className="aset-row-text">
        <span className="aset-row-title">
          {title}
          {badge}
        </span>
        {meta && <span className="aset-row-meta">{meta}</span>}
      </div>
      {action && <div className="aset-row-action">{action}</div>}
    </div>
  );
}

// A bin button that asks first: Remove / Keep. Keyboard focus moves to
// "Remove" when it asks, and back to the bin after Keep or an error.
//   onRemove: async () => {}   (throw to show an error)
//   onError(message | null)
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
      // The row goes away on success.
    } catch (err) {
      onError?.(errorText(err));
      setBusy(false);
      keep();
    }
  };

  if (confirming) {
    return (
      <div className="aset-confirm" onKeyDown={(event) => event.key === "Escape" && keep()}>
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
      className="aset-remove"
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

// An area's name; click it to rename. Enter or leaving the box saves,
// Escape cancels.
function AreaName({ area, className, onError }) {
  const { actions } = useAtlasData();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(area.name);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef(null);
  const inputRef = useRef(null);
  const focusButton = useRef(false);
  const saving = useRef(false); // a ref, so Enter and the blur after it save once

  useEffect(() => {
    if (editing) inputRef.current?.select();
    else if (focusButton.current) {
      focusButton.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const stop = () => {
    saving.current = true; // ignore the blur as the box closes
    focusButton.current = true;
    setEditing(false);
  };

  const save = async () => {
    if (saving.current) return;
    const name = value.replace(/\s+/g, " ").trim();
    if (!name || name === area.name) {
      setValue(area.name);
      stop();
      return;
    }
    saving.current = true;
    setBusy(true);
    onError?.(null);
    try {
      await renameArea(area.id, name);
      await actions.reload();
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
        className={`input aset-rename ${className}`}
        aria-label={`New name for ${area.name}`}
        maxLength={80}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          } else if (event.key === "Escape") {
            setValue(area.name);
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
      className={`aset-name ${className}`}
      title="Rename"
      aria-label={`${area.name}. Rename`}
      onClick={() => {
        saving.current = false;
        setValue(area.name);
        setEditing(true);
      }}
    >
      <span className="aset-name-text">{area.name}</span>
      <PenLine size={13} className="aset-name-pen" aria-hidden="true" />
    </button>
  );
}

const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

// ---------- Area ----------

// Which saved areas are in the line of analyses (one area at a time,
// server/jobs.js): Map areaId -> "analyzing" | "waiting" (lineMarks). It
// starts from the jobs the page loaded with and asks the server again
// every few seconds while the page is open (not while the tab is hidden),
// so the marks never go stale.
const LINE_POLL_MS = 5000;
function useLineMarks() {
  const { serverStatus } = useAtlasData();
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    let stopped = false;
    let timer;
    const tick = async () => {
      if (typeof document === "undefined" || !document.hidden) {
        try {
          const list = await listJobs();
          if (!stopped) setJobs(list);
        } catch {
          // Asked again on the next tick.
        }
      }
      if (!stopped) timer = setTimeout(tick, LINE_POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  return lineMarks(jobs ?? serverStatus?.jobs ?? []);
}

// A saved area's place in the line: "Analyzing…" or "Waiting".
const LINE_MARKS = {
  analyzing: { tone: "blue", label: "Analyzing…" },
  waiting: { tone: "outline", label: "Waiting" },
};

function SavedArea({ item, busy, onOpen, opening, mark }) {
  const { actions } = useAtlasData();
  const [error, setError] = useState(null);
  const kind = areaKind(item);
  const line = LINE_MARKS[mark];
  return (
    <li className="aset-saved-row" data-area={item.id}>
      <kind.Icon size={15} className="aset-saved-icon" aria-hidden="true" />
      <AreaName area={item} className="aset-saved-name" onError={setError} />
      {line && (
        <span className="aset-saved-mark" title={mark === "analyzing" ? "Being analyzed now" : "Waiting for its turn: one area at a time"}>
          <Badge tone={line.tone}>{line.label}</Badge>
        </span>
      )}
      <span className="aset-row-meta aset-saved-meta">
        {kind.label} · {formatAreaSize(item.areaHa)}
      </span>
      <Button size="sm" className="aset-open" aria-label={`Open ${item.name}`} onClick={() => onOpen(item.id)} disabled={busy}>
        {opening ? "Opening…" : "Open"}
      </Button>
      <RemoveButton
        label={`Remove ${item.name}`}
        disabled={busy}
        onError={setError}
        onRemove={async () => {
          await deleteArea(item.id);
          await actions.reload();
        }}
      />
      {error && (
        <p className="aset-error aset-row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function AreaCard() {
  const { area, areas, runs, actions } = useAtlasData();
  const [picking, setPicking] = useState(!area);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);
  const others = areas.filter((item) => item.id !== area?.id);
  const marks = useLineMarks();

  const open = async (id) => {
    setSwitching(id);
    setError(null);
    try {
      await actions.setCurrentArea(id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSwitching(null);
    }
  };

  const kind = areaKind(area);
  return (
    <Card
      className="aset-card"
      title="Area"
      actions={
        area && (
          <Button
            variant={picking ? "ghost" : "primary"}
            size="sm"
            icon={picking ? <X size={14} /> : <Plus size={14} />}
            onClick={() => setPicking((value) => !value)}
          >
            {picking ? "Cancel" : "New area"}
          </Button>
        )
      }
    >
      {area && (
        <div className="aset-current">
          <span className="aset-current-icon">
            <kind.Icon size={18} />
          </span>
          <div className="aset-current-text">
            <AreaName key={area.id} area={area} className="aset-current-name" onError={setError} />
            <span className="aset-row-meta">
              {kind.label} · {formatAreaSize(area.areaHa)} · {runs.length === 1 ? "1 month" : `${runs.length} months`}
            </span>
          </div>
          <Badge tone="green">Current</Badge>
        </div>
      )}

      {picking && (
        <div className="aset-picker">
          <AreaPicker onDone={() => setPicking(false)} />
        </div>
      )}

      {others.length > 0 && (
        <div className="aset-saved">
          <span className="aset-label">Saved areas</span>
          <ul className="aset-list">
            {others.map((item) => (
              <SavedArea
                key={item.id}
                item={item}
                // Open works even while an analysis runs or waits: with one
                // area at a time the next one can wait for hours. It goes
                // on on the server, and the pages follow the area that is
                // open (the War and Data cards start again for it: key).
                busy={Boolean(switching)}
                opening={switching === item.id}
                onOpen={open}
                mark={marks.get(item.id)}
              />
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="aset-error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

// ---------- Data ----------

function earthEngineState(provider) {
  if (!provider) return { tone: "outline", label: "Checking…" };
  if (provider.connecting) return { tone: "blue", label: "Connecting…" };
  if (provider.id === "gee" && provider.ok) return { tone: "green", label: "Connected" };
  if (provider.fallbackFrom || provider.credentialsError) return { tone: "red", label: "Not connected" };
  return { tone: "amber", label: "Sample data" };
}

// The .env lines still missing for Earth Engine.
function geeLines(provider) {
  const missing = provider?.missing || [];
  const lines = [];
  if (missing.includes("GEE_PROJECT_ID")) lines.push("GEE_PROJECT_ID=your-cloud-project-id");
  if (missing.some((item) => item.includes("GOOGLE_APPLICATION_CREDENTIALS") || item.includes("GEE_SERVICE_ACCOUNT_JSON"))) {
    lines.push("GOOGLE_APPLICATION_CREDENTIALS=./service-account.json");
  }
  return lines;
}

// While Earth Engine is still signing in, asks the server every few seconds
// and reloads the page data once it has finished (connected or not).
function useWhileConnecting(connecting, reload) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!connecting) return undefined;
    let stopped = false;
    let polls = 0;
    let timer;
    const tick = async () => {
      polls += 1;
      try {
        const status = await send("GET", "/status");
        if (stopped) return;
        // Done signing in (connected or not): show it. Once the page data
        // says so too, this effect stops.
        if (!status?.provider?.connecting) await reloadRef.current();
      } catch {
        // Try again on the next tick.
      }
      if (!stopped && polls < CONNECTING_MAX_POLLS) timer = setTimeout(tick, CONNECTING_POLL_MS);
    };
    timer = setTimeout(tick, CONNECTING_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connecting]);
}

// "Re-run analysis" for the current area and how it went. The Data card
// and the War card's "Re-run the analysis to apply this" both use it. Each
// card starts again for every area (key={area.id} in SettingsPage), so an
// area's re-run never reports under another one opened meanwhile.
//   redoAll  true (the Data card): every month of the last 12 (at most 24)
//            is analyzed again (rerun). False (the War card): a plain run a
//            person starts over the same months, which redoes only the
//            months made with another war setting (or an older method, or
//            sample data now that Earth Engine is connected) and fills in
//            missing ones (server/jobs.js; overview.js keepsMonth)
//   -> { months, running, waiting, starting, askFirst, result, start }
//      result { tone: "ok" | "error" | "muted", text }
//   months   how many months back from the latest complete one (default:
//            rerunMonths, at least 12, as many as there are saved, at most 24)
function useRerun({ redoAll = true, months: monthsAsked } = {}) {
  const { serverStatus, area, runs, job, actions } = useAtlasData();
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const provider = serverStatus?.provider;
  const months = monthsAsked || rerunMonths(runs.length);
  const running = job?.status === "running" && job.areaId === area?.id;
  // Ask before a slow re-run (Earth Engine, or a very big area).
  const askFirst = runs.length > 0 && (provider?.id === "gee" || (area?.areaHa || 0) > BIG_AREA_HA);

  const start = async () => {
    if (!area) return;
    setStarting(true);
    setResult(null);
    try {
      const { finished } = await actions.analyzeArea(area.id, { months, rerun: redoAll && runs.length > 0 });
      if (mounted.current) setStarting(false);
      const final = await finished;
      if (!mounted.current) return;
      setResult(rerunOutcome(final, months));
    } catch (err) {
      if (!mounted.current) return;
      setStarting(false);
      setResult({ tone: "error", text: errorText(err) });
    }
  };

  return { months, running, waiting: running && Boolean(job.queued), starting, askFirst, result, start };
}

// How a finished re-run went, in a few words:
//   done       "Updated · 2 months" (the months analyzed, job.analyzed), or
//              "Already up to date" when every month was kept
//   cancelled  the job's own words: "Kenya: cancelled before it started",
//              "Russia: stopped after 3 of 24 months. The months analyzed
//              before are kept."
//   error      why it stopped, or which months are missing
function rerunOutcome(final, months = 12) {
  if (final?.status === "done") {
    const analyzed = Number.isFinite(final.analyzed) ? final.analyzed : final.total || months;
    if (!analyzed) return { tone: "ok", text: "Already up to date" };
    return { tone: "ok", text: `Updated · ${analyzed === 1 ? "1 month" : `${analyzed} months`}` };
  }
  if (final?.status === "cancelled") return { tone: "muted", text: final.message || "Stopped." };
  return { tone: "error", text: final?.error || "The analysis stopped." };
}

// The re-run button, which first asks (confirm, e.g. "Re-run 12 months")
// when that is slow (rerun.askFirst). Escape or the cross takes the
// question back.
//   rerun    from useRerun()
//   primary  draw it as the page's main button
//   confirm  the question's button (default "Re-run 12 months")
function RerunButton({ rerun, primary = false, confirm }) {
  const { runs } = useAtlasData();
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef(null);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);
  const { months, running, waiting, starting, askFirst, start } = rerun;

  if (asking && !running) {
    return (
      <div className="aset-confirm" onKeyDown={(event) => event.key === "Escape" && setAsking(false)}>
        <Button
          ref={confirmRef}
          variant="primary"
          size="sm"
          onClick={() => {
            setAsking(false);
            start();
          }}
        >
          {confirm || `Re-run ${months} months`}
        </Button>
        <Button variant="ghost" size="sm" icon={<X size={14} />} aria-label="Cancel re-run" onClick={() => setAsking(false)} />
      </div>
    );
  }
  return (
    <Button
      variant={primary || !runs.length ? "primary" : "secondary"}
      size="sm"
      icon={<RefreshCw size={14} className={running && !waiting ? "atlas-spin" : undefined} />}
      onClick={askFirst ? () => setAsking(true) : start}
      disabled={starting || running}
      className="aset-rerun"
    >
      {waiting ? "Waiting…" : running ? "Analyzing…" : starting ? "Starting…" : runs.length ? "Re-run analysis" : "Analyze 12 months"}
    </Button>
  );
}

// How the last re-run went: "Updated · 12 months", why it stopped, or that
// it was stopped or cancelled (muted: a person's own choice).
function RerunResult({ rerun }) {
  if (rerun.running || !rerun.result) return null;
  const { tone, text } = rerun.result;
  return (
    <p className={tone === "ok" ? "aset-ok" : tone === "muted" ? "aset-hint" : "aset-error"} role="status">
      {tone === "ok" && <Check size={14} />}
      {text}
    </p>
  );
}

function DataCard() {
  const { serverStatus, workspace, area, runs, job, actions } = useAtlasData();
  const [toggleError, setToggleError] = useState(null);
  const rerun = useRerun();

  const provider = serverStatus?.provider;
  useWhileConnecting(Boolean(provider?.connecting), actions.reload);

  const ee = earthEngineState(provider);
  const lines = geeLines(provider);
  const problem = provider?.credentialsError || (provider?.fallbackFrom ? provider.detail : null);
  const latest = runs[0];
  const autoMonthly = workspace?.schedule?.autoMonthly !== false;
  // Earth Engine is connected but the months shown are still sample data.
  const needsRealData = provider?.id === "gee" && provider.ok && latest && latest.provider !== "gee";

  const setAuto = async (value) => {
    setToggleError(null);
    try {
      await actions.updateWorkspace({ schedule: { autoMonthly: value } });
    } catch (err) {
      setToggleError(errorText(err));
    }
  };

  const latestMeta = latest
    ? `${latest.label} · ${latest.provider === "gee" ? "Earth Engine" : "Sample data"}`
    : area
      ? "Not analyzed yet"
      : "Choose an area first";
  // The latest month is in a war where no fire looked like fighting: its
  // own line saying safe access is not measured (the run's warning), with
  // how to measure it. Null for any other month.
  const accessNote = noFightingNote(latest);

  return (
    <Card className="aset-card" title="Data">
      <div className="aset-block">
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
        {problem && <p className="aset-error">{problem}</p>}
        {lines.length > 0 && (
          <div className="aset-setup">
            <EnvLines lines={lines} />
            <span className="aset-hint">
              Then run <code>npm run gee:check</code>
            </span>
          </div>
        )}
      </div>

      <div className="aset-block">
        <StatusRow
          icon={<CalendarClock size={16} />}
          title="Latest month"
          meta={latestMeta}
          action={area ? <RerunButton rerun={rerun} primary={needsRealData} /> : null}
        />
        {accessNote && (
          <p className="aset-access-note" role="note">
            <strong>Feasibility not measured in {latest.label}.</strong> {accessNote}{" "}
            {/* "Connect one" only when no ACLED file is connected: with one
                that has no battles near the area, or cannot be used, the
                run's line says what to do with it (overview.js acledFileState). */}
            {acledFileState(latest) ? (
              <>
                The file is the one <code>ACLED_CSV_PATH</code> names in .env (see docs/CONNECT-DATA.md).
              </>
            ) : (
              <>
                Connect one with <code>ACLED_CSV_PATH</code> in .env (see docs/CONNECT-DATA.md).
              </>
            )}
          </p>
        )}
        {rerun.running && <AnalysisProgress job={job} compact />}
        <RerunResult rerun={rerun} />
        {/* The last monthly update's failure, while its months are missing
            (how a re-run started here ended is said just above). */}
        <AnalysisNotice followed={false} />
      </div>

      <div className="aset-block aset-auto">
        <Toggle
          title="Analyze every saved area automatically each month"
          help="One area at a time, the current one first"
          checked={autoMonthly}
          onChange={setAuto}
        />
        {toggleError && <p className="aset-error">{toggleError}</p>}
      </div>
    </Card>
  );
}

// ---------- War ----------

// The team's four choices for the current area's crisis, saved as
// area.war (the server checks them with the same rules:
// src/config/conflicts.js checkAreaWar): the app's list of wars, at war
// since a day, a natural disaster since a day (with its type), or no
// crisis. The same Near term and Post-crisis maths follow every one; only
// how Damage and Feasibility are measured follows the crisis.
const WAR_MODES = [
  { value: "list", label: "App's list of wars" },
  { value: "war", label: "At war" },
  { value: "disaster", label: "Natural disaster" },
  { value: "peace", label: "No crisis" },
];
// A form for a day (and a name): "At war" and "Natural disaster".
const DAY_MODES = ["war", "disaster"];

// Today as "YYYY-MM-DD" in UTC, as the server checks it: the latest day a
// war can count from.
const todayUtc = () => new Date().toISOString().slice(0, 10);

// What the app's list says for the area (area.listConflict from the
// server), in words: "Full-scale invasion of Ukraine, since 24 Feb 2022",
// "no war here", or null when the server did not say.
function listWords(list) {
  if (list === undefined) return null;
  if (!list) return "no war here";
  return `${list.name}, since ${warDay(list.since)}`;
}

function WarCard() {
  const { area, runs, serverStatus, actions } = useAtlasData();
  const savedMode = ["war", "disaster", "peace"].includes(area?.war?.mode) ? area.war.mode : "list";
  const list = area?.listConflict;
  // What the form starts from for each choice: the saved day, name and
  // type for the saved choice; for "At war" otherwise the day a war of the
  // app's list began (2022 or later), and no name; for "Natural disaster"
  // otherwise nothing, so the team enters the disaster's own day (a war's
  // day or name is never carried into a disaster, nor a disaster's into a
  // war).
  const formFor = (next) => crisisFormFor(next, area?.war, list?.since);
  const start = formFor(savedMode === "list" || savedMode === "peace" ? "war" : savedMode);
  const [mode, setMode] = useState(savedMode);
  const [since, setSince] = useState(start.since);
  const [name, setName] = useState(start.name);
  const [type, setType] = useState(start.type);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The saved months made with another war setting than the area's now.
  // The re-run that applies it is a plain run a person starts (not every
  // month again): back from the latest month to the oldest such month (24
  // months at most), it redoes those months and fills in the missing ones
  // between them.
  const stale = monthsWithOtherWar(area, runs);
  const lastMonths = analysisMonths(MAX_RERUN_MONTHS);
  const reach = Math.max(1, ...stale.map((item) => lastMonths.indexOf(item.month) + 1));
  const rerun = useRerun({ redoAll: false, months: reach });

  // Start again from what is saved when the area or its setting changes.
  const savedKey = `${area?.id}|${savedMode}|${area?.war?.since || ""}|${area?.war?.name || ""}|${area?.war?.type || ""}`;
  useEffect(() => {
    setMode(savedMode);
    setSince(start.since);
    setName(start.name);
    setType(start.type);
    setError(null);
    // savedKey holds everything the reset reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  if (!area) return null;

  const save = async (war) => {
    setBusy(true);
    setError(null);
    try {
      await actions.updateArea(area.id, { war });
    } catch (err) {
      setError(errorText(err));
      // Not saved: the switch shows what is saved again ("At war" and
      // "Natural disaster" keep their form open, to fix the day).
      if (!DAY_MODES.includes(war.mode)) setMode(savedMode);
    } finally {
      setBusy(false);
    }
  };

  // The app's list and "No crisis" need nothing more: saved at once.
  // "At war" and "Natural disaster" open the day (and the type) first.
  const choose = (next) => {
    if (busy) return;
    setError(null);
    // Each day choice starts from its own values (formFor); clicking the
    // choice already open keeps what was typed.
    if (next !== mode && DAY_MODES.includes(next)) {
      const form = formFor(next);
      setSince(form.since);
      setName(form.name);
      setType(form.type);
    }
    setMode(next);
    if (!DAY_MODES.includes(next) && next !== savedMode) save({ mode: next });
  };

  const cleanName = name.replace(/\s+/g, " ").trim();
  const unchanged = savedMode === mode && since === area.war?.since && cleanName === (area.war?.name || "") && (mode !== "disaster" || type === (area.war?.type || ""));
  const submit = (event) => {
    event.preventDefault();
    // The server's own rules, for a quick answer (it checks them again).
    const checked = checkAreaWar(mode === "disaster" ? { mode, since, name: cleanName, type } : { mode: "war", since, name: cleanName }, todayUtc());
    if (checked.error) {
      setError(checked.error);
      return;
    }
    save(checked.war);
  };

  // What the saved setting gives, and the months made with another one.
  const now = areaWar(area);
  const war = now?.conflict;
  const listText = listWords(list);
  // A natural disaster: "Flood since 4 Sep 2023".
  const title = now === undefined ? "The app's list" : isDisaster(war) ? `${DISASTER_LABELS[war.type]} since ${warDay(war.since)}` : war ? `At war since ${warDay(war.since)}` : "No crisis";
  let meta = null;
  if (now?.team) {
    const own = war ? (area.war.name ? `${area.war.name}. ` : "") : "";
    meta = listText ? `${own}The app's list: ${listText}.` : own.trim() || null;
  } else if (now) {
    // A war that covers the area only in part (a whole country, or a
    // region, box or drawn area across the edge of its boxes: warPartOf),
    // and in squares of another listed war too (list.otherWarSquares:
    // server/conflicts.js listConflictForArea).
    const part = warPartOf(list);
    const otherWar = list?.otherWarSquares > 0 ? " or lie in another listed war" : "";
    meta = war
      ? `${war.name}.${part ? ` It covers part of this ${part}: its rules apply in the squares that touch the war's region${otherWar}. The other squares also count damage from the day it began, but use the peace rules for heavy damage and the damage score.` : ""}`
      : "No war in the app's list covers this area.";
  }
  // Which of them the re-run reaches (and the months it redoes in all, for
  // its question: "Redo 2 months"); older ones keep the setting they were
  // made with. A run saved before run.conflict existed is read with
  // conflictOf, as monthsWithOtherWar reads it.
  const rerunWindow = analysisMonths(rerun.months);
  const reached = stale.filter((item) => rerunWindow.includes(item.month));
  const older = stale.length - reached.length;
  const byMonth = new Map();
  for (const item of runs) if (!byMonth.has(item.month)) byMonth.set(item.month, item);
  const redo = rerunWindow.filter((month) => !keepsMonth(byMonth.get(month), { provider: serverStatus?.provider?.id || "sample", warNow: warKey(war) })).length;
  // Against the setting now, so a war of the same day whose rules covered
  // another part of the area never reads the same as the title ("made at
  // war since 7 Oct 2023, with its rules all over the country").
  const madeWith = (months) => {
    const keys = new Set(months.map((item) => warKey(conflictOf(item))));
    return keys.size === 1 ? `made ${warText(conflictOf(months[0]), war)}` : "made with another crisis setting";
  };
  const staleCount =
    reached.length === runs.length ? (runs.length === 1 ? "The saved month was" : "The saved months were") : reached.length === 1 ? "1 saved month was" : `${reached.length} saved months were`;
  const olderText = older > 0 ? ` ${older === 1 ? "1 older month keeps the setting it was" : `${older} older months keep the setting they were`} made with: a re-run reaches back ${MAX_RERUN_MONTHS} months at most.` : "";
  const staleText = reached.length ? `${staleCount} ${madeWith(reached)}.${olderText}` : "";
  const firstReached = rerunWindow.length ? formatMonthYear(rerunWindow[rerunWindow.length - 1]) : "";
  const onlyOlderText = !reached.length && older > 0 ? `${older === 1 ? "1 saved month" : `${older} saved months`} before ${firstReached} ${older === 1 ? "was" : "were"} ${madeWith(stale)} and ${older === 1 ? "keeps that setting" : "keep that setting"}: a re-run reaches back ${MAX_RERUN_MONTHS} months at most.` : "";

  return (
    <Card className="aset-card" title="Crisis">
      <div className="aset-block">
        <StatusRow
          icon={<ShieldAlert size={16} />}
          title={title}
          badge={now && <Badge tone="outline">{now.team ? "Set by your team" : "App's list"}</Badge>}
          meta={meta}
        />
        <div className="aset-war-controls">
          <Segmented light options={WAR_MODES} value={mode} onChange={choose} ariaLabel={`Crisis setting for ${area.name}`} />
          {DAY_MODES.includes(mode) && (
            // noValidate: the app's own message says why a day is refused
            // (the date picker still offers 2022-01-01 to today only).
            <form className={mode === "disaster" ? "aset-war-form is-disaster" : "aset-war-form"} onSubmit={submit} noValidate>
              {mode === "disaster" && (
                <label className="aset-war-field">
                  <span className="field-label">What happened</span>
                  <select
                    className="select"
                    value={type}
                    disabled={busy}
                    onChange={(event) => {
                      setError(null);
                      setType(event.target.value);
                    }}
                  >
                    <option value="" disabled>
                      Choose the kind of disaster
                    </option>
                    {DISASTER_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {DISASTER_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="aset-war-field">
                <span className="field-label">Count damage from</span>
                <input
                  className="input"
                  type="date"
                  min={EARLIEST_WAR_DAY}
                  max={todayUtc()}
                  value={since}
                  disabled={busy}
                  onChange={(event) => {
                    setError(null);
                    setSince(event.target.value);
                  }}
                />
              </label>
              <label className="aset-war-field">
                <span className="field-label">Name (optional)</span>
                <input
                  className="input"
                  maxLength={WAR_NAME_MAX}
                  placeholder={mode === "disaster" ? "For example Storm Daniel floods" : "For example Fighting in Amhara"}
                  value={name}
                  disabled={busy}
                  onChange={(event) => {
                    setError(null);
                    setName(event.target.value);
                  }}
                />
              </label>
              <Button variant="primary" size="sm" type="submit" className="aset-war-save" disabled={busy || !since || unchanged || (mode === "disaster" && !type)}>
                {busy ? "Saving…" : "Save"}
              </Button>
              {mode === "disaster" ? (
                <p className="aset-hint aset-war-hint">
                  Disaster damage is measured on cropland from this day: flooded or burned land within 60 days of it, crop greenness for a drought, lasting change of the land for a storm, earthquake or landslide. Draw the area around the hit land: every square gets the disaster's rules. Months more than 24 months back cannot be analyzed from the app.
                </p>
              ) : (
                <p className="aset-hint aset-war-hint">
                  Began before 2022? Count from 1 Jan 2022: earlier damage is not counted, and the normal years 2019–2021 may already include the war.
                </p>
              )}
            </form>
          )}
          {busy && !DAY_MODES.includes(mode) && <p className="aset-hint">Saving…</p>}
          {error && (
            <p className="aset-error" role="alert">
              {error}
            </p>
          )}
          {reached.length > 0 && !rerun.running && (
            <div className="aset-war-rerun" role="status">
              <p>
                <strong>Re-run the analysis to apply this.</strong> {staleText}
              </p>
              <RerunButton rerun={rerun} confirm={`Redo ${redo === 1 ? "1 month" : `${redo} months`}`} />
            </div>
          )}
          {onlyOlderText && !rerun.running && <p className="aset-hint">{onlyOlderText}</p>}
          {/* The analysis running reads the setting again before each month
              (server/jobs.js), so a change applies from its next month. */}
          {rerun.running && !rerun.waiting && <p className="aset-hint">This area is being analyzed: a change here applies from its next month on.</p>}
          <RerunResult rerun={rerun} />
        </div>
      </div>
    </Card>
  );
}

// ---------- AI ----------

// ai: { configured, model, ok: true | false | null, error }. ok is only
// known once the key has been tested ("Check connections"; an older server
// leaves it out, and then a key in .env counts as connected).
function claudeState(ai, checking) {
  if (!ai?.configured) return { tone: "amber", label: "Not connected", connected: false };
  if (ai.ok === false) return { tone: "red", label: "Key rejected", connected: false };
  if (ai.ok === null && checking) return { tone: "outline", label: "Checking…", connected: true };
  if (ai.ok === null && ai.error) return { tone: "amber", label: "Not reachable", connected: true };
  return { tone: "green", label: "Connected", connected: true };
}

function AiCard({ ai, checking }) {
  const state = claudeState(ai, checking);
  return (
    <Card className="aset-card" title="AI">
      <div className="aset-block">
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
            state.connected ? (
              <Button size="sm" to="/atlas/ai">
                Open AI
              </Button>
            ) : (
              <Button size="sm" icon={<ExternalLink size={13} />} onClick={() => window.open(CLAUDE_KEYS_URL, "_blank", "noopener")}>
                Get a key
              </Button>
            )
          }
        />
        {ai?.error && (
          <p className="aset-error" role="alert">
            {ai.error}
          </p>
        )}
        {!state.connected && (
          <div className="aset-setup">
            <EnvLines lines={["ANTHROPIC_API_KEY=sk-ant-your-key"]} />
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------- Team ----------

function MemberRow({ member }) {
  const { actions } = useAtlasData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const changeRole = async (role) => {
    setBusy(true);
    setError(null);
    try {
      await actions.updateMember(member.id, { role });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="aset-member" data-member={member.id}>
      <span className="aset-avatar" aria-hidden="true">
        {initials(member.name)}
      </span>
      <div className="aset-member-text">
        <span className="aset-member-name">{member.name}</span>
        {member.email && <span className="aset-row-meta">{member.email}</span>}
      </div>
      <select
        className="select aset-role"
        aria-label={`Role of ${member.name}`}
        value={member.role}
        disabled={busy}
        onChange={(event) => changeRole(event.target.value)}
      >
        {ROLES.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </select>
      <RemoveButton
        label={`Remove ${member.name}`}
        disabled={busy}
        onError={setError}
        onRemove={() => actions.removeMember(member.id)}
      />
      {error && (
        <p className="aset-error aset-member-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function AddMember() {
  const { actions } = useAtlasData();
  const [form, setForm] = useState({ name: "", email: "", role: "analyst" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const nameRef = useRef(null);
  const set = (key) => (event) => {
    setError(null);
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await actions.addMember({ name: form.name.trim(), email: form.email.trim(), role: form.role });
      setForm((prev) => ({ ...prev, name: "", email: "" }));
      nameRef.current?.focus();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="aset-add" onSubmit={submit}>
      <input ref={nameRef} className="input" placeholder="Name" aria-label="Name" maxLength={80} value={form.name} onChange={set("name")} />
      <input
        className="input"
        type="email"
        placeholder="Email (optional)"
        aria-label="Email"
        maxLength={120}
        value={form.email}
        onChange={set("email")}
      />
      <select className="select aset-role" aria-label="Role" value={form.role} onChange={set("role")}>
        {ROLES.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </select>
      <Button variant="primary" type="submit" icon={<Plus size={14} />} disabled={!form.name.trim() || busy}>
        {busy ? "Adding…" : "Add"}
      </Button>
      {error && (
        <p className="aset-error aset-add-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function TeamCard() {
  const { workspace } = useAtlasData();
  const team = workspace?.team || [];
  return (
    <Card className="aset-card" title="Team" actions={<Badge tone="outline">{team.length}</Badge>}>
      <ul className="aset-list aset-team">
        {team.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </ul>
      <AddMember />
    </Card>
  );
}

// ---------- The page ----------

export default function SettingsPage() {
  const { status, serverStatus, area, actions } = useAtlasData();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const [testedAi, setTestedAi] = useState(null); // the AI part of the last ?check=1 answer
  const autoChecked = useRef(false);

  // Tests the Claude key (and asks for every status again), then reloads.
  const recheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const fresh = await checkStatus();
      setTestedAi(fresh?.ai || null);
      await actions.reload();
    } catch (err) {
      setCheckError(errorText(err));
    } finally {
      setChecking(false);
    }
  };

  // A key in .env that has not been tested yet is tested once when the
  // page opens, so "Connected" means the key really works.
  const untested = status === "ready" && serverStatus?.ai?.configured && serverStatus.ai.ok === null;
  useEffect(() => {
    if (!untested || autoChecked.current) return;
    autoChecked.current = true;
    recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untested]);

  // Loading and "could not load" look the same as on every Atlas page.
  if (status !== "ready") return <AtlasGate>{null}</AtlasGate>;

  // The server remembers a key test and repeats it on every status. Only
  // "could not reach Claude" is not remembered, so that comes from the test.
  const serverAi = serverStatus?.ai;
  const ai = serverAi?.configured && serverAi.ok == null && testedAi?.error ? { ...serverAi, error: testedAi.error } : serverAi;

  return (
    <div className="page aset">
      <PageHeader
        title="Settings"
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="aset-check"
            icon={<RefreshCw size={14} className={checking ? "atlas-spin" : undefined} />}
            onClick={recheck}
            disabled={checking}
          >
            {checking ? "Checking…" : "Check connections"}
          </Button>
        }
      />
      {checkError && (
        <p className="aset-error" role="alert">
          {checkError}
        </p>
      )}
      <AreaCard />
      {/* Started again for each area, so a re-run's result (or an open
          "Re-run 12 months?") never shows under another area opened
          meanwhile. */}
      <WarCard key={`war-${area?.id || "none"}`} />
      <DataCard key={`data-${area?.id || "none"}`} />
      <AiCard ai={ai} checking={checking} />
      <TeamCard />
    </div>
  );
}
