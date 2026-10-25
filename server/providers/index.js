// WHAT THIS FILE DOES
// Picks where the Atlas gets its numbers from:
//   - Google Earth Engine (gee.js) when GEE_PROJECT_ID and a service-account
//     key are in .env (and GEE_DISABLED is not 1)
//   - otherwise the sample data source (sample.js)
// If Earth Engine is set up but cannot connect, the status pages show the
// sample source and say why, and it tries Earth Engine again every 5
// minutes. Analyses do NOT quietly run on sample data then (that would save
// made-up numbers for real places): they stop with a retryable "Earth
// Engine unavailable" error (unavailableError / fieldUnavailableError).
//
//   getProvider()     the data source to use now
//   providerStatus()  { id, label, ok, detail, missing } for the Settings page
//                     (answers within 3 s, even while Earth Engine signs in)
//   getFieldProvider() / fieldProviderStatus()
//                     the same for the Field product (field-gee.js or
//                     field-sample.js); see the end of this file
//   unavailableError(provider) / fieldUnavailableError(provider)
//                     an Error to stop a job with when Earth Engine is set
//                     up but could not connect (null otherwise)
//
// WHO EDITS IT
// Nobody, normally. Connecting Earth Engine only needs the .env settings.

import { config, missingGeeSettings } from "../env.js";
import { sampleProvider } from "./sample.js";

const RETRY_MS = 5 * 60 * 1000;
const state = (globalThis.__chernozemProvider ??= { key: null, provider: null, detail: null, fallback: false, checkedAt: 0 });

// gee.js may export a factory or a ready object; accept either.
function resolveGee(mod, env) {
  const candidate = mod.createGeeProvider || mod.default || mod.geeProvider || mod.provider;
  if (!candidate) throw new Error("server/providers/gee.js does not export a provider.");
  const provider = typeof candidate === "function" ? candidate(env) : candidate;
  if (!provider || typeof provider.analyze !== "function") throw new Error("server/providers/gee.js does not provide analyze().");
  return provider;
}

// The Earth Engine provider built from the gee.js loaded now: the saved one
// while gee.js is the same module, else a new one from the current module
// (see getProvider).
async function currentGee(env) {
  const build = state.geeBuild;
  let mod;
  try {
    mod = await import("./gee.js");
  } catch {
    return build.provider;
  }
  if (mod === build.module) return build.provider;
  try {
    const provider = resolveGee(mod, env);
    // Only if nothing else replaced the saved provider meanwhile.
    if (state.geeBuild === build && state.provider === build.provider) {
      state.geeBuild = { provider, module: mod };
      state.provider = provider;
    }
    return provider;
  } catch {
    return build.provider;
  }
}

function sampleDetail(env) {
  if (env.geeDisabled) return "Sample data (GEE_DISABLED=1 in .env).";
  if (env.geeCredentialsError) return `Sample data. Earth Engine key problem: ${env.geeCredentialsError}`;
  const missing = missingGeeSettings(env);
  return `Sample data. To use Earth Engine, add ${missing.join(" and ")} to .env.`;
}

export async function getProvider() {
  const env = config();
  const wantGee = Boolean(env.geeCredentials && env.geeProjectId && !env.geeDisabled);
  const key = wantGee ? `gee:${env.geeProjectId}:${env.geeCredentials.client_email}` : `sample:${env.geeDisabled}:${env.geeCredentialsError || ""}`;
  const fresh = state.key === key && state.provider && !(state.fallback && Date.now() - state.checkedAt > RETRY_MS);
  // The saved choice outlives dev-server reloads, so for sample data hand back
  // this module's copy: edits to sample.js then reach the running server.
  // So too for Earth Engine: a provider this file built from an older copy
  // of gee.js (the dev server reloaded it after an edit or a merge) is
  // built again from the current one, so new methods (the states' borders,
  // the soil types) reach the running server. No new sign-in: gee.js keeps
  // its connection on globalThis. A provider put there by a test is kept.
  if (fresh) {
    if (state.provider.id === "sample") return sampleProvider;
    if (state.provider.id === "gee" && state.geeBuild?.provider === state.provider) return currentGee(env);
    return state.provider;
  }

  // Only one connection attempt at a time.
  if (state.pending && state.pendingKey === key) return state.pending;
  state.pendingKey = key;
  state.pending = (async () => {
    let provider = sampleProvider;
    let detail = sampleDetail(env);
    let fallback = false;
    if (wantGee) {
      try {
        const mod = await import("./gee.js");
        const gee = resolveGee(mod, env);
        const status = await gee.status();
        if (!status || !status.ok) throw new Error(status?.detail || "Earth Engine did not answer.");
        provider = gee;
        state.geeBuild = { provider: gee, module: mod };
        detail = status.detail || "Connected to Earth Engine.";
      } catch (error) {
        fallback = true;
        detail = `Earth Engine is set up but could not connect: ${error.message}. Using sample data until it does.`;
        console.warn(`[chernozem] ${detail}`);
      }
    }
    const before = state.provider?.id;
    Object.assign(state, { key, provider, detail, fallback, checkedAt: Date.now() });
    // Earth Engine just came on (it was sample data before): start the
    // monthly check now, so the real data replaces the sample months
    // without anyone clicking Re-run. (The first start is covered by the
    // scheduler's own check.)
    if (before === "sample" && provider.id !== "sample" && globalThis.__chernozemScheduler?.started) {
      import("../scheduler.js")
        .then((mod) => mod.checkNow())
        .catch((error) => console.warn(`[chernozem] Could not start the monthly check: ${error.message}`));
    }
    return provider;
  })();
  try {
    return await state.pending;
  } finally {
    state.pending = null;
  }
}

// The error a job stops with when Earth Engine is set up but could not
// connect (the provider handed back is the sample one): code
// "gee_unavailable", status 503, retryable. Null when the provider is the
// one that was asked for.
function outage(provider, saved) {
  if (!provider || provider.id !== "sample" || !saved.fallback) return null;
  const error = new Error("Earth Engine is set up but cannot be reached right now, so nothing was analysed (sample numbers are never saved for a real place). Try again in a few minutes.");
  error.code = "gee_unavailable";
  error.status = 503;
  error.retryable = true;
  error.detail = saved.detail;
  return error;
}

export function unavailableError(provider) {
  return outage(provider, state);
}

// Waits at most ms for promise; gives back `fallback` if it takes longer.
export function withTimeout(promise, ms, fallback = undefined) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    timer.unref?.();
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), late]);
}

// Signing in to Earth Engine can take a minute when Google is slow. The
// status answers within 3 seconds with the last known state, and the
// sign-in carries on in the background.
const STATUS_WAIT_MS = 3000;

export async function providerStatus() {
  const env = config();
  const attempt = getProvider();
  attempt.catch(() => {});
  let provider = await withTimeout(attempt, STATUS_WAIT_MS, null);
  let connecting = false;
  if (!provider) {
    connecting = true;
    provider = state.provider || sampleProvider;
  }
  const detail = connecting && !state.provider ? "Connecting to Earth Engine…" : state.detail;
  return {
    id: provider.id,
    label: provider.id === "gee" ? provider.label || "Earth Engine" : "Sample data",
    // false while Earth Engine is signing in, or after it failed and the
    // sample data is used instead.
    ok: !state.fallback && !connecting,
    detail,
    connecting,
    // What Settings shows: is Earth Engine requested, and what is missing.
    configured: Boolean(env.geeCredentials && env.geeProjectId),
    fallbackFrom: state.fallback ? "gee" : null,
    missing: provider.id === "gee" ? [] : missingGeeSettings(env),
    credentialsError: env.geeCredentialsError || null,
    checkedAt: state.checkedAt ? new Date(state.checkedAt).toISOString() : null,
  };
}

// Forget the cached choice (used after .env changes are detected or in tests).
export function resetProvider() {
  Object.assign(state, { key: null, provider: null, detail: null, fallback: false, checkedAt: 0, geeBuild: null });
}

// ---------- The Field product's data source ----------
// Same switch for the Field: Earth Engine (field-gee.js) when it is set up,
// otherwise the sample source (field-sample.js), with the same fallback and
// 5-minute retry as the Atlas.
//
//   getFieldProvider()     the Field data source to use now
//   fieldProviderStatus()  { id, label, ok, detail, ... } like providerStatus()

import { fieldSampleProvider } from "./field-sample.js";

const fieldState = (globalThis.__chernozemFieldProvider ??= { key: null, provider: null, detail: null, fallback: false, checkedAt: 0 });

// field-gee.js exports a ready provider (default or fieldGeeProvider), or a
// factory createFieldGeeProvider({ getConfig }).
function resolveFieldGee(mod) {
  let provider = mod.default || mod.fieldGeeProvider || null;
  if (!provider && typeof mod.createFieldGeeProvider === "function") provider = mod.createFieldGeeProvider({ getConfig: config });
  if (typeof provider === "function") provider = provider({ getConfig: config });
  if (!provider || typeof provider.analyzeFields !== "function" || typeof provider.detectFields !== "function") {
    throw new Error("server/providers/field-gee.js does not provide detectFields() and analyzeFields().");
  }
  return provider;
}

export async function getFieldProvider() {
  const env = config();
  const wantGee = Boolean(env.geeCredentials && env.geeProjectId && !env.geeDisabled);
  const key = wantGee ? `gee:${env.geeProjectId}:${env.geeCredentials.client_email}` : `sample:${env.geeDisabled}:${env.geeCredentialsError || ""}`;
  const fresh = fieldState.key === key && fieldState.provider && !(fieldState.fallback && Date.now() - fieldState.checkedAt > RETRY_MS);
  if (fresh) return fieldState.provider.id === "sample" ? fieldSampleProvider : fieldState.provider;

  if (fieldState.pending && fieldState.pendingKey === key) return fieldState.pending;
  fieldState.pendingKey = key;
  fieldState.pending = (async () => {
    let provider = fieldSampleProvider;
    let detail = sampleDetail(env);
    let fallback = false;
    if (wantGee) {
      try {
        const mod = await import("./field-gee.js");
        const gee = resolveFieldGee(mod);
        const status = await gee.status();
        if (!status || !status.ok) throw new Error(status?.detail || "Earth Engine did not answer.");
        provider = gee;
        detail = status.detail || "Connected to Earth Engine.";
      } catch (error) {
        fallback = true;
        detail = `Earth Engine is set up but could not connect: ${error.message}. Using sample data until it does.`;
        console.warn(`[chernozem] Field: ${detail}`);
      }
    }
    const before = fieldState.provider?.id;
    Object.assign(fieldState, { key, provider, detail, fallback, checkedAt: Date.now() });
    // Earth Engine just came on: let the scheduler redo the sample analyses.
    if (before === "sample" && provider.id !== "sample" && globalThis.__chernozemScheduler?.started) {
      import("../scheduler.js")
        .then((mod) => (mod.checkFieldsNow || mod.checkNow)())
        .catch((error) => console.warn(`[chernozem] Could not start the field check: ${error.message}`));
    }
    return provider;
  })();
  try {
    return await fieldState.pending;
  } finally {
    fieldState.pending = null;
  }
}

export async function fieldProviderStatus() {
  const env = config();
  const attempt = getFieldProvider();
  attempt.catch(() => {});
  let provider = await withTimeout(attempt, STATUS_WAIT_MS, null);
  let connecting = false;
  if (!provider) {
    connecting = true;
    provider = fieldState.provider || fieldSampleProvider;
  }
  const detail = connecting && !fieldState.provider ? "Connecting to Earth Engine…" : fieldState.detail;
  return {
    id: provider.id,
    label: provider.id === "gee" ? provider.label || "Earth Engine" : "Sample data",
    ok: !fieldState.fallback && !connecting,
    detail,
    connecting,
    configured: Boolean(env.geeCredentials && env.geeProjectId),
    fallbackFrom: fieldState.fallback ? "gee" : null,
    missing: provider.id === "gee" ? [] : missingGeeSettings(env),
    credentialsError: env.geeCredentialsError || null,
    checkedAt: fieldState.checkedAt ? new Date(fieldState.checkedAt).toISOString() : null,
  };
}

export function fieldUnavailableError(provider) {
  return outage(provider, fieldState);
}

export function resetFieldProvider() {
  Object.assign(fieldState, { key: null, provider: null, detail: null, fallback: false, checkedAt: 0 });
}
