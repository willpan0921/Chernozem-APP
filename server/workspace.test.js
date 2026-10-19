// WHAT THIS FILE DOES
// Checks that GET /api/workspace (server/app.js) clears a current area
// that no longer exists, so the pages never ask for a missing area (no
// 404s in the browser). Uses a temporary data folder and sample data.
// Run with "npm test".
//
// WHO EDITS IT
// Whoever changes how the workspace is read in server/app.js.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

process.env.CHERNOZEM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-ws-"));
process.env.GEE_DISABLED = "1";
process.env.ATLAS_ACCESS_CODE = "";
const { handleApi } = await import("./app.js");

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
after(() => server.close());

async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test("a deleted current area is cleared on read (10.9)", async () => {
  const saved = await call("POST", "/api/areas", { source: "bbox", name: "Gone soon", north: 50, south: 49.9, east: 30.1, west: 30 });
  assert.equal(saved.status, 201, JSON.stringify(saved.json));
  const id = saved.json.area.id;
  assert.equal((await call("PATCH", "/api/workspace", { currentAreaId: id })).json.workspace.currentAreaId, id);
  // Still there: kept.
  assert.equal((await call("GET", "/api/workspace")).json.workspace.currentAreaId, id);

  // The area's file disappears (deleted by hand, or a data folder copied
  // without it).
  fs.rmSync(path.join(process.env.CHERNOZEM_DATA_DIR, "areas", `${id}.json`));
  const after = await call("GET", "/api/workspace");
  assert.equal(after.status, 200);
  assert.equal(after.json.workspace.currentAreaId, null);
  // And it is saved, not only hidden.
  const file = JSON.parse(fs.readFileSync(path.join(process.env.CHERNOZEM_DATA_DIR, "workspace.json"), "utf8"));
  assert.equal(file.currentAreaId, null);
});

test("an unreadable current area id is cleared too", async () => {
  const file = path.join(process.env.CHERNOZEM_DATA_DIR, "workspace.json");
  const ws = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...ws, currentAreaId: "../../etc" }));
  assert.equal((await call("GET", "/api/workspace")).json.workspace.currentAreaId, null);
});
