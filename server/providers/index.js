// WHAT THIS FILE DOES
// Picks where the Atlas gets its numbers from:
//   - Google Earth Engine (gee.js) when GEE_PROJECT_ID and a service-account
//     key are in .env (and GEE_DISABLED is not 1)
//   - otherwise the sample data source (sample.js)
// If Earth Engine is set up but cannot connect, the sample source is used
// and /api/status says why. It tries Earth Engine again every 5 minutes.
//
//   getProvider()     the data source to use now
//   providerStatus()  { id, label, ok, detail, missing } for the Settings page
//                     (answers within 3 s, even while Earth Engine signs in)
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
  if (fresh) return state.provider.id === "sample" ? sampleProvider : state.provider;

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
  Object.assign(state, { key: null, provider: null, detail: null, fallback: false, checkedAt: 0 });
}
