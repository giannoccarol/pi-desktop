"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { supportsAutoInstall, UpdateService } = require("../../src/main/updates/update-service.js");

test("update-service: auto install only on win/mac and Linux AppImage", () => {
  assert.equal(supportsAutoInstall("win32", "nsis"), true);
  assert.equal(supportsAutoInstall("darwin", "dmg"), true);
  assert.equal(supportsAutoInstall("linux", "appimage"), true);
  assert.equal(supportsAutoInstall("linux", "pacman"), false);
  assert.equal(supportsAutoInstall("linux", "deb"), false);
  assert.equal(supportsAutoInstall("linux", ""), false);
});

test("update-service: download on pacman opens releases instead of fetching AppImage", async () => {
  let opened = null;
  const service = new UpdateService(null, {
    app: { isPackaged: true, getVersion: () => "1.0.0" },
    autoUpdater: null,
    shell: { openExternal: (url) => { opened = url; return Promise.resolve(); } },
  });
  service.packageType = "pacman";
  service.autoInstall = false;
  service.state.status = "available";
  const res = await service.download();
  assert.equal(res.success, true);
  assert.equal(res.manual, true);
  assert.match(opened, /github\.com/);
});
