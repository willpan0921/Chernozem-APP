// WHAT THIS FILE DOES
// Keeps the Field product's data in one place and shares it with every
// Field page and the sidebar: the farm and its fields, each field's latest
// analysis (with the zones grid and season curve), the data source
// (Earth Engine or sample), the running analysis and the weather.
//
// It is mounted ONCE around the whole app (src/App.jsx, next to the Atlas
// data), and loads the first time a Field page opens.
//
// HOW A PAGE USES IT
//   const { status, error, farm, analyses, provider, job, weather, actions } = useFieldData();
//   <FarmGate> ...page... </FarmGate>
//
//   status    "loading" | "ready" | "error"
//   farm      { id, name, location, boundary, fields: [...], units, autoUpdate, demo } | null
//   analyses  { [fieldId]: analysis }   (full: season, normalCurve and zones included)
//   provider  { id: "sample" | "gee", label, ok, detail, ... }
//   job       the running (or last) analysis job { id, kind, status, done, total, message, error } | null
//   weather   { current, rain, daily, at, stale } | null  (weatherError when it failed)
//   actions:
//     reload()
//     loadDemo()                     -> { farm, job, finished }
//     detect(body, { onProgress, signal })  -> { candidates, boundary, provider, warnings }
//     saveFarm(body)                 -> { farm, job, finished }   (PUT /api/farm)
//     addField(body)                 -> { field, job, finished }
//     updateField(id, { name?, crop? })   -> field
//     removeField(id)
//     updateFarm({ name?, units?, autoUpdate?, location? })  -> farm
//     deleteFarm()                   start over (the setup screen shows)
//     analyze(fieldIds?)             -> { job, finished }
//     report({ fieldId?, kind, text, files?: [File], photos?: [prepared] })  -> report
//     fieldDetail(id)                -> { analysis, history }
//     reloadWeather()
//   "finished" is a promise of the job once it has ended.
//
// <FarmGate> shows, instead of the page: a loading skeleton, an error box
// with "Try again", the farm setup when there is no farm yet, or the
// progress card while the first analysis runs. Inside it a page can
// assume farm.fields and at least one analysis are there.
//
// WHO EDITS IT
// Whoever changes what data the Field pages share. To change how the
// server is called, edit src/api/fieldApi.js.

import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import * as api from "../api/fieldApi.js";
import { Button } from "../components/ui/index.js";
import "../components/field/field.css";

// The farm setup shows a map, so it (and the map library) is only
// downloaded when the setup screen opens.
const FarmSetup = lazy(() => import("../components/field/FarmSetup.jsx"));

const FieldDataContext = createContext(null);
const POLL_MS = 1000;
const WEATHER_REFRESH_MS = 30 * 60 * 1000;

export function FieldDataProvider({ children }) {
  const { pathname } = useLocation();
  const inField = pathname === "/" || pathname.startsWith("/field");

  const [base, setBase] = useState({ status: "idle", error: null, farm: null, analyses: {}, provider: null });
  const [job, setJob] = useState(null);
  const [weather, setWeather] = useState({ data: null, error: null, at: 0, farmKey: null });
  const loadSeq = useRef(0);
  const jobWaiters = useRef(new Map());

  // ---------- Loading ----------

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setBase((prev) => (prev.status === "ready" ? prev : { ...prev, status: "loading", error: null }));
    try {
      const answer = await api.getFarm({ full: true });
      if (seq !== loadSeq.current) return answer;
      setBase({ status: "ready", error: null, farm: answer.farm || null, analyses: answer.analyses || {}, provider: answer.provider || null });
      if (answer.job?.status === "running") setJob((prev) => (prev?.id === answer.job.id && prev.status === "running" ? prev : answer.job));
      return answer;
    } catch (error) {
      if (seq === loadSeq.current) setBase((prev) => ({ ...prev, status: prev.status === "ready" ? "ready" : "error", error }));
      throw error;
    }
  }, []);

  const reload = useCallback(() => load().catch(() => null), [load]);

  useEffect(() => {
    if (inField && base.status === "idle") reload();
  }, [inField, base.status, reload]);

  // ---------- Following the analysis ----------

  const startFollowing = useCallback((started) => {
    const finished = new Promise((resolve) => {
      const list = jobWaiters.current.get(started.id) || [];
      jobWaiters.current.set(started.id, [...list, resolve]);
    });
    setJob(started);
    if (started.status !== "running") {
      // Already over (the server gave back a finished job).
      for (const resolve of jobWaiters.current.get(started.id) || []) resolve(started);
      jobWaiters.current.delete(started.id);
    }
    return finished;
  }, []);

  const jobId = job?.id;
  const jobRunning = job?.status === "running";
  useEffect(() => {
    if (!jobId || !jobRunning) return;
    let stopped = false;
    let timer;
    let lastDone = -1;
    const finish = async (final) => {
      await load().catch(() => null);
      if (stopped) return;
      setJob(final);
      for (const resolve of jobWaiters.current.get(jobId) || []) resolve(final);
      jobWaiters.current.delete(jobId);
    };
    const tick = async () => {
      try {
        const next = await api.getJob(jobId);
        if (stopped) return;
        if (next.status === "running") {
          setJob(next);
          // Analyses are saved before the history is read: show them as
          // soon as they are there.
          if (next.done !== lastDone) {
            lastDone = next.done;
            load().catch(() => null);
          }
          timer = setTimeout(tick, POLL_MS);
        } else {
          await finish(next);
        }
      } catch (error) {
        if (stopped) return;
        if (error.status === 404) await finish({ id: jobId, kind: "field-analyze", status: "error", error: "The analysis was interrupted. Run it again." });
        else timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, jobRunning, load]);

  // ---------- Weather ----------

  const farm = base.farm;
  const farmKey = farm?.fields?.length ? `${farm.id}:${farm.fields.map((f) => f.id).join(",")}` : null;
  const loadWeather = useCallback(async (key) => {
    try {
      const data = await api.getWeather();
      setWeather({ data, error: null, at: Date.now(), farmKey: key });
    } catch (error) {
      setWeather({ data: null, error, at: Date.now(), farmKey: key });
    }
  }, []);

  useEffect(() => {
    if (!inField || !farmKey) return;
    if (weather.farmKey === farmKey && Date.now() - weather.at < WEATHER_REFRESH_MS) return;
    loadWeather(farmKey);
  }, [inField, farmKey, weather.farmKey, weather.at, loadWeather]);

  // ---------- Actions ----------

  const setFarm = useCallback((nextFarm) => {
    setBase((prev) => {
      const ids = new Set((nextFarm?.fields || []).map((f) => f.id));
      const analyses = Object.fromEntries(Object.entries(prev.analyses).filter(([id]) => ids.has(id)));
      return { ...prev, status: "ready", farm: nextFarm, analyses };
    });
  }, []);

  const loadDemo = useCallback(async () => {
    const { farm: made, job: started } = await api.loadDemoFarm();
    setFarm(made);
    const finished = started ? startFollowing(started) : Promise.resolve(null);
    return { farm: made, job: started, finished };
  }, [setFarm, startFollowing]);

  const detect = useCallback(async (body, { onProgress, signal } = {}) => {
    const started = await api.detectFields(body);
    onProgress?.(started);
    const done = await api.pollJob(started.id, { onProgress, signal, intervalMs: 700 });
    return done.result || { candidates: [], boundary: null, provider: null, warnings: [] };
  }, []);

  const saveFarm = useCallback(
    async (body) => {
      const { farm: saved, job: started } = await api.saveFarm(body);
      setFarm(saved);
      const finished = started ? startFollowing(started) : Promise.resolve(null);
      return { farm: saved, job: started, finished };
    },
    [setFarm, startFollowing]
  );

  const addField = useCallback(
    async (body) => {
      const { field, job: started } = await api.addField(body);
      setBase((prev) => ({ ...prev, farm: prev.farm ? { ...prev.farm, fields: [...prev.farm.fields, field] } : prev.farm }));
      load().catch(() => null);
      const finished = started ? startFollowing(started) : Promise.resolve(null);
      return { field, job: started, finished };
    },
    [load, startFollowing]
  );

  const updateField = useCallback(async (fieldId, body) => {
    const field = await api.updateField(fieldId, body);
    setBase((prev) => (prev.farm ? { ...prev, farm: { ...prev.farm, fields: prev.farm.fields.map((f) => (f.id === fieldId ? { ...f, ...field } : f)) } } : prev));
    return field;
  }, []);

  const removeField = useCallback(
    async (fieldId) => {
      await api.removeField(fieldId);
      setBase((prev) => {
        if (!prev.farm) return prev;
        const { [fieldId]: _gone, ...analyses } = prev.analyses;
        return { ...prev, farm: { ...prev.farm, fields: prev.farm.fields.filter((f) => f.id !== fieldId) }, analyses };
      });
      return true;
    },
    []
  );

  const updateFarm = useCallback(async (body) => {
    const saved = await api.patchFarm(body);
    setBase((prev) => ({ ...prev, farm: saved }));
    return saved;
  }, []);

  const deleteFarm = useCallback(async () => {
    await api.deleteFarm();
    setJob(null);
    setWeather({ data: null, error: null, at: 0, farmKey: null });
    setBase((prev) => ({ ...prev, farm: null, analyses: {} }));
    return true;
  }, []);

  const analyze = useCallback(
    async (fieldIds) => {
      const started = await api.analyze(fieldIds);
      return { job: started, finished: startFollowing(started) };
    },
    [startFollowing]
  );

  const report = useCallback(async ({ files, photos, ...rest } = {}) => {
    const prepared = [...(photos || [])];
    for (const file of files || []) prepared.push(await api.preparePhoto(file));
    return api.createReport({ ...rest, photos: prepared });
  }, []);

  const fieldDetail = useCallback((fieldId) => api.getFieldAnalysis(fieldId), []);
  const reloadWeather = useCallback(() => loadWeather(farmKey), [loadWeather, farmKey]);

  const actions = useMemo(
    () => ({ reload, loadDemo, detect, saveFarm, addField, updateField, removeField, updateFarm, deleteFarm, analyze, report, fieldDetail, reloadWeather }),
    [reload, loadDemo, detect, saveFarm, addField, updateField, removeField, updateFarm, deleteFarm, analyze, report, fieldDetail, reloadWeather]
  );

  const value = useMemo(
    () => ({
      status: base.status === "idle" ? "loading" : base.status,
      error: base.error,
      farm: base.farm,
      analyses: base.analyses,
      provider: base.provider,
      job,
      weather: weather.farmKey === farmKey ? weather.data : null,
      weatherError: weather.farmKey === farmKey ? weather.error : null,
      actions,
    }),
    [base, job, weather, farmKey, actions]
  );

  return <FieldDataContext.Provider value={value}>{children}</FieldDataContext.Provider>;
}

export function useFieldData() {
  const value = useContext(FieldDataContext);
  if (!value) throw new Error("useFieldData() must be used inside <FieldDataProvider> (see src/App.jsx).");
  return value;
}

// ---------- What shows before the page can ----------

// "Analysing 7 fields", a bar, "3 of 7".
export function FieldProgress({ job, compact = false }) {
  if (!job) return null;
  const total = job.total || 1;
  const share = Math.min(1, (job.done || 0) / total);
  const title = job.kind === "field-detect" ? "Finding your fields" : "Analysing your fields";
  return (
    <div className={compact ? "fd-progress is-compact" : "fd-progress"} role="status" aria-live="polite">
      <div className="fd-progress-head">
        <Loader2 size={compact ? 14 : 18} className="fd-spin" aria-hidden="true" />
        <span className="fd-progress-title">{title}</span>
      </div>
      <div className="fd-progress-track">
        <div className="fd-progress-fill" style={{ width: `${Math.max(4, share * 100)}%` }} />
      </div>
      <div className="fd-progress-meta">
        <span>{job.kind === "field-detect" ? `${Math.round(share * 100)}%` : `${job.done || 0} of ${total}`}</span>
        {job.message && <span className="fd-progress-msg">{job.message}</span>}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="page fd-skeleton" aria-busy="true" aria-label="Loading">
      <div className="fd-skel fd-skel-title" />
      <div className="fd-skel-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="fd-skel fd-skel-stat" />
        ))}
      </div>
      <div className="fd-skel fd-skel-map" />
    </div>
  );
}

function ErrorBox({ error, onRetry }) {
  return (
    <div className="page">
      <div className="card fd-error" role="alert">
        <p className="fd-error-title">
          <TriangleAlert size={16} /> Your farm could not load
        </p>
        <p className="fd-error-text">{error?.message || String(error)}</p>
        <div>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

// The farm setup as a whole page (no farm yet).
export function FarmSetupPage() {
  return (
    <div className="page-full fs-page">
      <Suspense fallback={null}>
        <FarmSetup />
      </Suspense>
    </div>
  );
}

// Shows the page only once there is a farm with at least one analysed field.
export function FarmGate({ children }) {
  const { status, error, farm, analyses, job, actions } = useFieldData();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  if (status === "loading") return <Skeleton />;
  if (status === "error") return <ErrorBox error={error} onRetry={actions.reload} />;
  if (!farm || !farm.fields?.length) return <FarmSetupPage />;

  const analysed = farm.fields.some((field) => analyses[field.id]);
  if (!analysed) {
    const running = job?.status === "running";
    if (running) {
      return (
        <div className="page fd-center">
          <div className="card fd-card">
            <div className="fd-card-head">
              <h1>{farm.name}</h1>
              <p className="muted">{farm.fields.length === 1 ? "1 field" : `${farm.fields.length} fields`}</p>
            </div>
            <FieldProgress job={job} />
          </div>
        </div>
      );
    }
    const failed = job?.status === "error" ? job.error : null;
    const start = async () => {
      setStarting(true);
      setStartError(null);
      try {
        await actions.analyze();
      } catch (err) {
        setStartError(err);
      } finally {
        setStarting(false);
      }
    };
    return (
      <div className="page fd-center">
        <div className="card fd-card">
          <div className="fd-card-head">
            <h1>{farm.name}</h1>
            <p className="muted">Not analysed yet.</p>
          </div>
          {(failed || startError) && <p className="fd-error-text">{startError?.message || failed}</p>}
          <div className="cluster">
            <Button variant="primary" size="lg" onClick={start} disabled={starting}>
              {starting ? "Starting…" : "Analyse now"}
            </Button>
            <Button variant="ghost" to="/field/settings">
              Change farm
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return children;
}
