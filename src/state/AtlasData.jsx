// WHAT THIS FILE DOES
// Keeps the Atlas's data in one place and shares it with every Atlas page
// and the sidebar: the workspace (settings, team, budget), the current
// area, its monthly runs, the selected run with its map squares, the
// scores, the top areas and any analysis that is running (or waiting for
// its turn: the server analyzes one area at a time, server/jobs.js; such a
// job is "running" with job.queued true).
//
// It is mounted ONCE around the whole app (src/App.jsx), so moving between
// pages is instant and the sidebar can show the current area.
//
// HOW A PAGE USES IT
//   const { status, workspace, area, runs, run, scored, hotspots, job, actions } = useAtlasData();
//   const [timeframe, setTimeframe] = useTimeframe();   // ?view=postwar
//   const [colorBy, setColorBy] = useColorBy();         // ?color=damage
//   <AtlasGate> ...page... </AtlasGate>
//
// <AtlasGate> shows, instead of the page: a loading skeleton, an error box
// with "Try again", the "Choose an area" screen when there is no area yet,
// or the progress card while the first analysis runs. Inside it a page can
// assume area, run and scored are there.
//
// Weight changes (actions.updateSettings) show on the map at once and are
// saved to the server 0.4 s after the last change.
//
// WHO EDITS IT
// Whoever changes what data the Atlas pages share. To change how the server
// is called, edit src/api/atlasApi.js.

import { Suspense, createContext, lazy, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Clock, Info, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";
import * as api from "../api/atlasApi.js";
import { DEFAULT_SETTINGS, checkSettings } from "../lib/atlas/method.js";
import { analysisNotice } from "../lib/atlas/analysisNotice.js";
import { scorePlaces } from "../lib/atlas/scoring.js";
import { groupHotspots } from "../lib/atlas/hotspots.js";
import { Button } from "../components/ui/index.js";
import "../components/atlas/atlas.css";

// The area picker shows a map, so it (and the map library) is only
// downloaded when the "Choose an area" screen opens.
const AreaPicker = lazy(() => import("../components/atlas/AreaPicker.jsx"));

const AtlasDataContext = createContext(null);

// How many top areas are worked out for each time frame.
export const HOTSPOT_COUNT = 10;
// How long after the last weight change the settings are saved.
const SAVE_DELAY_MS = 400;
// How often a running analysis is checked.
const POLL_MS = 1000;

const EMPTY_HOTSPOTS = { nearTerm: [], postwar: [] };

// The cache key of a full run: a redone month keeps its id but gets a new
// createdAt, so the key changes and the new version is loaded.
const runKey = (summary) => (summary ? `${summary.id}@${summary.createdAt || ""}` : null);

export function AtlasDataProvider({ children }) {
  const { pathname } = useLocation();
  const inAtlas = pathname.startsWith("/atlas");

  const [base, setBase] = useState({
    status: "idle", // "idle" until an Atlas page opens, then "loading" | "ready" | "error"
    error: null,
    serverStatus: null,
    workspace: null,
    areas: [],
    area: null,
    runs: [],
  });
  const [chosenRunId, setChosenRunId] = useState(null);
  const [runCache, setRunCache] = useState({});
  const [runError, setRunError] = useState(null);
  const [job, setJob] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const baseRef = useRef(base);
  baseRef.current = base;
  const loadSeq = useRef(0);
  const pendingSettings = useRef(null);
  const settingsTimer = useRef(null);
  const jobWaiters = useRef(new Map());

  // ---------- Loading ----------

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setBase((prev) => (prev.workspace ? prev : { ...prev, status: "loading", error: null }));
    try {
      const [serverStatus, workspace, areas] = await Promise.all([api.getStatus(), api.getWorkspace(), api.listAreas()]);
      let area = null;
      let runs = [];
      if (workspace.currentAreaId) {
        try {
          [area, runs] = await Promise.all([api.getArea(workspace.currentAreaId), api.listRuns(workspace.currentAreaId)]);
        } catch (error) {
          // The saved area is gone: treat it as "no area yet".
          if (error.status !== 404) throw error;
        }
      }
      if (seq !== loadSeq.current) return;
      // Weight changes not saved yet win over what the server sent.
      const settings = pendingSettings.current || workspace.settings;
      setBase({ status: "ready", error: null, serverStatus, workspace: { ...workspace, settings }, areas, area, runs });
      // An analysis of the area running or waiting. A page that follows one
      // of them keeps it: a person's request while the monthly update
      // analyzes the area waits behind it as a second job of the same area
      // (server/jobs.js), and the page follows the person's.
      const running = (serverStatus.jobs || []).filter((item) => item.status === "running" && item.areaId === area?.id);
      if (running.length) setJob((prev) => (running.some((item) => item.id === prev?.id) ? prev : running[0]));
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setBase((prev) => ({ ...prev, status: prev.workspace ? "ready" : "error", error }));
    }
  }, []);

  // Load the first time an Atlas page opens (the Field pages never need it).
  useEffect(() => {
    if (inAtlas && base.status === "idle") load();
  }, [inAtlas, base.status, load]);

  // Only the run list (while an analysis adds months).
  const refreshRuns = useCallback(async () => {
    const areaId = baseRef.current.area?.id;
    if (!areaId) return;
    try {
      const runs = await api.listRuns(areaId);
      setBase((prev) => (prev.area?.id === areaId ? { ...prev, runs } : prev));
    } catch {
      // The next full reload will try again.
    }
  }, []);

  // ---------- The selected run ----------

  const runs = base.runs;
  const selectedSummary = runs.find((item) => item.id === chosenRunId) || runs[0] || null;
  const selectedKey = runKey(selectedSummary);
  const run = selectedKey ? runCache[selectedKey] || null : null;

  useEffect(() => {
    if (!inAtlas || !selectedKey || runCache[selectedKey]) return;
    let cancelled = false;
    setRunError(null);
    api.getRun(selectedSummary.id).then(
      (full) => {
        if (cancelled) return;
        setRunCache((prev) => {
          // Keep the four most recent runs; each can be a few hundred kB.
          const keys = Object.keys(prev).slice(-3);
          return { ...Object.fromEntries(keys.map((key) => [key, prev[key]])), [selectedKey]: full };
        });
      },
      (error) => !cancelled && setRunError(error)
    );
    return () => {
      cancelled = true;
    };
    // selectedSummary.id is part of selectedKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inAtlas, selectedKey, runCache]);

  // ---------- Scores ----------

  const settings = base.workspace?.settings || DEFAULT_SETTINGS;
  // Scoring a big area takes a few milliseconds; deferring keeps the
  // sliders smooth while the map catches up.
  const deferredSettings = useDeferredValue(settings);
  const scored = useMemo(() => (run ? scorePlaces(run.cells || [], { settings: deferredSettings, conflict: run.conflict, cellSizeDeg: run.cellSizeDeg }) : null), [run, deferredSettings]);
  const hotspots = useMemo(() => {
    if (!scored || !run) return EMPTY_HOTSPOTS;
    const options = { count: HOTSPOT_COUNT, cellSizeDeg: run.cellSizeDeg };
    return { nearTerm: groupHotspots(scored.places, "nearTerm", options), postwar: groupHotspots(scored.places, "postwar", options) };
  }, [scored, run]);

  // ---------- Saving ----------

  const flushSettings = useCallback(async ({ keepalive = false } = {}) => {
    clearTimeout(settingsTimer.current);
    const toSend = pendingSettings.current;
    if (!toSend) return;
    try {
      const workspace = await api.patchWorkspace({ settings: toSend }, { keepalive });
      if (pendingSettings.current === toSend) {
        pendingSettings.current = null;
        setBase((prev) => (prev.workspace ? { ...prev, workspace: { ...prev.workspace, settings: workspace.settings } } : prev));
      }
      setSaveError(null);
    } catch (error) {
      setSaveError(error);
    }
  }, []);

  // Save straight away if the page is closed during the 0.4 s wait.
  useEffect(() => {
    const onHide = () => flushSettings({ keepalive: true });
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, [flushSettings]);

  const updateSettings = useCallback(
    (partial = {}) => {
      const current = pendingSettings.current || baseRef.current.workspace?.settings || DEFAULT_SETTINGS;
      const merged = checkSettings({
        ...current,
        ...partial,
        weights: partial.weights ? { ...current.weights, ...partial.weights } : current.weights,
      });
      pendingSettings.current = merged;
      setBase((prev) => (prev.workspace ? { ...prev, workspace: { ...prev.workspace, settings: merged } } : prev));
      clearTimeout(settingsTimer.current);
      settingsTimer.current = setTimeout(() => flushSettings(), SAVE_DELAY_MS);
    },
    [flushSettings]
  );

  const resetSettings = useCallback(() => {
    updateSettings({ ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights } });
    return flushSettings();
  }, [updateSettings, flushSettings]);

  // Changes any workspace fields. Shows the change at once, then keeps what
  // the server saved for those fields. Throws the server's error.
  const updateWorkspace = useCallback(async (partial) => {
    const { settings: newSettings, ...rest } = partial || {};
    setBase((prev) => (prev.workspace ? { ...prev, workspace: { ...prev.workspace, ...rest } } : prev));
    try {
      const body = newSettings ? { ...rest, settings: newSettings } : rest;
      const workspace = await api.patchWorkspace(body);
      setBase((prev) => {
        if (!prev.workspace) return prev;
        const next = { ...prev.workspace };
        for (const key of Object.keys(body)) next[key] = workspace[key];
        if (pendingSettings.current) next.settings = pendingSettings.current;
        return { ...prev, workspace: next };
      });
      return workspace;
    } catch (error) {
      load();
      throw error;
    }
  }, [load]);

  const toggleStep = useCallback(
    (stepId) => {
      const done = new Set(baseRef.current.workspace?.doneSteps || []);
      if (done.has(stepId)) done.delete(stepId);
      else done.add(stepId);
      return updateWorkspace({ doneSteps: [...done] });
    },
    [updateWorkspace]
  );

  // ---------- Areas and analysis ----------

  const createArea = useCallback(async (body) => {
    const area = await api.createArea(body);
    const { geometry, ...summary } = area;
    setBase((prev) => ({ ...prev, areas: [summary, ...prev.areas.filter((item) => item.id !== area.id)] }));
    return area;
  }, []);

  const setCurrentArea = useCallback(
    async (areaId) => {
      await flushSettings();
      await api.patchWorkspace({ currentAreaId: areaId });
      setChosenRunId(null);
      await load();
    },
    [flushSettings, load]
  );

  // Starts an analysis and gives back a promise of the finished job.
  //   opts: { months: 12, rerun: false }
  const analyzeArea = useCallback(async (areaId, opts = {}) => {
    const started = await api.analyze({ areaId, months: opts.months, rerun: opts.rerun });
    const finished = new Promise((resolve) => {
      const list = jobWaiters.current.get(started.id) || [];
      jobWaiters.current.set(started.id, [...list, resolve]);
    });
    setJob(started);
    return { job: started, finished };
  }, []);

  // Takes an analysis that still waits for its turn out of line (one area
  // at a time, server/jobs.js), or stops one that has started (the months
  // done are kept). Its poll below sees it end and reloads. Throws the
  // server's error (code "cannot_stop" for an analysis started before the
  // server's code was reloaded).
  const cancelAnalysis = useCallback((jobId) => api.cancelJob(jobId), []);

  // Renames an area ({ name }) or sets its war ({ war: { mode, since,
  // name } }), then loads everything again. Throws the server's error (a
  // bad date: code "bad_war_setting"). The saved months keep the war they
  // were made with until the area is analyzed again.
  const updateArea = useCallback(
    async (areaId, body) => {
      const area = await api.updateArea(areaId, body);
      await load();
      return area;
    },
    [load]
  );

  // Country, coordinates or drawing -> saved area -> current area -> analysis.
  const chooseArea = useCallback(
    async (body, { months = 12 } = {}) => {
      const area = await createArea(body);
      await api.patchWorkspace({ currentAreaId: area.id });
      const { job: started, finished } = await analyzeArea(area.id, { months });
      setChosenRunId(null);
      await load();
      return { area, job: started, finished };
    },
    [createArea, analyzeArea, load]
  );

  // Follows the running analysis every second until it ends.
  const jobId = job?.id;
  const jobRunning = job?.status === "running";
  // Its area, for the line said when the server has forgotten it.
  const jobAreaId = useRef(null);
  jobAreaId.current = job?.areaId ?? null;
  useEffect(() => {
    if (!jobId || !jobRunning) return;
    let stopped = false;
    let timer;
    let lastDone = -1;
    const finish = async (final) => {
      setRunCache({});
      await load();
      if (stopped) return;
      // Another analysis of the same area that still runs (the monthly
      // update a person's follow-up waited behind, or the follow-up behind
      // it: load() just picked it) is followed next; else the page keeps
      // the one that ended, so it can say how it ended (AnalysisNotice).
      setJob((prev) => (prev && prev.id !== final.id && prev.status === "running" && prev.areaId === (final.areaId ?? jobAreaId.current) ? prev : final));
      for (const resolve of jobWaiters.current.get(jobId) || []) resolve(final);
      jobWaiters.current.delete(jobId);
    };
    const tick = async () => {
      try {
        const next = await api.getJob(jobId);
        if (stopped) return;
        if (next.status === "running") {
          setJob(next);
          if (next.done !== lastDone) {
            lastDone = next.done;
            refreshRuns();
          }
          timer = setTimeout(tick, POLL_MS);
        } else {
          await finish(next);
        }
      } catch (error) {
        if (stopped) return;
        // The server restarted and forgot the job: show what was saved,
        // and say so on the area's pages (AnalysisNotice).
        if (error.status === 404) await finish({ id: jobId, areaId: jobAreaId.current, status: "error", error: "The analysis was interrupted. Run it again." });
        else timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, jobRunning, load, refreshRuns]);

  // ---------- Team ----------

  const addMember = useCallback(async (body) => {
    const member = await api.addMember(body);
    setBase((prev) => (prev.workspace ? { ...prev, workspace: { ...prev.workspace, team: [...(prev.workspace.team || []), member] } } : prev));
    return member;
  }, []);

  const updateMember = useCallback(async (memberId, body) => {
    const member = await api.updateMember(memberId, body);
    setBase((prev) =>
      prev.workspace
        ? { ...prev, workspace: { ...prev.workspace, team: prev.workspace.team.map((item) => (item.id === memberId ? member : item)) } }
        : prev
    );
    return member;
  }, []);

  const removeMember = useCallback(async (memberId) => {
    await api.removeMember(memberId);
    setBase((prev) =>
      prev.workspace ? { ...prev, workspace: { ...prev.workspace, team: prev.workspace.team.filter((item) => item.id !== memberId) } } : prev
    );
  }, []);

  const selectRun = useCallback((runId) => setChosenRunId(runId || null), []);

  const actions = useMemo(
    () => ({
      reload: load,
      selectRun,
      updateSettings,
      resetSettings,
      updateWorkspace,
      toggleStep,
      createArea,
      setCurrentArea,
      updateArea,
      analyzeArea,
      cancelAnalysis,
      chooseArea,
      addMember,
      updateMember,
      removeMember,
    }),
    [load, selectRun, updateSettings, resetSettings, updateWorkspace, toggleStep, createArea, setCurrentArea, updateArea, analyzeArea, cancelAnalysis, chooseArea, addMember, updateMember, removeMember]
  );

  const value = useMemo(
    () => ({
      status: base.status === "idle" ? "loading" : base.status,
      error: base.error,
      serverStatus: base.serverStatus,
      workspace: base.workspace,
      settings,
      areas: base.areas,
      area: base.area,
      runs,
      runSummary: selectedSummary,
      run,
      runStatus: !selectedSummary ? "none" : run ? "ready" : runError ? "error" : "loading",
      runError,
      scored,
      hotspots,
      job,
      saveError,
      actions,
    }),
    [base, settings, runs, selectedSummary, run, runError, scored, hotspots, job, saveError, actions]
  );

  return <AtlasDataContext.Provider value={value}>{children}</AtlasDataContext.Provider>;
}

export function useAtlasData() {
  const value = useContext(AtlasDataContext);
  if (!value) throw new Error("useAtlasData() must be used inside <AtlasDataProvider> (see src/App.jsx).");
  return value;
}

// ---------- Choices kept in the web address ----------

function useParamChoice(name, allowed, fallback) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name);
  const value = allowed.includes(raw) ? raw : fallback;
  const setValue = useCallback(
    (next) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (!next || next === fallback) updated.delete(name);
          else updated.set(name, next);
          return updated;
        },
        { replace: true }
      );
    },
    [setParams, name, fallback]
  );
  return [value, setValue];
}

// "Near term | Postwar", kept as ?view=postwar.
//   const [timeframe, setTimeframe] = useTimeframe();   // "nearTerm" | "postwar"
export function useTimeframe() {
  const [view, setView] = useParamChoice("view", ["nearTerm", "postwar"], "nearTerm");
  return [view, setView];
}

// How the map is coloured, kept as ?color=damage.
//   const [colorBy, setColorBy] = useColorBy();   // "priority" | "damage" | "access"
export function useColorBy() {
  return useParamChoice("color", ["priority", "damage", "access"], "priority");
}

// ---------- What shows before the page can ----------

// Progress of a running analysis: "Analyzing Ukraine", a bar, "7 of 12 months",
// and while the month waits for Earth Engine to finish a farm's analysis or a
// search, why the bar stands still (job.waiting, server/jobs.js). Stop ends it
// (the months done are kept, and the next area in line starts): one slow or
// huge area (a 24-month re-run of a big country) would otherwise hold every
// other area back for hours. An analysis still waiting for its turn
// (job.queued: one area at a time) says so instead, with Cancel.
export function AnalysisProgress({ job, compact = false }) {
  if (!job) return null;
  if (job.queued) return <WaitingTurn job={job} compact={compact} />;
  const total = job.total || 1;
  const share = Math.min(1, ((job.done || 0) + (job.monthProgress || 0)) / total);
  const month = /:\s*(.+?)\s*\(/.exec(job.message || "")?.[1];
  return (
    <div className={compact ? "atlas-progress is-compact" : "atlas-progress"} role="status" aria-live="polite">
      <div className="atlas-progress-head">
        <Loader2 size={compact ? 14 : 18} className="atlas-spin" aria-hidden="true" />
        <span className="atlas-progress-title">Analyzing {job.areaName || "the area"}</span>
      </div>
      <div className="atlas-progress-track">
        <div className="atlas-progress-fill" style={{ width: `${Math.max(3, share * 100)}%` }} />
      </div>
      <div className="atlas-progress-meta">
        <span>
          {job.done || 0} of {total} months
        </span>
        {month && <span>{month}</span>}
      </div>
      {job.waiting && <p className="atlas-progress-wait">{job.waiting}</p>}
      <StopAnalysis job={job} />
    </div>
  );
}

// Cancels a job that waits for its turn, or stops one that has started
// (server/jobs.js cancelAnalysis): -> { busy, error, run }
function useCancelJob(jobId) {
  const { actions } = useAtlasData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.cancelAnalysis(jobId);
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  };
  return { busy, error, run };
}

// "Months done are kept · Stop" under the bar; "Stopping…" until the server
// has ended the month in progress (job.stopping).
function StopAnalysis({ job }) {
  const stop = useCancelJob(job.id);
  const stopping = Boolean(job.stopping) || stop.busy;
  return (
    <>
      <div className="atlas-progress-meta atlas-progress-stop">
        <span>{stopping ? "Stopping… the months done are kept" : "Months done are kept if you stop"}</span>
        <button type="button" className="atlas-progress-cancel" onClick={stop.run} disabled={stopping}>
          {stopping ? "Stopping…" : "Stop"}
        </button>
      </div>
      {stop.error && <p className="atlas-error-text">{stop.error}</p>}
    </>
  );
}

// An analysis waiting for its turn: "Waiting to analyze Kenya", what it
// waits for ("Waiting for Ukraine's analysis to finish") and Cancel, which
// takes it out of line (it never started, so nothing is lost).
function WaitingTurn({ job, compact }) {
  const { busy: cancelling, error, run: cancel } = useCancelJob(job.id);
  // "Up to": months already analyzed with this method and war setting are
  // kept, so the monthly check of an area usually analyzes only the new one.
  const months = job.total === 1 ? "1 month" : `Up to ${job.total || 12} months`;
  return (
    <div className={compact ? "atlas-progress is-compact is-waiting" : "atlas-progress is-waiting"} role="status" aria-live="polite">
      <div className="atlas-progress-head">
        <Clock size={compact ? 14 : 18} aria-hidden="true" />
        <span className="atlas-progress-title">Waiting to analyze {job.areaName || "the area"}</span>
      </div>
      <p className="atlas-progress-wait">{job.waiting || "Waiting for another area's analysis to finish"}</p>
      <div className="atlas-progress-meta">
        <span>{months} · one area at a time</span>
        <button type="button" className="atlas-progress-cancel" onClick={cancel} disabled={cancelling}>
          {cancelling ? "Cancelling…" : "Cancel"}
        </button>
      </div>
      {error && <p className="atlas-error-text">{error}</p>}
    </div>
  );
}

// What the last analysis of the area did when it did not end as asked
// (src/lib/atlas/analysisNotice.js): after a Stop "Kharkiv oblast: stopped
// after 3 of 12 months. The months analyzed before are kept.", the months
// that could not be analyzed, or the last monthly update's failure ("The
// last monthly update could not analyze 1 month (September 2026): ... The
// next monthly check tries it again within 6 hours; to redo it now, run
// the analysis again from Atlas Settings.") until those months are filled
// in. The cross hides it until something else happens.
//   followed  false: only the monthly update's line (Atlas Settings says
//             how its own re-runs ended)
export function AnalysisNotice({ followed = true, className = "" }) {
  const { area, runs, job } = useAtlasData();
  const [closed, setClosed] = useState(null);
  const notice = analysisNotice({ area, runs, job, followed });
  if (!notice || notice.key === closed) return null;
  return (
    <div className={["atlas-notice", notice.tone === "error" ? "is-error" : "", className].filter(Boolean).join(" ")} role="status">
      {notice.tone === "error" ? <TriangleAlert size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}
      <p>{notice.text}</p>
      <button type="button" className="atlas-notice-close" aria-label="Close this note" onClick={() => setClosed(notice.key)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// The first screen when there is no area yet.
export function AreaSetup() {
  return (
    <div className="page atlas-setup">
      <div className="atlas-setup-card card">
        <div className="atlas-setup-head">
          <h1>Choose an area</h1>
        </div>
        <Suspense fallback={null}>
          <AreaPicker />
        </Suspense>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="page atlas-skeleton" aria-busy="true" aria-label="Loading">
      <div className="atlas-skel atlas-skel-title" />
      <div className="atlas-skel-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="atlas-skel atlas-skel-stat" />
        ))}
      </div>
      <div className="atlas-skel atlas-skel-map" />
    </div>
  );
}

function ErrorBox({ error, onRetry }) {
  return (
    <div className="page">
      <div className="card atlas-error" role="alert">
        <p className="atlas-error-title">
          <TriangleAlert size={16} /> The Atlas could not load
        </p>
        <p className="atlas-error-text">{error?.message || String(error)}</p>
        <div>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

// Shows the page only once there is an area with an analyzed month.
export function AtlasGate({ children }) {
  const { status, error, area, runs, run, runStatus, runError, job, actions } = useAtlasData();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  if (status === "loading") return <Skeleton />;
  if (status === "error") return <ErrorBox error={error} onRetry={actions.reload} />;
  if (!area) return <AreaSetup />;

  const running = job?.status === "running" && job.areaId === area.id;
  if (runs.length === 0) {
    if (running) {
      return (
        <div className="page atlas-setup">
          <div className="atlas-setup-card card">
            <AnalysisProgress job={job} />
          </div>
        </div>
      );
    }
    // Why there is nothing yet: a Stop before the first month was done
    // ("Kenya: stopped before its first month was done."), the error, or
    // the monthly update's failure (analysisNotice).
    const said = analysisNotice({ area, runs, job });
    const start = async () => {
      setStarting(true);
      setStartError(null);
      try {
        await actions.analyzeArea(area.id, { months: 12 });
      } catch (err) {
        setStartError(err);
      } finally {
        setStarting(false);
      }
    };
    return (
      <div className="page atlas-setup">
        <div className="atlas-setup-card card">
          <div className="atlas-setup-head">
            <h1>{area.name}</h1>
            <p className="muted">Not analyzed yet.</p>
          </div>
          {startError ? <p className="atlas-error-text">{startError.message}</p> : said && <p className={said.tone === "error" ? "atlas-error-text" : "atlas-muted-text"}>{said.text}</p>}
          <div className="cluster">
            <Button variant="primary" size="lg" onClick={start} disabled={starting}>
              {starting ? "Starting…" : "Analyze 12 months"}
            </Button>
            <Button variant="ghost" to="/atlas/settings">
              Change area
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (runStatus === "error") return <ErrorBox error={runError} onRetry={actions.reload} />;
  if (!run) return <Skeleton />;
  return children;
}

// The old name, kept so pages not yet updated still work.
export const AtlasDataGate = AtlasGate;
