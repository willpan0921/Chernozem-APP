// WHAT THIS FILE DOES
// The checks the production server (server/index.js) makes before it
// starts on Render, the host of https://chernozem.app (docs/DEPLOY.md).
// Online, a mistake in the settings must stop the new version from going
// live, with the reason in Render's log (the deploy then shows as failed
// and nothing is served), rather than:
//   - open the app to everyone on the internet: no access code, or one
//     that is short or is the example once printed in the docs
//     (server/auth.js accessCodeProblem);
//   - keep the data where the next deploy wipes it: CHERNOZEM_DATA_DIR
//     missing, not a full path, inside the app's own folder, or a folder
//     that does not exist or cannot be written to (the disk not attached).
//     The folder is never made here: on Render only the disk's own folder
//     survives a deploy.
// On one's own computer (no RENDER setting) none of this applies.
//
//   startProblems()                 [] when the server may start, else one
//                                   plain sentence per problem
//   dataFolderProblem(value, root)  the data folder check alone
//
// WHO EDITS IT
// Nobody, normally.

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { ROOT, onRender, refreshEnv } from "./env.js";
import { ACCESS_CODE_MIN_LENGTH, accessCode, accessCodeProblem } from "./auth.js";

const WHERE = "Set it on the service's Environment page in Render (docs/DEPLOY.md, section 4).";

const CODE_PROBLEMS = {
  missing: `ATLAS_ACCESS_CODE is not set, so anyone on the internet could open the app and change everything. ${WHERE}`,
  short: `ATLAS_ACCESS_CODE is shorter than ${ACCESS_CODE_MIN_LENGTH} characters, too easy to guess for a site on the internet. Use four or more random words. ${WHERE}`,
  published: `ATLAS_ACCESS_CODE is the example once printed in the docs, which anyone can still read. Make up your own. ${WHERE}`,
};

const DISK = "the disk's folder (/var/data in render.yaml)";

// True when dir is root itself or inside it.
function isInside(dir, root) {
  const rel = path.relative(root, dir);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function realPath(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

// Why this data folder cannot keep the data online, or null when it can.
// value: CHERNOZEM_DATA_DIR as set; root: the app's own folder.
export function dataFolderProblem(value, { root = ROOT } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return `CHERNOZEM_DATA_DIR is not set, so the data would be kept where the next deploy wipes it. Set it to ${DISK}, with the disk attached.`;
  if (!path.isAbsolute(text)) return `CHERNOZEM_DATA_DIR (${text}) must be a full path: ${DISK}.`;
  const dir = path.resolve(text);
  const insideApp = `CHERNOZEM_DATA_DIR (${dir}) is inside the app's own folder, which every deploy replaces. Set it to ${DISK}.`;
  if (isInside(dir, path.resolve(root))) return insideApp;
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch (error) {
    return `The data folder ${dir} does not exist (${error.code || "error"}): the disk is not attached there. Attach it on the service's Disks page in Render, with that mount path, or set CHERNOZEM_DATA_DIR to ${DISK}.`;
  }
  if (!stat.isDirectory()) return `The data folder ${dir} is a file, not a folder.`;
  // Reached through a link?
  if (isInside(realPath(dir), realPath(root))) return insideApp;
  const probe = path.join(dir, `.write-check-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    fs.writeFileSync(probe, "ok");
  } catch (error) {
    return `The data folder ${dir} cannot be written to (${error.code || "error"}).`;
  } finally {
    try {
      fs.unlinkSync(probe);
    } catch {
      // Never made.
    }
  }
  return null;
}

// Everything that must stop the server from starting online.
export function startProblems() {
  refreshEnv();
  if (!onRender()) return [];
  const problems = [];
  const code = accessCodeProblem(accessCode());
  if (code) problems.push(CODE_PROBLEMS[code]);
  const data = dataFolderProblem(process.env.CHERNOZEM_DATA_DIR);
  if (data) problems.push(data);
  return problems;
}
