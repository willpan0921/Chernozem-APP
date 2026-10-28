// WHAT THIS FILE DOES
// Tests for server/store.js: files are saved in the data folder, ids that
// could reach other files are refused, changes to an area run one at a
// time, and a registered account's folder (withDataRoot) keeps its files
// apart from the base folder's and every other account's. Run with
// "npm test".
//
// WHO EDITS IT
// Whoever changes store.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

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

// ---------- One folder per registered account ----------

test("each registered account has a folder of its own under users/, named by a hash of its id", () => {
  const root = store.userRoot("AbC123xyz");
  assert.equal(path.dirname(root), path.join(dir, "users"));
  assert.match(path.basename(root), /^[0-9a-f]{32}$/);
  assert.ok(store.isSafeId(path.basename(root)), "fits the id rules");
  assert.equal(path.basename(root), createHash("sha256").update("AbC123xyz").digest("hex").slice(0, 32));
  assert.equal(store.userRoot("AbC123xyz"), root, "the same account, the same folder");
  assert.notEqual(store.userRoot("abc123xyz"), root, "capitals count");
  for (const bad of ["", null, 42, "x".repeat(257)]) assert.throws(() => store.userRoot(bad), String(bad));
  assert.equal(store.dataDir(), store.baseDataDir(), "outside withDataRoot the base folder is used");
  assert.equal(store.baseDataDir(), dir);
});

test("withDataRoot: reads and writes inside it go to that folder, also after awaits; the other folders see none of it", async () => {
  await withFreshDir(async (fresh) => {
    const a = store.userRoot("account-a");
    const b = store.userRoot("account-b");
    assert.equal(
      await store.withDataRoot(a, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return store.dataDir();
      }),
      a,
      "the folder follows the awaits",
    );
    assert.equal(await store.withDataRoot(null, () => store.dataDir()), fresh, "null means the base folder");
    assert.equal(store.dataDir(), fresh, "and outside it is the base folder again");

    await store.withDataRoot(a, async () => {
      await store.saveArea({ id: "area-a", name: "A's", kind: "custom", bbox: [30, 50, 30.1, 50.1], createdAt: "2026-10-01T00:00:00.000Z" });
      await store.saveFarm({ id: "farm-a", fields: [] });
      await store.saveChat({ id: "chat-a", product: "field", title: "A", updatedAt: "2026-10-01", messages: [] });
      await store.saveRun({ id: "run-a", areaId: "area-a", month: "2026-07", createdAt: "1", cells: [], alerts: [] });
      // The one-at-a-time queues (updateWorkspace, updateFarm...) keep the folder too.
      await store.updateWorkspace((ws) => {
        ws.name = "A office";
      });
      await store.updateFarm((farm) => ({ ...farm, name: "A farm" }));
      await store.saveProfile({ uid: "account-a", name: "A" });
    });

    // From B: nothing of A's, and a fresh folder needs nothing made first.
    await store.withDataRoot(b, async () => {
      assert.deepEqual(await store.listAreas(), []);
      assert.equal(await store.getArea("area-a"), null);
      assert.equal(await store.getFarm(), null);
      assert.deepEqual(await store.listChats(), []);
      assert.deepEqual(await store.listRuns(), []);
      assert.equal(await store.getProfile(), null);
      const ws = await store.getWorkspace();
      assert.equal(ws.name, "Regional office");
      assert.deepEqual(ws.team, []);
      assert.ok(fs.existsSync(path.join(b, "workspace.json")), "made on first read, in B's folder");
    });

    // The base folder has none of it either (A's writes never touched it).
    assert.deepEqual(await store.listAreas(), []);
    assert.equal(await store.getFarm(), null);
    assert.deepEqual(await store.listRuns(), []);
    assert.equal(await store.getProfile(), null);
    for (const name of ["areas", "farm.json", "runs", "chats", "profile.json", "workspace.json"]) {
      assert.equal(fs.existsSync(path.join(fresh, name)), false, `${name} in the base folder`);
    }

    // A's files are where they should be, and read back from there.
    for (const name of ["areas/area-a.json", "farm.json", "chats/chat-a.json", "runs/run-a.json", "profile.json", "workspace.json"]) {
      assert.ok(fs.existsSync(path.join(a, name)), name);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(a, "workspace.json"), "utf8")).name, "A office");
    assert.equal((await store.withDataRoot(a, () => store.getFarm())).name, "A farm");
    assert.equal((await store.withDataRoot(a, () => store.getProfile())).name, "A");
    // The run list kept in memory is per folder.
    assert.deepEqual((await store.withDataRoot(a, () => store.listRuns("area-a"))).map((run) => run.id), ["run-a"]);
    assert.deepEqual(await store.withDataRoot(b, () => store.listRuns("area-a")), []);
    // The lock files too.
    assert.equal(await store.withDataRoot(a, () => store.acquireLock("scheduler", 60000)), true);
    assert.ok(fs.existsSync(path.join(a, "scheduler.lock")));
    assert.equal(fs.existsSync(path.join(fresh, "scheduler.lock")), false);
    await store.withDataRoot(a, () => store.releaseLock("scheduler"));

    // Every account folder, in order; anything else under users/ is left out.
    fs.mkdirSync(path.join(fresh, "users", "not-an-account"), { recursive: true });
    fs.writeFileSync(path.join(fresh, "users", "0123456789abcdef0123456789abcdef.txt"), "");
    assert.deepEqual(await store.listUserRoots(), [a, b].sort());
  });
  await withFreshDir(async () => assert.deepEqual(await store.listUserRoots(), [], "no users/ folder yet"));
});
