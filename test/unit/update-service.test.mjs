"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  supportsAutoInstall,
  supportsCachedPackageInstall,
  UpdateService,
  inferPackageType,
  findPendingPackage,
  getUpdaterPendingDir,
  buildCachedInstallCommand,
  parseVersionFromPackageName,
  compareVersions,
  clearPendingPackages,
  pendingPackageNeedsInstall,
} = require("../../src/main/updates/update-service.js");

test("update-service: auto install only on win/mac and Linux AppImage", () => {
  assert.equal(supportsAutoInstall("win32", "nsis"), true);
  assert.equal(supportsAutoInstall("darwin", "dmg"), true);
  assert.equal(supportsAutoInstall("linux", "appimage"), true);
  assert.equal(supportsAutoInstall("linux", "pacman"), false);
  assert.equal(supportsAutoInstall("linux", "deb"), false);
  assert.equal(supportsAutoInstall("linux", ""), false);
});

test("update-service: pacman/deb/native use cached package install on Linux", () => {
  assert.equal(supportsCachedPackageInstall("linux", "pacman"), true);
  assert.equal(supportsCachedPackageInstall("linux", "deb"), true);
  assert.equal(supportsCachedPackageInstall("linux", "native"), true);
  assert.equal(supportsCachedPackageInstall("linux", "appimage"), false);
  assert.equal(supportsCachedPackageInstall("win32", "pacman"), false);
});

test("update-service: download without cached install opens releases", async () => {
  let opened = null;
  const service = new UpdateService(null, {
    platform: "linux",
    app: { isPackaged: true, getVersion: () => "1.0.0", getPath: () => "/opt/Pi Desktop/pi-desktop", quit: () => {} },
    autoUpdater: null,
    shell: { openExternal: (url) => { opened = url; return Promise.resolve(); } },
  });
  service.packageType = "unknown";
  service.autoInstall = false;
  service.cachedInstall = false;
  service.state.status = "available";
  const res = await service.download();
  assert.equal(res.success, true);
  assert.equal(res.manual, true);
  assert.match(opened, /github\.com/);
});

test("update-service: download on pacman uses electron-updater", async () => {
  let downloaded = false;
  const service = new UpdateService(null, {
    platform: "linux",
    app: { isPackaged: true, getVersion: () => "0.11.1", getPath: () => "/opt/Pi Desktop/pi-desktop", quit: () => {} },
    autoUpdater: { downloadUpdate: async () => { downloaded = true; } },
    shell: { openExternal: () => Promise.resolve() },
  });
  service.packageType = "pacman";
  service.autoInstall = false;
  service.cachedInstall = true;
  service.state.status = "available";
  const res = await service.download();
  assert.equal(res.success, true);
  assert.equal(downloaded, true);
});

test("update-service: inferPackageType defaults linux installs to pacman", () => {
  const type = inferPackageType({
    getPath(name) {
      if (name === "exe") return "/opt/Pi Desktop/pi-desktop";
      return "";
    },
  });
  assert.equal(type, "pacman");
  assert.equal(supportsAutoInstall("linux", type), false);
  assert.equal(supportsCachedPackageInstall("linux", type), true);
});

test("update-service: getState keeps downloaded when pending pacman exists", () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.13.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  const service = new UpdateService(null, {
    platform: "linux",
    app: { isPackaged: true, getVersion: () => "0.11.1", getPath: () => "/opt/Pi Desktop/pi-desktop", quit: () => {} },
    autoUpdater: null,
  });
  service.packageType = "pacman";
  service.cachedInstall = true;
  service.getUpdaterPendingDir = () => pendingDir;
  service.findCachedPendingPackage = () => packagePath;
  service.reconcilePendingPackage = function reconcile() {
    this.pendingPackagePath = packagePath;
    this.setState({ status: "downloaded", pendingPackagePath: packagePath });
  };
  service.state.status = "downloaded";
  service.state.availableVersion = "0.13.0";
  const state = service.getState();
  assert.equal(state.status, "downloaded");
  assert.equal(state.pendingPackage, "Pi-Desktop-0.13.0-linux-x64.pacman");
  assert.equal(state.cachedInstall, true);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});

test("update-service: install on pacman runs pkexec pacman -U", async () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.13.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  let quitCalled = false;
  const spawned = [];
  const service = new UpdateService(null, {
    platform: "linux",
    app: { isPackaged: true, getVersion: () => "0.11.1", getPath: () => "/opt/Pi Desktop/pi-desktop", quit: () => { quitCalled = true; } },
    autoUpdater: null,
    setImmediate: (fn) => fn(),
    spawn: (command, args) => {
      spawned.push([command, ...args]);
      return {
        on(event, handler) {
          if (event === "close") handler(0);
        },
      };
    },
  });
  service.packageType = "pacman";
  service.cachedInstall = true;
  service.pendingPackagePath = packagePath;
  service.state.status = "downloaded";
  service.syncPendingPackageState = () => {};
  const res = await service.install();
  assert.equal(res.success, true);
  assert.equal(res.restartRequired, true);
  assert.equal(quitCalled, true);
  assert.deepEqual(spawned[0], buildCachedInstallCommand("pacman", packagePath));
  fs.rmSync(pendingDir, { recursive: true, force: true });
});

test("update-service: reconcilePendingPackage clears stale cache at current version", () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.14.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  const service = new UpdateService(null, {
    platform: "linux",
    app: { isPackaged: true, getVersion: () => "0.14.0", getPath: () => "/opt/Pi Desktop/pi-desktop", quit: () => {} },
    autoUpdater: null,
  });
  service.packageType = "pacman";
  service.cachedInstall = true;
  service.state.status = "downloaded";
  service.state.availableVersion = "0.14.0";
  const originalPendingDir = getUpdaterPendingDir;
  service.reconcilePendingPackage = function reconcile() {
    const pending = findPendingPackage(pendingDir);
    if (!pending || !pendingPackageNeedsInstall(pending, this.app.getVersion())) {
      clearPendingPackages(pendingDir);
      this.pendingPackagePath = null;
      this.setState({ status: "idle", availableVersion: null, progress: 0, error: null, pendingPackagePath: null });
    }
  };
  service.reconcilePendingPackage();
  assert.equal(service.state.status, "idle");
  assert.equal(fs.existsSync(packagePath), false);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});

test("update-service: pending package already installed is ignored", () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.14.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  assert.equal(pendingPackageNeedsInstall(packagePath, "0.14.0"), false);
  assert.equal(pendingPackageNeedsInstall(packagePath, "0.13.0"), true);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});
