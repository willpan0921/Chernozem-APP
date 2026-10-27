// WHAT THIS FILE DOES
// Tests the data bundle (server/bundle.js) and the export script that
// sends it (scripts/export-data.js): which files of a data folder travel
// (never the sign-in secret, lock files, files still being written, or the
// chats unless asked), and a whole copy from one data folder into a fresh
// server through POST /api/admin/import. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/bundle.js or scripts/export-data.js.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-bundle-"));
process.env.CHERNOZEM_DATA_DIR = path.join(scratch, "server-data");
process.env.GEE_DISABLED = "1";
process.env.ATLAS_ACCESS_CODE = "";
const TOKEN = "bundle-test-token-abcdef0123456789";
process.env.IMPORT_TOKEN = TOKEN;
const { buildBundle, checkBundlePath, splitIntoParts, writeOrder } = await import("./bundle.js");
const { handleApi } = await import("./app.js");

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "export-data.js");
const run = promisify(execFile);

// A data folder like the owner's.
const source = path.join(scratch, "source");
const write = (rel, value) => {
  const file = path.join(source, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
};
write("workspace.json", { name: "Regional office", currentAreaId: "country-804", team: [{ id: "member-1", name: "Oksana H.", role: "admin" }] });
write("farm.json", { id: "farm-1", name: "Demo farm", fields: [{ id: "fld-1" }] });
write("weather-cache.json", { at: "2026-10-25T00:00:00.000Z" });
write("temperature-cache.json", { entries: [] });
write("areas/country-804.json", { id: "country-804", name: "Ukraine", createdAt: "2026-10-18T00:00:00.000Z" });
write("areas/admin1-gaul1-429.json", { id: "admin1-gaul1-429", name: "Iowa", createdAt: "2026-10-19T00:00:00.000Z" });
write("runs/run-1.json", { id: "run-1", areaId: "country-804", month: "2026-09", createdAt: "1", cells: [{ id: "c1" }], alerts: [] });
write("runs/run-2.json", { id: "run-2", areaId: "admin1-gaul1-429", month: "2026-09", createdAt: "2", cells: [], alerts: [] });
write("units/country-804.json", { areaId: "country-804", units: [] });
write("soil/country-804.json", { areaId: "country-804", cells: {}, units: {} });
write("field-analysis/fld-1.json", { fieldId: "fld-1" });
write("field-history/fld-1.json", { fieldId: "fld-1", months: [] });
write("chats/chat-1.json", { id: "chat-1", product: "atlas", messages: [] });
write("chats/chat-2.json", { id: "chat-2", product: "field", messages: [] });
// Never sent.
write("auth.json", { salt: "s".repeat(64) });
write("scheduler.lock", { pid: 1, at: "2026-10-19T15:32:46.467Z" });
write("field-scheduler.lock", { pid: 1 });
write("runs/run-3.json.123.abc123.tmp", "{\"id\":");
write("runs/broken.json", "{ not json");
write("runs/notes.txt", "hello");
write("reports/rep-1.json", { id: "rep-1" });
write("uploads/photo-1.jpg", "jpeg bytes");
write("lost+found/x", "a disk's own folder");
write("backup/areas/old.json", {});

const DATA_FILES = [
  "areas/admin1-gaul1-429.json",
  "areas/country-804.json",
  "farm.json",
  "field-analysis/fld-1.json",
  "field-history/fld-1.json",
  "runs/run-1.json",
  "runs/run-2.json",
  "soil/country-804.json",
  "temperature-cache.json",
  "units/country-804.json",
  "weather-cache.json",
  "workspace.json",
];

let server;
let base;
before(async () => {
  server = http.createServer(async (req, res) => {
    if (!(await handleApi(req, res))) {
      res.statusCode = 404;
      res.end("not api");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

// Runs the export script; gives back { code, out } (out: what it printed).
async function exportData(args, env = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT, ...args], { env: { ...process.env, IMPORT_TOKEN: "", ...env }, timeout: 60000 });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    return { code: error.code, out: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

test("which paths a bundle may carry", () => {
  for (const ok of ["workspace.json", "farm.json", "weather-cache.json", "temperature-cache.json", "areas/country-804.json", "runs/run-1d9da143.json", "units/x.json", "soil/x.json", "field-analysis/fld-1.json", "field-history/fld-1.json", "chats/chat-1.json"]) {
    assert.deepEqual(checkBundlePath(ok), { ok: true }, ok);
  }
  for (const skip of ["auth.json", "scheduler.lock", "field-scheduler.lock", "reports/rep-1.json", "uploads/photo-1.jpg", "areas/Area.json", "areas/a/b.json", "runs/run-1.json.1.abc.tmp", "notes.txt", "areas.json"]) {
    assert.ok(checkBundlePath(skip).skip, skip);
  }
  for (const unsafe of ["", "../x.json", "areas/../../x.json", "/etc/passwd", "C:/x.json", "c:\\x.json", "areas\\x.json", "./farm.json", "areas//x.json", "areas/.", "x\u0000.json", "a".repeat(201), null, 42]) {
    assert.ok(checkBundlePath(unsafe).unsafe, JSON.stringify(unsafe));
  }
});

test("the bundle has the data files and nothing else", async () => {
  const bundle = await buildBundle(source);
  assert.deepEqual(Object.keys(bundle.files), DATA_FILES, "sorted, chats left out");
  for (const rel of DATA_FILES) assert.equal(bundle.files[rel], fs.readFileSync(path.join(source, rel), "utf8"), rel);
  assert.equal(bundle.bytes, DATA_FILES.reduce((sum, rel) => sum + fs.statSync(path.join(source, rel)).size, 0));
  assert.deepEqual(bundle.counts, {
    "workspace.json": 1,
    "farm.json": 1,
    "weather-cache.json": 1,
    "temperature-cache.json": 1,
    "areas/": 2,
    "runs/": 2,
    "units/": 1,
    "soil/": 1,
    "field-analysis/": 1,
    "field-history/": 1,
  });
  const skipped = Object.fromEntries(bundle.skipped.map((item) => [item.path, item.reason]));
  assert.deepEqual(Object.keys(skipped).sort(), ["chats/", "reports/", "runs/broken.json", "runs/notes.txt", "runs/run-3.json.123.abc123.tmp", "uploads/"]);
  assert.match(skipped["chats/"], /2 AI chats left out \(add --with-chats/);
  assert.match(skipped["runs/broken.json"], /not valid JSON/);
  assert.match(skipped["runs/run-3.json.123.abc123.tmp"], /still being written/);
  assert.match(skipped["reports/"], /1 farmer's report not carried over/);
  assert.match(skipped["uploads/"], /1 report photo not carried over/);
  const text = JSON.stringify(bundle);
  for (const never of ["auth.json", "scheduler.lock", "lost+found", "backup", "s".repeat(64)]) assert.equal(text.includes(never), false, never);
});

test("--with-chats brings the chats", async () => {
  const bundle = await buildBundle(source, { withChats: true });
  assert.deepEqual(Object.keys(bundle.files).filter((rel) => rel.startsWith("chats/")), ["chats/chat-1.json", "chats/chat-2.json"]);
  assert.equal(bundle.skipped.some((item) => item.path === "chats/"), false);
});

test("an empty or missing data folder gives an empty bundle", async () => {
  assert.deepEqual((await buildBundle(path.join(scratch, "missing"))).files, {});
  fs.mkdirSync(path.join(scratch, "empty"));
  const empty = await buildBundle(path.join(scratch, "empty"));
  assert.deepEqual(empty, { files: {}, skipped: [], counts: {}, bytes: 0 });
});

test("the files go in the order the server writes them, in parts of a given size", async () => {
  const bundle = await buildBundle(source);
  const ordered = writeOrder(Object.entries(bundle.files)).map(([rel]) => rel);
  assert.deepEqual(ordered.slice(-4), ["areas/admin1-gaul1-429.json", "areas/country-804.json", "farm.json", "workspace.json"], "areas, the farm, the workspace last");
  assert.deepEqual(new Set(ordered), new Set(DATA_FILES));

  const entries = [["a.json", "x".repeat(100)], ["b.json", "y".repeat(100)], ["c.json", "z".repeat(500)], ["d.json", "w".repeat(10)]];
  const sizes = (parts) => parts.map((part) => part.map(([rel]) => rel));
  // Each entry travels as "path":"text" (+ a comma): 112, 112, 512 and 22 bytes.
  assert.deepEqual(sizes(splitIntoParts(entries, 250)), [["a.json", "b.json"], ["c.json"], ["d.json"]], "a file bigger than a part goes alone");
  assert.deepEqual(sizes(splitIntoParts(entries, 10_000)), [["a.json", "b.json", "c.json", "d.json"]]);
  assert.deepEqual(splitIntoParts([], 100), []);
  // Escaped text counts as it travels.
  assert.equal(splitIntoParts([["q.json", '"'.repeat(60)], ["r.json", "{}"]], 100).length, 2);
});

test("the export script shows what it would send and sends nothing by default", async () => {
  const { code, out } = await exportData(["--data", source]);
  assert.equal(code, 0, out);
  assert.match(out, /To send: 12 files/);
  assert.match(out, /areas\/ 2 · runs\/ 2/);
  assert.match(out, /chats\/: 2 AI chats left out/);
  assert.match(out, /Nothing was sent/);
});

test("the export script saves the bundle to a file only its owner can read", async () => {
  const out = path.join(scratch, "bundle.json");
  const result = await exportData(["--data", source, "--out", out]);
  assert.equal(result.code, 0, result.out);
  assert.equal(fs.statSync(out).mode & 0o777, 0o600);
  const saved = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.deepEqual(saved, { files: (await buildBundle(source)).files });
  const replace = await exportData(["--data", source, `--out=${out}`, "--replace", "--with-chats"]);
  assert.equal(replace.code, 0, replace.out);
  const again = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(again.replace, true);
  assert.ok(again.files["chats/chat-1.json"]);
});

test("the export script refuses unsafe or wrong addresses and a missing token", async () => {
  const cases = [
    [["--url", "http://chernozem.app/api/admin/import", "--token", "x"], /must start with https/],
    [["--url", "https://chernozem.app/api/areas", "--token", "x"], /upload address/],
    [["--url", "not a url", "--token", "x"], /not a web address/],
    [["--url", "https://chernozem.app/api/admin/import"], /upload token/],
    [["--bogus"], /Unknown option/],
    [["--out"], /needs a value/],
    [["--url", "https://chernozem.app", "--token", "x", "--part-mb", "0"], /--part-mb must be a number above 0 and at most 45/],
    [["--url", "https://chernozem.app", "--token", "x", "--part-mb", "46"], /--part-mb must be/],
    [["--url", "https://chernozem.app", "--token", "x", "--part-mb", "lots"], /--part-mb must be/],
  ];
  for (const [args, message] of cases) {
    const { code, out } = await exportData(["--data", source, ...args]);
    assert.equal(code, 1, args.join(" "));
    assert.match(out, message, args.join(" "));
  }
  const missing = await exportData(["--data", path.join(scratch, "nowhere")]);
  assert.equal(missing.code, 1);
  assert.match(missing.out, /no data folder/);
});

test("a whole copy: export from one folder, upload into a fresh server", async () => {
  const target = process.env.CHERNOZEM_DATA_DIR;
  const url = `${base}/api/admin/import`;
  const wrong = await exportData(["--data", source, "--url", url], { IMPORT_TOKEN: "not-the-token" });
  assert.equal(wrong.code, 1);
  assert.match(wrong.out, /refused the upload/);
  assert.equal(fs.existsSync(target), false, "nothing written with a wrong token");

  const sent = await exportData(["--data", source, "--url", url], { IMPORT_TOKEN: TOKEN });
  assert.equal(sent.code, 0, sent.out);
  assert.match(sent.out, /the server wrote 12 files/);
  for (const rel of DATA_FILES) assert.equal(fs.readFileSync(path.join(target, rel), "utf8"), fs.readFileSync(path.join(source, rel), "utf8"), rel);
  for (const never of ["auth.json", "scheduler.lock", "chats", "reports", "uploads"]) assert.equal(fs.existsSync(path.join(target, never)), false, never);

  // The server reads it like its own.
  const areas = await (await fetch(`${base}/api/areas`)).json();
  assert.deepEqual(areas.areas.map((a) => a.name).sort(), ["Iowa", "Ukraine"]);
  const ws = await (await fetch(`${base}/api/workspace`)).json();
  assert.equal(ws.workspace.currentAreaId, "country-804");

  // A second upload is refused; --replace writes over it.
  const twice = await exportData(["--data", source, "--url", url], { IMPORT_TOKEN: TOKEN });
  assert.equal(twice.code, 1);
  assert.match(twice.out, /already has data \(2 areas, 2 months, a farm\)/);
  const replaced = await exportData(["--data", source, "--url", base, "--token", TOKEN, "--replace", "--with-chats"]);
  assert.equal(replaced.code, 0, replaced.out);
  assert.match(replaced.out, /the server wrote 14 files/);
  assert.ok(fs.existsSync(path.join(target, "chats", "chat-1.json")));

  // Without IMPORT_TOKEN on the server the address is gone.
  process.env.IMPORT_TOKEN = "";
  try {
    const gone = await exportData(["--data", source, "--url", url, "--replace"], { IMPORT_TOKEN: TOKEN });
    assert.equal(gone.code, 1);
    assert.match(gone.out, /Is IMPORT_TOKEN set on the server/);
  } finally {
    process.env.IMPORT_TOKEN = TOKEN;
  }
});

test("a larger upload travels in parts, the later ones with replace", async () => {
  const target = path.join(scratch, "server-data-parts");
  const before = process.env.CHERNOZEM_DATA_DIR;
  process.env.CHERNOZEM_DATA_DIR = target;
  try {
    // Parts of about 400 bytes: several requests for these small files.
    const sent = await exportData(["--data", source, "--url", base, "--part-mb", String(400 / (1024 * 1024))], { IMPORT_TOKEN: TOKEN });
    assert.equal(sent.code, 0, sent.out);
    const parts = Number(/in (\d+) parts/.exec(sent.out)?.[1]);
    assert.ok(parts >= 3, sent.out);
    assert.match(sent.out, new RegExp(`Part ${parts} of ${parts} \\([\\d.]+ MB\\): \\d+ files written`));
    assert.match(sent.out, /Done: the server wrote 12 files/);
    for (const rel of DATA_FILES) assert.equal(fs.readFileSync(path.join(target, rel), "utf8"), fs.readFileSync(path.join(source, rel), "utf8"), rel);

    // Into a server that has data, the first part is refused and nothing more is sent.
    fs.writeFileSync(path.join(target, "areas", "country-804.json"), JSON.stringify({ id: "country-804", name: "Changed on the server", createdAt: "1" }));
    const refused = await exportData(["--data", source, "--url", base, "--part-mb", String(400 / (1024 * 1024))], { IMPORT_TOKEN: TOKEN });
    assert.equal(refused.code, 1);
    assert.match(refused.out, /already has data/);
    assert.doesNotMatch(refused.out, /Part 2/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(target, "areas", "country-804.json"), "utf8")).name, "Changed on the server");
  } finally {
    process.env.CHERNOZEM_DATA_DIR = before;
  }
});
