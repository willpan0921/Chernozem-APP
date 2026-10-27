// WHAT THIS FILE DOES
// Copies the app's saved data (the farm and its fields' readings, the
// Atlas areas and their months, the team and the settings) to another
// server, for example the one at https://chernozem.app (docs/DEPLOY.md,
// "Bring your data"). It only reads the data folder: nothing in it is
// changed or removed.
//
// HOW TO USE IT
// In Terminal, in the project folder (on this Mac first run
// "export PATH=~/.local/node/bin:$PATH"):
//
//   See what would be sent (nothing is sent):
//     node scripts/export-data.js
//
//   Send it to the server, with the IMPORT_TOKEN set on the server:
//     IMPORT_TOKEN=<the token> node scripts/export-data.js --url https://chernozem.app
//   It travels in parts of about 16 MB, one request each (a small server
//   could not read all of it at once); the parts after the first are sent
//   with "replace", since the first has already written data.
//
//   Or save it to a file instead:
//     node scripts/export-data.js --out ~/Desktop/chernozem-data.json
//
// Options
//   --data <folder>   the data folder to read (default: server/.data)
//   --with-chats      also bring the AI chats (left out by default)
//   --out <file>      write the upload to this file (only you can read it)
//   --url <address>   send it to that server's /api/admin/import (https,
//                     or http only to this computer); the site alone,
//                     https://chernozem.app, is enough
//   --token <token>   the server's IMPORT_TOKEN (setting IMPORT_TOKEN as
//                     above instead keeps it out of Terminal's history)
//   --replace         write over the data the server already has (without
//                     it, a server that has areas, months or a farm refuses)
//   --part-mb <n>     the size of each part in MB (default 16; the server
//                     takes up to 45)
//
// Never sent: this computer's sign-in secret (auth.json), lock files, and
// the farmer's reports and photos. Which files travel: server/bundle.js.
//
// WHO EDITS IT
// Nobody, normally.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UPLOAD_MAX_BYTES, buildBundle, splitIntoParts, writeOrder } from "../server/bundle.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MB = 1024 * 1024;
const PART_MB = 16;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const FLAGS = new Set(["with-chats", "replace", "help"]);
const VALUES = new Set(["data", "out", "url", "token", "part-mb"]);

// "--url x" and "--url=x" both work.
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Not an option: ${arg} (options start with --, see the top of scripts/export-data.js).`);
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (FLAGS.has(name)) args[name] = true;
    else if (VALUES.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value === "") throw new Error(`--${name} needs a value.`);
      args[name] = value;
    } else throw new Error(`Unknown option --${name} (see the top of scripts/export-data.js).`);
  }
  return args;
}

const mb = (bytes) => `${(bytes / MB).toFixed(1)} MB`;
const home = (file) => file.replace(/^~(?=$|\/)/, process.env.HOME || "~");

function checkUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`--url is not a web address: ${text}`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error("--url must start with https:// (the data would otherwise travel unprotected).");
  }
  // Just the site ("https://chernozem.app") is enough.
  if (url.pathname === "/") url.pathname = "/api/admin/import";
  if (!url.pathname.replace(/\/+$/, "").endsWith("/api/admin/import")) {
    throw new Error(`--url must be the server's upload address, for example https://chernozem.app/api/admin/import (not ${url.pathname}).`);
  }
  return url;
}

function printSummary(dir, bundle) {
  const count = Object.keys(bundle.files).length;
  console.log(`Data folder: ${dir}`);
  console.log(`To send: ${count} file${count === 1 ? "" : "s"}, ${mb(bundle.bytes)}`);
  const lines = Object.entries(bundle.counts).map(([name, n]) => (name.endsWith("/") ? `${name} ${n}` : name));
  if (lines.length) console.log(`  ${lines.join(" · ")}`);
  if (bundle.skipped.length) {
    console.log("Left out:");
    for (const item of bundle.skipped) console.log(`  ${item.path}: ${item.reason}`);
  }
  console.log("Never sent: auth.json (this computer's sign-in secret) and lock files.");
}

async function send(url, token, body) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
  } catch (error) {
    throw new Error(`Could not reach ${url.origin} (${error.cause?.code || error.message}). Check the address and that the server is running.`);
  }
  const text = await res.text();
  let answer = null;
  try {
    answer = JSON.parse(text);
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const why = answer?.error?.message || `The server answered ${res.status}.`;
    const hint = res.status === 404 ? " (Is IMPORT_TOKEN set on the server? Without it the upload address does not exist.)" : "";
    throw new Error(`The server refused the upload: ${why}${hint}`);
  }
  return answer;
}

// The size of each part, from --part-mb.
function partBytes(value) {
  if (value === undefined) return PART_MB * MB;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n * MB > UPLOAD_MAX_BYTES) throw new Error(`--part-mb must be a number above 0 and at most ${UPLOAD_MAX_BYTES / MB}.`);
  return Math.floor(n * MB);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log("See the top of scripts/export-data.js for how to use it.");
    return 0;
  }
  const dir = path.resolve(home(args.data || path.join(ROOT, "server", ".data")));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`There is no data folder at ${dir}.`);
  const url = args.url ? checkUrl(args.url) : null;
  const token = (args.token || process.env.IMPORT_TOKEN || "").trim();
  if (url && !token) throw new Error("Give the server's upload token: IMPORT_TOKEN=<the token> before the command, or --token <the token>.");
  const maxPart = partBytes(args["part-mb"]);

  const bundle = await buildBundle(dir, { withChats: Boolean(args["with-chats"]) });
  printSummary(dir, bundle);
  if (!Object.keys(bundle.files).length) throw new Error("There is nothing to send: the data folder has none of the app's data files.");

  if (args.out) {
    const out = path.resolve(home(args.out));
    const body = JSON.stringify(args.replace ? { files: bundle.files, replace: true } : { files: bundle.files });
    fs.writeFileSync(out, body, { mode: 0o600 });
    console.log(`Saved: ${out} (${mb(Buffer.byteLength(body))}).`);
  }
  if (url) {
    // In the order the server writes them, so the areas and the farm come
    // after their months and readings, in the last part.
    const parts = splitIntoParts(writeOrder(Object.entries(bundle.files)), maxPart);
    // The first part is refused by a server that already has data (unless
    // --replace); the later ones write over what the first one wrote.
    const bodyOf = (i) => JSON.stringify(args.replace || i > 0 ? { files: Object.fromEntries(parts[i]), replace: true } : { files: Object.fromEntries(parts[i]) });
    console.log(`Sending ${mb(bundle.bytes)} to ${url.origin}${parts.length > 1 ? ` in ${parts.length} parts` : ""}...`);
    let written = 0;
    for (let i = 0; i < parts.length; i += 1) {
      const body = bodyOf(i);
      const size = Buffer.byteLength(body);
      const which = parts.length > 1 ? `part ${i + 1} of ${parts.length}` : "the upload";
      if (size > UPLOAD_MAX_BYTES) throw new Error(`${which} is ${mb(size)}; the server takes up to ${mb(UPLOAD_MAX_BYTES)} at once. Use a smaller --part-mb.`);
      let answer;
      try {
        answer = await send(url, token, body);
      } catch (error) {
        if (i === 0) throw error;
        throw new Error(`${error.message} (${which}). The parts before it were written: send it all again with --replace.`);
      }
      written += Number(answer?.written) || 0;
      if (parts.length > 1) console.log(`  Part ${i + 1} of ${parts.length} (${mb(size)}): ${answer?.written ?? "?"} files written.`);
      for (const item of answer?.skipped || []) console.log(`  Skipped by the server: ${item.path}: ${item.reason}`);
    }
    console.log(`Done: the server wrote ${written} files.`);
  }
  if (!args.out && !url) console.log("Nothing was sent. Add --url <the server's address> to send it, or --out <file> to save it.");
  return 0;
}

// Run from the command line (not when a test imports it). Real paths, so a
// folder reached through a link (/tmp on a Mac) still counts.
const realPath = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};
if (process.argv[1] && realPath(process.argv[1]) === realPath(fileURLToPath(import.meta.url))) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`Stopped: ${error.message}`);
      process.exit(1);
    }
  );
}
