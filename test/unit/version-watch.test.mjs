"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  isRunningStale,
  binaryChangedSince,
  detectStaleInstall,
  snapshotBinaryMtime,
} = require("../../src/main/core/version-watch.js");

test("version-watch: rileva versione su disco diversa da quella in esecuzione", () => {
  assert.equal(isRunningStale("0.11.0", "0.11.1"), true);
  assert.equal(isRunningStale("0.11.1", "0.11.1"), false);
});

test("version-watch: rileva binario sostituito via mtime", () => {
  assert.equal(binaryChangedSince(100, "/bin/app", () => ({ mtimeMs: 200 })), true);
  assert.equal(binaryChangedSince(100, "/bin/app", () => ({ mtimeMs: 100 })), false);
});

test("version-watch: detectStaleInstall combina versione e mtime", () => {
  const byVersion = detectStaleInstall({
    runningVersion: "0.11.0",
    resourcesPath: "/opt/app/resources",
    execPath: "/opt/app/pi-desktop",
    baselineMtime: 100,
    readFile: () => JSON.stringify({ version: "0.11.1" }),
    statSync: () => ({ mtimeMs: 100 }),
  });
  assert.equal(byVersion?.reason, "version");
  assert.equal(byVersion?.installedVersion, "0.11.1");

  const byMtime = detectStaleInstall({
    runningVersion: "0.11.1",
    resourcesPath: "/opt/app/resources",
    execPath: "/opt/app/pi-desktop",
    baselineMtime: 100,
    readFile: () => { throw new Error("no asar"); },
    statSync: () => ({ mtimeMs: 250 }),
  });
  assert.equal(byMtime?.reason, "mtime");
});

test("version-watch: snapshotBinaryMtime gestisce errori", () => {
  assert.equal(snapshotBinaryMtime("/missing", () => { throw new Error("ENOENT"); }), null);
});
