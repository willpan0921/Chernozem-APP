// WHAT THIS FILE DOES
// Starts the real production server (server/index.js, "npm start") on a
// free port with an empty, not yet existing data folder, and checks that it
// starts cleanly (the log names the data folder; the health check and the
// safety headers answer; idle connections are kept 125 seconds, longer
// than Render's proxy keeps them), and that stopping it (SIGTERM, as the
// host does before a new version starts) lets go of the monthly check's
// lock and ends cleanly (and writes the limits' counts, when any changed).
// Then, as on Render (RENDER=true): it refuses to start without the disk,
// saying why, and starts with it, with or without the retired access code
// (ATLAS_ACCESS_CODE): a visitor then always gets the read-only demo,
// never "open". Run with "npm test".
//
// WHO EDITS IT
// Whoever changes server/index.js or server/online.js.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");
const APP_DATA = path.join(path.dirname(INDEX), ".data");

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

// Starts server/index.js with these settings (every one that matters is
// given, so neither this shell nor a .env file can change the outcome).
function startServer(env) {
  const child = spawn(process.execPath, [INDEX], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      GEE_DISABLED: "1",
      ANTHROPIC_API_KEY: "",
      ATLAS_ACCESS_CODE: "",
      ATLAS_TRUST_PROXY: "",
      IMPORT_TOKEN: "",
      RENDER: "",
      // Never a real e-mail from a test.
      GMAIL_APP_PASSWORD: "",
      SMTP_HOST: "",
      RESEND_API_KEY: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const result = { child, log: "" };
  child.stdout.on("data", (chunk) => (result.log += chunk));
  child.stderr.on("data", (chunk) => (result.log += chunk));
  result.exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  return result;
}

const stopForGood = (child) => {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
};

test("npm start: a fresh data folder starts cleanly, and SIGTERM lets go of the lock", { timeout: 30000 }, async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-index-"));
  const dataDir = path.join(scratch, "data", "not-made-yet");
  const port = await freePort();
  const server = startServer({ PORT: String(port), CHERNOZEM_DATA_DIR: dataDir });
  const { child } = server;
  try {
    // Started: the log says where the data is kept and where contact
    // messages go (the last start-up line; output can arrive in pieces).
    for (let i = 0; i < 200 && !/Contact e-mail: /.test(server.log); i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.match(server.log, /is running at http:\/\/127\.0\.0\.1:\d+/);
    assert.ok(server.log.includes(`Data folder: ${dataDir}`), server.log);
    assert.match(server.log, /Contact e-mail: off .*chernozem\.app@gmail\.com/, "where the contact messages go, and that they wait");

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("keep-alive"), "timeout=125", "idle connections kept longer than Render's proxy keeps them");
    const workspace = await fetch(`http://127.0.0.1:${port}/api/workspace`);
    assert.equal(workspace.status, 200, "a fresh data folder works");
    assert.ok(fs.existsSync(path.join(dataDir, "workspace.json")), "made in the data folder");

    // As if this server's monthly check held the lock when the host stops it.
    fs.writeFileSync(path.join(dataDir, "scheduler.lock"), JSON.stringify({ pid: child.pid, at: new Date().toISOString() }));
    child.kill("SIGTERM");
    const { code } = await server.exited;
    assert.equal(code, 0, server.log);
    assert.match(server.log, /Stopping \(SIGTERM\)/);
    assert.equal(fs.existsSync(path.join(dataDir, "scheduler.lock")), false, "the lock is let go");
  } finally {
    stopForGood(child);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("on Render: no start without the disk, and the reason in the log; with it, a start whatever ATLAS_ACCESS_CODE is, every visitor the read-only demo", { timeout: 30000 }, async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chernozem-online-"));
  const disk = path.join(scratch, "disk");
  fs.mkdirSync(disk);
  // This folder's own data must never be touched (the owner's, when the
  // tests run in the real project).
  const appDataBefore = fs.existsSync(APP_DATA);
  const cases = [
    [{ ATLAS_ACCESS_CODE: "", CHERNOZEM_DATA_DIR: "" }, [/CHERNOZEM_DATA_DIR is not set/]],
    [{ CHERNOZEM_DATA_DIR: path.join(scratch, "no-disk") }, [/does not exist .*the disk is not attached/]],
    [{ CHERNOZEM_DATA_DIR: "server/.data" }, [/must be a full path/]],
    [{ CHERNOZEM_DATA_DIR: APP_DATA }, [/inside the app's own folder/]],
  ];
  try {
    for (const [env, reasons] of cases) {
      const label = JSON.stringify(env);
      const server = startServer({ RENDER: "true", PORT: String(await freePort()), ...env });
      try {
        const { code } = await server.exited;
        assert.equal(code, 1, `${label}\n${server.log}`);
        assert.match(server.log, /Not starting online/, label);
        for (const reason of reasons) assert.match(server.log, reason, label);
        assert.doesNotMatch(server.log, /ATLAS_ACCESS_CODE/, `${label}: the retired code is never asked for`);
        assert.doesNotMatch(server.log, /is running at/, label);
      } finally {
        stopForGood(server.child);
      }
    }
    assert.equal(fs.existsSync(path.join(scratch, "no-disk")), false, "the data folder is never made online");
    assert.equal(fs.existsSync(APP_DATA), appDataBefore, "nothing made in the app's own folder");
    assert.deepEqual(fs.readdirSync(disk), [], "the write check leaves nothing behind");

    // The disk, with or without the retired code: it starts, and every
    // visitor is the read-only demo (never open), the owner signing in
    // with Google.
    for (const code of ["", "orchard-lantern-pebble-cobalt"]) {
      const port = await freePort();
      const server = startServer({ RENDER: "true", PORT: String(port), ATLAS_ACCESS_CODE: code, CHERNOZEM_DATA_DIR: disk });
      try {
        for (let i = 0; i < 200 && !/Data folder: /.test(server.log); i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
        assert.match(server.log, /Visitors see the read-only demo; the owner signs in with Google at \/owner/, server.log);
        assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
        const status = await (await fetch(`http://127.0.0.1:${port}/api/auth/status`)).json();
        assert.deepEqual(status, { required: true, signedIn: false, shared: true, account: null, mode: "demo", readOnly: true }, JSON.stringify(code));
        const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code || "anything" }) });
        assert.equal(login.status, 410, "the retired code opens nothing");
        server.child.kill("SIGTERM");
        assert.equal((await server.exited).code, 0, server.log);
      } finally {
        stopForGood(server.child);
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
