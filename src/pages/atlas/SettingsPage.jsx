// WHAT THIS FILE DOES
// The Atlas Settings page (/atlas/settings). Four cards:
//   Area   the area being analyzed, "New area" (country, GPS coordinates
//          or a drawn shape) and the saved areas: open, rename, remove
//   Data   Earth Engine status and the .env lines that connect it,
//          "Re-run analysis" and the monthly automatic analysis switch
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
  Sparkles,
  SquareDashed,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader, Card, Badge, Button, Toggle } from "../../components/ui/index.js";
import { AnalysisProgress, AtlasGate, useAtlasData } from "../../state/AtlasData.jsx";
import AreaPicker from "../../components/atlas/AreaPicker.jsx";
import { API_ROOT, ApiError, AUTH_REQUIRED_EVENT } from "../../api/atlasApi.js";
import { formatAreaSize } from "../../lib/format.js";
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

// How many months "Re-run analysis" recomputes (at least 12, at most 24).
const rerunMonths = (runCount) => Math.min(24, Math.max(12, runCount));

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

function SavedArea({ item, busy, onOpen, opening }) {
  const { actions } = useAtlasData();
  const [error, setError] = useState(null);
  const kind = areaKind(item);
  return (
    <li className="aset-saved-row" data-area={item.id}>
      <kind.Icon size={15} className="aset-saved-icon" aria-hidden="true" />
      <AreaName area={item} className="aset-saved-name" onError={setError} />
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
  const { area, areas, runs, job, actions } = useAtlasData();
  const [picking, setPicking] = useState(!area);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);
  const others = areas.filter((item) => item.id !== area?.id);
  const running = job?.status === "running";

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
                busy={Boolean(switching) || running}
                opening={switching === item.id}
                onOpen={open}
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

function DataCard() {
  const { serverStatus, workspace, area, runs, job, actions } = useAtlasData();
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false); // "Re-run 12 months?" shown
  const [result, setResult] = useState(null); // { ok, text }
  const [toggleError, setToggleError] = useState(null);
  const mounted = useRef(true);
  const confirmRef = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);

  const provider = serverStatus?.provider;
  useWhileConnecting(Boolean(provider?.connecting), actions.reload);

  const ee = earthEngineState(provider);
  const lines = geeLines(provider);
  const problem = provider?.credentialsError || (provider?.fallbackFrom ? provider.detail : null);
  const latest = runs[0];
  const running = job?.status === "running" && job.areaId === area?.id;
  const autoMonthly = workspace?.schedule?.autoMonthly !== false;
  const months = rerunMonths(runs.length);
  // Earth Engine is connected but the months shown are still sample data.
  const needsRealData = provider?.id === "gee" && provider.ok && latest && latest.provider !== "gee";
  // Ask before a slow re-run (Earth Engine, or a very big area).
  const askFirst = runs.length > 0 && (provider?.id === "gee" || (area?.areaHa || 0) > BIG_AREA_HA);

  const rerun = async () => {
    if (!area) return;
    setAsking(false);
    setStarting(true);
    setResult(null);
    try {
      const { finished } = await actions.analyzeArea(area.id, { months, rerun: runs.length > 0 });
      if (mounted.current) setStarting(false);
      const final = await finished;
      if (!mounted.current) return;
      setResult(
        final.status === "done"
          ? { ok: true, text: `Updated · ${final.total || months} months` }
          : { ok: false, text: final.error || "The analysis stopped." }
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

  let action = null;
  if (area && asking && !running) {
    action = (
      <div className="aset-confirm" onKeyDown={(event) => event.key === "Escape" && setAsking(false)}>
        <Button ref={confirmRef} variant="primary" size="sm" onClick={rerun}>
          Re-run {months} months
        </Button>
        <Button variant="ghost" size="sm" icon={<X size={14} />} aria-label="Cancel re-run" onClick={() => setAsking(false)} />
      </div>
    );
  } else if (area) {
    action = (
      <Button
        variant={needsRealData || !runs.length ? "primary" : "secondary"}
        size="sm"
        icon={<RefreshCw size={14} className={running ? "atlas-spin" : undefined} />}
        onClick={askFirst ? () => setAsking(true) : rerun}
        disabled={starting || running}
        className="aset-rerun"
      >
        {running ? "Analyzing…" : starting ? "Starting…" : runs.length ? "Re-run analysis" : "Analyze 12 months"}
      </Button>
    );
  }

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
        <StatusRow icon={<CalendarClock size={16} />} title="Latest month" meta={latestMeta} action={action} />
        {running && <AnalysisProgress job={job} compact />}
        {!running && result && (
          <p className={result.ok ? "aset-ok" : "aset-error"} role="status">
            {result.ok && <Check size={14} />}
            {result.text}
          </p>
        )}
      </div>

      <div className="aset-block aset-auto">
        <Toggle title="Analyze automatically each month" checked={autoMonthly} onChange={setAuto} />
        {toggleError && <p className="aset-error">{toggleError}</p>}
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
  const { status, serverStatus, actions } = useAtlasData();
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
      <DataCard />
      <AiCard ai={ai} checking={checking} />
      <TeamCard />
    </div>
  );
}
