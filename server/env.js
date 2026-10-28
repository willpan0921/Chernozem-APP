// WHAT THIS FILE DOES
// Reads the private settings in the .env file at the top of the project
// (API keys, the Earth Engine project) and hands them to the rest of the
// server as one tidy object: config().
//
// The .env file is read again whenever it changes, so after adding a key
// the next request already uses it. .env.example lists every setting.
//
// WHO EDITS IT
// Whoever adds a new setting. Add it here AND to .env.example.

import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

// The project folder (one level above this server/ folder).
function findRoot() {
  try {
    if (import.meta.url && import.meta.url.startsWith("file:")) {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    }
  } catch {
    // fall through
  }
  return process.cwd();
}

export const ROOT = findRoot();
export const ENV_FILE = path.join(ROOT, ".env");

// Remembers which keys came from .env (so an edited .env can replace them)
// and when the file was last read. Kept on globalThis so the dev server,
// which reloads this file after edits, does not lose track.
const memory = (globalThis.__chernozemEnv ??= { mtimeMs: -1, fromFile: new Set() });

function loadEnvFile() {
  let stat;
  try {
    stat = fs.statSync(ENV_FILE);
  } catch {
    // No .env file: clear the keys an earlier .env set, keep the rest.
    if (memory.mtimeMs !== 0) {
      for (const key of memory.fromFile) delete process.env[key];
      memory.fromFile.clear();
      memory.mtimeMs = 0;
    }
    return;
  }
  if (stat.mtimeMs === memory.mtimeMs) return;
  memory.mtimeMs = stat.mtimeMs;
  let values = {};
  try {
    values = parseEnv(fs.readFileSync(ENV_FILE, "utf8"));
  } catch (error) {
    console.warn(`[chernozem] Could not read .env: ${error.message}`);
    return;
  }
  // Keys removed from .env since the last read are removed again.
  for (const key of memory.fromFile) {
    if (!(key in values)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    // A value set in the real environment (not by .env) wins.
    if (process.env[key] !== undefined && !memory.fromFile.has(key)) continue;
    process.env[key] = value;
    memory.fromFile.add(key);
  }
}

// Reads the Earth Engine service-account key, either pasted whole into
// GEE_SERVICE_ACCOUNT_JSON or saved as a file named by
// GOOGLE_APPLICATION_CREDENTIALS. Gives back { credentials, error }.
function readGeeCredentials() {
  const inline = (process.env.GEE_SERVICE_ACCOUNT_JSON || "").trim();
  const file = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  let text = null;
  let where = "";
  if (inline) {
    text = inline;
    where = "GEE_SERVICE_ACCOUNT_JSON";
  } else if (file) {
    const full = path.isAbsolute(file) ? file : path.join(ROOT, file);
    try {
      text = fs.readFileSync(full, "utf8");
      where = `the key file ${file}`;
    } catch {
      return { credentials: null, error: `GOOGLE_APPLICATION_CREDENTIALS points to ${file}, but that file cannot be read.` };
    }
  } else {
    return { credentials: null, error: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { credentials: null, error: `${where} is not valid JSON. Paste the whole service-account key file.` };
  }
  if (!parsed || typeof parsed !== "object" || !parsed.client_email || !parsed.private_key) {
    return { credentials: null, error: `${where} is missing client_email or private_key. Use a service-account key (JSON) from Google Cloud.` };
  }
  return { credentials: parsed, error: null };
}

// Reads .env again if it changed (config() does this too).
export function refreshEnv() {
  loadEnvFile();
}

// True when the server runs on Render, the host of https://chernozem.app
// (docs/DEPLOY.md), which always sets RENDER=true. A few safety rules
// apply only there (server/online.js, server/auth.js).
export function onRender(env = process.env) {
  const value = String(env.RENDER ?? "").trim().toLowerCase();
  return value !== "" && !["0", "false", "no", "off"].includes(value);
}

// Everything the server needs to know from the environment.
export function config() {
  loadEnvFile();
  const env = process.env;
  const { credentials, error } = readGeeCredentials();
  const flag = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
  const acled = (env.ACLED_CSV_PATH || "").trim();
  return {
    anthropicKey: (env.ANTHROPIC_API_KEY || "").trim() || null,
    claudeModel: (env.CLAUDE_MODEL || "").trim() || "claude-opus-5-5",
    // The project id can also come from the key file itself.
    geeProjectId: (env.GEE_PROJECT_ID || "").trim() || credentials?.project_id || null,
    geeCredentials: credentials,
    geeCredentialsError: error,
    // Not in .env at all: the Ukraine black-soil map. Set but left blank,
    // or "none": no map (soil organic carbon is used everywhere).
    chernozemAsset:
      env.GEE_CHERNOZEM_ASSET === undefined ? "projects/zhaobo/assets/chernozem_wrb_ukraine" : env.GEE_CHERNOZEM_ASSET.trim() || "none",
    acledCsvPath: acled ? (path.isAbsolute(acled) ? acled : path.join(ROOT, acled)) : null,
    geeDisabled: flag(env.GEE_DISABLED),
    port: Number(env.PORT) || 8787,
    // Registered accounts (server/accounts.js): the Firebase project whose
    // sign-ins are accepted. Blank: the Earth Engine project (same Google
    // Cloud project), else "chernozem-danny". "none" or "off" switches
    // accounts off (the register page then says so).
    firebaseProjectId: (env.FIREBASE_PROJECT_ID || "").trim() || null,
    // Only on one's own computer: the local Firebase Auth emulator, for
    // example 127.0.0.1:9099. The Firebase library reads it itself.
    firebaseEmulatorHost: (env.FIREBASE_AUTH_EMULATOR_HOST || "").trim() || null,
  };
}

// Which Earth Engine settings are still missing, by their .env names.
export function missingGeeSettings(env = config()) {
  const missing = [];
  if (!env.geeProjectId) missing.push("GEE_PROJECT_ID");
  if (!env.geeCredentials) missing.push("GEE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS");
  return missing;
}
