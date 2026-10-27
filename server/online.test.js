// WHAT THIS FILE DOES
// Tests the checks the server makes before it starts on Render
// (server/online.js): the data folder must be the disk (set, a full path,
// outside the app's own folder, already there, writable), and the access
// code must be a proper one; on one's own computer nothing is checked.
// server/index.test.js starts the real server with these settings. Run
// with "npm test".
//
// WHO EDITS IT
// Whoever changes server/online.js.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-online-unit-"));
process.env.CHERNOZEM_DATA_DIR = path.join(scratch, "data");
process.env.GEE_DISABLED = "1";
const { dataFolderProblem, startProblems } = await import("./online.js");
const { ROOT } = await import("./env.js");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const disk = path.join(scratch, "disk");
fs.mkdirSync(disk);

test("the data folder must be the disk", () => {
  assert.match(dataFolderProblem(""), /CHERNOZEM_DATA_DIR is not set/);
  assert.match(dataFolderProblem(undefined), /CHERNOZEM_DATA_DIR is not set/);
  assert.match(dataFolderProblem("   "), /CHERNOZEM_DATA_DIR is not set/);
  assert.match(dataFolderProblem("data"), /must be a full path/);
  assert.match(dataFolderProblem("./server/.data"), /must be a full path/);
  assert.match(dataFolderProblem(path.join(ROOT, "server", ".data")), /inside the app's own folder/);
  assert.match(dataFolderProblem(ROOT), /inside the app's own folder/);
  assert.match(dataFolderProblem(path.join(scratch, "missing")), /does not exist \(ENOENT\)/);
  assert.equal(fs.existsSync(path.join(scratch, "missing")), false, "never made");
  fs.writeFileSync(path.join(scratch, "a-file"), "x");
  assert.match(dataFolderProblem(path.join(scratch, "a-file")), /is a file/);
  assert.equal(dataFolderProblem(disk), null);
  assert.equal(dataFolderProblem(`${disk}/`), null);
  assert.deepEqual(fs.readdirSync(disk), [], "the write check leaves nothing behind");
  // Inside or outside the folder it is told is the app's.
  assert.match(dataFolderProblem(disk, { root: scratch }), /inside the app's own folder/);
  assert.equal(dataFolderProblem(disk, { root: path.join(scratch, "dis") }), null, "a name that only starts like the app's folder is outside it");
});

test("a link into the app's own folder counts as inside it", () => {
  const app = path.join(scratch, "app");
  fs.mkdirSync(path.join(app, "server", ".data"), { recursive: true });
  const link = path.join(scratch, "link-to-app-data");
  fs.symlinkSync(path.join(app, "server", ".data"), link);
  assert.match(dataFolderProblem(link, { root: app }), /inside the app's own folder/);
});

test("a folder that cannot be written to is refused", { skip: process.getuid?.() === 0 ? "root can write anywhere" : false }, () => {
  const locked = path.join(scratch, "read-only");
  fs.mkdirSync(locked);
  fs.chmodSync(locked, 0o555);
  try {
    assert.match(dataFolderProblem(locked), /cannot be written to \(EACCES\)/);
  } finally {
    fs.chmodSync(locked, 0o755);
  }
});

test("only on Render: a missing code or data folder stops the start", () => {
  const before = { render: process.env.RENDER, code: process.env.ATLAS_ACCESS_CODE, dir: process.env.CHERNOZEM_DATA_DIR };
  try {
    process.env.RENDER = "";
    process.env.ATLAS_ACCESS_CODE = "";
    process.env.CHERNOZEM_DATA_DIR = "";
    assert.deepEqual(startProblems(), [], "on one's own computer nothing is checked");

    process.env.RENDER = "true";
    const both = startProblems();
    assert.equal(both.length, 2);
    assert.match(both[0], /ATLAS_ACCESS_CODE is not set/);
    assert.match(both[1], /CHERNOZEM_DATA_DIR is not set/);

    process.env.ATLAS_ACCESS_CODE = "river tractor winter maple";
    process.env.CHERNOZEM_DATA_DIR = disk;
    assert.deepEqual(startProblems().length, 1);
    assert.match(startProblems()[0], /the example once printed in the docs/);

    process.env.ATLAS_ACCESS_CODE = "orchard-lantern-pebble-cobalt";
    assert.deepEqual(startProblems(), []);
  } finally {
    process.env.RENDER = before.render ?? "";
    process.env.ATLAS_ACCESS_CODE = before.code ?? "";
    process.env.CHERNOZEM_DATA_DIR = before.dir ?? "";
  }
});
