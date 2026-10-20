// WHAT THIS FILE DOES
// Tests for server/store.js: files are saved in the data folder, ids that
// could reach other files are refused, and changes to an area run one at a
// time. Run with "npm test".
//
// WHO EDITS IT
// Whoever changes store.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-store-"));
process.env.CHERNOZEM_DATA_DIR = dir;
const store = await import("./store.js");

test("ids that could leave the data folder are refused", async () => {
  for (const bad of ["../x", "..", "a/b", "A", "x".repeat(65), "", "a.json", "a\\b"]) {
    assert.equal(store.isSafeId(bad), false, bad);
    assert.equal(await store.getArea(bad), null);
    await assert.rejects(() => store.saveArea({ id: bad, name: "x" }));
  }
  assert.equal(fs.existsSync(path.join(dir, "x.json")), false);
});

test("newId gives safe, different ids", () => {
  const a = store.newId("run");
  assert.match(a, /^run-[0-9a-f]{8}$/);
  assert.notEqual(a, store.newId("run"));
});

test("a fresh workspace has the defaults, no made-up team and no budget", async () => {
  const ws = await store.getWorkspace();
  assert.equal(ws.currentAreaId, null);
  assert.equal(ws.budgetUsd, null);
  assert.deepEqual(ws.settings.weights, { soil: 30, damage: 40, access: 30 });
  assert.deepEqual(ws.team, []);
  assert.ok(fs.existsSync(path.join(dir, "workspace.json")));
});

test("updateWorkspace runs edits one at a time", async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) => store.updateWorkspace((ws) => {
    ws.doneSteps.push(`step-${i}`);
  })));
  const ws = await store.getWorkspace();
  assert.equal(ws.doneSteps.length, 10);
});

test("runs are listed newest month first, per area", async () => {
  await store.saveRun({ id: "run-a", areaId: "area-1", month: "2026-07", createdAt: "1", cells: [{ id: "c" }], alerts: [] });
  await store.saveRun({ id: "run-b", areaId: "area-1", month: "2026-09", createdAt: "2", cells: [], alerts: [] });
  await store.saveRun({ id: "run-c", areaId: "area-2", month: "2026-08", createdAt: "3", cells: [], alerts: [] });
  const runs = await store.listRuns("area-1");
  assert.deepEqual(runs.map((run) => run.id), ["run-b", "run-a"]);
  assert.equal(runs[0].cells, undefined);
  assert.equal((await store.getRun("run-a")).cells.length, 1);
});

test("chats save, list and delete", async () => {
  await store.saveChat({ id: "chat-1", product: "atlas", title: "Hi", updatedAt: "2026-10-01", messages: [{ id: "m", role: "user", text: "Hello there" }] });
  const list = await store.listChats("atlas");
  assert.equal(list[0].preview, "Hello there");
  assert.equal((await store.listChats("field")).length, 0);
  assert.equal(await store.deleteChat("chat-1"), true);
  assert.equal(await store.getChat("chat-1"), null);
});

// Runs fn with another, empty data folder.
async function withFreshDir(fn) {
  const previous = process.env.CHERNOZEM_DATA_DIR;
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-store-fresh-"));
  process.env.CHERNOZEM_DATA_DIR = fresh;
  try {
    return await fn(fresh);
  } finally {
    process.env.CHERNOZEM_DATA_DIR = previous;
  }
}

test("parallel first loads all get the same workspace (same team ids)", async () => {
  await withFreshDir(async (fresh) => {
    const all = await Promise.all(Array.from({ length: 8 }, () => store.getWorkspace()));
    const ids = new Set(all.map((ws) => ws.team.map((m) => m.id).join(",")));
    assert.equal(ids.size, 1);
    const saved = JSON.parse(fs.readFileSync(path.join(fresh, "workspace.json"), "utf8"));
    assert.equal(saved.team.map((m) => m.id).join(","), [...ids][0]);
    assert.deepEqual(fs.readdirSync(fresh).filter((name) => name.endsWith(".tmp")), []);
  });
});

test("runs written by another server are picked up", async () => {
  await withFreshDir(async (fresh) => {
    await store.saveRun({ id: "run-x", areaId: "area-9", month: "2026-07", provider: "sample", createdAt: "1", cells: [], alerts: [] });
    assert.equal((await store.listRuns("area-9")).length, 1);
    // Another program adds one run and replaces the first.
    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.writeFileSync(path.join(fresh, "runs", "run-y.json"), JSON.stringify({ id: "run-y", areaId: "area-9", month: "2026-08", createdAt: "2", cells: [], alerts: [] }));
    fs.writeFileSync(path.join(fresh, "runs", "run-x.tmp-other"), "");
    fs.renameSync(path.join(fresh, "runs", "run-x.tmp-other"), path.join(fresh, "runs", "run-x.json"));
    fs.writeFileSync(path.join(fresh, "runs", "run-x.json"), JSON.stringify({ id: "run-x", areaId: "area-9", month: "2026-07", provider: "gee", createdAt: "3", cells: [], alerts: [] }));
    const runs = await store.listRuns("area-9");
    assert.deepEqual(runs.map((run) => [run.id, run.provider]), [["run-y", undefined], ["run-x", "gee"]]);
    fs.unlinkSync(path.join(fresh, "runs", "run-y.json"));
    assert.deepEqual((await store.listRuns("area-9")).map((run) => run.id), ["run-x"]);
  });
});

test("locks: one holder at a time, stale locks are taken over", async () => {
  await withFreshDir(async (fresh) => {
    assert.equal(await store.acquireLock("scheduler", 60000), true);
    // Held by this program: acquiring again renews it.
    assert.equal(await store.acquireLock("scheduler", 60000), true);
    // Held by another running program (the parent of this test runner).
    fs.writeFileSync(path.join(fresh, "scheduler.lock"), JSON.stringify({ pid: process.ppid, at: new Date().toISOString() }));
    assert.equal(await store.acquireLock("scheduler", 60000), false);
    // Too old: taken over.
    fs.writeFileSync(path.join(fresh, "scheduler.lock"), JSON.stringify({ pid: process.ppid, at: "2020-01-01T00:00:00Z" }));
    assert.equal(await store.acquireLock("scheduler", 60000), true);
    await store.releaseLock("scheduler");
    assert.equal(fs.existsSync(path.join(fresh, "scheduler.lock")), false);
  });
});

test("changes to an area run one at a time: a new name and a war setting sent together are both kept, and a change never brings back an area just removed", async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const area = { id: "area-queue", name: "Queue test", kind: "custom", bbox: [30, 50, 30.1, 50.1], createdAt: "2026-10-01T00:00:00.000Z" };
  await store.saveArea(area);
  // The rename reads the area, then takes a moment; the war setting comes
  // meanwhile. Each sees the other's change.
  const [renamed, set] = await Promise.all([
    store.updateArea(area.id, async (saved) => {
      await sleep(30);
      saved.name = "Queue renamed";
    }),
    store.updateArea(area.id, (saved) => {
      saved.war = { mode: "peace" };
    }),
  ]);
  assert.equal(renamed.name, "Queue renamed");
  assert.deepEqual(set.war, { mode: "peace" });
  const both = await store.getArea(area.id);
  assert.equal(both.name, "Queue renamed", "the rename is kept");
  assert.deepEqual(both.war, { mode: "peace" }, "the war setting is kept");

  // A change sent while the area is being removed finds no area: it is not
  // saved again.
  const [removed, late] = await Promise.all([
    store.deleteArea(area.id),
    store.updateArea(area.id, async (saved) => {
      await sleep(30);
      saved.name = "Back again";
    }),
  ]);
  assert.equal(removed, 0);
  assert.equal(late, null);
  assert.equal(await store.getArea(area.id), null);
  assert.equal(fs.existsSync(path.join(dir, "areas", `${area.id}.json`)), false);
});
