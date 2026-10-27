// WHAT THIS FILE DOES
// Tests the one-time data upload, POST /api/admin/import (server/import.js):
// it exists only while IMPORT_TOKEN is set, needs that token (and nothing
// else, not even the access code), never writes outside the data folder or
// anything but JSON data files, refuses a server that already has data
// unless replace is true, and writes the months before their areas.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/import.js or server/bundle.js.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-import-"));
process.env.CHERNOZEM_DATA_DIR = path.join(scratch, "data");
process.env.GEE_DISABLED = "1";
// Not on Render (where a short code keeps the app locked).
process.env.RENDER = "";
process.env.ATLAS_ACCESS_CODE = "";
process.env.IMPORT_TOKEN = "";
const TOKEN = "test-import-token-0123456789";
const { handleApi } = await import("./app.js");
const { IMPORT_MAX_BYTES, checkUploadFiles, resetImportLimits } = await import("./import.js");

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

// Every test starts on an empty data folder, the token on, no access code.
let n = 0;
beforeEach(() => {
  n += 1;
  process.env.CHERNOZEM_DATA_DIR = path.join(scratch, `data-${n}`);
  process.env.IMPORT_TOKEN = TOKEN;
  process.env.ATLAS_ACCESS_CODE = "";
  resetImportLimits();
});
const dataDir = () => process.env.CHERNOZEM_DATA_DIR;

async function upload(body, { token = TOKEN, method = "POST", headers = {} } = {}) {
  const res = await fetch(`${base}/api/admin/import`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, headers: res.headers };
}

const area = (id) => JSON.stringify({ id, name: `Area ${id}`, kind: "custom", createdAt: "2026-10-01T00:00:00.000Z" });
const run = (id, areaId) => JSON.stringify({ id, areaId, month: "2026-09", createdAt: "2026-10-01T00:00:00.000Z", cells: [], alerts: [] });
const bundle = () => ({
  "workspace.json": JSON.stringify({ name: "Regional office", currentAreaId: "area-1", team: [{ id: "member-1", name: "Oksana H.", email: "", role: "admin" }] }),
  "farm.json": JSON.stringify({ id: "farm-1", name: "Demo farm", fields: [] }),
  "areas/area-1.json": area("area-1"),
  "runs/run-1.json": run("run-1", "area-1"),
  "runs/run-2.json": run("run-2", "area-1"),
  "units/area-1.json": JSON.stringify({ areaId: "area-1", units: [] }),
  "soil/area-1.json": JSON.stringify({ areaId: "area-1", cells: {}, units: {} }),
  "field-analysis/fld-1.json": JSON.stringify({ fieldId: "fld-1" }),
  "field-history/fld-1.json": JSON.stringify({ fieldId: "fld-1", months: [] }),
  "weather-cache.json": JSON.stringify({ at: "2026-10-01T00:00:00.000Z" }),
  "temperature-cache.json": JSON.stringify({ entries: [] }),
});
const listAll = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((name) => fs.statSync(path.join(dir, name)).isFile()).sort() : []);

test("without IMPORT_TOKEN the address does not exist", async () => {
  process.env.IMPORT_TOKEN = "";
  const res = await upload({ files: bundle() });
  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, "not_found");
  assert.equal(fs.existsSync(dataDir()), false, "nothing written");
  process.env.ATLAS_ACCESS_CODE = "a-code";
  assert.equal((await upload({ files: bundle() })).status, 404, "also with an access code set");
});

test("a missing or wrong token is refused, before the body is read", async () => {
  for (const token of [null, "wrong-token", `${TOKEN}x`, TOKEN.slice(0, -1)]) {
    const res = await upload({ files: bundle() }, { token });
    assert.equal(res.status, 401, String(token));
    assert.equal(res.json.error.code, "wrong_token");
    assert.match(res.headers.get("www-authenticate"), /^Bearer/);
  }
  const basic = await upload({ files: bundle() }, { token: null, headers: { Authorization: `Basic ${Buffer.from(`x:${TOKEN}`).toString("base64")}` } });
  assert.equal(basic.status, 401, "only a Bearer token");
  assert.deepEqual(listAll(dataDir()), [], "nothing written");
});

test("10 wrong tokens lock the address out for 10 minutes", async () => {
  for (let i = 0; i < 10; i += 1) assert.equal((await upload({ files: bundle() }, { token: `guess-${i}` })).status, 401);
  const locked = await upload({ files: bundle() });
  assert.equal(locked.status, 429, "even the right token waits");
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  resetImportLimits();
  assert.equal((await upload({ files: bundle() })).status, 200);
});

test("a token shorter than 16 characters keeps the upload off", async () => {
  process.env.IMPORT_TOKEN = "short-token-15c";
  const res = await upload({ files: bundle() }, { token: "short-token-15c" });
  assert.equal(res.status, 503);
  assert.equal(res.json.error.code, "import_off");
  assert.match(res.json.error.message, /at least 16/);
  assert.deepEqual(listAll(dataDir()), [], "nothing written");
  process.env.IMPORT_TOKEN = "exactly-16-chars";
  assert.equal((await upload({ files: bundle() }, { token: "exactly-16-chars" })).status, 200);
});

test("only POST", async () => {
  const res = await upload(null, { method: "GET" });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
  const other = await fetch(`${base}/api/admin/other`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(other.status, 404);
});

test("the right token writes every data file, the token alone (no access code needed)", async () => {
  process.env.ATLAS_ACCESS_CODE = "a-code";
  const files = bundle();
  const res = await upload({ files });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json, { written: Object.keys(files).length, skipped: [] });
  for (const [rel, text] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(dataDir(), rel), "utf8"), text, rel);
  assert.deepEqual(listAll(dataDir()), Object.keys(files).sort(), "no other file, no temporary file left");
  // The rest of the API still needs the code.
  assert.equal((await fetch(`${base}/api/areas`)).status, 401);
  // And with the code off the server reads what was written.
  process.env.ATLAS_ACCESS_CODE = "";
  const areas = await (await fetch(`${base}/api/areas`)).json();
  assert.deepEqual(areas.areas.map((a) => a.id), ["area-1"]);
  const runs = await (await fetch(`${base}/api/runs?areaId=area-1`)).json();
  assert.deepEqual(runs.runs.map((r) => r.id).sort(), ["run-1", "run-2"]);
  const ws = await (await fetch(`${base}/api/workspace`)).json();
  assert.equal(ws.workspace.team[0].name, "Oksana H.");
  assert.equal(ws.workspace.currentAreaId, "area-1");
});

test("chats are written when the upload has them", async () => {
  const chat = JSON.stringify({ id: "chat-1", product: "atlas", title: "Hello", messages: [] });
  const res = await upload({ files: { ...bundle(), "chats/chat-1.json": chat } });
  assert.equal(res.status, 200);
  assert.equal(fs.readFileSync(path.join(dataDir(), "chats", "chat-1.json"), "utf8"), chat);
});

test("a path that could leave the data folder refuses the whole upload", async () => {
  for (const bad of ["../escape.json", "areas/../../escape.json", "/etc/escape.json", "areas/..", "C:/x.json", "areas\\x.json", "./farm.json", "areas//x.json", "", "areas/x.json\u0000"]) {
    const res = await upload({ files: { ...bundle(), [bad]: "{}" } });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(res.json.error.code, "bad_path", JSON.stringify(bad));
    assert.match(res.json.error.message, /Nothing was written/);
  }
  assert.deepEqual(listAll(dataDir()), [], "nothing written, not even the good files");
  assert.equal(fs.existsSync(path.join(scratch, "escape.json")), false);
});

test("a file that is not a JSON object refuses the whole upload", async () => {
  for (const bad of ["not json", "{\"half\":", "[1,2]", "42", "null", "\"text\""]) {
    const res = await upload({ files: { ...bundle(), "areas/area-2.json": bad } });
    assert.equal(res.status, 400, bad);
    assert.equal(res.json.error.code, "bad_file");
  }
  const notText = await upload({ files: { ...bundle(), "areas/area-2.json": { id: "area-2" } } });
  assert.equal(notText.status, 400, "the file's text, not an object");
  assert.equal((await upload("{ not json")).status, 400, "a body that is not JSON");
  assert.equal((await upload({ files: [] })).status, 400, "files must be an object");
  assert.equal((await upload({})).status, 400, "no files");
  assert.deepEqual(listAll(dataDir()), [], "nothing written");
});

test("files the app does not read are left out and listed: never auth.json or lock files", async () => {
  const res = await upload({
    files: {
      "areas/area-1.json": area("area-1"),
      "auth.json": JSON.stringify({ salt: "s".repeat(64) }),
      "scheduler.lock": JSON.stringify({ pid: 1 }),
      "reports/rep-1.json": "{}",
      "notes.json": "{}",
      "areas/Area-2.json": area("area-2"),
      "areas/nested/area-3.json": area("area-3"),
    },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.written, 1);
  assert.deepEqual(res.json.skipped.map((item) => item.path).sort(), ["areas/Area-2.json", "areas/nested/area-3.json", "auth.json", "notes.json", "reports/rep-1.json", "scheduler.lock"]);
  assert.ok(res.json.skipped.every((item) => typeof item.reason === "string" && item.reason));
  assert.deepEqual(listAll(dataDir()), [path.join("areas", "area-1.json")]);
});

test("a server that already has data refuses, unless replace is true", async () => {
  assert.equal((await upload({ files: bundle() })).status, 200);
  // A month made on the server meanwhile, not in the upload.
  const own = path.join(dataDir(), "runs", "run-own.json");
  fs.writeFileSync(own, run("run-own", "area-1"));

  const changed = { ...bundle(), "areas/area-1.json": JSON.stringify({ id: "area-1", name: "Renamed", createdAt: "2026-10-02T00:00:00.000Z" }) };
  const refused = await upload({ files: changed });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.error.code, "not_empty");
  assert.match(refused.json.error.message, /1 area, 3 months, a farm/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir(), "areas", "area-1.json"), "utf8")).name, "Area area-1", "nothing changed");

  const replaced = await upload({ files: changed, replace: true });
  assert.equal(replaced.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir(), "areas", "area-1.json"), "utf8")).name, "Renamed");
  assert.ok(fs.existsSync(own), "files not in the upload are kept");
});

test("a farm alone also counts as data", async () => {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), "farm.json"), JSON.stringify({ id: "farm-own", fields: [] }));
  fs.writeFileSync(path.join(dataDir(), "workspace.json"), JSON.stringify({ name: "Made at first open" }));
  const res = await upload({ files: bundle() });
  assert.equal(res.status, 409);
  assert.match(res.json.error.message, /a farm/);
  fs.rmSync(path.join(dataDir(), "farm.json"));
  // A workspace.json alone (made when a page first opens) is not data.
  assert.equal((await upload({ files: bundle() })).status, 200);
});

test("the server's own sign-in secret is never replaced", async () => {
  process.env.ATLAS_ACCESS_CODE = "a-code";
  // The salt this server signs its sign-in cookies with.
  const { installSalt } = await import("./auth.js");
  const salt = await installSalt();
  const res = await upload({ files: { ...bundle(), "auth.json": JSON.stringify({ salt: "x".repeat(64) }) }, replace: true });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir(), "auth.json"), "utf8")).salt, salt);
});

test("an upload over the size limit (45 MB) is refused", async () => {
  // Reading a request takes several times its size in memory, and the
  // server online has 512 MB (the export script sends parts of 16 MB).
  assert.equal(IMPORT_MAX_BYTES, 45 * 1024 * 1024);
  // Sent as text: the server stops at the size, before reading it as JSON.
  const res = await upload(`{"files":{"runs/run-big.json":"${"x".repeat(IMPORT_MAX_BYTES)}"}}`);
  assert.equal(res.status, 413);
  assert.deepEqual(listAll(dataDir()), []);
});

test("months, borders and readings are written before the areas, the workspace last", () => {
  const { write } = checkUploadFiles(bundle());
  const order = write.map(([rel]) => rel);
  const at = (rel) => order.indexOf(rel);
  assert.ok(at("runs/run-1.json") < at("areas/area-1.json"));
  assert.ok(at("units/area-1.json") < at("areas/area-1.json"));
  assert.ok(at("field-analysis/fld-1.json") < at("farm.json"));
  assert.equal(order.at(-1), "workspace.json");
  assert.ok(at("areas/area-1.json") < at("farm.json"));
});
