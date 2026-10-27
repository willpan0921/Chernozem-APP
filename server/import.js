// WHAT THIS FILE DOES
// A one-time upload of saved data into this server: the owner's farm,
// Atlas areas and months, from their computer to the new server at
// chernozem.app. scripts/export-data.js makes and sends the upload; which
// files may travel is decided in server/bundle.js.
//
//   POST /api/admin/import
//     header  Authorization: Bearer <IMPORT_TOKEN>
//     body    { files: { "<path in the data folder>": "<the file's text>" },
//               replace?: true }                       (up to 45 MB)
//     answer  { written: <number of files>, skipped: [{ path, reason }] }
//
// The export script sends the data in parts of about 16 MB, one request
// each (reading a request takes several times its size in memory, and the
// server online has 512 MB); the parts after the first say replace.
//
// The address exists only while IMPORT_TOKEN is set on the server (without
// it: 404; a token shorter than 16 characters keeps it off too, with a 503
// that says so). The token alone lets the upload in (no access code
// needed); it is compared in constant time, and 10 wrong tokens from one
// address lock it out for 10 minutes, like wrong access codes.
//
// What is checked before anything is written:
//   - a path that could leave the data folder (".." or an absolute path),
//     or a file that is not a JSON object, refuses the whole upload (400)
//   - names the app does not read (auth.json, lock files...) are left out
//     and listed in "skipped"
//   - an upload into a server that already has Atlas areas, months or a
//     farm is refused (409), unless replace is true: then each file sent
//     replaces the file of the same name (the others are kept)
//   - not while an analysis is running (409)
// Each file is written safely (a temporary file, then renamed), the
// months before their areas and the workspace last (server/bundle.js
// writeOrder), so the monthly check never sees an area without its
// months. One line goes to the server log.
//
// Remove IMPORT_TOKEN once the upload is done: the address disappears.
//
// WHO EDITS IT
// Nobody, normally. docs/DEPLOY.md says how the owner uses it.

import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { refreshEnv } from "./env.js";
import { dataDir } from "./store.js";
import { HttpError, readJson, sendJson } from "./http.js";
import { UPLOAD_MAX_BYTES, checkBundlePath, isJsonObjectText, writeOrder } from "./bundle.js";
import { clientAddress, codesMatch, createLoginLimiter } from "./auth.js";
import { listJobs } from "./jobs.js";

export const IMPORT_MAX_BYTES = UPLOAD_MAX_BYTES;
// A token anyone could guess must not open an address that can replace
// all the data.
export const IMPORT_TOKEN_MIN_LENGTH = 16;

// Kept on globalThis like the access code's limiter (server/auth.js).
const memory = (globalThis.__chernozemImport ??= { limiter: null, busy: false });

// The upload token from the environment, or null (the address is off).
export function importToken() {
  refreshEnv();
  return (process.env.IMPORT_TOKEN || "").trim() || null;
}

// For tests: forget every wrong token.
export function resetImportLimits() {
  memory.limiter = null;
}

function bearerToken(header) {
  const match = /^Bearer[ \t]+(\S{1,1024})[ \t]*$/i.exec(String(header || ""));
  return match ? match[1] : null;
}

// The files to write ([path, text], in the order they are written) and the
// ones left out. Throws a 400 for anything that refuses the whole upload.
export function checkUploadFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new HttpError(400, "bad_bundle", 'Send the files as { "files": { "<path>": "<text>" } }.');
  }
  const write = [];
  const skipped = [];
  for (const [rel, text] of Object.entries(files)) {
    const verdict = checkBundlePath(rel);
    const shown = JSON.stringify(String(rel).slice(0, 120));
    if (verdict.unsafe) throw new HttpError(400, "bad_path", `Refused: ${shown} is ${verdict.unsafe}. Nothing was written.`);
    if (verdict.skip) {
      skipped.push({ path: rel, reason: verdict.skip });
      continue;
    }
    if (typeof text !== "string") throw new HttpError(400, "bad_file", `Refused: ${shown} must be the file's text. Nothing was written.`);
    if (!isJsonObjectText(text)) throw new HttpError(400, "bad_file", `Refused: ${shown} is not a JSON object. Nothing was written.`);
    write.push([rel, text]);
  }
  if (!write.length) throw new HttpError(400, "empty_bundle", "The upload has no data files to write. Nothing was written.");
  return { write: writeOrder(write), skipped };
}

async function countJson(folder) {
  try {
    return (await fs.readdir(folder)).filter((name) => name.endsWith(".json")).length;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return 0;
    throw error;
  }
}

// What this server already has: { areas, runs, farm }.
export async function existingData(dir = dataDir()) {
  const [areas, runs] = await Promise.all([countJson(path.join(dir, "areas")), countJson(path.join(dir, "runs"))]);
  const farm = await fs
    .access(path.join(dir, "farm.json"))
    .then(() => true)
    .catch(() => false);
  return { areas, runs, farm };
}

function describe({ areas, runs, farm }) {
  const parts = [];
  if (areas) parts.push(`${areas} area${areas === 1 ? "" : "s"}`);
  if (runs) parts.push(`${runs} month${runs === 1 ? "" : "s"}`);
  if (farm) parts.push("a farm");
  return parts.join(", ");
}

async function writeAtomic(dir, rel, text) {
  const file = path.join(dir, ...rel.split("/"));
  // checkBundlePath already made sure; checked again before writing.
  if (!file.startsWith(dir + path.sep)) throw new HttpError(400, "bad_path", "Refused: a path outside the data folder.");
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
}

// Answers /api/admin/... (server/app.js calls it before the access-code
// check). parts: the address after /api/ ("admin", "import").
export async function handleAdmin(req, res, { method, parts, pathname }) {
  const token = importToken();
  if (!token || parts.length !== 2 || parts[1] !== "import") throw new HttpError(404, "not_found", `No such API route: ${pathname}`);
  if (token.length < IMPORT_TOKEN_MIN_LENGTH) {
    throw new HttpError(503, "import_off", `The upload is off: IMPORT_TOKEN on the server is too short (use at least ${IMPORT_TOKEN_MIN_LENGTH} random characters).`);
  }
  if (method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "method_not_allowed", `${method} is not supported on ${pathname}.`);
  }

  // The token is checked before the body is read, so nobody without it
  // can make the server read 45 MB.
  const who = clientAddress(req);
  const limiter = (memory.limiter ??= createLoginLimiter());
  const wait = limiter.check(who);
  if (wait.blocked) {
    res.setHeader("Retry-After", String(wait.retryAfterSec));
    const minutes = Math.ceil(wait.retryAfterSec / 60);
    throw new HttpError(429, "too_many_attempts", `Too many wrong upload tokens. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
  const given = bearerToken(req.headers?.authorization);
  if (!given || !codesMatch(given, token)) {
    limiter.fail(who);
    res.setHeader("WWW-Authenticate", 'Bearer realm="chernozem-import"');
    throw new HttpError(401, "wrong_token", "The upload needs the header Authorization: Bearer <IMPORT_TOKEN>, with the token set on the server.");
  }
  limiter.reset(who);

  if (memory.busy) throw new HttpError(409, "busy", "Another upload is being written right now. Try again when it has finished.");
  memory.busy = true;
  try {
    const body = await readJson(req, { maxBytes: IMPORT_MAX_BYTES });
    const { write, skipped } = checkUploadFiles(body.files);
    const replace = body.replace === true;
    const dir = dataDir();
    const have = await existingData(dir);
    if (!replace && (have.areas || have.runs || have.farm)) {
      throw new HttpError(409, "not_empty", `This server already has data (${describe(have)}). Nothing was written. To write the upload over it, send "replace": true (the export script: --replace).`);
    }
    if (listJobs({ status: "running" }).length) {
      throw new HttpError(409, "busy", "An analysis is running on this server. Nothing was written. Upload again once it has ended (or stop it first).");
    }
    let written = 0;
    for (const [rel, text] of write) {
      try {
        await writeAtomic(dir, rel, text);
      } catch (error) {
        console.error(`[chernozem] Data import stopped after ${written} of ${write.length} files:`, error);
        // The reason by its code only (a message can name folders).
        throw new HttpError(500, "write_failed", `Writing stopped after ${written} of ${write.length} files (${error.code || "error"}). Send the upload again with "replace": true.`);
      }
      written += 1;
    }
    console.log(`[chernozem] Data import from ${who}: ${written} file${written === 1 ? "" : "s"} written${replace ? " (replace)" : ""}, ${skipped.length} skipped.`);
    sendJson(res, 200, { written, skipped });
  } finally {
    memory.busy = false;
  }
}
