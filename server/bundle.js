// WHAT THIS FILE DOES
// The rules for copying the app's saved data from one server to another,
// for example from the owner's computer to the server at chernozem.app.
// Both ends use them, so they always agree:
//   scripts/export-data.js   reads a data folder and builds a "bundle"
//   server/import.js         POST /api/admin/import writes a bundle into
//                            this server's data folder
//
// A bundle is one JSON object:
//   { files: { "<path inside the data folder>": "<the file's text>" } }
// scripts/export-data.js sends it in parts of about 16 MB, one request
// each, so a small server (512 MB on Render) never has to hold much at
// once: no request may be larger than UPLOAD_MAX_BYTES. The files go in
// the order the server writes them (writeOrder): the months, borders and
// readings first, then the areas and the farm that point to them, the
// workspace last.
//
// Only the app's own data files travel (each one a JSON object):
//   workspace.json, farm.json, weather-cache.json, temperature-cache.json
//   areas/, runs/, units/, soil/, field-analysis/, field-history/
//                     one <id>.json per item (ids as in server/store.js)
//   chats/            the AI chats, only when asked for (--with-chats)
// Never: the server's sign-in secret (auth.json), lock files, files still
// being written (*.tmp), or the farmer's reports and photos (reports/,
// uploads/: photos are not text, and a report without its photos would
// show broken pictures).
//
// WHO EDITS IT
// Whoever adds a new kind of saved file to server/store.js: add it here
// too, or it is not carried over.

import fs from "node:fs/promises";
import path from "node:path";

// The largest upload request the server reads (server/import.js). Reading
// one takes several times its size in memory.
export const UPLOAD_MAX_BYTES = 45 * 1024 * 1024;

// Files at the top of the data folder.
export const BUNDLE_FILES = ["workspace.json", "farm.json", "weather-cache.json", "temperature-cache.json"];
// Folders of one <id>.json per item. chats is only exported when asked for.
export const BUNDLE_FOLDERS = ["areas", "runs", "units", "soil", "field-analysis", "field-history", "chats"];
// The same ids server/store.js accepts (a-z, 0-9 and "-"), plus ".json".
const ITEM_FILE = /^[a-z0-9-]{1,64}\.json$/;
const MAX_PATH_LENGTH = 200;

// What happens to one path of a bundle:
//   { ok: true }        a data file the app reads: it is written
//   { skip: "why" }     a harmless name the app does not read: left out
//   { unsafe: "why" }   could reach outside the data folder: the whole
//                       bundle is refused
export function checkBundlePath(rel) {
  if (typeof rel !== "string" || !rel) return { unsafe: "an empty path" };
  if (rel.length > MAX_PATH_LENGTH) return { unsafe: "a path that is too long" };
  if (rel.includes("\0") || rel.includes("\\")) return { unsafe: "a path with a backslash or a null character" };
  if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) return { unsafe: "an absolute path" };
  const parts = rel.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) return { unsafe: 'a path with "..", "." or an empty part' };
  if (parts.length === 1 && BUNDLE_FILES.includes(rel)) return { ok: true };
  if (parts.length === 2 && BUNDLE_FOLDERS.includes(parts[0]) && ITEM_FILE.test(parts[1])) return { ok: true };
  if (rel === "auth.json" || rel.endsWith(".lock")) return { skip: "the server's own file (never copied)" };
  return { skip: "not a data file the app reads" };
}

// True for text that is a JSON object (every data file is one).
export function isJsonObjectText(text) {
  if (typeof text !== "string") return false;
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value);
  } catch {
    return false;
  }
}

async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function entriesOf(folder) {
  try {
    return await fs.readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Reads a data folder into a bundle. Only the paths above are read (any
// other file or folder, lost+found for example, is never opened).
// Gives back:
//   files     { "<path>": "<text>" }, sorted by path
//   skipped   [{ path, reason }]: what was left out and why
//   counts    { "<file or folder>": number of files }
//   bytes     the total size of the files' text
export async function buildBundle(dir, { withChats = false } = {}) {
  const root = path.resolve(dir);
  const found = [];
  const skipped = [];
  const counts = {};

  for (const name of BUNDLE_FILES) {
    const text = await readText(path.join(root, name));
    if (text === null) continue;
    if (!isJsonObjectText(text)) {
      skipped.push({ path: name, reason: "not valid JSON (left out)" });
      continue;
    }
    found.push([name, text]);
    counts[name] = 1;
  }

  for (const folder of BUNDLE_FOLDERS) {
    const entries = (await entriesOf(path.join(root, folder))).filter((entry) => entry.isFile());
    if (folder === "chats" && !withChats) {
      const chats = entries.filter((entry) => ITEM_FILE.test(entry.name)).length;
      if (chats) skipped.push({ path: "chats/", reason: `${plural(chats, "AI chat")} left out (add --with-chats to bring them)` });
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${folder}/${entry.name}`;
      if (!ITEM_FILE.test(entry.name)) {
        // Half-written files (*.tmp) and anything else the app never reads.
        skipped.push({ path: rel, reason: entry.name.endsWith(".tmp") ? "a file still being written" : "not a data file the app reads" });
        continue;
      }
      const text = await readText(path.join(root, folder, entry.name));
      if (text === null) continue; // removed meanwhile
      if (!isJsonObjectText(text)) {
        skipped.push({ path: rel, reason: "not valid JSON (left out)" });
        continue;
      }
      found.push([rel, text]);
      counts[`${folder}/`] = (counts[`${folder}/`] || 0) + 1;
    }
  }

  // Said out loud, so nobody expects them on the new server.
  for (const [folder, what] of [
    ["reports", "farmer's report"],
    ["uploads", "report photo"],
  ]) {
    const n = (await entriesOf(path.join(root, folder))).filter((entry) => entry.isFile()).length;
    if (n) skipped.push({ path: `${folder}/`, reason: `${plural(n, what)} not carried over (photos are not text)` });
  }

  found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const files = Object.fromEntries(found);
  const bytes = found.reduce((sum, [, text]) => sum + Buffer.byteLength(text), 0);
  return { files, skipped, counts, bytes };
}

// [path, text] pairs in the order the server writes them: months, borders,
// soil and field readings first, then the areas and the farm that point to
// them, the workspace last (so the monthly check never sees an area
// without its months). Within each group, by path.
const LAST = ["areas", "farm.json", "workspace.json"];
export function writeOrder(entries) {
  const rank = (rel) => LAST.indexOf(rel.includes("/") ? rel.split("/")[0] : rel) + 1;
  return [...entries].sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

// Splits [path, text] pairs (kept in their order) into parts whose upload
// is at most about maxBytes each. A file bigger than that goes alone.
export function splitIntoParts(entries, maxBytes) {
  const parts = [];
  let part = [];
  let size = 0;
  for (const entry of entries) {
    // As it travels: "path":"text", with the text's quotes and escapes.
    const bytes = Buffer.byteLength(JSON.stringify(entry[0])) + Buffer.byteLength(JSON.stringify(entry[1])) + 2;
    if (part.length && size + bytes > maxBytes) {
      parts.push(part);
      part = [];
      size = 0;
    }
    part.push(entry);
    size += bytes;
  }
  if (part.length) parts.push(part);
  return parts;
}
