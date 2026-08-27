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
  installLinuxPackage,
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

test("update-service: pacman/deb use cached package install", () => {
  assert.equal(supportsCachedPackageInstall("pacman"), true);
  assert.equal(supportsCachedPackageInstall("deb"), true);
  assert.equal(supportsCachedPackageInstall("appimage"), false);
});

test("update-service: download on pacman without updater opens releases", async () => {
  let opened = null;
  const service = new UpdateService(null, {
    app: { isPackaged: true, getVersion: () => "1.0.0", getPath: () => "/opt/Pi Desktop/pi-desktop" },
    autoUpdater: null,
    shell: { openExternal: (url) => { opened = url; return Promise.resolve(); } },
  });
  service.state.status = "available";
  const res = await service.download();
  assert.equal(res.success, true);
  assert.equal(res.manual, true);
  assert.match(opened, /github\.com/);
});

test("update-service: download on pacman uses electron-updater", async () => {
  let downloaded = false;
  const service = new UpdateService(null, {
    app: { isPackaged: true, getVersion: () => "0.11.1", getPath: () => "/opt/Pi Desktop/pi-desktop", quit: () => {} },
    autoUpdater: { downloadUpdate: async () => { downloaded = true; } },
    shell: { openExternal: () => Promise.resolve() },
  });
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
});

test("update-service: getState keeps downloaded when pending pacman exists", () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.13.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  const service = new UpdateService(null, {
    app: { isPackaged: true, getVersion: () => "0.11.1", getPath: () => "/opt/Pi Desktop/pi-desktop" },
    autoUpdater: null,
  });
  service.getPendingPackagePath = () => packagePath;
  service.state.status = "downloaded";
  service.state.availableVersion = "0.13.0";
  const state = service.getState();
  assert.equal(state.status, "downloaded");
  assert.equal(state.pendingPackage, "Pi-Desktop-0.13.0-linux-x64.pacman");
  assert.equal(state.autoInstall, false);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});

test("update-service: getState maps stale downloaded to available without pending file", () => {
  const service = new UpdateService(null, {
    app: { isPackaged: true, getVersion: () => "0.11.1", getPath: () => "/opt/Pi Desktop/pi-desktop" },
    autoUpdater: null,
  });
  service.getPendingPackagePath = () => null;
  service.state.status = "downloaded";
  service.state.availableVersion = "0.13.0";
  const state = service.getState();
  assert.equal(state.status, "available");
  assert.equal(state.autoInstall, false);
});

test("update-service: install on pacman runs pkexec pacman -U", async () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.13.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  let quitCalled = false;
  const service = new UpdateService(null, {
    app: { isPackaged: true, getVersion: () => "0.11.1", getPath: () => "/opt/Pi Desktop/pi-desktop", quit: () => { quitCalled = true; } },
    autoUpdater: null,
    setImmediate: (fn) => fn(),
    spawn: (_cmd, args) => ({
      on(event, handler) {
        if (event === "close") handler(0);
      },
    }),
  });
  service.getPendingPackagePath = () => packagePath;
  service.state.status = "downloaded";
  const res = await service.install();
  assert.equal(res.success, true);
  assert.equal(res.installed, true);
  assert.equal(quitCalled, true);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});

test("update-service: findPendingPackage picks newest pacman", () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  fs.writeFileSync(path.join(pendingDir, "old.pacman"), "a");
  const newest = path.join(pendingDir, "new.pacman");
  fs.writeFileSync(newest, "b");
  const now = Date.now();
  fs.utimesSync(path.join(pendingDir, "old.pacman"), now / 1000, (now - 5000) / 1000);
  fs.utimesSync(newest, now / 1000, now / 1000);
  assert.equal(findPendingPackage("pacman", pendingDir), newest);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});

test("update-service: installLinuxPackage reports spawn errors", async () => {
  const res = await installLinuxPackage("/tmp/fake.pacman", "pacman", () => ({
    on(event, handler) {
      if (event === "error") handler(new Error("pkexec missing"));
    },
  }));
  assert.equal(res.success, false);
  assert.match(res.error, /pkexec missing/);
});

test("update-service: pending package already installed is ignored", () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.14.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  assert.equal(parseVersionFromPackageName(path.basename(packagePath)), "0.14.0");
  assert.equal(pendingPackageNeedsInstall(packagePath, "0.14.0"), false);
  assert.equal(pendingPackageNeedsInstall(packagePath, "0.13.0"), true);
  assert.equal(compareVersions("0.14.0", "0.13.0"), 1);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});

test("update-service: reconcilePendingPackage clears stale cache at current version", () => {
  const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-upd-"));
  const packagePath = path.join(pendingDir, "Pi-Desktop-0.14.0-linux-x64.pacman");
  fs.writeFileSync(packagePath, "fake");
  const service = new UpdateService(null, {
    app: { isPackaged: true, getVersion: () => "0.14.0", getPath: () => "/opt/Pi Desktop/pi-desktop" },
    autoUpdater: null,
  });
  service.packageType = "pacman";
  service.state.status = "downloaded";
  service.state.availableVersion = "0.14.0";
  const originalDir = getUpdaterPendingDir;
  const pendingDirFn = () => pendingDir;
  service.getPendingPackagePath = function getPending() {
    const pending = findPendingPackage("pacman", pendingDir);
    if (!pending || !pendingPackageNeedsInstall(pending, this.app.getVersion())) return null;
    return pending;
  };
  service.reconcilePendingPackage = function reconcile() {
    if (!supportsCachedPackageInstall(this.packageType)) return;
    const pending = findPendingPackage(this.packageType, pendingDir);
    if (!pending) return;
    if (!pendingPackageNeedsInstall(pending, this.app.getVersion())) {
      clearPendingPackages(this.packageType, pendingDir);
      if (["available", "downloaded", "downloading"].includes(this.state.status)) {
        this.setState({ status: "idle", availableVersion: null, progress: 0, error: null });
      }
    }
  };
  service.reconcilePendingPackage();
  assert.equal(service.state.status, "idle");
  assert.equal(fs.existsSync(packagePath), false);
  fs.rmSync(pendingDir, { recursive: true, force: true });
});
